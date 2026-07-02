import { DocumentSummary } from "../../api/hrmsClient";

export interface DocumentVaultViewProps {
  documents: readonly DocumentSummary[];
  legalHold: boolean;
  retentionUntil?: string;
}

export function DocumentVaultView({ documents, legalHold, retentionUntil }: DocumentVaultViewProps) {
  const retentionState = legalHold ? "fail-closed by legal hold" : retentionUntil ? `retention until ${retentionUntil}` : "retention policy active";

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
        {documents.map((document) => (
          <li key={document.id}>
            <strong>{document.title}</strong>
            <span>{document.docNo}</span>
            <em>{document.classification}</em>
          </li>
        ))}
      </ul>
      <p className="record-note">Disposal controls remain disabled while legal hold or WORM retention is fail-closed.</p>
    </section>
  );
}
