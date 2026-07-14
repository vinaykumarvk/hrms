import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope, inScope, nextId } from "../../platform/types";

/**
 * PH-10D G14 analytics-engine persistence (BRD G14 v3 FR-02/03/04/17/23;
 * docs/data-model/14-G14-dashboard-analytics.sql; migration 0021_g14_analytics_engine.sql):
 *   E02 source_data_contracts     — contracted read-only views the marts consume (FR-21)
 *   E09 analytics_datamarts       — read-model mart definitions/metadata (FR-03)
 *   E10 datamart_refresh_logs     — APPEND-ONLY refresh run ledger (FR-03 AC6)
 *   E03 kpi_definitions           — governed, versioned KPI registry (FR-02)
 *   E04 kpi_snapshots             — APPEND-ONLY bitemporal value series (FR-23)
 *   E17 kpi_target_history        — effective-dated targets (FR-02, VAL-EFFECTIVE)
 *   E24 suppression_policies      — k-anonymity small-cell policy (FR-17, default k=5)
 *   E11 analytics_scope_policies  — P02 scope declaration with maker-checker (FR-04 AC7)
 *   E16 analytics_access_log      — APPEND-ONLY read-access ledger (FR-04)
 * Entity state routes through this repository; the engine service owns no bare arrays.
 */

export type G14LifecycleStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type G14MartHealth = "HEALTHY" | "STALE" | "DEGRADED" | "FAILED";
export type G14RefreshRunType = "SCHEDULED" | "MANUAL" | "BACKFILL";
export type G14RefreshStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type G14ScopePolicyStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "SUPERSEDED";
export type G14TargetStatus = "ACTIVE" | "SUPERSEDED";
export type G14ContractStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "BREACHED";
export type G14ScopeType = "ENTERPRISE" | "ORG_UNIT" | "CADRE" | "MANAGER";

/** E02 source_data_contracts — the promise each mart reads through (never raw module tables). */
export interface SourceDataContractRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  sourceModule: string;
  sourceView: string;
  version: string;
  breakingChangePolicy: string;
  status: G14ContractStatus;
}

/** E09 analytics_datamarts — mart definition/metadata; refresh_job_id binds JOB-G14-MART-*. */
export interface DatamartRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  martCode: string;
  name: string;
  martType: "FACT" | "DIMENSION" | "AGGREGATE" | "MATERIALIZED_VIEW" | "SEMANTIC";
  grain: string;
  sourceModules: string[];
  sourceObjects: string[];
  contractId?: string;
  refreshStrategy: "FULL" | "INCREMENTAL" | "CDC" | "ON_DEMAND";
  refreshJobId: string;
  freshnessSlaMinutes: number;
  lastRefreshedAt?: string;
  rowCount?: number;
  healthStatus: G14MartHealth;
  containsPii: boolean;
}

/** E24 suppression_policies — min_cell_size_k with complementary suppression (FR-17). */
export interface SuppressionPolicyRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  name: string;
  appliesTo: "TILE" | "CHART" | "DRILLTHROUGH" | "EXPORT" | "ALL";
  minCellSizeK: number;
  complementary: boolean;
  bandInsteadOfHide: boolean;
  isActive: boolean;
}

/** E03 kpi_definitions — versioned; at most one ACTIVE per kpi_code; activation is explicit. */
export interface KpiDefinitionRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  kpiCode: string;
  name: string;
  description: string;
  domain: string;
  version: number;
  /** SHA-256 over the definition surface; stamped on every snapshot (FR-02 AC7). */
  definitionHash: string;
  sourceMartCode: string;
  expression: string;
  unit: string;
  grain: string;
  /** Per-KPI k override for suppression (FR-17); falls back to the tenant policy k. */
  minCellSize?: number;
  sensitivity: "PUBLIC" | "INTERNAL" | "RESTRICTED";
  status: G14LifecycleStatus;
  createdBy: string;
  approvedBy?: string;
}

