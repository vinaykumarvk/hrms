import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";

/**
 * PH-16F — G10 loans/advances instalment recovery, Rule-3 concessional perquisites, balanced
 * GL journals, and bank-file positive-pay controls at BRD depth
 * (docs/brd/v3/G10-payroll-and-benefits.md FR-08 / FR-14 / FR-19 / FR-21):
 *
 * - E16 loans_advances + E17 loan_repayments: an instalment reduces outstanding_balance; the
 *   closure invariant is that outstanding never goes negative — a recovery that would breach the
 *   protected net floor is capped and the shortfall carries to E13 deduction_carryforwards
 *   (ERR-G10-RECOVERY-NET, FR-08 AC4). Foreclosure settles the whole outstanding in one row.
 * - E24 perquisites: a concessional (is_concessional) benefit is valued by Rule-3 against an
 *   effective reference rate; a missing reference-rate row fails closed (ERR-G10-PERQ-REFRATE,
 *   FR-21) rather than valuing at zero.
 * - E27 gl_journals: every journal carries total_debit/total_credit and is rejected unless
 *   balanced (debit == credit); lifecycle POSTED -> ACKNOWLEDGED once the ledger confirms.
 * - E21 bank-file positive-pay: a disbursement line is confirmed against the positive-pay
 *   register; an ambiguous acknowledgement marks the line SUSPECTED_PROCESSED and blocks a
 *   resend (FR-14), booking the amount to E31 disbursement_holds instead of paying twice.
 *
 * MONEY: integer paise throughout — no float parsing, no string rounding.
 */

export type LoanStatus = "ACTIVE" | "CLOSED" | "FORECLOSED";
export type PerquisiteType = "CONCESSIONAL_LOAN" | "ACCOMMODATION" | "OTHER";
export type GlJournalStatus = "POSTED" | "ACKNOWLEDGED" | "REVERSED";
export type BankLineStatus = "PREPARED" | "CONFIRMED_PAID" | "SUSPECTED_PROCESSED" | "FAILED";

/** E16 loans_advances — sanctioned principal + running outstanding_balance (integer paise). */
export interface LoanAdvance {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  loanType: string;
  principalPaise: number;
  instalmentPaise: number;
  outstandingPaise: number;
  isConcessional: boolean;
  status: LoanStatus;
}

/** E17 loan_repayments — append-only instalment ledger; one row per recovery/foreclosure. */
export interface LoanRepayment {
  id: string;
  tenantId: string;
  loanId: string;
  recoveredPaise: number;
  outstandingAfterPaise: number;
  kind: "INSTALMENT" | "FORECLOSURE";
  carriedForwardPaise: number;
  recordedAt: string;
}

/** E13 deduction_carryforwards — the shortfall when net pay cannot absorb the full instalment. */
export interface DeductionCarryforward {
  id: string;
  tenantId: string;
  employeeId: string;
  sourceRef: string;
  amountPaise: number;
  reason: string;
}

/** E24 perquisites — Rule-3 concessional valuation is_concessional against a reference rate. */
export interface Perquisite {
  id: string;
  tenantId: string;
  employeeId: string;
  perquisiteType: PerquisiteType;
  isConcessional: boolean;
  baseAmountPaise: number;
  referenceRateBps?: number;
  employeeRateBps: number;
  taxableValuePaise: number;
}

