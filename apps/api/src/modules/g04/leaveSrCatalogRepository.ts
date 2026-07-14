import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, inScope } from "../../platform/types";
import type {
  HistoricalLeaveRecord,
  PrepensionCertificate,
  RelayPartitionLease,
  SrEventMappingVersion,
} from "./leaveSrCatalogService";

/**
 * PH-16C repository contract consumed by LeaveSrCatalogService (migration 0030).
 * Owns the G04 statutory entities E9 sr_event_mapping (versioned DRAFT/PUBLISHED/RETIRED
 * catalog), E18 relay_partition_lease (per-partition in-order claim), E16
 * historical_leave_record (PROVISIONAL-until-adjudicated migrated entries — the
 * provisional_entries_remaining source FR-18 gates on), and E21 prepension_certificate
 * (append-only, checksummed G11 gate input).
 */
export interface LeaveSrCatalogRepository {
  countMappings(): number;
  insertMapping(mapping: SrEventMappingVersion): void;
  updateMapping(mapping: SrEventMappingVersion): void;
  findMapping(scope: TenantScope, mappingId: string): SrEventMappingVersion | undefined;
  listMappings(scope: TenantScope, filter?: { leaveTypeCode?: string; eventType?: string }): SrEventMappingVersion[];
  /** Highest mapping_version already allocated for (tenant, leave_type_code, event_type); 0 when none. */
  maxMappingVersion(tenantId: string, leaveTypeCode: string, eventType: string): number;
  countLeases(): number;
  insertLease(lease: RelayPartitionLease): void;
  updateLease(lease: RelayPartitionLease): void;
  findLease(scope: TenantScope, leaseId: string): RelayPartitionLease | undefined;
  /** The single ACTIVE lease for a partition, if any (uq_relay_lease_active). */
  findActiveLease(scope: TenantScope, partitionKey: string): RelayPartitionLease | undefined;
  listLeases(scope: TenantScope): RelayPartitionLease[];
  countHistoricalRecords(): number;
  insertHistoricalRecord(record: HistoricalLeaveRecord): void;
  updateHistoricalRecord(record: HistoricalLeaveRecord): void;
  findHistoricalRecord(scope: TenantScope, recordId: string): HistoricalLeaveRecord | undefined;
  /** Migrated entries still PROVISIONAL for the employee — must be empty for a PASS certificate. */
  listProvisionalRecords(scope: TenantScope, employeeId: string): HistoricalLeaveRecord[];
  countCertificates(): number;
  /** Append-only (BRD G04 integrity rule 4): certificates are inserted, never updated or deleted. */
  insertCertificate(certificate: PrepensionCertificate): void;
  /** The single allowed post-insert mutation: stamping consumed_by_g11_at (FR-18 AC5). */
  markCertificateConsumed(scope: TenantScope, certificateId: string, consumedAt: string): PrepensionCertificate;
  findCertificate(scope: TenantScope, certificateId: string): PrepensionCertificate | undefined;
  listCertificates(scope: TenantScope, employeeId?: string): PrepensionCertificate[];
}

/** In-memory implementation of the LeaveSrCatalogRepository interface, injectable for unit tests. */
export class InMemoryLeaveSrCatalogRepository implements LeaveSrCatalogRepository {
  private readonly mappings: SrEventMappingVersion[] = [];
  private readonly leases: RelayPartitionLease[] = [];
  private readonly historicalRecords: HistoricalLeaveRecord[] = [];
  private readonly certificates: PrepensionCertificate[] = [];

  countMappings(): number {
    return this.mappings.length;
  }

  insertMapping(mapping: SrEventMappingVersion): void {
    const duplicate = this.mappings.find(
      (item) =>
        item.tenantId === mapping.tenantId &&
        item.leaveTypeCode === mapping.leaveTypeCode &&
        item.eventType === mapping.eventType &&
        item.mappingVersion === mapping.mappingVersion
    );
    if (duplicate) {
      // Mirrors uq_sr_mapping_version UNIQUE (tenant, entity, leave_type_code, event_type, mapping_version).
      throw new FoundationError("CONFLICT", "sr_event_mapping version already allocated for this (leave_type_code, event_type)", {
        details: { leaveTypeCode: mapping.leaveTypeCode, eventType: mapping.eventType, mappingVersion: mapping.mappingVersion },
      });
    }
    this.mappings.push(mapping);
  }

