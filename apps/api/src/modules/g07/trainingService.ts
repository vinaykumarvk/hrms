import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  CampaignTarget,
  CompetencyMaster,
  CompetencyModel,
  EmployeeSkill,
  GapContract,
  InMemoryTrainingDepthRepository,
  SkillCategory,
  SkillGapAnalysis,
  SkillGapItem,
  SkillMaster,
  TrainingCampaign,
  TrainingDepthRepository,
} from "./trainingDepthRepository";

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

  nominate(actor: ActorContext, input: { sessionId: string; employeeId: string }): TrainingNomination {
    this.authorization.check(actor, "g07.nomination.submit", actor);
    const session = this.requireSession(actor, input.sessionId);
    if (session.status !== "OPEN" && session.status !== "FULL") {
      throw new FoundationError("PRECONDITION_FAILED", "Training session is not open for nominations");
    }
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
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
