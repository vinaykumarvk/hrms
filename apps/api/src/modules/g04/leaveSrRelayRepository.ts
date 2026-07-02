import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, inScope } from "../../platform/types";
import type {
  LeaveSrOutboxEvent,
  ReconciliationFinding,
  ReconciliationRun,
  SrCorrectionLink,
  SrDeadLetterRecord,
} from "./leaveSrRelayService";

/**
 * G04 relay repository contract consumed by LeaveSrRelayService.
 * The statutory entities — leave_event_outbox, sr_dead_letter, reconciliation_run,
 * reconciliation_finding and sr_correction_link — route through here; the service
 * no longer owns bare in-memory arrays.
 */
export interface LeaveSrRelayRepository {
  countOutbox(): number;
  insertOutboxEvent(event: LeaveSrOutboxEvent): void;
  findOutboxEvent(scope: TenantScope, outboxEventId: string): LeaveSrOutboxEvent | undefined;
  listOutboxEvents(scope: TenantScope): LeaveSrOutboxEvent[];
  /** Highest event_sequence already allocated within (tenant, lineage); 0 when none. */
  maxEventSequence(tenantId: string, leaveSpellLineageId: string): number;
  countDeadLetters(): number;
  insertDeadLetter(record: SrDeadLetterRecord): void;
  findDeadLetterByOutboxId(scope: TenantScope, outboxEventId: string): SrDeadLetterRecord | undefined;
  listDeadLetters(scope: TenantScope): SrDeadLetterRecord[];
  countCorrectionLinks(): number;
  insertCorrectionLink(link: SrCorrectionLink): void;
  listCorrectionLinks(scope: TenantScope): SrCorrectionLink[];
  countReconciliationRuns(): number;
  insertReconciliationRun(run: ReconciliationRun): void;
  updateReconciliationRun(run: ReconciliationRun): void;
  countReconciliationFindings(): number;
  insertReconciliationFinding(finding: ReconciliationFinding): void;
  listReconciliationFindings(scope: TenantScope, runId?: string): ReconciliationFinding[];
}

/** In-memory implementation of the LeaveSrRelayRepository interface, injectable for unit tests. */
export class InMemoryLeaveSrRelayRepository implements LeaveSrRelayRepository {
  private readonly outbox: LeaveSrOutboxEvent[] = [];
  private readonly deadLetters: SrDeadLetterRecord[] = [];
  private readonly correctionLinks: SrCorrectionLink[] = [];
  private readonly reconciliationRuns: ReconciliationRun[] = [];
  private readonly reconciliationFindings: ReconciliationFinding[] = [];

  countOutbox(): number {
    return this.outbox.length;
  }

  insertOutboxEvent(event: LeaveSrOutboxEvent): void {
    const duplicate = this.outbox.find(
      (item) =>
        item.tenantId === event.tenantId &&
        item.leaveSpellLineageId === event.leaveSpellLineageId &&
        item.eventSequence === event.eventSequence
    );
    if (duplicate) {
      // Mirrors uq_outbox_lineage_seq UNIQUE (tenant_id, leave_spell_lineage_id, event_sequence).
      throw new FoundationError("CONFLICT", "Outbox event_sequence already allocated within this leave spell lineage", {
        details: { leaveSpellLineageId: event.leaveSpellLineageId, eventSequence: event.eventSequence },
      });
    }
    this.outbox.push(event);
  }

  findOutboxEvent(scope: TenantScope, outboxEventId: string): LeaveSrOutboxEvent | undefined {
    return this.outbox.find((item) => item.id === outboxEventId && inScope(item, scope));
  }

  listOutboxEvents(scope: TenantScope): LeaveSrOutboxEvent[] {
    return this.outbox.filter((item) => inScope(item, scope));
  }

  maxEventSequence(tenantId: string, leaveSpellLineageId: string): number {
    return this.outbox
      .filter((item) => item.tenantId === tenantId && item.leaveSpellLineageId === leaveSpellLineageId)
      .reduce((max, item) => Math.max(max, item.eventSequence), 0);
  }

  countDeadLetters(): number {
    return this.deadLetters.length;
  }

  insertDeadLetter(record: SrDeadLetterRecord): void {
    this.deadLetters.push(record);
  }

