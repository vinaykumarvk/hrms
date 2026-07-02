import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { AuditService } from "../../platform/audit/auditService";
import { ActorContext, FoundationError, TenantScope, inScope, nextId, requireTenantScope } from "../../platform/types";
import { ServiceRegisterService } from "../g12/serviceRegisterService";

export interface EmployeeRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  serviceNo: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  employmentStatus: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TRANSFERRED" | "RETIRED" | "RESIGNED" | "DECEASED" | "TERMINATED";
  orgUnitId: string;
  designation?: string;
  dateOfJoining?: string;
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  rowVersion: number;
}

/** FR-EPM-001 create input. Mandatory fields are validated server-side (AC1). */
export interface EmployeeCreateInput {
  firstName: string;
  lastName?: string;
  displayName?: string;
  orgUnitId: string;
  designation?: string;
  dateOfJoining: string;
  serviceNo?: string;
  category?: string;
  pan?: string;
  aadhaarMasked?: string;
}

/** E33 outbox_events row (FR-EPM-001 AC6 / FR-EPM-019 change-feed backbone). Append-only. */
export interface OutboxEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  sequenceNo: number;
  eventType: "PROFILE_CREATED" | "GOVERNED_CHANGE_REQUESTED" | "GOVERNED_CHANGE_APPROVED" | "GOVERNED_CHANGE_REJECTED" | "IDENTITY_CHANGE_COMMITTED";
  aggregateType: "employees" | "governed_changes";
  aggregateId: string;
  employeeId: string;
  eventDate: string;
  payload: Record<string, unknown>;
}

/** FR-EPM-022 governed statutory-field change request (PENDING -> APPROVED | REJECTED). */
export interface GovernedChangeRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  fieldName: "display_name";
  oldValue: string;
  newValue: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  effectiveDate: string;
  expectedRowVersion: number;
  requestedByUserId?: string;
  decidedByUserId?: string;
  decisionReason?: string;
  srEventId?: string;
}

export interface EmployeeProfileView {
  id: string;
  serviceNo: string;
  displayName: string;
  employmentStatus: string;
  orgUnitId: string;
  designation?: string;
  dateOfJoining?: string;
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  rowVersion: number;
}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const SERVICE_NO_PREFIX = "GOV-";

export class EmployeeMasterService {
  private readonly employees: EmployeeRecord[];

  private readonly outboxEvents: OutboxEvent[] = [];

  private readonly governedChanges: GovernedChangeRequest[] = [];

  constructor(
    employees: EmployeeRecord[],
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService
  ) {
    this.employees = employees.map((employee) => ({ ...employee }));
  }

  getById(scope: TenantScope, employeeId: string): EmployeeRecord | null {
    requireTenantScope(scope);
    const employee = this.employees.find((item) => inScope(item, scope) && item.id === employeeId);
    return employee ? { ...employee } : null;
  }

  getByServiceNo(scope: TenantScope, serviceNo: string): EmployeeRecord | null {
    requireTenantScope(scope);
    const employee = this.employees.find((item) => inScope(item, scope) && item.serviceNo === serviceNo);
    return employee ? { ...employee } : null;
  }

  list(scope: TenantScope): EmployeeRecord[] {
    requireTenantScope(scope);
    return this.employees
      .filter((employee) => inScope(employee, scope))
      .sort((left, right) => left.serviceNo.localeCompare(right.serviceNo))
      .map((employee) => ({ ...employee }));
  }

