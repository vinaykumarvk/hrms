import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, inScope } from "../../platform/types";

// -----------------------------------------------------------------------------------------
// PH-16A — G01 identity-ops persistence contract (FR-EPM-015/017/018).
// Entities per docs/data-model/01-G01-employee-profile.sql:
//   E19  dedup_candidates          — deterministic + fuzzy match queue (score 0-100, HIGH >= 90)
//   E20a employee_import_batches   — two-phase bulk import (validation_profile STRICT|MIGRATION)
//   E20b import_staging_rows       — raw rows marked VALID/PROVISIONAL/ERROR, remediation_state
//   E21  employee_id_aliases       — loser_id -> survivor_id with merge_snapshot + undo window
//   E31  legal_holds               — ACTIVE hold blocks archive (LEGAL_HOLD_ACTIVE)
// The migration DDL ships in apps/api/db/migrations/0028_g01_dedup_import_lifecycle.sql.
// -----------------------------------------------------------------------------------------

export type DedupCandidateStatus = "OPEN" | "MERGED" | "DISMISSED";

export interface DedupCandidate {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeAId: string;
  employeeBId: string;
  /** FR-EPM-015 AC1: 0-100 composite; exact statutory-ID match scores HIGH (>= 90). */
  matchScore: number;
  matchedAttributes: string[];
  band: "HIGH" | "REVIEW";
  status: DedupCandidateStatus;
  /** FR-EPM-015 AC6: a dismissed pair is not re-raised unless its matched attributes change. */
  attributeFingerprint: string;
  /** 4-eyes: the maker's merge request awaiting a different checker (SOD_VIOLATION otherwise). */
  mergeRequest?: { makerUserId: string; survivorId: string; override: boolean; requestedAt: string };
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  rowVersion: number;
}

export interface EmployeeIdAlias {
  id: string;
  tenantId: string;
  entityId?: string;
  loserId: string;
  survivorId: string;
  dedupCandidateId?: string;
  mergedAt: string;
  mergedBy: string;
  approvedBy: string;
  /** FR-EPM-015 AC5: undo allowed strictly before this instant (configurable window, default 7 days). */
  mergeableBackUntil: string;
  isReversed: boolean;
  /** Restores the loser row + re-points exactly the moved satellite rows on undo. */
  mergeSnapshot: {
    loser: Record<string, unknown>;
    movedSatellites: { contactIds: string[]; addressIds: string[]; dependentIds: string[] };
  };
  rowVersion: number;
}

export type ImportValidationProfile = "STRICT" | "MIGRATION";
export type ImportBatchStatus = "UPLOADED" | "VALIDATING" | "VALIDATED" | "COMMITTING" | "COMMITTED" | "FAILED" | "ROLLED_BACK";
export type ImportRowStatus = "VALID" | "PROVISIONAL" | "ERROR" | "COMMITTED" | "SKIPPED";

export interface EmployeeImportBatch {
  id: string;
  tenantId: string;
  entityId?: string;
  templateVersion: string;
  validationProfile: ImportValidationProfile;
  totalRows: number;
  validRows: number;
  provisionalRows: number;
  errorRows: number;
  status: ImportBatchStatus;
  committedAt?: string;
  committedBy?: string;
  rowVersion: number;
}

export interface ImportStagingRow {
  id: string;
  tenantId: string;
  entityId?: string;
  batchId: string;
  rowNumber: number;
  rawPayload: Record<string, unknown>;
  validationStatus: ImportRowStatus;
  validationErrors: { field: string; message: string }[];
  /** FR-EPM-017 AC5: PROVISIONAL commits land in the manual remediation queue as QUEUED. */
  remediationState?: "QUEUED" | "RESOLVED";
  resolvedEmployeeId?: string;
  dedupMatchedEmployeeId?: string;
  rowVersion: number;
}

export interface EmployeeLegalHold {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  holdType: "DISCIPLINARY" | "LITIGATION" | "PENSION" | "AUDIT" | "RTI";
  reason: string;
  status: "ACTIVE" | "RELEASED";
  placedBy: string;
  placedAt: string;
  releasedBy?: string;
  releasedAt?: string;
}

