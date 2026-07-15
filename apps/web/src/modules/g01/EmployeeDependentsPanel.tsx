import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmployeeDependentRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { DataTable, DataTableColumnDef } from "../../components/ui/DataTable";
import { useForm, required } from "../../lib/useForm";
import { useDataTable } from "../../lib/useDataTable";
import { FormField, FormActions } from "../../components/ui/Form";

/* ── Types ─────────────────────────────────────────────────── */

type DependentsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; dependents: EmployeeDependentRecord[] };

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; fullName: string }
  | { kind: "error"; errorCode: string };

const RELATIONSHIPS: EmployeeDependentRecord["relationship"][] = [
  "SPOUSE", "SON", "DAUGHTER", "FATHER", "MOTHER",
  "BROTHER", "SISTER", "GUARDIAN", "OTHER",
];

/* ── Columns ───────────────────────────────────────────────── */

type DependentColumn = "name" | "relationship" | "heir" | "dob";

const DEPENDENT_COLUMNS: DataTableColumnDef<EmployeeDependentRecord, DependentColumn>[] = [
  {
    id: "name",
    header: "Name",
    sortable: true,
    resolve: (d) => <span className="font-medium">{d.fullName}</span>,
    sortValue: (d) => d.fullName,
    filterValue: (d) => d.fullName,
  },
  {
    id: "relationship",
    header: "Relationship",
    sortable: true,
    resolve: (d) => (
      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
        {d.relationship}
      </span>
    ),
    sortValue: (d) => d.relationship,
    filterValue: (d) => d.relationship,
  },
  {
    id: "heir",
    header: "Heir",
    resolve: (d) => (d.isLegalHeir ? "✓" : "—"),
    sortValue: (d) => (d.isLegalHeir ? 1 : 0),
    filterValue: (d) => (d.isLegalHeir ? "yes" : "no"),
    className: "text-center",
  },
  {
    id: "dob",
    header: "Date of Birth",
    resolve: (d) => (d.dob ?? "—"),
    sortValue: (d) => d.dob ?? "",
    filterValue: (d) => d.dob ?? "",
  },
];

const FILTER_COLS = [
  { id: "name", label: "Name", type: "text" as const },
  { id: "relationship", label: "Relationship", type: "text" as const },
];

/* ── Loader ────────────────────────────────────────────────── */

async function loadDependents(client: HrmsClient, employeeId?: string): Promise<DependentsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) return { kind: "error", errorCode: "NOT_FOUND" };
    const dependents = await client.listEmployeeDependents(targetId);
    return dependents.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, dependents: dependents.items };
  } catch (error) {
    return {
      kind: "error",
      errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR",
    };
  }
}

/* ── Component ─────────────────────────────────────────────── */

export interface EmployeeDependentsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

export function EmployeeDependentsPanel({ client, employeeId }: EmployeeDependentsPanelProps) {
  const [state, setState] = useState<DependentsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [tableState, tableCallbacks] = useDataTable<DependentColumn>();

  const form = useForm({
    fullName: { initial: "", validate: required("Full name is required.") },
    relationship: { initial: "SPOUSE" as EmployeeDependentRecord["relationship"] },
    dob: { initial: "" },
    isLegalHeir: { initial: false },
  });

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadDependents(client, employeeId).then((next) => {
      if (mounted) setState(next);
    });
    return () => { mounted = false };
  }, [client, employeeId, refreshToken]);

  const handleFormSubmit = form.handleSubmit(async (values) => {
    if (state.kind !== "ready" && state.kind !== "empty") return;
    setSubmitPhase({ kind: "idle" });
    try {
      const result = await client.addEmployeeDependent(
        state.employeeId,
        {
          fullName: values.fullName.trim(),
          relationship: values.relationship,
          dob: values.dob || undefined,
          isLegalHeir: values.isLegalHeir,
        },
        crypto.randomUUID(),
      );
      setSubmitPhase({ kind: "success", fullName: result.dependent.fullName });
      form.reset({ fullName: "", dob: "", isLegalHeir: false });
      setRefreshToken((t) => t + 1);
    } catch (error: unknown) {
      setSubmitPhase({
        kind: "error",
        errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR",
      });
    }
  });

  const dependents = state.kind === "ready" ? state.dependents : [];

  return (
    <section className="record-panel g01-dependents-panel" aria-label="G01 employee dependents">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Dependents</h2>
        </div>
        {state.kind === "ready" && (
          <span className="text-xs text-gray-500">
            {dependents.length} dependent{dependents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading dependents" detail="Fetching employee dependent satellite rows." />
      ) : state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load dependents" detail={`Error code ${state.errorCode}.`} />
      ) : state.kind === "empty" ? (
        <OperationalState kind="empty" title="No dependents" detail="No dependent rows recorded for this employee yet." />
      ) : (
        <DataTable
          items={dependents}
          columns={DEPENDENT_COLUMNS}
          state={tableState}
          callbacks={tableCallbacks}
          filterColumns={FILTER_COLS}
          emptyMessage="No dependents recorded."
          filteredEmptyMessage="No dependents match the current filters."
        />
      )}

      {(state.kind === "ready" || state.kind === "empty") && (
        <form aria-label="Add dependent form" onSubmit={handleFormSubmit}>
          <FormField
            id="g01-dependent-name"
            label="Full Name"
            required
            error={form.touched.fullName ? form.errors.fullName : undefined}
          >
            <input
              id="g01-dependent-name"
              type="text"
              autoComplete="off"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.fullName}
              onChange={(e) => form.setValue("fullName", e.target.value)}
              onBlur={() => form.touchField("fullName")}
            />
          </FormField>

          <FormField id="g01-dependent-relationship" label="Relationship">
            <select
              id="g01-dependent-relationship"
              className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.relationship}
              onChange={(e) => form.setValue("relationship", e.target.value as EmployeeDependentRecord["relationship"])}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FormField>

          <FormField id="g01-dependent-dob" label="Date of Birth" hint="Optional">
            <input
              id="g01-dependent-dob"
              type="date"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.dob}
              onChange={(e) => form.setValue("dob", e.target.value)}
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="rounded accent-blue-600"
              checked={form.values.isLegalHeir}
              onChange={(e) => form.setValue("isLegalHeir", e.target.checked)}
            />
            Legal heir
          </label>

          <FormActions
            isSubmitting={form.isSubmitting}
            submitDisabled={!form.isDirty}
            onSubmitLabel="Add dependent"
          />

          {submitPhase.kind === "error" && (
            <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              Failed — {submitPhase.errorCode}
            </p>
          )}
          {submitPhase.kind === "success" && (
            <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
              {submitPhase.fullName} added.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
