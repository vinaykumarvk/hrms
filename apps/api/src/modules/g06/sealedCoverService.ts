import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-35C — G06 sealed-cover register at BRD depth
 * (docs/brd/v3/G06-promotion-posting-progression.md FR-008):
 *
 * When a candidate found fit for promotion is under a pending disciplinary/vigilance proceeding, the
 * DPC recommendation is kept in a SEALED cover. On conclusion of the proceeding the sealed cover is
 * released with a recorded reason (a release requires a non-empty reason). Backs the PH-34B UI.
 */

export type SealedCoverStatus = "SEALED" | "RELEASED";

/** sealed_cover_cases — a sealed DPC recommendation pending a proceeding outcome. */
export interface SealedCoverCase {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  reason: string;
  status: SealedCoverStatus;
  releaseReason?: string;
}

export interface SealedCoverRepository {
  save(row: SealedCoverCase): void;
  find(scope: TenantScope, id: string): SealedCoverCase | undefined;
  list(scope: TenantScope): SealedCoverCase[];
}

export class InMemorySealedCoverRepository implements SealedCoverRepository {
  private readonly rows: SealedCoverCase[] = [];
  private scoped(row: SealedCoverCase, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: SealedCoverCase): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): SealedCoverCase | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  list(scope: TenantScope): SealedCoverCase[] {
    return this.rows.filter((r) => this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class SealedCoverService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: SealedCoverRepository = new InMemorySealedCoverRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Seal a DPC recommendation pending a proceeding. */
  placeSealedCover(actor: ActorContext, input: { employeeId: string; reason: string }): SealedCoverCase {
    this.authorization.check(actor, "g06.sealedcover.place", actor);
    if (!input.reason || !input.reason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A sealed cover requires a reason", { field: "reason" });
    }
    const row: SealedCoverCase = {
      id: this.next("g06-sealed-cover"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      reason: input.reason,
      status: "SEALED",
    };
    this.repo.save(row);
    this.audit.recordMutation(actor, {
      action: "G06_SEALED_COVER_PLACED",
      subjectRef: `sealed_cover_cases:${row.id}`,
      metadata: { employeeId: row.employeeId },
    });
    return { ...row };
  }

  listSealedCovers(scope: TenantScope): SealedCoverCase[] {
    requireTenantScope(scope);
    return this.repo.list(scope);
  }

  /** Release a sealed cover with a recorded reason (a release requires a non-empty reason). */
  releaseSealedCover(actor: ActorContext, id: string, input: { reason: string }): SealedCoverCase {
    this.authorization.check(actor, "g06.sealedcover.release", actor);
    const row = this.repo.find(actor, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Sealed cover not found");
    if (row.status === "RELEASED") {
      throw new FoundationError("PRECONDITION_FAILED", "Sealed cover already released");
    }
    if (!input.reason || !input.reason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A sealed-cover release requires a reason", { field: "reason" });
    }
    row.status = "RELEASED";
    row.releaseReason = input.reason;
    this.repo.save(row);
    this.audit.recordMutation(actor, {
      action: "G06_SEALED_COVER_RELEASED",
      subjectRef: `sealed_cover_cases:${row.id}`,
    });
    return { ...row };
  }
}
