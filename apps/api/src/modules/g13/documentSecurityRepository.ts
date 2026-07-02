import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, nextId, sha256Hex } from "../../platform/types";
import { EnvelopeObject, KeyProvider, LocalMasterKeyProvider, decryptEnvelope, encryptEnvelope, rewrapEnvelope } from "./keyProvider";

/**
 * PH-10C/PH-15E G13 security persistence (BRD G13 v3; docs/data-model/
 * 13-G13-document-management.sql; migrations 0020_g13_security_hardening.sql +
 * 0026_g13_envelope_encryption_dsr.sql):
 *   E15 scan_results                — append-only malware-scan verdict ledger (DI-11)
 *   E21 security_clearances        — deny-by-default classification gate store (FR-006)
 *   E12 document_audit             — append-only hash-chained access ledger (FR-015/016)
 *   E8  document_retention_policies — retention classes binding disposition eligibility (FR-009)
 *   E18 disposition_records        — maker!=checker disposition SoD (FR-009, DI-10)
 *   E19 storage_objects            — envelope-encrypted content: per-object AES-256-GCM DEK,
 *                                    only wrapped_dek + kms_key_id persisted (FR-005, PH-15E)
 *   E22 data_subject_requests      — DPDP DSR lifecycle + erasure precedence lattice (FR-018)
 * Entity state routes through this repository; the vault service owns no bare arrays for them.
 */

export type G13ScanVerdict = "CLEAN" | "INFECTED" | "PENDING";
export type G13ClassificationLevel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";
export type G13ClearancePrincipalType = "USER" | "ROLE";
export type G13ClearanceStatus = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
export type G13AccessAuditAction = "VIEW" | "DOWNLOAD" | "DISPOSE" | "CLEARANCE_CHANGE" | "ERASURE";
export type G13AuditResult = "SUCCESS" | "DENIED";
export type G13DispositionAction = "DESTROY" | "ARCHIVE_TRANSFER" | "REVIEW";
export type G13DispositionStatus = "PROPOSED" | "APPROVED" | "EXECUTED" | "REJECTED" | "BLOCKED_HOLD";
/** E22 g13_dsr_type — DPDP data-subject request types (FR-018). */
export type G13DsrType = "ACCESS" | "ERASURE" | "RECTIFICATION" | "PORTABILITY";
/** E22 g13_dsr_status — the auditable request lifecycle (FR-018 AC6). */
export type G13DsrStatus = "RECEIVED" | "UNDER_REVIEW" | "EXEMPTED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "REJECTED";
/** g13_erasure_method — how a resolved DPDP request treated content (documents.dpdp_erasure_state). */
export type G13ErasureMethod = "CRYPTO_SHRED" | "PHYSICAL_PURGE" | "EXEMPT_RETAINED";

/** E15 scan_results — append-only; one row per scan attempt on a document version. */
export interface ScanResultRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  documentId: string;
  versionNo: number;
  engine: string;
  verdict: G13ScanVerdict;
  threatName?: string;
  /** DI-5: stored hash == recomputed hash at scan time. */
  integrityVerified: boolean;
  scannedAt: string;
}

/** E21 security_clearances — read by the deny-by-default gate; only ACTIVE rows grant access. */
export interface SecurityClearanceRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  principalType: G13ClearancePrincipalType;
  principalRef: string;
  clearanceLevel: G13ClassificationLevel;
  status: G13ClearanceStatus;
  justification: string;
  grantedBy: string;
  approvedBy?: string;
  validFrom: string;
  validUntil?: string;
}

/** E12 document_audit — append-only, hash-chained access ledger (no update/delete path). */
export interface DocumentAuditRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  seqNo: number;
  documentId: string;
  versionNo: number;
  action: G13AccessAuditAction;
  actorUserId: string;
  correlationId?: string;
  result: G13AuditResult;
  denialReason?: string;
  prevHash: string;
  rowHash: string;
  occurredAt: string;
}

