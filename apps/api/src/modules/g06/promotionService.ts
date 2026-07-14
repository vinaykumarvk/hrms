import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  EstablishmentQslRepository,
  QSL_ENGINE_VERSION,
  QualifyingServiceSnapshot,
  SanctionedPost,
  ServiceExclusionRule,
  ServicePeriodInput,
  SuspensionTreatment,
  computeNetQualifyingService,
} from "./establishmentQslRepository";
import {
  CombinedSeniorityConstruction,
  CombinedSeniorityEntry,
  InMemoryPromotionDepthRepository,
  LegalCaseLink,
  LegalForum,
  LegalLinkedEntityType,
  MacpClockEffect,
  ProbationRecord,
  PromotionDepthRepository,
  PromotionRefusal,
  RecruitmentStream,
  ReservationCategory,
  ReservationRoster,
  RosterPoint,
  RosterType,
  RotationMethod,
  RotationStartSlot,
  RotationTraceSlot,
  SeniorityQuotaRule,
  ConsequentialSeniorityMode,
  addMonthsIso,
} from "./promotionDepthRepository";

export type SeniorityListStatus = "DRAFT" | "PUBLISHED_TENTATIVE" | "FINALISED";
export type PromotionCaseStatus = "DRAFT" | "ELIGIBILITY_DONE" | "DPC_HELD" | "ORDERS_ISSUED" | "CLOSED";
export type PromotionOrderStatus = "ISSUED" | "EFFECTED" | "DECLINED";
export type MacpStatus = "DUE" | "SANCTIONED" | "EFFECTED" | "DEFERRED";

export interface SenioritySeed {
  employeeId: string;
  serviceNo: string;
  appointmentDate: string;
  dateOfBirth?: string;
}

export interface SeniorityEntry extends SenioritySeed {
  rank: number;
  tiebreakValue: string;
}

export interface SeniorityList {
  id: string;
  tenantId: string;
  entityId?: string;
  cadreId: string;
  effectiveDate: string;
  status: SeniorityListStatus;
  entries: SeniorityEntry[];
  documentId?: string;
}

export interface DpcPanelMember {
  employeeId?: string;
  externalName?: string;
  role: string;
}

/** FR-004: candidate band on the crucial date, from the pinned DoPT slab (Appendix D.1). */
export type ZoneOfConsideration = "IN_ZONE" | "EXTENDED_ZONE" | "OUT_OF_ZONE";

export interface PromotionCandidate {
  employeeId: string;
  rank: number;
  fitness: "PENDING" | "FIT" | "UNFIT";
  /** FR-004 AC-3: zone band pinned on the crucial date — never a flat multiplier. */
  zoneOfConsideration: ZoneOfConsideration;
  isSelected: boolean;
}

export interface PromotionCase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseNo: string;
  seniorityListId: string;
  /** FR-015 linkage: the register post the case vacancy figure was reconciled against. */
  sanctionedPostId?: string;
  fromDesignation: string;
  toDesignation: string;
  vacancies: number;
  /** FR-004: the cut-off date on which eligibility/zone/debarment are judged (§5.4 glossary). */
  crucialDate: string;
  /** Pinned slab output: zone = 5 if v=1; 8 if v=2; 3×v if v≥3 (Appendix D.1). */
  zoneSize: number;
  status: PromotionCaseStatus;
  candidates: PromotionCandidate[];
  dpc?: {
    quorumRequired: number;
    participatingMembers: number;
    recusedEmployeeIds: string[];
    verdict: "FIT_PANEL";
    workflowInstanceId: string;
  };
}

export interface PromotionOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  orderNo: string;
  promotionCaseId: string;
  employeeId: string;
  fromDesignation: string;
  toDesignation: string;
  status: PromotionOrderStatus;
  documentId: string;
  srEventId?: string;
}

export interface MacpCase {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  level: string;
  dueDate: string;
  status: MacpStatus;
  srEventId?: string;
}

export interface G06PayImpactSignal {
  id: string;
  sourceModule: "G06";
  sourceRef: string;
  kind: "PROMOTION" | "MACP";
  employeeId: string;
  status: "READY_FOR_G10";
}

/** FR-015 register maker input; current_vacancies is always derived, never accepted. */
export interface SanctionedPostInput {
  cadreId: string;
  gradeDesignationId: string;
  orgUnitId: string;
  sanctionOrderRef: string;
  sanctionedStrength: number;
  filledCount: number;
  drQuotaPct: number;
  promotionQuotaPct: number;
  ldceQuotaPct: number;
  anticipatedVacancies?: number;
  carriedForwardVacancies?: number;
  asOnDate: string;
  /** P01 checker — must be a different actor than the maker (SoD). */
  approverActorId: string;
}

/** FR-015 AC-3: promotion-quota vacancy figure consumed by FR-004 case creation. */
export interface VacancyComputation {
  sanctionedPostId: string;
  sanctionedStrength: number;
  filledCount: number;
  currentVacancies: number;
  anticipatedVacancies: number;
  carriedForwardVacancies: number;
  promotionQuotaPct: number;
  promotionQuotaVacancies: number;
}

export interface ServiceExclusionRuleInput {
  ruleCode: string;
  eolCountsAsQualifying: boolean;
  eolMaxCondonableDays?: number;
  diesNonExcluded: boolean;
  suspensionTreatment: SuspensionTreatment;
  adhocServiceCounts: boolean;
  adhocCountsIfRegularised: boolean;
  deputationCounts: boolean;
  breakInServiceResetsClock: boolean;
  effectiveFrom?: string;
  /** Rule changes are maker≠checker governed like register amendments. */
  approverActorId: string;
}

export interface QualifyingServiceComputeInput {
  employeeId: string;
  gradeDesignationId: string;
  asOfDate: string;
  grossServiceDays: number;
  periods: ServicePeriodInput[];
  serviceExclusionRuleId: string;
}

/** One APAR year fed to the eligibility engine (read by reference from G08, never forked). */
export interface AparYearInput {
  year: string;
  grading: "MEETS_BENCHMARK" | "BELOW_BENCHMARK" | "ADVERSE";
  /** VAL-G06-APAR-USABLE (§5.6-16): adverse entry counts only if communicated ... */
  communicated: boolean;
  /** ... and the representation is DISPOSED or NOT_APPLICABLE (Dev Dutt line). */
  representationStatus?: "PENDING" | "DISPOSED" | "NOT_APPLICABLE";
}

/** APAR-usability gate outcome recorded on the assessment (§5.6-16). */
export interface AparUsabilityGate {
  usableAdverseYears: string[];
  /** Uncommunicated / representation-pending adverse years — cannot be relied upon. */
  unusableAdverseYears: string[];
  benchmarkMet: boolean;
}

/** FR-003 eligibility citation of the current qualifying_service_ledger snapshot. */
export interface PromotionEligibilityAssessment {
  employeeId: string;
  gradeDesignationId: string;
  requiredQualifyingYears: number;
  netQualifyingYears: number;
  qualifyingServiceMet: boolean;
  aparGate: AparUsabilityGate;
  eligible: boolean;
  citedQslSnapshotId: string;
}

/** Post-full-review-goal fix: self-service reads (my promotion orders/probation/refusals) need
 *  a need-to-know gate, same shape as every other module's list read. */
/** hr_admin deliberately excluded (SoD boundary): promotion self-service data stays with the
 *  dedicated statutory promotion chain, not the general HR-admin superset role. */
const PROMOTION_ACCESS_OVERRIDE_ROLES = new Set(["promotion_officer", "system"]);

