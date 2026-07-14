import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-25C — G03 punch anomaly review at BRD depth
 * (docs/brd/v3/G03-attendance-and-leave-management.md FR-20):
 *
 * - A punch pair is screened for impossible-travel: two punches whose locations are farther apart
 *   than a person could travel in the elapsed time are flagged (IMPOSSIBLE_TRAVEL).
 * - Flagged anomalies open a punch_anomaly_reviews record (FLAGGED) that a reviewer resolves to
 *   CONFIRMED_FRAUD or VALID. The subject of the anomaly cannot review their own case (SoD).
 */

export type AnomalyType = "IMPOSSIBLE_TRAVEL" | "DUPLICATE_PUNCH";
export type AnomalyReviewStatus = "FLAGGED" | "CONFIRMED_FRAUD" | "VALID";

/** punch_anomaly_reviews — a review case for a flagged punch anomaly. */
export interface PunchAnomalyReview {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  anomalyType: AnomalyType;
  detail: string;
  status: AnomalyReviewStatus;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface PunchAnomalyRepository {
  save(row: PunchAnomalyReview): void;
  find(scope: TenantScope, id: string): PunchAnomalyReview | undefined;
}

export class InMemoryPunchAnomalyRepository implements PunchAnomalyRepository {
  private readonly rows: PunchAnomalyReview[] = [];
  private scoped(row: PunchAnomalyReview, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: PunchAnomalyReview): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): PunchAnomalyReview | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

/** Great-circle distance (km) between two lat/long points (haversine). */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class PunchAnomalyService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: PunchAnomalyRepository = new InMemoryPunchAnomalyRepository(),
    private readonly maxSpeedKmh: number = 900 // faster than any ground/air commute in-country
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * Screen two consecutive punches for impossible travel. If the implied speed exceeds maxSpeedKmh,
   * open a FLAGGED punch_anomaly_reviews case; otherwise return null (no anomaly).
   */
  screenPunchPair(
    actor: ActorContext,
    input: {
      employeeId: string;
      punchA: { lat: number; lon: number; atEpochMs: number };
      punchB: { lat: number; lon: number; atEpochMs: number };
    }
  ): PunchAnomalyReview | null {
    this.authorization.check(actor, "g03.punch.screen", actor);
    const hours = Math.abs(input.punchB.atEpochMs - input.punchA.atEpochMs) / 3_600_000;
    const km = haversineKm(input.punchA, input.punchB);
    if (hours <= 0 && km > 0.5) {
      // Same instant, different place — duplicate/impossible.
    }
    const impliedSpeed = hours > 0 ? km / hours : Number.POSITIVE_INFINITY;
    if (km > 0.5 && impliedSpeed > this.maxSpeedKmh) {
      const review: PunchAnomalyReview = {
        id: this.next("g03-punch-anomaly-review"),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        employeeId: input.employeeId,
        anomalyType: "IMPOSSIBLE_TRAVEL",
        detail: `IMPOSSIBLE_TRAVEL: ${km.toFixed(1)}km in ${hours.toFixed(2)}h (~${Math.round(impliedSpeed)}km/h)`,
        status: "FLAGGED",
      };
      this.repo.save(review);
      this.audit.recordMutation(actor, {
        action: "G03_PUNCH_ANOMALY_FLAGGED",
        subjectRef: `punch_anomaly_reviews:${review.id}`,
        metadata: { anomalyType: review.anomalyType },
      });
      return { ...review };
    }
    return null;
  }

  /** Resolve a flagged anomaly. The subject cannot review their own case (SoD). */
  resolveReview(
    actor: ActorContext,
    reviewId: string,
    input: { decision: "CONFIRMED_FRAUD" | "VALID"; note: string }
  ): PunchAnomalyReview {
    this.authorization.check(actor, "g03.punch.review", actor);
    // Post-hr_admin-goal fix: `g03.punch.review_anomaly` names an `anomaly_reviewer` capability
    // flag that was never checked — any `g03.punch.review` holder could approve/reject/escalate a
    // flagged punch regardless of the flag. Modeled as an additional role string, same convention
    // as every other capability-flag fix this goal.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "anomaly_reviewer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Reviewing a flagged punch anomaly requires the anomaly_reviewer capability", { field: "actor" });
    }
    const review = this.require(actor, reviewId);
    if (review.status !== "FLAGGED") {
      throw new FoundationError("PRECONDITION_FAILED", "Anomaly is already reviewed");
    }
    if (review.employeeId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "The subject of an anomaly cannot review their own case (SoD)", {
        details: { reviewId, employeeId: review.employeeId },
      });
    }
    if (!input.note || !input.note.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A review decision requires a note", { field: "note" });
    }
    review.status = input.decision;
    review.reviewedBy = actor.userId;
    review.reviewNote = input.note;
    this.repo.save(review);
    this.audit.recordMutation(actor, {
      action: "G03_PUNCH_ANOMALY_RESOLVED",
      subjectRef: `punch_anomaly_reviews:${review.id}`,
      metadata: { status: review.status, reviewedBy: actor.userId },
    });
    return { ...review };
  }

  getReview(scope: TenantScope, id: string): PunchAnomalyReview | undefined {
    requireTenantScope(scope);
    return this.repo.find(scope, id);
  }

  private require(scope: TenantScope, id: string): PunchAnomalyReview {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Anomaly review not found");
    return row;
  }
}
