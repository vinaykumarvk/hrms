import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { EmployeeMasterService } from "./employeeMasterService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-62A — G01 FR-EPM-004 nominee register (NET-NEW: new backing, not a route over an existing engine).
 *
 * A nominee names who receives a statutory benefit (e.g. GRATUITY, GPF, FAMILY_PENSION) and the share of
 * that benefit. VAL-NOMINEE: the ACTIVE nominee shares for one employee + benefit_type may not exceed 100.
 * Updates use row_version optimistic locking; deletes are soft (status=INACTIVE) so the statutory trail
 * is never destroyed. Every mutation is audited (P05).
 */

export type NomineeStatus = "ACTIVE" | "INACTIVE";

/** g01_nominees — one nominee line for an employee + benefit type. */
export interface Nominee {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  name: string;
  benefitType: string;
  sharePct: number;
  guardian?: string;
  isFamilyPensionRecipient: boolean;
  status: NomineeStatus;
  rowVersion: number;
}

export interface NomineeRepository {
  save(row: Nominee): void;
  find(scope: TenantScope, id: string): Nominee | undefined;
  listForEmployee(scope: TenantScope, employeeId: string): Nominee[];
}

export class InMemoryNomineeRepository implements NomineeRepository {
  private readonly rows: Nominee[] = [];
  private scoped(row: Nominee, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: Nominee): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row };
    else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): Nominee | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForEmployee(scope: TenantScope, employeeId: string): Nominee[] {
    return this.rows.filter((r) => this.scoped(r, scope) && r.employeeId === employeeId).map((r) => ({ ...r }));
  }
}

export interface NomineeInput {
  name: string;
  benefitType: string;
  sharePct: number;
  guardian?: string;
  isFamilyPensionRecipient?: boolean;
}

export class NomineeService {
  private counter = 0;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: NomineeRepository = new InMemoryNomineeRepository()
  ) {}

  private requireEmployee(scope: TenantScope, employeeId: string): void {
    if (!this.employeeMaster.getById(scope, employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
    }
  }

  private assertSharePct(sharePct: number): void {
    if (typeof sharePct !== "number" || Number.isNaN(sharePct) || sharePct <= 0 || sharePct > 100) {
      throw new FoundationError("VALIDATION_FAILED", "share_pct must be a number in (0, 100]", { field: "sharePct" });
    }
  }

  /** ACTIVE share total for an employee + benefit type, optionally excluding one nominee (for updates). */
  private activeShareTotal(scope: TenantScope, employeeId: string, benefitType: string, excludeId?: string): number {
    return this.repo
      .listForEmployee(scope, employeeId)
      .filter((n) => n.status === "ACTIVE" && n.benefitType === benefitType && n.id !== excludeId)
      .reduce((sum, n) => sum + n.sharePct, 0);
  }

  listNominees(scope: TenantScope, employeeId: string): Nominee[] {
    requireTenantScope(scope);
    this.requireEmployee(scope, employeeId);
    return this.repo.listForEmployee(scope, employeeId);
  }

  addNominee(actor: ActorContext, employeeId: string, input: NomineeInput): Nominee {
    this.authorization.check(actor, "g01.nominee.write", actor);
    this.requireEmployee(actor, employeeId);
    if (!input.name || !input.name.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Nominee name is required", { field: "name" });
    }
    if (!input.benefitType || !input.benefitType.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "benefit_type is required", { field: "benefitType" });
    }
    this.assertSharePct(input.sharePct);
    const total = this.activeShareTotal(actor, employeeId, input.benefitType) + input.sharePct;
    if (total > 100) {
      throw new FoundationError("VAL-NOMINEE", "Nominee shares for a benefit type may not exceed 100", {
        field: "sharePct",
        details: { benefitType: input.benefitType, attemptedTotal: total },
      });
    }
    const nominee: Nominee = {
      id: nextId("g01-nominee", this.counter++),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId,
      name: input.name,
      benefitType: input.benefitType,
      sharePct: input.sharePct,
      guardian: input.guardian,
      isFamilyPensionRecipient: Boolean(input.isFamilyPensionRecipient),
      status: "ACTIVE",
      rowVersion: 1,
    };
    this.repo.save(nominee);
    this.audit.recordMutation(actor, {
      action: "G01_NOMINEE_ADDED",
      subjectRef: `g01_nominees:${nominee.id}`,
      metadata: { employeeId, benefitType: nominee.benefitType, sharePct: nominee.sharePct },
    });
    return { ...nominee };
  }

  /** Optimistic-locked update; a share change is re-validated against the benefit-type total (VAL-NOMINEE). */
  updateNominee(
    actor: ActorContext,
    nomineeId: string,
    input: { rowVersion: number; sharePct?: number; guardian?: string; isFamilyPensionRecipient?: boolean }
  ): Nominee {
    this.authorization.check(actor, "g01.nominee.write", actor);
    const nominee = this.repo.find(actor, nomineeId);
    if (!nominee || nominee.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Nominee not found");
    }
    if (input.rowVersion !== nominee.rowVersion) {
      throw new FoundationError("CONFLICT", "Nominee row_version is stale (optimistic lock)", {
        details: { expected: nominee.rowVersion, received: input.rowVersion },
      });
    }
    if (input.sharePct !== undefined) {
      this.assertSharePct(input.sharePct);
      const total = this.activeShareTotal(actor, nominee.employeeId, nominee.benefitType, nominee.id) + input.sharePct;
      if (total > 100) {
        throw new FoundationError("VAL-NOMINEE", "Nominee shares for a benefit type may not exceed 100", {
          field: "sharePct",
          details: { benefitType: nominee.benefitType, attemptedTotal: total },
        });
      }
      nominee.sharePct = input.sharePct;
    }
    if (input.guardian !== undefined) nominee.guardian = input.guardian;
    if (input.isFamilyPensionRecipient !== undefined) nominee.isFamilyPensionRecipient = input.isFamilyPensionRecipient;
    nominee.rowVersion += 1;
    this.repo.save(nominee);
    this.audit.recordMutation(actor, { action: "G01_NOMINEE_UPDATED", subjectRef: `g01_nominees:${nominee.id}`, metadata: { rowVersion: nominee.rowVersion } });
    return { ...nominee };
  }

  /** Soft-delete: the nominee moves to INACTIVE and frees its share; the statutory row is retained. */
  removeNominee(actor: ActorContext, nomineeId: string): void {
    this.authorization.check(actor, "g01.nominee.write", actor);
    const nominee = this.repo.find(actor, nomineeId);
    if (!nominee || nominee.status !== "ACTIVE") {
      throw new FoundationError("NOT_FOUND", "Nominee not found");
    }
    nominee.status = "INACTIVE";
    nominee.rowVersion += 1;
    this.repo.save(nominee);
    this.audit.recordMutation(actor, { action: "G01_NOMINEE_REMOVED", subjectRef: `g01_nominees:${nominee.id}` });
  }
}
