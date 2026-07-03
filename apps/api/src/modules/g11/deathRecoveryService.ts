import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-24A — G11 proactive death detection and overpayment recovery at BRD depth
 * (docs/brd/v3/G11-retirement-and-pension.md FR-20):
 *
 * - A death-registry reconciliation flags a pensioner DECEASED and SUSPENDS pension disbursement;
 *   payments made after the recorded date of death are overpayments.
 * - overpayment_recoveries schedule recovery of the overpaid amount from the estate / arrears of the
 *   family pension. Recovery is bounded — the scheduled recovery may not exceed the outstanding
 *   overpayment (no over-recovery), and once fully recovered the case is CLOSED.
 *
 * Money is integer paise.
 */

export type PensionerVitalStatus = "ALIVE" | "DECEASED";
export type RecoveryStatus = "OPEN" | "PARTIALLY_RECOVERED" | "CLOSED";

/** A pensioner vital record with a death-registry marker. */
export interface PensionerVitalRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  pensionerId: string;
  status: PensionerVitalStatus;
  dateOfDeath?: string;
  disbursementSuspended: boolean;
}

/** overpayment_recoveries — a recovery schedule for a post-death overpayment. */
export interface OverpaymentRecovery {
  id: string;
  tenantId: string;
  entityId?: string;
  pensionerId: string;
  overpaidPaise: number;
  recoveredPaise: number;
  recoverFrom: "ESTATE" | "FAMILY_PENSION_ARREARS";
  status: RecoveryStatus;
}

export interface DeathRecoveryRepository {
  saveVital(row: PensionerVitalRecord): void;
  findVital(scope: TenantScope, pensionerId: string): PensionerVitalRecord | undefined;
  saveRecovery(row: OverpaymentRecovery): void;
  findRecovery(scope: TenantScope, id: string): OverpaymentRecovery | undefined;
}

export class InMemoryDeathRecoveryRepository implements DeathRecoveryRepository {
  private readonly vitals: PensionerVitalRecord[] = [];
  private readonly recoveries: OverpaymentRecovery[] = [];
  private scoped<T extends { tenantId: string; entityId?: string }>(row: T, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  saveVital(row: PensionerVitalRecord): void {
    const i = this.vitals.findIndex((v) => v.pensionerId === row.pensionerId);
    if (i >= 0) this.vitals[i] = { ...row }; else this.vitals.push({ ...row });
  }
  findVital(scope: TenantScope, pensionerId: string): PensionerVitalRecord | undefined {
    const row = this.vitals.find((v) => v.pensionerId === pensionerId);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  saveRecovery(row: OverpaymentRecovery): void {
    const i = this.recoveries.findIndex((r) => r.id === row.id);
    if (i >= 0) this.recoveries[i] = { ...row }; else this.recoveries.push({ ...row });
  }
  findRecovery(scope: TenantScope, id: string): OverpaymentRecovery | undefined {
    const row = this.recoveries.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

export class DeathRecoveryService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: DeathRecoveryRepository = new InMemoryDeathRecoveryRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Death-registry reconciliation: mark DECEASED and suspend disbursement. */
  reconcileDeath(actor: ActorContext, input: { pensionerId: string; dateOfDeath: string }): PensionerVitalRecord {
    this.authorization.check(actor, "g11.death.reconcile", actor);
    const vital: PensionerVitalRecord = {
      id: this.next("g11-pensioner-vital"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerId: input.pensionerId,
      status: "DECEASED",
      dateOfDeath: input.dateOfDeath,
      disbursementSuspended: true,
    };
    this.repo.saveVital(vital);
    this.audit.recordMutation(actor, {
      action: "G11_DEATH_RECONCILED",
      subjectRef: `pensioner_vital:${vital.id}`,
      metadata: { dateOfDeath: vital.dateOfDeath, disbursementSuspended: true },
    });
    return { ...vital };
  }

  /** Open an overpayment recovery for payments made after death. */
  openOverpaymentRecovery(
    actor: ActorContext,
    input: { pensionerId: string; overpaidPaise: number; recoverFrom: "ESTATE" | "FAMILY_PENSION_ARREARS" }
  ): OverpaymentRecovery {
    this.authorization.check(actor, "g11.overpayment.open", actor);
    const vital = this.repo.findVital(actor, input.pensionerId);
    if (!vital || vital.status !== "DECEASED") {
      throw new FoundationError("PRECONDITION_FAILED", "An overpayment recovery requires a DECEASED pensioner record");
    }
    if (!Number.isInteger(input.overpaidPaise) || input.overpaidPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "overpaidPaise must be a positive integer", { field: "overpaidPaise" });
    }
    const recovery: OverpaymentRecovery = {
      id: this.next("g11-overpayment-recovery"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerId: input.pensionerId,
      overpaidPaise: input.overpaidPaise,
      recoveredPaise: 0,
      recoverFrom: input.recoverFrom,
      status: "OPEN",
    };
    this.repo.saveRecovery(recovery);
    this.audit.recordMutation(actor, {
      action: "G11_OVERPAYMENT_OPENED",
      subjectRef: `overpayment_recoveries:${recovery.id}`,
      metadata: { overpaidPaise: recovery.overpaidPaise, recoverFrom: recovery.recoverFrom },
    });
    return { ...recovery };
  }

  /** Record a recovery instalment. Over-recovery beyond the outstanding amount is rejected. */
  recordRecovery(actor: ActorContext, recoveryId: string, input: { amountPaise: number }): OverpaymentRecovery {
    this.authorization.check(actor, "g11.overpayment.recover", actor);
    const recovery = this.require(actor, recoveryId);
    if (recovery.status === "CLOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "Recovery is already CLOSED");
    }
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "amountPaise must be a positive integer", { field: "amountPaise" });
    }
    const outstanding = recovery.overpaidPaise - recovery.recoveredPaise;
    if (input.amountPaise > outstanding) {
      throw new FoundationError("PRECONDITION_FAILED", "Recovery would exceed the outstanding overpayment (over-recovery barred)", {
        details: { amountPaise: input.amountPaise, outstanding },
      });
    }
    recovery.recoveredPaise += input.amountPaise;
    recovery.status = recovery.recoveredPaise === recovery.overpaidPaise ? "CLOSED" : "PARTIALLY_RECOVERED";
    this.repo.saveRecovery(recovery);
    this.audit.recordMutation(actor, {
      action: "G11_OVERPAYMENT_RECOVERED",
      subjectRef: `overpayment_recoveries:${recovery.id}`,
      metadata: { recoveredPaise: recovery.recoveredPaise, status: recovery.status },
    });
    return { ...recovery };
  }

  getVital(scope: TenantScope, pensionerId: string): PensionerVitalRecord | undefined {
    requireTenantScope(scope);
    return this.repo.findVital(scope, pensionerId);
  }

  private require(scope: TenantScope, id: string): OverpaymentRecovery {
    const row = this.repo.findRecovery(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Overpayment recovery not found");
    return row;
  }
}
