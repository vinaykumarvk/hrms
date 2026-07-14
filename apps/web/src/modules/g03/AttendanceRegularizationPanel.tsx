import { FormEvent, useEffect, useState } from "react";
import { AttendanceRecordView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the records-needing-correction list. */
type AnomalyState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; records: AttendanceRecordView[] };

const REGULARISE_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Your session does not carry the g03.attendance.regularise permission.",
  WINDOW_EXPIRED: "The regularisation window for this attendance day has expired.",
  REGULARISATION_LIMIT: "The regularisation cap for this employee's pay period has been reached.",
  SOD_VIOLATION: "You captured this attendance day yourself and cannot also regularise it — a different authorized user must.",
};

function describeRegulariseError(errorCode: string): string {
  return REGULARISE_ERROR_MESSAGES[errorCode] ?? "The regularisation could not be recorded.";
}

async function loadAnomalies(client: HrmsClient): Promise<AnomalyState> {
  try {
    const all = await client.listAttendance();
    const anomalies = all.items.filter((record) => record.status === "ANOMALY" || Boolean(record.anomalyCode));
    return anomalies.length === 0 ? { kind: "empty" } : { kind: "ready", records: anomalies };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface AttendanceRegularizationPanelProps {
  client: HrmsClient;
  refreshToken: number;
  onRegularised: () => void;
}

/**
 * G03 attendance regularisation (FR-05): lists attendance days flagged MISSING_IN/MISSING_OUT
 * (a missed punch) and lets an actor holding g03.attendance.regularise correct them with a reason
 * through POST /api/v1/atl/attendance-captures/{id}:regularise. Unlike leave, this is a flat
 * permission-gated action (not routed through the P01 reporting-chain workflow).
 */
export function AttendanceRegularizationPanel({ client, refreshToken, onRegularised }: AttendanceRegularizationPanelProps) {
  const [state, setState] = useState<AnomalyState>({ kind: "loading" });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ recordId: string; errorCode: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAnomalies(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, refreshToken, localRefresh]);

  function handleSubmit(event: FormEvent<HTMLFormElement>, record: AttendanceRecordView) {
    event.preventDefault();
    const reason = (reasonById[record.id] ?? "").trim();
    if (!reason) {
      setActionError({ recordId: record.id, errorCode: "VALIDATION_FAILED" });
      return;
    }
    setActingOnId(record.id);
    setActionError(null);
    void client
      .regulariseAttendance(record.id, reason, crypto.randomUUID())
      .then(() => {
        setActingOnId(null);
        setReasonById((prior) => ({ ...prior, [record.id]: "" }));
        setLocalRefresh((token) => token + 1);
        onRegularised();
      })
      .catch((error: unknown) => {
        setActingOnId(null);
        setActionError({ recordId: record.id, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  return (
    <section className="record-panel g03-attendance-regularization-panel" aria-label="G03 attendance regularization">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Attendance</p>
          <h2>Regularization Queue</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading regularization queue" detail="Fetching attendance days with a missed-punch anomaly." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load regularization queue"
          detail={`The attendance list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No missed punches" detail="No attendance days currently need regularisation." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="approver-inbox-list" aria-label="Attendance days needing regularisation">
          {state.records.map((record) => (
            <li key={record.id}>
              <div>
                <strong>{record.attendanceDate}</strong> — {record.employeeId}
                {record.anomalyCode ? ` (${record.anomalyCode})` : ""}
                {record.inTime ? ` in ${record.inTime}` : ""}
                {record.outTime ? ` out ${record.outTime}` : ""}
              </div>
              <form aria-label={`Regularise ${record.attendanceDate} for ${record.employeeId}`} onSubmit={(event) => handleSubmit(event, record)}>
                <label htmlFor={`g03-regularise-reason-${record.id}`}>Reason</label>
                <input
                  autoComplete="off"
                  id={`g03-regularise-reason-${record.id}`}
                  onChange={(event) => setReasonById((prior) => ({ ...prior, [record.id]: event.target.value }))}
                  type="text"
                  value={reasonById[record.id] ?? ""}
                />
                <button disabled={actingOnId !== null} type="submit">
                  {actingOnId === record.id ? "Regularising…" : "Regularise"}
                </button>
              </form>
              {actionError?.recordId === record.id ? (
                <p role="alert">
                  {actionError.errorCode === "VALIDATION_FAILED" && !(reasonById[record.id] ?? "").trim()
                    ? "A reason is required."
                    : `The action failed with error code ${actionError.errorCode}: ${describeRegulariseError(actionError.errorCode)}`}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
