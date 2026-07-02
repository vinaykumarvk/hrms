import { FormEvent, useEffect, useState } from "react";
import { HrmsApiError, HrmsClient, PersonalDetailChangeRecord } from "../../api/hrmsClient";

/** Terminal feedback for the create-request submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; requestNo: string; sensitivity: "LOW" | "HIGH" }
  | { kind: "error"; errorCode: string };

const FIELD_CODES: PersonalDetailChangeRecord["fieldCode"][] = ["displayName", "pan", "aadhaarMasked"];

export interface ChangeRequestEditorProps {
  client: HrmsClient;
  /** Invoked after a successful create so the workspace can refresh the approver queue. */
  onCreated: () => void;
}

/**
 * PH-07E G02 change-request editor: a controlled form that POSTs
 * /api/v1/personal-details/change-requests through the injected client with a fresh
 * Idempotency-Key per attempt. Sensitivity routing stays server-side (field_sensitivity_catalog);
 * the editor only reports what the API decided.
 */
export function ChangeRequestEditor({ client, onCreated }: ChangeRequestEditorProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [fieldCode, setFieldCode] = useState<PersonalDetailChangeRecord["fieldCode"]>("displayName");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  // Prefill the employee id from the first employee visible in the caller's scope.
  useEffect(() => {
    let mounted = true;
    void client
      .listEmployees()
      .then((employees) => {
        if (mounted) {
          setEmployeeId((current) => current || (employees.items[0]?.id ?? ""));
        }
      })
      .catch(() => {
        // The field stays editable; submit-side validation reports a missing employee id.
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  function validate(): string | null {
    if (!employeeId.trim()) {
      return "Employee id is required.";
    }
    if (!newValue.trim()) {
      return "A new value is required.";
    }
    if (!reason.trim()) {
      return "A reason is required for every change request.";
    }
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .createPersonalDetailChangeRequest(
        {
          employeeId: employeeId.trim(),
          fieldCode,
          newValue: newValue.trim(),
          reason: reason.trim(),
          evidenceTitle: evidenceTitle.trim() || undefined,
        },
        crypto.randomUUID()
      )
      .then((result) => {
        setPhase({ kind: "success", requestNo: result.request.requestNo, sensitivity: result.request.sensitivity });
        setNewValue("");
        setReason("");
        setEvidenceTitle("");
        onCreated();
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g02-editor-panel" aria-label="G02 change-request editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G02 Change</p>
          <h2>New Change Request</h2>
        </div>
      </div>
      <form aria-label="Change request form" onSubmit={handleSubmit}>
        <label htmlFor="g02-employee-id">Employee id</label>
        <input
          autoComplete="off"
          id="g02-employee-id"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <label htmlFor="g02-field-code">Field</label>
        <select
          id="g02-field-code"
          name="fieldCode"
          onChange={(event) => setFieldCode(event.target.value as PersonalDetailChangeRecord["fieldCode"])}
          value={fieldCode}
        >
          {FIELD_CODES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label htmlFor="g02-new-value">New value</label>
        <input
          autoComplete="off"
          id="g02-new-value"
          name="newValue"
          onChange={(event) => setNewValue(event.target.value)}
          type="text"
          value={newValue}
        />
        <label htmlFor="g02-reason">Reason</label>
        <input autoComplete="off" id="g02-reason" name="reason" onChange={(event) => setReason(event.target.value)} type="text" value={reason} />
        <label htmlFor="g02-evidence-title">Evidence document title (optional)</label>
        <input
          autoComplete="off"
          id="g02-evidence-title"
          name="evidenceTitle"
          onChange={(event) => setEvidenceTitle(event.target.value)}
          type="text"
          value={evidenceTitle}
        />
        <button disabled={submitting} type="submit">
          {submitting ? "Submitting…" : "Submit change request"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">The change request failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? (
        <p role="status">
          Change request {phase.requestNo} submitted; the field-sensitivity catalog routed it as {phase.sensitivity}.
        </p>
      ) : null}
    </section>
  );
}
