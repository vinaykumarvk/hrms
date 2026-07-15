import { HrmsApiError, HrmsClient, TrainingNominationView } from "../../api/hrmsClient";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required } from "../../lib/useForm";

/* ── Types ─────────────────────────────────────────────────── */

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; nomination: TrainingNominationView }
  | { kind: "error"; errorCode: string; message: string };

const G07_ERRORS: Record<string, string> = {
  PRECONDITION_FAILED: "Session is not open for nominations (closed or cancelled).",
  NOT_FOUND: "Session or employee not found (eligibility check failed).",
  VALIDATION_FAILED: "Nomination rejected by server-side validation.",
  CONFLICT: "A conflicting nomination already exists for this employee and session.",
  FORBIDDEN: "Session does not carry g07.nomination.submit permission.",
};

function describeError(code: string): string {
  return G07_ERRORS[code] ?? "The nomination could not be submitted.";
}

function describeStatus(n: TrainingNominationView): string {
  if (n.status === "WAITLISTED") return `Session full — waitlisted at position ${n.waitlistPosition ?? "?"}.`;
  return `Status: ${n.status} (seat available).`;
}

/* ── Component ─────────────────────────────────────────────── */

export interface TrainingNominationFormProps {
  client: HrmsClient;
  defaultEmployeeId?: string;
  initialPhase?: SubmitPhase;
  /** Invoked after a successful submit so a sibling "My Training" list can refresh. */
  onSubmitted?: () => void;
}

export function TrainingNominationForm({ client, defaultEmployeeId = "", initialPhase, onSubmitted }: TrainingNominationFormProps) {
  const form = useForm({
    sessionId: { initial: "", validate: required("Session ID is required.") },
    employeeId: { initial: defaultEmployeeId, validate: required("Employee ID is required.") },
    phase: { initial: (initialPhase ?? { kind: "idle" }) as SubmitPhase },
  });

  const handleFormSubmit = form.handleSubmit(async (values) => {
    form.setValue("phase", { kind: "idle" });
    try {
      const result = await client.nominateForTraining(
        { sessionId: values.sessionId.trim(), employeeId: values.employeeId.trim() },
        crypto.randomUUID(),
      );
      form.setValue("phase", { kind: "success", nomination: result.nomination });
      onSubmitted?.();
    } catch (error: unknown) {
      const code = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
      form.setValue("phase", { kind: "error", errorCode: code, message: describeError(code) });
    }
  });

  const phase = form.values.phase;

  return (
    <section className="record-panel training-nomination-panel" aria-label="G07 training nomination">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G07 Training</p>
          <h2>Nominate to a Session</h2>
        </div>
        {phase.kind === "success" && (
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {phase.nomination.nominationNo}
          </span>
        )}
      </div>

      <form aria-label="Training nomination form" onSubmit={handleFormSubmit}>
        <FormField id="g07-session-id" label="Training Session ID" required error={form.touched.sessionId ? form.errors.sessionId : undefined}>
          <input
            id="g07-session-id"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.sessionId}
            onChange={(e) => form.setValue("sessionId", e.target.value)}
            onBlur={() => form.touchField("sessionId")}
          />
        </FormField>

        <FormField id="g07-employee-id" label="Employee ID" required error={form.touched.employeeId ? form.errors.employeeId : undefined}>
          <input
            id="g07-employee-id"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.employeeId}
            onChange={(e) => form.setValue("employeeId", e.target.value)}
            onBlur={() => form.touchField("employeeId")}
          />
        </FormField>

        <FormActions isSubmitting={form.isSubmitting} submitDisabled={!form.isDirty} onSubmitLabel="Submit nomination" />

        {phase.kind === "error" && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {phase.errorCode}: {phase.message}
          </p>
        )}
        {phase.kind === "success" && (
          <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            {phase.nomination.nominationNo} for {phase.nomination.employeeId}. {describeStatus(phase.nomination)}
          </p>
        )}
      </form>
    </section>
  );
}
