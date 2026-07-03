import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-20A — G07 vendor / external-trainer empanelment at BRD depth
 * (docs/brd/v3/G07-training-skill-development.md FR-019):
 *
 * - vendor_empanelments run a status machine APPLIED -> UNDER_REVIEW -> EMPANELLED / REJECTED.
 * - Empanelment approval is 4-eyes: the applicant/requester cannot approve their own empanelment
 *   (requester != approver SoD).
 * - Empanelment carries procurement/contract references for audit.
 */

export type EmpanelmentStatus = "APPLIED" | "UNDER_REVIEW" | "EMPANELLED" | "REJECTED";

/** vendor_empanelments — an external vendor/trainer empanelment record. */
export interface VendorEmpanelment {
  id: string;
  tenantId: string;
  entityId?: string;
  empanelmentRef: string;
  vendorName: string;
  category: string;
  requestedBy: string;
  approvedBy?: string;
  contractRef?: string;
  procurementRef?: string;
  status: EmpanelmentStatus;
  decisionReason?: string;
}

export interface VendorEmpanelmentRepository {
  save(row: VendorEmpanelment): void;
  find(scope: TenantScope, id: string): VendorEmpanelment | undefined;
}

export class InMemoryVendorEmpanelmentRepository implements VendorEmpanelmentRepository {
  private readonly rows: VendorEmpanelment[] = [];
  private scoped(row: VendorEmpanelment, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: VendorEmpanelment): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): VendorEmpanelment | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

export class VendorEmpanelmentService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: VendorEmpanelmentRepository = new InMemoryVendorEmpanelmentRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  applyForEmpanelment(
    actor: ActorContext,
    input: { vendorName: string; category: string; procurementRef?: string }
  ): VendorEmpanelment {
    this.authorization.check(actor, "g07.empanelment.apply", actor);
    const row: VendorEmpanelment = {
      id: this.next("g07-vendor-empanelment"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      empanelmentRef: `EMP/${this.counter}`,
      vendorName: input.vendorName,
      category: input.category,
      requestedBy: actor.userId,
      procurementRef: input.procurementRef,
      status: "APPLIED",
    };
    this.repo.save(row);
    this.audit.recordMutation(actor, {
      action: "G07_VENDOR_EMPANELMENT_APPLIED",
      subjectRef: `vendor_empanelments:${row.id}`,
      metadata: { empanelmentRef: row.empanelmentRef },
    });
    return { ...row };
  }

  reviewEmpanelment(actor: ActorContext, empanelmentId: string): VendorEmpanelment {
    this.authorization.check(actor, "g07.empanelment.review", actor);
    const row = this.require(actor, empanelmentId);
    if (row.status !== "APPLIED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an APPLIED empanelment can enter review");
    }
    row.status = "UNDER_REVIEW";
    this.repo.save(row);
    return { ...row };
  }

  /** Approve empanelment (4-eyes: requester cannot self-approve). */
  decideEmpanelment(
    actor: ActorContext,
    empanelmentId: string,
    input: { decision: "EMPANELLED" | "REJECTED"; contractRef?: string; reason?: string }
  ): VendorEmpanelment {
    this.authorization.check(actor, "g07.empanelment.decide", actor);
    const row = this.require(actor, empanelmentId);
    if (row.status !== "UNDER_REVIEW" && row.status !== "APPLIED") {
      throw new FoundationError("PRECONDITION_FAILED", "Empanelment is already decided");
    }
    if (row.requestedBy === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Requester cannot approve their own empanelment (SoD)", {
        details: { empanelmentId, requestedBy: row.requestedBy },
      });
    }
    if (input.decision === "EMPANELLED" && !input.contractRef) {
      throw new FoundationError("VALIDATION_FAILED", "Empanelment requires a contract reference", { field: "contractRef" });
    }
    row.status = input.decision;
    row.approvedBy = actor.userId;
    row.contractRef = input.contractRef;
    row.decisionReason = input.reason;
    this.repo.save(row);
    this.audit.recordMutation(actor, {
      action: "G07_VENDOR_EMPANELMENT_DECIDED",
      subjectRef: `vendor_empanelments:${row.id}`,
      metadata: { status: row.status, approvedBy: actor.userId },
    });
    return { ...row };
  }

  getEmpanelment(scope: TenantScope, id: string): VendorEmpanelment | undefined {
    requireTenantScope(scope);
    return this.repo.find(scope, id);
  }

  private require(scope: TenantScope, id: string): VendorEmpanelment {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Empanelment not found");
    return row;
  }
}
