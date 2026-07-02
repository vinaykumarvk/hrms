import { PensionSliceSummary } from "../../api/hrmsClient";

interface PensionWorkspaceProps {
  slice: PensionSliceSummary;
}

export function PensionWorkspace({ slice }: PensionWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G11 pension compensation workspace">
      <header>
        <span className="module-code">G11</span>
        <h2>Retirement and Pension</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Cases</dt>
          <dd>{slice.cases}</dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>{slice.serviceVerified}</dd>
        </div>
        <div>
          <dt>PPOs</dt>
          <dd>{slice.pposIssued}</dd>
        </div>
        <div>
          <dt>SR Events</dt>
          <dd>{slice.srPosted}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        SR_VERIFICATION_GATE / {slice.serviceGateMarker} / QUALIFYING_SERVICE_LOCKED / {slice.qualifyingServiceMarker} / PENSION_CALC_TRACE / {slice.calculationMarker} / PPO_ISSUED / {slice.ppoMarker} / G11_SR_POSTED / {slice.srMarker}
      </p>
    </article>
  );
}
