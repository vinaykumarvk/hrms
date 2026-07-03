import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-25A — G10 GL-to-ERP posting export at BRD depth
 * (docs/brd/v3/G10-payroll-and-benefits.md FR-19):
 *
 * - gl_export_batches post a balanced GL batch to an external ERP. Posting is idempotent by an
 *   export key: re-posting the same batch is a no-op replay (never a double post).
 * - The batch runs POSTED -> ACKNOWLEDGED once the ERP returns a matching control total; an ACK
 *   whose total does not match is flagged MISMATCH and the batch is not marked ACKNOWLEDGED.
 *
 * Money is integer paise; a batch is rejected unless debit == credit.
 */

export type GlExportStatus = "DRAFT" | "POSTED" | "ACKNOWLEDGED" | "MISMATCH";

/** gl_export_batches — a GL batch queued for ERP posting. */
export interface GlExportBatch {
  id: string;
  tenantId: string;
  entityId?: string;
  exportKey: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  status: GlExportStatus;
  erpReference?: string;
}

export interface GlErpPostingRepository {
  save(row: GlExportBatch): void;
  find(scope: TenantScope, id: string): GlExportBatch | undefined;
  findByExportKey(scope: TenantScope, exportKey: string): GlExportBatch | undefined;
}

export class InMemoryGlErpPostingRepository implements GlErpPostingRepository {
  private readonly rows: GlExportBatch[] = [];
  private scoped(row: GlExportBatch, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: GlExportBatch): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): GlExportBatch | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  findByExportKey(scope: TenantScope, exportKey: string): GlExportBatch | undefined {
    const row = this.rows.find((r) => r.exportKey === exportKey);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

export class GlErpPostingService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: GlErpPostingRepository = new InMemoryGlErpPostingRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /**
   * Post a balanced GL batch to the ERP. Idempotent by exportKey: a repeat is a no-op replay that
   * returns the existing batch. Rejected unless debit == credit.
   */
  postToErp(
    actor: ActorContext,
    input: { exportKey: string; totalDebitPaise: number; totalCreditPaise: number; erpReference: string }
  ): { batch: GlExportBatch; replayed: boolean } {
    this.authorization.check(actor, "g10.glexport.post", actor);
    const existing = this.repo.findByExportKey(actor, input.exportKey);
    if (existing) {
      // Idempotent no-op replay.
      return { batch: existing, replayed: true };
    }
    if (input.totalDebitPaise !== input.totalCreditPaise) {
      throw new FoundationError("VALIDATION_FAILED", "GL export batch is unbalanced (debit != credit)", {
        details: { totalDebitPaise: input.totalDebitPaise, totalCreditPaise: input.totalCreditPaise },
      });
    }
    const batch: GlExportBatch = {
      id: this.next("g10-gl-export-batch"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      exportKey: input.exportKey,
      totalDebitPaise: input.totalDebitPaise,
      totalCreditPaise: input.totalCreditPaise,
      status: "POSTED",
      erpReference: input.erpReference,
    };
    this.repo.save(batch);
    this.audit.recordMutation(actor, {
      action: "G10_GL_EXPORT_POSTED",
      subjectRef: `gl_export_batches:${batch.id}`,
      metadata: { exportKey: batch.exportKey, erpReference: batch.erpReference },
    });
    return { batch, replayed: false };
  }

  /**
   * Reconcile the ERP acknowledgement. A matching control total -> ACKNOWLEDGED; a mismatch ->
   * MISMATCH (not acknowledged), so the discrepancy is surfaced rather than silently accepted.
   */
  acknowledge(actor: ActorContext, batchId: string, input: { ackedTotalPaise: number }): GlExportBatch {
    this.authorization.check(actor, "g10.glexport.ack", actor);
    const batch = this.require(actor, batchId);
    if (batch.status !== "POSTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a POSTED batch can be acknowledged");
    }
    if (input.ackedTotalPaise !== batch.totalDebitPaise) {
      batch.status = "MISMATCH";
      this.repo.save(batch);
      this.audit.recordMutation(actor, {
        action: "G10_GL_EXPORT_MISMATCH",
        subjectRef: `gl_export_batches:${batch.id}`,
        metadata: { ackedTotalPaise: input.ackedTotalPaise, expected: batch.totalDebitPaise },
      });
      return { ...batch };
    }
    batch.status = "ACKNOWLEDGED";
    this.repo.save(batch);
    this.audit.recordMutation(actor, {
      action: "G10_GL_EXPORT_ACKNOWLEDGED",
      subjectRef: `gl_export_batches:${batch.id}`,
    });
    return { ...batch };
  }

  getBatch(scope: TenantScope, id: string): GlExportBatch | undefined {
    requireTenantScope(scope);
    return this.repo.find(scope, id);
  }

  private require(scope: TenantScope, id: string): GlExportBatch {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "GL export batch not found");
    return row;
  }
}
