import { useEffect, useState } from "react";
import { AnalyticsSliceSummary, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type AnalyticsViewState = SliceViewState<AnalyticsSliceSummary>;

/** Loads the G14 summary from GET /api/v1/analytics/summary via the injected client (client.getAnalyticsSlice()). */
export function loadAnalyticsView(client: HrmsClient): Promise<AnalyticsViewState> {
  return loadSliceView(
    () => client.getAnalyticsSlice(),
    (slice) => slice.dashboards === 0 && slice.cards === 0
  );
}

export interface AnalyticsWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: AnalyticsViewState;
}

export function AnalyticsWorkspace({ client, initialState }: AnalyticsWorkspaceProps) {
  const [state, setState] = useState<AnalyticsViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAnalyticsView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Analytics" detail="Fetching the G14 analytics and release readiness summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Analytics"
        detail={`The G14 summary fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No analytics dashboards" detail="No G14 dashboards or cards are in scope." />;
  }

  const slice = state.slice;
  return (
    <article className="workspace-card" aria-label="G14 analytics and release readiness workspace">
      <header>
        <span className="module-code">G14</span>
        <h2>Analytics and Release Readiness</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Dashboards</dt>
          <dd>{slice.dashboards}</dd>
        </div>
        <div>
          <dt>Cards</dt>
          <dd>{slice.cards}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{slice.sourceModules}</dd>
        </div>
        <div>
          <dt>Refreshes</dt>
          <dd>{slice.martRefreshes}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        G14_READ_ONLY / {slice.readOnlyMarker} / MART_REFRESH_IDEMPOTENT / {slice.martMarker} / P02_SCOPE_FILTER / {slice.scopeMarker} / DRILL_THROUGH_AUTHZ / {slice.drillMarker} / ANALYTICS_READ_AUDITED / {slice.auditMarker} / PII_SUPPRESSION / {slice.piiMarker} / MIGRATION_DRY_RUN / {slice.migrationMarker} / UAT_ACCEPTANCE_PACK / {slice.uatMarker}
      </p>
    </article>
  );
}
