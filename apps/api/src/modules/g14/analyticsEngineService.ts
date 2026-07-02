import { JobService } from "../../jobs/jobService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, requireTenantScope, sha256Hex, stableStringify } from "../../platform/types";
import { EstablishmentQslRepository } from "../g06/establishmentQslRepository";
import { LeaveService } from "../g03/leaveService";
import { AparService } from "../g08/aparService";
import {
  AnalyticsEngineRepository,
  DatamartRecord,
  DatamartRefreshLogRecord,
  G14RefreshRunType,
  G14ScopeType,
  KpiDefinitionRecord,
  KpiSnapshotRecord,
  KpiTargetRecord,
  ScopePolicyRecord,
  SuppressionPolicyRecord,
} from "./analyticsEngineRepository";

/**
 * PH-10D G14 analytics engine (BRD G14 v3):
 *   FR-02 governed kpi_definitions — versioned, DRAFT -> ACTIVE via an explicit governed
 *         activation step; snapshots stamped with kpi_version + definition_hash; aggregating
 *         across versions raises ERR-G14-XVER-AGG unless acknowledged.
 *   FR-03 mart refresh — the seeded analytics_datamarts (MART_LEAVE, MART_ATTENDANCE,
 *         MART_APPRAISAL, MART_ESTABLISHMENT) are populated from module sources under the
 *         registered JOB-G14-MART-* jobs, and every run appends to datamart_refresh_logs.
 *   FR-17 k-anonymity — suppression_policies (default min_cell_size_k = 5) applied fail-closed
 *         at the query boundary: small cells return a suppressed shape (ERR-G14-SMALL-CELL),
 *         and complementary suppression prevents recovery by subtraction from totals
 *         (ERR-G14-COMP-SUPPRESS).
 *   FR-04 analytics_scope_policies — DECLARES P02 scope dimensions; a policy cannot become
 *         ACTIVE without a checker distinct from the maker (ERR-G14-SCOPE-CHECKER).
 *   FR-23 bitemporal kpi_snapshots — valid_time + knowledge_time, append-only; restatement
 *         appends a superseding row (is_superseded on the prior) and the as-of-knowledge read
 *         reproduces what was known at a past knowledge_time (ERR-G14-ASOF-NA when none).
 */

/** Whitelisted aggregation DSL (BRD FR-02 "safe whitelisted aggregation DSL" — count grammar). */
const KPI_EXPRESSION_PATTERN = /^COUNT\(\*\)$/;

const SEEDED_MARTS: ReadonlyArray<{
  martCode: string;
  name: string;
  sourceModule: string;
  sourceView: string;
  refreshJobId: string;
  containsPii: boolean;
}> = [
  { martCode: "MART_LEAVE", name: "Leave read model", sourceModule: "G03", sourceView: "g03.v_leave_applications_v3", refreshJobId: "JOB-G14-MART-LEAVE", containsPii: false },
  { martCode: "MART_ATTENDANCE", name: "Attendance read model", sourceModule: "G03", sourceView: "g03.v_attendance_days_v3", refreshJobId: "JOB-G14-MART-ATTENDANCE", containsPii: false },
  { martCode: "MART_APPRAISAL", name: "Appraisal read model", sourceModule: "G08", sourceView: "g08.v_apar_forms_v3", refreshJobId: "JOB-G14-MART-APPRAISAL", containsPii: true },
  { martCode: "MART_ESTABLISHMENT", name: "Establishment read model", sourceModule: "G06", sourceView: "g06.v_sanctioned_posts_v3", refreshJobId: "JOB-G14-MART-ESTABLISHMENT", containsPii: false },
];

export interface AggregateCell {
  key: string;
  /** null when suppressed — the raw count is never emitted for a small cell (fail-closed). */
  value: number | null;
  suppressed: boolean;
  /** ERR-G14-SMALL-CELL (primary) or ERR-G14-COMP-SUPPRESS (complementary). */
  suppressionReason?: "ERR-G14-SMALL-CELL" | "ERR-G14-COMP-SUPPRESS";
}

