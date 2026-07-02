import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, inScope } from "../../platform/types";
import type { G02FieldGroup, G02Sensitivity } from "./personalDetailsRepository";

/**
 * G02 change-governance persistence (PH-16B): FR-G02-009 bulk_correction_batches (E12),
 * FR-G02-019 cr_risk_signals (E13, APPEND-ONLY), and the FR-G02-018 governed change-request
 * slice carrying employment_status_at_submit / risk_score / risk_band on the E1 header
 * (docs/data-model/02-G02-personal-details-workflow.sql; migration 0029).
 */

/** Frozen enum g02_risk_band (E1.risk_band; FR-G02-019). */
export type G02RiskBand = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
/** Frozen enum g02_risk_signal_type (E13.signal_type; FR-G02-019). */
export type G02RiskSignalType =
  | "DUPLICATE_BANK_ACCOUNT"
  | "PRE_PAYROLL_CUTOFF"
  | "PRE_SEPARATION_WINDOW"
  | "DEVICE_VELOCITY"
  | "MULTI_EMPLOYEE_SAME_DEVICE"
  | "AUTH_CHANNEL_THEN_FINANCIAL"
  | "OFF_HOURS_BURST";
/** Frozen enum g02_risk_severity (E13.severity). */
export type G02RiskSeverity = "INFO" | "WARN" | "HIGH" | "BLOCK";
/** Frozen enum g02_risk_review_outcome (E13.review_outcome). */
export type G02RiskReviewOutcome = "CLEARED" | "CONFIRMED_FRAUD" | "ESCALATED";
/** Frozen enum g02_bulk_status — E12 lifecycle verbatim (FR-G02-009). */
export type G02BulkStatus = "UPLOADED" | "VALIDATED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "COMMITTED" | "PARTIAL_FAILED";
/** Subset of the frozen g02_cr_status enum used by the governed slice. */
export type GovernedChangeStatus = "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "COMMITTED" | "COMMIT_FAILED";
/** Frozen enum g02_request_origin subset for this slice (BULK = FR-G02-009 child rows). */
export type GovernedChangeOrigin = "SELF_SERVICE" | "HR_ON_BEHALF" | "BULK";
/**
 * FR-G02-018 route classification: NONE = standard P01 route; STATUS_ELEVATED = HR-on-behalf
 * on a non-ACTIVE record (elevated authority + justification); FAMILY_PENSION = bank/nominee
 * change on a DECEASED record (Appointing-Authority dual control — never auto-apply, BR2).
 */
export type G02ElevatedPath = "NONE" | "STATUS_ELEVATED" | "FAMILY_PENSION";

/** E1 change_requests governed slice (FR-G02-009/018/019 columns). */
export interface G02GovernedChangeRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  crNumber: string;
  targetEmployeeId: string;
  requestedBy: string;
  requestOrigin: GovernedChangeOrigin;
  changeType: "UPDATE" | "CORRECTION";
  fieldKey: string;
  fieldGroup: G02FieldGroup;
  sensitivity: G02Sensitivity;
  oldValue: string;
  newValue: string;
  status: GovernedChangeStatus;
  /** FR-G02-018 AC4: snapshot of the G01 employment_status read at submit. */
  employmentStatusAtSubmit: string;
  /** FR-G02-019: aggregated 0-100 score and band over the un-cleared E13 signals. */
  riskScore: number;
  riskBand: G02RiskBand;
  /** FR-G02-019 AC3 / FR-G02-002 AC7: HIGH band injects the CONDITIONAL fraud-review stage. */
  fraudReviewRequired: boolean;
  elevatedPath: G02ElevatedPath;
  /** FR-G02-018 BR2 dual control: FAMILY_PENSION/STATUS_ELEVATED require two distinct approvers. */
  requiredApprovals: number;
  approvedBy: string[];
  workflowStage: string;
  workflowInstanceId: string;
  bulkBatchId?: string;
  bulkRowNo?: number;
  commitIdempotencyKey?: string;
  reason: string;
  submittedAt: string;
  committedAt?: string;
  failureReason?: string;
}

/** E13 cr_risk_signals row — APPEND-ONLY ledger (BRD rule 9); only review fields mutate. */
export interface CrRiskSignal {
  id: string;
  tenantId: string;
  entityId?: string;
  changeRequestId: string;
  signalType: G02RiskSignalType;
  severity: G02RiskSeverity;
  scoreContribution: number;
  /** Evidence, e.g. matched employee_ids for the mule detector (FR-G02-019 AC4). */
  detail: Record<string, unknown>;
  detectedAt: string;
  reviewedBy?: string;
  reviewOutcome?: G02RiskReviewOutcome;
  reviewComment?: string;
}

