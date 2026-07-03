import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-18B — G03 attendance exceptions (WFH / On-Duty / Tour) at BRD depth
 * (docs/brd/v3/G03-attendance-and-leave-management.md FR-07 / FR-08):
 *
 * - attendance_exceptions record WFH and ON_DUTY/TOUR ranges. A new exception may not overlap an
 *   existing one for the same employee (EXCEPTION_OVERLAP).
 * - WFH is bounded by a per-cycle day cap (WFH_CAP_EXCEEDED).
 * - An ON_DUTY/TOUR exception requires a supporting order document (DOCUMENT_REQUIRED).
 *
 * Day counts are inclusive integers; there is no floating-point date arithmetic.
 */

export type AttendanceExceptionType = "WFH" | "ON_DUTY" | "TOUR";
export type AttendanceExceptionStatus = "APPROVED" | "CANCELLED";

/** attendance_exceptions — an approved WFH / on-duty / tour span for an employee. */
export interface AttendanceException {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  exceptionType: AttendanceExceptionType;
  fromDate: string;
  toDate: string;
  days: number;
  orderDocumentId?: string;
  location?: string;
  status: AttendanceExceptionStatus;
}

export interface AttendanceExceptionRepository {
  save(row: AttendanceException): void;
  listActiveForEmployee(scope: TenantScope, employeeId: string): AttendanceException[];
}

export class InMemoryAttendanceExceptionRepository implements AttendanceExceptionRepository {
  private readonly rows: AttendanceException[] = [];
  private scoped(row: AttendanceException, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: AttendanceException): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  listActiveForEmployee(scope: TenantScope, employeeId: string): AttendanceException[] {
    return this.rows.filter((r) => r.employeeId === employeeId && r.status === "APPROVED" && this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

function daysInclusive(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000) + 1;
}
function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export class AttendanceExceptionService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: AttendanceExceptionRepository = new InMemoryAttendanceExceptionRepository(),
    private readonly wfhCapDaysPerCycle: number = 8
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * File an attendance exception. Guards: EXCEPTION_OVERLAP (any active exception overlaps the
   * range), WFH_CAP_EXCEEDED (approved WFH days this cycle + requested > cap), DOCUMENT_REQUIRED
   * (ON_DUTY/TOUR needs an order document).
   */
  fileException(
    actor: ActorContext,
    input: {
      employeeId: string;
      exceptionType: AttendanceExceptionType;
      fromDate: string;
      toDate: string;
      orderDocumentId?: string;
      location?: string;
    }
  ): AttendanceException {
    this.authorization.check(actor, "g03.exception.file", actor);
    if (input.toDate < input.fromDate) {
      throw new FoundationError("VALIDATION_FAILED", "toDate must not precede fromDate", { field: "toDate" });
    }
    const requestedDays = daysInclusive(input.fromDate, input.toDate);
    const active = this.repo.listActiveForEmployee(actor, input.employeeId);
    for (const ex of active) {
      if (rangesOverlap(input.fromDate, input.toDate, ex.fromDate, ex.toDate)) {
        throw new FoundationError("EXCEPTION_OVERLAP", "The exception overlaps an existing approved exception", {
          details: { conflictId: ex.id, fromDate: ex.fromDate, toDate: ex.toDate },
        });
      }
    }
    if (input.exceptionType === "ON_DUTY" || input.exceptionType === "TOUR") {
      if (!input.orderDocumentId) {
        throw new FoundationError("DOCUMENT_REQUIRED", "An on-duty/tour exception requires a supporting order document", {
          field: "orderDocumentId",
        });
      }
    }
    if (input.exceptionType === "WFH") {
      const wfhDays = active.filter((e) => e.exceptionType === "WFH").reduce((s, e) => s + e.days, 0);
      if (wfhDays + requestedDays > this.wfhCapDaysPerCycle) {
        throw new FoundationError("WFH_CAP_EXCEEDED", "WFH exceeds the per-cycle cap", {
          details: { requestedDays, alreadyApproved: wfhDays, capDays: this.wfhCapDaysPerCycle },
        });
      }
    }
    const exception: AttendanceException = {
      id: this.next("g03-attendance-exception"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      exceptionType: input.exceptionType,
      fromDate: input.fromDate,
      toDate: input.toDate,
      days: requestedDays,
      orderDocumentId: input.orderDocumentId,
      location: input.location,
      status: "APPROVED",
    };
    this.repo.save(exception);
    this.audit.recordMutation(actor, {
      action: "G03_ATTENDANCE_EXCEPTION_FILED",
      subjectRef: `attendance_exceptions:${exception.id}`,
      metadata: { exceptionType: exception.exceptionType, days: exception.days },
    });
    return { ...exception };
  }

  listExceptions(scope: TenantScope, employeeId: string): AttendanceException[] {
    requireTenantScope(scope);
    return this.repo.listActiveForEmployee(scope, employeeId);
  }
}
