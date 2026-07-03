import { FormEvent, useEffect, useState } from "react";
import { DsrRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-27A — G13 DPDP data-subject request console (FR-G13-018).
 * Lists data_subject_requests from the injected client and lets a DPO adjudicate each
 * (FULFILLED / EXEMPTED / REJECTED) with a mandatory reason. Consumes the PH-15E DSR engine.
 */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: DsrRecord[] };

type ActionPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errorCode: string };

export interface DataSubjectRequestConsoleProps {
  client: HrmsClient;
}

export function DataSubjectRequestConsole({ client }: DataSubjectRequestConsoleProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [decision, setDecision] = useState<"FULFILLED" | "EXEMPTED" | "REJECTED">("FULFILLED");
  const [reason, setReason] = useState<string>("");
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client
      .listDataSubjectRequests()
      .then((page) => {
        if (!live) return;
        setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", rows: page.items });
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
    if (!selectedId || !reason.trim()) {
      setPhase({ kind: "error", errorCode: "REASON_REQUIRED" });
      return;
    }
    setPhase({ kind: "submitting" });
    try {
      await client.adjudicateDsr(selectedId, { decision, reason }, crypto.randomUUID());
      setPhase({ kind: "idle" });
      setReason("");
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading data-subject requests" detail="Fetching the DPDP request queue." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load requests" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No open data-subject requests" detail="Nothing to adjudicate right now." />;

  return (
    <section aria-label="DPDP data-subject requests">
      <h3>DPDP data-subject requests</h3>
      <ul>
        {state.rows.map((r) => (
          <li key={r.id}>
            <label>
              <input type="radio" name="dsr" value={r.id} checked={selectedId === r.id} onChange={() => setSelectedId(r.id)} />
              {r.requestType} · subject {r.subjectEmployeeId} · {r.status}
              {r.legalBasis ? ` · basis ${r.legalBasis}` : ""}
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} aria-label="Adjudicate request">
        <label>
          Decision
          <select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            <option value="FULFILLED">FULFILLED</option>
            <option value="EXEMPTED">EXEMPTED (statutory retention / legal hold)</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label>
          Reason
          <textarea required aria-required="true" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" disabled={phase.kind === "submitting"}>
          {phase.kind === "submitting" ? "Recording…" : "Adjudicate"}
        </button>
        {phase.kind === "error" ? <p role="alert">{phase.errorCode}</p> : null}
      </form>
    </section>
  );
}
