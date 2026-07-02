import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";
import type {
  AttendanceDeviceRecord,
  AttendancePunch,
  CompOffLedgerEntry,
  RosterAssignment,
  ShiftDefinition,
} from "./attendanceOpsService";

/**
 * PH-15C G03 operational-attendance repository contract consumed by AttendanceOpsService.
 * Entity state for E1 shifts, E2 rosters, E5 attendance_devices, the E6 attendance_punches
 * append-only ledger, and the E11 comp_off_ledger append-only ledger routes through here;
 * the service owns no bare in-memory arrays.
 */
export interface AttendanceOpsRepository {
  countShifts(): number;
  saveShift(shift: ShiftDefinition): void;
  findShift(scope: TenantScope, shiftId: string): ShiftDefinition | undefined;
  findShiftByCode(scope: TenantScope, shiftCode: string): ShiftDefinition | undefined;
  listShifts(scope: TenantScope): ShiftDefinition[];
  countRosters(): number;
  saveRoster(roster: RosterAssignment): void;
  findRoster(scope: TenantScope, rosterId: string): RosterAssignment | undefined;
  listRosters(scope: TenantScope): RosterAssignment[];
  countDevices(): number;
  saveDevice(device: AttendanceDeviceRecord): void;
  findDevice(scope: TenantScope, deviceId: string): AttendanceDeviceRecord | undefined;
  listDevices(scope: TenantScope): AttendanceDeviceRecord[];
  countPunches(): number;
  /** attendance_punches is an APPEND-ONLY ledger: INSERT only, never update/delete. */
  appendPunch(punch: AttendancePunch): void;
  /** Idempotent-ingestion dedup key per DDL uq_punches_idempotent (device_id, source_ref). */
  findPunchByDedupKey(scope: TenantScope, deviceId: string, sourceRef: string): AttendancePunch | undefined;
  listPunches(scope: TenantScope, employeeId?: string, attendanceDate?: string): AttendancePunch[];
  countCompOffEntries(): number;
  /** comp_off_ledger is an APPEND-ONLY ledger (sole comp-off balance source, R17). */
  appendCompOffEntry(entry: CompOffLedgerEntry): void;
  listCompOffEntries(scope: TenantScope, employeeId?: string): CompOffLedgerEntry[];
}

/** In-memory implementation of the AttendanceOpsRepository interface, injectable for unit tests. */
export class InMemoryAttendanceOpsRepository implements AttendanceOpsRepository {
  private readonly shifts: ShiftDefinition[] = [];
  private readonly rosters: RosterAssignment[] = [];
  private readonly devices: AttendanceDeviceRecord[] = [];
  private readonly punches: AttendancePunch[] = [];
  private readonly compOffEntries: CompOffLedgerEntry[] = [];

  countShifts(): number {
    return this.shifts.length;
  }

  saveShift(shift: ShiftDefinition): void {
    const index = this.shifts.findIndex((item) => item.id === shift.id);
    if (index < 0) {
      this.shifts.push(shift);
      return;
    }
    this.shifts[index] = shift;
  }

  findShift(scope: TenantScope, shiftId: string): ShiftDefinition | undefined {
    return this.listShifts(scope).find((item) => item.id === shiftId);
  }

  findShiftByCode(scope: TenantScope, shiftCode: string): ShiftDefinition | undefined {
    return this.listShifts(scope).find((item) => item.shiftCode === shiftCode);
  }

