import { HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required } from "../../lib/useForm";

/* ── Types ─────────────────────────────────────────────────── */

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; orderNo: string }
  | { kind: "error"; errorCode: string; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "Rejected by server-side validation. Check dates and org units.",
  NOT_FOUND: "Employee not found in the employee master.",
  FORBIDDEN: "Session does not carry g05.transfer.initiate permission.",
  CONFLICT: "A conflicting transfer order already exists for this employee.",
};

function describeError(code: string): string {
  return ERROR_MESSAGES[code] ?? "The transfer order could not be initiated.";
}

/* ── Component ─────────────────────────────────────────────── */

export interface TransferInitiateFormProps {
  client: HrmsClient;
  defaultEmployeeId?: string;
  onInitiated: () => void;
}

export function TransferInitiateForm({ client, defaultEmployeeId = "", onInitiated }: TransferInitiateFormProps) {
  const form = useForm({
    employeeId: { initial: defaultEmployeeId, validate: required("Employee ID is required.") },
    fromOrgUnitId: { initial: "", validate: required("From org unit is required.") },
    toOrgUnitId: {
      initial: "",
      validate: (value, all) => {
        if (!value) return "To org unit is required.";
        if (value === (all.fromOrgUnitId as string)) return "Destination must differ from source.";
        return null;
      },
    },
    orderDate: { initial: "", validate: required("Order date is required.") },
    effectiveDate: {
      initial: "",
      validate: (value, all) => {
        if (!value) return "Effective date is required.";
        if (value < (all.orderDate as string)) return "Effective date cannot be before order date.";
        return null;
      },
    },
    reason: { initial: "" },
    phase: { initial: { kind: "idle" } as SubmitPhase },
  });

  const handleFormSubmit = form.handleSubmit(async (values) => {
    form.setValue("phase", { kind: "idle" });
    try {
      const result = await client.initiateTransferOrder(
        {
          employeeId: values.employeeId.trim(),
          fromOrgUnitId: values.fromOrgUnitId.trim(),
          toOrgUnitId: values.toOrgUnitId.trim(),
          orderDate: values.orderDate,
          effectiveDate: values.effectiveDate,
          reason: values.reason.trim() || undefined,
        },
        crypto.randomUUID(),
      );
      form.setValue("phase", { kind: "success", orderNo: result.order.orderNo });
      onInitiated();
    } catch (error: unknown) {
      const code = error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR";
      form.setValue("phase", { kind: "error", errorCode: code, message: describeError(code) });
    }
  });

  const phase = form.values.phase;

  return (
    <section className="record-panel transfer-initiate-panel" aria-label="G05 initiate transfer">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfer</p>
          <h2>Initiate Transfer</h2>
        </div>
        {phase.kind === "success" && (
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {phase.orderNo}
          </span>
        )}
      </div>

      <form aria-label="Transfer initiation form" onSubmit={handleFormSubmit}>
        <FormField id="transfer-employee-id" label="Employee ID" required error={form.touched.employeeId ? form.errors.employeeId : undefined}>
          <input id="transfer-employee-id" type="text" autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.employeeId} onChange={(e) => form.setValue("employeeId", e.target.value)}
            onBlur={() => form.touchField("employeeId")} />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField id="transfer-from-org" label="From Org Unit" required error={form.touched.fromOrgUnitId ? form.errors.fromOrgUnitId : undefined}>
            <input id="transfer-from-org" type="text" autoComplete="off"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.fromOrgUnitId} onChange={(e) => form.setValue("fromOrgUnitId", e.target.value)}
              onBlur={() => form.touchField("fromOrgUnitId")} />
          </FormField>

          <FormField id="transfer-to-org" label="To Org Unit" required error={form.touched.toOrgUnitId ? form.errors.toOrgUnitId : undefined}>
            <input id="transfer-to-org" type="text" autoComplete="off"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.toOrgUnitId} onChange={(e) => form.setValue("toOrgUnitId", e.target.value)}
              onBlur={() => form.touchField("toOrgUnitId")} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField id="transfer-order-date" label="Order Date" required error={form.touched.orderDate ? form.errors.orderDate : undefined}>
            <input id="transfer-order-date" type="date"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.orderDate} onChange={(e) => form.setValue("orderDate", e.target.value)}
              onBlur={() => form.touchField("orderDate")} />
          </FormField>

          <FormField id="transfer-effective-date" label="Effective Date" required error={form.touched.effectiveDate ? form.errors.effectiveDate : undefined}>
            <input id="transfer-effective-date" type="date"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.effectiveDate} onChange={(e) => form.setValue("effectiveDate", e.target.value)}
              onBlur={() => form.touchField("effectiveDate")} />
          </FormField>
        </div>

        <FormField id="transfer-reason" label="Reason" hint="Optional">
          <input id="transfer-reason" type="text" autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.reason} onChange={(e) => form.setValue("reason", e.target.value)} />
        </FormField>

        <FormActions isSubmitting={form.isSubmitting} submitDisabled={!form.isDirty} onSubmitLabel="Initiate transfer" />

        {phase.kind === "error" && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {phase.errorCode}: {phase.message}
          </p>
        )}
        {phase.kind === "success" && (
          <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            Order {phase.orderNo} initiated. Routed for POSITION_AUTHORITY approval.
          </p>
        )}
      </form>
    </section>
  );
}
