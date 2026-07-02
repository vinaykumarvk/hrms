import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, assertNever } from "../../platform/types";

/**
 * PH-08A statutory shared kernels (G06 FR-015 / FR-016, docs/brd/v3/G06-promotion-posting-progression.md):
 *   (1) sanctioned_posts establishment-strength register — vacancy computation, quota split, strength
 *       reconciliation (VAL-G06-QUOTA-SPLIT / VAL-G06-VACANCY-RECON);
 *   (2) qualifying_service_ledger + service_exclusion_rules — gross-minus-exclusions compute engine with
 *       immutable, supersede-only snapshot lineage (VAL-G06-QUALSVC), read by G06 eligibility now and G11 later.
 * Follows the PH-06A repository pattern: sync interface + in-memory impl (DI default), a durable
 * file-backed impl (rehydrates from disk), and a Postgres impl over migration 0008.
 */

export type SanctionedPostStatus = "ACTIVE" | "REVISED" | "ARCHIVED";
export type SuspensionTreatment = "EXCLUDE" | "INCLUDE_IF_EXONERATED" | "PER_OUTCOME";
export type ServicePeriodKind = "EOL" | "DIES_NON" | "SUSPENSION" | "ADHOC" | "DEPUTATION" | "BREAK_IN_SERVICE";

/** FR-015: one sanctioned_posts register row (docs/data-model 5.2.25 g06_sanctioned_posts). */
export interface SanctionedPost {
  id: string;
  tenantId: string;
  entityId?: string;
  cadreId: string;
  gradeDesignationId: string;
  orgUnitId: string;
  sanctionOrderRef: string;
  sanctionedStrength: number;
  filledCount: number;
  drQuotaPct: number;
  promotionQuotaPct: number;
  ldceQuotaPct: number;
  /** Always derived: sanctioned_strength − filled_count (§5.6-15) — never free-entered. */
  currentVacancies: number;
  anticipatedVacancies: number;
  carriedForwardVacancies: number;
  asOnDate: string;
  status: SanctionedPostStatus;
  version: number;
  /** Maker≠checker SoD (FR-015 AC-5): distinct proposing and approving actors. */
  makerActorId: string;
  approverActorId: string;
}

/** FR-016: pinned exclusion logic (docs/data-model 5.2.27 g06_service_exclusion_rules). */
export interface ServiceExclusionRule {
  id: string;
  tenantId: string;
  entityId?: string;
  ruleCode: string;
  eolCountsAsQualifying: boolean;
  eolMaxCondonableDays?: number;
  diesNonExcluded: boolean;
  suspensionTreatment: SuspensionTreatment;
  adhocServiceCounts: boolean;
  adhocCountsIfRegularised: boolean;
  deputationCounts: boolean;
  breakInServiceResetsClock: boolean;
  effectiveFrom?: string;
  isActive: boolean;
  makerActorId: string;
  approverActorId: string;
}

/** One service spell fed into the FR-016 compute engine. */
export interface ServicePeriodInput {
  kind: ServicePeriodKind;
  days: number;
  /** SUSPENSION outcome — used by INCLUDE_IF_EXONERATED / PER_OUTCOME treatments. */
  exonerated?: boolean;
  /** ADHOC service later regularised. */
  regularised?: boolean;
  /** BREAK_IN_SERVICE: qualifying days accrued before the break (forfeited when the clock resets). */
  priorServiceDays?: number;
}

export interface ExclusionBreakdownItem {
  periodKind: ServicePeriodKind;
  periodDays: number;
  excludedDays: number;
  countedDays: number;
  treatment: string;
}

export interface QualifyingServiceComputation {
  grossServiceYears: number;
  totalExclusionDays: number;
  netQualifyingYears: number;
  exclusionBreakdown: ExclusionBreakdownItem[];
}