/** E27 gl_journals — balanced double-entry with total_debit/total_credit + posting lifecycle. */
export interface GlJournalLine {
  account: string;
  debitPaise: number;
  creditPaise: number;
}
export interface GlJournal {
  id: string;
  tenantId: string;
  entityId?: string;
  reference: string;
  lines: GlJournalLine[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  status: GlJournalStatus;
  acknowledgedRef?: string;
}

/** E21 bank disbursement line with positive-pay confirmation / SUSPECTED_PROCESSED hold. */
export interface BankDisbursementLine {
  id: string;
  tenantId: string;
  employeeId: string;
  amountPaise: number;
  accountRef: string;
  positivePayToken: string;
  status: BankLineStatus;
  holdId?: string;
}

/** E31 disbursement_holds — suspense for an ambiguous/failed line; never silently removed. */
export interface DisbursementHold {
  id: string;
  tenantId: string;
  lineId: string;
  amountPaise: number;
  reason: string;
}

export interface LoanPerquisiteGlRepository {
  saveLoan(row: LoanAdvance): void;
  findLoan(scope: TenantScope, id: string): LoanAdvance | undefined;
  appendRepayment(row: LoanRepayment): void;
  listRepayments(scope: TenantScope, loanId: string): LoanRepayment[];
  appendCarryforward(row: DeductionCarryforward): void;
  listCarryforwards(scope: TenantScope, employeeId: string): DeductionCarryforward[];
  savePerquisite(row: Perquisite): void;
  findPerquisite(scope: TenantScope, id: string): Perquisite | undefined;
  saveJournal(row: GlJournal): void;
  findJournal(scope: TenantScope, id: string): GlJournal | undefined;
  saveBankLine(row: BankDisbursementLine): void;
  findBankLine(scope: TenantScope, id: string): BankDisbursementLine | undefined;
  saveHold(row: DisbursementHold): void;
}

export class InMemoryLoanPerquisiteGlRepository implements LoanPerquisiteGlRepository {
  private readonly loans: LoanAdvance[] = [];
  private readonly repayments: LoanRepayment[] = [];
  private readonly carryforwards: DeductionCarryforward[] = [];
  private readonly perquisites: Perquisite[] = [];
  private readonly journals: GlJournal[] = [];
  private readonly bankLines: BankDisbursementLine[] = [];
  private readonly holds: DisbursementHold[] = [];

  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }

  saveLoan(row: LoanAdvance): void {
    const i = this.loans.findIndex((l) => l.id === row.id);
    if (i >= 0) this.loans[i] = { ...row }; else this.loans.push({ ...row });
  }
  findLoan(scope: TenantScope, id: string): LoanAdvance | undefined {
    const row = this.loans.find((l) => l.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  appendRepayment(row: LoanRepayment): void { this.repayments.push({ ...row }); }
  listRepayments(scope: TenantScope, loanId: string): LoanRepayment[] {
    return this.repayments.filter((r) => r.loanId === loanId && r.tenantId === scope.tenantId).map((r) => ({ ...r }));
  }
  appendCarryforward(row: DeductionCarryforward): void { this.carryforwards.push({ ...row }); }
  listCarryforwards(scope: TenantScope, employeeId: string): DeductionCarryforward[] {
    return this.carryforwards.filter((c) => c.employeeId === employeeId && c.tenantId === scope.tenantId).map((c) => ({ ...c }));
  }
  savePerquisite(row: Perquisite): void {
    const i = this.perquisites.findIndex((p) => p.id === row.id);
    if (i >= 0) this.perquisites[i] = { ...row }; else this.perquisites.push({ ...row });
  }
  findPerquisite(scope: TenantScope, id: string): Perquisite | undefined {
    const row = this.perquisites.find((p) => p.id === id);
    return row && row.tenantId === scope.tenantId ? { ...row } : undefined;
  }
  saveJournal(row: GlJournal): void {
    const i = this.journals.findIndex((j) => j.id === row.id);
    if (i >= 0) this.journals[i] = { ...row }; else this.journals.push({ ...row });
  }
  findJournal(scope: TenantScope, id: string): GlJournal | undefined {
    const row = this.journals.find((j) => j.id === id);
    return row && this.scoped(row, scope) ? { ...row, lines: row.lines.map((l) => ({ ...l })) } : undefined;
  }
  saveBankLine(row: BankDisbursementLine): void {
    const i = this.bankLines.findIndex((b) => b.id === row.id);
    if (i >= 0) this.bankLines[i] = { ...row }; else this.bankLines.push({ ...row });
  }
  findBankLine(scope: TenantScope, id: string): BankDisbursementLine | undefined {
    const row = this.bankLines.find((b) => b.id === id);
    return row && row.tenantId === scope.tenantId ? { ...row } : undefined;
  }
  saveHold(row: DisbursementHold): void { this.holds.push({ ...row }); }
}

export class LoanPerquisiteGlService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: LoanPerquisiteGlRepository = new InMemoryLoanPerquisiteGlRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  sanctionLoan(
    actor: ActorContext,
    input: { employeeId: string; loanType: string; principalPaise: number; instalmentPaise: number; isConcessional?: boolean }
  ): LoanAdvance {
    this.authorization.check(actor, "g10.loan.sanction", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (!Number.isInteger(input.principalPaise) || input.principalPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "principalPaise must be a positive integer", { field: "principalPaise" });
    }
    if (!Number.isInteger(input.instalmentPaise) || input.instalmentPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "instalmentPaise must be a positive integer", { field: "instalmentPaise" });
    }
    const loan: LoanAdvance = {
      id: this.next("g10-loan"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      loanType: input.loanType,
      principalPaise: input.principalPaise,
      instalmentPaise: input.instalmentPaise,
      outstandingPaise: input.principalPaise,
      isConcessional: Boolean(input.isConcessional),
      status: "ACTIVE",
    };
    this.repo.saveLoan(loan);
    this.audit.recordMutation(actor, {
      action: "G10_LOAN_SANCTIONED",
      subjectRef: `g10_loans_advances:${loan.id}`,
      metadata: { ledger: "loan_repayments", principalPaise: loan.principalPaise, isConcessional: loan.isConcessional },
    });
    return { ...loan };
  }

  /**
   * Recover one instalment. netAvailablePaise is the protected net-pay headroom for this
   * employee this cycle: the recovery is capped at min(instalment, outstanding, net headroom).
   * Any shortfall vs the scheduled instalment carries to deduction_carryforwards
   * (ERR-G10-RECOVERY-NET when the net headroom is zero — nothing can be recovered this cycle).
   */
  recordLoanInstalment(
    actor: ActorContext,
    loanId: string,
    input: { netAvailablePaise: number; recordedAt: string }
  ): LoanRepayment {
    this.authorization.check(actor, "g10.loan.recover", actor);
    const loan = this.requireLoan(actor, loanId);
    if (loan.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE loan can be recovered");
    }
    if (!Number.isInteger(input.netAvailablePaise) || input.netAvailablePaise < 0) {
      throw new FoundationError("VALIDATION_FAILED", "netAvailablePaise must be a non-negative integer", { field: "netAvailablePaise" });
    }
    const scheduled = Math.min(loan.instalmentPaise, loan.outstandingPaise);
    if (input.netAvailablePaise <= 0) {
      // No net headroom at all — the whole scheduled instalment carries forward, fail closed.
      this.carryForward(actor, loan, scheduled, "NET_FLOOR_ZERO");
      throw new FoundationError("ERR-G10-RECOVERY-NET", "Net pay cannot absorb any loan recovery this cycle", {
        details: { loanId: loan.id, scheduledPaise: scheduled },
      });
    }
    const recovered = Math.min(scheduled, input.netAvailablePaise);
    const shortfall = scheduled - recovered;
    loan.outstandingPaise -= recovered; // closure invariant: recovered <= outstanding, never negative
    if (loan.outstandingPaise === 0) {
      loan.status = "CLOSED";
    }
    this.repo.saveLoan(loan);
    if (shortfall > 0) {
      this.carryForward(actor, loan, shortfall, "NET_FLOOR_SHORTFALL");
    }
    const repayment: LoanRepayment = {
      id: this.next("g10-loan-repayment"),
      tenantId: actor.tenantId,
      loanId: loan.id,
      recoveredPaise: recovered,
      outstandingAfterPaise: loan.outstandingPaise,
      kind: "INSTALMENT",
      carriedForwardPaise: shortfall,
      recordedAt: input.recordedAt,
    };
    this.repo.appendRepayment(repayment);
    this.audit.recordMutation(actor, {
      action: "G10_LOAN_INSTALMENT_RECOVERED",
      subjectRef: `g10_loans_advances:${loan.id}`,
      metadata: { ledger: "loan_repayments", recoveredPaise: recovered, outstandingAfterPaise: loan.outstandingPaise },
    });
    return repayment;
  }

  /** Foreclosure: settle the remaining outstanding in a single loan_repayments row -> FORECLOSED. */
  forecloseLoan(actor: ActorContext, loanId: string, input: { recordedAt: string }): LoanRepayment {
    this.authorization.check(actor, "g10.loan.foreclose", actor);
    const loan = this.requireLoan(actor, loanId);
    if (loan.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE loan can be foreclosed");
    }
    const settled = loan.outstandingPaise;
    loan.outstandingPaise = 0;
    loan.status = "FORECLOSED";
    this.repo.saveLoan(loan);
    const repayment: LoanRepayment = {
      id: this.next("g10-loan-repayment"),
      tenantId: actor.tenantId,
      loanId: loan.id,
      recoveredPaise: settled,
      outstandingAfterPaise: 0,
      kind: "FORECLOSURE",
      carriedForwardPaise: 0,
      recordedAt: input.recordedAt,
    };
    this.repo.appendRepayment(repayment);
    this.audit.recordMutation(actor, {
      action: "G10_LOAN_FORECLOSED",
      subjectRef: `g10_loans_advances:${loan.id}`,
      metadata: { ledger: "loan_repayments", settledPaise: settled },
    });
    return repayment;
  }

  private carryForward(actor: ActorContext, loan: LoanAdvance, amountPaise: number, reason: string): void {
    if (amountPaise <= 0) return;
    this.repo.appendCarryforward({
      id: this.next("g10-carryforward"),
      tenantId: actor.tenantId,
      employeeId: loan.employeeId,
      sourceRef: `g10_loans_advances:${loan.id}`,
      amountPaise,
      reason,
    });
  }

  listLoanRepayments(scope: TenantScope, loanId: string): LoanRepayment[] {
    requireTenantScope(scope);
    return this.repo.listRepayments(scope, loanId);
  }
  listCarryforwards(scope: TenantScope, employeeId: string): DeductionCarryforward[] {
    requireTenantScope(scope);
    return this.repo.listCarryforwards(scope, employeeId);
  }

  /**
   * Rule-3 concessional perquisite. taxable value = base * (referenceRate − employeeRate) in
   * integer paise. A concessional benefit with no reference rate fails closed (ERR-G10-PERQ-REFRATE).
   */
  valuePerquisite(
    actor: ActorContext,
    input: {
      employeeId: string;
      perquisiteType: PerquisiteType;
      isConcessional: boolean;
      baseAmountPaise: number;
      referenceRateBps?: number;
      employeeRateBps: number;
    }
  ): Perquisite {
    this.authorization.check(actor, "g10.perquisite.value", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (input.isConcessional && (input.referenceRateBps === undefined || input.referenceRateBps <= 0)) {
      throw new FoundationError("ERR-G10-PERQ-REFRATE", "A concessional perquisite needs an effective reference rate", {
        details: { employeeId: input.employeeId, perquisiteType: input.perquisiteType },
      });
    }
    const spreadBps = Math.max(0, (input.referenceRateBps ?? 0) - input.employeeRateBps);
    // taxable = base * spreadBps / 10000, integer paise (floor).
    const taxableValuePaise = Math.floor((input.baseAmountPaise * spreadBps) / 10000);
    const perquisite: Perquisite = {
      id: this.next("g10-perquisite"),
      tenantId: actor.tenantId,
      employeeId: input.employeeId,
      perquisiteType: input.perquisiteType,
      isConcessional: input.isConcessional,
      baseAmountPaise: input.baseAmountPaise,
      referenceRateBps: input.referenceRateBps,
      employeeRateBps: input.employeeRateBps,
      taxableValuePaise,
    };
    this.repo.savePerquisite(perquisite);
    this.audit.recordMutation(actor, {
      action: "G10_PERQUISITE_VALUED",
      subjectRef: `g10_perquisites:${perquisite.id}`,
      metadata: { isConcessional: perquisite.isConcessional, taxableValuePaise },
    });
    return { ...perquisite };
  }

  /** Post a balanced GL journal. Rejected unless Σ debit == Σ credit (total_debit/total_credit). */
  postGlJournal(actor: ActorContext, input: { reference: string; lines: GlJournalLine[] }): GlJournal {
    this.authorization.check(actor, "g10.gl.post", actor);
    if (input.lines.length < 2) {
      throw new FoundationError("VALIDATION_FAILED", "A GL journal needs at least two lines", { field: "lines" });
    }
    let totalDebitPaise = 0;
    let totalCreditPaise = 0;
    for (const line of input.lines) {
      if (!Number.isInteger(line.debitPaise) || !Number.isInteger(line.creditPaise) || line.debitPaise < 0 || line.creditPaise < 0) {
        throw new FoundationError("VALIDATION_FAILED", "GL line amounts must be non-negative integers (paise)", { field: "lines" });
      }
      totalDebitPaise += line.debitPaise;
      totalCreditPaise += line.creditPaise;
    }
    if (totalDebitPaise !== totalCreditPaise) {
      throw new FoundationError("VALIDATION_FAILED", "GL journal is unbalanced (total_debit != total_credit)", {
        details: { totalDebitPaise, totalCreditPaise },
      });
    }
    const journal: GlJournal = {
      id: this.next("g10-gl-journal"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      reference: input.reference,
      lines: input.lines.map((l) => ({ ...l })),
      totalDebitPaise,
      totalCreditPaise,
      status: "POSTED",
    };
    this.repo.saveJournal(journal);
    this.audit.recordMutation(actor, {
      action: "G10_GL_JOURNAL_POSTED",
      subjectRef: `g10_gl_journals:${journal.id}`,
      metadata: { totalDebitPaise, totalCreditPaise },
    });
    return { ...journal, lines: journal.lines.map((l) => ({ ...l })) };
  }

  /** Ledger confirms receipt -> ACKNOWLEDGED. */
  acknowledgeGlJournal(actor: ActorContext, journalId: string, input: { acknowledgedRef: string }): GlJournal {
    this.authorization.check(actor, "g10.gl.acknowledge", actor);
    const journal = this.repo.findJournal(actor, journalId);
    if (!journal) {
      throw new FoundationError("NOT_FOUND", "GL journal not found");
    }
    if (journal.status !== "POSTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a POSTED journal can be ACKNOWLEDGED");
    }
    journal.status = "ACKNOWLEDGED";
    journal.acknowledgedRef = input.acknowledgedRef;
    this.repo.saveJournal(journal);
    this.audit.recordMutation(actor, {
      action: "G10_GL_JOURNAL_ACKNOWLEDGED",
      subjectRef: `g10_gl_journals:${journal.id}`,
      metadata: { acknowledgedRef: input.acknowledgedRef },
    });
    return { ...journal, lines: journal.lines.map((l) => ({ ...l })) };
  }

  /** Prepare a bank disbursement line carrying a positive-pay token. */
  prepareBankLine(
    actor: ActorContext,
    input: { employeeId: string; amountPaise: number; accountRef: string; positivePayToken: string }
  ): BankDisbursementLine {
    this.authorization.check(actor, "g10.bankfile.prepare", actor);
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "amountPaise must be a positive integer", { field: "amountPaise" });
    }
    const line: BankDisbursementLine = {
      id: this.next("g10-bank-line"),
      tenantId: actor.tenantId,
      employeeId: input.employeeId,
      amountPaise: input.amountPaise,
      accountRef: input.accountRef,
      positivePayToken: input.positivePayToken,
      status: "PREPARED",
    };
    this.repo.saveBankLine(line);
    return { ...line };
  }

