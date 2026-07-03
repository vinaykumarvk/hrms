import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * PH-23B — G11 DigiLocker / DBT delivery at BRD depth
 * (docs/brd/v3/G11-retirement-and-pension.md FR-24):
 *
 * - digital_deliveries push a PPO / pension artefact to a channel (DIGILOCKER) and track the DBT
 *   (Direct Benefit Transfer) credit status for the pension itself.
 * - Delivery runs QUEUED -> DELIVERED, with retryable failures re-queued up to a cap and a permanent
 *   failure dead-lettering. A dead-lettered delivery cannot be silently marked delivered.
 */

export type DeliveryChannel = "DIGILOCKER" | "EMAIL" | "SMS";
export type DeliveryStatus = "QUEUED" | "DELIVERED" | "FAILED" | "DEAD_LETTER";
export type DbtStatus = "NOT_STARTED" | "INITIATED" | "CREDITED" | "RETURNED";

/** digital_deliveries — a channel delivery of a pension artefact + its DBT credit state. */
export interface DigitalDelivery {
  id: string;
  tenantId: string;
  entityId?: string;
  pensionerId: string;
  artefactRef: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  dbtStatus: DbtStatus;
  lastError?: string;
}

export interface DigitalDeliveryRepository {
  save(row: DigitalDelivery): void;
  find(scope: TenantScope, id: string): DigitalDelivery | undefined;
}

export class InMemoryDigitalDeliveryRepository implements DigitalDeliveryRepository {
  private readonly rows: DigitalDelivery[] = [];
  private scoped(row: DigitalDelivery, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId || row.entityId === undefined);
  }
  save(row: DigitalDelivery): void {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) this.rows[i] = { ...row }; else this.rows.push({ ...row });
  }
  find(scope: TenantScope, id: string): DigitalDelivery | undefined {
    const row = this.rows.find((r) => r.id === id);
    return row && this.scoped(row, scope) ? { ...row } : undefined;
  }
}

export class DigitalDeliveryService {
  private counter = 0;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repo: DigitalDeliveryRepository = new InMemoryDigitalDeliveryRepository()
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  queueDelivery(
    actor: ActorContext,
    input: { pensionerId: string; artefactRef: string; channel: DeliveryChannel; maxAttempts?: number }
  ): DigitalDelivery {
    this.authorization.check(actor, "g11.delivery.queue", actor);
    const delivery: DigitalDelivery = {
      id: this.next("g11-digital-delivery"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pensionerId: input.pensionerId,
      artefactRef: input.artefactRef,
      channel: input.channel,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      dbtStatus: "NOT_STARTED",
    };
    this.repo.save(delivery);
    this.audit.recordMutation(actor, {
      action: "G11_DELIVERY_QUEUED",
      subjectRef: `digital_deliveries:${delivery.id}`,
      metadata: { channel: delivery.channel },
    });
    return { ...delivery };
  }

  /**
   * Attempt delivery. success -> DELIVERED. A permanent failure -> DEAD_LETTER. A retryable failure
   * re-queues until maxAttempts, then dead-letters.
   */
  attemptDelivery(
    actor: ActorContext,
    deliveryId: string,
    input: { success: boolean; permanent?: boolean; error?: string }
  ): DigitalDelivery {
    this.authorization.check(actor, "g11.delivery.attempt", actor);
    const delivery = this.require(actor, deliveryId);
    if (delivery.status === "DELIVERED" || delivery.status === "DEAD_LETTER") {
      throw new FoundationError("PRECONDITION_FAILED", "Delivery is already in a terminal state");
    }
    delivery.attempts += 1;
    if (input.success) {
      delivery.status = "DELIVERED";
      delivery.lastError = undefined;
    } else if (input.permanent) {
      delivery.status = "DEAD_LETTER";
      delivery.lastError = input.error ?? "PERMANENT";
    } else {
      delivery.lastError = input.error ?? "RETRYABLE";
      delivery.status = delivery.attempts >= delivery.maxAttempts ? "DEAD_LETTER" : "QUEUED";
    }
    this.repo.save(delivery);
    this.audit.recordMutation(actor, {
      action: "G11_DELIVERY_ATTEMPTED",
      subjectRef: `digital_deliveries:${delivery.id}`,
      metadata: { status: delivery.status, attempts: delivery.attempts },
    });
    return { ...delivery };
  }

  /** Update the DBT credit status for the pension linked to this delivery. */
  updateDbtStatus(actor: ActorContext, deliveryId: string, input: { dbtStatus: DbtStatus }): DigitalDelivery {
    this.authorization.check(actor, "g11.delivery.dbt", actor);
    const delivery = this.require(actor, deliveryId);
    delivery.dbtStatus = input.dbtStatus;
    this.repo.save(delivery);
    this.audit.recordMutation(actor, {
      action: "G11_DBT_STATUS_UPDATED",
      subjectRef: `digital_deliveries:${delivery.id}`,
      metadata: { dbtStatus: delivery.dbtStatus },
    });
    return { ...delivery };
  }

  getDelivery(scope: TenantScope, id: string): DigitalDelivery | undefined {
    requireTenantScope(scope);
    return this.repo.find(scope, id);
  }

  private require(scope: TenantScope, id: string): DigitalDelivery {
    const row = this.repo.find(scope, id);
    if (!row) throw new FoundationError("NOT_FOUND", "Delivery not found");
    return row;
  }
}
