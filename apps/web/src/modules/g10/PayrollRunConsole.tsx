import { FormEvent, useState } from "react";
import {
  HrmsApiError,
  HrmsClient,
  PayrollRunLifecycleVerb,
  PayrollRunStatus,
  PayrollRunView,
} from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";
import { PayslipView } from "./PayslipView";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

/** The g10 state machine the console mirrors: exactly one lifecycle verb is valid per status. */
const RUN_LIFECYCLE: { verb: PayrollRunLifecycleVerb; from: PayrollRunStatus; label: string; permission: string }[] = [
  { verb: "lock-inputs", from: "OPEN", label: "Lock inputs", permission: "g10.payroll.input.lock" },
  { verb: "compute", from: "INPUT_LOCKED", label: "Compute", permission: "g10.payroll.compute" },
  { verb: "reconcile", from: "COMPUTED", label: "Reconcile", permission: "g10.payroll.reconcile" },
  { verb: "approve", from: "RECONCILED", label: "Approve", permission: "g10.payroll.approve" },
  { verb: "lock", from: "APPROVED", label: "Lock run", permission: "g10.payroll.lock" },
  { verb: "disburse", from: "LOCKED", label: "Disburse", permission: "g10.payroll.disburse" },
];

/** BRD G10 §failure-handling codes rendered as readable messages — never raw stack traces. */
const G10_ERROR_MESSAGES: Record<string, string> = {
  PRECONDITION_FAILED: "The run is not in the status this lifecycle action requires (or PAYROLL_SOD blocked the maker).",
  VALIDATION_FAILED: "The submission was rejected by server-side validation.",
  NOT_FOUND: "The payroll run or employee could not be found.",
  FORBIDDEN: "Your session does not carry the required g10 permission.",
};

type ActionPhase =
  | { kind: "idle" }
  | { kind: "submitting"; verb: string }
  | { kind: "success"; message: string }
  | { kind: "error"; errorCode: string; message: string };

function toErrorPhase(error: unknown): ActionPhase {
  const errorCode = error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR";
  return { kind: "error", errorCode, message: G10_ERROR_MESSAGES[errorCode] ?? "The payroll action could not be completed." };
}

export interface PayrollRunConsoleProps {
  client: HrmsClient;
  /** P02 permission grants from the session; write actions render disabled without their grant. */
  permissions: readonly string[];
  /** Pre-filled employee for the salary-structure form; the field stays editable. */
  defaultEmployeeId?: string;
}

/**
 * PH-09E payroll run console (BRD G10 FR-03/04/05): salary-structure capture, run
 * creation, and the full lifecycle create → lock-inputs → compute → reconcile →
 * approve → lock → disburse against the real g10 routes via the injected client.
 * Only the action valid for the selected run's status is enabled; API rejections
 * (PAYROLL_SOD, status preconditions) surface as visible error states.
 */