/** FR-016: immutable, citable snapshot (docs/data-model 5.2.26 g06_qualifying_service_ledger). */
export interface QualifyingServiceSnapshot {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  gradeDesignationId: string;
  asOfDate: string;
  grossServiceYears: number;
  totalExclusionDays: number;
  netQualifyingYears: number;
  exclusionBreakdownJson: ExclusionBreakdownItem[];
  serviceExclusionRuleId: string;
  computedByVersion: string;
  isCurrent: boolean;
  /** Supersede-only lineage: set on the superseded snapshot, pointing at its replacement. */
  supersedingSnapshotId?: string;
  computedAt: string;
}

export const QSL_ENGINE_VERSION = "qsl-engine-1.0";
const DAYS_PER_YEAR = 365;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * FR-016 compute engine (VAL-G06-QUALSVC): net_qualifying_years = gross − Σ(excluded periods),
 * where each period's treatment is driven by the pinned service_exclusion_rules row.
 * Pure and deterministic so every snapshot is reproducible from its breakdown.
 */
export function computeNetQualifyingService(
  rule: ServiceExclusionRule,
  input: { grossServiceDays: number; periods: ServicePeriodInput[] }
): QualifyingServiceComputation {
  if (input.grossServiceDays < 0) {
    throw new FoundationError("VALIDATION_FAILED", "grossServiceDays must be non-negative", { field: "grossServiceDays" });
  }
  const exclusionBreakdown: ExclusionBreakdownItem[] = input.periods.map((period) => {
    if (period.days < 0) {
      throw new FoundationError("VALIDATION_FAILED", "service period days must be non-negative", { field: "periods" });
    }
    return applyExclusionRule(rule, period);
  });
  const totalExclusionDays = exclusionBreakdown.reduce((sum, item) => sum + item.excludedDays, 0);
  if (totalExclusionDays > input.grossServiceDays) {
    throw new FoundationError("VALIDATION_FAILED", "Excluded days exceed gross service — periods double-counted or gross understated", {
      field: "periods",
      details: { grossServiceDays: input.grossServiceDays, totalExclusionDays },
    });
  }
  return {
    grossServiceYears: round3(input.grossServiceDays / DAYS_PER_YEAR),
    totalExclusionDays,
    netQualifyingYears: round3((input.grossServiceDays - totalExclusionDays) / DAYS_PER_YEAR),
    exclusionBreakdown,
  };
}

function applyExclusionRule(rule: ServiceExclusionRule, period: ServicePeriodInput): ExclusionBreakdownItem {
  const item = (excludedDays: number, treatment: string): ExclusionBreakdownItem => ({
    periodKind: period.kind,
    periodDays: period.days,
    excludedDays,
    countedDays: period.days - Math.min(excludedDays, period.days),
    treatment,
  });
  switch (period.kind) {
    case "EOL": {
      if (rule.eolCountsAsQualifying) {
        return item(0, "eol_counts_as_qualifying");
      }
      const condoned = Math.min(period.days, rule.eolMaxCondonableDays ?? 0);
      return item(period.days - condoned, "eol_excluded_beyond_condonable_limit");
    }
    case "DIES_NON":
      return rule.diesNonExcluded ? item(period.days, "dies_non_excluded") : item(0, "dies_non_counted");
    case "SUSPENSION": {
      switch (rule.suspensionTreatment) {
        case "EXCLUDE":
          return item(period.days, "suspension_excluded");
        case "INCLUDE_IF_EXONERATED":
        case "PER_OUTCOME":
          return period.exonerated === true
            ? item(0, `suspension_counted_${rule.suspensionTreatment.toLowerCase()}`)
            : item(period.days, `suspension_excluded_${rule.suspensionTreatment.toLowerCase()}`);
        default:
          return assertNever(rule.suspensionTreatment);
      }
    }
    case "ADHOC": {
      const counts = rule.adhocServiceCounts || (rule.adhocCountsIfRegularised && period.regularised === true);
      return counts ? item(0, "adhoc_counted") : item(period.days, "adhoc_excluded_not_regularised");
    }
    case "DEPUTATION":
      return rule.deputationCounts ? item(0, "deputation_counted") : item(period.days, "deputation_excluded");
    case "BREAK_IN_SERVICE": {
      if (rule.breakInServiceResetsClock) {
        return {
          periodKind: period.kind,
          periodDays: period.days,
          excludedDays: period.days + (period.priorServiceDays ?? 0),
          countedDays: 0,
          treatment: "break_in_service_clock_reset",
        };
      }
      return item(period.days, "break_in_service_excluded");
    }
    default:
      return assertNever(period.kind);
  }
}

