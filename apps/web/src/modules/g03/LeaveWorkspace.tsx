import { LeaveSliceSummary } from "../../api/hrmsClient";

export interface LeaveWorkspaceProps {
  slice: LeaveSliceSummary;
}

export function LeaveWorkspace({ slice }: LeaveWorkspaceProps) {
  return (
    <article
      className="record-panel vertical-slice-panel"
      aria-label="G03 leave vertical slice"
      data-workflow-resolver="REPORTING_CHAIN"
      data-source-module="G04"
      data-sr-event="LEAVE_APPROVED"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Leave</p>
          <h2>Leave Approval Proof</h2>
        </div>
        <strong>{slice.status}</strong>
      </div>
      <dl className="record-facts">
        <div>
          <dt>Application</dt>
          <dd>{slice.applicationNo}</dd>
        </div>
        <div>
          <dt>Resolver</dt>
          <dd>{slice.resolver}</dd>
        </div>
        <div>
          <dt>P01 action</dt>
          <dd>{slice.action}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>{slice.balanceAvailable} EL days available after debit</dd>
        </div>
      </dl>
      <ul className="slice-evidence" aria-label="G03 leave evidence">
        <li>G04 outbox {slice.g04OutboxStatus}</li>
        <li>G12 event {slice.srEventType}</li>
        <li>
          {slice.payrollSignalsReady ?? 0} {slice.payrollSignalStatus ?? "READY_FOR_G10"} payroll signals
        </li>
        <li>P05 audit + X.2 notifications captured</li>
      </ul>
    </article>
  );
}
