import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, stableStringify, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { DocumentRecord, DocumentVaultService } from "../g13/documentVaultService";
import {
  ApprovalMatrixRule,
  FieldSensitivityCatalogEntry,
  G02Sensitivity,
  PersonalDetailsRepository,
  resolveApprovalRule,
} from "./personalDetailsRepository";

export type PersonalDetailFieldCode = "displayName" | "pan" | "aadhaarMasked";
/** Subset of the frozen g02_cr_status enum used by this slice (docs/data-model/02, §10 BRD G02). */
export type ChangeRequestStatus = "IN_REVIEW" | "RETURNED" | "APPROVED" | "COMMITTED" | "REJECTED" | "REVERSED" | "WITHDRAWN";

/** Statuses a requester may withdraw from (BRD FR-G02-006 AC4: never after APPROVED). */
const WITHDRAWABLE_STATUSES: ChangeRequestStatus[] = ["IN_REVIEW", "RETURNED"];

export interface PersonalDetailChangeRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  requestNo: string;
  employeeId: string;
  fieldCode: PersonalDetailFieldCode;
  oldValue: string;
  newValue: string;
  /** From field_sensitivity_catalog — never hardcoded (PH-07C audit gap). */
  sensitivity: G02Sensitivity;
  /** P01 stage chosen from the ACTIVE approval_matrix_config rule. */
  workflowStage: string;
  status: ChangeRequestStatus;
  /** SoD maker attribution: the submitting user, and the last user who edited via resubmit. */
  requestedByUserId: string;
  lastEditedByUserId: string;
  /** BR2 FR-G02-006: resubmit keeps the same requestNo and increments the revision. */
  revisionNo: number;
  decisionComment?: string;
  workflowInstanceId: string;
  workflowTaskId: string;
  documentIds: string[];
  srEventId?: string;
  reversalSrEventId?: string;
}

export interface PersonalDetailCreateResult {
  request: PersonalDetailChangeRequest;
  workflow: { instance: WorkflowInstance; taskId: string };
  evidenceDocument?: DocumentRecord;
}

export interface PersonalDetailFieldDiff {
  fieldCode: string;
  displayLabel: string;
  sensitivity: G02Sensitivity;
  oldValue: string;
  newValue: string;
  masked: boolean;
}

export interface PersonalDetailDiffResult {
  changeRequestId: string;
  requestNo: string;
  status: ChangeRequestStatus;
  revisionNo: number;
  fields: PersonalDetailFieldDiff[];
}