/** Result of an atomic snapshot supersession. */
export interface SnapshotSupersessionResult {
  snapshot: QualifyingServiceSnapshot;
  supersededSnapshotId?: string;
}

/**
 * Establishment + QSL repository contract consumed by PromotionService.
 * The G06 vacancy maths read current_vacancies from this register and eligibility reads
 * the current qualifying_service_ledger snapshot — never module-local arrays.
 */
export interface EstablishmentQslRepository {
  countSanctionedPosts(): number;
  saveSanctionedPost(post: SanctionedPost): void;
  findSanctionedPost(scope: TenantScope, sanctionedPostId: string): SanctionedPost | undefined;
  listSanctionedPosts(scope: TenantScope): SanctionedPost[];
  countExclusionRules(): number;
  saveExclusionRule(rule: ServiceExclusionRule): void;
  findExclusionRule(scope: TenantScope, ruleId: string): ServiceExclusionRule | undefined;
  listExclusionRules(scope: TenantScope): ServiceExclusionRule[];
  countSnapshots(): number;
  /**
   * Appends the snapshot and, atomically in the same operation, flips the prior current
   * snapshot for the (employee, grade) to is_current=false with superseding_snapshot_id set.
   * History is never otherwise mutated.
   */
  insertSnapshotSuperseding(snapshot: QualifyingServiceSnapshot): SnapshotSupersessionResult;
  findSnapshot(scope: TenantScope, snapshotId: string): QualifyingServiceSnapshot | undefined;
  findCurrentSnapshot(scope: TenantScope, employeeId: string, gradeDesignationId: string): QualifyingServiceSnapshot | undefined;
  listSnapshots(scope: TenantScope, employeeId: string): QualifyingServiceSnapshot[];
}

/** In-memory implementation (DI default, mirrors InMemoryLeaveRepository). */
export class InMemoryEstablishmentQslRepository implements EstablishmentQslRepository {
  protected readonly sanctionedPosts: SanctionedPost[] = [];
  protected readonly exclusionRules: ServiceExclusionRule[] = [];
  protected readonly snapshots: QualifyingServiceSnapshot[] = [];

  countSanctionedPosts(): number {
    return this.sanctionedPosts.length;
  }

  saveSanctionedPost(post: SanctionedPost): void {
    const index = this.sanctionedPosts.findIndex((item) => item.id === post.id);
    if (index < 0) {
      this.sanctionedPosts.push({ ...post });
    } else {
      this.sanctionedPosts[index] = { ...post };
    }
    this.persist();
  }

  findSanctionedPost(scope: TenantScope, sanctionedPostId: string): SanctionedPost | undefined {
    const post = this.sanctionedPosts.find((item) => item.id === sanctionedPostId && this.inScope(item, scope));
    return post ? { ...post } : undefined;
  }

