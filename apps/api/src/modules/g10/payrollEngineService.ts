import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { LeaveService } from "../g03/leaveService";
import { evaluateExpression, tokenizeExpression } from "./payRuleDsl";
import { PayRuleRepository, RateTableType, windowCovers } from "./payRuleRepository";
import {
  ArrearMonthDelta,
  CarryforwardSource,
  DeductionCarryforward,
  EngineArrear,
  EngineArrearType,
  EnginePayrollRun,
  EnginePayslip,
  EnginePayslipLine,
  EnginePayslipLineType,
  EngineRunMode,
  EngineRunSnapshot,
  PayrollEngineRepository,
  RecoveryDemand,
  SalaryEnrolment,
  SnapshotAttendanceFact,
  SnapshotRateRow,
  SnapshotRule,
} from "./payrollEngineRepository";

/**
 * PH-09B — G10 deterministic payroll run engine at BRD depth (FR-04/05/06/10/13/16/22):
 *
 * - Component DSL evaluation in validated computation order (VAL-G10-RULE-ORDER: forward or
 *   circular references reject before anything computes).
 * - Proration + LWP driven by the G03 payroll_attendance_feed consumed AT SNAPSHOT TIME
 *   (FR-05: attendance facts are pulled from G03 by reference, never hand-keyed into G10).
 * - Statutory deductions with rate-table caps and state-wise PT slabs (ERR-G10-PT-STATE
 *   fails closed when the state of posting has no slab mapping).
 * - payslips (E12) + payslip_lines (E13): the append-only line ledger is the YTD
 *   source-of-truth — VAL-G10-YTD-DERIVE sums surviving lines, never a running counter.
 * - Arrears engine (E20): delta = Σ over affected months of (new − old), recomputed with the
 *   month's own frozen snapshot rules; month-wise component-wise breakup persisted.
 * - Single-in-flight FINAL run guard (ERR-G10-RUN-INFLIGHT 409).
 * - Post-lock immutability (ERR-G10-RUN-IMMUTABLE 409); reopen SUPERSEDES: new versions are
 *   computed in a successor run and the originals flip to REVERSED — they are never edited.
 * - Net-pay floor (FR-09): recovery beyond the protected floor is held with
 *   ERR-G10-RECOVERY-NET and the excess is booked into deduction_carryforwards (E35).
 *
 * DETERMINISM: same snapshot + same rule versions => byte-identical payslip_lines on
 * recompute (ids, order, and amounts are all derived from the frozen snapshot). All money
 * is integer cents — this module contains no float parsing and no string rounding.
 */

const RATE_TABLE_TYPE_SET: ReadonlySet<string> = new Set<RateTableType>([
  "DA_RATE",
  "HRA_CLASS",
  "PT_SLAB",
  "TAX_SLAB",
  "NPS_RATE",
  "GPF_RATE",
  "GRATUITY_RATE",
  "OTHER",
]);

const IN_FLIGHT_STATUSES: ReadonlySet<string> = new Set(["QUEUED", "COMPUTED", "APPROVED"]);

export interface EnginePolicy {
  /** BRD FR-05 BR1: per-day LOP basis — actual calendar days or a fixed 30-day basis. */
  perDayBasis: "CALENDAR_DAYS" | "THIRTY_DAYS";
  /** BRD FR-09: protected net-pay floor as basis points of gross (recovery may not breach it). */
  netPayFloorBps: number;
}

export interface EngineYtdStatement {
  employeeId: string;
  /** VAL-G10-YTD-DERIVE: derived from the immutable payslip_lines ledger, never cached. */
  validation: "VAL-G10-YTD-DERIVE";
  byComponent: Record<string, number>;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  lineCount: number;
}

interface EmployeeComputation {
  lines: Omit<EnginePayslipLine, "id" | "payslipId" | "tenantId" | "entityId">[];
  componentValuesCents: Map<string, number>;
  grossCents: number;
  deductionsCents: number;
  lwpReductionCents: number;
  paidDaysHundredths: number;
  lwpDaysHundredths: number;
}

/** Org-wide override roles for the FR-G10-13/FR-G10-06 self-service payroll reads (P02 own-record
 *  scoping) — an HR/payroll admin may look up any employee's payslip/YTD, an employee may only
 *  read their own. */
const PAYROLL_SELF_SERVICE_OVERRIDE_ROLES = new Set(["hr_admin", "payroll_officer", "payroll_admin", "system"]);