/** FR-EPM-018 BR: separation requires no open blocking obligations unless overridden. */
export interface BlockingObligation {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  description: string;
  status: "OPEN" | "CLEARED";
}

export type SeparationTargetStatus = "RETIRED" | "RESIGNED" | "TERMINATED" | "DECEASED";

/** FR-EPM-018 AC1: maker initiates (PENDING), a different checker approves (maker != checker). */
export interface SeparationRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  targetStatus: SeparationTargetStatus;
  separationDate: string;
  separationReason: string;
  makerUserId: string;
  status: "PENDING" | "APPROVED";
  approvedBy?: string;
}

export interface EmployeeIdentityOpsRepository {
  // E19 dedup_candidates
  countCandidates(): number;
  saveCandidate(candidate: DedupCandidate): void;
  findCandidate(scope: TenantScope, candidateId: string): DedupCandidate | undefined;
  findCandidateByPair(scope: TenantScope, employeeAId: string, employeeBId: string): DedupCandidate | undefined;
  listCandidates(scope: TenantScope, status?: DedupCandidateStatus): DedupCandidate[];
  // E21 employee_id_aliases
  countAliases(): number;
  saveAlias(alias: EmployeeIdAlias): void;
  findAlias(scope: TenantScope, aliasId: string): EmployeeIdAlias | undefined;
  findActiveAliasByLoser(scope: TenantScope, loserId: string): EmployeeIdAlias | undefined;
  // E20a/E20b import batches + staging rows
  countBatches(): number;
  countStagingRows(): number;
  saveBatch(batch: EmployeeImportBatch): void;
  findBatch(scope: TenantScope, batchId: string): EmployeeImportBatch | undefined;
  saveStagingRow(row: ImportStagingRow): void;
  listStagingRows(scope: TenantScope, batchId: string): ImportStagingRow[];
  listRemediationRows(scope: TenantScope, state: "QUEUED" | "RESOLVED"): ImportStagingRow[];
  findStagingRowByEmployee(scope: TenantScope, employeeId: string): ImportStagingRow | undefined;
  // E31 legal_holds (employee-scoped)
  countLegalHolds(): number;
  saveLegalHold(hold: EmployeeLegalHold): void;
  findLegalHold(scope: TenantScope, holdId: string): EmployeeLegalHold | undefined;
  hasActiveLegalHold(scope: TenantScope, employeeId: string): boolean;
  // blocking obligations (FR-EPM-018 BR)
  countObligations(): number;
  saveObligation(obligation: BlockingObligation): void;
  findObligation(scope: TenantScope, obligationId: string): BlockingObligation | undefined;
  hasOpenObligations(scope: TenantScope, employeeId: string): boolean;
  // separation requests (maker != checker)
  countSeparationRequests(): number;
  saveSeparationRequest(request: SeparationRequest): void;
  findPendingSeparation(scope: TenantScope, employeeId: string): SeparationRequest | undefined;
}

/** In-memory implementation, injectable for unit tests (mirrors the PH-07A repository pattern). */
export class InMemoryEmployeeIdentityOpsRepository implements EmployeeIdentityOpsRepository {
  private readonly candidates: DedupCandidate[] = [];
  private readonly aliases: EmployeeIdAlias[] = [];
  private readonly batches: EmployeeImportBatch[] = [];
  private readonly stagingRows: ImportStagingRow[] = [];
  private readonly legalHolds: EmployeeLegalHold[] = [];
  private readonly obligations: BlockingObligation[] = [];
  private readonly separationRequests: SeparationRequest[] = [];

  countCandidates(): number {
    return this.candidates.length;
  }

  saveCandidate(candidate: DedupCandidate): void {
    const index = this.candidates.findIndex((item) => item.id === candidate.id);
    if (index >= 0) {
      this.candidates[index] = candidate;
    } else {
      this.candidates.push(candidate);
    }
  }

  findCandidate(scope: TenantScope, candidateId: string): DedupCandidate | undefined {
    return this.candidates.find((item) => inScope(item, scope) && item.id === candidateId);
  }

