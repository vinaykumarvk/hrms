import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";
import { PayCalcMethod, PayComponentCategory } from "./payRuleRepository";

/**
 * PH-09B — G10 deterministic payroll engine persistence (BRD G10 FR-04/05/06/10/13/16/22):
 * E11 payroll_runs (snapshot-bound run instance, single-in-flight FINAL),
 * E12 payslips (versioned per-employee headers; reopen -> supersede, originals REVERSED),
 * E13 payslip_lines (APPEND-ONLY ledger; the YTD source-of-truth, VAL-G10-YTD-DERIVE),
 * E20 arrears (Σ months new−old with month-wise component-wise breakup persisted),
 * E35 deduction_carryforwards (net-pay-floor excess booked forward, ERR-G10-RECOVERY-NET).
 * Physical tables per docs/data-model/10-G10-payroll-benefits.sql: g10_payroll_runs /
 * g10_payslips / g10_payslip_lines / g10_arrears / g10_deduction_carryforwards
 * (migration 0015). All money is integer cents; no float parsing and no string rounding anywhere.
 */

export type EngineRunMode = "DRAFT" | "FINAL";
export type EngineRunStatus = "QUEUED" | "COMPUTED" | "APPROVED" | "LOCKED" | "SUPERSEDED";
export type EnginePayslipStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "REVERSED";
export type EnginePayslipLineType = "EARNING" | "DEDUCTION" | "ROUNDING_ADJUSTMENT" | "LWP_RECOVERY" | "ARREAR";
export type EngineSupersessionReason = "REOPEN" | "ARREAR_LINK" | "CORRECTION";
export type EngineArrearType = "DA_REVISION" | "INCREMENT" | "PAY_FIXATION" | "PROMOTION" | "CORRECTION";
export type EngineArrearStatus = "COMPUTED" | "APPROVED" | "PAID" | "CANCELLED";
export type CarryforwardSource = "STATUTORY" | "LOAN" | "RECOVERY" | "COURT_ATTACHMENT" | "DISCIPLINARY" | "OVERPAYMENT";
export type CarryforwardStatus = "OPEN" | "PARTIALLY_RECOVERED" | "RECOVERED" | "WRITTEN_OFF";

/** E09-analogue: per-employee salary enrolment feeding FLAT component bases into the run snapshot. */
export interface SalaryEnrolment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  /** State of posting — drives state-wise PT slab resolution (ERR-G10-PT-STATE when absent). */
  stateOfPosting?: string;
  /** FLAT component base amounts in integer cents, keyed by component code. */
  componentAmountsCents: Record<string, number>;
  effectiveFrom: string;
}

/** FR-09 recovery demand queued against an employee for a period (net-pay floor applies). */
export interface RecoveryDemand {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  period: string;
  amountCents: number;
  sourceType: CarryforwardSource;
  sourceRef: string;
}

/** Effective rule row frozen into the run snapshot (rule versions pinned, FR-22). */
export interface SnapshotRule {
  componentCode: string;
  category: PayComponentCategory;
  calcMethod: PayCalcMethod;
  ruleId: string;
  version: number;
  computationOrder: number;
  formulaExpression?: string;
}