  listShifts(scope: TenantScope): ShiftDefinition[] {
    return this.shifts.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || !item.entityId || item.entityId === scope.entityId));
  }

  countRosters(): number {
    return this.rosters.length;
  }

  saveRoster(roster: RosterAssignment): void {
    const index = this.rosters.findIndex((item) => item.id === roster.id);
    if (index < 0) {
      this.rosters.push(roster);
      return;
    }
    this.rosters[index] = roster;
  }

  findRoster(scope: TenantScope, rosterId: string): RosterAssignment | undefined {
    return this.listRosters(scope).find((item) => item.id === rosterId);
  }

  listRosters(scope: TenantScope): RosterAssignment[] {
    return this.rosters.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || !item.entityId || item.entityId === scope.entityId));
  }

  countDevices(): number {
    return this.devices.length;
  }

  saveDevice(device: AttendanceDeviceRecord): void {
    const index = this.devices.findIndex((item) => item.id === device.id);
    if (index < 0) {
      this.devices.push(device);
      return;
    }
    this.devices[index] = device;
  }

  findDevice(scope: TenantScope, deviceId: string): AttendanceDeviceRecord | undefined {
    return this.listDevices(scope).find((item) => item.id === deviceId);
  }

  listDevices(scope: TenantScope): AttendanceDeviceRecord[] {
    return this.devices.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || !item.entityId || item.entityId === scope.entityId));
  }

  countPunches(): number {
    return this.punches.length;
  }

  appendPunch(punch: AttendancePunch): void {
    if (this.punches.some((item) => item.deviceId === punch.deviceId && item.sourceRef === punch.sourceRef)) {
      throw new FoundationError("CONFLICT", "Punch with this (device_id, source_ref) already ingested");
    }
    this.punches.push(punch);
  }

  findPunchByDedupKey(scope: TenantScope, deviceId: string, sourceRef: string): AttendancePunch | undefined {
    return this.listPunches(scope).find((item) => item.deviceId === deviceId && item.sourceRef === sourceRef);
  }

  listPunches(scope: TenantScope, employeeId?: string, attendanceDate?: string): AttendancePunch[] {
    return this.punches.filter(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || !item.entityId || item.entityId === scope.entityId) &&
        (!employeeId || item.employeeId === employeeId) &&
        (!attendanceDate || item.attendanceDate === attendanceDate)
    );
  }

  countCompOffEntries(): number {
    return this.compOffEntries.length;
  }

  appendCompOffEntry(entry: CompOffLedgerEntry): void {
    this.compOffEntries.push(entry);
  }

  listCompOffEntries(scope: TenantScope, employeeId?: string): CompOffLedgerEntry[] {
    return this.compOffEntries.filter(
      (item) =>
        item.tenantId === scope.tenantId &&
        (!scope.entityId || !item.entityId || item.entityId === scope.entityId) &&
        (!employeeId || item.employeeId === employeeId)
    );
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G03 data model (docs/data-model/03-*.sql).
// Row shapes mirror migration 0024_g03_attendance_ops.sql. All SQL is parameterised
// ($1, $2, ...); multi-step writes run in a single transaction. attendance_punches and
// comp_off_ledger are INSERT-only (append-only ledgers, CONVENTIONS §3).
// ---------------------------------------------------------------------------------------

export interface ShiftRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  shift_code: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  is_night_shift: boolean;
  date_anchor_rule: string;
  status: string;
}

export interface RosterRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  shift_id: string;
  effective_from: Date;
  effective_to: Date | null;
  weekly_off_pattern: unknown;
  status: string;
}

export interface AttendancePunchRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  device_id: string;
  punch_time: Date;
  attendance_date: Date;
  punch_direction: string | null;
  capture_method: string;
  source_ref: string;
  ingestion_status: string;
}

export interface CompOffLedgerRowPg {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  entry_type: string;
  days: string;
  earned_on: Date | null;
  expires_on: Date | null;
  balance_after: string;
  source_ref_type: string | null;
  source_ref_id: string | null;
  remarks: string | null;
}

const INSERT_SHIFT =
  "INSERT INTO shifts (tenant_id, entity_id, shift_code, name, start_time, end_time, grace_minutes, half_day_threshold_minutes, full_day_threshold_minutes, is_night_shift, date_anchor_rule) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, shift_code, name, start_time, end_time, grace_minutes, is_night_shift, date_anchor_rule, status";

const SELECT_SHIFT =
  "SELECT id, tenant_id, entity_id, shift_code, name, start_time, end_time, grace_minutes, is_night_shift, date_anchor_rule, status " +
  "FROM shifts WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const INSERT_ROSTER =
  "INSERT INTO rosters (tenant_id, entity_id, employee_id, shift_id, effective_from, effective_to, weekly_off_pattern, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT') " +
  "RETURNING id, tenant_id, entity_id, employee_id, shift_id, effective_from, effective_to, weekly_off_pattern, status";

/** VAL-G03-ROSTER-OVERLAP: PUBLISHED rosters of the same employee with an intersecting range. */
const SELECT_OVERLAPPING_PUBLISHED_ROSTERS =
  "SELECT id, tenant_id, entity_id, employee_id, shift_id, effective_from, effective_to, weekly_off_pattern, status " +
  "FROM rosters WHERE tenant_id = $1 AND employee_id = $2 AND status = 'PUBLISHED' AND is_deleted = false " +
  "AND effective_from <= COALESCE($4::date, 'infinity'::date) AND COALESCE(effective_to, 'infinity'::date) >= $3::date " +
  "FOR UPDATE";

const SUPERSEDE_ROSTER =
  "UPDATE rosters SET status = 'SUPERSEDED', effective_to = $2::date - 1, updated_at = now() WHERE id = $1 " +
  "RETURNING id, employee_id, shift_id, effective_from, effective_to, status";