/** E04 kpi_snapshots — APPEND-ONLY bitemporal rows; restatement supersedes, never mutates. */
export interface KpiSnapshotRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  kpiId: string;
  kpiCode: string;
  kpiVersion: number;
  definitionHash: string;
  scopeType: G14ScopeType;
  scopeId?: string;
  periodKey: string;
  /** Business instant the value describes (valid_time). */
  validTime: string;
  /** When the value became known (knowledge_time) — strictly monotonic per repository. */
  knowledgeTime: string;
  /** Set true by a later restatement row (is_superseded); the row itself never changes value. */
  isSuperseded: boolean;
  supersededBy?: string;
  value: number;
  /** Group size behind the value — drives FR-17 suppression at the query boundary. */
  cellSize?: number;
  dataAsOf: string;
  computedAt: string;
}

/** E17 kpi_target_history — effective-dated targets (VAL-EFFECTIVE). */
export interface KpiTargetRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  kpiId: string;
  scopeType: G14ScopeType;
  scopeId?: string;
  targetValue: number;
  effectiveFrom: string;
  effectiveTo?: string;
  setBy: string;
  status: G14TargetStatus;
}

/** E10 datamart_refresh_logs — APPEND-ONLY; one row per mart per refresh run. */
export interface DatamartRefreshLogRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  martId: string;
  martCode: string;
  runType: G14RefreshRunType;
  startedAt: string;
  finishedAt?: string;
  rowsRead?: number;
  rowsWritten?: number;
  status: G14RefreshStatus;
  errorDetail?: string;
  triggeredBy?: string;
  correlationId?: string;
}

/** E11 analytics_scope_policies — maker (created_by) != checker (approved_by) to go ACTIVE. */
export interface ScopePolicyRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  role: string;
  scopeDimensions: string[];
  martCode?: string;
  priority: number;
  version: number;
  status: G14ScopePolicyStatus;
  createdBy: string;
  approvedBy?: string;
  isActive: boolean;
}

/** E16 analytics_access_log — append-only read-access ledger row (FR-04). */
export interface AnalyticsAccessLogRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  userId: string;
  action: "VIEW_DASHBOARD" | "RUN_REPORT" | "EXPORT" | "DRILLTHROUGH" | "NL_QUERY" | "API_QUERY";
  targetType: "DASHBOARD" | "WIDGET" | "REPORT" | "KPI" | "RECORD";
  targetId?: string;
  rowCount?: number;
  suppressedCells?: number;
  correlationId: string;
  occurredAt: string;
}

export interface AnalyticsEngineRepository {
  saveSourceContract(record: Omit<SourceDataContractRecord, "id">): SourceDataContractRecord;
  listSourceContracts(scope: TenantScope): SourceDataContractRecord[];

  saveDatamart(record: Omit<DatamartRecord, "id">): DatamartRecord;
  findDatamart(scope: TenantScope, martCode: string): DatamartRecord | null;
  listDatamarts(scope: TenantScope): DatamartRecord[];
  markDatamartRefreshed(scope: TenantScope, martCode: string, update: { rowCount: number; lastRefreshedAt: string; healthStatus: G14MartHealth }): DatamartRecord;

  saveSuppressionPolicy(record: Omit<SuppressionPolicyRecord, "id">): SuppressionPolicyRecord;
  activeSuppressionPolicy(scope: TenantScope): SuppressionPolicyRecord | null;

  saveKpiDefinition(record: Omit<KpiDefinitionRecord, "id">): KpiDefinitionRecord;
  listKpiDefinitions(scope: TenantScope, kpiCode?: string): KpiDefinitionRecord[];
  findKpiDefinition(scope: TenantScope, kpiCode: string, version: number): KpiDefinitionRecord | null;
  findActiveKpiDefinition(scope: TenantScope, kpiCode: string): KpiDefinitionRecord | null;
  setKpiDefinitionStatus(id: string, status: G14LifecycleStatus, approvedBy?: string): KpiDefinitionRecord;

  /** Append one bitemporal row; knowledge_time is assigned monotonically by the repository. */
  appendKpiSnapshot(record: Omit<KpiSnapshotRecord, "id" | "knowledgeTime" | "isSuperseded" | "supersededBy">): KpiSnapshotRecord;
  /** Restatement marker: flags the prior row superseded by the new one. Values never mutate. */
  markKpiSnapshotSuperseded(id: string, supersededBy: string): void;
  listKpiSnapshots(scope: TenantScope, kpiCode: string, periodKey?: string): KpiSnapshotRecord[];

