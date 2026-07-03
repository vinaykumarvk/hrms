import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-16F — G11 treasury/PDA registry, pensioner grievances, and audit objections at BRD depth
 * (docs/brd/v3/G11-retirement-and-pension.md FR-16 / FR-21 / FR-23):
 *
 * - E37 pen_disbursing_authorities: a PDA registry row carries pda_disbursement_model
 *   (M11_COMPUTES_FULL vs PDA_APPLIES_RELIEF); go-live is gated on sandbox_certified — an
 *   uncertified PDA cannot be activated (fail closed, FR-21).
 * - pen_grievances: intake computes sla_due_at from the grievance category; closing a grievance
 *   requires a resolution comment (VAL-COMMENT) — a close with no resolution is rejected.
 * - pen_audit_objections: an AG/internal-audit objection links the disputed computation via
 *   calc_trace_ref; its terminal outcome is ACCEPTED_CORRECTED (correction raised) or REJECTED.
 */

export type PdaDisbursementModel = "M11_COMPUTES_FULL" | "PDA_APPLIES_RELIEF";
export type PdaStatus = "REGISTERED" | "SANDBOX" | "ACTIVE" | "SUSPENDED";
export type GrievanceStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ObjectionStatus = "RAISED" | "UNDER_REVIEW" | "ACCEPTED_CORRECTED" | "REJECTED";

/** E37 pen_disbursing_authorities — treasury/bank PDA with its disbursement model + sandbox gate. */
export interface DisbursingAuthority {
  id: string;
  tenantId: string;
  entityId?: string;
  pdaCode: string;
  name: string;
  pdaDisbursementModel: PdaDisbursementModel;
  sandboxCertified: boolean;
  status: PdaStatus;
}

/** pen_grievances — pensioner grievance with an SLA clock and a mandatory resolution on close. */
export interface PensionGrievance {
  id: string;
  tenantId: string;
  entityId?: string;
  grievanceNo: string;
  pensionerId: string;
  category: string;
  description: string;
  slaDueAt: string;
  resolutionComment?: string;
  status: GrievanceStatus;
}

/** pen_audit_objections — AG/internal-audit objection linked to the disputed calc_trace_ref. */
export interface PensionAuditObjection {
  id: string;
  tenantId: string;
  entityId?: string;
  objectionNo: string;
  caseId: string;
  calcTraceRef: string;
  raisedBy: string;
  ground: string;
  responseNote?: string;
  status: ObjectionStatus;
}

/** SLA days by grievance category (BRD FR-16 default ladder). */
const GRIEVANCE_SLA_DAYS: Array<{ label: string; pattern: RegExp; days: number }> = [
  { label: "NON_PAYMENT", pattern: /non.?payment|arrear|not.?credited/i, days: 7 },
  { label: "REVISION", pattern: /revision|da.?relief|recompute/i, days: 15 },
  { label: "GENERAL", pattern: /.*/, days: 30 },
];

export interface PensionTreasuryRepository {
  savePda(row: DisbursingAuthority): void;
  findPda(scope: TenantScope, id: string): DisbursingAuthority | undefined;
  saveGrievance(row: PensionGrievance): void;
  findGrievance(scope: TenantScope, id: string): PensionGrievance | undefined;
  saveObjection(row: PensionAuditObjection): void;
  findObjection(scope: TenantScope, id: string): PensionAuditObjection | undefined;
}