  listSanctionedPosts(scope: TenantScope): SanctionedPost[] {
    return this.sanctionedPosts.filter((item) => this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countExclusionRules(): number {
    return this.exclusionRules.length;
  }

  saveExclusionRule(rule: ServiceExclusionRule): void {
    const index = this.exclusionRules.findIndex((item) => item.id === rule.id);
    if (index < 0) {
      this.exclusionRules.push({ ...rule });
    } else {
      this.exclusionRules[index] = { ...rule };
    }
    this.persist();
  }

  findExclusionRule(scope: TenantScope, ruleId: string): ServiceExclusionRule | undefined {
    const rule = this.exclusionRules.find((item) => item.id === ruleId && this.inScope(item, scope));
    return rule ? { ...rule } : undefined;
  }

  listExclusionRules(scope: TenantScope): ServiceExclusionRule[] {
    return this.exclusionRules.filter((item) => this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countSnapshots(): number {
    return this.snapshots.length;
  }

  insertSnapshotSuperseding(snapshot: QualifyingServiceSnapshot): SnapshotSupersessionResult {
    const priorIndex = this.snapshots.findIndex(
      (item) =>
        item.tenantId === snapshot.tenantId &&
        item.employeeId === snapshot.employeeId &&
        item.gradeDesignationId === snapshot.gradeDesignationId &&
        item.isCurrent
    );
    let supersededSnapshotId: string | undefined;
    const prior = priorIndex >= 0 ? this.snapshots[priorIndex] : undefined;
    if (prior) {
      // Lineage flip is the only permitted mutation of an existing snapshot (append-only ledger).
      this.snapshots[priorIndex] = { ...prior, isCurrent: false, supersedingSnapshotId: snapshot.id };
      supersededSnapshotId = prior.id;
    }
    this.snapshots.push({ ...snapshot, isCurrent: true, supersedingSnapshotId: undefined });
    // Single persist for the whole supersession — no partially applied kernel state on disk.
    this.persist();
    return { snapshot: { ...snapshot, isCurrent: true, supersedingSnapshotId: undefined }, supersededSnapshotId };
  }

  findSnapshot(scope: TenantScope, snapshotId: string): QualifyingServiceSnapshot | undefined {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId && this.inScope(item, scope));
    return snapshot ? this.cloneSnapshot(snapshot) : undefined;
  }

  findCurrentSnapshot(scope: TenantScope, employeeId: string, gradeDesignationId: string): QualifyingServiceSnapshot | undefined {
    const snapshot = this.snapshots.find(
      (item) =>
        item.employeeId === employeeId && item.gradeDesignationId === gradeDesignationId && item.isCurrent && this.inScope(item, scope)
    );
    return snapshot ? this.cloneSnapshot(snapshot) : undefined;
  }

  listSnapshots(scope: TenantScope, employeeId: string): QualifyingServiceSnapshot[] {
    return this.snapshots.filter((item) => item.employeeId === employeeId && this.inScope(item, scope)).map((item) => this.cloneSnapshot(item));
  }

  /** Durability hook — no-op in memory; the file-backed subclass writes through. */
  protected persist(): void {
    // In-memory repository keeps state in process only.
  }

  protected loadState(state: { sanctionedPosts?: SanctionedPost[]; exclusionRules?: ServiceExclusionRule[]; snapshots?: QualifyingServiceSnapshot[] }): void {
    this.sanctionedPosts.push(...(state.sanctionedPosts ?? []));
    this.exclusionRules.push(...(state.exclusionRules ?? []));
    this.snapshots.push(...(state.snapshots ?? []));
  }

  protected snapshotState(): { sanctionedPosts: SanctionedPost[]; exclusionRules: ServiceExclusionRule[]; snapshots: QualifyingServiceSnapshot[] } {
    return { sanctionedPosts: this.sanctionedPosts, exclusionRules: this.exclusionRules, snapshots: this.snapshots };
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }

  private cloneSnapshot(snapshot: QualifyingServiceSnapshot): QualifyingServiceSnapshot {
    return { ...snapshot, exclusionBreakdownJson: snapshot.exclusionBreakdownJson.map((item) => ({ ...item })) };
  }
}

/**
 * Durable file-backed implementation: rehydrates kernel state from disk on construction and
 * write-through persists after every mutation with an atomic tmp-file + rename swap, so a
 * crash never leaves partially applied kernel state.
 */
export class FileBackedEstablishmentQslRepository extends InMemoryEstablishmentQslRepository {
  constructor(private readonly filePath: string) {
    super();
    this.rehydrate();
  }

  private rehydrate(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    this.loadState(JSON.parse(raw) as Parameters<InMemoryEstablishmentQslRepository["loadState"]>[0]);
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.snapshotState()), "utf8");
    renameSync(tmpPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G06 kernel DDL (docs/data-model/06-*.sql),
// mirrored by apps/api/db/migrations/0008_g06_establishment_qsl.sql. All SQL is
// parameterised ($1, $2, ...); the snapshot supersession and strength revisions run in a
// single transaction.
// ---------------------------------------------------------------------------------------

export interface SanctionedPostRowPg {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  cadre_id: string;
  grade_designation_id: string;
  org_unit_id: string;
  sanction_order_ref: string;
  sanctioned_strength: number;
  filled_count: number;
  dr_quota_pct: string;
  promotion_quota_pct: string;
  ldce_quota_pct: string;
  current_vacancies: number;
  anticipated_vacancies: number;
  carried_forward_vacancies: number;
  as_on_date: Date;
  status: string;
}

export interface ServiceExclusionRuleRowPg {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  rule_code: string;
  eol_counts_as_qualifying: boolean;
  eol_max_condonable_days: number | null;
  dies_non_excluded: boolean;
  suspension_treatment: string;
  adhoc_service_counts: boolean;
  adhoc_counts_if_regularised: boolean;
  deputation_counts: boolean;
  break_in_service_resets_clock: boolean;
  is_active: boolean;
}

export interface QualifyingServiceSnapshotRowPg {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  employee_id: string;
  grade_designation_id: string;
  as_of_date: Date;
  gross_service_years: string;
  total_exclusion_days: number;
  net_qualifying_years: string;
  exclusion_breakdown_json: ExclusionBreakdownItem[];
  service_exclusion_rule_id: string;
  computed_by_version: string;
  is_current: boolean;
  superseding_snapshot_id: string | null;
}

const INSERT_SANCTIONED_POST =
  "INSERT INTO g06_sanctioned_posts (tenant_id, entity_id, cadre_id, grade_designation_id, org_unit_id, sanction_order_ref, " +
  "sanctioned_strength, filled_count, dr_quota_pct, promotion_quota_pct, ldce_quota_pct, current_vacancies, anticipated_vacancies, carried_forward_vacancies, as_on_date, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) " +
  "RETURNING id, tenant_id, entity_id, cadre_id, grade_designation_id, org_unit_id, sanction_order_ref, sanctioned_strength, filled_count, " +
  "dr_quota_pct, promotion_quota_pct, ldce_quota_pct, current_vacancies, anticipated_vacancies, carried_forward_vacancies, as_on_date, status";

const SELECT_SANCTIONED_POST =
  "SELECT id, tenant_id, entity_id, cadre_id, grade_designation_id, org_unit_id, sanction_order_ref, sanctioned_strength, filled_count, " +
  "dr_quota_pct, promotion_quota_pct, ldce_quota_pct, current_vacancies, anticipated_vacancies, carried_forward_vacancies, as_on_date, status " +
  "FROM g06_sanctioned_posts WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const SELECT_SANCTIONED_POST_FOR_UPDATE = SELECT_SANCTIONED_POST + " FOR UPDATE";

const RECONCILE_SANCTIONED_POST =
  "UPDATE g06_sanctioned_posts SET filled_count = $3, current_vacancies = sanctioned_strength - $3, updated_by = $4, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, cadre_id, grade_designation_id, org_unit_id, sanction_order_ref, sanctioned_strength, filled_count, " +
  "dr_quota_pct, promotion_quota_pct, ldce_quota_pct, current_vacancies, anticipated_vacancies, carried_forward_vacancies, as_on_date, status";

const INSERT_EXCLUSION_RULE =
  "INSERT INTO g06_service_exclusion_rules (tenant_id, entity_id, rule_code, eol_counts_as_qualifying, eol_max_condonable_days, dies_non_excluded, " +
  "suspension_treatment, adhoc_service_counts, adhoc_counts_if_regularised, deputation_counts, break_in_service_resets_clock, effective_from, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) " +
  "RETURNING id, tenant_id, entity_id, rule_code, eol_counts_as_qualifying, eol_max_condonable_days, dies_non_excluded, suspension_treatment, " +
  "adhoc_service_counts, adhoc_counts_if_regularised, deputation_counts, break_in_service_resets_clock, is_active";

const SELECT_CURRENT_SNAPSHOT =
  "SELECT id, tenant_id, entity_id, employee_id, grade_designation_id, as_of_date, gross_service_years, total_exclusion_days, net_qualifying_years, " +
  "exclusion_breakdown_json, service_exclusion_rule_id, computed_by_version, is_current, superseding_snapshot_id " +
  "FROM g06_qualifying_service_ledger WHERE tenant_id = $1 AND employee_id = $2 AND grade_designation_id = $3 AND is_current AND is_deleted = false";

const SELECT_CURRENT_SNAPSHOT_FOR_UPDATE = SELECT_CURRENT_SNAPSHOT + " FOR UPDATE";

const SELECT_SNAPSHOT_BY_ID =
  "SELECT id, tenant_id, entity_id, employee_id, grade_designation_id, as_of_date, gross_service_years, total_exclusion_days, net_qualifying_years, " +
  "exclusion_breakdown_json, service_exclusion_rule_id, computed_by_version, is_current, superseding_snapshot_id " +
  "FROM g06_qualifying_service_ledger WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const INSERT_SNAPSHOT =
  "INSERT INTO g06_qualifying_service_ledger (tenant_id, entity_id, employee_id, grade_designation_id, as_of_date, gross_service_years, " +
  "total_exclusion_days, net_qualifying_years, exclusion_breakdown_json, service_exclusion_rule_id, computed_by_version, computed_at, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12) " +
  "RETURNING id, tenant_id, entity_id, employee_id, grade_designation_id, as_of_date, gross_service_years, total_exclusion_days, net_qualifying_years, " +
  "exclusion_breakdown_json, service_exclusion_rule_id, computed_by_version, is_current, superseding_snapshot_id";

const SUPERSEDE_SNAPSHOT =
  "UPDATE g06_qualifying_service_ledger SET is_current = false, superseding_snapshot_id = $2, updated_at = now() WHERE id = $1 RETURNING id";

/** Postgres-backed FR-015/FR-016 kernel repository over migration 0008 tables. */
export class PgEstablishmentQslRepository {
  constructor(private readonly pool: Pool) {}

  async insertSanctionedPost(input: {
    tenantId: string;
    entityId?: string;
    cadreId: string;
    gradeDesignationId: string;
    orgUnitId: string;
    sanctionOrderRef: string;
    sanctionedStrength: number;
    filledCount: number;
    drQuotaPct: number;
    promotionQuotaPct: number;
    ldceQuotaPct: number;
    anticipatedVacancies?: number;
    carriedForwardVacancies?: number;
    asOnDate: string;
    createdBy?: string;
  }): Promise<SanctionedPostRowPg> {
    const result = await this.pool.query(INSERT_SANCTIONED_POST, [
      input.tenantId,
      input.entityId ?? null,
      input.cadreId,
      input.gradeDesignationId,
      input.orgUnitId,
      input.sanctionOrderRef,
      input.sanctionedStrength,
      input.filledCount,
      input.drQuotaPct,
      input.promotionQuotaPct,
      input.ldceQuotaPct,
      // current_vacancies is derived, never free-entered (§5.6-15).
      input.sanctionedStrength - input.filledCount,
      input.anticipatedVacancies ?? 0,
      input.carriedForwardVacancies ?? 0,
      input.asOnDate,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as SanctionedPostRowPg;
  }

  async findSanctionedPost(tenantId: string, sanctionedPostId: string): Promise<SanctionedPostRowPg | undefined> {
    const result = await this.pool.query(SELECT_SANCTIONED_POST, [tenantId, sanctionedPostId]);
    return result.rows[0] as SanctionedPostRowPg | undefined;
  }

  /**
   * FR-015 strength reconciliation: re-derives current_vacancies = sanctioned_strength − filled_count
   * in one transaction; filled > sanctioned fails closed on the ck_g06_sp_filled CHECK.
   */
  async reconcileSanctionedPost(input: { tenantId: string; sanctionedPostId: string; filledCount: number; updatedBy?: string }): Promise<SanctionedPostRowPg> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(SELECT_SANCTIONED_POST_FOR_UPDATE, [input.tenantId, input.sanctionedPostId]);
      const current = locked.rows[0] as SanctionedPostRowPg | undefined;
      if (!current) {
        throw new FoundationError("NOT_FOUND", "Sanctioned post not found");
      }
      if (input.filledCount > current.sanctioned_strength) {
        throw new FoundationError("STRENGTH_INCONSISTENT", "filled_count may not exceed sanctioned_strength", {
          field: "filledCount",
          details: { filledCount: input.filledCount, sanctionedStrength: current.sanctioned_strength },
        });
      }
      const result = await client.query(RECONCILE_SANCTIONED_POST, [input.tenantId, input.sanctionedPostId, input.filledCount, input.updatedBy ?? null]);
      return result.rows[0] as SanctionedPostRowPg;
    });
  }

  async insertExclusionRule(input: {
    tenantId: string;
    entityId?: string;
    ruleCode: string;
    eolCountsAsQualifying: boolean;
    eolMaxCondonableDays?: number;
    diesNonExcluded: boolean;
    suspensionTreatment: SuspensionTreatment;
    adhocServiceCounts: boolean;
    adhocCountsIfRegularised: boolean;
    deputationCounts: boolean;
    breakInServiceResetsClock: boolean;
    effectiveFrom?: string;
    createdBy?: string;
  }): Promise<ServiceExclusionRuleRowPg> {
    const result = await this.pool.query(INSERT_EXCLUSION_RULE, [
      input.tenantId,
      input.entityId ?? null,
      input.ruleCode,
      input.eolCountsAsQualifying,
      input.eolMaxCondonableDays ?? null,
      input.diesNonExcluded,
      input.suspensionTreatment,
      input.adhocServiceCounts,
      input.adhocCountsIfRegularised,
      input.deputationCounts,
      input.breakInServiceResetsClock,
      input.effectiveFrom ?? null,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as ServiceExclusionRuleRowPg;
  }

  /**
   * FR-016 supersession: the new snapshot INSERT and the prior snapshot's lineage flip
   * (is_current=false + superseding_snapshot_id) commit in ONE transaction — the ledger is
   * append-only and never left half-superseded.
   */
  async insertSnapshotSuperseding(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    gradeDesignationId: string;
    asOfDate: string;
    grossServiceYears: number;
    totalExclusionDays: number;
    netQualifyingYears: number;
    exclusionBreakdown: ExclusionBreakdownItem[];
    serviceExclusionRuleId: string;
    computedByVersion: string;
    createdBy?: string;
  }): Promise<{ snapshot: QualifyingServiceSnapshotRowPg; supersededSnapshotId?: string }> {
    return withTransaction(this.pool, async (client) => {
      const prior = await client.query(SELECT_CURRENT_SNAPSHOT_FOR_UPDATE, [input.tenantId, input.employeeId, input.gradeDesignationId]);
      const inserted = await client.query(INSERT_SNAPSHOT, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.gradeDesignationId,
        input.asOfDate,
        input.grossServiceYears,
        input.totalExclusionDays,
        input.netQualifyingYears,
        JSON.stringify(input.exclusionBreakdown),
        input.serviceExclusionRuleId,
        input.computedByVersion,
        input.createdBy ?? null,
      ]);
      const snapshot = inserted.rows[0] as QualifyingServiceSnapshotRowPg;
      let supersededSnapshotId: string | undefined;
      const priorRow = prior.rows[0] as QualifyingServiceSnapshotRowPg | undefined;
      if (priorRow) {
        await client.query(SUPERSEDE_SNAPSHOT, [priorRow.id, snapshot.id]);
        supersededSnapshotId = priorRow.id;
      }
      return { snapshot, supersededSnapshotId };
    });
  }

  async getCurrentSnapshot(tenantId: string, employeeId: string, gradeDesignationId: string): Promise<QualifyingServiceSnapshotRowPg | undefined> {
    const result = await this.pool.query(SELECT_CURRENT_SNAPSHOT, [tenantId, employeeId, gradeDesignationId]);
    return result.rows[0] as QualifyingServiceSnapshotRowPg | undefined;
  }

  async getSnapshot(tenantId: string, snapshotId: string): Promise<QualifyingServiceSnapshotRowPg | undefined> {
    const result = await this.pool.query(SELECT_SNAPSHOT_BY_ID, [tenantId, snapshotId]);
    return result.rows[0] as QualifyingServiceSnapshotRowPg | undefined;
  }
}
