import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { DisciplinaryService } from "../g09/disciplinaryService";
import { ServiceRegisterService, SrIngestResult } from "../g12/serviceRegisterService";
import {
  BankDisbursement,
  BankDisbursementLine,
  CompensationIntegrationRepository,
  DisbursementHold,
  FnfSettlement,
  HoldReason,
  LoanAdvance,
  PayrollReconciliation,
  RecoverySchedule,
} from "./compensationIntegrationRepository";
import { DeductionCarryforward, PayrollEngineRepository } from "./payrollEngineRepository";
import { PayrollEngineService } from "./payrollEngineService";

/**
 * PH-09D — G10 compensation integration, SoD, and provenance (BRD G10 FR-09/14/15/20/23):
 *
 * - FR-14 bank disbursement (E21 bank_disbursements + E31 disbursement_holds): a LOCKED
 *   run's net pay splits into disbursed / held / failed on real ledger rows; excluded or
 *   failed net pay is parked in the suspense ledger, never silently removed.
 * - FR-15 reconciliation (E22 payroll_reconciliations): the tie-out equation
 *   Σ disbursed + Σ held + Σ failed = run net is an exact integer-paise equation with NO
 *   tolerance window; any residual blocks with ERR-G10-RECON-TIEOUT (VAL-G10-TIEOUT).
 *   Sign-off SoD enforces ACTOR IDENTITY: the signer must differ from the run maker and
 *   the run approver; unsigned or same-actor sign-off rejects with ERR-G10-RECON-UNSIGNED,
 *   and disbursement cannot complete until the reconciliation is SIGNED_OFF.
 * - FR-09 recovery scheduling from G09 penalty orders: bounded by BOTH the protected
 *   net-pay floor and the CPC s.60 attachment cap (both are seeded configuration with a
 *   recorded statutory basis — never an invented fraction). A barred recovery raises
 *   ERR-G10-RECOVERY-BARRED and books the residue into deduction_carryforwards (E35).
 * - FR-20 FnF (E30 fnf_settlements): ONE consolidated settlement pulling final pay, the
 *   open loans_advances balances, and the open deduction_carryforwards — computed fully
 *   before anything persists, so a failure never leaves a partial settlement behind
 *   (the Pg repository runs the same consolidation in one transaction).
 * - FR-23 SR provenance: pay events (PAY_FIXATION / ANNUAL_INCREMENT / INCREMENT_WITHHELD /
 *   PAY_PROTECTION) post through the G12 ingest contract with source_module="G10" and a
 *   DETERMINISTIC fact_key so replays dedup semantically. G10 never appends to the SR
 *   ledger directly — the ingest service is the only writer.
 *
 * All money is integer paise (integer minor units); no float parsing anywhere.
 */

const G10_SR_EVENT_TYPES = ["PAY_FIXATION", "ANNUAL_INCREMENT", "INCREMENT_WITHHELD", "PAY_PROTECTION"] as const;
export type G10SrEventType = (typeof G10_SR_EVENT_TYPES)[number];

export type AccountStatus = "VALID" | "INVALID_ACCOUNT" | "MISSING_ACCOUNT" | "FROZEN_ACCOUNT";

/** FR-09 recovery bounds — seeded configuration with a recorded basis, not statutory claims. */
export interface RecoveryPolicy {
  /** Protected net-pay floor in basis points of gross (distinct from the attachment exemption). */
  netPayFloorBps: number;
  /** Maximum attachable portion of net pay in basis points (CPC s.60 cap — seeded, not invented). */
  attachmentCapBps: number;
  /** Recorded statutory basis for the cap (e.g. "CPC s.60(1) proviso"); persisted on every schedule. */
  attachmentExemptionBasis: string;
}

const HOLD_REASON_BY_STATUS: Record<Exclude<AccountStatus, "VALID">, HoldReason> = {
  INVALID_ACCOUNT: "INVALID_ACCOUNT",
  MISSING_ACCOUNT: "MISSING_ACCOUNT",
  FROZEN_ACCOUNT: "FROZEN_ACCOUNT",
};

