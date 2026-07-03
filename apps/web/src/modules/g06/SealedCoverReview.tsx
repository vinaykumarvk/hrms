import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, SealedCoverCase } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-34B — G06 sealed-cover review console (FR-008).
 * Lists sealed-cover promotion cases and lets the reviewing authority release one with a mandatory
 * reason, consuming the PH-08C sealed-cover engine. Canonical loading/error/empty states.
 */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: SealedCoverCase[] };

type ActionPhase = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; errorCode: string };

export interface SealedCoverReviewProps {
  client: HrmsClient;
}

export function SealedCoverReview({ client }: SealedCoverReviewProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client
      .listSealedCovers()
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
      await client.releaseSealedCover(selectedId, { reason }, crypto.randomUUID());
      setPhase({ kind: "idle" });
      setReason("");
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading sealed-cover cases" detail="Fetching the sealed-cover register." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load cases" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No sealed-cover cases" detail="Nothing to review right now." />;

  return (
    <section aria-label="Sealed-cover review">
      <h3>Sealed-cover review</h3>
      <ul>
        {state.rows.map((r) => (
          <li key={r.id}>
            <label>
              <input type="radio" name="sc" value={r.id} checked={selectedId === r.id} onChange={() => setSelectedId(r.id)} disabled={r.status === "RELEASED"} />
              {r.employeeId} · {r.reason} · {r.status}
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} aria-label="Release sealed cover">
        <label>
          Release reason
          <textarea required aria-required="true" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" disabled={phase.kind === "submitting"}>
          {phase.kind === "submitting" ? "Releasing…" : "Release sealed cover"}
        </button>
        {phase.kind === "error" ? <p role="alert">{phase.errorCode}</p> : null}
      </form>
    </section>
  );
}
