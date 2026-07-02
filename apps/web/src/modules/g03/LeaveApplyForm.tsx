import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, LeaveTypeOption } from "../../api/hrmsClient";

/** Terminal feedback for the submit action. Client-side validation failures never leave the browser. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; applicationNo: string; balanceAvailable: number }
  | { kind: "error"; errorCode: string; message: string };

/** Named G03 error envelopes rendered to the applicant (BRD G03 FR-03/FR-04 failure handling). */
const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  LEAVE_OVERLAP: "The requested dates overlap an existing leave application for this employee.",
  INSUFFICIENT_BALANCE: "The available leave balance (after reservations) is less than the requested spell.",
  ENTITLEMENT_EXCEEDED: "The requested spell exceeds the sanctioned entitlement for this leave type.",
  VALIDATION_FAILED: "The application was rejected by server-side validation. Check the dates and try again.",
  FORBIDDEN: "Your session does not carry the g03.leave.submit permission.",
};

function describeSubmitError(errorCode: string): string {
  return SUBMIT_ERROR_MESSAGES[errorCode] ?? "The leave application could not be submitted.";
}

/** Leave-type options while GET /api/v1/atl/leave-types resolves, fails, or succeeds. */
type LeaveTypesState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; options: LeaveTypeOption[] };

export interface LeaveApplyFormProps {
  client: HrmsClient;
  /** Pre-filled employee for the demo persona; the field stays editable. */
  defaultEmployeeId?: string;
  /** Invoked after a successful submit so the workspace can refresh the inbox and evidence. */
  onSubmitted: () => void;
}

/**
 * PH-06D leave-apply form: controlled inputs that POST /api/v1/atl/leave-applications
 * through the injected client with a fresh Idempotency-Key per attempt.
 */
export function LeaveApplyForm({ client, defaultEmployeeId = "", onSubmitted }: LeaveApplyFormProps) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [leaveTypeId, setLeaveTypeId] = useState("EL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypesState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setLeaveTypes({ kind: "loading" });
    client
      .listLeaveTypes()
      .then((result) => {
        if (mounted) {
          setLeaveTypes({ kind: "ready", options: result.items.filter((option) => option.status === "ACTIVE") });
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setLeaveTypes({ kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  function validate(): string | null {
    if (!employeeId.trim()) {
      return "Employee id is required.";
    }
    if (!leaveTypeId.trim()) {
      return "Select a leave type.";
    }
    if (!fromDate || !toDate) {
      return "Both from and to dates are required.";
    }
    if (toDate < fromDate) {
      return "The to date must be on or after the from date.";
    }
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .submitLeaveApplication(
        {
          employeeId: employeeId.trim(),
          leaveTypeId: leaveTypeId.trim(),
          fromDate,
          toDate,
          reason: reason.trim() || undefined,
        },
        crypto.randomUUID()
      )
      .then((result) => {
        setPhase({
          kind: "success",
          applicationNo: result.application.applicationNo,
          balanceAvailable: result.balance.availableBalance,
        });
        onSubmitted();
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode, message: describeSubmitError(errorCode) });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel leave-apply-panel" aria-label="G03 apply for leave">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Leave</p>
          <h2>Apply for Leave</h2>
        </div>
      </div>
      <form aria-label="Leave application form" onSubmit={handleSubmit}>
        <label htmlFor="leave-employee-id">Employee id</label>
        <input
          autoComplete="off"
          id="leave-employee-id"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <label htmlFor="leave-type-id">Leave type</label>
        {leaveTypes.kind === "ready" && leaveTypes.options.length > 0 ? (
          <select
            id="leave-type-id"
            name="leaveTypeId"
            onChange={(event) => setLeaveTypeId(event.target.value)}
            value={leaveTypeId}
          >
            {leaveTypes.options.map((option) => (
              <option key={option.leaveTypeId} value={option.leaveTypeId}>
                {option.name} ({option.leaveTypeId})
              </option>
            ))}
          </select>
        ) : (
          <input
            autoComplete="off"
            id="leave-type-id"
            name="leaveTypeId"
            onChange={(event) => setLeaveTypeId(event.target.value)}
            type="text"
            value={leaveTypeId}
          />
        )}
        {leaveTypes.kind === "loading" ? <p className="field-hint">Loading configured leave types…</p> : null}
        {leaveTypes.kind === "error" ? (
          <p className="field-hint" role="alert">
            Leave types could not be loaded (error code {leaveTypes.errorCode}). Enter the leave type code directly.
          </p>
        ) : null}
        <label htmlFor="leave-from-date">From date</label>
        <input
          id="leave-from-date"
          name="fromDate"
          onChange={(event) => setFromDate(event.target.value)}
          type="date"
          value={fromDate}
        />
        <label htmlFor="leave-to-date">To date</label>
        <input
          id="leave-to-date"
          name="toDate"
          onChange={(event) => setToDate(event.target.value)}
          type="date"
          value={toDate}
        />
        <label htmlFor="leave-reason">Reason (optional)</label>
        <input
          autoComplete="off"
          id="leave-reason"
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          type="text"
          value={reason}
        />
        <button disabled={submitting} type="submit">
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          Submission failed with error code {phase.errorCode}: {phase.message}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <p role="status">
          Leave application {phase.applicationNo} submitted. {phase.balanceAvailable} days remain available after the
          reservation.
        </p>
      ) : null}
    </section>
  );
}
