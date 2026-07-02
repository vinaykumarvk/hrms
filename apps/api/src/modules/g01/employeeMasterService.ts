import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { AuditService } from "../../platform/audit/auditService";
import { ActorContext, FoundationError, TenantScope, inScope, requireTenantScope } from "../../platform/types";
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
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  rowVersion: number;
}

export interface EmployeeProfileView {
  id: string;
  serviceNo: string;
  displayName: string;
  employmentStatus: string;
  orgUnitId: string;
  designation?: string;
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  rowVersion: number;
}

export class EmployeeMasterService {
  private readonly employees: EmployeeRecord[];

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

  private serializeEmployee(employee: EmployeeRecord, actor: ActorContext): EmployeeProfileView {
    return {
      id: employee.id,
      serviceNo: employee.serviceNo,
      displayName: employee.displayName,
      employmentStatus: employee.employmentStatus,
      orgUnitId: employee.orgUnitId,
      designation: employee.designation,
      pan: this.authz.canSeeField(actor, "employee.pan") ? employee.pan : "[HIDDEN]",
      aadhaarMasked: this.authz.canSeeField(actor, "employee.aadhaar") ? employee.aadhaarMasked : "[HIDDEN]",
      category: this.authz.canSeeField(actor, "employee.category") ? employee.category : "[HIDDEN]",
      rowVersion: employee.rowVersion,
    };
  }
}