  findDeadLetterByOutboxId(scope: TenantScope, outboxEventId: string): SrDeadLetterRecord | undefined {
    return [...this.deadLetters].reverse().find((item) => item.outboxEventId === outboxEventId && inScope(item, scope));
  }

  listDeadLetters(scope: TenantScope): SrDeadLetterRecord[] {
    return this.deadLetters.filter((item) => inScope(item, scope));
  }

  countCorrectionLinks(): number {
    return this.correctionLinks.length;
  }

  insertCorrectionLink(link: SrCorrectionLink): void {
    this.correctionLinks.push(link);
  }

  listCorrectionLinks(scope: TenantScope): SrCorrectionLink[] {
    return this.correctionLinks.filter((item) => inScope(item, scope));
  }

  countReconciliationRuns(): number {
    return this.reconciliationRuns.length;
  }

  insertReconciliationRun(run: ReconciliationRun): void {
    this.reconciliationRuns.push(run);
  }

  updateReconciliationRun(run: ReconciliationRun): void {
    const index = this.reconciliationRuns.findIndex((item) => item.id === run.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Reconciliation run not found");
    }
    this.reconciliationRuns[index] = run;
  }

  countReconciliationFindings(): number {
    return this.reconciliationFindings.length;
  }

  insertReconciliationFinding(finding: ReconciliationFinding): void {
    this.reconciliationFindings.push(finding);
  }

  listReconciliationFindings(scope: TenantScope, runId?: string): ReconciliationFinding[] {
    return this.reconciliationFindings.filter((item) => inScope(item, scope) && (!runId || item.runId === runId));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G04 data model (docs/data-model/04-*.sql).
// Row shapes mirror migration 0005_g04_leave_sr_relay.sql. All SQL is parameterised
// ($1, $2, ...); the outbox pick + post + status transition runs in one transaction.
// ---------------------------------------------------------------------------------------

export interface LeaveEventOutboxRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  correlation_id: string;
  leave_spell_lineage_id: string;
  event_sequence: number;
  employee_id: string;
  partition_key: string;
  event_type: string;
  payload: Record<string, unknown>;
  payload_signature: string;
  status: string;
  available_at: Date;
  attempt_count: number;
}

export interface SrDeadLetterRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  outbox_id: string;
  leave_spell_lineage_id: string;
  failure_class: string;
  last_error_code: string;
  attempts_exhausted: number;
  state: string;
}

export interface SrCorrectionLinkRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  original_sr_event_id: string;
  correcting_sr_event_id: string;
  leave_spell_lineage_id: string;
  correction_type: string;
  reason_code: string;
}

export interface ReconciliationFindingRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  run_id: string;
  employee_id: string;
  leave_spell_lineage_id: string | null;
  finding_type: string;
  severity: string;
  remediation_state: string;
}

const INSERT_OUTBOX_EVENT =
  "INSERT INTO leave_event_outbox (tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key, leave_ledger_entry_id, event_type, leave_type_code, spell_start, spell_end, days_count, payload, payload_signature, dedupe_key, available_at) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) " +
  "RETURNING id, tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key, event_type, payload, payload_signature, status, available_at, attempt_count";

// Backoff-aware pick: only rows whose available_at has passed are eligible; the row is
// claimed with FOR UPDATE SKIP LOCKED so the pick + post + transition stays transactional.
const CLAIM_READY_OUTBOX =
  "SELECT id, tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key, event_type, payload, payload_signature, status, available_at, attempt_count " +
  "FROM leave_event_outbox WHERE tenant_id = $1 AND status IN ('PENDING','FAILED') AND available_at <= now() " +
  "ORDER BY partition_key, event_sequence LIMIT $2 FOR UPDATE SKIP LOCKED";

const MARK_OUTBOX_POSTED =
  "UPDATE leave_event_outbox SET status = 'POSTED', updated_at = now() WHERE id = $1 " +
  "RETURNING id, tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key, event_type, payload, payload_signature, status, available_at, attempt_count";

// Retry discipline: exponential backoff schedules the next pick via available_at.
const MARK_OUTBOX_FAILED =
  "UPDATE leave_event_outbox SET status = $2, attempt_count = attempt_count + 1, available_at = now() + ($3 * interval '1 millisecond'), updated_at = now() WHERE id = $1 " +
  "RETURNING id, tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key, event_type, payload, payload_signature, status, available_at, attempt_count";

