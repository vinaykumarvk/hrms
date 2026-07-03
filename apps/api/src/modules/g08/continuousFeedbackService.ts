import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-19B — G08 continuous feedback and check-ins at BRD depth
 * (docs/brd/v3/G08-performance-appraisal-management.md FR-10):
 *
 * - continuous_feedback: lightweight feedback entries recorded against an appraisee within an
 *   appraisal cycle. A feedback note is mandatory (empty note rejected).
 * - check_ins: periodic manager/appraisee check-in records within a cycle, each carrying a
 *   mandatory discussion note.
 *
 * These are append-only, non-authoritative inputs — they inform the appraisal, never set a grade.
 */

export type FeedbackDirection = "UPWARD" | "DOWNWARD" | "PEER";

/** continuous_feedback — one feedback entry within a cycle. */
export interface ContinuousFeedbackEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  cycleId: string;
  appraiseeId: string;
  authorId: string;
  direction: FeedbackDirection;
  note: string;
  recordedAt: string;
}

/** check_ins — a periodic check-in record within a cycle. */
export interface CheckInEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  cycleId: string;
  appraiseeId: string;
  managerId: string;
  note: string;
  checkInDate: string;
}

export interface ContinuousFeedbackRepository {
  appendFeedback(row: ContinuousFeedbackEntry): void;
  listFeedback(scope: TenantScope, cycleId: string, appraiseeId: string): ContinuousFeedbackEntry[];
  appendCheckIn(row: CheckInEntry): void;
  listCheckIns(scope: TenantScope, cycleId: string, appraiseeId: string): CheckInEntry[];
}

export class InMemoryContinuousFeedbackRepository implements ContinuousFeedbackRepository {
  private readonly feedback: ContinuousFeedbackEntry[] = [];
  private readonly checkIns: CheckInEntry[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  appendFeedback(row: ContinuousFeedbackEntry): void { this.feedback.push({ ...row }); }
  listFeedback(scope: TenantScope, cycleId: string, appraiseeId: string): ContinuousFeedbackEntry[] {
    return this.feedback.filter((f) => f.cycleId === cycleId && f.appraiseeId === appraiseeId && this.scoped(f, scope)).map((f) => ({ ...f }));
  }
  appendCheckIn(row: CheckInEntry): void { this.checkIns.push({ ...row }); }
  listCheckIns(scope: TenantScope, cycleId: string, appraiseeId: string): CheckInEntry[] {
    return this.checkIns.filter((c) => c.cycleId === cycleId && c.appraiseeId === appraiseeId && this.scoped(c, scope)).map((c) => ({ ...c }));
  }
}

export class ContinuousFeedbackService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: ContinuousFeedbackRepository = new InMemoryContinuousFeedbackRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  recordFeedback(
    actor: ActorContext,
    input: { cycleId: string; appraiseeId: string; direction: FeedbackDirection; note: string; recordedAt: string }
  ): ContinuousFeedbackEntry {
    this.authorization.check(actor, "g08.feedback.record", actor);
    if (!input.note || !input.note.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A continuous_feedback entry requires a note", { field: "note" });
    }
    const entry: ContinuousFeedbackEntry = {
      id: this.next("g08-continuous-feedback"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cycleId: input.cycleId,
      appraiseeId: input.appraiseeId,
      authorId: actor.userId,
      direction: input.direction,
      note: input.note,
      recordedAt: input.recordedAt,
    };
    this.repo.appendFeedback(entry);
    this.audit.recordMutation(actor, {
      action: "G08_CONTINUOUS_FEEDBACK_RECORDED",
      subjectRef: `continuous_feedback:${entry.id}`,
      metadata: { cycleId: entry.cycleId, direction: entry.direction },
    });
    return { ...entry };
  }

  recordCheckIn(
    actor: ActorContext,
    input: { cycleId: string; appraiseeId: string; note: string; checkInDate: string }
  ): CheckInEntry {
    this.authorization.check(actor, "g08.checkin.record", actor);
    if (!input.note || !input.note.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A check_ins entry requires a discussion note", { field: "note" });
    }
    const entry: CheckInEntry = {
      id: this.next("g08-check-in"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cycleId: input.cycleId,
      appraiseeId: input.appraiseeId,
      managerId: actor.userId,
      note: input.note,
      checkInDate: input.checkInDate,
    };
    this.repo.appendCheckIn(entry);
    this.audit.recordMutation(actor, {
      action: "G08_CHECK_IN_RECORDED",
      subjectRef: `check_ins:${entry.id}`,
      metadata: { cycleId: entry.cycleId },
    });
    return { ...entry };
  }

  listFeedback(scope: TenantScope, cycleId: string, appraiseeId: string): ContinuousFeedbackEntry[] {
    requireTenantScope(scope);
    return this.repo.listFeedback(scope, cycleId, appraiseeId);
  }
  listCheckIns(scope: TenantScope, cycleId: string, appraiseeId: string): CheckInEntry[] {
    requireTenantScope(scope);
    return this.repo.listCheckIns(scope, cycleId, appraiseeId);
  }
}