  updateMapping(mapping: SrEventMappingVersion): void {
    const index = this.mappings.findIndex((item) => item.id === mapping.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "sr_event_mapping version not found");
    }
    this.mappings[index] = mapping;
  }

  findMapping(scope: TenantScope, mappingId: string): SrEventMappingVersion | undefined {
    return this.mappings.find((item) => item.id === mappingId && inScope(item, scope));
  }

  listMappings(scope: TenantScope, filter: { leaveTypeCode?: string; eventType?: string } = {}): SrEventMappingVersion[] {
    return this.mappings.filter(
      (item) =>
        inScope(item, scope) &&
        (!filter.leaveTypeCode || item.leaveTypeCode === filter.leaveTypeCode) &&
        (!filter.eventType || item.eventType === filter.eventType)
    );
  }

  maxMappingVersion(tenantId: string, leaveTypeCode: string, eventType: string): number {
    return this.mappings
      .filter((item) => item.tenantId === tenantId && item.leaveTypeCode === leaveTypeCode && item.eventType === eventType)
      .reduce((max, item) => Math.max(max, item.mappingVersion), 0);
  }

  countLeases(): number {
    return this.leases.length;
  }

  insertLease(lease: RelayPartitionLease): void {
    const active = this.leases.find(
      (item) => item.tenantId === lease.tenantId && item.partitionKey === lease.partitionKey && item.status === "ACTIVE"
    );
    if (active && lease.status === "ACTIVE") {
      // Mirrors uq_relay_lease_active: at most one ACTIVE lease per partition.
      throw new FoundationError("CONFLICT", "Partition already holds an ACTIVE relay_partition_lease", {
        details: { partitionKey: lease.partitionKey, leaseId: active.id },
      });
    }
    this.leases.push(lease);
  }

  updateLease(lease: RelayPartitionLease): void {
    const index = this.leases.findIndex((item) => item.id === lease.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "relay_partition_lease not found");
    }
    this.leases[index] = lease;
  }

  findLease(scope: TenantScope, leaseId: string): RelayPartitionLease | undefined {
    return this.leases.find((item) => item.id === leaseId && inScope(item, scope));
  }

  findActiveLease(scope: TenantScope, partitionKey: string): RelayPartitionLease | undefined {
    return this.leases.find((item) => inScope(item, scope) && item.partitionKey === partitionKey && item.status === "ACTIVE");
  }

  listLeases(scope: TenantScope): RelayPartitionLease[] {
    return this.leases.filter((item) => inScope(item, scope));
  }

  countHistoricalRecords(): number {
    return this.historicalRecords.length;
  }

  insertHistoricalRecord(record: HistoricalLeaveRecord): void {
    this.historicalRecords.push(record);
  }

  updateHistoricalRecord(record: HistoricalLeaveRecord): void {
    const index = this.historicalRecords.findIndex((item) => item.id === record.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "historical_leave_record not found");
    }
    this.historicalRecords[index] = record;
  }

  findHistoricalRecord(scope: TenantScope, recordId: string): HistoricalLeaveRecord | undefined {
    return this.historicalRecords.find((item) => item.id === recordId && inScope(item, scope));
  }

  listProvisionalRecords(scope: TenantScope, employeeId: string): HistoricalLeaveRecord[] {
    return this.historicalRecords.filter(
      (item) => inScope(item, scope) && item.employeeId === employeeId && item.adjudicationState === "PROVISIONAL"
    );
  }

  countCertificates(): number {
    return this.certificates.length;
  }

  insertCertificate(certificate: PrepensionCertificate): void {
    this.certificates.push(certificate);
  }

  markCertificateConsumed(scope: TenantScope, certificateId: string, consumedAt: string): PrepensionCertificate {
    const certificate = this.certificates.find((item) => item.id === certificateId && inScope(item, scope));
    if (!certificate) {
      throw new FoundationError("NOT_FOUND", "prepension_certificate not found");
    }
    if (!certificate.consumedByG11At) {
      certificate.consumedByG11At = consumedAt;
    }
    return certificate;
  }

  findCertificate(scope: TenantScope, certificateId: string): PrepensionCertificate | undefined {
    return this.certificates.find((item) => item.id === certificateId && inScope(item, scope));
  }

  listCertificates(scope: TenantScope, employeeId?: string): PrepensionCertificate[] {
    return this.certificates.filter((item) => inScope(item, scope) && (!employeeId || item.employeeId === employeeId));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G04 data model (docs/data-model/04-*.sql).
// Row shapes mirror migration 0030_g04_mapping_catalog_leases_prepension.sql. All SQL is
// parameterised ($1, $2, ...); multi-step writes (publish with overlap check, partition
// claim + pin, reaper sweep, certificate evaluate + insert) each run in one transaction.
// ---------------------------------------------------------------------------------------

const SELECT_MAPPING_COLUMNS =
  "id, tenant_id, entity_id, mapping_version, leave_type_code, event_type, disposition, sr_entry_type, " +
  "qualifying_service_rule, statutory_rule_ref, straddle_handling, annotation_template, effective_from, effective_to, status";

const INSERT_MAPPING =
  "INSERT INTO sr_event_mapping (tenant_id, entity_id, mapping_version, leave_type_code, event_type, disposition, sr_entry_type, qualifying_service_rule, statutory_rule_ref, straddle_handling, annotation_template, effective_from, effective_to, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'DRAFT') RETURNING " +
  SELECT_MAPPING_COLUMNS;

// Publish-time overlap probe (VAL-G04-MAPCOVER): any PUBLISHED version of the same
// (leave_type_code, event_type) whose effective range intersects. Locked FOR UPDATE so a
// concurrent publish of an overlapping draft cannot slip past the check.
const SELECT_PUBLISHED_OVERLAPS =
  "SELECT " + SELECT_MAPPING_COLUMNS + " FROM sr_event_mapping " +
  "WHERE tenant_id = $1 AND leave_type_code = $2 AND event_type = $3 AND status = 'PUBLISHED' AND is_deleted = false " +
  "AND effective_from <= COALESCE($5::date, 'infinity'::date) AND COALESCE(effective_to, 'infinity'::date) >= $4::date " +
  "FOR UPDATE";

const MARK_MAPPING_PUBLISHED =
  "UPDATE sr_event_mapping SET status = 'PUBLISHED', updated_at = now(), updated_by = $2 " +
  "WHERE id = $1 AND status = 'DRAFT' RETURNING " + SELECT_MAPPING_COLUMNS;

const MARK_MAPPING_RETIRED =
  "UPDATE sr_event_mapping SET status = 'RETIRED', updated_at = now(), updated_by = $2 " +
  "WHERE id = $1 AND status = 'PUBLISHED' RETURNING " + SELECT_MAPPING_COLUMNS;

const INSERT_LEASE =
  "INSERT INTO relay_partition_lease (tenant_id, entity_id, partition_key, owner_worker_id, acquired_at, lease_expires_at) " +
  "VALUES ($1, $2, $3, $4, now(), now() + ($5 * interval '1 millisecond')) " +
  "RETURNING id, tenant_id, entity_id, partition_key, owner_worker_id, acquired_at, lease_expires_at, last_processed_sequence, status";

// Claim + pin in one statement: eligible rows for the partition move to IN_FLIGHT with
// claimed_at/lease_expires_at, and pinned_mapping_version is resolved from the PUBLISHED
// catalog ONLY where still NULL (COALESCE) — a retry reuses the version pinned at first
// claim, never recomputing across retries or remaps (BRD rule 3, FR-G04-02 BR3).
const CLAIM_PARTITION_EVENTS =
  "UPDATE leave_event_outbox o SET status = 'IN_FLIGHT', claimed_at = now(), lease_expires_at = now() + ($3 * interval '1 millisecond'), " +
  "pinned_mapping_version = COALESCE(o.pinned_mapping_version, (" +
  "  SELECT m.mapping_version FROM sr_event_mapping m" +
  "  WHERE m.tenant_id = o.tenant_id AND m.leave_type_code = o.leave_type_code" +
  "    AND m.event_type = (CASE o.event_type WHEN 'LEAVE_APPROVED' THEN 'APPROVED' WHEN 'LEAVE_CANCELLED' THEN 'CANCELLED' ELSE 'AMENDED' END)" +
  "    AND m.status = 'PUBLISHED' AND m.is_deleted = false" +
  "    AND m.effective_from <= o.spell_start AND COALESCE(m.effective_to, 'infinity'::date) >= o.spell_start" +
  "  ORDER BY m.mapping_version DESC LIMIT 1" +
  ")), updated_at = now() " +
  "WHERE o.tenant_id = $1 AND o.partition_key = $2 AND o.status IN ('PENDING','FAILED') AND o.available_at <= now() " +
  "RETURNING id, event_sequence, pinned_mapping_version, status, claimed_at, lease_expires_at, attempt_count";

// JOB-G04-REAPER: only rows whose lease_expires_at has passed return to retry-eligible with
// attempt_count incremented; live IN_FLIGHT rows never match the predicate (fail-closed).
const REAP_EXPIRED_IN_FLIGHT =
  "UPDATE leave_event_outbox SET status = 'FAILED', attempt_count = attempt_count + 1, available_at = now(), " +
  "claimed_at = NULL, lease_expires_at = NULL, updated_at = now() " +
  "WHERE tenant_id = $1 AND status = 'IN_FLIGHT' AND lease_expires_at <= now() " +
  "RETURNING id, event_sequence, pinned_mapping_version, status, attempt_count";

const RELEASE_EXPIRED_LEASES =
  "UPDATE relay_partition_lease SET status = 'EXPIRED', updated_at = now() " +
  "WHERE tenant_id = $1 AND status = 'ACTIVE' AND lease_expires_at <= now() " +
  "RETURNING id, partition_key, owner_worker_id, lease_expires_at, status";

const INSERT_CERTIFICATE =
  "INSERT INTO prepension_certificate (tenant_id, entity_id, employee_id, run_id, open_high_critical_findings, total_non_qualifying_days, lineage_complete, provisional_entries_remaining, result, checksum, signed_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, employee_id, run_id, open_high_critical_findings, total_non_qualifying_days, lineage_complete, provisional_entries_remaining, result, checksum, signed_by, signed_at, consumed_by_g11_at";

// FR-18 gate inputs, read inside the certificate transaction: open HIGH/CRITICAL
// reconciliation findings and remaining PROVISIONAL migrated entries for the employee.
const COUNT_OPEN_HIGH_CRITICAL_FINDINGS =
  "SELECT count(*)::int AS open_high_critical_findings FROM reconciliation_finding " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND severity IN ('HIGH','CRITICAL') AND remediation_state = 'OPEN'";

const COUNT_PROVISIONAL_REMAINING =
  "SELECT count(*)::int AS provisional_entries_remaining FROM historical_leave_record " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND adjudication_state = 'PROVISIONAL'";

const MARK_CERTIFICATE_CONSUMED =
  "UPDATE prepension_certificate SET consumed_by_g11_at = COALESCE(consumed_by_g11_at, now()), updated_at = now() " +
  "WHERE id = $1 AND tenant_id = $2 " +
  "RETURNING id, tenant_id, entity_id, employee_id, run_id, open_high_critical_findings, total_non_qualifying_days, lineage_complete, provisional_entries_remaining, result, checksum, signed_by, signed_at, consumed_by_g11_at";

export interface SrEventMappingRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  mapping_version: number;
  leave_type_code: string;
  event_type: string;
  disposition: string;
  sr_entry_type: string | null;
  statutory_rule_ref: string | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
}

