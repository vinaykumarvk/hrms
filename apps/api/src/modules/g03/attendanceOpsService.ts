import { JobRun, JobService } from "../../jobs/jobService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { AttendanceRecord, LeaveService } from "./leaveService";
import { AttendanceOpsRepository } from "./attendanceOpsRepository";

/**
 * PH-15C: G03 operational attendance core (BRD G03 FR-01 shifts/rosters, FR-03 punch
 * ingestion, FR-09 comp-off) over the frozen data model (docs/data-model/03-*.sql,
 * migration 0024). attendance_punches and comp_off_ledger are APPEND-ONLY ledgers.
 */

/** E1 shifts.date_anchor_rule (g03_shift_date_anchor). */
export type DateAnchorRule = "SHIFT_START_LOCAL_DATE" | "PUNCH_LOCAL_DATE";

/** E1 shifts projection consumed by roster assignment and punch anchoring. */
export interface ShiftDefinition {
  id: string;
  tenantId: string;
  entityId?: string;
  shiftCode: string;
  name: string;
  /** HH:MM local shift boundaries; a night shift has endTime < startTime (crosses midnight). */
  startTime: string;
  endTime: string;
  graceMinutes: number;
  isNightShift: boolean;
  /** FR-03: how a punch resolves its attendance_date (night shifts anchor to shift start date). */
  dateAnchorRule: DateAnchorRule;
  status: "ACTIVE" | "INACTIVE";
}

export type RosterStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";

/** E2 rosters row — a shift assignment for an employee over a date range. */
export interface RosterAssignment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  /** null/undefined = open-ended assignment. */
  effectiveTo?: string;
  weeklyOffPattern: string[];
  status: RosterStatus;
}

/** E5 attendance_devices projection — the FR-03 device-auth registry (P04 substrate). */
export interface AttendanceDeviceRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  deviceCode: string;
  deviceType: "BIOMETRIC" | "RFID" | "MOBILE_APP" | "WEB";
  status: "ACTIVE" | "INACTIVE" | "DECOMMISSIONED";
}

/** E6 attendance_punches row (APPEND-ONLY; dedup key = (device_id, source_ref)). */
export interface AttendancePunch {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  deviceId: string;
  /** UTC punch instant (ISO YYYY-MM-DDTHH:MM). */
  punchTime: string;
  /** Shift-anchored local date derived via the assigned shift's date_anchor_rule. */
  attendanceDate: string;
  punchDirection?: "IN" | "OUT";
  captureMethod: "BIOMETRIC" | "RFID" | "MOBILE_GEO" | "WEB" | "MANUAL";
  /** Device raw event id — idempotent-ingestion key with deviceId. */
  sourceRef: string;
  ingestionStatus: "ACCEPTED";
}

export interface PunchIngestResult {
  punch: AttendancePunch;
  /** DUPLICATE = known (device_id, source_ref) replay; the stored row is returned, none added. */
  ingestionStatus: "ACCEPTED" | "DUPLICATE";
}

export type CompOffEntryType = "EARN" | "REDEEM" | "EXPIRE";

/** E11 comp_off_ledger row (APPEND-ONLY; sole comp-off balance source, R17). */
export interface CompOffLedgerEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  entryType: CompOffEntryType;
  /** Signed: EARN positive; REDEEM/EXPIRE negative. */
  days: number;
  /** EARN: credit date. REDEEM/EXPIRE: the effective date the movement applies on. */
  earnedOn: string;
  /** EARN only: the date after which the unused credit lapses. */
  expiresOn?: string;
  /** Running ledger sum after this entry — reconciles to the ledger, never a counter. */
  balanceAfter: number;
  sourceRefType?: "OVERTIME" | "HOLIDAY_WORK" | "MANUAL";
  /** EXPIRE/REDEEM lineage: the EARN entry id the movement consumed from (FIFO evidence). */
  sourceRefId?: string;
  remarks?: string;
}

export interface CompOffBalance {
  employeeId: string;
  /** Raw signed ledger sum. */
  ledgerBalance: number;
  /** Redeemable balance as of the given date: remaining non-expired EARN credits only. */
  availableBalance: number;
}

interface CreditState {
  entryId: string;
  earnedOn: string;
  expiresOn?: string;
  remaining: number;
}

