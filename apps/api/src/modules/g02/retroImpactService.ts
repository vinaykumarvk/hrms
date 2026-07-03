import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-25B — G02 retro-impact downstream fan-out at BRD depth
 * (docs/brd/v3/G02-personal-details-modification-workflow.md FR-022):
 *
 * - When an approved change is effective-dated in the past, it fans out a retro_impact_events row to
 *   each affected downstream target (G10 payroll, G11 pension, G06 promotion).
 * - Each event dispatches idempotently through PENDING -> SENT -> ACKED; a retryable failure retries
 *   up to a cap and, on exhaustion, DEAD_LETTERs so nothing is silently dropped.
 */

export type RetroTarget = "G10" | "G11" | "G06";
export type RetroDispatchStatus = "PENDING" | "SENT" | "ACKED" | "DEAD_LETTER";

/** retro_impact_events — one per (change, downstream target). */
export interface RetroImpactEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  changeRequestId: string;
  target: RetroTarget;
  effectiveDate: string;
  status: RetroDispatchStatus;
  attempts: number;
  maxAttempts: number;
  ackRef?: string;
}

export interface RetroImpactRepository {
  save(row: RetroImpactEvent): void;
  find(scope: TenantScope, id: string): RetroImpactEvent | undefined;
  findByKey(scope: TenantScope, changeRequestId: string, target: RetroTarget): RetroImpactEvent | undefined;
  listForChange(scope: TenantScope, changeRequestId: string): RetroImpactEvent[];
}

export class InMemoryRetroImpactRepository implements RetroImpactRepository {
  private readonly rows: RetroImpactEvent[] = [];
  private scoped(row: RetroImpactEvent, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: RetroImpactEvent): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): RetroImpactEvent | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  findByKey(scope: TenantScope, changeRequestId: string, target: RetroTarget): RetroImpactEvent | undefined {
    const row = this.rows.find((r) => r.changeRequestId === changeRequestId && r.target === target);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
  listForChange(scope: TenantScope, changeRequestId: string): RetroImpactEvent[] {
    return this.rows.filter((r) => r.changeRequestId === changeRequestId && this.scoped(r, scope)).map((r) => ({ ...r }));
  }
}

export class RetroImpactService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: RetroImpactRepository = new InMemoryRetroImpactRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  /** Fan out retro-impact events for a past-dated change to the affected targets (idempotent). */
  fanOut(
    actor: ActorContext,
    input: { changeRequestId: string; effectiveDate: string; targets: RetroTarget[]; maxAttempts?: number }
  ): RetroImpactEvent[] {
    this.authorization.check(actor, "g02.retro.fanout", actor);
    const events: RetroImpactEvent[] = [];
    for (const target of input.targets) {
      const existing = this.repo.findByKey(actor, input.changeRequestId, target);
      if (existing) {
        events.push(existing);
        continue;
      }
      const event: RetroImpactEvent = {
        id: this.next("g02-retro-impact-event"),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        changeRequestId: input.changeRequestId,
        target,
        effectiveDate: input.effectiveDate,
        status: "PENDING",
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
      };
      this.repo.save(event);
      events.push(event);
    }
    this.audit.recordMutation(actor, {
      action: "G02_RETRO_IMPACT_FANOUT",
      subjectRef: `retro_impact_events:${input.changeRequestId}`,
      metadata: { targets: input.targets.length },
    });
    return events;
  }

  /**
   * Dispatch a retro-impact event. success -> ACKED. A retryable failure re-queues to PENDING until
   * maxAttempts, then DEAD_LETTERs. An ACKED event is not re-dispatched (idempotent).
   */
  dispatch(actor: ActorContext, eventId: string, input: { success: boolean; ackRef?: string }): RetroImpactEvent {
    this.authorization.check(actor, "g02.retro.dispatch", actor);
    const event = this.require(actor, eventId);
    if (event.status === "ACKED") {
      return { ...event }; // idempotent — already acknowledged
    }
    if (event.status === "DEAD_LETTER") {
      throw new FoundationError("PRECONDITION_FAILED", "Event is dead-lettered; requires manual replay");
    }
    event.attempts += 1;
    if (input.success) {
      event.status = "ACKED";
      event.ackRef = input.ackRef;
    } else {
      event.status = event.attempts >= event.maxAttempts ? "DEAD_LETTER" : "PENDING";
    }
    // A PENDING event that was just attempted is SENT-in-flight; model the transient SENT marker.
    if (event.status === "PENDING") event.status = "SENT";
    if (event.status === "SENT" && event.attempts >= event.maxAttempts) event.status = "DEAD_LETTER";
    this.repo.save(event);
    this.audit.recordMutation(actor, {
      action: "G02_RETRO_IMPACT_DISPATCH",
      subjectRef: `retro_impact_events:${event.id}`,
      metadata: { status: event.status, attempts: event.attempts },
    });
    return { ...event };
  }

  listForChange(scope: TenantScope, changeRequestId: string): RetroImpactEvent[] {
    requireTenantScope(scope);
    return this.repo.listForChange(scope, changeRequestId);
  }

  private require(scope: TenantScope, id: string): RetroImpactEvent {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Retro-impact event not found");
    return row;
  }
}
