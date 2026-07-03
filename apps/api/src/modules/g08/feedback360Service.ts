import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-21B — G08 multi-source (360) feedback at BRD depth
 * (docs/brd/v3/G08-performance-appraisal-management.md FR-11):
 *
 * - feedback_360 collects ratings from multiple rater types (PEER / SUBORDINATE / CUSTOMER /
 *   MANAGER). A 360 cycle is released only when the minimum number of raters (MIN_RATERS) has
 *   responded, so individual raters cannot be identified from a thin sample.
 * - Release computes the aggregate score and preserves rater anonymity (no rater identity in the
 *   released summary).
 */

export type RaterType = "PEER" | "SUBORDINATE" | "CUSTOMER" | "MANAGER";
export type Feedback360Status = "OPEN" | "RELEASED";

/** feedback_360 — a 360 collection for one appraisee within a cycle. */
export interface Feedback360 {
  id: string;
  tenantId: string;
  entityId?: string;
  cycleId: string;
  appraiseeId: string;
  minRaters: number;
  responses: Array<{ raterId: string; raterType: RaterType; score: number }>;
  status: Feedback360Status;
  aggregateScore?: number;
}

/** The anonymised released summary — no rater identities. */
export interface Feedback360Release {
  feedback360Id: string;
  appraiseeId: string;
  raterCount: number;
  aggregateScore: number;
  byRaterType: Record<string, { count: number; averageScore: number }>;
}

export interface Feedback360Repository {
  save(row: Feedback360): void;
  find(scope: TenantScope, id: string): Feedback360 | undefined;
}

export class InMemoryFeedback360Repository implements Feedback360Repository {
  private readonly rows: Feedback360[] = [];
  private scoped(row: Feedback360, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: Feedback360): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    const copy = { ...row, responses: row.responses.map((x) => ({ ...x })) };
    if (i >= 0) this.rows[i] = copy; else this.rows.push(copy);
  }
  find(scope: TenantScope, id: string): Feedback360 | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row, responses: row.responses.map((x) => ({ ...x })) } : undefined;
  }
}

export class Feedback360Service {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: Feedback360Repository = new InMemoryFeedback360Repository(),
    private readonly defaultMinRaters: number = 3
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  open360(actor: ActorContext, input: { cycleId: string; appraiseeId: string; minRaters?: number }): Feedback360 {
    this.authorization.check(actor, "g08.360.open", actor);
    const row: Feedback360 = {
      id: this.next("g08-feedback-360"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cycleId: input.cycleId,
      appraiseeId: input.appraiseeId,
      minRaters: input.minRaters ?? this.defaultMinRaters,
      responses: [],
      status: "OPEN",
    };
    this.repo.save(row);
    return this.repo.find(actor, row.id)!;
  }

  submitRating(
    actor: ActorContext,
    feedback360Id: string,
    input: { raterId: string; raterType: RaterType; score: number }
  ): Feedback360 {
    this.authorization.check(actor, "g08.360.submit", actor);
    const row = this.require(actor, feedback360Id);
    if (row.status !== "OPEN") {
      throw new FoundationError("PRECONDITION_FAILED", "360 feedback is already released");
    }
    if (row.appraiseeId === input.raterId) {
      throw new FoundationError("FORBIDDEN", "An appraisee cannot rate themselves in 360 feedback");
    }
    if (row.responses.some((r) => r.raterId === input.raterId)) {
      throw new FoundationError("PRECONDITION_FAILED", "This rater has already responded");
    }
    if (!Number.isFinite(input.score) || input.score < 1 || input.score > 5) {
      throw new FoundationError("VALIDATION_FAILED", "score must be within 1..5", { field: "score" });
    }
    row.responses.push({ raterId: input.raterId, raterType: input.raterType, score: input.score });
    this.repo.save(row);
    return this.repo.find(actor, feedback360Id)!;
  }

  /** Release the 360 aggregate. Blocked below MIN_RATERS to preserve anonymity. */
  release360(actor: ActorContext, feedback360Id: string): Feedback360Release {
    this.authorization.check(actor, "g08.360.release", actor);
    const row = this.require(actor, feedback360Id);
    if (row.responses.length < row.minRaters) {
      throw new FoundationError("PRECONDITION_FAILED", "INSUFFICIENT_RATERS: 360 feedback cannot be released below MIN_RATERS", {
        details: { responses: row.responses.length, minRaters: row.minRaters },
      });
    }
    const total = row.responses.reduce((s, r) => s + r.score, 0);
    const aggregateScore = Math.round((total / row.responses.length) * 100) / 100;
    const byRaterType: Record<string, { count: number; averageScore: number }> = {};
    for (const r of row.responses) {
      const b = byRaterType[r.raterType] ?? { count: 0, averageScore: 0 };
      const nextCount = b.count + 1;
      byRaterType[r.raterType] = { count: nextCount, averageScore: Math.round(((b.averageScore * b.count + r.score) / nextCount) * 100) / 100 };
    }
    row.status = "RELEASED";
    row.aggregateScore = aggregateScore;
    this.repo.save(row);
    this.audit.recordMutation(actor, {
      action: "G08_FEEDBACK_360_RELEASED",
      subjectRef: `feedback_360:${row.id}`,
      metadata: { raterCount: row.responses.length, aggregateScore },
    });
    // Anonymised summary — no rater identities.
    return { feedback360Id: row.id, appraiseeId: row.appraiseeId, raterCount: row.responses.length, aggregateScore, byRaterType };
  }

  get360(scope: TenantScope, id: string): Feedback360 | undefined {
    requireTenantScope(scope);
    return this.repo.find(scope, id);
  }

  private require(scope: TenantScope, id: string): Feedback360 {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "360 feedback not found");
    return row;
  }
}
