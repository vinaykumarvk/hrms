import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-19C — G06 career-path and succession planning at BRD depth
 * (docs/brd/v3/G06-promotion-posting-progression.md FR-014):
 *
 * - career_paths define an ordered ladder of career_path_stages (stage_no contiguous from 1).
 * - succession_plans identify a critical position and rank succession_candidates; a candidate may
 *   appear on a plan only once (duplicate candidate rejected).
 *
 * Advisory only — this feeds planning views, never sets seniority or effects a promotion.
 */

/** career_path_stages — one ordered rung of a career path. */
export interface CareerPathStage {
  stageNo: number;
  gradeDesignationId: string;
  typicalYears: number;
}

/** career_paths — an ordered career ladder. */
export interface CareerPath {
  id: string;
  tenantId: string;
  entityId?: string;
  pathCode: string;
  name: string;
  stages: CareerPathStage[];
}

export type SuccessionReadiness = "READY_NOW" | "READY_1_2Y" | "READY_3Y_PLUS";

/** succession_candidates — a ranked candidate for a succession plan. */
export interface SuccessionCandidate {
  employeeId: string;
  rank: number;
  readiness: SuccessionReadiness;
}

/** succession_plans — a critical-position succession plan with ranked candidates. */
export interface SuccessionPlan {
  id: string;
  tenantId: string;
  entityId?: string;
  positionId: string;
  incumbentEmployeeId?: string;
  candidates: SuccessionCandidate[];
}

export interface CareerSuccessionRepository {
  savePath(row: CareerPath): void;
  findPath(scope: TenantScope, id: string): CareerPath | undefined;
  savePlan(row: SuccessionPlan): void;
  findPlan(scope: TenantScope, id: string): SuccessionPlan | undefined;
}

export class InMemoryCareerSuccessionRepository implements CareerSuccessionRepository {
  private readonly paths: CareerPath[] = [];
  private readonly plans: SuccessionPlan[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  savePath(row: CareerPath): void {
    const i = this.paths.findIndex((p) => p.id === row.id);
    const copy = { ...row, stages: row.stages.map((s) => ({ ...s })) };
    if (i >= 0) this.paths[i] = copy; else this.paths.push(copy);
  }
  findPath(scope: TenantScope, id: string): CareerPath | undefined {
    const row = this.paths.find((p) => p.id === id);
    return row && this.scoped(row, scope) ? { ...row, stages: row.stages.map((s) => ({ ...s })) } : undefined;
  }
  savePlan(row: SuccessionPlan): void {
    const i = this.plans.findIndex((p) => p.id === row.id);
    const copy = { ...row, candidates: row.candidates.map((c) => ({ ...c })) };
    if (i >= 0) this.plans[i] = copy; else this.plans.push(copy);
  }
  findPlan(scope: TenantScope, id: string): SuccessionPlan | undefined {
    const row = this.plans.find((p) => p.id === id);
    return row && this.scoped(row, scope) ? { ...row, candidates: row.candidates.map((c) => ({ ...c })) } : undefined;
  }
}

export class CareerSuccessionService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: CareerSuccessionRepository = new InMemoryCareerSuccessionRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Define a career path; stage_no must be contiguous from 1. */
  defineCareerPath(
    actor: ActorContext,
    input: { pathCode: string; name: string; stages: CareerPathStage[] }
  ): CareerPath {
    this.authorization.check(actor, "g06.careerpath.define", actor);
    if (input.stages.length < 1) {
      throw new FoundationError("VALIDATION_FAILED", "A career path requires at least one stage", { field: "stages" });
    }
    const sorted = [...input.stages].sort((a, b) => a.stageNo - b.stageNo);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.stageNo !== i + 1) {
        throw new FoundationError("VALIDATION_FAILED", "career_path_stages must be contiguous from 1", {
          details: { expected: i + 1, got: sorted[i]!.stageNo },
        });
      }
    }
    const path: CareerPath = {
      id: this.next("g06-career-path"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pathCode: input.pathCode,
      name: input.name,
      stages: sorted,
    };
    this.repo.savePath(path);
    this.audit.recordMutation(actor, {
      action: "G06_CAREER_PATH_DEFINED",
      subjectRef: `career_paths:${path.id}`,
      metadata: { stages: path.stages.length },
    });
    return this.repo.findPath(actor, path.id)!;
  }

  createSuccessionPlan(actor: ActorContext, input: { positionId: string; incumbentEmployeeId?: string }): SuccessionPlan {
    this.authorization.check(actor, "g06.succession.plan", actor);
    const plan: SuccessionPlan = {
      id: this.next("g06-succession-plan"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      positionId: input.positionId,
      incumbentEmployeeId: input.incumbentEmployeeId,
      candidates: [],
    };
    this.repo.savePlan(plan);
    return this.repo.findPlan(actor, plan.id)!;
  }

  /** Add a ranked succession candidate; a duplicate candidate on the plan is rejected. */
  addSuccessionCandidate(
    actor: ActorContext,
    planId: string,
    input: { employeeId: string; rank: number; readiness: SuccessionReadiness }
  ): SuccessionPlan {
    this.authorization.check(actor, "g06.succession.candidate", actor);
    const plan = this.repo.findPlan(actor, planId);
    if (!plan) throw new FoundationError("NOT_FOUND", "Succession plan not found");
    if (plan.candidates.some((c) => c.employeeId === input.employeeId)) {
      throw new FoundationError("PRECONDITION_FAILED", "Candidate is already on this succession plan", {
        details: { planId, employeeId: input.employeeId },
      });
    }
    plan.candidates.push({ employeeId: input.employeeId, rank: input.rank, readiness: input.readiness });
    plan.candidates.sort((a, b) => a.rank - b.rank);
    this.repo.savePlan(plan);
    this.audit.recordMutation(actor, {
      action: "G06_SUCCESSION_CANDIDATE_ADDED",
      subjectRef: `succession_plans:${plan.id}`,
      metadata: { employeeId: input.employeeId, rank: input.rank },
    });
    return this.repo.findPlan(actor, planId)!;
  }

  getCareerPath(scope: TenantScope, id: string): CareerPath | undefined {
    requireTenantScope(scope);
    return this.repo.findPath(scope, id);
  }
  getSuccessionPlan(scope: TenantScope, id: string): SuccessionPlan | undefined {
    requireTenantScope(scope);
    return this.repo.findPlan(scope, id);
  }
}
