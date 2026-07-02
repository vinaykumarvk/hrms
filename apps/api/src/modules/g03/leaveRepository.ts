import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";
import type {
  AttendanceRecord,
  HolidayEntry,
  LeaveApplication,
  LeaveBalance,
  LeaveLedgerEntry,
  LeaveTypeConfig,
  PayrollAttendanceFeedRow,
  PayrollFeedAdjustment,
  PayrollSignal,
} from "./leaveService";

/**
 * G03 leave repository contract consumed by LeaveService.
 * Entity state for leave applications, balances, ledger entries, the FR-10 leave-type/
 * accrual-policy catalog, the FR-02 holiday calendar, FR-04 attendance days, and the
 * FR-17 payroll feed (payroll_attendance_feed / payroll_feed_adjustments / period locks)
 * routes through here; the service no longer owns bare in-memory arrays.
 */
export interface LeaveRepository {
  countApplications(): number;
  insertApplication(application: LeaveApplication): void;
  updateApplication(application: LeaveApplication): void;
  findApplication(scope: TenantScope, leaveApplicationId: string): LeaveApplication | undefined;
  listApplications(scope: TenantScope): LeaveApplication[];
  findBalance(scope: TenantScope, employeeId: string, leaveTypeId: string, leaveYear: number): LeaveBalance | undefined;
  saveBalance(balance: LeaveBalance): void;
  countLedgerEntries(): number;
  appendLedgerEntry(entry: LeaveLedgerEntry): void;
  listLedgerEntries(): LeaveLedgerEntry[];
  saveLeaveType(config: LeaveTypeConfig): void;
  findLeaveType(scope: TenantScope, leaveTypeId: string): LeaveTypeConfig | undefined;
  listLeaveTypes(scope: TenantScope): LeaveTypeConfig[];
  saveHoliday(entry: HolidayEntry): void;
  listHolidays(scope: TenantScope): HolidayEntry[];
  countAttendance(): number;
  saveAttendance(record: AttendanceRecord): void;
  findAttendance(scope: TenantScope, attendanceId: string): AttendanceRecord | undefined;
  listAttendance(scope: TenantScope): AttendanceRecord[];
  countPayrollSignals(): number;
  appendPayrollSignal(signal: PayrollSignal): void;
  listPayrollSignals(): PayrollSignal[];
  countFeedRows(): number;
  saveFeedRow(row: PayrollAttendanceFeedRow): void;
  findFeedRow(scope: TenantScope, payPeriod: string, employeeId: string): PayrollAttendanceFeedRow | undefined;
  listFeedRows(scope: TenantScope, payPeriod?: string): PayrollAttendanceFeedRow[];
  /** Marks the period locked and freezes its feed rows (is_locked + EXPORTED). Returns rows locked. */
  lockFeedPeriod(scope: TenantScope, payPeriod: string): number;
  isFeedPeriodLocked(scope: TenantScope, payPeriod: string): boolean;
  countFeedAdjustments(): number;
  appendFeedAdjustment(adjustment: PayrollFeedAdjustment): void;
  listFeedAdjustments(scope: TenantScope): PayrollFeedAdjustment[];
}

/** In-memory implementation of the LeaveRepository interface, injectable for unit tests. */
export class InMemoryLeaveRepository implements LeaveRepository {
  private readonly applications: LeaveApplication[] = [];
  private readonly balances: LeaveBalance[] = [];
  private readonly ledger: LeaveLedgerEntry[] = [];
  private readonly leaveTypes: LeaveTypeConfig[] = [];
  private readonly holidays: HolidayEntry[] = [];
  private readonly attendance: AttendanceRecord[] = [];
  private readonly payrollSignals: PayrollSignal[] = [];
  private readonly feedRows: PayrollAttendanceFeedRow[] = [];
  private readonly feedAdjustments: PayrollFeedAdjustment[] = [];
  private readonly lockedFeedPeriods = new Set<string>();