  saveKpiTarget(record: Omit<KpiTargetRecord, "id">): KpiTargetRecord;
  supersedeKpiTargets(scope: TenantScope, kpiId: string, scopeType: G14ScopeType, scopeId: string | undefined): number;
  listKpiTargets(scope: TenantScope, kpiId: string): KpiTargetRecord[];

  appendRefreshLog(record: Omit<DatamartRefreshLogRecord, "id">): DatamartRefreshLogRecord;
  listRefreshLogs(scope: TenantScope): DatamartRefreshLogRecord[];

  saveScopePolicy(record: Omit<ScopePolicyRecord, "id">): ScopePolicyRecord;
  findScopePolicy(scope: TenantScope, id: string): ScopePolicyRecord | null;
  listScopePolicies(scope: TenantScope): ScopePolicyRecord[];
  /** Activation writes approved_by and deactivates the prior ACTIVE (role, mart) binding. */
  activateScopePolicy(scope: TenantScope, id: string, approvedBy: string): ScopePolicyRecord;

  appendAccessLog(record: Omit<AnalyticsAccessLogRecord, "id" | "occurredAt">): AnalyticsAccessLogRecord;
  listAccessLog(scope: TenantScope): AnalyticsAccessLogRecord[];
}

export class InMemoryAnalyticsEngineRepository implements AnalyticsEngineRepository {
  private readonly sourceContracts: SourceDataContractRecord[] = [];
  private readonly datamarts: DatamartRecord[] = [];
  private readonly suppressionPolicies: SuppressionPolicyRecord[] = [];
  private readonly kpiDefinitions: KpiDefinitionRecord[] = [];
  private readonly kpiSnapshots: KpiSnapshotRecord[] = [];
  private readonly kpiTargets: KpiTargetRecord[] = [];
  private readonly refreshLogs: DatamartRefreshLogRecord[] = [];
  private readonly scopePolicies: ScopePolicyRecord[] = [];
  private readonly accessLog: AnalyticsAccessLogRecord[] = [];
  /** Monotonic knowledge clock so restatements always carry a strictly later knowledge_time. */
  private lastKnowledgeMs = 0;

  saveSourceContract(record: Omit<SourceDataContractRecord, "id">): SourceDataContractRecord {
    const row: SourceDataContractRecord = { ...record, id: nextId("g14-contract", this.sourceContracts.length) };
    this.sourceContracts.push(row);
    return { ...row };
  }

  listSourceContracts(scope: TenantScope): SourceDataContractRecord[] {
    return this.sourceContracts.filter((row) => inScope(row, scope)).map((row) => ({ ...row }));
  }

  saveDatamart(record: Omit<DatamartRecord, "id">): DatamartRecord {
    const row: DatamartRecord = {
      ...record,
      sourceModules: [...record.sourceModules],
      sourceObjects: [...record.sourceObjects],
      id: nextId("g14-mart", this.datamarts.length),
    };
    this.datamarts.push(row);
    return this.cloneMart(row);
  }

  findDatamart(scope: TenantScope, martCode: string): DatamartRecord | null {
    const row = this.datamarts.find((mart) => inScope(mart, scope) && mart.martCode === martCode);
    return row ? this.cloneMart(row) : null;
  }

  listDatamarts(scope: TenantScope): DatamartRecord[] {
    return this.datamarts.filter((mart) => inScope(mart, scope)).map((mart) => this.cloneMart(mart));
  }

  markDatamartRefreshed(scope: TenantScope, martCode: string, update: { rowCount: number; lastRefreshedAt: string; healthStatus: G14MartHealth }): DatamartRecord {
    const row = this.datamarts.find((mart) => inScope(mart, scope) && mart.martCode === martCode);
    if (!row) {
      throw new Error(`Datamart not found: ${martCode}`);
    }
    row.rowCount = update.rowCount;
    row.lastRefreshedAt = update.lastRefreshedAt;
    row.healthStatus = update.healthStatus;
    return this.cloneMart(row);
  }