  findCandidateByPair(scope: TenantScope, employeeAId: string, employeeBId: string): DedupCandidate | undefined {
    return this.candidates.find(
      (item) =>
        inScope(item, scope) &&
        ((item.employeeAId === employeeAId && item.employeeBId === employeeBId) ||
          (item.employeeAId === employeeBId && item.employeeBId === employeeAId))
    );
  }

  listCandidates(scope: TenantScope, status?: DedupCandidateStatus): DedupCandidate[] {
    return this.candidates
      .filter((item) => inScope(item, scope) && (!status || item.status === status))
      .map((item) => ({ ...item, matchedAttributes: [...item.matchedAttributes] }));
  }

  countAliases(): number {
    return this.aliases.length;
  }

  saveAlias(alias: EmployeeIdAlias): void {
    const index = this.aliases.findIndex((item) => item.id === alias.id);
    if (index >= 0) {
      this.aliases[index] = alias;
    } else {
      this.aliases.push(alias);
    }
  }

  findAlias(scope: TenantScope, aliasId: string): EmployeeIdAlias | undefined {
    return this.aliases.find((item) => inScope(item, scope) && item.id === aliasId);
  }

  findActiveAliasByLoser(scope: TenantScope, loserId: string): EmployeeIdAlias | undefined {
    return this.aliases.find((item) => inScope(item, scope) && item.loserId === loserId && !item.isReversed);
  }

  countBatches(): number {
    return this.batches.length;
  }

  countStagingRows(): number {
    return this.stagingRows.length;
  }

  saveBatch(batch: EmployeeImportBatch): void {
    const index = this.batches.findIndex((item) => item.id === batch.id);
    if (index >= 0) {
      this.batches[index] = batch;
    } else {
      this.batches.push(batch);
    }
  }

  findBatch(scope: TenantScope, batchId: string): EmployeeImportBatch | undefined {
    return this.batches.find((item) => inScope(item, scope) && item.id === batchId);
  }

  saveStagingRow(row: ImportStagingRow): void {
    const index = this.stagingRows.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      this.stagingRows[index] = row;
    } else {
      this.stagingRows.push(row);
    }
  }

  listStagingRows(scope: TenantScope, batchId: string): ImportStagingRow[] {
    return this.stagingRows
      .filter((item) => inScope(item, scope) && item.batchId === batchId)
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .map((item) => ({ ...item, rawPayload: { ...item.rawPayload }, validationErrors: [...item.validationErrors] }));
  }

  listRemediationRows(scope: TenantScope, state: "QUEUED" | "RESOLVED"): ImportStagingRow[] {
    return this.stagingRows
      .filter((item) => inScope(item, scope) && item.remediationState === state)
      .map((item) => ({ ...item, rawPayload: { ...item.rawPayload }, validationErrors: [...item.validationErrors] }));
  }

  findStagingRowByEmployee(scope: TenantScope, employeeId: string): ImportStagingRow | undefined {
    return this.stagingRows.find((item) => inScope(item, scope) && item.resolvedEmployeeId === employeeId);
  }

  countLegalHolds(): number {
    return this.legalHolds.length;
  }

  saveLegalHold(hold: EmployeeLegalHold): void {
    const index = this.legalHolds.findIndex((item) => item.id === hold.id);
    if (index >= 0) {
      this.legalHolds[index] = hold;
    } else {
      this.legalHolds.push(hold);
    }
  }

  findLegalHold(scope: TenantScope, holdId: string): EmployeeLegalHold | undefined {
    return this.legalHolds.find((item) => inScope(item, scope) && item.id === holdId);
  }

  hasActiveLegalHold(scope: TenantScope, employeeId: string): boolean {
    return this.legalHolds.some((item) => inScope(item, scope) && item.employeeId === employeeId && item.status === "ACTIVE");
  }

  countObligations(): number {
    return this.obligations.length;
  }

  saveObligation(obligation: BlockingObligation): void {
    const index = this.obligations.findIndex((item) => item.id === obligation.id);
    if (index >= 0) {
      this.obligations[index] = obligation;
    } else {
      this.obligations.push(obligation);
    }
  }

  findObligation(scope: TenantScope, obligationId: string): BlockingObligation | undefined {
    return this.obligations.find((item) => inScope(item, scope) && item.id === obligationId);
  }

  hasOpenObligations(scope: TenantScope, employeeId: string): boolean {
    return this.obligations.some((item) => inScope(item, scope) && item.employeeId === employeeId && item.status === "OPEN");
  }

  countSeparationRequests(): number {
    return this.separationRequests.length;
  }

  saveSeparationRequest(request: SeparationRequest): void {
    const index = this.separationRequests.findIndex((item) => item.id === request.id);
    if (index >= 0) {
      this.separationRequests[index] = request;
    } else {
      this.separationRequests.push(request);
    }
  }

  findPendingSeparation(scope: TenantScope, employeeId: string): SeparationRequest | undefined {
    return this.separationRequests.find(
      (item) => inScope(item, scope) && item.employeeId === employeeId && item.status === "PENDING"
    );
  }
}

