import { FormEvent, useState } from "react";
import { AparFormView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; form: AparFormView }
  | { kind: "error"; errorCode: string; message: string };

/** G08 error envelopes rendered readable; sealed-cover and window codes come from PH-08D. */
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

export interface AparTierFormsProps {
  client: HrmsClient;
  /**
   * P02 permission grants from the session. Each tier form renders only for the
   * actor that holds its tier (SoD): an appraisee without g08.apar.report /
   * g08.apar.review never sees the RO/RvO authoring controls.
   */
  permissions: readonly string[];
  /** Pre-filled form id for the demo persona; the field stays editable. */
  defaultFormId?: string;
}

const TIER_PERMISSIONS = {
  self: "g08.apar.self.submit",
  reporting: "g08.apar.report",
  review: "g08.apar.review",
} as const;

/**
 * PH-08F G08 APAR tier forms: self-appraisal (appraisee), reporting officer
 * assessment (RO tier: grade + narrative via :report), and reviewing officer
 * review (RvO tier: concur + remarks via :review). Each form is bound to the
 * tier the actor holds through P02 permissions and submits through the
 * injected client with a fresh Idempotency-Key.
 */
export function AparTierForms({ client, permissions, defaultFormId = "" }: AparTierFormsProps) {
  const [formId, setFormId] = useState(defaultFormId);

  const [selfNarrative, setSelfNarrative] = useState("");
  const [selfValidation, setSelfValidation] = useState<string | null>(null);
  const [selfPhase, setSelfPhase] = useState<SubmitPhase>({ kind: "idle" });

  const [grade, setGrade] = useState("");
  const [narrative, setNarrative] = useState("");
  const [reportingValidation, setReportingValidation] = useState<string | null>(null);
  const [reportingPhase, setReportingPhase] = useState<SubmitPhase>({ kind: "idle" });

  const [concur, setConcur] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [reviewValidation, setReviewValidation] = useState<string | null>(null);
  const [reviewPhase, setReviewPhase] = useState<SubmitPhase>({ kind: "idle" });

  const canSubmitSelf = permissions.includes(TIER_PERMISSIONS.self);
  const canReport = permissions.includes(TIER_PERMISSIONS.reporting);
  const canReview = permissions.includes(TIER_PERMISSIONS.review);

  function requireFormId(setValidation: (message: string | null) => void): boolean {
    if (!formId.trim()) {
      setValidation("The APAR form id is required.");
      return false;
    }
    return true;
  }

  function handleSelfSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formId.trim()) {
      setSelfValidation(null);
      setSelfPhase({ kind: "error", errorCode: "VALIDATION_FAILED", message: "The APAR form id is required." });
      return;
    }
    if (!selfNarrative.trim()) {
      setSelfValidation("An achievements narrative is required.");
      return;
    }
    setSelfValidation(null);
    setSelfPhase({ kind: "submitting" });
    void client
      .submitAparSelf(formId.trim(), { narrative: selfNarrative.trim() }, crypto.randomUUID())
      .then((result) => setSelfPhase({ kind: "success", form: result.form }))
      .catch((error: unknown) => setSelfPhase(toErrorPhase(error)));
  }

  function handleReportingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireFormId(setReportingValidation)) {
      return;
    }
    if (!grade.trim() || !narrative.trim()) {
      setReportingValidation("The reporting officer must record both a grade and a narrative.");
      return;
    }
    setReportingValidation(null);
    setReportingPhase({ kind: "submitting" });
    void client
      .recordAparReporting(formId.trim(), { grade: grade.trim(), narrative: narrative.trim() }, crypto.randomUUID())
      .then((result) => setReportingPhase({ kind: "success", form: result.form }))
      .catch((error: unknown) => setReportingPhase(toErrorPhase(error)));
  }

  function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireFormId(setReviewValidation)) {
      return;
    }
    if (!remarks.trim()) {
      setReviewValidation("The reviewing officer must record remarks.");
      return;
    }
    setReviewValidation(null);
    setReviewPhase({ kind: "submitting" });
    void client
      .recordAparReview(formId.trim(), { concur, remarks: remarks.trim() }, crypto.randomUUID())
      .then((result) => setReviewPhase({ kind: "success", form: result.form }))
      .catch((error: unknown) => setReviewPhase(toErrorPhase(error)));
  }

  if (!canSubmitSelf && !canReport && !canReview) {
    return (
      <section className="record-panel apar-tier-forms" aria-label="G08 APAR tier forms" data-state="empty">
        <p>Your session holds no APAR authoring tier (self, reporting, or reviewing). Nothing to author here.</p>
      </section>
    );
  }

  return (
    <section className="record-panel apar-tier-forms" aria-label="G08 APAR tier forms">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G08 APAR</p>
          <h2>Appraisal Tiers</h2>
        </div>
      </div>
      <label htmlFor="apar-form-id">APAR form id</label>
      <input autoComplete="off" id="apar-form-id" name="formId" onChange={(event) => setFormId(event.target.value)} type="text" value={formId} />

      {canSubmitSelf ? (
        <form aria-label="APAR self-appraisal form" onSubmit={handleSelfSubmit}>
          <h3>Self-appraisal (appraisee tier)</h3>
          <p>Submitting moves the form from SELF_APPRAISAL to the reporting officer&apos;s desk.</p>
          <label htmlFor="apar-self-narrative">Achievements narrative</label>
          <textarea
            id="apar-self-narrative"
            name="narrative"
            onChange={(event) => setSelfNarrative(event.target.value)}
            rows={3}
            value={selfNarrative}
          />
          <button disabled={selfPhase.kind === "submitting"} type="submit">
            {selfPhase.kind === "submitting" ? "Submitting self-appraisal…" : "Submit self-appraisal"}
          </button>
          {selfValidation ? <p role="alert">{selfValidation}</p> : null}
          {selfPhase.kind === "error" ? (
            <p role="alert">
              Self-appraisal failed with error code {selfPhase.errorCode}: {selfPhase.message}
            </p>
          ) : null}
          {selfPhase.kind === "success" ? (
            <p role="status">
              Form {selfPhase.form.formNo} submitted; status is now {selfPhase.form.status}.
            </p>
          ) : null}
        </form>
      ) : null}

      {canReport ? (
        <form aria-label="APAR reporting officer assessment form" onSubmit={handleReportingSubmit}>
          <h3>Reporting officer assessment (RO tier)</h3>
          <label htmlFor="apar-ro-grade">Grade</label>
          <input autoComplete="off" id="apar-ro-grade" name="grade" onChange={(event) => setGrade(event.target.value)} type="text" value={grade} />
          <label htmlFor="apar-ro-narrative">Narrative</label>
          <textarea id="apar-ro-narrative" name="narrative" onChange={(event) => setNarrative(event.target.value)} rows={3} value={narrative} />
          <button disabled={reportingPhase.kind === "submitting"} type="submit">
            {reportingPhase.kind === "submitting" ? "Recording assessment…" : "Record reporting assessment"}
          </button>
          {reportingValidation ? <p role="alert">{reportingValidation}</p> : null}
          {reportingPhase.kind === "error" ? (
            <p role="alert">
              Reporting assessment failed with error code {reportingPhase.errorCode}: {reportingPhase.message}
            </p>
          ) : null}
          {reportingPhase.kind === "success" ? (
            <p role="status">
              Form {reportingPhase.form.formNo} assessed; status is now {reportingPhase.form.status}.
            </p>
          ) : null}
        </form>
      ) : null}

      {canReview ? (
        <form aria-label="APAR reviewing officer review form" onSubmit={handleReviewSubmit}>
          <h3>Reviewing officer review (RvO tier)</h3>
          <label htmlFor="apar-rvo-concur">
            <input checked={concur} id="apar-rvo-concur" name="concur" onChange={(event) => setConcur(event.target.checked)} type="checkbox" />
            Concur with the reporting officer&apos;s assessment
          </label>
          <label htmlFor="apar-rvo-remarks">Remarks</label>
          <textarea id="apar-rvo-remarks" name="remarks" onChange={(event) => setRemarks(event.target.value)} rows={3} value={remarks} />
          <button disabled={reviewPhase.kind === "submitting"} type="submit">
            {reviewPhase.kind === "submitting" ? "Recording review…" : "Record reviewing decision"}
          </button>
          {reviewValidation ? <p role="alert">{reviewValidation}</p> : null}
          {reviewPhase.kind === "error" ? (
            <p role="alert">
              Review failed with error code {reviewPhase.errorCode}: {reviewPhase.message}
            </p>
          ) : null}
          {reviewPhase.kind === "success" ? (
            <p role="status">
              Form {reviewPhase.form.formNo} reviewed; status is now {reviewPhase.form.status}.
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
