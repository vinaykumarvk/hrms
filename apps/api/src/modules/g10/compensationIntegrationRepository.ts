import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";

/**
 * PH-09D — G10 compensation-integration persistence (BRD G10 FR-09/14/15/20):
 *   E21 bank_disbursements       (bank file batch; disbursed/held/failed split — AI-4),
 *   E31 disbursement_holds       (suspense ledger for excluded/failed net pay — never
 *                                 silently removed; write-off surfaces in the tie-out),
 *   E22 payroll_reconciliations  (tie-out Σ disbursed + Σ held + Σ failed = run net,
 *                                 VAL-G10-TIEOUT; sign-off SoD gates disbursement),
 *   E16 loans_advances           (sanction & outstanding balance; FnF pulls open rows),
 *   E30 fnf_settlements          (consolidated separation settlement; approved_by ≠ created_by),
 *   recovery schedules           (G09 penalty-order recoveries bounded by the net-pay floor
 *                                 and the CPC s.60 attachment cap — ERR-G10-RECOVERY-BARRED).
 * Physical tables per docs/data-model/10-G10-payroll-benefits.sql (migration 0017):
 * g10_bank_disbursements / g10_bank_disbursement_lines / g10_disbursement_holds /
 * g10_payroll_reconciliations / g10_loans_advances / g10_fnf_settlements /
 * g10_recovery_schedules. All money is integer paise (integer minor units — the same
 * invariant the engine calls "cents"); no float parsing and no string rounding anywhere.
 */

export type DisbursementLineStatus = "DISBURSED" | "FAILED";
export type DisbursementBatchStatus = "PREPARED" | "COMPLETED";
export type HoldReason = "INVALID_ACCOUNT" | "MISSING_ACCOUNT" | "FROZEN_ACCOUNT" | "FAILED_CREDIT";
export type HoldStatus = "HELD" | "REDISBURSED" | "WRITTEN_OFF";
export type ReconciliationStatus = "BALANCED" | "SIGNED_OFF";
export type LoanStatus = "ACTIVE" | "CLOSED" | "SETTLED_IN_FNF";
export type FnfSettlementStatus = "COMPUTED" | "RECOVERY_PENDING" | "APPROVED";
export type RecoveryScheduleStatus = "SCHEDULED" | "CLOSED";

/** E21 bank_disbursements batch header — the disbursed/held/failed split lives here. */
export interface BankDisbursement {
  id: string;
  tenantId: string;
  entityId?: string;
  batchNo: string;
  runId: string;
  /** Positive-pay batch ref — unique per tenant (uq_g10_disb_bank_ref). */
  bankBatchRef: string;
  totalAmountPaise: number;
  lineCount: number;
  disbursedTotalPaise: number;
  heldTotalPaise: number;
  failedTotalPaise: number;
  status: DisbursementBatchStatus;
  createdBy: string;
}

/** One payee line of a bank_disbursements batch (subset satellite of E21). */
export interface BankDisbursementLine {
  id: string;
  tenantId: string;
  entityId?: string;
  disbursementId: string;
  employeeId: string;
  payslipId: string;
  amountPaise: number;
  status: DisbursementLineStatus;
}

/** E31 disbursement_holds — suspense for excluded net pay (BR1: never silently removed). */
export interface DisbursementHold {
  id: string;
  tenantId: string;
  entityId?: string;
  holdNo: string;
  runId: string;
  disbursementId?: string;
  employeeId: string;
  payslipId?: string;
  heldAmountPaise: number;
  reason: HoldReason;
  status: HoldStatus;
  writtenOffBy?: string;
  writeOffReason?: string;
}

