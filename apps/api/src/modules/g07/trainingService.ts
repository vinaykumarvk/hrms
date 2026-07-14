import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { AuthorityResolutionService } from "../../platform/authority-resolution/authorityResolutionService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  CampaignTarget,
  CompetencyMaster,
  CompetencyModel,
  CredentialVerificationEntry,
  CredentialVerificationMethod,
  EmployeeSkill,
  ExternalCredential,
  GapContract,
  InMemoryTrainingDepthRepository,
  SkillCategory,
  SkillGapAnalysis,
  SkillGapItem,
  SkillMaster,
  TrainingCampaign,
  TrainingCostEntry,
  TrainingDepthRepository,
  TrainingSponsorship,
} from "./trainingDepthRepository";

/** Adds whole months to an ISO date (yyyy-mm-dd) — bond_end_date = completion + service_bond_months.
 * Module-local (the exported copy lives in g06/promotionDepthRepository). */
function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    throw new FoundationError("VALIDATION_FAILED", "Date must be yyyy-mm-dd", { field: "date", details: { isoDate } });
  }
  const base = new Date(Date.UTC(year, month - 1 + months, day));
  return base.toISOString().slice(0, 10);
}

/**
 * Whole unserved bond months between breach date and bond_end_date (partial month counts as
 * unserved — the liquidated claim rounds toward the exchequer, FR-G07-020 AC.4).
 */
export function unservedBondMonths(breachDateIso: string, bondEndDateIso: string): number {
  if (bondEndDateIso <= breachDateIso) {
    return 0;
  }
  const [fromYear, fromMonth, fromDay] = breachDateIso.split("-").map((part) => Number.parseInt(part, 10));
  const [toYear, toMonth, toDay] = bondEndDateIso.split("-").map((part) => Number.parseInt(part, 10));
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay) {
    throw new FoundationError("VALIDATION_FAILED", "Dates must be yyyy-mm-dd", { field: "date" });
  }
  let monthsRemaining = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay > fromDay) {
    monthsRemaining += 1;
  }
  return Math.max(monthsRemaining, 0);
}

export type TrainingSessionStatus = "DRAFT" | "OPEN" | "FULL" | "COMPLETED" | "CANCELLED";
export type TrainingNominationStatus = "PENDING_L1" | "APPROVED" | "WAITLISTED" | "REJECTED" | "COMPLETED" | "NO_SHOW";
export type CertificationStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface TrainingSession {
  id: string;
  tenantId: string;
  entityId?: string;
  programCode: string;
  title: string;
  capacity: number;
  enrolled: number;
  status: TrainingSessionStatus;
}

export interface TrainingNomination {
  id: string;
  tenantId: string;
  entityId?: string;
  nominationNo: string;
  sessionId: string;
  employeeId: string;
  status: TrainingNominationStatus;
  workflowInstanceId: string;
  waitlistPosition?: number;
  certificationId?: string;
}

export interface Certification {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  sessionId: string;
  certificateNo: string;
  status: CertificationStatus;
  significantForSr: boolean;
  documentId: string;
  srEventId?: string;
  /** FR-G07-012: validity end (yyyy-mm-dd); undefined = lifetime credential, never lapses. */
  validUntil?: string;
  isMandatory: boolean;
  /**
   * FR-G07-012 AC.7: set ONLY by JOB-G07-CERTEXPIRY when a mandatory cert expires un-renewed
   * (derived from valid_until evidence); consumed by G06. Never manually settable.
   */
  lapsedMandatory: boolean;
  /** Renewal linkage: the successor cert that keeps a mandatory credential current. */
  renewedByCertificationId?: string;
  renewalOfCertificationId?: string;
}

/** FR-G07-009 AC1 override roles: "L&D/HR can nominate anyone in scope" — beyond self-nomination
 *  and the resolved reporting-chain manager, which are checked dynamically per employeeId below.
 *  Post-hr_admin-goal SoD correction: hr_admin deliberately excluded — training stays with the
 *  dedicated L&D chain (ld_officer/ld_manager), per the hr_admin capability audit's explicit
 *  "G07 owned by ld_officer/ld_manager" boundary. */
const NOMINATION_OVERRIDE_ROLES = new Set(["ld_manager", "ld_officer", "system"]);

/** FR-G07-010 "Authorization: Trainer own session; L&D any" — completion/attendance outcomes are
 *  never self-attested by the nominee; only a trainer/L&D/admin role (or an explicit
 *  override) may record pass/fail. Post-hr_admin-goal SoD correction: hr_admin excluded, same
 *  reasoning as NOMINATION_OVERRIDE_ROLES above. */
const COMPLETION_OVERRIDE_ROLES = new Set(["trainer", "ld_manager", "ld_officer", "system"]);

export class TrainingService {
  private readonly sessions: TrainingSession[] = [];
  private readonly nominations: TrainingNomination[] = [];
  private readonly certifications: Certification[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    private readonly authorityResolution: AuthorityResolutionService,
    // PH-08D: taxonomy/model/inventory/gap/contract/campaign depth behind the repository seam.
    private readonly depth: TrainingDepthRepository = new InMemoryTrainingDepthRepository()
  ) {}

