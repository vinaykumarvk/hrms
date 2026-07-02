import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { AuditService } from "../../platform/audit/auditService";
import { ActorContext, FoundationError, TenantScope, inScope, nextId, requireTenantScope } from "../../platform/types";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { EmployeeProfileRepository, InMemoryEmployeeProfileRepository } from "./employeeProfileRepository";

/** §10.1 record_state machine (FR-EPM-017/018/021). Undefined is read as ACTIVE (pre-PH-16A rows). */
export type EmployeeRecordState = "PROVISIONAL" | "ACTIVE" | "ARCHIVED" | "PURGE_PENDING";

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
  dob?: string;
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  /** FR-EPM-017/018: PROVISIONAL (migration glide path) / ACTIVE / ARCHIVED / PURGE_PENDING. */
  recordState?: EmployeeRecordState;
  /** FR-EPM-018 AC1/AC2 separation fields; FR-EPM-017 AC5 login-disabled PROVISIONAL rows. */
  separationDate?: string;
  separationReason?: string;
  loginDisabled?: boolean;
  /** FR-EPM-017 BR: migrated records carry source_system/legacy_id. */
  sourceSystem?: string;
  legacyId?: string;
  /** FR-EPM-015 AC3: a merged loser is soft-deleted, never hard-removed (alias keeps identity). */
  isDeleted?: boolean;
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
  dob?: string;
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
  eventType:
    | "PROFILE_CREATED"
    | "GOVERNED_CHANGE_REQUESTED"
    | "GOVERNED_CHANGE_APPROVED"
    | "GOVERNED_CHANGE_REJECTED"
    | "IDENTITY_CHANGE_COMMITTED"
    | "POSTING_UPDATED"
    | "CONTACT_UPDATED"
    | "ADDRESS_UPDATED"
    | "DEPENDENT_UPDATED"
    // PH-16A FR-EPM-015 AC4/AC7 + FR-EPM-018 AC3/AC5 change-feed events.
    | "RECORDS_MERGED"
    | "MERGE_UNDONE"
    | "SEPARATION"
    | "DEATH"
    | "REACTIVATION";
  aggregateType: "employees" | "governed_changes" | "employee_contacts" | "employee_addresses" | "employee_dependents" | "employee_id_aliases";
  aggregateId: string;
  employeeId: string;
  eventDate: string;
  payload: Record<string, unknown>;
}

/** E2 employee_contacts satellite row (FR-EPM-003). */
export type ContactType = "MOBILE" | "ALT_MOBILE" | "PERSONAL_EMAIL" | "OFFICIAL_EMAIL" | "LANDLINE";

export interface EmployeeContact {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  contactType: ContactType;
  contactValue: string;
  isPrimary: boolean;
  isVerified: boolean;
  visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "PRIVATE";
  rowVersion: number;
  isDeleted: boolean;
}

/** E3 employee_addresses satellite row (FR-EPM-003, effective-dated). */
export type AddressType = "PERMANENT" | "PRESENT" | "MAILING" | "OVERSEAS";

export interface EmployeeAddress {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  addressType: AddressType;
  line1: string;
  line2?: string;
  city: string;
  district?: string;
  state: string;
  country: string;
  pincode: string;
  isCurrent: boolean;
  validFrom: string;
  validTo?: string;
  rowVersion: number;
  isDeleted: boolean;
}

/** E4 employee_dependents satellite row (FR-EPM-004). */
export type DependentRelationship = "SPOUSE" | "SON" | "DAUGHTER" | "FATHER" | "MOTHER" | "BROTHER" | "SISTER" | "GUARDIAN" | "OTHER";

export interface EmployeeDependent {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  fullName: string;
  relationship: DependentRelationship;
  dob?: string;
  isMinor?: boolean;
  isLegalHeir: boolean;
  heirSuccessionRank?: number;
  nationalIdMasked?: string;
  isDeleted: boolean;
}