/** E22 payroll_reconciliations — the tie-out equation result + sign-off SoD state. */
export interface PayrollReconciliation {
  id: string;
  tenantId: string;
  entityId?: string;
  runId: string;
  runNetPaise: number;
  disbursedTotalPaise: number;
  heldTotalPaise: number;
  failedTotalPaise: number;
  /** VAL-G10-TIEOUT: runNet − (disbursed + held + failed); non-zero blocks (ERR-G10-RECON-TIEOUT). */
  residualPaise: number;
  validation: "VAL-G10-TIEOUT";
  status: ReconciliationStatus;
  /** SoD: signer ≠ run maker ≠ run approver (ERR-G10-RECON-UNSIGNED otherwise). */
  signedByUserId?: string;
}

/** E16 loans_advances — sanction + outstanding; FnF settlement pulls open rows (FR-20 AC4). */
export interface LoanAdvance {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  loanType: string;
  sanctionedPrincipalPaise: number;
  outstandingPaise: number;
  status: LoanStatus;
  settledInFnfId?: string;
}

/** FR-09 recovery schedule sourced from a G09 penalty order, bounded by floor + s.60 cap. */
export interface RecoverySchedule {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  /** Hard linkage to the upstream G09 order — no silent stubs. */
  penaltyOrderId: string;
  penaltyOrderNo: string;
  period: string;
  orderedTotalPaise: number;
  scheduledPerCyclePaise: number;
  recoveredToDatePaise: number;
  netPayFloorPaise: number;
  attachmentCapPaise: number;
  /** Recorded statutory basis for the attachment exemption (e.g. CPC s.60) — configuration, not invention. */
  attachmentExemptionBasis: string;
  status: RecoveryScheduleStatus;
}

/** E30 fnf_settlements — one consolidated separation settlement (FR-20 AC1/AC2). */
export interface FnfSettlement {
  id: string;
  tenantId: string;
  entityId?: string;
  settlementNo: string;
  employeeId: string;
  separationDate: string;
  finalMonthPayPaise: number;
  leaveEncashmentPaise: number;
  gratuityPaise: number;
  noticePayRecoveryPaise: number;
  /** Σ outstanding over the employee's open loans_advances rows pulled into the settlement. */
  loanSettlementPaise: number;
  /** Σ outstanding over the employee's open deduction_carryforwards rows pulled in. */
  carryforwardRecoveryPaise: number;
  finalTdsPaise: number;
  /** net = final + encashment + gratuity − notice − loans − carryforwards − TDS (may be negative). */
  netSettlementPaise: number;
  loanRefs: string[];
  carryforwardRefs: string[];
  status: FnfSettlementStatus;
  createdBy: string;
  /** SoD (§5.6): fnf_settlements.approved_by ≠ created_by. */
  approvedBy?: string;
}

export interface CompensationIntegrationRepository {
  countDisbursements(): number;
  saveDisbursement(row: BankDisbursement): void;
  findDisbursementByRun(scope: TenantScope, runId: string): BankDisbursement | undefined;

  saveDisbursementLine(line: BankDisbursementLine): void;
  listDisbursementLines(scope: TenantScope, disbursementId: string): BankDisbursementLine[];

  countHolds(): number;
  saveHold(hold: DisbursementHold): void;
  findHold(scope: TenantScope, holdId: string): DisbursementHold | undefined;
  listHoldsForRun(scope: TenantScope, runId: string): DisbursementHold[];

  countReconciliations(): number;
  saveReconciliation(row: PayrollReconciliation): void;
  findReconciliationByRun(scope: TenantScope, runId: string): PayrollReconciliation | undefined;

  countLoans(): number;
  saveLoan(row: LoanAdvance): void;
  listLoansForEmployee(scope: TenantScope, employeeId: string): LoanAdvance[];

  countRecoverySchedules(): number;
  saveRecoverySchedule(row: RecoverySchedule): void;
  listRecoverySchedules(scope: TenantScope, employeeId?: string): RecoverySchedule[];