const PUBLISH_ROSTER =
  "UPDATE rosters SET status = 'PUBLISHED', updated_at = now() WHERE id = $1 AND status = 'DRAFT' " +
  "RETURNING id, tenant_id, entity_id, employee_id, shift_id, effective_from, effective_to, weekly_off_pattern, status";

const SELECT_ACTIVE_DEVICE =
  "SELECT id, tenant_id, entity_id, device_code, device_type, status FROM attendance_devices " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE' AND is_deleted = false";

const SELECT_PUNCH_BY_DEDUP_KEY =
  "SELECT id, tenant_id, entity_id, employee_id, device_id, punch_time, attendance_date, punch_direction, capture_method, source_ref, ingestion_status " +
  "FROM attendance_punches WHERE device_id = $1 AND source_ref = $2";

/** APPEND-ONLY: uq_punches_idempotent (device_id, source_ref) enforces idempotent ingestion. */
const INSERT_PUNCH =
  "INSERT INTO attendance_punches (tenant_id, entity_id, employee_id, device_id, punch_time, attendance_date, punch_direction, capture_method, source_ref, ingestion_status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACCEPTED') " +
  "ON CONFLICT (device_id, source_ref) DO NOTHING " +
  "RETURNING id, tenant_id, entity_id, employee_id, device_id, punch_time, attendance_date, punch_direction, capture_method, source_ref, ingestion_status";

const SELECT_COMP_OFF_ENTRIES =
  "SELECT id, tenant_id, entity_id, employee_id, entry_type, days, earned_on, expires_on, balance_after, source_ref_type, source_ref_id, remarks " +
  "FROM comp_off_ledger WHERE tenant_id = $1 AND employee_id = $2 ORDER BY created_at, id";

const SELECT_COMP_OFF_ENTRIES_FOR_UPDATE = SELECT_COMP_OFF_ENTRIES + " FOR UPDATE";

/** APPEND-ONLY: comp_off_ledger rows are inserted, never updated (R17 sole balance source). */
const INSERT_COMP_OFF_ENTRY =
  "INSERT INTO comp_off_ledger (tenant_id, entity_id, employee_id, entry_type, days, earned_on, expires_on, balance_after, source_ref_type, source_ref_id, remarks) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, employee_id, entry_type, days, earned_on, expires_on, balance_after, source_ref_type, source_ref_id, remarks";

/**
 * Postgres-backed G03 operational-attendance repository over the frozen tables
 * shifts, rosters, attendance_devices, attendance_punches, and comp_off_ledger
 * (migration 0024_g03_attendance_ops.sql).
 */
export class PgAttendanceOpsRepository {
  constructor(private readonly pool: Pool) {}

  async insertShift(input: {
    tenantId: string;
    entityId: string;
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    halfDayThresholdMinutes: number;
    fullDayThresholdMinutes: number;
    isNightShift: boolean;
    dateAnchorRule: string;
  }): Promise<ShiftRowPg> {
    const result = await this.pool.query(INSERT_SHIFT, [
      input.tenantId,
      input.entityId,
      input.shiftCode,
      input.name,
      input.startTime,
      input.endTime,
      input.graceMinutes,
      input.halfDayThresholdMinutes,
      input.fullDayThresholdMinutes,
      input.isNightShift,
      input.dateAnchorRule,
    ]);
    return result.rows[0] as ShiftRowPg;
  }

  async findShift(tenantId: string, shiftId: string): Promise<ShiftRowPg | undefined> {
    const result = await this.pool.query(SELECT_SHIFT, [tenantId, shiftId]);
    return result.rows[0] as ShiftRowPg | undefined;
  }

