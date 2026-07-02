import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";
import { PenPensioner } from "./pensionerLifecycleRepository";

/**
 * PH-15B — BRD G11 FR-13 revision engine persisted per
 * docs/data-model/11-G11-retirement-pension.sql E16 pen_revisions (migration 0023):
 * a batch header row (is_batch=true) plus one per-pensioner delta line per cohort member.
 * Batch inputs (the E30 pen_da_relief_rates row / pay-commission fitment factor, effective
 * date) are SNAPSHOT onto the header so a recompute is deterministic: identical inputs
 * produce deep-equal old/new/arrear deltas (AC3). Applied batches are immutable (AC4/P05) —
 * ERR-G11-REVISION-IMMUTABLE; corrections create a new batch. All money is integer paise.
 */

export type G11RevisionType = "DA" | "PAY_COMMISSION" | "RESTORATION" | "AGE_INCREMENT";
export type G11RevisionBatchStatus = "DRAFT" | "COMPUTED" | "APPROVED" | "APPLIED";
export type G11RevisionLineStatus = "COMPUTED" | "APPLIED";

/** E16 batch header row (is_batch=true; pensioner_id null). */
export interface PenRevisionBatch {
  id: string;
  tenantId: string;
  entityId?: string;
  revisionNo: string;
  revisionType: G11RevisionType;
  effectiveDate: string;
  isBatch: true;
  /** JOB-G11-PENSION-RUN run key stamped on apply. */
  jobRunRef?: string;
  /** DA batches: FK + snapshot of the effective E30 pen_da_relief_rates row (BR1). */
  daRateRef?: string;
  daPercentBps?: number;
  /** PAY_COMMISSION batches: the re-fixation fitment factor x 10^4 (snapshot input). */
  fitmentFactorTenThousandths?: number;
  /** IR18 / §16.9: the deterministic application order recorded for the batch. */
  calcTrace: Record<string, unknown>;
  makerUserId: string;
  approvedByUserId?: string;
  appliedOn?: string;
  status: G11RevisionBatchStatus;
}

/** E16 per-pensioner delta line (is_batch=false). */
export interface PenRevisionLine {
  /** Deterministic id (revision_no + pensioner_no) so recomputes are deep-equal (AC3). */
  id: string;
  tenantId: string;
  entityId?: string;
  batchId: string;
  revisionNo: string;
  pensionerId: string;
  pensionerNo: string;
  oldBasicPaise: number;
  newBasicPaise: number;
  oldDaReliefPaise: number;
  newDaReliefPaise: number;
  oldMonthlyPaise: number;
  newMonthlyPaise: number;
  monthlyDeltaPaise: number;
  /** Month-wise arrears from the effective date to the computation date (AC2). */
  arrearMonths: number;
  arrearsPaise: number;
  /** §16.9 ordering position recorded per line (AC6). */
  applicationOrder: number;
  calcTrace: Record<string, unknown>;
  status: G11RevisionLineStatus;
}

export interface PensionRevisionRepository {
  countBatches(): number;
  insertBatch(row: PenRevisionBatch): void;
  saveBatch(row: PenRevisionBatch): void;
  findBatchById(scope: TenantScope, batchId: string): PenRevisionBatch | undefined;
  listBatches(scope: TenantScope): PenRevisionBatch[];
  /** Recompute replaces the staged lines wholesale (only legal while NOT applied). */
  replaceLines(scope: TenantScope, batchId: string, lines: PenRevisionLine[]): void;
  listLines(scope: TenantScope, batchId: string): PenRevisionLine[];
  /**
   * AC3/AC4 apply — pensioner master updates + line/batch APPLIED flips persist in ONE
   * atomic unit (a transaction in the Pg repository); no partial commit.
   */
  applyBatch(batch: PenRevisionBatch, lines: PenRevisionLine[], pensioners: PenPensioner[]): void;
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory PensionRevisionRepository (same seam as PgPensionRevisionRepository). */
export class InMemoryPensionRevisionRepository implements PensionRevisionRepository {
  private readonly batches: PenRevisionBatch[] = [];
  private lines: PenRevisionLine[] = [];

  constructor(private readonly savePensioner: (row: PenPensioner) => void) {}

  countBatches(): number {
    return this.batches.length;
  }

  insertBatch(row: PenRevisionBatch): void {
    this.batches.push(row);
  }

  saveBatch(row: PenRevisionBatch): void {
    const index = this.batches.findIndex((item) => item.id === row.id);
    if (index < 0) {
      this.batches.push(row);
      return;
    }
    this.batches[index] = row;
  }

  findBatchById(scope: TenantScope, batchId: string): PenRevisionBatch | undefined {
    return this.batches.find((item) => rowInScope(item, scope) && item.id === batchId);
  }

