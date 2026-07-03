import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { EmployeeMasterService } from "./employeeMasterService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-63A — G01 FR-EPM-005 emergency-contact register (NET-NEW: new backing, not a route over an existing
 * engine). Each contact has a call-order `priority` (1 = call first). Invariant: within one employee, the
 * ACTIVE contacts hold DISTINCT priorities (a duplicate priority is a CONFLICT). Updates use row_version
 * optimistic locking; deletes are soft (status=INACTIVE) so the freed priority can be reused. Audited (P05).
 */

export type EmergencyContactStatus = "ACTIVE" | "INACTIVE";

/** g01_emergency_contacts — one call-order contact line for an employee. */
export interface EmergencyContact {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  name: string;
  phone: string;
  priority: number;
  status: EmergencyContactStatus;
  rowVersion: number;
}

export interface EmergencyContactRepository {
  save(row: EmergencyContact): void;
  find(scope: TenantScope, id: string): EmergencyContact | undefined;
  listForEmployee(scope: TenantScope, employeeId: string): EmergencyContact[];
}

export class InMemoryEmergencyContactRepository implements EmergencyContactRepository {
  private readonly rows: EmergencyContact[] = [];
  private scoped(row: EmergencyContact, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: EmergencyContact): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row };
    else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): EmergencyContact | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForEmployee(scope: TenantScope, employeeId: string): EmergencyContact[] {
    return this.rows.filter((r) => this.scoped(r, scope) && r.employeeId === employeeId).map((r) => ({ ...r }));
  }
}

export interface EmergencyContactInput {
  name: string;
  phone: string;
  priority: number;
}

export class EmergencyContactService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: EmergencyContactRepository = new InMemoryEmergencyContactRepository()
  ) {}

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
    }
  }

  private assertPriority(priority: number): void {
    if (!Number.isInteger(priority) || priority <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "priority must be a positive integer (1 = call first)", { field: "priority" });
    }
  }

  /** Reject a priority already held by another ACTIVE contact of the same employee. */
  private assertPriorityFree(scope: TenantScope, employeeId: string, priority: number, excludeId?: string): void {
    const clash = this.repo
      .listForEmployee(scope, employeeId)
      .some((c) => c.status === "ACTIVE" && c.priority === priority && c.id !== excludeId);
    if (clash) {
      throw new FoundationError("CONFLICT", "Another active emergency contact already holds this priority", {
        field: "priority",
        details: { employeeId, priority },
      });
    }
  }

  listEmergencyContacts(scope: TenantScope, employeeId: string): EmergencyContact[] {
    requireTenantScope(scope);
    this.requireEmployee(scope, employeeId);
    return this.repo.listForEmployee(scope, employeeId).sort((a, b) => a.priority - b.priority);
  }

  addEmergencyContact(actor: ActorContext, employeeId: string, input: EmergencyContactInput): EmergencyContact {
    this.authorization.check(actor, "g01.emergency_contact.write", actor);
    this.requireEmployee(actor, employeeId);
    if (!input.name || !input.name.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Emergency contact name is required", { field: "name" });
    }
    if (!input.phone || !input.phone.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Emergency contact phone is required", { field: "phone" });
    }
    this.assertPriority(input.priority);
    this.assertPriorityFree(actor, employeeId, input.priority);
    const contact: EmergencyContact = {
      id: nextId("g01-emergency-contact", this.counter++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId,
      name: input.name,
      phone: input.phone,
      priority: input.priority,
      status: "ACTIVE",
      rowVersion: 1,
    };
    this.repo.save(contact);
    this.audit.recordMutation(actor, {
      action: "G01_EMERGENCY_CONTACT_ADDED",
      subjectRef: `g01_emergency_contacts:${contact.id}`,
      metadata: { employeeId, priority: contact.priority },
    });
    return { ...contact };
  }

  updateEmergencyContact(
    actor: ActorContext,
    contactId: string,
    input: { rowVersion: number; name?: string; phone?: string; priority?: number }
  ): EmergencyContact {
    this.authorization.check(actor, "g01.emergency_contact.write", actor);
    const contact = this.repo.find(actor, contactId);
    if (!contact || contact.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Emergency contact not found");
    }
    if (input.rowVersion !== contact.rowVersion) {
      throw new FoundationError("CONFLICT", "Emergency contact row_version is stale (optimistic lock)", {
        details: { expected: contact.rowVersion, received: input.rowVersion },
      });
    }
    if (input.priority !== undefined) {
      this.assertPriority(input.priority);
      this.assertPriorityFree(actor, contact.employeeId, input.priority, contact.id);
      contact.priority = input.priority;
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new FoundationError("VALIDATION_FAILED", "name may not be blank", { field: "name" });
      contact.name = input.name;
    }
    if (input.phone !== undefined) {
      if (!input.phone.trim()) throw new FoundationError("VALIDATION_FAILED", "phone may not be blank", { field: "phone" });
      contact.phone = input.phone;
    }
    contact.rowVersion += 1;
    this.repo.save(contact);
    this.audit.recordMutation(actor, { action: "G01_EMERGENCY_CONTACT_UPDATED", subjectRef: `g01_emergency_contacts:${contact.id}`, metadata: { rowVersion: contact.rowVersion } });
    return { ...contact };
  }

  /** Soft-delete: status INACTIVE frees the priority for reuse; the row is retained. */
  removeEmergencyContact(actor: ActorContext, contactId: string): void {
    this.authorization.check(actor, "g01.emergency_contact.write", actor);
    const contact = this.repo.find(actor, contactId);
    if (!contact || contact.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Emergency contact not found");
    }
    contact.status = "INACTIVE";
    contact.rowVersion += 1;
    this.repo.save(contact);
    this.audit.recordMutation(actor, { action: "G01_EMERGENCY_CONTACT_REMOVED", subjectRef: `g01_emergency_contacts:${contact.id}` });
  }
}
