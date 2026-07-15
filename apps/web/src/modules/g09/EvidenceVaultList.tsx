import { FormEvent, useState } from "react";
import { CaseEvidenceItem, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";
import { useForm } from "../../lib/useForm";
import { FormField } from "../../components/ui/Form";

/* ── Types ─────────────────────────────────────────────────── */

type VaultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; items: CaseEvidenceItem[] };

export interface EvidenceVaultListProps {
  client: HrmsClient;
}

/* ── Columns ───────────────────────────────────────────────── */

type EvidenceColumn = "artefactType" | "worm" | "legalHold" | "served";

const EVIDENCE_COLUMNS: DataTableColumnDef<CaseEvidenceItem, EvidenceColumn>[] = [
  {
    id: "artefactType",
    header: "Artefact",
    sortable: true,
    resolve: (it) => (
      <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-700">
        {it.artefactType}
      </span>
    ),
    sortValue: (it) => it.artefactType,
    filterValue: (it) => it.artefactType,
  },
  {
    id: "worm",
    header: "WORM",
    resolve: (it) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        it.isWorm ? "bg-purple-50 text-purple-700" : "bg-gray-50 text-gray-500"
      }`}>
        {it.isWorm ? "WORM" : "Mutable"}
      </span>
    ),
    sortValue: (it) => (it.isWorm ? 1 : 0),
    filterValue: (it) => (it.isWorm ? "worm" : "mutable"),
  },
  {
    id: "legalHold",
    header: "Hold",
    resolve: (it) => (
      it.legalHold ? (
        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          LEGAL HOLD
        </span>
      ) : <span className="text-xs text-gray-400">—</span>
    ),
    sortValue: (it) => (it.legalHold ? 1 : 0),
    className: "text-center",
  },
  {
    id: "served",
    header: "Served",
    resolve: (it) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        it.isServed ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
      }`}>
        {it.isServed ? "Served" : "Pending"}
      </span>
    ),
    sortValue: (it) => (it.isServed ? 1 : 0),
  },
];

/* ── Component ─────────────────────────────────────────────── */

export function EvidenceVaultList({ client }: EvidenceVaultListProps) {
  const [state, setState] = useState<VaultState>({ kind: "idle" });
  const [tableState, tableCallbacks] = useDataTable<EvidenceColumn>();
  const form = useForm({ caseId: { initial: "" } });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.values.caseId.trim()) {
      setState({ kind: "error", errorCode: "CASE_ID_REQUIRED" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const page = await client.listCaseEvidence(form.values.caseId);
      setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", items: page.items });
    } catch (err: unknown) {
      setState({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  }

  return (
    <section className="record-panel" aria-label="Disciplinary evidence vault">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G09 Evidence</p>
          <h2>Evidence Vault</h2>
        </div>
        {state.kind === "ready" && (
          <span className="text-xs text-gray-500">{state.items.length} artefact{state.items.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <form onSubmit={handleSubmit} aria-label="Load case evidence" className="flex items-end gap-3 mb-4">
        <FormField id="evidence-case-id" label="Case ID">
          <input
            id="evidence-case-id"
            type="text"
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.caseId}
            onChange={(e) => form.setValue("caseId", e.target.value)}
          />
        </FormField>
        <button
          type="submit"
          disabled={state.kind === "loading"}
          className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state.kind === "loading" ? "Loading…" : "Load evidence"}
        </button>
      </form>

      {state.kind === "idle" && (
        <p className="py-4 text-center text-sm text-gray-400">Enter a case ID and load evidence to view artefacts.</p>
      )}
      {state.kind === "loading" && (
        <OperationalState kind="loading" title="Loading evidence" detail="Fetching case artefacts." />
      )}
      {state.kind === "error" && (
        <OperationalState kind="error" title="Could not load evidence" detail={state.errorCode} />
      )}
      {state.kind === "empty" && (
        <OperationalState kind="empty" title="No artefacts" detail="The evidence vault is empty for this case." />
      )}
      {state.kind === "ready" && (
        <DataTable
          items={state.items}
          columns={EVIDENCE_COLUMNS}
          state={tableState}
          callbacks={tableCallbacks}
          emptyMessage="No evidence artefacts."
        />
      )}
    </section>
  );
}