export interface PrepensionCertificateRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  employee_id: string;
  run_id: string;
  open_high_critical_findings: number;
  total_non_qualifying_days: string;
  lineage_complete: boolean;
  provisional_entries_remaining: number;
  result: string;
  checksum: string;
  signed_by: string;
  signed_at: Date;
  consumed_by_g11_at: Date | null;
}

/**
 * Postgres-backed G04 catalog repository over the migration-0030 tables sr_event_mapping,
 * relay_partition_lease, historical_leave_record and prepension_certificate.
 */
export class PgLeaveSrCatalogRepository {
  constructor(private readonly pool: Pool) {}

  async insertMappingDraft(input: {
    tenantId: string;
    entityId: string;
    mappingVersion: number;
    leaveTypeCode: string;
    eventType: string;
    disposition: string;
    srEntryType?: string;
    qualifyingServiceRule?: string;
    statutoryRuleRef?: string;
    straddleHandling: string;
    annotationTemplate?: string;
    effectiveFrom: string;
    effectiveTo?: string;
  }): Promise<SrEventMappingRow> {
    const result = await this.pool.query(INSERT_MAPPING, [
      input.tenantId,
      input.entityId,
      input.mappingVersion,
      input.leaveTypeCode,
      input.eventType,
      input.disposition,
      input.srEntryType ?? null,
      input.qualifyingServiceRule ?? null,
      input.statutoryRuleRef ?? null,
      input.straddleHandling,
      input.annotationTemplate ?? null,
      input.effectiveFrom,
      input.effectiveTo ?? null,
    ]);
    return result.rows[0] as SrEventMappingRow;
  }

