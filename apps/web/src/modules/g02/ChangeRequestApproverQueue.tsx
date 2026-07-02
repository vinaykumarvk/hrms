import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PersonalDetailChangeRecord, PersonalDetailDecisionVerb } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { ChangeRequestDiffView } from "./ChangeRequestDiffView";

/** Canonical view state for the pending change-request queue. */
type QueueState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; requests: PersonalDetailChangeRecord[] };

export interface ChangeRequestApproverQueueProps {
  client: HrmsClient;
  /** Bump to refetch the queue (e.g. after the editor creates a request). */
  refreshToken: number;
  /** Invoked after a decision is accepted so the workspace can refresh dependent panels. */
  onDecided: () => void;
}

/**
 * PH-07E G02 approver queue: lists IN_REVIEW change requests from
 * GET /api/v1/personal-details/change-requests and wires Approve / Reject / Send back to the
 * PH-07C decision routes. Reject and send-back require a comment (VAL-COMMENT); a missing comment
 * is caught client-side and any server-side breach surfaces the ERR-REASON-REQ envelope. SoD
 * breaches (maker acting as checker) surface ERR-G02-SOD from the API.
 */
export function ChangeRequestApproverQueue({ client, refreshToken, onDecided }: ChangeRequestApproverQueueProps) {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<{ requestNo: string; errorCode: string } | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [openDiffId, setOpenDiffId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    client
      .listPersonalDetailChangeRequests()
      .then((result) => {
        if (!mounted) {
          return;
        }
        const pending = result.items.filter((request) => request.status === "IN_REVIEW");
        setState(pending.length === 0 ? { kind: "empty" } : { kind: "ready", requests: pending });
      })
      .catch((error: unknown) => {
        if (mounted) {
          setState({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client, refreshToken]);

  function decide(request: PersonalDetailChangeRecord, verb: PersonalDetailDecisionVerb) {
    const comment = (comments[request.id] ?? "").trim();
    if ((verb === "reject" || verb === "send-back") && !comment) {
      // Mirrors the API's mandatory-reason rule so the obvious case never leaves the browser.
      setDecisionError({ requestNo: request.requestNo, errorCode: "ERR-REASON-REQ" });
      return;
    }
    setDecidingId(request.id);
    setDecisionError(null);
    setDecisionNotice(null);
    void client
      .decidePersonalDetailChangeRequest(request.id, verb, comment || undefined, crypto.randomUUID())
      .then((result) => {
        setDecidingId(null);
        setDecisionNotice(`${result.request.requestNo} moved to ${result.request.status}.`);
        onDecided();
      })
      .catch((error: unknown) => {
        setDecidingId(null);
        setDecisionError({
          requestNo: request.requestNo,
          errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR",
        });
      });
  }

  return (
    <section className="record-panel g02-approver-queue" aria-label="G02 approver queue">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>Approver Queue</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading pending requests" detail="Fetching IN_REVIEW change requests awaiting a decision." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load the queue"
          detail={`The change-request list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No pending requests" detail="No change requests are waiting for a decision." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="approver-queue-list" aria-label="Pending change requests">
          {state.requests.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{request.requestNo}</strong> — {request.fieldCode} for {request.employeeId} ({request.sensitivity} routing,
                revision {request.revisionNo})
              </div>
              <label htmlFor={`g02-comment-${request.id}`}>Decision comment (mandatory for reject / send back)</label>
              <input
                autoComplete="off"
                id={`g02-comment-${request.id}`}
                name="decisionComment"
                onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))}
                type="text"
                value={comments[request.id] ?? ""}
              />
              <div className="queue-actions">
                <button disabled={decidingId !== null} onClick={() => decide(request, "approve")} type="button">
                  {decidingId === request.id ? "Deciding…" : "Approve"}
                </button>
                <button disabled={decidingId !== null} onClick={() => decide(request, "reject")} type="button">
                  Reject
                </button>
                <button disabled={decidingId !== null} onClick={() => decide(request, "send-back")} type="button">
                  Send back
                </button>
                <button onClick={() => setOpenDiffId((current) => (current === request.id ? null : request.id))} type="button">
                  {openDiffId === request.id ? "Hide diff" : "View diff"}
                </button>
              </div>
              {openDiffId === request.id ? <ChangeRequestDiffView client={client} requestId={request.id} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {decisionError ? (
        <p role="alert">
          The decision on {decisionError.requestNo} failed with error code {decisionError.errorCode}
          {decisionError.errorCode === "ERR-REASON-REQ" ? ": a decision comment is mandatory for reject and send back." : "."}
        </p>
      ) : null}
      {decisionNotice ? <p role="status">{decisionNotice}</p> : null}
    </section>
  );
}