/** One uploaded CSV-shaped correction row (FR-G02-009). */
export interface BulkCorrectionRow {
  rowNo: number;
  employeeId: string;
  fieldKey: string;
  newValue: string;
  changeType?: "UPDATE" | "CORRECTION";
  reason?: string;
}

/** Dry-run validation verdict per row (FR-G02-009 AC1: row-level reasons). */
export interface BulkRowValidation {
  rowNo: number;
  valid: boolean;
  reasons: string[];
  elevatedPath: G02ElevatedPath;
  sensitivity?: G02Sensitivity;
}

/** Per-row commit outcome (FR-G02-009 AC4: failures recorded per row, never wholesale). */
export interface BulkRowCommitResult {
  rowNo: number;
  changeRequestId?: string;
  committed: boolean;
  errorCode?: string;
}

/** E12 bulk_correction_batches. */
export interface BulkCorrectionBatch {
  id: string;
  tenantId: string;
  entityId?: string;
  batchNumber: string;
  initiatedBy: string;
  rows: BulkCorrectionRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  status: G02BulkStatus;
  dryRunReport?: BulkRowValidation[];
  commitReport?: BulkRowCommitResult[];
  highestSensitivity?: G02Sensitivity;
  workflowInstanceId?: string;
  approvedBy?: string;
  reason?: string;
}

export interface ChangeGovernanceRepository {
  countRequests(): number;
  insertRequest(request: G02GovernedChangeRequest): void;
  updateRequest(request: G02GovernedChangeRequest): void;
  findRequest(scope: TenantScope, requestId: string): G02GovernedChangeRequest | undefined;
  listRequests(scope: TenantScope): G02GovernedChangeRequest[];
  countBatches(): number;
  insertBatch(batch: BulkCorrectionBatch): void;
  updateBatch(batch: BulkCorrectionBatch): void;
  findBatch(scope: TenantScope, batchId: string): BulkCorrectionBatch | undefined;
  countRiskSignals(): number;
  /** INSERT-only: the E13 ledger has no update/delete surface besides the review fields. */
  appendRiskSignal(signal: CrRiskSignal): void;
  listRiskSignals(scope: TenantScope, changeRequestId: string): CrRiskSignal[];
  /** Mutates ONLY reviewed_by/review_outcome/review comment — detection rows are immutable. */
  recordRiskSignalReview(
    scope: TenantScope,
    signalId: string,
    review: { reviewedBy: string; reviewOutcome: G02RiskReviewOutcome; reviewComment: string }
  ): CrRiskSignal;
}

/** In-memory implementation, injectable for the executed unit suites. */
export class InMemoryChangeGovernanceRepository implements ChangeGovernanceRepository {
  private readonly requests: G02GovernedChangeRequest[] = [];
  private readonly batches: BulkCorrectionBatch[] = [];
  private readonly signals: CrRiskSignal[] = [];

  countRequests(): number {
    return this.requests.length;
  }

  insertRequest(request: G02GovernedChangeRequest): void {
    this.requests.push(cloneRequest(request));
  }

