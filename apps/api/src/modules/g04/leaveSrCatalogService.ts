import { createHash } from "node:crypto";
import { JobRun, JobService } from "../../jobs/jobService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope, stableStringify } from "../../platform/types";
import type { LeaveSrRelayRepository } from "./leaveSrRelayRepository";
import type { LeaveSrOutboxEvent } from "./leaveSrRelayService";
import { InMemoryLeaveSrCatalogRepository, LeaveSrCatalogRepository } from "./leaveSrCatalogRepository";

/**
 * PH-16C — G04 statutory catalog, partition leasing, and pre-pension certification
 * (docs/brd/v3/G04-leave-sr-integration.md FR-02 / FR-15 / FR-18):
 *   - E9  sr_event_mapping: versioned DRAFT/PUBLISHED/RETIRED catalog; PUBLISHED versions
 *     are immutable (changes create a new version); publish rejects intersecting PUBLISHED
 *     effective ranges with ERR-G04-MAPPING-OVERLAP (409, VAL-G04-MAPCOVER); a POST_SR
 *     mapping without statutory_rule_ref is rejected fail-closed with VAL-G04-CITATION (422);
 *     the relay resolves the mapping ONCE at first claim and persists pinned_mapping_version.
 *   - E18 relay_partition_lease: per-partition in-order claims carrying claimed_at /
 *     lease_expires_at; one ACTIVE lease per partition, never double-claimed.
 *   - JOB-G04-REAPER: returns expired IN_FLIGHT events to retry-eligible with attempt_count
 *     incremented and flips stale ACTIVE leases to EXPIRED; a live lease is never reaped.
 *   - E21 prepension_certificate: append-only, SHA-256-checksummed G11 gate input; PASS only
 *     when open_high_critical_findings = 0 AND provisional_entries_remaining = 0 AND lineage
 *     is complete; a FAIL certificate names the blocking counts.
 */

export type SrMappingEventType = "APPROVED" | "CANCELLED" | "AMENDED";
export type SrMappingDisposition = "POST_SR" | "EXCLUDED_NON_SR";
export type SrMappingStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
export type QualifyingServiceRule = "QUALIFYING" | "NON_QUALIFYING" | "PARTIAL" | "RULE_REF";
export type StraddleHandling = "SPLIT_BY_EFFECTIVE" | "PIN_TO_SPELL_START";

/** BRD G04 §8 registered validation id: POST_SR requires a statutory citation (surfaced as the error code, 422). */
export const VAL_G04_CITATION = "VAL-G04-CITATION";
/** BRD G04 FR-02 AC3 registered error code: overlapping PUBLISHED effective ranges (409). */
export const ERR_G04_MAPPING_OVERLAP = "ERR-G04-MAPPING-OVERLAP";
/** BRD G04 FR-15 job id: the stuck-in-flight reaper on the X.1 runner. */
export const JOB_G04_REAPER = "JOB-G04-REAPER";

/** E9 sr_event_mapping version row (docs/data-model/04-*.sql SECTION 3). */
export interface SrEventMappingVersion {
  id: string;
  tenantId: string;
  entityId?: string;
  /** Monotonic per (leave_type_code, event_type); the value pinned in-flight. */
  mappingVersion: number;
  leaveTypeCode: string;
  eventType: SrMappingEventType;
  disposition: SrMappingDisposition;
  /** G12-published target code (EL_AVAILED/LWP_SPELL…); required for POST_SR, absent when EXCLUDED. */
  srEntryType?: string;
  qualifyingServiceRule?: QualifyingServiceRule;
  /** Mandatory statutory citation for every POST_SR mapping (VAL-G04-CITATION). */
  statutoryRuleRef?: string;
  straddleHandling: StraddleHandling;
  annotationTemplate?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: SrMappingStatus;
  createdAt: string;
  publishedAt?: string;
  retiredAt?: string;
}

/** E18 relay_partition_lease row (docs/data-model/04-*.sql SECTION 12). */
export interface RelayPartitionLease {
  id: string;
  tenantId: string;
  entityId?: string;
  partitionKey: string;
  ownerWorkerId: string;
  acquiredAt: string;
  /** Visibility timeout; JOB-G04-REAPER reclaims once passed. */
  leaseExpiresAt: string;
  lastProcessedSequence?: number;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
}

/**
 * E16 historical_leave_record slice (adjudication only): a migrated entry stays PROVISIONAL
 * until adjudicated; the pre-pension gate counts the remainder (FR-18 BR-18.1 / FR-11 BR-11.4).
 */
export interface HistoricalLeaveRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  leaveTypeCode: string;
  daysCount: number;
  /** Frozen g04_record_adjudication_state values (docs/data-model/04-*.sql). */
  adjudicationState: "PROVISIONAL" | "ADJUDICATED_CONFIRMED" | "ADJUDICATED_REJECTED";
  recordedAt: string;
  adjudicatedAt?: string;
}