/** E8 document_retention_policies — tenant-configurable retention classes (DI-13). */
export interface RetentionClassRecord {
  tenantId: string;
  code: string;
  name: string;
  retentionPeriodMonths?: number;
  isPermanent: boolean;
  dispositionAction: G13DispositionAction;
}

/** E18 disposition_records — maker (proposed_by) must differ from checker (approved_by) (DI-10). */
export interface DispositionRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  documentId: string;
  retentionClassCode: string;
  action: G13DispositionAction;
  proposedBy: string;
  approvedBy?: string;
  status: G13DispositionStatus;
  executedAt?: string;
  /** Tombstone hash retained after destruction (content_hash at execution). */
  evidenceHash?: string;
}

/**
 * Per-document outcome of the FR-018 VAL-G13-LATTICE evaluation, recorded on the request.
 * `EXEMPT_RETAINED` outcomes carry the recorded legal basis (statutory retention / legal hold /
 * WORM); `ERASE` outcomes are executed on the redaction-marker path and stamped when done.
 */
export interface DsrDocumentOutcome {
  documentId: string;
  decision: "EXEMPT_RETAINED" | "ERASE";
  /** legal_basis_exemption for EXEMPT_RETAINED outcomes. */
  basis?: string;
  erasureMethod?: G13ErasureMethod;
  executedAt?: string;
}

/** E22 data_subject_requests — DPDP request + precedence-lattice resolution (FR-018, R8). */
export interface DataSubjectRequestRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  dsrNo: string;
  dataSubjectEmployeeId: string;
  requestType: G13DsrType;
  consentRefId?: string;
  /** Statutory clock starts at receipt (FR-018 AC1). */
  receivedAt: string;
  status: G13DsrStatus;
  legalBasisExemption?: string;
  affectedDocumentCount?: number;
  resolutionNote?: string;
  erasureMethod?: G13ErasureMethod;
  /** DPO who adjudicated — must differ from the executing custodian (FR-018 AC7 SoD). */
  adjudicatedBy?: string;
  outcomes: DsrDocumentOutcome[];
}

/**
 * E19 storage_objects read view for one encrypted version: ciphertext + the ONLY persisted key
 * material (wrapped_dek, kms_key_id). Exposed so rotation can be verified (ciphertext
 * byte-identity) without ever exposing a plaintext DEK.
 */
export interface StorageObjectView {
  documentId: string;
  versionNo: number;
  encryptionAlg: "aes-256-gcm";
  /** iv || authTag || ciphertext of the blob under the per-object DEK — never plaintext. */
  objectBytes: Buffer;
  wrappedDek: Buffer;
  kmsKeyId: string;
  /** True once a DPDP crypto-shred destroyed the wrapped DEK (content unrecoverable by design). */
  dpdpShredded: boolean;
}

/** Result of one JOB-G13-KEYROTATE run: the new master key and how many DEKs were re-wrapped. */
export interface KeyRotationReport {
  kmsKeyId: string;
  rewrappedObjects: number;
}

export const GENESIS_AUDIT_HASH = "0".repeat(64);

export interface AppendAccessAuditInput {
  tenantId: string;
  entityId?: string;
  documentId: string;
  versionNo: number;
  action: G13AccessAuditAction;
  actorUserId: string;
  correlationId?: string;
  result: G13AuditResult;
  denialReason?: string;
}