  updateRequest(request: G02GovernedChangeRequest): void {
    const index = this.requests.findIndex((item) => item.id === request.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "G02 governed change request not found");
    }
    this.requests[index] = cloneRequest(request);
  }

  findRequest(scope: TenantScope, requestId: string): G02GovernedChangeRequest | undefined {
    const found = this.requests.find((item) => item.id === requestId && inScope(item, scope));
    return found ? cloneRequest(found) : undefined;
  }

  listRequests(scope: TenantScope): G02GovernedChangeRequest[] {
    return this.requests.filter((item) => inScope(item, scope)).map(cloneRequest);
  }

  countBatches(): number {
    return this.batches.length;
  }

  insertBatch(batch: BulkCorrectionBatch): void {
    this.batches.push(cloneBatch(batch));
  }

  updateBatch(batch: BulkCorrectionBatch): void {
    const index = this.batches.findIndex((item) => item.id === batch.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "G02 bulk correction batch not found");
    }
    this.batches[index] = cloneBatch(batch);
  }

  findBatch(scope: TenantScope, batchId: string): BulkCorrectionBatch | undefined {
    const found = this.batches.find((item) => item.id === batchId && inScope(item, scope));
    return found ? cloneBatch(found) : undefined;
  }

  countRiskSignals(): number {
    return this.signals.length;
  }

  appendRiskSignal(signal: CrRiskSignal): void {
    this.signals.push({ ...signal, detail: { ...signal.detail } });
  }

  listRiskSignals(scope: TenantScope, changeRequestId: string): CrRiskSignal[] {
    return this.signals
      .filter((item) => item.changeRequestId === changeRequestId && inScope(item, scope))
      .map((item) => ({ ...item, detail: { ...item.detail } }));
  }

  recordRiskSignalReview(
    scope: TenantScope,
    signalId: string,
    review: { reviewedBy: string; reviewOutcome: G02RiskReviewOutcome; reviewComment: string }
  ): CrRiskSignal {
    const signal = this.signals.find((item) => item.id === signalId && inScope(item, scope));
    if (!signal) {
      throw new FoundationError("NOT_FOUND", "G02 risk signal not found");
    }
    // Append-only ledger discipline: the detection row (type/severity/score/detail) never
    // changes; only the review-status fields are set (BRD rule 9 / FR-G02-019 AC6).
    signal.reviewedBy = review.reviewedBy;
    signal.reviewOutcome = review.reviewOutcome;
    signal.reviewComment = review.reviewComment;
    return { ...signal, detail: { ...signal.detail } };
  }
}

function cloneRequest(request: G02GovernedChangeRequest): G02GovernedChangeRequest {
  return { ...request, approvedBy: [...request.approvedBy] };
}

function cloneBatch(batch: BulkCorrectionBatch): BulkCorrectionBatch {
  return {
    ...batch,
    rows: batch.rows.map((row) => ({ ...row })),
    dryRunReport: batch.dryRunReport?.map((row) => ({ ...row, reasons: [...row.reasons] })),
    commitReport: batch.commitReport?.map((row) => ({ ...row })),
  };
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen E12/E13 tables + E1 risk columns, migrated by
// apps/api/db/migrations/0029_g02_bulk_corrections_risk_signals.sql. All SQL is
// parameterised ($1, $2, ...); multi-step writes (batch header move + per-row child commit,
// signal review + header band re-aggregate) run in a single transaction. The in-memory
// implementation above carries the same operation set for the executed suites; this class
// is the production seam.
// ---------------------------------------------------------------------------------------

export interface BulkCorrectionBatchRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  batch_number: string;
  initiated_by: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  status: string;
  reason: string | null;
  approved_by: string | null;
}

export interface CrRiskSignalRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  change_request_id: string;
  signal_type: string;
  severity: string;
  score_contribution: number;
  detail: Record<string, unknown> | null;
  reviewed_by: string | null;
  review_outcome: string | null;
}

const INSERT_BATCH =
  "INSERT INTO bulk_correction_batches (tenant_id, entity_id, batch_number, initiated_by, total_rows, valid_rows, invalid_rows, status, reason) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::g02_bulk_status, $9) RETURNING *";

const UPDATE_BATCH_STATUS =
  "UPDATE bulk_correction_batches SET status = $3::g02_bulk_status, valid_rows = $4, invalid_rows = $5, approved_by = $6, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false RETURNING *";

const SELECT_BATCH = "SELECT * FROM bulk_correction_batches WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const APPEND_RISK_SIGNAL =
  "INSERT INTO cr_risk_signals (tenant_id, entity_id, change_request_id, signal_type, severity, score_contribution, detail) " +
  "VALUES ($1, $2, $3, $4::g02_risk_signal_type, $5::g02_risk_severity, $6, $7::jsonb) RETURNING *";

const SELECT_RISK_SIGNALS =
  "SELECT * FROM cr_risk_signals WHERE tenant_id = $1 AND change_request_id = $2 ORDER BY detected_at ASC";

/** Review mutates ONLY the review fields — never the detection payload (append-only, rule 9). */
const RECORD_SIGNAL_REVIEW =
  "UPDATE cr_risk_signals SET reviewed_by = $3, review_outcome = $4::g02_risk_review_outcome WHERE tenant_id = $1 AND id = $2 RETURNING *";

const UPDATE_REQUEST_RISK =
  "UPDATE change_requests SET risk_score = $3, risk_band = $4::g02_risk_band, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *";

const COMMIT_CHILD_ROW =
  "UPDATE change_requests SET status = 'COMMITTED'::g02_cr_status, committed_at = now(), updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'APPROVED'::g02_cr_status RETURNING *";