  listBatches(scope: TenantScope): PenRevisionBatch[] {
    return this.batches.filter((item) => rowInScope(item, scope));
  }

  replaceLines(scope: TenantScope, batchId: string, lines: PenRevisionLine[]): void {
    this.lines = this.lines.filter((item) => !(rowInScope(item, scope) && item.batchId === batchId));
    this.lines.push(...lines);
  }

  listLines(scope: TenantScope, batchId: string): PenRevisionLine[] {
    return this.lines.filter((item) => rowInScope(item, scope) && item.batchId === batchId);
  }

  applyBatch(batch: PenRevisionBatch, lines: PenRevisionLine[], pensioners: PenPensioner[]): void {
    for (const pensioner of pensioners) {
      this.savePensioner(pensioner);
    }
    for (const line of lines) {
      const index = this.lines.findIndex((item) => item.id === line.id && item.batchId === line.batchId);
      if (index >= 0) {
        this.lines[index] = line;
      }
    }
    this.saveBatch(batch);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the migration-0023 E16 pen_revisions DDL (batch header +
// per-pensioner lines via the subset batch_id FK). All SQL is parameterised; APPLY runs in
// ONE transaction (pensioner masters + lines + header — no partial commit, FR-13 failure
// handling). Money columns are NUMERIC(15,2); paise conversion happens in SQL.
// ---------------------------------------------------------------------------------------

const INSERT_REVISION_HEADER =
  "INSERT INTO pen_revisions (tenant_id, entity_id, revision_no, revision_type, effective_date, is_batch, job_run_ref, da_rate_ref, " +
  "fitment_factor, calc_trace, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::numeric / 10000, $9::jsonb, $10, $11) RETURNING id";

const INSERT_REVISION_LINE =
  "INSERT INTO pen_revisions (tenant_id, entity_id, revision_no, revision_type, effective_date, is_batch, batch_id, pensioner_id, " +
  "old_basic, new_basic, arrears_amount, application_order, calc_trace, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8::numeric / 100, $9::numeric / 100, $10::numeric / 100, $11, $12::jsonb, $13, $14)";

const DELETE_STAGED_LINES = "DELETE FROM pen_revisions WHERE tenant_id = $1 AND batch_id = $2 AND is_batch = false AND status <> 'APPLIED'";

const UPDATE_PENSIONER_REVISED =
  "UPDATE pen_pensioners SET current_pension_basic = $3::numeric / 100, current_da_relief = $4::numeric / 100, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2";

const MARK_BATCH_APPLIED =
  "UPDATE pen_revisions SET status = 'APPLIED', job_run_ref = $3, updated_at = now() WHERE tenant_id = $1 AND (id = $2 OR batch_id = $2)";

/** Postgres-backed G11 revision repository (migration 0023). */
export class PgPensionRevisionRepository {
  constructor(private readonly pool: Pool) {}

  async insertBatch(row: PenRevisionBatch, createdBy?: string): Promise<{ revisionId: string }> {
    const inserted = await this.pool.query(INSERT_REVISION_HEADER, [
      row.tenantId,
      row.entityId ?? null,
      row.revisionNo,
      row.revisionType,
      row.effectiveDate,
      row.jobRunRef ?? null,
      row.daRateRef ?? null,
      row.fitmentFactorTenThousandths ?? null,
      JSON.stringify(row.calcTrace),
      row.status,
      createdBy ?? null,
    ]);
    return { revisionId: (inserted.rows[0] as { id: string }).id };
  }

  /** Recompute: replace the staged (non-APPLIED) lines for the batch — ONE transaction. */
  async replaceLines(batch: PenRevisionBatch, lines: PenRevisionLine[], createdBy?: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(DELETE_STAGED_LINES, [batch.tenantId, batch.id]);
      for (const line of lines) {
        await client.query(INSERT_REVISION_LINE, [
          line.tenantId,
          line.entityId ?? null,
          `${line.revisionNo}/${line.pensionerNo}`,
          batch.revisionType,
          batch.effectiveDate,
          batch.id,
          line.pensionerId,
          line.oldBasicPaise,
          line.newBasicPaise,
          line.arrearsPaise,
          line.applicationOrder,
          JSON.stringify(line.calcTrace),
          line.status,
          createdBy ?? null,
        ]);
      }
    });
  }

  /** AC3/AC4 apply — pensioner masters + lines + header flip APPLIED in ONE transaction. */
  async applyBatch(batch: PenRevisionBatch, pensioners: PenPensioner[]): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      for (const pensioner of pensioners) {
        await client.query(UPDATE_PENSIONER_REVISED, [pensioner.tenantId, pensioner.id, pensioner.currentPensionBasicPaise, pensioner.currentDaReliefPaise]);
      }
      await client.query(MARK_BATCH_APPLIED, [batch.tenantId, batch.id, batch.jobRunRef ?? null]);
    });
  }
}