export class PayrollEngineService {
  private policy: EnginePolicy = { perDayBasis: "CALENDAR_DAYS", netPayFloorBps: 5000 };

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly leave: LeaveService,
    private readonly payRuleRepository: PayRuleRepository,
    private readonly repository: PayrollEngineRepository
  ) {}

  /** Engine policy (per-day basis, net floor). Values are configuration, not statutory claims. */
  configurePolicy(actor: ActorContext, input: Partial<EnginePolicy>): EnginePolicy {
    this.authorization.check(actor, "g10.payroll.engine.configure", actor);
    const merged: EnginePolicy = { ...this.policy, ...input };
    if (!Number.isInteger(merged.netPayFloorBps) || merged.netPayFloorBps < 0 || merged.netPayFloorBps > 10000) {
      throw new FoundationError("VALIDATION_FAILED", "netPayFloorBps must be an integer between 0 and 10000", { field: "netPayFloorBps" });
    }
    this.policy = merged;
    this.audit.recordMutation(actor, { action: "G10_ENGINE_POLICY_CONFIGURED", subjectRef: "g10_engine_policy:default", metadata: { ...merged } });
    return { ...this.policy };
  }

  /** E09-analogue enrolment: FLAT component bases (integer cents) + state of posting for PT. */
  enrolEmployee(
    actor: ActorContext,
    input: { employeeId: string; stateOfPosting?: string; componentAmountsCents: Record<string, number>; effectiveFrom: string }
  ): SalaryEnrolment {
    this.authorization.check(actor, "g10.salary.write", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    for (const [componentCode, amountCents] of Object.entries(input.componentAmountsCents)) {
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        throw new FoundationError("VALIDATION_FAILED", `Amount for ${componentCode} must be non-negative integer cents`, { field: componentCode });
      }
    }
    const existing = this.repository.findEnrolment(actor, input.employeeId);
    const enrolment: SalaryEnrolment = {
      id: existing?.id ?? nextId("salary-enrolment", this.repository.countEnrolments()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      stateOfPosting: input.stateOfPosting,
      componentAmountsCents: { ...input.componentAmountsCents },
      effectiveFrom: input.effectiveFrom,
    };
    this.repository.saveEnrolment(enrolment);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_ENROLMENT_SAVED",
      subjectRef: `g10_employee_salary_structures:${enrolment.id}`,
      metadata: { employeeId: enrolment.employeeId, stateOfPosting: enrolment.stateOfPosting },
    });
    return { ...enrolment, componentAmountsCents: { ...enrolment.componentAmountsCents } };
  }

  /** FR-09: queue a recovery demand for a period; the net-pay floor governs how much applies. */
  addRecoveryDemand(
    actor: ActorContext,
    input: { employeeId: string; period: string; amountCents: number; sourceType: CarryforwardSource; sourceRef: string }
  ): RecoveryDemand {
    this.authorization.check(actor, "g10.payroll.recovery.write", actor);
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "amountCents must be positive integer cents", { field: "amountCents" });
    }
    const demand: RecoveryDemand = {
      id: nextId("recovery-demand", this.repository.countRecoveryDemands()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      period: input.period,
      amountCents: input.amountCents,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
    };
    this.repository.saveRecoveryDemand(demand);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_RECOVERY_DEMAND_ADDED",
      subjectRef: `g10_deductions:${demand.id}`,
      metadata: { employeeId: demand.employeeId, period: demand.period, sourceType: demand.sourceType },
    });
    return { ...demand };
  }

  /**
   * E11 payroll_runs: create a run. SINGLE-IN-FLIGHT GUARD (FR-04 AC6 / FR-16 AC5): a second
   * FINAL run for the same period while one is QUEUED/COMPUTED/APPROVED throws
   * ERR-G10-RUN-INFLIGHT (409) — mirroring the uq_g10_run_inflight partial unique index.
   */
  createEngineRun(actor: ActorContext, input: { period: string; runMode?: EngineRunMode }): EnginePayrollRun {
    this.authorization.check(actor, "g10.payroll.run.create", actor);
    if (!/^\d{4}-\d{2}$/.test(input.period)) {
      throw new FoundationError("VALIDATION_FAILED", "period must use YYYY-MM", { field: "period" });
    }
    const runMode: EngineRunMode = input.runMode ?? "FINAL";
    if (runMode === "FINAL") {
      const inflight = this.repository
        .listRuns(actor)
        .find((run) => run.period === input.period && run.runMode === "FINAL" && IN_FLIGHT_STATUSES.has(run.status));
      if (inflight) {
        throw new FoundationError("ERR-G10-RUN-INFLIGHT", `Another FINAL payroll run is in flight for ${input.period}`, {
          field: "period",
          details: { conflictingRunId: inflight.id, period: input.period, index: "uq_g10_run_inflight" },
        });
      }
    }
    const run: EnginePayrollRun = {
      id: nextId("engine-run", this.repository.countRuns()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      runNo: `RUN-${input.period}-${String(this.repository.countRuns() + 1).padStart(4, "0")}`,
      period: input.period,
      runMode,
      status: "QUEUED",
      grossTotalCents: 0,
      deductionTotalCents: 0,
      netTotalCents: 0,
      employeeCount: 0,
      makerUserId: actor.userId,
    };
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_RUN_CREATED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { period: run.period, runMode: run.runMode },
    });
    return this.cloneRun(run);
  }

  /**
   * FR-22 snapshot: freeze EVERYTHING compute may read — the G03 payroll_attendance_feed
   * (LWP facts pulled from G03 at snapshot time, FR-05), enrolments, recovery demands,
   * APPROVED arrears, effective rule versions, and the referenced rate-table rows. The
   * rule set is validated for computation order here (VAL-G10-RULE-ORDER).
   */
  snapshotRunInputs(actor: ActorContext, runId: string): EnginePayrollRun {
    this.authorization.check(actor, "g10.payroll.input.lock", actor);
    const run = this.requireRun(actor, runId);
    this.assertRunMutable(run);
    if (run.status !== "QUEUED") {
      throw new FoundationError("PRECONDITION_FAILED", "Run inputs can only be snapshot while the run is QUEUED");
    }
    const period = run.period;
    const calendarDays = daysInPeriod(period);
    // G03 feed consumed at snapshot time — attendance/LWP is never hand-keyed into G10.
    const attendanceFeed: SnapshotAttendanceFact[] = this.leave
      .listPayrollFeed(actor, period)
      .map((row) => ({ employeeId: row.employeeId, lwpDays: row.lwpDays, halfPayDays: row.halfPayDays }))
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId));
    const enrolments = this.repository
      .listEnrolments(actor)
      .map((enrolment) => ({ ...enrolment, componentAmountsCents: { ...enrolment.componentAmountsCents } }))
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId));
    if (enrolments.length === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "At least one salary enrolment is required before snapshot");
    }
    const recoveryDemands = this.repository
      .listRecoveryDemands(actor, period)
      .map((demand) => ({ ...demand }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const enrolledEmployees = new Set(enrolments.map((enrolment) => enrolment.employeeId));
    const arrears = this.repository
      .listArrears(actor)
      .filter((arrear) => arrear.status === "APPROVED" && !arrear.paidInRunId && enrolledEmployees.has(arrear.employeeId))
      .map((arrear) => ({ arrearId: arrear.id, employeeId: arrear.employeeId, netArrearCents: arrear.netArrearCents }))
      .sort((left, right) => left.arrearId.localeCompare(right.arrearId));
    const ruleSet = this.buildOrderedRuleSet(actor, period);
    const rateRows = this.freezeRateRows(actor, ruleSet);
    const snapshot: EngineRunSnapshot = {
      period,
      calendarDays,
      perDayBasisDays: this.policy.perDayBasis === "THIRTY_DAYS" ? 30 : calendarDays,
      netPayFloorBps: this.policy.netPayFloorBps,
      attendanceFeed,
      enrolments,
      recoveryDemands,
      arrears,
      ruleSet,
      rateRows,
    };
    run.snapshot = snapshot;
    run.snapshotHash = pseudoHash64(stableStringify(snapshot));
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_RUN_SNAPSHOT",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { period, snapshotHash: run.snapshotHash, feedRows: attendanceFeed.length, marker: "RULE_VERSION_SNAPSHOT" },
    });
    return this.cloneRun(run);
  }

  /**
   * FR-04 compute: evaluate the run from its FROZEN snapshot only. Deterministic — payslip
   * and line identifiers derive from (run, employee, version, sequence), so recomputing the
   * same locked snapshot yields byte-identical payslips + payslip_lines.
   */
  computeEngineRun(actor: ActorContext, runId: string): { run: EnginePayrollRun; payslips: EnginePayslip[] } {
    this.authorization.check(actor, "g10.payroll.compute", actor);
    const run = this.requireRun(actor, runId);
    this.assertRunMutable(run);
    const snapshot = run.snapshot;
    if (!snapshot) {
      throw new FoundationError("PRECONDITION_FAILED", "Run inputs must be snapshot before compute");
    }
    // Recompute pre-lock: drop this run's DRAFT payslips; the published ledger never mutates.
    this.repository.deleteDraftPayslipsForRun(actor, runId);
    const payslips: EnginePayslip[] = [];
    let grossTotal = 0;
    let deductionTotal = 0;
    let netTotal = 0;
    for (const enrolment of snapshot.enrolments) {
      const payslip = this.computeEmployeePayslip(actor, run, snapshot, enrolment);
      payslips.push(payslip);
      grossTotal += payslip.grossCents;
      deductionTotal += payslip.deductionsCents;
      netTotal += payslip.netPayCents;
    }
    run.grossTotalCents = grossTotal;
    run.deductionTotalCents = deductionTotal;
    run.netTotalCents = netTotal;
    run.employeeCount = payslips.length;
    run.status = "COMPUTED";
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_RUN_COMPUTED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { period: run.period, employees: payslips.length, snapshotHash: run.snapshotHash, marker: "PAYROLL_TRACE" },
    });
    return { run: this.cloneRun(run), payslips: payslips.map((payslip) => this.clonePayslip(payslip)) };
  }

  /** FR-16 AC1: approval requires a different user than the run maker (SoD). */
  approveEngineRun(actor: ActorContext, runId: string): EnginePayrollRun {
    this.authorization.check(actor, "g10.payroll.approve", actor);
    // PAYROLL_APPROVE capability: approving & locking a run is a payroll_approver (checker)
    // action, distinct from the run maker (SoD) per auth-matrix.yaml g10.run.approve.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "payroll_approver" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Approving a payroll run requires the payroll_approver capability (PAYROLL_APPROVE)", { field: "actor" });
    }
    const run = this.requireRun(actor, runId);
    this.assertRunMutable(run);
    if (run.status !== "COMPUTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a COMPUTED run can be approved");
    }
    if (run.makerUserId === actor.userId) {
      throw new FoundationError("PRECONDITION_FAILED", "PAYROLL_SOD blocks the run maker from approving", { details: { marker: "PAYROLL_SOD" } });
    }
    run.status = "APPROVED";
    run.approvedByUserId = actor.userId;
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, { action: "G10_ENGINE_RUN_APPROVED", subjectRef: `g10_payroll_runs:${run.id}` });
    return this.cloneRun(run);
  }

  /**
   * FR-16 AC2/AC3 lock: publish the payslips (DRAFT -> PUBLISHED), book net-floor excesses
   * into deduction_carryforwards, mark snapshot arrears PAID, and freeze the run. After this,
   * EVERY mutation path on the run or its payslips throws ERR-G10-RUN-IMMUTABLE.
   */
  lockEngineRun(actor: ActorContext, runId: string): EnginePayrollRun {
    this.authorization.check(actor, "g10.payroll.lock", actor);
    const run = this.requireRun(actor, runId);
    this.assertRunMutable(run);
    if (run.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an APPROVED run can be locked");
    }
    for (const payslip of this.repository.listPayslipsForRun(actor, runId)) {
      if (payslip.status !== "DRAFT") {
        continue;
      }
      payslip.status = "PUBLISHED";
      if (payslip.recoveryHold && payslip.recoveryHold.heldCents > 0) {
        // FR-09: excess beyond the protected floor becomes an E35 deduction_carryforwards row.
        const carryforward: DeductionCarryforward = {
          id: nextId("deduction-carryforward", this.repository.countCarryforwards()),
          tenantId: actor.tenantId,
          entityId: actor.entityId,
          employeeId: payslip.employeeId,
          sourceType: "RECOVERY",
          sourceRef: `g10_payslips:${payslip.id}`,
          originalAmountCents: payslip.recoveryHold.heldCents,
          recoveredToDateCents: 0,
          outstandingCents: payslip.recoveryHold.heldCents,
          status: "OPEN",
          bookedFromRunId: run.id,
        };
        this.repository.saveCarryforward(carryforward);
        payslip.recoveryHold = { ...payslip.recoveryHold, carryforwardId: carryforward.id };
        this.audit.recordMutation(actor, {
          action: "G10_ENGINE_CARRYFORWARD_BOOKED",
          subjectRef: `g10_deduction_carryforwards:${carryforward.id}`,
          metadata: { employeeId: payslip.employeeId, outstandingCents: carryforward.outstandingCents, code: "ERR-G10-RECOVERY-NET" },
        });
      }
      this.repository.savePayslip(payslip);
    }
    const snapshot = run.snapshot;
    if (snapshot) {
      for (const entry of snapshot.arrears) {
        const arrear = this.repository.findArrear(actor, entry.arrearId);
        if (arrear && arrear.status === "APPROVED") {
          arrear.status = "PAID";
          arrear.paidInRunId = run.id;
          this.repository.saveArrear(arrear);
        }
      }
    }
    run.status = "LOCKED";
    run.lockedAt = `${run.period}-LOCK`;
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, { action: "G10_ENGINE_RUN_LOCKED", subjectRef: `g10_payroll_runs:${run.id}`, metadata: { period: run.period } });
    return this.cloneRun(run);
  }

  /** FR-14 seam: mark the run's bank file transmitted — reopen is blocked afterwards. */
  markRunTransmitted(actor: ActorContext, runId: string): EnginePayrollRun {
    this.authorization.check(actor, "g10.payroll.disburse", actor);
    // PAYROLL_DISBURSE capability: transmitting the bank file is a payroll_disburser action,
    // distinct from the run maker and approver (3-way SoD) per auth-matrix.yaml g10.bankfile.sign_transmit.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "payroll_disburser" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Transmitting the payroll bank file requires the payroll_disburser capability (PAYROLL_DISBURSE)", { field: "actor" });
    }
    const run = this.requireRun(actor, runId);
    if (run.status !== "LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a LOCKED run can be transmitted");
    }
    run.transmittedAt = `${run.period}-TRANSMIT`;
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, { action: "G10_ENGINE_RUN_TRANSMITTED", subjectRef: `g10_payroll_runs:${run.id}` });
    return this.cloneRun(run);
  }

  /**
   * FR-16 AC4 reopen: SUPERSEDE, never edit. Requires justification; blocked after bank
   * transmission (ERR-G10-REOPEN-BLOCKED). The original run's payslips flip to REVERSED
   * (supersession_reason REOPEN) and a successor FINAL run is created for recompute — the
   * new payslips carry version+1. YTD self-heals because it derives from surviving lines.
   */
  reopenEngineRun(actor: ActorContext, runId: string, input: { reason: string }): { supersededRun: EnginePayrollRun; successorRun: EnginePayrollRun } {
    this.authorization.check(actor, "g10.payroll.reopen", actor);
    const run = this.requireRun(actor, runId);
    if (run.status !== "LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a LOCKED run can be reopened");
    }
    if (run.transmittedAt) {
      throw new FoundationError("ERR-G10-REOPEN-BLOCKED", "Run cannot be reopened after bank transmission", {
        details: { runId: run.id, transmittedAt: run.transmittedAt },
      });
    }
    if (!input.reason || !input.reason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Reopen requires a justification reason", { field: "reason" });
    }
    const successor = this.createEngineRun(actor, { period: run.period, runMode: "FINAL" });
    successor.supersededRunId = run.id;
    successor.reopenReason = input.reason;
    this.repository.saveRun(successor);
    for (const payslip of this.repository.listPayslipsForRun(actor, runId)) {
      if (payslip.status === "PUBLISHED") {
        // Originals are REVERSED — the payslip_lines ledger rows survive untouched (append-only).
        payslip.status = "REVERSED";
        payslip.supersessionReason = "REOPEN";
        this.repository.savePayslip(payslip);
      }
    }
    run.status = "SUPERSEDED";
    this.repository.saveRun(run);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_RUN_REOPENED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { successorRunId: successor.id, reason: input.reason, supersession: "REVERSED" },
    });
    return { supersededRun: this.cloneRun(run), successorRun: this.cloneRun(successor) };
  }

  /**
   * FR-10 arrears engine: for each affected month, recompute the month with the REVISED
   * component bases using that month's own frozen snapshot (historical rules), diff against
   * what the surviving payslip_lines ledger actually paid, and persist the month-wise
   * component-wise breakup. Total arrear = Σ over months of (new − old).
   */
  computeArrear(
    actor: ActorContext,
    input: {
      employeeId: string;
      arrearType: EngineArrearType;
      sourceReference: string;
      periodFrom: string;
      periodTo: string;
      revisedComponentAmountsCents: Record<string, number>;
    }
  ): EngineArrear {
    this.authorization.check(actor, "g10.payroll.arrear.compute", actor);
    for (const [componentCode, amountCents] of Object.entries(input.revisedComponentAmountsCents)) {
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        throw new FoundationError("VALIDATION_FAILED", `Revised amount for ${componentCode} must be non-negative integer cents`, { field: componentCode });
      }
    }
    const months = periodsBetween(input.periodFrom, input.periodTo);
    const monthWiseBreakup: ArrearMonthDelta[] = [];
    let grossArrearCents = 0;
    let deductionArrearCents = 0;
    for (const period of months) {
      const paid = this.findSurvivingPayslip(actor, input.employeeId, period);
      if (!paid) {
        throw new FoundationError("PRECONDITION_FAILED", `No locked payslip exists for ${input.employeeId} in ${period} — nothing to revise`, {
          details: { period },
        });
      }
      const sourceRun = this.requireRun(actor, paid.payslip.runId);
      const snapshot = sourceRun.snapshot;
      if (!snapshot) {
        throw new FoundationError("PRECONDITION_FAILED", `Historical run ${sourceRun.id} has no frozen snapshot for arrear recompute`);
      }
      const enrolment = snapshot.enrolments.find((item) => item.employeeId === input.employeeId);
      if (!enrolment) {
        throw new FoundationError("PRECONDITION_FAILED", `Historical snapshot has no enrolment for ${input.employeeId} in ${period}`);
      }
      const revisedEnrolment: SalaryEnrolment = {
        ...enrolment,
        componentAmountsCents: { ...enrolment.componentAmountsCents, ...input.revisedComponentAmountsCents },
      };
      const lwpDays = snapshot.attendanceFeed.find((fact) => fact.employeeId === input.employeeId)?.lwpDays ?? 0;
      const recomputed = this.computeEmployeeMonth(snapshot, revisedEnrolment, lwpDays);
      // Old values come from the immutable payslip_lines ledger — the amounts actually paid.
      const oldByComponent = new Map<string, { amountCents: number; lineType: EnginePayslipLineType }>();
      for (const line of paid.lines) {
        if (line.lineType === "EARNING" || line.lineType === "DEDUCTION") {
          oldByComponent.set(line.componentCode, { amountCents: line.amountCents, lineType: line.lineType });
        }
      }
      const componentCodes = new Set<string>([...oldByComponent.keys(), ...recomputed.componentValuesCents.keys()]);
      for (const componentCode of [...componentCodes].sort()) {
        const oldAmountCents = oldByComponent.get(componentCode)?.amountCents ?? 0;
        const newAmountCents = recomputed.componentValuesCents.get(componentCode) ?? 0;
        const deltaCents = newAmountCents - oldAmountCents;
        if (deltaCents === 0) {
          continue;
        }
        monthWiseBreakup.push({ period, componentCode, oldAmountCents, newAmountCents, deltaCents });
        const category = snapshot.ruleSet.find((rule) => rule.componentCode === componentCode)?.category;
        if (category === "DEDUCTION") {
          deductionArrearCents += deltaCents;
        } else {
          grossArrearCents += deltaCents;
        }
      }
    }
    const arrear: EngineArrear = {
      id: nextId("engine-arrear", this.repository.countArrears()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      arrearNo: `ARR-${input.periodFrom}-${String(this.repository.countArrears() + 1).padStart(4, "0")}`,
      employeeId: input.employeeId,
      arrearType: input.arrearType,
      sourceReference: input.sourceReference,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      monthWiseBreakup,
      grossArrearCents,
      deductionArrearCents,
      netArrearCents: grossArrearCents - deductionArrearCents,
      status: "COMPUTED",
    };
    this.repository.saveArrear(arrear);
    this.audit.recordMutation(actor, {
      action: "G10_ENGINE_ARREAR_COMPUTED",
      subjectRef: `g10_arrears:${arrear.id}`,
      metadata: { employeeId: arrear.employeeId, months: months.length, netArrearCents: arrear.netArrearCents, sourceReference: arrear.sourceReference },
    });
    return this.cloneArrear(arrear);
  }

  /** FR-10: approve a COMPUTED arrear so the next snapshot books it into a run (arrear_ref line). */
  approveArrear(actor: ActorContext, arrearId: string): EngineArrear {
    this.authorization.check(actor, "g10.payroll.arrear.approve", actor);
    const arrear = this.repository.findArrear(actor, arrearId);
    if (!arrear) {
      throw new FoundationError("NOT_FOUND", "Arrear not found");
    }
    if (arrear.status !== "COMPUTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a COMPUTED arrear can be approved");
    }
    arrear.status = "APPROVED";
    this.repository.saveArrear(arrear);
    this.audit.recordMutation(actor, { action: "G10_ENGINE_ARREAR_APPROVED", subjectRef: `g10_arrears:${arrear.id}` });
    return this.cloneArrear(arrear);
  }

  /**
   * VAL-G10-YTD-DERIVE: YTD figures are DERIVED from the immutable payslip_lines ledger over
   * surviving (PUBLISHED, non-REVERSED) payslips — never from a mutable running counter.
   * Reopen/supersede self-corrects the YTD because REVERSED payslips drop out of the sum.
   * FR-G10-06 self-service scope: an employee may only read their own YTD statement.
   */
  getYtdStatement(actor: ActorContext, employeeId: string): EngineYtdStatement {
    this.assertSelfOrOverride(actor, employeeId);
    const scope = actor;
    const survivingPayslipIds = new Set(
      this.repository
        .listPayslipsForEmployee(scope, employeeId)
        .filter((payslip) => payslip.status === "PUBLISHED")
        .map((payslip) => payslip.id)
    );
    const byComponent: Record<string, number> = {};
    let grossCents = 0;
    let deductionsCents = 0;
    let lineCount = 0;
    for (const line of this.repository.listLinesForEmployee(scope, employeeId)) {
      if (!survivingPayslipIds.has(line.payslipId)) {
        continue;
      }
      lineCount += 1;
      byComponent[line.componentCode] = (byComponent[line.componentCode] ?? 0) + line.amountCents;
      if (line.lineType === "EARNING" || line.lineType === "ARREAR" || line.lineType === "ROUNDING_ADJUSTMENT") {
        grossCents += line.amountCents;
      } else if (line.lineType === "DEDUCTION") {
        deductionsCents += line.amountCents;
      }
    }
    return {
      employeeId,
      validation: "VAL-G10-YTD-DERIVE",
      byComponent,
      grossCents,
      deductionsCents,
      netCents: grossCents - deductionsCents,
      lineCount,
    };
  }

  getEngineRun(scope: TenantScope, runId: string): EnginePayrollRun {
    return this.cloneRun(this.requireRun(scope, runId));
  }

  /**
   * PH-09D seam: the employee's latest surviving (PUBLISHED) payslip — the pay reference
   * the FR-09 recovery scheduler bounds against (net-pay floor + CPC s.60 attachment cap).
   */
  findLatestPublishedPayslip(scope: TenantScope, employeeId: string): EnginePayslip | undefined {
    requireTenantScope(scope);
    const payslip = this.repository
      .listPayslipsForEmployee(scope, employeeId)
      .filter((item) => item.status === "PUBLISHED")
      .sort((left, right) => right.period.localeCompare(left.period) || right.version - left.version)[0];
    return payslip ? this.clonePayslip(payslip) : undefined;
  }

  /**
   * FR-G10-13 self-service payslip history: the employee's own PUBLISHED payslips across all
   * periods, each with full line-item detail (BRD: "Employees see only their own (P02)").
   */
  listMyPayslips(actor: ActorContext, employeeId: string): { payslip: EnginePayslip; lines: EnginePayslipLine[] }[] {
    this.assertSelfOrOverride(actor, employeeId);
    return this.repository
      .listPayslipsForEmployee(actor, employeeId)
      .filter((payslip) => payslip.status === "PUBLISHED")
      .sort((left, right) => right.period.localeCompare(left.period) || right.version - left.version)
      .map((payslip) => ({
        payslip: this.clonePayslip(payslip),
        lines: this.repository
          .listLinesForPayslip(actor, payslip.id)
          .sort((left, right) => left.sequenceNo - right.sequenceNo)
          .map((line) => ({ ...line, calcTrace: { ...line.calcTrace } })),
      }));
  }

  /** Self-or-override guard shared by the FR-G10-13/FR-G10-06 self-service reads below. */
  private assertSelfOrOverride(actor: ActorContext, employeeId: string): void {
    requireTenantScope(actor);
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => PAYROLL_SELF_SERVICE_OVERRIDE_ROLES.has(role));
    if (!isOverride && actor.userId !== employeeId) {
      throw new FoundationError("FORBIDDEN", "You may only view your own payroll records", { field: "employeeId" });
    }
  }

  listRunPayslips(scope: TenantScope, runId: string): { payslip: EnginePayslip; lines: EnginePayslipLine[] }[] {
    requireTenantScope(scope);
    return this.repository
      .listPayslipsForRun(scope, runId)
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId))
      .map((payslip) => ({
        payslip: this.clonePayslip(payslip),
        lines: this.repository
          .listLinesForPayslip(scope, payslip.id)
          .sort((left, right) => left.sequenceNo - right.sequenceNo)
          .map((line) => ({ ...line, calcTrace: { ...line.calcTrace } })),
      }));
  }

  listCarryforwards(scope: TenantScope, employeeId?: string): DeductionCarryforward[] {
    requireTenantScope(scope);
    return this.repository.listCarryforwards(scope, employeeId).map((row) => ({ ...row }));
  }

  getArrear(scope: TenantScope, arrearId: string): EngineArrear {
    requireTenantScope(scope);
    const arrear = this.repository.findArrear(scope, arrearId);
    if (!arrear) {
      throw new FoundationError("NOT_FOUND", "Arrear not found");
    }
    return this.cloneArrear(arrear);
  }

  // -- internals --------------------------------------------------------------------------

  /** Every mutation path funnels through this guard: locked/superseded runs are immutable. */
  private assertRunMutable(run: EnginePayrollRun): void {
    if (run.status === "LOCKED" || run.status === "SUPERSEDED") {
      throw new FoundationError("ERR-G10-RUN-IMMUTABLE", `Payroll run ${run.id} is ${run.status} — locked runs and payslips are immutable`, {
        details: { runId: run.id, status: run.status },
      });
    }
  }

  /**
   * VAL-G10-RULE-ORDER: order the effective rules by computation_order and verify every
   * FORMULA reference resolves to an ALREADY-COMPUTED component (or a rate-table ref).
   * A forward or circular reference cannot be strictly ordered and rejects fail-closed.
   */
  private buildOrderedRuleSet(scope: TenantScope, period: string): SnapshotRule[] {
    const periodEnd = periodEndDate(period);
    const ruleSet: SnapshotRule[] = [];
    for (const component of this.payRuleRepository.listComponents(scope)) {
      if (component.status !== "ACTIVE") {
        continue;
      }
      const effective = this.payRuleRepository
        .listRulesForComponent(scope, component.id)
        .filter((rule) => rule.status === "ACTIVE" && windowCovers(rule.effectiveFrom, rule.effectiveTo, periodEnd))
        .sort((left, right) => right.version - left.version)[0];
      if (!effective) {
        continue;
      }
      ruleSet.push({
        componentCode: component.componentCode,
        category: component.category,
        calcMethod: effective.calcMethod,
        ruleId: effective.id,
        version: effective.version,
        computationOrder: effective.computationOrder,
        formulaExpression: effective.formulaExpression,
      });
    }
    ruleSet.sort((left, right) => left.computationOrder - right.computationOrder || left.componentCode.localeCompare(right.componentCode));
    const computed = new Set<string>();
    for (const rule of ruleSet) {
      if (rule.calcMethod === "FORMULA" && rule.formulaExpression) {
        for (const token of tokenizeExpression(rule.formulaExpression)) {
          if (token.type !== "IDENTIFIER" || RATE_TABLE_TYPE_SET.has(token.value)) {
            continue;
          }
          if (!computed.has(token.value)) {
            throw new FoundationError(
              "VALIDATION_FAILED",
              `Component ${rule.componentCode} references ${token.value} before it is computed — forward or circular reference`,
              { field: "computationOrder", details: { validation: "VAL-G10-RULE-ORDER", componentCode: rule.componentCode, reference: token.value } }
            );
          }
        }
      }
      computed.add(rule.componentCode);
    }
    return ruleSet;
  }

  /** Freeze every referenced rate table's rows into the snapshot (as-of resolution reads these). */
  private freezeRateRows(scope: TenantScope, ruleSet: SnapshotRule[]): Record<string, SnapshotRateRow[]> {
    const referenced = new Set<string>();
    for (const rule of ruleSet) {
      if (rule.calcMethod === "SLAB") {
        referenced.add("PT_SLAB");
      }
      if (rule.calcMethod === "FORMULA" && rule.formulaExpression) {
        for (const token of tokenizeExpression(rule.formulaExpression)) {
          if (token.type === "IDENTIFIER" && RATE_TABLE_TYPE_SET.has(token.value)) {
            referenced.add(token.value);
          }
        }
      }
    }
    const rateRows: Record<string, SnapshotRateRow[]> = {};
    for (const tableType of [...referenced].sort()) {
      rateRows[tableType] = this.payRuleRepository
        .listRateRows(scope, tableType as RateTableType)
        .filter((row) => row.isActive)
        .map((row) => ({
          id: row.id,
          state: row.state,
          slabMinCents: row.slabMinCents,
          slabMaxCents: row.slabMaxCents,
          ratePctBps: row.ratePctBps,
          flatAmountCents: row.flatAmountCents,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    }
    return rateRows;
  }

  private computeEmployeePayslip(scope: TenantScope, run: EnginePayrollRun, snapshot: EngineRunSnapshot, enrolment: SalaryEnrolment): EnginePayslip {
    const lwpDays = snapshot.attendanceFeed.find((fact) => fact.employeeId === enrolment.employeeId)?.lwpDays ?? 0;
    const computation = this.computeEmployeeMonth(snapshot, enrolment, lwpDays);
    const lines = computation.lines.map((line) => ({ ...line, calcTrace: { ...line.calcTrace } }));
    let sequenceNo = lines.length;
    let grossCents = computation.grossCents;
    let deductionsCents = computation.deductionsCents;
    // FR-10 AC4: arrears attach as ADDITIVE lines with arrear_ref — originals never mutate.
    for (const entry of snapshot.arrears) {
      if (entry.employeeId !== enrolment.employeeId) {
        continue;
      }
      sequenceNo += 1;
      lines.push({
        employeeId: enrolment.employeeId,
        period: snapshot.period,
        componentCode: "ARREAR",
        lineType: "ARREAR",
        amountCents: entry.netArrearCents,
        sequenceNo,
        arrearRef: entry.arrearId,
        calcTrace: { source: "g10_arrears", arrearId: entry.arrearId },
      });
      grossCents += entry.netArrearCents;
    }
    // FR-09 net-pay floor: recovery applies only down to the protected floor; the excess is
    // held (ERR-G10-RECOVERY-NET) and booked into deduction_carryforwards at lock.
    const demandCents = snapshot.recoveryDemands
      .filter((demand) => demand.employeeId === enrolment.employeeId)
      .reduce((total, demand) => total + demand.amountCents, 0);
    let recoveryHold: EnginePayslip["recoveryHold"];
    if (demandCents > 0) {
      const floorCents = intMulDiv(grossCents, snapshot.netPayFloorBps, 10000);
      const netBeforeRecovery = grossCents - deductionsCents;
      const allowedCents = Math.max(0, netBeforeRecovery - floorCents);
      const appliedCents = Math.min(demandCents, allowedCents);
      const heldCents = demandCents - appliedCents;
      if (appliedCents > 0) {
        sequenceNo += 1;
        lines.push({
          employeeId: enrolment.employeeId,
          period: snapshot.period,
          componentCode: "RECOVERY",
          lineType: "DEDUCTION",
          amountCents: appliedCents,
          sequenceNo,
          calcTrace: { source: "recovery_demands", demandCents, floorCents, netPayFloorBps: snapshot.netPayFloorBps },
        });
        deductionsCents += appliedCents;
      }
      if (heldCents > 0) {
        recoveryHold = { code: "ERR-G10-RECOVERY-NET", heldCents };
      }
    }
    // §5.6-1: a ROUNDING_ADJUSTMENT line ties net pay to the whole rupee (100 cents).
    const netBeforeRounding = grossCents - deductionsCents;
    const roundedNet = intMulDiv(netBeforeRounding, 1, 100) * 100;
    const roundingCents = roundedNet - netBeforeRounding;
    if (roundingCents !== 0) {
      sequenceNo += 1;
      lines.push({
        employeeId: enrolment.employeeId,
        period: snapshot.period,
        componentCode: "ROUNDING_ADJUSTMENT",
        lineType: "ROUNDING_ADJUSTMENT",
        amountCents: roundingCents,
        sequenceNo,
        calcTrace: { rule: "net pay ties to the whole rupee" },
      });
      grossCents += roundingCents;
    }
    const netPayCents = grossCents - deductionsCents;
    if (netPayCents < 0) {
      // ck_g10_payslip_net (§5.6-1): net pay can never be negative — fail closed.
      throw new FoundationError("ERR-G10-RECOVERY-NET", `Computed net pay for ${enrolment.employeeId} is negative`, {
        details: { employeeId: enrolment.employeeId, netPayCents },
      });
    }
    const version = this.nextPayslipVersion(scope, enrolment.employeeId, snapshot.period);
    // Deterministic identifiers: recomputing the same snapshot reproduces byte-identical rows.
    const payslipId = `engine-payslip-${run.id}-${enrolment.employeeId}-v${version}`;
    const payslip: EnginePayslip = {
      id: payslipId,
      tenantId: run.tenantId,
      entityId: run.entityId,
      payslipNo: `PS-${snapshot.period}-${enrolment.employeeId}-V${version}`,
      runId: run.id,
      employeeId: enrolment.employeeId,
      period: snapshot.period,
      version,
      status: "DRAFT",
      paidDaysHundredths: computation.paidDaysHundredths,
      lwpDaysHundredths: computation.lwpDaysHundredths,
      grossCents,
      deductionsCents,
      netPayCents,
      recoveryHold,
    };
    this.repository.savePayslip(payslip);
    for (const line of lines) {
      this.repository.appendPayslipLine({
        ...line,
        id: `${payslipId}-L${String(line.sequenceNo).padStart(3, "0")}`,
        tenantId: run.tenantId,
        entityId: run.entityId,
        payslipId,
      });
    }
    return payslip;
  }

  /**
   * Evaluate one employee-month strictly from a frozen snapshot: DSL components in validated
   * order, LWP proration from the G03 feed facts, rate-table caps, and state-wise PT slabs.
   * Shared by run compute and the arrears engine (historical recompute with revised bases).
   */
  private computeEmployeeMonth(snapshot: EngineRunSnapshot, enrolment: SalaryEnrolment, lwpDays: number): EmployeeComputation {
    const basisDays = snapshot.perDayBasisDays;
    const payableDays = Math.max(0, basisDays - lwpDays);
    const context = new Map<string, number>();
    // Rate-table refs resolve as-of the period end from the FROZEN snapshot rows.
    const periodEnd = periodEndDate(snapshot.period);
    for (const [tableType, rows] of Object.entries(snapshot.rateRows)) {
      if (tableType === "PT_SLAB") {
        continue; // PT resolves per-employee by state + slab probe below.
      }
      const covering = rows.filter((row) => windowCovers(row.effectiveFrom, row.effectiveTo, periodEnd) && row.state === undefined);
      const resolved = covering[0];
      if (resolved) {
        context.set(tableType, resolved.ratePctBps ?? resolved.flatAmountCents ?? 0);
      }
    }
    const lines: EmployeeComputation["lines"] = [];
    const componentValues = new Map<string, number>();
    let sequenceNo = 0;
    let grossCents = 0;
    let deductionsCents = 0;
    let lwpReductionCents = 0;
    for (const rule of snapshot.ruleSet) {
      let amountCents = 0;
      const calcTrace: Record<string, unknown> = { componentCode: rule.componentCode, calcMethod: rule.calcMethod, ruleVersion: rule.version };
      if (rule.calcMethod === "FLAT") {
        const baseCents = enrolment.componentAmountsCents[rule.componentCode] ?? 0;
        if (rule.category === "EARNING") {
          // FR-05 AC1: LWP days reduce pay on the configured per-day basis (proration).
          const proratedCents = intMulDiv(baseCents, payableDays, basisDays);
          lwpReductionCents += baseCents - proratedCents;
          amountCents = proratedCents;
          calcTrace.proration = { baseCents, basisDays, lwpDays, payableDays, proratedCents };
        } else {
          amountCents = baseCents;
        }
      } else if (rule.calcMethod === "FORMULA" && rule.formulaExpression) {
        amountCents = evaluateExpression(rule.formulaExpression, context);
        calcTrace.formulaExpression = rule.formulaExpression;
        if (rule.category === "DEDUCTION") {
          const capCents = this.statutoryCapFor(snapshot, rule, periodEnd);
          if (capCents !== undefined && amountCents > capCents) {
            calcTrace.statutoryCap = { capCents, uncappedCents: amountCents };
            amountCents = capCents;
          }
        }
      } else if (rule.calcMethod === "SLAB") {
        // FR-06: state-wise PT — resolve the slab for the employee's state of posting.
        amountCents = this.resolvePtSlab(snapshot, enrolment, grossCents, periodEnd);
        calcTrace.ptSlab = { stateOfPosting: enrolment.stateOfPosting, grossProbeCents: grossCents };
      } else {
        continue;
      }
      componentValues.set(rule.componentCode, amountCents);
      context.set(rule.componentCode, amountCents);
      if (amountCents === 0) {
        continue;
      }
      sequenceNo += 1;
      const lineType: EnginePayslipLineType = rule.category === "DEDUCTION" ? "DEDUCTION" : "EARNING";
      lines.push({
        employeeId: enrolment.employeeId,
        period: snapshot.period,
        componentCode: rule.componentCode,
        lineType,
        amountCents,
        sequenceNo,
        calcTrace,
      });
      if (lineType === "EARNING") {
        grossCents += amountCents;
      } else {
        deductionsCents += amountCents;
      }
    }
    if (lwpReductionCents > 0) {
      // FR-05 AC1: the LWP reduction shows as its own line (informational; earnings are already prorated).
      sequenceNo += 1;
      lines.push({
        employeeId: enrolment.employeeId,
        period: snapshot.period,
        componentCode: "LWP",
        lineType: "LWP_RECOVERY",
        amountCents: lwpReductionCents,
        sequenceNo,
        calcTrace: { source: "payroll_attendance_feed", lwpDays, basisDays, note: "G03 feed consumed at snapshot time" },
      });
    }
    return {
      lines,
      componentValuesCents: componentValues,
      grossCents,
      deductionsCents,
      lwpReductionCents,
      paidDaysHundredths: payableDays * 100,
      lwpDaysHundredths: lwpDays * 100,
    };
  }

  /** Statutory cap: the slab_max on the rate row referenced by a DEDUCTION formula (FR-06). */
  private statutoryCapFor(snapshot: EngineRunSnapshot, rule: SnapshotRule, periodEnd: string): number | undefined {
    if (!rule.formulaExpression) {
      return undefined;
    }
    for (const token of tokenizeExpression(rule.formulaExpression)) {
      if (token.type !== "IDENTIFIER" || !RATE_TABLE_TYPE_SET.has(token.value)) {
        continue;
      }
      const rows = snapshot.rateRows[token.value] ?? [];
      const covering = rows.find((row) => windowCovers(row.effectiveFrom, row.effectiveTo, periodEnd) && row.state === undefined);
      if (covering?.slabMaxCents !== undefined) {
        return covering.slabMaxCents;
      }
    }
    return undefined;
  }

  /**
   * FR-06: PT is state-dimensioned. Fails closed — no state of posting or no slab mapping for
   * the state throws ERR-G10-PT-STATE; no covering slab window throws ERR-G10-RATE-NOTFOUND;
   * more than one covering slab throws ERR-G10-RATE-OVERLAP.
   */
  private resolvePtSlab(snapshot: EngineRunSnapshot, enrolment: SalaryEnrolment, grossProbeCents: number, periodEnd: string): number {
    const state = enrolment.stateOfPosting;
    if (!state) {
      throw new FoundationError("ERR-G10-PT-STATE", `Employee ${enrolment.employeeId} has no state of posting for PT resolution`, {
        field: "stateOfPosting",
        details: { employeeId: enrolment.employeeId },
      });
    }
    const rows = (snapshot.rateRows["PT_SLAB"] ?? []).filter((row) => row.state === state);
    if (rows.length === 0) {
      throw new FoundationError("ERR-G10-PT-STATE", `No PT slab mapping for state of posting ${state}`, { field: "stateOfPosting", details: { state } });
    }
    const covering = rows.filter(
      (row) =>
        windowCovers(row.effectiveFrom, row.effectiveTo, periodEnd) &&
        (row.slabMinCents === undefined || grossProbeCents >= row.slabMinCents) &&
        (row.slabMaxCents === undefined || grossProbeCents <= row.slabMaxCents)
    );
    const resolved = covering[0];
    if (!resolved) {
      throw new FoundationError("ERR-G10-RATE-NOTFOUND", `No effective PT slab covers gross for state ${state}`, {
        details: { state, grossProbeCents },
      });
    }
    if (covering.length > 1) {
      throw new FoundationError("ERR-G10-RATE-OVERLAP", `Multiple PT slabs cover gross for state ${state}`, {
        details: { validation: "VAL-G10-RATE-NONOVERLAP", state, matches: covering.map((row) => row.id) },
      });
    }
    return resolved.flatAmountCents ?? 0;
  }

  /** Payslip versions count REVERSED/PUBLISHED history — reopen recompute yields version+1. */
  private nextPayslipVersion(scope: TenantScope, employeeId: string, period: string): number {
    const priorVersions = this.repository
      .listPayslipsForEmployee(scope, employeeId)
      .filter((payslip) => payslip.period === period && payslip.status !== "DRAFT")
      .map((payslip) => payslip.version);
    return priorVersions.length === 0 ? 1 : Math.max(...priorVersions) + 1;
  }

  private findSurvivingPayslip(scope: TenantScope, employeeId: string, period: string): { payslip: EnginePayslip; lines: EnginePayslipLine[] } | undefined {
    const payslip = this.repository
      .listPayslipsForEmployee(scope, employeeId)
      .filter((item) => item.period === period && item.status === "PUBLISHED")
      .sort((left, right) => right.version - left.version)[0];
    if (!payslip) {
      return undefined;
    }
    return { payslip, lines: this.repository.listLinesForPayslip(scope, payslip.id) };
  }

  private requireRun(scope: TenantScope, runId: string): EnginePayrollRun {
    requireTenantScope(scope);
    const run = this.repository.findRun(scope, runId);
    if (!run) {
      throw new FoundationError("NOT_FOUND", "Payroll run not found");
    }
    return run;
  }

  private cloneRun(run: EnginePayrollRun): EnginePayrollRun {
    // JSON.stringify (not stableStringify) for the deep clone: it drops undefined-valued
    // optional keys, which stableStringify keeps as literal text for hash stability.
    return { ...run, snapshot: run.snapshot ? (JSON.parse(JSON.stringify(run.snapshot)) as EngineRunSnapshot) : undefined };
  }

  private clonePayslip(payslip: EnginePayslip): EnginePayslip {
    return { ...payslip, recoveryHold: payslip.recoveryHold ? { ...payslip.recoveryHold } : undefined };
  }

  private cloneArrear(arrear: EngineArrear): EngineArrear {
    return { ...arrear, monthWiseBreakup: arrear.monthWiseBreakup.map((row) => ({ ...row })) };
  }
}

/** Integer money helper: round(amount * numerator / denominator) with safe-integer checks. */
function intMulDiv(amountCents: number, numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new FoundationError("INTERNAL", "Division by zero in payroll math");
  }
  const product = amountCents * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new FoundationError("INTERNAL", "Payroll math overflows deterministic integer arithmetic");
  }
  return Math.round(product / denominator);
}

/** Calendar days in a YYYY-MM period (deterministic UTC arithmetic). */
function daysInPeriod(period: string): number {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new FoundationError("VALIDATION_FAILED", "period must use YYYY-MM", { field: "period" });
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Last calendar date of a YYYY-MM period as an ISO date. */
function periodEndDate(period: string): string {
  return `${period}-${String(daysInPeriod(period)).padStart(2, "0")}`;
}

/** Inclusive month enumeration between two YYYY-MM periods (FR-10 affected months). */
export function periodsBetween(periodFrom: string, periodTo: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}$/.test(periodTo) || periodTo < periodFrom) {
    throw new FoundationError("VALIDATION_FAILED", "periodFrom/periodTo must be YYYY-MM with periodTo >= periodFrom", { field: "periodFrom" });
  }
  const months: string[] = [];
  let [year, month] = periodFrom.split("-").map(Number) as [number, number];
  const [endYear, endMonth] = periodTo.split("-").map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
