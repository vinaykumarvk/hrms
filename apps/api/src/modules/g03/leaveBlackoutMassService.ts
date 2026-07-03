import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-19A — G03 blackout periods and mass-leave at BRD depth
 * (docs/brd/v3/G03-attendance-and-leave-management.md FR-23):
 *
 * - blackout_periods define org-scoped windows in which discretionary leave is barred; a leave
 *   whose range intersects an active blackout is rejected (BLACKOUT_PERIOD).
 * - mass_leave applies a leave span to a cohort in one batch; on the batch end, each member is
 *   flagged RETURN_TO_WORK_PENDING until a return is confirmed (a downstream action cannot proceed
 *   while a member's return is still pending).
 */

export type BlackoutStatus = "ACTIVE" | "LIFTED";
export type MassLeaveStatus = "APPLIED" | "CLOSED";

/** blackout_periods — an org-scoped no-leave window. */
export interface BlackoutPeriod {
  id: string;
  tenantId: string;
  entityId?: string;
  orgUnitId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: BlackoutStatus;
}

/** mass_leave — a cohort leave batch with per-member return tracking. */
export interface MassLeaveBatch {
  id: string;
  tenantId: string;
  entityId?: string;
  orgUnitId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  memberEmployeeIds: string[];
  returnPendingEmployeeIds: string[];
  status: MassLeaveStatus;
}

export interface LeaveBlackoutMassRepository {
  saveBlackout(row: BlackoutPeriod): void;
  listActiveBlackouts(scope: TenantScope, orgUnitId: string): BlackoutPeriod[];
  saveMassLeave(row: MassLeaveBatch): void;
  findMassLeave(scope: TenantScope, id: string): MassLeaveBatch | undefined;
}

export class InMemoryLeaveBlackoutMassRepository implements LeaveBlackoutMassRepository {
  private readonly blackouts: BlackoutPeriod[] = [];
  private readonly massLeaves: MassLeaveBatch[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveBlackout(row: BlackoutPeriod): void {
    const i = this.blackouts.findIndex((b) => b.id === row.id);
    if (i >= 0) this.blackouts[i] = { ...row }; else this.blackouts.push({ ...row });
  }
  listActiveBlackouts(scope: TenantScope, orgUnitId: string): BlackoutPeriod[] {
    return this.blackouts.filter((b) => b.orgUnitId === orgUnitId && b.status === "ACTIVE" && this.scoped(b, scope)).map((b) => ({ ...b }));
  }
  saveMassLeave(row: MassLeaveBatch): void {
    const i = this.massLeaves.findIndex((m) => m.id === row.id);
    if (i >= 0) this.massLeaves[i] = { ...row, memberEmployeeIds: [...row.memberEmployeeIds], returnPendingEmployeeIds: [...row.returnPendingEmployeeIds] };
    else this.massLeaves.push({ ...row, memberEmployeeIds: [...row.memberEmployeeIds], returnPendingEmployeeIds: [...row.returnPendingEmployeeIds] });
  }
  findMassLeave(scope: TenantScope, id: string): MassLeaveBatch | undefined {
    const row = this.massLeaves.find((m) => m.id === id);
    return row && this.scoped(row, scope) ? { ...row, memberEmployeeIds: [...row.memberEmployeeIds], returnPendingEmployeeIds: [...row.returnPendingEmployeeIds] } : undefined;
  }
}

function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export class LeaveBlackoutMassService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: LeaveBlackoutMassRepository = new InMemoryLeaveBlackoutMassRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  declareBlackout(
    actor: ActorContext,
    input: { orgUnitId: string; fromDate: string; toDate: string; reason: string }
  ): BlackoutPeriod {
    this.authorization.check(actor, "g03.blackout.declare", actor);
    if (input.toDate < input.fromDate) {
      throw new FoundationError("VALIDATION_FAILED", "toDate must not precede fromDate", { field: "toDate" });
    }
    const blackout: BlackoutPeriod = {
      id: this.next("g03-blackout-period"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orgUnitId: input.orgUnitId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason,
      status: "ACTIVE",
    };
    this.repo.saveBlackout(blackout);
    this.audit.recordMutation(actor, {
      action: "G03_BLACKOUT_DECLARED",
      subjectRef: `blackout_periods:${blackout.id}`,
      metadata: { fromDate: blackout.fromDate, toDate: blackout.toDate },
    });
    return { ...blackout };
  }

  /** Assert a leave range does not intersect an active blackout (BLACKOUT_PERIOD otherwise). */
  assertNotInBlackout(scope: TenantScope, input: { orgUnitId: string; fromDate: string; toDate: string }): void {
    requireTenantScope(scope);
    for (const b of this.repo.listActiveBlackouts(scope, input.orgUnitId)) {
      if (rangesOverlap(input.fromDate, input.toDate, b.fromDate, b.toDate)) {
        throw new FoundationError("BLACKOUT_PERIOD", "Leave falls within an active blackout window", {
          details: { blackoutId: b.id, fromDate: b.fromDate, toDate: b.toDate },
        });
      }
    }
  }

  applyMassLeave(
    actor: ActorContext,
    input: { orgUnitId: string; leaveTypeId: string; fromDate: string; toDate: string; memberEmployeeIds: string[] }
  ): MassLeaveBatch {
    this.authorization.check(actor, "g03.massleave.apply", actor);
    if (input.memberEmployeeIds.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "mass_leave requires at least one member", { field: "memberEmployeeIds" });
    }
    // Mass leave cannot be applied over an active blackout.
    this.assertNotInBlackout(actor, { orgUnitId: input.orgUnitId, fromDate: input.fromDate, toDate: input.toDate });
    const batch: MassLeaveBatch = {
      id: this.next("g03-mass-leave"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orgUnitId: input.orgUnitId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      memberEmployeeIds: [...input.memberEmployeeIds],
      returnPendingEmployeeIds: [...input.memberEmployeeIds],
      status: "APPLIED",
    };
    this.repo.saveMassLeave(batch);
    this.audit.recordMutation(actor, {
      action: "G03_MASS_LEAVE_APPLIED",
      subjectRef: `mass_leave:${batch.id}`,
      metadata: { members: batch.memberEmployeeIds.length },
    });
    return this.repo.findMassLeave(actor, batch.id)!;
  }

  /** Confirm a member's return-to-work, clearing their RETURN_TO_WORK_PENDING flag. */
  confirmReturn(actor: ActorContext, massLeaveId: string, input: { employeeId: string }): MassLeaveBatch {
    this.authorization.check(actor, "g03.massleave.return", actor);
    const batch = this.repo.findMassLeave(actor, massLeaveId);
    if (!batch) throw new FoundationError("NOT_FOUND", "Mass-leave batch not found");
    batch.returnPendingEmployeeIds = batch.returnPendingEmployeeIds.filter((e) => e !== input.employeeId);
    if (batch.returnPendingEmployeeIds.length === 0) batch.status = "CLOSED";
    this.repo.saveMassLeave(batch);
    return this.repo.findMassLeave(actor, massLeaveId)!;
  }

  /** Fail-closed gate: a member with an unconfirmed return blocks downstream actions. */
  assertReturned(scope: TenantScope, massLeaveId: string, employeeId: string): void {
    requireTenantScope(scope);
    const batch = this.repo.findMassLeave(scope, massLeaveId);
    if (!batch) throw new FoundationError("NOT_FOUND", "Mass-leave batch not found");
    if (batch.returnPendingEmployeeIds.includes(employeeId)) {
      throw new FoundationError("RETURN_TO_WORK_PENDING", "Employee has not confirmed return to work after mass leave", {
        details: { massLeaveId, employeeId },
      });
    }
  }
}