/** Rate-table row frozen into the run snapshot (as-of resolution happens against these). */
export interface SnapshotRateRow {
  id: string;
  state?: string;
  slabMinCents?: number;
  slabMaxCents?: number;
  ratePctBps?: number;
  flatAmountCents?: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** G03 payroll_attendance_feed fact consumed at snapshot time (FR-05 — never hand-keyed). */
export interface SnapshotAttendanceFact {
  employeeId: string;
  lwpDays: number;
  halfPayDays: number;
}

/** E10-analogue run_input_snapshots payload: everything compute may read (FR-22). */
export interface EngineRunSnapshot {
  period: string;
  calendarDays: number;
  /** Per-day LOP basis (BRD FR-05 BR1: calendar days or fixed 30 per policy). */
  perDayBasisDays: number;
  /** Protected net-pay floor in basis points of gross (FR-09; excess -> carryforward). */
  netPayFloorBps: number;
  attendanceFeed: SnapshotAttendanceFact[];
  enrolments: SalaryEnrolment[];
  recoveryDemands: RecoveryDemand[];
  arrears: { arrearId: string; employeeId: string; netArrearCents: number }[];
  ruleSet: SnapshotRule[];
  rateRows: Record<string, SnapshotRateRow[]>;
}

/** E11 payroll_runs row (deep engine run; single-in-flight FINAL per period). */
export interface EnginePayrollRun {
  id: string;
  tenantId: string;
  entityId?: string;
  runNo: string;
  period: string;
  runMode: EngineRunMode;
  status: EngineRunStatus;
  snapshot?: EngineRunSnapshot;
  snapshotHash?: string;
  grossTotalCents: number;
  deductionTotalCents: number;
  netTotalCents: number;
  employeeCount: number;
  supersededRunId?: string;
  reopenReason?: string;
  makerUserId: string;
  approvedByUserId?: string;
  lockedAt?: string;
  transmittedAt?: string;
}

/** E12 payslips row (versioned; reopen -> new version, originals REVERSED). */
export interface EnginePayslip {
  id: string;
  tenantId: string;
  entityId?: string;
  payslipNo: string;
  runId: string;
  employeeId: string;
  period: string;
  version: number;
  status: EnginePayslipStatus;
  supersessionReason?: EngineSupersessionReason;
  supersededByPayslipId?: string;
  /** Paid/LWP day counts scaled x100 (integer hundredths — no floats). */
  paidDaysHundredths: number;
  lwpDaysHundredths: number;
  grossCents: number;
  deductionsCents: number;
  netPayCents: number;
  /** FR-09: recovery held at the net-pay floor; excess booked to deduction_carryforwards. */
  recoveryHold?: { code: "ERR-G10-RECOVERY-NET"; heldCents: number; carryforwardId?: string };
}

/** E13 payslip_lines row — APPEND-ONLY ledger; YTD derives from these (VAL-G10-YTD-DERIVE). */
export interface EnginePayslipLine {
  id: string;
  tenantId: string;
  entityId?: string;
  payslipId: string;
  employeeId: string;
  period: string;
  componentCode: string;
  lineType: EnginePayslipLineType;
  amountCents: number;
  sequenceNo: number;
  /** Logical ref -> g10_arrears (additive arrear line; locked originals never mutate). */
  arrearRef?: string;
  calcTrace: Record<string, unknown>;
}

/** One month-wise component-wise delta row of an arrear breakup (FR-10 AC2). */
export interface ArrearMonthDelta {
  period: string;
  componentCode: string;
  oldAmountCents: number;
  newAmountCents: number;
  deltaCents: number;
}

/** E20 arrears row: delta = Σ over affected months of (new − old); breakup persisted. */
export interface EngineArrear {
  id: string;
  tenantId: string;
  entityId?: string;
  arrearNo: string;
  employeeId: string;
  arrearType: EngineArrearType;
  sourceReference: string;
  periodFrom: string;
  periodTo: string;
  monthWiseBreakup: ArrearMonthDelta[];
  grossArrearCents: number;
  deductionArrearCents: number;
  netArrearCents: number;
  status: EngineArrearStatus;
  paidInRunId?: string;
}

/** E35 deduction_carryforwards row (outstanding = original − recovered; §5.6-18). */
export interface DeductionCarryforward {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  sourceType: CarryforwardSource;
  sourceRef: string;
  originalAmountCents: number;
  recoveredToDateCents: number;
  outstandingCents: number;
  status: CarryforwardStatus;
  bookedFromRunId?: string;
}

export interface PayrollEngineRepository {
  countEnrolments(): number;
  saveEnrolment(enrolment: SalaryEnrolment): void;
  listEnrolments(scope: TenantScope): SalaryEnrolment[];
  findEnrolment(scope: TenantScope, employeeId: string): SalaryEnrolment | undefined;

  countRecoveryDemands(): number;
  saveRecoveryDemand(demand: RecoveryDemand): void;
  listRecoveryDemands(scope: TenantScope, period: string): RecoveryDemand[];

  countRuns(): number;
  saveRun(run: EnginePayrollRun): void;
  findRun(scope: TenantScope, runId: string): EnginePayrollRun | undefined;
  listRuns(scope: TenantScope): EnginePayrollRun[];

  savePayslip(payslip: EnginePayslip): void;
  listPayslipsForRun(scope: TenantScope, runId: string): EnginePayslip[];
  listPayslipsForEmployee(scope: TenantScope, employeeId: string): EnginePayslip[];
  /** Recompute pre-lock: drop DRAFT payslips (+lines) for the run; the published ledger is untouchable. */
  deleteDraftPayslipsForRun(scope: TenantScope, runId: string): void;

