import { FormEvent, useEffect, useState } from "react";
import {
  AnalyticsAggregateCell,
  AnalyticsAggregateResult,
  AnalyticsKpiDefinitionView,
  HrmsApiError,
  HrmsClient,
  MartRefreshLogView,
} from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-10E G14 analytics dashboard bound to the PH-10D KPI engine:
 * - KPI tiles fetch live values through the injected client (GET /api/v1/analytics/kpis and
 *   GET /api/v1/analytics/aggregate) — nothing is hardcoded and no marker strings are rendered;
 * - drill-down re-queries the aggregate endpoint per dimension, so FR-17 k-anonymity suppression
 *   applies at every level: a suppressed cell renders the suppression notice, never the raw count;
 * - the freshness panel lists per-mart refresh state from datamart_refresh_logs (E10) and flags
 *   marts whose last run failed or breached the freshness SLA.
 */

/** Freshness SLA the seeded marts declare (analytics_datamarts.freshness_sla_minutes = 60). */
export const MART_FRESHNESS_SLA_MINUTES = 60;

/**
 * Drill dimensions offered per mart — the cohort-grain dimensions the engine's scope policy
 * exposes for aggregation. Identifying grains (employeeId, attendanceDate) are deliberately
 * NOT offered: drill-down stays at cohort grain and suppression applies at every level. The
 * server re-checks scope on every aggregate read regardless of what the client asks for.
 */
export const MART_DRILL_DIMENSIONS: Record<string, readonly string[]> = {
  MART_LEAVE: ["leaveTypeId", "status"],
  MART_ATTENDANCE: ["status"],
  MART_ESTABLISHMENT: ["cadreId", "orgUnitId", "status"],
};

/** One dashboard tile: a governed ACTIVE KPI definition plus its live engine aggregate. */
export interface KpiTileData {
  kpi: AnalyticsKpiDefinitionView;
  aggregate: AnalyticsAggregateResult;
}

/** Per-mart freshness derived from the latest datamart_refresh_logs row. */
export interface MartFreshnessRow {
  martCode: string;
  lastRefreshAt?: string;
  rowsWritten?: number;
  status: MartRefreshLogView["status"];
  stale: boolean;
  errorDetail?: string;
}

export type AnalyticsDashboardViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "no-permission"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; tiles: KpiTileData[]; freshness: MartFreshnessRow[] };

export type DrillViewState =
  | { kind: "idle" }
  | { kind: "loading"; martCode: string; dimension: string }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; aggregate: AnalyticsAggregateResult };

/** A mart is stale when its last run did not SUCCEED or its finish time breached the SLA. */
export function isMartStale(log: MartRefreshLogView, nowMs: number): boolean {
  if (log.status !== "SUCCESS" || !log.finishedAt) {
    return true;
  }
  return nowMs - Date.parse(log.finishedAt) > MART_FRESHNESS_SLA_MINUTES * 60000;
}

/** Reduce append-only refresh logs to the latest row per mart, ordered by mart code. */
export function latestLogPerMart(logs: MartRefreshLogView[]): MartRefreshLogView[] {
  const latest = new Map<string, MartRefreshLogView>();
  for (const log of logs) {
    const current = latest.get(log.martCode);
    const logTime = log.finishedAt ?? log.startedAt;
    const currentTime = current ? (current.finishedAt ?? current.startedAt) : "";
    if (!current || logTime >= currentTime) {
      latest.set(log.martCode, log);
    }
  }
  return [...latest.values()].sort((left, right) => left.martCode.localeCompare(right.martCode));
}

function defaultDimensionFor(martCode: string): string {
  return MART_DRILL_DIMENSIONS[martCode]?.[0] ?? "status";
}

/**
 * Loads the live dashboard: ACTIVE KPI definitions, one engine aggregate per KPI (through
 * the suppression boundary), and the datamart_refresh_logs freshness rows.
 */