export interface AggregateResult {
  martCode: string;
  dimension: string;
  minCellSizeK: number;
  cells: AggregateCell[];
  /** Withheld whenever any cell is suppressed so subtraction cannot recover it. */
  total: number | null;
  suppressedCells: number;
}

export interface KpiSeriesResult {
  kpiCode: string;
  kpiVersions: number[];
  crossVersion: boolean;
  points: Array<{ periodKey: string; value: number; kpiVersion: number; definitionHash: string }>;
}

export interface AsOfKnowledgeResult {
  kpiCode: string;
  periodKey: string;
  asOfKnowledgeTime: string;
  value: number;
  knowledgeTime: string;
  kpiVersion: number;
  isSuperseded: boolean;
}

export interface MartRefreshResult {
  runType: G14RefreshRunType;
  marts: DatamartRecord[];
  logs: DatamartRefreshLogRecord[];
}

export class AnalyticsEngineService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    private readonly leave: LeaveService,
    private readonly apar: AparService,
    private readonly establishment: EstablishmentQslRepository,
    private readonly repository: AnalyticsEngineRepository
  ) {}

  /**
   * Seed the governed substrate for a tenant: the E02 source contracts, the four read-model
   * marts bound to their JOB-G14-MART-* refresh jobs, and the default k=5 suppression policy
   * (BRD FR-17 — no per-domain overrides are invented; the BRD default is the seed).
   */
  seedTenantDefaults(scope: TenantScope): void {
    requireTenantScope(scope);
    if (this.repository.listDatamarts(scope).length > 0) {
      return;
    }
    for (const mart of SEEDED_MARTS) {
      const contract = this.repository.saveSourceContract({
        tenantId: scope.tenantId,
        entityId: scope.entityId,
        sourceModule: mart.sourceModule,
        sourceView: mart.sourceView,
        version: "3.0.0",
        breakingChangePolicy: "30-day notice; alert ANALYTICS_ADMIN via X.2",
        status: "ACTIVE",
      });
      this.repository.saveDatamart({
        tenantId: scope.tenantId,
        entityId: scope.entityId,
        martCode: mart.martCode,
        name: mart.name,
        martType: "AGGREGATE",
        grain: "ORG_UNIT",
        sourceModules: [mart.sourceModule],
        sourceObjects: [mart.sourceView],
        contractId: contract.id,
        refreshStrategy: "FULL",
        refreshJobId: mart.refreshJobId,
        freshnessSlaMinutes: 60,
        healthStatus: "HEALTHY",
        containsPii: mart.containsPii,
      });
    }
    this.repository.saveSuppressionPolicy({
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      name: "default-k-anonymity",
      appliesTo: "ALL",
      minCellSizeK: 5,
      complementary: true,
      bandInsteadOfHide: false,
      isActive: true,
    });
  }

  // ---- FR-02: governed KPI definitions (versioning + explicit activation) ---------------

  defineKpi(
    actor: ActorContext,
    input: {
      kpiCode: string;
      name: string;
      description: string;
      domain: string;
      sourceMartCode: string;
      expression: string;
      unit: string;
      grain: string;
      minCellSize?: number;
      sensitivity?: "PUBLIC" | "INTERNAL" | "RESTRICTED";
    }
  ): KpiDefinitionRecord {
    this.authorization.check(actor, "g14.kpi.manage", actor);
    if (!KPI_EXPRESSION_PATTERN.test(input.expression)) {
      throw new FoundationError("VALIDATION_FAILED", "KPI expression is not in the whitelisted aggregation DSL", {
        field: "expression",
        details: { messageId: "ERR-G14-KPI-EXPR" },
      });
    }
    if (!this.repository.findDatamart(actor, input.sourceMartCode)) {
      throw new FoundationError("NOT_FOUND", "Source datamart is not registered", { field: "sourceMartCode" });
    }
    const versions = this.repository.listKpiDefinitions(actor, input.kpiCode);
    const version = versions.reduce((max, def) => Math.max(max, def.version), 0) + 1;
    const definitionHash = sha256Hex(
      stableStringify({
        kpiCode: input.kpiCode,
        expression: input.expression,
        grain: input.grain,
        unit: input.unit,
        sourceMartCode: input.sourceMartCode,
        version,
      })
    );
    const definition = this.repository.saveKpiDefinition({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      kpiCode: input.kpiCode,
      name: input.name,
      description: input.description,
      domain: input.domain,
      version,
      definitionHash,
      sourceMartCode: input.sourceMartCode,
      expression: input.expression,
      unit: input.unit,
      grain: input.grain,
      minCellSize: input.minCellSize,
      sensitivity: input.sensitivity ?? "INTERNAL",
      status: "DRAFT",
      createdBy: actor.userId,
    });
    this.audit.recordMutation(actor, {
      action: "G14_KPI_DEFINED",
      subjectRef: `kpi_definitions:${definition.id}`,
      metadata: { kpiCode: definition.kpiCode, kpiVersion: definition.version, definitionHash: definition.definitionHash, status: "DRAFT" },
    });
    return definition;
  }

  /**
   * Explicit governed activation (FR-02): DRAFT -> ACTIVE. The activating checker must differ
   * from the defining maker (P01 maker-checker publication); the prior ACTIVE version of the
   * same kpi_code is retired so at most one version computes.
   */
  activateKpi(actor: ActorContext, input: { kpiCode: string; version: number }): KpiDefinitionRecord {
    this.authorization.check(actor, "g14.kpi.activate", actor);
    const definition = this.repository.findKpiDefinition(actor, input.kpiCode, input.version);
    if (!definition) {
      throw new FoundationError("NOT_FOUND", "KPI definition version not found");
    }
    if (definition.status !== "DRAFT") {
      throw new FoundationError("CONFLICT", "Only a DRAFT KPI definition version can be activated", {
        details: { messageId: "ERR-G14-KPI-VER-OVERLAP", status: definition.status },
      });
    }
    if (definition.createdBy === actor.userId) {
      // BRD FR-02: publication is a P01 maker-checker flow — the maker cannot self-activate.
      throw new FoundationError("FORBIDDEN", "KPI activation requires a checker distinct from the maker", {
        details: { messageId: "ERR-G14-PUBLISH-CHECKER" },
      });
    }
    const prior = this.repository.findActiveKpiDefinition(actor, input.kpiCode);
    if (prior) {
      this.repository.setKpiDefinitionStatus(prior.id, "RETIRED");
    }
    const activated = this.repository.setKpiDefinitionStatus(definition.id, "ACTIVE", actor.userId);
    this.audit.recordMutation(actor, {
      action: "G14_KPI_ACTIVATED",
      subjectRef: `kpi_definitions:${activated.id}`,
      metadata: { kpiCode: activated.kpiCode, kpiVersion: activated.version, retiredVersion: prior?.version ?? null },
    });
    return activated;
  }

  listKpis(scope: TenantScope, kpiCode?: string): KpiDefinitionRecord[] {
    requireTenantScope(scope);
    return this.repository.listKpiDefinitions(scope, kpiCode);
  }

  /** E17 effective-dated target (VAL-EFFECTIVE): the open ACTIVE row is superseded, never edited. */
  setKpiTarget(actor: ActorContext, input: { kpiCode: string; scopeType?: G14ScopeType; scopeId?: string; targetValue: number; effectiveFrom: string; effectiveTo?: string }): KpiTargetRecord {
    this.authorization.check(actor, "g14.kpi.manage", actor);
    const definition = this.requireActiveKpi(actor, input.kpiCode);
    const scopeType = input.scopeType ?? "ENTERPRISE";
    this.repository.supersedeKpiTargets(actor, definition.id, scopeType, input.scopeId);
    const target = this.repository.saveKpiTarget({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      kpiId: definition.id,
      scopeType,
      scopeId: input.scopeId,
      targetValue: input.targetValue,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      setBy: actor.userId,
      status: "ACTIVE",
    });
    this.audit.recordMutation(actor, {
      action: "G14_KPI_TARGET_SET",
      subjectRef: `kpi_target_history:${target.id}`,
      metadata: { kpiCode: definition.kpiCode, effectiveFrom: target.effectiveFrom },
    });
    return target;
  }

  // ---- FR-23: bitemporal snapshots (append-only; restatement supersedes) ----------------

  /**
   * Materialise one bitemporal snapshot from the KPI's source mart. Computing is only allowed
   * against the ACTIVE definition version; every row is stamped kpi_version + definition_hash.
   */
  computeKpiSnapshot(
    actor: ActorContext,
    input: { kpiCode: string; periodKey: string; validTime: string; scopeType?: G14ScopeType; scopeId?: string; version?: number }
  ): KpiSnapshotRecord {
    this.authorization.check(actor, "g14.kpi.compute", actor);
    const definition = this.requireActiveKpi(actor, input.kpiCode);
    if (input.version !== undefined && input.version !== definition.version) {
      // Computing against a non-ACTIVE version fails: only one version computes at a time.
      throw new FoundationError("PRECONDITION_FAILED", "Requested KPI version is not the ACTIVE version", {
        details: { messageId: "ERR-G14-KPI-INACTIVE", requestedVersion: input.version, activeVersion: definition.version },
      });
    }
    const source = this.readMartSource(actor, definition.sourceMartCode);
    const snapshot = this.repository.appendKpiSnapshot({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      kpiId: definition.id,
      kpiCode: definition.kpiCode,
      kpiVersion: definition.version,
      definitionHash: definition.definitionHash,
      scopeType: input.scopeType ?? "ENTERPRISE",
      scopeId: input.scopeId,
      periodKey: input.periodKey,
      validTime: input.validTime,
      value: source.rowCount,
      cellSize: source.rowCount,
      dataAsOf: source.dataAsOf,
      computedAt: new Date().toISOString(),
    });
    this.audit.recordMutation(actor, {
      action: "G14_KPI_SNAPSHOT_COMPUTED",
      subjectRef: `kpi_snapshots:${snapshot.id}`,
      metadata: { kpiCode: snapshot.kpiCode, kpiVersion: snapshot.kpiVersion, periodKey: snapshot.periodKey, knowledgeTime: snapshot.knowledgeTime },
    });
    return snapshot;
  }

  /**
   * Restatement (FR-23): recompute the period from the current mart state, APPEND a new
   * knowledge-version row, and mark the prior current row is_superseded. Never mutates values.
   */
  restateKpiSnapshot(actor: ActorContext, input: { kpiCode: string; periodKey: string; reason: string }): KpiSnapshotRecord {
    this.authorization.check(actor, "g14.kpi.compute", actor);
    const definition = this.requireActiveKpi(actor, input.kpiCode);
    const prior = this.currentSnapshot(actor, input.kpiCode, input.periodKey);
    if (!prior) {
      throw new FoundationError("NOT_FOUND", "No snapshot exists for this period to restate");
    }
    const source = this.readMartSource(actor, definition.sourceMartCode);
    const restated = this.repository.appendKpiSnapshot({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      kpiId: definition.id,
      kpiCode: definition.kpiCode,
      kpiVersion: definition.version,
      definitionHash: definition.definitionHash,
      scopeType: prior.scopeType,
      scopeId: prior.scopeId,
      periodKey: prior.periodKey,
      validTime: prior.validTime,
      value: source.rowCount,
      cellSize: source.rowCount,
      dataAsOf: source.dataAsOf,
      computedAt: new Date().toISOString(),
    });
    this.repository.markKpiSnapshotSuperseded(prior.id, restated.id);
    this.audit.recordMutation(actor, {
      action: "G14_KPI_SNAPSHOT_RESTATED",
      subjectRef: `kpi_snapshots:${restated.id}`,
      metadata: { kpiCode: restated.kpiCode, periodKey: restated.periodKey, supersedes: prior.id, reason: input.reason, knowledgeTime: restated.knowledgeTime },
    });
    return restated;
  }

  /**
   * As-of-knowledge read (FR-23): returns the snapshot with the latest knowledge_time <= T —
   * reproducing exactly what was known at T, including values later superseded by restatement.
   */
  kpiValueAsOfKnowledge(scope: TenantScope, input: { kpiCode: string; periodKey: string; asOfKnowledgeTime: string }): AsOfKnowledgeResult {
    requireTenantScope(scope);
    const rows = this.repository
      .listKpiSnapshots(scope, input.kpiCode, input.periodKey)
      .filter((snapshot) => snapshot.knowledgeTime <= input.asOfKnowledgeTime)
      .sort((left, right) => right.knowledgeTime.localeCompare(left.knowledgeTime));
    const match = rows[0];
    if (!match) {
      throw new FoundationError("ERR-G14-ASOF-NA", "No snapshot was known at the requested knowledge time", {
        details: { kpiCode: input.kpiCode, periodKey: input.periodKey, asOfKnowledgeTime: input.asOfKnowledgeTime },
      });
    }
    return {
      kpiCode: input.kpiCode,
      periodKey: input.periodKey,
      asOfKnowledgeTime: input.asOfKnowledgeTime,
      value: match.value,
      knowledgeTime: match.knowledgeTime,
      kpiVersion: match.kpiVersion,
      isSuperseded: match.isSuperseded,
    };
  }

  /**
   * Trend/series read (FR-02 AC7): aggregating points computed under differing kpi_version
   * values is blocked with ERR-G14-XVER-AGG unless the caller explicitly acknowledges it.
   */
  kpiSeries(scope: TenantScope, input: { kpiCode: string; periodKeys: string[]; acknowledgeCrossVersion?: boolean }): KpiSeriesResult {
    requireTenantScope(scope);
    const points = input.periodKeys
      .map((periodKey) => this.currentSnapshot(scope, input.kpiCode, periodKey))
      .filter((snapshot): snapshot is KpiSnapshotRecord => snapshot !== null)
      .map((snapshot) => ({ periodKey: snapshot.periodKey, value: snapshot.value, kpiVersion: snapshot.kpiVersion, definitionHash: snapshot.definitionHash }));
    const versions = [...new Set(points.map((point) => point.kpiVersion))].sort((a, b) => a - b);
    const crossVersion = versions.length > 1;
    if (crossVersion && !input.acknowledgeCrossVersion) {
      throw new FoundationError("ERR-G14-XVER-AGG", "Series spans multiple KPI definition versions; aggregation requires acknowledgement", {
        details: { kpiCode: input.kpiCode, kpiVersions: versions },
      });
    }
    return { kpiCode: input.kpiCode, kpiVersions: versions, crossVersion, points };
  }

  // ---- FR-03: mart refresh consuming the SQL layer (JOB-G14-MART-*) ---------------------

  /**
   * Refresh the seeded read-model marts from their module sources. Each mart runs under its
   * registered JOB-G14-MART-* job (idempotent per runKey via the X.1 job kernel) and appends
   * one row to datamart_refresh_logs; the mart watermark/row_count/health update with it.
   */
  refreshDatamarts(actor: ActorContext, input: { runType?: G14RefreshRunType; runKey: string }): MartRefreshResult {
    this.authorization.check(actor, "g14.analytics.refresh", actor);
    const runType = input.runType ?? "MANUAL";
    const logs: DatamartRefreshLogRecord[] = [];
    const marts: DatamartRecord[] = [];
    for (const mart of this.repository.listDatamarts(actor)) {
      const startedAt = new Date().toISOString();
      const run = this.jobs.start(actor, { jobId: mart.refreshJobId, runKey: `${input.runKey}:${mart.martCode}` });
      const source = this.readMartSource(actor, mart.martCode);
      const finishedAt = new Date().toISOString();
      const updated = this.repository.markDatamartRefreshed(actor, mart.martCode, {
        rowCount: source.rowCount,
        lastRefreshedAt: finishedAt,
        healthStatus: "HEALTHY",
      });
      const log = this.repository.appendRefreshLog({
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        martId: mart.id,
        martCode: mart.martCode,
        runType,
        startedAt,
        finishedAt,
        rowsRead: source.rowCount,
        rowsWritten: source.rowCount,
        status: "SUCCESS",
        triggeredBy: actor.userId,
        correlationId: actor.correlationId,
      });
      this.jobs.finish(actor, run.id, { rowsAffected: source.rowCount, outcomeDetail: { martCode: mart.martCode, refreshLogId: log.id } });
      this.audit.recordMutation(actor, {
        action: "G14_DATAMART_REFRESHED",
        subjectRef: `datamart_refresh_logs:${log.id}`,
        metadata: { martCode: mart.martCode, jobId: mart.refreshJobId, runType, rowsWritten: source.rowCount },
      });
      logs.push(log);
      marts.push(updated);
    }
    return { runType, marts, logs };
  }

  listDatamarts(scope: TenantScope): DatamartRecord[] {
    requireTenantScope(scope);
    return this.repository.listDatamarts(scope);
  }

  listRefreshLogs(scope: TenantScope): DatamartRefreshLogRecord[] {
    requireTenantScope(scope);
    return this.repository.listRefreshLogs(scope);
  }

  // ---- FR-17: k-anonymity suppression at the query boundary ----------------------------

  /**
   * Aggregate a mart by a dimension with fail-closed k-anonymity: any cell whose member count
   * is below min_cell_size_k comes back suppressed (never the raw count), and when a total
   * could recover a lone suppressed cell by subtraction, the next-smallest cell is also
   * suppressed (complementary suppression) and the total withheld.
   */
  queryAggregate(actor: ActorContext, input: { martCode: string; dimension: string; kpiCode?: string }): AggregateResult {
    this.authorization.check(actor, "g14.analytics.read", actor);
    const policy = this.requireSuppressionPolicy(actor);
    const kpiOverride = input.kpiCode ? this.repository.findActiveKpiDefinition(actor, input.kpiCode)?.minCellSize : undefined;
    const minCellSizeK = kpiOverride ?? policy.minCellSizeK;
    const source = this.readMartSource(actor, input.martCode);
    const groups = new Map<string, number>();
    for (const row of source.rows) {
      const key = row[input.dimension];
      if (key === undefined) {
        continue;
      }
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    if (groups.size === 0) {
      return { martCode: input.martCode, dimension: input.dimension, minCellSizeK, cells: [], total: 0, suppressedCells: 0 };
    }
    const cells: AggregateCell[] = [...groups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, count]) =>
        count < minCellSizeK
          ? { key, value: null, suppressed: true, suppressionReason: "ERR-G14-SMALL-CELL" as const }
          : { key, value: count, suppressed: false }
      );
    const primarySuppressed = cells.filter((cell) => cell.suppressed).length;
    if (primarySuppressed > 0 && policy.complementary) {
      // Complementary suppression: with the total published, a single suppressed cell is
      // recoverable by subtraction — suppress the smallest visible cell as its complement.
      const visible = cells.filter((cell) => !cell.suppressed);
      if (primarySuppressed === 1 && visible.length > 0) {
        const smallest = visible.reduce((min, cell) => ((cell.value ?? 0) < (min.value ?? 0) ? cell : min));
        smallest.value = null;
        smallest.suppressed = true;
        smallest.suppressionReason = "ERR-G14-COMP-SUPPRESS";
      }
    }
    const suppressedCells = cells.filter((cell) => cell.suppressed).length;
    // Fail-closed totals: any suppression withholds the total so nothing is recoverable.
    const total = suppressedCells > 0 ? null : [...groups.values()].reduce((sum, count) => sum + count, 0);
    this.repository.appendAccessLog({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      userId: actor.userId,
      action: "API_QUERY",
      targetType: "KPI",
      targetId: `${input.martCode}:${input.dimension}`,
      rowCount: source.rowCount,
      suppressedCells,
      correlationId: actor.correlationId ?? "unknown",
    });
    return { martCode: input.martCode, dimension: input.dimension, minCellSizeK, cells, total, suppressedCells };
  }

  /**
   * Drill into a single cohort cell. A cohort smaller than k is refused outright with
   * ERR-G14-SMALL-CELL (FR-16/FR-17 negative path) — the raw count is never returned.
   */
  drillCohort(actor: ActorContext, input: { martCode: string; dimension: string; key: string }): { martCode: string; dimension: string; key: string; value: number } {
    this.authorization.check(actor, "g14.analytics.read", actor);
    const policy = this.requireSuppressionPolicy(actor);
    const source = this.readMartSource(actor, input.martCode);
    const size = source.rows.filter((row) => row[input.dimension] === input.key).length;
    this.repository.appendAccessLog({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      userId: actor.userId,
      action: "DRILLTHROUGH",
      targetType: "RECORD",
      targetId: `${input.martCode}:${input.dimension}:${input.key}`,
      rowCount: size,
      suppressedCells: size < policy.minCellSizeK ? 1 : 0,
      correlationId: actor.correlationId ?? "unknown",
    });
    if (size < policy.minCellSizeK) {
      throw new FoundationError("ERR-G14-SMALL-CELL", "Cohort is below the minimum cell size and is suppressed", {
        details: { minCellSizeK: policy.minCellSizeK },
      });
    }
    return { martCode: input.martCode, dimension: input.dimension, key: input.key, value: size };
  }

  // ---- FR-04: analytics_scope_policies with maker-checker activation --------------------

  createScopePolicy(actor: ActorContext, input: { role: string; scopeDimensions: string[]; martCode?: string; priority?: number }): ScopePolicyRecord {
    this.authorization.check(actor, "g14.scope.manage", actor);
    if (input.scopeDimensions.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "A scope policy must declare at least one P02 scope dimension", { field: "scopeDimensions" });
    }
    if (input.martCode && !this.repository.findDatamart(actor, input.martCode)) {
      throw new FoundationError("NOT_FOUND", "Scope policy references an unregistered datamart", { field: "martCode" });
    }
    const version = this.repository.listScopePolicies(actor).filter((policy) => policy.role === input.role && policy.martCode === input.martCode).length + 1;
    const policy = this.repository.saveScopePolicy({
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      role: input.role,
      scopeDimensions: input.scopeDimensions,
      martCode: input.martCode,
      priority: input.priority ?? 0,
      version,
      status: "PENDING_APPROVAL",
      createdBy: actor.userId,
      isActive: false,
    });
    this.audit.recordMutation(actor, {
      action: "G14_SCOPE_POLICY_PROPOSED",
      subjectRef: `analytics_scope_policies:${policy.id}`,
      metadata: { role: policy.role, martCode: policy.martCode ?? null, maker: policy.createdBy },
    });
    return policy;
  }

  /**
   * Maker-checker activation (FR-04 AC7): the activating checker must be a distinct user from
   * the proposing maker; self-approval is refused with ERR-G14-SCOPE-CHECKER. Activation
   * supersedes the prior ACTIVE binding for the same (role, mart).
   */
  activateScopePolicy(actor: ActorContext, policyId: string): ScopePolicyRecord {
    this.authorization.check(actor, "g14.scope.activate", actor);
    const policy = this.repository.findScopePolicy(actor, policyId);
    if (!policy) {
      throw new FoundationError("NOT_FOUND", "Scope policy not found");
    }
    if (policy.status !== "PENDING_APPROVAL") {
      throw new FoundationError("CONFLICT", "Only a PENDING_APPROVAL scope policy can be activated", { details: { status: policy.status } });
    }
    if (policy.createdBy === actor.userId) {
      throw new FoundationError("ERR-G14-SCOPE-CHECKER", "Scope policy activation requires a checker distinct from the maker", {
        details: { maker: policy.createdBy },
      });
    }
    const activated = this.repository.activateScopePolicy(actor, policyId, actor.userId);
    this.audit.recordMutation(actor, {
      action: "G14_SCOPE_POLICY_ACTIVATED",
      subjectRef: `analytics_scope_policies:${activated.id}`,
      metadata: { role: activated.role, maker: activated.createdBy, checker: activated.approvedBy },
    });
    return activated;
  }

  listScopePolicies(scope: TenantScope): ScopePolicyRecord[] {
    requireTenantScope(scope);
    return this.repository.listScopePolicies(scope);
  }

  // ---- internals -------------------------------------------------------------------------

  private requireActiveKpi(scope: TenantScope, kpiCode: string): KpiDefinitionRecord {
    const definition = this.repository.findActiveKpiDefinition(scope, kpiCode);
    if (!definition) {
      throw new FoundationError("PRECONDITION_FAILED", "KPI has no ACTIVE definition version; activate one first", {
        details: { messageId: "ERR-G14-KPI-INACTIVE", kpiCode },
      });
    }
    return definition;
  }

  private requireSuppressionPolicy(scope: TenantScope): SuppressionPolicyRecord {
    const policy = this.repository.activeSuppressionPolicy(scope);
    if (!policy) {
      // Fail closed: without a suppression policy no aggregate leaves the engine.
      throw new FoundationError("PRECONDITION_FAILED", "No active suppression policy; aggregate reads are fail-closed", {
        details: { messageId: "ERR-G14-SMALL-CELL" },
      });
    }
    return policy;
  }

  /**
   * Read a mart's source rows through the contracted module read surface (never a fork of
   * module tables): G03 leave/attendance, G08 APAR, G06 establishment sanctioned posts.
   */
  private readMartSource(scope: TenantScope, martCode: string): { rows: Array<Record<string, string>>; rowCount: number; dataAsOf: string } {
    const dataAsOf = new Date().toISOString();
    switch (martCode) {
      case "MART_LEAVE": {
        const rows = this.leave.listApplications(scope).map((application) => ({
          leaveTypeId: application.leaveTypeId,
          status: application.status,
          employeeId: application.employeeId,
        }));
        return { rows, rowCount: rows.length, dataAsOf };
      }
      case "MART_ATTENDANCE": {
        const rows = this.leave.listAttendance(scope).map((record) => ({
          status: record.status,
          employeeId: record.employeeId,
          attendanceDate: record.attendanceDate,
        }));
        return { rows, rowCount: rows.length, dataAsOf };
      }
      case "MART_APPRAISAL": {
        // G08 exposes aggregate counts through its contracted summary — no row-level PII here.
        const summary = this.apar.summary(scope);
        return { rows: [], rowCount: summary.forms, dataAsOf };
      }
      case "MART_ESTABLISHMENT": {
        const rows = this.establishment.listSanctionedPosts(scope).map((post) => ({
          cadreId: post.cadreId,
          orgUnitId: post.orgUnitId,
          status: post.status,
        }));
        return { rows, rowCount: rows.length, dataAsOf };
      }
      default:
        throw new FoundationError("NOT_FOUND", "Unknown datamart", { field: "martCode", details: { martCode } });
    }
  }

  private currentSnapshot(scope: TenantScope, kpiCode: string, periodKey: string): KpiSnapshotRecord | null {
    const rows = this.repository
      .listKpiSnapshots(scope, kpiCode, periodKey)
      .filter((snapshot) => !snapshot.isSuperseded)
      .sort((left, right) => right.knowledgeTime.localeCompare(left.knowledgeTime));
    return rows[0] ?? null;
  }
}