  saveSuppressionPolicy(record: Omit<SuppressionPolicyRecord, "id">): SuppressionPolicyRecord {
    const row: SuppressionPolicyRecord = { ...record, id: nextId("g14-suppress", this.suppressionPolicies.length) };
    this.suppressionPolicies.push(row);
    return { ...row };
  }

  activeSuppressionPolicy(scope: TenantScope): SuppressionPolicyRecord | null {
    const row = this.suppressionPolicies.find((policy) => inScope(policy, scope) && policy.isActive);
    return row ? { ...row } : null;
  }

  saveKpiDefinition(record: Omit<KpiDefinitionRecord, "id">): KpiDefinitionRecord {
    const row: KpiDefinitionRecord = { ...record, id: nextId("g14-kpi", this.kpiDefinitions.length) };
    this.kpiDefinitions.push(row);
    return { ...row };
  }

  listKpiDefinitions(scope: TenantScope, kpiCode?: string): KpiDefinitionRecord[] {
    return this.kpiDefinitions
      .filter((def) => inScope(def, scope) && (!kpiCode || def.kpiCode === kpiCode))
      .map((def) => ({ ...def }));
  }

  findKpiDefinition(scope: TenantScope, kpiCode: string, version: number): KpiDefinitionRecord | null {
    const row = this.kpiDefinitions.find((def) => inScope(def, scope) && def.kpiCode === kpiCode && def.version === version);
    return row ? { ...row } : null;
  }

  findActiveKpiDefinition(scope: TenantScope, kpiCode: string): KpiDefinitionRecord | null {
    const row = this.kpiDefinitions.find((def) => inScope(def, scope) && def.kpiCode === kpiCode && def.status === "ACTIVE");
    return row ? { ...row } : null;
  }

  setKpiDefinitionStatus(id: string, status: G14LifecycleStatus, approvedBy?: string): KpiDefinitionRecord {
    const row = this.kpiDefinitions.find((def) => def.id === id);
    if (!row) {
      throw new Error(`KPI definition not found: ${id}`);
    }
    row.status = status;
    if (approvedBy !== undefined) {
      row.approvedBy = approvedBy;
    }
    return { ...row };
  }

  appendKpiSnapshot(record: Omit<KpiSnapshotRecord, "id" | "knowledgeTime" | "isSuperseded" | "supersededBy">): KpiSnapshotRecord {
    const knowledgeMs = Math.max(Date.now(), this.lastKnowledgeMs + 1);
    this.lastKnowledgeMs = knowledgeMs;
    const row: KpiSnapshotRecord = {
      ...record,
      id: nextId("g14-snap", this.kpiSnapshots.length),
      knowledgeTime: new Date(knowledgeMs).toISOString(),
      isSuperseded: false,
    };
    this.kpiSnapshots.push(row);
    return { ...row };
  }

  markKpiSnapshotSuperseded(id: string, supersededBy: string): void {
    const row = this.kpiSnapshots.find((snapshot) => snapshot.id === id);
    if (!row) {
      throw new Error(`KPI snapshot not found: ${id}`);
    }
    // Only the supersession flags change — value/valid_time/knowledge_time are immutable.
    row.isSuperseded = true;
    row.supersededBy = supersededBy;
  }

  listKpiSnapshots(scope: TenantScope, kpiCode: string, periodKey?: string): KpiSnapshotRecord[] {
    return this.kpiSnapshots
      .filter((snapshot) => inScope(snapshot, scope) && snapshot.kpiCode === kpiCode && (!periodKey || snapshot.periodKey === periodKey))
      .map((snapshot) => ({ ...snapshot }));
  }

  saveKpiTarget(record: Omit<KpiTargetRecord, "id">): KpiTargetRecord {
    const row: KpiTargetRecord = { ...record, id: nextId("g14-target", this.kpiTargets.length) };
    this.kpiTargets.push(row);
    return { ...row };
  }