export class PgChangeGovernanceRepository {
  constructor(private readonly pool: Pool) {}

  async insertBatch(input: {
    tenantId: string;
    entityId: string;
    batchNumber: string;
    initiatedBy: string;
    totalRows: number;
    reason?: string;
  }): Promise<BulkCorrectionBatchRow> {
    const result = await this.pool.query(INSERT_BATCH, [
      input.tenantId,
      input.entityId,
      input.batchNumber,
      input.initiatedBy,
      input.totalRows,
      0,
      0,
      "UPLOADED",
      input.reason ?? null,
    ]);
    return result.rows[0] as BulkCorrectionBatchRow;
  }

  async findBatch(tenantId: string, batchId: string): Promise<BulkCorrectionBatchRow | undefined> {
    const result = await this.pool.query(SELECT_BATCH, [tenantId, batchId]);
    return result.rows[0] as BulkCorrectionBatchRow | undefined;
  }

  async updateBatchStatus(input: {
    tenantId: string;
    batchId: string;
    status: G02BulkStatus;
    validRows: number;
    invalidRows: number;
    approvedBy?: string;
  }): Promise<BulkCorrectionBatchRow> {
    const result = await this.pool.query(UPDATE_BATCH_STATUS, [
      input.tenantId,
      input.batchId,
      input.status,
      input.validRows,
      input.invalidRows,
      input.approvedBy ?? null,
    ]);
    if ((result.rowCount ?? 0) === 0) {
      throw new FoundationError("NOT_FOUND", "G02 bulk correction batch not found");
    }
    return result.rows[0] as BulkCorrectionBatchRow;
  }

  async appendRiskSignal(input: {
    tenantId: string;
    entityId: string;
    changeRequestId: string;
    signalType: G02RiskSignalType;
    severity: G02RiskSeverity;
    scoreContribution: number;
    detail: Record<string, unknown>;
  }): Promise<CrRiskSignalRow> {
    const result = await this.pool.query(APPEND_RISK_SIGNAL, [
      input.tenantId,
      input.entityId,
      input.changeRequestId,
      input.signalType,
      input.severity,
      input.scoreContribution,
      JSON.stringify(input.detail),
    ]);
    return result.rows[0] as CrRiskSignalRow;
  }

  async listRiskSignals(tenantId: string, changeRequestId: string): Promise<CrRiskSignalRow[]> {
    const result = await this.pool.query(SELECT_RISK_SIGNALS, [tenantId, changeRequestId]);
    return result.rows as CrRiskSignalRow[];
  }

  /**
   * Reviewer clear/confirm: the review-field update and the header risk re-aggregation move
   * in one transaction so a cleared BLOCK signal can never leave a stale BLOCKED band behind.
   */
  async recordSignalReviewAndReaggregate(input: {
    tenantId: string;
    signalId: string;
    changeRequestId: string;
    reviewedBy: string;
    reviewOutcome: G02RiskReviewOutcome;
    riskScore: number;
    riskBand: G02RiskBand;
  }): Promise<CrRiskSignalRow> {
    return withTransaction(this.pool, async (client) => {
      const signalResult = await client.query(RECORD_SIGNAL_REVIEW, [
        input.tenantId,
        input.signalId,
        input.reviewedBy,
        input.reviewOutcome,
      ]);
      if ((signalResult.rowCount ?? 0) === 0) {
        throw new FoundationError("NOT_FOUND", "G02 risk signal not found");
      }
      await client.query(UPDATE_REQUEST_RISK, [input.tenantId, input.changeRequestId, input.riskScore, input.riskBand]);
      return signalResult.rows[0] as CrRiskSignalRow;
    });
  }

  /**
   * Per-row idempotent bulk commit: the child status flip and the batch counter/status move
   * run in one transaction per row (FR-G02-009 AC4 — per-row isolation, never wholesale).
   * A replayed committed row matches zero rows via the status guard and is a no-op.
   */
  async commitChildRow(input: {
    tenantId: string;
    changeRequestId: string;
    batchId: string;
    batchStatus: G02BulkStatus;
    validRows: number;
    invalidRows: number;
  }): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const committed = await client.query(COMMIT_CHILD_ROW, [input.tenantId, input.changeRequestId]);
      await client.query(UPDATE_BATCH_STATUS, [
        input.tenantId,
        input.batchId,
        input.batchStatus,
        input.validRows,
        input.invalidRows,
        null,
      ]);
      return (committed.rowCount ?? 0) > 0;
    });
  }
}