  appendPayslipLine(line: EnginePayslipLine): void;
  listLinesForPayslip(scope: TenantScope, payslipId: string): EnginePayslipLine[];
  listLinesForEmployee(scope: TenantScope, employeeId: string): EnginePayslipLine[];

  countArrears(): number;
  saveArrear(arrear: EngineArrear): void;
  findArrear(scope: TenantScope, arrearId: string): EngineArrear | undefined;
  listArrears(scope: TenantScope): EngineArrear[];

  countCarryforwards(): number;
  saveCarryforward(row: DeductionCarryforward): void;
  listCarryforwards(scope: TenantScope, employeeId?: string): DeductionCarryforward[];
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory PayrollEngineRepository (injectable for unit tests; same seam as PgPayrollEngineRepository). */
export class InMemoryPayrollEngineRepository implements PayrollEngineRepository {
  private readonly enrolments: SalaryEnrolment[] = [];
  private readonly recoveryDemands: RecoveryDemand[] = [];
  private readonly runs: EnginePayrollRun[] = [];
  private readonly payslips: EnginePayslip[] = [];
  private readonly payslipLines: EnginePayslipLine[] = [];
  private readonly arrears: EngineArrear[] = [];
  private readonly carryforwards: DeductionCarryforward[] = [];

  countEnrolments(): number {
    return this.enrolments.length;
  }

  saveEnrolment(enrolment: SalaryEnrolment): void {
    const index = this.enrolments.findIndex((item) => item.id === enrolment.id);
    if (index < 0) {
      this.enrolments.push(enrolment);
      return;
    }
    this.enrolments[index] = enrolment;
  }

  listEnrolments(scope: TenantScope): SalaryEnrolment[] {
    return this.enrolments.filter((item) => rowInScope(item, scope));
  }

  findEnrolment(scope: TenantScope, employeeId: string): SalaryEnrolment | undefined {
    return this.listEnrolments(scope).find((item) => item.employeeId === employeeId);
  }

  countRecoveryDemands(): number {
    return this.recoveryDemands.length;
  }

  saveRecoveryDemand(demand: RecoveryDemand): void {
    this.recoveryDemands.push(demand);
  }

  listRecoveryDemands(scope: TenantScope, period: string): RecoveryDemand[] {
    return this.recoveryDemands.filter((item) => rowInScope(item, scope) && item.period === period);
  }

  countRuns(): number {
    return this.runs.length;
  }

  saveRun(run: EnginePayrollRun): void {
    const index = this.runs.findIndex((item) => item.id === run.id);
    if (index < 0) {
      this.runs.push(run);
      return;
    }
    this.runs[index] = run;
  }

  findRun(scope: TenantScope, runId: string): EnginePayrollRun | undefined {
    return this.listRuns(scope).find((item) => item.id === runId);
  }

  listRuns(scope: TenantScope): EnginePayrollRun[] {
    return this.runs.filter((item) => rowInScope(item, scope));
  }

  savePayslip(payslip: EnginePayslip): void {
    const index = this.payslips.findIndex((item) => item.id === payslip.id);
    if (index < 0) {
      this.payslips.push(payslip);
      return;
    }
    this.payslips[index] = payslip;
  }

  listPayslipsForRun(scope: TenantScope, runId: string): EnginePayslip[] {
    return this.payslips.filter((item) => rowInScope(item, scope) && item.runId === runId);
  }

  listPayslipsForEmployee(scope: TenantScope, employeeId: string): EnginePayslip[] {
    return this.payslips.filter((item) => rowInScope(item, scope) && item.employeeId === employeeId);
  }

  deleteDraftPayslipsForRun(scope: TenantScope, runId: string): void {
    const draftIds = new Set(
      this.payslips.filter((item) => rowInScope(item, scope) && item.runId === runId && item.status === "DRAFT").map((item) => item.id)
    );
    for (let index = this.payslips.length - 1; index >= 0; index -= 1) {
      const payslip = this.payslips[index];
      if (payslip && draftIds.has(payslip.id)) {
        this.payslips.splice(index, 1);
      }
    }
    for (let index = this.payslipLines.length - 1; index >= 0; index -= 1) {
      const line = this.payslipLines[index];
      if (line && draftIds.has(line.payslipId)) {
        this.payslipLines.splice(index, 1);
      }
    }
  }

