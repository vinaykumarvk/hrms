import { useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, LeaveTypeOption } from "../../api/hrmsClient";
import { FormField, FormActions } from "../../components/ui/Form";
import { useForm, required } from "../../lib/useForm";

/* ── Submit phase ──────────────────────────────────────────── */

type SubmitPhase =
  | { kind: "idle" }
  | { kind: "success"; applicationNo: string; balanceAvailable: number }
  | { kind: "error"; errorCode: string; message: string };

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  LEAVE_OVERLAP: "The requested dates overlap an existing leave application.",
  INSUFFICIENT_BALANCE: "Available leave balance is less than the requested spell.",
  ENTITLEMENT_EXCEEDED: "Requested spell exceeds the sanctioned entitlement.",
  VALIDATION_FAILED: "Server-side validation rejected. Check dates and try again.",
  FORBIDDEN: "Your session does not carry g03.leave.submit permission.",
};

function describeSubmitError(code: string): string {
  return SUBMIT_ERROR_MESSAGES[code] ?? "The leave application could not be submitted.";
}

/* ── Leave types state ─────────────────────────────────────── */

type LeaveTypesState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; options: LeaveTypeOption[] };

export interface LeaveApplyFormProps {
  client: HrmsClient;
  defaultEmployeeId?: string;
  onSubmitted: () => void;
}

/**
 * G03 leave application form using useForm for validation and state management.
 */
export function LeaveApplyForm({ client, defaultEmployeeId = "", onSubmitted }: LeaveApplyFormProps) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypesState>({ kind: "loading" });
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>({ kind: "idle" });

  const form = useForm({
    employeeId: {
      initial: defaultEmployeeId,
      validate: required("Employee ID is required."),
    },
    leaveTypeId: { initial: "EL" },
    fromDate: {
      initial: "",
      validate: required("From date is required."),
    },
    toDate: {
      initial: "",
      validate: (value, all) => {
        if (!value) return "To date is required.";
        if (value < (all.fromDate as string)) return "To date must be on or after from date.";
        return null;
      },
    },
    reason: { initial: "" },
  });

  useEffect(() => {
    let mounted = true;
    setLeaveTypes({ kind: "loading" });
    client.listLeaveTypes()
      .then((result) => {
        if (mounted) setLeaveTypes({
          kind: "ready",
          options: result.items.filter((o) => o.status === "ACTIVE"),
        });
      })
      .catch((error: unknown) => {
        if (mounted) setLeaveTypes({
          kind: "error",
          errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR",
        });
      });
    return () => { mounted = false };
  }, [client]);

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setSubmitPhase({ kind: "idle" });
    try {
      const result = await client.submitLeaveApplication(
        {
          employeeId: values.employeeId.trim(),
          leaveTypeId: values.leaveTypeId.trim(),
          fromDate: values.fromDate,
          toDate: values.toDate,
          reason: values.reason.trim() || undefined,
        },
        crypto.randomUUID(),
      );
      setSubmitPhase({
        kind: "success",
        applicationNo: result.application.applicationNo,
        balanceAvailable: result.balance.availableBalance,
      });
      onSubmitted();
    } catch (error: unknown) {
      const code = error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR";
      setSubmitPhase({ kind: "error", errorCode: code, message: describeSubmitError(code) });
    }
  });

  return (
    <section className="record-panel leave-apply-panel" aria-label="G03 apply for leave">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G03 Leave</p>
          <h2>Apply for Leave</h2>
        </div>
        {submitPhase.kind === "success" && (
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {submitPhase.applicationNo}
          </span>
        )}
      </div>

      <form aria-label="Leave application form" onSubmit={handleFormSubmit}>
        <FormField
          id="leave-employee-id"
          label="Employee ID"
          required
          error={form.touched.employeeId ? form.errors.employeeId : undefined}
        >
          <input
            id="leave-employee-id"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.employeeId}
            onChange={(e) => form.setValue("employeeId", e.target.value)}
            onBlur={() => form.touchField("employeeId")}
          />
        </FormField>

        <FormField id="leave-type-id" label="Leave Type">
          {leaveTypes.kind === "ready" && leaveTypes.options.length > 0 ? (
            <select
              id="leave-type-id"
              className="w-full rounded-md border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.leaveTypeId}
              onChange={(e) => form.setValue("leaveTypeId", e.target.value)}
            >
              {leaveTypes.options.map((opt) => (
                <option key={opt.leaveTypeId} value={opt.leaveTypeId}>
                  {opt.name} ({opt.leaveTypeId})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="leave-type-id"
              type="text"
              autoComplete="off"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.leaveTypeId}
              onChange={(e) => form.setValue("leaveTypeId", e.target.value)}
            />
          )}
          {leaveTypes.kind === "loading" && (
            <p className="mt-1 text-xs text-gray-500">Loading leave types…</p>
          )}
          {leaveTypes.kind === "error" && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              Could not load leave types ({leaveTypes.errorCode}). Enter code manually.
            </p>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            id="leave-from-date"
            label="From Date"
            required
            error={form.touched.fromDate ? form.errors.fromDate : undefined}
          >
            <input
              id="leave-from-date"
              type="date"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.fromDate}
              onChange={(e) => form.setValue("fromDate", e.target.value)}
              onBlur={() => form.touchField("fromDate")}
            />
          </FormField>

          <FormField
            id="leave-to-date"
            label="To Date"
            required
            error={form.touched.toDate ? form.errors.toDate : undefined}
          >
            <input
              id="leave-to-date"
              type="date"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={form.values.toDate}
              onChange={(e) => form.setValue("toDate", e.target.value)}
              onBlur={() => form.touchField("toDate")}
            />
          </FormField>
        </div>

        <FormField id="leave-reason" label="Reason" hint="Optional — helps the approver understand your request.">
          <input
            id="leave-reason"
            type="text"
            autoComplete="off"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            value={form.values.reason}
            onChange={(e) => form.setValue("reason", e.target.value)}
          />
        </FormField>

        <FormActions
          isSubmitting={form.isSubmitting}
          submitDisabled={!form.isDirty}
          onSubmitLabel="Submit application"
        />

        {submitPhase.kind === "error" && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {submitPhase.errorCode}: {submitPhase.message}
          </p>
        )}
        {submitPhase.kind === "success" && (
          <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
            Application {submitPhase.applicationNo} submitted. {submitPhase.balanceAvailable} days available.
          </p>
        )}
      </form>
    </section>
  );
}
