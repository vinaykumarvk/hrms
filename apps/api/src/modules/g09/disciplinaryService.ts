import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  CaseConsultation,
  CaseTimelineEvent,
  ConsultationType,
  DisagreementMemo,
  G09DueProcessRepository,
  G09PenaltyType,
  IccAppointment,
  IccRoleType,
  InMemoryG09DueProcessRepository,
  PersonalHearing,
  PersonalHearingStage,
  PreliminaryInquiry,
  PreliminaryInquiryRecommendation,
  ShowCauseNotice,
  SlaPauseEvent,
  SlaPauseReason,
  Suspension,
  SuspensionType,
  TimelineEventType,
  authorityRank,
  isSubordinateAuthority,
  penaltyClassOf,
  verifyTimelineChainRows,
} from "./dueProcessRepository";

export type DisciplinaryCaseStage = "INTAKE" | "CHARGE" | "INQUIRY" | "INQUIRY_REPORT" | "ORDER" | "CLOSED" | "APPEAL";
export type DisciplinaryCaseStatus = "OPEN" | "PENALTY_IMPOSED" | "ABATED" | "CLOSED";
export type PenaltyType = "CENSURE" | "MINOR_PENALTY" | "MAJOR_PENALTY";
export type AppealDecision = "UPHELD" | "MODIFIED" | "SET_ASIDE";
/** FR-G09-023: HARASSMENT triage flips the case onto the POSH ICC route. */
export type MisconductCategory = "GENERAL" | "HARASSMENT" | "CORRUPTION" | "INSUBORDINATION" | "ABSENCE";
/** g09_inquiry_route (DDL §1): ORDINARY_IO default; ICC_POSH for HARASSMENT; DISPENSED exceptional. */
export type InquiryRoute = "ORDINARY_IO" | "ICC_POSH" | "DISPENSED";

/** FR-G09-023 POSH_ICC procedure-template timelines (POSH Act 2013: 90-day inquiry, 10-day report). */
const POSH_ICC_TEMPLATE = { templateCode: "POSH_ICC", inquiryTargetDays: 90, reportTargetDays: 10, closureTargetDays: 180 } as const;
/** Ordinary CCS-CCA route timelines (E22 template defaults consumed by the SLA engine). */
const ORDINARY_TEMPLATE = { templateCode: "CCS_CCA_2026", inquiryTargetDays: 180, reportTargetDays: 30, closureTargetDays: 365 } as const;

export interface DisciplinaryCase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseNo: string;
  chargedEmployeeId: string;
  disciplinaryAuthorityId: string;
  /** SoD: the case initiator may never pass the penalty order (BRD DI-2 actor distinctness). */
  initiatedBy: string;
  stage: DisciplinaryCaseStage;
  /** FR-G09-028/DI-26: ABATED on death of the respondent; penalty finalise is then blocked. */
  caseStatus: DisciplinaryCaseStatus;
  abatementReason?: string;
  /** FR-G09-018 snapshot: cadre changes mid-case do not move the competence goalposts. */
  subjectCadre: string;
  competenceSetCode: string;
  /** Art. 311(1) reference point: the appointing authority's level for the charged employee. */
  appointingAuthorityLevel: string;
  /** Procedure-template subsistence bounds (E22 defaults 25/75) applied to suspensions. */
  subsistenceFloorPct: number;
  subsistenceCeilingPct: number;
  isUnderSuspension: boolean;
  confidential: boolean;
  sealedRouting: boolean;
  workflowInstanceId: string;
  chargeMemoDocumentId?: string;
  inquiryReportDocumentId?: string;
  penaltyOrderId?: string;
  srEventId?: string;
  appealDecision?: AppealDecision;
  /** FR-G09-023: triage category; HARASSMENT resolves the POSH ICC template. */
  misconductCategory: MisconductCategory;
  isPoshCase: boolean;
  inquiryRoute: InquiryRoute;
  /** The resolved procedure template (POSH_ICC for HARASSMENT, CCS_CCA_2026 otherwise). */
  procedureTemplateCode: string;
  /** FR-G09-023 AC-5: heightened confidentiality + anti-retaliation flag on POSH cases. */
  antiRetaliationFlag: boolean;
  openedOn: string;
  /** FR-G09-024/DI-18: current SLA targets — recomputed on resume by adding the paused duration. */
  slaTargetAt: string;
  expectedClosureDate: string;
  /** Baselines the coalesced-pause recompute is applied against (never mutated). */
  baseSlaTargetAt: string;
  baseExpectedClosureDate: string;
  /** FR-G09-025 AC-4 (APPEAL stage): the appeal references its granted personal hearing. */
  appealPersonalHearingId?: string;
  /** FR-G09-023 BR-2: outcome of a POSH conciliation recorded before inquiry (SETTLED blocks inquiry). */
  conciliationOutcome?: PoshConciliationOutcome;
}

/** FR-G09-023 BR-2 (POSH Act 2013 s.10): the aggrieved may opt for conciliation before inquiry. */
export type PoshConciliationOutcome = "SETTLED" | "FAILED";

/** g09_posh_conciliations — a recorded POSH conciliation attempt (never monetary; before inquiry). */
export interface PoshConciliation {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  outcome: PoshConciliationOutcome;
  settlementBasis: string;
  recordedOn: string;
  summary: string;
}

export interface PenaltyOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  disciplinaryCaseId: string;
  employeeId: string;
  penaltyType: PenaltyType;
  /** PH-08E: the statutory penalty items on a finalised order (subset of the show-cause proposal). */
  penaltyItems?: G09PenaltyType[];
  passedBy?: string;
  showCauseNoticeId?: string;
  orderNo: string;
  status: "FINALISED" | "SERVED" | "SET_ASIDE" | "MODIFIED";
  documentId: string;
  srEventId?: string;
}

export interface DisciplinaryImpactSignal {
  id: string;
  sourceModule: "G09";
  employeeId: string;
  penaltyType: PenaltyType;
  status: "READY_FOR_G06_G11";
}

/** Post-full-review-goal fix: self-service reads/writes (my case, my show-cause response, my
 *  hearing request) need a need-to-know gate, same shape as every other module's self-scope.
 *  Post-hr_admin-goal SoD correction: hr_admin deliberately excluded — the BRD's own text names
 *  an "HR-DCP Admin" persona mapped to HR Admin, but only alongside a distinct G09 module-admin
 *  entitlement flag (never implemented) and explicitly scoped "operational, non-deciding" — the
 *  hr_admin capability audit treats disciplinary case access as belonging to the dedicated
 *  disciplinary_authority chain, not the general superset role, and that instruction supersedes
 *  the module BRD's looser language here. */
const DISCIPLINARY_ACCESS_OVERRIDE_ROLES = new Set(["disciplinary_authority", "system"]);