/**
 * E21 prepension_certificate row (docs/data-model/04-*.sql SECTION 15). Append-only:
 * the only post-insert mutation is stamping consumed_by_g11_at (FR-18 AC5).
 */
export interface PrepensionCertificate {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  /** The completed PRE_PENSION reconciliation_run the certificate was generated from. */
  runId: string;
  openHighCriticalFindings: number;
  totalNonQualifyingDays: number;
  lineageComplete: boolean;
  provisionalEntriesRemaining: number;
  result: "PASS" | "FAIL";
  /** SHA-256 hex over the certified evidence bundle (never a constant). */
  checksum: string;
  signedBy: string;
  signedAt: string;
  /** Stamped when G11 gates pension processing on this certificate. */
  consumedByG11At?: string;
  /**
   * The certified evidence bundle the checksum covers, keyed by the frozen DDL column
   * names. A FAIL certificate's blocking counts live here (FR-18 AC2).
   */
  evidence: {
    employee_id: string;
    run_id: string;
    open_high_critical_findings: number;
    provisional_entries_remaining: number;
    lineage_complete: boolean;
    total_non_qualifying_days: number;
    result: "PASS" | "FAIL";
    open_finding_ids: string[];
    provisional_record_ids: string[];
    incomplete_lineage_ids: string[];
  };
}

