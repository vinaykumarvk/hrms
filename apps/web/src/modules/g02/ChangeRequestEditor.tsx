import { FormEvent, useEffect } from "react";
import { HrmsApiError, HrmsClient, PersonalDetailChangeRecord } from "../../api/hrmsClient";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required, minLength } from "../../lib/useForm";

const FIELD_CODES: PersonalDetailChangeRecord["fieldCode"][] = [
  "displayName",
  "pan",
  "aadhaarMasked",
];

export interface ChangeRequestEditorProps {
  client: HrmsClient;
  onCreated: () => void;
}

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; requestNo: string; sensitivity: "LOW" | "HIGH" }
  | { kind: "error"; errorCode: string };

/**
 * G02 change-request editor using the useForm hook for validation and state.
 */
export function ChangeRequestEditor({ client, onCreated }: ChangeRequestEditorProps) {
  const form = useForm({
    employeeId: {
      initial: "",
      validate: required("Employee ID is required."),
    },
    fieldCode: { initial: "displayName" as PersonalDetailChangeRecord["fieldCode"] },
    newValue: {
      initial: "",
      validate: (v) => {
        if (!v) return "A new value is required.";
        return minLength(2)(v);
      },
    },
    reason: {
      initial: "",
      validate: required("A reason is required for every change request."),
    },
    evidenceTitle: { initial: "" },
    submitPhase: { initial: { kind: "idle" as const } as SubmitPhase },
  });

  // Prefill employee id from first visible employee
  useEffect(() => {
    let mounted = true;
    void client.listEmployees().then((employees) => {
      if (mounted && !form.values.employeeId) {
        form.setValue("employeeId", employees.items[0]?.id ?? "");
      }
    });
    return () => { mounted = false };
  }, [client]);

  const handleFormSubmit = form.handleSubmit(async (values) => {
    form.setValue("submitPhase", { kind: "idle" });
    try {
      const result = await client.createPersonalDetailChangeRequest(
        {
          employeeId: values.employeeId.trim(),
          fieldCode: values.fieldCode,
          newValue: values.newValue.trim(),
          reason: values.reason.trim(),
          evidenceTitle: values.evidenceTitle.trim() || undefined,
        },
        crypto.randomUUID(),
      );
      form.setValue("submitPhase", {
        kind: "success",
        requestNo: result.request.requestNo,
        sensitivity: result.request.sensitivity,
      });
      form.setValue("newValue", "");
      form.setValue("reason", "");
      form.setValue("evidenceTitle", "");
      onCreated();
    } catch (error: unknown) {
      form.setValue("submitPhase", {
        kind: "error",
        errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR",
      });
    }
  });

  const phase = form.values.submitPhase;

  return (
    <section className="record-panel g02-editor-panel" aria-label="G02 change-request editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>New Change Request</h2>
        </div>
        {phase.kind === "success" && (
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {phase.requestNo}
          </span>
        )}
      </div>

      <form aria-label="Change request form" onSubmit={handleFormSubmit}>
        <FormField
          id="g02-employee-id"
          label="Employee ID"
          required
          error={form.touched.employeeId ? form.errors.employeeId : undefined}
        >
          <input
            id="g02-employee-id"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.employeeId}
            onChange={(e) => form.setValue("employeeId", e.target.value)}
            onBlur={() => form.touchField("employeeId")}
          />
        </FormField>

        <FormField id="g02-field-code" label="Field to Change">
          <select
            id="g02-field-code"
            className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.fieldCode}
            onChange={(e) => form.setValue("fieldCode", e.target.value as PersonalDetailChangeRecord["fieldCode"])}
          >
            {FIELD_CODES.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </FormField>

        <FormField
          id="g02-new-value"
          label="New Value"
          required
          hint="Enter the corrected value for this field."
          error={form.touched.newValue ? form.errors.newValue : undefined}
        >
          <input
            id="g02-new-value"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.newValue}
            onChange={(e) => form.setValue("newValue", e.target.value)}
            onBlur={() => form.touchField("newValue")}
          />
        </FormField>

        <FormField
          id="g02-reason"
          label="Reason for Change"
          required
          hint="Describe why this change is needed."
          error={form.touched.reason ? form.errors.reason : undefined}
        >
          <input
            id="g02-reason"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.reason}
            onChange={(e) => form.setValue("reason", e.target.value)}
            onBlur={() => form.touchField("reason")}
          />
        </FormField>

        <FormField
          id="g02-evidence-title"
          label="Evidence Document Title"
          hint="Optional — reference any supporting documents."
        >
          <input
            id="g02-evidence-title"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.evidenceTitle}
            onChange={(e) => form.setValue("evidenceTitle", e.target.value)}
          />
        </FormField>

        <FormActions
          isSubmitting={form.isSubmitting}
          submitDisabled={!form.isDirty}
          onSubmitLabel="Submit change request"
        />

        {phase.kind === "error" && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            Change request failed — {phase.errorCode}
          </p>
        )}
        {phase.kind === "success" && (
          <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            Request {phase.requestNo} submitted ({phase.sensitivity} sensitivity).
          </p>
        )}
      </form>
    </section>
  );
}