  supersedeKpiTargets(scope: TenantScope, kpiId: string, scopeType: G14ScopeType, scopeId: string | undefined): number {
    let superseded = 0;
    for (const target of this.kpiTargets) {
      if (inScope(target, scope) && target.kpiId === kpiId && target.scopeType === scopeType && target.scopeId === scopeId && target.status === "ACTIVE") {
        target.status = "SUPERSEDED";
        superseded += 1;
      }
    }
    return superseded;
  }

  listKpiTargets(scope: TenantScope, kpiId: string): KpiTargetRecord[] {
    return this.kpiTargets.filter((target) => inScope(target, scope) && target.kpiId === kpiId).map((target) => ({ ...target }));
  }

  appendRefreshLog(record: Omit<DatamartRefreshLogRecord, "id">): DatamartRefreshLogRecord {
    const row: DatamartRefreshLogRecord = Object.freeze({ ...record, id: nextId("g14-refresh", this.refreshLogs.length) });
    this.refreshLogs.push(row);
    return { ...row };
  }

  listRefreshLogs(scope: TenantScope): DatamartRefreshLogRecord[] {
    return this.refreshLogs.filter((log) => inScope(log, scope)).map((log) => ({ ...log }));
  }

  saveScopePolicy(record: Omit<ScopePolicyRecord, "id">): ScopePolicyRecord {
    const row: ScopePolicyRecord = { ...record, scopeDimensions: [...record.scopeDimensions], id: nextId("g14-scopepol", this.scopePolicies.length) };
    this.scopePolicies.push(row);
    return { ...row, scopeDimensions: [...row.scopeDimensions] };
  }

  findScopePolicy(scope: TenantScope, id: string): ScopePolicyRecord | null {
    const row = this.scopePolicies.find((policy) => inScope(policy, scope) && policy.id === id);
    return row ? { ...row, scopeDimensions: [...row.scopeDimensions] } : null;
  }

  listScopePolicies(scope: TenantScope): ScopePolicyRecord[] {
    return this.scopePolicies.filter((policy) => inScope(policy, scope)).map((policy) => ({ ...policy, scopeDimensions: [...policy.scopeDimensions] }));
  }

  activateScopePolicy(scope: TenantScope, id: string, approvedBy: string): ScopePolicyRecord {
    const row = this.scopePolicies.find((policy) => inScope(policy, scope) && policy.id === id);
    if (!row) {
      throw new Error(`Scope policy not found: ${id}`);
    }
    for (const other of this.scopePolicies) {
      if (other.id !== row.id && inScope(other, scope) && other.role === row.role && other.martCode === row.martCode && other.isActive) {
        other.isActive = false;
        other.status = "SUPERSEDED";
      }
    }
    row.status = "ACTIVE";
    row.isActive = true;
    row.approvedBy = approvedBy;
    return { ...row, scopeDimensions: [...row.scopeDimensions] };
  }

  appendAccessLog(record: Omit<AnalyticsAccessLogRecord, "id" | "occurredAt">): AnalyticsAccessLogRecord {
    const row: AnalyticsAccessLogRecord = Object.freeze({
      ...record,
      id: nextId("g14-access", this.accessLog.length),
      occurredAt: new Date().toISOString(),
    });
    this.accessLog.push(row);
    return { ...row };
  }

  listAccessLog(scope: TenantScope): AnalyticsAccessLogRecord[] {
    return this.accessLog.filter((entry) => inScope(entry, scope)).map((entry) => ({ ...entry }));
  }

  private cloneMart(row: DatamartRecord): DatamartRecord {
    return { ...row, sourceModules: [...row.sourceModules], sourceObjects: [...row.sourceObjects] };
  }
}

// --- Postgres statements (parameterised only; table/column names from
// --- docs/data-model/14-G14-dashboard-analytics.sql / migration 0021) -------------------

const INSERT_SOURCE_CONTRACT = `
  INSERT INTO source_data_contracts (tenant_id, entity_id, source_module, source_view, version, schema_json, breaking_change_policy, status)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
  RETURNING id`;

const INSERT_DATAMART = `
  INSERT INTO analytics_datamarts
    (tenant_id, entity_id, mart_code, name, mart_type, grain, source_modules, source_objects, contract_id, refresh_strategy, refresh_job_id, freshness_sla_minutes, health_status, contains_pii)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  ON CONFLICT (tenant_id, mart_code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id`;