export class PersonalDetailsService {
  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    private readonly repository: PersonalDetailsRepository
  ) {}

  createRequest(
    actor: ActorContext,
    input: { employeeId: string; fieldCode: PersonalDetailFieldCode; newValue: string; reason: string; evidenceTitle?: string }
  ): PersonalDetailCreateResult {
    this.authorization.check(actor, "g02.change.submit", actor);
    const employee = this.employeeMaster.getById(actor, input.employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const catalogEntry = this.requireCatalogEntry(actor, input.fieldCode);
    const rule = this.requireApprovalRule(actor, catalogEntry);
    const oldValue = this.currentValue(employee, input.fieldCode);
    const requestId = nextId("g02-change", this.repository.countRequests());
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G02-PERSONAL-DETAILS",
      subjectRef: `g02_change_requests:${requestId}`,
      stage: rule.stage,
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
      asOf: "2026-07-02",
    });
    const evidenceDocument = this.createEvidence(actor, input.evidenceTitle, input.employeeId, requestId, {
      fieldCode: input.fieldCode,
      oldValue,
      newValue: input.newValue,
      reason: input.reason,
    });
    const request: PersonalDetailChangeRequest = {
      id: requestId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      requestNo: `G02/${String(this.repository.countRequests() + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      fieldCode: input.fieldCode,
      oldValue,
      newValue: input.newValue,
      sensitivity: catalogEntry.sensitivity,
      workflowStage: rule.stage,
      status: "IN_REVIEW",
      requestedByUserId: actor.userId,
      lastEditedByUserId: actor.userId,
      revisionNo: 1,
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      documentIds: evidenceDocument ? [evidenceDocument.id] : [],
    };
    this.repository.insertRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_SUBMIT",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { fieldCode: request.fieldCode, sensitivity: request.sensitivity, workflowStage: rule.stage, workflowInstanceId: request.workflowInstanceId },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: started.task.resolution.selectedAssignees[0]?.employeeId,
      messageId: "G02_CHANGE_SUBMITTED",
      channel: "IN_APP",
      relatedRef: `g02_change_requests:${request.id}`,
      mergeFields: { requestNo: request.requestNo, sensitivity: request.sensitivity },
    });
    return { request: this.clone(request), workflow: { instance: started.instance, taskId: started.task.id }, evidenceDocument };
  }

  approve(actor: ActorContext, requestId: string): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.approve", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "IN_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only in-review change requests can be approved");
    }
    this.assertMakerIsNotChecker(actor, request, "approve");
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "APPROVE" });
    request.status = "APPROVED";
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, { action: "G02_CHANGE_REQUEST_APPROVE", subjectRef: `g02_change_requests:${request.id}` });
    return this.clone(request);
  }

  reject(actor: ActorContext, requestId: string, comment: string | undefined): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.reject", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "IN_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only in-review change requests can be rejected");
    }
    this.assertMakerIsNotChecker(actor, request, "reject");
    const decisionComment = requireDecisionComment(comment, "reject");
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "REJECT" });
    request.status = "REJECTED";
    request.decisionComment = decisionComment;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_REJECT",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { decisionComment },
    });
    this.notifyRequester(actor, request, "MSG-G02-REJECTED");
    return this.clone(request);
  }

  /**
   * FR-G02-006 return-for-correction: the approver sends the request back with a mandatory
   * comment (ERR-REASON-REQ); P01 sendBack moves it to the editable RETURNED state.
   */
  sendBack(actor: ActorContext, requestId: string, comment: string | undefined): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.reject", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "IN_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only in-review change requests can be returned for correction");
    }
    this.assertMakerIsNotChecker(actor, request, "sendBack");
    const decisionComment = requireDecisionComment(comment, "sendBack");
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "SEND_BACK" });
    request.status = "RETURNED";
    request.decisionComment = decisionComment;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_RETURN",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { decisionComment },
    });
    this.notifyRequester(actor, request, "MSG-G02-RETURNED");
    return this.clone(request);
  }

  /**
   * FR-G02-006 resubmission: only the requester may resubmit a RETURNED request; the field
   * is re-gated against the sensitivity catalog and re-routed via the approval matrix on a
   * fresh P01 instance. Same requestNo, incremented revision (BR2).
   */
  resubmit(actor: ActorContext, requestId: string, input: { newValue?: string; reason: string }): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.submit", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "RETURNED") {
      throw new FoundationError("CONFLICT", "Only returned change requests can be resubmitted");
    }
    if (actor.userId !== request.requestedByUserId) {
      throw new FoundationError("FORBIDDEN", "Only the requester may resubmit a returned change request");
    }
    const catalogEntry = this.requireCatalogEntry(actor, request.fieldCode);
    const rule = this.requireApprovalRule(actor, catalogEntry);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G02-PERSONAL-DETAILS",
      subjectRef: `g02_change_requests:${request.id}`,
      stage: rule.stage,
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: request.employeeId },
      asOf: "2026-07-02",
    });
    if (input.newValue !== undefined) {
      request.newValue = input.newValue;
    }
    request.sensitivity = catalogEntry.sensitivity;
    request.workflowStage = rule.stage;
    request.status = "IN_REVIEW";
    request.revisionNo += 1;
    request.lastEditedByUserId = actor.userId;
    request.decisionComment = undefined;
    request.workflowInstanceId = started.instance.id;
    request.workflowTaskId = started.task.id;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_RESUBMIT",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { revisionNo: request.revisionNo, reason: input.reason, workflowStage: rule.stage },
    });
    return this.clone(request);
  }

  /**
   * FR-G02-006 withdrawal: the requester recalls a pending request (P01 cancel) into the
   * terminal WITHDRAWN state; never allowed once the request is APPROVED or later.
   */
  withdraw(actor: ActorContext, requestId: string, reason?: string): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.submit", actor);
    const request = this.requireRequest(actor, requestId);
    if (!WITHDRAWABLE_STATUSES.includes(request.status)) {
      throw new FoundationError("CONFLICT", "Change request can no longer be withdrawn");
    }
    if (actor.userId !== request.requestedByUserId) {
      throw new FoundationError("FORBIDDEN", "Only the requester may withdraw a change request");
    }
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "CANCEL" });
    request.status = "WITHDRAWN";
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_WITHDRAW",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { reason: reason ?? "" },
    });
    return this.clone(request);
  }

  /**
   * FR-G02-005 field diff: per-field old/new values with P02 masking — a reader without the
   * catalog entry's field grant sees masked values, never the raw sensitive data.
   */
  getDiff(actor: ActorContext, requestId: string): PersonalDetailDiffResult {
    this.authorization.check(actor, "g02.change.read", actor);
    const request = this.requireRequest(actor, requestId);
    const catalogEntry = this.repository.findSensitivityCatalogEntry(actor, request.fieldCode);
    const maskFieldGrant = catalogEntry?.maskFieldGrant;
    const masked = Boolean(maskFieldGrant) && !this.authorization.canSeeField(actor, maskFieldGrant as string);
    return {
      changeRequestId: request.id,
      requestNo: request.requestNo,
      status: request.status,
      revisionNo: request.revisionNo,
      fields: [
        {
          fieldCode: request.fieldCode,
          displayLabel: catalogEntry?.displayLabel ?? request.fieldCode,
          sensitivity: request.sensitivity,
          oldValue: masked ? "[HIDDEN]" : request.oldValue,
          newValue: masked ? "[HIDDEN]" : request.newValue,
          masked,
        },
      ],
    };
  }

  commit(actor: ActorContext, requestId: string, idempotencyKey: string, effectiveDate: string): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.commit", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "APPROVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only approved change requests can be committed");
    }
    if (request.fieldCode !== "displayName") {
      throw new FoundationError("PRECONDITION_FAILED", "Only displayName commit is enabled in PH-07 foundation");
    }
    const committed = this.employeeMaster.governedIdentityChange(actor, {
      employeeId: request.employeeId,
      newDisplayName: request.newValue,
      reason: `G02 ${request.requestNo}`,
      idempotencyKey,
      effectiveDate,
    });
    request.status = "COMMITTED";
    request.srEventId = committed.srEventId;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_COMMIT",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { g01SrEventId: committed.srEventId, ownerModule: "G01" },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: request.employeeId,
      messageId: "G02_CHANGE_COMMITTED",
      channel: "IN_APP",
      relatedRef: `g02_change_requests:${request.id}`,
      mergeFields: { requestNo: request.requestNo, srEventId: committed.srEventId },
    });
    return this.clone(request);
  }

  reverse(actor: ActorContext, requestId: string, idempotencyKey: string, effectiveDate: string): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.reverse", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "COMMITTED" || request.fieldCode !== "displayName") {
      throw new FoundationError("PRECONDITION_FAILED", "Only committed displayName changes can be reversed in PH-07 foundation");
    }
    const reversed = this.employeeMaster.governedIdentityChange(actor, {
      employeeId: request.employeeId,
      newDisplayName: request.oldValue,
      reason: `G02 reversal ${request.requestNo}`,
      idempotencyKey,
      effectiveDate,
    });
    request.status = "REVERSED";
    request.reversalSrEventId = reversed.srEventId;
    this.repository.updateRequest(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_REVERSE",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { g01SrEventId: reversed.srEventId, ownerModule: "G01" },
    });
    return this.clone(request);
  }

  list(scope: TenantScope): PersonalDetailChangeRequest[] {
    requireTenantScope(scope);
    return this.repository.listRequests(scope).map((request) => this.clone(request));
  }

  /**
   * P02 SoD (BRD §5.6 rule 1, FR-G02-004 AC7): the maker — the requester or the last user
   * who edited the request via resubmit — can never be the checker. Enforced in the service
   * decision path, not the UI; breach is 403 FORBIDDEN / ERR-G02-SOD.
   */
  private assertMakerIsNotChecker(actor: ActorContext, request: PersonalDetailChangeRequest, decision: string): void {
    if (actor.userId === request.requestedByUserId || actor.userId === request.lastEditedByUserId) {
      throw new FoundationError("FORBIDDEN", "Separation of duties: the maker of a change request cannot decide on it", {
        details: { messageId: "ERR-G02-SOD", rule: "VAL-G02-SOD", decision },
      });
    }
  }

  private requireCatalogEntry(scope: TenantScope, fieldCode: string): FieldSensitivityCatalogEntry {
    const entry = this.repository.findSensitivityCatalogEntry(scope, fieldCode);
    if (!entry) {
      throw new FoundationError("VALIDATION_FAILED", "Field is not registered in the sensitivity catalog", {
        field: "fieldCode",
        details: { fieldCode },
      });
    }
    return entry;
  }

  private requireApprovalRule(scope: TenantScope, entry: FieldSensitivityCatalogEntry): ApprovalMatrixRule {
    const matrix = this.repository.findActiveApprovalMatrix(scope);
    const rule = matrix ? resolveApprovalRule(matrix, entry) : undefined;
    if (!rule) {
      throw new FoundationError("PRECONDITION_FAILED", "No active approval matrix rule covers this field sensitivity", {
        details: { fieldKey: entry.fieldKey, sensitivity: entry.sensitivity },
      });
    }
    return rule;
  }

  private notifyRequester(actor: ActorContext, request: PersonalDetailChangeRequest, messageId: string): void {
    this.notifications.publish(actor, {
      recipientEmployeeId: request.employeeId,
      messageId,
      channel: "IN_APP",
      relatedRef: `g02_change_requests:${request.id}`,
      mergeFields: { requestNo: request.requestNo, decisionComment: request.decisionComment ?? "" },
    });
  }

  private createEvidence(
    actor: ActorContext,
    evidenceTitle: string | undefined,
    employeeId: string,
    requestId: string,
    payload: Record<string, unknown>
  ): DocumentRecord | undefined {
    if (!evidenceTitle) {
      return undefined;
    }
    const document = this.documentVault.createDocument(actor, {
      title: evidenceTitle,
      ownerEmployeeId: employeeId,
      classification: "CONFIDENTIAL",
      contentHash: pseudoHash64(stableStringify(payload)),
      isWorm: true,
    });
    return this.documentVault.attach(actor, document.id, {
      moduleCode: "G02",
      entityName: "change_requests",
      entityRefId: requestId,
      linkRole: "EVIDENCE",
    });
  }

  private requireRequest(scope: TenantScope, requestId: string): PersonalDetailChangeRequest {
    const request = this.repository.findRequest(scope, requestId);
    if (!request) {
      throw new FoundationError("NOT_FOUND", "G02 change request not found");
    }
    return request;
  }

  private currentValue(employee: { displayName: string; pan?: string; aadhaarMasked?: string }, fieldCode: PersonalDetailFieldCode): string {
    switch (fieldCode) {
      case "displayName":
        return employee.displayName;
      case "pan":
        return employee.pan ?? "";
      case "aadhaarMasked":
        return employee.aadhaarMasked ?? "";
    }
  }

  private clone(request: PersonalDetailChangeRequest): PersonalDetailChangeRequest {
    return { ...request, documentIds: [...request.documentIds] };
  }
}

/** BRD shared code ERR-REASON-REQ: REJECT and RETURN decisions require a comment (VAL-COMMENT). */
function requireDecisionComment(comment: string | undefined, decision: string): string {
  const trimmed = comment?.trim();
  if (!trimmed) {
    throw new FoundationError("VALIDATION_FAILED", "A decision comment is mandatory when rejecting or returning a change request", {
      field: "comment",
      details: { messageId: "ERR-REASON-REQ", rule: "VAL-COMMENT", decision },
    });
  }
  return trimmed;
}