// -----------------------------------------------------------------------------------------
// Postgres-backed repository over migration 0028 (dedup_candidates, employee_id_aliases,
// employee_import_batches, import_staging_rows, legal_holds). All SQL is parameterised
// ($1, $2, ...); every multi-step write (merge, undo, commit chunk, separation apply) runs
// inside ONE BEGIN/COMMIT via withTransaction — a half-applied merge or import chunk cannot
// be committed.
// -----------------------------------------------------------------------------------------

const INSERT_CANDIDATE =
  "INSERT INTO dedup_candidates (tenant_id, entity_id, employee_a_id, employee_b_id, match_score, matched_attributes, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7) " +
  "ON CONFLICT (employee_a_id, employee_b_id) DO UPDATE SET match_score = EXCLUDED.match_score, matched_attributes = EXCLUDED.matched_attributes, updated_at = now() " +
  "RETURNING id, tenant_id, employee_a_id, employee_b_id, match_score, matched_attributes, status";

const MARK_CANDIDATE_MERGED =
  "UPDATE dedup_candidates SET status = 'MERGED', resolution = $3, resolved_by = $4, resolved_at = now(), row_version = row_version + 1, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'OPEN'";

const REOPEN_CANDIDATE =
  "UPDATE dedup_candidates SET status = 'OPEN', resolution = 'MERGE_UNDONE', row_version = row_version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2";

// FR-EPM-015 AC3: G01-owned satellites ONLY — never another module's foreign keys.
const REPOINT_CONTACTS =
  "UPDATE employee_contacts SET employee_id = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false RETURNING id";
const REPOINT_ADDRESSES =
  "UPDATE employee_addresses SET employee_id = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false RETURNING id";
const REPOINT_DEPENDENTS =
  "UPDATE employee_dependents SET employee_id = $3, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false RETURNING id";

const SOFT_DELETE_LOSER =
  "UPDATE employees SET is_deleted = true, row_version = row_version + 1, updated_at = now(), updated_by = $3 WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const RESTORE_LOSER =
  "UPDATE employees SET is_deleted = false, row_version = row_version + 1, updated_at = now(), updated_by = $3 WHERE tenant_id = $1 AND id = $2 AND is_deleted = true";

const INSERT_ALIAS =
  "INSERT INTO employee_id_aliases (tenant_id, entity_id, loser_id, survivor_id, dedup_candidate_id, merged_by, approved_by, mergeable_back_until, merge_snapshot, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8), $9, $6) " +
  "RETURNING id, tenant_id, loser_id, survivor_id, merged_at, mergeable_back_until, is_reversed";

const REVERSE_ALIAS =
  "UPDATE employee_id_aliases SET is_reversed = true, row_version = row_version + 1, updated_at = now(), updated_by = $3 " +
  "WHERE tenant_id = $1 AND id = $2 AND is_reversed = false AND mergeable_back_until > now()";

const SELECT_ALIAS_CHAIN =
  "SELECT loser_id, survivor_id FROM employee_id_aliases WHERE tenant_id = $1 AND is_reversed = false AND is_deleted = false";

