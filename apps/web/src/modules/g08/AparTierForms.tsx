import { AparFormView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required } from "../../lib/useForm";

/* ── Types ─────────────────────────────────────────────────── */

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; form: AparFormView }
  | { kind: "error"; errorCode: string; message: string };

const G08_ERROR_MESSAGES: Record<string, string> = {
  PRECONDITION_FAILED: "The APAR form is not at the status this tier action requires.",
  "ERR-G08-WEIGHTAGE": "Goal weightages fail the WSUM check; lock the goals first.",
  "ERR-G08-REPWINDOW": "The representation window has elapsed.",
  NOT_FOUND: "The APAR form could not be found.",
  VALIDATION_FAILED: "The assessment was rejected by server-side validation.",
  FORBIDDEN: "Your session does not carry the permission for this APAR tier.",
};

function describeG08Error(errorCode: string): string {
  return G08_ERROR_MESSAGES[errorCode] ?? "The APAR tier action could not be completed.";
}

function toErrorPhase(error: unknown): SubmitPhase {
  const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
  return { kind: "error", errorCode, message: describeG08Error(errorCode) };
}

const TIER_PERMISSIONS = {
  self: "g08.apar.self.submit",
  reporting: "g08.apar.report",
  review: "g08.apar.review",
} as const;

/* ── Props ─────────────────────────────────────────────────── */

export interface AparTierFormsProps {
  client: HrmsClient;
  permissions: readonly string[];
  defaultFormId?: string;
}

/* ── Component ─────────────────────────────────────────────── */