  createSession(actor: ActorContext, input: { programCode: string; title: string; capacity: number }): TrainingSession {
    this.authorization.check(actor, "g07.training.session.write", actor);
    if (input.capacity < 1) {
      throw new FoundationError("VALIDATION_FAILED", "Training capacity must be positive", { field: "capacity" });
    }
    const session: TrainingSession = {
      id: nextId("training-session", this.sessions.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      programCode: input.programCode,
      title: input.title,
      capacity: input.capacity,
      enrolled: 0,
      status: "OPEN",
    };
    this.sessions.push(session);
    this.audit.recordMutation(actor, { action: "G07_SESSION_OPEN", subjectRef: `g07_training_sessions:${session.id}` });
    return { ...session };
  }

  /** Browse available training sessions/programs (no per-row scoping — a catalog, not PII). */
  listSessions(scope: TenantScope): TrainingSession[] {
    requireTenantScope(scope);
    return this.sessions.filter((session) => this.inScope(session, scope)).map((session) => ({ ...session }));
  }

  /** FR-G07-009/010 self-service: an employee's own nominations (and their completion/certification
   *  status), self-or-override scoped the same way as nominate()/completeNomination(). */
  listMyNominations(actor: ActorContext, employeeId: string): TrainingNomination[] {
    requireTenantScope(actor);
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => NOMINATION_OVERRIDE_ROLES.has(role));
    if (!isOverride && actor.userId !== employeeId) {
      const resolution = this.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: employeeId }, "2026-07-02");
      if (!resolution.selectedAssignees.some((assignee) => assignee.employeeId === actor.userId)) {
        throw new FoundationError("FORBIDDEN", "You may only view your own training nominations (or your direct reports')", { field: "employeeId" });
      }
    }
    return this.nominations.filter((nomination) => this.inScope(nomination, actor) && nomination.employeeId === employeeId).map((nomination) => ({ ...nomination }));
  }

  nominate(actor: ActorContext, input: { sessionId: string; employeeId: string }): TrainingNomination {
    this.authorization.check(actor, "g07.nomination.submit", actor);
    const session = this.requireSession(actor, input.sessionId);
    if (session.status !== "OPEN" && session.status !== "FULL") {
      throw new FoundationError("PRECONDITION_FAILED", "Training session is not open for nominations");
    }
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    this.assertCanNominate(actor, input.employeeId);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G07-NOMINATION",
      subjectRef: `g07_training_nominations:${input.employeeId}:${session.id}`,
      stage: "PENDING_L1",
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
      asOf: "2026-07-02",
    });
    const nomination: TrainingNomination = {
      id: nextId("training-nomination", this.nominations.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      nominationNo: `TN/${String(this.nominations.length + 1).padStart(5, "0")}`,
      sessionId: session.id,
      employeeId: input.employeeId,
      status: "PENDING_L1",
      workflowInstanceId: started.instance.id,
    };
    this.nominations.push(nomination);
    this.audit.recordMutation(actor, { action: "G07_NOMINATION_SUBMITTED", subjectRef: `g07_training_nominations:${nomination.id}`, metadata: { workflowCode: "WF-G07-NOMINATION" } });
    return { ...nomination };
  }

  approveNomination(actor: ActorContext, nominationId: string): TrainingNomination {
    this.authorization.check(actor, "g07.nomination.approve", actor);
    const nomination = this.requireNomination(actor, nominationId);
    const session = this.requireSession(actor, nomination.sessionId);
    if (nomination.status !== "PENDING_L1") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending nominations can be approved");
    }
    this.workflow.actOnInstance(actor, { instanceId: nomination.workflowInstanceId, action: "APPROVE" });
    if (session.enrolled >= session.capacity) {
      nomination.status = "WAITLISTED";
      nomination.waitlistPosition = this.nominations.filter((item) => item.sessionId === session.id && item.status === "WAITLISTED").length + 1;
      session.status = "FULL";
      this.audit.recordMutation(actor, { action: "G07_NOMINATION_WAITLISTED", subjectRef: `g07_training_nominations:${nomination.id}` });
      return { ...nomination };
    }
    session.enrolled += 1;
    session.status = session.enrolled >= session.capacity ? "FULL" : "OPEN";
    nomination.status = "APPROVED";
    this.audit.recordMutation(actor, { action: "G07_NOMINATION_APPROVED", subjectRef: `g07_training_nominations:${nomination.id}` });
    return { ...nomination };
  }

  completeNomination(
    actor: ActorContext,
    nominationId: string,
    input: {
      passed: boolean;
      significantForSr: boolean;
      completionDate: string;
      idempotencyKey: string;
      /** FR-G07-012: validity end for renewable credentials (yyyy-mm-dd); omitted = lifetime. */
      validUntil?: string;
      isMandatory?: boolean;
      /** Renewal chain: the prior cert this completion renews (keeps lapsed_mandatory false). */
      renewalOfCertificationId?: string;
    }
  ): { nomination: TrainingNomination; certification?: Certification } {
    this.authorization.check(actor, "g07.nomination.complete", actor);
    this.assertCanRecordCompletion(actor);
    const nomination = this.requireNomination(actor, nominationId);
    const session = this.requireSession(actor, nomination.sessionId);
    if (nomination.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved nominations can be completed");
    }
    if (!input.passed) {
      nomination.status = "NO_SHOW";
      this.audit.recordMutation(actor, { action: "G07_NOMINATION_NO_SHOW", subjectRef: `g07_training_nominations:${nomination.id}` });
      return { nomination: { ...nomination } };
    }
    const document = this.documentVault.createDocument(actor, {
      title: `Training Certificate ${session.programCode}`,
      ownerEmployeeId: nomination.employeeId,
      classification: "INTERNAL",
      contentHash: pseudoHash64(stableStringify({ nominationId, programCode: session.programCode, completionDate: input.completionDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G07",
      entityName: "training_certifications",
      entityRefId: nomination.id,
      linkRole: "CERTIFICATE",
    });
    if (input.validUntil && input.validUntil <= input.completionDate) {
      throw new FoundationError("VALIDATION_FAILED", "Certification valid_until must be after the issue date", { field: "validUntil" });
    }
    const certification: Certification = {
      id: nextId("certification", this.certifications.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: nomination.employeeId,
      sessionId: session.id,
      certificateNo: `CERT/${String(this.certifications.length + 1).padStart(5, "0")}`,
      status: "ACTIVE",
      significantForSr: input.significantForSr,
      documentId: attached.id,
      validUntil: input.validUntil,
      isMandatory: Boolean(input.isMandatory),
      lapsedMandatory: false,
      renewalOfCertificationId: input.renewalOfCertificationId,
    };
    if (input.renewalOfCertificationId) {
      const renewed = this.certifications.find((item) => item.id === input.renewalOfCertificationId && this.inScope(item, actor));
      if (!renewed) {
        throw new FoundationError("NOT_FOUND", "Certification to renew not found");
      }
      renewed.renewedByCertificationId = certification.id;
      // A completed renewal keeps the mandatory credential current — the lapse flag clears with evidence.
      renewed.lapsedMandatory = false;
      this.audit.recordMutation(actor, { action: "G07_CERT_RENEWED", subjectRef: `g07_certifications:${renewed.id}`, metadata: { renewedByCertificationId: certification.id } });
    }
    if (input.significantForSr) {
      const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
        sourceModule: "G07",
        sourceReferenceId: `g07_certifications:${certification.id}:POSTED`,
        sourceEventVersion: 1,
        employeeId: certification.employeeId,
        eventTypeCode: "TRAINING_CERTIFICATION_POSTED",
        eventDate: input.completionDate,
        factKey: `G07:${certification.id}:TRAINING_CERTIFICATION_POSTED`,
        payload: { programCode: session.programCode, certificateNo: certification.certificateNo },
        documentIds: [attached.id],
      });
      certification.srEventId = sr.event.id;
    }
    this.certifications.push(certification);
    nomination.status = "COMPLETED";
    nomination.certificationId = certification.id;
    this.audit.recordMutation(actor, {
      action: "G07_TRAINING_COMPLETED",
      subjectRef: `g07_training_nominations:${nomination.id}`,
      metadata: { marker: "TRAINING_CERTIFICATION_POSTED", significantForSr: input.significantForSr, srEventId: certification.srEventId },
    });
    return { nomination: { ...nomination }, certification: { ...certification } };
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (1) Skills/competencies taxonomy + role competency models + employee skill inventory
  // (docs/brd/v3/G07-training-skill-development.md §5.2.1/2/4/5/6/7)
  // -------------------------------------------------------------------------------------

  defineSkillCategory(actor: ActorContext, input: { code: string; name: string; parentCategoryId?: string }): SkillCategory {
    this.authorization.check(actor, "g07.taxonomy.write", actor);
    const category: SkillCategory = {
      id: nextId("skill-category", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      code: input.code,
      name: input.name,
      parentCategoryId: input.parentCategoryId,
      status: "PUBLISHED",
    };
    this.depth.saveSkillCategory(category);
    this.audit.recordMutation(actor, { action: "G07_SKILL_CATEGORY_DEFINED", subjectRef: `g07_skill_categories:${category.id}` });
    return category;
  }

  defineSkill(
    actor: ActorContext,
    input: { skillCategoryId: string; code: string; name: string; isComplianceSkill?: boolean; defaultValidityMonths?: number }
  ): SkillMaster {
    this.authorization.check(actor, "g07.taxonomy.write", actor);
    if (!this.depth.findSkillCategory(actor, input.skillCategoryId)) {
      throw new FoundationError("NOT_FOUND", "Skill category not found");
    }
    if (input.isComplianceSkill && !input.defaultValidityMonths) {
      throw new FoundationError("VALIDATION_FAILED", "Compliance skills require default_validity_months", { field: "defaultValidityMonths" });
    }
    const skill: SkillMaster = {
      id: nextId("skill", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      skillCategoryId: input.skillCategoryId,
      code: input.code,
      name: input.name,
      isComplianceSkill: Boolean(input.isComplianceSkill),
      defaultValidityMonths: input.defaultValidityMonths,
      status: "PUBLISHED",
    };
    this.depth.saveSkill(skill);
    this.audit.recordMutation(actor, { action: "G07_SKILL_DEFINED", subjectRef: `g07_skills:${skill.id}` });
    return skill;
  }

  defineCompetency(
    actor: ActorContext,
    input: { code: string; name: string; competencyType: CompetencyMaster["competencyType"]; linkedSkillIds?: string[] }
  ): CompetencyMaster {
    this.authorization.check(actor, "g07.taxonomy.write", actor);
    for (const skillId of input.linkedSkillIds ?? []) {
      if (!this.depth.findSkill(actor, skillId)) {
        throw new FoundationError("NOT_FOUND", "Linked skill not found", { details: { skillId } });
      }
    }
    const competency: CompetencyMaster = {
      id: nextId("competency", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      code: input.code,
      name: input.name,
      competencyType: input.competencyType,
      linkedSkillIds: [...(input.linkedSkillIds ?? [])],
      status: "PUBLISHED",
    };
    this.depth.saveCompetency(competency);
    this.audit.recordMutation(actor, { action: "G07_COMPETENCY_DEFINED", subjectRef: `g07_competencies:${competency.id}` });
    return competency;
  }

  /** §5.2.5 role competency model: target proficiency per competency for a role/designation scope. */
  defineCompetencyModel(
    actor: ActorContext,
    input: {
      code: string;
      name: string;
      scopeType: CompetencyModel["scopeType"];
      scopeRef?: string;
      ownerEmployeeId: string;
      reviewDueDate: string;
      items: Array<{ competencyId: string; targetProficiencyLevel: number; isCritical?: boolean }>;
    }
  ): CompetencyModel {
    this.authorization.check(actor, "g07.competency_model.write", actor);
    if (input.scopeType !== "GENERIC" && !input.scopeRef) {
      throw new FoundationError("VALIDATION_FAILED", "VAL-G07-SCOPEKEY: non-generic model scope requires a scope reference", { field: "scopeRef" });
    }
    if (input.items.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "A competency model requires at least one competency item", { field: "items" });
    }
    const items = input.items.map((item, index) => {
      if (!this.depth.findCompetency(actor, item.competencyId)) {
        throw new FoundationError("NOT_FOUND", "Model competency not found", { details: { competencyId: item.competencyId } });
      }
      if (item.targetProficiencyLevel < 1) {
        throw new FoundationError("VALIDATION_FAILED", "Target proficiency level must be >= 1", { field: "targetProficiencyLevel" });
      }
      return {
        competencyId: item.competencyId,
        targetProficiencyLevel: item.targetProficiencyLevel,
        isCritical: Boolean(item.isCritical),
        sequenceNo: index + 1,
      };
    });
    const model: CompetencyModel = {
      id: nextId("competency-model", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      code: input.code,
      name: input.name,
      scopeType: input.scopeType,
      scopeRef: input.scopeRef,
      ownerEmployeeId: input.ownerEmployeeId,
      version: 1,
      reviewDueDate: input.reviewDueDate,
      items,
      status: "PUBLISHED",
    };
    this.depth.saveCompetencyModel(model);
    this.audit.recordMutation(actor, { action: "G07_COMPETENCY_MODEL_DEFINED", subjectRef: `g07_competency_models:${model.id}` });
    return model;
  }

  /** §5.2.7 employee skill inventory: one current row per (employee, skill), upserted. */
  recordEmployeeSkill(
    actor: ActorContext,
    input: { employeeId: string; skillId: string; currentProficiencyLevel: number; source?: EmployeeSkill["source"]; validatedBy?: string }
  ): EmployeeSkill {
    this.authorization.check(actor, "g07.employee_skill.write", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (!this.depth.findSkill(actor, input.skillId)) {
      throw new FoundationError("NOT_FOUND", "Skill not found");
    }
    if (input.currentProficiencyLevel < 0) {
      throw new FoundationError("VALIDATION_FAILED", "Proficiency level must be >= 0", { field: "currentProficiencyLevel" });
    }
    const existing = this.depth.findEmployeeSkill(actor, input.employeeId, input.skillId);
    const row: EmployeeSkill = {
      id: existing?.id ?? nextId("employee-skill", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      skillId: input.skillId,
      currentProficiencyLevel: input.currentProficiencyLevel,
      source: input.source ?? "SELF",
      validatedBy: input.validatedBy,
      validatedAt: input.validatedBy ? "2026-07-02" : undefined,
      freshnessStatus: "FRESH",
      status: input.validatedBy ? "VALIDATED" : "DECLARED",
    };
    this.depth.saveEmployeeSkill(row);
    this.audit.recordMutation(actor, { action: "G07_EMPLOYEE_SKILL_RECORDED", subjectRef: `g07_employee_skills:${row.id}` });
    return row;
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (2) Gap analysis + the versioned read-only Gap Contract (FR-G07-024, §10.6)
  // -------------------------------------------------------------------------------------

  /**
   * §5.2.9/10: diff the model targets against fresh+VALIDATED employee skills, persist
   * skill_gap_analyses + skill_gap_items, then project + publish the versioned Gap Contract
   * (FR-G07-024) that G06/G08 consume — superseding the prior CURRENT contract.
   */
  runSkillGapAnalysis(actor: ActorContext, input: { employeeId: string; competencyModelId: string; generatedOn: string }): {
    analysis: SkillGapAnalysis;
    items: SkillGapItem[];
    gapContract: GapContract;
  } {
    this.authorization.check(actor, "g07.gap_analysis.run", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const model = this.depth.findCompetencyModel(actor, input.competencyModelId);
    if (!model) {
      throw new FoundationError("NOT_FOUND", "Competency model not found");
    }
    const inventory = this.depth.listEmployeeSkills(actor, input.employeeId);
    const analysis: SkillGapAnalysis = {
      id: nextId("skill-gap-analysis", this.depth.countGapAnalyses()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      competencyModelId: model.id,
      scoringMode: "BINARY",
      modelStaleFlag: model.reviewDueDate < input.generatedOn,
      criticalGapCount: 0,
      generatedOn: input.generatedOn,
      status: "FINALIZED",
    };
    const items: SkillGapItem[] = model.items.map((modelItem, index) => {
      // Only fresh, VALIDATED skills count toward closing a gap (§7 FR-G07-008).
      const current = this.currentCompetencyLevel(actor, modelItem.competencyId, inventory);
      const gapSize = Math.max(0, modelItem.targetProficiencyLevel - (current.level ?? 0));
      return {
        id: `${analysis.id}-item-${index + 1}`,
        tenantId: actor.tenantId,
        skillGapAnalysisId: analysis.id,
        competencyId: modelItem.competencyId,
        targetProficiencyLevel: modelItem.targetProficiencyLevel,
        currentProficiencyLevel: current.level,
        gapSize,
        isCritical: modelItem.isCritical,
        discountedForStaleness: current.discountedForStaleness,
        source: "MODEL",
      };
    });
    analysis.criticalGapCount = items.filter((item) => item.isCritical && item.gapSize > 0).length;
    this.depth.saveGapAnalysis(analysis);
    for (const item of items) {
      this.depth.saveGapItem(item);
    }
    const gapContract = this.publishGapContract(actor, analysis, items);
    this.audit.recordMutation(actor, {
      action: "G07_GAP_ANALYSIS_FINALIZED",
      subjectRef: `g07_skill_gap_analyses:${analysis.id}`,
      metadata: { criticalGapCount: analysis.criticalGapCount, gapContractVersion: gapContract.contractVersion },
    });
    return { analysis, items, gapContract };
  }

  /**
   * FR-G07-024 read path for G06/G08: the CURRENT versioned Gap Contract. Returned frozen —
   * consumers read the contract, never G07 internals, and cannot mutate the projection.
   */
  getGapContract(scope: TenantScope, input: { employeeId: string; competencyModelId: string }): GapContract {
    requireTenantScope(scope);
    const contract = this.depth.findCurrentGapContract(scope, input.employeeId, input.competencyModelId);
    if (!contract) {
      throw new FoundationError("NOT_FOUND", "Gap Contract not published for employee/model");
    }
    contract.items.forEach((item) => Object.freeze(item));
    return Object.freeze(contract);
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (3) Certification validity/renewal — JOB-G07-CERTEXPIRY (FR-G07-012 AC.6-8)
  // -------------------------------------------------------------------------------------

  /**
   * JOB-G07-CERTEXPIRY as an invokable job function: expire every ACTIVE cert whose
   * valid_until has passed; a MANDATORY cert that expired un-renewed flips lapsed_mandatory=true
   * (consumed by G06). The flip is derived from valid_until evidence — never caller-settable.
   */
  runCertExpiryJob(actor: ActorContext, input: { asOf: string }): { expired: number; lapsedMandatory: number; certifications: Certification[] } {
    this.authorization.check(actor, "g07.jobs.cert_expiry.run", actor);
    const touched: Certification[] = [];
    for (const certification of this.certifications) {
      if (!this.inScope(certification, actor) || certification.status !== "ACTIVE") {
        continue;
      }
      if (!certification.validUntil || certification.validUntil >= input.asOf) {
        continue;
      }
      certification.status = "EXPIRED";
      certification.lapsedMandatory = certification.isMandatory && !certification.renewedByCertificationId;
      touched.push({ ...certification });
      this.audit.recordMutation(actor, {
        action: "G07_CERT_EXPIRED",
        subjectRef: `g07_certifications:${certification.id}`,
        metadata: { jobId: "JOB-G07-CERTEXPIRY", validUntil: certification.validUntil, lapsedMandatory: certification.lapsedMandatory },
      });
      if (certification.lapsedMandatory) {
        this.notifications.publish(actor, {
          recipientEmployeeId: certification.employeeId,
          messageId: "G07_MANDATORY_CERT_LAPSED",
          channel: "IN_APP",
          relatedRef: `g07_certifications:${certification.id}`,
          mergeFields: { certificateNo: certification.certificateNo },
        });
      }
    }
    return {
      expired: touched.length,
      lapsedMandatory: touched.filter((item) => item.lapsedMandatory).length,
      certifications: touched,
    };
  }

  getCertification(scope: TenantScope, certificationId: string): Certification {
    requireTenantScope(scope);
    const certification = this.certifications.find((item) => item.id === certificationId && this.inScope(item, scope));
    if (!certification) {
      throw new FoundationError("NOT_FOUND", "Certification not found");
    }
    return { ...certification };
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (4) Campaign engine basics — FR-G07-017 (training_campaigns + campaign_targets)
  // -------------------------------------------------------------------------------------

  createCampaign(
    actor: ActorContext,
    input: { code: string; name: string; programCode: string; windowStart: string; windowEnd: string; waveSize?: number }
  ): TrainingCampaign {
    this.authorization.check(actor, "g07.campaign.launch", actor);
    if (input.windowEnd < input.windowStart) {
      throw new FoundationError("VALIDATION_FAILED", "Campaign window end must be on/after start", { field: "windowEnd" });
    }
    if (input.waveSize !== undefined && input.waveSize < 1) {
      throw new FoundationError("VALIDATION_FAILED", "Campaign wave size must be positive", { field: "waveSize" });
    }
    const campaign: TrainingCampaign = {
      id: nextId("training-campaign", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      code: input.code,
      name: input.name,
      programCode: input.programCode,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      autoWave: input.waveSize !== undefined,
      waveSize: input.waveSize,
      status: "LAUNCHED",
    };
    this.depth.saveCampaign(campaign);
    this.audit.recordMutation(actor, { action: "G07_CAMPAIGN_LAUNCHED", subjectRef: `g07_training_campaigns:${campaign.id}` });
    return campaign;
  }

  /** JOB-G07-CAMPAIGN wave assignment: targets auto-wave into capacity-bounded groups of wave_size. */
  addCampaignTargets(actor: ActorContext, campaignId: string, input: { employeeIds: string[]; dueDate: string }): CampaignTarget[] {
    this.authorization.check(actor, "g07.campaign.target.write", actor);
    const campaign = this.depth.findCampaign(actor, campaignId);
    if (!campaign) {
      throw new FoundationError("NOT_FOUND", "Training campaign not found");
    }
    if (campaign.status !== "LAUNCHED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only launched campaigns accept targets");
    }
    const existing = this.depth.listCampaignTargets(actor, campaignId);
    const targeted = new Set(existing.map((item) => item.employeeId));
    const created: CampaignTarget[] = [];
    let ordinal = existing.length;
    for (const employeeId of input.employeeIds) {
      if (targeted.has(employeeId)) {
        continue; // idempotent: one target row per (campaign, employee)
      }
      if (!this.employeeMaster.getById(actor, employeeId)) {
        throw new FoundationError("NOT_FOUND", "Campaign target employee not found", { details: { employeeId } });
      }
      const waveNo = campaign.waveSize ? Math.floor(ordinal / campaign.waveSize) + 1 : 1;
      const target: CampaignTarget = {
        id: nextId("campaign-target", ordinal),
        tenantId: actor.tenantId,
        trainingCampaignId: campaign.id,
        employeeId,
        waveNo,
        dueDate: input.dueDate,
        targetStatus: "PENDING",
        escalationLevel: 0,
      };
      this.depth.saveCampaignTarget(target);
      this.audit.recordMutation(actor, { action: "G07_CAMPAIGN_WAVE_ASSIGNED", subjectRef: `g07_campaign_targets:${target.id}`, metadata: { waveNo } });
      created.push(target);
      targeted.add(employeeId);
      ordinal += 1;
    }
    return created;
  }

  /** Campaign escalation: every incomplete target past its due date gains one escalation_level. */
  escalateCampaignTargets(actor: ActorContext, campaignId: string, input: { asOf: string }): CampaignTarget[] {
    this.authorization.check(actor, "g07.campaign.escalate", actor);
    const campaign = this.depth.findCampaign(actor, campaignId);
    if (!campaign) {
      throw new FoundationError("NOT_FOUND", "Training campaign not found");
    }
    const escalated: CampaignTarget[] = [];
    for (const target of this.depth.listCampaignTargets(actor, campaignId)) {
      if (target.targetStatus === "COMPLETED" || target.targetStatus === "EXEMPTED" || target.dueDate >= input.asOf) {
        continue;
      }
      const updated: CampaignTarget = { ...target, targetStatus: "OVERDUE", escalationLevel: target.escalationLevel + 1 };
      this.depth.saveCampaignTarget(updated);
      this.audit.recordMutation(actor, {
        action: "G07_CAMPAIGN_TARGET_ESCALATED",
        subjectRef: `g07_campaign_targets:${updated.id}`,
        metadata: { escalationLevel: updated.escalationLevel },
      });
      escalated.push(updated);
    }
    return escalated;
  }

  listCampaignTargets(scope: TenantScope, campaignId: string): CampaignTarget[] {
    requireTenantScope(scope);
    return this.depth.listCampaignTargets(scope, campaignId);
  }

  // -------------------------------------------------------------------------------------
  // PH-16E (1) FR-G07-018 — external credential capture + append-only credential_verifications
  // ledger (SUBMITTED -> EVIDENCE_REVIEWED -> VERIFIED/REJECTED; verifier != submitter SoD;
  // VAL-G07-CREDREF dedup 409)
  // -------------------------------------------------------------------------------------

  /**
   * FR-G07-018 AC.1/AC.2: capture a certifications row with credential_source=EXTERNAL_PROFESSIONAL
   * and append the SUBMITTED step to the credential_verifications ledger in the same unit of work.
   * A duplicate external_reference_no for the same employee fails closed with VAL-G07-CREDREF (409).
   */
  captureExternalCredential(
    actor: ActorContext,
    input: {
      employeeId: string;
      title: string;
      issuingBody: string;
      externalReferenceNo: string;
      issueDate: string;
      validUntil?: string;
      evidenceDocumentId?: string;
      significantForSr?: boolean;
    }
  ): { credential: ExternalCredential; verification: CredentialVerificationEntry } {
    this.authorization.check(actor, "g07.credential.submit", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (!input.externalReferenceNo) {
      throw new FoundationError("VALIDATION_FAILED", "externalReferenceNo is required", { field: "externalReferenceNo" });
    }
    if (input.validUntil && input.validUntil <= input.issueDate) {
      throw new FoundationError("VALIDATION_FAILED", "Credential valid_until must be after the issue date", { field: "validUntil" });
    }
    // VAL-G07-CREDREF: external_reference_no unique per employee (FR-G07-018 edge case, 409).
    if (this.depth.findCredentialByExternalRef(actor, input.employeeId, input.externalReferenceNo)) {
      throw new FoundationError("VAL-G07-CREDREF", "Duplicate external credential reference for this employee", {
        field: "externalReferenceNo",
        details: { employeeId: input.employeeId, externalReferenceNo: input.externalReferenceNo },
      });
    }
    const credential: ExternalCredential = {
      id: nextId("external-credential", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      title: input.title,
      issuingBody: input.issuingBody,
      externalReferenceNo: input.externalReferenceNo,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      credentialSource: "EXTERNAL_PROFESSIONAL",
      verificationStatus: "PENDING",
      submittedBy: actor.userId,
      evidenceDocumentId: input.evidenceDocumentId,
      significantForSr: Boolean(input.significantForSr),
    };
    this.depth.saveExternalCredential(credential);
    const verification = this.depth.appendCredentialVerification({
      tenantId: actor.tenantId,
      certificationId: credential.id,
      verificationAction: "SUBMITTED",
      verificationMethod: "DOCUMENT_REVIEW",
      actorId: actor.userId,
      recordedAt: input.issueDate,
    });
    this.audit.recordMutation(actor, {
      action: "G07_EXTERNAL_CREDENTIAL_SUBMITTED",
      subjectRef: `g07_certifications:${credential.id}`,
      metadata: { ledger: "credential_verifications", verificationAction: "SUBMITTED" },
    });
    return { credential: { ...credential }, verification };
  }

  /**
   * FR-G07-018 AC.2 middle step: L&D evidence review APPENDS an EVIDENCE_REVIEWED row.
   * AC.5 SoD: the self-capture creator can never act as reviewer/verifier — the denial uses the
   * platform-registered FORBIDDEN code (the BRD registers no G07-specific code for this case).
   */
  reviewCredentialEvidence(actor: ActorContext, credentialId: string, input: { reviewedOn: string; comments?: string }): CredentialVerificationEntry {
    this.authorization.check(actor, "g07.credential.verify", actor);
    const credential = this.requireExternalCredential(actor, credentialId);
    this.requireCredentialSoD(credential, actor);
    if (credential.verificationStatus !== "PENDING") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PENDING credential can enter evidence review");
    }
    credential.verificationStatus = "EVIDENCE_REVIEWED";
    this.depth.saveExternalCredential(credential);
    const verification = this.depth.appendCredentialVerification({
      tenantId: actor.tenantId,
      certificationId: credential.id,
      verificationAction: "EVIDENCE_REVIEWED",
      verificationMethod: "DOCUMENT_REVIEW",
      actorId: actor.userId,
      comments: input.comments,
      recordedAt: input.reviewedOn,
    });
    this.audit.recordMutation(actor, {
      action: "G07_CREDENTIAL_EVIDENCE_REVIEWED",
      subjectRef: `g07_certifications:${credential.id}`,
      metadata: { ledger: "credential_verifications", verificationAction: "EVIDENCE_REVIEWED" },
    });
    return verification;
  }

  /**
   * FR-G07-018 AC.2 terminal step: VERIFIED (or REJECTED via rejectExternalCredential) is a new
   * APPENDED ledger row — never an update of a prior one. AC.4: a VERIFIED significant credential
   * posts to the G12 SR through the same ingest convention as internal certifications.
   */
  verifyExternalCredential(
    actor: ActorContext,
    credentialId: string,
    input: { verifiedOn: string; verificationMethod?: CredentialVerificationMethod; comments?: string; idempotencyKey: string }
  ): { credential: ExternalCredential; verification: CredentialVerificationEntry } {
    this.authorization.check(actor, "g07.credential.verify", actor);
    const credential = this.requireExternalCredential(actor, credentialId);
    this.requireCredentialSoD(credential, actor);
    if (credential.verificationStatus !== "EVIDENCE_REVIEWED") {
      throw new FoundationError("PRECONDITION_FAILED", "Credential must be EVIDENCE_REVIEWED before VERIFIED");
    }
    credential.verificationStatus = "VERIFIED";
    credential.verifiedBy = actor.userId;
    const verification = this.depth.appendCredentialVerification({
      tenantId: actor.tenantId,
      certificationId: credential.id,
      verificationAction: "VERIFIED",
      verificationMethod: input.verificationMethod ?? "ISSUER_PORTAL",
      actorId: actor.userId,
      comments: input.comments,
      recordedAt: input.verifiedOn,
    });
    if (credential.significantForSr) {
      // FR-G07-018 AC.4: only VERIFIED credentials post to G12 (FR-G07-016 significance path).
      const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
        sourceModule: "G07",
        sourceReferenceId: `g07_certifications:${credential.id}:VERIFIED`,
        sourceEventVersion: 1,
        employeeId: credential.employeeId,
        eventTypeCode: "TRAINING_CERTIFICATION_POSTED",
        eventDate: input.verifiedOn,
        factKey: `G07:${credential.id}:TRAINING_CERTIFICATION_POSTED`,
        payload: { issuingBody: credential.issuingBody, externalReferenceNo: credential.externalReferenceNo },
        documentIds: credential.evidenceDocumentId ? [credential.evidenceDocumentId] : [],
      });
      credential.srEventId = sr.event.id;
    }
    this.depth.saveExternalCredential(credential);
    this.audit.recordMutation(actor, {
      action: "G07_EXTERNAL_CREDENTIAL_VERIFIED",
      subjectRef: `g07_certifications:${credential.id}`,
      metadata: { ledger: "credential_verifications", verifiedBy: actor.userId, srEventId: credential.srEventId },
    });
    return { credential: { ...credential }, verification };
  }

  /** FR-G07-018 AC.6: rejection appends REJECTED; the immutable trail is retained, never deleted. */
  rejectExternalCredential(actor: ActorContext, credentialId: string, input: { rejectedOn: string; comments: string }): { credential: ExternalCredential; verification: CredentialVerificationEntry } {
    this.authorization.check(actor, "g07.credential.verify", actor);
    const credential = this.requireExternalCredential(actor, credentialId);
    this.requireCredentialSoD(credential, actor);
    if (credential.verificationStatus === "VERIFIED" || credential.verificationStatus === "REJECTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Credential verification already concluded");
    }
    if (!input.comments) {
      throw new FoundationError("VALIDATION_FAILED", "Rejection comments are required", { field: "comments" });
    }
    credential.verificationStatus = "REJECTED";
    this.depth.saveExternalCredential(credential);
    const verification = this.depth.appendCredentialVerification({
      tenantId: actor.tenantId,
      certificationId: credential.id,
      verificationAction: "REJECTED",
      verificationMethod: "DOCUMENT_REVIEW",
      actorId: actor.userId,
      comments: input.comments,
      recordedAt: input.rejectedOn,
    });
    this.audit.recordMutation(actor, {
      action: "G07_EXTERNAL_CREDENTIAL_REJECTED",
      subjectRef: `g07_certifications:${credential.id}`,
      metadata: { ledger: "credential_verifications", verificationAction: "REJECTED" },
    });
    return { credential: { ...credential }, verification };
  }

  getExternalCredential(scope: TenantScope, credentialId: string): ExternalCredential {
    requireTenantScope(scope);
    return this.requireExternalCredential(scope, credentialId);
  }

  /** The append-only credential_verifications trail (FR-G07-018 AC.2/AC.6). */
  listCredentialVerifications(scope: TenantScope, credentialId: string): CredentialVerificationEntry[] {
    requireTenantScope(scope);
    return this.depth.listCredentialVerifications(scope, credentialId);
  }

  // -------------------------------------------------------------------------------------
  // PH-16E (2) FR-G07-020 — training_sponsorships service bonds: PROPOSED -> SANCTIONED ->
  // ACTIVE -> FULFILLED/BREACHED -> RECOVERED/WAIVED; breach computes bond_recovery_amount
  // pro-rata in integer paise; VAL-G07-BOND gates BREACHED -> RECOVERED on the BOND_RECOVERY feed.
  // -------------------------------------------------------------------------------------

  /** FR-G07-020 AC.1: capture the sponsorship request (PROPOSED). Money is integer paise. */
  createSponsorship(
    actor: ActorContext,
    input: {
      employeeId: string;
      sponsorshipType: TrainingSponsorship["sponsorshipType"];
      sponsoredAmountPaise: number;
      startDate: string;
      endDate?: string;
      serviceBondMonths: number;
      trainingProgramId?: string;
      externalCourseName?: string;
    }
  ): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.request", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (!Number.isInteger(input.sponsoredAmountPaise) || input.sponsoredAmountPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "sponsoredAmountPaise must be a positive integer (paise)", { field: "sponsoredAmountPaise" });
    }
    if (!Number.isInteger(input.serviceBondMonths) || input.serviceBondMonths < 0) {
      throw new FoundationError("VALIDATION_FAILED", "serviceBondMonths must be a non-negative integer", { field: "serviceBondMonths" });
    }
    if (!input.trainingProgramId && !input.externalCourseName) {
      throw new FoundationError("VALIDATION_FAILED", "A sponsorship links a training program or an external course", { field: "trainingProgramId" });
    }
    const sponsorship: TrainingSponsorship = {
      id: nextId("training-sponsorship", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      trainingProgramId: input.trainingProgramId,
      externalCourseName: input.externalCourseName,
      sponsorshipType: input.sponsorshipType,
      sponsoredAmountPaise: input.sponsoredAmountPaise,
      startDate: input.startDate,
      endDate: input.endDate,
      serviceBondMonths: input.serviceBondMonths,
      obligationStatus: "PROPOSED",
    };
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, { action: "G07_SPONSORSHIP_PROPOSED", subjectRef: `g07_training_sponsorships:${sponsorship.id}` });
    return sponsorship;
  }

  /** FR-G07-020 AC.2: recommend -> sanction (P01 pattern); the requesting employee cannot self-sanction. */
  sanctionSponsorship(actor: ActorContext, sponsorshipId: string): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.sanction", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "PROPOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a PROPOSED sponsorship can be sanctioned");
    }
    if (actor.userId === sponsorship.employeeId) {
      throw new FoundationError("FORBIDDEN", "Sponsored employee cannot sanction their own bond (SoD)");
    }
    sponsorship.obligationStatus = "SANCTIONED";
    sponsorship.sanctionedBy = actor.userId;
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, { action: "G07_SPONSORSHIP_SANCTIONED", subjectRef: `g07_training_sponsorships:${sponsorship.id}` });
    return { ...sponsorship };
  }

  /** FR-G07-020 AC.3: on completion the bond turns ACTIVE with bond_end_date = completion + bond months. */
  activateSponsorshipBond(actor: ActorContext, sponsorshipId: string, input: { completionDate: string }): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.administer", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "SANCTIONED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a SANCTIONED sponsorship activates its bond");
    }
    sponsorship.obligationStatus = "ACTIVE";
    sponsorship.completionDate = input.completionDate;
    sponsorship.bondEndDate = addMonthsIso(input.completionDate, sponsorship.serviceBondMonths);
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, {
      action: "G07_SPONSORSHIP_BOND_ACTIVE",
      subjectRef: `g07_training_sponsorships:${sponsorship.id}`,
      metadata: { bondEndDate: sponsorship.bondEndDate, serviceBondMonths: sponsorship.serviceBondMonths },
    });
    return { ...sponsorship };
  }

  /** FR-G07-020 AC.3: serving through bond_end_date fulfils the obligation. */
  fulfilSponsorshipBond(actor: ActorContext, sponsorshipId: string, input: { asOf: string }): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.administer", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "ACTIVE" || !sponsorship.bondEndDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE bond can be fulfilled");
    }
    if (input.asOf < sponsorship.bondEndDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Bond is not yet served through bond_end_date", {
        details: { bondEndDate: sponsorship.bondEndDate, asOf: input.asOf },
      });
    }
    sponsorship.obligationStatus = "FULFILLED";
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, { action: "G07_SPONSORSHIP_FULFILLED", subjectRef: `g07_training_sponsorships:${sponsorship.id}` });
    return { ...sponsorship };
  }

  /**
   * FR-G07-020 AC.4: early exit/breach (e.g. the G05 relieving event) sets BREACHED and computes
   * bond_recovery_amount pro-rata on the UNSERVED bond months — all arithmetic in integer paise:
   * recovery = floor(sponsored_amount_paise * unserved_months / service_bond_months).
   */
  markSponsorshipBreached(actor: ActorContext, sponsorshipId: string, input: { breachDate: string }): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.administer", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "ACTIVE" || !sponsorship.bondEndDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE bond can be marked BREACHED");
    }
    const unservedMonths = Math.min(unservedBondMonths(input.breachDate, sponsorship.bondEndDate), sponsorship.serviceBondMonths);
    sponsorship.obligationStatus = "BREACHED";
    sponsorship.bondRecoveryAmountPaise =
      sponsorship.serviceBondMonths === 0
        ? 0
        : Math.floor((sponsorship.sponsoredAmountPaise * unservedMonths) / sponsorship.serviceBondMonths);
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, {
      action: "G07_SPONSORSHIP_BREACHED",
      subjectRef: `g07_training_sponsorships:${sponsorship.id}`,
      metadata: { unservedMonths, bondRecoveryAmountPaise: sponsorship.bondRecoveryAmountPaise, validation: "VAL-G07-BOND" },
    });
    return { ...sponsorship };
  }

  /**
   * FR-G07-020 AC.5: the BREACHED bond emits its BOND_RECOVERY training_costs row
   * (payable_to_payroll=true) — the payable feed G10 consumes. Idempotent per sponsorship.
   */
  emitBondRecoveryCost(actor: ActorContext, sponsorshipId: string): TrainingCostEntry {
    this.authorization.check(actor, "g07.sponsorship.recovery", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "BREACHED" || sponsorship.bondRecoveryAmountPaise === undefined) {
      throw new FoundationError("PRECONDITION_FAILED", "Only a BREACHED bond emits a BOND_RECOVERY cost");
    }
    const existing = this.depth.listTrainingCosts(actor, sponsorship.id).find((cost) => cost.costType === "BOND_RECOVERY");
    if (existing) {
      return existing; // one BOND_RECOVERY feed row per bond — replays are no-ops
    }
    const cost = this.depth.appendTrainingCost({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      trainingSponsorshipId: sponsorship.id,
      costType: "BOND_RECOVERY",
      amountPaise: sponsorship.bondRecoveryAmountPaise,
      payableToPayroll: true,
      recordedAt: sponsorship.bondEndDate ?? sponsorship.startDate,
    });
    this.audit.recordMutation(actor, {
      action: "G07_BOND_RECOVERY_COST_EMITTED",
      subjectRef: `g07_training_costs:${cost.id}`,
      metadata: { feed: "G10", payableToPayroll: true, amountPaise: cost.amountPaise },
    });
    return cost;
  }

  /**
   * VAL-G07-BOND (fail closed, BRD integrity rule 17): a BREACHED training_sponsorships row
   * moves to RECOVERED only after its BOND_RECOVERY cost (the G10 feed) exists — else 409.
   */
  markSponsorshipRecovered(actor: ActorContext, sponsorshipId: string): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.recovery", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "BREACHED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a BREACHED bond can move to RECOVERED");
    }
    if (!this.depth.hasBondRecoveryCost(actor, sponsorship.id)) {
      throw new FoundationError("VAL-G07-BOND", "BREACHED bond must emit a BOND_RECOVERY cost (G10 feed) before RECOVERED", {
        details: { sponsorshipId: sponsorship.id },
      });
    }
    sponsorship.obligationStatus = "RECOVERED";
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, { action: "G07_SPONSORSHIP_RECOVERED", subjectRef: `g07_training_sponsorships:${sponsorship.id}` });
    return { ...sponsorship };
  }

  /** FR-G07-020 AC.6: waivers need authority approval and are audited (WAIVED, P05). */
  waiveSponsorship(actor: ActorContext, sponsorshipId: string, input: { reason: string }): TrainingSponsorship {
    this.authorization.check(actor, "g07.sponsorship.waive", actor);
    const sponsorship = this.requireSponsorship(actor, sponsorshipId);
    if (sponsorship.obligationStatus !== "ACTIVE" && sponsorship.obligationStatus !== "BREACHED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE or BREACHED bond can be waived");
    }
    if (!input.reason) {
      throw new FoundationError("VALIDATION_FAILED", "Waiver reason is required", { field: "reason" });
    }
    sponsorship.obligationStatus = "WAIVED";
    sponsorship.waiverReason = input.reason;
    this.depth.saveSponsorship(sponsorship);
    this.audit.recordMutation(actor, {
      action: "G07_SPONSORSHIP_WAIVED",
      subjectRef: `g07_training_sponsorships:${sponsorship.id}`,
      metadata: { reason: input.reason },
    });
    return { ...sponsorship };
  }

  getSponsorship(scope: TenantScope, sponsorshipId: string): TrainingSponsorship {
    requireTenantScope(scope);
    return { ...this.requireSponsorship(scope, sponsorshipId) };
  }

  /** The G10-facing cost feed rows for a sponsorship (BOND_RECOVERY carries payable_to_payroll). */
  listSponsorshipCosts(scope: TenantScope, sponsorshipId: string): TrainingCostEntry[] {
    requireTenantScope(scope);
    return this.depth.listTrainingCosts(scope, sponsorshipId);
  }

  private requireExternalCredential(scope: TenantScope, credentialId: string): ExternalCredential {
    const credential = this.depth.findExternalCredential(scope, credentialId);
    if (!credential) {
      throw new FoundationError("NOT_FOUND", "External credential not found");
    }
    return credential;
  }

  /** FR-G07-018 AC.5 SoD: verifier != submitter, enforced with the platform FORBIDDEN code. */
  private requireCredentialSoD(credential: ExternalCredential, actor: ActorContext): void {
    if (credential.submittedBy === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Self-capture creator cannot verify their own credential (SoD)", {
        details: { credentialId: credential.id },
      });
    }
  }

  private requireSponsorship(scope: TenantScope, sponsorshipId: string): TrainingSponsorship {
    const sponsorship = this.depth.findSponsorship(scope, sponsorshipId);
    if (!sponsorship) {
      throw new FoundationError("NOT_FOUND", "Training sponsorship not found");
    }
    return sponsorship;
  }

  summary(scope: TenantScope): { sessions: number; approved: number; completed: number; srPosted: number } {
    requireTenantScope(scope);
    return {
      sessions: this.sessions.filter((session) => this.inScope(session, scope)).length,
      approved: this.nominations.filter((nomination) => this.inScope(nomination, scope) && nomination.status === "APPROVED").length,
      completed: this.nominations.filter((nomination) => this.inScope(nomination, scope) && nomination.status === "COMPLETED").length,
      srPosted: this.certifications.filter((certification) => this.inScope(certification, scope) && Boolean(certification.srEventId)).length,
    };
  }

  /** Monotonic id counter for depth entities (mirrors nextId usage on module arrays). */
  private depthIdCounter = 0;

  private taxonomyCounter(): number {
    this.depthIdCounter += 1;
    return this.depthIdCounter;
  }

  /**
   * Current level for a competency = best fresh, VALIDATED inventory level across the
   * competency's linked skills; stale/unvalidated rows do not close a gap (discounted).
   */
  private currentCompetencyLevel(
    scope: TenantScope,
    competencyId: string,
    inventory: EmployeeSkill[]
  ): { level?: number; discountedForStaleness: boolean } {
    const competency = this.depth.findCompetency(scope, competencyId);
    if (!competency) {
      throw new FoundationError("NOT_FOUND", "Competency not found", { details: { competencyId } });
    }
    const rows = inventory.filter((item) => competency.linkedSkillIds.includes(item.skillId));
    const usable = rows.filter((item) => item.status === "VALIDATED" && item.freshnessStatus === "FRESH");
    if (usable.length === 0) {
      return { level: undefined, discountedForStaleness: rows.length > 0 };
    }
    return { level: Math.max(...usable.map((item) => item.currentProficiencyLevel)), discountedForStaleness: false };
  }

  /** FR-G07-024: project the versioned Gap Contract from the finalized analysis (supersedes prior). */
  private publishGapContract(actor: ActorContext, analysis: SkillGapAnalysis, items: SkillGapItem[]): GapContract {
    const previous = this.depth.findCurrentGapContract(actor, analysis.employeeId, analysis.competencyModelId);
    if (previous) {
      this.depth.saveGapContract({ ...previous, status: "SUPERSEDED" });
    }
    const contract: GapContract = {
      id: nextId("gap-contract", this.taxonomyCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      contractVersion: this.depth.nextGapContractVersion(actor, analysis.employeeId, analysis.competencyModelId),
      employeeId: analysis.employeeId,
      competencyModelId: analysis.competencyModelId,
      skillGapAnalysisId: analysis.id,
      generatedOn: analysis.generatedOn,
      scoringMode: analysis.scoringMode,
      modelStaleFlag: analysis.modelStaleFlag,
      items: items
        .filter((item) => item.gapSize > 0)
        .map((item) => ({
          competencyId: item.competencyId,
          isCritical: item.isCritical,
          gapSize: item.gapSize,
          discountedForStaleness: item.discountedForStaleness,
        })),
      status: "CURRENT",
    };
    this.depth.saveGapContract(contract);
    this.audit.recordMutation(actor, {
      action: "G07_GAP_CONTRACT_PUBLISHED",
      subjectRef: `g07_gap_contracts:${contract.id}`,
      metadata: { contractVersion: contract.contractVersion, consumers: ["G06", "G08"] },
    });
    return contract;
  }

  /** FR-G07-009 AC1: "An employee can self-nominate; a manager can nominate reports; L&D/HR can
   *  nominate anyone in scope." Reuses the same REPORTING_CHAIN resolution the workflow start
   *  below uses to route approval, so "is this actor the employee's manager" is answered
   *  consistently with who the P01 approval task actually goes to. */
  private assertCanNominate(actor: ActorContext, employeeId: string): void {
    if (actor.permissions?.includes("*") || actor.roles?.some((role) => NOMINATION_OVERRIDE_ROLES.has(role))) {
      return;
    }
    if (actor.userId === employeeId) {
      return;
    }
    // Same fixed reference date the adjacent workflow.start() call below resolves against, so
    // "is this actor the employee's manager" agrees with who the P01 approval task actually goes to.
    const resolution = this.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: employeeId }, "2026-07-02");
    if (resolution.selectedAssignees.some((assignee) => assignee.employeeId === actor.userId)) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only nominate yourself or your own direct reports", { field: "employeeId" });
  }

  /** FR-G07-010 "Authorization: Trainer own session; L&D any" — the nominee never records their
   *  own pass/fail outcome. */
  private assertCanRecordCompletion(actor: ActorContext): void {
    if (actor.permissions?.includes("*") || actor.roles?.some((role) => COMPLETION_OVERRIDE_ROLES.has(role))) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "Only a trainer or L&D/HR role may record a training completion outcome", { field: "actor" });
  }

  private requireSession(scope: TenantScope, sessionId: string): TrainingSession {
    const session = this.sessions.find((item) => item.id === sessionId && this.inScope(item, scope));
    if (!session) {
      throw new FoundationError("NOT_FOUND", "Training session not found");
    }
    return session;
  }

  private requireNomination(scope: TenantScope, nominationId: string): TrainingNomination {
    const nomination = this.nominations.find((item) => item.id === nominationId && this.inScope(item, scope));
    if (!nomination) {
      throw new FoundationError("NOT_FOUND", "Training nomination not found");
    }
    return nomination;
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }
}