const INSERT_DEAD_LETTER =
  "INSERT INTO sr_dead_letter (tenant_id, entity_id, outbox_id, correlation_id, leave_spell_lineage_id, failure_class, last_error_code, last_error_detail, attempts_exhausted) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
  "RETURNING id, tenant_id, entity_id, outbox_id, leave_spell_lineage_id, failure_class, last_error_code, attempts_exhausted, state";

const RESOLVE_DEAD_LETTER =
  "UPDATE sr_dead_letter SET state = $2, resolution_note = $3, updated_at = now() WHERE id = $1 " +
  "RETURNING id, tenant_id, entity_id, outbox_id, leave_spell_lineage_id, failure_class, last_error_code, attempts_exhausted, state";

const INSERT_CORRECTION_LINK =
  "INSERT INTO sr_correction_link (tenant_id, entity_id, original_sr_event_id, correcting_sr_event_id, leave_spell_lineage_id, correction_type, reason_code, correlation_id) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
  "RETURNING id, tenant_id, entity_id, original_sr_event_id, correcting_sr_event_id, leave_spell_lineage_id, correction_type, reason_code";

const INSERT_RECON_RUN =
  "INSERT INTO reconciliation_run (tenant_id, entity_id, run_type, scope, leave_records_examined, sr_entries_examined, findings_count, status, completed_at) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id";

const INSERT_RECON_FINDING =
  "INSERT INTO reconciliation_finding (tenant_id, entity_id, run_id, employee_id, leave_spell_lineage_id, finding_type, severity, leave_snapshot, sr_snapshot) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
  "RETURNING id, tenant_id, entity_id, run_id, employee_id, leave_spell_lineage_id, finding_type, severity, remediation_state";

/**
 * Postgres-backed G04 relay repository over the frozen tables leave_event_outbox,
 * sr_dead_letter, reconciliation_run, reconciliation_finding and sr_correction_link.
 */
export class PgLeaveSrRelayRepository {
  constructor(private readonly pool: Pool) {}

  async insertOutboxEvent(input: {
    tenantId: string;
    entityId: string;
    correlationId: string;
    leaveSpellLineageId: string;
    eventSequence: number;
    employeeId: string;
    leaveLedgerEntryId: string;
    eventType: string;
    leaveTypeCode: string;
    spellStart: string;
    spellEnd: string;
    daysCount: number;
    payload: Record<string, unknown>;
    payloadSignature: string;
    dedupeKey: string;
    availableAt: string;
  }): Promise<LeaveEventOutboxRow> {
    const result = await this.pool.query(INSERT_OUTBOX_EVENT, [
      input.tenantId,
      input.entityId,
      input.correlationId,
      input.leaveSpellLineageId,
      input.eventSequence,
      input.employeeId,
      input.employeeId,
      input.leaveLedgerEntryId,
      input.eventType,
      input.leaveTypeCode,
      input.spellStart,
      input.spellEnd,
      input.daysCount,
      JSON.stringify(input.payload),
      input.payloadSignature,
      input.dedupeKey,
      input.availableAt,
    ]);
    return result.rows[0] as LeaveEventOutboxRow;
  }

  /**
   * Claim backoff-ready outbox rows and settle each through `post` in ONE transaction:
   * pick (available_at <= now, SKIP LOCKED) + post + status transition commit together.
   */
  async relayReadyOutbox(
    tenantId: string,
    limit: number,
    post: (row: LeaveEventOutboxRow) => Promise<{ posted: boolean; deadLetter?: { failureClass: string; errorCode: string; errorDetail?: string }; backoffMs?: number }>
  ): Promise<LeaveEventOutboxRow[]> {
    return withTransaction(this.pool, async (client) => {
      const claimed = await client.query(CLAIM_READY_OUTBOX, [tenantId, limit]);
      const settled: LeaveEventOutboxRow[] = [];
      for (const row of claimed.rows as LeaveEventOutboxRow[]) {
        const outcome = await post(row);
        if (outcome.posted) {
          const updated = await client.query(MARK_OUTBOX_POSTED, [row.id]);
          settled.push(updated.rows[0] as LeaveEventOutboxRow);
          continue;
        }
        const nextStatus = outcome.deadLetter ? "DEAD_LETTERED" : "FAILED";
        const updated = await client.query(MARK_OUTBOX_FAILED, [row.id, nextStatus, outcome.backoffMs ?? 0]);
        const failedRow = updated.rows[0] as LeaveEventOutboxRow;
        if (outcome.deadLetter) {
          await client.query(INSERT_DEAD_LETTER, [
            failedRow.tenant_id,
            failedRow.entity_id,
            failedRow.id,
            failedRow.correlation_id,
            failedRow.leave_spell_lineage_id,
            outcome.deadLetter.failureClass,
            outcome.deadLetter.errorCode,
            outcome.deadLetter.errorDetail ?? null,
            failedRow.attempt_count,
          ]);
        }
        settled.push(failedRow);
      }
      return settled;
    });
  }

