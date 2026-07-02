import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, LeaveApplicationRecord, LeaveDecisionVerb } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the pending-applications list. */
type InboxState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; applications: LeaveApplicationRecord[] };

export interface LeaveApproverInboxProps {
  client: HrmsClient;
  /** Bump to refetch the list (e.g. after the apply form submits or a decision lands). */
  refreshToken: number;
  /** Invoked after a decision is accepted so the workspace can refresh dependent panels. */
  onDecided: () => void;
}

/**
 * PH-06D approver inbox: lists SUBMITTED applications from GET /api/v1/atl/leave-applications
 * and wires Approve / Reject to POST .../{id}/decision through the injected client.
 */
export function LeaveApproverInbox({ client, refreshToken, onDecided }: LeaveApproverInboxProps) {
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<{ applicationNo: string; errorCode: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .listLeaveApplications()
      .then((result) => {
        if (!mounted) {
          return;
        }
        const pending = result.items.filter((application) => application.status === "SUBMITTED");
        setState(pending.length === 0 ? { kind: "empty" } : { kind: "ready", applications: pending });
      })
      .catch((error: unknown) => {
        if (mounted) {
          setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client, refreshToken]);

  function decide(application: LeaveApplicationRecord, decision: LeaveDecisionVerb) {
    setDecidingId(application.id);
    setDecisionError(null);
    void client
      .decideLeaveApplication(application.id, decision, crypto.randomUUID())
      .then(() => {
        setDecidingId(null);
        onDecided();
      })
      .catch((error: unknown) => {
        setDecidingId(null);
        setDecisionError({
          applicationNo: application.applicationNo,
          errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR",
        });
      });
  }

  return (
    <section className="record-panel leave-approver-panel" aria-label="G03 approver inbox">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Leave</p>
          <h2>Approver Inbox</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading pending applications" detail="Fetching SUBMITTED leave applications awaiting a decision." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load pending applications"
          detail={`The leave application list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No applications" detail="No leave applications are waiting for a decision." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="approver-inbox-list" aria-label="Pending leave applications">
          {state.applications.map((application) => (
            <li key={application.id}>
              <div>
                <strong>{application.applicationNo}</strong> — {application.leaveTypeId} {application.fromDate} to{" "}
                {application.toDate} ({application.totalDays} days) for {application.employeeId}
              </div>
              <div className="inbox-actions">
                <button disabled={decidingId !== null} onClick={() => decide(application, "APPROVE")} type="button">
                  {decidingId === application.id ? "Deciding…" : "Approve"}
                </button>
                <button disabled={decidingId !== null} onClick={() => decide(application, "REJECT")} type="button">
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {decisionError ? (
        <p role="alert">
          The decision on {decisionError.applicationNo} failed with error code {decisionError.errorCode}.
        </p>
      ) : null}
    </section>
  );
}
