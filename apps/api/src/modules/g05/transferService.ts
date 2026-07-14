import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentRecord, DocumentVaultService } from "../g13/documentVaultService";
import { AuthorityResolutionService } from "../../platform/authority-resolution/authorityResolutionService";
import { ClearanceDepartmentConfig, JoiningTimeRule, TransferAdministrationPolicy, TransferRepository } from "./transferRepository";

/** BRD §3.2 permission matrix: HR Src/Dest/Admin get a plain "C"/"R" (any employee); Employee
 *  gets "C (own)"/"R (own)". Reporting manager additionally gets "C (team)" for raising a
 *  transfer request on a direct report's behalf — resolved via AuthorityResolutionService, not
 *  a role name, since "team" is a live reporting-chain fact, not a flag. */
const TRANSFER_ACCESS_OVERRIDE_ROLES = new Set(["hr_admin", "hr_src_officer", "hr_dest_officer", "system"]);

export type TransferOrderStatus = "PENDING_APPROVAL" | "APPROVED" | "RELIEVED" | "JOINED" | "RETAINED" | "CANCELLED" | "DEEMED_RELIEVED";
export type ClearanceStatus = "OPEN" | "CLEARED" | "DEEMED_CLEARED";
export type ClearanceChecklistStatus = "OPEN" | "CLEARED" | "CLEARED_WITH_DEEMED";
export type TransferRepresentationStatus = "UNDER_REVIEW" | "RETAINED" | "REJECTED";
export type RelievingOrderStatus = "RELIEVED" | "DEEMED_RELIEVED" | "CANCELLED";
export type JoiningReportStatus = "JOINED_CONFIRMED" | "CANCELLED";

// --- PH-08B administration enums (frozen g05_* domains, migration 0003/0009) -------------
export type DeliveryChannel = "IN_APP" | "EMAIL" | "SMS" | "REGISTERED_POST" | "HAND_DELIVERY" | "PUBLISHED_NOTICE";
export type AcknowledgementStatus = "SERVED" | "ACKNOWLEDGED" | "DEEMED_SERVED" | "REFUSED";
export type DeemedServiceBasis = "NON_ACKNOWLEDGEMENT" | "RETURNED_REGISTERED_POST" | "PUBLISHED_NOTICE";
export type ChargeHandoverStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "DISPUTED" | "UNDER_PROTEST";
export type ChargePhase = "HANDOVER_SOURCE" | "ASSUMPTION_DEST";
export type ChargeType = "FULL" | "ADDITIONAL" | "CURRENT_DUTIES";
export type RepatriationStatus = "ACTIVE" | "EXTENSION_REQUESTED" | "EXTENDED" | "REPATRIATION_DUE" | "REPATRIATED";
export type QuarterRetentionStatus = "OCCUPIED" | "RETENTION_REQUESTED" | "RETENTION_APPROVED" | "VACATION_DUE" | "VACATED" | "OVERSTAY";
export type JoiningDistanceBand = "LOCAL" | "SHORT" | "MEDIUM" | "LONG" | "OUTSTATION";

/** System channels serve on publication (FR-G05-020 AC1); manual channels need explicit HR service + proof. */
const SYSTEM_DELIVERY_CHANNELS: DeliveryChannel[] = ["IN_APP", "EMAIL", "SMS"];
/** Acknowledgement states that satisfy the served gate (BRD invariant 5.6-15). */
const SERVED_GATE_STATUSES: AcknowledgementStatus[] = ["SERVED", "ACKNOWLEDGED", "DEEMED_SERVED"];

/** order_acknowledgements entity (BRD G05 §5.2.17) — proof-of-service & acknowledgement. */
export interface OrderAcknowledgement {
  id: string;
  tenantId: string;
  entityId?: string;
  transferOrderId: string;
  employeeId: string;
  servedOnDate: string;
  deliveryChannel: DeliveryChannel;
  /** Undefined for system channels (auto-served on publication). */
  servedByUserId?: string;
  acknowledgementStatus: AcknowledgementStatus;
  acknowledgedAt?: string;
  /** Evidence backing DEEMED_SERVED: basis + reason + flip timestamp + the statutory window applied. */
  deemedServedBasis?: DeemedServiceBasis;
  deemedServedReason?: string;
  deemedServedOn?: string;
  statutoryWindowDays?: number;
  proofDocumentId?: string;
}

/** charge_handovers entity (BRD G05 §5.2.10) — handover of charge incl. under-protest. */
export interface ChargeHandover {
  id: string;
  tenantId: string;
  entityId?: string;
  transferOrderId: string;
  phase: ChargePhase;
  relinquishingEmployeeId: string;
  receivingEmployeeId: string;
  chargeType: ChargeType;
  handoverDate: string;
  assetsHanded?: Record<string, unknown>[];
  cashImprestAmount?: number;
  pendingFilesCount?: number;
  handoverNoteDocumentId?: string;
  status: ChargeHandoverStatus;
  underProtest: boolean;
  disputeSlaDueAt?: string;
  disputeRemarks?: string;
  forcedActionType?: "HANDOVER_UNDER_PROTEST";
  forcedActionReason?: string;
  forcedActionByUserId?: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  recordedByUserId: string;
}

/** deputation_records entity (BRD G05 §5.2.13) — tenure caps + repatriation. */
export interface DeputationRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  transferOrderId: string;
  employeeId: string;
  borrowingOrgUnitId: string;
  lendingOrgUnitId: string;
  deputationTerms?: Record<string, unknown>;
  startDate: string;
  initialTenureMonths: number;
  /** Cumulative sanctioned tenure (initial + granted extensions), capped by maxTenureMonths. */
  tenureMonths: number;
  currentEndDate: string;
  maxTenureMonths: number;
  extensionCount: number;
  repatriationDueDate: string;
  repatriationStatus: RepatriationStatus;
  repatriationOrderId?: string;
  repatriatedOn?: string;
  initiatedByUserId: string;
}

