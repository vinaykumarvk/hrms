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
  InMemoryG09DueProcessRepository,
  PreliminaryInquiry,
  PreliminaryInquiryRecommendation,
  ShowCauseNotice,
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

export class DisciplinaryService {
  private readonly cases: DisciplinaryCase[] = [];
  private readonly penaltyOrders: PenaltyOrder[] = [];
  private readonly impactSignals: DisciplinaryImpactSignal[] = [];
  private preliminaryInquirySerial = 0;
  private showCauseSerial = 0;
  private disagreementSerial = 0;
  private consultationSerial = 0;
  private authoritySerial = 0;

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
    }
  ): DisciplinaryCase {
    this.authorization.check(actor, "g09.case.open", actor);
    this.assertAuthorityCompetence(input.chargedEmployeeId, input.disciplinaryAuthorityId);
    if (!this.employeeMaster.getById(actor, input.chargedEmployeeId)) {
      throw new FoundationError("NOT_FOUND", "Charged employee not found");
    }
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G09-DISCIPLINARY-DUE-PROCESS",
      subjectRef: `g09_disciplinary_cases:${input.chargedEmployeeId}:${this.cases.length + 1}`,
      stage: "INTAKE",
      resolverRule: { mechanism: "NAMED_ROLE", roleCode: "G09_DISCIPLINARY_AUTHORITY", subjectEmployeeId: input.chargedEmployeeId },
      asOf: "2026-07-02",
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
      confidential: Boolean(input.confidential),
      sealedRouting: Boolean(input.confidential),
      workflowInstanceId: started.instance.id,
    };
    this.cases.push(disciplinaryCase);
    this.appendTimeline(actor, disciplinaryCase.id, "INTAKE", "STAGE_ENTERED", "Case opened", "2026-07-02");
    this.audit.recordMutation(actor, {
      action: "G09_CASE_OPENED",
      subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`,
      metadata: { marker: "G09_AUTHORITY_COMPETENCE", confidential: disciplinaryCase.confidential, allegations: input.allegations },
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

  /** E15: record the respondent's representation against the show-cause notice. */
  respondToShowCause(actor: ActorContext, noticeId: string, input: { representationText: string; respondedAt: string }): ShowCauseNotice {
    this.authorization.check(actor, "g09.show-cause.respond", actor);
    const notice = this.requireShowCauseNotice(actor, noticeId);
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

  /** DI-21: the case timeline as stored (seq_no/prev_hash/row_hash chain). */
  listCaseTimeline(actor: ActorContext, caseId: string): CaseTimelineEvent[] {
    this.authorization.check(actor, "g09.timeline.read", actor);
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
   */
  getPenaltyOrder(scope: TenantScope, penaltyOrderId: string): PenaltyOrder {
    requireTenantScope(scope);
    const order = this.penaltyOrders.find((item) => this.inScope(item, scope) && item.id === penaltyOrderId);
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Penalty order not found");
    }
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
}

/** Date arithmetic for statutory windows (90-day charge memo, 180-day subsistence review). */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
