import { FormEvent, useState } from "react";
import { CaseEvidenceItem, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/**
 * PH-27C — G09 disciplinary evidence-vault listing (FR-014).
 * Loads a case's evidence artefacts (WORM + legal-hold + served flags) via the injected client for
 * a supplied case id, rendering canonical loading/error/empty states.
 */

type VaultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; items: CaseEvidenceItem[] };

export interface EvidenceVaultListProps {
  client: HrmsClient;
}

export function EvidenceVaultList({ client }: EvidenceVaultListProps) {
  const [caseId, setCaseId] = useState<string>("");
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [selectedDoc, setSelectedDoc] = useState<string>("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!caseId.trim()) {
      setState({ kind: "error", errorCode: "CASE_ID_REQUIRED" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const page = await client.listCaseEvidence(caseId);
      setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", items: page.items });
    } catch (err: unknown) {
      setState({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  return (
    <section aria-label="Disciplinary evidence vault">
      <h3>Evidence vault</h3>
      <form onSubmit={handleSubmit} aria-label="Load case evidence">
        <label>
          Case id
          <input value={caseId} onChange={(e) => setCaseId(e.target.value)} />
        </label>
        <button type="submit">Load evidence</button>
      </form>
      {state.kind === "loading" ? <OperationalState kind="loading" title="Loading evidence" detail="Fetching the case artefacts." /> : null}
      {state.kind === "error" ? <OperationalState kind="error" title="Could not load evidence" detail={state.errorCode} /> : null}
      {state.kind === "empty" ? <OperationalState kind="empty" title="No artefacts for this case" detail="The evidence vault is empty for the given case id." /> : null}
      {state.kind === "ready" ? (
        <ul>
          {state.items.map((it) => (
            <li key={it.documentId}>
              <button type="button" onClick={() => setSelectedDoc(it.documentId)} aria-pressed={selectedDoc === it.documentId}>
                {it.artefactType}
              </button>
              {" · "}
              {it.isWorm ? "WORM" : "mutable"}
              {it.legalHold ? " · LEGAL HOLD" : ""}
              {it.isServed ? " · served" : " · not served"}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