  countApplications(): number {
    return this.applications.length;
  }

  insertApplication(application: LeaveApplication): void {
    this.applications.push(application);
  }

  updateApplication(application: LeaveApplication): void {
    const index = this.applications.findIndex((item) => item.id === application.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Leave application not found");
    }
    this.applications[index] = application;
  }

  findApplication(scope: TenantScope, leaveApplicationId: string): LeaveApplication | undefined {
    return this.applications.find(
      (item) => item.id === leaveApplicationId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  listApplications(scope: TenantScope): LeaveApplication[] {
    return this.applications.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  findBalance(scope: TenantScope, employeeId: string, leaveTypeId: string, leaveYear: number): LeaveBalance | undefined {
    return this.balances.find(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || item.entityId === scope.entityId) &&
        item.employeeId === employeeId &&
        item.leaveTypeId === leaveTypeId &&
        item.leaveYear === leaveYear
    );
  }

  saveBalance(balance: LeaveBalance): void {
    const index = this.balances.findIndex(
      (item) =>
        item.tenantId === balance.tenantId &&
        item.entityId === balance.entityId &&
        item.employeeId === balance.employeeId &&
        item.leaveTypeId === balance.leaveTypeId &&
        item.leaveYear === balance.leaveYear
    );
    if (index < 0) {
      this.balances.push(balance);
      return;
    }
    this.balances[index] = balance;
  }

  countLedgerEntries(): number {
    return this.ledger.length;
  }

  appendLedgerEntry(entry: LeaveLedgerEntry): void {
    this.ledger.push(entry);
  }

  listLedgerEntries(): LeaveLedgerEntry[] {
    return this.ledger;
  }

  saveLeaveType(config: LeaveTypeConfig): void {
    const index = this.leaveTypes.findIndex(
      (item) => item.tenantId === config.tenantId && item.entityId === config.entityId && item.leaveTypeId === config.leaveTypeId
    );
    if (index < 0) {
      this.leaveTypes.push(config);
      return;
    }
    this.leaveTypes[index] = config;
  }

  findLeaveType(scope: TenantScope, leaveTypeId: string): LeaveTypeConfig | undefined {
    return this.leaveTypes.find(
      (item) =>
        item.leaveTypeId === leaveTypeId &&
        item.tenantId === scope.tenantId &&
        (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
    );
  }

  listLeaveTypes(scope: TenantScope): LeaveTypeConfig[] {
    return this.leaveTypes.filter(
      (item) => item.tenantId === scope.tenantId && (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
    );
  }

  saveHoliday(entry: HolidayEntry): void {
    this.holidays.push(entry);
  }

  listHolidays(scope: TenantScope): HolidayEntry[] {
    return this.holidays.filter(
      (item) => item.tenantId === scope.tenantId && (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
    );
  }

  countAttendance(): number {
    return this.attendance.length;
  }

  saveAttendance(record: AttendanceRecord): void {
    const index = this.attendance.findIndex((item) => item.id === record.id);
    if (index < 0) {
      this.attendance.push(record);
      return;
    }
    this.attendance[index] = record;
  }

  findAttendance(scope: TenantScope, attendanceId: string): AttendanceRecord | undefined {
    return this.attendance.find(
      (item) => item.id === attendanceId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  listAttendance(scope: TenantScope): AttendanceRecord[] {
    return this.attendance.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  countPayrollSignals(): number {
    return this.payrollSignals.length;
  }

  appendPayrollSignal(signal: PayrollSignal): void {
    this.payrollSignals.push(signal);
  }

  listPayrollSignals(): PayrollSignal[] {
    return this.payrollSignals;
  }

  countFeedRows(): number {
    return this.feedRows.length;
  }

  saveFeedRow(row: PayrollAttendanceFeedRow): void {
    if (this.lockedFeedPeriods.has(feedPeriodKey(row.tenantId, row.payPeriod))) {
      throw new FoundationError("PERIOD_ALREADY_LOCKED", "Payroll feed period is locked; corrections must go through feed adjustments", {
        field: "payPeriod",
        details: { payPeriod: row.payPeriod },
      });
    }
    const index = this.feedRows.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.feedRows.push(row);
      return;
    }
    this.feedRows[index] = row;
  }

  findFeedRow(scope: TenantScope, payPeriod: string, employeeId: string): PayrollAttendanceFeedRow | undefined {
    return this.feedRows.find(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || item.entityId === scope.entityId) &&
        item.payPeriod === payPeriod &&
        item.employeeId === employeeId
    );
  }

  listFeedRows(scope: TenantScope, payPeriod?: string): PayrollAttendanceFeedRow[] {
    return this.feedRows.filter(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || item.entityId === scope.entityId) &&
        (!payPeriod || item.payPeriod === payPeriod)
    );
  }

  lockFeedPeriod(scope: TenantScope, payPeriod: string): number {
    this.lockedFeedPeriods.add(feedPeriodKey(scope.tenantId, payPeriod));
    let locked = 0;
    for (const row of this.feedRows) {
      if (row.tenantId === scope.tenantId && row.payPeriod === payPeriod && !row.isLocked) {
        row.isLocked = true;
        row.exportStatus = "EXPORTED";
        locked += 1;
      }
    }
    return locked;
  }

  isFeedPeriodLocked(scope: TenantScope, payPeriod: string): boolean {
    return this.lockedFeedPeriods.has(feedPeriodKey(scope.tenantId, payPeriod));
  }

  countFeedAdjustments(): number {
    return this.feedAdjustments.length;
  }

  appendFeedAdjustment(adjustment: PayrollFeedAdjustment): void {
    this.feedAdjustments.push(adjustment);
  }

  listFeedAdjustments(scope: TenantScope): PayrollFeedAdjustment[] {
    return this.feedAdjustments.filter(
      (item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }
}

function feedPeriodKey(tenantId: string, payPeriod: string): string {
  return `${tenantId}:${payPeriod}`;
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G03 data model (docs/data-model/03-*.sql).
// Row shapes mirror the migration DDL under apps/api/db/migrations. All SQL is
// parameterised ($1, $2, ...); multi-step writes run in a single transaction.
// ---------------------------------------------------------------------------------------

export interface LeaveTypeRow {
  id: string;
  tenant_id: string;
  leave_code: string;
  name: string;
  category: string;
  is_accruable: boolean;
  is_encashable: boolean;
  affects_pay: boolean;
  status: string;
}

export interface LeaveAccrualPolicyRow {
  id: string;
  tenant_id: string;
  leave_type_id: string;
  accrual_frequency: string;
  accrual_quantity: string;
  accrual_basis: string;
  carry_forward_allowed: boolean;
  lapse_rule: string;
  effective_from: Date;
  status: string;
}

export interface LeaveApplicationRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  application_no: string;
  employee_id: string;
  leave_type_id: string;
  start_date: Date;
  end_date: Date;
  total_days: string;
  ledger_debit_units: string;
  status: string;
  leave_spell_lineage_id: string;
}

export interface LeaveBalanceRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  leave_type_id: string;
  leave_year: number;
  opening_balance: string;
  accrued: string;
  availed: string;
  reserved: string;
  current_balance: string;
  available_balance: string;
  version: string;
  last_ledger_entry_id: string | null;
}

export interface LeaveReservationRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  leave_type_id: string;
  leave_year: number;
  application_id: string;
  reserved_units: string;
  status: string;
}

export interface LeaveLedgerEntryRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  leave_type_id: string;
  leave_year: number;
  entry_type: string;
  amount: string;
  balance_after: string;
  source_ref_type: string | null;
  source_ref_id: string | null;
  effective_date: Date;
}

const INSERT_LEAVE_TYPE =
  "INSERT INTO leave_types (tenant_id, entity_id, leave_code, name, category, is_accruable, is_encashable, affects_pay) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
  "RETURNING id, tenant_id, leave_code, name, category, is_accruable, is_encashable, affects_pay, status";

const SELECT_LEAVE_TYPE_BY_CODE =
  "SELECT id, tenant_id, leave_code, name, category, is_accruable, is_encashable, affects_pay, status " +
  "FROM leave_types WHERE tenant_id = $1 AND leave_code = $2 AND is_deleted = false";

const INSERT_ACCRUAL_POLICY =
  "INSERT INTO leave_accrual_policies (tenant_id, entity_id, leave_type_id, accrual_frequency, accrual_quantity, accrual_basis, carry_forward_allowed, lapse_rule, effective_from) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
  "RETURNING id, tenant_id, leave_type_id, accrual_frequency, accrual_quantity, accrual_basis, carry_forward_allowed, lapse_rule, effective_from, status";

const SELECT_ACCRUAL_POLICIES =
  "SELECT id, tenant_id, leave_type_id, accrual_frequency, accrual_quantity, accrual_basis, carry_forward_allowed, lapse_rule, effective_from, status " +
  "FROM leave_accrual_policies WHERE tenant_id = $1 AND leave_type_id = $2 AND is_deleted = false ORDER BY effective_from";

const INSERT_LEAVE_APPLICATION =
  "INSERT INTO leave_applications (tenant_id, entity_id, application_no, employee_id, leave_type_id, start_date, end_date, total_days, ledger_debit_units, reason, status, leave_spell_lineage_id) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, gen_random_uuid()) " +
  "RETURNING id, tenant_id, entity_id, application_no, employee_id, leave_type_id, start_date, end_date, total_days, ledger_debit_units, status, leave_spell_lineage_id";

const INSERT_BALANCE =
  "INSERT INTO leave_balances (tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance, current_balance, available_balance) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $6, $6) " +
  "RETURNING id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance, accrued, availed, reserved, current_balance, available_balance, version, last_ledger_entry_id";

const SELECT_BALANCE =
  "SELECT id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance, accrued, availed, reserved, current_balance, available_balance, version, last_ledger_entry_id " +
  "FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2 AND leave_year = $3 AND is_deleted = false";

const SELECT_BALANCE_FOR_UPDATE = SELECT_BALANCE + " FOR UPDATE";

const INSERT_RESERVATION =
  "INSERT INTO leave_reservations (tenant_id, entity_id, employee_id, leave_type_id, leave_year, application_id, reserved_units) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7) " +
  "RETURNING id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, application_id, reserved_units, status";

const RESERVE_BALANCE =
  "UPDATE leave_balances SET reserved = reserved + $4, available_balance = current_balance - (reserved + $4), version = version + 1, updated_at = now() " +
  "WHERE employee_id = $1 AND leave_type_id = $2 AND leave_year = $3 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance, accrued, availed, reserved, current_balance, available_balance, version, last_ledger_entry_id";

const CONSUME_RESERVATION =
  "UPDATE leave_reservations SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, application_id, reserved_units, status, tenant_id, entity_id, employee_id, leave_type_id, leave_year";

const INSERT_LEDGER_ENTRY =
  "INSERT INTO leave_ledger_entries (tenant_id, entity_id, employee_id, leave_type_id, leave_year, entry_type, amount, balance_after, source_ref_type, source_ref_id, effective_date) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, entry_type, amount, balance_after, source_ref_type, source_ref_id, effective_date";

const DEBIT_BALANCE =
  "UPDATE leave_balances SET availed = availed + $4, reserved = reserved - $4, current_balance = current_balance - $4, available_balance = (current_balance - $4) - (reserved - $4), version = version + 1, last_ledger_entry_id = $5, updated_at = now() " +
  "WHERE employee_id = $1 AND leave_type_id = $2 AND leave_year = $3 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance, accrued, availed, reserved, current_balance, available_balance, version, last_ledger_entry_id";

const SELECT_LEDGER_ENTRIES =
  "SELECT id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, entry_type, amount, balance_after, source_ref_type, source_ref_id, effective_date " +
  "FROM leave_ledger_entries WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3 AND leave_year = $4 ORDER BY created_at";

// FR-17 payroll feed + period lock + adjustments (migration 0007) ------------------------

const SELECT_FEED_PERIOD_LOCK =
  "SELECT id, status FROM attendance_lock_periods WHERE tenant_id = $1 AND lock_month = $2 AND scope_org_unit_id IS NULL AND is_deleted = false";

const SELECT_FEED_PERIOD_LOCK_FOR_UPDATE = SELECT_FEED_PERIOD_LOCK + " FOR UPDATE";

const UPSERT_FEED_ROW =
  "INSERT INTO payroll_attendance_feed (tenant_id, entity_id, pay_period, employee_id, lwp_days, half_pay_days, paid_ot_minutes, present_units, encashment_amount) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
  "ON CONFLICT (pay_period, employee_id) DO UPDATE SET lwp_days = EXCLUDED.lwp_days, half_pay_days = EXCLUDED.half_pay_days, " +
  "paid_ot_minutes = EXCLUDED.paid_ot_minutes, present_units = EXCLUDED.present_units, encashment_amount = EXCLUDED.encashment_amount, updated_at = now() " +
  "RETURNING id, tenant_id, entity_id, pay_period, employee_id, lwp_days, half_pay_days, paid_ot_minutes, present_units, encashment_amount, export_status, is_locked";

const INSERT_FEED_PERIOD_LOCK =
  "INSERT INTO attendance_lock_periods (tenant_id, entity_id, lock_month, locked_at, status) VALUES ($1, $2, $3, now(), 'LOCKED') " +
  "ON CONFLICT (tenant_id, lock_month) WHERE scope_org_unit_id IS NULL DO UPDATE SET status = 'LOCKED', locked_at = now(), updated_at = now() " +
  "RETURNING id, lock_month, status";

const LOCK_FEED_ROWS =
  "UPDATE payroll_attendance_feed SET is_locked = true, export_status = 'EXPORTED', exported_at = now(), updated_at = now() " +
  "WHERE tenant_id = $1 AND pay_period = $2 AND is_locked = false AND is_deleted = false " +
  "RETURNING id";

const INSERT_FEED_ADJUSTMENT =
  "INSERT INTO payroll_feed_adjustments (tenant_id, entity_id, original_feed_id, applied_in_pay_period, employee_id, adjustment_type, delta_value, reason, source_ref_type, source_ref_id) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) " +
  "RETURNING id, tenant_id, entity_id, original_feed_id, applied_in_pay_period, employee_id, adjustment_type, delta_value, reason, source_ref_type, source_ref_id, status";

const SELECT_FEED_ROW =
  "SELECT id, tenant_id, entity_id, pay_period, employee_id, lwp_days, half_pay_days, paid_ot_minutes, present_units, encashment_amount, export_status, is_locked " +
  "FROM payroll_attendance_feed WHERE tenant_id = $1 AND pay_period = $2 AND employee_id = $3 AND is_deleted = false";

const SELECT_FEED_ADJUSTMENTS =
  "SELECT id, tenant_id, entity_id, original_feed_id, applied_in_pay_period, employee_id, adjustment_type, delta_value, reason, source_ref_type, source_ref_id, status " +
  "FROM payroll_feed_adjustments WHERE tenant_id = $1 AND applied_in_pay_period = $2 AND is_deleted = false ORDER BY created_at";

export interface PayrollAttendanceFeedRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  pay_period: string;
  employee_id: string;
  lwp_days: string;
  half_pay_days: string;
  paid_ot_minutes: number;
  present_units: string;
  encashment_amount: string;
  export_status: string;
  is_locked: boolean;
}

export interface PayrollFeedAdjustmentRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  original_feed_id: string;
  applied_in_pay_period: string;
  employee_id: string;
  adjustment_type: string;
  delta_value: string;
  reason: string;
  source_ref_type: string;
  source_ref_id: string | null;
  status: string;
}

/**
 * Postgres-backed G03 leave repository over the frozen tables
 * leave_types, leave_accrual_policies, leave_ledger_entries, leave_balances,
 * leave_applications, and leave_reservations.
 */
export class PgLeaveRepository {
  constructor(private readonly pool: Pool) {}

  async insertLeaveType(input: {
    tenantId: string;
    entityId?: string;
    leaveCode: string;
    name: string;
    category: string;
    isAccruable: boolean;
    isEncashable: boolean;
    affectsPay: boolean;
  }): Promise<LeaveTypeRow> {
    const result = await this.pool.query(INSERT_LEAVE_TYPE, [
      input.tenantId,
      input.entityId ?? null,
      input.leaveCode,
      input.name,
      input.category,
      input.isAccruable,
      input.isEncashable,
      input.affectsPay,
    ]);
    return result.rows[0] as LeaveTypeRow;
  }

  async findLeaveTypeByCode(tenantId: string, leaveCode: string): Promise<LeaveTypeRow | undefined> {
    const result = await this.pool.query(SELECT_LEAVE_TYPE_BY_CODE, [tenantId, leaveCode]);
    return result.rows[0] as LeaveTypeRow | undefined;
  }

  async insertAccrualPolicy(input: {
    tenantId: string;
    entityId?: string;
    leaveTypeId: string;
    accrualFrequency: string;
    accrualQuantity: number;
    accrualBasis: string;
    carryForwardAllowed: boolean;
    lapseRule: string;
    effectiveFrom: string;
  }): Promise<LeaveAccrualPolicyRow> {
    const result = await this.pool.query(INSERT_ACCRUAL_POLICY, [
      input.tenantId,
      input.entityId ?? null,
      input.leaveTypeId,
      input.accrualFrequency,
      input.accrualQuantity,
      input.accrualBasis,
      input.carryForwardAllowed,
      input.lapseRule,
      input.effectiveFrom,
    ]);
    return result.rows[0] as LeaveAccrualPolicyRow;
  }

  async listAccrualPolicies(tenantId: string, leaveTypeId: string): Promise<LeaveAccrualPolicyRow[]> {
    const result = await this.pool.query(SELECT_ACCRUAL_POLICIES, [tenantId, leaveTypeId]);
    return result.rows as LeaveAccrualPolicyRow[];
  }

  async insertLeaveApplication(input: {
    tenantId: string;
    entityId: string;
    applicationNo: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    ledgerDebitUnits: number;
    reason: string;
    status: string;
  }): Promise<LeaveApplicationRow> {
    const result = await this.pool.query(INSERT_LEAVE_APPLICATION, [
      input.tenantId,
      input.entityId,
      input.applicationNo,
      input.employeeId,
      input.leaveTypeId,
      input.startDate,
      input.endDate,
      input.totalDays,
      input.ledgerDebitUnits,
      input.reason,
      input.status,
    ]);
    return result.rows[0] as LeaveApplicationRow;
  }

  async openBalance(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    openingBalance: number;
  }): Promise<LeaveBalanceRow> {
    const result = await this.pool.query(INSERT_BALANCE, [
      input.tenantId,
      input.entityId,
      input.employeeId,
      input.leaveTypeId,
      input.leaveYear,
      input.openingBalance,
    ]);
    return result.rows[0] as LeaveBalanceRow;
  }

  async getBalance(employeeId: string, leaveTypeId: string, leaveYear: number): Promise<LeaveBalanceRow | undefined> {
    const result = await this.pool.query(SELECT_BALANCE, [employeeId, leaveTypeId, leaveYear]);
    return result.rows[0] as LeaveBalanceRow | undefined;
  }

  /**
   * Soft-reserve units against an application: inserts a leave_reservations row and bumps
   * the leave_balances optimistic-lock version in one transaction.
   */
  async reserveLeave(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    applicationId: string;
    units: number;
  }): Promise<{ reservation: LeaveReservationRow; balance: LeaveBalanceRow }> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(SELECT_BALANCE_FOR_UPDATE, [input.employeeId, input.leaveTypeId, input.leaveYear]);
      if ((locked.rowCount ?? 0) === 0) {
        throw new FoundationError("NOT_FOUND", "Leave balance not found");
      }
      const reservationResult = await client.query(INSERT_RESERVATION, [
        input.tenantId,
        input.entityId,
        input.employeeId,
        input.leaveTypeId,
        input.leaveYear,
        input.applicationId,
        input.units,
      ]);
      const balanceResult = await client.query(RESERVE_BALANCE, [input.employeeId, input.leaveTypeId, input.leaveYear, input.units]);
      return {
        reservation: reservationResult.rows[0] as LeaveReservationRow,
        balance: balanceResult.rows[0] as LeaveBalanceRow,
      };
    });
  }

  /**
   * Consume a reservation into a real debit: marks the reservation CONSUMED, appends the
   * append-only AVAIL ledger entry, and debits the balance (version bump) in one transaction.
   */
  async debitReservedLeave(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    reservationId: string;
    applicationId: string;
    units: number;
    effectiveDate: string;
  }): Promise<{ reservation: LeaveReservationRow; ledgerEntry: LeaveLedgerEntryRow; balance: LeaveBalanceRow }> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(SELECT_BALANCE_FOR_UPDATE, [input.employeeId, input.leaveTypeId, input.leaveYear]);
      const current = locked.rows[0] as LeaveBalanceRow | undefined;
      if (!current) {
        throw new FoundationError("NOT_FOUND", "Leave balance not found");
      }
      const reservationResult = await client.query(CONSUME_RESERVATION, [input.reservationId, "CONSUMED"]);
      if ((reservationResult.rowCount ?? 0) === 0) {
        throw new FoundationError("NOT_FOUND", "Leave reservation not found");
      }
      const balanceAfter = Number(current.current_balance) - input.units;
      const ledgerResult = await client.query(INSERT_LEDGER_ENTRY, [
        input.tenantId,
        input.entityId,
        input.employeeId,
        input.leaveTypeId,
        input.leaveYear,
        "AVAIL",
        -input.units,
        balanceAfter,
        "LEAVE_APPLICATION",
        input.applicationId,
        input.effectiveDate,
      ]);
      const ledgerEntry = ledgerResult.rows[0] as LeaveLedgerEntryRow;
      const balanceResult = await client.query(DEBIT_BALANCE, [
        input.employeeId,
        input.leaveTypeId,
        input.leaveYear,
        input.units,
        ledgerEntry.id,
      ]);
      return {
        reservation: reservationResult.rows[0] as LeaveReservationRow,
        ledgerEntry,
        balance: balanceResult.rows[0] as LeaveBalanceRow,
      };
    });
  }

  async listLedgerEntries(tenantId: string, employeeId: string, leaveTypeId: string, leaveYear: number): Promise<LeaveLedgerEntryRow[]> {
    const result = await this.pool.query(SELECT_LEDGER_ENTRIES, [tenantId, employeeId, leaveTypeId, leaveYear]);
    return result.rows as LeaveLedgerEntryRow[];
  }

  /**
   * FR-17: upsert a payroll_attendance_feed row. The lock check and the write run in ONE
   * transaction — writing into a LOCKED period raises PERIOD_ALREADY_LOCKED, never a
   * silent overwrite (R6).
   */
  async upsertFeedRow(input: {
    tenantId: string;
    entityId: string;
    payPeriod: string;
    employeeId: string;
    lwpDays: number;
    halfPayDays: number;
    paidOtMinutes: number;
    presentUnits: number;
    encashmentAmount: number;
  }): Promise<PayrollAttendanceFeedRowPg> {
    return withTransaction(this.pool, async (client) => {
      const lock = await client.query(SELECT_FEED_PERIOD_LOCK_FOR_UPDATE, [input.tenantId, input.payPeriod]);
      if (lock.rows.some((row) => (row as { status: string }).status === "LOCKED")) {
        throw new FoundationError("PERIOD_ALREADY_LOCKED", "Payroll feed period is locked; corrections must go through feed adjustments", {
          field: "payPeriod",
          details: { payPeriod: input.payPeriod },
        });
      }
      const result = await client.query(UPSERT_FEED_ROW, [
        input.tenantId,
        input.entityId,
        input.payPeriod,
        input.employeeId,
        input.lwpDays,
        input.halfPayDays,
        input.paidOtMinutes,
        input.presentUnits,
        input.encashmentAmount,
      ]);
      return result.rows[0] as PayrollAttendanceFeedRowPg;
    });
  }

  /**
   * FR-17 JOB-M05-LOCK: lock a feed period — the attendance_lock_periods row and the
   * feed-row freeze (is_locked + EXPORTED) commit in one transaction.
   */
  async lockFeedPeriod(input: { tenantId: string; entityId: string; payPeriod: string }): Promise<{ lockId: string; lockedRowCount: number }> {
    return withTransaction(this.pool, async (client) => {
      const lock = await client.query(INSERT_FEED_PERIOD_LOCK, [input.tenantId, input.entityId, input.payPeriod]);
      const rows = await client.query(LOCK_FEED_ROWS, [input.tenantId, input.payPeriod]);
      return { lockId: (lock.rows[0] as { id: string }).id, lockedRowCount: rows.rowCount ?? 0 };
    });
  }

  async isFeedPeriodLocked(tenantId: string, payPeriod: string): Promise<boolean> {
    const result = await this.pool.query(SELECT_FEED_PERIOD_LOCK, [tenantId, payPeriod]);
    return result.rows.some((row) => (row as { status: string }).status === "LOCKED");
  }

  async findFeedRow(tenantId: string, payPeriod: string, employeeId: string): Promise<PayrollAttendanceFeedRowPg | undefined> {
    const result = await this.pool.query(SELECT_FEED_ROW, [tenantId, payPeriod, employeeId]);
    return result.rows[0] as PayrollAttendanceFeedRowPg | undefined;
  }

  /** R6: append a payroll_feed_adjustments row targeting the next open period. */
  async insertFeedAdjustment(input: {
    tenantId: string;
    entityId: string;
    originalFeedId: string;
    appliedInPayPeriod: string;
    employeeId: string;
    adjustmentType: string;
    deltaValue: number;
    reason: string;
    sourceRefType: string;
    sourceRefId?: string;
  }): Promise<PayrollFeedAdjustmentRowPg> {
    const result = await this.pool.query(INSERT_FEED_ADJUSTMENT, [
      input.tenantId,
      input.entityId,
      input.originalFeedId,
      input.appliedInPayPeriod,
      input.employeeId,
      input.adjustmentType,
      input.deltaValue,
      input.reason,
      input.sourceRefType,
      input.sourceRefId ?? null,
    ]);
    return result.rows[0] as PayrollFeedAdjustmentRowPg;
  }

  async listFeedAdjustments(tenantId: string, appliedInPayPeriod: string): Promise<PayrollFeedAdjustmentRowPg[]> {
    const result = await this.pool.query(SELECT_FEED_ADJUSTMENTS, [tenantId, appliedInPayPeriod]);
    return result.rows as PayrollFeedAdjustmentRowPg[];
  }
}