export class DisciplinaryService {
  private readonly cases: DisciplinaryCase[] = [];
  private readonly penaltyOrders: PenaltyOrder[] = [];
  private readonly impactSignals: DisciplinaryImpactSignal[] = [];
  private readonly conciliations: PoshConciliation[] = [];
  private conciliationSerial = 0;
  private preliminaryInquirySerial = 0;
  private showCauseSerial = 0;
  private disagreementSerial = 0;
  private consultationSerial = 0;
  private authoritySerial = 0;
  private iccSerial = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    private readonly dueProcess: G09DueProcessRepository = new InMemoryG09DueProcessRepository()
  ) {}

  openCase(
    actor: ActorContext,
    input: {
      chargedEmployeeId: string;
      disciplinaryAuthorityId: string;
      allegations: string;
      confidential?: boolean;
      subjectCadre?: string;
      competenceSetCode?: string;
      appointingAuthorityLevel?: string;
      subsistenceFloorPct?: number;
      subsistenceCeilingPct?: number;
      /** FR-G09-023: HARASSMENT resolves the ICC template and sets inquiry_route=ICC_POSH. */
      misconductCategory?: MisconductCategory;
      openedOn?: string;
    }
  ): DisciplinaryCase {
    this.authorization.check(actor, "g09.case.open", actor);
    this.assertAuthorityCompetence(input.chargedEmployeeId, input.disciplinaryAuthorityId);
    if (!this.employeeMaster.getById(actor, input.chargedEmployeeId)) {
      throw new FoundationError("NOT_FOUND", "Charged employee not found");
    }
    const openedOn = input.openedOn ?? "2026-07-02";
    const misconductCategory = input.misconductCategory ?? "GENERAL";
    // FR-G09-023 AC-1: HARASSMENT (is_posh_case=true) resolves the POSH_ICC procedure template.
    const isPoshCase = misconductCategory === "HARASSMENT";
    const template = isPoshCase ? POSH_ICC_TEMPLATE : ORDINARY_TEMPLATE;
    const slaTargetAt = addDays(openedOn, template.inquiryTargetDays);
    const expectedClosureDate = addDays(openedOn, template.closureTargetDays);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G09-DISCIPLINARY-DUE-PROCESS",
      subjectRef: `g09_disciplinary_cases:${input.chargedEmployeeId}:${this.cases.length + 1}`,
      stage: "INTAKE",
      resolverRule: { mechanism: "NAMED_ROLE", roleCode: "G09_DISCIPLINARY_AUTHORITY", subjectEmployeeId: input.chargedEmployeeId },
      asOf: openedOn,
    });
    const disciplinaryCase: DisciplinaryCase = {
      id: nextId("disciplinary-case", this.cases.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseNo: `DCP/${String(this.cases.length + 1).padStart(5, "0")}`,
      chargedEmployeeId: input.chargedEmployeeId,
      disciplinaryAuthorityId: input.disciplinaryAuthorityId,
      initiatedBy: actor.userId,
      stage: "INTAKE",
      caseStatus: "OPEN",
      subjectCadre: input.subjectCadre ?? "GENERAL",
      competenceSetCode: input.competenceSetCode ?? "CCS_CCA_2026",
      appointingAuthorityLevel: input.appointingAuthorityLevel ?? "APPOINTING_AUTHORITY",
      subsistenceFloorPct: input.subsistenceFloorPct ?? 25,
      subsistenceCeilingPct: input.subsistenceCeilingPct ?? 75,
      isUnderSuspension: false,
      // FR-G09-023 AC-5: POSH cases carry heightened confidentiality regardless of the request.
      confidential: Boolean(input.confidential) || isPoshCase,
      sealedRouting: Boolean(input.confidential) || isPoshCase,
      workflowInstanceId: started.instance.id,
      misconductCategory,
      isPoshCase,
      inquiryRoute: isPoshCase ? "ICC_POSH" : "ORDINARY_IO",
      procedureTemplateCode: template.templateCode,
      antiRetaliationFlag: isPoshCase,
      openedOn,
      slaTargetAt,
      expectedClosureDate,
      baseSlaTargetAt: slaTargetAt,
      baseExpectedClosureDate: expectedClosureDate,
    };
    this.cases.push(disciplinaryCase);
    this.appendTimeline(actor, disciplinaryCase.id, "INTAKE", "STAGE_ENTERED", `Case opened (route ${disciplinaryCase.inquiryRoute})`, openedOn);
    this.audit.recordMutation(actor, {
      action: "G09_CASE_OPENED",
      subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`,
      metadata: {
        marker: "G09_AUTHORITY_COMPETENCE",
        confidential: disciplinaryCase.confidential,
        allegations: input.allegations,
        inquiryRoute: disciplinaryCase.inquiryRoute,
        procedureTemplateCode: disciplinaryCase.procedureTemplateCode,
      },
    });
    return { ...disciplinaryCase };
  }

  serveChargeMemo(actor: ActorContext, caseId: string, input: { articles: string[]; servedOn: string }): DisciplinaryCase {
    this.authorization.check(actor, "g09.charge.serve", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.requireStage(disciplinaryCase, "INTAKE");
    if (input.articles.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one charge article is required", { field: "articles" });
    }
    const document = this.documentVault.createDocument(actor, {
      title: `Charge Memo ${disciplinaryCase.caseNo}`,
      ownerEmployeeId: disciplinaryCase.chargedEmployeeId,
      classification: disciplinaryCase.confidential ? "SECRET" : "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ caseNo: disciplinaryCase.caseNo, articles: input.articles, servedOn: input.servedOn })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G09",
      entityName: "charge_memos",
      entityRefId: disciplinaryCase.id,
      linkRole: "CHARGE_MEMO",
    });
    disciplinaryCase.stage = "CHARGE";
    disciplinaryCase.chargeMemoDocumentId = attached.id;
    this.appendTimeline(actor, disciplinaryCase.id, "CHARGE", "STAGE_ENTERED", "Charge memo served", input.servedOn);
    this.audit.recordMutation(actor, {
      action: "G09_CHARGE_MEMO_SERVED",
      subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`,
      metadata: { marker: "CHARGE_MEMO_SERVED", documentId: attached.id },
    });
    return { ...disciplinaryCase };
  }

  recordInquiryReport(actor: ActorContext, caseId: string, input: { findings: "PROVED" | "NOT_PROVED" | "PARTLY_PROVED"; reportDate: string }): DisciplinaryCase {
    this.authorization.check(actor, "g09.inquiry.report", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.requireStage(disciplinaryCase, "CHARGE");
    // FR-G09-023 BR-2: a POSH case settled at conciliation does not proceed to inquiry.
    if (disciplinaryCase.conciliationOutcome === "SETTLED") {
      throw new FoundationError("PRECONDITION_FAILED", "This POSH case was settled at conciliation; no inquiry report is recorded (FR-G09-023 BR-2)", {
        details: { caseNo: disciplinaryCase.caseNo },
      });
    }
    // FR-G09-023 fail closed: a POSH case cannot proceed to inquiry without a valid ICC.
    this.assertIccConstitutedForPosh(actor, disciplinaryCase);
    const document = this.documentVault.createDocument(actor, {
      title: `Inquiry Report ${disciplinaryCase.caseNo}`,
      ownerEmployeeId: disciplinaryCase.chargedEmployeeId,
      classification: disciplinaryCase.confidential ? "SECRET" : "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ caseNo: disciplinaryCase.caseNo, findings: input.findings, reportDate: input.reportDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G09",
      entityName: "inquiry_reports",
      entityRefId: disciplinaryCase.id,
      linkRole: "INQUIRY_REPORT",
    });
    disciplinaryCase.stage = "INQUIRY_REPORT";
    disciplinaryCase.inquiryReportDocumentId = attached.id;
    this.appendTimeline(actor, disciplinaryCase.id, "INQUIRY_REPORT", "STAGE_ENTERED", "Inquiry report recorded", input.reportDate);
    this.audit.recordMutation(actor, { action: "G09_INQUIRY_REPORT", subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`, metadata: { marker: "INQUIRY_REPORT", findings: input.findings } });
    return { ...disciplinaryCase };
  }

  imposePenalty(
    actor: ActorContext,
    caseId: string,
    input: { penaltyType: PenaltyType; orderDate: string; reason: string; idempotencyKey: string }
  ): { disciplinaryCase: DisciplinaryCase; penaltyOrder: PenaltyOrder; srEventId: string; impactSignal: DisciplinaryImpactSignal } {
    this.authorization.check(actor, "g09.penalty.impose", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    this.requireStage(disciplinaryCase, "INQUIRY_REPORT");
    const document = this.documentVault.createDocument(actor, {
      title: `Penalty Order ${disciplinaryCase.caseNo}`,
      ownerEmployeeId: disciplinaryCase.chargedEmployeeId,
      classification: disciplinaryCase.confidential ? "SECRET" : "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ caseNo: disciplinaryCase.caseNo, penaltyType: input.penaltyType, reason: input.reason })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G09",
      entityName: "penalty_orders",
      entityRefId: disciplinaryCase.id,
      linkRole: "PENALTY_ORDER",
    });
    const order: PenaltyOrder = {
      id: nextId("penalty-order", this.penaltyOrders.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      disciplinaryCaseId: disciplinaryCase.id,
      employeeId: disciplinaryCase.chargedEmployeeId,
      penaltyType: input.penaltyType,
      orderNo: `DPO/${String(this.penaltyOrders.length + 1).padStart(5, "0")}`,
      status: "FINALISED",
      documentId: attached.id,
    };
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G09",
      sourceReferenceId: `g09_penalty_orders:${order.id}:SERVED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: input.penaltyType,
      eventDate: input.orderDate,
      factKey: `G09:${order.id}:${input.penaltyType}`,
      orderNo: order.orderNo,
      payload: { caseNo: disciplinaryCase.caseNo, penaltyType: input.penaltyType, reason: input.reason },
      documentIds: [attached.id, disciplinaryCase.chargeMemoDocumentId ?? "", disciplinaryCase.inquiryReportDocumentId ?? ""].filter((documentId) => documentId.length > 0),
    });
    order.status = "SERVED";
    order.srEventId = sr.event.id;
    this.penaltyOrders.push(order);
    disciplinaryCase.stage = "CLOSED";
    disciplinaryCase.caseStatus = "PENALTY_IMPOSED";
    disciplinaryCase.penaltyOrderId = order.id;
    disciplinaryCase.srEventId = sr.event.id;
    this.appendTimeline(actor, disciplinaryCase.id, "ORDER", "STAGE_COMPLETED", `Penalty order ${order.orderNo} served`, input.orderDate);
    const signal = this.addImpactSignal(actor, disciplinaryCase.chargedEmployeeId, input.penaltyType);
    this.audit.recordMutation(actor, { action: "G09_PENALTY_SERVED", subjectRef: `g09_penalty_orders:${order.id}`, metadata: { marker: input.penaltyType, srEventId: sr.event.id } });
    this.notifications.publish(actor, { recipientEmployeeId: order.employeeId, messageId: "G09_PENALTY_SERVED", channel: "IN_APP", relatedRef: `g09_penalty_orders:${order.id}`, mergeFields: { penaltyType: input.penaltyType } });
    return { disciplinaryCase: { ...disciplinaryCase }, penaltyOrder: { ...order }, srEventId: sr.event.id, impactSignal: signal };
  }

  decideAppeal(actor: ActorContext, caseId: string, input: { appellateAuthorityId: string; decision: AppealDecision; decidedOn: string; idempotencyKey: string }): { disciplinaryCase: DisciplinaryCase; srEventId?: string } {
    this.authorization.check(actor, "g09.appeal.decide", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    if (input.appellateAuthorityId === disciplinaryCase.disciplinaryAuthorityId) {
      throw new FoundationError("CONFLICT", "Appellate authority must differ from disciplinary authority", { details: { marker: "G09_AUTHORITY_COMPETENCE" } });
    }
    const penalty = disciplinaryCase.penaltyOrderId ? this.requirePenalty(actor, disciplinaryCase.penaltyOrderId) : undefined;
    let srEventId: string | undefined;
    if (penalty && input.decision === "SET_ASIDE") {
      const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
        sourceModule: "G09",
        sourceReferenceId: `g09_appeals:${disciplinaryCase.id}:SET_ASIDE`,
        sourceEventVersion: 1,
        employeeId: disciplinaryCase.chargedEmployeeId,
        eventTypeCode: `${penalty.penaltyType}_REVERSAL`,
        eventDate: input.decidedOn,
        factKey: `G09:${disciplinaryCase.id}:APPEAL_SET_ASIDE`,
        payload: { caseNo: disciplinaryCase.caseNo, originalPenaltyOrderId: penalty.id },
        documentIds: [penalty.documentId],
      });
      penalty.status = "SET_ASIDE";
      srEventId = sr.event.id;
    }
    disciplinaryCase.stage = "CLOSED";
    disciplinaryCase.appealDecision = input.decision;
    this.appendTimeline(actor, disciplinaryCase.id, "APPEAL", "STAGE_COMPLETED", `Appeal decided ${input.decision}`, input.decidedOn);
    this.audit.recordMutation(actor, { action: "G09_APPEAL_DECIDED", subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`, metadata: { marker: "APPEAL_DECIDED", decision: input.decision, srEventId } });
    return { disciplinaryCase: { ...disciplinaryCase }, srEventId };
  }

  // -------------------------------------------------------------------------------------
  // PH-08E natural-justice chain (FR-G09-002/003/018/019/027/028; DI-4/13/14/16/21/26)
  // -------------------------------------------------------------------------------------

  /** FR-G09-002: order a preliminary inquiry (fact-finding before formal charges). */
  orderPreliminaryInquiry(actor: ActorContext, caseId: string, input: { piOfficerId: string; orderedDate: string; dueDate: string }): PreliminaryInquiry {
    this.authorization.check(actor, "g09.preliminary-inquiry.order", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    if (input.piOfficerId === disciplinaryCase.chargedEmployeeId || input.piOfficerId === disciplinaryCase.disciplinaryAuthorityId) {
      throw new FoundationError("ERR-G09-ACTOR-CONFLICT", "Preliminary inquiry officer must be distinct from the charged officer and the disciplinary authority (DI-2)", {
        field: "piOfficerId",
      });
    }
    const inquiry: PreliminaryInquiry = {
      id: nextId("g09-preliminary-inquiry", this.preliminaryInquirySerial++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      piOfficerId: input.piOfficerId,
      orderedBy: disciplinaryCase.disciplinaryAuthorityId,
      orderedDate: input.orderedDate,
      dueDate: input.dueDate,
      status: "ORDERED",
    };
    this.dueProcess.savePreliminaryInquiry(inquiry);
    this.appendTimeline(actor, caseId, "PRELIMINARY_INQUIRY", "STAGE_ENTERED", "Preliminary inquiry ordered", input.orderedDate);
    this.audit.recordMutation(actor, { action: "G09_PRELIMINARY_INQUIRY_ORDERED", subjectRef: `g09_preliminary_inquiries:${inquiry.id}`, metadata: { caseId } });
    return { ...inquiry };
  }

  /** FR-G09-002: ORDERED -> IN_PROGRESS. */
  beginPreliminaryInquiry(actor: ActorContext, inquiryId: string): PreliminaryInquiry {
    this.authorization.check(actor, "g09.preliminary-inquiry.update", actor);
    const inquiry = this.requirePreliminaryInquiry(actor, inquiryId);
    if (inquiry.status !== "ORDERED") {
      throw new FoundationError("PRECONDITION_FAILED", "Preliminary inquiry must be ORDERED to begin");
    }
    inquiry.status = "IN_PROGRESS";
    this.dueProcess.savePreliminaryInquiry(inquiry);
    return { ...inquiry };
  }

  /** FR-G09-002: submit with a PROCEED_MAJOR/PROCEED_MINOR/DROP/ADMIN_ADVICE recommendation. */
  submitPreliminaryInquiry(
    actor: ActorContext,
    inquiryId: string,
    input: { findingsSummary: string; recommendation: PreliminaryInquiryRecommendation; submittedAt: string }
  ): PreliminaryInquiry {
    this.authorization.check(actor, "g09.preliminary-inquiry.update", actor);
    const inquiry = this.requirePreliminaryInquiry(actor, inquiryId);
    if (inquiry.status !== "ORDERED" && inquiry.status !== "IN_PROGRESS") {
      throw new FoundationError("PRECONDITION_FAILED", "Preliminary inquiry is not open for submission");
    }
    inquiry.status = "SUBMITTED";
    inquiry.findingsSummary = input.findingsSummary;
    inquiry.recommendation = input.recommendation;
    inquiry.submittedAt = input.submittedAt;
    this.dueProcess.savePreliminaryInquiry(inquiry);
    this.appendTimeline(actor, inquiry.caseId, "PRELIMINARY_INQUIRY", "STAGE_COMPLETED", `Preliminary inquiry submitted: ${input.recommendation}`, input.submittedAt);
    this.audit.recordMutation(actor, {
      action: "G09_PRELIMINARY_INQUIRY_SUBMITTED",
      subjectRef: `g09_preliminary_inquiries:${inquiry.id}`,
      metadata: { recommendation: input.recommendation },
    });
    return { ...inquiry };
  }

  /**
   * FR-G09-003: order a suspension on the parallel interim track. The subsistence allowance rate
   * must sit within the procedure template's floor/ceiling (default 25/75) or the order is refused
   * with ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS.
   */
  orderSuspension(
    actor: ActorContext,
    caseId: string,
    input: { suspensionType?: SuspensionType; effectiveFrom: string; subsistenceRatePct?: number; reviewCommitteeDue?: string }
  ): Suspension {
    this.authorization.check(actor, "g09.suspension.order", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    const ratePct = input.subsistenceRatePct ?? 50;
    this.assertSubsistenceWithinBounds(disciplinaryCase, ratePct);
    const suspension: Suspension = {
      id: nextId("g09-suspension", this.dueProcess.countSuspensions()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      employeeId: disciplinaryCase.chargedEmployeeId,
      suspensionType: input.suspensionType ?? "ORDERED",
      orderNo: `SUSP/${String(this.dueProcess.countSuspensions() + 1).padStart(5, "0")}`,
      effectiveFrom: input.effectiveFrom,
      status: "ACTIVE",
      subsistenceRatePct: ratePct,
      nonEmploymentCertificateReceived: false,
      chargeMemoDueDate: addDays(input.effectiveFrom, 90),
      subsistenceRevisionDue: addDays(input.effectiveFrom, 180),
      reviewCommitteeDue: input.reviewCommitteeDue ?? addDays(input.effectiveFrom, 90),
    };
    this.dueProcess.saveSuspension(suspension);
    disciplinaryCase.isUnderSuspension = true;
    this.appendTimeline(actor, caseId, "INTAKE", "NOTE", `Suspension ${suspension.orderNo} ordered at ${ratePct}% subsistence`, input.effectiveFrom);
    this.audit.recordMutation(actor, { action: "G09_SUSPENSION_ORDERED", subjectRef: `g09_suspensions:${suspension.id}`, metadata: { caseId, subsistenceRatePct: ratePct } });
    return { ...suspension };
  }

  /** DI-16/AI-6: record the non-employment certificate that gates subsistence revision/payment. */
  recordNonEmploymentCertificate(actor: ActorContext, suspensionId: string, input: { receivedDate: string }): Suspension {
    this.authorization.check(actor, "g09.suspension.update", actor);
    const suspension = this.requireSuspension(actor, suspensionId);
    suspension.nonEmploymentCertificateReceived = true;
    suspension.necReceivedDate = input.receivedDate;
    this.dueProcess.saveSuspension(suspension);
    return { ...suspension };
  }

  /**
   * FR-G09-003 subsistence review: the revised rate must stay within the template bounds and the
   * non-employment certificate must be on record (ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED otherwise).
   */
  reviseSubsistenceRate(actor: ActorContext, suspensionId: string, input: { newRatePct: number; revisionDate: string }): Suspension {
    this.authorization.check(actor, "g09.suspension.update", actor);
    const suspension = this.requireSuspension(actor, suspensionId);
    if (suspension.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Subsistence can only be revised on an ACTIVE suspension");
    }
    if (!suspension.nonEmploymentCertificateReceived) {
      throw new FoundationError("ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED", "Subsistence revision requires the non-employment certificate (DI-16)", {
        field: "non_employment_certificate_received",
      });
    }
    const disciplinaryCase = this.requireCase(actor, suspension.caseId);
    this.assertSubsistenceWithinBounds(disciplinaryCase, input.newRatePct);
    suspension.subsistenceRatePct = input.newRatePct;
    suspension.subsistenceRevisionDue = addDays(input.revisionDate, 180);
    this.dueProcess.saveSuspension(suspension);
    this.appendTimeline(actor, suspension.caseId, "INTAKE", "NOTE", `Subsistence revised to ${input.newRatePct}%`, input.revisionDate);
    this.audit.recordMutation(actor, { action: "G09_SUBSISTENCE_REVISED", subjectRef: `g09_suspensions:${suspension.id}`, metadata: { newRatePct: input.newRatePct } });
    return { ...suspension };
  }

  /** FR-G09-003: periodic suspension review — continue or revoke. */
  reviewSuspension(actor: ActorContext, suspensionId: string, input: { outcome: "CONTINUE" | "REVOKE"; reviewDate: string; reason?: string }): Suspension {
    this.authorization.check(actor, "g09.suspension.review", actor);
    const suspension = this.requireSuspension(actor, suspensionId);
    if (suspension.status !== "ACTIVE") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an ACTIVE suspension can be reviewed");
    }
    if (input.outcome === "REVOKE") {
      suspension.status = "REVOKED";
      suspension.effectiveTo = input.reviewDate;
      suspension.revokedReason = input.reason;
      const disciplinaryCase = this.requireCase(actor, suspension.caseId);
      disciplinaryCase.isUnderSuspension = false;
    } else {
      suspension.reviewCommitteeDue = addDays(input.reviewDate, 90);
    }
    this.dueProcess.saveSuspension(suspension);
    this.appendTimeline(actor, suspension.caseId, "INTAKE", "NOTE", `Suspension review: ${input.outcome}`, input.reviewDate);
    return { ...suspension };
  }

  /** E15: issue the show-cause notice carrying the proposed penalty set (the DI-4 ceiling). */
  issueShowCauseNotice(
    actor: ActorContext,
    caseId: string,
    input: { proposedPenalties: G09PenaltyType[]; issuedDate: string; responseDueDate: string; servedDate?: string }
  ): ShowCauseNotice {
    this.authorization.check(actor, "g09.show-cause.issue", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    this.requireStage(disciplinaryCase, "INQUIRY_REPORT");
    if (input.proposedPenalties.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one proposed penalty is required on a show-cause notice", { field: "proposedPenalties" });
    }
    const existing = this.dueProcess.listShowCauseNotices(actor, caseId);
    const notice: ShowCauseNotice = {
      id: nextId("g09-show-cause", this.showCauseSerial++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      noticeNo: `SCN/${disciplinaryCase.caseNo.replace(/\//g, "-")}/${String(existing.length + 1).padStart(3, "0")}`,
      proposedPenaltyJson: [...input.proposedPenalties],
      issuedBy: disciplinaryCase.disciplinaryAuthorityId,
      issuedDate: input.issuedDate,
      servedDate: input.servedDate ?? input.issuedDate,
      responseDueDate: input.responseDueDate,
      status: "SERVED",
    };
    this.dueProcess.saveShowCauseNotice(notice);
    this.appendTimeline(actor, caseId, "SHOW_CAUSE", "STAGE_ENTERED", `Show-cause notice ${notice.noticeNo} served`, notice.servedDate ?? input.issuedDate);
    this.audit.recordMutation(actor, { action: "G09_SHOW_CAUSE_ISSUED", subjectRef: `g09_show_cause_notices:${notice.id}`, metadata: { proposedPenalties: input.proposedPenalties } });
    return { ...notice };
  }

  /** E15: record the respondent's representation against the show-cause notice.
   *  Post-full-review-goal fix: this had no ownership check at all — any `g09.show-cause.respond`
   *  holder could submit a representation on behalf of a case that was not theirs, impersonating
   *  the actual respondent. Self-or-override only. */
  respondToShowCause(actor: ActorContext, noticeId: string, input: { representationText: string; respondedAt: string }): ShowCauseNotice {
    this.authorization.check(actor, "g09.show-cause.respond", actor);
    const notice = this.requireShowCauseNotice(actor, noticeId);
    const disciplinaryCase = this.requireCase(actor, notice.caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    if (notice.status !== "ISSUED" && notice.status !== "SERVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Show-cause notice is not open for a response");
    }
    notice.status = "RESPONDED";
    notice.representationText = input.representationText;
    notice.respondedAt = input.respondedAt;
    this.dueProcess.saveShowCauseNotice(notice);
    this.appendTimeline(actor, notice.caseId, "SHOW_CAUSE", "STAGE_COMPLETED", "Show-cause representation received", input.respondedAt);
    return { ...notice };
  }

  /** Self-service "view my show-cause notice(s)": lets the charged officer see the proposed
   *  penalties and response deadline before submitting a representation via `respondToShowCause`.
   *  Self-or-override only. */
  listMyShowCauseNotices(actor: ActorContext, caseId: string): ShowCauseNotice[] {
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    return this.dueProcess.listShowCauseNotices(actor, caseId).map((notice) => ({ ...notice }));
  }

  /** E14: DA records a tentative disagreement with the inquiry report and serves it. */
  recordDisagreementMemo(
    actor: ActorContext,
    caseId: string,
    input: { tentativeDisagreement: string; articlesAffected?: string[]; servedDate: string; representationDueDate?: string }
  ): DisagreementMemo {
    this.authorization.check(actor, "g09.disagreement-memo.issue", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    this.requireStage(disciplinaryCase, "INQUIRY_REPORT");
    const memo: DisagreementMemo = {
      id: nextId("g09-disagreement-memo", this.disagreementSerial++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      inquiryReportRef: disciplinaryCase.inquiryReportDocumentId ?? "",
      issuedBy: disciplinaryCase.disciplinaryAuthorityId,
      tentativeDisagreement: input.tentativeDisagreement,
      articlesAffected: input.articlesAffected ?? [],
      servedDate: input.servedDate,
      representationDueDate: input.representationDueDate,
      status: "SERVED",
    };
    this.dueProcess.saveDisagreementMemo(memo);
    this.appendTimeline(actor, caseId, "DA_CONSIDERATION", "NOTE", "Disagreement memo served on the respondent", input.servedDate);
    this.audit.recordMutation(actor, { action: "G09_DISAGREEMENT_MEMO_SERVED", subjectRef: `g09_disagreement_memos:${memo.id}`, metadata: { caseId } });
    return { ...memo };
  }

  /** E14: the respondent's representation on the disagreement memo (required before finalise). */
  respondToDisagreementMemo(actor: ActorContext, memoId: string, input: { representationText: string; respondedAt: string }): DisagreementMemo {
    this.authorization.check(actor, "g09.disagreement-memo.respond", actor);
    const memo = this.requireDisagreementMemo(actor, memoId);
    if (memo.status !== "ISSUED" && memo.status !== "SERVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Disagreement memo is not open for a response");
    }
    memo.status = "RESPONDED";
    memo.representationText = input.representationText;
    this.dueProcess.saveDisagreementMemo(memo);
    this.appendTimeline(actor, memo.caseId, "DA_CONSIDERATION", "NOTE", "Disagreement memo representation received", input.respondedAt);
    return { ...memo };
  }

  /** FR-G09-019/DI-14: register a consultation (UPSC/CVC/ICC/LEGAL) that gates finalise when mandatory. */
  requireConsultation(actor: ActorContext, caseId: string, input: { consultationType: ConsultationType; isMandatory?: boolean; requestedDate?: string }): CaseConsultation {
    this.authorization.check(actor, "g09.consultation.require", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    const consultation: CaseConsultation = {
      id: nextId("g09-consultation", this.consultationSerial++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      consultationType: input.consultationType,
      status: input.requestedDate ? "REQUESTED" : "REQUIRED",
      isMandatory: input.isMandatory ?? true,
      requestedDate: input.requestedDate,
    };
    this.dueProcess.saveConsultation(consultation);
    this.appendTimeline(actor, caseId, "CONSULTATION", "STAGE_ENTERED", `${input.consultationType} consultation required`, input.requestedDate ?? "2026-07-02");
    return { ...consultation };
  }

  /** DI-14: close a consultation with the received advice. */
  closeConsultation(actor: ActorContext, consultationId: string, input: { adviceSummary?: string; receivedDate: string }): CaseConsultation {
    this.authorization.check(actor, "g09.consultation.close", actor);
    const consultation = this.requireConsultationRow(actor, consultationId);
    consultation.status = "CLOSED";
    consultation.receivedDate = input.receivedDate;
    consultation.adviceSummary = input.adviceSummary;
    this.dueProcess.saveConsultation(consultation);
    this.appendTimeline(actor, consultation.caseId, "CONSULTATION", "STAGE_COMPLETED", `${consultation.consultationType} consultation closed`, input.receivedDate);
    return { ...consultation };
  }

  /** DI-14: waive a consultation — a recorded waiver reason is mandatory. */
  waiveConsultation(actor: ActorContext, consultationId: string, input: { waiverReason: string; waivedOn: string }): CaseConsultation {
    this.authorization.check(actor, "g09.consultation.close", actor);
    if (!input.waiverReason) {
      throw new FoundationError("VALIDATION_FAILED", "A waiver reason is required to waive a consultation", { field: "waiverReason" });
    }
    const consultation = this.requireConsultationRow(actor, consultationId);
    consultation.status = "WAIVED";
    consultation.waiverReason = input.waiverReason;
    this.dueProcess.saveConsultation(consultation);
    this.appendTimeline(actor, consultation.caseId, "CONSULTATION", "STAGE_COMPLETED", `${consultation.consultationType} consultation waived`, input.waivedOn);
    return { ...consultation };
  }

  // -------------------------------------------------------------------------------------
  // PH-15F FR-G09-023: POSH ICC route — constitution with composition validation
  // -------------------------------------------------------------------------------------

  /**
   * FR-G09-023 AC-2: constitute the Internal Committee on a POSH (HARASSMENT) case. The
   * composition is validated at constitution time against the appointment roles:
   *   (1) exactly one ICC_PRESIDING officer who is a senior-level woman,
   *   (2) at least one ICC_EXTERNAL_MEMBER (BR-1: external member is mandatory for quorum),
   *   (3) at least half the members are women (POSH Act 2013 s.4(2)).
   * Any breach throws ERR-G09-ICC-PROCEDURE-REQUIRED and persists nothing (fail closed).
   */
  constituteIcc(
    actor: ActorContext,
    caseId: string,
    input: {
      appointedDate: string;
      members: Array<{
        roleType: IccRoleType;
        officerId?: string;
        externalName?: string;
        isWoman: boolean;
        isSeniorLevel?: boolean;
      }>;
    }
  ): IccAppointment[] {
    this.authorization.check(actor, "g09.icc.constitute", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    if (!disciplinaryCase.isPoshCase || disciplinaryCase.inquiryRoute !== "ICC_POSH") {
      throw new FoundationError("PRECONDITION_FAILED", "ICC constitution applies only to POSH (HARASSMENT) cases on the ICC_POSH route");
    }
    const presiding = input.members.filter((member) => member.roleType === "ICC_PRESIDING");
    const externals = input.members.filter((member) => member.roleType === "ICC_EXTERNAL_MEMBER");
    const women = input.members.filter((member) => member.isWoman);
    const presidingOfficer = presiding[0];
    if (presiding.length !== 1 || !presidingOfficer || !presidingOfficer.isWoman || !presidingOfficer.isSeniorLevel) {
      throw new FoundationError("ERR-G09-ICC-PROCEDURE-REQUIRED", "ICC composition requires exactly one presiding officer who is a senior-level woman (FR-G09-023)", {
        field: "members",
        details: { presidingCount: presiding.length },
      });
    }
    if (externals.length < 1) {
      throw new FoundationError("ERR-G09-ICC-PROCEDURE-REQUIRED", "ICC composition requires at least one external member from an NGO/expert body (FR-G09-023 BR-1)", {
        field: "members",
        details: { externalMemberCount: externals.length },
      });
    }
    if (women.length * 2 < input.members.length) {
      throw new FoundationError("ERR-G09-ICC-PROCEDURE-REQUIRED", "At least half the ICC members must be women (POSH Act 2013 s.4(2))", {
        field: "members",
        details: { womenCount: women.length, memberCount: input.members.length },
      });
    }
    const appointments = input.members.map((member) => {
      const isExternalMember = member.roleType === "ICC_EXTERNAL_MEMBER";
      if (isExternalMember ? !member.externalName : !member.officerId) {
        throw new FoundationError("ERR-G09-ICC-PROCEDURE-REQUIRED", "Each ICC member needs an internal officer id or (for the external member) an external name", {
          field: "members",
          details: { roleType: member.roleType },
        });
      }
      const appointment: IccAppointment = {
        id: nextId("g09-icc-appointment", this.iccSerial++),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        caseId,
        roleType: member.roleType,
        officerId: isExternalMember ? undefined : member.officerId,
        externalName: isExternalMember ? member.externalName : undefined,
        isExternalMember,
        isWoman: member.isWoman,
        isSeniorLevel: Boolean(member.isSeniorLevel),
        appointedBy: disciplinaryCase.disciplinaryAuthorityId,
        appointedDate: input.appointedDate,
        status: "ACTIVE",
      };
      this.dueProcess.saveIccAppointment(appointment);
      return appointment;
    });
    this.appendTimeline(actor, caseId, "INQUIRY", "STAGE_ENTERED", `ICC constituted (${appointments.length} members, route ICC_POSH)`, input.appointedDate);
    this.audit.recordMutation(actor, {
      action: "G09_ICC_CONSTITUTED",
      subjectRef: `g09_disciplinary_cases:${caseId}`,
      metadata: { memberCount: appointments.length, externalMembers: externals.length, inquiryRoute: "ICC_POSH" },
    });
    return appointments.map((appointment) => ({ ...appointment }));
  }

  listIccAppointments(scope: TenantScope, caseId: string): IccAppointment[] {
    requireTenantScope(scope);
    return this.dueProcess.listIccAppointments(scope, caseId);
  }

  /**
   * FR-G09-023 BR-2 (POSH Act 2013 s.10): record a conciliation the aggrieved woman has opted for,
   * BEFORE the inquiry. Guards:
   *   - conciliation applies only to a POSH (HARASSMENT) case;
   *   - it must be recorded before the inquiry report stage;
   *   - it may not rest on a monetary settlement (ERR-G09-CONCILIATION-MONETARY).
   * A SETTLED outcome blocks the inquiry (recordInquiryReport refuses). Re-recording with FAILED
   * models the edge case "complainant opts for conciliation then withdraws ⇒ resume inquiry".
   */
  recordConciliation(
    actor: ActorContext,
    caseId: string,
    input: { opted: boolean; outcome: PoshConciliationOutcome; settlementBasis: string; recordedOn: string; summary: string }
  ): { disciplinaryCase: DisciplinaryCase; conciliation: PoshConciliation } {
    this.authorization.check(actor, "g09.conciliation.record", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    if (!disciplinaryCase.isPoshCase) {
      throw new FoundationError("PRECONDITION_FAILED", "Conciliation applies only to POSH (HARASSMENT) cases (FR-G09-023 BR-2)");
    }
    if (!input.opted) {
      throw new FoundationError("PRECONDITION_FAILED", "Conciliation is recorded only when opted for by the aggrieved complainant (FR-G09-023 BR-2)");
    }
    if (disciplinaryCase.stage === "INQUIRY_REPORT" || disciplinaryCase.caseStatus === "PENALTY_IMPOSED" || disciplinaryCase.caseStatus === "CLOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Conciliation must be recorded before the inquiry (FR-G09-023 BR-2)", {
        details: { stage: disciplinaryCase.stage, caseStatus: disciplinaryCase.caseStatus },
      });
    }
    // BR-2: no monetary settlement as the basis of conciliation.
    if (/monetary|payment|cash|money/i.test(input.settlementBasis)) {
      throw new FoundationError("ERR-G09-CONCILIATION-MONETARY", "A POSH conciliation may not rest on a monetary settlement (FR-G09-023 BR-2)", {
        field: "settlementBasis",
      });
    }
    const conciliation: PoshConciliation = {
      id: nextId("g09-posh-conciliation", this.conciliationSerial++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      outcome: input.outcome,
      settlementBasis: input.settlementBasis,
      recordedOn: input.recordedOn,
      summary: input.summary,
    };
    this.conciliations.push(conciliation);
    disciplinaryCase.conciliationOutcome = input.outcome;
    this.appendTimeline(actor, caseId, disciplinaryCase.stage, "NOTE", `POSH conciliation ${input.outcome.toLowerCase()}`, input.recordedOn);
    this.audit.recordMutation(actor, {
      action: "G09_POSH_CONCILIATION_RECORDED",
      subjectRef: `g09_disciplinary_cases:${caseId}`,
      metadata: { outcome: input.outcome, settlementBasis: input.settlementBasis },
    });
    return { disciplinaryCase: { ...disciplinaryCase }, conciliation: { ...conciliation } };
  }

  listConciliations(scope: TenantScope, caseId: string): PoshConciliation[] {
    requireTenantScope(scope);
    return this.conciliations
      .filter((row) => row.caseId === caseId && row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId))
      .map((row) => ({ ...row }));
  }

  /**
   * FR-G09-023 fail-closed gate: a POSH case may not proceed past the charge stage unless the
   * repository holds a validly composed ACTIVE ICC (presiding senior woman + external member).
   */
  private assertIccConstitutedForPosh(scope: TenantScope, disciplinaryCase: DisciplinaryCase): void {
    if (!disciplinaryCase.isPoshCase) {
      return;
    }
    const active = this.dueProcess.listIccAppointments(scope, disciplinaryCase.id).filter((row) => row.status === "ACTIVE");
    const hasPresiding = active.some((row) => row.roleType === "ICC_PRESIDING" && row.isWoman && row.isSeniorLevel);
    const hasExternal = active.some((row) => row.roleType === "ICC_EXTERNAL_MEMBER");
    if (!hasPresiding || !hasExternal) {
      throw new FoundationError("ERR-G09-ICC-PROCEDURE-REQUIRED", "A POSH case cannot proceed to inquiry without a validly constituted ICC (FR-G09-023)", {
        details: { caseNo: disciplinaryCase.caseNo, hasPresiding, hasExternal, inquiryRoute: disciplinaryCase.inquiryRoute },
      });
    }
  }

  // -------------------------------------------------------------------------------------
  // PH-15F FR-G09-025: personal_hearings (SHOW_CAUSE / APPEAL) — grant / deny-with-reason
  // -------------------------------------------------------------------------------------

  /** FR-G09-025 AC-1: record the charged officer's hearing request (requested=true).
   *  Post-full-review-goal fix: this had no ownership check at all — any
   *  `g09.personal-hearing.request` holder could request a hearing on a case that was not
   *  theirs. Self-or-override only. */
  requestPersonalHearing(
    actor: ActorContext,
    caseId: string,
    input: { stage: PersonalHearingStage; requestedOn: string; showCauseNoticeId?: string }
  ): PersonalHearing {
    this.authorization.check(actor, "g09.personal-hearing.request", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    this.assertNotAbated(disciplinaryCase);
    if (input.showCauseNoticeId) {
      const notice = this.requireShowCauseNotice(actor, input.showCauseNoticeId);
      if (notice.caseId !== caseId) {
        throw new FoundationError("VALIDATION_FAILED", "Show-cause notice does not belong to this case", { field: "showCauseNoticeId" });
      }
    }
    const hearing: PersonalHearing = {
      id: nextId("g09-personal-hearing", this.dueProcess.countPersonalHearings()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      stage: input.stage,
      requested: true,
      requestedOn: input.requestedOn,
      status: "REQUESTED",
      granted: false,
      showCauseNoticeId: input.showCauseNoticeId,
    };
    this.dueProcess.savePersonalHearing(hearing);
    this.appendTimeline(actor, caseId, input.stage, "NOTE", "Personal hearing requested", input.requestedOn);
    this.audit.recordMutation(actor, { action: "G09_PERSONAL_HEARING_REQUESTED", subjectRef: `g09_personal_hearings:${hearing.id}`, metadata: { stage: input.stage } });
    return { ...hearing };
  }

  /**
   * FR-G09-025 AC-2 (DI-29): the authority grants or denies. A denial without a recorded
   * denial_reason throws ERR-G09-PERSONAL-HEARING-DENIED (422) — the BRD requires the right
   * to be heard before adverse action, so a silent/reasonless denial fails closed. A grant
   * records the schedule and links personal_hearing_id onto the referencing show-cause/appeal.
   */
  decidePersonalHearing(
    actor: ActorContext,
    hearingId: string,
    input: { decision: "GRANT" | "DENY"; decidedOn: string; denialReason?: string; scheduledDate?: string; presidedBy?: string }
  ): PersonalHearing {
    this.authorization.check(actor, "g09.personal-hearing.decide", actor);
    const hearing = this.requirePersonalHearing(actor, hearingId);
    if (hearing.status !== "REQUESTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Personal hearing is not open for a decision");
    }
    const disciplinaryCase = this.requireCase(actor, hearing.caseId);
    if (input.decision === "DENY") {
      if (!input.denialReason) {
        throw new FoundationError("ERR-G09-PERSONAL-HEARING-DENIED", "Denial of a requested personal hearing requires a recorded denial_reason (FR-G09-025/DI-29)", {
          field: "denialReason",
          details: { hearingId: hearing.id, stage: hearing.stage },
        });
      }
      hearing.status = "DENIED";
      hearing.granted = false;
      hearing.denialReason = input.denialReason;
    } else {
      hearing.status = "GRANTED";
      hearing.granted = true;
      hearing.scheduledDate = input.scheduledDate ?? input.decidedOn;
      // BR-3: the presiding authority is the DA (show-cause) unless an appellate authority is named.
      hearing.presidedBy = input.presidedBy ?? disciplinaryCase.disciplinaryAuthorityId;
      // FR-G09-025 AC-4: the referencing show-cause/appeal carries personal_hearing_id.
      if (hearing.stage === "SHOW_CAUSE" && hearing.showCauseNoticeId) {
        const notice = this.requireShowCauseNotice(actor, hearing.showCauseNoticeId);
        notice.personalHearingId = hearing.id;
        this.dueProcess.saveShowCauseNotice(notice);
      }
      if (hearing.stage === "APPEAL") {
        disciplinaryCase.appealPersonalHearingId = hearing.id;
      }
    }
    this.dueProcess.savePersonalHearing(hearing);
    this.appendTimeline(actor, hearing.caseId, hearing.stage, "NOTE", `Personal hearing ${hearing.status.toLowerCase()}`, input.decidedOn);
    this.audit.recordMutation(actor, {
      action: "G09_PERSONAL_HEARING_DECIDED",
      subjectRef: `g09_personal_hearings:${hearing.id}`,
      metadata: { decision: hearing.status, denialReason: hearing.denialReason },
    });
    return { ...hearing };
  }

  /** FR-G09-025 AC-3: hold the hearing and record minutes; minutes are immutable once recorded (BR-2). */
  recordPersonalHearingMinutes(actor: ActorContext, hearingId: string, input: { heldDate: string; minutesText: string }): PersonalHearing {
    this.authorization.check(actor, "g09.personal-hearing.decide", actor);
    const hearing = this.requirePersonalHearing(actor, hearingId);
    if (hearing.status !== "GRANTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Minutes can only be recorded on a granted personal hearing");
    }
    if (hearing.minutesText) {
      throw new FoundationError("PRECONDITION_FAILED", "Personal-hearing minutes are immutable once finalised (FR-G09-025 BR-2)");
    }
    hearing.heldDate = input.heldDate;
    hearing.minutesText = input.minutesText;
    this.dueProcess.savePersonalHearing(hearing);
    this.appendTimeline(actor, hearing.caseId, hearing.stage, "NOTE", "Personal hearing held; minutes recorded", input.heldDate);
    return { ...hearing };
  }

  /** Post-full-review-goal fix: this had no ownership check at all — any `g09.case.read` holder
   *  could read any case's personal-hearing requests/decisions. Self-or-override only, since the
   *  charged officer needs to see their own hearing request's GRANT/DENY outcome. */
  listPersonalHearings(actor: ActorContext, caseId: string): PersonalHearing[] {
    requireTenantScope(actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    return this.dueProcess.listPersonalHearings(actor, caseId);
  }

  // -------------------------------------------------------------------------------------
  // PH-15F FR-G09-024: sla_pause_events pause/resume with SLA recompute (DI-18)
  // -------------------------------------------------------------------------------------

  /** FR-G09-024 AC-1: open a pause recording stage, reason, paused_from, paused_by, source ref. */
  pauseSla(
    actor: ActorContext,
    caseId: string,
    input: { stage: string; reason: SlaPauseReason; pausedFrom: string; sourceRefId?: string }
  ): SlaPauseEvent {
    this.authorization.check(actor, "g09.sla.pause", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertNotAbated(disciplinaryCase);
    const pause: SlaPauseEvent = {
      id: nextId("g09-sla-pause", this.dueProcess.countSlaPauseEvents()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      stage: input.stage,
      reason: input.reason,
      pausedFrom: input.pausedFrom,
      pausedBy: actor.userId,
      sourceRefId: input.sourceRefId,
      recomputeApplied: false,
    };
    this.dueProcess.appendSlaPauseEvent(pause);
    // FR-G09-024 AC-4: pause/resume land on the hash-chained case timeline.
    this.appendTimeline(actor, caseId, input.stage, "SLA_PAUSE", `SLA paused (${input.reason})`, input.pausedFrom);
    this.audit.recordMutation(actor, { action: "G09_SLA_PAUSED", subjectRef: `g09_sla_pause_events:${pause.id}`, metadata: { stage: input.stage, reason: input.reason } });
    return { ...pause };
  }

  /**
   * FR-G09-024 AC-3 (DI-18): resume sets resumed_at on the OPEN pause (append-only, never a
   * deletion) and recomputes sla_target_at / expected_closure_date by adding the paused duration.
   * Overlapping pause windows are coalesced (AC-5) so a duplicated reason never double-extends
   * the targets. Resume without an open pause throws ERR-G09-SLA-PAUSE-INVALID (409).
   */
  resumeSla(
    actor: ActorContext,
    caseId: string,
    input: { stage: string; resumedAt: string }
  ): { pause: SlaPauseEvent; totalPausedDays: number; slaTargetAt: string; expectedClosureDate: string } {
    this.authorization.check(actor, "g09.sla.pause", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    const open = this.dueProcess.findOpenSlaPause(actor, caseId, input.stage);
    if (!open) {
      throw new FoundationError("ERR-G09-SLA-PAUSE-INVALID", "Resume without an open SLA pause for this stage (FR-G09-024/DI-18)", {
        field: "stage",
        details: { caseId, stage: input.stage },
      });
    }
    if (input.resumedAt < open.pausedFrom) {
      throw new FoundationError("ERR-G09-SLA-PAUSE-INVALID", "resumed_at cannot precede paused_from", {
        field: "resumedAt",
        details: { pausedFrom: open.pausedFrom, resumedAt: input.resumedAt },
      });
    }
    const resumed = this.dueProcess.markSlaPauseResumed(actor, open.id, input.resumedAt);
    // AC-5: coalesce all CLOSED pause windows and recompute from the immutable baselines —
    // overlapping windows count once, and repeated resumes stay idempotent per window set.
    const totalPausedDays = coalescedPausedDays(
      this.dueProcess
        .listSlaPauseEvents(actor, caseId)
        .filter((row) => row.resumedAt !== undefined)
        .map((row) => ({ from: row.pausedFrom, to: row.resumedAt as string }))
    );
    disciplinaryCase.slaTargetAt = addDays(disciplinaryCase.baseSlaTargetAt, totalPausedDays);
    disciplinaryCase.expectedClosureDate = addDays(disciplinaryCase.baseExpectedClosureDate, totalPausedDays);
    this.appendTimeline(actor, caseId, input.stage, "SLA_RESUME", `SLA resumed; targets extended by ${totalPausedDays} paused day(s)`, input.resumedAt);
    this.audit.recordMutation(actor, {
      action: "G09_SLA_RESUMED",
      subjectRef: `g09_sla_pause_events:${resumed.id}`,
      metadata: { stage: input.stage, totalPausedDays, slaTargetAt: disciplinaryCase.slaTargetAt },
    });
    return { pause: resumed, totalPausedDays, slaTargetAt: disciplinaryCase.slaTargetAt, expectedClosureDate: disciplinaryCase.expectedClosureDate };
  }

  /** FR-G09-024 AC-2 (DI-18): the SLA evaluator raises NO breach for a stage while it is paused. */
  evaluateSlaBreach(scope: TenantScope, caseId: string, input: { stage: string; asOf: string }): { paused: boolean; breached: boolean; slaTargetAt: string } {
    requireTenantScope(scope);
    const disciplinaryCase = this.requireCase(scope, caseId);
    const pauses = this.dueProcess.listSlaPauseEvents(scope, caseId).filter((row) => row.stage === input.stage);
    const paused = pauses.some((row) => row.pausedFrom <= input.asOf && (row.resumedAt === undefined || input.asOf < row.resumedAt));
    return {
      paused,
      breached: paused ? false : input.asOf > disciplinaryCase.slaTargetAt,
      slaTargetAt: disciplinaryCase.slaTargetAt,
    };
  }

  /** FR-G09-024: the pause windows ledger (dashboard shows total paused duration, AC-5). */
  listSlaPauses(scope: TenantScope, caseId: string): SlaPauseEvent[] {
    requireTenantScope(scope);
    return this.dueProcess.listSlaPauseEvents(scope, caseId);
  }

  /** FR-G09-018: authority-level assignment (delegation modelled as an authority level). */
  registerAuthorityLevel(actor: ActorContext, input: { employeeId: string; authorityLevel: string }): void {
    this.authorization.check(actor, "g09.competence.admin", actor);
    if (authorityRank(input.authorityLevel) < 0) {
      throw new FoundationError("VALIDATION_FAILED", "Unknown authority level", { field: "authorityLevel" });
    }
    this.dueProcess.saveAuthorityAssignment({
      id: nextId("g09-authority-assignment", this.authoritySerial++),
      tenantId: actor.tenantId,
      employeeId: input.employeeId,
      authorityLevel: input.authorityLevel,
    });
  }

  /** FR-G09-028/DI-26: abatement on death — the respondent/case moves to ABATED and finalise is blocked. */
  recordRespondentDeath(actor: ActorContext, caseId: string, input: { deathDate: string }): DisciplinaryCase {
    this.authorization.check(actor, "g09.case.abate", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    if (disciplinaryCase.caseStatus === "ABATED") {
      return { ...disciplinaryCase };
    }
    disciplinaryCase.caseStatus = "ABATED";
    disciplinaryCase.abatementReason = `Respondent deceased on ${input.deathDate}; proceedings abate (DI-26)`;
    this.appendTimeline(actor, caseId, "CLOSED", "NOTE", "Case abated on death of the respondent", input.deathDate);
    this.audit.recordMutation(actor, { action: "G09_CASE_ABATED", subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`, metadata: { reason: "RESPONDENT_DECEASED" } });
    return { ...disciplinaryCase };
  }

  /**
   * FR-G09-011/018/019 order finalise. Every gate is validated BEFORE any state mutation so a
   * blocked gate leaves no partial order state (single logical transaction):
   *   (1) DI-26 abatement — finalise on an abated case throws ERR-G09-CASE-ABATED;
   *   (2) SoD — the passing authority is never the respondent or the case initiator;
   *   (3) DI-4 — the final penalty set must be a subset of the show-cause proposed set,
   *       otherwise ERR-G09-PENALTY-EXCEEDS-PROPOSED;
   *   (4) DI-13/Art. 311(1) — the passing authority must be competent per authority_competence
   *       (fail-safe deny on a missing entry) and, for DISMISSAL/REMOVAL/COMPULSORY_RETIREMENT,
   *       must NOT be subordinate to the appointing authority — ERR-G09-AUTHORITY-NOT-COMPETENT;
   *   (5) DI-14 — every mandatory consultation must be CLOSED or WAIVED — ERR-G09-CONSULTATION-PENDING;
   *   (6) E14 — a served disagreement memo must be RESPONDED before finalise.
   */
  finaliseOrder(
    actor: ActorContext,
    caseId: string,
    input: {
      showCauseNoticeId: string;
      penalties: G09PenaltyType[];
      passedBy: string;
      orderDate: string;
      reasoningText: string;
      proportionalityReasoning: string;
      idempotencyKey: string;
    }
  ): { disciplinaryCase: DisciplinaryCase; penaltyOrder: PenaltyOrder; srEventId: string } {
    this.authorization.check(actor, "g09.order.finalise", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    // Gate 1 — DI-26 abatement.
    this.assertNotAbated(disciplinaryCase);
    this.requireStage(disciplinaryCase, "INQUIRY_REPORT");
    const primaryPenalty = input.penalties[0];
    if (!primaryPenalty) {
      throw new FoundationError("VALIDATION_FAILED", "At least one penalty is required to finalise an order", { field: "penalties" });
    }
    // Gate 2 — SoD: the passing authority is never the respondent or the case initiator.
    if (input.passedBy === disciplinaryCase.chargedEmployeeId || input.passedBy === disciplinaryCase.initiatedBy) {
      throw new FoundationError("ERR-G09-ACTOR-CONFLICT", "The authority passing a penalty must be distinct from the respondent and the case initiator (DI-2)", {
        field: "passedBy",
      });
    }
    // Gate 3 — DI-4 proposed-penalty subset rule.
    const notice = this.requireShowCauseNotice(actor, input.showCauseNoticeId);
    if (notice.caseId !== caseId) {
      throw new FoundationError("VALIDATION_FAILED", "Show-cause notice does not belong to this case", { field: "showCauseNoticeId" });
    }
    const exceeds = input.penalties.filter((penalty) => !notice.proposedPenaltyJson.includes(penalty));
    if (exceeds.length > 0) {
      throw new FoundationError("ERR-G09-PENALTY-EXCEEDS-PROPOSED", "Final penalty is not a subset of the show-cause proposed penalty set (DI-4)", {
        field: "penalties",
        details: { proposed: notice.proposedPenaltyJson, exceeds },
      });
    }
    // Gate 4 — DI-13 competence matrix + Art. 311(1) subordinate guard.
    for (const penalty of input.penalties) {
      this.assertAuthorityCompetentForPenalty(actor, disciplinaryCase, input.passedBy, penalty);
    }
    // Gate 5 — DI-14 mandatory consultations CLOSED/WAIVED.
    const pendingConsultations = this.dueProcess
      .listConsultations(actor, caseId)
      .filter((row) => row.isMandatory && row.status !== "CLOSED" && row.status !== "WAIVED");
    if (pendingConsultations.length > 0) {
      throw new FoundationError("ERR-G09-CONSULTATION-PENDING", "Mandatory consultation is not CLOSED/WAIVED (DI-14)", {
        details: { pendingConsultations: pendingConsultations.map((row) => row.consultationType) },
      });
    }
    // Gate 6 — E14: a served disagreement memo must be responded before finalise.
    const openMemos = this.dueProcess.listDisagreementMemos(actor, caseId).filter((memo) => memo.status === "ISSUED" || memo.status === "SERVED");
    if (openMemos.length > 0) {
      throw new FoundationError("ERR-G09-DUE-PROCESS-INCOMPLETE", "Disagreement memo must be responded to before the order can be finalised", {
        details: { openDisagreementMemos: openMemos.length },
      });
    }
    // All gates passed — persist the order, close the notice, post to SR, and chain the timeline row.
    const document = this.documentVault.createDocument(actor, {
      title: `Penalty Order ${disciplinaryCase.caseNo}`,
      ownerEmployeeId: disciplinaryCase.chargedEmployeeId,
      classification: disciplinaryCase.confidential ? "SECRET" : "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ caseNo: disciplinaryCase.caseNo, penalties: input.penalties, reason: input.reasoningText })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G09",
      entityName: "penalty_orders",
      entityRefId: disciplinaryCase.id,
      linkRole: "PENALTY_ORDER",
    });
    const legacyPenaltyType: PenaltyType = input.penalties.some((penalty) => penaltyClassOf(penalty) === "MAJOR") ? "MAJOR_PENALTY" : "MINOR_PENALTY";
    const order: PenaltyOrder = {
      id: nextId("penalty-order", this.penaltyOrders.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      disciplinaryCaseId: disciplinaryCase.id,
      employeeId: disciplinaryCase.chargedEmployeeId,
      penaltyType: legacyPenaltyType,
      penaltyItems: [...input.penalties],
      passedBy: input.passedBy,
      showCauseNoticeId: notice.id,
      orderNo: `DPO/${String(this.penaltyOrders.length + 1).padStart(5, "0")}`,
      status: "FINALISED",
      documentId: attached.id,
    };
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G09",
      sourceReferenceId: `g09_penalty_orders:${order.id}:FINALISED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: primaryPenalty,
      eventDate: input.orderDate,
      factKey: `G09:${order.id}:${input.penalties.join("+")}`,
      orderNo: order.orderNo,
      payload: { caseNo: disciplinaryCase.caseNo, penalties: input.penalties, reason: input.reasoningText },
      documentIds: [attached.id],
    });
    order.srEventId = sr.event.id;
    this.penaltyOrders.push(order);
    notice.status = "CLOSED";
    this.dueProcess.saveShowCauseNotice(notice);
    disciplinaryCase.stage = "CLOSED";
    disciplinaryCase.caseStatus = "PENALTY_IMPOSED";
    disciplinaryCase.penaltyOrderId = order.id;
    disciplinaryCase.srEventId = sr.event.id;
    this.appendTimeline(actor, caseId, "ORDER", "STAGE_COMPLETED", `Penalty order ${order.orderNo} finalised`, input.orderDate);
    this.audit.recordMutation(actor, {
      action: "G09_ORDER_FINALISED",
      subjectRef: `g09_penalty_orders:${order.id}`,
      metadata: { penalties: input.penalties, competenceVerified: true, srEventId: sr.event.id },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G09_PENALTY_SERVED",
      channel: "IN_APP",
      relatedRef: `g09_penalty_orders:${order.id}`,
      mergeFields: { penaltyType: input.penalties.join(",") },
    });
    return { disciplinaryCase: { ...disciplinaryCase }, penaltyOrder: { ...order }, srEventId: sr.event.id };
  }

  /** DI-21: the case timeline as stored (seq_no/prev_hash/row_hash chain). Post-full-review-goal
   *  fix: (1) had no ownership check at all — any `g09.case.read` holder could read any case's
   *  timeline; (2) the permission string here (`g09.timeline.read`) didn't match the route's
   *  declared gate (`g09.case.read`), so a caller needed both to ever reach this method — aligned
   *  to `g09.case.read`, matching every other case-scoped read in this service. */
  listCaseTimeline(actor: ActorContext, caseId: string): CaseTimelineEvent[] {
    this.authorization.check(actor, "g09.case.read", actor);
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    return this.dueProcess.listTimelineEvents(actor, caseId);
  }

  /**
   * FR-G09-027/DI-21 verify: recomputes every row_hash and prev_hash link from row content —
   * stored hash values are never trusted. Any tampered row raises ERR-G09-AUDIT-CHAIN-BROKEN.
   */
  verifyCaseTimeline(actor: ActorContext, caseId: string): { verified: true; eventCount: number } {
    this.authorization.check(actor, "g09.timeline.verify", actor);
    const rows = this.dueProcess.listTimelineEvents(actor, caseId);
    verifyTimelineChainRows(rows);
    return { verified: true, eventCount: rows.length };
  }

  /** Self-service "view my disciplinary case status": every case naming this employee as the
   *  charged officer, self-or-override only. `inquiryReportDocumentId` is stripped for a
   *  non-override (self-service) caller — the preliminary/inquiry report is never served-by-
   *  default (see `listCaseEvidence`'s `isServed: false` for `INQUIRY_REPORT`), so its document
   *  reference should not leak via the case row either. */
  listMyCases(actor: ActorContext, employeeId: string): DisciplinaryCase[] {
    requireTenantScope(actor);
    this.assertSelfOrDisciplinaryOverride(actor, employeeId);
    const cases = this.cases.filter((item) => this.inScope(item, actor) && item.chargedEmployeeId === employeeId).map((item) => ({ ...item }));
    if (this.isDisciplinaryAccessOverride(actor)) {
      return cases;
    }
    return cases.map((item) => ({ ...item, inquiryReportDocumentId: undefined }));
  }

  /**
   * G11 FR-22 linkage seam: OPEN proceedings for an employee. The Rule 9 provisional-pension
   * gate consumes this to withhold DCRG while departmental proceedings are pending.
   */
  listOpenProceedings(scope: TenantScope, employeeId: string): DisciplinaryCase[] {
    requireTenantScope(scope);
    return this.cases
      .filter((item) => this.inScope(item, scope) && item.chargedEmployeeId === employeeId && item.caseStatus === "OPEN")
      .map((item) => ({ ...item }));
  }

  /**
   * G10 FR-09 linkage seam: scoped read of one penalty order. The G10 recovery scheduler
   * consumes this so every scheduled recovery ties to a real upstream G09 order — never a stub.
   * Post-full-review-goal fix: this had no ownership check at all — any `g09.case.read` holder
   * could read any employee's penalty order. Self-or-override only.
   */
  getPenaltyOrder(actor: ActorContext, penaltyOrderId: string): PenaltyOrder {
    requireTenantScope(actor);
    const order = this.penaltyOrders.find((item) => this.inScope(item, actor) && item.id === penaltyOrderId);
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Penalty order not found");
    }
    this.assertSelfOrDisciplinaryOverride(actor, order.employeeId);
    return { ...order, penaltyItems: order.penaltyItems ? [...order.penaltyItems] : undefined };
  }

  summary(scope: TenantScope): { cases: number; penalties: number; confidential: number; impactSignals: number } {
    requireTenantScope(scope);
    const cases = this.cases.filter((item) => this.inScope(item, scope));
    return {
      cases: cases.length,
      penalties: this.penaltyOrders.filter((order) => this.inScope(order, scope)).length,
      confidential: cases.filter((item) => item.confidential || item.sealedRouting).length,
      impactSignals: this.impactSignals.filter((signal) => this.employeeMaster.getById(scope, signal.employeeId)).length,
    };
  }

  /**
   * PH-28B — list a case's evidence-vault artefacts (charge memo, inquiry report, penalty orders)
   * with WORM / legal-hold / served flags, for the G09 evidence-vault listing UI (PH-27C).
   * Post-full-review-goal fix: this had no ownership check at all — any `g09.case.read` holder
   * could read any case's evidence list. Self-or-override only; a non-override (self-service)
   * caller additionally only ever sees `isServed: true` items — BRD §3.3 confines the charged
   * officer to formally served/disclosed artefacts (the preliminary/inquiry report is withheld
   * unless relied upon in evidence, which this simplified model treats as never-served-by-default).
   */
  listCaseEvidence(actor: ActorContext, caseId: string): Array<{ documentId: string; artefactType: string; isWorm: boolean; legalHold: boolean; isServed: boolean }> {
    const disciplinaryCase = this.requireCase(actor, caseId);
    this.assertSelfOrDisciplinaryOverride(actor, disciplinaryCase.chargedEmployeeId);
    const items: Array<{ documentId: string; artefactType: string; isWorm: boolean; legalHold: boolean; isServed: boolean }> = [];
    if (disciplinaryCase.chargeMemoDocumentId) {
      items.push({ documentId: disciplinaryCase.chargeMemoDocumentId, artefactType: "CHARGE_MEMO", isWorm: true, legalHold: false, isServed: true });
    }
    if (disciplinaryCase.inquiryReportDocumentId) {
      items.push({ documentId: disciplinaryCase.inquiryReportDocumentId, artefactType: "INQUIRY_REPORT", isWorm: true, legalHold: false, isServed: false });
    }
    for (const order of this.penaltyOrders.filter((o) => this.inScope(o, actor) && o.disciplinaryCaseId === caseId && o.documentId)) {
      items.push({ documentId: order.documentId, artefactType: "PENALTY_ORDER", isWorm: true, legalHold: false, isServed: order.status === "SERVED" });
    }
    return this.isDisciplinaryAccessOverride(actor) ? items : items.filter((item) => item.isServed);
  }

  private assertAuthorityCompetence(chargedEmployeeId: string, authorityEmployeeId: string): void {
    if (chargedEmployeeId === authorityEmployeeId) {
      throw new FoundationError("CONFLICT", "G09_AUTHORITY_COMPETENCE blocks self disciplinary authority", { details: { marker: "G09_AUTHORITY_COMPETENCE" } });
    }
  }

  /** FR-G09-028/DI-26: penalty work on an abated case is refused with the BRD-named code. */
  private assertNotAbated(disciplinaryCase: DisciplinaryCase): void {
    if (disciplinaryCase.caseStatus === "ABATED") {
      throw new FoundationError("ERR-G09-CASE-ABATED", "Proceedings have abated on the death of the respondent (DI-26)", {
        details: { caseNo: disciplinaryCase.caseNo },
      });
    }
  }

  /** FR-G09-003/DI-8: the subsistence rate must sit within the procedure template floor/ceiling. */
  private assertSubsistenceWithinBounds(disciplinaryCase: DisciplinaryCase, ratePct: number): void {
    if (ratePct < disciplinaryCase.subsistenceFloorPct || ratePct > disciplinaryCase.subsistenceCeilingPct) {
      throw new FoundationError("ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS", "Subsistence allowance rate is outside the procedure template bounds (DI-8)", {
        field: "subsistenceRatePct",
        details: { ratePct, floorPct: disciplinaryCase.subsistenceFloorPct, ceilingPct: disciplinaryCase.subsistenceCeilingPct },
      });
    }
  }

  /**
   * DI-13 + Art. 311(1): the passing authority must hold at least the competence-matrix level for
   * the penalty class/type (fail-safe deny on a missing matrix entry or unassigned level), and for
   * "DISMISSAL"/"REMOVAL"/"COMPULSORY_RETIREMENT" must NOT be a subordinate authority relative to
   * the appointing authority.
   */
  private assertAuthorityCompetentForPenalty(actor: ActorContext, disciplinaryCase: DisciplinaryCase, passedBy: string, penalty: G09PenaltyType): void {
    const rule = this.dueProcess.findCompetenceRule(actor, {
      competenceSetCode: disciplinaryCase.competenceSetCode,
      subjectCadre: disciplinaryCase.subjectCadre,
      penaltyClass: penaltyClassOf(penalty),
      penaltyType: penalty,
    });
    if (!rule) {
      // Fail-safe deny: no matrix entry for the cadre/class means nobody is competent.
      throw new FoundationError("ERR-G09-AUTHORITY-NOT-COMPETENT", "No authority-competence matrix entry exists for this cadre and penalty (DI-13 fail-safe deny)", {
        field: "passedBy",
        details: { penaltyType: penalty, subjectCadre: disciplinaryCase.subjectCadre },
      });
    }
    const passedByLevel = this.dueProcess.findAuthorityLevel(actor, passedBy);
    if (!passedByLevel || authorityRank(passedByLevel) < authorityRank(rule.minAuthorityLevel)) {
      throw new FoundationError("ERR-G09-AUTHORITY-NOT-COMPETENT", "Signing authority is not competent for this penalty class/type (DI-13)", {
        field: "passedBy",
        details: { penaltyType: penalty, requiredLevel: rule.minAuthorityLevel },
      });
    }
    if (rule.requiresNotSubordinateToAppointing && isSubordinateAuthority(passedByLevel, disciplinaryCase.appointingAuthorityLevel)) {
      throw new FoundationError(
        "ERR-G09-AUTHORITY-NOT-COMPETENT",
        `A ${penalty} must be passed by an authority not subordinate to the appointing authority (Article 311(1))`,
        { field: "passedBy", details: { penaltyType: penalty, requiredLevel: disciplinaryCase.appointingAuthorityLevel } }
      );
    }
  }

  /** DI-21: every state-changing action appends one hash-chained case_timeline_events row. */
  private appendTimeline(actor: ActorContext, caseId: string, stage: string, eventType: TimelineEventType, notes: string, eventAt: string): void {
    this.dueProcess.appendTimelineEvent({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      stage,
      eventType,
      eventAt,
      actorId: actor.userId,
      notes,
    });
  }

  private requirePreliminaryInquiry(scope: TenantScope, inquiryId: string): PreliminaryInquiry {
    const inquiry = this.dueProcess.findPreliminaryInquiry(scope, inquiryId);
    if (!inquiry) {
      throw new FoundationError("NOT_FOUND", "Preliminary inquiry not found");
    }
    return inquiry;
  }

  private requireSuspension(scope: TenantScope, suspensionId: string): Suspension {
    const suspension = this.dueProcess.findSuspension(scope, suspensionId);
    if (!suspension) {
      throw new FoundationError("NOT_FOUND", "Suspension not found");
    }
    return suspension;
  }

  private requireShowCauseNotice(scope: TenantScope, noticeId: string): ShowCauseNotice {
    const notice = this.dueProcess.findShowCauseNotice(scope, noticeId);
    if (!notice) {
      throw new FoundationError("NOT_FOUND", "Show-cause notice not found");
    }
    return notice;
  }

  private requireDisagreementMemo(scope: TenantScope, memoId: string): DisagreementMemo {
    const memo = this.dueProcess.findDisagreementMemo(scope, memoId);
    if (!memo) {
      throw new FoundationError("NOT_FOUND", "Disagreement memo not found");
    }
    return memo;
  }

  private requirePersonalHearing(scope: TenantScope, hearingId: string): PersonalHearing {
    const hearing = this.dueProcess.findPersonalHearing(scope, hearingId);
    if (!hearing) {
      throw new FoundationError("NOT_FOUND", "Personal hearing not found");
    }
    return hearing;
  }

  private requireConsultationRow(scope: TenantScope, consultationId: string): CaseConsultation {
    const consultation = this.dueProcess.findConsultation(scope, consultationId);
    if (!consultation) {
      throw new FoundationError("NOT_FOUND", "Consultation not found");
    }
    return consultation;
  }

  private addImpactSignal(scope: TenantScope, employeeId: string, penaltyType: PenaltyType): DisciplinaryImpactSignal {
    const signal: DisciplinaryImpactSignal = {
      id: nextId("g09-impact", this.impactSignals.length),
      sourceModule: "G09",
      employeeId,
      penaltyType,
      status: "READY_FOR_G06_G11",
    };
    this.impactSignals.push(signal);
    this.audit.recordMutation(scope, { action: "G09_IMPACT_SIGNAL", subjectRef: `g09_impact_signals:${signal.id}`, metadata: { penaltyType } });
    return { ...signal };
  }

  private requireCase(scope: TenantScope, caseId: string): DisciplinaryCase {
    const disciplinaryCase = this.cases.find((item) => item.id === caseId && this.inScope(item, scope));
    if (!disciplinaryCase) {
      throw new FoundationError("NOT_FOUND", "Disciplinary case not found");
    }
    return disciplinaryCase;
  }

  private requirePenalty(scope: TenantScope, penaltyOrderId: string): PenaltyOrder {
    const order = this.penaltyOrders.find((item) => item.id === penaltyOrderId && this.inScope(item, scope));
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Penalty order not found");
    }
    return order;
  }

  private requireStage(disciplinaryCase: DisciplinaryCase, expected: DisciplinaryCaseStage): void {
    if (disciplinaryCase.stage !== expected) {
      throw new FoundationError("PRECONDITION_FAILED", `Disciplinary case must be ${expected}`);
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }

  private isDisciplinaryAccessOverride(actor: ActorContext): boolean {
    return Boolean(actor.permissions?.includes("*") || actor.roles?.some((role) => DISCIPLINARY_ACCESS_OVERRIDE_ROLES.has(role)));
  }

  /** BRD §3.3: only the charged officer (self) or an authorised role may access case-scoped
   *  self-service reads/writes — never any arbitrary `g09.case.read`/`g09.show-cause.respond`/
   *  `g09.personal-hearing.request` holder. */
  private assertSelfOrDisciplinaryOverride(actor: ActorContext, chargedEmployeeId: string): void {
    if (!this.isDisciplinaryAccessOverride(actor) && actor.userId !== chargedEmployeeId) {
      throw new FoundationError("FORBIDDEN", "You may only access your own disciplinary case", { field: "caseId" });
    }
  }
}

/** Date arithmetic for statutory windows (90-day charge memo, 180-day subsistence review). */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (yyyy-mm-dd). */
function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * FR-G09-024 AC-5 (DI-18): total paused days across CLOSED pause windows with overlapping
 * windows coalesced — two overlapping pauses never double-extend the SLA targets.
 */
export function coalescedPausedDays(windows: Array<{ from: string; to: string }>): number {
  const sorted = [...windows].sort((left, right) => left.from.localeCompare(right.from));
  let total = 0;
  let currentFrom: string | undefined;
  let currentTo: string | undefined;
  for (const window of sorted) {
    if (currentFrom === undefined || currentTo === undefined || window.from > currentTo) {
      if (currentFrom !== undefined && currentTo !== undefined) {
        total += dayDiff(currentFrom, currentTo);
      }
      currentFrom = window.from;
      currentTo = window.to;
    } else if (window.to > currentTo) {
      currentTo = window.to;
    }
  }
  if (currentFrom !== undefined && currentTo !== undefined) {
    total += dayDiff(currentFrom, currentTo);
  }
  return total;
}