  /**
   * Publish a DRAFT version in ONE transaction: lock PUBLISHED siblings, reject intersecting
   * effective ranges with ERR-G04-MAPPING-OVERLAP (409), then flip DRAFT -> PUBLISHED.
   */
  async publishMapping(
    mapping: { id: string; tenantId: string; leaveTypeCode: string; eventType: string; effectiveFrom: string; effectiveTo?: string },
    publishedBy: string
  ): Promise<SrEventMappingRow> {
    return withTransaction(this.pool, async (client) => {
      const overlaps = await client.query(SELECT_PUBLISHED_OVERLAPS, [
        mapping.tenantId,
        mapping.leaveTypeCode,
        mapping.eventType,
        mapping.effectiveFrom,
        mapping.effectiveTo ?? null,
      ]);
      if ((overlaps.rowCount ?? 0) > 0) {
        throw new FoundationError("ERR-G04-MAPPING-OVERLAP", "A PUBLISHED sr_event_mapping already covers an intersecting effective range", {
          details: {
            leaveTypeCode: mapping.leaveTypeCode,
            eventType: mapping.eventType,
            conflictingMappingIds: (overlaps.rows as SrEventMappingRow[]).map((row) => row.id),
          },
        });
      }
      const published = await client.query(MARK_MAPPING_PUBLISHED, [mapping.id, publishedBy]);
      if ((published.rowCount ?? 0) === 0) {
        throw new FoundationError("CONFLICT", "Only a DRAFT sr_event_mapping version can be published");
      }
      return published.rows[0] as SrEventMappingRow;
    });
  }

