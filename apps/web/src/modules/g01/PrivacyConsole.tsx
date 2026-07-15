import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, MyRightsRequest } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useDataTable } from "../../lib/useDataTable";
import { useForm, required } from "../../lib/useForm";
import { FormField, FormActions } from "../../components/ui/Form";

/* ── Types ─────────────────────────────────────────────────── */

type ListState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: MyRightsRequest[] };

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; id: string }
  | { kind: "error"; errorCode: string };

/* ── Columns ───────────────────────────────────────────────── */

type PrivacyColumn = "rightType" | "status" | "raisedOn";

const PRIVACY_COLUMNS: DataTableColumnDef<MyRightsRequest, PrivacyColumn>[] = [
  {
    id: "rightType",
    header: "Right",
    sortable: true,
    resolve: (r) => (
      <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
        {r.rightType}
      </span>
    ),
    sortValue: (r) => r.rightType,
    filterValue: (r) => r.rightType,
  },
  {
    id: "status",
    header: "Status",
    sortable: true,
    resolve: (r) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
          r.status === "FULFILLED"
            ? "bg-green-50 text-green-700"
            : r.status === "REJECTED"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700"
        }`}
      >
        {r.status}
      </span>
    ),
    sortValue: (r) => r.status,
    filterValue: (r) => r.status,
  },
  {
    id: "raisedOn",
    header: "Raised",
    sortable: true,
    resolve: (r) => <span className="text-xs tabular-nums">{r.raisedOn}</span>,
    sortValue: (r) => r.raisedOn,
    filterValue: (r) => r.raisedOn,
  },
];

/* ── Component ─────────────────────────────────────────────── */

export interface PrivacyConsoleProps {
  client: HrmsClient;
}

export function PrivacyConsole({ client }: PrivacyConsoleProps) {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [tableState, tableCallbacks] = useDataTable<PrivacyColumn>();

  const form = useForm({
    rightType: { initial: "ACCESS" as MyRightsRequest["rightType"] },
    detail: { initial: "", validate: required("Detail is required.") },
  });

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    client.listMyRightsRequests()
      .then((page) => {
        if (!live) return;
        setState(page.items.length === 0 ? { kind: "empty" } : { kind: "ready", rows: page.items });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN",
        });
      });
    return () => { live = false };
  }, [client, refreshToken]);

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setSubmitPhase({ kind: "idle" });
    try {
      const created = await client.raiseRightsRequest(
        { rightType: values.rightType, detail: values.detail },
        crypto.randomUUID(),
      );
      setSubmitPhase({ kind: "success", id: created.id });
      form.setValue("detail", "");
      setRefreshToken((t) => t + 1);
    } catch (err: unknown) {
      setSubmitPhase({
        kind: "error",
        errorCode: err instanceof HrmsApiError ? err.displayCode : "UNKNOWN",
      });
    }
  });

  return (
    <section className="record-panel" aria-label="Privacy and data-rights console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Privacy</p>
          <h2>Data Rights (DPDP)</h2>
        </div>
        {state.kind === "ready" && (
          <span className="text-xs text-gray-500">{state.rows.length} request{state.rows.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading requests" detail="Fetching your data-rights requests." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load requests" detail={state.errorCode} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No requests yet" detail="You have not raised any data-rights requests." />
      ) : (
        <DataTable
          items={state.rows}
          columns={PRIVACY_COLUMNS}
          state={tableState}
          callbacks={tableCallbacks}
          emptyMessage="No rights requests."
        />
      )}

      <form aria-label="Raise a data-rights request" onSubmit={handleFormSubmit} className="mt-4 border-t pt-4">
        <FormField id="privacy-right-type" label="Right">
          <select
            id="privacy-right-type"
            className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.rightType}
            onChange={(e) => form.setValue("rightType", e.target.value as MyRightsRequest["rightType"])}
          >
            <option value="ACCESS">Access</option>
            <option value="CORRECTION">Correction</option>
            <option value="ERASURE">Erasure</option>
            <option value="PORTABILITY">Portability</option>
          </select>
        </FormField>

        <FormField
          id="privacy-detail"
          label="Detail"
          required
          error={form.touched.detail ? form.errors.detail : undefined}
        >
          <textarea
            id="privacy-detail"
            required
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-h-[80px]"
            value={form.values.detail}
            onChange={(e) => form.setValue("detail", e.target.value)}
            onBlur={() => form.touchField("detail")}
          />
        </FormField>

        <FormActions
          isSubmitting={form.isSubmitting}
          submitDisabled={!form.isDirty}
          onSubmitLabel="Raise request"
        />

        {submitPhase.kind === "success" && (
          <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            Request {submitPhase.id} received.
          </p>
        )}
        {submitPhase.kind === "error" && (
          <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {submitPhase.errorCode}
          </p>
        )}
      </form>
    </section>
  );
}