export async function loadAnalyticsDashboard(client: HrmsClient, nowMs: number = Date.now()): Promise<AnalyticsDashboardViewState> {
  try {
    const kpis = await client.listAnalyticsKpis();
    const activeKpis = kpis.items.filter((kpi) => kpi.status === "ACTIVE");
    const tiles: KpiTileData[] = [];
    for (const kpi of activeKpis) {
      tiles.push({ kpi, aggregate: await client.queryKpiAggregate(kpi.sourceMartCode, defaultDimensionFor(kpi.sourceMartCode)) });
    }
    const logs = await client.listMartRefreshLogs();
    const freshness: MartFreshnessRow[] = latestLogPerMart(logs.items).map((log) => ({
      martCode: log.martCode,
      lastRefreshAt: log.finishedAt,
      rowsWritten: log.rowsWritten,
      status: log.status,
      stale: isMartStale(log, nowMs),
      errorDetail: log.errorDetail,
    }));
    if (tiles.length === 0 && freshness.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "ready", tiles, freshness };
  } catch (error) {
    if (error instanceof HrmsApiError) {
      if (error.code === "NOT_FOUND") {
        return { kind: "empty" };
      }
      if (error.code === "FORBIDDEN") {
        return { kind: "no-permission", errorCode: error.code };
      }
      return { kind: "error", errorCode: error.code };
    }
    return { kind: "error", errorCode: "UNKNOWN_ERROR" };
  }
}

/** Suppression notice shared by tiles and drill cells — the only rendering for a suppressed value. */
function SuppressionNotice({ minCellSizeK, reason }: { minCellSizeK: number; reason?: AnalyticsAggregateCell["suppressionReason"] }) {
  return (
    <span className="suppression-notice" data-suppressed="true">
      Suppressed — cohort below k={minCellSizeK}
      {reason === "ERR-G14-COMP-SUPPRESS" ? " (complementary suppression)" : ""}
    </span>
  );
}

export interface AnalyticsWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved dashboard state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: AnalyticsDashboardViewState;
  /** Pre-resolved drill-down state for tests/server rendering. */
  initialDrill?: DrillViewState;
}