/** E23 employee_attribute_history spine row (FR-EPM-011). Append-only; windows close via effective_to. */
export interface EmployeeAttributeHistoryEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  attributePath: string;
  valueText?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  changeReason: "HIRE" | "MARRIAGE" | "GAZETTE" | "COURT_ORDER" | "CORRECTION" | "GENDER_AFFIRMATION" | "MIGRATION";
  source: string;
  governedChangeId?: string;
  recordedBy: string;
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

/** ISO day before a YYYY-MM-DD date (closes the prior effective window without overlap). */
function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** FR-EPM-004 AC1: is_minor derived from dob — under 18 as of the effective date. */
function isMinorAsOf(dobIso: string, asOfIso: string): boolean {
  const dob = new Date(`${dobIso}T00:00:00Z`);
  const asOf = new Date(`${asOfIso}T00:00:00Z`);
  const eighteenth = new Date(dob);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
  return asOf < eighteenth;
}

export class EmployeeMasterService {
  private readonly employees: EmployeeRecord[];

  private readonly governedChanges: GovernedChangeRequest[] = [];

  /**
   * FR-EPM-015 AC4 / FR-EPM-019 AC4: alias-transparent identity resolution. Set by the
   * identity-ops sibling once employee_id_aliases exists; any merged loser_id supplied to a
   * read is collapsed to its ultimate survivor_id before lookup.
   */
  private aliasResolver?: (scope: TenantScope, employeeId: string) => string;

  constructor(
    employees: EmployeeRecord[],
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly repository: EmployeeProfileRepository = new InMemoryEmployeeProfileRepository()
  ) {
    this.employees = employees.map((employee) => ({ ...employee }));
  }

  setAliasResolver(resolver: (scope: TenantScope, employeeId: string) => string): void {
    this.aliasResolver = resolver;
  }

  getById(scope: TenantScope, employeeId: string): EmployeeRecord | null {
    requireTenantScope(scope);
    // Alias-transparent read (FR-EPM-015 AC4): a merged loser_id resolves to the survivor row.
    const resolvedId = this.aliasResolver ? this.aliasResolver(scope, employeeId) : employeeId;
    const employee = this.employees.find((item) => inScope(item, scope) && item.id === resolvedId && !item.isDeleted);
    return employee ? { ...employee } : null;
  }

  getByServiceNo(scope: TenantScope, serviceNo: string): EmployeeRecord | null {
    requireTenantScope(scope);
    const employee = this.employees.find((item) => inScope(item, scope) && item.serviceNo === serviceNo && !item.isDeleted);
    return employee ? { ...employee } : null;
  }

  list(scope: TenantScope): EmployeeRecord[] {
    requireTenantScope(scope);
    return this.employees
      .filter((employee) => inScope(employee, scope) && !employee.isDeleted)
      .sort((left, right) => left.serviceNo.localeCompare(right.serviceNo))
      .map((employee) => ({ ...employee }));
  }

  /**
   * G01-internal seam for the identity-ops sibling (FR-EPM-015/017/018): live mutable master
   * row, optionally including a soft-deleted (merged-loser) row for undo restoration. Never
   * exposed through a route handler.
   */
  getLiveRecordForIdentityOps(scope: TenantScope, employeeId: string, includeDeleted = false): EmployeeRecord | null {
    requireTenantScope(scope);
    const employee = this.employees.find(
      (item) => inScope(item, scope) && item.id === employeeId && (includeDeleted || !item.isDeleted)
    );
    return employee ?? null;
  }

  /** G01-internal seam: scan projection over non-deleted rows (FR-EPM-015 matcher input). */
  listLiveRecordsForIdentityOps(scope: TenantScope): EmployeeRecord[] {
    requireTenantScope(scope);
    return this.employees.filter((item) => inScope(item, scope) && !item.isDeleted);
  }

  /** G01-internal seam: change-feed append for the identity-ops sibling (same outbox backbone). */
  appendChangeFeedEvent(
    scope: TenantScope,
    input: Omit<OutboxEvent, "id" | "tenantId" | "entityId" | "sequenceNo">
  ): OutboxEvent {
    return this.appendOutbox(scope, input);
  }

