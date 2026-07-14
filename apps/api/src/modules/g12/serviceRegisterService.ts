import { AuditService } from "../../platform/audit/auditService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope, sha256Hex, stableStringify } from "../../platform/types";

/** Org-wide/scoped override roles for FR-09 self-service SR timeline viewing (BR-09.1
 *  "self/scoped/auditor visibility") — an HR admin, reporting manager, or auditor may view an
 *  employee's timeline; an employee may otherwise view only their own. */
const SR_TIMELINE_OVERRIDE_ROLES = new Set(["hr_admin", "manager", "auditor", "sr_custodian", "system"]);

/** Explicit genesis previous-hash convention for both the content chain and the status sub-ledger chain. */
const GENESIS_HASH = "0".repeat(64);

export type SrSourceModule = "G01" | "G04" | "G05" | "G06" | "G07" | "G08" | "G09" | "G10" | "G11" | "G12_MANUAL";

export interface SrIngestRequest {
  sourceModule: SrSourceModule;
  sourceReferenceId: string;
  sourceEventVersion: number;
  employeeId: string;
  eventTypeCode: string;
  eventDate: string;
  factKey?: string;
  orderNo?: string;
  payload: Record<string, unknown>;
  documentIds?: string[];
  reversalOfEventId?: string;
}

export interface SrEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  sequenceNo: number;
  employeeId: string;
  sourceModule: SrSourceModule;
  sourceReferenceId: string;
  sourceEventVersion: number;
  eventTypeCode: string;
  eventDate: string;
  factKey?: string;
  payload: Record<string, unknown>;
  documentIds: string[];
  reversalOfEventId?: string;
  /** Trusted-time commit stamp (BRD G12 §5.6 `recorded_at`) — server-assigned at append, part of the hashed content; distinct from the legal `eventDate`. */
  recordedAt: string;
  previousHash: string;
  entryHash: string;
  /** Derived projection of the latest `sr_status_events` row for this entry — read-only at the application layer (BRD G12 E8/E19 v2). */
  status: SrEntryStatus;
}

export type SrEntryStatus = "ACTIVE" | "SUPERSEDED" | "ANNOTATED";

export type SrStatusTransitionKind = "ENTRY_STATUS" | "SUPERSESSION";

/**
 * BRD G12 E19 `sr_status_events` — append-only, hash-chained status/supersession sub-ledger,
 * chained per (tenant, employee). Status changes are chained appends, never field updates;
 * `SrEvent.status` is only a projection of the latest row targeting that entry.
 */
export interface SrStatusEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  targetEventId: string;
  statusSequenceNo: number;
  transitionKind: SrStatusTransitionKind;
  fromValue: SrEntryStatus | null;
  toValue: SrEntryStatus;
  relatedEventId?: string;
  actor: string;
  /** SHA-256 of the prior status-chain entry (GENESIS_HASH for the first). */
  prevStatusHash: string;
  /** SHA-256 over the canonical status content including prevStatusHash. */
  statusHash: string;
  /** Trusted-time commit stamp, server-assigned at append and part of the hashed content. */
  recordedAt: string;
}

export interface SrIngestResult {
  event: SrEvent;
  replayed: boolean;
  semanticDuplicate: boolean;
}

interface IdempotencyRecord {
  payloadHash: string;
  eventId: string;
}

const canonicalWriters: SrSourceModule[] = ["G01", "G04", "G05", "G06", "G07", "G08", "G09", "G10", "G11", "G12_MANUAL"];

/** Annotation event types that mark their target entry ANNOTATED via the status sub-ledger. */
const ANNOTATION_EVENT_TYPES = ["CORRIGENDUM", "DISPUTE", "DISPUTE_RESOLUTION"];

