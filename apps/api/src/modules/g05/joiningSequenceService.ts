import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-18C — G05 joining-sequence and inter-se seniority at BRD depth
 * (docs/brd/v3/G05-transfer-relieving-joining-workflow.md FR-021):
 *
 * - joining_sequence: on joining a post batch, each joiner is assigned a deterministic sequence_no
 *   used to fix inter-se seniority. The order is a stable tie-break — primarily the joining/order
 *   date, then service_no — so re-running assignment yields the identical ordering.
 * - A joiner may be sequenced only once in a batch (duplicate assignment is rejected: the joiner is
 *   "already" sequenced).
 * - The resulting inter-se seniority order is exposed as a G06-consumable list.
 */

/** joining_sequence — one sequenced joiner within a batch. */
export interface JoiningSequenceEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  batchId: string;
  employeeId: string;
  orderDate: string;
  serviceNo: string;
  sequenceNo: number;
}

export interface JoiningSequenceRepository {
  saveBatch(scope: TenantScope, batchId: string, rows: JoiningSequenceEntry[]): void;
  listBatch(scope: TenantScope, batchId: string): JoiningSequenceEntry[];
}

export class InMemoryJoiningSequenceRepository implements JoiningSequenceRepository {
  private readonly rows: JoiningSequenceEntry[] = [];
  private scoped(row: JoiningSequenceEntry, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveBatch(_scope: TenantScope, batchId: string, rows: JoiningSequenceEntry[]): void {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i]!.batchId === batchId) this.rows.splice(i, 1);
    }
    for (const r of rows) this.rows.push({ ...r });
  }
  listBatch(scope: TenantScope, batchId: string): JoiningSequenceEntry[] {
    return this.rows.filter((r) => r.batchId === batchId && this.scoped(r, scope)).sort((a, b) => a.sequenceNo - b.sequenceNo).map((r) => ({ ...r }));
  }
}

/** Deterministic tie-break: earlier orderDate first, then lexicographically smaller serviceNo. */
function interSeCompare(a: { orderDate: string; serviceNo: string }, b: { orderDate: string; serviceNo: string }): number {
  if (a.orderDate !== b.orderDate) return a.orderDate < b.orderDate ? -1 : 1;
  if (a.serviceNo !== b.serviceNo) return a.serviceNo < b.serviceNo ? -1 : 1;
  return 0;
}

export class JoiningSequenceService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: JoiningSequenceRepository = new InMemoryJoiningSequenceRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * Assign the joining sequence (inter-se seniority) for a batch of joiners. The list is sorted by
   * the deterministic tie-break and stamped with a contiguous sequence_no from 1. A duplicate
   * employee in the batch is rejected (a joiner is "already" present).
   */
  assignJoiningSequence(
    actor: ActorContext,
    input: { batchId: string; joiners: Array<{ employeeId: string; orderDate: string; serviceNo: string }> }
  ): JoiningSequenceEntry[] {
    this.authorization.check(actor, "g05.joining.sequence", actor);
    const seen = new Set<string>();
    for (const j of input.joiners) {
      if (seen.has(j.employeeId)) {
        throw new FoundationError("PRECONDITION_FAILED", "Joiner is already present in this joining_sequence batch", {
          details: { batchId: input.batchId, employeeId: j.employeeId },
        });
      }
      seen.add(j.employeeId);
    }
    const ordered = [...input.joiners].sort(interSeCompare);
    const rows: JoiningSequenceEntry[] = ordered.map((j, idx) => ({
      id: this.next("g05-joining-sequence"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      batchId: input.batchId,
      employeeId: j.employeeId,
      orderDate: j.orderDate,
      serviceNo: j.serviceNo,
      sequenceNo: idx + 1,
    }));
    this.repo.saveBatch(actor, input.batchId, rows);
    this.audit.recordMutation(actor, {
      action: "G05_JOINING_SEQUENCE_ASSIGNED",
      subjectRef: `joining_sequence:${input.batchId}`,
      metadata: { count: rows.length },
    });
    return rows.map((r) => ({ ...r }));
  }

  /** The inter-se seniority order for a batch (G06-consumable). */
  interSeSeniority(scope: TenantScope, batchId: string): JoiningSequenceEntry[] {
    requireTenantScope(scope);
    return this.repo.listBatch(scope, batchId);
  }
}