  countFnfSettlements(): number;
  saveFnfSettlement(row: FnfSettlement): void;
  findFnfSettlement(scope: TenantScope, settlementId: string): FnfSettlement | undefined;
  listFnfSettlements(scope: TenantScope, employeeId?: string): FnfSettlement[];
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory CompensationIntegrationRepository (same seam as PgCompensationIntegrationRepository). */
export class InMemoryCompensationIntegrationRepository implements CompensationIntegrationRepository {
  private readonly disbursements: BankDisbursement[] = [];
  private readonly disbursementLines: BankDisbursementLine[] = [];
  private readonly holds: DisbursementHold[] = [];
  private readonly reconciliations: PayrollReconciliation[] = [];
  private readonly loans: LoanAdvance[] = [];
  private readonly recoverySchedules: RecoverySchedule[] = [];
  private readonly fnfSettlements: FnfSettlement[] = [];

  countDisbursements(): number {
    return this.disbursements.length;
  }

  saveDisbursement(row: BankDisbursement): void {
    const index = this.disbursements.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.disbursements.push(row);
      return;
    }
    this.disbursements[index] = row;
  }

  findDisbursementByRun(scope: TenantScope, runId: string): BankDisbursement | undefined {
    return this.disbursements.find((item) => rowInScope(item, scope) && item.runId === runId);
  }

  saveDisbursementLine(line: BankDisbursementLine): void {
    this.disbursementLines.push(line);
  }

  listDisbursementLines(scope: TenantScope, disbursementId: string): BankDisbursementLine[] {
    return this.disbursementLines.filter((item) => rowInScope(item, scope) && item.disbursementId === disbursementId);
  }

  countHolds(): number {
    return this.holds.length;
  }

  saveHold(hold: DisbursementHold): void {
    const index = this.holds.findIndex((item) => item.id === hold.id);
    if (index < 0) {
      this.holds.push(hold);
      return;
    }
    this.holds[index] = hold;
  }

  findHold(scope: TenantScope, holdId: string): DisbursementHold | undefined {
    return this.holds.find((item) => rowInScope(item, scope) && item.id === holdId);
  }

  listHoldsForRun(scope: TenantScope, runId: string): DisbursementHold[] {
    return this.holds.filter((item) => rowInScope(item, scope) && item.runId === runId);
  }

  countReconciliations(): number {
    return this.reconciliations.length;
  }

