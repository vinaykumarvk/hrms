import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentRecord, DocumentVaultService } from "../g13/documentVaultService";

export type TransferOrderStatus = "PENDING_APPROVAL" | "APPROVED" | "RELIEVED" | "JOINED" | "RETAINED" | "CANCELLED" | "DEEMED_RELIEVED";
export type ClearanceStatus = "OPEN" | "CLEARED" | "DEEMED_CLEARED";
export type TransferRepresentationStatus = "UNDER_REVIEW" | "RETAINED" | "REJECTED";

export interface ClearanceItem {
  code: string;
  label: string;
  status: ClearanceStatus;
  dueDate: string;
  completedOn?: string;
  deemedOn?: string;
}

export interface TransferOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  orderNo: string;
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  orderDate: string;
  effectiveDate: string;
  status: TransferOrderStatus;
  workflowInstanceId: string;
  workflowTaskId: string;
  clearanceWorkflowInstanceId?: string;
  resolverType: "POSITION_AUTHORITY";
  resolverEvidence: Record<string, unknown>;
  clearanceItems: ClearanceItem[];
  orderDocumentId?: string;
  joiningDocumentId?: string;
  retentionDocumentId?: string;
  cancellationDocumentId?: string;
  deemedReliefDocumentId?: string;
  srEventId?: string;
  retentionSrEventId?: string;
  cancellationSrEventId?: string;
  deemedReliefSrEventId?: string;
}

export interface TransferRepresentation {
  id: string;
  tenantId: string;
  entityId?: string;
  representationNo: string;
  transferOrderId: string;
  employeeId: string;
  grounds: string;
  status: TransferRepresentationStatus;
  workflowInstanceId: string;
  workflowTaskId: string;
  documentId: string;
  srEventId?: string;
}

export interface TransferInitiationResult {
  order: TransferOrder;
  workflow: { instance: WorkflowInstance; taskId: string };
}

export interface TransferApprovalResult {
  order: TransferOrder;
  document: DocumentRecord;
  clearanceWorkflow: { instance: WorkflowInstance; taskId: string };
}

export interface TransferJoinResult {
  order: TransferOrder;
  srEventId: string;
  document: DocumentRecord;
}

export class TransferService {
  private readonly orders: TransferOrder[] = [];
  private readonly representations: TransferRepresentation[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
  ) {}