const INSERT_MERGE_OUTBOX =
  "INSERT INTO outbox_events (tenant_id, entity_id, aggregate_id, event_type, payload, retention_until, created_by) " +
  "VALUES ($1, $2, $3, 'RECORDS_MERGED', $4, now() + make_interval(days => 365), $5) RETURNING event_id";

const INSERT_BATCH =
  "INSERT INTO employee_import_batches (tenant_id, entity_id, template_version, validation_profile, total_rows, status, created_by) " +
  "VALUES ($1, $2, $3, $4::g01_validation_profile, $5, 'UPLOADED', $6) RETURNING id";

const INSERT_STAGING_ROW =
  "INSERT INTO import_staging_rows (tenant_id, entity_id, batch_id, row_number, raw_payload, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id";

const UPDATE_ROW_VALIDATION =
  "UPDATE import_staging_rows SET validation_status = $3::g01_row_status, validation_errors = $4, row_version = row_version + 1, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const UPDATE_ROW_COMMITTED =
  "UPDATE import_staging_rows SET validation_status = 'COMMITTED', resolved_employee_id = $3, remediation_state = $4, row_version = row_version + 1, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const UPDATE_BATCH_COUNTS =
  "UPDATE employee_import_batches SET valid_rows = $3, provisional_rows = $4, error_rows = $5, status = $6::g01_import_status, committed_at = CASE WHEN $6 = 'COMMITTED' THEN now() ELSE committed_at END, committed_by = $7, row_version = row_version + 1, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const APPLY_SEPARATION =
  "UPDATE employees SET employment_status = $3::employment_status, separation_date = $4::date, separation_reason = $5, row_version = row_version + 1, updated_at = now(), updated_by = $6 " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const APPLY_RECORD_STATE =
  "UPDATE employees SET record_state = $3::record_state, row_version = row_version + 1, updated_at = now(), updated_by = $4 WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const SELECT_ACTIVE_HOLD =
  "SELECT id FROM legal_holds WHERE tenant_id = $1 AND employee_id = $2 AND status = 'ACTIVE' AND is_deleted = false LIMIT 1";

const INSERT_LEGAL_HOLD =
  "INSERT INTO legal_holds (tenant_id, entity_id, employee_id, hold_type, reason, status, placed_by, created_by) " +
  "VALUES ($1, $2, $3, $4::g01_hold_type, $5, 'ACTIVE', $6, $6) RETURNING id";

const RELEASE_LEGAL_HOLD =
  "UPDATE legal_holds SET status = 'RELEASED', released_at = now(), updated_by = $3, row_version = row_version + 1, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'";

/**
 * Postgres-backed G01 identity-ops repository over migration 0028. The in-memory twin above
 * carries the same operation set for the executed suites; this class is the production seam.
 */
export class PgEmployeeIdentityOpsRepository {
  constructor(private readonly pool: Pool) {}

