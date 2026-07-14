import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";

export type MoneyCents = number;
export type PayrollRunStatus = "OPEN" | "INPUT_LOCKED" | "COMPUTED" | "RECONCILED" | "APPROVED" | "LOCKED" | "DISBURSED" | "CLOSED";
export type PayrollAdjustmentSource = "G03" | "G05" | "G06" | "G09" | "G10";
export type PayrollAdjustmentCode = "LOP" | "TRANSFER_ALLOWANCE" | "PROMOTION_ARREARS" | "PENALTY_RECOVERY" | "MANUAL_EARNING" | "MANUAL_DEDUCTION";

export interface SalaryStructure {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  basicPayCents: MoneyCents;
  daRateBps: number;
  hraRateBps: number;
  npsRateBps: number;
  professionalTaxCents: MoneyCents;
  ruleVersion: string;
  effectiveFrom: string;
}

export interface PayrollAdjustment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  period: string;
  sourceModule: PayrollAdjustmentSource;
  code: PayrollAdjustmentCode;
  amountCents: MoneyCents;
  lopDays?: number;
  sourceRef: string;
  provenanceHash: string;
}

export interface PayrollTraceStep {
  code: string;
  amountCents: MoneyCents;
  marker: string;
  sourceRef?: string;
}

export interface PayrollLine {
  employeeId: string;
  salaryStructureId: string;
  basicPayCents: MoneyCents;
  earnedBasicCents: MoneyCents;
  daCents: MoneyCents;
  hraCents: MoneyCents;
  grossCents: MoneyCents;
  deductionsCents: MoneyCents;
  netPayCents: MoneyCents;
  trace: PayrollTraceStep[];
}

export interface PayrollRun {
  id: string;
  tenantId: string;
  entityId?: string;
  period: string;
  status: PayrollRunStatus;
  makerUserId: string;
  approvedByUserId?: string;
  ruleVersionSnapshot?: string;
  inputSnapshotHash?: string;
  inputSnapshotMarker?: "RULE_VERSION_SNAPSHOT";
  provenanceMarker?: "PROVENANCE_COMPLETE";
  lines: PayrollLine[];
  totals: {
    grossCents: MoneyCents;
    deductionsCents: MoneyCents;
    netPayCents: MoneyCents;
  };
  bankBatch?: {
    id: string;
    adapter: "X3_BANK_SANDBOX";
    marker: "BANK_X3_EXPORT";
    status: "TRANSMITTED" | "RECONCILED";
    totalNetCents: MoneyCents;
  };
}

export interface LastPayDrawn {
  employeeId: string;
  period: string;
  basicPayCents: MoneyCents;
  earnedBasicCents: MoneyCents;
  grossCents: MoneyCents;
  netPayCents: MoneyCents;
  ruleVersionSnapshot: string;
  traceHash: string;
  marker: "G10_LAST_PAY_DRAWN_FEED";
}

export interface PayrollSummary {
  salaryStructures: number;
  runs: number;
  lockedRuns: number;
  disbursedRuns: number;
  lastPayDrawnFeeds: number;
  calculationMarker: "PAYROLL_TRACE";
  ruleSnapshotMarker: "RULE_VERSION_SNAPSHOT";
  x3Marker: "BANK_X3_EXPORT";
}

export class PayrollService {
  private readonly salaryStructures: SalaryStructure[] = [];
  private readonly adjustments: PayrollAdjustment[] = [];
  private readonly runs: PayrollRun[] = [];
  private readonly lastPayFeeds: LastPayDrawn[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService
  ) {}

