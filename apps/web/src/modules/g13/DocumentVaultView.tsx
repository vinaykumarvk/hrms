import { useEffect, useState } from "react";
import { DocumentSummary, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

export type VaultViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; documents: DocumentSummary[] };

/** Loads the vault listing from GET /api/v1/documents through the injected API client. */
export async function loadDocumentVault(client: HrmsClient): Promise<VaultViewState> {
  try {
    const page = await client.listDocuments();
    return { kind: "ready", documents: page.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

export interface DocumentVaultViewProps {
  client: HrmsClient;
  /** Pre-resolved view state for tests/server rendering; the live fetch replaces it on mount. */
  initialState?: VaultViewState;
}

export function DocumentVaultView({ client, initialState }: DocumentVaultViewProps) {
  const [state, setState] = useState<VaultViewState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDocumentVault(client).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Document Vault" detail="Fetching the G13 document listing." />;
  }
  if (state.kind === "error") {
    return (
      <OperationalState
        kind="error"
        title="Could not load the Document Vault"
        detail={`The documents request failed with error code ${state.errorCode}.`}
      />
    );
  }
  if (state.documents.length === 0) {
    return <OperationalState kind="empty" title="No documents" detail="No vault documents are visible in this scope." />;
  }

  const heldCount = state.documents.filter((document) => document.legalHold).length;
  const retentionState = heldCount > 0 ? `fail-closed by legal hold (${heldCount})` : "retention policy active";

  return (
    <section className="record-panel" id="documents" aria-label="Document Vault">
      <div className="panel-heading">
        <div>
          <h2>Documents</h2>
          <p>G13 attachment, versions, legal hold, WORM, and retention state.</p>
        </div>
        <strong>{retentionState}</strong>
      </div>
      <ul className="document-list">
        {state.documents.map((document) => (
          <li key={document.id}>
            <strong>{document.title}</strong>
            <span>{document.docNo}</span>
            <em>{document.classification}</em>
            <span>version v{document.currentVersionNo}</span>
            <span>{document.legalHold ? "legal hold (fail-closed)" : "no legal hold"}</span>
            <span>{document.isWorm ? "WORM retention" : "retention policy active"}</span>
          </li>
        ))}
      </ul>
      <p className="record-note">Disposal controls remain disabled while legal hold or WORM retention is fail-closed.</p>
    </section>
  );
}
