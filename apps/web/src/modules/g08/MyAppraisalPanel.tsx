import { FormEvent, useEffect, useState } from "react";
import { AparFormView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my appraisals". */
type MyAppraisalState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; forms: AparFormView[] };

const APAR_SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You may only submit your own self-appraisal.",
  PRECONDITION_FAILED: "This form is not at the status self-appraisal submission requires.",
  VALIDATION_FAILED: "An achievements narrative is required.",
  NOT_FOUND: "The APAR form could not be found.",
};

function describeSubmitError(errorCode: string): string {
  return APAR_SUBMIT_ERROR_MESSAGES[errorCode] ?? "Self-appraisal submission could not be completed.";
}

async function loadMyAppraisals(client: HrmsClient, employeeId: string): Promise<MyAppraisalState> {
  try {
    const { items } = await client.listMyAparForms(employeeId);
    return { kind: "ready", forms: items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyAppraisalPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-forms-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G08 self-service: "submit self-appraisal — annual performance review self-assessment"
 * (FR-G08-03). Lists the appraisee's own APAR forms via
 * GET /api/v1/apar/employees/{id}/forms, and lets them submit self-appraisal directly on any
 * form still at GOALS_PENDING via POST /api/v1/apar/forms/{id}:submit-self — no manual form-id
 * entry required.
 */
export function MyAppraisalPanel({ client, employeeId, refreshToken }: MyAppraisalPanelProps) {
  const [state, setState] = useState<MyAppraisalState>({ kind: "loading" });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [narrativeById, setNarrativeById] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ formId: string; errorCode: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyAppraisals(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken, localRefresh]);

  function handleSubmitSelf(event: FormEvent<HTMLFormElement>, formId: string) {
    event.preventDefault();
    const narrative = (narrativeById[formId] ?? "").trim();
    if (!narrative) {
      setSubmitError({ formId, errorCode: "VALIDATION_FAILED" });
      return;
    }
    setSubmittingId(formId);
    setSubmitError(null);
    void client
      .submitAparSelf(formId, { narrative }, crypto.randomUUID())
      .then(() => {
        setSubmittingId(null);
        setNarrativeById((prior) => ({ ...prior, [formId]: "" }));
        setLocalRefresh((token) => token + 1);
      })
      .catch((error: unknown) => {
        setSubmittingId(null);
        setSubmitError({ formId, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  return (
    <section className="record-panel g08-my-appraisal-panel" aria-label="G08 my appraisal">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G08 APAR</p>
          <h2>My Appraisal</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my appraisal" detail="Fetching your APAR forms." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my appraisal" detail={`The APAR request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" && state.forms.length === 0 ? (
        <OperationalState kind="empty" title="No appraisal forms yet" detail="You have no APAR forms on file yet." />
      ) : null}
      {state.kind === "ready" && state.forms.length > 0 ? (
        <ul className="satellite-list" aria-label="My APAR forms">
          {state.forms.map((form) => (
            <li key={form.id}>
              <div>
                <strong>{form.formNo}</strong> ({form.periodStart} to {form.periodEnd}) — {form.status}
                {form.grade ? ` — grade ${form.grade}` : ""}
              </div>
              {form.selfAppraisalNarrative ? <p>Achievements: {form.selfAppraisalNarrative}</p> : null}
              {form.status === "GOALS_PENDING" ? (
                <form aria-label={`Submit self-appraisal for ${form.formNo}`} onSubmit={(event) => handleSubmitSelf(event, form.id)}>
                  <label htmlFor={`g08-self-narrative-${form.id}`}>Achievements narrative</label>
                  <textarea
                    id={`g08-self-narrative-${form.id}`}
                    onChange={(event) => setNarrativeById((prior) => ({ ...prior, [form.id]: event.target.value }))}
                    rows={3}
                    value={narrativeById[form.id] ?? ""}
                  />
                  <button disabled={submittingId !== null} type="submit">
                    {submittingId === form.id ? "Submitting self-appraisal…" : "Submit self-appraisal"}
                  </button>
                  {submitError?.formId === form.id ? (
                    <p role="alert">
                      Self-appraisal failed with error code {submitError.errorCode}: {describeSubmitError(submitError.errorCode)}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
