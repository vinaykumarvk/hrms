import { AnalyticsSliceSummary } from "../../api/hrmsClient";

interface AnalyticsWorkspaceProps {
  slice: AnalyticsSliceSummary;
}

export function AnalyticsWorkspace({ slice }: AnalyticsWorkspaceProps) {
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