  async insertDeadLetter(input: {
    tenantId: string;
    entityId: string;
    outboxId: string;
    correlationId: string;
    leaveSpellLineageId: string;
    failureClass: string;
    lastErrorCode: string;
    lastErrorDetail?: string;
    attemptsExhausted: number;
  }): Promise<SrDeadLetterRow> {
    const result = await this.pool.query(INSERT_DEAD_LETTER, [
      input.tenantId,
      input.entityId,
      input.outboxId,
      input.correlationId,
      input.leaveSpellLineageId,
      input.failureClass,
      input.lastErrorCode,
      input.lastErrorDetail ?? null,
      input.attemptsExhausted,
    ]);
    return result.rows[0] as SrDeadLetterRow;
  }

  async resolveDeadLetter(deadLetterId: string, state: "RESOLVED_REPLAYED" | "RESOLVED_DISCARDED", note: string): Promise<SrDeadLetterRow> {
    const result = await this.pool.query(RESOLVE_DEAD_LETTER, [deadLetterId, state, note]);
    if ((result.rowCount ?? 0) === 0) {
      throw new FoundationError("NOT_FOUND", "Dead letter record not found");
    }
    return result.rows[0] as SrDeadLetterRow;
  }

  async insertCorrectionLink(input: {
    tenantId: string;
    entityId: string;
    originalSrEventId: string;
    correctingSrEventId: string;
    leaveSpellLineageId: string;
    correctionType: string;
    reasonCode: string;
    correlationId?: string;
  }): Promise<SrCorrectionLinkRow> {
    const result = await this.pool.query(INSERT_CORRECTION_LINK, [
      input.tenantId,
      input.entityId,
      input.originalSrEventId,
      input.correctingSrEventId,
      input.leaveSpellLineageId,
      input.correctionType,
      input.reasonCode,
      input.correlationId ?? null,
    ]);
    return result.rows[0] as SrCorrectionLinkRow;
  }

  /** Persist a reconciliation run header and its findings in one transaction. */
  async insertReconciliationRun(input: {
    tenantId: string;
    entityId: string;
    runType: string;
    scope: Record<string, unknown>;
    leaveRecordsExamined: number;
    srEntriesExamined: number;
    findings: Array<{
      employeeId: string;
      leaveSpellLineageId?: string;
      findingType: string;
      severity: string;
      leaveSnapshot?: Record<string, unknown>;
      srSnapshot?: Record<string, unknown>;
    }>;
  }): Promise<{ runId: string; findings: ReconciliationFindingRow[] }> {
    return withTransaction(this.pool, async (client) => {
      const run = await client.query(INSERT_RECON_RUN, [
        input.tenantId,
        input.entityId,
        input.runType,
        JSON.stringify(input.scope),
        input.leaveRecordsExamined,
        input.srEntriesExamined,
        input.findings.length,
        "COMPLETED",
        new Date().toISOString(),
      ]);
      const runId = (run.rows[0] as { id: string }).id;
      const rows: ReconciliationFindingRow[] = [];
      for (const finding of input.findings) {
        const inserted = await client.query(INSERT_RECON_FINDING, [
          input.tenantId,
          input.entityId,
          runId,
          finding.employeeId,
          finding.leaveSpellLineageId ?? null,
          finding.findingType,
          finding.severity,
          finding.leaveSnapshot ? JSON.stringify(finding.leaveSnapshot) : null,
          finding.srSnapshot ? JSON.stringify(finding.srSnapshot) : null,
        ]);
        rows.push(inserted.rows[0] as ReconciliationFindingRow);
      }
      return { runId, findings: rows };
    });
  }
}
