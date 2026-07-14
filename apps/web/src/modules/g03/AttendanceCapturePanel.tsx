import { FormEvent, useEffect, useState } from "react";
import { AttendanceRecordView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my attendance" history. */
type AttendanceState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; records: AttendanceRecordView[] };

/** Terminal feedback for the clock in/out submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; attendanceDate: string; status: string }
  | { kind: "error"; errorCode: string };

const CAPTURE_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "Your session does not carry the g03.attendance.capture permission.",
  VALIDATION_FAILED: "The attendance date or times were rejected by server-side validation.",
};

function describeCaptureError(errorCode: string): string {
  return CAPTURE_ERROR_MESSAGES[errorCode] ?? "The attendance record could not be saved.";
}

async function resolveEmployeeId(client: HrmsClient, employeeId?: string): Promise<string | undefined> {
  if (employeeId) {
    return employeeId;
  }
  const employees = await client.listEmployees();
  return employees.items[0]?.id;
}

async function loadAttendance(client: HrmsClient, employeeId?: string): Promise<AttendanceState & { employeeId?: string }> {
  try {
    const targetId = await resolveEmployeeId(client, employeeId);
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const all = await client.listAttendance();
    const mine = all.items.filter((record) => record.employeeId === targetId).sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
    return mine.length === 0 ? { kind: "empty", employeeId: targetId } : { kind: "ready", records: mine, employeeId: targetId };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface AttendanceCapturePanelProps {
  client: HrmsClient;
  /** Pre-resolved employee for the demo persona; falls back to the first listed employee if omitted. */
  employeeId?: string;
  onCaptured?: () => void;
}

/**
 * G03 self-service attendance capture (FR-03/FR-04): records today's (or a given day's) clock
 * in/out through POST /api/v1/atl/attendance-captures, and shows the employee's own recent
 * attendance history including any MISSING_IN/MISSING_OUT anomaly that a regularisation would fix.
 */
export function AttendanceCapturePanel({ client, employeeId, onCaptured }: AttendanceCapturePanelProps) {
  const [state, setState] = useState<AttendanceState & { employeeId?: string }>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadAttendance(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.employeeId) {
      return;
    }
    if (!attendanceDate) {
      setValidationError("An attendance date is required.");
      return;
    }
    if (!inTime && !outTime) {
      setValidationError("Provide at least a clock-in or a clock-out time.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .captureAttendance({ employeeId: state.employeeId, attendanceDate, inTime: inTime || undefined, outTime: outTime || undefined }, crypto.randomUUID())
      .then((result) => {
        setPhase({ kind: "success", attendanceDate: result.attendance.attendanceDate, status: result.attendance.status });
        setAttendanceDate("");
        setInTime("");
        setOutTime("");
        setRefreshToken((token) => token + 1);
        onCaptured?.();
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g03-attendance-capture-panel" aria-label="G03 attendance capture">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Attendance</p>
          <h2>Clock In / Clock Out</h2>
        </div>
      </div>
      <form aria-label="Attendance capture form" onSubmit={handleSubmit}>
        <label htmlFor="g03-attendance-date">Date</label>
        <input id="g03-attendance-date" name="attendanceDate" onChange={(event) => setAttendanceDate(event.target.value)} type="date" value={attendanceDate} />
        <label htmlFor="g03-attendance-in">Clock in</label>
        <input id="g03-attendance-in" name="inTime" onChange={(event) => setInTime(event.target.value)} type="time" value={inTime} />
        <label htmlFor="g03-attendance-out">Clock out</label>
        <input id="g03-attendance-out" name="outTime" onChange={(event) => setOutTime(event.target.value)} type="time" value={outTime} />
        <button disabled={submitting} type="submit">
          {submitting ? "Saving…" : "Save attendance"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          Saving attendance failed with error code {phase.errorCode}: {describeCaptureError(phase.errorCode)}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <p role="status">
          Attendance for {phase.attendanceDate} saved (status: {phase.status}).
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading attendance history" detail="Fetching your recent attendance records." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load attendance history" detail={`The attendance list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No attendance recorded" detail="No attendance records exist for you yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="My attendance records">
          {state.records.map((record) => (
            <li key={record.id}>
              <strong>{record.attendanceDate}</strong> — {record.status}
              {record.inTime ? ` in ${record.inTime}` : ""}
              {record.outTime ? ` out ${record.outTime}` : ""}
              {record.anomalyCode ? ` — anomaly: ${record.anomalyCode}` : ""}
              {record.isRegularised ? " (regularised)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