  /**
   * Positive-pay confirmation. A matching token confirms the line as paid. An ambiguous
   * acknowledgement (token mismatch / "unknown at bank") marks the line SUSPECTED_PROCESSED
   * and books the amount to disbursement_holds — a resend is then blocked to avoid double pay.
   */
  confirmPositivePay(
    actor: ActorContext,
    lineId: string,
    input: { presentedToken: string; ambiguousAck?: boolean }
  ): BankDisbursementLine {
    this.authorization.check(actor, "g10.bankfile.confirm", actor);
    const line = this.repo.findBankLine(actor, lineId);
    if (!line) {
      throw new FoundationError("NOT_FOUND", "Bank disbursement line not found");
    }
    if (line.status === "SUSPECTED_PROCESSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Line is on a SUSPECTED_PROCESSED hold — resend blocked");
    }
    if (line.status !== "PREPARED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PREPARED line can be confirmed");
    }
    if (input.ambiguousAck || input.presentedToken !== line.positivePayToken) {
      const hold: DisbursementHold = {
        id: this.next("g10-hold"),
        tenantId: actor.tenantId,
        lineId: line.id,
        amountPaise: line.amountPaise,
        reason: "POSITIVE_PAY_AMBIGUOUS",
      };
      this.repo.saveHold(hold);
      line.status = "SUSPECTED_PROCESSED";
      line.holdId = hold.id;
      this.repo.saveBankLine(line);
      this.audit.recordMutation(actor, {
        action: "G10_BANK_LINE_SUSPECTED_PROCESSED",
        subjectRef: `g10_bank_disbursement_lines:${line.id}`,
        metadata: { ledger: "disbursement_holds", holdId: hold.id },
      });
      return { ...line };
    }
    line.status = "CONFIRMED_PAID";
    this.repo.saveBankLine(line);
    this.audit.recordMutation(actor, {
      action: "G10_BANK_LINE_CONFIRMED_PAID",
      subjectRef: `g10_bank_disbursement_lines:${line.id}`,
    });
    return { ...line };
  }

  private requireLoan(scope: TenantScope, loanId: string): LoanAdvance {
    const loan = this.repo.findLoan(scope, loanId);
    if (!loan) {
      throw new FoundationError("NOT_FOUND", "Loan not found");
    }
    return loan;
  }
}
