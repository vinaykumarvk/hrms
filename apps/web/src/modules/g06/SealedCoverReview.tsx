import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, SealedCoverCase } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required } from "../../lib/useForm";

/* ── Types ─────────────────────────────────────────────────── */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: SealedCoverCase[] };

type ActionPhase = { kind: "idle" } | { kind: "success" } | { kind: "error"; errorCode: string };

export interface SealedCoverReviewProps {
  client: HrmsClient;
}

/* ── Columns ───────────────────────────────────────────────── */

type SealedColumn = "employeeId" | "reason" | "status" | "action";

export function SealedCoverReview({ client }: SealedCoverReviewProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [tableState, tableCallbacks] = useDataTable<SealedColumn>();
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });

  const form = useForm({
    selectedId: { initial: "", validate: required("Select a case.") },
    reason: { initial: "", validate: required("Release reason is required.") },
  });

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client.listSealedCovers()
      .then((page) => {
        if (!live) return;
        setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", rows: page.items });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setState({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
      });
    return () => { live = false };
  }, [client, refreshToken]);

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setPhase({ kind: "idle" });
    try {
      await client.releaseSealedCover(values.selectedId, { reason: values.reason }, crypto.randomUUID());
      setPhase({ kind: "success" });
      form.reset({ reason: "" });
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  });

  const columns: DataTableColumnDef<SealedCoverCase, SealedColumn>[] = [
    {
      id: "employeeId",
      header: "Employee",
      sortable: true,
      resolve: (r) => r.employeeId,
      sortValue: (r) => r.employeeId,
      filterValue: (r) => r.employeeId,
    },
    {
      id: "reason",
      header: "Reason",
      resolve: (r) => <span className="text-xs text-gray-600 max-w-[200px] truncate block">{r.reason}</span>,
      filterValue: (r) => r.reason,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      resolve: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          r.status === "RELEASED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}>
          {r.status}
        </span>
      ),
      sortValue: (r) => r.status,
      filterValue: (r) => r.status,
    },
    {
      id: "action",
      header: "Select",
      resolve: (r) => (
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="sealed-cover-select"
            className="accent-blue-600"
            checked={form.values.selectedId === r.id}
            onChange={() => form.setValue("selectedId", r.id)}
            disabled={r.status === "RELEASED"}
          />
          <span className="text-[11px] text-gray-500">
            {r.status === "RELEASED" ? "Released" : "Select"}
          </span>
        </label>
      ),
    },
  ];

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading sealed-cover cases" detail="Fetching sealed-cover register." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load cases" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No sealed-cover cases" detail="Nothing to review right now." />;

  return (
    <section className="record-panel" aria-label="Sealed-cover review">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G06 Promotion</p>
          <h2>Sealed-cover Review</h2>
        </div>
        <span className="text-xs text-gray-500">{state.rows.length} case{state.rows.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable
        items={state.rows}
        columns={columns}
        state={tableState}
        callbacks={tableCallbacks}
        emptyMessage="No sealed-cover cases."
      />

      <form aria-label="Release sealed cover" onSubmit={handleFormSubmit} className="mt-4 border-t pt-4">
        <FormField id="sc-reason" label="Release Reason" required error={form.touched.reason ? form.errors.reason : undefined}>
          <textarea
            id="sc-reason"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-h-[80px]"
            value={form.values.reason}
            onChange={(e) => form.setValue("reason", e.target.value)}
            onBlur={() => form.touchField("reason")}
          />
        </FormField>

        <FormActions isSubmitting={form.isSubmitting} onSubmitLabel="Release sealed cover" />

        {phase.kind === "success" && <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">Sealed cover released.</p>}
        {phase.kind === "error" && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{phase.errorCode}</p>}
      </form>
    </section>
  );
}