const UPDATE_DATAMART_REFRESHED = `
  UPDATE analytics_datamarts
  SET row_count = $3, last_refreshed_at = $4, health_status = $5, updated_at = now()
  WHERE tenant_id = $1 AND mart_code = $2`;

const SELECT_ACTIVE_SUPPRESSION_POLICY = `
  SELECT id, name, applies_to, min_cell_size_k, complementary, band_instead_of_hide, is_active
  FROM suppression_policies
  WHERE tenant_id = $1 AND is_active = true AND is_deleted = false
  ORDER BY created_at DESC LIMIT 1`;

const INSERT_SUPPRESSION_POLICY = `
  INSERT INTO suppression_policies (tenant_id, entity_id, name, applies_to, min_cell_size_k, complementary, band_instead_of_hide, is_active)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id`;

const INSERT_KPI_DEFINITION = `
  INSERT INTO kpi_definitions
    (tenant_id, entity_id, kpi_code, name, description, domain, version, definition_hash, source_mart_id, expression, unit, grain, min_cell_size, sensitivity, status, created_by)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
          (SELECT id FROM analytics_datamarts WHERE tenant_id = $1 AND mart_code = $9),
          $10, $11, $12, $13, $14, $15, $16)
  RETURNING id`;

const RETIRE_PRIOR_ACTIVE_KPI = `
  UPDATE kpi_definitions SET status = 'RETIRED', updated_at = now()
  WHERE tenant_id = $1 AND kpi_code = $2 AND status = 'ACTIVE' AND is_deleted = false`;

const ACTIVATE_KPI_DEFINITION = `
  UPDATE kpi_definitions SET status = 'ACTIVE', approved_by = $4, updated_at = now()
  WHERE tenant_id = $1 AND kpi_code = $2 AND version = $3 AND is_deleted = false`;

const INSERT_KPI_SNAPSHOT = `
  INSERT INTO kpi_snapshots
    (tenant_id, entity_id, kpi_id, kpi_version, definition_hash, scope_type, scope_id, period_key, valid_time, knowledge_time, value, cell_size, data_as_of)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  RETURNING id`;

const SUPERSEDE_KPI_SNAPSHOT = `
  UPDATE kpi_snapshots SET is_superseded = true, superseded_by = $2
  WHERE id = $1`;

const SELECT_KPI_AS_OF_KNOWLEDGE = `
  SELECT id, kpi_version, definition_hash, period_key, valid_time, knowledge_time, is_superseded, value, cell_size
  FROM kpi_snapshots
  WHERE tenant_id = $1 AND kpi_id = $2 AND period_key = $3 AND knowledge_time <= $4
  ORDER BY knowledge_time DESC LIMIT 1`;

const SUPERSEDE_KPI_TARGETS = `
  UPDATE kpi_target_history SET status = 'SUPERSEDED', updated_at = now()
  WHERE tenant_id = $1 AND kpi_id = $2 AND scope_type = $3 AND scope_id IS NOT DISTINCT FROM $4 AND status = 'ACTIVE'`;

const INSERT_KPI_TARGET = `
  INSERT INTO kpi_target_history (tenant_id, entity_id, kpi_id, scope_type, scope_id, target_value, effective_from, effective_to, set_by, status)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING id`;

const INSERT_REFRESH_LOG = `
  INSERT INTO datamart_refresh_logs
    (tenant_id, entity_id, mart_id, run_type, started_at, finished_at, rows_read, rows_written, status, error_detail, triggered_by, correlation_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING id`;

const INSERT_SCOPE_POLICY = `
  INSERT INTO analytics_scope_policies
    (tenant_id, entity_id, role, scope_dimensions, mart_id, priority, version, status, created_by, is_active)
  VALUES ($1, $2, $3, $4,
          (SELECT id FROM analytics_datamarts WHERE tenant_id = $1 AND mart_code = $5),
          $6, $7, $8, $9, false)
  RETURNING id`;

const DEACTIVATE_PRIOR_SCOPE_POLICY = `
  UPDATE analytics_scope_policies SET is_active = false, status = 'SUPERSEDED', updated_at = now()
  WHERE tenant_id = $1 AND role = $2 AND mart_id IS NOT DISTINCT FROM $3 AND is_active = true AND id <> $4`;

