import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-22C — G14 natural-language query at BRD depth
 * (docs/brd/v3/G14-dashboard-and-analytics.md FR-15):
 *
 * - A natural-language question is mapped to a WHITELISTED metric via a deterministic keyword
 *   semantic map (no free-form SQL). The mapping produces a confidence score.
 * - A confidence-gate blocks execution below a threshold (the query is logged, not executed) so a
 *   low-confidence interpretation never runs against the marts.
 * - Every attempt is written to nl_query_log; the log strips PII from the raw question.
 */

export type NlQueryStatus = "EXECUTED" | "LOW_CONFIDENCE";

interface MetricPattern {
  metric: string;
  keywords: string[];
}

const METRIC_WHITELIST: MetricPattern[] = [
  { metric: "EMPLOYEE_HEADCOUNT", keywords: ["headcount", "how many employees", "staff strength", "number of employees"] },
  { metric: "ATTRITION_RATE", keywords: ["attrition", "leavers", "turnover"] },
  { metric: "PENDING_PROMOTIONS", keywords: ["pending promotion", "promotions due", "promotion pipeline"] },
  { metric: "LEAVE_UTILISATION", keywords: ["leave utilisation", "leave taken", "leave balance"] },
];

/** nl_query_log — an append-only log of NL query attempts (PII-stripped question). */
export interface NlQueryLogEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  askedBy: string;
  rawQuestionRedacted: string;
  mappedMetric?: string;
  confidence: number;
  status: NlQueryStatus;
}

export interface NlQueryRepository {
  appendLog(row: NlQueryLogEntry): void;
  listLog(scope: TenantScope): NlQueryLogEntry[];
}

export class InMemoryNlQueryRepository implements NlQueryRepository {
  private readonly rows: NlQueryLogEntry[] = [];
  private scoped(row: NlQueryLogEntry, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  appendLog(row: NlQueryLogEntry): void { this.rows.push({ ...row }); }
  listLog(scope: TenantScope): NlQueryLogEntry[] {
    return this.rows.filter((r) => this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

/** Strip obvious PII tokens (Aadhaar-like 12-digit runs, PAN-like tokens, emails) from a question. */
function stripPii(text: string): string {
  return text
    .replace(/\b\d{12}\b/g, "[AADHAAR]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[PAN]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]");
}

export interface NlQueryResult {
  status: NlQueryStatus;
  mappedMetric?: string;
  confidence: number;
  logId: string;
}

export class NlQueryService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: NlQueryRepository = new InMemoryNlQueryRepository(),
    private readonly confidenceThreshold: number = 0.6
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Map a keyword count to a confidence in [0,1]. */
  private interpret(question: string): { metric?: string; confidence: number } {
    const q = question.toLowerCase();
    let best: { metric?: string; confidence: number } = { confidence: 0 };
    for (const pattern of METRIC_WHITELIST) {
      const hits = pattern.keywords.filter((k) => q.includes(k)).length;
      if (hits === 0) continue;
      // Confidence scales with matched keywords, capped at 0.95.
      const confidence = Math.min(0.95, 0.5 + hits * 0.25);
      if (confidence > best.confidence) best = { metric: pattern.metric, confidence };
    }
    return best;
  }

  /**
   * Ask an NL question. Below the confidence threshold the query is logged as LOW_CONFIDENCE and
   * NOT executed. Every attempt logs a PII-stripped question to nl_query_log.
   */
  ask(actor: ActorContext, input: { question: string }): NlQueryResult {
    this.authorization.check(actor, "g14.nlquery.ask", actor);
    const { metric, confidence } = this.interpret(input.question);
    const executed = Boolean(metric) && confidence >= this.confidenceThreshold;
    const log: NlQueryLogEntry = {
      id: this.next("g14-nl-query-log"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      askedBy: actor.userId,
      rawQuestionRedacted: stripPii(input.question),
      mappedMetric: metric,
      confidence,
      status: executed ? "EXECUTED" : "LOW_CONFIDENCE",
    };
    this.repo.appendLog(log);
    this.audit.recordMutation(actor, {
      action: "G14_NL_QUERY",
      subjectRef: `nl_query_log:${log.id}`,
      metadata: { status: log.status, mappedMetric: metric, confidence },
    });
    if (!executed) {
      // Low confidence: do not execute against the marts.
      return { status: "LOW_CONFIDENCE", mappedMetric: metric, confidence, logId: log.id };
    }
    return { status: "EXECUTED", mappedMetric: metric, confidence, logId: log.id };
  }

  listLog(scope: TenantScope): NlQueryLogEntry[] {
    requireTenantScope(scope);
    return this.repo.listLog(scope);
  }
}