  /**
   * FR-EPM-017 AC5/AC7 — bulk-import creation path. Unlike create(), MIGRATION-profile rows may
   * arrive without dob/date_of_joining and are committed as record_state=PROVISIONAL with the
   * login disabled; STRICT-valid rows commit as ACTIVE. Every committed record emits
   * PROFILE_CREATED via the outbox in the same unit of work and carries source_system/legacy_id.
   */
  createFromImport(
    actor: ActorContext,
    input: {
      firstName: string;
      lastName?: string;
      displayName?: string;
      orgUnitId: string;
      designation?: string;
      dateOfJoining?: string;
      dob?: string;
      serviceNo?: string;
      category?: string;
      pan?: string;
      recordState: "ACTIVE" | "PROVISIONAL";
      loginDisabled: boolean;
      sourceSystem: string;
      legacyId?: string;
    }
  ): { employee: EmployeeRecord; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.import.commit", actor);
    if (!input.firstName || !input.firstName.trim() || !input.orgUnitId || !input.orgUnitId.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "firstName and orgUnitId are required even under MIGRATION");
    }
    if (input.pan && !PAN_PATTERN.test(input.pan)) {
      throw new FoundationError("VALIDATION_FAILED", "PAN format is invalid", { field: "pan" });
    }
    if (input.serviceNo && this.getByServiceNo(actor, input.serviceNo)) {
      throw new FoundationError("CONFLICT", "service_no already exists", {
        field: "serviceNo",
        details: { reason: "DUPLICATE_SERVICE_NO", messageId: "ERR-G01-STATE" },
      });
    }
    const employee: EmployeeRecord = {
      id: nextId("emp", this.employees.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      serviceNo: input.serviceNo ?? this.nextServiceNo(actor),
      displayName: input.displayName ?? [input.firstName, input.lastName].filter(Boolean).join(" "),
      firstName: input.firstName,
      lastName: input.lastName,
      employmentStatus: "ACTIVE",
      orgUnitId: input.orgUnitId,
      designation: input.designation,
      dateOfJoining: input.dateOfJoining,
      dob: input.dob,
      pan: input.pan,
      category: input.category,
      recordState: input.recordState,
      loginDisabled: input.loginDisabled,
      sourceSystem: input.sourceSystem,
      legacyId: input.legacyId,
      rowVersion: 1,
    };
    this.employees.push(employee);
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "PROFILE_CREATED",
      aggregateType: "employees",
      aggregateId: employee.id,
      employeeId: employee.id,
      eventDate: input.dateOfJoining ?? todayIso(),
      payload: {
        serviceNo: employee.serviceNo,
        displayName: employee.displayName,
        orgUnitId: employee.orgUnitId,
        recordState: employee.recordState,
        sourceSystem: employee.sourceSystem,
      },
    });
    this.audit.recordMutation(actor, {
      action: "G01_EMPLOYEE_IMPORTED",
      subjectRef: `employees:${employee.id}`,
      metadata: { serviceNo: employee.serviceNo, recordState: employee.recordState, outboxEventId: outboxEvent.id },
    });
    return { employee: { ...employee }, outboxEvent };
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
      dob: input.dob,
      pan: input.pan,
      aadhaarMasked: input.aadhaarMasked,
      category: input.category,
      recordState: "ACTIVE",
      rowVersion: 1,
    };
    // Unit of work: master row + HIRE attribute-history seed + PROFILE_CREATED outbox row + audit
    // committed together (AC6 / FR-EPM-011 spine).
    this.employees.push(employee);
    this.appendAttributeHistory(actor, {
      employeeId: employee.id,
      attributePath: "display_name",
      valueText: employee.displayName,
      effectiveFrom: input.dateOfJoining,
      changeReason: "HIRE",
      source: "G01",
    });
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
    return this.repository
      .listOutboxEvents(scope)
      .slice()
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
      governedChangeId: request.id,
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
    input: {
      employeeId: string;
      newDisplayName: string;
      reason: string;
      idempotencyKey: string;
      effectiveDate: string;
      governedChangeId?: string;
    }
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
      // FR-EPM-011 spine: close the open display_name window and append the new version
      // in the same unit of work as the master mutation and its outbox row.
      this.appendAttributeHistory(actor, {
        employeeId: employee.id,
        attributePath: "display_name",
        valueText: input.newDisplayName,
        effectiveFrom: input.effectiveDate,
        changeReason: "CORRECTION",
        source: "G01",
        governedChangeId: input.governedChangeId,
        closePrior: true,
      });
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

  /**
   * G05 FR-G05-010 / POSTING_UPDATE: G01 owns the org-placement change. On a confirmed transfer
   * joining, G05 calls this single authoritative update — the employee's org unit moves to the
   * destination, the row version advances, and the change is outboxed and audited. No other
   * module mutates org placement directly.
   */
  applyTransferPosting(
    actor: ActorContext,
    input: { employeeId: string; toOrgUnitId: string; transferOrderId: string; orderNo: string; effectiveDate: string }
  ): { employee: EmployeeRecord; previousOrgUnitId: string } {
    this.authz.check(actor, "g01.employee.posting.update", actor);
    if (!input.toOrgUnitId || !input.toOrgUnitId.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "toOrgUnitId is required", { field: "toOrgUnitId" });
    }
    const employee = this.getMutable(actor, input.employeeId);
    const previousOrgUnitId = employee.orgUnitId;
    employee.orgUnitId = input.toOrgUnitId;
    employee.rowVersion += 1;
    this.appendOutbox(actor, {
      eventType: "POSTING_UPDATED",
      aggregateType: "employees",
      aggregateId: employee.id,
      employeeId: employee.id,
      eventDate: input.effectiveDate,
      payload: {
        orgUnitId: input.toOrgUnitId,
        previousOrgUnitId,
        transferOrderId: input.transferOrderId,
        orderNo: input.orderNo,
      },
    });
    this.audit.recordMutation(actor, {
      action: "G01_TRANSFER_POSTING_APPLIED",
      subjectRef: `employees:${employee.id}`,
      metadata: {
        transferOrderId: input.transferOrderId,
        orderNo: input.orderNo,
        fromOrgUnitId: previousOrgUnitId,
        toOrgUnitId: input.toOrgUnitId,
        effectiveDate: input.effectiveDate,
      },
    });
    return { employee: { ...employee }, previousOrgUnitId };
  }

  /**
   * FR-EPM-003 — add a contact. Unit of work: optional primary demotion, the
   * employee_contacts insert, the attribute-history append, the CONTACT_UPDATED outbox
   * row (no raw contact value in the payload), and the audit entry commit together.
   */
  addContact(
    actor: ActorContext,
    input: { employeeId: string; contactType: ContactType; contactValue: string; isPrimary?: boolean; visibility?: EmployeeContact["visibility"]; effectiveDate?: string }
  ): { contact: EmployeeContact; historyEntry: EmployeeAttributeHistoryEntry; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.employee.contact.write", actor);
    const employee = this.getRequired(actor, input.employeeId);
    this.validateContactValue(input.contactType, input.contactValue);
    if (input.contactType === "OFFICIAL_EMAIL" && this.repository.findContactByOfficialEmail(actor, input.contactValue)) {
      // r17 / FR-EPM-003 AC7: official email is tenant-unique across non-deleted rows.
      throw new FoundationError("CONFLICT", "official email already in use", {
        field: "contactValue",
        details: { reason: "DUPLICATE_OFFICIAL_EMAIL", messageId: "ERR-G01-STATE" },
      });
    }
    const effectiveDate = input.effectiveDate ?? todayIso();
    // AC2: marking a new primary auto-demotes the previous primary atomically.
    if (input.isPrimary) {
      this.demotePrimaryContact(actor, employee.id, input.contactType);
    }
    const contact: EmployeeContact = {
      id: nextId("cont", this.repository.countContacts()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: employee.id,
      contactType: input.contactType,
      contactValue: input.contactValue,
      isPrimary: Boolean(input.isPrimary),
      isVerified: false,
      visibility: input.visibility ?? "INTERNAL",
      rowVersion: 1,
      isDeleted: false,
    };
    this.repository.insertContact(contact);
    const historyEntry = this.appendAttributeHistory(actor, {
      employeeId: employee.id,
      attributePath: `contact.${input.contactType}`,
      valueText: input.contactValue,
      effectiveFrom: effectiveDate,
      changeReason: "CORRECTION",
      source: "G01",
      closePrior: true,
    });
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "CONTACT_UPDATED",
      aggregateType: "employee_contacts",
      aggregateId: contact.id,
      employeeId: employee.id,
      eventDate: effectiveDate,
      payload: { contactId: contact.id, contactType: contact.contactType, isPrimary: contact.isPrimary },
    });
    this.audit.recordMutation(actor, {
      action: "G01_CONTACT_ADDED",
      subjectRef: `employee_contacts:${contact.id}`,
      metadata: { employeeId: employee.id, contactType: contact.contactType, outboxEventId: outboxEvent.id },
    });
    return { contact: { ...contact }, historyEntry, outboxEvent };
  }

  /** FR-EPM-003 AC8 — optimistic-concurrency contact update (STALE_VERSION 409 on mismatch). */
  updateContact(
    actor: ActorContext,
    input: { employeeId: string; contactId: string; contactValue?: string; isPrimary?: boolean; expectedRowVersion: number; effectiveDate?: string }
  ): { contact: EmployeeContact; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.employee.contact.write", actor);
    const contact = this.repository.findContact(actor, input.contactId);
    if (!contact || contact.employeeId !== input.employeeId) {
      throw new FoundationError("NOT_FOUND", "Contact not found");
    }
    if (contact.rowVersion !== input.expectedRowVersion) {
      throw new FoundationError("CONFLICT", "Contact changed since it was read", {
        details: { reason: "STALE_VERSION", messageId: "ERR-G01-STALE" },
      });
    }
    if (input.contactValue !== undefined) {
      this.validateContactValue(contact.contactType, input.contactValue);
      if (
        contact.contactType === "OFFICIAL_EMAIL" &&
        input.contactValue.toLowerCase() !== contact.contactValue.toLowerCase() &&
        this.repository.findContactByOfficialEmail(actor, input.contactValue)
      ) {
        throw new FoundationError("CONFLICT", "official email already in use", {
          field: "contactValue",
          details: { reason: "DUPLICATE_OFFICIAL_EMAIL", messageId: "ERR-G01-STATE" },
        });
      }
    }
    const effectiveDate = input.effectiveDate ?? todayIso();
    if (input.isPrimary && !contact.isPrimary) {
      this.demotePrimaryContact(actor, contact.employeeId, contact.contactType);
    }
    const valueChanged = input.contactValue !== undefined && input.contactValue !== contact.contactValue;
    const updated: EmployeeContact = {
      ...contact,
      contactValue: input.contactValue ?? contact.contactValue,
      isPrimary: input.isPrimary ?? contact.isPrimary,
      isVerified: valueChanged ? false : contact.isVerified,
      rowVersion: contact.rowVersion + 1,
    };
    this.repository.updateContact(updated);
    if (valueChanged) {
      this.appendAttributeHistory(actor, {
        employeeId: contact.employeeId,
        attributePath: `contact.${contact.contactType}`,
        valueText: updated.contactValue,
        effectiveFrom: effectiveDate,
        changeReason: "CORRECTION",
        source: "G01",
        closePrior: true,
      });
    }
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "CONTACT_UPDATED",
      aggregateType: "employee_contacts",
      aggregateId: updated.id,
      employeeId: updated.employeeId,
      eventDate: effectiveDate,
      payload: { contactId: updated.id, contactType: updated.contactType, isPrimary: updated.isPrimary },
    });
    this.audit.recordMutation(actor, {
      action: "G01_CONTACT_UPDATED",
      subjectRef: `employee_contacts:${updated.id}`,
      metadata: { employeeId: updated.employeeId, outboxEventId: outboxEvent.id },
    });
    return { contact: { ...updated }, outboxEvent };
  }

  /** P02: RESTRICTED/PRIVATE contact values are masked without the employee.contact field grant. */
  listContacts(actor: ActorContext, employeeId: string): EmployeeContact[] {
    this.authz.check(actor, "g01.employee.read", actor);
    return this.repository.listContacts(actor, employeeId).map((contact) => ({
      ...contact,
      contactValue:
        contact.visibility === "RESTRICTED" || contact.visibility === "PRIVATE"
          ? this.authz.canSeeField(actor, "employee.contact")
            ? contact.contactValue
            : "[HIDDEN]"
          : contact.contactValue,
    }));
  }

  /**
   * FR-EPM-003 AC5 — effective-dated address change. Unit of work: the prior current row
   * of the same type is closed (valid_to, is_current=false), the new row opened, the
   * attribute-history window rolled, and the ADDRESS_UPDATED outbox row appended together.
   */
  addAddress(
    actor: ActorContext,
    input: {
      employeeId: string;
      addressType: AddressType;
      line1: string;
      line2?: string;
      city: string;
      district?: string;
      state: string;
      country?: string;
      pincode: string;
      validFrom: string;
    }
  ): { address: EmployeeAddress; historyEntry: EmployeeAttributeHistoryEntry; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.employee.address.write", actor);
    const employee = this.getRequired(actor, input.employeeId);
    for (const [field, value] of [
      ["line1", input.line1],
      ["city", input.city],
      ["state", input.state],
      ["pincode", input.pincode],
      ["validFrom", input.validFrom],
    ] as const) {
      if (!value || !value.trim()) {
        throw new FoundationError("VALIDATION_FAILED", `${field} is required`, { field });
      }
    }
    const country = input.country ?? "India";
    if (country === "India" && !/^[0-9]{6}$/.test(input.pincode)) {
      throw new FoundationError("VALIDATION_FAILED", "pincode must be 6 digits for India", { field: "pincode" });
    }
    if (input.addressType === "OVERSEAS" && country === "India") {
      throw new FoundationError("VALIDATION_FAILED", "OVERSEAS address requires a non-India country", { field: "country" });
    }
    // Close the prior current row of the same type (old row valid_to closed, new row opened).
    const priorValidTo = dayBefore(input.validFrom);
    for (const existing of this.repository.listAddresses(actor, employee.id)) {
      if (existing.addressType === input.addressType && existing.isCurrent) {
        this.repository.updateAddress({ ...existing, isCurrent: false, validTo: priorValidTo, rowVersion: existing.rowVersion + 1 });
      }
    }
    const address: EmployeeAddress = {
      id: nextId("addr", this.repository.countAddresses()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: employee.id,
      addressType: input.addressType,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      district: input.district,
      state: input.state,
      country,
      pincode: input.pincode,
      isCurrent: true,
      validFrom: input.validFrom,
      rowVersion: 1,
      isDeleted: false,
    };
    this.repository.insertAddress(address);
    const historyEntry = this.appendAttributeHistory(actor, {
      employeeId: employee.id,
      attributePath: `address.${input.addressType}`,
      valueText: `${input.line1}, ${input.city}, ${input.state} ${input.pincode}`,
      effectiveFrom: input.validFrom,
      changeReason: "CORRECTION",
      source: "G01",
      closePrior: true,
    });
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "ADDRESS_UPDATED",
      aggregateType: "employee_addresses",
      aggregateId: address.id,
      employeeId: employee.id,
      eventDate: input.validFrom,
      payload: { addressId: address.id, addressType: address.addressType, validFrom: address.validFrom },
    });
    this.audit.recordMutation(actor, {
      action: "G01_ADDRESS_ADDED",
      subjectRef: `employee_addresses:${address.id}`,
      metadata: { employeeId: employee.id, addressType: address.addressType, outboxEventId: outboxEvent.id },
    });
    return { address: { ...address }, historyEntry, outboxEvent };
  }

  listAddresses(actor: ActorContext, employeeId: string): EmployeeAddress[] {
    this.authz.check(actor, "g01.employee.read", actor);
    return this.repository
      .listAddresses(actor, employeeId)
      .slice()
      .sort((left, right) => left.validFrom.localeCompare(right.validFrom))
      .map((address) => ({ ...address }));
  }

  /**
   * FR-EPM-004 — add a dependent. is_minor is derived from dob (AC1); a second active
   * SPOUSE is rejected; the dependent insert, attribute-history append, DEPENDENT_UPDATED
   * outbox row (no national-id in the payload), and audit commit together.
   */
  addDependent(
    actor: ActorContext,
    input: {
      employeeId: string;
      fullName: string;
      relationship: DependentRelationship;
      dob?: string;
      isLegalHeir?: boolean;
      heirSuccessionRank?: number;
      nationalIdMasked?: string;
      effectiveDate?: string;
    }
  ): { dependent: EmployeeDependent; historyEntry: EmployeeAttributeHistoryEntry; outboxEvent: OutboxEvent } {
    this.authz.check(actor, "g01.employee.dependent.write", actor);
    const employee = this.getRequired(actor, input.employeeId);
    if (!input.fullName || !input.fullName.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "fullName is required", { field: "fullName" });
    }
    if (
      input.relationship === "SPOUSE" &&
      this.repository.listDependents(actor, employee.id).some((item) => item.relationship === "SPOUSE")
    ) {
      // BR: one active spouse per employee.
      throw new FoundationError("CONFLICT", "An active spouse is already recorded", {
        field: "relationship",
        details: { reason: "DUPLICATE_SPOUSE", messageId: "ERR-G01-STATE" },
      });
    }
    const effectiveDate = input.effectiveDate ?? todayIso();
    const dependent: EmployeeDependent = {
      id: nextId("dep", this.repository.countDependents()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: employee.id,
      fullName: input.fullName,
      relationship: input.relationship,
      dob: input.dob,
      isMinor: input.dob ? isMinorAsOf(input.dob, effectiveDate) : undefined,
      isLegalHeir: Boolean(input.isLegalHeir),
      heirSuccessionRank: input.heirSuccessionRank,
      nationalIdMasked: input.nationalIdMasked,
      isDeleted: false,
    };
    this.repository.insertDependent(dependent);
    const historyEntry = this.appendAttributeHistory(actor, {
      employeeId: employee.id,
      attributePath: `dependent.${dependent.id}`,
      valueText: `${dependent.fullName} (${dependent.relationship})`,
      effectiveFrom: effectiveDate,
      changeReason: "CORRECTION",
      source: "G01",
    });
    const outboxEvent = this.appendOutbox(actor, {
      eventType: "DEPENDENT_UPDATED",
      aggregateType: "employee_dependents",
      aggregateId: dependent.id,
      employeeId: employee.id,
      eventDate: effectiveDate,
      payload: { dependentId: dependent.id, relationship: dependent.relationship, isLegalHeir: dependent.isLegalHeir },
    });
    this.audit.recordMutation(actor, {
      action: "G01_DEPENDENT_ADDED",
      subjectRef: `employee_dependents:${dependent.id}`,
      metadata: { employeeId: employee.id, relationship: dependent.relationship, outboxEventId: outboxEvent.id },
    });
    return { dependent: this.serializeDependent(dependent, actor, true), historyEntry, outboxEvent };
  }

  /** P02: dependent national-id stays masked without the dedicated field grant. */
  listDependents(actor: ActorContext, employeeId: string): EmployeeDependent[] {
    this.authz.check(actor, "g01.employee.read", actor);
    return this.repository.listDependents(actor, employeeId).map((dependent) => this.serializeDependent(dependent, actor, false));
  }

  /**
   * FR-EPM-011 — chronological attribute-history timeline. P02 masking applies to the
   * values: contact.* windows require the employee.contact field grant.
   */
  listAttributeHistory(actor: ActorContext, employeeId: string): EmployeeAttributeHistoryEntry[] {
    this.authz.check(actor, "g01.employee.read", actor);
    return this.repository
      .listAttributeHistory(actor, employeeId)
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.id.localeCompare(right.id))
      .map((entry) => ({
        ...entry,
        valueText:
          entry.attributePath.startsWith("contact.") && !this.authz.canSeeField(actor, "employee.contact")
            ? "[HIDDEN]"
            : entry.valueText,
      }));
  }

  /** FR-EPM-017 AC5: PROVISIONAL rows (and merged soft-deleted losers) are excluded from active rollups. */
  count(scope: TenantScope): number {
    requireTenantScope(scope);
    return this.employees.filter(
      (employee) => inScope(employee, scope) && !employee.isDeleted && employee.recordState !== "PROVISIONAL"
    ).length;
  }

  private getRequired(scope: TenantScope, employeeId: string): EmployeeRecord {
    const employee = this.getById(scope, employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    return employee;
  }

  private getMutable(scope: TenantScope, employeeId: string): EmployeeRecord {
    const employee = this.employees.find((item) => inScope(item, scope) && item.id === employeeId && !item.isDeleted);
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
    const count = this.repository.countOutboxEvents();
    const event: OutboxEvent = {
      id: nextId("outbox", count),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      sequenceNo: count + 1,
      ...input,
    };
    this.repository.appendOutboxEvent(event);
    return { ...event, payload: { ...event.payload } };
  }

  /**
   * FR-EPM-011 append-only spine write: optionally closes the open window for the
   * attribute path (effective_to = day before the new effective_from), then appends the
   * new history row through the repository.
   */
  private appendAttributeHistory(
    actor: ActorContext,
    input: {
      employeeId: string;
      attributePath: string;
      valueText?: string;
      effectiveFrom: string;
      changeReason: EmployeeAttributeHistoryEntry["changeReason"];
      source: string;
      governedChangeId?: string;
      closePrior?: boolean;
    }
  ): EmployeeAttributeHistoryEntry {
    if (input.closePrior) {
      this.repository.closeAttributeHistory(actor, input.employeeId, input.attributePath, dayBefore(input.effectiveFrom));
    }
    const entry: EmployeeAttributeHistoryEntry = {
      id: nextId("attrh", this.repository.countAttributeHistory()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      attributePath: input.attributePath,
      valueText: input.valueText,
      effectiveFrom: input.effectiveFrom,
      changeReason: input.changeReason,
      source: input.source,
      governedChangeId: input.governedChangeId,
      recordedBy: actor.userId ?? "system",
    };
    this.repository.appendAttributeHistory(entry);
    return { ...entry };
  }

  /** FR-EPM-003 AC2: exactly one primary per (employee, contact_type); demotion bumps row_version. */
  private demotePrimaryContact(scope: TenantScope, employeeId: string, contactType: ContactType): void {
    for (const existing of this.repository.listContacts(scope, employeeId)) {
      if (existing.contactType === contactType && existing.isPrimary) {
        this.repository.updateContact({ ...existing, isPrimary: false, rowVersion: existing.rowVersion + 1 });
      }
    }
  }

  /** FR-EPM-003 AC1: type-specific format validation (phone E.164-ish, email RFC-5322-lite). */
  private validateContactValue(contactType: ContactType, contactValue: string): void {
    if (!contactValue || !contactValue.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "contactValue is required", { field: "contactValue" });
    }
    const isEmailType = contactType === "PERSONAL_EMAIL" || contactType === "OFFICIAL_EMAIL";
    const pattern = isEmailType ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/ : /^\+?[0-9]{8,15}$/;
    if (!pattern.test(contactValue)) {
      throw new FoundationError("VALIDATION_FAILED", `contactValue is not a valid ${contactType}`, {
        field: "contactValue",
        details: { reason: "INVALID_FORMAT", messageId: "ERR-G01-IDFMT" },
      });
    }
  }

  private serializeDependent(dependent: EmployeeDependent, actor: ActorContext, justWritten: boolean): EmployeeDependent {
    return {
      ...dependent,
      nationalIdMasked:
        dependent.nationalIdMasked && !justWritten && !this.authz.canSeeField(actor, "employee.dependent.national_id")
          ? "[HIDDEN]"
          : dependent.nationalIdMasked,
    };
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
