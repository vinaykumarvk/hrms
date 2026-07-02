import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentRecord, DocumentVaultService } from "../g13/documentVaultService";
import { ClearanceDepartmentConfig, TransferRepository } from "./transferRepository";

export type TransferOrderStatus = "PENDING_APPROVAL" | "APPROVED" | "RELIEVED" | "JOINED" | "RETAINED" | "CANCELLED" | "DEEMED_RELIEVED";
export type ClearanceStatus = "OPEN" | "CLEARED" | "DEEMED_CLEARED";
export type ClearanceChecklistStatus = "OPEN" | "CLEARED" | "CLEARED_WITH_DEEMED";
export type TransferRepresentationStatus = "UNDER_REVIEW" | "RETAINED" | "REJECTED";
export type RelievingOrderStatus = "RELIEVED" | "DEEMED_RELIEVED" | "CANCELLED";
export type JoiningReportStatus = "JOINED_CONFIRMED" | "CANCELLED";

export interface ClearanceItem {
  code: string;
  label: string;
  status: ClearanceStatus;
  dueDate: string;
  completedOn?: string;
  deemedOn?: string;
}

/** clearance_checklists entity (no-dues header, one clearance item per configured department). */
export interface ClearanceChecklist {
  id: string;
  tenantId: string;
  entityId?: string;
  checklistNo: string;
  transferOrderId: string;
  employeeId: string;
  sourceOrgUnitId: string;
  status: ClearanceChecklistStatus;
  items: ClearanceItem[];
}

/** relieving_orders entity (BRD G05 §5.2.11) — carries the statutory last_working_day. */
export interface RelievingOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  relievingOrderNo: string;
  transferOrderId: string;
  employeeId: string;
  clearanceChecklistId: string;
  lastWorkingDay: string;
  relieved: boolean;
  deemedRelief: boolean;
  forcedActionReason?: string;
  status: RelievingOrderStatus;
  srEventId?: string;
}

/** joining_reports entity (BRD G05 §5.2.12) — asserts service continuity at the destination. */
export interface JoiningReport {
  id: string;
  tenantId: string;
  entityId?: string;
  joiningReportNo: string;
  transferOrderId: string;
  relievingOrderId?: string;
  employeeId: string;
  destOrgUnitId: string;
  reportedDate: string;
  joiningDate: string;
  serviceContinuityAsserted: boolean;
  status: JoiningReportStatus;
  srEventId?: string;
}

export interface TransferOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  orderNo: string;
  /** order_number_sequences linkage for reserve-then-commit numbering (BRD §5.2.18). */
  orderNumberSequenceId: string;
  orderNumberValue: number;
  orderNumberCommitted: boolean;
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  orderDate: string;
  effectiveDate: string;
  status: TransferOrderStatus;
  workflowInstanceId: string;
  workflowTaskId: string;
  clearanceWorkflowInstanceId?: string;
  clearanceChecklistId?: string;
  resolverType: "POSITION_AUTHORITY";
  resolverEvidence: Record<string, unknown>;
  /** View of the persisted clearance checklist items (source of truth: clearance_checklists). */
  clearanceItems: ClearanceItem[];
  lastWorkingDay?: string;
  relievingOrderId?: string;
  joiningReportId?: string;
  orderDocumentId?: string;
  joiningDocumentId?: string;
  retentionDocumentId?: string;
  cancellationDocumentId?: string;
  deemedReliefDocumentId?: string;
  /** SR event ids: TRANSFER on issue, RELIEVING on relief, JOINING on join, reversals on rescind. */
  srEventId?: string;
  relievingSrEventId?: string;
  joiningSrEventId?: string;
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
  /** G12 SR event id for the frozen-catalog TRANSFER (order issued) fact. */
  srEventId: string;
}

export interface TransferJoinResult {
  order: TransferOrder;
  relievingOrder: RelievingOrder;
  joiningReport: JoiningReport;
  /** G12 SR event id of the JOINING fact (relievingSrEventId carries the RELIEVING fact). */
  srEventId: string;
  relievingSrEventId: string;
  document: DocumentRecord;
}

