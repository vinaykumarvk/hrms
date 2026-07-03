import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-21C — G09 jurisdiction transfer and retiree Rule-9 bar at BRD depth
 * (docs/brd/v3/G09-disciplinary-cases-punishment.md FR-026):
 *
 * - A disciplinary case's jurisdiction can be re-resolved (transferred) to a new authority, with an
 *   audit trail of the transfer chain.
 * - Rule 9 (CCS Pension Rules): departmental proceedings against a retiree in respect of an event
 *   more than FOUR years before institution are barred (ERR-G09-RETIREE-PROCEEDING-BARRED) unless a
 *   competent sanction is on record.
 */

export interface CaseJurisdiction {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  currentAuthorityId: string;
  transferChain: Array<{ fromAuthorityId: string; toAuthorityId: string; reason: string }>;
}

export interface JurisdictionRetireeRepository {
  saveJurisdiction(row: CaseJurisdiction): void;
  findJurisdiction(scope: TenantScope, caseId: string): CaseJurisdiction | undefined;
}

export class InMemoryJurisdictionRetireeRepository implements JurisdictionRetireeRepository {
  private readonly rows: CaseJurisdiction[] = [];
  private scoped(row: CaseJurisdiction, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveJurisdiction(row: CaseJurisdiction): void {
    const i = this.rows.findIndex((r) => r.caseId === row.caseId);
    const copy = { ...row, transferChain: row.transferChain.map((t) => ({ ...t })) };
    if (i >= 0) this.rows[i] = copy; else this.rows.push(copy);
  }
  findJurisdiction(scope: TenantScope, caseId: string): CaseJurisdiction | undefined {
    const row = this.rows.find((r) => r.caseId === caseId);
    return row && this.scoped(row, scope) ? { ...row, transferChain: row.transferChain.map((t) => ({ ...t })) } : undefined;
  }
}

/** Whole-year difference between two ISO dates (event -> institution). */
function yearsBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map((p) => Number.parseInt(p, 10));
  const [ty, tm, td] = toIso.split("-").map((p) => Number.parseInt(p, 10));
  let years = (ty ?? 0) - (fy ?? 0);
  if ((tm ?? 0) < (fm ?? 0) || ((tm ?? 0) === (fm ?? 0) && (td ?? 0) < (fd ?? 0))) years -= 1;
  return years;
}

export class JurisdictionRetireeService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: JurisdictionRetireeRepository = new InMemoryJurisdictionRetireeRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  setInitialJurisdiction(actor: ActorContext, input: { caseId: string; authorityId: string }): CaseJurisdiction {
    this.authorization.check(actor, "g09.jurisdiction.set", actor);
    const row: CaseJurisdiction = {
      id: this.next("g09-case-jurisdiction"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId: input.caseId,
      currentAuthorityId: input.authorityId,
      transferChain: [],
    };
    this.repo.saveJurisdiction(row);
    return this.repo.findJurisdiction(actor, input.caseId)!;
  }

  /** Transfer (re-resolve) the case jurisdiction to a new authority. */
  transferJurisdiction(
    actor: ActorContext,
    input: { caseId: string; toAuthorityId: string; reason: string }
  ): CaseJurisdiction {
    this.authorization.check(actor, "g09.jurisdiction.transfer", actor);
    const row = this.repo.findJurisdiction(actor, input.caseId);
    if (!row) throw new FoundationError("NOT_FOUND", "Case jurisdiction not found");
    if (!input.reason || !input.reason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A jurisdiction transfer requires a reason", { field: "reason" });
    }
    if (input.toAuthorityId === row.currentAuthorityId) {
      throw new FoundationError("PRECONDITION_FAILED", "Jurisdiction already held by that authority");
    }
    row.transferChain.push({ fromAuthorityId: row.currentAuthorityId, toAuthorityId: input.toAuthorityId, reason: input.reason });
    row.currentAuthorityId = input.toAuthorityId;
    this.repo.saveJurisdiction(row);
    this.audit.recordMutation(actor, {
      action: "G09_JURISDICTION_TRANSFERRED",
      subjectRef: `case_jurisdiction:${row.id}`,
      metadata: { caseId: row.caseId, toAuthorityId: input.toAuthorityId },
    });
    return this.repo.findJurisdiction(actor, input.caseId)!;
  }

  /**
   * Rule-9 bar: institution against a retiree more than four years after the event is barred unless
   * a sanction is on record. Throws ERR-G09-RETIREE-PROCEEDING-BARRED when barred.
   */
  assertRetireeProceedingPermitted(
    actor: ActorContext,
    input: { isRetiree: boolean; eventDate: string; institutionDate: string; hasSanction: boolean }
  ): { permitted: true; yearsSinceEvent: number } {
    this.authorization.check(actor, "g09.retiree.check", actor);
    if (!input.isRetiree) {
      return { permitted: true, yearsSinceEvent: yearsBetween(input.eventDate, input.institutionDate) };
    }
    const years = yearsBetween(input.eventDate, input.institutionDate);
    if (years >= 4 && !input.hasSanction) {
      throw new FoundationError("ERR-G09-RETIREE-PROCEEDING-BARRED", "Rule-9: retiree proceeding beyond four years requires sanction", {
        details: { yearsSinceEvent: years, hasSanction: input.hasSanction },
      });
    }
    this.audit.recordMutation(actor, {
      action: "G09_RETIREE_PROCEEDING_PERMITTED",
      subjectRef: `retiree_rule9:${input.eventDate}`,
      metadata: { yearsSinceEvent: years, hasSanction: input.hasSanction },
    });
    return { permitted: true, yearsSinceEvent: years };
  }

  getJurisdiction(scope: TenantScope, caseId: string): CaseJurisdiction | undefined {
    requireTenantScope(scope);
    return this.repo.findJurisdiction(scope, caseId);
  }
}
