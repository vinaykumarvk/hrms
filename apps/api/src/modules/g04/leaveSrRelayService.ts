import { createHmac, timingSafeEqual } from "node:crypto";
import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope, stableStringify } from "../../platform/types";
import { ServiceRegisterService, SrEvent } from "../g12/serviceRegisterService";
import { InMemoryLeaveSrRelayRepository, LeaveSrRelayRepository } from "./leaveSrRelayRepository";

export type LeaveSrRelayStatus =
  | "READY"
  | "IN_FLIGHT"
  | "POSTED"
  | "FAILED"
  | "DEAD_LETTERED"
  | "DISCARDED"
  // PH-16C (FR-G04-02 AC4): the pinned sr_event_mapping disposition is EXCLUDED_NON_SR —
  // the event is a recorded no-op; it never posts to G12.
  | "EXCLUDED"
  | "QUARANTINED";

/** BRD G04 §8 registered error code for payload signature verification failure (VAL-G04-SIG). */
export const ERR_G04_SIGNATURE_INVALID = "ERR-G04-SIGNATURE-INVALID";

export interface LeaveSrOutboxEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  leaveApplicationId: string;
  /** Stable spell key issued by G03; constant across approve/amend/cancel of one spell (VAL-G04-LINEAGE). */
  leaveSpellLineageId: string;
  /** Monotonic within (tenant, lineage); uniqueness enforced by uq_outbox_lineage_seq. */
  eventSequence: number;
  sourceModule: "G04";
  sourceReferenceId: string;
  sourceEventVersion: number;
  employeeId: string;
  eventTypeCode: "LEAVE_APPROVED" | "LEAVE_CANCELLED";
  eventDate: string;
  /** G03 leave type code (EL/HPL/LWP…); the sr_event_mapping catalog match key (FR-G04-02). */
  leaveTypeCode?: string;
  factKey: string;
  status: LeaveSrRelayStatus;
  attempts: number;
  /**
   * PH-16C (FR-G04-02 BR3 / leave_event_outbox.pinned_mapping_version): the sr_event_mapping
   * version resolved ONCE at first claim and persisted; retries reuse it, never recompute.
   */
  pinnedMappingVersion?: number;
  /** PH-16C (FR-G04-15 / leave_event_outbox.claimed_at): lease start of the in-flight claim. */
  claimedAt?: string;
  /** PH-16C (FR-G04-15 / leave_event_outbox.lease_expires_at): visibility timeout; the reaper reclaims expired IN_FLIGHT rows. */
  leaseExpiresAt?: string;
  /** Earliest relay pick time (ISO); pushed out by exponential backoff on failure. */
  availableAt: string;
  relayIdempotencyKey: string;
  /** HMAC-SHA256 over lineage/sequence/payload, computed at enqueue and verified before posting. */
  payloadSignature: string;
  srEventId?: string;
  lastError?: string;
  payload: Record<string, unknown>;
}

/** Persisted sr_dead_letter entity (E11): quarantined/exhausted events awaiting resolution. */
export interface SrDeadLetterRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  outboxEventId: string;
  leaveSpellLineageId: string;
  failureClass: "MAPPING_MISSING" | "VALIDATION_REJECT" | "UPSTREAM_DOWN" | "DATA_CONFLICT" | "SIGNATURE_INVALID" | "UNKNOWN";
  lastErrorCode: string;
  lastErrorDetail?: string;
  attemptsExhausted: number;
  state: "OPEN" | "IN_REVIEW" | "RESOLVED_REPLAYED" | "RESOLVED_DISCARDED";
  createdAt: string;
}

/** Persisted sr_correction_link entity (E14): connects a correcting SR entry to its original. */
export interface SrCorrectionLink {
  id: string;
  tenantId: string;
  entityId?: string;
  originalSrEventId: string;
  correctingSrEventId: string;
  originalOutboxEventId: string;
  correctingOutboxEventId: string;
  leaveSpellLineageId: string;
  correctionType: "REVERSAL" | "AMENDMENT" | "SUPERSEDE";
  reasonCode: string;
  createdAt: string;
}

