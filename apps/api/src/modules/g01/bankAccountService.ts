import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { EmployeeMasterService } from "./employeeMasterService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-65A — G01 FR-EPM-008 bank-account register (NET-NEW: new backing, not a route over an existing engine).
 *
 * A bank account is added PENDING and becomes APPROVED via maker-checker approval. VAL-IFSC validates the
 * RBI IFSC format on add/update. Single-salary invariant: at most one ACTIVE account may be is_primary_salary
 * (promotion auto-demotes the prior). penny_drop is a tri-state (PENDING/VERIFIED/FAILED); a VERIFIED penny
 * drop sets is_verified. Any account-detail change re-enters PENDING (a fresh approval is required). Updates
 * use row_version optimistic locking; deletes are soft. Audited (P05).
 */

export type BankAccountStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PennyDropStatus = "PENDING" | "VERIFIED" | "FAILED";
export type BankLifecycle = "ACTIVE" | "INACTIVE";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Org-wide override roles that may approve without triggering the maker!=checker SOD gate (e.g. a
 *  single HR admin operating in a small tenant, or the system/seed actor). Mirrors the same override
 *  convention used for P01 workflow approver-identity enforcement. */
const BANK_APPROVAL_OVERRIDE_ROLES = new Set(["hr_admin", "finance_admin", "system"]);

/** g01_bank_accounts — one bank account line for an employee. */
export interface BankAccount {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  bankName: string;
  ifsc: string;
  accountNumberMasked: string;
  isPrimarySalary: boolean;
  isVerified: boolean;
  status: BankAccountStatus;
  pennyDropStatus: PennyDropStatus;
  lifecycle: BankLifecycle;
  rowVersion: number;
  /** Maker of the current PENDING state (FR-EPM-008 AC3/AC7 4-eyes); the approver must be a different user. */
  submittedByUserId?: string;
}

export interface BankAccountRepository {
  save(row: BankAccount): void;
  find(scope: TenantScope, id: string): BankAccount | undefined;
  listForEmployee(scope: TenantScope, employeeId: string): BankAccount[];
}

export class InMemoryBankAccountRepository implements BankAccountRepository {
  private readonly rows: BankAccount[] = [];
  private scoped(row: BankAccount, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: BankAccount): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row };
    else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): BankAccount | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForEmployee(scope: TenantScope, employeeId: string): BankAccount[] {
    return this.rows.filter((r) => this.scoped(r, scope) && r.employeeId === employeeId).map((r) => ({ ...r }));
  }
}

export interface BankAccountInput {
  bankName: string;
  ifsc: string;
  accountNumberMasked: string;
  isPrimarySalary?: boolean;
}