const ACTIVATE_SCOPE_POLICY = `
  UPDATE analytics_scope_policies SET status = 'ACTIVE', is_active = true, approved_by = $2, updated_at = now()
  WHERE id = $1
  RETURNING role, mart_id`;

const INSERT_ACCESS_LOG = `
  INSERT INTO analytics_access_log (tenant_id, entity_id, user_id, action, target_type, target_id, scope_snapshot_json, row_count, correlation_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`;

/**
 * Postgres-backed persistence for the analytics engine (parameterised statements only).
 * The activation, restatement, and refresh-log writes are transactional so a governed step
 * either fully lands (retire prior + activate; append + supersede) or not at all. Async by
 * nature, so it stands beside the sync in-memory contract like PgDocumentSecurityRepository.
 */
export class PgAnalyticsEngineRepository {
  constructor(private readonly pool: Pool) {}

  async saveSourceContract(record: Omit<SourceDataContractRecord, "id"> & { schemaJson: Record<string, unknown> }): Promise<string> {
    const result = await this.pool.query(INSERT_SOURCE_CONTRACT, [
      record.tenantId,
      record.entityId ?? null,
      record.sourceModule,
      record.sourceView,
      record.version,
      JSON.stringify(record.schemaJson),
      record.breakingChangePolicy,
      record.status,
    ]);
    return result.rows[0].id as string;
  }