  /**
   * FR-EPM-001 — Create Employee Profile on Hire.
   * AC1 mandatory-field validation, AC2 service_no generation (unique, collision retry),
   * AC6 PROFILE_CREATED written to the outbox in the same unit of work as the master insert:
   * every row is validated and constructed first, then the employee row, the outbox row and the
   * audit entry are committed together — a validation failure leaves no partial state.
   */
  create(actor: ActorContext, input: EmployeeCreateInput): { employee: EmployeeRecord; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.employee.create", actor);
    for (const [field, value] of [
      ["firstName", input.firstName],
      ["orgUnitId", input.orgUnitId],
      ["dateOfJoining", input.dateOfJoining],
    ] as const) {
      if (!value || !value.trim()) {
        throw new FoundationError("VALIDATION_FAILED", `${field} is required`, { field });
      }
    }
    if (input.pan && !PAN_PATTERN.test(input.pan)) {
      // ERR-G01-IDFMT: statutory-ID format failure surfaced under the standard wire code.
      throw new FoundationError("VALIDATION_FAILED", "PAN format is invalid", {
        field: "pan",
        details: { reason: "INVALID_ID", messageId: "ERR-G01-IDFMT" },
      });
    }
    if (input.serviceNo && this.getByServiceNo(actor, input.serviceNo)) {
      throw new FoundationError("CONFLICT", "service_no already exists", {
        field: "serviceNo",
        details: { reason: "DUPLICATE_SERVICE_NO", messageId: "ERR-G01-STATE" },
      });
    }
    const serviceNo = input.serviceNo ?? this.nextServiceNo(actor);
    const employee: EmployeeRecord = {
      id: nextId("emp", this.employees.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      serviceNo,
      displayName: input.displayName ?? [input.firstName, input.lastName].filter(Boolean).join(" "),
      firstName: input.firstName,
      lastName: input.lastName,
      employmentStatus: "ACTIVE",
      orgUnitId: input.orgUnitId,
      designation: input.designation,
      dateOfJoining: input.dateOfJoining,
      pan: input.pan,
      aadhaarMasked: input.aadhaarMasked,
      category: input.category,
      rowVersion: 1,
    };
    // Unit of work: master row + PROFILE_CREATED outbox row + audit committed together (AC6).
    this.employees.push(employee);
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "PROFILE_CREATED",
      aggregateType: "employees",
      aggregateId: employee.id,
      employeeId: employee.id,
      eventDate: input.dateOfJoining,
      payload: { serviceNo: employee.serviceNo, displayName: employee.displayName, orgUnitId: employee.orgUnitId, employmentStatus: employee.employmentStatus },
    });
    this.audit.recordMutation(actor, {
      action: "G01_EMPLOYEE_CREATED",
      subjectRef: `employees:${employee.id}`,
      metadata: { serviceNo: employee.serviceNo, outboxEventId: outboxEvent.id },
    });
    return { employee: { ...employee }, outboxEvent };
  }

  /** Cursor-ordered change feed read model: the outbox rows in append (sequence) order. */
  listChanges(scope: TenantScope): OutboxEvent[] {
    requireTenantScope(scope);
    return this.outboxEvents
      .filter((event) => inScope(event, scope))
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  requestGovernedChange(
    actor: ActorContext,
    input: { employeeId: string; newDisplayName: string; reason: string; effectiveDate: string }
  ): { request: GovernedChangeRequest } {
    this.authz.check(actor, "g01.employee.governed_change", actor);
    if (!input.reason) {
      throw new FoundationError("VALIDATION_FAILED", "Governed change reason is required", { field: "reason" });
    }
    const employee = this.getRequired(actor, input.employeeId);
    const request: GovernedChangeRequest = {
      id: nextId("gcr", this.governedChanges.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: employee.id,
      fieldName: "display_name",
      oldValue: employee.displayName,
      newValue: input.newDisplayName,
      reason: input.reason,
      status: "PENDING",
      effectiveDate: input.effectiveDate,
      expectedRowVersion: employee.rowVersion,
      requestedByUserId: actor.userId,
    };
    this.governedChanges.push(request);
    this.appendOutbox(actor, {
      eventType: "GOVERNED_CHANGE_REQUESTED",
      aggregateType: "governed_changes",
      aggregateId: request.id,
      employeeId: employee.id,
      eventDate: input.effectiveDate,
      payload: { fieldName: request.fieldName, reason: input.reason },
    });
    this.audit.recordMutation(actor, {
      action: "G01_GOVERNED_CHANGE_REQUESTED",
      subjectRef: `governed_changes:${request.id}`,
      metadata: { employeeId: employee.id, reason: input.reason },
    });
    return { request: { ...request } };
  }

  listGovernedChanges(scope: TenantScope, employeeId: string): GovernedChangeRequest[] {
    requireTenantScope(scope);
    return this.governedChanges
      .filter((request) => inScope(request, scope) && request.employeeId === employeeId)
      .map((request) => ({ ...request }));
  }

  /**
   * FR-EPM-022 decision: PENDING -> APPROVED. Applies the governed field change through the same
   * SR-append-first unit of work as governedIdentityChange (ledger row first, master mutation and
   * audit only after the append succeeds), then records the decision and its outbox event.
   */
  approveGovernedChange(
    actor: ActorContext,
    input: { changeId: string; idempotencyKey: string }
  ): { request: GovernedChangeRequest; employee: EmployeeRecord; srEventId: string } {
    this.authz.check(actor, "g01.employee.change.approve", actor);
    const request = this.getMutableGovernedChange(actor, input.changeId);
    this.requirePendingDecision(request);
    const employee = this.getRequired(actor, request.employeeId);
    if (employee.rowVersion !== request.expectedRowVersion) {
      // ERR-G01-STALE: optimistic-lock row_version mismatch between request and master row.
      throw new FoundationError("CONFLICT", "Employee row changed since the governed change was requested", {
        details: { reason: "STALE_VERSION", messageId: "ERR-G01-STALE" },
      });
    }
    const committed = this.commitIdentityChange(actor, {
      employeeId: request.employeeId,
      newDisplayName: request.newValue,
      reason: request.reason,
      idempotencyKey: input.idempotencyKey,
      effectiveDate: request.effectiveDate,
    });
    request.status = "APPROVED";
    request.decidedByUserId = actor.userId;
    request.srEventId = committed.srEventId;
    this.appendOutbox(actor, {
      eventType: "GOVERNED_CHANGE_APPROVED",
      aggregateType: "governed_changes",
      aggregateId: request.id,
      employeeId: request.employeeId,
      eventDate: request.effectiveDate,
      payload: { fieldName: request.fieldName, srEventId: committed.srEventId },
    });
    this.audit.recordMutation(actor, {
      action: "G01_GOVERNED_CHANGE_APPROVED",
      subjectRef: `governed_changes:${request.id}`,
      metadata: { employeeId: request.employeeId, srEventId: committed.srEventId },
    });
    return { request: { ...request }, employee: committed.employee, srEventId: committed.srEventId };
  }

  /** FR-EPM-022 decision: PENDING -> REJECTED with a mandatory decision reason. No master mutation. */
  rejectGovernedChange(
    actor: ActorContext,
    input: { changeId: string; reason: string }
  ): { request: GovernedChangeRequest } {
    this.authz.check(actor, "g01.employee.change.reject", actor);
    if (!input.reason) {
      throw new FoundationError("VALIDATION_FAILED", "Rejection reason is required", { field: "reason" });
    }
    const request = this.getMutableGovernedChange(actor, input.changeId);
    this.requirePendingDecision(request);
    request.status = "REJECTED";
    request.decidedByUserId = actor.userId;
    request.decisionReason = input.reason;
    this.appendOutbox(actor, {
      eventType: "GOVERNED_CHANGE_REJECTED",
      aggregateType: "governed_changes",
      aggregateId: request.id,
      employeeId: request.employeeId,
      eventDate: request.effectiveDate,
      payload: { fieldName: request.fieldName, decisionReason: input.reason },
    });
    this.audit.recordMutation(actor, {
      action: "G01_GOVERNED_CHANGE_REJECTED",
      subjectRef: `governed_changes:${request.id}`,
      metadata: { employeeId: request.employeeId, decisionReason: input.reason },
    });
    return { request: { ...request } };
  }

  readProfile(actor: ActorContext, employeeId: string): EmployeeProfileView {
    this.authz.check(actor, "g01.employee.read", actor);
    const employee = this.getRequired(actor, employeeId);
    this.audit.recordMutation(actor, { action: "G01_EMPLOYEE_READ", subjectRef: `employees:${employeeId}` });
    return this.serializeEmployee(employee, actor);
  }

  governedIdentityChange(
    actor: ActorContext,
    input: { employeeId: string; newDisplayName: string; reason: string; idempotencyKey: string; effectiveDate: string }
  ): { employee: EmployeeRecord; srEventId: string } {
    this.authz.check(actor, "g01.employee.governed_change", actor);
    if (!input.reason) {
      throw new FoundationError("VALIDATION_FAILED", "Governed change reason is required", { field: "reason" });
    }
    return this.commitIdentityChange(actor, input);
  }

  private commitIdentityChange(
    actor: ActorContext,
    input: { employeeId: string; newDisplayName: string; reason: string; idempotencyKey: string; effectiveDate: string }
  ): { employee: EmployeeRecord; srEventId: string } {
    const employee = this.getMutable(actor, input.employeeId);
    // Append the governing SR fact FIRST. The master mutation and its audit are committed only after the
    // ledger append succeeds and is a genuinely new row, so a rejected or deduplicated ingest never leaves
    // the employee record partially mutated without a corresponding SR entry (atomic multi-step write).
    const nextRowVersion = employee.rowVersion + 1;
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G01",
      sourceReferenceId: `employees:${employee.id}:identity`,
      sourceEventVersion: nextRowVersion,
      employeeId: employee.id,
      eventTypeCode: "IDENTITY_CHANGE",
      eventDate: input.effectiveDate,
      factKey: `EMP:${employee.id}|IDENTITY|${input.effectiveDate}`,
      payload: { displayName: input.newDisplayName, reason: input.reason },
      documentIds: [],
    });
    if (!sr.replayed && !sr.semanticDuplicate) {
      employee.displayName = input.newDisplayName;
      employee.rowVersion = nextRowVersion;
      this.appendOutbox(actor, {
        eventType: "IDENTITY_CHANGE_COMMITTED",
        aggregateType: "employees",
        aggregateId: employee.id,
        employeeId: employee.id,
        eventDate: input.effectiveDate,
        payload: { fieldName: "display_name", srEventId: sr.event.id },
      });
      this.audit.recordMutation(actor, {
        action: "G01_GOVERNED_IDENTITY_CHANGE",
        subjectRef: `employees:${employee.id}`,
        metadata: { srEventId: sr.event.id, reason: input.reason },
      });
    }
    return { employee: { ...employee }, srEventId: sr.event.id };
  }

  count(scope: TenantScope): number {
    requireTenantScope(scope);
    return this.employees.filter((employee) => inScope(employee, scope)).length;
  }

  private getRequired(scope: TenantScope, employeeId: string): EmployeeRecord {
    const employee = this.getById(scope, employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    return employee;
  }

  private getMutable(scope: TenantScope, employeeId: string): EmployeeRecord {
    const employee = this.employees.find((item) => inScope(item, scope) && item.id === employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    return employee;
  }

  private getMutableGovernedChange(scope: TenantScope, changeId: string): GovernedChangeRequest {
    const request = this.governedChanges.find((item) => inScope(item, scope) && item.id === changeId);
    if (!request) {
      throw new FoundationError("NOT_FOUND", "Governed change not found");
    }
    return request;
  }

  private requirePendingDecision(request: GovernedChangeRequest): void {
    if (request.status !== "PENDING") {
      // ERR-G01-STATE: request lifecycle conflict — the change has already been decided.
      throw new FoundationError("CONFLICT", `Governed change is already ${request.status}`, {
        details: { reason: "ALREADY_DECIDED", messageId: "ERR-G01-STATE" },
      });
    }
  }

  /** FR-EPM-001 AC2: service_no auto-generated per pattern, unique, server-side collision retry. */
  private nextServiceNo(scope: TenantScope): string {
    let candidate = this.employees
      .filter((employee) => inScope(employee, scope) && employee.serviceNo.startsWith(SERVICE_NO_PREFIX))
      .reduce((max, employee) => {
        const numeric = Number.parseInt(employee.serviceNo.slice(SERVICE_NO_PREFIX.length), 10);
        return Number.isFinite(numeric) && numeric > max ? numeric : max;
      }, 100000);
    let serviceNo = `${SERVICE_NO_PREFIX}${candidate + 1}`;
    while (this.getByServiceNo(scope, serviceNo)) {
      candidate += 1;
      serviceNo = `${SERVICE_NO_PREFIX}${candidate + 1}`;
    }
    return serviceNo;
  }

  private appendOutbox(
    scope: TenantScope,
    input: Omit<OutboxEvent, "id" | "tenantId" | "entityId" | "sequenceNo">
  ): OutboxEvent {
    const event: OutboxEvent = {
      id: nextId("outbox", this.outboxEvents.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      sequenceNo: this.outboxEvents.length + 1,
      ...input,
    };
    this.outboxEvents.push(event);
    return { ...event, payload: { ...event.payload } };
  }

  private serializeEmployee(employee: EmployeeRecord, actor: ActorContext): EmployeeProfileView {
    return {
      id: employee.id,
      serviceNo: employee.serviceNo,
      displayName: employee.displayName,
      employmentStatus: employee.employmentStatus,
      orgUnitId: employee.orgUnitId,
      designation: employee.designation,
      dateOfJoining: employee.dateOfJoining,
      pan: this.authz.canSeeField(actor, "employee.pan") ? employee.pan : "[HIDDEN]",
      aadhaarMasked: this.authz.canSeeField(actor, "employee.aadhaar") ? employee.aadhaarMasked : "[HIDDEN]",
      category: this.authz.canSeeField(actor, "employee.category") ? employee.category : "[HIDDEN]",
      rowVersion: employee.rowVersion,
    };
  }
}