export class CompensationIntegrationService {
  private recoveryPolicy?: RecoveryPolicy;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly payrollEngine: PayrollEngineService,
    private readonly engineRepository: PayrollEngineRepository,
    private readonly disciplinary: DisciplinaryService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly repository: CompensationIntegrationRepository
  ) {}

  /**
   * FR-09 bounds configuration. The CPC s.60 attachment cap is CONFIGURATION seeded by the
   * competent authority with its statutory basis recorded — this module never invents the
   * fraction, and recovery scheduling fails closed until the cap is configured.
   */
  configureRecoveryPolicy(actor: ActorContext, input: RecoveryPolicy): RecoveryPolicy {
    this.authorization.check(actor, "g10.payroll.recovery.configure", actor);
    for (const [field, value] of [
      ["netPayFloorBps", input.netPayFloorBps],
      ["attachmentCapBps", input.attachmentCapBps],
    ] as const) {
      if (!Number.isInteger(value) || value < 0 || value > 10000) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be an integer between 0 and 10000`, { field });
      }
    }
    if (!input.attachmentExemptionBasis || !input.attachmentExemptionBasis.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "attachmentExemptionBasis must record the statutory basis of the cap", {
        field: "attachmentExemptionBasis",
      });
    }
    this.recoveryPolicy = { ...input };
    this.audit.recordMutation(actor, {
      action: "G10_RECOVERY_POLICY_CONFIGURED",
      subjectRef: "g10_recovery_policy:default",
      metadata: { ...input },
    });
    return { ...this.recoveryPolicy };
  }

  /**
   * FR-14: prepare the bank batch (E21 bank_disbursements) from a LOCKED run's PUBLISHED
   * payslips. Excluded accounts (invalid/missing/frozen) park their net pay in E31
   * disbursement_holds; ack failures become FAILED lines. The split is persisted on real
   * ledger rows so the FR-15 tie-out sums actual money, never cached totals.
   */
  prepareBankDisbursement(
    actor: ActorContext,
    runId: string,
    input: { bankBatchRef: string; accountStatusByEmployee?: Record<string, AccountStatus>; failedCreditEmployeeIds?: string[] }
  ): { disbursement: BankDisbursement; lines: BankDisbursementLine[]; holds: DisbursementHold[] } {
    this.authorization.check(actor, "g10.payroll.disburse", actor);
    if (!input.bankBatchRef || !input.bankBatchRef.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "bankBatchRef is required (positive-pay batch reference)", { field: "bankBatchRef" });
    }
    const run = this.payrollEngine.getEngineRun(actor, runId);
    if (run.status !== "LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "Bank file generation requires a LOCKED run");
    }
    if (this.repository.findDisbursementByRun(actor, runId)) {
      throw new FoundationError("CONFLICT", "A bank disbursement batch already exists for this run (positive pay)", {
        details: { runId },
      });
    }
    const accountStatus = input.accountStatusByEmployee ?? {};
    const failedCredits = new Set(input.failedCreditEmployeeIds ?? []);
    const disbursementId = nextId("bank-disbursement", this.repository.countDisbursements());
    const lines: BankDisbursementLine[] = [];
    const holds: DisbursementHold[] = [];
    let disbursedTotal = 0;
    let heldTotal = 0;
    let failedTotal = 0;
    for (const { payslip } of this.payrollEngine.listRunPayslips(actor, runId)) {
      if (payslip.status !== "PUBLISHED" || payslip.netPayCents <= 0) {
        continue;
      }
      const status = accountStatus[payslip.employeeId] ?? "VALID";
      if (status !== "VALID") {
        // BR1: excluded net pay is parked in the suspense ledger, never silently removed.
        heldTotal += payslip.netPayCents;
        holds.push({
          id: nextId("disbursement-hold", this.repository.countHolds() + holds.length),
          tenantId: actor.tenantId,
          entityId: actor.entityId,
          holdNo: `HOLD-${run.period}-${String(this.repository.countHolds() + holds.length + 1).padStart(4, "0")}`,
          runId,
          disbursementId,
          employeeId: payslip.employeeId,
          payslipId: payslip.id,
          heldAmountPaise: payslip.netPayCents,
          reason: HOLD_REASON_BY_STATUS[status],
          status: "HELD",
        });
        continue;
      }
      const failed = failedCredits.has(payslip.employeeId);
      if (failed) {
        failedTotal += payslip.netPayCents;
      } else {
        disbursedTotal += payslip.netPayCents;
      }
      lines.push({
        id: nextId("disbursement-line", lines.length),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        disbursementId,
        employeeId: payslip.employeeId,
        payslipId: payslip.id,
        amountPaise: payslip.netPayCents,
        status: failed ? "FAILED" : "DISBURSED",
      });
    }
    const disbursement: BankDisbursement = {
      id: disbursementId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      batchNo: `BATCH-${run.period}-${String(this.repository.countDisbursements() + 1).padStart(4, "0")}`,
      runId,
      bankBatchRef: input.bankBatchRef,
      totalAmountPaise: disbursedTotal + heldTotal + failedTotal,
      lineCount: lines.length,
      disbursedTotalPaise: disbursedTotal,
      heldTotalPaise: heldTotal,
      failedTotalPaise: failedTotal,
      status: "PREPARED",
      createdBy: actor.userId,
    };
    // Compute-then-commit: header, lines, and holds persist together after the full split
    // is built (the Pg repository commits the same rows in one transaction).
    this.repository.saveDisbursement(disbursement);
    for (const line of lines) {
      this.repository.saveDisbursementLine(line);
    }
    for (const hold of holds) {
      this.repository.saveHold(hold);
    }
    this.audit.recordMutation(actor, {
      action: "G10_BANK_DISBURSEMENT_PREPARED",
      subjectRef: `g10_bank_disbursements:${disbursement.id}`,
      metadata: {
        runId,
        bankBatchRef: disbursement.bankBatchRef,
        disbursedTotalPaise: disbursedTotal,
        heldTotalPaise: heldTotal,
        failedTotalPaise: failedTotal,
      },
    });
    return { disbursement: { ...disbursement }, lines: lines.map((line) => ({ ...line })), holds: holds.map((hold) => ({ ...hold })) };
  }

  /**
   * E31 write-off: a hold is never silently removed — writing one off keeps the row (audit
   * trail) but drops it from the suspense sum, so the FR-15 tie-out immediately surfaces
   * the unaccounted money as ERR-G10-RECON-TIEOUT. That is the control working.
   */
  writeOffHold(actor: ActorContext, holdId: string, input: { reason: string }): DisbursementHold {
    this.authorization.check(actor, "g10.payroll.hold.writeoff", actor);
    const hold = this.repository.findHold(actor, holdId);
    if (!hold) {
      throw new FoundationError("NOT_FOUND", "Disbursement hold not found");
    }
    if (hold.status !== "HELD") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a HELD suspense row can be written off");
    }
    if (!input.reason || !input.reason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Hold write-off requires a reason", { field: "reason" });
    }
    hold.status = "WRITTEN_OFF";
    hold.writtenOffBy = actor.userId;
    hold.writeOffReason = input.reason;
    this.repository.saveHold(hold);
    this.audit.recordMutation(actor, {
      action: "G10_DISBURSEMENT_HOLD_WRITTEN_OFF",
      subjectRef: `g10_disbursement_holds:${hold.id}`,
      metadata: { runId: hold.runId, heldAmountPaise: hold.heldAmountPaise, reason: input.reason },
    });
    return { ...hold };
  }

  /**
   * FR-15 tie-out (VAL-G10-TIEOUT): Σ disbursed + Σ held + Σ failed must equal the run net
   * EXACTLY, summed over the real disbursement lines and surviving (HELD/REDISBURSED)
   * suspense rows in integer paise — no tolerance window. Any residual blocks with
   * ERR-G10-RECON-TIEOUT (409) and no reconciliation row is written.
   */
  reconcileDisbursement(actor: ActorContext, runId: string): PayrollReconciliation {
    this.authorization.check(actor, "g10.payroll.reconcile", actor);
    const run = this.payrollEngine.getEngineRun(actor, runId);
    const disbursement = this.repository.findDisbursementByRun(actor, runId);
    if (!disbursement) {
      throw new FoundationError("PRECONDITION_FAILED", "No bank disbursement batch exists for this run");
    }
    let disbursedTotal = 0;
    let failedTotal = 0;
    for (const line of this.repository.listDisbursementLines(actor, disbursement.id)) {
      if (line.status === "FAILED") {
        failedTotal += line.amountPaise;
      } else {
        disbursedTotal += line.amountPaise;
      }
    }
    let heldTotal = 0;
    for (const hold of this.repository.listHoldsForRun(actor, runId)) {
      if (hold.status === "HELD" || hold.status === "REDISBURSED") {
        heldTotal += hold.heldAmountPaise;
      }
    }
    const residual = run.netTotalCents - (disbursedTotal + heldTotal + failedTotal);
    if (residual !== 0) {
      throw new FoundationError("ERR-G10-RECON-TIEOUT", "Disbursement tie-out failed: disbursed + held + failed does not equal run net", {
        details: {
          validation: "VAL-G10-TIEOUT",
          runNetPaise: run.netTotalCents,
          disbursedTotalPaise: disbursedTotal,
          heldTotalPaise: heldTotal,
          failedTotalPaise: failedTotal,
          residualPaise: residual,
        },
      });
    }
    const existing = this.repository.findReconciliationByRun(actor, runId);
    const reconciliation: PayrollReconciliation = {
      id: existing?.id ?? nextId("payroll-reconciliation", this.repository.countReconciliations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      runId,
      runNetPaise: run.netTotalCents,
      disbursedTotalPaise: disbursedTotal,
      heldTotalPaise: heldTotal,
      failedTotalPaise: failedTotal,
      residualPaise: 0,
      validation: "VAL-G10-TIEOUT",
      status: "BALANCED",
    };
    this.repository.saveReconciliation(reconciliation);
    this.audit.recordMutation(actor, {
      action: "G10_RECONCILIATION_BALANCED",
      subjectRef: `g10_payroll_reconciliations:${reconciliation.id}`,
      metadata: { runId, validation: "VAL-G10-TIEOUT", disbursedTotalPaise: disbursedTotal, heldTotalPaise: heldTotal, failedTotalPaise: failedTotal },
    });
    return { ...reconciliation };
  }

  /**
   * FR-15 AC3/BR3 sign-off SoD — ACTOR IDENTITY, not a boolean flag: the signer must
   * differ from BOTH the run maker and the run approver. A same-actor sign-off rejects
   * with ERR-G10-RECON-UNSIGNED (409) and the reconciliation stays unsigned.
   */
  signOffReconciliation(actor: ActorContext, runId: string): PayrollReconciliation {
    this.authorization.check(actor, "g10.payroll.recon.signoff", actor);
    const run = this.payrollEngine.getEngineRun(actor, runId);
    const reconciliation = this.repository.findReconciliationByRun(actor, runId);
    if (!reconciliation || reconciliation.status !== "BALANCED") {
      throw new FoundationError("PRECONDITION_FAILED", "A balanced reconciliation is required before sign-off");
    }
    if (actor.userId === run.makerUserId || actor.userId === run.approvedByUserId) {
      throw new FoundationError("ERR-G10-RECON-UNSIGNED", "Reconciliation sign-off requires a signer distinct from the run maker and approver", {
        details: { marker: "PAYROLL_SOD", runId, makerUserId: run.makerUserId, approvedByUserId: run.approvedByUserId },
      });
    }
    reconciliation.status = "SIGNED_OFF";
    reconciliation.signedByUserId = actor.userId;
    this.repository.saveReconciliation(reconciliation);
    this.audit.recordMutation(actor, {
      action: "G10_RECONCILIATION_SIGNED_OFF",
      subjectRef: `g10_payroll_reconciliations:${reconciliation.id}`,
      metadata: { runId, signedByUserId: actor.userId },
    });
    return { ...reconciliation };
  }

  /**
   * FR-14/FR-16 gate: disbursement completes ONLY behind a SIGNED_OFF reconciliation —
   * an unsigned reconciliation blocks with ERR-G10-RECON-UNSIGNED (409). Completing marks
   * the run transmitted (reopen is blocked afterwards, ERR-G10-REOPEN-BLOCKED).
   */
  completeDisbursement(actor: ActorContext, runId: string): BankDisbursement {
    this.authorization.check(actor, "g10.payroll.disburse", actor);
    const disbursement = this.repository.findDisbursementByRun(actor, runId);
    if (!disbursement) {
      throw new FoundationError("PRECONDITION_FAILED", "No bank disbursement batch exists for this run");
    }
    const reconciliation = this.repository.findReconciliationByRun(actor, runId);
    if (!reconciliation || reconciliation.status !== "SIGNED_OFF") {
      throw new FoundationError("ERR-G10-RECON-UNSIGNED", "Disbursement cannot complete before the reconciliation is signed off", {
        details: { runId },
      });
    }
    disbursement.status = "COMPLETED";
    this.repository.saveDisbursement(disbursement);
    this.payrollEngine.markRunTransmitted(actor, runId);
    this.audit.recordMutation(actor, {
      action: "G10_BANK_DISBURSEMENT_COMPLETED",
      subjectRef: `g10_bank_disbursements:${disbursement.id}`,
      metadata: { runId, reconciliationId: reconciliation.id },
    });
    return { ...disbursement };
  }

  /** E16 loans_advances: sanction a loan/advance (FnF pulls the open outstanding balance). */
  addLoanAdvance(
    actor: ActorContext,
    input: { employeeId: string; loanType: string; sanctionedPrincipalPaise: number; outstandingPaise?: number }
  ): LoanAdvance {
    this.authorization.check(actor, "g10.loan.write", actor);
    if (!Number.isInteger(input.sanctionedPrincipalPaise) || input.sanctionedPrincipalPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "sanctionedPrincipalPaise must be positive integer paise", { field: "sanctionedPrincipalPaise" });
    }
    const outstanding = input.outstandingPaise ?? input.sanctionedPrincipalPaise;
    if (!Number.isInteger(outstanding) || outstanding < 0 || outstanding > input.sanctionedPrincipalPaise) {
      throw new FoundationError("VALIDATION_FAILED", "outstandingPaise must be integer paise within the sanctioned principal", { field: "outstandingPaise" });
    }
    const loan: LoanAdvance = {
      id: nextId("loan-advance", this.repository.countLoans()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      loanType: input.loanType,
      sanctionedPrincipalPaise: input.sanctionedPrincipalPaise,
      outstandingPaise: outstanding,
      status: "ACTIVE",
    };
    this.repository.saveLoan(loan);
    this.audit.recordMutation(actor, {
      action: "G10_LOAN_ADVANCE_SANCTIONED",
      subjectRef: `g10_loans_advances:${loan.id}`,
      metadata: { employeeId: loan.employeeId, loanType: loan.loanType, outstandingPaise: loan.outstandingPaise },
    });
    return { ...loan };
  }

  /**
   * FR-09: schedule a recovery from a G09 penalty order, bounded by BOTH the protected
   * net-pay floor and the CPC s.60 attachment cap over the employee's latest surviving
   * payslip. A request beyond the bound is BARRED: the residue is booked into
   * deduction_carryforwards (E35) and the call rejects with ERR-G10-RECOVERY-BARRED —
   * the barred amount is rolled forward, never silently recovered.
   */
  scheduleRecoveryFromPenaltyOrder(
    actor: ActorContext,
    input: { penaltyOrderId: string; period: string; orderedTotalPaise: number; requestedPerCyclePaise: number }
  ): RecoverySchedule {
    this.authorization.check(actor, "g10.payroll.recovery.write", actor);
    const policy = this.recoveryPolicy;
    if (!policy) {
      // Fail closed: the statutory cap is seeded configuration — never an invented fraction.
      throw new FoundationError("PRECONDITION_FAILED", "Recovery bounds (net-pay floor + CPC s.60 attachment cap) are not configured", {
        details: { field: "recoveryPolicy" },
      });
    }
    for (const [field, value] of [
      ["orderedTotalPaise", input.orderedTotalPaise],
      ["requestedPerCyclePaise", input.requestedPerCyclePaise],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be positive integer paise`, { field });
      }
    }
    if (input.requestedPerCyclePaise > input.orderedTotalPaise) {
      throw new FoundationError("VALIDATION_FAILED", "Per-cycle recovery cannot exceed the ordered total (AC2)", { field: "requestedPerCyclePaise" });
    }
    // Hard upstream linkage: the schedule ties to a real G09 penalty order — no silent stubs.
    const order = this.disciplinary.getPenaltyOrder(actor, input.penaltyOrderId);
    const payslip = this.payrollEngine.findLatestPublishedPayslip(actor, order.employeeId);
    if (!payslip) {
      throw new FoundationError("PRECONDITION_FAILED", "No surviving payslip exists to bound the recovery against", {
        details: { employeeId: order.employeeId },
      });
    }
    const floorPaise = intMulDiv(payslip.grossCents, policy.netPayFloorBps, 10000);
    const attachmentCapPaise = intMulDiv(payslip.netPayCents, policy.attachmentCapBps, 10000);
    const allowedPerCyclePaise = Math.max(0, Math.min(payslip.netPayCents - floorPaise, attachmentCapPaise));
    if (input.requestedPerCyclePaise > allowedPerCyclePaise) {
      const residuePaise = input.requestedPerCyclePaise - allowedPerCyclePaise;
      // Book the barred residue forward (E35) so the money stays accounted, then reject.
      // The engine repository stores integer minor units under its *Cents field names.
      const carryforward: DeductionCarryforward = {
        id: nextId("deduction-carryforward", this.engineRepository.countCarryforwards()),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        employeeId: order.employeeId,
        sourceType: "DISCIPLINARY",
        sourceRef: `g09_penalty_orders:${order.id}`,
        originalAmountCents: residuePaise,
        recoveredToDateCents: 0,
        outstandingCents: residuePaise,
        status: "OPEN",
      };
      this.engineRepository.saveCarryforward(carryforward);
      this.audit.recordMutation(actor, {
        action: "G10_RECOVERY_BARRED_RESIDUE_BOOKED",
        subjectRef: `g10_deduction_carryforwards:${carryforward.id}`,
        metadata: { penaltyOrderId: order.id, residuePaise, code: "ERR-G10-RECOVERY-BARRED" },
      });
      throw new FoundationError("ERR-G10-RECOVERY-BARRED", "Recovery exceeds the net-pay floor / CPC s.60 attachment bound and is barred", {
        details: {
          penaltyOrderId: order.id,
          requestedPerCyclePaise: input.requestedPerCyclePaise,
          allowedPerCyclePaise,
          netPayFloorPaise: floorPaise,
          attachmentCapPaise,
          attachmentExemptionBasis: policy.attachmentExemptionBasis,
          carryforwardId: carryforward.id,
        },
      });
    }
    const schedule: RecoverySchedule = {
      id: nextId("recovery-schedule", this.repository.countRecoverySchedules()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: order.employeeId,
      penaltyOrderId: order.id,
      penaltyOrderNo: order.orderNo,
      period: input.period,
      orderedTotalPaise: input.orderedTotalPaise,
      scheduledPerCyclePaise: input.requestedPerCyclePaise,
      recoveredToDatePaise: 0,
      netPayFloorPaise: floorPaise,
      attachmentCapPaise,
      attachmentExemptionBasis: policy.attachmentExemptionBasis,
      status: "SCHEDULED",
    };
    this.repository.saveRecoverySchedule(schedule);
    // Queue the bounded per-cycle demand into the engine (the FR-09 floor re-applies at compute).
    this.payrollEngine.addRecoveryDemand(actor, {
      employeeId: order.employeeId,
      period: input.period,
      amountCents: input.requestedPerCyclePaise,
      sourceType: "DISCIPLINARY",
      sourceRef: `g09_penalty_orders:${order.id}`,
    });
    this.audit.recordMutation(actor, {
      action: "G10_RECOVERY_SCHEDULED",
      subjectRef: `g10_recovery_schedules:${schedule.id}`,
      metadata: {
        penaltyOrderId: order.id,
        period: input.period,
        scheduledPerCyclePaise: schedule.scheduledPerCyclePaise,
        attachmentExemptionBasis: policy.attachmentExemptionBasis,
      },
    });
    return { ...schedule };
  }

  /**
   * FR-20 (E30 fnf_settlements): ONE consolidated settlement — final pay, leave encashment,
   * gratuity, notice recovery, the OPEN loans_advances balances, the OPEN
   * deduction_carryforwards, and the final TDS true-up net into a single record. The whole
   * consolidation is computed before anything persists; loans flip to SETTLED_IN_FNF and
   * carryforwards to RECOVERED together with the settlement (one transaction in the Pg
   * repository). A negative net is RECOVERY_PENDING — never a silent write-off.
   */
  settleFnf(
    actor: ActorContext,
    input: {
      employeeId: string;
      separationDate: string;
      finalMonthPayPaise: number;
      leaveEncashmentPaise?: number;
      gratuityPaise?: number;
      noticePayRecoveryPaise?: number;
      finalTdsPaise?: number;
    }
  ): FnfSettlement {
    this.authorization.check(actor, "g10.fnf.settle", actor);
    const components = {
      finalMonthPayPaise: input.finalMonthPayPaise,
      leaveEncashmentPaise: input.leaveEncashmentPaise ?? 0,
      gratuityPaise: input.gratuityPaise ?? 0,
      noticePayRecoveryPaise: input.noticePayRecoveryPaise ?? 0,
      finalTdsPaise: input.finalTdsPaise ?? 0,
    };
    for (const [field, value] of Object.entries(components)) {
      if (!Number.isInteger(value) || value < 0) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be non-negative integer paise`, { field });
      }
    }
    if (this.repository.listFnfSettlements(actor, input.employeeId).length > 0) {
      throw new FoundationError("CONFLICT", "An FnF settlement already exists for this employee (AC1: single consolidated record)");
    }
    // Pull the open dues: E16 loans_advances + E35 deduction_carryforwards (FR-20 AC4).
    const openLoans = this.repository.listLoansForEmployee(actor, input.employeeId).filter((loan) => loan.status === "ACTIVE");
    const openCarryforwards = this.engineRepository
      .listCarryforwards(actor, input.employeeId)
      .filter((row) => row.status === "OPEN" || row.status === "PARTIALLY_RECOVERED");
    const loanSettlementPaise = openLoans.reduce((total, loan) => total + loan.outstandingPaise, 0);
    const carryforwardRecoveryPaise = openCarryforwards.reduce((total, row) => total + row.outstandingCents, 0);
    const netSettlementPaise =
      components.finalMonthPayPaise +
      components.leaveEncashmentPaise +
      components.gratuityPaise -
      components.noticePayRecoveryPaise -
      loanSettlementPaise -
      carryforwardRecoveryPaise -
      components.finalTdsPaise;
    const settlement: FnfSettlement = {
      id: nextId("fnf-settlement", this.repository.countFnfSettlements()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      settlementNo: `FNF-${input.separationDate.slice(0, 7)}-${String(this.repository.countFnfSettlements() + 1).padStart(4, "0")}`,
      employeeId: input.employeeId,
      separationDate: input.separationDate,
      ...components,
      loanSettlementPaise,
      carryforwardRecoveryPaise,
      netSettlementPaise,
      loanRefs: openLoans.map((loan) => loan.id),
      carryforwardRefs: openCarryforwards.map((row) => row.id),
      status: netSettlementPaise < 0 ? "RECOVERY_PENDING" : "COMPUTED",
      createdBy: actor.userId,
    };
    // Compute-then-commit: the settlement, loan closures, and carryforward closures are
    // built first, then persisted together (the Pg repository does this in one transaction).
    this.repository.saveFnfSettlement(settlement);
    for (const loan of openLoans) {
      this.repository.saveLoan({ ...loan, status: "SETTLED_IN_FNF", outstandingPaise: 0, settledInFnfId: settlement.id });
    }
    for (const row of openCarryforwards) {
      this.engineRepository.saveCarryforward({
        ...row,
        status: "RECOVERED",
        recoveredToDateCents: row.originalAmountCents,
        outstandingCents: 0,
      });
    }
    this.audit.recordMutation(actor, {
      action: "G10_FNF_SETTLED",
      subjectRef: `g10_fnf_settlements:${settlement.id}`,
      metadata: {
        employeeId: settlement.employeeId,
        netSettlementPaise,
        loanSettlementPaise,
        carryforwardRecoveryPaise,
        status: settlement.status,
      },
    });
    return { ...settlement, loanRefs: [...settlement.loanRefs], carryforwardRefs: [...settlement.carryforwardRefs] };
  }

  /** FR-20 AC3 SoD: fnf_settlements.approved_by ≠ created_by — same-actor approval rejects. */
  approveFnfSettlement(actor: ActorContext, settlementId: string): FnfSettlement {
    this.authorization.check(actor, "g10.fnf.approve", actor);
    const settlement = this.repository.findFnfSettlement(actor, settlementId);
    if (!settlement) {
      throw new FoundationError("NOT_FOUND", "FnF settlement not found");
    }
    if (settlement.status !== "COMPUTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a COMPUTED FnF settlement can be approved");
    }
    if (settlement.createdBy === actor.userId) {
      throw new FoundationError("PRECONDITION_FAILED", "FNF_SOD blocks the settlement creator from approving", { details: { marker: "FNF_SOD" } });
    }
    settlement.status = "APPROVED";
    settlement.approvedBy = actor.userId;
    this.repository.saveFnfSettlement(settlement);
    this.audit.recordMutation(actor, { action: "G10_FNF_APPROVED", subjectRef: `g10_fnf_settlements:${settlement.id}` });
    return { ...settlement, loanRefs: [...settlement.loanRefs], carryforwardRefs: [...settlement.carryforwardRefs] };
  }

  /**
   * FR-23 SR posting contract — PROVENANCE DISCIPLINE: G10 posts pay events exclusively
   * through the G12 ingest service (the module is a relay; it never appends to the SR
   * ledger itself). The fact_key is DERIVED deterministically from (eventType, employee,
   * eventDate) so a replayed posting dedups SEMANTICALLY: same fact, no second ledger row.
   */
  postPayEventToSr(
    actor: ActorContext,
    input: {
      employeeId: string;
      eventTypeCode: G10SrEventType;
      eventDate: string;
      sourceReferenceId: string;
      sourceEventVersion?: number;
      payload?: Record<string, unknown>;
      idempotencyKey: string;
    }
  ): SrIngestResult {
    this.authorization.check(actor, "g10.sr.post", actor);
    if (!G10_SR_EVENT_TYPES.includes(input.eventTypeCode)) {
      throw new FoundationError("VALIDATION_FAILED", "eventTypeCode must be one of the FR-G10-23 pay event codes", { field: "eventTypeCode" });
    }
    // FR-G10-23 AC2: the dedup tuple always carries a derived fact_key — never omitted.
    const factKey = `G10:${input.eventTypeCode}:${input.employeeId}:${input.eventDate}`;
    const result = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G10",
      sourceReferenceId: input.sourceReferenceId,
      sourceEventVersion: input.sourceEventVersion ?? 1,
      employeeId: input.employeeId,
      eventTypeCode: input.eventTypeCode,
      eventDate: input.eventDate,
      factKey,
      payload: { ...(input.payload ?? {}), marker: "G10_SR_POSTED" },
    });
    this.audit.recordMutation(actor, {
      action: "G10_SR_EVENT_POSTED",
      subjectRef: `g10_sr_postings:${result.event.id}`,
      metadata: {
        eventTypeCode: input.eventTypeCode,
        factKey,
        semanticDuplicate: result.semanticDuplicate,
        replayed: result.replayed,
        contract: "POST /api/v1/sr/ingest",
      },
    });
    return result;
  }

  listHolds(scope: TenantScope, runId: string): DisbursementHold[] {
    requireTenantScope(scope);
    return this.repository.listHoldsForRun(scope, runId).map((hold) => ({ ...hold }));
  }

  listRecoverySchedules(scope: TenantScope, employeeId?: string): RecoverySchedule[] {
    requireTenantScope(scope);
    return this.repository.listRecoverySchedules(scope, employeeId).map((row) => ({ ...row }));
  }

  listFnfSettlements(scope: TenantScope, employeeId?: string): FnfSettlement[] {
    requireTenantScope(scope);
    return this.repository
      .listFnfSettlements(scope, employeeId)
      .map((row) => ({ ...row, loanRefs: [...row.loanRefs], carryforwardRefs: [...row.carryforwardRefs] }));
  }

  listLoans(scope: TenantScope, employeeId: string): LoanAdvance[] {
    requireTenantScope(scope);
    return this.repository.listLoansForEmployee(scope, employeeId).map((row) => ({ ...row }));
  }
}

/** Integer money helper: round(amount * numerator / denominator) with safe-integer checks. */
function intMulDiv(amountPaise: number, numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new FoundationError("INTERNAL", "Division by zero in disbursement math");
  }
  const product = amountPaise * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new FoundationError("INTERNAL", "Disbursement math overflows deterministic integer arithmetic");
  }
  return Math.round(product / denominator);
}