  initiate(
    actor: ActorContext,
    input: { employeeId: string; fromOrgUnitId: string; toOrgUnitId: string; orderDate: string; effectiveDate: string; reason?: string }
  ): TransferInitiationResult {
    this.authorization.check(actor, "g05.transfer.initiate", actor);
    if (!dateOnly(input.orderDate) || !dateOnly(input.effectiveDate)) {
      throw new FoundationError("VALIDATION_FAILED", "Transfer dates must use YYYY-MM-DD", { field: "orderDate" });
    }
    if (input.effectiveDate < input.orderDate) {
      throw new FoundationError("VALIDATION_FAILED", "Transfer effective date cannot be before order date", { field: "effectiveDate" });
    }
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const orderId = nextId("transfer-order", this.orders.length);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G05-TRANSFER-ORDER",
      subjectRef: `g05_transfer_orders:${orderId}`,
      stage: "PENDING_TRANSFER_AUTHORITY",
      resolverRule: {
        mechanism: "POSITION_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        orgUnitId: input.fromOrgUnitId,
        subjectEmployeeId: input.employeeId,
      },
      asOf: input.orderDate,
    });
    const order: TransferOrder = {
      id: orderId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orderNo: `TO/${input.orderDate.slice(0, 4)}/${String(this.orders.length + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      fromOrgUnitId: input.fromOrgUnitId,
      toOrgUnitId: input.toOrgUnitId,
      orderDate: input.orderDate,
      effectiveDate: input.effectiveDate,
      status: "PENDING_APPROVAL",
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      resolverType: "POSITION_AUTHORITY",
      resolverEvidence: { ...started.task.resolution.evidence },
      clearanceItems: [],
    };
    this.orders.push(order);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_INITIATE",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { workflowInstanceId: order.workflowInstanceId, reason: input.reason },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: started.task.resolution.selectedAssignees[0]?.employeeId,
      messageId: "G05_TRANSFER_INITIATED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo },
    });
    return { order: this.cloneOrder(order), workflow: { instance: started.instance, taskId: started.task.id } };
  }

  approve(actor: ActorContext, transferOrderId: string): TransferApprovalResult {
    this.authorization.check(actor, "g05.transfer.approve", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "PENDING_APPROVAL") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending transfer orders can be approved");
    }
    this.workflow.actOnInstance(actor, { instanceId: order.workflowInstanceId, action: "APPROVE" });
    const document = this.documentVault.createDocument(actor, {
      title: `Transfer Order ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, employeeId: order.employeeId, effectiveDate: order.effectiveDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G05",
      entityName: "transfer_orders",
      entityRefId: order.id,
      linkRole: "TRANSFER_ORDER",
    });
    const clearanceWorkflow = this.workflow.start(actor, {
      workflowCode: "WF-G05-CLEARANCE-PARALLEL_ALL_OF",
      subjectRef: `g05_clearance_checklists:${order.id}`,
      stage: "PARALLEL_CLEARANCE",
      resolverRule: { mechanism: "WORK_QUEUE", queueScopeId: "G05_CLEARANCE", orgUnitId: order.fromOrgUnitId },
      asOf: order.orderDate,
    });
    order.status = "APPROVED";
    order.orderDocumentId = attached.id;
    order.clearanceWorkflowInstanceId = clearanceWorkflow.instance.id;
    order.clearanceItems = defaultClearances(order.effectiveDate);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_APPROVE",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { documentId: attached.id, clearanceWorkflowInstanceId: clearanceWorkflow.instance.id, p01Pattern: "PARALLEL_ALL_OF" },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G05_TRANSFER_APPROVED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo },
    });
    return { order: this.cloneOrder(order), document: attached, clearanceWorkflow: { instance: clearanceWorkflow.instance, taskId: clearanceWorkflow.task.id } };
  }

  completeClearance(actor: ActorContext, transferOrderId: string, clearanceCode: string, completedOn: string): TransferOrder {
    this.authorization.check(actor, "g05.transfer.clearance", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const item = this.requireClearance(order, clearanceCode);
    item.status = "CLEARED";
    item.completedOn = completedOn;
    this.audit.recordMutation(actor, {
      action: "G05_CLEARANCE_COMPLETE",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { clearanceCode, p01Pattern: "PARALLEL_ALL_OF" },
    });
    return this.cloneOrder(order);
  }

  deemClearance(actor: ActorContext, transferOrderId: string, clearanceCode: string, deemedOn: string): TransferOrder {
    this.authorization.check(actor, "g05.transfer.clearance.deem", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const item = this.requireClearance(order, clearanceCode);
    if (deemedOn <= item.dueDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Deemed clearance requires SLA breach", { details: { clearanceCode, dueDate: item.dueDate, deemedOn } });
    }
    item.status = "DEEMED_CLEARED";
    item.deemedOn = deemedOn;
    this.audit.recordMutation(actor, {
      action: "G05_CLEARANCE_DEEMED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { clearanceCode, dueDate: item.dueDate, deemedOn },
    });
    return this.cloneOrder(order);
  }

  relieveAndJoin(actor: ActorContext, transferOrderId: string, input: { relievingDate: string; joiningDate: string; idempotencyKey: string }): TransferJoinResult {
    this.authorization.check(actor, "g05.transfer.join", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED" && order.status !== "RELIEVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Transfer order must be approved before relieving");
    }
    if (input.joiningDate < input.relievingDate) {
      throw new FoundationError("VALIDATION_FAILED", "Joining date cannot be before relieving date", { field: "joiningDate" });
    }
    if (!order.clearanceItems.every((item) => item.status === "CLEARED" || item.status === "DEEMED_CLEARED")) {
      throw new FoundationError("PRECONDITION_FAILED", "All clearance branches must be cleared or deemed");
    }
    if (order.clearanceWorkflowInstanceId) {
      this.workflow.actOnInstance(actor, { instanceId: order.clearanceWorkflowInstanceId, action: "APPROVE" });
    }
    order.status = "RELIEVED";
    const joiningDocument = this.documentVault.createDocument(actor, {
      title: `Joining Report ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, relievingDate: input.relievingDate, joiningDate: input.joiningDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, joiningDocument.id, {
      moduleCode: "G05",
      entityName: "joining_reports",
      entityRefId: order.id,
      linkRole: "JOINING_REPORT",
    });
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_orders:${order.id}:JOINED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "TRANSFER_JOINED",
      eventDate: input.joiningDate,
      factKey: `G05:${order.id}:TRANSFER_JOINED`,
      orderNo: order.orderNo,
      payload: {
        orderNo: order.orderNo,
        fromOrgUnitId: order.fromOrgUnitId,
        toOrgUnitId: order.toOrgUnitId,
        relievingDate: input.relievingDate,
        joiningDate: input.joiningDate,
        clearances: order.clearanceItems.map((item) => ({ code: item.code, status: item.status })),
      },
      documentIds: [order.orderDocumentId ?? "", attached.id].filter((value) => value.length > 0),
    });
    order.status = "JOINED";
    order.joiningDocumentId = attached.id;
    order.srEventId = sr.event.id;
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_RELIEVE_JOIN",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { srEventId: sr.event.id, joiningDocumentId: attached.id },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G05_TRANSFER_JOINED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo, srEventId: sr.event.id },
    });
    return { order: this.cloneOrder(order), srEventId: sr.event.id, document: attached };
  }

  fileRepresentation(actor: ActorContext, transferOrderId: string, input: { grounds: string; evidenceTitle?: string }): TransferRepresentation {
    this.authorization.check(actor, "g05.transfer.representation.file", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Representation requires an approved transfer order");
    }
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G05-REPRESENTATION",
      subjectRef: `g05_transfer_representations:${order.id}`,
      stage: "PENDING_TRANSFER_AUTHORITY",
      resolverRule: {
        mechanism: "POSITION_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        orgUnitId: order.fromOrgUnitId,
        subjectEmployeeId: order.employeeId,
      },
      asOf: order.orderDate,
    });
    const document = this.documentVault.createDocument(actor, {
      title: input.evidenceTitle ?? `Transfer Representation ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, grounds: input.grounds })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G05",
      entityName: "transfer_representations",
      entityRefId: order.id,
      linkRole: "REPRESENTATION",
    });
    const representation: TransferRepresentation = {
      id: nextId("transfer-representation", this.representations.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      representationNo: `TRR/${order.orderDate.slice(0, 4)}/${String(this.representations.length + 1).padStart(5, "0")}`,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      grounds: input.grounds,
      status: "UNDER_REVIEW",
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      documentId: attached.id,
    };
    this.representations.push(representation);
    this.audit.recordMutation(actor, {
      action: "G05_REPRESENTATION_FILED",
      subjectRef: `g05_transfer_representations:${representation.id}`,
      metadata: { transferOrderId: order.id, workflowInstanceId: representation.workflowInstanceId },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: started.task.resolution.selectedAssignees[0]?.employeeId,
      messageId: "G05_REPRESENTATION_FILED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_representations:${representation.id}`,
      mergeFields: { representationNo: representation.representationNo },
    });
    return this.cloneRepresentation(representation);
  }

  retainOnRepresentation(actor: ActorContext, representationId: string, input: { decisionDate: string; idempotencyKey: string; reason: string }): { representation: TransferRepresentation; order: TransferOrder; srEventId: string } {
    this.authorization.check(actor, "g05.transfer.representation.decide", actor);
    const representation = this.requireRepresentation(actor, representationId);
    if (representation.status !== "UNDER_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending representations can be retained");
    }
    const order = this.requireOrder(actor, representation.transferOrderId);
    this.workflow.actOnInstance(actor, { instanceId: representation.workflowInstanceId, action: "APPROVE" });
    const retentionDocument = this.documentVault.createDocument(actor, {
      title: `Retention Order ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, representationId, reason: input.reason })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, retentionDocument.id, {
      moduleCode: "G05",
      entityName: "retention_orders",
      entityRefId: order.id,
      linkRole: "RETENTION_ORDER",
    });
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_representations:${representation.id}:RETAINED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "TRANSFER_RETAINED",
      eventDate: input.decisionDate,
      factKey: `G05:${order.id}:TRANSFER_RETAINED`,
      orderNo: order.orderNo,
      payload: { orderNo: order.orderNo, representationNo: representation.representationNo, reason: input.reason },
      documentIds: [representation.documentId, attached.id],
    });
    representation.status = "RETAINED";
    representation.srEventId = sr.event.id;
    order.status = "RETAINED";
    order.retentionDocumentId = attached.id;
    order.retentionSrEventId = sr.event.id;
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_RETAINED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { representationId, srEventId: sr.event.id },
    });
    return { representation: this.cloneRepresentation(representation), order: this.cloneOrder(order), srEventId: sr.event.id };
  }

  cancel(actor: ActorContext, transferOrderId: string, input: { cancellationDate: string; reason: string; idempotencyKey: string }): { order: TransferOrder; srEventId: string; document: DocumentRecord } {
    this.authorization.check(actor, "g05.transfer.cancel", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status === "JOINED") {
      throw new FoundationError("PRECONDITION_FAILED", "Joined transfer orders require a source reversal, not cancellation");
    }
    if (order.status === "CANCELLED") {
      throw new FoundationError("PRECONDITION_FAILED", "Transfer order is already cancelled");
    }
    const cancellationDocument = this.documentVault.createDocument(actor, {
      title: `Transfer Cancellation ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, reason: input.reason })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, cancellationDocument.id, {
      moduleCode: "G05",
      entityName: "transfer_cancellations",
      entityRefId: order.id,
      linkRole: "CANCELLATION_ORDER",
    });
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_orders:${order.id}:CANCELLED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "TRANSFER_CANCELLED",
      eventDate: input.cancellationDate,
      factKey: `G05:${order.id}:TRANSFER_CANCELLED`,
      orderNo: order.orderNo,
      payload: { orderNo: order.orderNo, reason: input.reason, previousStatus: order.status },
      documentIds: [order.orderDocumentId ?? "", attached.id].filter((documentId) => documentId.length > 0),
    });
    order.status = "CANCELLED";
    order.cancellationDocumentId = attached.id;
    order.cancellationSrEventId = sr.event.id;
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_CANCELLED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { srEventId: sr.event.id, reason: input.reason },
    });
    return { order: this.cloneOrder(order), srEventId: sr.event.id, document: attached };
  }

  deemRelieved(actor: ActorContext, transferOrderId: string, input: { deemedRelievingDate: string; reason: string; idempotencyKey: string }): { order: TransferOrder; srEventId: string; document: DocumentRecord } {
    this.authorization.check(actor, "g05.transfer.deem_relieved", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved transfer orders can be deemed relieved");
    }
    if (!order.clearanceItems.every((item) => item.status === "CLEARED" || item.status === "DEEMED_CLEARED")) {
      throw new FoundationError("PRECONDITION_FAILED", "All clearance branches must be cleared or deemed before relief");
    }
    const reliefDocument = this.documentVault.createDocument(actor, {
      title: `Deemed Relief ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, reason: input.reason, deemedRelievingDate: input.deemedRelievingDate })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, reliefDocument.id, {
      moduleCode: "G05",
      entityName: "deemed_relief_orders",
      entityRefId: order.id,
      linkRole: "DEEMED_RELIEF_ORDER",
    });
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_orders:${order.id}:DEEMED_RELIEVED`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "TRANSFER_DEEMED_RELIEVED",
      eventDate: input.deemedRelievingDate,
      factKey: `G05:${order.id}:TRANSFER_DEEMED_RELIEVED`,
      orderNo: order.orderNo,
      payload: {
        orderNo: order.orderNo,
        fromOrgUnitId: order.fromOrgUnitId,
        toOrgUnitId: order.toOrgUnitId,
        deemedRelievingDate: input.deemedRelievingDate,
        reason: input.reason,
        clearances: order.clearanceItems.map((item) => ({ code: item.code, status: item.status })),
      },
      documentIds: [order.orderDocumentId ?? "", attached.id].filter((documentId) => documentId.length > 0),
    });
    order.status = "DEEMED_RELIEVED";
    order.deemedReliefDocumentId = attached.id;
    order.deemedReliefSrEventId = sr.event.id;
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_DEEMED_RELIEVED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { srEventId: sr.event.id, reason: input.reason },
    });
    return { order: this.cloneOrder(order), srEventId: sr.event.id, document: attached };
  }

  listOrders(scope: TenantScope): TransferOrder[] {
    requireTenantScope(scope);
    return this.orders.filter((order) => order.tenantId === scope.tenantId && (!scope.entityId || order.entityId === scope.entityId)).map((order) => this.cloneOrder(order));
  }

  getOrder(scope: TenantScope, transferOrderId: string): TransferOrder {
    return this.cloneOrder(this.requireOrder(scope, transferOrderId));
  }

  listRepresentations(scope: TenantScope): TransferRepresentation[] {
    requireTenantScope(scope);
    return this.representations
      .filter((representation) => representation.tenantId === scope.tenantId && (!scope.entityId || representation.entityId === scope.entityId))
      .map((representation) => this.cloneRepresentation(representation));
  }

  private requireOrder(scope: TenantScope, transferOrderId: string): TransferOrder {
    const order = this.orders.find((item) => item.id === transferOrderId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Transfer order not found");
    }
    return order;
  }

  private requireClearance(order: TransferOrder, clearanceCode: string): ClearanceItem {
    const item = order.clearanceItems.find((candidate) => candidate.code === clearanceCode);
    if (!item) {
      throw new FoundationError("NOT_FOUND", "Clearance item not found");
    }
    return item;
  }

  private requireRepresentation(scope: TenantScope, representationId: string): TransferRepresentation {
    const representation = this.representations.find(
      (item) => item.id === representationId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
    if (!representation) {
      throw new FoundationError("NOT_FOUND", "Transfer representation not found");
    }
    return representation;
  }

  private cloneOrder(order: TransferOrder): TransferOrder {
    return {
      ...order,
      resolverEvidence: { ...order.resolverEvidence },
      clearanceItems: order.clearanceItems.map((item) => ({ ...item })),
    };
  }

  private cloneRepresentation(representation: TransferRepresentation): TransferRepresentation {
    return { ...representation };
  }
}

function defaultClearances(effectiveDate: string): ClearanceItem[] {
  return [
    { code: "HR", label: "Service book and establishment clearance", status: "OPEN", dueDate: effectiveDate },
    { code: "VIGILANCE", label: "Vigilance and disciplinary clearance", status: "OPEN", dueDate: effectiveDate },
    { code: "ESTATE", label: "Quarters and asset clearance", status: "OPEN", dueDate: effectiveDate },
  ];
}

function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
