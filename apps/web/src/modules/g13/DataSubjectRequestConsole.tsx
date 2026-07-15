import { useEffect, useState } from "react";
import { DsrRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
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
  | { kind: "ready"; rows: DsrRecord[] };

type ActionPhase = { kind: "idle" } | { kind: "success" } | { kind: "error"; errorCode: string };

export interface DataSubjectRequestConsoleProps {
  client: HrmsClient;
}

/* ── Columns ───────────────────────────────────────────────── */

type DsrColumn = "requestType" | "subjectEmployeeId" | "status" | "legalBasis" | "select";

export function DataSubjectRequestConsole({ client }: DataSubjectRequestConsoleProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [tableState, tableCallbacks] = useDataTable<DsrColumn>();
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });

  const form = useForm({
    selectedId: { initial: "", validate: required("Select a request.") },
    decision: { initial: "FULFILLED" as "FULFILLED" | "EXEMPTED" | "REJECTED" },
    reason: { initial: "", validate: required("Reason is required.") },
  });

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client.listDataSubjectRequests()
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
      await client.adjudicateDsr(values.selectedId, { decision: values.decision, reason: values.reason }, crypto.randomUUID());
      setPhase({ kind: "success" });
      form.reset({ reason: "" });
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setPhase({ kind: "error", errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN" });
    }
  });

  const columns: DataTableColumnDef<DsrRecord, DsrColumn>[] = [
    {
      id: "requestType",
      header: "Request",
      sortable: true,
      resolve: (r) => (
        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          {r.requestType}
        </span>
      ),
      sortValue: (r) => r.requestType,
      filterValue: (r) => r.requestType,
    },
    {
      id: "subjectEmployeeId",
      header: "Subject",
      resolve: (r) => r.subjectEmployeeId,
      sortValue: (r) => r.subjectEmployeeId,
      filterValue: (r) => r.subjectEmployeeId,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      resolve: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          r.status === "FULFILLED" ? "bg-green-50 text-green-700"
            : r.status === "REJECTED" ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700"
        }`}>
          {r.status}
        </span>
      ),
      sortValue: (r) => r.status,
      filterValue: (r) => r.status,
    },
    {
      id: "legalBasis",
      header: "Basis",
      resolve: (r) => r.legalBasis ? (
        <span className="text-xs text-gray-600">{r.legalBasis}</span>
      ) : <span className="text-xs text-gray-400">—</span>,
      filterValue: (r) => r.legalBasis ?? "",
    },
    {
      id: "select",
      header: "Select",
      resolve: (r) => (
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio" name="dsr-select" className="accent-blue-600"
            checked={form.values.selectedId === r.id}
            onChange={() => form.setValue("selectedId", r.id)}
            disabled={r.status !== "UNDER_REVIEW" && r.status !== "RECEIVED"}
          />
        </label>
      ),
    },
  ];

  if (state.kind === "loading") return <OperationalState kind="loading" title="Loading requests" detail="Fetching DPDP request queue." />;
  if (state.kind === "error") return <OperationalState kind="error" title="Could not load requests" detail={state.errorCode} />;
  if (state.kind === "empty") return <OperationalState kind="empty" title="No open requests" detail="Nothing to adjudicate." />;

  return (
    <section className="record-panel" aria-label="DPDP data-subject requests">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G13 DSR</p>
          <h2>Data Subject Requests</h2>
        </div>
        <span className="text-xs text-gray-500">{state.rows.length} request{state.rows.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable items={state.rows} columns={columns} state={tableState} callbacks={tableCallbacks} emptyMessage="No requests." />

      <form aria-label="Adjudicate request" onSubmit={handleFormSubmit} className="mt-4 border-t pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="dsr-decision" label="Decision">
            <select
              id="dsr-decision"
              className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.decision}
              onChange={(e) => form.setValue("decision", e.target.value as typeof form.values.decision)}
            >
              <option value="FULFILLED">FULFILLED</option>
              <option value="EXEMPTED">EXEMPTED (legal hold / retention)</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </FormField>

          <FormField id="dsr-reason" label="Reason" required error={form.touched.reason ? form.errors.reason : undefined}>
            <textarea
              id="dsr-reason"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-h-[64px]"
              value={form.values.reason}
              onChange={(e) => form.setValue("reason", e.target.value)}
              onBlur={() => form.touchField("reason")}
            />
          </FormField>
        </div>

        <FormActions isSubmitting={form.isSubmitting} onSubmitLabel="Adjudicate" />

        {phase.kind === "success" && <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">Request adjudicated.</p>}
        {phase.kind === "error" && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{phase.errorCode}</p>}
      </form>
    </section>
  );
}
