import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, MyRightsRequest } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-34C — G01 privacy / DPDP self-service console (FR-EPM-020).
 * Shows the signed-in employee's data-principal rights requests and lets them raise a new one
 * (access / correction / erasure / portability) with a mandatory detail. Canonical states.
 */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: MyRightsRequest[] };

type SubmitPhase = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; errorCode: string } | { kind: "success"; id: string };

export interface PrivacyConsoleProps {
  client: HrmsClient;
}

export function PrivacyConsole({ client }: PrivacyConsoleProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [rightType, setRightType] = useState<MyRightsRequest["rightType"]>("ACCESS");
  const [detail, setDetail] = useState<string>("");
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client
      .listMyRightsRequests()
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
    if (!detail.trim()) {
      setPhase({ kind: "error", errorCode: "DETAIL_REQUIRED" });
      return;
    }
    setPhase({ kind: "submitting" });
    try {
      const created = await client.raiseRightsRequest({ rightType, detail }, crypto.randomUUID());
      setPhase({ kind: "success", id: created.id });
      setDetail("");
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  return (
    <section aria-label="Privacy and data-rights console">
      <h3>Your data rights (DPDP)</h3>
      <form onSubmit={handleSubmit} aria-label="Raise a data-rights request">
        <label>
          Right
          <select value={rightType} onChange={(e) => setRightType(e.target.value as MyRightsRequest["rightType"])}>
            <option value="ACCESS">Access</option>
            <option value="CORRECTION">Correction</option>
            <option value="ERASURE">Erasure</option>
            <option value="PORTABILITY">Portability</option>
          </select>
        </label>
        <label>
          Detail
          <textarea required aria-required="true" value={detail} onChange={(e) => setDetail(e.target.value)} />
        </label>
        <button type="submit" disabled={phase.kind === "submitting"}>
          {phase.kind === "submitting" ? "Submitting…" : "Raise request"}
        </button>
        {phase.kind === "success" ? <p role="status">Request {phase.id} received.</p> : null}
        {phase.kind === "error" ? <p role="alert">{phase.errorCode}</p> : null}
      </form>
      {state.kind === "loading" ? <OperationalState kind="loading" title="Loading your requests" detail="Fetching your data-rights requests." /> : null}
      {state.kind === "error" ? <OperationalState kind="error" title="Could not load requests" detail={state.errorCode} /> : null}
      {state.kind === "empty" ? <OperationalState kind="empty" title="No rights requests yet" detail="You have not raised any data-rights requests." /> : null}
      {state.kind === "ready" ? (
        <ul>
          {state.rows.map((r) => (
            <li key={r.id}>{r.rightType} · {r.status} · {r.raisedOn}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