  appendPayslipLine(line: EnginePayslipLine): void {
    this.payslipLines.push(line);
  }

  listLinesForPayslip(scope: TenantScope, payslipId: string): EnginePayslipLine[] {
    return this.payslipLines.filter((item) => rowInScope(item, scope) && item.payslipId === payslipId);
  }

  listLinesForEmployee(scope: TenantScope, employeeId: string): EnginePayslipLine[] {
    return this.payslipLines.filter((item) => rowInScope(item, scope) && item.employeeId === employeeId);
  }

  countArrears(): number {
    return this.arrears.length;
  }

  saveArrear(arrear: EngineArrear): void {
    const index = this.arrears.findIndex((item) => item.id === arrear.id);
    if (index < 0) {
      this.arrears.push(arrear);
      return;
    }
    this.arrears[index] = arrear;
  }

  findArrear(scope: TenantScope, arrearId: string): EngineArrear | undefined {
    return this.listArrears(scope).find((item) => item.id === arrearId);
  }

  listArrears(scope: TenantScope): EngineArrear[] {
    return this.arrears.filter((item) => rowInScope(item, scope));
  }

  countCarryforwards(): number {
    return this.carryforwards.length;
  }

  saveCarryforward(row: DeductionCarryforward): void {
    const index = this.carryforwards.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.carryforwards.push(row);
      return;
    }
    this.carryforwards[index] = row;
  }

