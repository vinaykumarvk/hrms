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
import { KpiCard } from "./KpiCard";
import { SimpleBarChart, BarChartDatum, SummaryStat, StatGrid } from "./Charts";
import { Database, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

/* ── Constants ─────────────────────────────────────────────── */

const MART_FRESHNESS_SLA_MINUTES = 60;

const MART_DRILL_DIMENSIONS: Record<string, readonly string[]> = {
  MART_LEAVE: ["leaveTypeId", "status"],
  MART_ATTENDANCE: ["status"],
  MART_ESTABLISHMENT: ["cadreId", "orgUnitId", "status"],
};

const MART_LABELS: Record<string, string> = {
  MART_LEAVE: "Leave Analytics",
  MART_ATTENDANCE: "Attendance Records",
  MART_ESTABLISHMENT: "Establishment Census",
};

/* ── Types ─────────────────────────────────────────────────── */

export interface KpiTileData {
  kpi: AnalyticsKpiDefinitionView;
  aggregate: AnalyticsAggregateResult;
}

export interface MartFreshnessRow {
  martCode: string;
  lastRefreshAt?: string;
  rowsWritten?: number;
  status: MartRefreshLogView["status"];
  stale: boolean;
  errorDetail?: string;
}

type DashboardState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "no-permission"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; tiles: KpiTileData[]; freshness: MartFreshnessRow[] };

type DrillState =
  | { kind: "idle" }
  | { kind: "loading"; martCode: string; dimension: string }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; aggregate: AnalyticsAggregateResult };

/* ── Helpers ───────────────────────────────────────────────── */

function isMartStale(log: MartRefreshLogView, nowMs: number): boolean {
  if (log.status !== "SUCCESS" || !log.finishedAt) return true;
  return nowMs - Date.parse(log.finishedAt) > MART_FRESHNESS_SLA_MINUTES * 60000;
}

function latestLogPerMart(logs: MartRefreshLogView[]): MartRefreshLogView[] {
  const latest = new Map<string, MartRefreshLogView>();
  for (const log of logs) {
    const current = latest.get(log.martCode);
    const logTime = log.finishedAt ?? log.startedAt;
    const currentTime = current ? (current.finishedAt ?? current.startedAt) : "";
    if (!current || logTime >= currentTime) latest.set(log.martCode, log);
  }
  return [...latest.values()].sort((a, b) => a.martCode.localeCompare(b.martCode));
}

function defaultDimensionFor(martCode: string): string {
  return MART_DRILL_DIMENSIONS[martCode]?.[0] ?? "status";
}

function timeAgo(isoString?: string): string {
  if (!isoString) return "Never";
  const diff = Date.now() - Date.parse(isoString);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Loader ────────────────────────────────────────────────── */

async function loadDashboard(client: HrmsClient, nowMs = Date.now()): Promise<DashboardState> {
  try {
    const kpis = await client.listAnalyticsKpis();
    const activeKpis = kpis.items.filter((k) => k.status === "ACTIVE");
    const tiles: KpiTileData[] = [];
    for (const kpi of activeKpis) {
      tiles.push({
        kpi,
        aggregate: await client.queryKpiAggregate(kpi.sourceMartCode, defaultDimensionFor(kpi.sourceMartCode)),
      });
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
    if (tiles.length === 0 && freshness.length === 0) return { kind: "empty" };
    return { kind: "ready", tiles, freshness };
  } catch (error) {
    if (error instanceof HrmsApiError) {
      if (error.code === "NOT_FOUND") return { kind: "empty" };
      if (error.code === "FORBIDDEN") return { kind: "no-permission", errorCode: error.code };
      return { kind: "error", errorCode: error.code };
    }
    return { kind: "error", errorCode: "UNKNOWN_ERROR" };
  }
}

/* ── Sub-components ────────────────────────────────────────── */

/** KPI Cards Grid — the main dashboard visualization. */
function KpiGrid({ tiles }: { tiles: KpiTileData[] }) {
  return (
    <section aria-label="Key Performance Indicators">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Key Metrics</h3>
        <span className="text-xs text-gray-400">{tiles.length} KPIs active</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <KpiCard
            key={tile.kpi.kpiCode}
            title={tile.kpi.name}
            value={tile.aggregate.total}
            unit={tile.kpi.unit}
            suppressed={tile.aggregate.total === null}
            suppressionReason={
              tile.aggregate.suppressedCells > 0
                ? `${tile.aggregate.suppressedCells} cells suppressed (k=${tile.aggregate.minCellSizeK})`
                : undefined
            }
            description={tile.kpi.description}
            sourceMart={tile.kpi.sourceMartCode}
            version={tile.kpi.version}
          />
        ))}
      </div>
    </section>
  );
}

