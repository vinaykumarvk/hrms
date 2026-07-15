import { useEffect, useMemo, useState } from "react";
import { DocumentSummary, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";

/* ── Types ─────────────────────────────────────────────────── */

export type VaultViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; documents: DocumentSummary[] };

export async function loadDocumentVault(client: HrmsClient): Promise<VaultViewState> {
  try {
    const page = await client.listDocuments();
    return { kind: "ready", documents: page.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}

/* ── Columns ───────────────────────────────────────────────── */

type DocColumn = "docNo" | "title" | "classification" | "version" | "worm" | "legalHold";

const DOC_COLUMNS: DataTableColumnDef<DocumentSummary, DocColumn>[] = [
  {
    id: "docNo",
    header: "Doc No",
    sortable: true,
    resolve: (d) => <span className="font-mono text-xs">{d.docNo}</span>,
    sortValue: (d) => d.docNo,
    filterValue: (d) => d.docNo,
  },
  {
    id: "title",
    header: "Title",
    sortable: true,
    resolve: (d) => <span className="font-medium">{d.title}</span>,
    sortValue: (d) => d.title,
    filterValue: (d) => d.title,
  },
  {
    id: "classification",
    header: "Class",
    sortable: true,
    resolve: (d) => (
      <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
        {d.classification}
      </span>
    ),
    sortValue: (d) => d.classification,
    filterValue: (d) => d.classification,
  },
  {
    id: "version",
    header: "Ver",
    resolve: (d) => <span className="tabular-nums">v{d.currentVersionNo}</span>,
    sortValue: (d) => d.currentVersionNo,
    className: "text-center",
  },
  {
    id: "worm",
    header: "WORM",
    resolve: (d) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        d.isWorm ? "bg-purple-50 text-purple-700" : "bg-gray-50 text-gray-400"
      }`}>
        {d.isWorm ? "WORM" : "Standard"}
      </span>
    ),
    sortValue: (d) => (d.isWorm ? 1 : 0),
    className: "text-center",
  },
  {
    id: "legalHold",
    header: "Hold",
    resolve: (d) => (
      d.legalHold ? (
        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          LEGAL HOLD
        </span>
      ) : <span className="text-xs text-gray-400">—</span>
    ),
    sortValue: (d) => (d.legalHold ? 1 : 0),
    className: "text-center",
  },
];

const FILTER_COLS = [
  { id: "docNo", label: "Doc No", type: "text" as const },
  { id: "title", label: "Title", type: "text" as const },
  { id: "classification", label: "Class", type: "text" as const },
];

/* ── Component ─────────────────────────────────────────────── */

export interface DocumentVaultViewProps {
  client: HrmsClient;
  initialState?: VaultViewState;
}

export function DocumentVaultView({ client, initialState }: DocumentVaultViewProps) {
  const [state, setState] = useState<VaultViewState>(initialState ?? { kind: "loading" });
  const [tableState, tableCallbacks] = useDataTable<DocColumn>();

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDocumentVault(client).then((next) => { if (mounted) setState(next); });
    return () => { mounted = false };
  }, [client]);

  if (state.kind === "loading") {
    return <OperationalState kind="loading" title="Loading Document Vault" detail="Fetching G13 document listing." />;
  }
  if (state.kind === "error") {
    return <OperationalState kind="error" title="Could not load Document Vault" detail={`Error code ${state.errorCode}.`} />;
  }
  if (state.documents.length === 0) {
    return <OperationalState kind="empty" title="No documents" detail="No vault documents visible in this scope." />;
  }

  const heldCount = state.documents.filter((d) => d.legalHold).length;

  return (
    <section className="record-panel" id="documents" aria-label="Document Vault">
      <div className="panel-heading">
        <div>
          <h2>Documents</h2>
          <p>G13 attachment, versions, legal hold, WORM, and retention state.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-500">{state.documents.length} document{state.documents.length !== 1 ? "s" : ""}</span>
          {heldCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {heldCount} on legal hold
            </span>
          )}
        </div>
      </div>

      <DataTable
        items={state.documents}
        columns={DOC_COLUMNS}
        state={tableState}
        callbacks={tableCallbacks}
        filterColumns={FILTER_COLS}
        emptyMessage="No documents found."
      />

      <p className="mt-3 text-xs text-gray-400">
        Disposal disabled while legal hold or WORM retention is active.
      </p>
    </section>
  );
}
