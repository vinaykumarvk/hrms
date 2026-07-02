import { FormEvent, useState } from "react";
import { HrmsApiError, HrmsClient } from "../../api/hrmsClient";

/** Terminal feedback for the initiate action. Client-side validation failures never leave the browser. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; orderNo: string }
  | { kind: "error"; errorCode: string; message: string };

/** Named G05 error envelopes rendered to the initiator (BRD G05 FR-01 failure handling). */
const INITIATE_ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "The order was rejected by server-side validation. Check the dates and org units.",
  NOT_FOUND: "The employee could not be found in the employee master.",
  FORBIDDEN: "Your session does not carry the g05.transfer.initiate permission.",
  CONFLICT: "A conflicting transfer order already exists for this employee.",
};

function describeInitiateError(errorCode: string): string {
  return INITIATE_ERROR_MESSAGES[errorCode] ?? "The transfer order could not be initiated.";
}

export interface TransferInitiateFormProps {
  client: HrmsClient;
  /** Pre-filled employee for the demo persona; the field stays editable. */
  defaultEmployeeId?: string;
  /** Invoked after a successful initiation so the workspace can refresh the orders list. */
  onInitiated: () => void;
}

/**
 * PH-06D initiate-transfer form: controlled inputs that POST /api/v1/transfers/orders
 * through the injected client with a fresh Idempotency-Key per attempt.
 */
export function TransferInitiateForm({ client, defaultEmployeeId = "", onInitiated }: TransferInitiateFormProps) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [fromOrgUnitId, setFromOrgUnitId] = useState("");
  const [toOrgUnitId, setToOrgUnitId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });

  function validate(): string | null {
    if (!employeeId.trim()) {
      return "Employee id is required.";
    }
    if (!fromOrgUnitId.trim() || !toOrgUnitId.trim()) {
      return "Both from and to org units are required.";
    }
    if (fromOrgUnitId.trim() === toOrgUnitId.trim()) {
      return "The destination org unit must differ from the current org unit.";
    }
    if (!orderDate || !effectiveDate) {
      return "Both order and effective dates are required.";
    }
    if (effectiveDate < orderDate) {
      return "The effective date cannot be before the order date.";
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
      .initiateTransferOrder(
        {
          employeeId: employeeId.trim(),
          fromOrgUnitId: fromOrgUnitId.trim(),
          toOrgUnitId: toOrgUnitId.trim(),
          orderDate,
          effectiveDate,
          reason: reason.trim() || undefined,
        },
        crypto.randomUUID()
      )
      .then((result) => {
        setPhase({ kind: "success", orderNo: result.order.orderNo });
        onInitiated();
      })
      .catch((error: unknown) => {
        const errorCode = error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR";
        setPhase({ kind: "error", errorCode, message: describeInitiateError(errorCode) });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel transfer-initiate-panel" aria-label="G05 initiate transfer">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G05 Transfer</p>
          <h2>Initiate Transfer</h2>
        </div>
      </div>
      <form aria-label="Transfer initiation form" onSubmit={handleSubmit}>
        <label htmlFor="transfer-employee-id">Employee id</label>
        <input
          autoComplete="off"
          id="transfer-employee-id"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <label htmlFor="transfer-from-org">From org unit</label>
        <input
          autoComplete="off"
          id="transfer-from-org"
          name="fromOrgUnitId"
          onChange={(event) => setFromOrgUnitId(event.target.value)}
          type="text"
          value={fromOrgUnitId}
        />
        <label htmlFor="transfer-to-org">To org unit</label>
        <input
          autoComplete="off"
          id="transfer-to-org"
          name="toOrgUnitId"
          onChange={(event) => setToOrgUnitId(event.target.value)}
          type="text"
          value={toOrgUnitId}
        />
        <label htmlFor="transfer-order-date">Order date</label>
        <input
          id="transfer-order-date"
          name="orderDate"
          onChange={(event) => setOrderDate(event.target.value)}
          type="date"
          value={orderDate}
        />
        <label htmlFor="transfer-effective-date">Effective date</label>
        <input
          id="transfer-effective-date"
          name="effectiveDate"
          onChange={(event) => setEffectiveDate(event.target.value)}
          type="date"
          value={effectiveDate}
        />
        <label htmlFor="transfer-reason">Reason (optional)</label>
        <input
          autoComplete="off"
          id="transfer-reason"
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          type="text"
          value={reason}
        />
        <button disabled={submitting} type="submit">
          {submitting ? "Initiating…" : "Initiate transfer"}
        </button>
      </form>
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? (
        <p role="alert">
          Initiation failed with error code {phase.errorCode}: {phase.message}
        </p>
      ) : null}
      {phase.kind === "success" ? (
        <p role="status">Transfer order {phase.orderNo} initiated and routed for POSITION_AUTHORITY approval.</p>
      ) : null}
    </section>
  );
}