/** Drill-down panel with bar chart + data table. */
function DrillPanel({
  drill,
  drillMart,
  drillDimension,
  onMartChange,
  onDimensionChange,
  onSubmit,
}: {
  drill: DrillState;
  drillMart: string;
  drillDimension: string;
  onMartChange: (mart: string) => void;
  onDimensionChange: (dim: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const barData: BarChartDatum[] =
    drill.kind === "ready"
      ? drill.aggregate.cells.map((cell) => ({
          key: cell.key,
          value: cell.value,
          suppressed: cell.suppressed,
          suppressionReason: cell.suppressionReason,
        }))
      : [];

  return (
    <section aria-label="Drill-down analysis" className="rounded-xl border bg-white p-5">
      <h3 className="mb-4 text-lg font-semibold text-gray-800">Drill-down Analysis</h3>

      <form
        aria-label="Drill-down query"
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-3 mb-4"
      >
        <label className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[11px] font-semibold uppercase text-gray-500">Datamart</span>
          <select
            className="h-9 rounded-md border bg-white px-2.5 text-xs"
            value={drillMart}
            onChange={(e) => onMartChange(e.target.value)}
          >
            {Object.keys(MART_DRILL_DIMENSIONS).map((mc) => (
              <option key={mc} value={mc}>{MART_LABELS[mc] ?? mc}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[11px] font-semibold uppercase text-gray-500">Dimension</span>
          <select
            className="h-9 rounded-md border bg-white px-2.5 text-xs"
            value={drillDimension}
            onChange={(e) => onDimensionChange(e.target.value)}
          >
            {(MART_DRILL_DIMENSIONS[drillMart] ?? []).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={drill.kind === "loading"}
          className="h-9 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {drill.kind === "loading" ? "Querying…" : "Run Query"}
        </button>
      </form>

      {drill.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500 justify-center">
          <div className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          Querying {drill.martCode} by {drill.dimension}…
        </div>
      )}

      {drill.kind === "error" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Drill-down failed — {drill.errorCode}
        </p>
      )}

      {drill.kind === "ready" && drill.aggregate.cells.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">
          No cohorts for {drill.aggregate.martCode} by {drill.aggregate.dimension}.
        </p>
      )}

      {drill.kind === "ready" && drill.aggregate.cells.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Distribution
            </h4>
            <SimpleBarChart data={barData} maxBars={15} />

            {drill.aggregate.total === null ? (
              <p className="mt-3 text-xs text-amber-600">
                Total withheld — {drill.aggregate.suppressedCells} cell(s) suppressed (k={drill.aggregate.minCellSizeK})
              </p>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                Total: <strong>{drill.aggregate.total.toLocaleString()}</strong>
              </p>
            )}
          </div>

          {/* Data table */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Detail
            </h4>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Cohort</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {drill.aggregate.cells.map((cell) => (
                    <tr key={cell.key} className="hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 text-gray-700">{cell.key}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {cell.suppressed ? (
                          <span className="text-amber-600" title={cell.suppressionReason}>k-anon</span>
                        ) : (
                          <span className="font-medium text-gray-900">{cell.value?.toLocaleString()}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50/50">
                  <tr>
                    <td className="px-3 py-2 font-semibold text-gray-600">Total</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                      {drill.aggregate.total === null ? "Withheld" : drill.aggregate.total.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Datamart freshness panel with status indicators. */
function FreshnessPanel({ freshness }: { freshness: MartFreshnessRow[] }) {
  const staleCount = freshness.filter((m) => m.stale).length;
  const freshCount = freshness.length - staleCount;

  return (
    <section aria-label="Datamart freshness" className="rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Datamart Health</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> {freshCount} fresh
          </span>
          {staleCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> {staleCount} stale
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {freshness.map((mart) => (
          <div
            key={mart.martCode}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Database
                className={cn("size-5", mart.stale ? "text-amber-500" : "text-green-500")}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {MART_LABELS[mart.martCode] ?? mart.martCode}
                </p>
                <p className="text-xs text-gray-500">
                  {mart.martCode}
                  {mart.rowsWritten !== undefined && ` · ${mart.rowsWritten.toLocaleString()} rows written`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-xs text-gray-500">Last refresh</p>
                <p className="flex items-center gap-1 text-xs font-medium text-gray-700">
                  <Clock className="size-3" aria-hidden="true" />
                  {timeAgo(mart.lastRefreshAt)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  mart.stale
                    ? "bg-amber-50 text-amber-700"
                    : "bg-green-50 text-green-700"
                )}
              >
                {mart.stale ? "STALE" : "FRESH"}
              </span>
              {mart.errorDetail && (
                <span className="text-[10px] text-red-600 max-w-[120px] truncate" title={mart.errorDetail}>
                  {mart.errorDetail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── AnalyticsWorkspace ─────────────────────────────────*****─── */

export interface AnalyticsWorkspaceProps {
  client: HrmsClient;
  initialState?: DashboardState;
  initialDrill?: DrillState;
}

export function AnalyticsWorkspace({ client, initialState, initialDrill }: AnalyticsWorkspaceProps) {
  const [state, setState] = useState<DashboardState>(initialState ?? { kind: "loading" });
  const [drill, setDrill] = useState<DrillState>(initialDrill ?? { kind: "idle" });
  const [drillMart, setDrillMart] = useState("MART_LEAVE");
  const [drillDimension, setDrillDimension] = useState(defaultDimensionFor("MART_LEAVE"));

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDashboard(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  /* ── Loading / Error states ──────────────────────────────── */

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Analytics" detail="Fetching live KPI values and datamart freshness from the G14 engine." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Analytics" detail={`The G14 KPI engine read failed — ${state.errorCode}.`} />;
  }
  if (state.kind === "no-permission") {
    return <OperationalState kind="no-permission" title="No permission" detail="Analytics dashboard requires g14.analytics.read permission." />;
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No analytics data" detail="No ACTIVE KPI definitions or datamart refresh logs in scope." />;
  }

  /* ── Handlers ────────────────────────────────────────────── */

  function handleMartChange(nextMart: string) {
    setDrillMart(nextMart);
    setDrillDimension(defaultDimensionFor(nextMart));
  }

  function handleDrillSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDrill({ kind: "loading", martCode: drillMart, dimension: drillDimension });
    void client
      .queryKpiAggregate(drillMart, drillDimension)
      .then((aggregate) => setDrill({ kind: "ready", aggregate }))
      .catch((error: unknown) =>
        setDrill({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" })
      );
  }

  return (
    <div className="space-y-6" aria-label="G14 analytics dashboard">
      <KpiGrid tiles={state.tiles} />
      <DrillPanel
        drill={drill}
        drillMart={drillMart}
        drillDimension={drillDimension}
        onMartChange={handleMartChange}
        onDimensionChange={setDrillDimension}
        onSubmit={handleDrillSubmit}
      />
      <FreshnessPanel freshness={state.freshness} />
    </div>
  );
}

/* ── cn helper ─────────────────────────────────────────*****── */

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