export function PayrollRunConsole({ client, permissions, defaultEmployeeId = "" }: PayrollRunConsoleProps) {
  const [runs, setRuns] = useState<PayrollRunView[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");

  // --- salary structure form state ---
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [basicPayRupees, setBasicPayRupees] = useState("");
  const [structureValidation, setStructureValidation] = useState<string | null>(null);
  const [structurePhase, setStructurePhase] = useState<ActionPhase>({ kind: "idle" });

  // --- run creation form state ---
  const [period, setPeriod] = useState("");
  const [createValidation, setCreateValidation] = useState<string | null>(null);
  const [createPhase, setCreatePhase] = useState<ActionPhase>({ kind: "idle" });

  // --- lifecycle action state ---
  const [actionPhase, setActionPhase] = useState<ActionPhase>({ kind: "idle" });
  const [pendingLifecycleVerb, setPendingLifecycleVerb] = useState<PayrollRunLifecycleVerb | null>(null);

  if (!permissions.includes("g10.payroll.read")) {
    return (
      <OperationalState
        kind="no-permission"
        title="No permission"
        detail="The payroll run console is hidden because the session does not carry g10.payroll.read."
      />
    );
  }

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;

  function upsertRun(next: PayrollRunView): void {
    setRuns((current) => {
      const others = current.filter((item) => item.id !== next.id);
      return [...others, next].sort((left, right) => left.id.localeCompare(right.id));
    });
    setSelectedRunId(next.id);
  }

  function handleStructureSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const basicPay = Number(basicPayRupees);
    if (!employeeId.trim() || !effectiveFrom) {
      setStructureValidation("Employee id and effective-from date are required.");
      return;
    }
    if (!Number.isFinite(basicPay) || basicPay <= 0) {
      setStructureValidation("Basic pay must be a positive amount in rupees.");
      return;
    }
    setStructureValidation(null);
    setStructurePhase({ kind: "submitting", verb: "salary-structure" });
    void client
      .createSalaryStructure(
        { employeeId: employeeId.trim(), effectiveFrom, basicPayCents: Math.round(basicPay * 100) },
        crypto.randomUUID()
      )
      .then((result) =>
        setStructurePhase({
          kind: "success",
          message: `Salary structure ${result.salaryStructure.id} recorded under rule version ${result.salaryStructure.ruleVersion}.`,
        })
      )
      .catch((error: unknown) => setStructurePhase(toErrorPhase(error)));
  }

  function handleCreateRunSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setCreateValidation("The payroll period must be a YYYY-MM month.");
      return;
    }
    setCreateValidation(null);
    setCreatePhase({ kind: "submitting", verb: "create" });
    void client
      .createPayrollRun(period, crypto.randomUUID())
      .then((result) => {
        upsertRun(result.payrollRun);
        setCreatePhase({ kind: "success", message: `Run ${result.payrollRun.id} created for ${result.payrollRun.period} (status OPEN).` });
      })
      .catch((error: unknown) => setCreatePhase(toErrorPhase(error)));
  }

  function performLifecycleAction(verb: PayrollRunLifecycleVerb) {
    if (!selectedRun) {
      return;
    }
    setActionPhase({ kind: "submitting", verb });
    void client
      .actOnPayrollRun(selectedRun.id, verb, crypto.randomUUID())
      .then((result) => {
        upsertRun(result.payrollRun);
        setActionPhase({ kind: "success", message: `Run ${result.payrollRun.id} is now ${result.payrollRun.status}.` });
      })
      .catch((error: unknown) => setActionPhase(toErrorPhase(error)));
  }

  function handleLifecycleAction(verb: PayrollRunLifecycleVerb) {
    if (["lock-inputs", "lock", "disburse"].includes(verb)) {
      setPendingLifecycleVerb(verb);
      return;
    }
    performLifecycleAction(verb);
  }

  const actionSubmitting = actionPhase.kind === "submitting";

  return (
    <section className="record-panel payroll-run-console" aria-label="G10 payroll run console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G10 Payroll</p>
          <h2>Payroll Run Console</h2>
        </div>
      </div>

      <form aria-label="Salary structure form" onSubmit={handleStructureSubmit}>
        <h3>Salary structure (compute input)</h3>
        <label htmlFor="g10-structure-employee">Employee id</label>
        <input
          autoComplete="off"
          id="g10-structure-employee"
          name="employeeId"
          onChange={(event) => setEmployeeId(event.target.value)}
          type="text"
          value={employeeId}
        />
        <label htmlFor="g10-structure-effective-from">Effective from</label>
        <input
          id="g10-structure-effective-from"
          name="effectiveFrom"
          onChange={(event) => setEffectiveFrom(event.target.value)}
          type="date"
          value={effectiveFrom}
        />
        <label htmlFor="g10-structure-basic-pay">Basic pay (₹ per month)</label>
        <input
          id="g10-structure-basic-pay"
          inputMode="decimal"
          name="basicPayRupees"
          onChange={(event) => setBasicPayRupees(event.target.value)}
          type="number"
          min="0"
          step="0.01"
          value={basicPayRupees}
        />
        <button disabled={structurePhase.kind === "submitting" || !permissions.includes("g10.salary.write")} type="submit">
          {structurePhase.kind === "submitting" ? "Recording structure…" : "Record salary structure"}
        </button>
      </form>
      {structureValidation ? <p role="alert">{structureValidation}</p> : null}
      {structurePhase.kind === "error" ? (
        <p role="alert">
          Salary structure failed with error code {structurePhase.errorCode}: {structurePhase.message}
        </p>
      ) : null}
      {structurePhase.kind === "success" ? <p role="status">{structurePhase.message}</p> : null}

      <form aria-label="Create payroll run form" onSubmit={handleCreateRunSubmit}>
        <h3>Create payroll run</h3>
        <label htmlFor="g10-run-period">Period (YYYY-MM)</label>
        <input
          autoComplete="off"
          id="g10-run-period"
          name="period"
          onChange={(event) => setPeriod(event.target.value)}
          placeholder="2026-07"
          type="text"
          value={period}
        />
        <button disabled={createPhase.kind === "submitting" || !permissions.includes("g10.payroll.run.create")} type="submit">
          {createPhase.kind === "submitting" ? "Creating run…" : "Create run"}
        </button>
      </form>
      {createValidation ? <p role="alert">{createValidation}</p> : null}
      {createPhase.kind === "error" ? (
        <p role="alert">
          Run creation failed with error code {createPhase.errorCode}: {createPhase.message}
        </p>
      ) : null}
      {createPhase.kind === "success" ? <p role="status">{createPhase.message}</p> : null}

      <section aria-label="Payroll run lifecycle">
        <h3>Run lifecycle</h3>
        {runs.length === 0 ? (
          <p data-state="empty">No payroll runs yet — create a run to start the lifecycle (no run-list read route exists in the API).</p>
        ) : (
          <>
            <label htmlFor="g10-run-select">Run</label>
            <select id="g10-run-select" name="runId" onChange={(event) => setSelectedRunId(event.target.value)} value={selectedRunId}>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} — {run.period} — {run.status}
                </option>
              ))}
            </select>
            {selectedRun ? (
              <>
                <p>
                  Status: <strong data-run-status={selectedRun.status}>{selectedRun.status}</strong>
                  {selectedRun.ruleVersionSnapshot ? ` — rule snapshot ${selectedRun.ruleVersionSnapshot}` : ""}
                  {selectedRun.bankBatch ? ` — bank batch ${selectedRun.bankBatch.id} (${selectedRun.bankBatch.marker})` : ""}
                </p>
                <div className="lifecycle-actions" role="group" aria-label="Lifecycle actions valid for the current run state">
                  {RUN_LIFECYCLE.map((action) => {
                    const validForStatus = selectedRun.status === action.from;
                    const permitted = permissions.includes(action.permission);
                    return (
                      <button
                        key={action.verb}
                        disabled={!validForStatus || !permitted || actionSubmitting}
                        onClick={() => handleLifecycleAction(action.verb)}
                        title={
                          !permitted
                            ? `Requires ${action.permission}`
                            : validForStatus
                              ? `Moves the run from ${action.from}`
                              : `Valid only when the run is ${action.from}`
                        }
                        type="button"
                      >
                        {actionSubmitting && actionPhase.kind === "submitting" && actionPhase.verb === action.verb
                          ? `${action.label}…`
                          : action.label}
                      </button>
                    );
                  })}
                </div>
                {actionPhase.kind === "submitting" ? <p data-state="loading">Submitting {actionPhase.verb}…</p> : null}
                {actionPhase.kind === "error" ? (
                  <p role="alert">
                    Lifecycle action failed with error code {actionPhase.errorCode}: {actionPhase.message}
                  </p>
                ) : null}
                {actionPhase.kind === "success" ? <p role="status">{actionPhase.message}</p> : null}
              </>
            ) : null}
          </>
        )}
      </section>

      <PayslipView client={client} run={selectedRun} />
      <Dialog
        description={pendingLifecycleVerb && selectedRun ? `${pendingLifecycleVerb} changes payroll run ${selectedRun.id} from ${selectedRun.status}. Verify the run before continuing.` : undefined}
        onOpenChange={(open) => { if (!open) setPendingLifecycleVerb(null); }}
        open={pendingLifecycleVerb !== null}
        title="Confirm payroll lifecycle action"
      >
        <div className="action-row">
          <Button type="button" variant="secondary" onClick={() => setPendingLifecycleVerb(null)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => { const verb = pendingLifecycleVerb; setPendingLifecycleVerb(null); if (verb) performLifecycleAction(verb); }}>Confirm {pendingLifecycleVerb}</Button>
        </div>
      </Dialog>
    </section>
  );
}