export interface DocumentSecurityRepository {
  /**
   * FR-005 envelope-encrypted content store (E19 storage_objects): `putContent` encrypts the
   * bytes with a fresh per-object AES-256-GCM DEK and persists only ciphertext + wrapped_dek +
   * kms_key_id; `getContent` unwraps the DEK via the KeyProvider and returns the verified
   * plaintext (fail-closed `ERR-G13-INTEGRITY_FAILED` on a wrong key or tampered bytes).
   */
  putContent(documentId: string, versionNo: number, bytes: Buffer): void;
  getContent(documentId: string, versionNo: number): Buffer | null;
  /** E19 read view for rotation/inspection — ciphertext + wrapped_dek/kms_key_id copies only. */
  getStorageObject(documentId: string, versionNo: number): StorageObjectView | null;
  /**
   * JOB-G13-KEYROTATE: rotates the master key via the KeyProvider and re-wraps every stored
   * DEK under the new key WITHOUT re-encrypting or rewriting object ciphertext (FR-005 AC4).
   */
  rewrapDataKeys(): KeyRotationReport;
  /**
   * FR-018 crypto-shred (BR-2, per-object DEK so dek_shared=false): destroys the wrapped DEK
   * for every version of the document, leaving ciphertext unrecoverable. Rows are retained as
   * tombstones — content is never physically deleted here.
   */
  destroyWrappedDek(documentId: string): number;
  /**
   * FR-018 AC5 / P05: overwrites PII fields on the document's existing E12 audit rows with the
   * DPDP redaction marker. This is the SOLE exception to the append-only audit rule — rows are
   * never deleted, and the chain columns are preserved.
   */
  applyDpdpRedactionMarker(documentId: string, marker: string): number;
  /** E22 data_subject_requests persistence (FR-018). */
  saveDataSubjectRequest(record: DataSubjectRequestRecord): DataSubjectRequestRecord;
  getDataSubjectRequest(id: string): DataSubjectRequestRecord | null;
  listDataSubjectRequests(tenantId: string): DataSubjectRequestRecord[];
  countDataSubjectRequests(): number;
  appendScanResult(record: Omit<ScanResultRecord, "id" | "scannedAt">): ScanResultRecord;
  listScanResults(documentId: string): ScanResultRecord[];
  saveClearance(record: Omit<SecurityClearanceRecord, "id">): SecurityClearanceRecord;
  listClearances(tenantId: string): SecurityClearanceRecord[];
  /** Appends one hash-chained E12 row; the chain (seq_no, prev_hash, row_hash) is repository-owned. */
  appendAccessAudit(input: AppendAccessAuditInput): DocumentAuditRecord;
  listAccessAudit(documentId: string): DocumentAuditRecord[];
  saveRetentionClass(record: RetentionClassRecord): RetentionClassRecord;
  getRetentionClass(tenantId: string, code: string): RetentionClassRecord | null;
  saveDisposition(record: DispositionRecord): DispositionRecord;
  getDisposition(id: string): DispositionRecord | null;
}

interface StoredEnvelope {
  documentId: string;
  versionNo: number;
  envelope: EnvelopeObject;
  dpdpShredded: boolean;
}

export class InMemoryDocumentSecurityRepository implements DocumentSecurityRepository {
  private readonly contentStore = new Map<string, StoredEnvelope>();
  private readonly scanResults: ScanResultRecord[] = [];
  private readonly clearances: SecurityClearanceRecord[] = [];
  private readonly accessAudit: DocumentAuditRecord[] = [];
  private readonly retentionClasses = new Map<string, RetentionClassRecord>();
  private readonly dispositions = new Map<string, DispositionRecord>();
  private readonly dataSubjectRequests = new Map<string, DataSubjectRequestRecord>();

  /** The KeyProvider seam is injectable (FR-005); the local master-key impl is the default. */
  constructor(private readonly keyProvider: KeyProvider = new LocalMasterKeyProvider()) {}

  putContent(documentId: string, versionNo: number, bytes: Buffer): void {
    // FR-005 AC1/AC2: fresh random per-object DEK, AES-256-GCM; only ciphertext +
    // wrapped_dek + kms_key_id are stored — plaintext bytes and plaintext DEKs never persist.
    this.contentStore.set(`${documentId}:${versionNo}`, {
      documentId,
      versionNo,
      envelope: encryptEnvelope(bytes, this.keyProvider),
      dpdpShredded: false,
    });
  }

  getContent(documentId: string, versionNo: number): Buffer | null {
    const stored = this.contentStore.get(`${documentId}:${versionNo}`);
    if (!stored || stored.dpdpShredded) {
      // Shredded content is unrecoverable by design (FR-018 crypto-shred) — never partially served.
      return null;
    }
    // Unwrap + authenticated decrypt; a wrong key or tampered ciphertext throws
    // ERR-G13-INTEGRITY_FAILED from the envelope layer (fail closed).
    return decryptEnvelope(stored.envelope, this.keyProvider);
  }