export class PromotionService {
  private readonly seniorityLists: SeniorityList[] = [];
  private readonly promotionCases: PromotionCase[] = [];
  private readonly promotionOrders: PromotionOrder[] = [];
  private readonly macpCases: MacpCase[] = [];
  private readonly payImpactSignals: G06PayImpactSignal[] = [];
  /** Latest FR-003 assessment per employee+grade — cited by the DPC APAR-usability guard. */
  private readonly eligibilityAssessments = new Map<string, PromotionEligibilityAssessment>();

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    private readonly establishmentQsl: EstablishmentQslRepository,
    private readonly promotionDepth: PromotionDepthRepository = new InMemoryPromotionDepthRepository()
  ) {}

  // -------------------------------------------------------------------------------------
  // FR-015 (PPP-EST): sanctioned_posts establishment-strength register & vacancy computation
  // -------------------------------------------------------------------------------------

  /** Registers a sanctioned_posts row (maker≠checker); vacancies derived, quota split validated. */
  registerSanctionedPost(actor: ActorContext, input: SanctionedPostInput): SanctionedPost {
    this.authorization.check(actor, "g06.establishment.write", actor);
    this.requireDistinctApprover(actor, input.approverActorId, "sanctioned-post registration");
    this.validateQuotaSplit(input.drQuotaPct, input.promotionQuotaPct, input.ldceQuotaPct);
    this.validateStrength(input.sanctionedStrength, input.filledCount);
    if (!input.sanctionOrderRef) {
      throw new FoundationError("VALIDATION_FAILED", "sanctionOrderRef is required", { field: "sanctionOrderRef" });
    }
    const post: SanctionedPost = {
      id: nextId("sanctioned-post", this.establishmentQsl.countSanctionedPosts()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cadreId: input.cadreId,
      gradeDesignationId: input.gradeDesignationId,
      orgUnitId: input.orgUnitId,
      sanctionOrderRef: input.sanctionOrderRef,
      sanctionedStrength: input.sanctionedStrength,
      filledCount: input.filledCount,
      drQuotaPct: input.drQuotaPct,
      promotionQuotaPct: input.promotionQuotaPct,
      ldceQuotaPct: input.ldceQuotaPct,
      currentVacancies: input.sanctionedStrength - input.filledCount,
      anticipatedVacancies: input.anticipatedVacancies ?? 0,
      carriedForwardVacancies: input.carriedForwardVacancies ?? 0,
      asOnDate: input.asOnDate,
      status: "ACTIVE",
      version: 1,
      makerActorId: actor.userId,
      approverActorId: input.approverActorId,
    };
    this.establishmentQsl.saveSanctionedPost(post);
    this.audit.recordMutation(actor, {
      action: "G06_SANCTIONED_POST_REGISTERED",
      subjectRef: `g06_sanctioned_posts:${post.id}`,
      metadata: { makerActorId: post.makerActorId, approverActorId: post.approverActorId, currentVacancies: post.currentVacancies },
    });
    return { ...post };
  }

  /** FR-015 AC-5: strength revision (maker≠checker), re-deriving current_vacancies. */
  reviseSanctionedPost(
    actor: ActorContext,
    sanctionedPostId: string,
    input: Partial<Pick<SanctionedPostInput, "sanctionedStrength" | "filledCount" | "drQuotaPct" | "promotionQuotaPct" | "ldceQuotaPct" | "anticipatedVacancies" | "carriedForwardVacancies">> & {
      approverActorId: string;
    }
  ): SanctionedPost {
    this.authorization.check(actor, "g06.establishment.write", actor);
    this.requireDistinctApprover(actor, input.approverActorId, "sanctioned-post revision");
    const post = this.requireSanctionedPost(actor, sanctionedPostId);
    const revised: SanctionedPost = {
      ...post,
      sanctionedStrength: input.sanctionedStrength ?? post.sanctionedStrength,
      filledCount: input.filledCount ?? post.filledCount,
      drQuotaPct: input.drQuotaPct ?? post.drQuotaPct,
      promotionQuotaPct: input.promotionQuotaPct ?? post.promotionQuotaPct,
      ldceQuotaPct: input.ldceQuotaPct ?? post.ldceQuotaPct,
      anticipatedVacancies: input.anticipatedVacancies ?? post.anticipatedVacancies,
      carriedForwardVacancies: input.carriedForwardVacancies ?? post.carriedForwardVacancies,
      version: post.version + 1,
      status: "REVISED",
      makerActorId: actor.userId,
      approverActorId: input.approverActorId,
    };
    this.validateQuotaSplit(revised.drQuotaPct, revised.promotionQuotaPct, revised.ldceQuotaPct);
    this.validateStrength(revised.sanctionedStrength, revised.filledCount);
    revised.currentVacancies = revised.sanctionedStrength - revised.filledCount;
    this.establishmentQsl.saveSanctionedPost(revised);
    this.audit.recordMutation(actor, {
      action: "G06_SANCTIONED_POST_REVISED",
      subjectRef: `g06_sanctioned_posts:${revised.id}`,
      metadata: { version: revised.version, makerActorId: revised.makerActorId, approverActorId: revised.approverActorId },
    });
    return { ...revised };
  }

  /**
   * FR-015 strength reconciliation (JOB-G06-ESTAB-RECONCILE): syncs filled_count against the
   * incumbent headcount and re-derives current_vacancies; filled > sanctioned is blocked with
   * STRENGTH_INCONSISTENT.
   */
  reconcileSanctionedPost(actor: ActorContext, sanctionedPostId: string, input: { filledCount: number }): SanctionedPost {
    this.authorization.check(actor, "g06.establishment.write", actor);
    const post = this.requireSanctionedPost(actor, sanctionedPostId);
    if (input.filledCount > post.sanctionedStrength) {
      throw new FoundationError("STRENGTH_INCONSISTENT", "filled_count may not exceed sanctioned_strength", {
        field: "filledCount",
        details: { filledCount: input.filledCount, sanctionedStrength: post.sanctionedStrength },
      });
    }
    if (input.filledCount < 0) {
      throw new FoundationError("VALIDATION_FAILED", "filledCount must be non-negative", { field: "filledCount" });
    }
    const reconciled: SanctionedPost = {
      ...post,
      filledCount: input.filledCount,
      currentVacancies: post.sanctionedStrength - input.filledCount,
    };
    this.establishmentQsl.saveSanctionedPost(reconciled);
    this.audit.recordMutation(actor, {
      action: "G06_ESTABLISHMENT_RECONCILED",
      subjectRef: `g06_sanctioned_posts:${reconciled.id}`,
      metadata: { filledCount: reconciled.filledCount, currentVacancies: reconciled.currentVacancies },
    });
    return { ...reconciled };
  }

  getSanctionedPost(scope: TenantScope, sanctionedPostId: string): SanctionedPost {
    requireTenantScope(scope);
    return this.requireSanctionedPost(scope, sanctionedPostId);
  }

  listSanctionedPosts(scope: TenantScope): SanctionedPost[] {
    requireTenantScope(scope);
    return this.establishmentQsl.listSanctionedPosts(scope);
  }

  /** FR-015 AC-3: promotion-quota vacancies = (current + anticipated + carried-forward) × promotion_quota_pct. */
  getVacancyComputation(scope: TenantScope, sanctionedPostId: string): VacancyComputation {
    requireTenantScope(scope);
    const post = this.requireSanctionedPost(scope, sanctionedPostId);
    const vacancyBase = post.currentVacancies + post.anticipatedVacancies + post.carriedForwardVacancies;
    return {
      sanctionedPostId: post.id,
      sanctionedStrength: post.sanctionedStrength,
      filledCount: post.filledCount,
      currentVacancies: post.currentVacancies,
      anticipatedVacancies: post.anticipatedVacancies,
      carriedForwardVacancies: post.carriedForwardVacancies,
      promotionQuotaPct: post.promotionQuotaPct,
      promotionQuotaVacancies: Math.floor((vacancyBase * post.promotionQuotaPct) / 100),
    };
  }

  // -------------------------------------------------------------------------------------
  // FR-016 (PPP-QSL): qualifying_service_ledger + service_exclusion_rules engine
  // -------------------------------------------------------------------------------------

  /** Defines a pinned service_exclusion_rules row (maker≠checker governed like register edits). */
  defineServiceExclusionRule(actor: ActorContext, input: ServiceExclusionRuleInput): ServiceExclusionRule {
    this.authorization.check(actor, "g06.qsl.rule.write", actor);
    this.requireDistinctApprover(actor, input.approverActorId, "service-exclusion rule change");
    const rule: ServiceExclusionRule = {
      id: nextId("service-exclusion-rule", this.establishmentQsl.countExclusionRules()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      ruleCode: input.ruleCode,
      eolCountsAsQualifying: input.eolCountsAsQualifying,
      eolMaxCondonableDays: input.eolMaxCondonableDays,
      diesNonExcluded: input.diesNonExcluded,
      suspensionTreatment: input.suspensionTreatment,
      adhocServiceCounts: input.adhocServiceCounts,
      adhocCountsIfRegularised: input.adhocCountsIfRegularised,
      deputationCounts: input.deputationCounts,
      breakInServiceResetsClock: input.breakInServiceResetsClock,
      effectiveFrom: input.effectiveFrom,
      isActive: true,
      makerActorId: actor.userId,
      approverActorId: input.approverActorId,
    };
    this.establishmentQsl.saveExclusionRule(rule);
    this.audit.recordMutation(actor, {
      action: "G06_SERVICE_EXCLUSION_RULE_DEFINED",
      subjectRef: `g06_service_exclusion_rules:${rule.id}`,
      metadata: { ruleCode: rule.ruleCode, makerActorId: rule.makerActorId, approverActorId: rule.approverActorId },
    });
    return { ...rule };
  }

  /**
   * FR-016 AC-1/AC-2 (VAL-G06-QUALSVC): computes net qualifying service (gross − rule-driven
   * exclusions) and persists an immutable snapshot; recomputation supersedes the prior snapshot
   * atomically, never edits it.
   */
  computeQualifyingService(
    actor: ActorContext,
    input: QualifyingServiceComputeInput
  ): { snapshot: QualifyingServiceSnapshot; supersededSnapshotId?: string } {
    this.authorization.check(actor, "g06.qsl.compute", actor);
    this.employeeMaster.getById(actor, input.employeeId);
    const rule = this.establishmentQsl.findExclusionRule(actor, input.serviceExclusionRuleId);
    if (!rule) {
      throw new FoundationError("NOT_FOUND", "Service exclusion rule not found");
    }
    if (!rule.isActive) {
      throw new FoundationError("PRECONDITION_FAILED", "Service exclusion rule is not active on the as-of date");
    }
    const computation = computeNetQualifyingService(rule, { grossServiceDays: input.grossServiceDays, periods: input.periods });
    const snapshot: QualifyingServiceSnapshot = {
      id: nextId("qsl-snapshot", this.establishmentQsl.countSnapshots()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      gradeDesignationId: input.gradeDesignationId,
      asOfDate: input.asOfDate,
      grossServiceYears: computation.grossServiceYears,
      totalExclusionDays: computation.totalExclusionDays,
      netQualifyingYears: computation.netQualifyingYears,
      exclusionBreakdownJson: computation.exclusionBreakdown,
      serviceExclusionRuleId: rule.id,
      computedByVersion: QSL_ENGINE_VERSION,
      isCurrent: true,
      computedAt: new Date().toISOString(),
    };
    const result = this.establishmentQsl.insertSnapshotSuperseding(snapshot);
    this.audit.recordMutation(actor, {
      action: "G06_QSL_SNAPSHOT_COMPUTED",
      subjectRef: `g06_qualifying_service_ledger:${result.snapshot.id}`,
      metadata: {
        netQualifyingYears: result.snapshot.netQualifyingYears,
        totalExclusionDays: result.snapshot.totalExclusionDays,
        supersededSnapshotId: result.supersededSnapshotId,
      },
    });
    return result;
  }

  /** FR-016 read contract: current citable snapshot — consumed by G06 eligibility now, G11 pension later. */
  getCurrentQualifyingService(scope: TenantScope, employeeId: string, gradeDesignationId: string): QualifyingServiceSnapshot {
    requireTenantScope(scope);
    const snapshot = this.establishmentQsl.findCurrentSnapshot(scope, employeeId, gradeDesignationId);
    if (!snapshot) {
      throw new FoundationError("NOT_FOUND", "No current qualifying-service snapshot for employee/grade");
    }
    return snapshot;
  }

  /** Fetch any immutable snapshot by id (citation by qsl_snapshot_id). */
  getQualifyingServiceSnapshot(scope: TenantScope, snapshotId: string): QualifyingServiceSnapshot {
    requireTenantScope(scope);
    const snapshot = this.establishmentQsl.findSnapshot(scope, snapshotId);
    if (!snapshot) {
      throw new FoundationError("NOT_FOUND", "Qualifying-service snapshot not found");
    }
    return snapshot;
  }

  /**
   * FR-003 eligibility engine: qualifying service CITES the current QSL snapshot (FR-016 AC-4,
   * never re-derived in G06), and the APAR-usability gate (VAL-G06-APAR-USABLE, §5.6-16) admits
   * an adverse/below-benchmark APAR year only if it was communicated AND the representation is
   * DISPOSED or NOT_APPLICABLE — an unusable entry is excluded from the reckoning entirely.
   */
  assessPromotionEligibility(
    actor: ActorContext,
    input: { employeeId: string; gradeDesignationId: string; minQualifyingServiceYears: number; aparYears?: AparYearInput[] }
  ): PromotionEligibilityAssessment {
    this.authorization.check(actor, "g06.promotion.case.write", actor);
    const snapshot = this.establishmentQsl.findCurrentSnapshot(actor, input.employeeId, input.gradeDesignationId);
    if (!snapshot) {
      throw new FoundationError("PRECONDITION_FAILED", "No current qualifying-service snapshot — run the FR-016 compute first");
    }
    const aparGate = evaluateAparUsability(input.aparYears ?? []);
    const qualifyingServiceMet = snapshot.netQualifyingYears >= input.minQualifyingServiceYears;
    const assessment: PromotionEligibilityAssessment = {
      employeeId: input.employeeId,
      gradeDesignationId: input.gradeDesignationId,
      requiredQualifyingYears: input.minQualifyingServiceYears,
      netQualifyingYears: snapshot.netQualifyingYears,
      qualifyingServiceMet,
      aparGate,
      // Eligible only when service is met AND no USABLE adverse year drags below benchmark.
      eligible: qualifyingServiceMet && aparGate.benchmarkMet,
      citedQslSnapshotId: snapshot.id,
    };
    this.eligibilityAssessments.set(`${input.employeeId}:${input.gradeDesignationId}`, assessment);
    return { ...assessment, aparGate: { ...aparGate, usableAdverseYears: [...aparGate.usableAdverseYears], unusableAdverseYears: [...aparGate.unusableAdverseYears] } };
  }

  private requireDistinctApprover(actor: ActorContext, approverActorId: string, subject: string): void {
    if (!approverActorId) {
      throw new FoundationError("VALIDATION_FAILED", `approverActorId is required for ${subject}`, { field: "approverActorId" });
    }
    if (approverActorId === actor.userId) {
      throw new FoundationError("FORBIDDEN", `Maker and approver must be distinct actors for ${subject} (SoD)`, {
        field: "approverActorId",
        details: { makerActorId: actor.userId },
      });
    }
  }

  private validateQuotaSplit(drQuotaPct: number, promotionQuotaPct: number, ldceQuotaPct: number): void {
    if (drQuotaPct < 0 || promotionQuotaPct < 0 || ldceQuotaPct < 0 || drQuotaPct + promotionQuotaPct + ldceQuotaPct > 100) {
      throw new FoundationError("QUOTA_SPLIT_INVALID", "DR + promotion + LDCE quota percentages must be non-negative and sum to at most 100", {
        field: "promotionQuotaPct",
        details: { drQuotaPct, promotionQuotaPct, ldceQuotaPct, total: drQuotaPct + promotionQuotaPct + ldceQuotaPct },
      });
    }
  }

  private validateStrength(sanctionedStrength: number, filledCount: number): void {
    if (sanctionedStrength < 0 || filledCount < 0) {
      throw new FoundationError("VALIDATION_FAILED", "sanctionedStrength and filledCount must be non-negative", { field: "sanctionedStrength" });
    }
    if (filledCount > sanctionedStrength) {
      throw new FoundationError("STRENGTH_INCONSISTENT", "filled_count may not exceed sanctioned_strength", {
        field: "filledCount",
        details: { filledCount, sanctionedStrength },
      });
    }
  }

  private requireSanctionedPost(scope: TenantScope, sanctionedPostId: string): SanctionedPost {
    const post = this.establishmentQsl.findSanctionedPost(scope, sanctionedPostId);
    if (!post) {
      throw new FoundationError("NOT_FOUND", "Sanctioned post not found");
    }
    return post;
  }

  createSeniorityList(actor: ActorContext, input: { cadreId: string; effectiveDate: string; entries: SenioritySeed[] }): SeniorityList {
    this.authorization.check(actor, "g06.seniority.write", actor);
    if (input.entries.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one seniority entry is required", { field: "entries" });
    }
    const ranked = [...input.entries]
      .sort((left, right) => `${left.appointmentDate}:${left.serviceNo}`.localeCompare(`${right.appointmentDate}:${right.serviceNo}`))
      .map((entry, index) => ({ ...entry, rank: index + 1, tiebreakValue: `${entry.appointmentDate}:${entry.serviceNo}` }));
    const list: SeniorityList = {
      id: nextId("seniority-list", this.seniorityLists.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cadreId: input.cadreId,
      effectiveDate: input.effectiveDate,
      status: "DRAFT",
      entries: ranked,
    };
    this.seniorityLists.push(list);
    this.audit.recordMutation(actor, {
      action: "G06_SENIORITY_CREATED",
      subjectRef: `g06_seniority_lists:${list.id}`,
      metadata: { count: ranked.length, rule: "appointmentDate_then_serviceNo" },
    });
    return this.cloneSeniorityList(list);
  }

  publishSeniorityList(actor: ActorContext, seniorityListId: string): SeniorityList {
    this.authorization.check(actor, "g06.seniority.publish", actor);
    const list = this.requireSeniorityList(actor, seniorityListId);
    if (!isContiguous(list.entries.map((entry) => entry.rank))) {
      throw new FoundationError("PRECONDITION_FAILED", "Seniority ranks must be contiguous");
    }
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G06-SENIORITY-PUBLISH",
      subjectRef: `g06_seniority_lists:${list.id}`,
      stage: "PENDING_CHECKER",
      resolverRule: { mechanism: "NAMED_ROLE", roleCode: "G06_SENIORITY_CHECKER", subjectEmployeeId: list.entries[0]?.employeeId },
      asOf: list.effectiveDate,
    });
    this.workflow.act(actor, { taskId: started.task.id, action: "APPROVE" });
    list.status = "PUBLISHED_TENTATIVE";
    this.audit.recordMutation(actor, { action: "G06_SENIORITY_PUBLISHED", subjectRef: `g06_seniority_lists:${list.id}` });
    return this.cloneSeniorityList(list);
  }

  finaliseSeniorityList(actor: ActorContext, seniorityListId: string): SeniorityList {
    this.authorization.check(actor, "g06.seniority.finalise", actor);
    const list = this.requireSeniorityList(actor, seniorityListId);
    if (list.status !== "PUBLISHED_TENTATIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only published tentative lists can be finalised");
    }
    // §5.6-20: an active interim stay on the list blocks finalisation, not just order effecting.
    const stay = this.promotionDepth.findActiveStay(actor, "SENIORITY_LIST", list.id);
    if (stay) {
      throw new FoundationError("ENTITY_SUB_JUDICE", "This can't be done because a required condition isn't met: active interim stay", {
        field: "seniorityListId",
        details: { legalCaseLinkId: stay.id, caseReference: stay.caseReference },
      });
    }
    const document = this.documentVault.createDocument(actor, {
      title: `Final Seniority List ${list.cadreId}`,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ cadreId: list.cadreId, entries: list.entries })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G06",
      entityName: "seniority_lists",
      entityRefId: list.id,
      linkRole: "FINALISED_SENIORITY_LIST",
    });
    list.status = "FINALISED";
    list.documentId = attached.id;
    this.audit.recordMutation(actor, { action: "G06_SENIORITY_FINALISED", subjectRef: `g06_seniority_lists:${list.id}`, metadata: { documentId: attached.id } });
    return this.cloneSeniorityList(list);
  }

  // -------------------------------------------------------------------------------------
  // FR-PPP-020 (PPP-SEN): seniority_quota_rules + multi-stream rota-quota construction
  // -------------------------------------------------------------------------------------

  /**
   * FR-PPP-020 AC-1: a seniority_quota_rules row records the DR/promotee/LDCE ratios,
   * rotation_method, rotation_start_slot and unfilled-quota carry-forward. An invalid ratio
   * (negative / non-integer / all-zero) or an unknown method/start-slot fails closed with
   * QUOTA_RULE_INVALID — the construction engine never runs on a malformed rule.
   */
  defineSeniorityQuotaRule(
    actor: ActorContext,
    input: {
      ruleCode: string;
      cadreId?: string;
      gradeDesignationId: string;
      drQuotaRatio: number;
      promoteeQuotaRatio: number;
      ldceQuotaRatio?: number;
      rotationMethod: RotationMethod;
      rotationStartSlot?: RotationStartSlot;
      unfilledQuotaCarryForward?: boolean;
      policyReference?: string;
    }
  ): SeniorityQuotaRule {
    this.authorization.check(actor, "g06.seniority.write", actor);
    const ldceQuotaRatio = input.ldceQuotaRatio ?? 0;
    const ratios = [input.drQuotaRatio, input.promoteeQuotaRatio, ldceQuotaRatio];
    if (ratios.some((ratio) => !Number.isInteger(ratio) || ratio < 0) || input.drQuotaRatio + input.promoteeQuotaRatio + ldceQuotaRatio < 1) {
      throw new FoundationError("QUOTA_RULE_INVALID", "Quota ratios must be non-negative integers with at least one positive stream ratio (FR-PPP-020)", {
        field: "drQuotaRatio",
        details: { drQuotaRatio: input.drQuotaRatio, promoteeQuotaRatio: input.promoteeQuotaRatio, ldceQuotaRatio },
      });
    }
    if (input.rotationMethod !== "ROTA_QUOTA" && input.rotationMethod !== "RUNNING_ACCOUNT" && input.rotationMethod !== "SEPARATE_STREAM") {
      throw new FoundationError("QUOTA_RULE_INVALID", "rotation_method must be ROTA_QUOTA, RUNNING_ACCOUNT or SEPARATE_STREAM", {
        field: "rotationMethod",
        details: { rotationMethod: input.rotationMethod },
      });
    }
    const rotationStartSlot = input.rotationStartSlot ?? "DR_FIRST";
    if (rotationStartSlot !== "DR_FIRST" && rotationStartSlot !== "PROMOTEE_FIRST") {
      throw new FoundationError("QUOTA_RULE_INVALID", "rotation_start_slot must be DR_FIRST or PROMOTEE_FIRST", {
        field: "rotationStartSlot",
        details: { rotationStartSlot },
      });
    }
    const rule: SeniorityQuotaRule = {
      id: nextId("seniority-quota-rule", this.promotionDepth.countQuotaRules()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      ruleCode: input.ruleCode,
      cadreId: input.cadreId ?? "cadre-default",
      gradeDesignationId: input.gradeDesignationId,
      drQuotaRatio: input.drQuotaRatio,
      promoteeQuotaRatio: input.promoteeQuotaRatio,
      ldceQuotaRatio,
      rotationMethod: input.rotationMethod,
      rotationStartSlot,
      unfilledQuotaCarryForward: input.unfilledQuotaCarryForward ?? true,
      policyReference: input.policyReference,
      isActive: true,
    };
    this.promotionDepth.saveSeniorityQuotaRule(rule);
    this.audit.recordMutation(actor, {
      action: "G06_SENIORITY_QUOTA_RULE_DEFINED",
      subjectRef: `g06_seniority_quota_rules:${rule.id}`,
      metadata: { ruleCode: rule.ruleCode, rotationMethod: rule.rotationMethod, rotationStartSlot: rule.rotationStartSlot },
    });
    return { ...rule };
  }

  /**
   * FR-PPP-020 AC-2/3/4 (Appendix D.4, N.R. Parmar line): deterministic multi-stream combined
   * seniority construction. Vacancy slots rotate across streams per the effective quota rule
   * (ROTA_QUOTA slot-by-slot; RUNNING_ACCOUNT reconciling deficiencies across cycles;
   * SEPARATE_STREAM without interleave); each slot draws the next senior-most member of its
   * stream; each placed entry records its quota_slot_label and rotation_cycle_no; an unfilled
   * stream slot is recorded in the rotation trace as carried forward — never silently lost.
   * A population entry without its stream tag fails closed with STREAM_TAG_MISSING.
   */
  constructCombinedSeniority(
    actor: ActorContext,
    input: {
      quotaRuleId: string;
      cadreId?: string;
      population: Array<{ employeeId: string; recruitmentStream?: string; streamSeniorityNo?: number }>;
    }
  ): CombinedSeniorityConstruction {
    this.authorization.check(actor, "g06.seniority.write", actor);
    const rule = this.promotionDepth.findSeniorityQuotaRule(actor, input.quotaRuleId);
    if (!rule) {
      throw new FoundationError("NOT_FOUND", "Seniority quota rule not found");
    }
    if (!rule.isActive) {
      throw new FoundationError("QUOTA_RULE_INVALID", "Seniority quota rule is not active on the as-on date", { field: "quotaRuleId" });
    }
    if (input.population.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one population entry is required", { field: "population" });
    }
    // Edge case (FR-PPP-020): legacy data missing stream/quota history fails closed for tagging.
    const untagged = input.population.find(
      (entry) => entry.recruitmentStream !== "DIRECT" && entry.recruitmentStream !== "PROMOTEE" && entry.recruitmentStream !== "LDCE"
    );
    if (untagged) {
      throw new FoundationError("STREAM_TAG_MISSING", "Population entry has no recruitment-stream tag — flag for manual stream tagging (FR-PPP-020)", {
        field: "population",
        details: { employeeId: untagged.employeeId, recruitmentStream: untagged.recruitmentStream },
      });
    }
    // Deterministic stream-internal order: streamSeniorityNo, then employeeId as tie-break.
    const queues: Record<RecruitmentStream, string[]> = { DIRECT: [], PROMOTEE: [], LDCE: [] };
    for (const stream of Object.keys(queues) as RecruitmentStream[]) {
      queues[stream] = input.population
        .map((entry, index) => ({ ...entry, index }))
        .filter((entry) => entry.recruitmentStream === stream)
        .sort((left, right) => (left.streamSeniorityNo ?? left.index) - (right.streamSeniorityNo ?? right.index) || left.employeeId.localeCompare(right.employeeId))
        .map((entry) => entry.employeeId);
    }
    const { entries, trace } = runRotaQuotaConstruction(rule, queues);
    const construction: CombinedSeniorityConstruction = {
      id: nextId("combined-seniority", this.promotionDepth.countCombinedConstructions()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      quotaRuleId: rule.id,
      cadreId: input.cadreId ?? rule.cadreId,
      entries,
      trace,
    };
    this.promotionDepth.saveCombinedSeniorityConstruction(construction);
    this.audit.recordMutation(actor, {
      action: "G06_COMBINED_SENIORITY_CONSTRUCTED",
      subjectRef: `g06_combined_seniority_constructions:${construction.id}`,
      metadata: {
        quotaRuleId: rule.id,
        rotationMethod: rule.rotationMethod,
        entries: entries.length,
        carriedForwardSlots: trace.filter((slot) => slot.carriedForward).length,
      },
    });
    return {
      ...construction,
      entries: construction.entries.map((entry) => ({ ...entry })),
      trace: construction.trace.map((slot) => ({ ...slot })),
    };
  }

  /** FR-PPP-020: retrievable rotation trace — which quota slot each cycle issued and to whom. */
  getRotationTrace(scope: TenantScope, constructionId: string): { constructionId: string; quotaRuleId: string; trace: RotationTraceSlot[] } {
    requireTenantScope(scope);
    const construction = this.promotionDepth.findCombinedSeniorityConstruction(scope, constructionId);
    if (!construction) {
      throw new FoundationError("NOT_FOUND", "Combined seniority construction not found");
    }
    return { constructionId: construction.id, quotaRuleId: construction.quotaRuleId, trace: construction.trace };
  }

  getCombinedSeniorityConstruction(scope: TenantScope, constructionId: string): CombinedSeniorityConstruction {
    requireTenantScope(scope);
    const construction = this.promotionDepth.findCombinedSeniorityConstruction(scope, constructionId);
    if (!construction) {
      throw new FoundationError("NOT_FOUND", "Combined seniority construction not found");
    }
    return construction;
  }

  /**
   * FR-004: creates the case, reconciles vacancies against sanctioned_posts, and assembles the
   * zone of consideration with the PINNED non-linear slab (Appendix D.1: 5 if v=1; 8 if v=2;
   * 3×v if v≥3) on the crucial date. Reserved-category candidates get the extended zone where
   * the roster requires. Field assembly enforces the refusal debarment window (§5.6-18):
   * re-consideration before next_consideration_after fails closed with EMPLOYEE_DEBARRED.
   */
  createPromotionCase(
    actor: ActorContext,
    input: {
      seniorityListId: string;
      vacancies: number;
      fromDesignation: string;
      toDesignation: string;
      sanctionedPostId?: string;
      /** FR-004 crucial date — defaults to the seniority list effective date. */
      crucialDate?: string;
      /** Reserved-category candidates eligible for the extended zone (roster-driven). */
      reservedCategoryEmployeeIds?: string[];
      /** Extra extended-zone slots for reserved categories (policy factor, Appendix D.1). */
      extendedZoneSlots?: number;
    }
  ): PromotionCase {
    this.authorization.check(actor, "g06.promotion.case.write", actor);
    const list = this.requireSeniorityList(actor, input.seniorityListId);
    if (list.status !== "FINALISED") {
      // BRD §9.4: a promotion case needs a FINALISED seniority list — 409 SENIORITY_LIST_NOT_FINAL.
      throw new FoundationError("SENIORITY_LIST_NOT_FINAL", "Promotion case requires a finalised seniority list", {
        field: "seniorityListId",
        details: { seniorityListId: list.id, status: list.status },
      });
    }
    if (input.vacancies < 1) {
      throw new FoundationError("VALIDATION_FAILED", "vacancies must be at least 1", { field: "vacancies" });
    }
    if (input.sanctionedPostId) {
      // VAL-G06-VACANCY-RECON: the case vacancy figure must equal the promotion-quota vacancies
      // computed from the linked sanctioned_posts register — never a free-typed number.
      const computation = this.getVacancyComputation(actor, input.sanctionedPostId);
      if (input.vacancies !== computation.promotionQuotaVacancies) {
        throw new FoundationError("VACANCY_NOT_RECONCILED", "Case vacancies do not equal the promotion-quota vacancies computed from sanctioned_posts", {
          field: "vacancies",
          details: {
            requestedVacancies: input.vacancies,
            promotionQuotaVacancies: computation.promotionQuotaVacancies,
            currentVacancies: computation.currentVacancies,
            sanctionedPostId: computation.sanctionedPostId,
          },
        });
      }
    }
    const crucialDate = input.crucialDate ?? list.effectiveDate;
    // Appendix D.1 pinned slab — configurable in policy, pinned to the worked vector here.
    const zoneSize = zoneOfConsiderationSlab(input.vacancies);
    const extendedZoneSlots = input.extendedZoneSlots ?? 0;
    const reservedCategoryIds = new Set(input.reservedCategoryEmployeeIds ?? []);
    const candidates: PromotionCandidate[] = list.entries
      .map((entry): PromotionCandidate => {
        const zone: ZoneOfConsideration =
          entry.rank <= zoneSize
            ? "IN_ZONE"
            : reservedCategoryIds.has(entry.employeeId) && entry.rank <= zoneSize + extendedZoneSlots
              ? "EXTENDED_ZONE"
              : "OUT_OF_ZONE";
        return { employeeId: entry.employeeId, rank: entry.rank, fitness: "PENDING", zoneOfConsideration: zone, isSelected: false };
      })
      .filter((candidate) => candidate.zoneOfConsideration !== "OUT_OF_ZONE");
    for (const candidate of candidates) {
      // §5.6-18: while a refusal is ACTIVE, the employee is barred from re-consideration
      // before next_consideration_after — fail closed, never silently include.
      const refusal = this.promotionDepth.findActiveRefusal(actor, candidate.employeeId, crucialDate);
      if (refusal) {
        throw new FoundationError("EMPLOYEE_DEBARRED", "Employee is within the refusal debarment window and cannot be re-considered", {
          field: "seniorityListId",
          details: {
            employeeId: candidate.employeeId,
            debarmentUntil: refusal.debarmentUntil,
            nextConsiderationAfter: refusal.nextConsiderationAfter,
            refusalId: refusal.id,
          },
        });
      }
    }
    const promotionCase: PromotionCase = {
      id: nextId("promotion-case", this.promotionCases.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseNo: `DPC/${list.effectiveDate.slice(0, 4)}/${String(this.promotionCases.length + 1).padStart(5, "0")}`,
      seniorityListId: list.id,
      sanctionedPostId: input.sanctionedPostId,
      fromDesignation: input.fromDesignation,
      toDesignation: input.toDesignation,
      vacancies: input.vacancies,
      crucialDate,
      zoneSize,
      status: "ELIGIBILITY_DONE",
      candidates,
    };
    this.promotionCases.push(promotionCase);
    this.audit.recordMutation(actor, {
      action: "G06_PROMOTION_CASE_CREATED",
      subjectRef: `g06_promotion_cases:${promotionCase.id}`,
      metadata: { candidates: candidates.length, zoneSize, crucialDate },
    });
    return this.clonePromotionCase(promotionCase);
  }

  /**
   * FR-005 DPC adjudication. Maker≠checker SoD (§5.6-8): a candidate on the case cannot sit on
   * its panel unless RECUSED — violation is PANEL_CONFLICT_OF_INTEREST. Quorum failure is
   * QUORUM_NOT_MET. A supersession citing an APAR year the usability gate rejected (§5.6-16)
   * is APAR_NOT_USABLE. All three are BRD §9.4 domain codes thrown as the error's `code`.
   */
  holdDpc(
    actor: ActorContext,
    promotionCaseId: string,
    input: {
      panelMembers: DpcPanelMember[];
      recusedEmployeeIds?: string[];
      quorumRequired?: number;
      /** DPC supersessions — each must cite a USABLE adverse APAR year (§5.6-16). */
      supersessions?: Array<{ employeeId: string; citedAparYear: string }>;
    }
  ): PromotionCase {
    this.authorization.check(actor, "g06.dpc.hold", actor);
    const promotionCase = this.requirePromotionCase(actor, promotionCaseId);
    const recused = input.recusedEmployeeIds ?? [];
    const candidateIds = new Set(promotionCase.candidates.map((candidate) => candidate.employeeId));
    const conflicted = input.panelMembers.find((member) => member.employeeId && candidateIds.has(member.employeeId) && !recused.includes(member.employeeId));
    if (conflicted) {
      throw new FoundationError("PANEL_CONFLICT_OF_INTEREST", "A candidate on this case cannot be a DPC panel member unless recused (P02 SoD)", {
        field: "panelMembers",
        details: { employeeId: conflicted.employeeId },
      });
    }
    const participatingMembers = input.panelMembers.filter((member) => !member.employeeId || !recused.includes(member.employeeId)).length;
    const quorumRequired = input.quorumRequired ?? 2;
    if (participatingMembers < quorumRequired) {
      throw new FoundationError("QUORUM_NOT_MET", "DPC quorum is not met", {
        field: "panelMembers",
        details: { participatingMembers, quorumRequired },
      });
    }
    const superseded = new Set<string>();
    for (const supersession of input.supersessions ?? []) {
      // §5.6-16: the DPC verdict cannot record a supersession citing an unusable APAR entry.
      const assessment = this.eligibilityAssessments.get(`${supersession.employeeId}:${promotionCase.toDesignation}`)
        ?? [...this.eligibilityAssessments.values()].find((item) => item.employeeId === supersession.employeeId);
      const citedIsUsable = assessment?.aparGate.usableAdverseYears.includes(supersession.citedAparYear) ?? false;
      if (!citedIsUsable) {
        throw new FoundationError("APAR_NOT_USABLE", "Supersession cites an APAR year that fails the usability gate (uncommunicated or representation pending)", {
          field: "supersessions",
          details: { employeeId: supersession.employeeId, citedAparYear: supersession.citedAparYear },
        });
      }
      superseded.add(supersession.employeeId);
    }
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G06-DPC-PARALLEL_ALL_OF",
      subjectRef: `g06_promotion_cases:${promotionCase.id}`,
      stage: "DPC_PANEL",
      resolverRule: { mechanism: "COMMITTEE", committeeCode: "PH02-DPC-REVENUE", subjectEmployeeId: promotionCase.candidates[0]?.employeeId },
      asOf: "2026-07-02",
    });
    this.workflow.act(actor, { taskId: started.task.id, action: "APPROVE" });
    promotionCase.status = "DPC_HELD";
    promotionCase.candidates = promotionCase.candidates.map((candidate) => ({
      ...candidate,
      fitness: superseded.has(candidate.employeeId) ? "UNFIT" : "FIT",
    }));
    // §5.6-5 vacancy cap: select the top FIT candidates by rank, never beyond the case vacancies.
    let remaining = promotionCase.vacancies;
    promotionCase.candidates = promotionCase.candidates
      .sort((left, right) => left.rank - right.rank)
      .map((candidate) => {
        const select = candidate.fitness === "FIT" && remaining > 0;
        if (select) {
          remaining -= 1;
        }
        return { ...candidate, isSelected: select };
      });
    promotionCase.dpc = {
      quorumRequired,
      participatingMembers,
      recusedEmployeeIds: [...recused],
      verdict: "FIT_PANEL",
      workflowInstanceId: started.instance.id,
    };
    this.audit.recordMutation(actor, {
      action: "G06_DPC_HELD",
      subjectRef: `g06_promotion_cases:${promotionCase.id}`,
      metadata: { participatingMembers, quorumRequired, recusedEmployeeIds: recused, supersededCount: superseded.size },
    });
    return this.clonePromotionCase(promotionCase);
  }

  issuePromotionOrders(actor: ActorContext, promotionCaseId: string): PromotionOrder[] {
    this.authorization.check(actor, "g06.promotion.order.issue", actor);
    const promotionCase = this.requirePromotionCase(actor, promotionCaseId);
    if (promotionCase.status !== "DPC_HELD") {
      throw new FoundationError("PRECONDITION_FAILED", "DPC must be held before orders are issued");
    }
    const orders = promotionCase.candidates
      // §5.6-7: an order requires a FIT verdict AND selection within the vacancy cap.
      .filter((candidate) => candidate.fitness === "FIT" && candidate.isSelected)
      .map((candidate) => {
        const document = this.documentVault.createDocument(actor, {
          title: `Promotion Order ${promotionCase.caseNo} ${candidate.employeeId}`,
          ownerEmployeeId: candidate.employeeId,
          classification: "CONFIDENTIAL",
          contentHash: pseudoHash64(stableStringify({ caseNo: promotionCase.caseNo, employeeId: candidate.employeeId })),
          isWorm: true,
        });
        const attached = this.documentVault.attach(actor, document.id, {
          moduleCode: "G06",
          entityName: "promotion_orders",
          entityRefId: promotionCase.id,
          linkRole: "PROMOTION_ORDER",
        });
        const order: PromotionOrder = {
          id: nextId("promotion-order", this.promotionOrders.length),
          tenantId: actor.tenantId,
          entityId: actor.entityId,
          orderNo: `PO/${String(this.promotionOrders.length + 1).padStart(5, "0")}`,
          promotionCaseId: promotionCase.id,
          employeeId: candidate.employeeId,
          fromDesignation: promotionCase.fromDesignation,
          toDesignation: promotionCase.toDesignation,
          status: "ISSUED",
          documentId: attached.id,
        };
        this.promotionOrders.push(order);
        return this.clonePromotionOrder(order);
      });
    promotionCase.status = "ORDERS_ISSUED";
    this.audit.recordMutation(actor, { action: "G06_PROMOTION_ORDERS_ISSUED", subjectRef: `g06_promotion_cases:${promotionCase.id}`, metadata: { count: orders.length } });
    return orders;
  }

  /**
   * FR-007 effecting: blocked while sub judice (§5.6-20 — an active interim stay on the order
   * or its case is ENTITY_SUB_JUDICE), posts the idempotent G12 SR event, and AUTO-CREATES the
   * probation record (§5.6-11: scheduled_end = probation_start + probation_months, ON_PROBATION)
   * in the same logical transaction as the order transition.
   */
  effectPromotionOrder(
    actor: ActorContext,
    promotionOrderId: string,
    input: { effectDate: string; idempotencyKey: string; probationMonths?: number }
  ): { order: PromotionOrder; srEventId: string; payImpactSignal: G06PayImpactSignal; probation: ProbationRecord } {
    this.authorization.check(actor, "g06.promotion.order.effect", actor);
    const order = this.requirePromotionOrder(actor, promotionOrderId);
    if (order.status !== "ISSUED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only issued promotion orders can be effected");
    }
    this.requireNotSubJudice(actor, order);
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G06",
      sourceReferenceId: `g06_promotion_orders:${order.id}:EFFECTED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "PROMOTION_EFFECTED",
      eventDate: input.effectDate,
      factKey: `G06:${order.id}:PROMOTION_EFFECTED`,
      orderNo: order.orderNo,
      payload: { fromDesignation: order.fromDesignation, toDesignation: order.toDesignation },
      documentIds: [order.documentId],
    });
    order.status = "EFFECTED";
    order.srEventId = sr.event.id;
    const probationMonths = input.probationMonths ?? 24;
    const probation: ProbationRecord = {
      id: nextId("probation-record", this.promotionDepth.countProbations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      promotionOrderId: order.id,
      employeeId: order.employeeId,
      probationStart: input.effectDate,
      probationMonths,
      scheduledEnd: addMonthsIso(input.effectDate, probationMonths),
      status: "ON_PROBATION",
    };
    this.promotionDepth.saveProbation(probation);
    const signal = this.addPayImpactSignal(actor, { sourceRef: order.id, kind: "PROMOTION", employeeId: order.employeeId });
    this.audit.recordMutation(actor, {
      action: "G06_PROMOTION_EFFECTED",
      subjectRef: `g06_promotion_orders:${order.id}`,
      metadata: { srEventId: sr.event.id, probationRecordId: probation.id, scheduledEnd: probation.scheduledEnd },
    });
    this.employeeMaster.getById(actor, order.employeeId);
    return { order: this.clonePromotionOrder(order), srEventId: sr.event.id, payImpactSignal: signal, probation: { ...probation } };
  }

  /**
   * FR-019 refusal consequence: a DECLINED order transactionally creates the promotion_refusals
   * row with the debarment window (debarment_until = refusal_date + debarment_months) and the
   * MACP-clock effect; re-consideration inside the window fails with EMPLOYEE_DEBARRED (§5.6-18).
   */
  declinePromotionOrder(
    actor: ActorContext,
    promotionOrderId: string,
    input: { refusalDate: string; refusalReason?: string; debarmentMonths?: number; macpClockEffect?: MacpClockEffect }
  ): { order: PromotionOrder; refusal: PromotionRefusal } {
    this.authorization.check(actor, "g06.promotion.order.effect", actor);
    const order = this.requirePromotionOrder(actor, promotionOrderId);
    if (order.status !== "ISSUED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only issued promotion orders can be declined");
    }
    const debarmentMonths = input.debarmentMonths ?? 12;
    const debarmentUntil = addMonthsIso(input.refusalDate, debarmentMonths);
    const refusal: PromotionRefusal = {
      id: nextId("promotion-refusal", this.promotionDepth.countRefusals()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      promotionOrderId: order.id,
      employeeId: order.employeeId,
      refusalDate: input.refusalDate,
      refusalReason: input.refusalReason,
      debarmentMonths,
      debarmentUntil,
      nextConsiderationAfter: debarmentUntil,
      macpClockEffect: input.macpClockEffect ?? "STOP",
      refusalEffectApplied: true,
      status: "ACTIVE",
    };
    order.status = "DECLINED";
    this.promotionDepth.saveRefusal(refusal);
    this.audit.recordMutation(actor, {
      action: "G06_PROMOTION_REFUSED",
      subjectRef: `g06_promotion_refusals:${refusal.id}`,
      metadata: { promotionOrderId: order.id, debarmentUntil, macpClockEffect: refusal.macpClockEffect },
    });
    return { order: this.clonePromotionOrder(order), refusal: { ...refusal } };
  }

  /** Post-full-review-goal fix: this took a bare employeeId with no ownership check — any actor
   *  holding `g06.promotion.read` could read any other employee's refusal/debarment history. */
  listPromotionRefusals(actor: ActorContext, employeeId: string): PromotionRefusal[] {
    requireTenantScope(actor);
    this.assertSelfOrPromotionOverride(actor, employeeId);
    return this.promotionDepth.listRefusals(actor, employeeId);
  }

  listProbationRecords(actor: ActorContext, employeeId: string): ProbationRecord[] {
    requireTenantScope(actor);
    this.assertSelfOrPromotionOverride(actor, employeeId);
    return this.promotionDepth.listProbations(actor, employeeId);
  }

  /** §5.6-20 sub-judice guard: an active interim stay on the order or its case blocks effecting. */
  private requireNotSubJudice(scope: TenantScope, order: PromotionOrder): void {
    const stay =
      this.promotionDepth.findActiveStay(scope, "PROMOTION_ORDER", order.id) ??
      this.promotionDepth.findActiveStay(scope, "PROMOTION_CASE", order.promotionCaseId);
    if (stay) {
      throw new FoundationError("ENTITY_SUB_JUDICE", "This can't be done because a required condition isn't met: active interim stay", {
        field: "order_id",
        details: { legalCaseLinkId: stay.id, caseReference: stay.caseReference, linkedEntityType: stay.linkedEntityType },
      });
    }
  }

  effectMacp(actor: ActorContext, input: { employeeId: string; level: string; dueDate: string; effectDate: string; idempotencyKey: string }): { macp: MacpCase; srEventId: string; payImpactSignal: G06PayImpactSignal } {
    this.authorization.check(actor, "g06.macp.effect", actor);
    this.employeeMaster.getById(actor, input.employeeId);
    // §5.6-10 MACP cap: at most 3 financial up-gradations in a career; each EFFECTED regular
    // promotion reduces the remaining MACP entitlement (it is not a combined ≤3 cap on both).
    const effectedMacp = this.macpCases.filter((item) => item.employeeId === input.employeeId && item.status === "EFFECTED" && this.inScope(item, actor)).length;
    const effectedPromotions = this.promotionOrders.filter((item) => item.employeeId === input.employeeId && item.status === "EFFECTED" && this.inScope(item, actor)).length;
    if (effectedMacp >= 3 || effectedMacp + effectedPromotions >= 3) {
      throw new FoundationError("PRECONDITION_FAILED", "MACP entitlement exhausted: career cap is 3 up-gradations and regular promotions reduce the remaining entitlement", {
        field: "employeeId",
        details: { effectedMacp, effectedPromotions, careerCap: 3 },
      });
    }
    // §5.6-18: an ACTIVE refusal applies its recorded MACP-clock effect before any sanction.
    const activeRefusal = this.promotionDepth.findActiveRefusal(actor, input.employeeId, input.effectDate);
    if (activeRefusal && activeRefusal.macpClockEffect !== "NONE") {
      throw new FoundationError("PRECONDITION_FAILED", "MACP clock is stopped/forfeited by an active promotion refusal", {
        field: "employeeId",
        details: { refusalId: activeRefusal.id, macpClockEffect: activeRefusal.macpClockEffect, debarmentUntil: activeRefusal.debarmentUntil },
      });
    }
    const macp: MacpCase = {
      id: nextId("macp", this.macpCases.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      level: input.level,
      dueDate: input.dueDate,
      status: "SANCTIONED",
    };
    this.macpCases.push(macp);
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G06",
      sourceReferenceId: `g06_macp:${macp.id}:EFFECTED`,
      sourceEventVersion: 1,
      employeeId: input.employeeId,
      eventTypeCode: "MACP_EFFECTED",
      eventDate: input.effectDate,
      factKey: `G06:${macp.id}:MACP_EFFECTED`,
      payload: { level: input.level, dueDate: input.dueDate },
      documentIds: [],
    });
    macp.status = "EFFECTED";
    macp.srEventId = sr.event.id;
    const signal = this.addPayImpactSignal(actor, { sourceRef: macp.id, kind: "MACP", employeeId: input.employeeId });
    this.notifications.publish(actor, { recipientEmployeeId: input.employeeId, messageId: "G06_MACP_EFFECTED", channel: "IN_APP", relatedRef: `g06_macp:${macp.id}`, mergeFields: { level: input.level } });
    return { macp: { ...macp }, srEventId: sr.event.id, payImpactSignal: signal };
  }

  // -------------------------------------------------------------------------------------
  // FR-PPP-006: reservation_rosters + roster_points with own-merit migration (§5.6-6)
  // -------------------------------------------------------------------------------------

  /** Creates the reservation roster register and its points (maker≠checker, Nagaraj justification). */
  createReservationRoster(
    actor: ActorContext,
    input: {
      rosterNo: string;
      cadreId: string;
      gradeDesignationId: string;
      rosterType?: RosterType;
      cycleSize?: number;
      policyVersion?: string;
      rosterApplicable?: boolean;
      enablingProvisionRef?: string;
      quantifiableDataDocId?: string;
      consequentialSeniorityMode?: ConsequentialSeniorityMode;
      approverActorId: string;
      points: Array<{ pointNumber: number; reservedFor: ReservationCategory }>;
    }
  ): { roster: ReservationRoster; points: RosterPoint[] } {
    this.authorization.check(actor, "g06.roster.write", actor);
    this.requireDistinctApprover(actor, input.approverActorId, "reservation roster creation");
    if (input.points.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "A reservation roster needs at least one roster point", { field: "points" });
    }
    const seen = new Set<number>();
    for (const point of input.points) {
      if (seen.has(point.pointNumber)) {
        throw new FoundationError("VALIDATION_FAILED", "Roster point numbers must be unique", { field: "points", details: { pointNumber: point.pointNumber } });
      }
      seen.add(point.pointNumber);
    }
    const roster: ReservationRoster = {
      id: nextId("reservation-roster", this.promotionDepth.countRosters()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      rosterNo: input.rosterNo,
      cadreId: input.cadreId,
      gradeDesignationId: input.gradeDesignationId,
      rosterType: input.rosterType ?? "PROMOTION_RESERVATION",
      cycleSize: input.cycleSize ?? input.points.length,
      policyVersion: input.policyVersion ?? "roster-policy-1.0",
      rosterApplicable: input.rosterApplicable ?? true,
      enablingProvisionRef: input.enablingProvisionRef,
      quantifiableDataDocId: input.quantifiableDataDocId,
      consequentialSeniorityMode: input.consequentialSeniorityMode ?? "CATCH_UP",
      status: "ACTIVE",
      makerActorId: actor.userId,
      approverActorId: input.approverActorId,
    };
    this.promotionDepth.saveRoster(roster);
    const points = input.points.map((point) => {
      const row: RosterPoint = {
        id: nextId("roster-point", this.promotionDepth.countRosterPoints()),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        rosterId: roster.id,
        pointNumber: point.pointNumber,
        reservedFor: point.reservedFor,
        status: "VACANT",
      };
      this.promotionDepth.saveRosterPoint(row);
      return row;
    });
    this.audit.recordMutation(actor, {
      action: "G06_RESERVATION_ROSTER_CREATED",
      subjectRef: `g06_reservation_rosters:${roster.id}`,
      metadata: { rosterNo: roster.rosterNo, points: points.length, makerActorId: roster.makerActorId, approverActorId: roster.approverActorId },
    });
    return { roster: { ...roster }, points: points.map((point) => ({ ...point })) };
  }

  /**
   * FR-006 point occupation with own-merit migration (§5.6-6):
   *   - a reserved candidate selected on own merit MUST occupy an unreserved (GEN) point and is
   *     counted against GEN (adjusted_against_category=GEN) — a reserved point is never consumed;
   *     placing them on a reserved point fails with OWN_MERIT_MIGRATION_REQUIRED;
   *   - double-fill fails with ROSTER_POINT_OCCUPIED; a reserved point cannot be filled by a
   *     non-matching category (ROSTER_CATEGORY_MISMATCH).
   */
  fillRosterPoint(
    actor: ActorContext,
    rosterId: string,
    input: {
      pointNumber: number;
      employeeId: string;
      candidateCategory: ReservationCategory;
      selectedOnOwnMerit?: boolean;
      promotionCaseId?: string;
    }
  ): RosterPoint {
    this.authorization.check(actor, "g06.roster.write", actor);
    const roster = this.promotionDepth.findRoster(actor, rosterId);
    if (!roster) {
      throw new FoundationError("NOT_FOUND", "Reservation roster not found");
    }
    const point = this.promotionDepth.findRosterPoint(actor, rosterId, input.pointNumber);
    if (!point) {
      throw new FoundationError("NOT_FOUND", "Roster point not found");
    }
    if (point.status !== "VACANT") {
      throw new FoundationError("ROSTER_POINT_OCCUPIED", "Roster point is already occupied", {
        field: "pointNumber",
        details: { pointNumber: point.pointNumber, status: point.status, filledByEmployeeId: point.filledByEmployeeId },
      });
    }
    const ownMerit = input.selectedOnOwnMerit ?? false;
    if (ownMerit && point.reservedFor !== "GEN") {
      throw new FoundationError("OWN_MERIT_MIGRATION_REQUIRED", "Own-merit reserved candidate must migrate to an unreserved (GEN) point — the reserved point is not consumed", {
        field: "pointNumber",
        details: { pointNumber: point.pointNumber, reservedFor: point.reservedFor, employeeId: input.employeeId },
      });
    }
    if (!ownMerit && point.reservedFor !== "GEN" && point.reservedFor !== input.candidateCategory) {
      throw new FoundationError("ROSTER_CATEGORY_MISMATCH", "A reserved point cannot be filled by a non-matching category without de-reservation authority", {
        field: "candidateCategory",
        details: { reservedFor: point.reservedFor, candidateCategory: input.candidateCategory },
      });
    }
    const filled: RosterPoint = {
      ...point,
      status: "FILLED",
      filledByEmployeeId: input.employeeId,
      filledInCaseId: input.promotionCaseId,
      // Own-merit migration: the fill is counted against GEN, preserving the reserved tally.
      adjustedAgainstCategory: ownMerit ? "GEN" : point.reservedFor,
    };
    this.promotionDepth.saveRosterPoint(filled);
    this.audit.recordMutation(actor, {
      action: "G06_ROSTER_POINT_FILLED",
      subjectRef: `g06_roster_points:${filled.id}`,
      metadata: {
        pointNumber: filled.pointNumber,
        reservedFor: filled.reservedFor,
        adjustedAgainstCategory: filled.adjustedAgainstCategory,
        selectedOnOwnMerit: ownMerit,
      },
    });
    return { ...filled };
  }

  /** FR-006 AC-3 compliance report: per-category tallies with own-merit migrations itemised. */
  getRosterCompliance(scope: TenantScope, rosterId: string): {
    rosterId: string;
    points: RosterPoint[];
    filledByAdjustedCategory: Record<string, number>;
    ownMeritMigrations: Array<{ pointNumber: number; employeeId?: string }>;
  } {
    requireTenantScope(scope);
    const points = this.promotionDepth.listRosterPoints(scope, rosterId);
    const filledByAdjustedCategory: Record<string, number> = {};
    const ownMeritMigrations: Array<{ pointNumber: number; employeeId?: string }> = [];
    for (const point of points) {
      if (point.status !== "FILLED" || !point.adjustedAgainstCategory) {
        continue;
      }
      filledByAdjustedCategory[point.adjustedAgainstCategory] = (filledByAdjustedCategory[point.adjustedAgainstCategory] ?? 0) + 1;
      if (point.adjustedAgainstCategory === "GEN" && point.reservedFor === "GEN" && point.filledByEmployeeId) {
        // Own-merit migrations are GEN-adjusted fills; itemise them for the compliance report.
        ownMeritMigrations.push({ pointNumber: point.pointNumber, employeeId: point.filledByEmployeeId });
      }
    }
    return { rosterId, points, filledByAdjustedCategory, ownMeritMigrations };
  }

  // -------------------------------------------------------------------------------------
  // FR-PPP-017: legal-case linkage & sub-judice handling (§5.6-20)
  // -------------------------------------------------------------------------------------

  /** Attaches a court/tribunal reference; interim_stay=true transitions the entity to INTERIM_STAYED. */
  attachLegalCaseLink(
    actor: ActorContext,
    input: {
      linkedEntityType: LegalLinkedEntityType;
      linkedEntityRefId: string;
      forum: LegalForum;
      caseReference: string;
      petitioner?: string;
      interimStay?: boolean;
      stayFromDate?: string;
      subjectToOutcome?: boolean;
    }
  ): LegalCaseLink {
    this.authorization.check(actor, "g06.legal.write", actor);
    const interimStay = input.interimStay ?? false;
    const link: LegalCaseLink = {
      id: nextId("legal-case-link", this.promotionDepth.countLegalCaseLinks()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      linkNo: `LCL/${String(this.promotionDepth.countLegalCaseLinks() + 1).padStart(5, "0")}`,
      linkedEntityType: input.linkedEntityType,
      linkedEntityRefId: input.linkedEntityRefId,
      forum: input.forum,
      caseReference: input.caseReference,
      petitioner: input.petitioner,
      interimStay,
      stayFromDate: input.stayFromDate,
      subjectToOutcome: input.subjectToOutcome ?? false,
      status: interimStay ? "INTERIM_STAYED" : "FILED",
    };
    this.promotionDepth.saveLegalCaseLink(link);
    this.audit.recordMutation(actor, {
      action: "G06_LEGAL_CASE_LINKED",
      subjectRef: `g06_legal_case_links:${link.id}`,
      metadata: { linkedEntityType: link.linkedEntityType, linkedEntityRefId: link.linkedEntityRefId, interimStay, caseReference: link.caseReference },
    });
    return { ...link };
  }

  /** A vacated stay clears INTERIM_STAYED and restores effecting (FR-017 business rule). */
  vacateInterimStay(actor: ActorContext, legalCaseLinkId: string, input: { stayToDate: string }): LegalCaseLink {
    this.authorization.check(actor, "g06.legal.write", actor);
    const link = this.promotionDepth.findLegalCaseLink(actor, legalCaseLinkId);
    if (!link) {
      throw new FoundationError("NOT_FOUND", "Legal case link not found");
    }
    if (!link.interimStay) {
      throw new FoundationError("PRECONDITION_FAILED", "No active interim stay to vacate on this legal case link");
    }
    const vacated: LegalCaseLink = { ...link, interimStay: false, stayToDate: input.stayToDate, status: "PENDING" };
    this.promotionDepth.saveLegalCaseLink(vacated);
    this.audit.recordMutation(actor, {
      action: "G06_INTERIM_STAY_VACATED",
      subjectRef: `g06_legal_case_links:${vacated.id}`,
      metadata: { stayToDate: input.stayToDate },
    });
    return { ...vacated };
  }

  /** Post-full-review-goal fix: was a tenant-wide dump with no per-employee filter at all — any
   *  actor holding `g06.promotion.read` saw every employee's promotion orders. Non-override
   *  actors now see only their own, matching the `listOrders`/self-scoping pattern G05 already
   *  established for this bug class. */
  listPromotionOrders(actor: ActorContext): PromotionOrder[] {
    requireTenantScope(actor);
    const inTenant = this.promotionOrders.filter((order) => this.inScope(order, actor)).map((order) => this.clonePromotionOrder(order));
    return this.isPromotionAccessOverride(actor) ? inTenant : inTenant.filter((order) => order.employeeId === actor.userId);
  }

  listPayImpactSignals(scope: TenantScope): G06PayImpactSignal[] {
    requireTenantScope(scope);
    return this.payImpactSignals.filter((signal) => this.employeeInScope(signal.employeeId, scope)).map((signal) => ({ ...signal }));
  }

  summary(scope: TenantScope): { seniorityLists: number; promotionOrders: number; macpEffected: number; paySignalsReady: number } {
    requireTenantScope(scope);
    return {
      seniorityLists: this.seniorityLists.filter((list) => this.inScope(list, scope)).length,
      promotionOrders: this.promotionOrders.filter((order) => this.inScope(order, scope)).length,
      macpEffected: this.macpCases.filter((macp) => this.inScope(macp, scope) && macp.status === "EFFECTED").length,
      paySignalsReady: this.listPayImpactSignals(scope).length,
    };
  }

  private addPayImpactSignal(scope: TenantScope, input: { sourceRef: string; kind: "PROMOTION" | "MACP"; employeeId: string }): G06PayImpactSignal {
    const signal: G06PayImpactSignal = {
      id: nextId("g06-pay-signal", this.payImpactSignals.length),
      sourceModule: "G06",
      sourceRef: input.sourceRef,
      kind: input.kind,
      employeeId: input.employeeId,
      status: "READY_FOR_G10",
    };
    this.payImpactSignals.push(signal);
    this.audit.recordMutation(scope, { action: "G06_PAY_IMPACT_SIGNAL", subjectRef: `g06_pay_impact_signals:${signal.id}`, metadata: { kind: input.kind } });
    return { ...signal };
  }

  private requireSeniorityList(scope: TenantScope, seniorityListId: string): SeniorityList {
    const list = this.seniorityLists.find((item) => item.id === seniorityListId && this.inScope(item, scope));
    if (!list) {
      throw new FoundationError("NOT_FOUND", "Seniority list not found");
    }
    return list;
  }

  private requirePromotionCase(scope: TenantScope, promotionCaseId: string): PromotionCase {
    const promotionCase = this.promotionCases.find((item) => item.id === promotionCaseId && this.inScope(item, scope));
    if (!promotionCase) {
      throw new FoundationError("NOT_FOUND", "Promotion case not found");
    }
    return promotionCase;
  }

  private requirePromotionOrder(scope: TenantScope, promotionOrderId: string): PromotionOrder {
    const order = this.promotionOrders.find((item) => item.id === promotionOrderId && this.inScope(item, scope));
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Promotion order not found");
    }
    return order;
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }

  private isPromotionAccessOverride(actor: ActorContext): boolean {
    return Boolean(actor.permissions?.includes("*") || actor.roles?.some((role) => PROMOTION_ACCESS_OVERRIDE_ROLES.has(role)));
  }

  private assertSelfOrPromotionOverride(actor: ActorContext, employeeId: string): void {
    if (!this.isPromotionAccessOverride(actor) && actor.userId !== employeeId) {
      throw new FoundationError("FORBIDDEN", "You may only access your own promotion records", { field: "employeeId" });
    }
  }

  private employeeInScope(employeeId: string, scope: TenantScope): boolean {
    return Boolean(this.employeeMaster.getById(scope, employeeId));
  }

  private cloneSeniorityList(list: SeniorityList): SeniorityList {
    return { ...list, entries: list.entries.map((entry) => ({ ...entry })) };
  }

  private clonePromotionCase(promotionCase: PromotionCase): PromotionCase {
    return {
      ...promotionCase,
      candidates: promotionCase.candidates.map((candidate) => ({ ...candidate })),
      dpc: promotionCase.dpc ? { ...promotionCase.dpc, recusedEmployeeIds: [...promotionCase.dpc.recusedEmployeeIds] } : undefined,
    };
  }

  private clonePromotionOrder(order: PromotionOrder): PromotionOrder {
    return { ...order };
  }
}

function isContiguous(ranks: number[]): boolean {
  return [...ranks].sort((left, right) => left - right).every((rank, index) => rank === index + 1);
}

/** Slot-label prefixes pinned to the Appendix D.4 worked vector (DR-1, PR-1, LDCE-1, ...). */
const STREAM_SLOT_PREFIX: Record<RecruitmentStream, string> = { DIRECT: "DR", PROMOTEE: "PR", LDCE: "LDCE" };

/**
 * FR-PPP-020 rota-quota construction kernel (Appendix D.4). Pure and deterministic: the same
 * queues + rule always yield the same interleave, quota_slot_label set and rotation_cycle_no
 * assignment. ROTA_QUOTA rotates slot-by-slot (an exhausted stream's slot is recorded as
 * carried forward); RUNNING_ACCOUNT re-adds carried deficiencies to the stream's next cycle;
 * SEPARATE_STREAM concatenates the streams without interleave.
 */
export function runRotaQuotaConstruction(
  rule: SeniorityQuotaRule,
  queuesInput: Record<RecruitmentStream, string[]>
): { entries: CombinedSeniorityEntry[]; trace: RotationTraceSlot[] } {
  const queues: Record<RecruitmentStream, string[]> = {
    DIRECT: [...queuesInput.DIRECT],
    PROMOTEE: [...queuesInput.PROMOTEE],
    LDCE: [...queuesInput.LDCE],
  };
  const streamOrder: RecruitmentStream[] = rule.rotationStartSlot === "PROMOTEE_FIRST" ? ["PROMOTEE", "DIRECT", "LDCE"] : ["DIRECT", "PROMOTEE", "LDCE"];
  const ratios: Record<RecruitmentStream, number> = { DIRECT: rule.drQuotaRatio, PROMOTEE: rule.promoteeQuotaRatio, LDCE: rule.ldceQuotaRatio };
  const slotCounters: Record<RecruitmentStream, number> = { DIRECT: 0, PROMOTEE: 0, LDCE: 0 };
  const owed: Record<RecruitmentStream, number> = { DIRECT: 0, PROMOTEE: 0, LDCE: 0 };
  const entries: CombinedSeniorityEntry[] = [];
  const trace: RotationTraceSlot[] = [];
  let rank = 0;

  const remaining = (): number => queues.DIRECT.length + queues.PROMOTEE.length + queues.LDCE.length;

  const issueSlot = (stream: RecruitmentStream, cycleNo: number): void => {
    slotCounters[stream] += 1;
    const slotLabel = `${STREAM_SLOT_PREFIX[stream]}-${slotCounters[stream]}`;
    const employeeId = queues[stream].shift();
    if (employeeId) {
      rank += 1;
      entries.push({ employeeId, rank, recruitmentStream: stream, quotaSlotLabel: slotLabel, rotationCycleNo: cycleNo });
      trace.push({ cycleNo, slotLabel, stream, filledByEmployeeId: employeeId, carriedForward: false });
    } else {
      // AC-3: an unfilled quota slot is recorded — carried forward per the rule, never silently lost.
      trace.push({ cycleNo, slotLabel, stream, carriedForward: rule.unfilledQuotaCarryForward });
      if (rule.rotationMethod === "RUNNING_ACCOUNT" && rule.unfilledQuotaCarryForward) {
        owed[stream] += 1;
      }
    }
  };

  if (rule.rotationMethod === "SEPARATE_STREAM") {
    // No interleave: each stream is emitted whole, in start-slot order, as cycle 1.
    for (const stream of streamOrder) {
      while (queues[stream].length > 0) {
        issueSlot(stream, 1);
      }
    }
    return { entries, trace };
  }

  let cycleNo = 0;
  while (remaining() > 0) {
    cycleNo += 1;
    for (const stream of streamOrder) {
      // RUNNING_ACCOUNT: quota deficiencies carried from earlier cycles are reconciled here.
      let slots = ratios[stream];
      if (rule.rotationMethod === "RUNNING_ACCOUNT" && owed[stream] > 0 && queues[stream].length > 0) {
        slots += owed[stream];
        owed[stream] = 0;
      }
      for (let index = 0; index < slots; index += 1) {
        if (remaining() === 0) {
          return { entries, trace };
        }
        issueSlot(stream, cycleNo);
      }
    }
  }
  return { entries, trace };
}

/**
 * FR-004 AC-3 / Appendix D.1: the PINNED non-linear DoPT zone-of-consideration slab —
 * zone = 5 if v=1; 8 if v=2; 3×v if v≥3. Never a flat multiplier.
 */
export function zoneOfConsiderationSlab(vacancies: number): number {
  if (vacancies <= 0) {
    throw new FoundationError("VALIDATION_FAILED", "vacancies must be at least 1 to compute the zone of consideration", { field: "vacancies" });
  }
  if (vacancies === 1) {
    return 5;
  }
  if (vacancies === 2) {
    return 8;
  }
  return 3 * vacancies;
}

/**
 * VAL-G06-APAR-USABLE (§5.6-16, Dev Dutt line): an adverse/below-benchmark APAR year is USABLE
 * only if it was communicated AND its representation is DISPOSED or NOT_APPLICABLE. Unusable
 * years are excluded from the reckoning; usable adverse years defeat the benchmark.
 */
export function evaluateAparUsability(aparYears: AparYearInput[]): AparUsabilityGate {
  const usableAdverseYears: string[] = [];
  const unusableAdverseYears: string[] = [];
  for (const entry of aparYears) {
    if (entry.grading === "MEETS_BENCHMARK") {
      continue;
    }
    const representationSettled = (entry.representationStatus ?? "NOT_APPLICABLE") !== "PENDING";
    if (entry.communicated && representationSettled) {
      usableAdverseYears.push(entry.year);
    } else {
      unusableAdverseYears.push(entry.year);
    }
  }
  return {
    usableAdverseYears,
    unusableAdverseYears,
    benchmarkMet: usableAdverseYears.length === 0,
  };
}
