import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { EmployeeMasterService } from "./employeeMasterService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-64A — G01 FR-EPM-006 education register (NET-NEW: new backing, not a route over an existing engine).
 *
 * Single-highest invariant: within one employee, AT MOST ONE ACTIVE education record may carry
 * is_highest=true. The service MAINTAINS the invariant — promoting a record to highest auto-demotes the
 * prior highest in the same unit of work (rather than rejecting), which matches how a "highest qualification"
 * flag is expected to behave. Updates use row_version optimistic locking; deletes are soft (INACTIVE). Audited.
 */

export type EducationStatus = "ACTIVE" | "INACTIVE";
export type GradeType = "CGPA" | "GPA" | "PERCENTAGE" | "GRADE";

/** g01_education — one education record for an employee. */
export interface EducationRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  level: string;
  institution?: string;
  isHighest: boolean;
  isVerified: boolean;
  yearOfPassing?: number;
  gradeType?: GradeType;
  status: EducationStatus;
  rowVersion: number;
}

export interface EducationRepository {
  save(row: EducationRecord): void;
  find(scope: TenantScope, id: string): EducationRecord | undefined;
  listForEmployee(scope: TenantScope, employeeId: string): EducationRecord[];
}

export class InMemoryEducationRepository implements EducationRepository {
  private readonly rows: EducationRecord[] = [];
  private scoped(row: EducationRecord, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: EducationRecord): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row };
    else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): EducationRecord | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForEmployee(scope: TenantScope, employeeId: string): EducationRecord[] {
    return this.rows.filter((r) => this.scoped(r, scope) && r.employeeId === employeeId).map((r) => ({ ...r }));
  }
}

export interface EducationInput {
  level: string;
  institution?: string;
  isHighest?: boolean;
  isVerified?: boolean;
  yearOfPassing?: number;
  gradeType?: GradeType;
}

export class EducationService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: EducationRepository = new InMemoryEducationRepository()
  ) {}

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
    }
  }

  /** Demote every OTHER active is_highest record for the employee, maintaining the single-highest invariant. */
  private demoteOtherHighest(actor: ActorContext, employeeId: string, keepId?: string): void {
    for (const rec of this.repo.listForEmployee(actor, employeeId)) {
      if (rec.status === "ACTIVE" && rec.isHighest && rec.id !== keepId) {
        rec.isHighest = false;
        rec.rowVersion += 1;
        this.repo.save(rec);
      }
    }
  }

  listEducation(scope: TenantScope, employeeId: string): EducationRecord[] {
    requireTenantScope(scope);
    this.requireEmployee(scope, employeeId);
    return this.repo.listForEmployee(scope, employeeId);
  }

  addEducation(actor: ActorContext, employeeId: string, input: EducationInput): EducationRecord {
    this.authorization.check(actor, "g01.education.write", actor);
    this.requireEmployee(actor, employeeId);
    if (!input.level || !input.level.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Education level is required", { field: "level" });
    }
    if (input.yearOfPassing !== undefined && (!Number.isInteger(input.yearOfPassing) || input.yearOfPassing < 1950 || input.yearOfPassing > 2100)) {
      throw new FoundationError("VALIDATION_FAILED", "yearOfPassing must be between 1950 and 2100", { field: "yearOfPassing" });
    }
    const isHighest = Boolean(input.isHighest);
    if (isHighest) {
      this.demoteOtherHighest(actor, employeeId);
    }
    const record: EducationRecord = {
      id: nextId("g01-education", this.counter++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId,
      level: input.level,
      institution: input.institution,
      isHighest,
      isVerified: Boolean(input.isVerified),
      yearOfPassing: input.yearOfPassing,
      gradeType: input.gradeType,
      status: "ACTIVE",
      rowVersion: 1,
    };
    this.repo.save(record);
    this.audit.recordMutation(actor, {
      action: "G01_EDUCATION_ADDED",
      subjectRef: `g01_education:${record.id}`,
      metadata: { employeeId, level: record.level, isHighest: record.isHighest },
    });
    return { ...record };
  }

  updateEducation(
    actor: ActorContext,
    educationId: string,
    input: { rowVersion: number; level?: string; institution?: string; isHighest?: boolean; isVerified?: boolean; yearOfPassing?: number; gradeType?: GradeType }
  ): EducationRecord {
    this.authorization.check(actor, "g01.education.write", actor);
    const record = this.repo.find(actor, educationId);
    if (!record || record.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Education record not found");
    }
    if (input.rowVersion !== record.rowVersion) {
      throw new FoundationError("CONFLICT", "Education row_version is stale (optimistic lock)", {
        details: { expected: record.rowVersion, received: input.rowVersion },
      });
    }
    if (input.level !== undefined) {
      if (!input.level.trim()) throw new FoundationError("VALIDATION_FAILED", "level may not be blank", { field: "level" });
      record.level = input.level;
    }
    if (input.institution !== undefined) record.institution = input.institution;
    if (input.isVerified !== undefined) record.isVerified = input.isVerified;
    if (input.yearOfPassing !== undefined) {
      if (!Number.isInteger(input.yearOfPassing) || input.yearOfPassing < 1950 || input.yearOfPassing > 2100) {
        throw new FoundationError("VALIDATION_FAILED", "yearOfPassing must be between 1950 and 2100", { field: "yearOfPassing" });
      }
      record.yearOfPassing = input.yearOfPassing;
    }
    if (input.gradeType !== undefined) record.gradeType = input.gradeType;
    if (input.isHighest === true && !record.isHighest) {
      this.demoteOtherHighest(actor, record.employeeId, record.id);
      record.isHighest = true;
    } else if (input.isHighest === false) {
      record.isHighest = false;
    }
    record.rowVersion += 1;
    this.repo.save(record);
    this.audit.recordMutation(actor, { action: "G01_EDUCATION_UPDATED", subjectRef: `g01_education:${record.id}`, metadata: { rowVersion: record.rowVersion, isHighest: record.isHighest } });
    return { ...record };
  }

  /** Soft-delete: status INACTIVE; the statutory education row is retained. */
  removeEducation(actor: ActorContext, educationId: string): void {
    this.authorization.check(actor, "g01.education.write", actor);
    const record = this.repo.find(actor, educationId);
    if (!record || record.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Education record not found");
    }
    record.status = "INACTIVE";
    record.isHighest = false;
    record.rowVersion += 1;
    this.repo.save(record);
    this.audit.recordMutation(actor, { action: "G01_EDUCATION_REMOVED", subjectRef: `g01_education:${record.id}` });
  }
}
