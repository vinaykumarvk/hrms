import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, TrainingNominationView, TrainingSessionView } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "browse available programs" + "track my nominations/completion". */
type MyTrainingState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; sessions: TrainingSessionView[]; nominations: TrainingNominationView[] };

async function loadMyTraining(client: HrmsClient, employeeId: string): Promise<MyTrainingState> {
  try {
    const [{ items: sessions }, { items: nominations }] = await Promise.all([
      client.listTrainingSessions(),
      client.listMyTrainingNominations(employeeId),
    ]);
    return { kind: "ready", sessions, nominations };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyTrainingPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (nominations are self-or-manager scoped server-side). */
  employeeId: string;
  /** Bump to refetch after a new nomination is submitted elsewhere on the page. */
  refreshToken: number;
}

/**
 * G07 self-service: "browse available programs" (FR-G07-007 catalog, read-only here) and "track
 * completion" (FR-G07-009/010 — my own nominations with their approval/waitlist/completion
 * status) via GET /api/v1/training/sessions and GET /api/v1/training/employees/{id}/nominations.
 */
export function MyTrainingPanel({ client, employeeId, refreshToken }: MyTrainingPanelProps) {
  const [state, setState] = useState<MyTrainingState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyTraining(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  return (
    <section className="record-panel g07-my-training-panel" aria-label="G07 my training">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G07 Training</p>
          <h2>My Training</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading training" detail="Fetching available sessions and your nomination history." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load training" detail={`The training request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" ? (
        <>
          <h3>Available Programs</h3>
          {state.sessions.length === 0 ? (
            <OperationalState kind="empty" title="No sessions open" detail="No training sessions are currently available to browse." />
          ) : (
            <ul className="satellite-list" aria-label="Available training sessions">
              {state.sessions.map((session) => (
                <li key={session.id}>
                  <strong>{session.title}</strong> ({session.programCode}) — {session.status}, {session.enrolled}/{session.capacity} seats — id:{" "}
                  {session.id}
                </li>
              ))}
            </ul>
          )}
          <h3>My Nominations</h3>
          {state.nominations.length === 0 ? (
            <OperationalState kind="empty" title="No nominations yet" detail="You have no training nominations on file yet." />
          ) : (
            <ul className="satellite-list" aria-label="My training nominations">
              {state.nominations.map((nomination) => (
                <li key={nomination.id}>
                  <strong>{nomination.nominationNo}</strong> — {nomination.status}
                  {nomination.status === "WAITLISTED" ? ` (position ${nomination.waitlistPosition ?? "?"})` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