  getStorageObject(documentId: string, versionNo: number): StorageObjectView | null {
    const stored = this.contentStore.get(`${documentId}:${versionNo}`);
    if (!stored) {
      return null;
    }
    return {
      documentId: stored.documentId,
      versionNo: stored.versionNo,
      encryptionAlg: stored.envelope.encryptionAlg,
      objectBytes: Buffer.from(stored.envelope.objectBytes),
      wrappedDek: Buffer.from(stored.envelope.wrappedDek),
      kmsKeyId: stored.envelope.kmsKeyId,
      dpdpShredded: stored.dpdpShredded,
    };
  }

  rewrapDataKeys(): KeyRotationReport {
    // JOB-G13-KEYROTATE: activate the new master key, then re-wrap each stored DEK.
    // Object ciphertext is carried over untouched — rotation never rewrites object bytes.
    const kmsKeyId = this.keyProvider.rotateMasterKey();
    let rewrappedObjects = 0;
    for (const stored of this.contentStore.values()) {
      if (stored.dpdpShredded) {
        continue; // a shredded object has no DEK left to re-wrap
      }
      stored.envelope = rewrapEnvelope(stored.envelope, this.keyProvider);
      rewrappedObjects += 1;
    }
    return { kmsKeyId, rewrappedObjects };
  }

  destroyWrappedDek(documentId: string): number {
    let shredded = 0;
    for (const stored of this.contentStore.values()) {
      if (stored.documentId === documentId && !stored.dpdpShredded) {
        // Crypto-shred: the wrapped DEK is destroyed; the ciphertext row remains a tombstone.
        stored.envelope = { ...stored.envelope, wrappedDek: Buffer.alloc(0) };
        stored.dpdpShredded = true;
        shredded += 1;
      }
    }
    return shredded;
  }

  applyDpdpRedactionMarker(documentId: string, marker: string): number {
    let redacted = 0;
    for (let index = 0; index < this.accessAudit.length; index += 1) {
      const row = this.accessAudit[index];
      if (!row || row.documentId !== documentId) {
        continue;
      }
      // Sole P05 append-only exception: PII fields are overwritten with the redaction marker;
      // the row itself, its position, and its chain columns are preserved — never deleted.
      this.accessAudit[index] = Object.freeze({ ...row, actorUserId: marker, denialReason: row.denialReason ? marker : undefined });
      redacted += 1;
    }
    return redacted;
  }

  saveDataSubjectRequest(record: DataSubjectRequestRecord): DataSubjectRequestRecord {
    this.dataSubjectRequests.set(record.id, { ...record, outcomes: record.outcomes.map((outcome) => ({ ...outcome })) });
    return this.getDataSubjectRequest(record.id) as DataSubjectRequestRecord;
  }

  getDataSubjectRequest(id: string): DataSubjectRequestRecord | null {
    const row = this.dataSubjectRequests.get(id);
    return row ? { ...row, outcomes: row.outcomes.map((outcome) => ({ ...outcome })) } : null;
  }

  listDataSubjectRequests(tenantId: string): DataSubjectRequestRecord[] {
    return [...this.dataSubjectRequests.values()]
      .filter((row) => row.tenantId === tenantId)
      .map((row) => ({ ...row, outcomes: row.outcomes.map((outcome) => ({ ...outcome })) }));
  }

  countDataSubjectRequests(): number {
    return this.dataSubjectRequests.size;
  }

  appendScanResult(record: Omit<ScanResultRecord, "id" | "scannedAt">): ScanResultRecord {
    const row: ScanResultRecord = Object.freeze({
      ...record,
      id: nextId("scan", this.scanResults.length),
      scannedAt: new Date().toISOString(),
    });
    this.scanResults.push(row);
    return row;
  }

  listScanResults(documentId: string): ScanResultRecord[] {
    return this.scanResults.filter((row) => row.documentId === documentId).map((row) => ({ ...row }));
  }