  createSalaryStructure(
    actor: ActorContext,
    input: {
      employeeId: string;
      basicPayCents: MoneyCents;
      daRateBps: number;
      hraRateBps: number;
      npsRateBps: number;
      professionalTaxCents: MoneyCents;
      ruleVersion: string;
      effectiveFrom: string;
    }
  ): SalaryStructure {
    this.authorization.check(actor, "g10.salary.write", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    this.assertPositiveMoney(input.basicPayCents, "basicPayCents");
    this.assertNonNegativeMoney(input.professionalTaxCents, "professionalTaxCents");
    const structure: SalaryStructure = {
      id: nextId("salary-structure", this.salaryStructures.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      basicPayCents: input.basicPayCents,
      daRateBps: input.daRateBps,
      hraRateBps: input.hraRateBps,
      npsRateBps: input.npsRateBps,
      professionalTaxCents: input.professionalTaxCents,
      ruleVersion: input.ruleVersion,
      effectiveFrom: input.effectiveFrom,
    };
    this.salaryStructures.push(structure);
    this.audit.recordMutation(actor, {
      action: "G10_SALARY_STRUCTURE_CREATED",
      subjectRef: `g10_salary_structures:${structure.id}`,
      metadata: { employeeId: structure.employeeId, ruleVersion: structure.ruleVersion },
    });
    return this.cloneSalaryStructure(structure);
  }

  createRun(actor: ActorContext, input: { period: string }): PayrollRun {
    this.authorization.check(actor, "g10.payroll.run.create", actor);
    const run: PayrollRun = {
      id: nextId("payroll-run", this.runs.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      period: input.period,
      status: "OPEN",
      makerUserId: actor.userId,
      lines: [],
      totals: { grossCents: 0, deductionsCents: 0, netPayCents: 0 },
    };
    this.runs.push(run);
    this.audit.recordMutation(actor, { action: "G10_PAYROLL_RUN_CREATED", subjectRef: `g10_payroll_runs:${run.id}`, metadata: { period: run.period } });
    return this.cloneRun(run);
  }

  addAdjustment(
    actor: ActorContext,
    input: {
      employeeId: string;
      period: string;
      sourceModule: PayrollAdjustmentSource;
      code: PayrollAdjustmentCode;
      amountCents?: MoneyCents;
      lopDays?: number;
      sourceRef: string;
    }
  ): PayrollAdjustment {
    this.authorization.check(actor, "g10.adjustment.write", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const adjustment: PayrollAdjustment = {
      id: nextId("payroll-adjustment", this.adjustments.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      period: input.period,
      sourceModule: input.sourceModule,
      code: input.code,
      amountCents: input.amountCents ?? 0,
      lopDays: input.lopDays,
      sourceRef: input.sourceRef,
      provenanceHash: pseudoHash64(stableStringify(input)),
    };
    if (adjustment.code === "LOP" && (!adjustment.lopDays || adjustment.lopDays <= 0)) {
      throw new FoundationError("VALIDATION_FAILED", "LOP adjustment requires positive lopDays", { field: "lopDays" });
    }
    this.adjustments.push(adjustment);
    this.audit.recordMutation(actor, {
      action: "G10_ADJUSTMENT_RECORDED",
      subjectRef: `g10_payroll_adjustments:${adjustment.id}`,
      metadata: { sourceModule: adjustment.sourceModule, code: adjustment.code, marker: adjustment.code === "LOP" ? "G03_LOP_PAYROLL_IMPACT" : "PROVENANCE_COMPLETE" },
    });
    return this.cloneAdjustment(adjustment);
  }

  lockInputs(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.input.lock", actor);
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "OPEN");
    const inputSnapshot = this.buildInputSnapshot(actor, run.period);
    if (inputSnapshot.structures.length === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "At least one salary structure is required before payroll lock");
    }
    run.status = "INPUT_LOCKED";
    run.ruleVersionSnapshot = this.ruleVersionSnapshot(inputSnapshot.structures);
    run.inputSnapshotHash = pseudoHash64(stableStringify(inputSnapshot));
    run.inputSnapshotMarker = "RULE_VERSION_SNAPSHOT";
    run.provenanceMarker = "PROVENANCE_COMPLETE";
    this.audit.recordMutation(actor, {
      action: "G10_INPUTS_LOCKED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { marker: "INPUT_LOCKED", ruleMarker: "RULE_VERSION_SNAPSHOT", provenanceMarker: "PROVENANCE_COMPLETE" },
    });
    return this.cloneRun(run);
  }

  computeRun(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.compute", actor);
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "INPUT_LOCKED");
    const structures = this.salaryStructures.filter((structure) => this.inScope(structure, actor));
    if (!run.ruleVersionSnapshot || !run.inputSnapshotHash) {
      throw new FoundationError("PRECONDITION_FAILED", "Payroll rule version snapshot is required before compute");
    }
    const lines = structures.map((structure) => this.computeLine(actor, structure, run.period));
    run.lines = lines;
    run.totals = lines.reduce(
      (totals, line) => ({
        grossCents: totals.grossCents + line.grossCents,
        deductionsCents: totals.deductionsCents + line.deductionsCents,
        netPayCents: totals.netPayCents + line.netPayCents,
      }),
      { grossCents: 0, deductionsCents: 0, netPayCents: 0 }
    );
    run.status = "COMPUTED";
    this.audit.recordMutation(actor, {
      action: "G10_PAYROLL_COMPUTED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { marker: "PAYROLL_TRACE", ruleVersionSnapshot: run.ruleVersionSnapshot, inputSnapshotHash: run.inputSnapshotHash },
    });
    return this.cloneRun(run);
  }

  reconcileRun(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.reconcile", actor);
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "COMPUTED");
    run.status = "RECONCILED";
    this.audit.recordMutation(actor, { action: "G10_PAYROLL_RECONCILED", subjectRef: `g10_payroll_runs:${run.id}` });
    return this.cloneRun(run);
  }

  approveRun(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.approve", actor);
    // PAYROLL_APPROVE capability: approving a run is a payroll_approver (checker) action,
    // distinct from the run maker (SoD) per auth-matrix.yaml g10.run.approve.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "payroll_approver" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Approving a payroll run requires the payroll_approver capability (PAYROLL_APPROVE)", { field: "actor" });
    }
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "RECONCILED");
    if (run.makerUserId === actor.userId) {
      throw new FoundationError("PRECONDITION_FAILED", "PAYROLL_SOD blocks maker from approving payroll", { details: { marker: "PAYROLL_SOD" } });
    }
    run.status = "APPROVED";
    run.approvedByUserId = actor.userId;
    this.audit.recordMutation(actor, { action: "G10_PAYROLL_APPROVED", subjectRef: `g10_payroll_runs:${run.id}`, metadata: { marker: "PAYROLL_SOD" } });
    return this.cloneRun(run);
  }

  lockRun(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.lock", actor);
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "APPROVED");
    run.status = "LOCKED";
    this.audit.recordMutation(actor, { action: "G10_PAYROLL_LOCKED", subjectRef: `g10_payroll_runs:${run.id}` });
    return this.cloneRun(run);
  }

  disburseRun(actor: ActorContext, runId: string): PayrollRun {
    this.authorization.check(actor, "g10.payroll.disburse", actor);
    // PAYROLL_DISBURSE capability: disbursing/transmitting the bank file is a payroll_disburser
    // action, distinct from the run maker and approver (3-way SoD) per auth-matrix.yaml
    // g10.bankfile.sign_transmit.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "payroll_disburser" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Disbursing a payroll run requires the payroll_disburser capability (PAYROLL_DISBURSE)", { field: "actor" });
    }
    const run = this.requireRun(actor, runId);
    this.requireStatus(run, "LOCKED");
    run.status = "DISBURSED";
    run.bankBatch = {
      id: nextId("bank-batch", this.runs.filter((item) => item.bankBatch).length),
      adapter: "X3_BANK_SANDBOX",
      marker: "BANK_X3_EXPORT",
      status: "RECONCILED",
      totalNetCents: run.totals.netPayCents,
    };
    for (const line of run.lines) {
      const lastPay: LastPayDrawn = {
        employeeId: line.employeeId,
        period: run.period,
        basicPayCents: line.basicPayCents,
        earnedBasicCents: line.earnedBasicCents,
        grossCents: line.grossCents,
        netPayCents: line.netPayCents,
        ruleVersionSnapshot: run.ruleVersionSnapshot ?? "UNKNOWN",
        traceHash: pseudoHash64(stableStringify(line.trace)),
        marker: "G10_LAST_PAY_DRAWN_FEED",
      };
      this.lastPayFeeds.push(lastPay);
    }
    this.audit.recordMutation(actor, {
      action: "G10_BANK_EXPORT_RECONCILED",
      subjectRef: `g10_payroll_runs:${run.id}`,
      metadata: { marker: "BANK_X3_EXPORT", adapter: "X3_BANK_SANDBOX", lastPayMarker: "LAST_PAY_DRAWN" },
    });
    return this.cloneRun(run);
  }

  getLastPayDrawn(scope: TenantScope, employeeId: string): LastPayDrawn {
    requireTenantScope(scope);
    const feed = [...this.lastPayFeeds]
      .filter((item) => item.employeeId === employeeId)
      .sort((left, right) => right.period.localeCompare(left.period))[0];
    if (!feed) {
      throw new FoundationError("PRECONDITION_FAILED", "G10_LAST_PAY_DRAWN_FEED is not available", { details: { marker: "G10_LAST_PAY_DRAWN_FEED" } });
    }
    return { ...feed };
  }

  summary(scope: TenantScope): PayrollSummary {
    requireTenantScope(scope);
    const runs = this.runs.filter((run) => this.inScope(run, scope));
    return {
      salaryStructures: this.salaryStructures.filter((structure) => this.inScope(structure, scope)).length,
      runs: runs.length,
      lockedRuns: runs.filter((run) => run.status === "LOCKED" || run.status === "DISBURSED" || run.status === "CLOSED").length,
      disbursedRuns: runs.filter((run) => run.status === "DISBURSED" || run.status === "CLOSED").length,
      lastPayDrawnFeeds: this.lastPayFeeds.filter((feed) => this.employeeMaster.getById(scope, feed.employeeId)).length,
      calculationMarker: "PAYROLL_TRACE",
      ruleSnapshotMarker: "RULE_VERSION_SNAPSHOT",
      x3Marker: "BANK_X3_EXPORT",
    };
  }

  private computeLine(scope: TenantScope, structure: SalaryStructure, period: string): PayrollLine {
    const adjustments = this.adjustments.filter((adjustment) => this.inScope(adjustment, scope) && adjustment.employeeId === structure.employeeId && adjustment.period === period);
    const lopDays = adjustments.filter((adjustment) => adjustment.code === "LOP").reduce((total, adjustment) => total + (adjustment.lopDays ?? 0), 0);
    const dailyBasicCents = roundDivide(structure.basicPayCents, 30);
    const lopDeductionCents = dailyBasicCents * lopDays;
    const earnedBasicCents = Math.max(0, structure.basicPayCents - lopDeductionCents);
    const daCents = roundBps(earnedBasicCents, structure.daRateBps);
    const hraCents = roundBps(earnedBasicCents, structure.hraRateBps);
    const positiveAdjustments = adjustments.filter((adjustment) => this.isEarningAdjustment(adjustment)).reduce((total, adjustment) => total + adjustment.amountCents, 0);
    const recoveryAdjustments = adjustments.filter((adjustment) => this.isDeductionAdjustment(adjustment)).reduce((total, adjustment) => total + Math.abs(adjustment.amountCents), 0);
    const npsCents = roundBps(earnedBasicCents + daCents, structure.npsRateBps);
    const grossCents = earnedBasicCents + daCents + hraCents + positiveAdjustments;
    const deductionsCents = npsCents + structure.professionalTaxCents + lopDeductionCents + recoveryAdjustments;
    const netPayCents = grossCents - deductionsCents;
    const trace: PayrollTraceStep[] = [
      { code: "EARNED_BASIC", amountCents: earnedBasicCents, marker: "PAYROLL_TRACE" },
      { code: "DA", amountCents: daCents, marker: "PAYROLL_TRACE" },
      { code: "HRA", amountCents: hraCents, marker: "PAYROLL_TRACE" },
      { code: "NPS", amountCents: npsCents, marker: "PAYROLL_TRACE" },
      { code: "PROFESSIONAL_TAX", amountCents: structure.professionalTaxCents, marker: "PAYROLL_TRACE" },
    ];
    for (const adjustment of adjustments) {
      trace.push({
        code: adjustment.code,
        amountCents: adjustment.code === "LOP" ? lopDeductionCents : adjustment.amountCents,
        marker: adjustment.code === "LOP" ? "G03_LOP_PAYROLL_IMPACT" : "PAYROLL_TRACE",
        sourceRef: adjustment.sourceRef,
      });
    }
    return {
      employeeId: structure.employeeId,
      salaryStructureId: structure.id,
      basicPayCents: structure.basicPayCents,
      earnedBasicCents,
      daCents,
      hraCents,
      grossCents,
      deductionsCents,
      netPayCents,
      trace,
    };
  }

  private buildInputSnapshot(scope: TenantScope, period: string): { period: string; structures: SalaryStructure[]; adjustments: PayrollAdjustment[] } {
    return {
      period,
      structures: this.salaryStructures.filter((structure) => this.inScope(structure, scope)).map((structure) => this.cloneSalaryStructure(structure)),
      adjustments: this.adjustments.filter((adjustment) => this.inScope(adjustment, scope) && adjustment.period === period).map((adjustment) => this.cloneAdjustment(adjustment)),
    };
  }

  private ruleVersionSnapshot(structures: SalaryStructure[]): string {
    return structures
      .map((structure) => `${structure.employeeId}:${structure.ruleVersion}`)
      .sort()
      .join("|");
  }

  private isEarningAdjustment(adjustment: PayrollAdjustment): boolean {
    return adjustment.code === "TRANSFER_ALLOWANCE" || adjustment.code === "PROMOTION_ARREARS" || adjustment.code === "MANUAL_EARNING";
  }

  private isDeductionAdjustment(adjustment: PayrollAdjustment): boolean {
    return adjustment.code === "PENALTY_RECOVERY" || adjustment.code === "MANUAL_DEDUCTION";
  }

  private assertPositiveMoney(value: MoneyCents, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new FoundationError("VALIDATION_FAILED", `${field} must be a positive integer amount in cents`, { field });
    }
  }

  private assertNonNegativeMoney(value: MoneyCents, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new FoundationError("VALIDATION_FAILED", `${field} must be a non-negative integer amount in cents`, { field });
    }
  }

  private requireRun(scope: TenantScope, runId: string): PayrollRun {
    requireTenantScope(scope);
    const run = this.runs.find((item) => item.id === runId && this.inScope(item, scope));
    if (!run) {
      throw new FoundationError("NOT_FOUND", "Payroll run not found");
    }
    return run;
  }

  private requireStatus(run: PayrollRun, status: PayrollRunStatus): void {
    if (run.status !== status) {
      throw new FoundationError("PRECONDITION_FAILED", `Payroll run must be ${status}`);
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }

  private cloneSalaryStructure(structure: SalaryStructure): SalaryStructure {
    return { ...structure };
  }

  private cloneAdjustment(adjustment: PayrollAdjustment): PayrollAdjustment {
    return { ...adjustment };
  }

  private cloneRun(run: PayrollRun): PayrollRun {
    return {
      ...run,
      totals: { ...run.totals },
      lines: run.lines.map((line) => ({ ...line, trace: line.trace.map((step) => ({ ...step })) })),
      bankBatch: run.bankBatch ? { ...run.bankBatch } : undefined,
    };
  }
}

function roundBps(amountCents: MoneyCents, bps: number): MoneyCents {
  return Math.round((amountCents * bps) / 10000);
}

function roundDivide(amountCents: MoneyCents, divisor: number): MoneyCents {
  return Math.round(amountCents / divisor);
}