export class BankAccountService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: BankAccountRepository = new InMemoryBankAccountRepository()
  ) {}

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
    }
  }

  private assertIfsc(ifsc: string): void {
    if (!ifsc || !IFSC_RE.test(ifsc)) {
      throw new FoundationError("VAL-IFSC", "IFSC must match the RBI format (4 letters, 0, then 6 alphanumeric)", { field: "ifsc" });
    }
  }

  /** Demote every OTHER active primary-salary account for the employee (single-salary invariant). */
  private demoteOtherPrimary(actor: ActorContext, employeeId: string, keepId?: string): void {
    for (const acct of this.repo.listForEmployee(actor, employeeId)) {
      if (acct.lifecycle === "ACTIVE" && acct.isPrimarySalary && acct.id !== keepId) {
        acct.isPrimarySalary = false;
        acct.rowVersion += 1;
        this.repo.save(acct);
      }
    }
  }

  listBankAccounts(scope: TenantScope, employeeId: string): BankAccount[] {
    requireTenantScope(scope);
    this.requireEmployee(scope, employeeId);
    return this.repo.listForEmployee(scope, employeeId);
  }

  addBankAccount(actor: ActorContext, employeeId: string, input: BankAccountInput): BankAccount {
    this.authorization.check(actor, "g01.bank.write", actor);
    this.requireEmployee(actor, employeeId);
    if (!input.bankName || !input.bankName.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "bank_name is required", { field: "bankName" });
    }
    if (!input.accountNumberMasked || !input.accountNumberMasked.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "account_number_masked is required", { field: "accountNumberMasked" });
    }
    this.assertIfsc(input.ifsc);
    const isPrimary = Boolean(input.isPrimarySalary);
    if (isPrimary) {
      this.demoteOtherPrimary(actor, employeeId);
    }
    const account: BankAccount = {
      id: nextId("g01-bank-account", this.counter++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId,
      bankName: input.bankName,
      ifsc: input.ifsc,
      accountNumberMasked: input.accountNumberMasked,
      isPrimarySalary: isPrimary,
      isVerified: false,
      status: "PENDING",
      pennyDropStatus: "PENDING",
      lifecycle: "ACTIVE",
      rowVersion: 1,
      submittedByUserId: actor.userId,
    };
    this.repo.save(account);
    this.audit.recordMutation(actor, {
      action: "G01_BANK_ACCOUNT_ADDED",
      subjectRef: `g01_bank_accounts:${account.id}`,
      metadata: { employeeId, isPrimarySalary: account.isPrimarySalary },
    });
    return { ...account };
  }

  /** A detail change re-enters PENDING and clears verification (a fresh approval + penny drop is required). */
  updateBankAccount(
    actor: ActorContext,
    accountId: string,
    input: { rowVersion: number; bankName?: string; ifsc?: string; accountNumberMasked?: string; isPrimarySalary?: boolean }
  ): BankAccount {
    this.authorization.check(actor, "g01.bank.write", actor);
    const account = this.requireActive(actor, accountId);
    if (input.rowVersion !== account.rowVersion) {
      throw new FoundationError("CONFLICT", "Bank account row_version is stale (optimistic lock)", {
        details: { expected: account.rowVersion, received: input.rowVersion },
      });
    }
    let detailChanged = false;
    if (input.bankName !== undefined) {
      if (!input.bankName.trim()) throw new FoundationError("VALIDATION_FAILED", "bank_name may not be blank", { field: "bankName" });
      account.bankName = input.bankName;
      detailChanged = true;
    }
    if (input.ifsc !== undefined) {
      this.assertIfsc(input.ifsc);
      account.ifsc = input.ifsc;
      detailChanged = true;
    }
    if (input.accountNumberMasked !== undefined) {
      if (!input.accountNumberMasked.trim()) throw new FoundationError("VALIDATION_FAILED", "account_number_masked may not be blank", { field: "accountNumberMasked" });
      account.accountNumberMasked = input.accountNumberMasked;
      detailChanged = true;
    }
    if (input.isPrimarySalary === true && !account.isPrimarySalary) {
      this.demoteOtherPrimary(actor, account.employeeId, account.id);
      account.isPrimarySalary = true;
    } else if (input.isPrimarySalary === false) {
      account.isPrimarySalary = false;
    }
    if (detailChanged) {
      account.status = "PENDING";
      account.isVerified = false;
      account.pennyDropStatus = "PENDING";
      account.submittedByUserId = actor.userId;
    }
    account.rowVersion += 1;
    this.repo.save(account);
    this.audit.recordMutation(actor, { action: "G01_BANK_ACCOUNT_UPDATED", subjectRef: `g01_bank_accounts:${account.id}`, metadata: { status: account.status, rowVersion: account.rowVersion } });
    return { ...account };
  }

  /** Maker-checker approval: PENDING -> APPROVED (a rejected/approved account cannot be re-approved).
   *  FR-EPM-008 AC3/Failure-Handling: maker == checker is rejected as SOD_VIOLATION unless the approver
   *  holds an org-wide override role/permission.
   *
   *  CAVEAT: this guarantee is only as strong as the caller's ActorContext. In this repo's current
   *  dev-only HTTP bridge (tools/local-api-server.mjs), bearer tokens are decoded without signature
   *  verification (documented there as "NOT for production use"), so `actor.roles`/`permissions` are
   *  effectively self-declared by the client. This SOD gate is a real, tested control against any
   *  server-issued ActorContext, but it is not yet a hard security boundary end-to-end until a real,
   *  signature-verified auth layer issues actor identity/roles. */
  approveBankAccount(actor: ActorContext, accountId: string): BankAccount {
    this.authorization.check(actor, "g01.bank.approve", actor);
    const account = this.requireActive(actor, accountId);
    if (account.status !== "PENDING") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PENDING bank account can be approved", { details: { status: account.status } });
    }
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => BANK_APPROVAL_OVERRIDE_ROLES.has(role));
    if (!isOverride && account.submittedByUserId !== undefined && account.submittedByUserId === actor.userId) {
      throw new FoundationError("SOD_VIOLATION", "The maker of a bank-account change may not also approve it", {
        field: "actor",
        details: { accountId: account.id },
      });
    }
    account.status = "APPROVED";
    account.rowVersion += 1;
    this.repo.save(account);
    this.audit.recordMutation(actor, { action: "G01_BANK_ACCOUNT_APPROVED", subjectRef: `g01_bank_accounts:${account.id}` });
    return { ...account };
  }

  /** Record the tri-state penny-drop outcome; VERIFIED sets is_verified, FAILED leaves it unverified. */
  recordPennyDrop(actor: ActorContext, accountId: string, input: { result: "VERIFIED" | "FAILED" }): BankAccount {
    this.authorization.check(actor, "g01.bank.write", actor);
    const account = this.requireActive(actor, accountId);
    if (input.result !== "VERIFIED" && input.result !== "FAILED") {
      throw new FoundationError("VALIDATION_FAILED", "penny-drop result must be VERIFIED or FAILED", { field: "result" });
    }
    account.pennyDropStatus = input.result;
    account.isVerified = input.result === "VERIFIED";
    account.rowVersion += 1;
    this.repo.save(account);
    this.audit.recordMutation(actor, { action: "G01_BANK_ACCOUNT_PENNY_DROP", subjectRef: `g01_bank_accounts:${account.id}`, metadata: { pennyDropStatus: account.pennyDropStatus } });
    return { ...account };
  }

  /** Soft-delete: lifecycle INACTIVE; clears primary-salary so it frees the single-salary slot. */
  removeBankAccount(actor: ActorContext, accountId: string): void {
    this.authorization.check(actor, "g01.bank.write", actor);
    const account = this.requireActive(actor, accountId);
    account.lifecycle = "INACTIVE";
    account.isPrimarySalary = false;
    account.rowVersion += 1;
    this.repo.save(account);
    this.audit.recordMutation(actor, { action: "G01_BANK_ACCOUNT_REMOVED", subjectRef: `g01_bank_accounts:${account.id}` });
  }

  private requireActive(scope: TenantScope, accountId: string): BankAccount {
    const account = this.repo.find(scope, accountId);
    if (!account || account.lifecycle !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Bank account not found");
    }
    return account;
  }
}