  saveClearance(record: Omit<SecurityClearanceRecord, "id">): SecurityClearanceRecord {
    const row: SecurityClearanceRecord = { ...record, id: nextId("clr", this.clearances.length) };
    this.clearances.push(row);
    return { ...row };
  }

  listClearances(tenantId: string): SecurityClearanceRecord[] {
    return this.clearances.filter((row) => row.tenantId === tenantId).map((row) => ({ ...row }));
  }

  appendAccessAudit(input: AppendAccessAuditInput): DocumentAuditRecord {
    const chainHead = this.accessAudit[this.accessAudit.length - 1];
    const prevHash = chainHead ? chainHead.rowHash : GENESIS_AUDIT_HASH;
    const seqNo = this.accessAudit.length + 1;
    const occurredAt = new Date().toISOString();
    const rowHash = computeAccessAuditRowHash(input, seqNo, occurredAt, prevHash);
    const row: DocumentAuditRecord = Object.freeze({
      ...input,
      id: nextId("docaudit", this.accessAudit.length),
      seqNo,
      prevHash,
      rowHash,
      occurredAt,
    });
    this.accessAudit.push(row);
    return row;
  }

  listAccessAudit(documentId: string): DocumentAuditRecord[] {
    return this.accessAudit.filter((row) => row.documentId === documentId).map((row) => ({ ...row }));
  }

  saveRetentionClass(record: RetentionClassRecord): RetentionClassRecord {
    if (!record.isPermanent && record.retentionPeriodMonths === undefined) {
      // DI-13 (ck_document_retention_policies_period): non-permanent classes need a period.
      throw new FoundationError("VALIDATION_FAILED", "A non-permanent retention class requires retentionPeriodMonths", {
        field: "retentionPeriodMonths",
      });
    }
    this.retentionClasses.set(`${record.tenantId}:${record.code}`, { ...record });
    return { ...record };
  }

  getRetentionClass(tenantId: string, code: string): RetentionClassRecord | null {
    const row = this.retentionClasses.get(`${tenantId}:${code}`);
    return row ? { ...row } : null;
  }

  saveDisposition(record: DispositionRecord): DispositionRecord {
    this.dispositions.set(record.id, { ...record });
    return { ...record };
  }

  getDisposition(id: string): DispositionRecord | null {
    const row = this.dispositions.get(id);
    return row ? { ...row } : null;
  }
}

/** Canonical E12 row hash: SHA-256(payload fields || prev_hash) — mirrors the R5 chain rule. */
export function computeAccessAuditRowHash(
  input: AppendAccessAuditInput,
  seqNo: number,
  occurredAt: string,
  prevHash: string
): string {
  const payload = [
    seqNo,
    input.tenantId,
    input.documentId,
    input.versionNo,
    input.action,
    input.actorUserId,
    input.result,
    input.denialReason ?? "",
    input.correlationId ?? "",
    occurredAt,
  ].join("|");
  return sha256Hex(`${payload}|${prevHash}`);
}

const INSERT_SCAN_RESULT = `
  INSERT INTO scan_results (tenant_id, entity_id, version_id, engine, malware_verdict, threat_name, integrity_verified)
  VALUES ($1, $2, $3, $4, $5::scan_status, $6, $7)
  RETURNING id, scanned_at`;

const UPDATE_DOCUMENT_SCAN_STATE = `
  UPDATE documents SET scan_status = $2::scan_status, status = $3::document_status, updated_at = now()
  WHERE id = $1`;

const INSERT_CLEARANCE = `
  INSERT INTO security_clearances
    (tenant_id, entity_id, principal_type, principal_ref, clearance_level, status, justification, granted_by, approved_by, valid_from, valid_until)
  VALUES ($1, $2, $3::g13_clearance_principal_type, $4, $5::classification_level, $6::g13_clearance_status, $7, $8, $9, $10, $11)
  RETURNING id`;

