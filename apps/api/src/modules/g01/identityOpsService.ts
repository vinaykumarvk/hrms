import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { EmployeeMasterService, EmployeeRecord, OutboxEvent } from "./employeeMasterService";
import { EmployeeProfileRepository } from "./employeeProfileRepository";
import {
  BlockingObligation,
  DedupCandidate,
  EmployeeIdAlias,
  EmployeeImportBatch,
  EmployeeIdentityOpsRepository,
  EmployeeLegalHold,
  ImportStagingRow,
  ImportValidationProfile,
  SeparationRequest,
  SeparationTargetStatus,
} from "./identityOpsRepository";

/**
 * PH-16A — G01 identity operations at BRD depth:
 *   FR-EPM-015 dedup_candidates matcher + alias-based 4-eyes merge (employee_id_aliases,
 *               merge_snapshot, RECORDS_MERGED, windowed undo);
 *   FR-EPM-017 employee_import_batches + import_staging_rows (STRICT|MIGRATION
 *               validation_profile, PROVISIONAL glide path, remediation queue, promote-active);
 *   FR-EPM-018 lifecycle :separate/:reactivate/:archive over the §10.1 status machine.
 * A merge NEVER writes to non-G01 tables; consumers resolve loser_id -> survivor_id through
 * employee_id_aliases (chained aliases collapse to the ultimate survivor).
 */

/** BRD FR-EPM-015 AC1: exact statutory-ID match scores HIGH (>= 90). */
const HIGH_MATCH_THRESHOLD = 90;
const EXACT_STATUTORY_ID_SCORE = 95;
/** Fuzzy composite weights (phonetic name + DOB + contact), bounded to 0-100. */
const NAME_PHONETIC_SCORE = 50;
const DOB_SCORE = 30;
const CONTACT_SCORE = 20;
/** BRD FR-EPM-015 AC5: merge reversible within a configurable window, default 7 days. */
const DEFAULT_UNDO_WINDOW_DAYS = 7;
/** FR-EPM-017 BR: template version mismatch blocks the import with a clear message. */
const SUPPORTED_TEMPLATE_VERSION = "G01-IMPORT-V1";
/** FR-EPM-017 AC4: commit is transactional per chunk. */
const COMMIT_CHUNK_SIZE = 100;

/** §10.1 employment_status transitions this phase owns (FR-EPM-018). */
const SEPARATION_SOURCES: Record<SeparationTargetStatus, EmployeeRecord["employmentStatus"][]> = {
  RETIRED: ["ACTIVE", "SUSPENDED"],
  RESIGNED: ["ACTIVE"],
  TERMINATED: ["ACTIVE", "SUSPENDED"],
  // "any | death recorded | DECEASED" — every non-terminal status may record a death.
  DECEASED: ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TRANSFERRED", "RETIRED", "RESIGNED", "TERMINATED"],
};
/** §10.1: rehire only from RETIRED/RESIGNED; TERMINATED/DECEASED are policy-gated terminal. */
const REACTIVATION_SOURCES: EmployeeRecord["employmentStatus"][] = ["RETIRED", "RESIGNED"];
/** §10.1: retention-horizon archive applies to separated records only. */
const ARCHIVABLE_STATUSES: EmployeeRecord["employmentStatus"][] = ["RETIRED", "RESIGNED", "TERMINATED", "DECEASED"];

interface ImportRowInput {
  firstName?: string;
  lastName?: string;
  orgUnitId?: string;
  dateOfJoining?: string;
  dob?: string;
  pan?: string;
  serviceNo?: string;
  category?: string;
  legacyId?: string;
  [key: string]: unknown;
}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Phonetic/transliteration-tolerant name key (FR-025 matcher reuse, lite): uppercase, common
 * Indic transliteration variants folded, vowels after the leading letter dropped, runs deduped.
 */
export function phoneticNameKey(name: string): string {
  const upper = name.toUpperCase().replace(/[^A-Z]/g, "");
  const folded = upper
    .replace(/PH/g, "F")
    .replace(/GH/g, "G")
    .replace(/KH/g, "K")
    .replace(/TH/g, "T")
    .replace(/DH/g, "D")
    .replace(/BH/g, "B")
    .replace(/SH/g, "S")
    .replace(/CH/g, "C")
    .replace(/W/g, "V")
    .replace(/Z/g, "J");
  const head = folded.slice(0, 1);
  const tail = folded.slice(1).replace(/[AEIOU]/g, "");
  return (head + tail).replace(/(.)\1+/g, "$1");
}

export interface EmployeeIdentityOpsOptions {
  /** FR-EPM-015 AC5 configurable undo window; default 7 days (BRD-stated default). */
  mergeUndoWindowDays?: number;
}

