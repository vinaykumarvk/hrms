import { FormEvent, useState } from "react";
import { HrmsApiError, HrmsClient, TrainingNominationView } from "../../api/hrmsClient";

export type NominationSubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; nomination: TrainingNominationView }
  | { kind: "error"; errorCode: string; message: string };

/** G07 eligibility/capacity envelopes rendered readable to the nominator. */
const G07_ERROR_MESSAGES: Record<string, string> = {
  PRECONDITION_FAILED: "The training session is not open for nominations (closed or cancelled).",
  NOT_FOUND: "The training session or employee could not be found (eligibility check failed).",
  VALIDATION_FAILED: "The nomination was rejected by server-side validation.",
  CONFLICT: "A conflicting nomination already exists for this employee and session.",
  FORBIDDEN: "Your session does not carry the g07.nomination.submit permission.",
};

function describeG07Error(errorCode: string): string {
  return G07_ERROR_MESSAGES[errorCode] ?? "The nomination could not be submitted.";
}

/** Capacity feedback: WAITLISTED nominations carry a queue position instead of a seat. */
function describeCapacity(nomination: TrainingNominationView): string {
  if (nomination.status === "WAITLISTED") {
    return `Session capacity is full — waitlisted at position ${nomination.waitlistPosition ?? "?"}.`;
  }
  return `Nomination is ${nomination.status} in WF-G07-NOMINATION (seat available at submission).`;
}

export interface TrainingNominationFormProps {
  client: HrmsClient;
  /** Pre-filled employee for the demo persona; the field stays editable. */
  defaultEmployeeId?: string;
  /** Pre-resolved phase for tests/server rendering (mirrors the workspace initialState pattern). */
  initialPhase?: NominationSubmitPhase;
}

/**
 * PH-08F G07 nomination form: nominate an employee to a training session or
 * campaign session via POST /api/v1/training/nominations through the injected
 * client, rendering the server's capacity (WAITLISTED + position) and
 * eligibility (NOT_FOUND / PRECONDITION_FAILED) feedback honestly.
 */
export function TrainingNominationForm({ client, defaultEmployeeId = "", initialPhase }: TrainingNominationFormProps) {
  const [sessionId, setSessionId] = useState("");
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<NominationSubmitPhase>(initialPhase ?? { kind: "idle" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId.trim()) {
      setValidationError("The training session (or campaign session) id is required.");
      return;
    }
    if (!employeeId.trim()) {
      setValidationError("The nominated employee id is required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .nominateForTraining({ sessionId: sessionId.trim(), employeeId: employeeId.trim() }, crypto.randomUUID())
      .then((result) => setPhase({ kind: "success", nomination: result.nomination }))
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode, message: describeG07Error(errorCode) });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel training-nomination-panel" aria-label="G07 training nomination">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G07 Training</p>
          <h2>Nominate to a Session</h2>
        </div>
      </div>
      <form aria-label="Training nomination form" onSubmit={handleSubmit}>
        <label htmlFor="g07-session-id">Training session id</label>
        <input
          autoComplete="off"
          id="g07-session-id"
          name="sessionId"
          onChange={(event) => setSessionId(event.target.value)}
          type="text"
          value={sessionId}
        />
        <label htmlFor="g07-employee-id">Employee id</label>
        <input
          autoComplete="off"
          id="g07-employee-id"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <button disabled={submitting} type="submit">
          {submitting ? "Nominating…" : "Submit nomination"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          Nomination failed with error code {phase.errorCode}: {phase.message}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <p role="status">
          Nomination {phase.nomination.nominationNo} recorded for {phase.nomination.employeeId}. {describeCapacity(phase.nomination)}
        </p>
      ) : null}
    </section>
  );
}
