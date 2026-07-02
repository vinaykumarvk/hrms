import { FormEvent, useState } from "react";
import {
  HrmsApiError,
  HrmsClient,
  PensionCalculationView,
  PensionCaseView,
  PensionNpsEvent,
  PensionScheme,
} from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { formatMoneyCents } from "../g10/PayslipView";

/** BRD G11 failure-handling codes rendered as readable messages — never raw stack traces. */
const G11_ERROR_MESSAGES: Record<string, string> = {
  "ERR-G11-SCHEME-MISMATCH": "The benefit was requested under a scheme the case does not carry (FR-05 BR1) — for UPS, the opt-in flag is required.",
  PRECONDITION_FAILED: "The case has not passed the gate this action requires (SR_VERIFICATION_GATE / QUALIFYING_SERVICE_LOCKED).",
  VALIDATION_FAILED: "The submission was rejected by server-side validation.",
  NOT_FOUND: "The pension case or employee could not be found.",
  FORBIDDEN: "Your session does not carry the required g11 permission.",
};

type ActionPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; errorCode: string; message: string };

function toErrorPhase(error: unknown): ActionPhase {
  const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
  return { kind: "error", errorCode, message: G11_ERROR_MESSAGES[errorCode] ?? "The pension action could not be completed." };
}

const SCHEMES: PensionScheme[] = ["OPS", "NPS", "UPS"];
const NPS_EVENTS: PensionNpsEvent[] = ["SUPERANNUATION", "DEATH_IN_SERVICE", "INVALIDATION"];

export interface PensionCaseConsoleProps {
  client: HrmsClient;
  /** P02 permission grants from the session; write actions render disabled without their grant. */
  permissions: readonly string[];
  /** Pre-filled employee for the case form; the field stays editable. */
  defaultEmployeeId?: string;
}

/**
 * PH-09E pension case console + benefit estimator (BRD G11 FR-02/03/05): case intake
 * (scheme OPS/NPS/UPS), the SR_VERIFICATION_GATE service-verification form, and an
 * estimator form that posts to the scheme-branched compute endpoint and renders the
 * SERVER-returned figures — the browser validates inputs but never computes statutory
 * amounts itself.
 */
