import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-17A — G03 leave-year close and encashment at BRD depth
 * (docs/brd/v3/G03-attendance-and-leave-management.md FR-15 / FR-16):
 *
 * - E30 leave_year_close: closing a leave year is simulate-then-commit. The simulation computes
 *   per-balance carry-forward (min(closing, cf_cap)), lapse (closing − carry-forward), and an
 *   optional HPL-conversion; commit persists the leave_year_close row and stamps CLOSED. Guards:
 *   PENDING_LEAVE_BLOCKS_CLOSE (an OPEN/SUBMITTED leave in the year blocks the close) and
 *   YEAR_ALREADY_CLOSED (a second commit for the same (year, org) is rejected).
 * - E31 leave_encashment: an encashment request is bounded by the type's per-cycle cap
 *   (ENCASHMENT_CAP_EXCEEDED) and only encashable types may be encashed (NOT_ENCASHABLE).
 *
 * Day counts are integers; there is no floating-point leave arithmetic.
 */

export type LeaveYearCloseStatus = "SIMULATED" | "COMMITTED";
export type EncashmentContext = "IN_SERVICE" | "RETIREMENT" | "LTC";

/** One per-balance line of a leave-year close simulation/commit. */
export interface LeaveCloseLine {
  leaveTypeId: string;
  closingBalanceDays: number;
  carryForwardCapDays: number;
  isHalfPay: boolean;
  carriedForwardDays: number;
  lapsedDays: number;
  hplConvertedDays: number;
}

/** E30 leave_year_close — the close ledger row (append-only; one COMMITTED per year/org). */
export interface LeaveYearClose {
  id: string;
  tenantId: string;
  entityId?: string;
  orgUnitId: string;
  leaveYear: number;
  status: LeaveYearCloseStatus;
  lines: LeaveCloseLine[];
  totalCarriedForwardDays: number;
  totalLapsedDays: number;
}

/** E31 leave_encashment — an encashment settlement row bounded by cap + encashability. */
export interface LeaveEncashment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  leaveTypeId: string;
  context: EncashmentContext;
  encashedDays: number;
  status: "SETTLED";
}

export interface LeaveYearCloseRepository {
  saveClose(row: LeaveYearClose): void;
  findCommittedClose(scope: TenantScope, orgUnitId: string, leaveYear: number): LeaveYearClose | undefined;
  saveEncashment(row: LeaveEncashment): void;
  listEncashments(scope: TenantScope, employeeId: string): LeaveEncashment[];
}

export class InMemoryLeaveYearCloseRepository implements LeaveYearCloseRepository {
  private readonly closes: LeaveYearClose[] = [];
  private readonly encashments: LeaveEncashment[] = [];

  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveClose(row: LeaveYearClose): void {
    const i = this.closes.findIndex((c) => c.id === row.id);
    if (i >= 0) this.closes[i] = { ...row, lines: row.lines.map((l) => ({ ...l })) };
    else this.closes.push({ ...row, lines: row.lines.map((l) => ({ ...l })) });
  }
  findCommittedClose(scope: TenantScope, orgUnitId: string, leaveYear: number): LeaveYearClose | undefined {
    const row = this.closes.find((c) => c.orgUnitId === orgUnitId && c.leaveYear === leaveYear && c.status === "COMMITTED" && this.scoped(c, scope));
    return row ? { ...row, lines: row.lines.map((l) => ({ ...l })) } : undefined;
  }
  saveEncashment(row: LeaveEncashment): void { this.encashments.push({ ...row }); }
  listEncashments(scope: TenantScope, employeeId: string): LeaveEncashment[] {
    return this.encashments.filter((e) => e.employeeId === employeeId && this.scoped(e, scope)).map((e) => ({ ...e }));
  }
}