/** Reconciliation execution header (E12). */
export interface ReconciliationRun {
  id: string;
  tenantId: string;
  entityId?: string;
  runType: "SCHEDULED" | "ON_DEMAND" | "PRE_PENSION" | "SOURCE_OUTBOX_INTEGRITY";
  leaveRecordsExamined: number;
  srEntriesExamined: number;
  findingsCount: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAt: string;
  completedAt?: string;
}

export type ReconciliationFindingType = "MISSING_SR" | "ORPHAN_CORRECTION";

/** Persisted reconciliation_finding entity (E13). */
export interface ReconciliationFinding {
  id: string;
  tenantId: string;
  entityId?: string;
  runId: string;
  employeeId: string;
  leaveApplicationId?: string;
  leaveSpellLineageId?: string;
  findingType: ReconciliationFindingType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  leaveSnapshot?: Record<string, unknown>;
  srSnapshot?: Record<string, unknown>;
  remediationState: "OPEN";
}

/** Minimal structural view of a G03 leave ledger entry consumed by reconciliation. */
export interface G03LeaveLedgerEntryLike {
  employeeId: string;
  leaveApplicationId: string;
  entryType: string;
  units: number;
}

export interface LeaveSrReconciliationReport {
  total: number;
  ready: number;
  posted: number;
  failed: number;
  deadLettered: number;
  discarded: number;
  quarantined: number;
}

export interface LeaveSrRelayConfig {
  /** HMAC signing key. Sourced from the environment (G04_RELAY_HMAC_KEY); never hardcoded here. */
  hmacKey: string;
  maxAttempts?: number;
  /** Base delay for exponential backoff (availableAt = now + base * 2^(attempts-1)). */
  backoffBaseMs?: number;
  /** Injectable clock for deterministic backoff tests. */
  now?: () => Date;
}

interface EnqueueInput {
  leaveApplicationId: string;
  employeeId: string;
  eventDate: string;
  payload: Record<string, unknown>;
  leaveSpellLineageId?: string;
  /** G03 leave type code; falls back to payload.leaveTypeCode when the caller predates the catalog. */
  leaveTypeCode?: string;
}