export function AnalyticsWorkspace({ client, initialState, initialDrill }: AnalyticsWorkspaceProps) {
  const [state, setState] = useState<AnalyticsDashboardViewState>(initialState ?? { kind: "loading" });
  const [drill, setDrill] = useState<DrillViewState>(initialDrill ?? { kind: "idle" });
  const [drillMart, setDrillMart] = useState("MART_LEAVE");
  const [drillDimension, setDrillDimension] = useState(defaultDimensionFor("MART_LEAVE"));

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAnalyticsDashboard(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Analytics" detail="Fetching live KPI values and datamart freshness from the G14 engine." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Analytics"
        detail={`The G14 KPI engine read failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "no-permission") {
    return (
      <OperationalState
        kind="no-permission"
        title="No permission"
        detail="The analytics dashboard is hidden because the session does not carry g14.analytics.read."
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No analytics data" detail="No ACTIVE KPI definitions or datamart refresh logs are in scope." />;
  }

  function handleMartChange(nextMart: string): void {
    setDrillMart(nextMart);
    setDrillDimension(defaultDimensionFor(nextMart));
  }

  function handleDrillSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setDrill({ kind: "loading", martCode: drillMart, dimension: drillDimension });
    void client
      .queryKpiAggregate(drillMart, drillDimension)
      .then((aggregate) => setDrill({ kind: "ready", aggregate }))
      .catch((error: unknown) =>
        setDrill({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" })
      );
  }

  return (
    <article className="workspace-card analytics-dashboard" aria-label="G14 analytics dashboard">
      <header>
        <span className="module-code">G14</span>
        <h2>Analytics Dashboard</h2>
      </header>

      <section aria-label="Live KPI tiles">
        <h3>KPIs (live from the analytics engine)</h3>
        <dl className="metric-grid">
          {state.tiles.map((tile) => (
            <div key={tile.kpi.kpiCode} data-kpi-code={tile.kpi.kpiCode}>
              <dt>
                {tile.kpi.name} <small>(v{tile.kpi.version}, {tile.kpi.sourceMartCode})</small>
              </dt>
              <dd>
                {tile.aggregate.total === null ? (
                  <SuppressionNotice minCellSizeK={tile.aggregate.minCellSizeK} />
                ) : (
                  <>
                    {tile.aggregate.total} {tile.kpi.unit}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="KPI drill-down">
        <h3>Drill-down</h3>
        <form aria-label="Drill-down query" onSubmit={handleDrillSubmit}>
          <label htmlFor="g14-drill-mart">Datamart</label>
          <select id="g14-drill-mart" name="martCode" onChange={(event) => handleMartChange(event.target.value)} value={drillMart}>
            {Object.keys(MART_DRILL_DIMENSIONS).map((martCode) => (
              <option key={martCode} value={martCode}>
                {martCode}
              </option>
            ))}
          </select>
          <label htmlFor="g14-drill-dimension">Dimension (cohort grain only)</label>
          <select id="g14-drill-dimension" name="dimension" onChange={(event) => setDrillDimension(event.target.value)} value={drillDimension}>
            {(MART_DRILL_DIMENSIONS[drillMart] ?? []).map((dimension) => (
              <option key={dimension} value={dimension}>
                {dimension}
              </option>
            ))}
          </select>
          <button disabled={drill.kind === "loading"} type="submit">
            {drill.kind === "loading" ? "Drilling down…" : "Drill down"}
          </button>
        </form>
        {drill.kind === "loading" ? (
          <p data-state="loading">Querying {drill.martCode} by {drill.dimension}…</p>
        ) : null}
        {drill.kind === "error" ? (
          <p role="alert">Drill-down failed with error code {drill.errorCode}.</p>
        ) : null}
        {drill.kind === "ready" ? (
          drill.aggregate.cells.length === 0 ? (
            <p data-state="empty">No cohorts for {drill.aggregate.martCode} by {drill.aggregate.dimension}.</p>
          ) : (
            <table aria-label={`Drill-down of ${drill.aggregate.martCode} by ${drill.aggregate.dimension}`}>
              <caption>
                {drill.aggregate.martCode} by {drill.aggregate.dimension} — k-anonymity min cell size {drill.aggregate.minCellSizeK}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Cohort</th>
                  <th scope="col">Members</th>
                </tr>
              </thead>
              <tbody>
                {drill.aggregate.cells.map((cell) => (
                  <tr key={cell.key}>
                    <td>{cell.key}</td>
                    <td>
                      {cell.suppressed ? (
                        <SuppressionNotice minCellSizeK={drill.aggregate.minCellSizeK} reason={cell.suppressionReason} />
                      ) : (
                        cell.value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>
                    {drill.aggregate.total === null ? (
                      <span data-suppressed="true">Withheld — {drill.aggregate.suppressedCells} suppressed cohort(s)</span>
                    ) : (
                      drill.aggregate.total
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )
        ) : null}
      </section>

      <section aria-label="Datamart freshness">
        <h3>Freshness (datamart_refresh_logs)</h3>
        <table aria-label="Per-mart refresh state">
          <thead>
            <tr>
              <th scope="col">Mart</th>
              <th scope="col">Last refresh</th>
              <th scope="col">Rows</th>
              <th scope="col">Run status</th>
              <th scope="col">Freshness</th>
            </tr>
          </thead>
          <tbody>
            {state.freshness.map((mart) => (
              <tr key={mart.martCode}>
                <td>{mart.martCode}</td>
                <td>{mart.lastRefreshAt ?? "never"}</td>
                <td>{mart.rowsWritten ?? "—"}</td>
                <td>{mart.status}{mart.errorDetail ? ` — ${mart.errorDetail}` : ""}</td>
                <td>{mart.stale ? <strong data-stale="true">STALE</strong> : <span data-stale="false">Fresh</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
