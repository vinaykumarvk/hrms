import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-26C — G14 probabilistic predictive analytics with fairness at BRD depth
 * (docs/brd/v3/G14-dashboard-and-analytics.md FR-18):
 *
 * - An attrition model scores per-employee risk from non-protected, job-related features
 *   (tenure, recent transfers, leave utilisation, promotion gap). PROTECTED features (gender,
 *   caste, religion, age, disability) are EXCLUDED by construction — passing one as a model feature
 *   is rejected (fail closed), so the model cannot learn on a protected attribute.
 * - A fairness pass computes a disparity metric (max/min mean-risk ratio across the values of a
 *   monitored protected attribute) used for oversight only — never as a model input.
 */

const PROTECTED_FEATURES = ["gender", "caste", "religion", "age", "disability", "maritalStatus"];

export interface AttritionFeatures {
  tenureMonths: number;
  recentTransfers: number;
  leaveUtilisationPct: number;
  promotionGapMonths: number;
}

export interface AttritionScore {
  employeeId: string;
  riskScore: number; // 0..1 probability
  band: "LOW" | "MEDIUM" | "HIGH";
}

export interface FairnessReport {
  attribute: string;
  groupMeanRisk: Record<string, number>;
  disparityRatio: number; // max/min group mean; 1.0 = perfectly equal
  flagged: boolean; // disparity beyond the acceptable threshold
}

export interface PredictiveAnalyticsRepository {
  saveScore(row: AttritionScore & { id: string; tenantId: string; entityId?: string }): void;
  listScores(scope: TenantScope): Array<AttritionScore & { tenantId: string; entityId?: string }>;
}

export class InMemoryPredictiveAnalyticsRepository implements PredictiveAnalyticsRepository {
  private readonly rows: Array<AttritionScore & { id: string; tenantId: string; entityId?: string }> = [];
  saveScore(row: AttritionScore & { id: string; tenantId: string; entityId?: string }): void {
    this.rows.push({ ...row });
  }
  listScores(scope: TenantScope): Array<AttritionScore & { tenantId: string; entityId?: string }> {
    return this.rows.filter((r) => r.tenantId === scope.tenantId && (!scope.entityId || r.entityId === scope.entityId)).map((r) => ({ ...r }));
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export class PredictiveAnalyticsService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: PredictiveAnalyticsRepository = new InMemoryPredictiveAnalyticsRepository(),
    private readonly disparityThreshold: number = 1.25
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * Score attrition risk. Rejects any PROTECTED feature key in the supplied features (the model is
   * excludeProtected by construction). Deterministic logistic-style combination of job features.
   */
  scoreAttrition(
    actor: ActorContext,
    input: { employeeId: string; features: AttritionFeatures & Record<string, unknown> }
  ): AttritionScore {
    this.authorization.check(actor, "g14.predict.attrition", actor);
    for (const key of Object.keys(input.features)) {
      if (PROTECTED_FEATURES.includes(key)) {
        throw new FoundationError("VALIDATION_FAILED", "A protected feature may not be used as a model input", {
          field: key,
          details: { protectedFeature: key },
        });
      }
    }
    const f = input.features;
    // Higher recent transfers, high leave utilisation, and a long promotion gap raise risk;
    // longer tenure lowers it. Weights are fixed and auditable (not learned on protected data).
    const linear =
      0.02 * f.recentTransfers +
      0.010 * f.leaveUtilisationPct +
      0.004 * f.promotionGapMonths -
      0.003 * f.tenureMonths -
      0.5;
    const riskScore = clamp01(1 / (1 + Math.exp(-linear)));
    const band: AttritionScore["band"] = riskScore >= 0.66 ? "HIGH" : riskScore >= 0.33 ? "MEDIUM" : "LOW";
    const score: AttritionScore = { employeeId: input.employeeId, riskScore: Math.round(riskScore * 1000) / 1000, band };
    this.repo.saveScore({ ...score, id: this.next("g14-attrition-score"), tenantId: actor.tenantId, entityId: actor.entityId });
    this.audit.recordMutation(actor, {
      action: "G14_ATTRITION_SCORED",
      subjectRef: `attrition_score:${score.employeeId}`,
      metadata: { band: score.band },
    });
    return score;
  }

  /**
   * Fairness disparity report over a monitored protected attribute. The attribute values are
   * supplied for OVERSIGHT — they are correlated with the already-computed scores, never fed to the
   * model. Reports the max/min mean-risk ratio and flags disparity beyond the threshold.
   */
  fairnessReport(
    actor: ActorContext,
    input: { attribute: string; observations: Array<{ group: string; riskScore: number }> }
  ): FairnessReport {
    this.authorization.check(actor, "g14.predict.fairness", actor);
    const sums: Record<string, { total: number; count: number }> = {};
    for (const o of input.observations) {
      const b = sums[o.group] ?? { total: 0, count: 0 };
      sums[o.group] = { total: b.total + o.riskScore, count: b.count + 1 };
    }
    const groupMeanRisk: Record<string, number> = {};
    for (const [g, v] of Object.entries(sums)) {
      groupMeanRisk[g] = Math.round((v.total / v.count) * 1000) / 1000;
    }
    const means = Object.values(groupMeanRisk);
    const max = Math.max(...means);
    const min = Math.min(...means);
    const disparityRatio = min > 0 ? Math.round((max / min) * 1000) / 1000 : Number.POSITIVE_INFINITY;
    const flagged = disparityRatio > this.disparityThreshold;
    this.audit.recordMutation(actor, {
      action: "G14_FAIRNESS_REPORTED",
      subjectRef: `fairness:${input.attribute}`,
      metadata: { disparityRatio, flagged },
    });
    return { attribute: input.attribute, groupMeanRisk, disparityRatio, flagged };
  }

  listScores(scope: TenantScope): AttritionScore[] {
    requireTenantScope(scope);
    return this.repo.listScores(scope).map((r) => ({ employeeId: r.employeeId, riskScore: r.riskScore, band: r.band }));
  }
}