export class InMemoryPensionTreasuryRepository implements PensionTreasuryRepository {
  private readonly pdas: DisbursingAuthority[] = [];
  private readonly grievances: PensionGrievance[] = [];
  private readonly objections: PensionAuditObjection[] = [];

  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  savePda(row: DisbursingAuthority): void {
    const i = this.pdas.findIndex((p) => p.id === row.id);
    if (i >= 0) this.pdas[i] = { ...row }; else this.pdas.push({ ...row });
  }
  findPda(scope: TenantScope, id: string): DisbursingAuthority | undefined {
    const row = this.pdas.find((p) => p.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  saveGrievance(row: PensionGrievance): void {
    const i = this.grievances.findIndex((g) => g.id === row.id);
    if (i >= 0) this.grievances[i] = { ...row }; else this.grievances.push({ ...row });
  }
  findGrievance(scope: TenantScope, id: string): PensionGrievance | undefined {
    const row = this.grievances.find((g) => g.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  saveObjection(row: PensionAuditObjection): void {
    const i = this.objections.findIndex((o) => o.id === row.id);
    if (i >= 0) this.objections[i] = { ...row }; else this.objections.push({ ...row });
  }
  findObjection(scope: TenantScope, id: string): PensionAuditObjection | undefined {
    const row = this.objections.find((o) => o.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

/** Adds whole days to an ISO date (yyyy-mm-dd) via UTC epoch arithmetic — integer, deterministic. */
function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map((p) => Number.parseInt(p, 10));
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const base = Date.UTC(y, m - 1, d);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export class PensionTreasuryService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: PensionTreasuryRepository = new InMemoryPensionTreasuryRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  registerPda(
    actor: ActorContext,
    input: { pdaCode: string; name: string; pdaDisbursementModel: PdaDisbursementModel }
  ): DisbursingAuthority {
    this.authorization.check(actor, "g11.pda.register", actor);
    const pda: DisbursingAuthority = {
      id: this.next("pen-pda"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pdaCode: input.pdaCode,
      name: input.name,
      pdaDisbursementModel: input.pdaDisbursementModel,
      sandboxCertified: false,
      status: "REGISTERED",
    };
    this.repo.savePda(pda);
    this.audit.recordMutation(actor, {
      action: "G11_PDA_REGISTERED",
      subjectRef: `pen_disbursing_authorities:${pda.id}`,
      metadata: { pda_disbursement_model: pda.pdaDisbursementModel },
    });
    return { ...pda };
  }

  /** Sandbox certification is the prerequisite for go-live. */
  certifyPdaSandbox(actor: ActorContext, pdaId: string): DisbursingAuthority {
    this.authorization.check(actor, "g11.pda.certify", actor);
    const pda = this.requirePda(actor, pdaId);
    pda.sandboxCertified = true;
    pda.status = "SANDBOX";
    this.repo.savePda(pda);
    this.audit.recordMutation(actor, {
      action: "G11_PDA_SANDBOX_CERTIFIED",
      subjectRef: `pen_disbursing_authorities:${pda.id}`,
      metadata: { sandbox_certified: true },
    });
    return { ...pda };
  }

  /** Go-live gate: an uncertified PDA cannot be activated (fail closed). */
  activatePda(actor: ActorContext, pdaId: string): DisbursingAuthority {
    this.authorization.check(actor, "g11.pda.activate", actor);
    const pda = this.requirePda(actor, pdaId);
    if (!pda.sandboxCertified) {
      throw new FoundationError("PRECONDITION_FAILED", "PDA go-live requires sandbox_certified", {
        details: { pdaId: pda.id, sandboxCertified: pda.sandboxCertified },
      });
    }
    pda.status = "ACTIVE";
    this.repo.savePda(pda);
    this.audit.recordMutation(actor, {
      action: "G11_PDA_ACTIVATED",
      subjectRef: `pen_disbursing_authorities:${pda.id}`,
    });
    return { ...pda };
  }

  raiseGrievance(
    actor: ActorContext,
    input: { pensionerId: string; category: string; description: string; receivedOn: string }
  ): PensionGrievance {
    this.authorization.check(actor, "g11.grievance.raise", actor);
    const matched = GRIEVANCE_SLA_DAYS.find((row) => row.pattern.test(input.category));
    const slaDays = matched ? matched.days : 30;
    const grievance: PensionGrievance = {
      id: this.next("pen-grievance"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      grievanceNo: `PEN-GRV/${this.counter}`,
      pensionerId: input.pensionerId,
      category: input.category,
      description: input.description,
      slaDueAt: addDaysIso(input.receivedOn, slaDays),
      status: "OPEN",
    };
    this.repo.saveGrievance(grievance);
    this.audit.recordMutation(actor, {
      action: "G11_GRIEVANCE_RAISED",
      subjectRef: `pen_grievances:${grievance.id}`,
      metadata: { sla_due_at: grievance.slaDueAt, category: grievance.category },
    });
    return { ...grievance };
  }

  /**
   * Close a grievance. VAL-COMMENT: a resolution comment is mandatory — closing with an empty
   * resolution is rejected fail-closed.
   */
  closeGrievance(actor: ActorContext, grievanceId: string, input: { resolutionComment: string }): PensionGrievance {
    this.authorization.check(actor, "g11.grievance.close", actor);
    const grievance = this.requireGrievance(actor, grievanceId);
    if (grievance.status === "CLOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Grievance already closed");
    }
    if (!input.resolutionComment || !input.resolutionComment.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A grievance close requires a resolution comment (VAL-COMMENT)", {
        field: "resolutionComment",
        details: { validation: "VAL-COMMENT" },
      });
    }
    grievance.resolutionComment = input.resolutionComment;
    grievance.status = "CLOSED";
    this.repo.saveGrievance(grievance);
    this.audit.recordMutation(actor, {
      action: "G11_GRIEVANCE_CLOSED",
      subjectRef: `pen_grievances:${grievance.id}`,
    });
    return { ...grievance };
  }

  raiseAuditObjection(
    actor: ActorContext,
    input: { caseId: string; calcTraceRef: string; ground: string }
  ): PensionAuditObjection {
    this.authorization.check(actor, "g11.objection.raise", actor);
    const objection: PensionAuditObjection = {
      id: this.next("pen-objection"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      objectionNo: `PEN-OBJ/${this.counter}`,
      caseId: input.caseId,
      calcTraceRef: input.calcTraceRef,
      raisedBy: actor.userId,
      ground: input.ground,
      status: "RAISED",
    };
    this.repo.saveObjection(objection);
    this.audit.recordMutation(actor, {
      action: "G11_AUDIT_OBJECTION_RAISED",
      subjectRef: `pen_audit_objections:${objection.id}`,
      metadata: { calc_trace_ref: objection.calcTraceRef },
    });
    return { ...objection };
  }

  /** Resolve an objection: ACCEPTED_CORRECTED (a correction is raised) or REJECTED. */
  resolveAuditObjection(
    actor: ActorContext,
    objectionId: string,
    input: { outcome: "ACCEPTED_CORRECTED" | "REJECTED"; responseNote: string }
  ): PensionAuditObjection {
    this.authorization.check(actor, "g11.objection.resolve", actor);
    const objection = this.requireObjection(actor, objectionId);
    if (objection.status === "ACCEPTED_CORRECTED" || objection.status === "REJECTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Objection already resolved");
    }
    if (!input.responseNote || !input.responseNote.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "An objection resolution requires a response note", { field: "responseNote" });
    }
    objection.status = input.outcome;
    objection.responseNote = input.responseNote;
    this.repo.saveObjection(objection);
    this.audit.recordMutation(actor, {
      action: "G11_AUDIT_OBJECTION_RESOLVED",
      subjectRef: `pen_audit_objections:${objection.id}`,
      metadata: { outcome: objection.status, calc_trace_ref: objection.calcTraceRef },
    });
    return { ...objection };
  }

  getPda(scope: TenantScope, id: string): DisbursingAuthority {
    requireTenantScope(scope);
    return this.requirePda(scope, id);
  }

  private requirePda(scope: TenantScope, id: string): DisbursingAuthority {
    const pda = this.repo.findPda(scope, id);
    if (!pda) throw new FoundationError("NOT_FOUND", "PDA not found");
    return pda;
  }
  private requireGrievance(scope: TenantScope, id: string): PensionGrievance {
    const g = this.repo.findGrievance(scope, id);
    if (!g) throw new FoundationError("NOT_FOUND", "Grievance not found");
    return g;
  }
  private requireObjection(scope: TenantScope, id: string): PensionAuditObjection {
    const o = this.repo.findObjection(scope, id);
    if (!o) throw new FoundationError("NOT_FOUND", "Audit objection not found");
    return o;
  }
}
