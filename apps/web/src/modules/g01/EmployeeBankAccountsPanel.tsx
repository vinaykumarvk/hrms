import { FormEvent, useEffect, useState } from "react";
import { BankAccountRecord, HrmsApiError, HrmsClient } from "../../api/hrmsClient";
import { OperationalState } from "../../app/OperationalStates";

/** Canonical view state for the employee bank-accounts satellite list. */
type BankAccountsState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "empty"; employeeId: string }
  | { kind: "ready"; employeeId: string; accounts: BankAccountRecord[] };

/** Terminal feedback for the add-bank-account submit. */
type SubmitPhase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; bankName: string }
  | { kind: "error"; errorCode: string };

async function loadBankAccounts(client: HrmsClient, employeeId?: string): Promise<BankAccountsState> {
  try {
    let targetId = employeeId;
    if (!targetId) {
      const employees = await client.listEmployees();
      targetId = employees.items[0]?.id;
    }
    if (!targetId) {
      return { kind: "error", errorCode: "NOT_FOUND" };
    }
    const accounts = await client.listEmployeeBankAccounts(targetId);
    return accounts.items.length === 0
      ? { kind: "empty", employeeId: targetId }
      : { kind: "ready", employeeId: targetId, accounts: accounts.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" };
  }
}

export interface EmployeeBankAccountsPanelProps {
  client: HrmsClient;
  employeeId?: string;
}

/**
 * G01 bank-account satellite surface (FR-EPM-008): lists GET /employees/{id}/bank-accounts, adds
 * rows through POST /employees/{id}/bank-accounts (new rows start PENDING), and — for actors
 * holding g01.bank.approve — approves a PENDING account and records its penny-drop verification
 * result. The approve/penny-drop actions are hidden by permission on the server; the client just
 * lets the attempt fail closed with FORBIDDEN if the session doesn't carry the permission.
 */
export function EmployeeBankAccountsPanel({ client, employeeId }: EmployeeBankAccountsPanelProps) {
  const [state, setState] = useState<BankAccountsState>({ kind: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [bankName, setBankName] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountNumberMasked, setAccountNumberMasked] = useState("");
  const [isPrimarySalary, setIsPrimarySalary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ accountId: string; errorCode: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setState({ kind: "loading" });
    void loadBankAccounts(client, employeeId).then((next) => {
      if (mounted) {
        setState(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client, employeeId, refreshToken]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" && state.kind !== "empty") {
      return;
    }
    if (!bankName.trim() || !ifsc.trim() || !accountNumberMasked.trim()) {
      setValidationError("Bank name, IFSC, and account number are all required.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "submitting" });
    void client
      .addBankAccount(state.employeeId, { bankName: bankName.trim(), ifsc: ifsc.trim(), accountNumberMasked: accountNumberMasked.trim(), isPrimarySalary }, crypto.randomUUID())
      .then((result) => {
        setPhase({ kind: "success", bankName: result.bankAccount.bankName });
        setBankName("");
        setIfsc("");
        setAccountNumberMasked("");
        setIsPrimarySalary(false);
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setPhase({ kind: "error", errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  function approve(account: BankAccountRecord) {
    if (state.kind !== "ready") {
      return;
    }
    setActingOnId(account.id);
    setActionError(null);
    void client
      .approveBankAccount(state.employeeId, account.id, crypto.randomUUID())
      .then(() => {
        setActingOnId(null);
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setActingOnId(null);
        setActionError({ accountId: account.id, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  function recordPennyDrop(account: BankAccountRecord, result: "VERIFIED" | "FAILED") {
    if (state.kind !== "ready") {
      return;
    }
    setActingOnId(account.id);
    setActionError(null);
    void client
      .recordBankPennyDrop(state.employeeId, account.id, result, crypto.randomUUID())
      .then(() => {
        setActingOnId(null);
        setRefreshToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setActingOnId(null);
        setActionError({ accountId: account.id, errorCode: error instanceof HrmsApiError ? error.displayCode : "UNKNOWN_ERROR" });
      });
  }

  const submitting = phase.kind === "submitting";

  return (
    <section className="record-panel g01-bank-accounts-panel" aria-label="G01 employee bank accounts">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">G01 Profile</p>
          <h2>Bank Accounts</h2>
        </div>
      </div>
      {state.kind === "loading" ? (
        <OperationalState kind="loading" title="Loading bank accounts" detail="Fetching the employee bank-account satellite rows." />
      ) : null}
      {state.kind === "error" ? (
        <OperationalState kind="error" title="Could not load bank accounts" detail={`The bank-account list failed with error code ${state.errorCode}.`} />
      ) : null}
      {state.kind === "empty" ? (
        <OperationalState kind="empty" title="No bank accounts" detail="No bank-account rows are recorded for this employee yet." />
      ) : null}
      {state.kind === "ready" ? (
        <ul className="satellite-list" aria-label="Employee bank account rows">
          {state.accounts.map((account) => (
            <li key={account.id}>
              <div>
                <strong>{account.bankName}</strong> {account.ifsc} {account.accountNumberMasked}
                {account.isPrimarySalary ? " (primary salary)" : ""} — {account.status}, penny-drop {account.pennyDropStatus}
              </div>
              <div className="inbox-actions">
                {account.status === "PENDING" ? (
                  <button disabled={actingOnId !== null} onClick={() => approve(account)} type="button">
                    {actingOnId === account.id ? "Approving…" : "Approve"}
                  </button>
                ) : null}
                {account.status === "APPROVED" && account.pennyDropStatus === "PENDING" ? (
                  <>
                    <button disabled={actingOnId !== null} onClick={() => recordPennyDrop(account, "VERIFIED")} type="button">
                      {actingOnId === account.id ? "Recording…" : "Record penny-drop verified"}
                    </button>
                    <button disabled={actingOnId !== null} onClick={() => recordPennyDrop(account, "FAILED")} type="button">
                      Record penny-drop failed
                    </button>
                  </>
                ) : null}
              </div>
              {actionError?.accountId === account.id ? (
                <p role="alert">The action failed with error code {actionError.errorCode}.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {state.kind === "ready" || state.kind === "empty" ? (
        <form aria-label="Add bank account form" onSubmit={handleSubmit}>
          <label htmlFor="g01-bank-name">Bank name</label>
          <input autoComplete="off" id="g01-bank-name" name="bankName" onChange={(event) => setBankName(event.target.value)} type="text" value={bankName} />
          <label htmlFor="g01-bank-ifsc">IFSC</label>
          <input autoComplete="off" id="g01-bank-ifsc" name="ifsc" onChange={(event) => setIfsc(event.target.value)} type="text" value={ifsc} />
          <label htmlFor="g01-bank-account-number">Account number</label>
          <input
            autoComplete="off"
            id="g01-bank-account-number"
            name="accountNumberMasked"
            onChange={(event) => setAccountNumberMasked(event.target.value)}
            type="text"
            value={accountNumberMasked}
          />
          <label htmlFor="g01-bank-primary">
            <input
              checked={isPrimarySalary}
              id="g01-bank-primary"
              name="isPrimarySalary"
              onChange={(event) => setIsPrimarySalary(event.target.checked)}
              type="checkbox"
            />
            Primary salary account
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "Adding…" : "Add bank account"}
          </button>
        </form>
      ) : null}
      {validationError ? <p role="alert">{validationError}</p> : null}
      {phase.kind === "error" ? <p role="alert">Adding the bank account failed with error code {phase.errorCode}.</p> : null}
      {phase.kind === "success" ? <p role="status">Bank account at {phase.bankName} added, pending approval.</p> : null}
    </section>
  );
}
