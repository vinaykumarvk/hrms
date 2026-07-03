import { FormEvent, useEffect, useState } from "react";
import { CounsellingSessionView, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-27B — G05 interactive counselling console (FR-G05-019).
 * Shows the current counselling session (whose turn it is + open vacancies) and lets the officer on
 * turn pick a vacancy. Consumes the PH-16D counselling turn engine (out-of-turn / full → error).
 */

type SessionState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; session: CounsellingSessionView };

type ChoicePhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; nextTurn: string | null }
  | { kind: "error"; errorCode: string };

export interface CounsellingConsoleProps {
  client: HrmsClient;
}

export function CounsellingConsole({ client }: CounsellingConsoleProps) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [employeeId, setEmployeeId] = useState<string>("");
  const [vacancyId, setVacancyId] = useState<string>("");
  const [phase, setPhase] = useState<ChoicePhase>({ kind: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client
      .getCounsellingSession()
      .then((session) => {
        if (!live) return;
        setEmployeeId(session.currentTurnEmployeeId ?? "");
        setState(session.vacancies.length === 0 ? { kind: "empty" } : { kind: "ready", session });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setState({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
      });
    return () => {
      live = false;
    };
  }, [client, refreshToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || !employeeId || !vacancyId) {
      setPhase({ kind: "error", errorCode: "INPUT_REQUIRED" });
      return;
    }
    setPhase({ kind: "submitting" });
    try {
      const result = await client.submitCounsellingChoice({ sessionId: state.session.id, employeeId, vacancyId }, crypto.randomUUID());
      setPhase({ kind: "success", nextTurn: result.nextTurnEmployeeId });
      setVacancyId("");
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading counselling session" detail="Resolving whose turn it is." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load session" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No open vacancies in this session" detail="Nothing to allot right now." />;

  return (
    <section aria-label="Transfer counselling">
      <h3>Interactive counselling</h3>
      <p>Current turn: {state.session.currentTurnEmployeeId ?? "—"}</p>
      <form onSubmit={handleSubmit} aria-label="Choose vacancy">
        <label>
          Officer (on turn)
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        </label>
        <fieldset>
          <legend>Open vacancies</legend>
          {state.session.vacancies.map((v) => (
            <label key={v.vacancyId}>
              <input type="radio" name="vacancy" value={v.vacancyId} disabled={!v.open} checked={vacancyId === v.vacancyId} onChange={() => setVacancyId(v.vacancyId)} />
              {v.postLabel} {v.open ? "" : "(filled)"}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={phase.kind === "submitting"}>
          {phase.kind === "submitting" ? "Allotting…" : "Choose vacancy"}
        </button>
        {phase.kind === "success" ? <p role="status">Allotted. Next turn: {phase.nextTurn ?? "—"}</p> : null}
        {phase.kind === "error" ? <p role="alert">{phase.errorCode}</p> : null}
      </form>
    </section>
  );
}