export class TransferService {
  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    private readonly repository: TransferRepository
  ) {}

  /** Per-office clearance department configuration (g05_clearance_department domain). */
  configureClearanceDepartments(actor: ActorContext, officeOrgUnitId: string, departments: ClearanceDepartmentConfig[]): void {
    this.authorization.check(actor, "g05.transfer.clearance.configure", actor);
    if (departments.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one clearance department is required", { field: "departments" });
    }
    this.repository.configureClearanceDepartments(actor, officeOrgUnitId, departments);
    this.audit.recordMutation(actor, {
      action: "G05_CLEARANCE_DEPARTMENTS_CONFIGURED",
      subjectRef: `org_units:${officeOrgUnitId}`,
      metadata: { departmentCodes: departments.map((department) => department.code) },
    });
  }

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
    const orderId = nextId("transfer-order", this.repository.countOrders());
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
    // Gapless statutory numbering (BRD §5.2.18 / invariant 17): the number is RESERVED from the
    // order_number_sequences counter inside the issuing transaction and COMMITTED on approval —
    // never derived from stored-row arithmetic.
    const reserved = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "TRANSFER_ORDER",
      officeOrgUnitId: input.fromOrgUnitId,
      fiscalYear: fiscalYearOf(input.orderDate),
      prefixTemplate: "TO/{fy}/{seq}",
    });
    const order: TransferOrder = {
      id: orderId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orderNo: reserved.orderNo,
      orderNumberSequenceId: reserved.sequenceId,
      orderNumberValue: reserved.value,
      orderNumberCommitted: false,
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
    this.repository.insertOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_INITIATE",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: {
        workflowInstanceId: order.workflowInstanceId,
        reason: input.reason,
        numbering: "reserve-then-commit",
        reservedOrderNumber: reserved.value,
      },
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

  approve(actor: ActorContext, transferOrderId: string, input: { idempotencyKey: string }): TransferApprovalResult {
    this.authorization.check(actor, "g05.transfer.approve", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "PENDING_APPROVAL") {
      throw new FoundationError("PRECONDITION_FAILED", "Only pending transfer orders can be approved");
    }
    this.workflow.actOnInstance(actor, { instanceId: order.workflowInstanceId, action: "APPROVE" });
    // Commit the reserved statutory number on approval — the committed series stays gapless.
    this.repository.commitOrderNumber(order.orderNumberSequenceId, order.orderNumberValue);
    order.orderNumberCommitted = true;
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
    // One clearance item per CONFIGURED department of the source office (per-office
    // clearance_department config from the repository — not a hardcoded list).
    const departments = this.repository.listClearanceDepartments(actor, order.fromOrgUnitId);
    const checklistNumber = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "CLEARANCE",
      officeOrgUnitId: order.fromOrgUnitId,
      fiscalYear: fiscalYearOf(order.orderDate),
      prefixTemplate: "NOD/{fy}/{seq}",
    });
    this.repository.commitOrderNumber(checklistNumber.sequenceId, checklistNumber.value);
    const checklist: ClearanceChecklist = {
      id: nextId("clearance-checklist", checklistNumber.value),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      checklistNo: checklistNumber.orderNo,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      sourceOrgUnitId: order.fromOrgUnitId,
      status: "OPEN",
      items: departments.map((department) => ({
        code: department.code,
        label: department.label,
        status: "OPEN" as ClearanceStatus,
        dueDate: order.effectiveDate,
      })),
    };
    this.repository.insertClearanceChecklist(checklist);
    // Frozen G12 catalog: order issuance posts TRANSFER (never a module-invented code).
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_orders:${order.id}`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "TRANSFER",
      eventDate: order.effectiveDate,
      factKey: `EMP:${order.employeeId}|CAT:TRANSFER|ORDER:${order.orderNo}|EFF:${order.effectiveDate}`,
      orderNo: order.orderNo,
      payload: { order_no: order.orderNo, from_unit: order.fromOrgUnitId, to_unit: order.toOrgUnitId, effective_date: order.effectiveDate },
      documentIds: [attached.id],
    });
    order.status = "APPROVED";
    order.orderDocumentId = attached.id;
    order.clearanceWorkflowInstanceId = clearanceWorkflow.instance.id;
    order.clearanceChecklistId = checklist.id;
    order.srEventId = sr.event.id;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_APPROVE",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: {
        documentId: attached.id,
        clearanceWorkflowInstanceId: clearanceWorkflow.instance.id,
        clearanceChecklistId: checklist.id,
        clearanceDepartmentCodes: departments.map((department) => department.code),
        srEventId: sr.event.id,
        committedOrderNumber: order.orderNumberValue,
        p01Pattern: "PARALLEL_ALL_OF",
      },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G05_TRANSFER_APPROVED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo },
    });
    return {
      order: this.cloneOrder(order),
      document: attached,
      clearanceWorkflow: { instance: clearanceWorkflow.instance, taskId: clearanceWorkflow.task.id },
      srEventId: sr.event.id,
    };
  }

  completeClearance(actor: ActorContext, transferOrderId: string, clearanceCode: string, completedOn: string): TransferOrder {
    this.authorization.check(actor, "g05.transfer.clearance", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const checklist = this.requireChecklist(actor, order);
    const item = this.requireClearance(checklist, clearanceCode);
    item.status = "CLEARED";
    item.completedOn = completedOn;
    checklist.status = deriveChecklistStatus(checklist.items);
    this.repository.updateClearanceChecklist(checklist);
    this.audit.recordMutation(actor, {
      action: "G05_CLEARANCE_COMPLETE",
      subjectRef: `g05_clearance_checklists:${checklist.id}`,
      metadata: { transferOrderId: order.id, clearanceCode, p01Pattern: "PARALLEL_ALL_OF" },
    });
    return this.cloneOrder(order);
  }

  deemClearance(actor: ActorContext, transferOrderId: string, clearanceCode: string, deemedOn: string): TransferOrder {
    this.authorization.check(actor, "g05.transfer.clearance.deem", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const checklist = this.requireChecklist(actor, order);
    const item = this.requireClearance(checklist, clearanceCode);
    if (deemedOn <= item.dueDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Deemed clearance requires SLA breach", { details: { clearanceCode, dueDate: item.dueDate, deemedOn } });
    }
    item.status = "DEEMED_CLEARED";
    item.deemedOn = deemedOn;
    checklist.status = deriveChecklistStatus(checklist.items);
    this.repository.updateClearanceChecklist(checklist);
    this.audit.recordMutation(actor, {
      action: "G05_CLEARANCE_DEEMED",
      subjectRef: `g05_clearance_checklists:${checklist.id}`,
      metadata: { transferOrderId: order.id, clearanceCode, dueDate: item.dueDate, deemedOn },
    });
    return this.cloneOrder(order);
  }

  relieveAndJoin(actor: ActorContext, transferOrderId: string, input: { relievingDate: string; joiningDate: string; idempotencyKey: string }): TransferJoinResult {
    this.authorization.check(actor, "g05.transfer.join", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Transfer order must be approved before relieving");
    }
    if (!dateOnly(input.relievingDate) || input.relievingDate < order.orderDate) {
      // BRD-registered code: relieving date must be a valid date on/after the order date.
      throw new FoundationError("VALIDATION_FAILED", "Relieving date is invalid", {
        field: "relievingDate",
        details: { messageId: "ERR-G05-RELIEVE-DATE", orderDate: order.orderDate },
      });
    }
    if (input.joiningDate < input.relievingDate) {
      throw new FoundationError("VALIDATION_FAILED", "Joining date cannot be before relieving date", { field: "joiningDate" });
    }
    const checklist = this.requireChecklist(actor, order);
    if (!checklist.items.every((item) => item.status === "CLEARED" || item.status === "DEEMED_CLEARED")) {
      throw new FoundationError("PRECONDITION_FAILED", "All clearance branches must be cleared or deemed", {
        details: { messageId: "ERR-G05-CLEARANCE-INCOMPLETE", checklistId: checklist.id },
      });
    }
    if (order.clearanceWorkflowInstanceId) {
      this.workflow.actOnInstance(actor, { instanceId: order.clearanceWorkflowInstanceId, action: "APPROVE" });
    }
    // Relieving order entity (relieving_orders): statutory last_working_day, gapless RO number.
    const relievingNumber = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "RELIEVING_ORDER",
      officeOrgUnitId: order.fromOrgUnitId,
      fiscalYear: fiscalYearOf(input.relievingDate),
      prefixTemplate: "RO/{fy}/{seq}",
    });
    this.repository.commitOrderNumber(relievingNumber.sequenceId, relievingNumber.value);
    const relievingOrder: RelievingOrder = {
      id: nextId("relieving-order", relievingNumber.value),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      relievingOrderNo: relievingNumber.orderNo,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      clearanceChecklistId: checklist.id,
      lastWorkingDay: input.relievingDate,
      relieved: true,
      deemedRelief: false,
      status: "RELIEVED",
    };
    // Frozen G12 catalog: relief posts RELIEVING (SR-append-first, then the entity row).
    const relievingSr = this.serviceRegister.ingest(actor, `${input.idempotencyKey}:RELIEVING`, {
      sourceModule: "G05",
      sourceReferenceId: `g05_relieving_orders:${relievingOrder.id}`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "RELIEVING",
      eventDate: input.relievingDate,
      factKey: `EMP:${order.employeeId}|CAT:TRANSFER|ATTR:RELIEVING|ORDER:${order.orderNo}`,
      orderNo: order.orderNo,
      payload: {
        order_no: order.orderNo,
        relieved_unit: order.fromOrgUnitId,
        relieved_on: input.relievingDate,
        last_working_day: relievingOrder.lastWorkingDay,
        relieving_order_no: relievingOrder.relievingOrderNo,
      },
      documentIds: [order.orderDocumentId ?? ""].filter((value) => value.length > 0),
    });
    relievingOrder.srEventId = relievingSr.event.id;
    this.repository.insertRelievingOrder(relievingOrder);
    order.status = "RELIEVED";
    order.lastWorkingDay = relievingOrder.lastWorkingDay;
    order.relievingOrderId = relievingOrder.id;
    order.relievingSrEventId = relievingSr.event.id;
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
    // Joining report entity (joining_reports): gapless JR number, service continuity asserted.
    const joiningNumber = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "JOINING_REPORT",
      officeOrgUnitId: order.toOrgUnitId,
      fiscalYear: fiscalYearOf(input.joiningDate),
      prefixTemplate: "JR/{fy}/{seq}",
    });
    this.repository.commitOrderNumber(joiningNumber.sequenceId, joiningNumber.value);
    const joiningReport: JoiningReport = {
      id: nextId("joining-report", joiningNumber.value),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      joiningReportNo: joiningNumber.orderNo,
      transferOrderId: order.id,
      relievingOrderId: relievingOrder.id,
      employeeId: order.employeeId,
      destOrgUnitId: order.toOrgUnitId,
      reportedDate: input.joiningDate,
      joiningDate: input.joiningDate,
      serviceContinuityAsserted: true,
      status: "JOINED_CONFIRMED",
    };
    // Frozen G12 catalog: joining posts JOINING.
    const joiningSr = this.serviceRegister.ingest(actor, `${input.idempotencyKey}:JOINING`, {
      sourceModule: "G05",
      sourceReferenceId: `g05_joining_reports:${joiningReport.id}`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "JOINING",
      eventDate: input.joiningDate,
      factKey: `EMP:${order.employeeId}|CAT:TRANSFER|ATTR:JOINING|ORDER:${order.orderNo}`,
      orderNo: order.orderNo,
      payload: {
        order_no: order.orderNo,
        joined_unit: order.toOrgUnitId,
        joined_on: input.joiningDate,
        joining_report_no: joiningReport.joiningReportNo,
        service_continuity_asserted: true,
        clearances: checklist.items.map((item) => ({ code: item.code, status: item.status })),
      },
      documentIds: [order.orderDocumentId ?? "", attached.id].filter((value) => value.length > 0),
    });
    joiningReport.srEventId = joiningSr.event.id;
    this.repository.insertJoiningReport(joiningReport);
    // FR-G05-010: G01 owns the org-placement change — the join applies the posting through the
    // employee master service (single authoritative POSTING_UPDATE), never by local mutation.
    const posting = this.employeeMaster.applyTransferPosting(actor, {
      employeeId: order.employeeId,
      toOrgUnitId: order.toOrgUnitId,
      transferOrderId: order.id,
      orderNo: order.orderNo,
      effectiveDate: input.joiningDate,
    });
    order.status = "JOINED";
    order.joiningReportId = joiningReport.id;
    order.joiningDocumentId = attached.id;
    order.joiningSrEventId = joiningSr.event.id;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_RELIEVE_JOIN",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: {
        relievingOrderId: relievingOrder.id,
        relievingSrEventId: relievingSr.event.id,
        joiningReportId: joiningReport.id,
        joiningSrEventId: joiningSr.event.id,
        joiningDocumentId: attached.id,
        lastWorkingDay: relievingOrder.lastWorkingDay,
        postingOrgUnitId: posting.employee.orgUnitId,
      },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G05_JOINING_CONFIRMED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo, srEventId: joiningSr.event.id },
    });
    return {
      order: this.cloneOrder(order),
      relievingOrder: { ...relievingOrder },
      joiningReport: { ...joiningReport },
      srEventId: joiningSr.event.id,
      relievingSrEventId: relievingSr.event.id,
      document: attached,
    };
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
    const representationNumber = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "REPRESENTATION",
      officeOrgUnitId: order.fromOrgUnitId,
      fiscalYear: fiscalYearOf(order.orderDate),
      prefixTemplate: "TRR/{fy}/{seq}",
    });
    this.repository.commitOrderNumber(representationNumber.sequenceId, representationNumber.value);
    const representation: TransferRepresentation = {
      id: nextId("transfer-representation", this.repository.countRepresentations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      representationNo: representationNumber.orderNo,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      grounds: input.grounds,
      status: "UNDER_REVIEW",
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      documentId: attached.id,
    };
    this.repository.insertRepresentation(representation);
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
    // Retention rescinds the issued transfer: post through the SR reversal envelope against the
    // original TRANSFER fact (appends a linked is_reversal event; no forward pseudo-event, the
    // frozen catalog stays intact). Payload detail carries the retention outcome.
    const sr = this.serviceRegister.reverseBySourceReference(
      actor,
      input.idempotencyKey,
      `g05_transfer_orders:${order.id}`,
      `RETAINED_ON_REPRESENTATION: ${input.reason}`
    );
    representation.status = "RETAINED";
    representation.srEventId = sr.event.id;
    this.repository.updateRepresentation(representation);
    order.status = "RETAINED";
    order.retentionDocumentId = attached.id;
    order.retentionSrEventId = sr.event.id;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_RETENTION_RECORDED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { representationId, srEventId: sr.event.id, reversalOfEventId: order.srEventId, decisionDate: input.decisionDate },
    });
    return { representation: this.cloneRepresentation(representation), order: this.cloneOrder(order), srEventId: sr.event.id };
  }

  cancel(actor: ActorContext, transferOrderId: string, input: { cancellationDate: string; reason: string; idempotencyKey: string }): { order: TransferOrder; srEventId?: string; document: DocumentRecord } {
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
    if (order.srEventId) {
      // Cancellation flows through the SR reversal envelope (/api/v1/sr/ingest/reversal
      // semantics): reverseBySourceReference APPENDS a linked is_reversal event against the
      // original TRANSFER fact — never a bare forward event.
      const sr = this.serviceRegister.reverseBySourceReference(
        actor,
        input.idempotencyKey,
        `g05_transfer_orders:${order.id}`,
        `TRANSFER_CANCELLED: ${input.reason}`
      );
      order.cancellationSrEventId = sr.event.id;
      if (order.relievingOrderId && order.relievingSrEventId) {
        // A recorded relief is rescinded with its own linked reversal (RELIEVING_CANCELLED semantics).
        this.serviceRegister.reverseBySourceReference(
          actor,
          `${input.idempotencyKey}:RELIEVING_CANCELLED`,
          `g05_relieving_orders:${order.relievingOrderId}`,
          `RELIEVING_CANCELLED: ${input.reason}`
        );
      }
    } else {
      // Never issued to the SR ledger: nothing to reverse — void the reserved statutory number
      // with an audited reason so the gap audit (JOB-G05-GAPAUDIT) can explain it.
      this.repository.voidOrderNumber(order.orderNumberSequenceId, order.orderNumberValue, `CANCELLED: ${input.reason}`);
    }
    order.status = "CANCELLED";
    order.cancellationDocumentId = attached.id;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_TRANSFER_CANCELLED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: {
        srEventId: order.cancellationSrEventId,
        reversalOfEventId: order.srEventId,
        voidedOrderNumber: order.srEventId ? undefined : order.orderNumberValue,
        reason: input.reason,
        cancellationDate: input.cancellationDate,
      },
    });
    return { order: this.cloneOrder(order), srEventId: order.cancellationSrEventId, document: attached };
  }

  deemRelieved(actor: ActorContext, transferOrderId: string, input: { deemedRelievingDate: string; reason: string; idempotencyKey: string }): { order: TransferOrder; srEventId: string; document: DocumentRecord } {
    this.authorization.check(actor, "g05.transfer.deem_relieved", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved transfer orders can be deemed relieved");
    }
    const checklist = this.requireChecklist(actor, order);
    if (!checklist.items.every((item) => item.status === "CLEARED" || item.status === "DEEMED_CLEARED")) {
      throw new FoundationError("PRECONDITION_FAILED", "All clearance branches must be cleared or deemed before relief", {
        details: { messageId: "ERR-G05-CLEARANCE-INCOMPLETE", checklistId: checklist.id },
      });
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
      entityName: "relieving_orders",
      entityRefId: order.id,
      linkRole: "DEEMED_RELIEF_ORDER",
    });
    // Deemed relief is still a relief: the frozen catalog RELIEVING code is posted with the
    // forced-action detail in the payload (no invented event type).
    const relievingNumber = this.repository.reserveOrderNumber(actor, {
      sequenceScope: "RELIEVING_ORDER",
      officeOrgUnitId: order.fromOrgUnitId,
      fiscalYear: fiscalYearOf(input.deemedRelievingDate),
      prefixTemplate: "RO/{fy}/{seq}",
    });
    this.repository.commitOrderNumber(relievingNumber.sequenceId, relievingNumber.value);
    const relievingOrder: RelievingOrder = {
      id: nextId("relieving-order", relievingNumber.value),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      relievingOrderNo: relievingNumber.orderNo,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      clearanceChecklistId: checklist.id,
      lastWorkingDay: input.deemedRelievingDate,
      relieved: true,
      deemedRelief: true,
      forcedActionReason: input.reason,
      status: "DEEMED_RELIEVED",
    };
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_relieving_orders:${relievingOrder.id}`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "RELIEVING",
      eventDate: input.deemedRelievingDate,
      factKey: `EMP:${order.employeeId}|CAT:TRANSFER|ATTR:RELIEVING|ORDER:${order.orderNo}`,
      orderNo: order.orderNo,
      payload: {
        order_no: order.orderNo,
        relieved_unit: order.fromOrgUnitId,
        relieved_on: input.deemedRelievingDate,
        last_working_day: relievingOrder.lastWorkingDay,
        deemed_relief: true,
        forced_action: "DEEMED_RELIEF",
        reason: input.reason,
        clearances: checklist.items.map((item) => ({ code: item.code, status: item.status })),
      },
      documentIds: [order.orderDocumentId ?? "", attached.id].filter((documentId) => documentId.length > 0),
    });
    relievingOrder.srEventId = sr.event.id;
    this.repository.insertRelievingOrder(relievingOrder);
    order.status = "DEEMED_RELIEVED";
    order.lastWorkingDay = relievingOrder.lastWorkingDay;
    order.relievingOrderId = relievingOrder.id;
    order.deemedReliefDocumentId = attached.id;
    order.deemedReliefSrEventId = sr.event.id;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_DEEMED_RELIEF_RECORDED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { relievingOrderId: relievingOrder.id, srEventId: sr.event.id, reason: input.reason },
    });
    return { order: this.cloneOrder(order), srEventId: sr.event.id, document: attached };
  }

  listOrders(scope: TenantScope): TransferOrder[] {
    requireTenantScope(scope);
    return this.repository.listOrders(scope).map((order) => this.cloneOrder(order));
  }

  getOrder(scope: TenantScope, transferOrderId: string): TransferOrder {
    return this.cloneOrder(this.requireOrder(scope, transferOrderId));
  }

  listRepresentations(scope: TenantScope): TransferRepresentation[] {
    requireTenantScope(scope);
    return this.repository.listRepresentations(scope).map((representation) => this.cloneRepresentation(representation));
  }

  listRelievingOrders(scope: TenantScope): RelievingOrder[] {
    requireTenantScope(scope);
    return this.repository.listRelievingOrders(scope).map((relievingOrder) => ({ ...relievingOrder }));
  }

  listJoiningReports(scope: TenantScope): JoiningReport[] {
    requireTenantScope(scope);
    return this.repository.listJoiningReports(scope).map((joiningReport) => ({ ...joiningReport }));
  }

  private requireOrder(scope: TenantScope, transferOrderId: string): TransferOrder {
    const order = this.repository.findOrder(scope, transferOrderId);
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Transfer order not found");
    }
    return order;
  }

  private requireChecklist(scope: TenantScope, order: TransferOrder): ClearanceChecklist {
    const checklist = this.repository.findChecklistByOrder(scope, order.id);
    if (!checklist) {
      throw new FoundationError("NOT_FOUND", "Clearance checklist not found");
    }
    return checklist;
  }

  private requireClearance(checklist: ClearanceChecklist, clearanceCode: string): ClearanceItem {
    const item = checklist.items.find((candidate) => candidate.code === clearanceCode);
    if (!item) {
      throw new FoundationError("NOT_FOUND", "Clearance item not found");
    }
    return item;
  }

  private requireRepresentation(scope: TenantScope, representationId: string): TransferRepresentation {
    const representation = this.repository.findRepresentation(scope, representationId);
    if (!representation) {
      throw new FoundationError("NOT_FOUND", "Transfer representation not found");
    }
    return representation;
  }

  private cloneOrder(order: TransferOrder): TransferOrder {
    const checklist = order.clearanceChecklistId
      ? this.repository.findChecklistByOrder({ tenantId: order.tenantId, entityId: order.entityId }, order.id)
      : undefined;
    return {
      ...order,
      resolverEvidence: { ...order.resolverEvidence },
      clearanceItems: (checklist?.items ?? []).map((item) => ({ ...item })),
    };
  }

  private cloneRepresentation(representation: TransferRepresentation): TransferRepresentation {
    return { ...representation };
  }
}

function deriveChecklistStatus(items: ClearanceItem[]): ClearanceChecklistStatus {
  if (items.some((item) => item.status === "OPEN")) {
    return "OPEN";
  }
  return items.some((item) => item.status === "DEEMED_CLEARED") ? "CLEARED_WITH_DEEMED" : "CLEARED";
}

function fiscalYearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