const SELECT_LATEST_AUDIT_ROW = `
  SELECT seq_no, row_hash FROM document_audit ORDER BY seq_no DESC LIMIT 1 FOR UPDATE`;

const INSERT_ACCESS_AUDIT = `
  INSERT INTO document_audit
    (tenant_id, entity_id, document_id, version_no, action, actor_user_id, correlation_id, result, denial_reason, prev_hash, row_hash, occurred_at)
  VALUES ($1, $2, $3, $4, $5::g13_doc_audit_action, $6, $7, $8::g13_audit_result, $9, $10, $11, $12)
  RETURNING id, seq_no`;

const INSERT_RETENTION_CLASS = `
  INSERT INTO document_retention_policies
    (tenant_id, policy_code, name, retention_period_months, is_permanent, disposition_action)
  VALUES ($1, $2, $3, $4, $5, $6::g13_disposition_action)
  ON CONFLICT (tenant_id, policy_code)
  DO UPDATE SET name = EXCLUDED.name, retention_period_months = EXCLUDED.retention_period_months,
                is_permanent = EXCLUDED.is_permanent, disposition_action = EXCLUDED.disposition_action, updated_at = now()`;

const INSERT_DISPOSITION = `
  INSERT INTO disposition_records
    (tenant_id, entity_id, document_id, retention_class_code, action, proposed_by, approved_by, status, executed_at, evidence_hash)
  VALUES ($1, $2, $3, $4, $5::g13_disposition_action, $6, $7, $8::g13_disposition_status, $9, $10)
  RETURNING id`;

const UPDATE_DISPOSITION = `
  UPDATE disposition_records
  SET approved_by = $2, status = $3::g13_disposition_status, executed_at = $4, evidence_hash = $5, updated_at = now()
  WHERE id = $1`;

const INSERT_STORAGE_OBJECT = `
  INSERT INTO storage_objects
    (tenant_id, entity_id, bucket, object_key, content_hash, dedup_index_key, security_domain, size_bytes, encryption_alg, kms_key_id, wrapped_dek)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AES-256-GCM', $9, $10)
  RETURNING id`;

/** JOB-G13-KEYROTATE re-wrap: ONLY wrapped_dek + kms_key_id change — ciphertext is never rewritten. */
const UPDATE_STORAGE_OBJECT_REWRAP = `
  UPDATE storage_objects SET wrapped_dek = $2, kms_key_id = $3, updated_at = now()
  WHERE id = $1`;

/** FR-018 crypto-shred: destroy the wrapped DEK; the row remains a tombstone (no DELETE). */
const UPDATE_STORAGE_OBJECT_SHRED = `
  UPDATE storage_objects SET wrapped_dek = ''::bytea, updated_at = now()
  WHERE id = $1`;

const INSERT_DSR = `
  INSERT INTO data_subject_requests
    (tenant_id, entity_id, dsr_no, data_subject_employee_id, request_type, consent_ref_id, received_at, status)
  VALUES ($1, $2, $3, $4, $5::g13_dsr_type, $6, $7, $8::g13_dsr_status)
  RETURNING id`;

const UPDATE_DSR_RESOLUTION = `
  UPDATE data_subject_requests
  SET status = $2::g13_dsr_status, legal_basis_exemption = $3, affected_document_count = $4,
      resolution_note = $5, erasure_method = $6::g13_erasure_method, adjudicated_by = $7, updated_at = now()
  WHERE id = $1`;

const UPDATE_DOCUMENT_ERASURE_STATE = `
  UPDATE documents SET dpdp_erasure_state = $2::erasure_method, updated_at = now()
  WHERE id = $1`;

/** FR-018 AC5 / P05: the SOLE UPDATE ever issued against document_audit — the DPDP redaction marker. */
const UPDATE_AUDIT_REDACTION_MARKER = `
  UPDATE document_audit
  SET actor_user_id = $2,
      denial_reason = CASE WHEN denial_reason IS NULL THEN NULL ELSE $2 END
  WHERE document_id = $1`;