/** quarter_allotments entity (BRD G05 §5.2.21) — estate retention + penal-rate flip. */
export interface QuarterAllotment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  transferOrderId?: string;
  quarterRef: string;
  orgUnitId: string;
  retentionAllowed: boolean;
  retentionStatus: QuarterRetentionStatus;
  vacateByDate?: string;
  vacatedOn?: string;
  /** Current billing rate; flips from normal to penal on overstay (JOB-G05-QTR-OVERSTAY). */
  licenceFeeRate?: number;
  penalLicenceFeeRate?: number;
  penalRateApplies: boolean;
  licenceFeeRecoveryRef?: string;
  requestedByUserId: string;
}

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
  /** Mirrors of the canonical order_acknowledgements record (FR-G05-020). */
  servedOnDate?: string;
  acknowledgedAt?: string;
  /** FR-G05-009: joining time derived from the configured distance-band rule rows (VAL-G05-JTIME). */
  joiningDistanceBand?: JoiningDistanceBand;
  joiningTimeDays?: number;
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
    private readonly repository: TransferRepository,
    private readonly authorityResolution: AuthorityResolutionService
  ) {}

  private isTransferAccessOverride(actor: ActorContext): boolean {
    return Boolean(actor.permissions?.includes("*") || actor.roles?.some((role) => TRANSFER_ACCESS_OVERRIDE_ROLES.has(role)));
  }

  private assertSelfOrOverride(actor: ActorContext, employeeId: string): void {
    if (this.isTransferAccessOverride(actor) || actor.userId === employeeId) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only act on your own transfer", { field: "employeeId" });
  }

  /** "Raise transfer request: C (own) | C (team)" — the resolved reporting-chain manager may
   *  also raise a request for a direct report, in addition to self or an HR/system override. */
  private assertSelfOrManagerOrOverride(actor: ActorContext, employeeId: string, asOfDate: string): void {
    if (this.isTransferAccessOverride(actor) || actor.userId === employeeId) {
      return;
    }
    const resolution = this.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: employeeId }, asOfDate);
    if (resolution.selectedAssignees.some((assignee) => assignee.employeeId === actor.userId)) {
      return;
    }
    throw new FoundationError("FORBIDDEN", "You may only raise a transfer request for yourself or your own direct reports", { field: "employeeId" });
  }

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
    input: {
      employeeId: string;
      fromOrgUnitId: string;
      toOrgUnitId: string;
      orderDate: string;
      effectiveDate: string;
      reason?: string;
      /** Sanctioning authority anchor when it differs from the source office (e.g. repatriation is sanctioned by the lending organisation). */
      authorityOrgUnitId?: string;
    }
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
    this.assertSelfOrManagerOrOverride(actor, input.employeeId, input.orderDate);
    const orderId = nextId("transfer-order", this.repository.countOrders());
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G05-TRANSFER-ORDER",
      subjectRef: `g05_transfer_orders:${orderId}`,
      stage: "PENDING_TRANSFER_AUTHORITY",
      resolverRule: {
        mechanism: "POSITION_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        orgUnitId: input.authorityOrgUnitId ?? input.fromOrgUnitId,
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
    // FR-G05-020 AC1: publication creates the order_acknowledgements proof-of-service row.
    // System channels (IN_APP/EMAIL/SMS via X.2) serve immediately; manual channels
    // (registered post / hand delivery / published notice) require explicit HR service with proof.
    const policy = this.repository.getAdministrationPolicy(actor);
    if (SYSTEM_DELIVERY_CHANNELS.includes(policy.defaultDeliveryChannel)) {
      const acknowledgement: OrderAcknowledgement = {
        id: nextId("order-acknowledgement", this.repository.countAcknowledgements()),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        transferOrderId: order.id,
        employeeId: order.employeeId,
        servedOnDate: order.orderDate,
        deliveryChannel: policy.defaultDeliveryChannel,
        acknowledgementStatus: "SERVED",
      };
      this.repository.insertAcknowledgement(acknowledgement);
      order.servedOnDate = acknowledgement.servedOnDate;
    }
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
    // Post-hr_admin-goal fix: `g05.clearance.grant` names a `g05_clearance_officer` capability
    // flag that was never checked — any `g05.transfer.clearance` holder could grant/deny a
    // departmental no-dues clearance regardless of the flag.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g05_clearance_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Granting a departmental clearance requires the g05_clearance_officer capability", { field: "actor" });
    }
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
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g05_clearance_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Deeming a departmental clearance requires the g05_clearance_officer capability", { field: "actor" });
    }
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
    // BRD invariant 5.6-15 (FR-G05-020 AC4): an unserved order cannot relieve.
    this.requireServedOrder(actor, order, "RELIEVE");
    // FR-G05-007: a recorded charge handover must be ACCEPTED or UNDER_PROTEST before relieving.
    this.requireHandoverNotDisputed(actor, order);
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
    // BRD invariant 5.6-15: even a forced (deemed) relief cannot take effect on an unserved order.
    this.requireServedOrder(actor, order, "DEEM_RELIEVED");
    this.requireHandoverNotDisputed(actor, order);
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

  // =====================================================================================
  // PH-08B — G05 transfer administration depth (FR-G05-007/009/011/020/022)
  // =====================================================================================

  /** §16.5 configuration cascade: administration policy is data, maintained by Org Admin. */
  configureAdministrationPolicy(actor: ActorContext, policy: TransferAdministrationPolicy): void {
    this.authorization.check(actor, "g05.transfer.administration.configure", actor);
    this.repository.configureAdministrationPolicy(actor, policy);
    this.audit.recordMutation(actor, {
      action: "G05_ADMINISTRATION_POLICY_CONFIGURED",
      subjectRef: `g05_administration_policy:${actor.tenantId}`,
      metadata: { ...policy },
    });
  }

  /** FR-G05-009: distance-band boundaries are rule rows, not code (§16.4). */
  configureJoiningTimeRules(actor: ActorContext, rules: JoiningTimeRule[]): void {
    this.authorization.check(actor, "g05.transfer.administration.configure", actor);
    this.repository.configureJoiningTimeRules(actor, rules);
    this.audit.recordMutation(actor, {
      action: "G05_JOINING_TIME_RULES_CONFIGURED",
      subjectRef: `g05_joining_time_rules:${actor.tenantId}`,
      metadata: { bands: rules.map((rule) => rule.band) },
    });
  }

  /**
   * FR-G05-020: record manual service of the order on the employee (registered post /
   * hand delivery / published notice require a G13 proof document).
   */
  serveOrder(
    actor: ActorContext,
    transferOrderId: string,
    input: { servedOnDate: string; deliveryChannel: DeliveryChannel; proofDocumentTitle?: string }
  ): OrderAcknowledgement {
    this.authorization.check(actor, "g05.transfer.serve", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved (published) transfer orders can be served");
    }
    if (this.repository.findAcknowledgementByOrder(actor, order.id)) {
      throw new FoundationError("CONFLICT", "Transfer order already has a service record");
    }
    if (!dateOnly(input.servedOnDate) || input.servedOnDate < order.orderDate) {
      throw new FoundationError("VALIDATION_FAILED", "Served-on date must be a valid date on/after the order date", { field: "servedOnDate" });
    }
    let proofDocumentId: string | undefined;
    if (!SYSTEM_DELIVERY_CHANNELS.includes(input.deliveryChannel)) {
      // BRD business rule: registered-post/hand-delivery/published-notice service needs recorded proof (G13).
      if (!input.proofDocumentTitle) {
        throw new FoundationError("VALIDATION_FAILED", "Manual delivery channels require a proof-of-service document", { field: "proofDocumentTitle" });
      }
      const proof = this.documentVault.createDocument(actor, {
        title: input.proofDocumentTitle,
        ownerEmployeeId: order.employeeId,
        classification: "CONFIDENTIAL",
        contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, servedOnDate: input.servedOnDate, channel: input.deliveryChannel })),
        isWorm: true,
      });
      proofDocumentId = this.documentVault.attach(actor, proof.id, {
        moduleCode: "G05",
        entityName: "order_acknowledgements",
        entityRefId: order.id,
        linkRole: "PROOF_OF_SERVICE",
      }).id;
    }
    const acknowledgement: OrderAcknowledgement = {
      id: nextId("order-acknowledgement", this.repository.countAcknowledgements()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      servedOnDate: input.servedOnDate,
      deliveryChannel: input.deliveryChannel,
      servedByUserId: actor.userId,
      acknowledgementStatus: "SERVED",
      proofDocumentId,
    };
    this.repository.insertAcknowledgement(acknowledgement);
    order.servedOnDate = input.servedOnDate;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_ORDER_SERVED",
      subjectRef: `g05_order_acknowledgements:${acknowledgement.id}`,
      metadata: { transferOrderId: order.id, deliveryChannel: input.deliveryChannel, servedOnDate: input.servedOnDate, proofDocumentId },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: order.employeeId,
      messageId: "G05_ORDER_SERVED",
      channel: "IN_APP",
      relatedRef: `g05_transfer_orders:${order.id}`,
      mergeFields: { orderNo: order.orderNo },
    });
    return { ...acknowledgement };
  }

  /** FR-G05-020 AC2: employee acknowledgement. SoD: the serving officer cannot acknowledge. */
  acknowledgeOrder(actor: ActorContext, transferOrderId: string, input: { acknowledgedAt: string }): OrderAcknowledgement {
    this.authorization.check(actor, "g05.transfer.acknowledge", actor);
    const order = this.requireOrder(actor, transferOrderId);
    this.assertSelfOrOverride(actor, order.employeeId);
    const acknowledgement = this.requireAcknowledgement(actor, order);
    if (acknowledgement.acknowledgementStatus !== "SERVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a served, unacknowledged order can be acknowledged", {
        details: { acknowledgementStatus: acknowledgement.acknowledgementStatus },
      });
    }
    if (acknowledgement.servedByUserId && acknowledgement.servedByUserId === actor.userId) {
      // Maker-checker SoD (P02): the officer who served the order cannot acknowledge it for the employee.
      throw new FoundationError("FORBIDDEN", "Serving officer cannot acknowledge the order", {
        details: { rule: "VAL-G02-SOD", servedByUserId: acknowledgement.servedByUserId },
      });
    }
    acknowledgement.acknowledgementStatus = "ACKNOWLEDGED";
    acknowledgement.acknowledgedAt = input.acknowledgedAt;
    this.repository.updateAcknowledgement(acknowledgement);
    order.acknowledgedAt = input.acknowledgedAt;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_ORDER_ACKNOWLEDGED",
      subjectRef: `g05_order_acknowledgements:${acknowledgement.id}`,
      metadata: { transferOrderId: order.id, acknowledgedAt: input.acknowledgedAt },
    });
    return { ...acknowledgement };
  }

  /**
   * FR-G05-020 AC3 / JOB-G05-SERVE-DEEM: deemed service. Evidence-backed — either the
   * statutory non-acknowledgement window has elapsed, or the channel evidences returned
   * registered post / published notice. Recorded with basis, reason, and timestamps.
   */
  deemOrderServed(
    actor: ActorContext,
    transferOrderId: string,
    input: { asOf: string; basis: DeemedServiceBasis; reason: string }
  ): OrderAcknowledgement {
    this.authorization.check(actor, "g05.transfer.deem_served", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const acknowledgement = this.requireAcknowledgement(actor, order);
    if (acknowledgement.acknowledgementStatus !== "SERVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only an unacknowledged service record can be deemed served", {
        details: { acknowledgementStatus: acknowledgement.acknowledgementStatus },
      });
    }
    const policy = this.repository.getAdministrationPolicy(actor);
    if (input.basis === "NON_ACKNOWLEDGEMENT") {
      const windowExpiry = addDaysIso(acknowledgement.servedOnDate, policy.deemedServiceWindowDays);
      if (input.asOf < windowExpiry) {
        throw new FoundationError("PRECONDITION_FAILED", "Statutory non-acknowledgement window has not elapsed", {
          details: { servedOnDate: acknowledgement.servedOnDate, windowDays: policy.deemedServiceWindowDays, windowExpiry, asOf: input.asOf },
        });
      }
    } else if (input.basis === "RETURNED_REGISTERED_POST" && acknowledgement.deliveryChannel !== "REGISTERED_POST") {
      throw new FoundationError("VALIDATION_FAILED", "Returned-post basis requires a registered-post service record", { field: "basis" });
    } else if (input.basis === "PUBLISHED_NOTICE" && acknowledgement.deliveryChannel !== "PUBLISHED_NOTICE") {
      throw new FoundationError("VALIDATION_FAILED", "Published-notice basis requires a published-notice service record", { field: "basis" });
    }
    acknowledgement.acknowledgementStatus = "DEEMED_SERVED";
    acknowledgement.deemedServedBasis = input.basis;
    acknowledgement.deemedServedReason = input.reason;
    acknowledgement.deemedServedOn = input.asOf;
    acknowledgement.statutoryWindowDays = policy.deemedServiceWindowDays;
    this.repository.updateAcknowledgement(acknowledgement);
    this.audit.recordMutation(actor, {
      action: "G05_ORDER_DEEMED_SERVED",
      subjectRef: `g05_order_acknowledgements:${acknowledgement.id}`,
      metadata: {
        transferOrderId: order.id,
        basis: input.basis,
        reason: input.reason,
        deemedServedOn: input.asOf,
        servedOnDate: acknowledgement.servedOnDate,
        statutoryWindowDays: policy.deemedServiceWindowDays,
      },
    });
    return { ...acknowledgement };
  }

  /** Post-full-review fix: this read named its own transfer order but never checked that the
   *  order belongs to the caller — same ownership gate as `getOrder()`, since a service record
   *  is a sub-resource of the order it acknowledges. */
  getServiceRecord(scope: ActorContext, transferOrderId: string): OrderAcknowledgement | undefined {
    const order = this.requireOrder(scope, transferOrderId);
    if (!this.isTransferAccessOverride(scope) && order.employeeId !== scope.userId) {
      throw new FoundationError("FORBIDDEN", "You may only access your own transfer order", { field: "transferOrderId" });
    }
    const acknowledgement = this.repository.findAcknowledgementByOrder(scope, transferOrderId);
    return acknowledgement ? { ...acknowledgement } : undefined;
  }

  /** FR-G05-007: record the charge handover at source (assets, cash/imprest, files, G13 note). */
  recordChargeHandover(
    actor: ActorContext,
    transferOrderId: string,
    input: {
      receivingEmployeeId: string;
      handoverDate: string;
      phase?: ChargePhase;
      chargeType?: ChargeType;
      assetsHanded?: Record<string, unknown>[];
      cashImprestAmount?: number;
      pendingFilesCount?: number;
      noteTitle?: string;
    }
  ): ChargeHandover {
    this.authorization.check(actor, "g05.transfer.handover.record", actor);
    const order = this.requireOrder(actor, transferOrderId);
    if (order.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Charge handover requires an approved transfer order");
    }
    if (input.receivingEmployeeId === order.employeeId) {
      // BRD business rule (P02): relinquisher and acceptor must be different persons.
      throw new FoundationError("VALIDATION_FAILED", "Relinquishing and receiving employees must differ", { field: "receivingEmployeeId" });
    }
    const note = this.documentVault.createDocument(actor, {
      title: input.noteTitle ?? `Charge Handover Note ${order.orderNo}`,
      ownerEmployeeId: order.employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify({ orderNo: order.orderNo, handoverDate: input.handoverDate, receiving: input.receivingEmployeeId })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, note.id, {
      moduleCode: "G05",
      entityName: "charge_handovers",
      entityRefId: order.id,
      linkRole: "HANDOVER_NOTE",
    });
    const handover: ChargeHandover = {
      id: nextId("charge-handover", this.repository.countChargeHandovers()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      transferOrderId: order.id,
      phase: input.phase ?? "HANDOVER_SOURCE",
      relinquishingEmployeeId: order.employeeId,
      receivingEmployeeId: input.receivingEmployeeId,
      chargeType: input.chargeType ?? "FULL",
      handoverDate: input.handoverDate,
      assetsHanded: input.assetsHanded,
      cashImprestAmount: input.cashImprestAmount,
      pendingFilesCount: input.pendingFilesCount,
      handoverNoteDocumentId: attached.id,
      status: "SUBMITTED",
      underProtest: false,
      recordedByUserId: actor.userId,
    };
    this.repository.insertChargeHandover(handover);
    this.audit.recordMutation(actor, {
      action: "G05_CHARGE_HANDOVER_RECORDED",
      subjectRef: `g05_charge_handovers:${handover.id}`,
      metadata: { transferOrderId: order.id, phase: handover.phase, chargeType: handover.chargeType, noteDocumentId: attached.id },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: input.receivingEmployeeId,
      messageId: "G05_CHARGE_HANDOVER_SUBMITTED",
      channel: "IN_APP",
      relatedRef: `g05_charge_handovers:${handover.id}`,
      mergeFields: { orderNo: order.orderNo },
    });
    return { ...handover };
  }

  /** FR-G05-007 AC2: receiving officer accepts. SoD: the recorder cannot accept their own handover. */
  acceptChargeHandover(actor: ActorContext, chargeHandoverId: string, input: { acceptedAt: string }): ChargeHandover {
    this.authorization.check(actor, "g05.transfer.handover.accept", actor);
    const handover = this.requireChargeHandover(actor, chargeHandoverId);
    if (handover.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted charge handovers can be accepted", { details: { status: handover.status } });
    }
    if (handover.recordedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Relinquisher cannot accept their own charge handover", {
        details: { recordedByUserId: handover.recordedByUserId },
      });
    }
    handover.status = "ACCEPTED";
    handover.acceptedByUserId = actor.userId;
    handover.acceptedAt = input.acceptedAt;
    this.repository.updateChargeHandover(handover);
    this.audit.recordMutation(actor, {
      action: "G05_CHARGE_HANDOVER_ACCEPTED",
      subjectRef: `g05_charge_handovers:${handover.id}`,
      metadata: { transferOrderId: handover.transferOrderId, acceptedAt: input.acceptedAt },
    });
    return { ...handover };
  }

  /** FR-G05-007 AC2/AC3: dispute starts the time-bound resolution clock (JOB-G05-DISPUTE-SLA). */
  disputeChargeHandover(actor: ActorContext, chargeHandoverId: string, input: { remarks: string; disputedAt: string }): ChargeHandover {
    this.authorization.check(actor, "g05.transfer.handover.dispute", actor);
    const handover = this.requireChargeHandover(actor, chargeHandoverId);
    if (handover.status !== "SUBMITTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only submitted charge handovers can be disputed", { details: { status: handover.status } });
    }
    if (handover.recordedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Relinquisher cannot dispute their own charge handover", {
        details: { recordedByUserId: handover.recordedByUserId },
      });
    }
    const policy = this.repository.getAdministrationPolicy(actor);
    handover.status = "DISPUTED";
    handover.disputeRemarks = input.remarks;
    handover.disputeSlaDueAt = addHoursIso(input.disputedAt, policy.disputeSlaHours);
    this.repository.updateChargeHandover(handover);
    this.audit.recordMutation(actor, {
      action: "G05_CHARGE_HANDOVER_DISPUTED",
      subjectRef: `g05_charge_handovers:${handover.id}`,
      metadata: { transferOrderId: handover.transferOrderId, remarks: input.remarks, disputeSlaDueAt: handover.disputeSlaDueAt },
    });
    return { ...handover };
  }

  /**
   * FR-G05-007 AC3 / FR-G05-016: after the dispute SLA breaches, the Authority certifies
   * handover UNDER_PROTEST — unblocking relieving while preserving the dispute record.
   */
  certifyHandoverUnderProtest(actor: ActorContext, chargeHandoverId: string, input: { asOf: string; reason: string }): ChargeHandover {
    this.authorization.check(actor, "g05.transfer.handover.protest", actor);
    const handover = this.requireChargeHandover(actor, chargeHandoverId);
    if (handover.status !== "DISPUTED" || !handover.disputeSlaDueAt) {
      // The dispute path is the only route into under-protest — this is the dispute-blocked state.
      throw new FoundationError("ERR-G05-HANDOVER-DISPUTED", "Only a disputed charge handover can be certified under protest", {
        details: { chargeHandoverId: handover.id, status: handover.status },
      });
    }
    if (input.asOf <= handover.disputeSlaDueAt) {
      throw new FoundationError("PRECONDITION_FAILED", "Dispute resolution SLA has not breached yet", {
        details: { disputeSlaDueAt: handover.disputeSlaDueAt, asOf: input.asOf },
      });
    }
    if (handover.recordedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Relinquisher cannot certify their own handover under protest", {
        details: { recordedByUserId: handover.recordedByUserId },
      });
    }
    handover.status = "UNDER_PROTEST";
    handover.underProtest = true;
    handover.forcedActionType = "HANDOVER_UNDER_PROTEST";
    handover.forcedActionReason = input.reason;
    handover.forcedActionByUserId = actor.userId;
    this.repository.updateChargeHandover(handover);
    this.audit.recordMutation(actor, {
      action: "G05_CHARGE_HANDOVER_UNDER_PROTEST",
      subjectRef: `g05_charge_handovers:${handover.id}`,
      metadata: {
        transferOrderId: handover.transferOrderId,
        forcedActionType: "HANDOVER_UNDER_PROTEST",
        reason: input.reason,
        disputeRemarksPreserved: handover.disputeRemarks,
      },
    });
    return { ...handover };
  }

  /** Post-full-review fix: charge handovers name both a relinquisher and an acceptor
   *  (`order.employeeId` plus `receivingEmployeeId`), so either party (or an override actor) may
   *  read the order's handover history — not any arbitrary `g05.transfer.read` holder. List reads
   *  never 404 on an unknown/garbage transferOrderId (matches this kernel's list-route
   *  convention) — a missing order simply narrows the ownership check to the handover rows
   *  themselves. */
  listChargeHandovers(scope: ActorContext, transferOrderId: string): ChargeHandover[] {
    requireTenantScope(scope);
    const handovers = this.repository.listChargeHandoversByOrder(scope, transferOrderId).map((handover) => ({ ...handover }));
    if (this.isTransferAccessOverride(scope)) {
      return handovers;
    }
    const order = this.repository.findOrder(scope, transferOrderId);
    if (order && order.employeeId === scope.userId) {
      return handovers;
    }
    return handovers.filter((handover) => handover.receivingEmployeeId === scope.userId);
  }

  /**
   * FR-G05-009 / VAL-G05-JTIME: joining time from the configured distance-band rule rows.
   * Band boundaries are data (g05_joining_time_rules), never magic numbers in the service.
   */
  computeJoiningTime(
    actor: ActorContext,
    transferOrderId: string,
    input: { distanceKm?: number; sameStation?: boolean }
  ): { transferOrderId: string; joiningDistanceBand: JoiningDistanceBand; joiningTimeDays: number; rule: JoiningTimeRule } {
    this.authorization.check(actor, "g05.transfer.joining_time.compute", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const rules = this.repository.listJoiningTimeRules(actor);
    let rule: JoiningTimeRule | undefined;
    if (input.sameStation) {
      rule = rules.find((candidate) => candidate.sameStation);
    } else {
      if (typeof input.distanceKm !== "number" || Number.isNaN(input.distanceKm) || input.distanceKm < 0) {
        throw new FoundationError("VALIDATION_FAILED", "Distance in kilometres is required for joining-time computation", {
          field: "distanceKm",
          details: { messageId: "VAL-G05-JTIME" },
        });
      }
      const distanceKm = input.distanceKm;
      rule = rules.find(
        (candidate) =>
          !candidate.sameStation && distanceKm >= candidate.minDistanceKm && (candidate.maxDistanceKm === undefined || distanceKm < candidate.maxDistanceKm)
      );
    }
    if (!rule) {
      throw new FoundationError("VALIDATION_FAILED", "No configured distance-band rule matches the journey", {
        field: "distanceKm",
        details: { messageId: "VAL-G05-JTIME", distanceKm: input.distanceKm },
      });
    }
    order.joiningDistanceBand = rule.band;
    order.joiningTimeDays = rule.joiningTimeDays;
    this.repository.updateOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_JOINING_TIME_COMPUTED",
      subjectRef: `g05_transfer_orders:${order.id}`,
      metadata: { rule: "VAL-G05-JTIME", distanceKm: input.distanceKm, sameStation: input.sameStation, band: rule.band, joiningTimeDays: rule.joiningTimeDays },
    });
    return { transferOrderId: order.id, joiningDistanceBand: rule.band, joiningTimeDays: rule.joiningTimeDays, rule: { ...rule } };
  }

  /** FR-G05-011 AC1: deputation record for a deputation-class order, with the tenure cap recorded. */
  createDeputationRecord(
    actor: ActorContext,
    transferOrderId: string,
    input: {
      startDate: string;
      initialTenureMonths: number;
      maxTenureMonths?: number;
      borrowingOrgUnitId?: string;
      lendingOrgUnitId?: string;
      deputationTerms?: Record<string, unknown>;
    }
  ): DeputationRecord {
    this.authorization.check(actor, "g05.deputation.manage", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const policy = this.repository.getAdministrationPolicy(actor);
    const maxTenureMonths = input.maxTenureMonths ?? policy.deputationDefaultMaxTenureMonths;
    if (input.initialTenureMonths <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Initial deputation tenure must be positive", { field: "initialTenureMonths" });
    }
    if (input.initialTenureMonths > maxTenureMonths) {
      // FR-G05-011 AC2: tenure beyond the policy cap is blocked (422).
      throw new FoundationError("ERR-G05-DEPUTATION-CAP", "Deputation tenure exceeds the maximum tenure cap", {
        details: { initialTenureMonths: input.initialTenureMonths, maxTenureMonths },
      });
    }
    const currentEndDate = addMonthsIso(input.startDate, input.initialTenureMonths);
    const record: DeputationRecord = {
      id: nextId("deputation-record", this.repository.countDeputations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      transferOrderId: order.id,
      employeeId: order.employeeId,
      borrowingOrgUnitId: input.borrowingOrgUnitId ?? order.toOrgUnitId,
      lendingOrgUnitId: input.lendingOrgUnitId ?? order.fromOrgUnitId,
      deputationTerms: input.deputationTerms,
      startDate: input.startDate,
      initialTenureMonths: input.initialTenureMonths,
      tenureMonths: input.initialTenureMonths,
      currentEndDate,
      maxTenureMonths,
      extensionCount: 0,
      repatriationDueDate: currentEndDate,
      repatriationStatus: "ACTIVE",
      initiatedByUserId: actor.userId,
    };
    this.repository.insertDeputationRecord(record);
    this.audit.recordMutation(actor, {
      action: "G05_DEPUTATION_RECORDED",
      subjectRef: `g05_deputation_records:${record.id}`,
      metadata: { transferOrderId: order.id, startDate: record.startDate, currentEndDate, maxTenureMonths },
    });
    return { ...record };
  }

  /** FR-G05-011 AC2: extensions are validated against max_tenure_months; over-cap is blocked. */
  extendDeputation(actor: ActorContext, deputationId: string, input: { extensionMonths: number; reason?: string }): DeputationRecord {
    this.authorization.check(actor, "g05.deputation.extend", actor);
    const record = this.requireDeputationRecord(actor, deputationId);
    if (record.repatriationStatus === "REPATRIATED") {
      throw new FoundationError("PRECONDITION_FAILED", "Repatriated deputations cannot be extended");
    }
    if (input.extensionMonths <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "Extension months must be positive", { field: "extensionMonths" });
    }
    if (record.tenureMonths + input.extensionMonths > record.maxTenureMonths) {
      // BRD §8.2: 422 / ERR-G05-DEPUTATION-CAP — extension beyond max tenure.
      throw new FoundationError("ERR-G05-DEPUTATION-CAP", "Extension beyond maximum deputation tenure", {
        details: {
          tenureMonths: record.tenureMonths,
          extensionMonths: input.extensionMonths,
          maxTenureMonths: record.maxTenureMonths,
        },
      });
    }
    record.tenureMonths += input.extensionMonths;
    record.currentEndDate = addMonthsIso(record.startDate, record.tenureMonths);
    record.repatriationDueDate = record.currentEndDate;
    record.extensionCount += 1;
    record.repatriationStatus = "EXTENDED";
    this.repository.updateDeputationRecord(record);
    this.audit.recordMutation(actor, {
      action: "G05_DEPUTATION_EXTENDED",
      subjectRef: `g05_deputation_records:${record.id}`,
      metadata: { extensionMonths: input.extensionMonths, currentEndDate: record.currentEndDate, reason: input.reason },
    });
    return { ...record };
  }

  /**
   * FR-G05-011 AC4: repatriation (on cap, due date, or recall) initiates a reverse
   * transfer order back to the lending unit. SoD: the approving authority must differ
   * from the actor who initiated the deputation record.
   */
  repatriateDeputation(
    actor: ActorContext,
    deputationId: string,
    input: { repatriationDate: string; reason: string }
  ): { record: DeputationRecord; repatriationOrder: TransferOrder } {
    this.authorization.check(actor, "g05.deputation.repatriate", actor);
    const record = this.requireDeputationRecord(actor, deputationId);
    if (record.repatriationStatus === "REPATRIATED") {
      throw new FoundationError("PRECONDITION_FAILED", "Deputation is already repatriated");
    }
    if (record.initiatedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Repatriation approval must come from a different actor than the deputation initiator", {
        details: { initiatedByUserId: record.initiatedByUserId },
      });
    }
    // Reverse REPATRIATION-class order to the lending unit (reuses the FR-004 initiation path).
    // The sanctioning authority for repatriation sits with the lending/parent organisation.
    const initiated = this.initiate(actor, {
      employeeId: record.employeeId,
      fromOrgUnitId: record.borrowingOrgUnitId,
      toOrgUnitId: record.lendingOrgUnitId,
      orderDate: input.repatriationDate,
      effectiveDate: input.repatriationDate,
      reason: `REPATRIATION: ${input.reason}`,
      authorityOrgUnitId: record.lendingOrgUnitId,
    });
    record.repatriationStatus = "REPATRIATED";
    record.repatriationOrderId = initiated.order.id;
    record.repatriatedOn = input.repatriationDate;
    this.repository.updateDeputationRecord(record);
    this.audit.recordMutation(actor, {
      action: "G05_DEPUTATION_REPATRIATED",
      subjectRef: `g05_deputation_records:${record.id}`,
      metadata: { repatriationOrderId: initiated.order.id, repatriationDate: input.repatriationDate, reason: input.reason },
    });
    return { record: { ...record }, repatriationOrder: initiated.order };
  }

  listDeputationRecords(scope: TenantScope): DeputationRecord[] {
    requireTenantScope(scope);
    return this.repository.listDeputationRecords(scope).map((record) => ({ ...record }));
  }

  /**
   * FR-G05-022 AC1: quarter retention request. Retention beyond the permissible policy
   * window is rejected with ERR-G05-QUARTER-OVERSTAY (422).
   */
  requestQuarterRetention(
    actor: ActorContext,
    transferOrderId: string,
    input: { quarterRef: string; orgUnitId?: string; vacateByDate: string; licenceFeeRate: number; penalLicenceFeeRate?: number }
  ): QuarterAllotment {
    this.authorization.check(actor, "g05.quarter.request", actor);
    const order = this.requireOrder(actor, transferOrderId);
    const baseline = order.lastWorkingDay ?? order.effectiveDate;
    if (!dateOnly(input.vacateByDate) || input.vacateByDate < baseline) {
      // BRD validation: vacate-by >= last working day.
      throw new FoundationError("VALIDATION_FAILED", "Vacate-by date must be on/after the last working day", {
        field: "vacateByDate",
        details: { lastWorkingDay: baseline },
      });
    }
    const policy = this.repository.getAdministrationPolicy(actor);
    const permissibleUntil = addMonthsIso(baseline, policy.permissibleRetentionMonths);
    if (input.vacateByDate > permissibleUntil) {
      throw new FoundationError("ERR-G05-QUARTER-OVERSTAY", "Accommodation retention requested beyond the permissible period", {
        details: { vacateByDate: input.vacateByDate, permissibleUntil, permissibleRetentionMonths: policy.permissibleRetentionMonths },
      });
    }
    const allotment: QuarterAllotment = {
      id: nextId("quarter-allotment", this.repository.countQuarterAllotments()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: order.employeeId,
      transferOrderId: order.id,
      quarterRef: input.quarterRef,
      orgUnitId: input.orgUnitId ?? order.fromOrgUnitId,
      retentionAllowed: false,
      retentionStatus: "RETENTION_REQUESTED",
      vacateByDate: input.vacateByDate,
      licenceFeeRate: input.licenceFeeRate,
      penalLicenceFeeRate: input.penalLicenceFeeRate,
      penalRateApplies: false,
      requestedByUserId: actor.userId,
    };
    this.repository.insertQuarterAllotment(allotment);
    this.audit.recordMutation(actor, {
      action: "G05_QUARTER_RETENTION_REQUESTED",
      subjectRef: `g05_quarter_allotments:${allotment.id}`,
      metadata: { transferOrderId: order.id, quarterRef: input.quarterRef, vacateByDate: input.vacateByDate },
    });
    return { ...allotment };
  }

  /** FR-G05-022 AC1: Authority approval. SoD: the requesting officer cannot approve. */
  approveQuarterRetention(actor: ActorContext, quarterAllotmentId: string, input: { approvedOn: string }): QuarterAllotment {
    this.authorization.check(actor, "g05.quarter.approve", actor);
    // Post-hr_admin-goal fix: `g05.estate.record` names a `g05_estate_officer` capability flag
    // that was never checked on any of the estate/quarter write actions.
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g05_estate_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Approving accommodation retention requires the g05_estate_officer capability", { field: "actor" });
    }
    const allotment = this.requireQuarterAllotment(actor, quarterAllotmentId);
    if (allotment.retentionStatus !== "RETENTION_REQUESTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only requested retentions can be approved", { details: { retentionStatus: allotment.retentionStatus } });
    }
    if (allotment.requestedByUserId === actor.userId) {
      throw new FoundationError("FORBIDDEN", "Retention approval must come from a different actor than the requester", {
        details: { requestedByUserId: allotment.requestedByUserId },
      });
    }
    allotment.retentionAllowed = true;
    allotment.retentionStatus = "RETENTION_APPROVED";
    this.repository.updateQuarterAllotment(allotment);
    this.audit.recordMutation(actor, {
      action: "G05_QUARTER_RETENTION_APPROVED",
      subjectRef: `g05_quarter_allotments:${allotment.id}`,
      metadata: { approvedOn: input.approvedOn, vacateByDate: allotment.vacateByDate },
    });
    return { ...allotment };
  }

  /**
   * FR-G05-022 AC2/AC3 (JOB-G05-QTR-OVERSTAY surrogate): retention past vacate-by flips the
   * penal licence-fee rate, marks OVERSTAY, and raises the G10 licence-fee-recovery reference.
   */
  flagQuarterOverstay(actor: ActorContext, quarterAllotmentId: string, input: { asOf: string }): QuarterAllotment {
    this.authorization.check(actor, "g05.quarter.overstay", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g05_estate_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Flagging an accommodation overstay requires the g05_estate_officer capability", { field: "actor" });
    }
    const allotment = this.requireQuarterAllotment(actor, quarterAllotmentId);
    if (allotment.retentionStatus === "VACATED" || allotment.retentionStatus === "OVERSTAY") {
      throw new FoundationError("PRECONDITION_FAILED", "Quarter is already vacated or flagged", { details: { retentionStatus: allotment.retentionStatus } });
    }
    if (!allotment.vacateByDate || input.asOf <= allotment.vacateByDate) {
      throw new FoundationError("PRECONDITION_FAILED", "Retention has not overstayed the vacate-by date", {
        details: { vacateByDate: allotment.vacateByDate, asOf: input.asOf },
      });
    }
    const normalRate = allotment.licenceFeeRate;
    allotment.penalRateApplies = true;
    allotment.retentionStatus = "OVERSTAY";
    if (allotment.penalLicenceFeeRate !== undefined) {
      // Penal-rate flip: billing moves from the normal to the penal licence-fee rate.
      allotment.licenceFeeRate = allotment.penalLicenceFeeRate;
    }
    allotment.licenceFeeRecoveryRef = `G10:LICENCE_FEE_RECOVERY:${allotment.id}`;
    this.repository.updateQuarterAllotment(allotment);
    this.audit.recordMutation(actor, {
      action: "G05_QUARTER_PENAL_RATE_FLIPPED",
      subjectRef: `g05_quarter_allotments:${allotment.id}`,
      metadata: {
        asOf: input.asOf,
        vacateByDate: allotment.vacateByDate,
        normalRate,
        penalRate: allotment.licenceFeeRate,
        licenceFeeRecoveryRef: allotment.licenceFeeRecoveryRef,
      },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: allotment.employeeId,
      messageId: "G05_QUARTER_OVERSTAY_PENAL_RATE",
      channel: "IN_APP",
      relatedRef: `g05_quarter_allotments:${allotment.id}`,
      mergeFields: { quarterRef: allotment.quarterRef, recoveryRef: allotment.licenceFeeRecoveryRef ?? "" },
    });
    return { ...allotment };
  }

  /** FR-G05-022 AC4: vacation recording closes the retention. */
  recordQuarterVacation(actor: ActorContext, quarterAllotmentId: string, input: { vacatedOn: string }): QuarterAllotment {
    this.authorization.check(actor, "g05.quarter.vacate", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g05_estate_officer" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Recording accommodation vacation requires the g05_estate_officer capability", { field: "actor" });
    }
    const allotment = this.requireQuarterAllotment(actor, quarterAllotmentId);
    if (allotment.retentionStatus === "VACATED") {
      throw new FoundationError("PRECONDITION_FAILED", "Quarter is already vacated");
    }
    allotment.retentionStatus = "VACATED";
    allotment.vacatedOn = input.vacatedOn;
    this.repository.updateQuarterAllotment(allotment);
    this.audit.recordMutation(actor, {
      action: "G05_QUARTER_VACATED",
      subjectRef: `g05_quarter_allotments:${allotment.id}`,
      metadata: { vacatedOn: input.vacatedOn, penalRateApplied: allotment.penalRateApplies },
    });
    return { ...allotment };
  }

  listQuarterAllotments(scope: TenantScope): QuarterAllotment[] {
    requireTenantScope(scope);
    return this.repository.listQuarterAllotments(scope).map((allotment) => ({ ...allotment }));
  }

  /** BRD §3.2: HR Src/Dest/Admin/Transfer Auth get a plain "R" (any order); Employee gets
   *  "R (own)". Non-override actors are need-to-know scoped to orders raised for them. */
  listOrders(scope: ActorContext): TransferOrder[] {
    requireTenantScope(scope);
    const inTenant = this.repository.listOrders(scope);
    const visible = this.isTransferAccessOverride(scope) ? inTenant : inTenant.filter((order) => order.employeeId === scope.userId);
    return visible.map((order) => this.cloneOrder(order));
  }

  /** Self-service "track status" discovery surface: every transfer order raised for the given
   *  employee, newest first. Self-or-override only. */
  listMyOrders(actor: ActorContext, employeeId: string): TransferOrder[] {
    requireTenantScope(actor);
    this.assertSelfOrOverride(actor, employeeId);
    return this.repository
      .listOrders(actor)
      .filter((order) => order.employeeId === employeeId)
      .map((order) => this.cloneOrder(order));
  }

  getOrder(scope: ActorContext, transferOrderId: string): TransferOrder {
    const order = this.requireOrder(scope, transferOrderId);
    if (!this.isTransferAccessOverride(scope) && order.employeeId !== scope.userId) {
      throw new FoundationError("FORBIDDEN", "You may only access your own transfer order", { field: "transferOrderId" });
    }
    return this.cloneOrder(order);
  }

  /** Post-full-review fix (F2): same need-to-know scoping as `listOrders()` — these were
   *  tenant-scoped only, the exact bug class an earlier feature's full-review caught in G13's
   *  `list()`. Non-override actors now see only rows naming them as the employee. */
  listRepresentations(scope: ActorContext): TransferRepresentation[] {
    requireTenantScope(scope);
    const inTenant = this.repository.listRepresentations(scope).map((representation) => this.cloneRepresentation(representation));
    return this.isTransferAccessOverride(scope) ? inTenant : inTenant.filter((representation) => representation.employeeId === scope.userId);
  }

  listRelievingOrders(scope: ActorContext): RelievingOrder[] {
    requireTenantScope(scope);
    const inTenant = this.repository.listRelievingOrders(scope).map((relievingOrder) => ({ ...relievingOrder }));
    return this.isTransferAccessOverride(scope) ? inTenant : inTenant.filter((relievingOrder) => relievingOrder.employeeId === scope.userId);
  }

  listJoiningReports(scope: ActorContext): JoiningReport[] {
    requireTenantScope(scope);
    const inTenant = this.repository.listJoiningReports(scope).map((joiningReport) => ({ ...joiningReport }));
    return this.isTransferAccessOverride(scope) ? inTenant : inTenant.filter((joiningReport) => joiningReport.employeeId === scope.userId);
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

  /** BRD invariant 5.6-15: relieve/effect requires a SERVED / ACKNOWLEDGED / DEEMED_SERVED row. */
  private requireServedOrder(scope: TenantScope, order: TransferOrder, action: string): OrderAcknowledgement {
    const acknowledgement = this.repository.findAcknowledgementByOrder(scope, order.id);
    if (!acknowledgement || !SERVED_GATE_STATUSES.includes(acknowledgement.acknowledgementStatus)) {
      throw new FoundationError("ERR-G05-NOT-SERVED", "Transfer order has no proof of service on the employee", {
        details: { transferOrderId: order.id, action, acknowledgementStatus: acknowledgement?.acknowledgementStatus },
      });
    }
    return acknowledgement;
  }

  /** FR-G05-007: a recorded handover blocks relieving until it is ACCEPTED or UNDER_PROTEST. */
  private requireHandoverNotDisputed(scope: TenantScope, order: TransferOrder): void {
    const blocking = this.repository
      .listChargeHandoversByOrder(scope, order.id)
      .find((handover) => handover.status === "SUBMITTED" || handover.status === "DISPUTED");
    if (blocking) {
      throw new FoundationError("ERR-G05-HANDOVER-DISPUTED", "Charge handover is not accepted or certified under protest", {
        details: { chargeHandoverId: blocking.id, status: blocking.status, disputeSlaDueAt: blocking.disputeSlaDueAt },
      });
    }
  }

  private requireAcknowledgement(scope: TenantScope, order: TransferOrder): OrderAcknowledgement {
    const acknowledgement = this.repository.findAcknowledgementByOrder(scope, order.id);
    if (!acknowledgement) {
      throw new FoundationError("ERR-G05-NOT-SERVED", "Transfer order has no service record", {
        details: { transferOrderId: order.id },
      });
    }
    return acknowledgement;
  }

  private requireChargeHandover(scope: TenantScope, chargeHandoverId: string): ChargeHandover {
    const handover = this.repository.findChargeHandover(scope, chargeHandoverId);
    if (!handover) {
      throw new FoundationError("NOT_FOUND", "Charge handover not found");
    }
    return handover;
  }

  private requireDeputationRecord(scope: TenantScope, deputationId: string): DeputationRecord {
    const record = this.repository.findDeputationRecord(scope, deputationId);
    if (!record) {
      throw new FoundationError("NOT_FOUND", "Deputation record not found");
    }
    return record;
  }

  private requireQuarterAllotment(scope: TenantScope, quarterAllotmentId: string): QuarterAllotment {
    const allotment = this.repository.findQuarterAllotment(scope, quarterAllotmentId);
    if (!allotment) {
      throw new FoundationError("NOT_FOUND", "Quarter allotment not found");
    }
    return allotment;
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

/** Add whole days to a YYYY-MM-DD date (UTC-safe). */
function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Add whole months to a YYYY-MM-DD date (UTC-safe). */
function addMonthsIso(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Add whole hours to an ISO timestamp (dispute SLA clock). */
function addHoursIso(isoTimestamp: string, hours: number): string {
  return new Date(new Date(isoTimestamp).getTime() + hours * 3_600_000).toISOString();
}
