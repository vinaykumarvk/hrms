import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PensionCaseView, PensionScheme, PensionSelfEstimateResult } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

type CasesState = { kind: "loading" } | { kind: "error"; errorCode: string } | { kind: "ready"; cases: PensionCaseView[] };

type EstimatePhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; estimate: PensionSelfEstimateResult["estimate"] }
  | { kind: "error"; errorCode: string; message: string };

const ESTIMATE_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You may only estimate your own pension benefits.",
  VALIDATION_FAILED: "The estimate request was rejected by server-side validation. Check the date and figures.",
  PRECONDITION_FAILED: "Your last-drawn pay is not yet available; supply an emoluments figure to estimate anyway.",
  NOT_FOUND: "Employee record not found.",
};

function describeEstimateError(errorCode: string): string {
  return ESTIMATE_ERROR_MESSAGES[errorCode] ?? "The estimate could not be computed.";
}

async function loadMyCases(client: HrmsClient, employeeId: string): Promise<CasesState> {
  try {
    const { items } = await client.listMyPensionCases(employeeId);
    return { kind: "ready", cases: items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyPensionEstimatePanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-estimate-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G11 self-service: "check pension/retirement projections — for employees nearing retirement,
 * view estimated benefits" (FR-G11-15). A non-binding what-if estimator
 * (POST /api/v1/pension/estimates) that never writes to a live case (AC1), plus a "My Pension
 * Cases" tracker (GET /api/v1/pension/employees/{id}/cases) for anyone who already has one.
 */
export function MyPensionEstimatePanel({ client, employeeId, refreshToken }: MyPensionEstimatePanelProps) {
  const [casesState, setCasesState] = useState<CasesState>({ kind: "loading" });
  const [scheme, setScheme] = useState<PensionScheme>("OPS");
  const [asOf, setAsOf] = useState("");
  const [qualifyingServiceMonths, setQualifyingServiceMonths] = useState("");
  const [emolumentsBaseCents, setEmolumentsBaseCents] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<EstimatePhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setCasesState({ kind: "loading" });
    void loadMyCases(client, employeeId).then((next) => {
      if (mounted) {
        setCasesState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asOf) {
      setValidationError("A projection date is required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .runMyPensionEstimate(
        {
          employeeId,
          scheme,
          asOf,
          qualifyingServiceMonths: qualifyingServiceMonths ? Number(qualifyingServiceMonths) : undefined,
          emolumentsBaseCents: emolumentsBaseCents ? Number(emolumentsBaseCents) : undefined,
        },
        crypto.randomUUID()
      )
      .then((result) => setPhase({ kind: "success", estimate: result.estimate }))
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode, message: describeEstimateError(errorCode) });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g11-my-pension-estimate-panel" aria-label="G11 my pension estimate">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G11 Pension</p>
          <h2>My Pension Projection</h2>
        </div>
      </div>
      <p>This is a non-binding, indicative estimate — it is not sanctioned and does not affect any live pension case.</p>
      <form aria-label="Pension estimate form" onSubmit={handleSubmit}>
        <label htmlFor="pension-estimate-scheme">Scheme</label>
        <select id="pension-estimate-scheme" onChange={(event) => setScheme(event.target.value as PensionScheme)} value={scheme}>
          <option value="OPS">OPS</option>
          <option value="NPS">NPS</option>
          <option value="UPS">UPS</option>
        </select>
        <label htmlFor="pension-estimate-asof">Projection date</label>
        <input id="pension-estimate-asof" onChange={(event) => setAsOf(event.target.value)} type="date" value={asOf} />
        <label htmlFor="pension-estimate-qsm">Qualifying service months (optional what-if)</label>
        <input
          autoComplete="off"
          id="pension-estimate-qsm"
          max={600}
          min={0}
          onChange={(event) => setQualifyingServiceMonths(event.target.value)}
          type="number"
          value={qualifyingServiceMonths}
        />
        <label htmlFor="pension-estimate-emoluments">Emoluments in cents (optional what-if)</label>
        <input
          autoComplete="off"
          id="pension-estimate-emoluments"
          min={1}
          onChange={(event) => setEmolumentsBaseCents(event.target.value)}
          type="number"
          value={emolumentsBaseCents}
        />
        <button disabled={submitting} type="submit">
          {submitting ? "Computing…" : "Run estimate"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          Estimate failed with error code {phase.errorCode}: {phase.message}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <p role="status">
          Non-binding estimate: {phase.estimate.benefitOutcome} — pension {(phase.estimate.pensionCents / 100).toFixed(2)} based on{" "}
          {phase.estimate.qualifyingServiceMonths} months of qualifying service.
        </p>
      ) : null}

      <h3>My Pension Cases</h3>
      {casesState.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my pension cases" detail="Fetching your pension case history." />
      ) : null}
      {casesState.kind === "error" ? (
        <OperationalState kind="error" title="Could not load pension cases" detail={`The request failed with error code ${casesState.errorCode}.`} />
      ) : null}
      {casesState.kind === "ready" && casesState.cases.length === 0 ? (
        <OperationalState kind="empty" title="No pension case yet" detail="You have no pension case on file yet." />
      ) : null}
      {casesState.kind === "ready" && casesState.cases.length > 0 ? (
        <ul className="satellite-list" aria-label="My pension cases">
          {casesState.cases.map((pensionCase) => (
            <li key={pensionCase.id}>
              <strong>{pensionCase.caseNo}</strong> ({pensionCase.scheme}) — {pensionCase.status}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
