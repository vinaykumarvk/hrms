import { FormEvent, useEffect, useState } from "react";
import { EmployeeDependentRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee dependents satellite list. */
type DependentsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; dependents: EmployeeDependentRecord[] };

/** Terminal feedback for the add-dependent submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; fullName: string }
  | { kind: "error"; errorCode: string };

const RELATIONSHIPS: EmployeeDependentRecord["relationship"][] = [
  "SPOUSE",
  "SON",
  "DAUGHTER",
  "FATHER",
  "MOTHER",
  "BROTHER",
  "SISTER",
  "GUARDIAN",
  "OTHER",
];

async function loadDependents(client: HrmsClient, employeeId?: string): Promise<DependentsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const dependents = await client.listEmployeeDependents(targetId);
    return dependents.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, dependents: dependents.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeDependentsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * PH-07E G01 dependents satellite surface: lists GET /employees/{id}/dependents and adds rows
 * through POST /employees/{id}/dependents (PH-07A route). The dependent national id renders only
 * as the server-masked value; nothing is unmasked client-side.
 */
export function EmployeeDependentsPanel({ client, employeeId }: EmployeeDependentsPanelProps) {
  const [state, setState] = useState<DependentsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState<EmployeeDependentRecord["relationship"]>("SPOUSE");
  const [dob, setDob] = useState("");
  const [isLegalHeir, setIsLegalHeir] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDependents(client, employeeId).then((next) => {
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
    if (!fullName.trim()) {
      setValidationError("The dependent full name is required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addEmployeeDependent(
        state.employeeId,
        { fullName: fullName.trim(), relationship, dob: dob || undefined, isLegalHeir },
        crypto.randomUUID()
      )
      .then((result) => {
        setPhase({ kind: "success", fullName: result.dependent.fullName });
        setFullName("");
        setDob("");
        setIsLegalHeir(false);
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-dependents-panel" aria-label="G01 employee dependents">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Dependents</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading dependents" detail="Fetching the employee dependent satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState
          kind="error"
          title="Could not load dependents"
          detail={`The dependent list failed with error code ${state.errorCode}.`}
        />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No dependents" detail="No dependent rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee dependent rows">
          {state.dependents.map((dependent) => (
            <li key={dependent.id}>
              <strong>{dependent.fullName}</strong> ({dependent.relationship})
              {dependent.isLegalHeir ? " — legal heir" : ""}
              {dependent.nationalIdMasked ? ` — id ${dependent.nationalIdMasked}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add dependent form" onSubmit={handleSubmit}>
          <label htmlFor="g01-dependent-name">Full name</label>
          <input
            autoComplete="off"
            id="g01-dependent-name"
            name="fullName"
            onChange={(event) => setFullName(event.target.value)}
            type="text"
            value={fullName}
          />
          <label htmlFor="g01-dependent-relationship">Relationship</label>
          <select
            id="g01-dependent-relationship"
            name="relationship"
            onChange={(event) => setRelationship(event.target.value as EmployeeDependentRecord["relationship"])}
            value={relationship}
          >
            {RELATIONSHIPS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label htmlFor="g01-dependent-dob">Date of birth (optional)</label>
          <input id="g01-dependent-dob" name="dob" onChange={(event) => setDob(event.target.value)} type="date" value={dob} />
          <label htmlFor="g01-dependent-heir">
            <input
              checked={isLegalHeir}
              id="g01-dependent-heir"
              name="isLegalHeir"
              onChange={(event) => setIsLegalHeir(event.target.checked)}
              type="checkbox"
            />
            Legal heir
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add dependent"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the dependent failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Dependent {phase.fullName} added and recorded in the attribute history.</p> : null}
    </section>
  );
}
