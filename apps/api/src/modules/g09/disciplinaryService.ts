import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";

export type DisciplinaryCaseStage = "INTAKE" | "CHARGE" | "INQUIRY" | "INQUIRY_REPORT" | "ORDER" | "CLOSED" | "APPEAL";
export type PenaltyType = "CENSURE" | "MINOR_PENALTY" | "MAJOR_PENALTY";
export type AppealDecision = "UPHELD" | "MODIFIED" | "SET_ASIDE";

export interface DisciplinaryCase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseNo: string;
  chargedEmployeeId: string;
  disciplinaryAuthorityId: string;
  stage: DisciplinaryCaseStage;
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

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
  ) {}

  openCase(actor: ActorContext, input: { chargedEmployeeId: string; disciplinaryAuthorityId: string; allegations: string; confidential?: boolean }): DisciplinaryCase {
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
      stage: "INTAKE",
      confidential: Boolean(input.confidential),
      sealedRouting: Boolean(input.confidential),
      workflowInstanceId: started.instance.id,
    };
    this.cases.push(disciplinaryCase);
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
    disciplinaryCase.penaltyOrderId = order.id;
    disciplinaryCase.srEventId = sr.event.id;
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
    this.audit.recordMutation(actor, { action: "G09_APPEAL_DECIDED", subjectRef: `g09_disciplinary_cases:${disciplinaryCase.id}`, metadata: { marker: "APPEAL_DECIDED", decision: input.decision, srEventId } });
    return { disciplinaryCase: { ...disciplinaryCase }, srEventId };
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
