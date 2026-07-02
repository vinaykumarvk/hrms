import { FormEvent, useState } from "react";
import { ChargeMemoInput, DisciplinaryCaseView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";

/** Terminal feedback for a G09 workbench action; validation failures never leave the browser. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; caseNo: string; stage: DisciplinaryCaseView["stage"] }
  | { kind: "error"; errorCode: string; message: string };

/** BRD G09 §9.4 domain codes rendered as readable messages — never raw stack traces. */
const G09_ERROR_MESSAGES: Record<string, string> = {
  CONFLICT: "G09_AUTHORITY_COMPETENCE: the disciplinary authority cannot be the charged employee.",
  "ERR-G09-AUTHORITY-NOT-COMPETENT": "The signing authority is not competent for this cadre/penalty class (DI-13).",
  "ERR-G09-CASE-ABATED": "Proceedings have abated on the death of the respondent (DI-26).",
  NOT_FOUND: "The charged employee or case could not be found.",
  PRECONDITION_FAILED: "The case is not at the stage this action requires (CHARGE_MEMO_SERVED ordering).",
  VALIDATION_FAILED: "The submission was rejected by server-side validation.",
  FORBIDDEN: "Your session does not carry the required g09 permission.",
};

function describeG09Error(errorCode: string): string {
  return G09_ERROR_MESSAGES[errorCode] ?? "The disciplinary action could not be completed.";
}

function toErrorPhase(error: unknown): SubmitPhase {
  const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
  return { kind: "error", errorCode, message: describeG09Error(errorCode) };
}

export interface DisciplinaryCaseWorkbenchProps {
  client: HrmsClient;
  /** Pre-filled charged employee for the demo persona; the field stays editable. */
  defaultChargedEmployeeId?: string;
}

/**
 * PH-08F G09 case workbench: complaint/case intake form, article-of-charge form,
 * and a case list with due-process stage visibility (INTAKE → CHARGE → INQUIRY_REPORT
 * → ORDER/APPEAL markers: G09_AUTHORITY_COMPETENCE, CHARGE_MEMO_SERVED, INQUIRY_REPORT,
 * MAJOR_PENALTY, APPEAL_DECIDED). The API exposes no case-list read route, so the list
 * shows the cases opened in this session, at the stage the API last returned.
 */
export function DisciplinaryCaseWorkbench({ client, defaultChargedEmployeeId = "" }: DisciplinaryCaseWorkbenchProps) {
  const [cases, setCases] = useState<DisciplinaryCaseView[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");

  // --- complaint / case intake form state ---
  const [chargedEmployeeId, setChargedEmployeeId] = useState(defaultChargedEmployeeId);
  const [disciplinaryAuthorityId, setDisciplinaryAuthorityId] = useState("");
  const [allegations, setAllegations] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [intakeValidation, setIntakeValidation] = useState<string | null>(null);
  const [intakePhase, setIntakePhase] = useState<SubmitPhase>({ kind: "idle" });

  // --- article-of-charge form state ---
  const [articles, setArticles] = useState("");
  const [servedOn, setServedOn] = useState("");
  const [chargeValidation, setChargeValidation] = useState<string | null>(null);
  const [chargePhase, setChargePhase] = useState<SubmitPhase>({ kind: "idle" });

  function upsertCase(next: DisciplinaryCaseView): void {
    setCases((current) => {
      const others = current.filter((item) => item.id !== next.id);
      return [...others, next].sort((left, right) => left.caseNo.localeCompare(right.caseNo));
    });
  }

  function handleIntakeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargedEmployeeId.trim() || !disciplinaryAuthorityId.trim()) {
      setIntakeValidation("Both the charged employee and the disciplinary authority are required.");
      return;
    }
    if (chargedEmployeeId.trim() === disciplinaryAuthorityId.trim()) {
      setIntakeValidation("The disciplinary authority cannot be the charged employee (G09_AUTHORITY_COMPETENCE).");
      return;
    }
    if (!allegations.trim()) {
      setIntakeValidation("The complaint / allegations text is required to open a case.");
      return;
    }
    setIntakeValidation(null);
    setIntakePhase({ kind: "submitting" });
    void client
      .openDisciplinaryCase(
        {
          chargedEmployeeId: chargedEmployeeId.trim(),
          disciplinaryAuthorityId: disciplinaryAuthorityId.trim(),
          allegations: allegations.trim(),
          confidential,
        },
        crypto.randomUUID()
      )
      .then((result) => {
        upsertCase(result.disciplinaryCase);
        setSelectedCaseId(result.disciplinaryCase.id);
        setIntakePhase({ kind: "success", caseNo: result.disciplinaryCase.caseNo, stage: result.disciplinaryCase.stage });
      })
      .catch((error: unknown) => setIntakePhase(toErrorPhase(error)));
  }

  function handleChargeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const articleList = articles
      .split(",")
      .map((article) => article.trim())
      .filter((article) => article.length > 0);
    if (!selectedCaseId) {
      setChargeValidation("Select the case the charge memo belongs to.");
      return;
    }
    if (articleList.length === 0) {
      setChargeValidation("At least one article of charge is required.");
      return;
    }
    if (!servedOn) {
      setChargeValidation("The served-on date is required (starts the natural-justice clock).");
      return;
    }
    setChargeValidation(null);
    setChargePhase({ kind: "submitting" });
    const input: ChargeMemoInput = { articles: articleList, servedOn };
    void client
      .serveDisciplinaryCharge(selectedCaseId, input, crypto.randomUUID())
      .then((result) => {
        upsertCase(result.disciplinaryCase);
        setChargePhase({ kind: "success", caseNo: result.disciplinaryCase.caseNo, stage: result.disciplinaryCase.stage });
      })
      .catch((error: unknown) => setChargePhase(toErrorPhase(error)));
  }

  const intakeSubmitting = intakePhase.kind === "submitting";
  const chargeSubmitting = chargePhase.kind === "submitting";

  return (
    <section className="record-panel disciplinary-workbench" aria-label="G09 disciplinary case workbench">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G09 Disciplinary</p>
          <h2>Case Workbench</h2>
        </div>
      </div>

      <form aria-label="Complaint and case intake form" onSubmit={handleIntakeSubmit}>
        <h3>Complaint / case intake</h3>
        <label htmlFor="g09-charged-employee">Charged employee id</label>
        <input
          autoComplete="off"
          id="g09-charged-employee"
          name="chargedEmployeeId"
          onChange={(event) => setChargedEmployeeId(event.target.value)}
          type="text"
          value={chargedEmployeeId}
        />
        <label htmlFor="g09-authority">Disciplinary authority id</label>
        <input
          autoComplete="off"
          id="g09-authority"
          name="disciplinaryAuthorityId"
          onChange={(event) => setDisciplinaryAuthorityId(event.target.value)}
          type="text"
          value={disciplinaryAuthorityId}
        />
        <label htmlFor="g09-allegations">Complaint / allegations</label>
        <textarea
          id="g09-allegations"
          name="allegations"
          onChange={(event) => setAllegations(event.target.value)}
          rows={3}
          value={allegations}
        />
        <label htmlFor="g09-confidential">
          <input
            checked={confidential}
            id="g09-confidential"
            name="confidential"
            onChange={(event) => setConfidential(event.target.checked)}
            type="checkbox"
          />
          Confidential (sealed routing)
        </label>
        <button disabled={intakeSubmitting} type="submit">
          {intakeSubmitting ? "Opening case…" : "Open disciplinary case"}
        </button>
      </form>
      {intakeValidation ? <p role="alert">{intakeValidation}</p> : null}
      {intakePhase.kind === "error" ? (
        <p role="alert">
          Case intake failed with error code {intakePhase.errorCode}: {intakePhase.message}
        </p>
      ) : null}
      {intakePhase.kind === "success" ? (
        <p role="status">
          Case {intakePhase.caseNo} opened at stage {intakePhase.stage} (G09_AUTHORITY_COMPETENCE verified).
        </p>
      ) : null}

      <form aria-label="Article of charge form" onSubmit={handleChargeSubmit}>
        <h3>Serve charge memo (articles of charge)</h3>
        <label htmlFor="g09-charge-case">Case</label>
        <select id="g09-charge-case" name="caseId" onChange={(event) => setSelectedCaseId(event.target.value)} value={selectedCaseId}>
          <option value="">Select a case…</option>
          {cases.map((disciplinaryCase) => (
            <option key={disciplinaryCase.id} value={disciplinaryCase.id}>
              {disciplinaryCase.caseNo} — stage {disciplinaryCase.stage}
            </option>
          ))}
        </select>
        <label htmlFor="g09-charge-articles">Articles of charge (comma-separated)</label>
        <input
          autoComplete="off"
          id="g09-charge-articles"
          name="articles"
          onChange={(event) => setArticles(event.target.value)}
          type="text"
          value={articles}
        />
        <label htmlFor="g09-charge-served-on">Served on</label>
        <input id="g09-charge-served-on" name="servedOn" onChange={(event) => setServedOn(event.target.value)} type="date" value={servedOn} />
        <button disabled={chargeSubmitting} type="submit">
          {chargeSubmitting ? "Serving charge memo…" : "Serve charge memo"}
        </button>
      </form>
      {chargeValidation ? <p role="alert">{chargeValidation}</p> : null}
      {chargePhase.kind === "error" ? (
        <p role="alert">
          Charge memo failed with error code {chargePhase.errorCode}: {chargePhase.message}
        </p>
      ) : null}
      {chargePhase.kind === "success" ? (
        <p role="status">
          Charge memo served on case {chargePhase.caseNo}; stage is now {chargePhase.stage} (CHARGE_MEMO_SERVED).
        </p>
      ) : null}

      <section aria-label="G09 case list with stage visibility">
        <h3>Cases opened this session</h3>
        {cases.length === 0 ? (
          <p data-state="empty">No cases yet — the workbench list is empty until an intake is submitted (no case-list read route exists in the API).</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Charged employee</th>
                <th scope="col">Stage</th>
                <th scope="col">Status</th>
                <th scope="col">Confidential</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((disciplinaryCase) => (
                <tr key={disciplinaryCase.id}>
                  <td>{disciplinaryCase.caseNo}</td>
                  <td>{disciplinaryCase.chargedEmployeeId}</td>
                  <td>{disciplinaryCase.stage}</td>
                  <td>{disciplinaryCase.caseStatus}</td>
                  <td>{disciplinaryCase.confidential ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