export class LeaveYearCloseService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: LeaveYearCloseRepository = new InMemoryLeaveYearCloseRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Pure simulation: compute carry-forward / lapse / HPL-conversion for each balance line. */
  private simulateLines(
    balances: Array<{ leaveTypeId: string; closingBalanceDays: number; carryForwardCapDays: number; isHalfPay?: boolean; hplConversionRatioPct?: number }>
  ): LeaveCloseLine[] {
    return balances.map((b) => {
      const closing = Math.max(0, Math.trunc(b.closingBalanceDays));
      const cap = Math.max(0, Math.trunc(b.carryForwardCapDays));
      const carriedForwardDays = Math.min(closing, cap);
      const lapsedDays = closing - carriedForwardDays;
      // HPL conversion: lapsing half-pay days may convert at the configured ratio (FR-15 HPL-conversion).
      const hplConvertedDays = b.isHalfPay ? Math.trunc((lapsedDays * (b.hplConversionRatioPct ?? 0)) / 100) : 0;
      return {
        leaveTypeId: b.leaveTypeId,
        closingBalanceDays: closing,
        carryForwardCapDays: cap,
        isHalfPay: Boolean(b.isHalfPay),
        carriedForwardDays,
        lapsedDays,
        hplConvertedDays,
      };
    });
  }

  /** Simulate a leave-year close — no persistence of a COMMITTED row. */
  simulateYearClose(
    actor: ActorContext,
    input: {
      orgUnitId: string;
      leaveYear: number;
      pendingLeaveCount: number;
      balances: Array<{ leaveTypeId: string; closingBalanceDays: number; carryForwardCapDays: number; isHalfPay?: boolean; hplConversionRatioPct?: number }>;
    }
  ): LeaveYearClose {
    this.authorization.check(actor, "g03.yearclose.simulate", actor);
    const lines = this.simulateLines(input.balances);
    const simulation: LeaveYearClose = {
      id: this.next("g03-leave-year-close"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orgUnitId: input.orgUnitId,
      leaveYear: input.leaveYear,
      status: "SIMULATED",
      lines,
      totalCarriedForwardDays: lines.reduce((s, l) => s + l.carriedForwardDays, 0),
      totalLapsedDays: lines.reduce((s, l) => s + l.lapsedDays, 0),
    };
    return simulation;
  }

  /**
   * Commit a leave-year close. PENDING_LEAVE_BLOCKS_CLOSE if any leave in the year is still open;
   * YEAR_ALREADY_CLOSED if a COMMITTED close already exists for (orgUnit, year).
   */
  commitYearClose(
    actor: ActorContext,
    input: {
      orgUnitId: string;
      leaveYear: number;
      pendingLeaveCount: number;
      balances: Array<{ leaveTypeId: string; closingBalanceDays: number; carryForwardCapDays: number; isHalfPay?: boolean; hplConversionRatioPct?: number }>;
    }
  ): LeaveYearClose {
    this.authorization.check(actor, "g03.yearclose.commit", actor);
    if (this.repo.findCommittedClose(actor, input.orgUnitId, input.leaveYear)) {
      throw new FoundationError("YEAR_ALREADY_CLOSED", "The leave year is already closed for this org unit", {
        details: { orgUnitId: input.orgUnitId, leaveYear: input.leaveYear },
      });
    }
    if (input.pendingLeaveCount > 0) {
      throw new FoundationError("PENDING_LEAVE_BLOCKS_CLOSE", "Open/submitted leave in the year blocks the close", {
        details: { pendingLeaveCount: input.pendingLeaveCount },
      });
    }
    const lines = this.simulateLines(input.balances);
    const close: LeaveYearClose = {
      id: this.next("g03-leave-year-close"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orgUnitId: input.orgUnitId,
      leaveYear: input.leaveYear,
      status: "COMMITTED",
      lines,
      totalCarriedForwardDays: lines.reduce((s, l) => s + l.carriedForwardDays, 0),
      totalLapsedDays: lines.reduce((s, l) => s + l.lapsedDays, 0),
    };
    this.repo.saveClose(close);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_YEAR_CLOSED",
      subjectRef: `leave_year_close:${close.id}`,
      metadata: { leaveYear: close.leaveYear, carriedForwardDays: close.totalCarriedForwardDays, lapsedDays: close.totalLapsedDays },
    });
    return { ...close, lines: close.lines.map((l) => ({ ...l })) };
  }

  /**
   * Encash leave. NOT_ENCASHABLE if the type is not encashable; ENCASHMENT_CAP_EXCEEDED if the
   * requested days exceed the per-cycle cap or the available encashable balance.
   */
  encashLeave(
    actor: ActorContext,
    input: {
      employeeId: string;
      leaveTypeId: string;
      context: EncashmentContext;
      requestedDays: number;
      availableEncashableDays: number;
      isEncashable: boolean;
      capDays: number;
    }
  ): LeaveEncashment {
    this.authorization.check(actor, "g03.encashment.settle", actor);
    if (!input.isEncashable) {
      throw new FoundationError("NOT_ENCASHABLE", "This leave type is not encashable", {
        details: { leaveTypeId: input.leaveTypeId },
      });
    }
    if (!Number.isInteger(input.requestedDays) || input.requestedDays <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "requestedDays must be a positive integer", { field: "requestedDays" });
    }
    if (input.requestedDays > input.capDays || input.requestedDays > input.availableEncashableDays) {
      throw new FoundationError("ENCASHMENT_CAP_EXCEEDED", "Encashment exceeds the cap or available encashable balance", {
        details: { requestedDays: input.requestedDays, capDays: input.capDays, availableEncashableDays: input.availableEncashableDays },
      });
    }
    const encashment: LeaveEncashment = {
      id: this.next("g03-leave-encashment"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      context: input.context,
      encashedDays: input.requestedDays,
      status: "SETTLED",
    };
    this.repo.saveEncashment(encashment);
    this.audit.recordMutation(actor, {
      action: "G03_LEAVE_ENCASHED",
      subjectRef: `leave_encashment:${encashment.id}`,
      metadata: { context: encashment.context, encashedDays: encashment.encashedDays },
    });
    return { ...encashment };
  }

  listEncashments(scope: TenantScope, employeeId: string): LeaveEncashment[] {
    requireTenantScope(scope);
    return this.repo.listEncashments(scope, employeeId);
  }
}