  saveReconciliation(row: PayrollReconciliation): void {
    const index = this.reconciliations.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.reconciliations.push(row);
      return;
    }
    this.reconciliations[index] = row;
  }

  findReconciliationByRun(scope: TenantScope, runId: string): PayrollReconciliation | undefined {
    return this.reconciliations.find((item) => rowInScope(item, scope) && item.runId === runId);
  }

  countLoans(): number {
    return this.loans.length;
  }

  saveLoan(row: LoanAdvance): void {
    const index = this.loans.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.loans.push(row);
      return;
    }
    this.loans[index] = row;
  }

  listLoansForEmployee(scope: TenantScope, employeeId: string): LoanAdvance[] {
    return this.loans.filter((item) => rowInScope(item, scope) && item.employeeId === employeeId);
  }

  countRecoverySchedules(): number {
    return this.recoverySchedules.length;
  }

  saveRecoverySchedule(row: RecoverySchedule): void {
    const index = this.recoverySchedules.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.recoverySchedules.push(row);
      return;
    }
    this.recoverySchedules[index] = row;
  }

  listRecoverySchedules(scope: TenantScope, employeeId?: string): RecoverySchedule[] {
    return this.recoverySchedules.filter((item) => rowInScope(item, scope) && (!employeeId || item.employeeId === employeeId));
  }

  countFnfSettlements(): number {
    return this.fnfSettlements.length;
  }

  saveFnfSettlement(row: FnfSettlement): void {
    const index = this.fnfSettlements.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.fnfSettlements.push(row);
      return;
    }
    this.fnfSettlements[index] = row;
  }

  findFnfSettlement(scope: TenantScope, settlementId: string): FnfSettlement | undefined {
    return this.fnfSettlements.find((item) => rowInScope(item, scope) && item.id === settlementId);
  }

  listFnfSettlements(scope: TenantScope, employeeId?: string): FnfSettlement[] {
    return this.fnfSettlements.filter((item) => rowInScope(item, scope) && (!employeeId || item.employeeId === employeeId));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the migration-0017 DDL: g10_bank_disbursements,
// g10_bank_disbursement_lines, g10_disbursement_holds, g10_payroll_reconciliations,
// g10_loans_advances, g10_fnf_settlements, g10_recovery_schedules. All SQL is
// parameterised ($1, $2, ...); every multi-row write (batch+lines+holds prepare, FnF
// settle+loan close+carryforward close) runs in ONE transaction. Money columns are
// NUMERIC(15,2)/NUMERIC(18,2); paise conversion happens in SQL (($n::numeric / 100) on
// write, (col * 100)::bigint on read) — never through float parsing.
// ---------------------------------------------------------------------------------------

const INSERT_DISBURSEMENT =
  "INSERT INTO g10_bank_disbursements (tenant_id, entity_id, batch_no, run_id, bank_batch_ref, total_amount, line_count, " +
  "disbursed_total, held_total, failed_total, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::numeric / 100, $7, $8::numeric / 100, $9::numeric / 100, $10::numeric / 100, $11, $12) RETURNING id";

const INSERT_DISBURSEMENT_LINE =
  "INSERT INTO g10_bank_disbursement_lines (tenant_id, entity_id, disbursement_id, employee_id, payslip_id, amount, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6::numeric / 100, $7) RETURNING id";

const INSERT_HOLD =
  "INSERT INTO g10_disbursement_holds (tenant_id, entity_id, hold_no, run_id, disbursement_id, employee_id, payslip_id, held_amount, reason, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric / 100, $9, $10, $11) RETURNING id";

const INSERT_RECONCILIATION =
  "INSERT INTO g10_payroll_reconciliations (tenant_id, entity_id, run_id, run_net, disbursed_total, held_total, failed_total, residual, signoff_status, created_by) " +
  "VALUES ($1, $2, $3, $4::numeric / 100, $5::numeric / 100, $6::numeric / 100, $7::numeric / 100, $8::numeric / 100, $9, $10) RETURNING id";

const SIGN_OFF_RECONCILIATION =
  "UPDATE g10_payroll_reconciliations SET signoff_status = 'SIGNED_OFF', signed_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2";

const INSERT_LOAN =
  "INSERT INTO g10_loans_advances (tenant_id, entity_id, employee_id, loan_type, sanctioned_principal, outstanding, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5::numeric / 100, $6::numeric / 100, $7, $8) RETURNING id";

const SELECT_OPEN_LOANS_FOR_UPDATE =
  "SELECT id, (outstanding * 100)::bigint AS outstanding_paise FROM g10_loans_advances " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND status = 'ACTIVE' AND is_deleted = false FOR UPDATE";

const SETTLE_LOAN_IN_FNF =
  "UPDATE g10_loans_advances SET status = 'SETTLED_IN_FNF', outstanding = 0, settled_in_fnf_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2";

const SELECT_OPEN_CARRYFORWARDS_FOR_UPDATE =
  "SELECT id, (outstanding * 100)::bigint AS outstanding_paise FROM g10_deduction_carryforwards " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND status IN ('OPEN','PARTIALLY_RECOVERED') AND is_deleted = false FOR UPDATE";

const RECOVER_CARRYFORWARD_IN_FNF =
  "UPDATE g10_deduction_carryforwards SET status = 'RECOVERED', recovered_to_date = original_amount, outstanding = 0, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const INSERT_FNF_SETTLEMENT =
  "INSERT INTO g10_fnf_settlements (tenant_id, entity_id, settlement_no, employee_id, separation_date, final_month_pay, leave_encashment, " +
  "gratuity, notice_pay_recovery, loan_settlement, carryforward_recovery, final_tds, net_settlement, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::numeric / 100, $7::numeric / 100, $8::numeric / 100, $9::numeric / 100, $10::numeric / 100, " +
  "$11::numeric / 100, $12::numeric / 100, $13::numeric / 100, $14, $15) RETURNING id";

const INSERT_RECOVERY_SCHEDULE =
  "INSERT INTO g10_recovery_schedules (tenant_id, entity_id, employee_id, penalty_order_id, penalty_order_no, period, ordered_total, " +
  "scheduled_per_cycle, recovered_to_date, net_pay_floor, attachment_cap, attachment_exemption_basis, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7::numeric / 100, $8::numeric / 100, $9::numeric / 100, $10::numeric / 100, $11::numeric / 100, $12, $13, $14) RETURNING id";

/** Postgres-backed G10 compensation-integration repository (migration 0017 tables). */
export class PgCompensationIntegrationRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * FR-14: persist one prepared bank batch atomically — the E21 header, its payee lines,
   * and the E31 hold rows for excluded net pay commit in ONE transaction so the tie-out
   * equation Σ disbursed + Σ held + Σ failed = run net can never observe a partial write.
   */
  async insertDisbursementWithHolds(input: {
    tenantId: string;
    entityId?: string;
    createdBy?: string;
    header: {
      batchNo: string;
      runId: string;
      bankBatchRef: string;
      totalAmountPaise: number;
      lineCount: number;
      disbursedTotalPaise: number;
      heldTotalPaise: number;
      failedTotalPaise: number;
    };
    lines: { employeeId: string; payslipId: string; amountPaise: number; status: DisbursementLineStatus }[];
    holds: { holdNo: string; employeeId: string; payslipId?: string; heldAmountPaise: number; reason: HoldReason }[];
  }): Promise<{ disbursementId: string }> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(INSERT_DISBURSEMENT, [
        input.tenantId,
        input.entityId ?? null,
        input.header.batchNo,
        input.header.runId,
        input.header.bankBatchRef,
        input.header.totalAmountPaise,
        input.header.lineCount,
        input.header.disbursedTotalPaise,
        input.header.heldTotalPaise,
        input.header.failedTotalPaise,
        "PREPARED",
        input.createdBy ?? null,
      ]);
      const disbursementId = (inserted.rows[0] as { id: string }).id;
      for (const line of input.lines) {
        await client.query(INSERT_DISBURSEMENT_LINE, [
          input.tenantId,
          input.entityId ?? null,
          disbursementId,
          line.employeeId,
          line.payslipId,
          line.amountPaise,
          line.status,
        ]);
      }
      for (const hold of input.holds) {
        await client.query(INSERT_HOLD, [
          input.tenantId,
          input.entityId ?? null,
          hold.holdNo,
          input.header.runId,
          disbursementId,
          hold.employeeId,
          hold.payslipId ?? null,
          hold.heldAmountPaise,
          hold.reason,
          "HELD",
          input.createdBy ?? null,
        ]);
      }
      return { disbursementId };
    });
  }

  /** E22: persist the balanced tie-out result (residual must be zero at the service layer). */
  async insertReconciliation(input: {
    tenantId: string;
    entityId?: string;
    runId: string;
    runNetPaise: number;
    disbursedTotalPaise: number;
    heldTotalPaise: number;
    failedTotalPaise: number;
    residualPaise: number;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_RECONCILIATION, [
      input.tenantId,
      input.entityId ?? null,
      input.runId,
      input.runNetPaise,
      input.disbursedTotalPaise,
      input.heldTotalPaise,
      input.failedTotalPaise,
      input.residualPaise,
      "BALANCED",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  /** Sign-off SoD (signer distinctness) is enforced at the service layer before this write. */
  async signOffReconciliation(tenantId: string, reconciliationId: string, signedBy: string): Promise<void> {
    await this.pool.query(SIGN_OFF_RECONCILIATION, [tenantId, reconciliationId, signedBy]);
  }

  async insertLoan(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    loanType: string;
    sanctionedPrincipalPaise: number;
    outstandingPaise: number;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_LOAN, [
      input.tenantId,
      input.entityId ?? null,
      input.employeeId,
      input.loanType,
      input.sanctionedPrincipalPaise,
      input.outstandingPaise,
      "ACTIVE",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  /**
   * FR-20: one consolidated FnF settlement in ONE transaction — lock and pull the open
   * loans_advances and deduction_carryforwards rows (FOR UPDATE), close them into the
   * settlement, and insert the E30 header. Any failure rolls the whole settlement back —
   * partial writes never survive.
   */
  async settleFnf(input: {
    tenantId: string;
    entityId?: string;
    settlementNo: string;
    employeeId: string;
    separationDate: string;
    finalMonthPayPaise: number;
    leaveEncashmentPaise: number;
    gratuityPaise: number;
    noticePayRecoveryPaise: number;
    finalTdsPaise: number;
    createdBy?: string;
  }): Promise<{ settlementId: string; netSettlementPaise: number; loanSettlementPaise: number; carryforwardRecoveryPaise: number }> {
    return withTransaction(this.pool, async (client) => {
      const loans = await client.query(SELECT_OPEN_LOANS_FOR_UPDATE, [input.tenantId, input.employeeId]);
      const carryforwards = await client.query(SELECT_OPEN_CARRYFORWARDS_FOR_UPDATE, [input.tenantId, input.employeeId]);
      const loanSettlementPaise = (loans.rows as { outstanding_paise: string }[]).reduce((total, row) => total + Number(row.outstanding_paise), 0);
      const carryforwardRecoveryPaise = (carryforwards.rows as { outstanding_paise: string }[]).reduce(
        (total, row) => total + Number(row.outstanding_paise),
        0
      );
      const netSettlementPaise =
        input.finalMonthPayPaise +
        input.leaveEncashmentPaise +
        input.gratuityPaise -
        input.noticePayRecoveryPaise -
        loanSettlementPaise -
        carryforwardRecoveryPaise -
        input.finalTdsPaise;
      const inserted = await client.query(INSERT_FNF_SETTLEMENT, [
        input.tenantId,
        input.entityId ?? null,
        input.settlementNo,
        input.employeeId,
        input.separationDate,
        input.finalMonthPayPaise,
        input.leaveEncashmentPaise,
        input.gratuityPaise,
        input.noticePayRecoveryPaise,
        loanSettlementPaise,
        carryforwardRecoveryPaise,
        input.finalTdsPaise,
        netSettlementPaise,
        netSettlementPaise < 0 ? "RECOVERY_PENDING" : "COMPUTED",
        input.createdBy ?? null,
      ]);
      const settlementId = (inserted.rows[0] as { id: string }).id;
      for (const row of loans.rows as { id: string }[]) {
        await client.query(SETTLE_LOAN_IN_FNF, [input.tenantId, row.id, settlementId]);
      }
      for (const row of carryforwards.rows as { id: string }[]) {
        await client.query(RECOVER_CARRYFORWARD_IN_FNF, [input.tenantId, row.id]);
      }
      return { settlementId, netSettlementPaise, loanSettlementPaise, carryforwardRecoveryPaise };
    });
  }

  async insertRecoverySchedule(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    penaltyOrderId: string;
    penaltyOrderNo: string;
    period: string;
    orderedTotalPaise: number;
    scheduledPerCyclePaise: number;
    netPayFloorPaise: number;
    attachmentCapPaise: number;
    attachmentExemptionBasis: string;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_RECOVERY_SCHEDULE, [
      input.tenantId,
      input.entityId ?? null,
      input.employeeId,
      input.penaltyOrderId,
      input.penaltyOrderNo,
      input.period,
      input.orderedTotalPaise,
      input.scheduledPerCyclePaise,
      0,
      input.netPayFloorPaise,
      input.attachmentCapPaise,
      input.attachmentExemptionBasis,
      "SCHEDULED",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }
}