  listCarryforwards(scope: TenantScope, employeeId?: string): DeductionCarryforward[] {
    return this.carryforwards.filter((item) => rowInScope(item, scope) && (!employeeId || item.employeeId === employeeId));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G10 DDL (docs/data-model/10-*.sql; migration
// apps/api/db/migrations/0015_g10_payroll_engine.sql): g10_payroll_runs, g10_payslips,
// g10_payslip_lines (append-only), g10_arrears (component_breakup jsonb month-wise rows),
// g10_deduction_carryforwards. All SQL is parameterised ($1, $2, ...); every multi-row
// write (run compute persist, run lock/publish, reopen supersede) runs in ONE transaction.
// Money columns are NUMERIC(15,2); cents conversion happens in SQL ((col * 100)::bigint /
// ($n::numeric / 100)) — never through float parsing.
// ---------------------------------------------------------------------------------------

const SELECT_INFLIGHT_FINAL_RUNS_FOR_UPDATE =
  // Mirrors partial unique index uq_g10_run_inflight: one in-flight FINAL run per period.
  "SELECT id FROM g10_payroll_runs WHERE tenant_id = $1 AND period = $2 AND run_mode = 'FINAL' " +
  "AND status IN ('QUEUED','COMPUTED','APPROVED') AND is_deleted = false FOR UPDATE";

const INSERT_ENGINE_RUN =
  "INSERT INTO g10_payroll_runs (tenant_id, entity_id, run_no, period, run_mode, status, snapshot, snapshot_hash, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING id, run_no, status";

const UPDATE_ENGINE_RUN_TOTALS =
  "UPDATE g10_payroll_runs SET status = $3, gross_total = $4::numeric / 100, deduction_total = $5::numeric / 100, " +
  "net_total = $6::numeric / 100, employee_count = $7, updated_at = now() WHERE tenant_id = $1 AND id = $2";

const DELETE_DRAFT_LINES_FOR_RUN =
  "DELETE FROM g10_payslip_lines WHERE tenant_id = $1 AND payslip_id IN " +
  "(SELECT id FROM g10_payslips WHERE tenant_id = $1 AND run_id = $2 AND status = 'DRAFT')";

const DELETE_DRAFT_PAYSLIPS_FOR_RUN =
  "DELETE FROM g10_payslips WHERE tenant_id = $1 AND run_id = $2 AND status = 'DRAFT'";

const INSERT_ENGINE_PAYSLIP =
  "INSERT INTO g10_payslips (tenant_id, entity_id, payslip_no, run_id, employee_id, version, status, " +
  "paid_days, lwp_days, gross_earnings, total_deductions, net_pay, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric / 100, $9::numeric / 100, $10::numeric / 100, $11::numeric / 100, $12::numeric / 100, $13) " +
  "RETURNING id";

const INSERT_ENGINE_PAYSLIP_LINE =
  // E13 payslip_lines is APPEND-ONLY: inserts only, no UPDATE/DELETE statement exists for it post-publish.
  "INSERT INTO g10_payslip_lines (tenant_id, entity_id, payslip_id, line_type, description, amount, sequence_no, arrear_ref, calc_trace, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::numeric / 100, $7, $8, $9::jsonb, $10) RETURNING id";

const PUBLISH_RUN_PAYSLIPS =
  "UPDATE g10_payslips SET status = 'PUBLISHED', updated_at = now() WHERE tenant_id = $1 AND run_id = $2 AND status = 'DRAFT'";

const LOCK_ENGINE_RUN =
  "UPDATE g10_payroll_runs SET status = 'LOCKED', locked_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2";

const REVERSE_RUN_PAYSLIPS =
  // Reopen supersedes: originals flip to REVERSED (supersession_reason REOPEN) — lines are never edited.
  "UPDATE g10_payslips SET status = 'REVERSED', supersession_reason = 'REOPEN', superseded_by_payslip_id = $3, updated_at = now() " +
  "WHERE tenant_id = $1 AND run_id = $2 AND status = 'PUBLISHED'";

const INSERT_ENGINE_ARREAR =
  "INSERT INTO g10_arrears (tenant_id, entity_id, arrear_no, employee_id, arrear_type, source_reference, period_from, period_to, " +
  "gross_arrear, deduction_arrear, net_arrear, component_breakup, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric / 100, $10::numeric / 100, $11::numeric / 100, $12::jsonb, $13, $14) RETURNING id";

const INSERT_ENGINE_CARRYFORWARD =
  "INSERT INTO g10_deduction_carryforwards (tenant_id, entity_id, employee_id, source_type, original_amount, recovered_to_date, outstanding, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5::numeric / 100, $6::numeric / 100, $7::numeric / 100, $8, $9) RETURNING id";

const SELECT_YTD_FROM_PAYSLIP_LINES =
  // VAL-G10-YTD-DERIVE: YTD is DERIVED from the immutable payslip_lines ledger over surviving
  // (PUBLISHED, non-REVERSED) payslips — never read from a mutable running counter.
  "SELECT l.line_type, SUM((l.amount * 100)::bigint) AS total_cents FROM g10_payslip_lines l " +
  "JOIN g10_payslips p ON p.id = l.payslip_id AND p.tenant_id = l.tenant_id " +
  "WHERE l.tenant_id = $1 AND p.employee_id = $2 AND p.status = 'PUBLISHED' GROUP BY l.line_type";

/** Postgres-backed G10 payroll engine repository (g10_payroll_runs .. g10_deduction_carryforwards). */
export class PgPayrollEngineRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * ERR-G10-RUN-INFLIGHT: the in-flight probe (FOR UPDATE) and the run INSERT commit in ONE
   * transaction, mirroring the uq_g10_run_inflight partial unique index — never a silent
   * second FINAL run. Returns undefined when another FINAL run is in flight.
   */
  async insertRunGuarded(input: {
    tenantId: string;
    entityId?: string;
    runNo: string;
    period: string;
    runMode: EngineRunMode;
    snapshotJson?: string;
    snapshotHash?: string;
    createdBy?: string;
  }): Promise<{ inserted: boolean; conflictingRunId?: string; row?: Record<string, unknown> }> {
    return withTransaction(this.pool, async (client) => {
      if (input.runMode === "FINAL") {
        const inflight = await client.query(SELECT_INFLIGHT_FINAL_RUNS_FOR_UPDATE, [input.tenantId, input.period]);
        if ((inflight.rowCount ?? 0) > 0) {
          return { inserted: false, conflictingRunId: (inflight.rows[0] as { id: string }).id };
        }
      }
      const result = await client.query(INSERT_ENGINE_RUN, [
        input.tenantId,
        input.entityId ?? null,
        input.runNo,
        input.period,
        input.runMode,
        "QUEUED",
        input.snapshotJson ?? null,
        input.snapshotHash ?? null,
        input.createdBy ?? null,
      ]);
      return { inserted: true, row: result.rows[0] as Record<string, unknown> };
    });
  }

  /**
   * Persist one computed run atomically: drop the run's DRAFT payslips (+lines), insert the
   * recomputed payslips with their payslip_lines, and update the run totals — ONE transaction.
   */
  async persistComputedRun(input: {
    tenantId: string;
    entityId?: string;
    runId: string;
    createdBy?: string;
    grossTotalCents: number;
    deductionTotalCents: number;
    netTotalCents: number;
    payslips: {
      payslipNo: string;
      employeeId: string;
      version: number;
      paidDaysHundredths: number;
      lwpDaysHundredths: number;
      grossCents: number;
      deductionsCents: number;
      netPayCents: number;
      lines: { lineType: EnginePayslipLineType; componentCode: string; amountCents: number; sequenceNo: number; arrearRef?: string; calcTraceJson: string }[];
    }[];
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(DELETE_DRAFT_LINES_FOR_RUN, [input.tenantId, input.runId]);
      await client.query(DELETE_DRAFT_PAYSLIPS_FOR_RUN, [input.tenantId, input.runId]);
      for (const payslip of input.payslips) {
        const inserted = await client.query(INSERT_ENGINE_PAYSLIP, [
          input.tenantId,
          input.entityId ?? null,
          payslip.payslipNo,
          input.runId,
          payslip.employeeId,
          payslip.version,
          "DRAFT",
          payslip.paidDaysHundredths,
          payslip.lwpDaysHundredths,
          payslip.grossCents,
          payslip.deductionsCents,
          payslip.netPayCents,
          input.createdBy ?? null,
        ]);
        const payslipId = (inserted.rows[0] as { id: string }).id;
        for (const line of payslip.lines) {
          await client.query(INSERT_ENGINE_PAYSLIP_LINE, [
            input.tenantId,
            input.entityId ?? null,
            payslipId,
            line.lineType,
            line.componentCode,
            line.amountCents,
            line.sequenceNo,
            line.arrearRef ?? null,
            line.calcTraceJson,
            input.createdBy ?? null,
          ]);
        }
      }
      await client.query(UPDATE_ENGINE_RUN_TOTALS, [
        input.tenantId,
        input.runId,
        "COMPUTED",
        input.grossTotalCents,
        input.deductionTotalCents,
        input.netTotalCents,
        input.payslips.length,
      ]);
    });
  }

  /** Lock a run: publish its payslips and stamp locked_at — ONE transaction (FR-16 AC2). */
  async lockRun(tenantId: string, runId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(PUBLISH_RUN_PAYSLIPS, [tenantId, runId]);
      await client.query(LOCK_ENGINE_RUN, [tenantId, runId]);
    });
  }