export function AparTierForms({ client, permissions, defaultFormId = "" }: AparTierFormsProps) {
  const canSubmitSelf = permissions.includes(TIER_PERMISSIONS.self);
  const canReport = permissions.includes(TIER_PERMISSIONS.reporting);
  const canReview = permissions.includes(TIER_PERMISSIONS.review);

  const sharedForm = useForm({
    formId: { initial: defaultFormId, validate: required("APAR form id is required.") },
  });

  const selfForm = useForm({
    phase: { initial: { kind: "idle" } as SubmitPhase },
    narrative: { initial: "", validate: required("An achievements narrative is required.") },
  });

  const reportForm = useForm({
    grade: { initial: "", validate: required("Grade is required.") },
    narrative: { initial: "", validate: required("Narrative is required.") },
    phase: { initial: { kind: "idle" } as SubmitPhase },
  });

  const reviewForm = useForm({
    concur: { initial: true as boolean },
    remarks: { initial: "", validate: required("Remarks are required.") },
    phase: { initial: { kind: "idle" } as SubmitPhase },
  });

  /* ── Handlers ─────────────────────────────────────────────── */

  const handleSelf = selfForm.handleSubmit(async (values) => {
    selfForm.setValue("phase", { kind: "idle" });
    try {
      const result = await client.submitAparSelf(
        sharedForm.values.formId.trim(),
        { narrative: values.narrative.trim() },
        crypto.randomUUID(),
      );
      selfForm.setValue("phase", { kind: "success", form: result.form });
    } catch (e: unknown) {
      selfForm.setValue("phase", toErrorPhase(e));
    }
  });

  const handleReport = reportForm.handleSubmit(async (values) => {
    reportForm.setValue("phase", { kind: "idle" });
    try {
      const result = await client.recordAparReporting(
        sharedForm.values.formId.trim(),
        { grade: values.grade.trim(), narrative: values.narrative.trim() },
        crypto.randomUUID(),
      );
      reportForm.setValue("phase", { kind: "success", form: result.form });
    } catch (e: unknown) {
      reportForm.setValue("phase", toErrorPhase(e));
    }
  });

  const handleReview = reviewForm.handleSubmit(async (values) => {
    reviewForm.setValue("phase", { kind: "idle" });
    try {
      const result = await client.recordAparReview(
        sharedForm.values.formId.trim(),
        { concur: values.concur, remarks: values.remarks.trim() },
        crypto.randomUUID(),
      );
      reviewForm.setValue("phase", { kind: "success", form: result.form });
    } catch (e: unknown) {
      reviewForm.setValue("phase", toErrorPhase(e));
    }
  });

  /* ── No-access state ──────────────────────────────────────── */

  if (!canSubmitSelf && !canReport && !canReview) {
    return (
      <section className="record-panel" aria-label="G08 APAR tier forms" data-state="empty">
        <p className="text-sm text-[var(--color-text-muted)]">
          Your session holds no APAR authoring tier. Nothing to author here.
        </p>
      </section>
    );
  }

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <section className="record-panel" aria-label="G08 APAR tier forms">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G08 APAR</p>
          <h2>Appraisal Tiers</h2>
        </div>
      </div>

      {/* Shared form-id input */}
      <FormField
        id="apar-form-id"
        label="APAR Form ID"
        required
        error={sharedForm.touched.formId ? sharedForm.errors.formId : undefined}
      >
        <input
          id="apar-form-id"
          name="formId"
          type="text"
          autoComplete="off"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          value={sharedForm.values.formId}
          onChange={(e) => sharedForm.setValue("formId", e.target.value)}
          onBlur={() => sharedForm.touchField("formId")}
        />
      </FormField>

      <div className="mt-5 grid gap-5">
        {/* ── SELF tier ──────────────────────────────────────── */}
        {canSubmitSelf && (
          <form onSubmit={handleSelf} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-heading)] mb-1">Self-appraisal</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Submitting moves the form to the reporting officer's desk.
            </p>

            <div className="grid gap-3">
              <FormField
                id="apar-self-narrative"
                label="Achievements narrative"
                required
                error={selfForm.touched.narrative ? selfForm.errors.narrative : undefined}
              >
                <textarea
                  id="apar-self-narrative"
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  value={selfForm.values.narrative}
                  onChange={(e) => selfForm.setValue("narrative", e.target.value)}
                  onBlur={() => selfForm.touchField("narrative")}
                />
              </FormField>
            </div>

            <FormActions
              isSubmitting={selfForm.isSubmitting}
              submitDisabled={!!sharedForm.errors.formId}
              onSubmitLabel={selfForm.isSubmitting ? "Submitting…" : "Submit self-appraisal"}
            />

            {selfForm.values.phase.kind === "error" && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {selfForm.values.phase.errorCode}: {selfForm.values.phase.message}
              </p>
            )}
            {selfForm.values.phase.kind === "success" && (
              <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                Form {selfForm.values.phase.form.formNo} submitted — status: {selfForm.values.phase.form.status}
              </p>
            )}
          </form>
        )}

        {/* ── REPORTING tier ─────────────────────────────────── */}
        {canReport && (
          <form onSubmit={handleReport} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-heading)] mb-1">Reporting Officer Assessment</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Grade and narrative required. Submitted to the reviewing officer.
            </p>

            <div className="grid gap-3">
              <FormField
                id="apar-ro-grade"
                label="Grade"
                required
                error={reportForm.touched.grade ? reportForm.errors.grade : undefined}
              >
                <input
                  id="apar-ro-grade"
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  value={reportForm.values.grade}
                  onChange={(e) => reportForm.setValue("grade", e.target.value)}
                  onBlur={() => reportForm.touchField("grade")}
                />
              </FormField>

              <FormField
                id="apar-ro-narrative"
                label="Narrative"
                required
                error={reportForm.touched.narrative ? reportForm.errors.narrative : undefined}
              >
                <textarea
                  id="apar-ro-narrative"
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  value={reportForm.values.narrative}
                  onChange={(e) => reportForm.setValue("narrative", e.target.value)}
                  onBlur={() => reportForm.touchField("narrative")}
                />
              </FormField>
            </div>

            <div className="mt-3">
              <FormActions
                isSubmitting={reportForm.isSubmitting}
                submitDisabled={!!sharedForm.errors.formId || !reportForm.isDirty}
                onSubmitLabel="Record reporting assessment"
              />
            </div>

            {reportForm.values.phase.kind === "error" && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {reportForm.values.phase.errorCode}: {reportForm.values.phase.message}
              </p>
            )}
            {reportForm.values.phase.kind === "success" && (
              <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                Form {reportForm.values.phase.form.formNo} assessed — status: {reportForm.values.phase.form.status}
              </p>
            )}
          </form>
        )}

        {/* ── REVIEW tier ────────────────────────────────────── */}
        {canReview && (
          <form onSubmit={handleReview} className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text-heading)] mb-1">Reviewing Officer Review</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Concur or dissent with remarks. Final tier before acceptance body.
            </p>

            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewForm.values.concur}
                  onChange={(e) => reviewForm.setValue("concur", e.target.checked)}
                  className="size-4 rounded border-gray-300 accent-blue-600"
                />
                Concur with the reporting officer's assessment
              </label>

              <FormField
                id="apar-rvo-remarks"
                label="Remarks"
                required
                error={reviewForm.touched.remarks ? reviewForm.errors.remarks : undefined}
              >
                <textarea
                  id="apar-rvo-remarks"
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  value={reviewForm.values.remarks}
                  onChange={(e) => reviewForm.setValue("remarks", e.target.value)}
                  onBlur={() => reviewForm.touchField("remarks")}
                />
              </FormField>
            </div>

            <div className="mt-3">
              <FormActions
                isSubmitting={reviewForm.isSubmitting}
                submitDisabled={!!sharedForm.errors.formId || !reviewForm.isDirty}
                onSubmitLabel="Record reviewing decision"
              />
            </div>

            {reviewForm.values.phase.kind === "error" && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {reviewForm.values.phase.errorCode}: {reviewForm.values.phase.message}
              </p>
            )}
            {reviewForm.values.phase.kind === "success" && (
              <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                Form {reviewForm.values.phase.form.formNo} reviewed — status: {reviewForm.values.phase.form.status}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