export class AttendanceOpsService {
  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    private readonly leave: LeaveService,
    private readonly repository: AttendanceOpsRepository
  ) {}

  // --- FR-01: shifts -------------------------------------------------------------------

  /**
   * Define a shift (timings, grace, date_anchor_rule). Malformed timings fail closed with
   * VAL-G03-SHIFT-TIMES (422): bad HH:MM, zero-length span, negative grace, or a
   * start/end order inconsistent with the is_night_shift flag.
   */
  defineShift(
    actor: ActorContext,
    input: {
      shiftCode: string;
      name: string;
      startTime: string;
      endTime: string;
      graceMinutes?: number;
      isNightShift?: boolean;
      dateAnchorRule?: DateAnchorRule;
    }
  ): ShiftDefinition {
    this.authorization.check(actor, "g03.shift.configure", actor);
    const graceMinutes = input.graceMinutes ?? 10;
    const isNightShift = input.isNightShift ?? false;
    if (!clockTime(input.startTime) || !clockTime(input.endTime)) {
      throw new FoundationError("VAL-G03-SHIFT-TIMES", "Shift timings must use HH:MM", { field: "startTime" });
    }
    if (input.startTime === input.endTime) {
      throw new FoundationError("VAL-G03-SHIFT-TIMES", "Shift start and end times must differ", { field: "endTime" });
    }
    if (graceMinutes < 0) {
      throw new FoundationError("VAL-G03-SHIFT-TIMES", "Shift grace minutes cannot be negative", { field: "graceMinutes" });
    }
    if (isNightShift !== input.endTime < input.startTime) {
      throw new FoundationError("VAL-G03-SHIFT-TIMES", "is_night_shift must match a midnight-crossing start/end span", {
        field: "isNightShift",
        details: { startTime: input.startTime, endTime: input.endTime, isNightShift },
      });
    }
    if (this.repository.findShiftByCode(actor, input.shiftCode)) {
      throw new FoundationError("CONFLICT", "Shift code already exists for this tenant", { field: "shiftCode" });
    }
    const shift: ShiftDefinition = {
      id: nextId("shift", this.repository.countShifts()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      shiftCode: input.shiftCode,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      graceMinutes,
      isNightShift,
      dateAnchorRule: input.dateAnchorRule ?? "SHIFT_START_LOCAL_DATE",
      status: "ACTIVE",
    };
    this.repository.saveShift(shift);
    this.audit.recordMutation(actor, {
      action: "G03_SHIFT_DEFINE",
      subjectRef: `shifts:${shift.id}`,
      metadata: { shiftCode: shift.shiftCode, dateAnchorRule: shift.dateAnchorRule, isNightShift: shift.isNightShift },
    });
    return { ...shift };
  }

  listShifts(scope: TenantScope): ShiftDefinition[] {
    requireTenantScope(scope);
    return this.repository.listShifts(scope).map((shift) => ({ ...shift }));
  }

  // --- FR-01: rosters ------------------------------------------------------------------

  /** Assign a shift roster (DRAFT) to an employee over a date range. */
  assignRoster(
    actor: ActorContext,
    input: { employeeId: string; shiftId: string; effectiveFrom: string; effectiveTo?: string; weeklyOffPattern?: string[] }
  ): RosterAssignment {
    this.authorization.check(actor, "g03.roster.assign", actor);
    this.requireEmployee(actor, input.employeeId);
    const shift = this.repository.findShift(actor, input.shiftId);
    if (!shift || shift.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Shift not found or inactive", { field: "shiftId" });
    }
    if (!dateOnly(input.effectiveFrom) || (input.effectiveTo !== undefined && !dateOnly(input.effectiveTo))) {
      throw new FoundationError("VALIDATION_FAILED", "Roster dates must use YYYY-MM-DD", { field: "effectiveFrom" });
    }
    if (input.effectiveTo !== undefined && input.effectiveTo < input.effectiveFrom) {
      throw new FoundationError("VALIDATION_FAILED", "Roster effective_to cannot precede effective_from", { field: "effectiveTo" });
    }
    const roster: RosterAssignment = {
      id: nextId("roster", this.repository.countRosters()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      shiftId: input.shiftId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      weeklyOffPattern: [...(input.weeklyOffPattern ?? ["SUN"])],
      status: "DRAFT",
    };
    this.repository.saveRoster(roster);
    this.audit.recordMutation(actor, {
      action: "G03_ROSTER_ASSIGN",
      subjectRef: `rosters:${roster.id}`,
      metadata: { employeeId: roster.employeeId, shiftId: roster.shiftId, effectiveFrom: roster.effectiveFrom },
    });
    return this.cloneRoster(roster);
  }

  /**
   * Publish a DRAFT roster. Overlap validation covers PUBLISHED rosters of the same
   * employee over intersecting date ranges: a prior OPEN-ENDED roster starting earlier is
   * superseded (truncated to the day before the new effective_from, status SUPERSEDED);
   * any other intersection throws VAL-G03-ROSTER-OVERLAP (409), fail closed.
   */
  publishRoster(actor: ActorContext, rosterId: string): { roster: RosterAssignment; supersededRosterIds: string[] } {
    this.authorization.check(actor, "g03.roster.publish", actor);
    const roster = this.requireRoster(actor, rosterId);
    if (roster.status !== "DRAFT") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a DRAFT roster can be published");
    }
    const supersededRosterIds: string[] = [];
    const published = this.repository
      .listRosters(actor)
      .filter((item) => item.employeeId === roster.employeeId && item.status === "PUBLISHED" && item.id !== roster.id);
    for (const existing of published) {
      if (!rangesOverlap(roster.effectiveFrom, roster.effectiveTo, existing.effectiveFrom, existing.effectiveTo)) {
        continue;
      }
      if (existing.effectiveTo === undefined && existing.effectiveFrom < roster.effectiveFrom) {
        existing.effectiveTo = dayBefore(roster.effectiveFrom);
        existing.status = "SUPERSEDED";
        this.repository.saveRoster(existing);
        supersededRosterIds.push(existing.id);
        continue;
      }
      throw new FoundationError("VAL-G03-ROSTER-OVERLAP", "Employee already has a PUBLISHED roster overlapping this date range", {
        field: "effectiveFrom",
        details: {
          conflictingRosterId: existing.id,
          conflictingRange: { effectiveFrom: existing.effectiveFrom, effectiveTo: existing.effectiveTo ?? null },
        },
      });
    }
    roster.status = "PUBLISHED";
    this.repository.saveRoster(roster);
    this.audit.recordMutation(actor, {
      action: "G03_ROSTER_PUBLISH",
      subjectRef: `rosters:${roster.id}`,
      metadata: { employeeId: roster.employeeId, supersededRosterIds },
    });
    return { roster: this.cloneRoster(roster), supersededRosterIds };
  }

  listRosters(scope: TenantScope): RosterAssignment[] {
    requireTenantScope(scope);
    return this.repository.listRosters(scope).map((roster) => this.cloneRoster(roster));
  }

  // --- FR-03: devices + punch ingestion --------------------------------------------------

  /** Register an attendance device (E5, P04 substrate) so its punches pass the auth gate. */
  registerDevice(
    actor: ActorContext,
    input: { deviceCode: string; deviceType?: AttendanceDeviceRecord["deviceType"]; status?: AttendanceDeviceRecord["status"] }
  ): AttendanceDeviceRecord {
    this.authorization.check(actor, "g03.device.register", actor);
    const device: AttendanceDeviceRecord = {
      id: nextId("device", this.repository.countDevices()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      deviceCode: input.deviceCode,
      deviceType: input.deviceType ?? "BIOMETRIC",
      status: input.status ?? "ACTIVE",
    };
    this.repository.saveDevice(device);
    this.audit.recordMutation(actor, { action: "G03_DEVICE_REGISTER", subjectRef: `attendance_devices:${device.id}`, metadata: { deviceCode: device.deviceCode, status: device.status } });
    return { ...device };
  }

  /**
   * FR-03 punch ingestion into the append-only attendance_punches ledger.
   * - Device auth is a real gate: unknown or non-ACTIVE device -> DEVICE_NOT_AUTHORIZED (403).
   * - Future-dated punch -> INVALID_PUNCH_TIME (422).
   * - Known (device_id, source_ref) -> DUPLICATE; the stored row is returned, none re-stored.
   * - attendance_date derives via the rostered shift's date_anchor_rule: under
   *   SHIFT_START_LOCAL_DATE a night-shift punch after midnight anchors to the shift start date.
   */
  ingestPunch(
    actor: ActorContext,
    input: {
      employeeId: string;
      deviceId: string;
      punchTime: string;
      punchDirection?: "IN" | "OUT";
      captureMethod?: AttendancePunch["captureMethod"];
      sourceRef: string;
      /** Ingestion clock override for deterministic tests; defaults to now (UTC). */
      asOf?: string;
    }
  ): PunchIngestResult {
    this.authorization.check(actor, "g03.punch.ingest", actor);
    this.requireEmployee(actor, input.employeeId);
    const device = this.repository.findDevice(actor, input.deviceId);
    if (!device || device.status !== "ACTIVE") {
      throw new FoundationError("DEVICE_NOT_AUTHORIZED", "Punch device is not registered or not active", {
        field: "deviceId",
        details: { deviceId: input.deviceId },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.punchTime)) {
      throw new FoundationError("VALIDATION_FAILED", "punchTime must use ISO YYYY-MM-DDTHH:MM", { field: "punchTime" });
    }
    const ingestionClock = input.asOf ?? new Date().toISOString();
    if (input.punchTime > ingestionClock) {
      throw new FoundationError("INVALID_PUNCH_TIME", "Punch time is in the future", {
        field: "punchTime",
        details: { punchTime: input.punchTime },
      });
    }
    const existing = this.repository.findPunchByDedupKey(actor, input.deviceId, input.sourceRef);
    if (existing) {
      // Dedup on (device_id, source_ref): the ledger stays append-only with a single row.
      return { punch: { ...existing }, ingestionStatus: "DUPLICATE" };
    }
    const punch: AttendancePunch = {
      id: nextId("punch", this.repository.countPunches()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      deviceId: input.deviceId,
      punchTime: input.punchTime,
      attendanceDate: this.deriveAttendanceDate(actor, input.employeeId, input.punchTime),
      punchDirection: input.punchDirection,
      captureMethod: input.captureMethod ?? "BIOMETRIC",
      sourceRef: input.sourceRef,
      ingestionStatus: "ACCEPTED",
    };
    this.repository.appendPunch(punch);
    this.audit.recordMutation(actor, {
      action: "G03_PUNCH_INGEST",
      subjectRef: `attendance_punches:${punch.id}`,
      metadata: { deviceId: punch.deviceId, sourceRef: punch.sourceRef, attendanceDate: punch.attendanceDate },
    });
    return { punch: { ...punch }, ingestionStatus: "ACCEPTED" };
  }

  listPunches(scope: TenantScope, employeeId?: string, attendanceDate?: string): AttendancePunch[] {
    requireTenantScope(scope);
    return this.repository.listPunches(scope, employeeId, attendanceDate).map((punch) => ({ ...punch }));
  }

  /**
   * Wire punch-derived attendance into the PH-07D derivation: collapse the ledger's
   * ACCEPTED punches for the shift-anchored day into in/out times and hand them to
   * LeaveService.captureAttendance — FR-04 status derivation stays the single authority.
   */
  deriveAttendanceFromPunches(actor: ActorContext, input: { employeeId: string; attendanceDate: string }): AttendanceRecord {
    this.authorization.check(actor, "g03.attendance.capture", actor);
    const punches = this.repository
      .listPunches(actor, input.employeeId, input.attendanceDate)
      .slice()
      .sort((a, b) => (a.punchTime < b.punchTime ? -1 : 1));
    const first = punches[0];
    const last = punches.length > 1 ? punches[punches.length - 1] : undefined;
    const inTime = first ? first.punchTime.slice(11, 16) : undefined;
    const outTime = last ? last.punchTime.slice(11, 16) : undefined;
    return this.leave.captureAttendance(actor, {
      employeeId: input.employeeId,
      attendanceDate: input.attendanceDate,
      inTime,
      outTime,
    });
  }

  // --- FR-09: comp_off_ledger ------------------------------------------------------------

  /** Earn a comp-off credit with an explicit expires_on (policy-supplied, never invented). */
  earnCompOff(
    actor: ActorContext,
    input: {
      employeeId: string;
      days: number;
      earnedOn: string;
      expiresOn: string;
      sourceRefType?: "OVERTIME" | "HOLIDAY_WORK" | "MANUAL";
      sourceRefId?: string;
      remarks?: string;
    }
  ): CompOffLedgerEntry {
    this.authorization.check(actor, "g03.compoff.earn", actor);
    this.requireEmployee(actor, input.employeeId);
    if (input.days <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Comp-off earn days must be positive", { field: "days" });
    }
    if (!dateOnly(input.earnedOn) || !dateOnly(input.expiresOn) || input.expiresOn < input.earnedOn) {
      throw new FoundationError("VALIDATION_FAILED", "Comp-off earn requires earnedOn and a later expires_on (YYYY-MM-DD)", { field: "expiresOn" });
    }
    const entry = this.appendEntry(actor, {
      employeeId: input.employeeId,
      entryType: "EARN",
      days: input.days,
      earnedOn: input.earnedOn,
      expiresOn: input.expiresOn,
      sourceRefType: input.sourceRefType ?? "MANUAL",
      sourceRefId: input.sourceRefId,
      remarks: input.remarks,
    });
    this.audit.recordMutation(actor, {
      action: "G03_COMPOFF_EARN",
      subjectRef: `comp_off_ledger:${entry.id}`,
      metadata: { employeeId: entry.employeeId, days: entry.days, expiresOn: entry.expiresOn },
    });
    return entry;
  }

  /**
   * Redeem comp-off FIFO from non-expired credits (ordered by earn date). Expired credits
   * are never consumed: targeting one throws COMP_OFF_EXPIRED (422); redeeming more than
   * the non-expired remainder throws COMP_OFF_INSUFFICIENT (409).
   */
  redeemCompOff(
    actor: ActorContext,
    input: { employeeId: string; days: number; redeemOn: string; targetEntryId?: string; remarks?: string }
  ): { entry: CompOffLedgerEntry; consumed: { creditEntryId: string; days: number }[] } {
    this.authorization.check(actor, "g03.compoff.redeem", actor);
    if (input.days <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Comp-off redemption days must be positive", { field: "days" });
    }
    if (!dateOnly(input.redeemOn)) {
      throw new FoundationError("VALIDATION_FAILED", "redeemOn must use YYYY-MM-DD", { field: "redeemOn" });
    }
    const credits = this.replayCredits(actor, input.employeeId);
    if (input.targetEntryId) {
      const target = credits.find((credit) => credit.entryId === input.targetEntryId);
      if (!target) {
        throw new FoundationError("NOT_FOUND", "Targeted comp-off credit not found", { field: "targetEntryId" });
      }
      if (target.expiresOn !== undefined && target.expiresOn < input.redeemOn) {
        throw new FoundationError("COMP_OFF_EXPIRED", "Targeted comp-off credit has expired and cannot be redeemed", {
          field: "targetEntryId",
          details: { creditEntryId: target.entryId, expiresOn: target.expiresOn },
        });
      }
    }
    const redeemable = credits.filter((credit) => credit.remaining > 0 && (credit.expiresOn === undefined || credit.expiresOn >= input.redeemOn));
    const available = redeemable.reduce((sum, credit) => sum + credit.remaining, 0);
    if (available < input.days) {
      throw new FoundationError("COMP_OFF_INSUFFICIENT", "Comp-off redemption exceeds the non-expired ledger balance", {
        field: "days",
        details: { availableBalance: available, requested: input.days },
      });
    }
    // FIFO consumption evidence: oldest non-expired earn credits first.
    const consumed: { creditEntryId: string; days: number }[] = [];
    let toConsume = input.days;
    for (const credit of redeemable) {
      if (toConsume <= 0) {
        break;
      }
      const take = Math.min(credit.remaining, toConsume);
      consumed.push({ creditEntryId: credit.entryId, days: take });
      toConsume -= take;
    }
    const entry = this.appendEntry(actor, {
      employeeId: input.employeeId,
      entryType: "REDEEM",
      days: -input.days,
      earnedOn: input.redeemOn,
      sourceRefType: "MANUAL",
      sourceRefId: consumed[0]?.creditEntryId,
      remarks: input.remarks ?? `FIFO redemption of ${input.days} day(s) from ${consumed.map((item) => item.creditEntryId).join(", ")}`,
    });
    this.audit.recordMutation(actor, {
      action: "G03_COMPOFF_REDEEM",
      subjectRef: `comp_off_ledger:${entry.id}`,
      metadata: { employeeId: input.employeeId, days: input.days, consumed },
    });
    return { entry, consumed };
  }

  /**
   * JOB-G03-COMPOFF-EXPIRE: sweep the ledger and lapse the unconsumed remainder of every
   * credit whose expires_on has passed — one append-only EXPIRE entry per lapsed credit.
   */
  runCompOffExpirySweep(actor: ActorContext, input: { asOfDate: string }): { job: JobRun; lapsed: CompOffLedgerEntry[] } {
    this.authorization.check(actor, "g03.compoff.expire", actor);
    if (!dateOnly(input.asOfDate)) {
      throw new FoundationError("VALIDATION_FAILED", "asOfDate must use YYYY-MM-DD", { field: "asOfDate" });
    }
    const run = this.jobs.start(actor, { jobId: "JOB-G03-COMPOFF-EXPIRE", runKey: input.asOfDate });
    const employeeIds = [...new Set(this.repository.listCompOffEntries(actor).map((entry) => entry.employeeId))];
    const lapsed: CompOffLedgerEntry[] = [];
    for (const employeeId of employeeIds) {
      for (const credit of this.replayCredits(actor, employeeId)) {
        if (credit.remaining > 0 && credit.expiresOn !== undefined && credit.expiresOn < input.asOfDate) {
          lapsed.push(
            this.appendEntry(actor, {
              employeeId,
              entryType: "EXPIRE",
              days: -credit.remaining,
              earnedOn: input.asOfDate,
              sourceRefId: credit.entryId,
              remarks: `Credit ${credit.entryId} expired on ${credit.expiresOn}`,
            })
          );
        }
      }
    }
    const job = this.jobs.finish(actor, run.id, {
      rowsAffected: lapsed.length,
      outcomeDetail: { asOfDate: input.asOfDate, lapsedEntryIds: lapsed.map((entry) => entry.id) },
    });
    this.audit.recordMutation(actor, {
      action: "G03_COMPOFF_EXPIRE_SWEEP",
      subjectRef: `jobs:${job.id}`,
      metadata: { asOfDate: input.asOfDate, lapsedCount: lapsed.length },
    });
    return { job, lapsed };
  }

  listCompOffLedger(scope: TenantScope, employeeId?: string): CompOffLedgerEntry[] {
    requireTenantScope(scope);
    return this.repository.listCompOffEntries(scope, employeeId).map((entry) => ({ ...entry }));
  }

  /** Balance is DERIVED from the append-only ledger (R17) — never a mutable counter. */
  getCompOffBalance(scope: TenantScope, employeeId: string, asOfDate: string): CompOffBalance {
    requireTenantScope(scope);
    const ledgerBalance = this.repository.listCompOffEntries(scope, employeeId).reduce((sum, entry) => sum + entry.days, 0);
    const availableBalance = this.replayCredits(scope, employeeId)
      .filter((credit) => credit.expiresOn === undefined || credit.expiresOn >= asOfDate)
      .reduce((sum, credit) => sum + credit.remaining, 0);
    return { employeeId, ledgerBalance, availableBalance };
  }

  // --- internals -------------------------------------------------------------------------

  /**
   * FR-03 attendance_date derivation via the rostered shift's date_anchor_rule.
   * SHIFT_START_LOCAL_DATE: a night-shift punch in the after-midnight tail (time-of-day at
   * or before shift end + grace) anchors to the shift START date, i.e. the previous local
   * day. PUNCH_LOCAL_DATE (and no roster/shift) anchors to the punch's own local date.
   */
  private deriveAttendanceDate(scope: TenantScope, employeeId: string, punchTime: string): string {
    const punchDate = punchTime.slice(0, 10);
    const punchClock = punchTime.slice(11, 16);
    const roster = this.repository
      .listRosters(scope)
      .find(
        (item) =>
          item.employeeId === employeeId &&
          (item.status === "PUBLISHED" || item.status === "SUPERSEDED") &&
          item.effectiveFrom <= punchDate &&
          (item.effectiveTo === undefined || punchDate <= item.effectiveTo)
      );
    const shift = roster ? this.repository.findShift(scope, roster.shiftId) : undefined;
    if (!shift || shift.dateAnchorRule !== "SHIFT_START_LOCAL_DATE") {
      return punchDate;
    }
    if (shift.isNightShift && minutesOf(punchClock) <= minutesOf(shift.endTime) + shift.graceMinutes) {
      // Night shift crossing midnight: the post-midnight punch belongs to yesterday's shift.
      return dayBefore(punchDate);
    }
    return punchDate;
  }

  /** Append a comp_off_ledger entry with balance_after reconciled from the ledger sum. */
  private appendEntry(
    actor: ActorContext,
    input: {
      employeeId: string;
      entryType: CompOffEntryType;
      days: number;
      earnedOn: string;
      expiresOn?: string;
      sourceRefType?: "OVERTIME" | "HOLIDAY_WORK" | "MANUAL";
      sourceRefId?: string;
      remarks?: string;
    }
  ): CompOffLedgerEntry {
    const ledgerSum = this.repository.listCompOffEntries(actor, input.employeeId).reduce((sum, entry) => sum + entry.days, 0);
    const entry: CompOffLedgerEntry = {
      id: nextId("compoff", this.repository.countCompOffEntries()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      entryType: input.entryType,
      days: input.days,
      earnedOn: input.earnedOn,
      expiresOn: input.expiresOn,
      balanceAfter: ledgerSum + input.days,
      sourceRefType: input.sourceRefType,
      sourceRefId: input.sourceRefId,
      remarks: input.remarks,
    };
    this.repository.appendCompOffEntry(entry);
    return { ...entry };
  }

  /**
   * Replay the append-only ledger into per-credit remaining state. REDEEM entries consume
   * FIFO (earn-date order) from credits non-expired at their effective date; EXPIRE entries
   * consume the exact credit they lapsed (source_ref_id lineage).
   */
  private replayCredits(scope: TenantScope, employeeId: string): CreditState[] {
    const credits: CreditState[] = [];
    for (const entry of this.repository.listCompOffEntries(scope, employeeId)) {
      if (entry.entryType === "EARN") {
        credits.push({ entryId: entry.id, earnedOn: entry.earnedOn, expiresOn: entry.expiresOn, remaining: entry.days });
        credits.sort((a, b) => (a.earnedOn < b.earnedOn ? -1 : a.earnedOn > b.earnedOn ? 1 : 0));
        continue;
      }
      if (entry.entryType === "EXPIRE") {
        const credit = credits.find((item) => item.entryId === entry.sourceRefId);
        if (credit) {
          credit.remaining = Math.max(credit.remaining + entry.days, 0);
        }
        continue;
      }
      // REDEEM: FIFO over credits non-expired at the redemption's effective date.
      let toConsume = -entry.days;
      for (const credit of credits) {
        if (toConsume <= 0) {
          break;
        }
        if (credit.remaining <= 0 || (credit.expiresOn !== undefined && credit.expiresOn < entry.earnedOn)) {
          continue;
        }
        const take = Math.min(credit.remaining, toConsume);
        credit.remaining -= take;
        toConsume -= take;
      }
    }
    return credits;
  }

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
  }

  private requireRoster(scope: TenantScope, rosterId: string): RosterAssignment {
    const roster = this.repository.findRoster(scope, rosterId);
    if (!roster) {
      throw new FoundationError("NOT_FOUND", "Roster not found");
    }
    return roster;
  }

  private cloneRoster(roster: RosterAssignment): RosterAssignment {
    return { ...roster, weeklyOffPattern: [...roster.weeklyOffPattern] };
  }
}

function clockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function minutesOf(clock: string): number {
  return Number.parseInt(clock.slice(0, 2), 10) * 60 + Number.parseInt(clock.slice(3, 5), 10);
}

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function rangesOverlap(fromA: string, toA: string | undefined, fromB: string, toB: string | undefined): boolean {
  return fromA <= (toB ?? "9999-12-31") && fromB <= (toA ?? "9999-12-31");
}
