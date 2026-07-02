import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";

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

export interface PromotionCase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseNo: string;
  seniorityListId: string;
  fromDesignation: string;
  toDesignation: string;
  vacancies: number;
  status: PromotionCaseStatus;
  candidates: Array<{ employeeId: string; rank: number; fitness: "PENDING" | "FIT" | "UNFIT" }>;
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

export class PromotionService {
  private readonly seniorityLists: SeniorityList[] = [];
  private readonly promotionCases: PromotionCase[] = [];
  private readonly promotionOrders: PromotionOrder[] = [];
  private readonly macpCases: MacpCase[] = [];
  private readonly payImpactSignals: G06PayImpactSignal[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
  ) {}

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

  createPromotionCase(actor: ActorContext, input: { seniorityListId: string; vacancies: number; fromDesignation: string; toDesignation: string }): PromotionCase {
    this.authorization.check(actor, "g06.promotion.case.write", actor);
    const list = this.requireSeniorityList(actor, input.seniorityListId);
    if (list.status !== "FINALISED") {
      throw new FoundationError("PRECONDITION_FAILED", "Promotion case requires a final seniority list");
    }
    if (input.vacancies < 1) {
      throw new FoundationError("VALIDATION_FAILED", "vacancies must be at least 1", { field: "vacancies" });
    }
    const candidates = list.entries.slice(0, input.vacancies).map((entry) => ({ employeeId: entry.employeeId, rank: entry.rank, fitness: "PENDING" as const }));
    const promotionCase: PromotionCase = {
      id: nextId("promotion-case", this.promotionCases.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseNo: `DPC/${list.effectiveDate.slice(0, 4)}/${String(this.promotionCases.length + 1).padStart(5, "0")}`,
      seniorityListId: list.id,
      fromDesignation: input.fromDesignation,
      toDesignation: input.toDesignation,
      vacancies: input.vacancies,
      status: "ELIGIBILITY_DONE",
      candidates,
    };
    this.promotionCases.push(promotionCase);
    this.audit.recordMutation(actor, { action: "G06_PROMOTION_CASE_CREATED", subjectRef: `g06_promotion_cases:${promotionCase.id}`, metadata: { candidates: candidates.length } });
    return this.clonePromotionCase(promotionCase);
  }

  holdDpc(
    actor: ActorContext,
    promotionCaseId: string,
    input: { panelMembers: DpcPanelMember[]; recusedEmployeeIds?: string[]; quorumRequired?: number }
  ): PromotionCase {
    this.authorization.check(actor, "g06.dpc.hold", actor);
    const promotionCase = this.requirePromotionCase(actor, promotionCaseId);
    const recused = input.recusedEmployeeIds ?? [];
    const candidateIds = new Set(promotionCase.candidates.map((candidate) => candidate.employeeId));
    const conflicted = input.panelMembers.find((member) => member.employeeId && candidateIds.has(member.employeeId) && !recused.includes(member.employeeId));
    if (conflicted) {
      throw new FoundationError("PRECONDITION_FAILED", "DPC_RECUSAL required for conflicted member", { details: { marker: "DPC_RECUSAL", employeeId: conflicted.employeeId } });
    }
    const participatingMembers = input.panelMembers.filter((member) => !member.employeeId || !recused.includes(member.employeeId)).length;
    const quorumRequired = input.quorumRequired ?? 2;
    if (participatingMembers < quorumRequired) {
      throw new FoundationError("PRECONDITION_FAILED", "DPC_QUORUM not met", { details: { marker: "DPC_QUORUM", participatingMembers, quorumRequired } });
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
    promotionCase.candidates = promotionCase.candidates.map((candidate) => ({ ...candidate, fitness: "FIT" }));
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
      metadata: { marker: "DPC_QUORUM", participatingMembers, quorumRequired, recusedEmployeeIds: recused },
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
      .filter((candidate) => candidate.fitness === "FIT")
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

  effectPromotionOrder(actor: ActorContext, promotionOrderId: string, input: { effectDate: string; idempotencyKey: string }): { order: PromotionOrder; srEventId: string; payImpactSignal: G06PayImpactSignal } {
    this.authorization.check(actor, "g06.promotion.order.effect", actor);
    const order = this.requirePromotionOrder(actor, promotionOrderId);
    if (order.status !== "ISSUED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only issued promotion orders can be effected");
    }
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
    const signal = this.addPayImpactSignal(actor, { sourceRef: order.id, kind: "PROMOTION", employeeId: order.employeeId });
    this.audit.recordMutation(actor, { action: "G06_PROMOTION_EFFECTED", subjectRef: `g06_promotion_orders:${order.id}`, metadata: { srEventId: sr.event.id, marker: "PROMOTION_EFFECTED" } });
    this.employeeMaster.getById(actor, order.employeeId);
    return { order: this.clonePromotionOrder(order), srEventId: sr.event.id, payImpactSignal: signal };
  }

  effectMacp(actor: ActorContext, input: { employeeId: string; level: string; dueDate: string; effectDate: string; idempotencyKey: string }): { macp: MacpCase; srEventId: string; payImpactSignal: G06PayImpactSignal } {
    this.authorization.check(actor, "g06.macp.effect", actor);
    this.employeeMaster.getById(actor, input.employeeId);
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

  listPromotionOrders(scope: TenantScope): PromotionOrder[] {
    requireTenantScope(scope);
    return this.promotionOrders.filter((order) => this.inScope(order, scope)).map((order) => this.clonePromotionOrder(order));
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