  async insertRoster(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    weeklyOffPattern: string[];
  }): Promise<RosterRowPg> {
    const result = await this.pool.query(INSERT_ROSTER, [
      input.tenantId,
      input.entityId,
      input.employeeId,
      input.shiftId,
      input.effectiveFrom,
      input.effectiveTo ?? null,
      JSON.stringify(input.weeklyOffPattern),
    ]);
    return result.rows[0] as RosterRowPg;
  }

  /**
   * FR-01 publish: the overlap scan, the supersede of the prior open-ended roster, and the
   * DRAFT -> PUBLISHED transition commit in ONE transaction. An overlapping PUBLISHED roster
   * that cannot be superseded raises VAL-G03-ROSTER-OVERLAP (409), fail closed.
   */
  async publishRoster(input: {
    tenantId: string;
    employeeId: string;
    rosterId: string;
    effectiveFrom: string;
    effectiveTo?: string;
  }): Promise<{ roster: RosterRowPg; supersededRosterIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const overlapping = await client.query(SELECT_OVERLAPPING_PUBLISHED_ROSTERS, [
        input.tenantId,
        input.employeeId,
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ]);
      const supersededRosterIds: string[] = [];
      for (const row of overlapping.rows as RosterRowPg[]) {
        const openEnded = row.effective_to === null;
        const startsEarlier = row.effective_from < new Date(`${input.effectiveFrom}T00:00:00Z`);
        if (openEnded && startsEarlier) {
          await client.query(SUPERSEDE_ROSTER, [row.id, input.effectiveFrom]);
          supersededRosterIds.push(row.id);
          continue;
        }
        throw new FoundationError("VAL-G03-ROSTER-OVERLAP", "Employee already has a PUBLISHED roster overlapping this date range", {
          field: "effectiveFrom",
          details: { conflictingRosterId: row.id },
        });
      }
      const published = await client.query(PUBLISH_ROSTER, [input.rosterId]);
      if ((published.rowCount ?? 0) === 0) {
        throw new FoundationError("NOT_FOUND", "Draft roster not found");
      }
      return { roster: published.rows[0] as RosterRowPg, supersededRosterIds };
    });
  }

  /**
   * FR-03 ingestion: the device-auth gate, the dedup probe, and the append run in ONE
   * transaction. Unknown/inactive device -> DEVICE_NOT_AUTHORIZED (403, fail closed);
   * a replayed (device_id, source_ref) returns the stored row as DUPLICATE without a
   * second insert (uq_punches_idempotent).
   */
  async ingestPunch(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    deviceId: string;
    punchTime: string;
    attendanceDate: string;
    punchDirection?: string;
    captureMethod: string;
    sourceRef: string;
  }): Promise<{ punch: AttendancePunchRowPg; deduplicated: boolean }> {
    return withTransaction(this.pool, async (client) => {
      const device = await client.query(SELECT_ACTIVE_DEVICE, [input.tenantId, input.deviceId]);
      if ((device.rowCount ?? 0) === 0) {
        throw new FoundationError("DEVICE_NOT_AUTHORIZED", "Punch device is not registered or not active", {
          field: "deviceId",
          details: { deviceId: input.deviceId },
        });
      }
      const inserted = await client.query(INSERT_PUNCH, [
        input.tenantId,
        input.entityId,
        input.employeeId,
        input.deviceId,
        input.punchTime,
        input.attendanceDate,
        input.punchDirection ?? null,
        input.captureMethod,
        input.sourceRef,
      ]);
      if ((inserted.rowCount ?? 0) > 0) {
        return { punch: inserted.rows[0] as AttendancePunchRowPg, deduplicated: false };
      }
      const existing = await client.query(SELECT_PUNCH_BY_DEDUP_KEY, [input.deviceId, input.sourceRef]);
      return { punch: existing.rows[0] as AttendancePunchRowPg, deduplicated: true };
    });
  }

  async listCompOffEntries(tenantId: string, employeeId: string): Promise<CompOffLedgerRowPg[]> {
    const result = await this.pool.query(SELECT_COMP_OFF_ENTRIES, [tenantId, employeeId]);
    return result.rows as CompOffLedgerRowPg[];
  }

  /**
   * FR-09: append a comp_off_ledger entry with the ledger locked FOR UPDATE so the FIFO
   * availability check and the append commit atomically — balance_after always reconciles
   * to the ledger sum (R17), never a mutable counter.
   */
  async appendCompOffEntry(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    entryType: string;
    days: number;
    earnedOn?: string;
    expiresOn?: string;
    sourceRefType?: string;
    sourceRefId?: string;
    remarks?: string;
  }): Promise<CompOffLedgerRowPg> {
    return withTransaction(this.pool, async (client) => {
      const entries = await client.query(SELECT_COMP_OFF_ENTRIES_FOR_UPDATE, [input.tenantId, input.employeeId]);
      const ledgerSum = (entries.rows as CompOffLedgerRowPg[]).reduce((sum, row) => sum + Number(row.days), 0);
      const result = await client.query(INSERT_COMP_OFF_ENTRY, [
        input.tenantId,
        input.entityId,
        input.employeeId,
        input.entryType,
        input.days,
        input.earnedOn ?? null,
        input.expiresOn ?? null,
        ledgerSum + input.days,
        input.sourceRefType ?? null,
        input.sourceRefId ?? null,
        input.remarks ?? null,
      ]);
      return result.rows[0] as CompOffLedgerRowPg;
    });
  }
}
