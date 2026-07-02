import { PayrollSliceSummary } from "../../api/hrmsClient";

interface PayrollWorkspaceProps {
  slice: PayrollSliceSummary;
}

export function PayrollWorkspace({ slice }: PayrollWorkspaceProps) {
  return (
    <article className="workspace-card" aria-label="G10 payroll compensation workspace">
      <header>
        <span className="module-code">G10</span>
        <h2>Payroll and Benefits</h2>
      </header>
      <dl className="metric-grid">
        <div>
          <dt>Structures</dt>
          <dd>{slice.salaryStructures}</dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{slice.runs}</dd>
        </div>
        <div>
          <dt>Disbursed</dt>
          <dd>{slice.disbursedRuns}</dd>
        </div>
        <div>
          <dt>LPD Feeds</dt>
          <dd>{slice.lastPayDrawnFeeds}</dd>
        </div>
      </dl>
      <p className="evidence-line">
        PAYROLL_TRACE / {slice.calculationMarker} / RULE_VERSION_SNAPSHOT / {slice.ruleSnapshotMarker} / INPUT_LOCKED / {slice.inputLockMarker} / BANK_X3_EXPORT / {slice.x3Marker} / LAST_PAY_DRAWN / {slice.lastPayMarker}
      </p>
    </article>
  );
}
