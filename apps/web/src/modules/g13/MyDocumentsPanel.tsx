import { useEffect, useState } from "react";
import { DocumentDownloadGrant, DocumentSummary, DocumentViewGrant, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for "my documents". */
type MyDocumentsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; documents: DocumentSummary[] };

const DOCUMENT_FETCH_ERROR_MESSAGES: Record<string, string> = {
  "ERR-G13-CLEARANCE_INSUFFICIENT": "Your security clearance is insufficient for this document's classification.",
  "ERR-G13-MALWARE_DETECTED": "This document is quarantined and cannot be opened.",
  "ERR-G13-INTEGRITY_FAILED": "This document failed an integrity check and cannot be opened.",
  PRECONDITION_FAILED: "This document is still being scanned; try again shortly.",
  NOT_FOUND: "This document is no longer available.",
  FORBIDDEN: "You may only open your own documents.",
};

function describeFetchError(errorCode: string): string {
  return DOCUMENT_FETCH_ERROR_MESSAGES[errorCode] ?? "The document could not be opened.";
}

async function loadMyDocuments(client: HrmsClient, employeeId: string): Promise<MyDocumentsState> {
  try {
    const { items } = await client.listMyDocuments(employeeId);
    return { kind: "ready", documents: items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface MyDocumentsPanelProps {
  client: HrmsClient;
  /** The logged-in session's own employee id (own-documents-only, enforced server-side). */
  employeeId: string;
  /** Bump to refetch after an external change (e.g. the shared refresh token). */
  refreshToken: number;
}

/**
 * G13 self-service: "access personal documents — payslips, certificates, ID proofs, appointment
 * letters in a secure vault". Lists only the employee's own documents via
 * GET /api/v1/documents/employees/{id}, and lets them open the intent-resolved View/Download
 * grant for any of them via GET /api/v1/documents/{id}:fetch.
 */
export function MyDocumentsPanel({ client, employeeId, refreshToken }: MyDocumentsPanelProps) {
  const [state, setState] = useState<MyDocumentsState>({ kind: "loading" });
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<{ documentId: string; errorCode: string } | null>(null);
  const [fetchResult, setFetchResult] = useState<{ documentId: string; grant: DocumentViewGrant | DocumentDownloadGrant } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadMyDocuments(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  function handleOpen(documentId: string, intent: "VIEW" | "DOWNLOAD") {
    setFetchingId(documentId);
    setFetchError(null);
    setFetchResult(null);
    void client
      .fetchDocument(documentId, intent)
      .then((result) => {
        setFetchingId(null);
        setFetchResult({ documentId, grant: result.fetch });
      })
      .catch((error: unknown) => {
        setFetchingId(null);
        setFetchError({ documentId, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  return (
    <section className="record-panel g13-my-documents-panel" aria-label="G13 my documents">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G13 Documents</p>
          <h2>My Documents</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading my documents" detail="Fetching your vault documents." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load my documents" detail={`The documents request failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "ready" && state.documents.length === 0 ? (
        <OperationalState kind="empty" title="No documents yet" detail="You have no documents in the vault yet." />
      ) : null}
      {state.kind === "ready" && state.documents.length > 0 ? (
        <ul className="satellite-list" aria-label="My documents">
          {state.documents.map((document) => (
            <li key={document.id}>
              <div>
                <strong>{document.title}</strong> ({document.docNo}) — {document.classification}
                {document.legalHold ? " — legal hold" : ""}
              </div>
              <button disabled={fetchingId !== null} onClick={() => handleOpen(document.id, "VIEW")} type="button">
                {fetchingId === document.id ? "Opening…" : "View"}
              </button>
              <button disabled={fetchingId !== null} onClick={() => handleOpen(document.id, "DOWNLOAD")} type="button">
                {fetchingId === document.id ? "Opening…" : "Download"}
              </button>
              {fetchError?.documentId === document.id ? (
                <p role="alert">
                  Could not open this document ({fetchError.errorCode}): {describeFetchError(fetchError.errorCode)}
                </p>
              ) : null}
              {fetchResult?.documentId === document.id ? (
                <p role="status">
                  {fetchResult.grant.intent === "VIEW"
                    ? `Ready to view (watermarked, expires in ${fetchResult.grant.render.expiresInSeconds}s).`
                    : `Ready to download version v${fetchResult.grant.grant.versionNo}.`}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