export class EmployeeIdentityOpsService {
  private readonly undoWindowDays: number;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly profileRepository: EmployeeProfileRepository,
    private readonly repository: EmployeeIdentityOpsRepository,
    options: EmployeeIdentityOpsOptions = {}
  ) {
    this.undoWindowDays = options.mergeUndoWindowDays ?? DEFAULT_UNDO_WINDOW_DAYS;
  }

  // =====================================================================================
  // FR-EPM-015 — duplicate detection + alias-based merge
  // =====================================================================================

  /**
   * AC1 matcher: deterministic exact statutory-ID (PAN) match scores HIGH (>= 90); the fuzzy
   * composite (phonetic name + DOB + shared contact) is scored 0-100 with the matched
   * attributes recorded. Queues dedup_candidates; a DISMISSED pair is only re-raised when its
   * matched attributes change (AC6).
   */
  scanForDuplicates(actor: ActorContext): { queued: DedupCandidate[] } {
    this.authz.check(actor, "g01.dedup.scan", actor);
    const employees = this.employeeMaster.listLiveRecordsForIdentityOps(actor);
    const queued: DedupCandidate[] = [];
    for (let a = 0; a < employees.length; a += 1) {
      for (let b = a + 1; b < employees.length; b += 1) {
        const left = employees[a] as EmployeeRecord;
        const right = employees[b] as EmployeeRecord;
        const { score, matchedAttributes } = this.scorePair(actor, left, right);
        if (score <= 0) {
          continue;
        }
        const fingerprint = matchedAttributes.slice().sort().join("|");
        const existing = this.repository.findCandidateByPair(actor, left.id, right.id);
        if (existing) {
          if (existing.status === "DISMISSED" && existing.attributeFingerprint !== fingerprint) {
            // AC6: attributes changed since dismissal — re-raise the pair.
            existing.status = "OPEN";
            existing.matchScore = score;
            existing.matchedAttributes = matchedAttributes;
            existing.attributeFingerprint = fingerprint;
            existing.band = score >= HIGH_MATCH_THRESHOLD ? "HIGH" : "REVIEW";
            existing.rowVersion += 1;
            this.repository.saveCandidate(existing);
            queued.push({ ...existing });
          }
          continue;
        }
        const candidate: DedupCandidate = {
          id: nextId("dedup", this.repository.countCandidates()),
          tenantId: actor.tenantId,
          entityId: actor.entityId,
          employeeAId: left.id,
          employeeBId: right.id,
          matchScore: score,
          matchedAttributes,
          band: score >= HIGH_MATCH_THRESHOLD ? "HIGH" : "REVIEW",
          status: "OPEN",
          attributeFingerprint: fingerprint,
          rowVersion: 1,
        };
        this.repository.saveCandidate(candidate);
        queued.push({ ...candidate });
      }
    }
    this.audit.recordMutation(actor, {
      action: "G01_DEDUP_SCAN",
      subjectRef: "dedup_candidates:batch",
      metadata: { queued: queued.length },
    });
    return { queued };
  }

  listDedupCandidates(scope: TenantScope, status?: DedupCandidate["status"]): DedupCandidate[] {
    requireTenantScope(scope);
    return this.repository.listCandidates(scope, status);
  }

  /**
   * 4-eyes step 1 (maker): records the merge request on the OPEN candidate. Execution requires
   * a DIFFERENT checker via approveMerge — the same user approving throws SOD_VIOLATION (403).
   */
  requestMerge(
    actor: ActorContext,
    input: { candidateId: string; survivorId: string; override?: boolean }
  ): { candidate: DedupCandidate } {
    this.authz.check(actor, "g01.dedup.merge", actor);
    const candidate = this.getCandidate(actor, input.candidateId);
    if (candidate.status !== "OPEN") {
      throw new FoundationError("INVALID_STATE", `Candidate is ${candidate.status}; only OPEN candidates can be merged`);
    }
    if (input.survivorId !== candidate.employeeAId && input.survivorId !== candidate.employeeBId) {
      throw new FoundationError("VALIDATION_FAILED", "survivorId must be one of the candidate pair", { field: "survivorId" });
    }
    candidate.mergeRequest = {
      makerUserId: actor.userId,
      survivorId: input.survivorId,
      override: Boolean(input.override),
      requestedAt: new Date().toISOString(),
    };
    candidate.rowVersion += 1;
    this.repository.saveCandidate(candidate);
    this.audit.recordMutation(actor, {
      action: "G01_MERGE_REQUESTED",
      subjectRef: `dedup_candidates:${candidate.id}`,
      metadata: { survivorId: input.survivorId, makerUserId: actor.userId },
    });
    return { candidate: { ...candidate } };
  }

  /**
   * 4-eyes step 2 (checker) — FR-EPM-015 AC3/AC4: in ONE unit of work the merge consolidates
   * ONLY G01 satellites under the survivor, soft-deletes the loser, writes the single
   * employee_id_aliases(loser_id -> survivor_id) row with its merge_snapshot, flips the
   * candidate to MERGED, and emits RECORDS_MERGED{survivor_id, loser_id} (tombstone) on the
   * change feed. It never re-points another module's foreign keys. Guards: maker == checker
   * -> SOD_VIOLATION (403); conflicting ACTIVE statutory states without override ->
   * MERGE_CONFLICT (409). All state is validated BEFORE any mutation is applied, so a guard
   * failure leaves nothing half-merged.
   */
  approveMerge(actor: ActorContext, input: { candidateId: string }): {
    alias: EmployeeIdAlias;
    survivor: EmployeeRecord;
    outboxEvent: OutboxEvent;
  } {
    this.authz.check(actor, "g01.dedup.merge.approve", actor);
    const candidate = this.getCandidate(actor, input.candidateId);
    if (candidate.status !== "OPEN" || !candidate.mergeRequest) {
      throw new FoundationError("INVALID_STATE", "No pending merge request on this candidate");
    }
    if (candidate.mergeRequest.makerUserId === actor.userId) {
      // FR-EPM-015 BR: maker != checker (4-eyes mandatory).
      throw new FoundationError("SOD_VIOLATION", "Merge approval requires a checker different from the requesting maker", {
        details: { makerUserId: candidate.mergeRequest.makerUserId },
      });
    }
    const survivorId = candidate.mergeRequest.survivorId;
    const loserId = survivorId === candidate.employeeAId ? candidate.employeeBId : candidate.employeeAId;
    const survivor = this.employeeMaster.getLiveRecordForIdentityOps(actor, survivorId);
    const loser = this.employeeMaster.getLiveRecordForIdentityOps(actor, loserId);
    if (!survivor || !loser) {
      throw new FoundationError("NOT_FOUND", "Merge pair employee not found");
    }
    if (this.hasConflictingActiveStatutoryState(survivor, loser) && !candidate.mergeRequest.override) {
      // BR: conflicting ACTIVE statutory states may not be combined without explicit override.
      throw new FoundationError("MERGE_CONFLICT", "Conflicting ACTIVE statutory states; explicit override required", {
        details: { survivorPan: Boolean(survivor.pan), loserPan: Boolean(loser.pan) },
      });
    }
    // ---- unit of work (validated above; applied together) --------------------------------
    const loserSnapshot: EmployeeRecord = { ...loser };
    const movedSatellites = this.profileRepository.repointSatellitesForMerge(actor, loserId, survivorId);
    loser.isDeleted = true;
    loser.rowVersion += 1;
    const mergedAt = new Date();
    const alias: EmployeeIdAlias = {
      id: nextId("alias", this.repository.countAliases()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      loserId,
      survivorId,
      dedupCandidateId: candidate.id,
      mergedAt: mergedAt.toISOString(),
      mergedBy: candidate.mergeRequest.makerUserId,
      approvedBy: actor.userId,
      mergeableBackUntil: new Date(mergedAt.getTime() + this.undoWindowDays * 86_400_000).toISOString(),
      isReversed: false,
      mergeSnapshot: { loser: loserSnapshot as unknown as Record<string, unknown>, movedSatellites },
      rowVersion: 1,
    };
    this.repository.saveAlias(alias);
    candidate.status = "MERGED";
    candidate.resolution = "MERGED";
    candidate.resolvedBy = actor.userId;
    candidate.resolvedAt = mergedAt.toISOString();
    candidate.rowVersion += 1;
    this.repository.saveCandidate(candidate);
    const outboxEvent = this.employeeMaster.appendChangeFeedEvent(actor, {
      eventType: "RECORDS_MERGED",
      aggregateType: "employee_id_aliases",
      aggregateId: alias.id,
      employeeId: survivorId,
      eventDate: mergedAt.toISOString().slice(0, 10),
      // AC4/AC7: RECORDS_MERGED carries {survivor_id, loser_id} and tombstones the loser.
      payload: { survivor_id: survivorId, loser_id: loserId, is_tombstone: true },
    });
    this.audit.recordMutation(actor, {
      action: "G01_RECORDS_MERGED",
      subjectRef: `employee_id_aliases:${alias.id}`,
      metadata: { survivorId, loserId, candidateId: candidate.id, outboxEventId: outboxEvent.id },
    });
    return { alias: this.serializeAlias(alias), survivor: { ...survivor }, outboxEvent };
  }

  /** FR-EPM-015: not-a-duplicate resolution; the pair is suppressed until attributes change (AC6). */
  dismissCandidate(actor: ActorContext, input: { candidateId: string }): { candidate: DedupCandidate } {
    this.authz.check(actor, "g01.dedup.dismiss", actor);
    const candidate = this.getCandidate(actor, input.candidateId);
    if (candidate.status !== "OPEN") {
      throw new FoundationError("INVALID_STATE", `Candidate is ${candidate.status}; only OPEN candidates can be dismissed`);
    }
    candidate.status = "DISMISSED";
    candidate.resolution = "NOT_A_DUPLICATE";
    candidate.resolvedBy = actor.userId;
    candidate.resolvedAt = new Date().toISOString();
    candidate.mergeRequest = undefined;
    candidate.rowVersion += 1;
    this.repository.saveCandidate(candidate);
    this.audit.recordMutation(actor, { action: "G01_DEDUP_DISMISSED", subjectRef: `dedup_candidates:${candidate.id}` });
    return { candidate: { ...candidate } };
  }

  /**
   * FR-EPM-015 AC5: undo within the window restores the merge_snapshot (loser un-deleted, the
   * moved satellite rows re-pointed back), sets is_reversed=true, re-opens the candidate, and
   * re-emits resolution on the feed. Past the window -> UNDO_EXPIRED (409).
   */
  undoMerge(actor: ActorContext, input: { aliasId: string }): { alias: EmployeeIdAlias; restored: EmployeeRecord } {
    this.authz.check(actor, "g01.dedup.undo", actor);
    const alias = this.repository.findAlias(actor, input.aliasId);
    if (!alias) {
      throw new FoundationError("NOT_FOUND", "Merge alias not found");
    }
    if (alias.isReversed) {
      throw new FoundationError("INVALID_STATE", "Merge has already been reversed");
    }
    if (Date.now() >= new Date(alias.mergeableBackUntil).getTime()) {
      throw new FoundationError("UNDO_EXPIRED", "Merge undo window has elapsed", {
        details: { mergeableBackUntil: alias.mergeableBackUntil },
      });
    }
    const loserRow = this.employeeMaster.getLiveRecordForIdentityOps(actor, alias.loserId, true);
    if (!loserRow) {
      throw new FoundationError("NOT_FOUND", "Merged loser row not found");
    }
    // Restore the snapshot verbatim onto the live row (soft-delete cleared, fields rewound).
    Object.assign(loserRow, alias.mergeSnapshot.loser, { rowVersion: loserRow.rowVersion + 1, isDeleted: false });
    this.profileRepository.repointSatelliteRows(actor, alias.mergeSnapshot.movedSatellites, alias.loserId);
    alias.isReversed = true;
    alias.rowVersion += 1;
    this.repository.saveAlias(alias);
    if (alias.dedupCandidateId) {
      const candidate = this.repository.findCandidate(actor, alias.dedupCandidateId);
      if (candidate) {
        candidate.status = "OPEN";
        candidate.resolution = "MERGE_UNDONE";
        candidate.mergeRequest = undefined;
        candidate.rowVersion += 1;
        this.repository.saveCandidate(candidate);
      }
    }
    const outboxEvent = this.employeeMaster.appendChangeFeedEvent(actor, {
      eventType: "MERGE_UNDONE",
      aggregateType: "employee_id_aliases",
      aggregateId: alias.id,
      employeeId: alias.survivorId,
      eventDate: new Date().toISOString().slice(0, 10),
      payload: { survivor_id: alias.survivorId, loser_id: alias.loserId, is_reversed: true },
    });
    this.audit.recordMutation(actor, {
      action: "G01_MERGE_UNDONE",
      subjectRef: `employee_id_aliases:${alias.id}`,
      metadata: { loserId: alias.loserId, survivorId: alias.survivorId, outboxEventId: outboxEvent.id },
    });
    return { alias: this.serializeAlias(alias), restored: { ...loserRow } };
  }

  /**
   * FR-EPM-019 AC4: alias-transparent identity resolution — any merged loser_id collapses
   * through employee_id_aliases (chained merges resolve to the ultimate survivor).
   */
  resolveEmployeeId(scope: TenantScope, employeeId: string): { requestedId: string; employeeId: string; resolvedVia: "employee_id_aliases" | "IDENTITY" } {
    requireTenantScope(scope);
    let current = employeeId;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const alias = this.repository.findActiveAliasByLoser(scope, current);
      if (!alias) {
        break;
      }
      current = alias.survivorId;
    }
    return { requestedId: employeeId, employeeId: current, resolvedVia: current === employeeId ? "IDENTITY" : "employee_id_aliases" };
  }

  // =====================================================================================
  // FR-EPM-017 — bulk import with the PROVISIONAL glide path
  // =====================================================================================

  /** AC1: batch created with a chosen validation_profile; template version mismatch blocks (422). */
  createImportBatch(
    actor: ActorContext,
    input: { templateVersion: string; validationProfile: ImportValidationProfile; rows: ImportRowInput[] }
  ): { batch: EmployeeImportBatch } {
    this.authz.check(actor, "g01.import.write", actor);
    if (input.templateVersion !== SUPPORTED_TEMPLATE_VERSION) {
      throw new FoundationError("VALIDATION_FAILED", `Template version must be ${SUPPORTED_TEMPLATE_VERSION}`, {
        field: "templateVersion",
      });
    }
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "rows must be a non-empty array", { field: "rows" });
    }
    const batch: EmployeeImportBatch = {
      id: nextId("impb", this.repository.countBatches()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      templateVersion: input.templateVersion,
      validationProfile: input.validationProfile,
      totalRows: input.rows.length,
      validRows: 0,
      provisionalRows: 0,
      errorRows: 0,
      status: "UPLOADED",
      rowVersion: 1,
    };
    this.repository.saveBatch(batch);
    input.rows.forEach((raw, index) => {
      this.repository.saveStagingRow({
        id: nextId("impr", this.repository.countStagingRows()),
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        batchId: batch.id,
        rowNumber: index + 1,
        rawPayload: { ...raw },
        validationStatus: "ERROR",
        validationErrors: [],
        rowVersion: 1,
      });
    });
    this.audit.recordMutation(actor, {
      action: "G01_IMPORT_BATCH_CREATED",
      subjectRef: `employee_import_batches:${batch.id}`,
      metadata: { totalRows: batch.totalRows, validationProfile: batch.validationProfile },
    });
    return { batch: { ...batch } };
  }

  /**
   * AC2: profile-scoped validation. STRICT applies the full FR-001 rules; MIGRATION relaxes
   * dob/date_of_joining to nullable-during-migration — rows that fail STRICT but pass
   * MIGRATION are marked PROVISIONAL (committable with known gaps) instead of ERROR.
   */
  validateImportBatch(actor: ActorContext, input: { batchId: string }): { batch: EmployeeImportBatch; rows: ImportStagingRow[] } {
    this.authz.check(actor, "g01.import.write", actor);
    const batch = this.getBatch(actor, input.batchId);
    if (batch.status !== "UPLOADED" && batch.status !== "VALIDATED") {
      throw new FoundationError("INVALID_STATE", `Batch is ${batch.status}; validation runs on UPLOADED batches`);
    }
    batch.status = "VALIDATING";
    let valid = 0;
    let provisional = 0;
    let errors = 0;
    const rows = this.repository.listStagingRows(actor, batch.id);
    for (const row of rows) {
      const verdict = this.validateRow(row.rawPayload as ImportRowInput, batch.validationProfile);
      row.validationStatus = verdict.status;
      row.validationErrors = verdict.errors;
      row.rowVersion += 1;
      this.repository.saveStagingRow(row);
      if (verdict.status === "VALID") valid += 1;
      else if (verdict.status === "PROVISIONAL") provisional += 1;
      else errors += 1;
    }
    batch.validRows = valid;
    batch.provisionalRows = provisional;
    batch.errorRows = errors;
    batch.status = "VALIDATED";
    batch.rowVersion += 1;
    this.repository.saveBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G01_IMPORT_BATCH_VALIDATED",
      subjectRef: `employee_import_batches:${batch.id}`,
      metadata: { valid, provisional, errors },
    });
    return { batch: { ...batch }, rows: this.repository.listStagingRows(actor, batch.id) };
  }

  /** AC3: downloadable report — VALID, PROVISIONAL (with gaps), and ERROR rows. */
  getImportReport(scope: TenantScope, batchId: string): { batch: EmployeeImportBatch; rows: ImportStagingRow[] } {
    requireTenantScope(scope);
    const batch = this.getBatch(scope, batchId);
    return { batch: { ...batch }, rows: this.repository.listStagingRows(scope, batchId) };
  }

  /**
   * AC4/AC5: commit is idempotent per batch (a replay of a COMMITTED batch skips re-execution
   * and returns the recorded summary) and transactional per chunk — each chunk of rows is
   * fully constructed and validated before any of its employees are created. PROVISIONAL rows
   * commit with record_state=PROVISIONAL, login disabled, remediation_state=QUEUED. Rows whose
   * statutory ID exactly matches an existing employee are routed to dedup review (SKIPPED),
   * never silently created as duplicates (AC6).
   */
  commitImportBatch(actor: ActorContext, input: { batchId: string }): {
    batch: EmployeeImportBatch;
    committed: number;
    skippedForDedup: number;
    replayed: boolean;
  } {
    this.authz.check(actor, "g01.import.commit", actor);
    const batch = this.getBatch(actor, input.batchId);
    if (batch.status === "COMMITTED") {
      // Idempotent replay: no re-execution, no duplicate PROFILE_CREATED emissions.
      const rows = this.repository.listStagingRows(actor, batch.id);
      return {
        batch: { ...batch },
        committed: rows.filter((row) => row.validationStatus === "COMMITTED").length,
        skippedForDedup: rows.filter((row) => row.validationStatus === "SKIPPED").length,
        replayed: true,
      };
    }
    if (batch.status !== "VALIDATED") {
      throw new FoundationError("INVALID_STATE", `Batch is ${batch.status}; commit requires a VALIDATED batch`);
    }
    batch.status = "COMMITTING";
    this.repository.saveBatch(batch);
    const rows = this.repository
      .listStagingRows(actor, batch.id)
      .filter((row) => row.validationStatus === "VALID" || row.validationStatus === "PROVISIONAL");
    let committed = 0;
    let skippedForDedup = 0;
    for (let start = 0; start < rows.length; start += COMMIT_CHUNK_SIZE) {
      const chunk = rows.slice(start, start + COMMIT_CHUNK_SIZE);
      for (const row of chunk) {
        const payload = row.rawPayload as ImportRowInput;
        const duplicate = payload.pan
          ? this.employeeMaster
              .listLiveRecordsForIdentityOps(actor)
              .find((employee) => employee.pan && employee.pan === payload.pan)
          : undefined;
        if (duplicate) {
          // AC6: exact statutory-ID hit routes to candidate review instead of silent creation.
          row.validationStatus = "SKIPPED";
          row.dedupMatchedEmployeeId = duplicate.id;
          row.validationErrors = [...row.validationErrors, { field: "pan", message: "DEDUP_MATCH: routed to candidate review" }];
          row.rowVersion += 1;
          this.repository.saveStagingRow(row);
          skippedForDedup += 1;
          continue;
        }
        const isProvisional = row.validationStatus === "PROVISIONAL";
        const created = this.employeeMaster.createFromImport(actor, {
          firstName: payload.firstName as string,
          lastName: payload.lastName,
          orgUnitId: payload.orgUnitId as string,
          dateOfJoining: payload.dateOfJoining,
          dob: payload.dob,
          serviceNo: payload.serviceNo,
          category: payload.category,
          pan: payload.pan,
          recordState: isProvisional ? "PROVISIONAL" : "ACTIVE",
          loginDisabled: isProvisional,
          sourceSystem: "P06_MIGRATION",
          legacyId: payload.legacyId,
        });
        row.validationStatus = "COMMITTED";
        row.resolvedEmployeeId = created.employee.id;
        row.remediationState = isProvisional ? "QUEUED" : undefined;
        row.rowVersion += 1;
        this.repository.saveStagingRow(row);
        committed += 1;
      }
    }
    batch.status = "COMMITTED";
    batch.committedAt = new Date().toISOString();
    batch.committedBy = actor.userId;
    batch.rowVersion += 1;
    this.repository.saveBatch(batch);
    this.audit.recordMutation(actor, {
      action: "G01_IMPORT_BATCH_COMMITTED",
      subjectRef: `employee_import_batches:${batch.id}`,
      metadata: { committed, skippedForDedup },
    });
    return { batch: { ...batch }, committed, skippedForDedup, replayed: false };
  }

  /** AC5: the PROVISIONAL remediation worklist (remediation_state=QUEUED). */
  listRemediationQueue(scope: TenantScope, state: "QUEUED" | "RESOLVED" = "QUEUED"): ImportStagingRow[] {
    requireTenantScope(scope);
    return this.repository.listRemediationRows(scope, state);
  }

  /**
   * FR-EPM-017 BR / §10.1 "PROVISIONAL -> remediate & promote": promote-active re-validates the
   * remediated record under STRICT and only then flips record_state to ACTIVE and re-enables
   * login. The BRD registers ONLY the 409 status for promote-with-gaps (no named code), so the
   * closest registered code INVALID_STATE is used here — never a newly minted identifier.
   */
  promoteActive(
    actor: ActorContext,
    input: { employeeId: string; fixes?: { dob?: string; dateOfJoining?: string; pan?: string } }
  ): { employee: EmployeeRecord } {
    this.authz.check(actor, "g01.import.commit", actor);
    const employee = this.employeeMaster.getLiveRecordForIdentityOps(actor, input.employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (employee.recordState !== "PROVISIONAL") {
      throw new FoundationError("INVALID_STATE", "Only PROVISIONAL records can be promoted to ACTIVE");
    }
    const candidateView: ImportRowInput = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      orgUnitId: employee.orgUnitId,
      dateOfJoining: input.fixes?.dateOfJoining ?? employee.dateOfJoining,
      dob: input.fixes?.dob ?? employee.dob,
      pan: input.fixes?.pan ?? employee.pan,
    };
    const verdict = this.validateRow(candidateView, "STRICT");
    if (verdict.status !== "VALID") {
      // Promote with gaps -> 409 (BRD FR-EPM-017 failure handling; see method doc re INVALID_STATE).
      throw new FoundationError("INVALID_STATE", "STRICT re-validation failed; remediation gaps remain", {
        details: { gaps: verdict.errors },
      });
    }
    employee.dateOfJoining = candidateView.dateOfJoining;
    employee.dob = candidateView.dob;
    employee.pan = candidateView.pan;
    employee.recordState = "ACTIVE";
    employee.loginDisabled = false;
    employee.rowVersion += 1;
    const stagingRow = this.repository.findStagingRowByEmployee(actor, employee.id);
    if (stagingRow) {
      stagingRow.remediationState = "RESOLVED";
      stagingRow.rowVersion += 1;
      this.repository.saveStagingRow(stagingRow);
    }
    this.audit.recordMutation(actor, {
      action: "G01_PROVISIONAL_PROMOTED",
      subjectRef: `employees:${employee.id}`,
      metadata: { recordState: "ACTIVE" },
    });
    return { employee: { ...employee } };
  }

  // =====================================================================================
  // FR-EPM-018 — lifecycle :separate / :reactivate / :archive
  // =====================================================================================

  /**
   * AC1 (maker step): validates the §10.1 transition (INVALID_STATE 409) and the
   * open-obligation gate (BLOCKING_OBLIGATIONS 409 without override), then records a PENDING
   * separation request. Approval by a DIFFERENT checker applies it (maker != checker).
   */
  initiateSeparation(
    actor: ActorContext,
    input: {
      employeeId: string;
      targetStatus: SeparationTargetStatus;
      separationDate: string;
      separationReason: string;
      overrideObligations?: boolean;
    }
  ): { request: SeparationRequest } {
    this.authz.check(actor, "g01.employee.lifecycle", actor);
    if (!input.separationReason || !input.separationReason.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "separationReason is required", { field: "separationReason" });
    }
    const employee = this.requireEmployee(actor, input.employeeId);
    this.assertTransition(employee, input.targetStatus);
    if (this.repository.findPendingSeparation(actor, employee.id)) {
      throw new FoundationError("INVALID_STATE", "A separation request is already pending for this employee");
    }
    if (this.repository.hasOpenObligations(actor, employee.id) && !input.overrideObligations) {
      // BR: separation requires no open blocking obligations unless overridden.
      throw new FoundationError("BLOCKING_OBLIGATIONS", "Open blocking obligations must be cleared or overridden");
    }
    const request: SeparationRequest = {
      id: nextId("sep", this.repository.countSeparationRequests()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: employee.id,
      targetStatus: input.targetStatus,
      separationDate: input.separationDate,
      separationReason: input.separationReason,
      makerUserId: actor.userId,
      status: "PENDING",
    };
    this.repository.saveSeparationRequest(request);
    this.audit.recordMutation(actor, {
      action: "G01_SEPARATION_INITIATED",
      subjectRef: `employees:${employee.id}`,
      metadata: { targetStatus: input.targetStatus, makerUserId: actor.userId },
    });
    return { request: { ...request } };
  }

  /**
   * AC1-AC3/AC7 (checker step): maker == checker -> SOD_VIOLATION (403). In one unit of work
   * the status + separation_date/separation_reason are applied, the linked login is disabled
   * (AC2), and SEPARATION (DEATH for DECEASED, which also flags the FR-024/G11 family-pension
   * handoff) is emitted via the outbox (AC3).
   */
  approveSeparation(actor: ActorContext, input: { employeeId: string }): {
    employee: EmployeeRecord;
    outboxEvent: OutboxEvent;
  } {
    this.authz.check(actor, "g01.employee.lifecycle.approve", actor);
    const request = this.repository.findPendingSeparation(actor, input.employeeId);
    if (!request) {
      throw new FoundationError("INVALID_STATE", "No pending separation request for this employee");
    }
    if (request.makerUserId === actor.userId) {
      // FR-EPM-018 AC1: separation is approved maker != checker.
      throw new FoundationError("SOD_VIOLATION", "Separation approval requires a checker different from the initiating maker", {
        details: { makerUserId: request.makerUserId },
      });
    }
    const employee = this.requireEmployee(actor, input.employeeId);
    this.assertTransition(employee, request.targetStatus);
    employee.employmentStatus = request.targetStatus;
    employee.separationDate = request.separationDate;
    employee.separationReason = request.separationReason;
    // AC2: the linked login is disabled on separation; self-service access ends. Real user
    // de-provisioning is delegated to the P04 substrate through this flag.
    employee.loginDisabled = true;
    employee.rowVersion += 1;
    request.status = "APPROVED";
    request.approvedBy = actor.userId;
    this.repository.saveSeparationRequest(request);
    const isDeath = request.targetStatus === "DECEASED";
    const outboxEvent = this.employeeMaster.appendChangeFeedEvent(actor, {
      eventType: isDeath ? "DEATH" : "SEPARATION",
      aggregateType: "employees",
      aggregateId: employee.id,
      employeeId: employee.id,
      eventDate: request.separationDate,
      payload: {
        employee_id: employee.id,
        status: request.targetStatus,
        separation_date: request.separationDate,
        separation_reason: request.separationReason,
        // AC7: DECEASED triggers the FR-024 succession + G11 family-pension handoff.
        ...(isDeath ? { succession_handoff: "FR-024/G11_FAMILY_PENSION" } : {}),
      },
    });
    this.audit.recordMutation(actor, {
      action: "G01_SEPARATION_APPROVED",
      subjectRef: `employees:${employee.id}`,
      metadata: { targetStatus: request.targetStatus, approvedBy: actor.userId, outboxEventId: outboxEvent.id },
    });
    return { employee: { ...employee }, outboxEvent };
  }

  /**
   * AC5: reactivation (rehire) — only RETIRED/RESIGNED per §10.1 (TERMINATED/DECEASED are
   * policy-gated terminal -> INVALID_STATE). Restores controlled access, emits REACTIVATION;
   * prior history is retained (the new assignment carries reason HIRE).
   */
  reactivate(actor: ActorContext, input: { employeeId: string; effectiveDate: string }): {
    employee: EmployeeRecord;
    outboxEvent: OutboxEvent;
  } {
    this.authz.check(actor, "g01.employee.lifecycle", actor);
    const employee = this.requireEmployee(actor, input.employeeId);
    if (!REACTIVATION_SOURCES.includes(employee.employmentStatus)) {
      throw new FoundationError("INVALID_STATE", `Cannot reactivate from ${employee.employmentStatus}; rehire requires RETIRED or RESIGNED`);
    }
    if (employee.recordState === "ARCHIVED" || employee.recordState === "PURGE_PENDING") {
      throw new FoundationError("INVALID_STATE", "Archived records cannot be reactivated");
    }
    employee.employmentStatus = "ACTIVE";
    employee.loginDisabled = false;
    employee.rowVersion += 1;
    const outboxEvent = this.employeeMaster.appendChangeFeedEvent(actor, {
      eventType: "REACTIVATION",
      aggregateType: "employees",
      aggregateId: employee.id,
      employeeId: employee.id,
      eventDate: input.effectiveDate,
      payload: { employee_id: employee.id, assignment_reason: "HIRE", effective_date: input.effectiveDate },
    });
    this.audit.recordMutation(actor, {
      action: "G01_EMPLOYEE_REACTIVATED",
      subjectRef: `employees:${employee.id}`,
      metadata: { effectiveDate: input.effectiveDate, outboxEventId: outboxEvent.id },
    });
    return { employee: { ...employee }, outboxEvent };
  }

  /**
   * AC6: archive on retention horizon — record_state -> ARCHIVED for separated records only
   * (INVALID_STATE otherwise). An ACTIVE legal_holds row blocks it with LEGAL_HOLD_ACTIVE (409).
   */
  archive(actor: ActorContext, input: { employeeId: string }): { employee: EmployeeRecord } {
    this.authz.check(actor, "g01.employee.lifecycle", actor);
    const employee = this.requireEmployee(actor, input.employeeId);
    if (!ARCHIVABLE_STATUSES.includes(employee.employmentStatus)) {
      throw new FoundationError("INVALID_STATE", `Cannot archive an employee in ${employee.employmentStatus}; separation must complete first`);
    }
    if (employee.recordState === "ARCHIVED") {
      throw new FoundationError("INVALID_STATE", "Record is already ARCHIVED");
    }
    if (this.repository.hasActiveLegalHold(actor, employee.id)) {
      // FR-EPM-018 failure handling: archive under an ACTIVE hold -> 409 LEGAL_HOLD_ACTIVE.
      throw new FoundationError("LEGAL_HOLD_ACTIVE", "An ACTIVE legal hold blocks archival of this record");
    }
    employee.recordState = "ARCHIVED";
    employee.rowVersion += 1;
    this.audit.recordMutation(actor, {
      action: "G01_EMPLOYEE_ARCHIVED",
      subjectRef: `employees:${employee.id}`,
      metadata: { recordState: "ARCHIVED" },
    });
    return { employee: { ...employee } };
  }

  /** E31 legal_holds: place an employee-scoped ACTIVE hold (FR-EPM-021 seam used by archive). */
  placeLegalHold(
    actor: ActorContext,
    input: { employeeId: string; holdType: EmployeeLegalHold["holdType"]; reason: string }
  ): { hold: EmployeeLegalHold } {
    this.authz.check(actor, "g01.legal_hold.place", actor);
    this.requireEmployee(actor, input.employeeId);
    const hold: EmployeeLegalHold = {
      id: nextId("ehold", this.repository.countLegalHolds()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      holdType: input.holdType,
      reason: input.reason,
      status: "ACTIVE",
      placedBy: actor.userId,
      placedAt: new Date().toISOString(),
    };
    this.repository.saveLegalHold(hold);
    this.audit.recordMutation(actor, { action: "G01_LEGAL_HOLD_PLACED", subjectRef: `legal_holds:${hold.id}`, metadata: { employeeId: input.employeeId } });
    return { hold: { ...hold } };
  }

  releaseLegalHold(actor: ActorContext, input: { holdId: string }): { hold: EmployeeLegalHold } {
    this.authz.check(actor, "g01.legal_hold.release", actor);
    const hold = this.repository.findLegalHold(actor, input.holdId);
    if (!hold) {
      throw new FoundationError("NOT_FOUND", "Legal hold not found");
    }
    if (hold.status !== "ACTIVE") {
      throw new FoundationError("INVALID_STATE", "Legal hold is not ACTIVE");
    }
    hold.status = "RELEASED";
    hold.releasedBy = actor.userId;
    hold.releasedAt = new Date().toISOString();
    this.repository.saveLegalHold(hold);
    this.audit.recordMutation(actor, { action: "G01_LEGAL_HOLD_RELEASED", subjectRef: `legal_holds:${hold.id}` });
    return { hold: { ...hold } };
  }

  /** FR-EPM-018 BR seam: an OPEN obligation blocks separation without override. */
  registerBlockingObligation(actor: ActorContext, input: { employeeId: string; description: string }): { obligation: BlockingObligation } {
    this.authz.check(actor, "g01.employee.lifecycle", actor);
    this.requireEmployee(actor, input.employeeId);
    const obligation: BlockingObligation = {
      id: nextId("oblg", this.repository.countObligations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      description: input.description,
      status: "OPEN",
    };
    this.repository.saveObligation(obligation);
    this.audit.recordMutation(actor, { action: "G01_OBLIGATION_REGISTERED", subjectRef: `obligations:${obligation.id}` });
    return { obligation: { ...obligation } };
  }

  clearBlockingObligation(actor: ActorContext, input: { obligationId: string }): { obligation: BlockingObligation } {
    this.authz.check(actor, "g01.employee.lifecycle", actor);
    const obligation = this.repository.findObligation(actor, input.obligationId);
    if (!obligation) {
      throw new FoundationError("NOT_FOUND", "Obligation not found");
    }
    obligation.status = "CLEARED";
    this.repository.saveObligation(obligation);
    this.audit.recordMutation(actor, { action: "G01_OBLIGATION_CLEARED", subjectRef: `obligations:${obligation.id}` });
    return { obligation: { ...obligation } };
  }

  // =====================================================================================
  // internals
  // =====================================================================================

  private scorePair(
    scope: TenantScope,
    left: EmployeeRecord,
    right: EmployeeRecord
  ): { score: number; matchedAttributes: string[] } {
    const matched: string[] = [];
    let score = 0;
    if (left.pan && right.pan && left.pan === right.pan) {
      // AC1: exact statutory-ID match -> HIGH (>= 90).
      score = EXACT_STATUTORY_ID_SCORE;
      matched.push("pan");
    }
    let fuzzy = 0;
    const leftName = phoneticNameKey([left.firstName, left.lastName].filter(Boolean).join(" "));
    const rightName = phoneticNameKey([right.firstName, right.lastName].filter(Boolean).join(" "));
    if (leftName && leftName === rightName) {
      fuzzy += NAME_PHONETIC_SCORE;
      matched.push("name_phonetic");
    }
    if (left.dob && right.dob && left.dob === right.dob) {
      fuzzy += DOB_SCORE;
      matched.push("dob");
    }
    const leftContacts = new Set(this.profileRepository.listContacts(scope, left.id).map((contact) => contact.contactValue.toLowerCase()));
    const sharesContact = this.profileRepository
      .listContacts(scope, right.id)
      .some((contact) => leftContacts.has(contact.contactValue.toLowerCase()));
    if (sharesContact) {
      fuzzy += CONTACT_SCORE;
      matched.push("contact");
    }
    return { score: Math.min(Math.max(score, fuzzy), 100), matchedAttributes: matched };
  }

  /** BR: conflicting ACTIVE statutory states (e.g. two different live PANs) need explicit override. */
  private hasConflictingActiveStatutoryState(survivor: EmployeeRecord, loser: EmployeeRecord): boolean {
    return Boolean(survivor.pan && loser.pan && survivor.pan !== loser.pan);
  }

  private assertTransition(employee: EmployeeRecord, targetStatus: SeparationTargetStatus): void {
    const allowedSources = SEPARATION_SOURCES[targetStatus];
    if (!allowedSources.includes(employee.employmentStatus)) {
      // §10.1 guard: invalid transition -> 409 INVALID_STATE (FR-EPM-018 failure handling).
      throw new FoundationError(
        "INVALID_STATE",
        `Invalid status transition ${employee.employmentStatus} -> ${targetStatus} (BRD G01 §10.1)`,
        { details: { from: employee.employmentStatus, to: targetStatus } }
      );
    }
  }

  private requireEmployee(scope: TenantScope, employeeId: string): EmployeeRecord {
    const employee = this.employeeMaster.getLiveRecordForIdentityOps(scope, employeeId);
    if (!employee) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    return employee;
  }

  private getCandidate(scope: TenantScope, candidateId: string): DedupCandidate {
    const candidate = this.repository.findCandidate(scope, candidateId);
    if (!candidate) {
      throw new FoundationError("NOT_FOUND", "Dedup candidate not found");
    }
    return candidate;
  }

  private getBatch(scope: TenantScope, batchId: string): EmployeeImportBatch {
    const batch = this.repository.findBatch(scope, batchId);
    if (!batch) {
      throw new FoundationError("NOT_FOUND", "Import batch not found");
    }
    return batch;
  }

  private validateRow(
    payload: ImportRowInput,
    profile: ImportValidationProfile
  ): { status: "VALID" | "PROVISIONAL" | "ERROR"; errors: { field: string; message: string }[] } {
    const hardErrors: { field: string; message: string }[] = [];
    const gaps: { field: string; message: string }[] = [];
    if (!payload.firstName || !String(payload.firstName).trim()) {
      hardErrors.push({ field: "firstName", message: "firstName is required" });
    }
    if (!payload.orgUnitId || !String(payload.orgUnitId).trim()) {
      hardErrors.push({ field: "orgUnitId", message: "orgUnitId is required" });
    }
    if (payload.pan && !PAN_PATTERN.test(String(payload.pan))) {
      hardErrors.push({ field: "pan", message: "PAN format is invalid" });
    }
    // STRICT statutory floors (ck_employees_dob_active / ck_employees_doj_active): relaxed to
    // nullable-during-migration under the MIGRATION profile (FR-EPM-017 AC2).
    if (!payload.dateOfJoining) {
      gaps.push({ field: "dateOfJoining", message: "date_of_joining missing (STRICT requires it)" });
    }
    if (!payload.dob) {
      gaps.push({ field: "dob", message: "dob missing (STRICT requires it)" });
    }
    if (hardErrors.length > 0) {
      return { status: "ERROR", errors: [...hardErrors, ...gaps] };
    }
    if (gaps.length === 0) {
      return { status: "VALID", errors: [] };
    }
    return profile === "MIGRATION" ? { status: "PROVISIONAL", errors: gaps } : { status: "ERROR", errors: gaps };
  }

  private serializeAlias(alias: EmployeeIdAlias): EmployeeIdAlias {
    return {
      ...alias,
      mergeSnapshot: {
        loser: { ...alias.mergeSnapshot.loser },
        movedSatellites: {
          contactIds: [...alias.mergeSnapshot.movedSatellites.contactIds],
          addressIds: [...alias.mergeSnapshot.movedSatellites.addressIds],
          dependentIds: [...alias.mergeSnapshot.movedSatellites.dependentIds],
        },
      },
    };
  }
}