export class ServiceRegisterService {
  private readonly events: SrEvent[] = [];
  private readonly statusEvents: SrStatusEvent[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  constructor(private readonly audit: AuditService) {}

  ingest(scope: TenantScope, idempotencyKey: string, request: SrIngestRequest): SrIngestResult {
    requireTenantScope(scope);
    if (!idempotencyKey) {
      throw new FoundationError("VALIDATION_FAILED", "Idempotency-Key is required", { field: "Idempotency-Key" });
    }
    if (!canonicalWriters.includes(request.sourceModule)) {
      throw new FoundationError("FORBIDDEN", "Source module is not an SR writer", { details: { sourceModule: request.sourceModule } });
    }
    const payloadHash = sha256Hex(stableStringify(request));
    const idemKey = `${scope.tenantId}:${idempotencyKey}`;
    const existingIdem = this.idempotency.get(idemKey);
    if (existingIdem) {
      if (existingIdem.payloadHash !== payloadHash) {
        throw new FoundationError("CONFLICT", "Idempotency key reused with a different payload");
      }
      return { event: this.requireEvent(scope, existingIdem.eventId), replayed: true, semanticDuplicate: false };
    }
    const syntactic = this.events.find(
      (event) =>
        event.tenantId === scope.tenantId &&
        event.sourceModule === request.sourceModule &&
        event.sourceReferenceId === request.sourceReferenceId &&
        event.sourceEventVersion === request.sourceEventVersion
    );
    if (syntactic) {
      this.idempotency.set(idemKey, { payloadHash, eventId: syntactic.id });
      return { event: this.toView(syntactic), replayed: false, semanticDuplicate: true };
    }
    if (request.factKey) {
      const semantic = this.events.find(
        (event) => event.tenantId === scope.tenantId && event.employeeId === request.employeeId && event.eventTypeCode === request.eventTypeCode && event.factKey === request.factKey
      );
      if (semantic) {
        this.idempotency.set(idemKey, { payloadHash, eventId: semantic.id });
        return { event: this.toView(semantic), replayed: false, semanticDuplicate: true };
      }
    }
    const previous = this.events
      .filter((event) => event.tenantId === scope.tenantId && event.employeeId === request.employeeId)
      .sort((left, right) => right.sequenceNo - left.sequenceNo)[0];
    const sequenceNo = (previous?.sequenceNo ?? 0) + 1;
    const previousHash = previous?.entryHash ?? GENESIS_HASH;
    // Trusted time: recorded_at is assigned by the service clock at append time — callers cannot
    // supply or overwrite it — and is part of the hashed content (distinct from the legal eventDate).
    const recordedAt = new Date().toISOString();
    const eventWithoutHash = {
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      sequenceNo,
      employeeId: request.employeeId,
      sourceModule: request.sourceModule,
      sourceReferenceId: request.sourceReferenceId,
      sourceEventVersion: request.sourceEventVersion,
      eventTypeCode: request.eventTypeCode,
      eventDate: request.eventDate,
      factKey: request.factKey,
      payload: request.payload,
      documentIds: request.documentIds ?? [],
      reversalOfEventId: request.reversalOfEventId,
      recordedAt,
      previousHash,
    };
    const event: SrEvent = {
      id: nextId("sr", this.events.length),
      ...eventWithoutHash,
      entryHash: sha256Hex(stableStringify(eventWithoutHash)),
      status: "ACTIVE",
    };
    this.events.push(Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }), documentIds: Object.freeze([...event.documentIds]) as string[] }));
    this.idempotency.set(idemKey, { payloadHash, eventId: event.id });
    // Status sub-ledger: the new entry's ACTIVE status is itself a chained append (E19), and a
    // reversal/annotation transitions its target entry via further appends — never a field update.
    this.appendStatusEvent(scope, event, "ENTRY_STATUS", "ACTIVE");
    if (request.reversalOfEventId) {
      const reversed = this.events.find((item) => item.tenantId === scope.tenantId && item.id === request.reversalOfEventId);
      if (reversed) {
        this.appendStatusEvent(scope, reversed, "SUPERSESSION", "SUPERSEDED", event.id);
      }
    } else if (ANNOTATION_EVENT_TYPES.includes(request.eventTypeCode)) {
      const originalEventId = typeof request.payload.originalEventId === "string" ? request.payload.originalEventId : undefined;
      const annotated = originalEventId ? this.events.find((item) => item.tenantId === scope.tenantId && item.id === originalEventId) : undefined;
      if (annotated && this.projectStatus(annotated) === "ACTIVE") {
        this.appendStatusEvent(scope, annotated, "ENTRY_STATUS", "ANNOTATED", event.id);
      }
    }
    this.audit.recordMutation(scope, { action: "G12_SR_INGEST", subjectRef: `service_register_events:${event.id}`, metadata: { sourceModule: request.sourceModule } });
    return { event: this.toView(event), replayed: false, semanticDuplicate: false };
  }

  reverseFromSource(scope: TenantScope, idempotencyKey: string, originalEventId: string, reason: string): SrIngestResult {
    const original = this.requireEvent(scope, originalEventId);
    return this.ingest(scope, idempotencyKey, {
      sourceModule: original.sourceModule,
      sourceReferenceId: `${original.sourceReferenceId}:REVERSAL`,
      sourceEventVersion: original.sourceEventVersion + 1,
      employeeId: original.employeeId,
      eventTypeCode: "REVERSAL",
      eventDate: original.eventDate,
      payload: { reason, reverses: original.id },
      documentIds: [],
      reversalOfEventId: original.id,
    });
  }

  // BRD G12 FR-02 v2 reversal envelope (is_reversal + reverses_source_reference_id): the reversal
  // references the original ledger entry by source_reference_id and APPENDS a linked REVERSAL event —
  // the ledger stays append-only; prior events are never mutated or deleted.
  reverseBySourceReference(scope: TenantScope, idempotencyKey: string, reversesSourceReferenceId: string, reason: string): SrIngestResult {
    requireTenantScope(scope);
    const target = this.events
      .filter(
        (event) =>
          event.tenantId === scope.tenantId &&
          (!scope.entityId || event.entityId === scope.entityId) &&
          event.sourceReferenceId === reversesSourceReferenceId
      )
      .sort((left, right) => right.sourceEventVersion - left.sourceEventVersion)[0];
    if (!target) {
      // Taxonomy SR_REVERSAL_TARGET_NOT_FOUND (BRD G12 FR-02 AC5): reversal references an unknown source_reference_id.
      throw new FoundationError("NOT_FOUND", "Reversal references an unknown source_reference_id", {
        field: "reverses_source_reference_id",
        details: { messageId: "SR_REVERSAL_TARGET_NOT_FOUND", reverses_source_reference_id: reversesSourceReferenceId },
      });
    }
    return this.ingest(scope, idempotencyKey, {
      sourceModule: target.sourceModule,
      sourceReferenceId: `${target.sourceReferenceId}:REVERSAL`,
      sourceEventVersion: target.sourceEventVersion + 1,
      employeeId: target.employeeId,
      eventTypeCode: "REVERSAL",
      eventDate: target.eventDate,
      payload: { reason, is_reversal: true, reverses_source_reference_id: reversesSourceReferenceId, reverses: target.id },
      documentIds: [],
      reversalOfEventId: target.id,
    });
  }

  /** FR-09 self-service scope: an employee may view only their own SR timeline; hr_admin/manager/
   *  auditor/sr_custodian/system (or wildcard `*` permission) may view any employee's. */
  getTimeline(actor: ActorContext, employeeId: string): SrEvent[] {
    requireTenantScope(actor);
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => SR_TIMELINE_OVERRIDE_ROLES.has(role));
    if (!isOverride && actor.userId !== employeeId) {
      throw new FoundationError("FORBIDDEN", "You may only view your own service register timeline", { field: "employeeId" });
    }
    return this.events
      .filter((event) => event.tenantId === actor.tenantId && (!actor.entityId || event.entityId === actor.entityId) && event.employeeId === employeeId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((event) => this.toView(event));
  }

  /** Same FR-09 self-scope guard as getTimeline(): an employee may only fetch their own event. */
  getEvent(actor: ActorContext, eventId: string): SrEvent | null {
    requireTenantScope(actor);
    const event = this.events.find((item) => item.tenantId === actor.tenantId && (!actor.entityId || item.entityId === actor.entityId) && item.id === eventId);
    if (!event) {
      return null;
    }
    const isOverride = actor.permissions?.includes("*") || actor.roles?.some((role) => SR_TIMELINE_OVERRIDE_ROLES.has(role));
    if (!isOverride && actor.userId !== event.employeeId) {
      throw new FoundationError("FORBIDDEN", "You may only view your own service register events", { field: "eventId" });
    }
    return this.toView(event);
  }

  /** Append-only, hash-chained E19 sub-ledger rows for one employee, in chain order. */
  getStatusEvents(scope: TenantScope, employeeId: string): SrStatusEvent[] {
    requireTenantScope(scope);
    return this.statusEvents
      .filter((row) => row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId) && row.employeeId === employeeId)
      .sort((left, right) => left.statusSequenceNo - right.statusSequenceNo)
      .map((row) => ({ ...row }));
  }

  /**
   * PH-10B integrity accessors. Chains are built per (tenant, employee) — the same axis
   * ingest/appendStatusEvent chain on — so verification walks the COMPLETE chain
   * regardless of any entity narrowing on the caller's scope.
   */
  listChainEmployees(scope: TenantScope): string[] {
    requireTenantScope(scope);
    const employees = new Set<string>();
    for (const event of this.events) {
      if (event.tenantId === scope.tenantId) {
        employees.add(event.employeeId);
      }
    }
    return [...employees].sort();
  }

  /** Full content chain for one employee in chain order (raw stored content, no projection). */
  getEntryChain(scope: TenantScope, employeeId: string): SrEvent[] {
    requireTenantScope(scope);
    return this.events
      .filter((event) => event.tenantId === scope.tenantId && event.employeeId === employeeId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((event) => ({ ...event, payload: { ...event.payload }, documentIds: [...event.documentIds] }));
  }

  /** Full sr_status_events sub-chain for one employee in chain order. */
  getStatusChain(scope: TenantScope, employeeId: string): SrStatusEvent[] {
    requireTenantScope(scope);
    return this.statusEvents
      .filter((row) => row.tenantId === scope.tenantId && row.employeeId === employeeId)
      .sort((left, right) => left.statusSequenceNo - right.statusSequenceNo)
      .map((row) => ({ ...row }));
  }

  /**
   * FR-13 pull-feed materialisation: every committed ledger append for the tenant in
   * commit order, each carrying its per-tenant monotonic feed sequence. The ledger is
   * append-only, so a feed sequence, once assigned, never moves — the subscriber cursor
   * (last_delivered_seq / since_seq) is stable across pulls. Corrigenda and reversals are
   * ordinary appends, so they re-emit here naturally (FR-13 AC5).
   */
  listFeedEvents(scope: TenantScope): Array<{ feedSeq: number; event: SrEvent }> {
    requireTenantScope(scope);
    return this.events
      .filter((event) => event.tenantId === scope.tenantId)
      .map((event, index) => ({ feedSeq: index + 1, event: this.toView(event) }));
  }

  count(scope: TenantScope): number {
    requireTenantScope(scope);
    return this.events.filter((event) => event.tenantId === scope.tenantId && (!scope.entityId || event.entityId === scope.entityId)).length;
  }

  private requireEvent(scope: TenantScope, eventId: string): SrEvent {
    const event = this.events.find((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId) && item.id === eventId);
    if (!event) {
      throw new FoundationError("NOT_FOUND", "SR event not found");
    }
    return this.toView(event);
  }

  /**
   * Appends one hash-chained sr_status_events row (per tenant+employee chain). This is the ONLY
   * writer of status transitions; there is deliberately no mutator that edits status in place.
   */
  private appendStatusEvent(scope: TenantScope, target: SrEvent, transitionKind: SrStatusTransitionKind, toValue: SrEntryStatus, relatedEventId?: string): void {
    const previous = this.statusEvents
      .filter((row) => row.tenantId === scope.tenantId && row.employeeId === target.employeeId)
      .sort((left, right) => right.statusSequenceNo - left.statusSequenceNo)[0];
    const recordedAt = new Date().toISOString();
    const rowWithoutHash = {
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      employeeId: target.employeeId,
      targetEventId: target.id,
      statusSequenceNo: (previous?.statusSequenceNo ?? 0) + 1,
      transitionKind,
      fromValue: transitionKind === "ENTRY_STATUS" && toValue === "ACTIVE" ? null : this.projectStatus(target),
      toValue,
      relatedEventId,
      actor: scope.actorUserId ?? "system",
      recordedAt,
      prevStatusHash: previous?.statusHash ?? GENESIS_HASH,
    };
    const row: SrStatusEvent = {
      id: nextId("sr-status", this.statusEvents.length),
      ...rowWithoutHash,
      statusHash: sha256Hex(stableStringify(rowWithoutHash)),
    };
    this.statusEvents.push(Object.freeze(row));
  }

  /** SrEvent.status is a read-time projection of the latest sub-ledger row targeting the entry. */
  private projectStatus(event: SrEvent): SrEntryStatus {
    const latest = this.statusEvents
      .filter((row) => row.tenantId === event.tenantId && row.targetEventId === event.id)
      .sort((left, right) => right.statusSequenceNo - left.statusSequenceNo)[0];
    return latest?.toValue ?? "ACTIVE";
  }

  private toView(event: SrEvent): SrEvent {
    return { ...event, status: this.projectStatus(event), payload: { ...event.payload }, documentIds: [...event.documentIds] };
  }
}
