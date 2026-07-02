import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { ServiceRegisterService } from "../g12/serviceRegisterService";

export type LeaveSrRelayStatus = "READY" | "IN_FLIGHT" | "POSTED" | "FAILED" | "DEAD_LETTERED" | "DISCARDED";

export interface LeaveSrOutboxEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  leaveApplicationId: string;
  sourceModule: "G04";
  sourceReferenceId: string;
  sourceEventVersion: number;
  employeeId: string;
  eventTypeCode: "LEAVE_APPROVED" | "LEAVE_CANCELLED";
  eventDate: string;
  factKey: string;
  status: LeaveSrRelayStatus;
  attempts: number;
  relayIdempotencyKey: string;
  srEventId?: string;
  lastError?: string;
  payload: Record<string, unknown>;
}

export interface LeaveSrReconciliationReport {
  total: number;
  ready: number;
  posted: number;
  failed: number;
  deadLettered: number;
  discarded: number;
}

export class LeaveSrRelayService {
  private readonly outbox: LeaveSrOutboxEvent[] = [];
  private readonly maxAttempts = 2;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly notifications: NotificationService
  ) {}

  enqueueApprovedLeave(
    scope: TenantScope,
    input: {
      leaveApplicationId: string;
      employeeId: string;
      eventDate: string;
      payload: Record<string, unknown>;
    }
  ): LeaveSrOutboxEvent {
    requireTenantScope(scope);
    return this.enqueue(scope, {
      leaveApplicationId: input.leaveApplicationId,
      employeeId: input.employeeId,
      eventTypeCode: "LEAVE_APPROVED",
      eventDate: input.eventDate,
      factKey: `G03:${input.leaveApplicationId}:LEAVE_APPROVED`,
      payload: input.payload,
    });
  }

  enqueueLeaveCancellation(
    scope: TenantScope,
    input: {
      leaveApplicationId: string;
      employeeId: string;
      eventDate: string;
      payload: Record<string, unknown>;
    }
  ): LeaveSrOutboxEvent {
    requireTenantScope(scope);
    return this.enqueue(scope, {
      leaveApplicationId: input.leaveApplicationId,
      employeeId: input.employeeId,
      eventTypeCode: "LEAVE_CANCELLED",
      eventDate: input.eventDate,
      factKey: `G03:${input.leaveApplicationId}:LEAVE_CANCELLED`,
      payload: input.payload,
    });
  }

  relayEvent(actor: ActorContext, outboxEventId: string, options: { simulateFailure?: boolean } = {}): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.write", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status === "POSTED" || event.status === "DISCARDED") {
      return this.clone(event);
    }
    if (options.simulateFailure) {
      event.attempts += 1;
      event.status = event.attempts >= this.maxAttempts ? "DEAD_LETTERED" : "FAILED";
      event.lastError = "SIMULATED_RELAY_FAILURE";
      this.audit.recordMutation(actor, {
        action: "G04_RELAY_FAILURE",
        subjectRef: `g04_leave_sr_outbox:${event.id}`,
        metadata: { attempts: event.attempts, status: event.status },
      });
      return this.clone(event);
    }
    event.status = "IN_FLIGHT";
    const sr = this.serviceRegister.ingest(actor, event.relayIdempotencyKey, {
      sourceModule: "G04",
      sourceReferenceId: event.sourceReferenceId,
      sourceEventVersion: event.sourceEventVersion,
      employeeId: event.employeeId,
      eventTypeCode: event.eventTypeCode,
      eventDate: event.eventDate,
      factKey: event.factKey,
      payload: event.payload,
      documentIds: [],
    });
    event.status = "POSTED";
    event.srEventId = sr.event.id;
    event.lastError = undefined;
    this.audit.recordMutation(actor, {
      action: "G04_RELAY_POSTED",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { srEventId: sr.event.id, eventTypeCode: event.eventTypeCode },
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: event.employeeId,
      messageId: "G04_SR_RELAY_POSTED",
      channel: "IN_APP",
      relatedRef: `g04_leave_sr_outbox:${event.id}`,
      mergeFields: { srEventId: sr.event.id, eventTypeCode: event.eventTypeCode },
    });
    return this.clone(event);
  }

  relayReady(actor: ActorContext): LeaveSrOutboxEvent[] {
    return this.list(actor)
      .filter((event) => event.status === "READY" || event.status === "FAILED")
      .map((event) => this.relayEvent(actor, event.id));
  }

  replayDeadLetter(actor: ActorContext, outboxEventId: string): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.replay", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status !== "DEAD_LETTERED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only dead-lettered relay events can be replayed");
    }
    event.status = "READY";
    event.lastError = undefined;
    return this.relayEvent(actor, event.id);
  }

  discardDeadLetter(actor: ActorContext, outboxEventId: string, reason: string): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.discard", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status !== "DEAD_LETTERED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only dead-lettered relay events can be discarded");
    }
    event.status = "DISCARDED";
    event.lastError = reason;
    this.audit.recordMutation(actor, {
      action: "G04_RELAY_DISCARD",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { reason },
    });
    return this.clone(event);
  }

  list(scope: TenantScope): LeaveSrOutboxEvent[] {
    requireTenantScope(scope);
    return this.outbox.filter((event) => event.tenantId === scope.tenantId && (!scope.entityId || event.entityId === scope.entityId)).map((event) => this.clone(event));
  }

  reconcile(scope: TenantScope): LeaveSrReconciliationReport {
    const events = this.list(scope);
    return {
      total: events.length,
      ready: events.filter((event) => event.status === "READY").length,
      posted: events.filter((event) => event.status === "POSTED").length,
      failed: events.filter((event) => event.status === "FAILED").length,
      deadLettered: events.filter((event) => event.status === "DEAD_LETTERED").length,
      discarded: events.filter((event) => event.status === "DISCARDED").length,
    };
  }

  private enqueue(
    scope: TenantScope,
    input: {
      leaveApplicationId: string;
      employeeId: string;
      eventTypeCode: LeaveSrOutboxEvent["eventTypeCode"];
      eventDate: string;
      factKey: string;
      payload: Record<string, unknown>;
    }
  ): LeaveSrOutboxEvent {
    const event: LeaveSrOutboxEvent = {
      id: nextId("g04-leave-outbox", this.outbox.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      leaveApplicationId: input.leaveApplicationId,
      sourceModule: "G04",
      sourceReferenceId: `g04_leave_outbox:${this.outbox.length + 1}`,
      sourceEventVersion: 1,
      employeeId: input.employeeId,
      eventTypeCode: input.eventTypeCode,
      eventDate: input.eventDate,
      factKey: input.factKey,
      status: "READY",
      attempts: 0,
      relayIdempotencyKey: `g04:${input.leaveApplicationId}:${input.eventTypeCode}`,
      payload: { ...input.payload },
    };
    this.outbox.push(event);
    this.audit.recordMutation(scope, {
      action: "G04_RELAY_ENQUEUE",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { eventTypeCode: event.eventTypeCode },
    });
    return this.clone(event);
  }

  private requireOutbox(scope: TenantScope, outboxEventId: string): LeaveSrOutboxEvent {
    const event = this.outbox.find((item) => item.id === outboxEventId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
    if (!event) {
      throw new FoundationError("NOT_FOUND", "G04 outbox event not found");
    }
    return event;
  }

  private clone(event: LeaveSrOutboxEvent): LeaveSrOutboxEvent {
    return { ...event, payload: { ...event.payload } };
  }
}
