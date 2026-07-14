import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, NomineeRecord } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee nominees satellite list. */
type NomineesState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; nominees: NomineeRecord[] };

/** Terminal feedback for the add-nominee submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; name: string }
  | { kind: "error"; errorCode: string };

async function loadNominees(client: HrmsClient, employeeId?: string): Promise<NomineesState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const nominees = await client.listEmployeeNominees(targetId);
    const active = nominees.items.filter((nominee) => nominee.status === "ACTIVE");
    return active.length === 0 ? { kind: "empty", employeeId: targetId } : { kind: "ready", employeeId: targetId, nominees: active };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeNomineesPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * G01 nominees satellite surface (FR-EPM-004): lists GET /employees/{id}/nominees and adds rows
 * through POST /employees/{id}/nominees with a fresh Idempotency-Key per attempt. The server
 * enforces the VAL-NOMINEE total-share-<=100% invariant; the client surfaces that error, not
 * duplicate the check.
 */
export function EmployeeNomineesPanel({ client, employeeId }: EmployeeNomineesPanelProps) {
  const [state, setState] = useState<NomineesState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [name, setName] = useState("");
  const [benefitType, setBenefitType] = useState("GRATUITY");
  const [sharePct, setSharePct] = useState("100");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadNominees(client, employeeId).then((next) => {
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
    if (state.kind !== "ready" && state.kind !== "empty") {
      return;
    }
    const share = Number.parseFloat(sharePct);
    if (!name.trim()) {
      setValidationError("The nominee name is required.");
      return;
    }
    if (!Number.isFinite(share) || share <= 0 || share > 100) {
      setValidationError("Share percent must be a number between 0 and 100.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmployeeNominee(state.employeeId, { name: name.trim(), benefitType, sharePct: share }, crypto.randomUUID())
      .then((result) => {
        setPhase({ kind: "success", name: result.nominee.name });
        setName("");
        setSharePct("100");
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-nominees-panel" aria-label="G01 employee nominees">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Nominees</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading nominees" detail="Fetching the employee nominee satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load nominees" detail={`The nominee list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No nominees" detail="No nominee rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee nominee rows">
          {state.nominees.map((nominee) => (
            <li key={nominee.id}>
              <strong>{nominee.name}</strong> — {nominee.benefitType}, {nominee.sharePct}%
              {nominee.isFamilyPensionRecipient ? " (family pension recipient)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add nominee form" onSubmit={handleSubmit}>
          <label htmlFor="g01-nominee-name">Name</label>
          <input autoComplete="off" id="g01-nominee-name" name="name" onChange={(event) => setName(event.target.value)} type="text" value={name} />
          <label htmlFor="g01-nominee-benefit">Benefit type</label>
          <select id="g01-nominee-benefit" name="benefitType" onChange={(event) => setBenefitType(event.target.value)} value={benefitType}>
            <option value="GRATUITY">Gratuity</option>
            <option value="PROVIDENT_FUND">Provident Fund</option>
            <option value="GROUP_INSURANCE">Group Insurance</option>
          </select>
          <label htmlFor="g01-nominee-share">Share percent</label>
          <input id="g01-nominee-share" name="sharePct" onChange={(event) => setSharePct(event.target.value)} type="number" min="1" max="100" value={sharePct} />
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add nominee"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the nominee failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Nominee {phase.name} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
