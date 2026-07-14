import { FormEvent, useEffect, useState } from "react";
import {
  HrmsApiError,
  HrmsClient,
  MyDisciplinaryCaseView,
  PersonalHearingView,
  ShowCauseNoticeView,
} from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my disciplinary case status". */
type MyCaseState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | {
      kind: "ready";
      cases: MyDisciplinaryCaseView[];
      notices: ShowCauseNoticeView[];
      hearings: PersonalHearingView[];
    };

type ResponsePhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errorCode: string; message: string };

type HearingPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errorCode: string; message: string };

const RESPOND_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You may only respond to a show-cause notice on your own case.",
  PRECONDITION_FAILED: "This show-cause notice is not currently open for a response.",
  VALIDATION_FAILED: "A representation is required to respond.",
  NOT_FOUND: "The show-cause notice could not be found.",
};

const HEARING_ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: "You may only request a personal hearing on your own case.",
  "ERR-G09-CASE-ABATED": "This case has abated; no further action can be taken.",
  NOT_FOUND: "The case could not be found.",
};

function describeRespondError(errorCode: string): string {
  return RESPOND_ERROR_MESSAGES[errorCode] ?? "The response could not be submitted.";
}

function describeHearingError(errorCode: string): string {
  return HEARING_ERROR_MESSAGES[errorCode] ?? "The hearing request could not be submitted.";
}

async function loadMyCase(client: HrmsClient, employeeId: string): Promise<MyCaseState> {
  try {
    const { items: cases } = await client.listMyDisciplinaryCases(employeeId);
    const firstCase = cases[0];
    if (!firstCase) {
      return { kind: "ready", cases: [], notices: [], hearings: [] };
    }
    const [{ items: notices }, { items: hearings }] = await Promise.all([
      client.listMyShowCauseNotices(firstCase.id),
      client.listMyPersonalHearings(firstCase.id),
    ]);
    return { kind: "ready", cases, notices, hearings };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyDisciplinaryCasePanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-case-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G09 self-service: "view/respond to a disciplinary or vigilance case against you". Lists only
 * the employee's own case(s) (GET /api/v1/disciplinary/employees/{id}/cases), their show-cause
 * notice(s) (GET /api/v1/disciplinary/cases/{id}/show-cause-notices), and personal-hearing
 * request(s) (GET /api/v1/disciplinary/cases/{id}/personal-hearings) — all self-or-override
 * gated server-side. Lets the employee submit a representation against a pending show-cause
 * notice and request a personal hearing. Evidence/timeline are deliberately not surfaced here
 * (out of this panel's scope); the served-artefact filtering (preliminary inquiry withheld) is
 * enforced server-side regardless.
 */
export function MyDisciplinaryCasePanel({ client, employeeId, refreshToken }: MyDisciplinaryCasePanelProps) {
  const [state, setState] = useState<MyCaseState>({ kind: "loading" });
  const [localRefresh, setLocalRefresh] = useState(0);
  const [representationText, setRepresentationText] = useState("");
  const [respondPhase, setRespondPhase] = useState<ResponsePhase>({ kind: "idle" });
  const [hearingPhase, setHearingPhase] = useState<HearingPhase>({ kind: "idle" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyCase(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken, localRefresh]);

  function handleRespond(event: FormEvent<HTMLFormElement>, noticeId: string) {
    event.preventDefault();
    setRespondPhase({ kind: "submitting" });
    void client
      .respondToShowCause(noticeId, { representationText, respondedAt: new Date().toISOString().slice(0, 10) }, crypto.randomUUID())
      .then(() => {
        setRespondPhase({ kind: "idle" });
        setRepresentationText("");
        setLocalRefresh((token) => token + 1);
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setRespondPhase({ kind: "error", errorCode, message: describeRespondError(errorCode) });
      });
  }

  function handleRequestHearing(caseId: string) {
    setHearingPhase({ kind: "submitting" });
    void client
      .requestPersonalHearing(caseId, { stage: "SHOW_CAUSE", requestedOn: new Date().toISOString().slice(0, 10) }, crypto.randomUUID())
      .then(() => {
        setHearingPhase({ kind: "idle" });
        setLocalRefresh((token) => token + 1);
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
        setHearingPhase({ kind: "error", errorCode, message: describeHearingError(errorCode) });
      });
  }

  return (
    <section className="record-panel g09-my-disciplinary-case-panel" aria-label="G09 my disciplinary case">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G09 Disciplinary</p>
          <h2>My Disciplinary Case</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my case" detail="Fetching your disciplinary case status." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my case" detail={`The request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" && state.cases.length === 0 ? (
        <OperationalState kind="empty" title="No disciplinary case on file" detail="You have no disciplinary or vigilance case against you on file." />
      ) : null}

      {state.kind === "ready" && state.cases.length > 0 ? (
        <>
          <ul className="satellite-list" aria-label="My disciplinary cases">
            {state.cases.map((item) => (
              <li key={item.id}>
                <strong>{item.caseNo}</strong> — {item.stage} ({item.caseStatus})
              </li>
            ))}
          </ul>

          <h3>Show-Cause Notices</h3>
          {state.notices.length === 0 ? (
            <OperationalState kind="empty" title="No show-cause notice" detail="No show-cause notice has been served on you yet." />
          ) : (
            <ul className="satellite-list" aria-label="My show-cause notices">
              {state.notices.map((notice) => (
                <li key={notice.id}>
                  <div>
                    <strong>{notice.noticeNo}</strong> — proposed: {notice.proposedPenaltyJson.join(", ")} — due {notice.responseDueDate} —{" "}
                    {notice.status}
                  </div>
                  {notice.status === "SERVED" || notice.status === "ISSUED" ? (
                    <form aria-label="Respond to show-cause notice" onSubmit={(event) => handleRespond(event, notice.id)}>
                      <label htmlFor={`representation-${notice.id}`}>Your representation</label>
                      <textarea
                        id={`representation-${notice.id}`}
                        onChange={(event) => setRepresentationText(event.target.value)}
                        required
                        value={representationText}
                      />
                      <button disabled={respondPhase.kind === "submitting"} type="submit">
                        {respondPhase.kind === "submitting" ? "Submitting…" : "Submit response"}
                      </button>
                      {respondPhase.kind === "error" ? (
                        <p role="alert">
                          Response failed with error code {respondPhase.errorCode}: {respondPhase.message}
                        </p>
                      ) : null}
                    </form>
                  ) : notice.representationText ? (
                    <p>Your response: {notice.representationText}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3>Personal Hearing</h3>
          {state.hearings.length === 0 ? (
            <>
              <OperationalState kind="empty" title="No personal hearing requested" detail="You have not requested a personal hearing on this case." />
              <button disabled={hearingPhase.kind === "submitting"} onClick={() => handleRequestHearing(state.cases[0].id)} type="button">
                {hearingPhase.kind === "submitting" ? "Requesting…" : "Request a personal hearing"}
              </button>
              {hearingPhase.kind === "error" ? (
                <p role="alert">
                  Hearing request failed with error code {hearingPhase.errorCode}: {hearingPhase.message}
                </p>
              ) : null}
            </>
          ) : (
            <ul className="satellite-list" aria-label="My personal hearing requests">
              {state.hearings.map((hearing) => (
                <li key={hearing.id}>
                  {hearing.stage} — requested {hearing.requestedOn} — {hearing.status}
                  {hearing.status === "DENIED" && hearing.denialReason ? ` (${hearing.denialReason})` : ""}
                  {hearing.status === "GRANTED" && hearing.scheduledDate ? ` — scheduled ${hearing.scheduledDate}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
