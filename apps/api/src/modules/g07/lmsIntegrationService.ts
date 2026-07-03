import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-21A — G07 LMS / xAPI integration at BRD depth
 * (docs/brd/v3/G07-training-skill-development.md FR-015):
 *
 * - learning_record_stores register an external LRS (single primary per tenant).
 * - lms_enrollments track an employee's enrolment in an external course.
 * - xAPI statements are ingested with idempotency: a duplicate statement_id is a no-op replay (the
 *   enrolment progress is not double-applied), and a COMPLETED statement marks the enrolment done.
 */

export type EnrollmentStatus = "ENROLLED" | "IN_PROGRESS" | "COMPLETED";

/** learning_record_stores — an external LRS registration. */
export interface LearningRecordStore {
  id: string;
  tenantId: string;
  entityId?: string;
  name: string;
  endpoint: string;
  isPrimary: boolean;
  syncCursor: number;
}

/** lms_enrollments — an employee enrolment in an external course. */
export interface LmsEnrollment {
  id: string;
  tenantId: string;
  entityId?: string;
  lrsId: string;
  employeeId: string;
  courseRef: string;
  status: EnrollmentStatus;
  appliedStatementIds: string[];
}

export interface LmsIntegrationRepository {
  saveLrs(row: LearningRecordStore): void;
  findLrs(scope: TenantScope, id: string): LearningRecordStore | undefined;
  hasPrimaryLrs(scope: TenantScope): boolean;
  saveEnrollment(row: LmsEnrollment): void;
  findEnrollment(scope: TenantScope, id: string): LmsEnrollment | undefined;
}

export class InMemoryLmsIntegrationRepository implements LmsIntegrationRepository {
  private readonly stores: LearningRecordStore[] = [];
  private readonly enrollments: LmsEnrollment[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveLrs(row: LearningRecordStore): void {
    const i = this.stores.findIndex((s) => s.id === row.id);
    if (i >= 0) this.stores[i] = { ...row }; else this.stores.push({ ...row });
  }
  findLrs(scope: TenantScope, id: string): LearningRecordStore | undefined {
    const row = this.stores.find((s) => s.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  hasPrimaryLrs(scope: TenantScope): boolean {
    return this.stores.some((s) => s.isPrimary && this.scoped(s, scope));
  }
  saveEnrollment(row: LmsEnrollment): void {
    const i = this.enrollments.findIndex((e) => e.id === row.id);
    const copy = { ...row, appliedStatementIds: [...row.appliedStatementIds] };
    if (i >= 0) this.enrollments[i] = copy; else this.enrollments.push(copy);
  }
  findEnrollment(scope: TenantScope, id: string): LmsEnrollment | undefined {
    const row = this.enrollments.find((e) => e.id === id);
    return row && this.scoped(row, scope) ? { ...row, appliedStatementIds: [...row.appliedStatementIds] } : undefined;
  }
}

export class LmsIntegrationService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: LmsIntegrationRepository = new InMemoryLmsIntegrationRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  registerLrs(actor: ActorContext, input: { name: string; endpoint: string; isPrimary?: boolean }): LearningRecordStore {
    this.authorization.check(actor, "g07.lrs.register", actor);
    if (input.isPrimary && this.repo.hasPrimaryLrs(actor)) {
      throw new FoundationError("PRECONDITION_FAILED", "A primary learning_record_stores entry already exists (single primary)");
    }
    const lrs: LearningRecordStore = {
      id: this.next("g07-lrs"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      name: input.name,
      endpoint: input.endpoint,
      isPrimary: Boolean(input.isPrimary),
      syncCursor: 0,
    };
    this.repo.saveLrs(lrs);
    this.audit.recordMutation(actor, {
      action: "G07_LRS_REGISTERED",
      subjectRef: `learning_record_stores:${lrs.id}`,
      metadata: { isPrimary: lrs.isPrimary },
    });
    return { ...lrs };
  }

  enrol(actor: ActorContext, input: { lrsId: string; employeeId: string; courseRef: string }): LmsEnrollment {
    this.authorization.check(actor, "g07.lms.enrol", actor);
    if (!this.repo.findLrs(actor, input.lrsId)) {
      throw new FoundationError("NOT_FOUND", "LRS not found");
    }
    const enrollment: LmsEnrollment = {
      id: this.next("g07-lms-enrollment"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      lrsId: input.lrsId,
      employeeId: input.employeeId,
      courseRef: input.courseRef,
      status: "ENROLLED",
      appliedStatementIds: [],
    };
    this.repo.saveEnrollment(enrollment);
    this.audit.recordMutation(actor, {
      action: "G07_LMS_ENROLLED",
      subjectRef: `lms_enrollments:${enrollment.id}`,
      metadata: { courseRef: enrollment.courseRef },
    });
    return { ...enrollment };
  }

  /**
   * Ingest an xAPI statement. Idempotent: a statement_id already applied to the enrolment is a
   * no-op replay. A COMPLETED verb marks the enrolment COMPLETED; otherwise IN_PROGRESS.
   */
  ingestStatement(
    actor: ActorContext,
    enrollmentId: string,
    input: { statementId: string; verb: "attempted" | "progressed" | "completed" }
  ): { enrollment: LmsEnrollment; applied: boolean } {
    this.authorization.check(actor, "g07.lms.statement", actor);
    const enrollment = this.repo.findEnrollment(actor, enrollmentId);
    if (!enrollment) throw new FoundationError("NOT_FOUND", "Enrollment not found");
    if (enrollment.appliedStatementIds.includes(input.statementId)) {
      // Idempotent replay — no double application.
      return { enrollment, applied: false };
    }
    enrollment.appliedStatementIds.push(input.statementId);
    enrollment.status = input.verb === "completed" ? "COMPLETED" : "IN_PROGRESS";
    this.repo.saveEnrollment(enrollment);
    const lrs = this.repo.findLrs(actor, enrollment.lrsId);
    if (lrs) {
      lrs.syncCursor += 1;
      this.repo.saveLrs(lrs);
    }
    this.audit.recordMutation(actor, {
      action: "G07_XAPI_STATEMENT_APPLIED",
      subjectRef: `lms_enrollments:${enrollment.id}`,
      metadata: { statementId: input.statementId, verb: input.verb },
    });
    return { enrollment: this.repo.findEnrollment(actor, enrollmentId)!, applied: true };
  }

  getEnrollment(scope: TenantScope, id: string): LmsEnrollment | undefined {
    requireTenantScope(scope);
    return this.repo.findEnrollment(scope, id);
  }
}