export function PensionCaseConsole({ client, permissions, defaultEmployeeId = "" }: PensionCaseConsoleProps) {
  const [cases, setCases] = useState<PensionCaseView[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");

  // --- case intake form state ---
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [separationDate, setSeparationDate] = useState("");
  const [scheme, setScheme] = useState<PensionScheme>("OPS");
  const [caseValidation, setCaseValidation] = useState<string | null>(null);
  const [casePhase, setCasePhase] = useState<ActionPhase>({ kind: "idle" });

  // --- service verification form state ---
  const [totalServiceMonths, setTotalServiceMonths] = useState("");
  const [penaltyExclusionMonths, setPenaltyExclusionMonths] = useState("");
  const [srCertified, setSrCertified] = useState(false);
  const [verifyValidation, setVerifyValidation] = useState<string | null>(null);
  const [verifyPhase, setVerifyPhase] = useState<ActionPhase>({ kind: "idle" });

  // --- benefit estimator form state ---
  const [estimateAsOf, setEstimateAsOf] = useState("");
  const [upsOptedIn, setUpsOptedIn] = useState(false);
  const [npsEvent, setNpsEvent] = useState<PensionNpsEvent>("SUPERANNUATION");
  const [estimatorValidation, setEstimatorValidation] = useState<string | null>(null);
  const [estimatorPhase, setEstimatorPhase] = useState<ActionPhase>({ kind: "idle" });
  const [estimate, setEstimate] = useState<PensionCalculationView | null>(null);

  if (!permissions.includes("g11.pension.read")) {
    return (
      <OperationalState
        kind="no-permission"
        title="No permission"
        detail="The pension case console is hidden because the session does not carry g11.pension.read."
      />
    );
  }

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;

  function upsertCase(next: PensionCaseView): void {
    setCases((current) => {
      const others = current.filter((item) => item.id !== next.id);
      return [...others, next].sort((left, right) => left.caseNo.localeCompare(right.caseNo));
    });
    setSelectedCaseId(next.id);
  }

  function handleCaseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId.trim() || !separationDate) {
      setCaseValidation("Employee id and separation date are required to open a pension case.");
      return;
    }
    setCaseValidation(null);
    setCasePhase({ kind: "submitting" });
    void client
      .createPensionCase({ employeeId: employeeId.trim(), separationDate, scheme }, crypto.randomUUID())
      .then((result) => {
        upsertCase(result.pensionCase);
        setCasePhase({ kind: "success", message: `Case ${result.pensionCase.caseNo} opened under ${result.pensionCase.scheme} (status DRAFT).` });
      })
      .catch((error: unknown) => setCasePhase(toErrorPhase(error)));
  }

  function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const months = Number(totalServiceMonths);
    const penalty = penaltyExclusionMonths === "" ? 0 : Number(penaltyExclusionMonths);
    if (!selectedCaseId) {
      setVerifyValidation("Select the pension case to verify.");
      return;
    }
    if (!Number.isInteger(months) || months <= 0) {
      setVerifyValidation("Total service months must be a positive whole number.");
      return;
    }
    if (!Number.isInteger(penalty) || penalty < 0) {
      setVerifyValidation("Penalty exclusion months must be a non-negative whole number.");
      return;
    }
    if (!srCertified) {
      setVerifyValidation("Service verification requires certified Service Register facts (SR_VERIFICATION_GATE).");
      return;
    }
    setVerifyValidation(null);
    setVerifyPhase({ kind: "submitting" });
    void client
      .verifyPensionService(selectedCaseId, { totalServiceMonths: months, penaltyExclusionMonths: penalty, srCertified }, crypto.randomUUID())
      .then((result) => {
        upsertCase(result.pensionCase);
        setVerifyPhase({
          kind: "success",
          message: `Case ${result.pensionCase.caseNo}: qualifying service locked at ${result.pensionCase.serviceVerification?.qualifyingServiceMonths ?? 0} months (QUALIFYING_SERVICE_LOCKED).`,
        });
      })
      .catch((error: unknown) => setVerifyPhase(toErrorPhase(error)));
  }

  function handleEstimateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase) {
      setEstimatorValidation("Select the pension case to estimate.");
      return;
    }
    if (selectedCase.scheme === "UPS" && !upsOptedIn) {
      setEstimatorValidation("A UPS assured-payout estimate requires the opt-in flag (FR-05 AC4b).");
      return;
    }
    setEstimatorValidation(null);
    setEstimatorPhase({ kind: "submitting" });
    setEstimate(null);
    void client
      .estimatePensionBenefits(
        selectedCase.id,
        {
          asOf: estimateAsOf || undefined,
          upsOptedIn: selectedCase.scheme === "UPS" ? upsOptedIn : undefined,
          npsEvent: selectedCase.scheme === "NPS" ? npsEvent : undefined,
        },
        crypto.randomUUID()
      )
      .then((result) => {
        upsertCase(result.pensionCase);
        setEstimate(result.pensionCase.calculation ?? null);
        setEstimatorPhase({
          kind: "success",
          message: `Estimate computed for case ${result.pensionCase.caseNo} under ${result.pensionCase.scheme}.`,
        });
      })
      .catch((error: unknown) => setEstimatorPhase(toErrorPhase(error)));
  }

  return (
    <section className="record-panel pension-case-console" aria-label="G11 pension case console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G11 Pension</p>
          <h2>Pension Case Console</h2>
        </div>
      </div>

      <form aria-label="Pension case intake form" onSubmit={handleCaseSubmit}>
        <h3>Open pension case</h3>
        <label htmlFor="g11-case-employee">Employee id</label>
        <input
          autoComplete="off"
          id="g11-case-employee"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <label htmlFor="g11-case-separation">Separation date</label>
        <input
          id="g11-case-separation"
          name="separationDate"
          onChange={(event) => setSeparationDate(event.target.value)}
          type="date"
          value={separationDate}
        />
        <label htmlFor="g11-case-scheme">Scheme</label>
        <select id="g11-case-scheme" name="scheme" onChange={(event) => setScheme(event.target.value as PensionScheme)} value={scheme}>
          {SCHEMES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button disabled={casePhase.kind === "submitting" || !permissions.includes("g11.case.create")} type="submit">
          {casePhase.kind === "submitting" ? "Opening case…" : "Open pension case"}
        </button>
      </form>
      {caseValidation ? <p role="alert">{caseValidation}</p> : null}
      {casePhase.kind === "error" ? (
        <p role="alert">
          Case intake failed with error code {casePhase.errorCode}: {casePhase.message}
        </p>
      ) : null}
      {casePhase.kind === "success" ? <p role="status">{casePhase.message}</p> : null}

      <section aria-label="G11 pension case list">
        <h3>Cases opened this session</h3>
        {cases.length === 0 ? (
          <p data-state="empty">No pension cases yet — open a case to start (no case-list read route exists in the API).</p>
        ) : (
          <>
            <label htmlFor="g11-case-select">Case</label>
            <select id="g11-case-select" name="caseId" onChange={(event) => setSelectedCaseId(event.target.value)} value={selectedCaseId}>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.caseNo} — {item.scheme} — {item.status}
                </option>
              ))}
            </select>
            {selectedCase ? (
              <p>
                Status: <strong data-case-status={selectedCase.status}>{selectedCase.status}</strong>
                {selectedCase.serviceVerification
                  ? ` — qualifying service ${selectedCase.serviceVerification.qualifyingServiceMonths} months (${selectedCase.serviceVerification.status})`
                  : " — service not yet verified"}
              </p>
            ) : null}
          </>
        )}
      </section>

      <form aria-label="Service verification form" onSubmit={handleVerifySubmit}>
        <h3>Verify service (SR_VERIFICATION_GATE)</h3>
        <label htmlFor="g11-verify-total">Total service months</label>
        <input
          autoComplete="off"
          id="g11-verify-total"
          inputMode="numeric"
          name="totalServiceMonths"
          onChange={(event) => setTotalServiceMonths(event.target.value)}
          type="number"
          min="1"
          step="1"
          value={totalServiceMonths}
        />
        <label htmlFor="g11-verify-penalty">Penalty exclusion months (G09)</label>
        <input
          autoComplete="off"
          id="g11-verify-penalty"
          inputMode="numeric"
          name="penaltyExclusionMonths"
          onChange={(event) => setPenaltyExclusionMonths(event.target.value)}
          type="number"
          min="0"
          step="1"
          value={penaltyExclusionMonths}
        />
        <label htmlFor="g11-verify-certified">
          <input
            checked={srCertified}
            id="g11-verify-certified"
            name="srCertified"
            onChange={(event) => setSrCertified(event.target.checked)}
            type="checkbox"
          />
          Service Register facts certified
        </label>
        <button disabled={verifyPhase.kind === "submitting" || !permissions.includes("g11.service.verify")} type="submit">
          {verifyPhase.kind === "submitting" ? "Verifying service…" : "Verify service"}
        </button>
      </form>
      {verifyValidation ? <p role="alert">{verifyValidation}</p> : null}
      {verifyPhase.kind === "error" ? (
        <p role="alert">
          Service verification failed with error code {verifyPhase.errorCode}: {verifyPhase.message}
        </p>
      ) : null}
      {verifyPhase.kind === "success" ? <p role="status">{verifyPhase.message}</p> : null}

      <form aria-label="Pension benefit estimator form" onSubmit={handleEstimateSubmit}>
        <h3>Benefit estimator (scheme-branched)</h3>
        <label htmlFor="g11-estimate-as-of">Estimate as of (defaults to the separation date)</label>
        <input id="g11-estimate-as-of" name="asOf" onChange={(event) => setEstimateAsOf(event.target.value)} type="date" value={estimateAsOf} />
        {selectedCase?.scheme === "UPS" ? (
          <label htmlFor="g11-estimate-ups-opt-in">
            <input
              checked={upsOptedIn}
              id="g11-estimate-ups-opt-in"
              name="upsOptedIn"
              onChange={(event) => setUpsOptedIn(event.target.checked)}
              type="checkbox"
            />
            UPS assured payout opted in
          </label>
        ) : null}
        {selectedCase?.scheme === "NPS" ? (
          <>
            <label htmlFor="g11-estimate-nps-event">NPS benefit event</label>
            <select
              id="g11-estimate-nps-event"
              name="npsEvent"
              onChange={(event) => setNpsEvent(event.target.value as PensionNpsEvent)}
              value={npsEvent}
            >
              {NPS_EVENTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button disabled={estimatorPhase.kind === "submitting" || !permissions.includes("g11.pension.compute")} type="submit">
          {estimatorPhase.kind === "submitting" ? "Estimating…" : "Estimate benefits"}
        </button>
      </form>
      {estimatorValidation ? <p role="alert">{estimatorValidation}</p> : null}
      {estimatorPhase.kind === "submitting" ? <p data-state="loading">Loading estimate from the pension engine…</p> : null}
      {estimatorPhase.kind === "error" ? (
        <p role="alert">
          Estimation failed with error code {estimatorPhase.errorCode}: {estimatorPhase.message}
        </p>
      ) : null}
      {estimatorPhase.kind === "success" ? <p role="status">{estimatorPhase.message}</p> : null}

      {estimate ? (
        <dl className="estimate-result" aria-label="Server-computed pension estimate">
          <div>
            <dt>Scheme</dt>
            <dd>{estimate.scheme}</dd>
          </div>
          <div>
            <dt>Benefit outcome</dt>
            <dd>{estimate.benefitOutcome}</dd>
          </div>
          <div>
            <dt>Monthly pension</dt>
            <dd>{formatMoneyCents(estimate.pensionCents)}</dd>
          </div>
          <div>
            <dt>Qualifying service</dt>
            <dd>{estimate.trace.inputs.qualifyingServiceMonths} months</dd>
          </div>
          <div>
            <dt>Rule version</dt>
            <dd>{estimate.trace.ruleVersion}</dd>
          </div>
          <div>
            <dt>Formula (server)</dt>
            <dd>{estimate.trace.formula}</dd>
          </div>
        </dl>
      ) : (
        <p data-state="empty">No estimate yet — verify service and submit the estimator form to fetch the server-computed figures.</p>
      )}
    </section>
  );
}
