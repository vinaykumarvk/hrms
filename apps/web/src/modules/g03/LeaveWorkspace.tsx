import { useEffect, useState } from "react";
import { HrmsClient, LeaveSliceSummary } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { loadSliceView, SliceViewState } from "../sliceViewState";

export type LeaveViewState = SliceViewState<LeaveSliceSummary>;

/** Loads the G03 leave slice from GET /api/v1/atl/* (applications, outbox, payroll signals) via the injected client. */
export function loadLeaveView(client: HrmsClient): Promise<LeaveViewState> {
  return loadSliceView(() => client.getLeaveSlice());
}

export interface LeaveWorkspaceProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: LeaveViewState;
}

export function LeaveWorkspace({ client, initialState }: LeaveWorkspaceProps) {
  const [state, setState] = useState<LeaveViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadLeaveView(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Leave" detail="Fetching the G03 leave application and relay summary." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load Leave"
        detail={`The G03 leave fetch failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.kind === "empty") {
    return <OperationalState kind="empty" title="No leave applications" detail="No G03 leave applications are in scope." />;
  }

  const slice = state.slice;
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