  async retireMapping(mappingId: string, retiredBy: string): Promise<SrEventMappingRow> {
    const result = await this.pool.query(MARK_MAPPING_RETIRED, [mappingId, retiredBy]);
    if ((result.rowCount ?? 0) === 0) {
      throw new FoundationError("CONFLICT", "Only a PUBLISHED sr_event_mapping version can be retired");
    }
    return result.rows[0] as SrEventMappingRow;
  }

  /**
   * Acquire the partition lease and claim its backoff-ready events in ONE transaction:
   * lease insert (uq_relay_lease_active rejects a double claim) + IN_FLIGHT transition with
   * claimed_at/lease_expires_at + pin of pinned_mapping_version only where still NULL.
   */
  async claimPartition(input: {
    tenantId: string;
    entityId: string;
    partitionKey: string;
    ownerWorkerId: string;
    leaseTimeoutMs: number;
  }): Promise<{ lease: Record<string, unknown>; claimed: Array<Record<string, unknown>> }> {
    return withTransaction(this.pool, async (client) => {
      const lease = await client.query(INSERT_LEASE, [
        input.tenantId,
        input.entityId,
        input.partitionKey,
        input.ownerWorkerId,
        input.leaseTimeoutMs,
      ]);
      const claimed = await client.query(CLAIM_PARTITION_EVENTS, [
        input.tenantId,
        input.partitionKey,
        input.leaseTimeoutMs,
      ]);
      return { lease: lease.rows[0] as Record<string, unknown>, claimed: claimed.rows as Array<Record<string, unknown>> };
    });
  }