export class LeaveSrRelayService {
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly clock: () => Date;
  private readonly hmacKey: string;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly notifications: NotificationService,
    private readonly repository: LeaveSrRelayRepository = new InMemoryLeaveSrRelayRepository(),
    config: LeaveSrRelayConfig = { hmacKey: "" }
  ) {
    if (!config.hmacKey) {
      throw new FoundationError("INTERNAL", "G04 relay HMAC key is not configured (set G04_RELAY_HMAC_KEY)");
    }
    this.hmacKey = config.hmacKey;
    this.maxAttempts = config.maxAttempts ?? 2;
    this.backoffBaseMs = config.backoffBaseMs ?? 60_000;
    this.clock = config.now ?? (() => new Date());
  }

  enqueueApprovedLeave(scope: TenantScope, input: EnqueueInput): LeaveSrOutboxEvent {
    requireTenantScope(scope);
    return this.enqueue(scope, { ...input, eventTypeCode: "LEAVE_APPROVED" });
  }

  enqueueLeaveCancellation(scope: TenantScope, input: EnqueueInput): LeaveSrOutboxEvent {
    requireTenantScope(scope);
    return this.enqueue(scope, { ...input, eventTypeCode: "LEAVE_CANCELLED" });
  }

  relayEvent(actor: ActorContext, outboxEventId: string, options: { simulateFailure?: boolean } = {}): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.write", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status === "POSTED" || event.status === "DISCARDED") {
      return this.clone(event);
    }
    if (event.status === "QUARANTINED") {
      throw new FoundationError("PRECONDITION_FAILED", "Quarantined relay events require dead-letter resolution", {
        details: { errorCode: ERR_G04_SIGNATURE_INVALID },
      });
    }
    if (options.simulateFailure) {
      return this.recordFailure(actor, event, "SIMULATED_RELAY_FAILURE");
    }
    // VAL-G04-SIG: verify the enqueue-time HMAC before posting; a mismatch quarantines
    // the event — it must never reach G12.
    this.verifySignature(actor, event);
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
    if (event.eventTypeCode === "LEAVE_CANCELLED") {
      this.linkCorrection(actor, event, sr.event);
    }
    this.audit.recordMutation(actor, {
      action: "G04_RELAY_POSTED",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { srEventId: sr.event.id, eventTypeCode: event.eventTypeCode, leaveSpellLineageId: event.leaveSpellLineageId, eventSequence: event.eventSequence },
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

  /** Backoff-aware pick: only READY events, or FAILED events whose availableAt has passed. */
  relayReady(actor: ActorContext): LeaveSrOutboxEvent[] {
    const now = this.clock().getTime();
    return this.list(actor)
      .filter((event) => event.status === "READY" || (event.status === "FAILED" && Date.parse(event.availableAt) <= now))
      .map((event) => this.relayEvent(actor, event.id));
  }

  replayDeadLetter(actor: ActorContext, outboxEventId: string): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.replay", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status !== "DEAD_LETTERED" && event.status !== "QUARANTINED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only dead-lettered relay events can be replayed");
    }
    this.resolveDeadLetter(actor, event.id, "RESOLVED_REPLAYED");
    event.status = "READY";
    event.availableAt = this.clock().toISOString();
    event.lastError = undefined;
    return this.relayEvent(actor, event.id);
  }

  discardDeadLetter(actor: ActorContext, outboxEventId: string, reason: string): LeaveSrOutboxEvent {
    this.authorization.check(actor, "g04.relay.discard", actor);
    const event = this.requireOutbox(actor, outboxEventId);
    if (event.status !== "DEAD_LETTERED" && event.status !== "QUARANTINED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only dead-lettered relay events can be discarded");
    }
    this.resolveDeadLetter(actor, event.id, "RESOLVED_DISCARDED");
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
    return this.repository.listOutboxEvents(scope).map((event) => this.clone(event));
  }

  listDeadLetters(scope: TenantScope): SrDeadLetterRecord[] {
    requireTenantScope(scope);
    return this.repository.listDeadLetters(scope).map((record) => ({ ...record }));
  }

  listCorrectionLinks(scope: TenantScope): SrCorrectionLink[] {
    requireTenantScope(scope);
    return this.repository.listCorrectionLinks(scope).map((link) => ({ ...link }));
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
      quarantined: events.filter((event) => event.status === "QUARANTINED").length,
    };
  }

  /**
   * Statutory reconciliation (FR-17): compare the G03 leave ledger against the G12 service
   * register and persist typed findings — MISSING_SR when a ledger debit has no SR event,
   * ORPHAN_CORRECTION when a correction posted without an original to correct.
   */
  runReconciliation(
    actor: ActorContext,
    // PH-16C (FR-G04-18 AC1): a pre-pension certificate may only be generated from a completed
    // PRE_PENSION run, so the run type is caller-selectable (default stays ON_DEMAND).
    input: { ledgerEntries: G03LeaveLedgerEntryLike[]; runType?: ReconciliationRun["runType"] }
  ): { run: ReconciliationRun; findings: ReconciliationFinding[] } {
    this.authorization.check(actor, "g04.relay.reconcile", actor);
    const startedAt = this.clock().toISOString();
    const run: ReconciliationRun = {
      id: nextId("g04-recon-run", this.repository.countReconciliationRuns()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      runType: input.runType ?? "ON_DEMAND",
      leaveRecordsExamined: input.ledgerEntries.length,
      srEntriesExamined: 0,
      findingsCount: 0,
      status: "RUNNING",
      startedAt,
    };
    this.repository.insertReconciliationRun(run);

    const findings: ReconciliationFinding[] = [];
    const outboxEvents = this.repository.listOutboxEvents(actor);
    const employeeIds = new Set<string>();
    for (const entry of input.ledgerEntries) {
      employeeIds.add(entry.employeeId);
    }
    for (const event of outboxEvents) {
      employeeIds.add(event.employeeId);
    }
    const timelines = new Map<string, SrEvent[]>();
    for (const employeeId of employeeIds) {
      timelines.set(employeeId, this.serviceRegister.getTimeline(actor, employeeId));
    }
    let srEntriesExamined = 0;
    for (const timeline of timelines.values()) {
      srEntriesExamined += timeline.length;
    }

    // MISSING_SR: a G03 ledger debit whose spell never produced a posted SR event.
    for (const entry of input.ledgerEntries) {
      if (entry.entryType !== "DEBIT" && entry.entryType !== "AVAIL") {
        continue;
      }
      const timeline = timelines.get(entry.employeeId) ?? [];
      const approvedFactKey = `G03:${entry.leaveApplicationId}:LEAVE_APPROVED`;
      const hasSr = timeline.some((srEvent) => srEvent.sourceModule === "G04" && srEvent.factKey === approvedFactKey);
      if (!hasSr) {
        const lineage = outboxEvents.find((event) => event.leaveApplicationId === entry.leaveApplicationId)?.leaveSpellLineageId;
        findings.push(this.buildFinding(actor, run.id, findings.length, {
          employeeId: entry.employeeId,
          leaveApplicationId: entry.leaveApplicationId,
          leaveSpellLineageId: lineage,
          findingType: "MISSING_SR",
          severity: "HIGH",
          leaveSnapshot: { leaveApplicationId: entry.leaveApplicationId, entryType: entry.entryType, units: entry.units },
        }));
      }
    }

    // ORPHAN_CORRECTION: a posted correction (LEAVE_CANCELLED) with no original SR event.
    for (const [employeeId, timeline] of timelines) {
      for (const srEvent of timeline) {
        if (srEvent.sourceModule !== "G04" || srEvent.eventTypeCode !== "LEAVE_CANCELLED" || !srEvent.factKey) {
          continue;
        }
        const applicationId = parseFactKeyApplicationId(srEvent.factKey);
        if (!applicationId) {
          continue;
        }
        const hasOriginal = timeline.some(
          (candidate) => candidate.sourceModule === "G04" && candidate.factKey === `G03:${applicationId}:LEAVE_APPROVED`
        );
        if (!hasOriginal) {
          const lineage = outboxEvents.find((event) => event.leaveApplicationId === applicationId)?.leaveSpellLineageId;
          findings.push(this.buildFinding(actor, run.id, findings.length, {
            employeeId,
            leaveApplicationId: applicationId,
            leaveSpellLineageId: lineage,
            findingType: "ORPHAN_CORRECTION",
            severity: "CRITICAL",
            srSnapshot: { srEventId: srEvent.id, eventTypeCode: srEvent.eventTypeCode, factKey: srEvent.factKey },
          }));
        }
      }
    }

    for (const finding of findings) {
      this.repository.insertReconciliationFinding(finding);
    }
    run.srEntriesExamined = srEntriesExamined;
    run.findingsCount = findings.length;
    run.status = "COMPLETED";
    run.completedAt = this.clock().toISOString();
    this.repository.updateReconciliationRun(run);
    this.audit.recordMutation(actor, {
      action: "G04_RECONCILIATION_RUN",
      subjectRef: `g04_reconciliation_run:${run.id}`,
      metadata: { findingsCount: run.findingsCount, leaveRecordsExamined: run.leaveRecordsExamined, srEntriesExamined: run.srEntriesExamined },
    });
    return { run: { ...run }, findings: findings.map((finding) => ({ ...finding })) };
  }

  listReconciliationFindings(scope: TenantScope, runId?: string): ReconciliationFinding[] {
    requireTenantScope(scope);
    return this.repository.listReconciliationFindings(scope, runId).map((finding) => ({ ...finding }));
  }

  private enqueue(
    scope: TenantScope,
    input: EnqueueInput & { eventTypeCode: LeaveSrOutboxEvent["eventTypeCode"] }
  ): LeaveSrOutboxEvent {
    // Lineage is G03-issued; the deterministic fallback keeps it stable across
    // approve/amend/cancel of the same spell when the caller predates lineage propagation.
    const leaveSpellLineageId = input.leaveSpellLineageId ?? `lineage:${input.leaveApplicationId}`;
    const eventSequence = this.repository.maxEventSequence(scope.tenantId, leaveSpellLineageId) + 1;
    const payload = { ...input.payload };
    const event: LeaveSrOutboxEvent = {
      id: nextId("g04-leave-outbox", this.repository.countOutbox()),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      leaveApplicationId: input.leaveApplicationId,
      leaveSpellLineageId,
      eventSequence,
      sourceModule: "G04",
      sourceReferenceId: `g04_leave_outbox:${this.repository.countOutbox() + 1}`,
      sourceEventVersion: 1,
      employeeId: input.employeeId,
      eventTypeCode: input.eventTypeCode,
      eventDate: input.eventDate,
      leaveTypeCode: input.leaveTypeCode ?? (typeof payload.leaveTypeCode === "string" ? payload.leaveTypeCode : undefined),
      factKey: `G03:${input.leaveApplicationId}:${input.eventTypeCode}`,
      status: "READY",
      attempts: 0,
      availableAt: this.clock().toISOString(),
      relayIdempotencyKey: `g04:${input.leaveApplicationId}:${input.eventTypeCode}`,
      payloadSignature: this.computeSignature(leaveSpellLineageId, eventSequence, payload),
      payload,
    };
    this.repository.insertOutboxEvent(event);
    this.audit.recordMutation(scope, {
      action: "G04_RELAY_ENQUEUE",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { eventTypeCode: event.eventTypeCode, leaveSpellLineageId, eventSequence },
    });
    return this.clone(event);
  }

  /** HMAC-SHA256 over the lineage, sequence and canonicalised payload (key from env config). */
  private computeSignature(leaveSpellLineageId: string, eventSequence: number, payload: Record<string, unknown>): string {
    return createHmac("sha256", this.hmacKey)
      .update(stableStringify({ leaveSpellLineageId, eventSequence, payload }))
      .digest("hex");
  }

  private verifySignature(actor: ActorContext, event: LeaveSrOutboxEvent): void {
    const expected = this.computeSignature(event.leaveSpellLineageId, event.eventSequence, event.payload);
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(event.payloadSignature, "hex");
    if (expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)) {
      return;
    }
    event.status = "QUARANTINED";
    event.lastError = ERR_G04_SIGNATURE_INVALID;
    this.repository.insertDeadLetter({
      id: nextId("g04-dlq", this.repository.countDeadLetters()),
      tenantId: event.tenantId,
      entityId: event.entityId,
      outboxEventId: event.id,
      leaveSpellLineageId: event.leaveSpellLineageId,
      failureClass: "SIGNATURE_INVALID",
      lastErrorCode: ERR_G04_SIGNATURE_INVALID,
      lastErrorDetail: "Payload signature verification failed at relay pick; event quarantined before posting",
      attemptsExhausted: event.attempts,
      state: "OPEN",
      createdAt: this.clock().toISOString(),
    });
    this.audit.recordMutation(actor, {
      action: "G04_RELAY_QUARANTINE",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { errorCode: ERR_G04_SIGNATURE_INVALID, leaveSpellLineageId: event.leaveSpellLineageId, eventSequence: event.eventSequence },
    });
    throw new FoundationError("CONFLICT", "Outbox payload failed signature verification and was quarantined", {
      details: { errorCode: ERR_G04_SIGNATURE_INVALID, outboxEventId: event.id },
    });
  }

  private recordFailure(actor: ActorContext, event: LeaveSrOutboxEvent, error: string): LeaveSrOutboxEvent {
    event.attempts += 1;
    event.lastError = error;
    if (event.attempts >= this.maxAttempts) {
      event.status = "DEAD_LETTERED";
      this.repository.insertDeadLetter({
        id: nextId("g04-dlq", this.repository.countDeadLetters()),
        tenantId: event.tenantId,
        entityId: event.entityId,
        outboxEventId: event.id,
        leaveSpellLineageId: event.leaveSpellLineageId,
        failureClass: "UPSTREAM_DOWN",
        lastErrorCode: "RELAY_FAILURE",
        lastErrorDetail: error,
        attemptsExhausted: event.attempts,
        state: "OPEN",
        createdAt: this.clock().toISOString(),
      });
    } else {
      event.status = "FAILED";
      // Exponential backoff: the relay may not pick this event again until availableAt passes.
      const delayMs = this.backoffBaseMs * 2 ** (event.attempts - 1);
      event.availableAt = new Date(this.clock().getTime() + delayMs).toISOString();
    }
    this.audit.recordMutation(actor, {
      action: "G04_RELAY_FAILURE",
      subjectRef: `g04_leave_sr_outbox:${event.id}`,
      metadata: { attempts: event.attempts, status: event.status, availableAt: event.availableAt },
    });
    return this.clone(event);
  }

  private linkCorrection(actor: ActorContext, correcting: LeaveSrOutboxEvent, correctingSrEvent: SrEvent): void {
    const original = this.repository
      .listOutboxEvents(actor)
      .find(
        (candidate) =>
          candidate.leaveSpellLineageId === correcting.leaveSpellLineageId &&
          candidate.eventTypeCode === "LEAVE_APPROVED" &&
          candidate.status === "POSTED" &&
          candidate.srEventId !== undefined
      );
    if (!original || !original.srEventId) {
      // Correction without an original: reconciliation surfaces this as ORPHAN_CORRECTION.
      return;
    }
    this.repository.insertCorrectionLink({
      id: nextId("g04-corr-link", this.repository.countCorrectionLinks()),
      tenantId: correcting.tenantId,
      entityId: correcting.entityId,
      originalSrEventId: original.srEventId,
      correctingSrEventId: correctingSrEvent.id,
      originalOutboxEventId: original.id,
      correctingOutboxEventId: correcting.id,
      leaveSpellLineageId: correcting.leaveSpellLineageId,
      correctionType: "REVERSAL",
      reasonCode: "LEAVE_CANCELLED",
      createdAt: this.clock().toISOString(),
    });
  }

  private resolveDeadLetter(scope: TenantScope, outboxEventId: string, state: "RESOLVED_REPLAYED" | "RESOLVED_DISCARDED"): void {
    const record = this.repository.findDeadLetterByOutboxId(scope, outboxEventId);
    if (record && record.state === "OPEN") {
      record.state = state;
    }
  }

  private buildFinding(
    scope: TenantScope,
    runId: string,
    offset: number,
    input: {
      employeeId: string;
      leaveApplicationId?: string;
      leaveSpellLineageId?: string;
      findingType: ReconciliationFindingType;
      severity: ReconciliationFinding["severity"];
      leaveSnapshot?: Record<string, unknown>;
      srSnapshot?: Record<string, unknown>;
    }
  ): ReconciliationFinding {
    return {
      id: nextId("g04-recon-finding", this.repository.countReconciliationFindings() + offset),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      runId,
      employeeId: input.employeeId,
      leaveApplicationId: input.leaveApplicationId,
      leaveSpellLineageId: input.leaveSpellLineageId,
      findingType: input.findingType,
      severity: input.severity,
      leaveSnapshot: input.leaveSnapshot,
      srSnapshot: input.srSnapshot,
      remediationState: "OPEN",
    };
  }

  private requireOutbox(scope: TenantScope, outboxEventId: string): LeaveSrOutboxEvent {
    const event = this.repository.findOutboxEvent(scope, outboxEventId);
    if (!event) {
      throw new FoundationError("NOT_FOUND", "G04 outbox event not found");
    }
    return event;
  }

  private clone(event: LeaveSrOutboxEvent): LeaveSrOutboxEvent {
    return { ...event, payload: { ...event.payload } };
  }
}

function parseFactKeyApplicationId(factKey: string): string | undefined {
  const match = /^G03:(.+):LEAVE_(?:APPROVED|CANCELLED)$/.exec(factKey);
  return match?.[1];
}