  /** Reopen supersede: mark the run's PUBLISHED payslips REVERSED (originals never edited). */
  async reverseRunPayslips(tenantId: string, runId: string, supersededByPayslipId: string | null): Promise<number> {
    const result = await this.pool.query(REVERSE_RUN_PAYSLIPS, [tenantId, runId, supersededByPayslipId]);
    return result.rowCount ?? 0;
  }

  async insertArrear(input: {
    tenantId: string;
    entityId?: string;
    arrearNo: string;
    employeeId: string;
    arrearType: EngineArrearType;
    sourceReference: string;
    periodFrom: string;
    periodTo: string;
    grossArrearCents: number;
    deductionArrearCents: number;
    netArrearCents: number;
    monthWiseBreakupJson: string;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_ENGINE_ARREAR, [
      input.tenantId,
      input.entityId ?? null,
      input.arrearNo,
      input.employeeId,
      input.arrearType,
      input.sourceReference,
      input.periodFrom,
      input.periodTo,
      input.grossArrearCents,
      input.deductionArrearCents,
      input.netArrearCents,
      input.monthWiseBreakupJson,
      "COMPUTED",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  async insertCarryforward(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    sourceType: CarryforwardSource;
    originalAmountCents: number;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_ENGINE_CARRYFORWARD, [
      input.tenantId,
      input.entityId ?? null,
      input.employeeId,
      input.sourceType,
      input.originalAmountCents,
      0,
      input.originalAmountCents,
      "OPEN",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  /** VAL-G10-YTD-DERIVE: derive YTD sums from the payslip_lines ledger (surviving payslips only). */
  async ytdFromPayslipLines(tenantId: string, employeeId: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(SELECT_YTD_FROM_PAYSLIP_LINES, [tenantId, employeeId]);
    return result.rows as Record<string, unknown>[];
  }
}
