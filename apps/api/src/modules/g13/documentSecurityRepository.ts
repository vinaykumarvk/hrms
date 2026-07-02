import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, nextId, sha256Hex } from "../../platform/types";

/**
 * PH-10C G13 security-hardening persistence (BRD G13 v3; docs/data-model/
 * 13-G13-document-management.sql; migration 0020_g13_security_hardening.sql):
 *   E15 scan_results                — append-only malware-scan verdict ledger (DI-11)
 *   E21 security_clearances        — deny-by-default classification gate store (FR-006)
 *   E12 document_audit             — append-only hash-chained access ledger (FR-015/016)
 *   E8  document_retention_policies — retention classes binding disposition eligibility (FR-009)
 *   E18 disposition_records        — maker!=checker disposition SoD (FR-009, DI-10)
 * plus the version content bytes the integrity re-verification reads on every fetch (FR-005).
 * Entity state routes through this repository; the vault service owns no bare arrays for them.
 */

export type G13ScanVerdict = "CLEAN" | "INFECTED" | "PENDING";
export type G13ClassificationLevel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";
export type G13ClearancePrincipalType = "USER" | "ROLE";
export type G13ClearanceStatus = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
export type G13AccessAuditAction = "VIEW" | "DOWNLOAD" | "DISPOSE" | "CLEARANCE_CHANGE";
export type G13AuditResult = "SUCCESS" | "DENIED";
export type G13DispositionAction = "DESTROY" | "ARCHIVE_TRANSFER" | "REVIEW";
export type G13DispositionStatus = "PROPOSED" | "APPROVED" | "EXECUTED" | "REJECTED" | "BLOCKED_HOLD";

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
  /** Stored version bytes the FR-005 integrity re-verification reads on every fetch. */
  putContent(documentId: string, versionNo: number, bytes: Buffer): void;
  getContent(documentId: string, versionNo: number): Buffer | null;
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

export class InMemoryDocumentSecurityRepository implements DocumentSecurityRepository {
  private readonly contentStore = new Map<string, Buffer>();
  private readonly scanResults: ScanResultRecord[] = [];
  private readonly clearances: SecurityClearanceRecord[] = [];
  private readonly accessAudit: DocumentAuditRecord[] = [];
  private readonly retentionClasses = new Map<string, RetentionClassRecord>();
  private readonly dispositions = new Map<string, DispositionRecord>();

  putContent(documentId: string, versionNo: number, bytes: Buffer): void {
    this.contentStore.set(`${documentId}:${versionNo}`, Buffer.from(bytes));
  }

  getContent(documentId: string, versionNo: number): Buffer | null {
    const bytes = this.contentStore.get(`${documentId}:${versionNo}`);
    return bytes ? Buffer.from(bytes) : null;
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
}