/**
 * Postgres-backed persistence for the hardening entities (parameterised statements only; the
 * hash-chained E12 append and the scan-verdict + document-state promotion are transactional).
 * Async by nature, so it stands beside the sync in-memory contract like PgSrIntegrityRepository.
 */
export class PgDocumentSecurityRepository {
  constructor(private readonly pool: Pool) {}

  async appendScanResult(
    record: Omit<ScanResultRecord, "id" | "scannedAt"> & { versionId: string },
    promote: { documentStatus: "ACTIVE" | "QUARANTINED" | "PENDING_SCAN" }
  ): Promise<void> {
    // DI-11: the scan verdict row and the document promotion/quarantine commit atomically.
    await withTransaction(this.pool, async (client) => {
      await client.query(INSERT_SCAN_RESULT, [
        record.tenantId,
        record.entityId ?? null,
        record.versionId,
        record.engine,
        record.verdict === "PENDING" ? "PENDING" : record.verdict,
        record.threatName ?? null,
        record.integrityVerified,
      ]);
      const scanStatus = record.verdict === "INFECTED" ? "INFECTED" : record.verdict;
      await client.query(UPDATE_DOCUMENT_SCAN_STATE, [record.documentId, scanStatus, promote.documentStatus]);
    });
  }

  async saveClearance(record: Omit<SecurityClearanceRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_CLEARANCE, [
      record.tenantId,
      record.entityId ?? null,
      record.principalType,
      record.principalRef,
      record.clearanceLevel,
      record.status,
      record.justification,
      record.grantedBy,
      record.approvedBy ?? null,
      record.validFrom,
      record.validUntil ?? null,
    ]);
    return result.rows[0].id as string;
  }

  async appendAccessAudit(input: AppendAccessAuditInput): Promise<void> {
    // R5 chain integrity: read the chain head and append inside one transaction.
    await withTransaction(this.pool, async (client) => {
      const latest = await client.query(SELECT_LATEST_AUDIT_ROW);
      const prevHash = latest.rows.length > 0 ? (latest.rows[0].row_hash as string) : GENESIS_AUDIT_HASH;
      const seqNo = latest.rows.length > 0 ? Number(latest.rows[0].seq_no) + 1 : 1;
      const occurredAt = new Date().toISOString();
      const rowHash = computeAccessAuditRowHash(input, seqNo, occurredAt, prevHash);
      await client.query(INSERT_ACCESS_AUDIT, [
        input.tenantId,
        input.entityId ?? null,
        input.documentId,
        input.versionNo,
        input.action,
        input.actorUserId,
        input.correlationId ?? null,
        input.result,
        input.denialReason ?? null,
        prevHash,
        rowHash,
        occurredAt,
      ]);
    });
  }

  async saveRetentionClass(record: RetentionClassRecord): Promise<void> {
    await this.pool.query(INSERT_RETENTION_CLASS, [
      record.tenantId,
      record.code,
      record.name,
      record.retentionPeriodMonths ?? null,
      record.isPermanent,
      record.dispositionAction,
    ]);
  }

  async saveDisposition(record: Omit<DispositionRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_DISPOSITION, [
      record.tenantId,
      record.entityId ?? null,
      record.documentId,
      record.retentionClassCode,
      record.action,
      record.proposedBy,
      record.approvedBy ?? null,
      record.status,
      record.executedAt ?? null,
      record.evidenceHash ?? null,
    ]);
    return result.rows[0].id as string;
  }

  async updateDisposition(record: Pick<DispositionRecord, "id" | "approvedBy" | "status" | "executedAt" | "evidenceHash">): Promise<void> {
    await this.pool.query(UPDATE_DISPOSITION, [
      record.id,
      record.approvedBy ?? null,
      record.status,
      record.executedAt ?? null,
      record.evidenceHash ?? null,
    ]);
  }

  /** E19: persist one envelope-encrypted object — only wrapped_dek + kms_key_id key material. */
  async saveStorageObject(record: {
    tenantId: string;
    entityId?: string;
    bucket: string;
    objectKey: string;
    contentHash: string;
    dedupIndexKey: string;
    securityDomain: string;
    sizeBytes: number;
    kmsKeyId: string;
    wrappedDek: Buffer;
  }): Promise<string> {
    const result = await this.pool.query(INSERT_STORAGE_OBJECT, [
      record.tenantId,
      record.entityId ?? null,
      record.bucket,
      record.objectKey,
      record.contentHash,
      record.dedupIndexKey,
      record.securityDomain,
      record.sizeBytes,
      record.kmsKeyId,
      record.wrappedDek,
    ]);
    return result.rows[0].id as string;
  }

  /**
   * JOB-G13-KEYROTATE: apply a batch of re-wraps atomically. Each entry updates ONLY
   * wrapped_dek + kms_key_id — object ciphertext is never rewritten by rotation.
   */
  async rewrapStorageObjects(entries: Array<{ id: string; wrappedDek: Buffer; kmsKeyId: string }>): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      for (const entry of entries) {
        await client.query(UPDATE_STORAGE_OBJECT_REWRAP, [entry.id, entry.wrappedDek, entry.kmsKeyId]);
      }
    });
  }

  /** E22: register a DPDP data-subject request (statutory clock = received_at, FR-018 AC1). */
  async saveDataSubjectRequest(record: Omit<DataSubjectRequestRecord, "id" | "outcomes">): Promise<string> {
    const result = await this.pool.query(INSERT_DSR, [
      record.tenantId,
      record.entityId ?? null,
      record.dsrNo,
      record.dataSubjectEmployeeId,
      record.requestType,
      record.consentRefId ?? null,
      record.receivedAt,
      record.status,
    ]);
    return result.rows[0].id as string;
  }

  /**
   * FR-018 erasure execution for one non-exempt document — the redaction-marker path, committed
   * atomically: crypto-shred the storage object's wrapped DEK, set documents.dpdp_erasure_state,
   * overwrite audit PII with the redaction marker (the sole P05 UPDATE exception — rows are
   * never deleted), and stamp the request resolution.
   */
  async executeDsrErasure(input: {
    dsrId: string;
    documentId: string;
    storageObjectIds: string[];
    erasureState: G13ErasureMethod;
    redactionMarker: string;
    resolution: {
      status: G13DsrStatus;
      legalBasisExemption?: string;
      affectedDocumentCount?: number;
      resolutionNote?: string;
      erasureMethod?: G13ErasureMethod;
      adjudicatedBy?: string;
    };
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      for (const storageObjectId of input.storageObjectIds) {
        await client.query(UPDATE_STORAGE_OBJECT_SHRED, [storageObjectId]);
      }
      await client.query(UPDATE_DOCUMENT_ERASURE_STATE, [input.documentId, input.erasureState]);
      await client.query(UPDATE_AUDIT_REDACTION_MARKER, [input.documentId, input.redactionMarker]);
      await client.query(UPDATE_DSR_RESOLUTION, [
        input.dsrId,
        input.resolution.status,
        input.resolution.legalBasisExemption ?? null,
        input.resolution.affectedDocumentCount ?? null,
        input.resolution.resolutionNote ?? null,
        input.resolution.erasureMethod ?? null,
        input.resolution.adjudicatedBy ?? null,
      ]);
    });
  }

  /** FR-018 exempt resolution (EXEMPT_RETAINED): record basis + state without touching content. */
  async recordDsrExemption(input: {
    dsrId: string;
    documentId: string;
    legalBasisExemption: string;
    resolution: { status: G13DsrStatus; affectedDocumentCount?: number; resolutionNote?: string; adjudicatedBy?: string };
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(UPDATE_DOCUMENT_ERASURE_STATE, [input.documentId, "EXEMPT_RETAINED"]);
      await client.query(UPDATE_DSR_RESOLUTION, [
        input.dsrId,
        input.resolution.status,
        input.legalBasisExemption,
        input.resolution.affectedDocumentCount ?? null,
        input.resolution.resolutionNote ?? null,
        "EXEMPT_RETAINED",
        input.resolution.adjudicatedBy ?? null,
      ]);
    });
  }
}
