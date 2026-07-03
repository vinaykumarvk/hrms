import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-17C — G09 vigilance and sealed-cover register at BRD depth
 * (docs/brd/v3/G09-disciplinary-cases-punishment.md FR-015):
 *
 * - vigilance_records: a per-employee vigilance status with clearance_status transitions
 *   (PENDING -> CLEARED / NOT_CLEARED), an integrity_grade, and a sealed_cover flag set when a
 *   disciplinary/vigilance case is in progress.
 * - A vigilance clearance lookup (consumed by G06 promotion and G11 pension) returns cleared=false
 *   whenever the status is NOT_CLEARED or a sealed_cover is in force; asserting clearance in that
 *   state fails closed.
 */

export type ClearanceStatus = "PENDING" | "CLEARED" | "NOT_CLEARED";
export type IntegrityGrade = "INTEGRITY_BEYOND_DOUBT" | "INTEGRITY_DOUBTFUL" | "NOT_ASSESSED";

/** vigilance_records — the authoritative vigilance status for an employee. */
export interface VigilanceRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  clearanceStatus: ClearanceStatus;
  integrityGrade: IntegrityGrade;
  sealedCover: boolean;
  reason?: string;
}

/** The lookup projection consumed by promotion/pension when deciding eligibility. */
export interface VigilanceClearanceLookup {
  employeeId: string;
  cleared: boolean;
  clearanceStatus: ClearanceStatus;
  sealedCover: boolean;
  integrityGrade: IntegrityGrade;
}

export interface VigilanceRegisterRepository {
  saveRecord(row: VigilanceRecord): void;
  findByEmployee(scope: TenantScope, employeeId: string): VigilanceRecord | undefined;
}

export class InMemoryVigilanceRegisterRepository implements VigilanceRegisterRepository {
  private readonly records: VigilanceRecord[] = [];
  private scoped(row: VigilanceRecord, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveRecord(row: VigilanceRecord): void {
    const i = this.records.findIndex((r) => r.employeeId === row.employeeId && r.tenantId === row.tenantId);
    if (i >= 0) this.records[i] = { ...row }; else this.records.push({ ...row });
  }
  findByEmployee(scope: TenantScope, employeeId: string): VigilanceRecord | undefined {
    const row = this.records.find((r) => r.employeeId === employeeId);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

export class VigilanceRegisterService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: VigilanceRegisterRepository = new InMemoryVigilanceRegisterRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Open or refresh a vigilance record (PENDING by default). */
  upsertVigilance(
    actor: ActorContext,
    input: { employeeId: string; integrityGrade?: IntegrityGrade }
  ): VigilanceRecord {
    this.authorization.check(actor, "g09.vigilance.write", actor);
    const existing = this.repo.findByEmployee(actor, input.employeeId);
    const record: VigilanceRecord = existing ?? {
      id: this.next("g09-vigilance"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      clearanceStatus: "PENDING",
      integrityGrade: input.integrityGrade ?? "NOT_ASSESSED",
      sealedCover: false,
    };
    if (input.integrityGrade) record.integrityGrade = input.integrityGrade;
    this.repo.saveRecord(record);
    this.audit.recordMutation(actor, {
      action: "G09_VIGILANCE_UPSERT",
      subjectRef: `vigilance_records:${record.id}`,
      metadata: { clearance_status: record.clearanceStatus, integrity_grade: record.integrityGrade },
    });
    return { ...record };
  }

  /** Placing a sealed cover forces the record NOT_CLEARED for eligibility purposes. */
  placeSealedCover(actor: ActorContext, employeeId: string, input: { reason: string }): VigilanceRecord {
    this.authorization.check(actor, "g09.vigilance.sealcover", actor);
    const record = this.requireRecord(actor, employeeId);
    record.sealedCover = true;
    record.clearanceStatus = "NOT_CLEARED";
    record.reason = input.reason;
    this.repo.saveRecord(record);
    this.audit.recordMutation(actor, {
      action: "G09_VIGILANCE_SEALED_COVER",
      subjectRef: `vigilance_records:${record.id}`,
      metadata: { sealed_cover: true },
    });
    return { ...record };
  }

  /** Record a clearance decision. CLEARED requires no sealed cover in force. */
  decideClearance(
    actor: ActorContext,
    employeeId: string,
    input: { decision: "CLEARED" | "NOT_CLEARED"; integrityGrade: IntegrityGrade; reason?: string }
  ): VigilanceRecord {
    this.authorization.check(actor, "g09.vigilance.decide", actor);
    const record = this.requireRecord(actor, employeeId);
    if (input.decision === "CLEARED" && record.sealedCover) {
      throw new FoundationError("PRECONDITION_FAILED", "Cannot clear an employee while a sealed cover is in force");
    }
    record.clearanceStatus = input.decision;
    record.integrityGrade = input.integrityGrade;
    record.reason = input.reason;
    this.repo.saveRecord(record);
    this.audit.recordMutation(actor, {
      action: "G09_VIGILANCE_CLEARANCE_DECIDED",
      subjectRef: `vigilance_records:${record.id}`,
      metadata: { clearance_status: record.clearanceStatus },
    });
    return { ...record };
  }

  /** Vigilance clearance lookup — cleared=false when NOT_CLEARED or a sealed cover is in force. */
  clearanceLookup(scope: TenantScope, employeeId: string): VigilanceClearanceLookup {
    requireTenantScope(scope);
    const record = this.repo.findByEmployee(scope, employeeId);
    if (!record) {
      // No record => not yet assessed => not cleared (fail closed).
      return { employeeId, cleared: false, clearanceStatus: "PENDING", sealedCover: false, integrityGrade: "NOT_ASSESSED" };
    }
    const cleared = record.clearanceStatus === "CLEARED" && !record.sealedCover;
    return {
      employeeId,
      cleared,
      clearanceStatus: record.clearanceStatus,
      sealedCover: record.sealedCover,
      integrityGrade: record.integrityGrade,
    };
  }

  /** Fail-closed gate for callers (promotion/pension): throws unless the employee is cleared. */
  assertClearedForPromotion(scope: TenantScope, employeeId: string): void {
    const lookup = this.clearanceLookup(scope, employeeId);
    if (!lookup.cleared) {
      throw new FoundationError("PRECONDITION_FAILED", "Vigilance clearance is NOT_CLEARED (or a sealed cover is in force)", {
        details: { employeeId, clearanceStatus: lookup.clearanceStatus, sealedCover: lookup.sealedCover },
      });
    }
  }

  private requireRecord(scope: TenantScope, employeeId: string): VigilanceRecord {
    const record = this.repo.findByEmployee(scope, employeeId);
    if (!record) throw new FoundationError("NOT_FOUND", "Vigilance record not found");
    return record;
  }
}