  async upsertCandidate(input: {
    tenantId: string;
    entityId?: string;
    employeeAId: string;
    employeeBId: string;
    matchScore: number;
    matchedAttributes: string[];
    recordedBy: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_CANDIDATE, [
      input.tenantId,
      input.entityId ?? null,
      input.employeeAId,
      input.employeeBId,
      input.matchScore,
      JSON.stringify(input.matchedAttributes),
      input.recordedBy,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  /**
   * FR-EPM-015 AC3/AC4: the whole merge is ONE transaction — G01 satellite consolidation,
   * loser soft-delete, the employee_id_aliases insert with its merge_snapshot, the candidate
   * status flip, and the RECORDS_MERGED outbox row commit or roll back together.
   */
  async mergeWithAlias(input: {
    tenantId: string;
    entityId?: string;
    candidateId: string;
    survivorId: string;
    loserId: string;
    mergedBy: string;
    approvedBy: string;
    undoWindowDays: number;
    loserSnapshot: Record<string, unknown>;
  }): Promise<{ aliasId: string; movedSatellites: { contactIds: string[]; addressIds: string[]; dependentIds: string[] } }> {
    return withTransaction(this.pool, async (client) => {
      const contacts = await client.query(REPOINT_CONTACTS, [input.tenantId, input.loserId, input.survivorId, input.approvedBy]);
      const addresses = await client.query(REPOINT_ADDRESSES, [input.tenantId, input.loserId, input.survivorId, input.approvedBy]);
      const dependents = await client.query(REPOINT_DEPENDENTS, [input.tenantId, input.loserId, input.survivorId, input.approvedBy]);
      const movedSatellites = {
        contactIds: contacts.rows.map((row) => String((row as { id: string }).id)),
        addressIds: addresses.rows.map((row) => String((row as { id: string }).id)),
        dependentIds: dependents.rows.map((row) => String((row as { id: string }).id)),
      };
      await client.query(SOFT_DELETE_LOSER, [input.tenantId, input.loserId, input.approvedBy]);
      const alias = await client.query(INSERT_ALIAS, [
        input.tenantId,
        input.entityId ?? null,
        input.loserId,
        input.survivorId,
        input.candidateId,
        input.mergedBy,
        input.approvedBy,
        input.undoWindowDays,
        JSON.stringify({ loser: input.loserSnapshot, movedSatellites }),
      ]);
      await client.query(MARK_CANDIDATE_MERGED, [input.tenantId, input.candidateId, "MERGED", input.approvedBy]);
      await client.query(INSERT_MERGE_OUTBOX, [
        input.tenantId,
        input.entityId ?? null,
        input.survivorId,
        JSON.stringify({ survivor_id: input.survivorId, loser_id: input.loserId, is_tombstone: true }),
        input.approvedBy,
      ]);
      return { aliasId: String((alias.rows[0] as { id: string }).id), movedSatellites };
    });
  }

  /** FR-EPM-015 AC5: windowed undo — alias reversal, loser restore, and satellite re-point in one tx. */
  async undoMerge(input: {
    tenantId: string;
    aliasId: string;
    loserId: string;
    movedSatellites: { contactIds: string[]; addressIds: string[]; dependentIds: string[] };
    candidateId?: string;
    undoneBy: string;
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const reversed = await client.query(REVERSE_ALIAS, [input.tenantId, input.aliasId, input.undoneBy]);
      if (reversed.rowCount !== 1) {
        // Guard re-checked inside the tx: past-window/already-reversed aliases must not restore.
        throw new FoundationError("UNDO_EXPIRED", "Merge undo window has elapsed");
      }
      await client.query(RESTORE_LOSER, [input.tenantId, input.loserId, input.undoneBy]);
      for (const [sql, ids] of [
        ["UPDATE employee_contacts SET employee_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = ANY($2::uuid[])", input.movedSatellites.contactIds],
        ["UPDATE employee_addresses SET employee_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = ANY($2::uuid[])", input.movedSatellites.addressIds],
        ["UPDATE employee_dependents SET employee_id = $3, updated_at = now() WHERE tenant_id = $1 AND id = ANY($2::uuid[])", input.movedSatellites.dependentIds],
      ] as const) {
        if (ids.length > 0) {
          await client.query(sql, [input.tenantId, ids, input.loserId]);
        }
      }
      if (input.candidateId) {
        await client.query(REOPEN_CANDIDATE, [input.tenantId, input.candidateId]);
      }
    });
  }

  /** FR-EPM-019 AC4: chained aliases collapse to the ultimate survivor. */
  async resolveAlias(tenantId: string, employeeId: string): Promise<string> {
    const result = await this.pool.query(SELECT_ALIAS_CHAIN, [tenantId]);
    const chain = new Map<string, string>();
    for (const row of result.rows as { loser_id: string; survivor_id: string }[]) {
      chain.set(row.loser_id, row.survivor_id);
    }
    let current = employeeId;
    const seen = new Set<string>();
    while (chain.has(current) && !seen.has(current)) {
      seen.add(current);
      current = chain.get(current) as string;
    }
    return current;
  }

  /** FR-EPM-017 AC1/AC2: batch + staging rows created together; validation marks each row. */
  async createBatchWithRows(input: {
    tenantId: string;
    entityId?: string;
    templateVersion: string;
    validationProfile: ImportValidationProfile;
    rows: Record<string, unknown>[];
    createdBy: string;
  }): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      const batch = await client.query(INSERT_BATCH, [
        input.tenantId,
        input.entityId ?? null,
        input.templateVersion,
        input.validationProfile,
        input.rows.length,
        input.createdBy,
      ]);
      const batchId = String((batch.rows[0] as { id: string }).id);
      for (let index = 0; index < input.rows.length; index += 1) {
        await client.query(INSERT_STAGING_ROW, [
          input.tenantId,
          input.entityId ?? null,
          batchId,
          index + 1,
          JSON.stringify(input.rows[index]),
          input.createdBy,
        ]);
      }
      return batchId;
    });
  }

  async markRowValidation(tenantId: string, rowId: string, status: ImportRowStatus, errors: { field: string; message: string }[]): Promise<void> {
    await this.pool.query(UPDATE_ROW_VALIDATION, [tenantId, rowId, status, JSON.stringify(errors)]);
  }

  /**
   * FR-EPM-017 AC4: commit is transactional per chunk — the employees inserts (handled by the
   * caller inside the same client), staging-row flips, and batch counters roll back together
   * on any chunk failure. Exposed as a chunk-scoped unit of work.
   */
  async commitChunk(input: {
    tenantId: string;
    batchId: string;
    rowUpdates: { rowId: string; employeeId: string; remediationState: "QUEUED" | null }[];
    counts: { valid: number; provisional: number; error: number };
    status: ImportBatchStatus;
    committedBy: string;
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      for (const update of input.rowUpdates) {
        await client.query(UPDATE_ROW_COMMITTED, [input.tenantId, update.rowId, update.employeeId, update.remediationState]);
      }
      await client.query(UPDATE_BATCH_COUNTS, [
        input.tenantId,
        input.batchId,
        input.counts.valid,
        input.counts.provisional,
        input.counts.error,
        input.status,
        input.committedBy,
      ]);
    });
  }

  /** FR-EPM-018: status + separation fields + record_state applied in one tx with the outbox row. */
  async applySeparation(input: {
    tenantId: string;
    employeeId: string;
    targetStatus: SeparationTargetStatus;
    separationDate: string;
    separationReason: string;
    appliedBy: string;
    eventType: "SEPARATION" | "DEATH";
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(APPLY_SEPARATION, [
        input.tenantId,
        input.employeeId,
        input.targetStatus,
        input.separationDate,
        input.separationReason,
        input.appliedBy,
      ]);
      await client.query(
        "INSERT INTO outbox_events (tenant_id, aggregate_id, event_type, payload, retention_until, created_by) VALUES ($1, $2, $3, $4, now() + make_interval(days => 365), $5)",
        [
          input.tenantId,
          input.employeeId,
          input.eventType,
          JSON.stringify({ employee_id: input.employeeId, status: input.targetStatus, separation_reason: input.separationReason }),
          input.appliedBy,
        ]
      );
    });
  }

  async applyRecordState(tenantId: string, employeeId: string, recordState: string, appliedBy: string): Promise<void> {
    await this.pool.query(APPLY_RECORD_STATE, [tenantId, employeeId, recordState, appliedBy]);
  }

  async hasActiveLegalHold(tenantId: string, employeeId: string): Promise<boolean> {
    const result = await this.pool.query(SELECT_ACTIVE_HOLD, [tenantId, employeeId]);
    return result.rows.length > 0;
  }

  async placeLegalHold(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    holdType: string;
    reason: string;
    placedBy: string;
  }): Promise<string> {
    const result = await this.pool.query(INSERT_LEGAL_HOLD, [
      input.tenantId,
      input.entityId ?? null,
      input.employeeId,
      input.holdType,
      input.reason,
      input.placedBy,
    ]);
    return String((result.rows[0] as { id: string }).id);
  }

  async releaseLegalHold(tenantId: string, holdId: string, releasedBy: string): Promise<void> {
    await this.pool.query(RELEASE_LEGAL_HOLD, [tenantId, holdId, releasedBy]);
  }
}
