import { AuditService } from "../../platform/audit/auditService";
import { FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";

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
  previousHash: string;
  entryHash: string;
  status: "ACTIVE" | "SUPERSEDED" | "ANNOTATED";
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

export class ServiceRegisterService {
  private readonly events: SrEvent[] = [];
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
    const payloadHash = pseudoHash64(stableStringify(request));
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
      return { event: { ...syntactic, payload: { ...syntactic.payload }, documentIds: [...syntactic.documentIds] }, replayed: false, semanticDuplicate: true };
    }
    if (request.factKey) {
      const semantic = this.events.find(
        (event) => event.tenantId === scope.tenantId && event.employeeId === request.employeeId && event.eventTypeCode === request.eventTypeCode && event.factKey === request.factKey
      );
      if (semantic) {
        this.idempotency.set(idemKey, { payloadHash, eventId: semantic.id });
        return { event: { ...semantic, payload: { ...semantic.payload }, documentIds: [...semantic.documentIds] }, replayed: false, semanticDuplicate: true };
      }
    }
    const previous = this.events
      .filter((event) => event.tenantId === scope.tenantId && event.employeeId === request.employeeId)
      .sort((left, right) => right.sequenceNo - left.sequenceNo)[0];
    const sequenceNo = (previous?.sequenceNo ?? 0) + 1;
    const previousHash = previous?.entryHash ?? "0".repeat(64);
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
      previousHash,
    };
    const event: SrEvent = {
      id: nextId("sr", this.events.length),
      ...eventWithoutHash,
      entryHash: pseudoHash64(stableStringify(eventWithoutHash)),
      status: "ACTIVE",
    };
    this.events.push(Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }), documentIds: Object.freeze([...event.documentIds]) as string[] }));
    this.idempotency.set(idemKey, { payloadHash, eventId: event.id });
    this.audit.recordMutation(scope, { action: "G12_SR_INGEST", subjectRef: `service_register_events:${event.id}`, metadata: { sourceModule: request.sourceModule } });
    return { event: { ...event, payload: { ...event.payload }, documentIds: [...event.documentIds] }, replayed: false, semanticDuplicate: false };
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

  getTimeline(scope: TenantScope, employeeId: string): SrEvent[] {
    requireTenantScope(scope);
    return this.events
      .filter((event) => event.tenantId === scope.tenantId && (!scope.entityId || event.entityId === scope.entityId) && event.employeeId === employeeId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((event) => ({ ...event, payload: { ...event.payload }, documentIds: [...event.documentIds] }));
  }

  getEvent(scope: TenantScope, eventId: string): SrEvent | null {
    requireTenantScope(scope);
    const event = this.events.find((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId) && item.id === eventId);
    return event ? { ...event, payload: { ...event.payload }, documentIds: [...event.documentIds] } : null;
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
    return { ...event, payload: { ...event.payload }, documentIds: [...event.documentIds] };
  }
}
