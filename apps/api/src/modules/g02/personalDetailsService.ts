import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { WorkflowInstance, HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, stableStringify, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { DocumentRecord, DocumentVaultService } from "../g13/documentVaultService";

export type PersonalDetailFieldCode = "displayName" | "pan" | "aadhaarMasked";
export type ChangeRequestStatus = "IN_REVIEW" | "APPROVED" | "COMMITTED" | "REJECTED" | "REVERSED";

export interface PersonalDetailChangeRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  requestNo: string;
  employeeId: string;
  fieldCode: PersonalDetailFieldCode;
  oldValue: string;
  newValue: string;
  sensitivity: "LOW" | "HIGH";
  status: ChangeRequestStatus;
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

export class PersonalDetailsService {
  private readonly requests: PersonalDetailChangeRequest[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService
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
    const oldValue = this.currentValue(employee, input.fieldCode);
    const sensitivity = sensitivityOf(input.fieldCode);
    const requestId = nextId("g02-change", this.requests.length);
    const started = this.workflow.start(actor, {
      workflowCode: "WF-G02-PERSONAL-DETAILS",
      subjectRef: `g02_change_requests:${requestId}`,
      stage: sensitivity === "HIGH" ? "PENDING_SENSITIVE_REVIEW" : "PENDING_MANAGER_REVIEW",
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
      requestNo: `G02/${String(this.requests.length + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      fieldCode: input.fieldCode,
      oldValue,
      newValue: input.newValue,
      sensitivity,
      status: "IN_REVIEW",
      workflowInstanceId: started.instance.id,
      workflowTaskId: started.task.id,
      documentIds: evidenceDocument ? [evidenceDocument.id] : [],
    };
    this.requests.push(request);
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_SUBMIT",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { fieldCode: request.fieldCode, sensitivity: request.sensitivity, workflowInstanceId: request.workflowInstanceId },
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
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "APPROVE" });
    request.status = "APPROVED";
    this.audit.recordMutation(actor, { action: "G02_CHANGE_REQUEST_APPROVE", subjectRef: `g02_change_requests:${request.id}` });
    return this.clone(request);
  }

  reject(actor: ActorContext, requestId: string): PersonalDetailChangeRequest {
    this.authorization.check(actor, "g02.change.reject", actor);
    const request = this.requireRequest(actor, requestId);
    if (request.status !== "IN_REVIEW") {
      throw new FoundationError("PRECONDITION_FAILED", "Only in-review change requests can be rejected");
    }
    this.workflow.actOnInstance(actor, { instanceId: request.workflowInstanceId, action: "REJECT" });
    request.status = "REJECTED";
    this.audit.recordMutation(actor, { action: "G02_CHANGE_REQUEST_REJECT", subjectRef: `g02_change_requests:${request.id}` });
    return this.clone(request);
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
    this.audit.recordMutation(actor, {
      action: "G02_CHANGE_REQUEST_REVERSE",
      subjectRef: `g02_change_requests:${request.id}`,
      metadata: { g01SrEventId: reversed.srEventId, ownerModule: "G01" },
    });
    return this.clone(request);
  }

  list(scope: TenantScope): PersonalDetailChangeRequest[] {
    requireTenantScope(scope);
    return this.requests.filter((request) => request.tenantId === scope.tenantId && (!scope.entityId || request.entityId === scope.entityId)).map((request) => this.clone(request));
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
    const request = this.requests.find((item) => item.id === requestId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
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

function sensitivityOf(fieldCode: PersonalDetailFieldCode): "LOW" | "HIGH" {
  return fieldCode === "displayName" ? "LOW" : "HIGH";
}