export interface SrEventMappingDraftInput {
  leaveTypeCode: string;
  eventType: SrMappingEventType;
  disposition: SrMappingDisposition;
  srEntryType?: string;
  qualifyingServiceRule?: QualifyingServiceRule;
  statutoryRuleRef?: string;
  straddleHandling?: StraddleHandling;
  annotationTemplate?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface LeaveSrCatalogConfig {
  /**
   * Visibility timeout for a partition claim. Grounded in the E17 integration_config seed
   * (docs/data-model/04-*.sql: config_key 'lease_timeout_ms' = 120000) — config-driven per
   * BR-15.1, never an invented policy number.
   */
  leaseTimeoutMs?: number;
  /** Injectable clock for deterministic lease/reaper tests. */
  now?: () => Date;
}

const DEFAULT_LEASE_TIMEOUT_MS = 120_000;
const MAPPING_EVENT_TYPES: SrMappingEventType[] = ["APPROVED", "CANCELLED", "AMENDED"];
const DISPOSITIONS: SrMappingDisposition[] = ["POST_SR", "EXCLUDED_NON_SR"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class LeaveSrCatalogService {
  private readonly leaseTimeoutMs: number;
  private readonly clock: () => Date;

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    /** Shared with LeaveSrRelayService: the claim/reaper paths mutate the same outbox rows. */
    private readonly relayRepository: LeaveSrRelayRepository,
    private readonly repository: LeaveSrCatalogRepository = new InMemoryLeaveSrCatalogRepository(),
    config: LeaveSrCatalogConfig = {}
  ) {
    this.leaseTimeoutMs = config.leaseTimeoutMs ?? DEFAULT_LEASE_TIMEOUT_MS;
    this.clock = config.now ?? (() => new Date());
  }

  // =====================================================================================
  // FR-G04-02 — versioned sr_event_mapping catalog
  // =====================================================================================

  /** Create a DRAFT catalog version; the version number is allocated monotonically (max + 1). */
  createMappingDraft(actor: ActorContext, input: SrEventMappingDraftInput): SrEventMappingVersion {
    this.authorization.check(actor, "g04.mapping.write", actor);
    this.validateMappingShape(input);
    const mapping: SrEventMappingVersion = {
      id: nextId("g04-sr-mapping", this.repository.countMappings()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      mappingVersion: this.repository.maxMappingVersion(actor.tenantId, input.leaveTypeCode, input.eventType) + 1,
      leaveTypeCode: input.leaveTypeCode,
      eventType: input.eventType,
      disposition: input.disposition,
      srEntryType: input.srEntryType,
      qualifyingServiceRule: input.qualifyingServiceRule,
      statutoryRuleRef: input.statutoryRuleRef,
      straddleHandling: input.straddleHandling ?? "SPLIT_BY_EFFECTIVE",
      annotationTemplate: input.annotationTemplate,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      status: "DRAFT",
      createdAt: this.clock().toISOString(),
    };
    this.repository.insertMapping(mapping);
    this.audit.recordMutation(actor, {
      action: "G04_MAPPING_DRAFTED",
      subjectRef: `sr_event_mapping:${mapping.id}`,
      metadata: { leaveTypeCode: mapping.leaveTypeCode, eventType: mapping.eventType, mappingVersion: mapping.mappingVersion },
    });
    return { ...mapping };
  }

  /** Edit a DRAFT in place. A PUBLISHED version is immutable — changes create a new version. */
  editMappingDraft(actor: ActorContext, mappingId: string, patch: Partial<SrEventMappingDraftInput>): SrEventMappingVersion {
    this.authorization.check(actor, "g04.mapping.write", actor);
    const mapping = this.requireMapping(actor, mappingId);
    if (mapping.status !== "DRAFT") {
      throw new FoundationError("CONFLICT", "sr_event_mapping versions are immutable once PUBLISHED; create a new version instead", {
        details: { mappingId, status: mapping.status },
      });
    }
    const merged: SrEventMappingVersion = {
      ...mapping,
      ...patch,
      // The match key and version are frozen at draft creation; a different key is a new mapping.
      leaveTypeCode: mapping.leaveTypeCode,
      eventType: mapping.eventType,
      mappingVersion: mapping.mappingVersion,
    };
    this.validateMappingShape(merged);
    this.repository.updateMapping(merged);
    this.audit.recordMutation(actor, {
      action: "G04_MAPPING_DRAFT_EDITED",
      subjectRef: `sr_event_mapping:${merged.id}`,
      metadata: { mappingVersion: merged.mappingVersion },
    });
    return { ...merged };
  }

  /**
   * Publish a DRAFT version. Fail-closed guards, in order:
   *   1. VAL-G04-CITATION (422): a POST_SR mapping must carry statutory_rule_ref.
   *   2. ERR-G04-MAPPING-OVERLAP (409): no two PUBLISHED versions of the same
   *      (leave_type_code, event_type) may cover intersecting effective ranges.
   */
  publishMapping(actor: ActorContext, mappingId: string): SrEventMappingVersion {
    this.authorization.check(actor, "g04.mapping.publish", actor);
    const mapping = this.requireMapping(actor, mappingId);
    if (mapping.status !== "DRAFT") {
      throw new FoundationError("CONFLICT", "Only a DRAFT sr_event_mapping version can be published", {
        details: { mappingId, status: mapping.status },
      });
    }
    this.requireCitation(mapping);
    const conflicting = this.repository
      .listMappings(actor, { leaveTypeCode: mapping.leaveTypeCode, eventType: mapping.eventType })
      .filter((candidate) => candidate.status === "PUBLISHED" && rangesIntersect(mapping, candidate));
    if (conflicting.length > 0) {
      throw new FoundationError(ERR_G04_MAPPING_OVERLAP, "A PUBLISHED sr_event_mapping already covers an intersecting effective range", {
        details: {
          leaveTypeCode: mapping.leaveTypeCode,
          eventType: mapping.eventType,
          effectiveFrom: mapping.effectiveFrom,
          effectiveTo: mapping.effectiveTo ?? null,
          conflictingMappingIds: conflicting.map((candidate) => candidate.id),
        },
      });
    }
    mapping.status = "PUBLISHED";
    mapping.publishedAt = this.clock().toISOString();
    this.repository.updateMapping(mapping);
    this.audit.recordMutation(actor, {
      action: "G04_MAPPING_PUBLISHED",
      subjectRef: `sr_event_mapping:${mapping.id}`,
      metadata: { leaveTypeCode: mapping.leaveTypeCode, eventType: mapping.eventType, mappingVersion: mapping.mappingVersion },
    });
    return { ...mapping };
  }

  /** Retire a PUBLISHED version. In-flight events keep their pinned_mapping_version (FR-02 edge case). */
  retireMapping(actor: ActorContext, mappingId: string): SrEventMappingVersion {
    this.authorization.check(actor, "g04.mapping.publish", actor);
    const mapping = this.requireMapping(actor, mappingId);
    if (mapping.status !== "PUBLISHED") {
      throw new FoundationError("CONFLICT", "Only a PUBLISHED sr_event_mapping version can be retired", {
        details: { mappingId, status: mapping.status },
      });
    }
    mapping.status = "RETIRED";
    mapping.retiredAt = this.clock().toISOString();
    this.repository.updateMapping(mapping);
    this.audit.recordMutation(actor, {
      action: "G04_MAPPING_RETIRED",
      subjectRef: `sr_event_mapping:${mapping.id}`,
      metadata: { mappingVersion: mapping.mappingVersion },
    });
    return { ...mapping };
  }

  listMappings(scope: TenantScope, filter?: { leaveTypeCode?: string; eventType?: SrMappingEventType }): SrEventMappingVersion[] {
    requireTenantScope(scope);
    return this.repository.listMappings(scope, filter).map((mapping) => ({ ...mapping }));
  }

  /** Resolve the PUBLISHED mapping effective on a date; the highest version wins (FR-02 AC4). */
  resolveMapping(
    scope: TenantScope,
    input: { leaveTypeCode: string; eventType: SrMappingEventType; onDate: string }
  ): SrEventMappingVersion | undefined {
    requireTenantScope(scope);
    const candidates = this.repository
      .listMappings(scope, { leaveTypeCode: input.leaveTypeCode, eventType: input.eventType })
      .filter((mapping) => mapping.status === "PUBLISHED" && coversDate(mapping, input.onDate))
      .sort((a, b) => b.mappingVersion - a.mappingVersion);
    const winner = candidates[0];
    return winner ? { ...winner } : undefined;
  }

  // =====================================================================================
  // FR-G04-15 — relay_partition_lease claims + JOB-G04-REAPER
  // =====================================================================================

  /**
   * Acquire the partition lease and claim the partition's eligible outbox events strictly
   * in event_sequence order. Each claimed event moves to IN_FLIGHT with claimed_at and
   * lease_expires_at = now + lease_timeout, and its sr_event_mapping version is pinned
   * ONCE: a retry reuses the persisted pinned_mapping_version, never recomputing.
   */
  claimPartition(
    actor: ActorContext,
    input: { partitionKey: string; workerId: string }
  ): { lease: RelayPartitionLease; claimedEvents: LeaveSrOutboxEvent[] } {
    this.authorization.check(actor, "g04.relay.write", actor);
    const existing = this.repository.findActiveLease(actor, input.partitionKey);
    if (existing) {
      // Never double-claim: even an expired ACTIVE lease must be recovered by the reaper,
      // not silently stolen — the in-flight rows under it are still being settled.
      throw new FoundationError("CONFLICT", "Partition already holds an ACTIVE relay_partition_lease", {
        details: { partitionKey: input.partitionKey, leaseId: existing.id, leaseExpiresAt: existing.leaseExpiresAt },
      });
    }
    const now = this.clock();
    const lease: RelayPartitionLease = {
      id: nextId("g04-partition-lease", this.repository.countLeases()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      partitionKey: input.partitionKey,
      ownerWorkerId: input.workerId,
      acquiredAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + this.leaseTimeoutMs).toISOString(),
      status: "ACTIVE",
    };
    this.repository.insertLease(lease);

    // Partition key defaults to employee_id (leave_event_outbox.partition_key DDL comment).
    const eligible = this.relayRepository
      .listOutboxEvents(actor)
      .filter(
        (event) =>
          event.employeeId === input.partitionKey &&
          (event.status === "READY" || (event.status === "FAILED" && Date.parse(event.availableAt) <= now.getTime()))
      )
      .sort((a, b) => a.eventSequence - b.eventSequence);

    const claimedEvents: LeaveSrOutboxEvent[] = [];
    for (const event of eligible) {
      event.status = "IN_FLIGHT";
      event.claimedAt = now.toISOString();
      event.leaseExpiresAt = lease.leaseExpiresAt;
      if (event.pinnedMappingVersion === undefined) {
        this.pinMappingAtFirstClaim(actor, event);
      }
      if (event.status !== "IN_FLIGHT") {
        // MAPPING_MISSING dead-letter or EXCLUDED no-op: settled at claim, not carried in-flight.
        claimedEvents.push({ ...event, payload: { ...event.payload } });
        continue;
      }
      lease.lastProcessedSequence = event.eventSequence;
      claimedEvents.push({ ...event, payload: { ...event.payload } });
    }
    this.repository.updateLease(lease);
    this.audit.recordMutation(actor, {
      action: "G04_PARTITION_CLAIMED",
      subjectRef: `relay_partition_lease:${lease.id}`,
      metadata: {
        partitionKey: lease.partitionKey,
        workerId: lease.ownerWorkerId,
        leaseExpiresAt: lease.leaseExpiresAt,
        claimedCount: claimedEvents.length,
      },
    });
    return { lease: { ...lease }, claimedEvents };
  }

  /** Extend a live ACTIVE lease (FR-15 edge case: relay alive but slow — renewal, not reap). */
  renewLease(actor: ActorContext, leaseId: string): RelayPartitionLease {
    this.authorization.check(actor, "g04.relay.write", actor);
    const lease = this.requireLease(actor, leaseId);
    const now = this.clock();
    if (lease.status !== "ACTIVE" || Date.parse(lease.leaseExpiresAt) <= now.getTime()) {
      throw new FoundationError("PRECONDITION_FAILED", "Only a live ACTIVE relay_partition_lease can be renewed", {
        details: { leaseId, status: lease.status, leaseExpiresAt: lease.leaseExpiresAt },
      });
    }
    lease.leaseExpiresAt = new Date(now.getTime() + this.leaseTimeoutMs).toISOString();
    this.repository.updateLease(lease);
    // Renewal extends the visibility timeout of the rows claimed under this lease too.
    for (const event of this.relayRepository.listOutboxEvents(actor)) {
      if (event.status === "IN_FLIGHT" && event.employeeId === lease.partitionKey) {
        event.leaseExpiresAt = lease.leaseExpiresAt;
      }
    }
    return { ...lease };
  }

  /** Release the lease after the partition's claimed work is settled. */
  releaseLease(actor: ActorContext, leaseId: string): RelayPartitionLease {
    this.authorization.check(actor, "g04.relay.write", actor);
    const lease = this.requireLease(actor, leaseId);
    if (lease.status !== "ACTIVE") {
      return { ...lease };
    }
    lease.status = "RELEASED";
    this.repository.updateLease(lease);
    this.audit.recordMutation(actor, {
      action: "G04_PARTITION_RELEASED",
      subjectRef: `relay_partition_lease:${lease.id}`,
      metadata: { partitionKey: lease.partitionKey, lastProcessedSequence: lease.lastProcessedSequence ?? null },
    });
    return { ...lease };
  }

  listLeases(scope: TenantScope): RelayPartitionLease[] {
    requireTenantScope(scope);
    return this.repository.listLeases(scope).map((lease) => ({ ...lease }));
  }

  /**
   * JOB-G04-REAPER (FR-15): sweep IN_FLIGHT outbox events whose lease_expires_at has passed
   * back to FAILED (retry-eligible) with attempt_count incremented, and flip stale ACTIVE
   * leases to EXPIRED. Fail-closed both ways: an expired IN_FLIGHT row is never silently
   * lost, and a live lease (lease_expires_at still in the future) is never reaped.
   */
  runReaperSweep(actor: ActorContext, input: { runKey?: string } = {}): {
    job: JobRun;
    reapedEvents: LeaveSrOutboxEvent[];
    releasedLeases: RelayPartitionLease[];
  } {
    this.authorization.check(actor, "g04.relay.reap", actor);
    const now = this.clock();
    const run = this.jobs.start(actor, { jobId: JOB_G04_REAPER, runKey: input.runKey ?? now.toISOString() });

    const reapedEvents: LeaveSrOutboxEvent[] = [];
    for (const event of this.relayRepository.listOutboxEvents(actor)) {
      if (event.status !== "IN_FLIGHT") {
        continue;
      }
      if (!event.leaseExpiresAt || Date.parse(event.leaseExpiresAt) > now.getTime()) {
        continue; // live lease — never reaped
      }
      event.status = "FAILED";
      event.attempts += 1; // attempt_count = attempt_count + 1
      event.availableAt = now.toISOString(); // immediately retry-eligible
      event.claimedAt = undefined;
      event.leaseExpiresAt = undefined;
      event.lastError = "REAPED_EXPIRED_LEASE";
      reapedEvents.push({ ...event, payload: { ...event.payload } });
    }

    const releasedLeases: RelayPartitionLease[] = [];
    for (const lease of this.repository.listLeases(actor)) {
      if (lease.status !== "ACTIVE" || Date.parse(lease.leaseExpiresAt) > now.getTime()) {
        continue; // live lease — never reaped
      }
      lease.status = "EXPIRED";
      this.repository.updateLease(lease);
      releasedLeases.push({ ...lease });
    }

    const job = this.jobs.finish(actor, run.id, {
      rowsAffected: reapedEvents.length,
      outcomeDetail: {
        reaped_in_flight_count: reapedEvents.length,
        released_lease_count: releasedLeases.length,
      },
    });
    this.audit.recordMutation(actor, {
      action: "G04_REAPER_SWEEP",
      subjectRef: `jobs:${job.id}`,
      metadata: {
        reapedOutboxIds: reapedEvents.map((event) => event.id),
        releasedLeaseIds: releasedLeases.map((lease) => lease.id),
      },
    });
    return { job, reapedEvents, releasedLeases };
  }

  // =====================================================================================
  // FR-G04-18 — prepension_certificate
  // =====================================================================================

  /** Stage a migrated legacy entry; it counts against the PASS gate until adjudicated (FR-11/FR-18). */
  recordProvisionalMigratedEntry(
    actor: ActorContext,
    input: { employeeId: string; leaveTypeCode: string; daysCount: number }
  ): HistoricalLeaveRecord {
    this.authorization.check(actor, "g04.migration.write", actor);
    const record: HistoricalLeaveRecord = {
      id: nextId("g04-hist-leave", this.repository.countHistoricalRecords()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      leaveTypeCode: input.leaveTypeCode,
      daysCount: input.daysCount,
      adjudicationState: "PROVISIONAL",
      recordedAt: this.clock().toISOString(),
    };
    this.repository.insertHistoricalRecord(record);
    return { ...record };
  }

  /** Adjudicate a PROVISIONAL migrated entry; once adjudicated it stops blocking PASS. */
  adjudicateMigratedEntry(
    actor: ActorContext,
    recordId: string,
    state: "ADJUDICATED_CONFIRMED" | "ADJUDICATED_REJECTED"
  ): HistoricalLeaveRecord {
    this.authorization.check(actor, "g04.migration.write", actor);
    const record = this.repository.findHistoricalRecord(actor, recordId);
    if (!record) {
      throw new FoundationError("NOT_FOUND", "historical_leave_record not found");
    }
    if (record.adjudicationState !== "PROVISIONAL") {
      throw new FoundationError("CONFLICT", "Only a PROVISIONAL historical_leave_record can be adjudicated", {
        details: { recordId, adjudicationState: record.adjudicationState },
      });
    }
    record.adjudicationState = state;
    record.adjudicatedAt = this.clock().toISOString();
    this.repository.updateHistoricalRecord(record);
    return { ...record };
  }

  /**
   * Generate the pre-pension completeness certificate from a completed PRE_PENSION
   * reconciliation run. PASS requires open_high_critical_findings = 0 AND
   * provisional_entries_remaining = 0 AND complete lineage; anything else is a FAIL
   * certificate naming the blocking counts. The SHA-256 checksum covers the certified
   * evidence bundle. Append-only; G11 consumes it as a hard gate input.
   */
  issuePrepensionCertificate(actor: ActorContext, input: { employeeId: string; runId: string }): PrepensionCertificate {
    // FR-18 AC3: signer authority is the g04.prepension.sign capability flag.
    this.authorization.check(actor, "g04.prepension.sign", actor);
    const run = this.relayRepository.findReconciliationRun(actor, input.runId);
    if (!run) {
      throw new FoundationError("NOT_FOUND", "Reconciliation run not found");
    }
    if (run.runType !== "PRE_PENSION" || run.status !== "COMPLETED") {
      // FR-18 AC1: only a completed PRE_PENSION run can source a certificate.
      throw new FoundationError("PRECONDITION_FAILED", "A prepension_certificate requires a COMPLETED PRE_PENSION reconciliation run", {
        details: { runId: input.runId, runType: run.runType, status: run.status },
      });
    }

    // Gate input 1: open HIGH/CRITICAL reconciliation findings for the employee (any run).
    const openFindings = this.relayRepository
      .listReconciliationFindings(actor)
      .filter(
        (finding) =>
          finding.employeeId === input.employeeId &&
          (finding.severity === "HIGH" || finding.severity === "CRITICAL") &&
          finding.remediationState === "OPEN"
      );
    // Gate input 2: migrated entries still PROVISIONAL (FR-11 BR-11.4).
    const provisionalRecords = this.repository.listProvisionalRecords(actor, input.employeeId);
    // Gate input 3: lineage completeness — every outbox event for the employee is settled
    // (POSTED / EXCLUDED / DISCARDED); anything still pending or failed breaks lineage.
    const employeeEvents = this.relayRepository.listOutboxEvents(actor).filter((event) => event.employeeId === input.employeeId);
    const unsettled = employeeEvents.filter(
      (event) => event.status !== "POSTED" && event.status !== "EXCLUDED" && event.status !== "DISCARDED"
    );
    const lineageComplete = unsettled.length === 0;

    // total_non_qualifying_days (FR-18 AC4): net days over settled events whose PINNED
    // mapping version rules the spell NON_QUALIFYING — sourced solely from the catalog (BR-02.2).
    let totalNonQualifyingDays = 0;
    for (const event of employeeEvents) {
      if (event.status !== "POSTED" || event.pinnedMappingVersion === undefined || !event.leaveTypeCode) {
        continue;
      }
      const mapping = this.repository
        .listMappings(actor, { leaveTypeCode: event.leaveTypeCode, eventType: toMappingEventType(event.eventTypeCode) })
        .find((candidate) => candidate.mappingVersion === event.pinnedMappingVersion);
      if (mapping?.qualifyingServiceRule === "NON_QUALIFYING") {
        const days = typeof event.payload.daysCount === "number" ? event.payload.daysCount : 0;
        totalNonQualifyingDays += event.eventTypeCode === "LEAVE_CANCELLED" ? -days : days;
      }
    }

    const result: "PASS" | "FAIL" = openFindings.length === 0 && provisionalRecords.length === 0 && lineageComplete ? "PASS" : "FAIL";
    const evidence: PrepensionCertificate["evidence"] = {
      employee_id: input.employeeId,
      run_id: input.runId,
      open_high_critical_findings: openFindings.length,
      provisional_entries_remaining: provisionalRecords.length,
      lineage_complete: lineageComplete,
      total_non_qualifying_days: totalNonQualifyingDays,
      result,
      open_finding_ids: openFindings.map((finding) => finding.id),
      provisional_record_ids: provisionalRecords.map((record) => record.id),
      incomplete_lineage_ids: unsettled.map((event) => event.leaveSpellLineageId),
    };
    const certificate: PrepensionCertificate = {
      id: nextId("g04-prepension-cert", this.repository.countCertificates()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      runId: input.runId,
      openHighCriticalFindings: openFindings.length,
      totalNonQualifyingDays,
      lineageComplete,
      provisionalEntriesRemaining: provisionalRecords.length,
      result,
      // Real SHA-256 over the certified evidence bundle — never a constant (FR-18 AC3).
      checksum: createHash("sha256").update(stableStringify(evidence)).digest("hex"),
      signedBy: actor.userId,
      signedAt: this.clock().toISOString(),
      evidence,
    };
    this.repository.insertCertificate(certificate);
    this.audit.recordMutation(actor, {
      action: "G04_PREPENSION_CERTIFICATE_ISSUED",
      subjectRef: `prepension_certificate:${certificate.id}`,
      metadata: {
        employeeId: certificate.employeeId,
        runId: certificate.runId,
        result: certificate.result,
        checksum: certificate.checksum,
        open_high_critical_findings: certificate.openHighCriticalFindings,
        provisional_entries_remaining: certificate.provisionalEntriesRemaining,
      },
    });
    return this.cloneCertificate(certificate);
  }

  /** G11 retrieves the latest certificate for an employee (FR-18 AC5). */
  getLatestCertificate(scope: TenantScope, employeeId: string): PrepensionCertificate | undefined {
    requireTenantScope(scope);
    const certificates = this.repository.listCertificates(scope, employeeId);
    const latest = certificates[certificates.length - 1];
    return latest ? this.cloneCertificate(latest) : undefined;
  }

  listCertificates(scope: TenantScope, employeeId?: string): PrepensionCertificate[] {
    requireTenantScope(scope);
    return this.repository.listCertificates(scope, employeeId).map((certificate) => this.cloneCertificate(certificate));
  }

  /**
   * G11 gate consumption: stamps consumed_by_g11_at (once; idempotent thereafter). Only a
   * PASS certificate is a valid gate input — consuming a FAIL surfaces its blocking counts.
   */
  consumeCertificateForG11(actor: ActorContext, certificateId: string): PrepensionCertificate {
    this.authorization.check(actor, "g04.prepension.consume", actor);
    const certificate = this.repository.findCertificate(actor, certificateId);
    if (!certificate) {
      throw new FoundationError("NOT_FOUND", "prepension_certificate not found");
    }
    if (certificate.result !== "PASS") {
      throw new FoundationError("PRECONDITION_FAILED", "G11 can only gate on a PASS prepension_certificate; blockers remain", {
        details: {
          certificateId,
          open_high_critical_findings: certificate.openHighCriticalFindings,
          provisional_entries_remaining: certificate.provisionalEntriesRemaining,
          lineage_complete: certificate.lineageComplete,
        },
      });
    }
    const consumed = this.repository.markCertificateConsumed(actor, certificateId, this.clock().toISOString());
    this.audit.recordMutation(actor, {
      action: "G04_PREPENSION_CERTIFICATE_CONSUMED",
      subjectRef: `prepension_certificate:${certificateId}`,
      metadata: { consumedByG11At: consumed.consumedByG11At ?? null },
    });
    return this.cloneCertificate(consumed);
  }

  // =====================================================================================
  // internals
  // =====================================================================================

  /**
   * Resolve and persist the mapping version ONCE at first claim (BRD rule 3). Absent
   * POST_SR mapping for the leave type dead-letters MAPPING_MISSING (FR-02 AC4);
   * EXCLUDED_NON_SR settles the event as an EXCLUDED no-op.
   */
  private pinMappingAtFirstClaim(actor: ActorContext, event: LeaveSrOutboxEvent): void {
    const leaveTypeCode = event.leaveTypeCode;
    const mapping = leaveTypeCode
      ? this.resolveMapping(actor, {
          leaveTypeCode,
          eventType: toMappingEventType(event.eventTypeCode),
          onDate: event.eventDate,
        })
      : undefined;
    if (!mapping) {
      event.status = "DEAD_LETTERED";
      event.claimedAt = undefined;
      event.leaseExpiresAt = undefined;
      event.lastError = "MAPPING_MISSING";
      this.relayRepository.insertDeadLetter({
        id: nextId("g04-dlq", this.relayRepository.countDeadLetters()),
        tenantId: event.tenantId,
        entityId: event.entityId,
        outboxEventId: event.id,
        leaveSpellLineageId: event.leaveSpellLineageId,
        failureClass: "MAPPING_MISSING",
        lastErrorCode: "MAPPING_MISSING",
        lastErrorDetail: `No PUBLISHED POST_SR sr_event_mapping for (${leaveTypeCode ?? "?"}, ${toMappingEventType(event.eventTypeCode)}) effective ${event.eventDate}`,
        attemptsExhausted: event.attempts,
        state: "OPEN",
        createdAt: this.clock().toISOString(),
      });
      return;
    }
    // Pinned exactly once; retries and later publishes/retires never change it.
    event.pinnedMappingVersion = mapping.mappingVersion;
    if (mapping.disposition === "EXCLUDED_NON_SR") {
      event.status = "EXCLUDED";
      event.claimedAt = undefined;
      event.leaseExpiresAt = undefined;
    }
  }

  private validateMappingShape(input: SrEventMappingDraftInput): void {
    if (!input.leaveTypeCode) {
      throw new FoundationError("VALIDATION_FAILED", "leaveTypeCode is required", { field: "leaveTypeCode" });
    }
    if (!MAPPING_EVENT_TYPES.includes(input.eventType)) {
      throw new FoundationError("VALIDATION_FAILED", "eventType must be APPROVED, CANCELLED or AMENDED", { field: "eventType" });
    }
    if (!DISPOSITIONS.includes(input.disposition)) {
      throw new FoundationError("VALIDATION_FAILED", "disposition must be POST_SR or EXCLUDED_NON_SR", { field: "disposition" });
    }
    if (!DATE_ONLY.test(input.effectiveFrom) || (input.effectiveTo !== undefined && !DATE_ONLY.test(input.effectiveTo))) {
      throw new FoundationError("VALIDATION_FAILED", "effective dates must use YYYY-MM-DD", { field: "effectiveFrom" });
    }
    if (input.effectiveTo !== undefined && input.effectiveTo < input.effectiveFrom) {
      // VAL-EFFECTIVE (ck_sr_mapping_effective): effective_to >= effective_from.
      throw new FoundationError("VALIDATION_FAILED", "effectiveTo must not precede effectiveFrom", { field: "effectiveTo" });
    }
    if (input.disposition === "POST_SR" && !input.srEntryType) {
      // ck_sr_mapping_post_sr: a POST_SR mapping must carry a G12 target code.
      throw new FoundationError("VALIDATION_FAILED", "A POST_SR mapping requires sr_entry_type", { field: "srEntryType" });
    }
    if (input.disposition === "EXCLUDED_NON_SR" && input.srEntryType) {
      // ck_sr_mapping_excluded: EXCLUDED_NON_SR has no SR target type.
      throw new FoundationError("VALIDATION_FAILED", "An EXCLUDED_NON_SR mapping must not carry sr_entry_type", { field: "srEntryType" });
    }
    this.requireCitation(input);
  }

  /** VAL-G04-CITATION (fail-closed, 422): every POST_SR mapping carries statutory_rule_ref. */
  private requireCitation(input: Pick<SrEventMappingDraftInput, "disposition" | "statutoryRuleRef">): void {
    if (input.disposition === "POST_SR" && !input.statutoryRuleRef) {
      throw new FoundationError(VAL_G04_CITATION, "A POST_SR mapping requires a statutory_rule_ref citation", {
        field: "statutory_rule_ref",
      });
    }
  }

  private requireMapping(scope: TenantScope, mappingId: string): SrEventMappingVersion {
    const mapping = this.repository.findMapping(scope, mappingId);
    if (!mapping) {
      throw new FoundationError("NOT_FOUND", "sr_event_mapping version not found");
    }
    return mapping;
  }

  private requireLease(scope: TenantScope, leaseId: string): RelayPartitionLease {
    const lease = this.repository.findLease(scope, leaseId);
    if (!lease) {
      throw new FoundationError("NOT_FOUND", "relay_partition_lease not found");
    }
    return lease;
  }

  private cloneCertificate(certificate: PrepensionCertificate): PrepensionCertificate {
    return {
      ...certificate,
      evidence: {
        ...certificate.evidence,
        open_finding_ids: [...certificate.evidence.open_finding_ids],
        provisional_record_ids: [...certificate.evidence.provisional_record_ids],
        incomplete_lineage_ids: [...certificate.evidence.incomplete_lineage_ids],
      },
    };
  }
}

function toMappingEventType(eventTypeCode: LeaveSrOutboxEvent["eventTypeCode"]): SrMappingEventType {
  return eventTypeCode === "LEAVE_APPROVED" ? "APPROVED" : "CANCELLED";
}

/** Open-ended intervals intersect when each starts no later than the other ends. */
function rangesIntersect(
  a: { effectiveFrom: string; effectiveTo?: string },
  b: { effectiveFrom: string; effectiveTo?: string }
): boolean {
  return a.effectiveFrom <= (b.effectiveTo ?? "9999-12-31") && b.effectiveFrom <= (a.effectiveTo ?? "9999-12-31");
}

function coversDate(mapping: { effectiveFrom: string; effectiveTo?: string }, onDate: string): boolean {
  return mapping.effectiveFrom <= onDate && onDate <= (mapping.effectiveTo ?? "9999-12-31");
}