  /**
   * JOB-G04-REAPER sweep in ONE transaction: expired IN_FLIGHT rows return to FAILED
   * (retry-eligible, attempt_count incremented) and stale ACTIVE leases flip to EXPIRED.
   */
  async reapExpired(tenantId: string): Promise<{ reaped: Array<Record<string, unknown>>; released: Array<Record<string, unknown>> }> {
    return withTransaction(this.pool, async (client) => {
      const reaped = await client.query(REAP_EXPIRED_IN_FLIGHT, [tenantId]);
      const released = await client.query(RELEASE_EXPIRED_LEASES, [tenantId]);
      return { reaped: reaped.rows as Array<Record<string, unknown>>, released: released.rows as Array<Record<string, unknown>> };
    });
  }

  /**
   * Evaluate the FR-18 gate and append the certificate in ONE transaction so the counted
   * evidence (open_high_critical_findings, provisional_entries_remaining) cannot drift
   * between evaluation and insert.
   */
  async insertCertificate(input: {
    tenantId: string;
    entityId: string;
    employeeId: string;
    runId: string;
    totalNonQualifyingDays: number;
    lineageComplete: boolean;
    checksumOf: (evidence: { openHighCriticalFindings: number; provisionalEntriesRemaining: number }) => string;
    signedBy: string;
  }): Promise<PrepensionCertificateRow> {
    return withTransaction(this.pool, async (client) => {
      const findings = await client.query(COUNT_OPEN_HIGH_CRITICAL_FINDINGS, [input.tenantId, input.employeeId]);
      const provisional = await client.query(COUNT_PROVISIONAL_REMAINING, [input.tenantId, input.employeeId]);
      const openHighCriticalFindings = (findings.rows[0] as { open_high_critical_findings: number }).open_high_critical_findings;
      const provisionalEntriesRemaining = (provisional.rows[0] as { provisional_entries_remaining: number }).provisional_entries_remaining;
      const result = openHighCriticalFindings === 0 && provisionalEntriesRemaining === 0 && input.lineageComplete ? "PASS" : "FAIL";
      const inserted = await client.query(INSERT_CERTIFICATE, [
        input.tenantId,
        input.entityId,
        input.employeeId,
        input.runId,
        openHighCriticalFindings,
        input.totalNonQualifyingDays,
        input.lineageComplete,
        provisionalEntriesRemaining,
        result,
        input.checksumOf({ openHighCriticalFindings, provisionalEntriesRemaining }),
        input.signedBy,
      ]);
      return inserted.rows[0] as PrepensionCertificateRow;
    });
  }

  async markCertificateConsumed(certificateId: string, tenantId: string): Promise<PrepensionCertificateRow> {
    const result = await this.pool.query(MARK_CERTIFICATE_CONSUMED, [certificateId, tenantId]);
    if ((result.rowCount ?? 0) === 0) {
      throw new FoundationError("NOT_FOUND", "prepension_certificate not found");
    }
    return result.rows[0] as PrepensionCertificateRow;
  }
}