  async saveDatamart(record: Omit<DatamartRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_DATAMART, [
      record.tenantId,
      record.entityId ?? null,
      record.martCode,
      record.name,
      record.martType,
      record.grain,
      record.sourceModules,
      record.sourceObjects,
      record.contractId ?? null,
      record.refreshStrategy,
      record.refreshJobId,
      record.freshnessSlaMinutes,
      record.healthStatus,
      record.containsPii,
    ]);
    return result.rows[0].id as string;
  }

  async saveSuppressionPolicy(record: Omit<SuppressionPolicyRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_SUPPRESSION_POLICY, [
      record.tenantId,
      record.entityId ?? null,
      record.name,
      record.appliesTo,
      record.minCellSizeK,
      record.complementary,
      record.bandInsteadOfHide,
      record.isActive,
    ]);
    return result.rows[0].id as string;
  }

  async activeSuppressionPolicy(tenantId: string): Promise<{ minCellSizeK: number; complementary: boolean } | null> {
    const result = await this.pool.query(SELECT_ACTIVE_SUPPRESSION_POLICY, [tenantId]);
    const row = result.rows[0];
    return row ? { minCellSizeK: row.min_cell_size_k as number, complementary: row.complementary as boolean } : null;
  }

  async saveKpiDefinition(record: Omit<KpiDefinitionRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_KPI_DEFINITION, [
      record.tenantId,
      record.entityId ?? null,
      record.kpiCode,
      record.name,
      record.description,
      record.domain,
      record.version,
      record.definitionHash,
      record.sourceMartCode,
      record.expression,
      record.unit,
      record.grain,
      record.minCellSize ?? null,
      record.sensitivity,
      record.status,
      record.createdBy,
    ]);
    return result.rows[0].id as string;
  }

  /** FR-02: activation retires the prior ACTIVE version and promotes the target atomically. */
  async activateKpiDefinition(tenantId: string, kpiCode: string, version: number, approvedBy: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(RETIRE_PRIOR_ACTIVE_KPI, [tenantId, kpiCode]);
      await client.query(ACTIVATE_KPI_DEFINITION, [tenantId, kpiCode, version, approvedBy]);
    });
  }

  /** FR-23: restatement appends the new knowledge-version and flags the prior atomically. */
  async appendKpiSnapshot(
    record: Omit<KpiSnapshotRecord, "id" | "isSuperseded" | "supersededBy">,
    supersedes?: string
  ): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(INSERT_KPI_SNAPSHOT, [
        record.tenantId,
        record.entityId ?? null,
        record.kpiId,
        record.kpiVersion,
        record.definitionHash,
        record.scopeType,
        record.scopeId ?? null,
        record.periodKey,
        record.validTime,
        record.knowledgeTime,
        record.value,
        record.cellSize ?? null,
        record.dataAsOf,
      ]);
      const id = inserted.rows[0].id as string;
      if (supersedes) {
        await client.query(SUPERSEDE_KPI_SNAPSHOT, [supersedes, id]);
      }
      return id;
    });
  }

  /** FR-23 as-of-knowledge read: latest knowledge_time <= T reproduces what was known at T. */
  async kpiValueAsOfKnowledge(tenantId: string, kpiId: string, periodKey: string, asOfKnowledgeTime: string): Promise<{ value: number; knowledgeTime: string; kpiVersion: number } | null> {
    const result = await this.pool.query(SELECT_KPI_AS_OF_KNOWLEDGE, [tenantId, kpiId, periodKey, asOfKnowledgeTime]);
    const row = result.rows[0];
    return row ? { value: Number(row.value), knowledgeTime: row.knowledge_time as string, kpiVersion: row.kpi_version as number } : null;
  }

  /** VAL-EFFECTIVE: supersede the open target row and insert the new one atomically. */
  async saveKpiTarget(record: Omit<KpiTargetRecord, "id">): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      await client.query(SUPERSEDE_KPI_TARGETS, [record.tenantId, record.kpiId, record.scopeType, record.scopeId ?? null]);
      const inserted = await client.query(INSERT_KPI_TARGET, [
        record.tenantId,
        record.entityId ?? null,
        record.kpiId,
        record.scopeType,
        record.scopeId ?? null,
        record.targetValue,
        record.effectiveFrom,
        record.effectiveTo ?? null,
        record.setBy,
        record.status,
      ]);
      return inserted.rows[0].id as string;
    });
  }

  /** FR-03 AC6: refresh log append + mart watermark update commit atomically per mart. */
  async recordRefresh(record: Omit<DatamartRefreshLogRecord, "id">, martUpdate: { rowCount: number; lastRefreshedAt: string; healthStatus: G14MartHealth }): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(INSERT_REFRESH_LOG, [
        record.tenantId,
        record.entityId ?? null,
        record.martId,
        record.runType,
        record.startedAt,
        record.finishedAt ?? null,
        record.rowsRead ?? null,
        record.rowsWritten ?? null,
        record.status,
        record.errorDetail ?? null,
        record.triggeredBy ?? null,
        record.correlationId ?? null,
      ]);
      await client.query(UPDATE_DATAMART_REFRESHED, [record.tenantId, record.martCode, martUpdate.rowCount, martUpdate.lastRefreshedAt, martUpdate.healthStatus]);
      return inserted.rows[0].id as string;
    });
  }

  async saveScopePolicy(record: Omit<ScopePolicyRecord, "id">): Promise<string> {
    const result = await this.pool.query(INSERT_SCOPE_POLICY, [
      record.tenantId,
      record.entityId ?? null,
      record.role,
      record.scopeDimensions,
      record.martCode ?? null,
      record.priority,
      record.version,
      record.status,
      record.createdBy,
    ]);
    return result.rows[0].id as string;
  }

  /** FR-04 AC7: activation + prior-binding supersession commit atomically (checker recorded). */
  async activateScopePolicy(tenantId: string, id: string, approvedBy: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const activated = await client.query(ACTIVATE_SCOPE_POLICY, [id, approvedBy]);
      const row = activated.rows[0];
      if (row) {
        await client.query(DEACTIVATE_PRIOR_SCOPE_POLICY, [tenantId, row.role, row.mart_id, id]);
      }
    });
  }

  async appendAccessLog(record: Omit<AnalyticsAccessLogRecord, "id" | "occurredAt"> & { scopeSnapshot: Record<string, unknown> }): Promise<void> {
    await this.pool.query(INSERT_ACCESS_LOG, [
      record.tenantId,
      record.entityId ?? null,
      record.userId,
      record.action,
      record.targetType,
      record.targetId ?? null,
      JSON.stringify(record.scopeSnapshot),
      record.rowCount ?? null,
      record.correlationId,
    ]);
  }
}
