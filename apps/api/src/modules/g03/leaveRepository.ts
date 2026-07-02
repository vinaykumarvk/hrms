import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";
import type { HolidayEntry, LeaveApplication, LeaveBalance, LeaveLedgerEntry, LeaveTypeConfig } from "./leaveService";

/**
 * G03 leave repository contract consumed by LeaveService.
 * Entity state for leave applications, balances, ledger entries, the FR-10 leave-type/
 * accrual-policy catalog, and the FR-02 holiday calendar routes through here;
 * the service no longer owns bare in-memory arrays.
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
}

/** In-memory implementation of the LeaveRepository interface, injectable for unit tests. */
export class InMemoryLeaveRepository implements LeaveRepository {
  private readonly applications: LeaveApplication[] = [];
  private readonly balances: LeaveBalance[] = [];
  private readonly ledger: LeaveLedgerEntry[] = [];
  private readonly leaveTypes: LeaveTypeConfig[] = [];
  private readonly holidays: HolidayEntry[] = [];

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
}
