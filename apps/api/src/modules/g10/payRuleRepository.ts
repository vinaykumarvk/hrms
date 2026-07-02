import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";

/**
 * PH-09A — persisted, effective-dated G10 rule substrate (BRD G10 FR-01/FR-02):
 * E05 pay_components, E06 pay_rules (constrained DSL), E07 rate_tables (DA/HRA/NPS/PT
 * slabs, state-dimensioned, overlap-rejected). Physical tables per
 * docs/data-model/10-G10-payroll-benefits.sql: g10_pay_components / g10_pay_rules /
 * g10_rate_tables (migration 0014). Money is integer cents; rates are integer basis points.
 */

export type PayComponentCategory = "EARNING" | "DEDUCTION" | "PERQUISITE" | "EMPLOYER_CONTRIBUTION" | "ROUNDING_ADJUSTMENT" | "LEAVE_ENCASHMENT";
export type PayCalcMethod = "FLAT" | "PERCENTAGE" | "SLAB" | "MATRIX" | "FORMULA";
export type PayRuleStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type RateTableType = "DA_RATE" | "HRA_CLASS" | "PT_SLAB" | "TAX_SLAB" | "NPS_RATE" | "GPF_RATE" | "GRATUITY_RATE" | "OTHER";
export type TaxRegime = "OLD" | "NEW";

export interface PayComponent {
  id: string;
  tenantId: string;
  entityId?: string;
  componentCode: string;
  name: string;
  category: PayComponentCategory;
  calcMethod: PayCalcMethod;
  isTaxable: boolean;
  isStatutory: boolean;
  displayOrder: number;
  dslGrammarVersion?: string;
  status: PayRuleStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface PayRule {
  id: string;
  tenantId: string;
  entityId?: string;
  payComponentId: string;
  version: number;
  calcMethod: PayCalcMethod;
  formulaExpression?: string;
  rateTableId?: string;
  computationOrder: number;
  roundingRule?: string;
  dslGrammarVersion?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: PayRuleStatus;
}

export interface RateTableRow {
  id: string;
  tenantId: string;
  entityId?: string;
  tableType: RateTableType;
  state?: string;
  cityClass?: string;
  regime?: TaxRegime;
  financialYear?: string;
  keyCode?: string;
  slabMinCents?: number;
  slabMaxCents?: number;
  ratePctBps?: number;
  flatAmountCents?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
}

/** VAL-G10-RATE-NONOVERLAP key: same (tenant,entity,table_type,state,city_class,regime,FY,key,slab_min). */
export function rateOverlapKey(row: Pick<RateTableRow, "tenantId" | "entityId" | "tableType" | "state" | "cityClass" | "regime" | "financialYear" | "keyCode" | "slabMinCents">): string {
  return [
    row.tenantId,
    row.entityId ?? "",
    row.tableType,
    row.state ?? "",
    row.cityClass ?? "",
    row.regime ?? "",
    row.financialYear ?? "",
    row.keyCode ?? "",
    row.slabMinCents ?? "",
  ].join("|");
}

/** Half-open effective windows [from, to ?? infinity] overlap when each starts before the other ends. */
export function windowsOverlap(aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined): boolean {
  return aFrom <= (bTo ?? "9999-12-31") && bFrom <= (aTo ?? "9999-12-31");
}

/** As-of containment for effective-dated rows: from <= asOf <= (to ?? infinity). */
export function windowCovers(effectiveFrom: string, effectiveTo: string | undefined, asOf: string): boolean {
  return effectiveFrom <= asOf && asOf <= (effectiveTo ?? "9999-12-31");
}

export interface PayRuleRepository {
  countComponents(): number;
  saveComponent(component: PayComponent): void;
  findComponentByCode(scope: TenantScope, componentCode: string): PayComponent | undefined;
  findComponentById(scope: TenantScope, componentId: string): PayComponent | undefined;
  listComponents(scope: TenantScope): PayComponent[];
  countRules(): number;
  saveRule(rule: PayRule): void;
  listRulesForComponent(scope: TenantScope, payComponentId: string): PayRule[];
  countRateRows(): number;
  /** Overlap-guarded insert: rejects with ERR-G10-RATE-OVERLAP when an existing row on the same key overlaps the new window. */
  insertRateRow(row: RateTableRow): void;
  findRateRowById(scope: TenantScope, rateTableId: string): RateTableRow | undefined;
  listRateRows(scope: TenantScope, tableType: RateTableType): RateTableRow[];
}

/** In-memory PayRuleRepository (injectable for unit tests; same seam as PgPayRuleRepository). */
export class InMemoryPayRuleRepository implements PayRuleRepository {
  private readonly components: PayComponent[] = [];
  private readonly rules: PayRule[] = [];
  private readonly rateRows: RateTableRow[] = [];

  countComponents(): number {
    return this.components.length;
  }

  saveComponent(component: PayComponent): void {
    const index = this.components.findIndex((item) => item.id === component.id);
    if (index < 0) {
      this.components.push(component);
      return;
    }
    this.components[index] = component;
  }

  findComponentByCode(scope: TenantScope, componentCode: string): PayComponent | undefined {
    return this.listComponents(scope).find((item) => item.componentCode === componentCode);
  }

  findComponentById(scope: TenantScope, componentId: string): PayComponent | undefined {
    return this.listComponents(scope).find((item) => item.id === componentId);
  }

  listComponents(scope: TenantScope): PayComponent[] {
    return this.components.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || !item.entityId || item.entityId === scope.entityId));
  }

  countRules(): number {
    return this.rules.length;
  }

  saveRule(rule: PayRule): void {
    const index = this.rules.findIndex((item) => item.id === rule.id);
    if (index < 0) {
      this.rules.push(rule);
      return;
    }
    this.rules[index] = rule;
  }

  listRulesForComponent(scope: TenantScope, payComponentId: string): PayRule[] {
    return this.rules.filter(
      (item) =>
        item.payComponentId === payComponentId &&
        item.tenantId === scope.tenantId &&
        (!scope.entityId || !item.entityId || item.entityId === scope.entityId)
    );
  }

  countRateRows(): number {
    return this.rateRows.length;
  }

  insertRateRow(row: RateTableRow): void {
    const key = rateOverlapKey(row);
    const clash = this.rateRows.find(
      (item) => rateOverlapKey(item) === key && windowsOverlap(item.effectiveFrom, item.effectiveTo, row.effectiveFrom, row.effectiveTo)
    );
    if (clash) {
      throw new FoundationError("ERR-G10-RATE-OVERLAP", "Overlapping effective rate rows for the same rate-table key", {
        field: "effectiveFrom",
        details: { validation: "VAL-G10-RATE-NONOVERLAP", conflictingRateTableId: clash.id, tableType: row.tableType },
      });
    }
    this.rateRows.push(row);
  }

  findRateRowById(scope: TenantScope, rateTableId: string): RateTableRow | undefined {
    return this.rateRows.find(
      (item) => item.id === rateTableId && item.tenantId === scope.tenantId && (!scope.entityId || !item.entityId || item.entityId === scope.entityId)
    );
  }

  listRateRows(scope: TenantScope, tableType: RateTableType): RateTableRow[] {
    return this.rateRows.filter(
      (item) =>
        item.tableType === tableType &&
        item.tenantId === scope.tenantId &&
        (!scope.entityId || !item.entityId || item.entityId === scope.entityId)
    );
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G10 DDL (docs/data-model/10-*.sql; migration
// apps/api/db/migrations/0014_g10_g11_rule_substrate.sql). All SQL is parameterised
// ($1, $2, ...); the overlap guard SELECT and the INSERT run in ONE transaction. Money
// columns are NUMERIC(15,2); cents conversion happens in SQL ((col * 100)::bigint), never
// through parseFloat/toFixed.
// ---------------------------------------------------------------------------------------

const INSERT_PAY_COMPONENT =
  "INSERT INTO g10_pay_components (tenant_id, entity_id, component_code, name, category, calc_method, is_taxable, is_statutory, display_order, dsl_grammar_version, status, effective_from) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) " +
  "RETURNING id, tenant_id, entity_id, component_code, name, category, calc_method, is_taxable, is_statutory, display_order, dsl_grammar_version, status, effective_from, effective_to";

const SELECT_PAY_COMPONENT_BY_CODE =
  "SELECT id, tenant_id, entity_id, component_code, name, category, calc_method, is_taxable, is_statutory, display_order, dsl_grammar_version, status, effective_from, effective_to " +
  "FROM g10_pay_components WHERE tenant_id = $1 AND component_code = $2 AND is_deleted = false";

const INSERT_PAY_RULE =
  "INSERT INTO g10_pay_rules (tenant_id, entity_id, pay_component_id, version, calc_method, formula_expression, rate_table_id, computation_order, rounding_rule, dsl_grammar_version, effective_from, effective_to, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) " +
  "RETURNING id, tenant_id, entity_id, pay_component_id, version, calc_method, formula_expression, rate_table_id, computation_order, rounding_rule, dsl_grammar_version, effective_from, effective_to, status";

const SELECT_RATE_OVERLAPS_FOR_UPDATE =
  "SELECT id FROM g10_rate_tables " +
  "WHERE tenant_id = $1 AND COALESCE(entity_id::text, '') = COALESCE($2, '') AND table_type = $3 " +
  "AND COALESCE(state, '') = COALESCE($4, '') AND COALESCE(city_class, '') = COALESCE($5, '') " +
  "AND COALESCE(regime::text, '') = COALESCE($6, '') AND COALESCE(financial_year, '') = COALESCE($7, '') " +
  "AND COALESCE(key_code, '') = COALESCE($8, '') AND COALESCE(slab_min, -1) = COALESCE($9::numeric / 100, -1) " +
  "AND is_deleted = false AND effective_from <= COALESCE($11::date, DATE '9999-12-31') " +
  "AND COALESCE(effective_to, DATE '9999-12-31') >= $10::date FOR UPDATE";

const INSERT_RATE_ROW =
  "INSERT INTO g10_rate_tables (tenant_id, entity_id, table_type, state, city_class, regime, financial_year, key_code, slab_min, slab_max, rate_pct, flat_amount, effective_from, effective_to) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric / 100, $10::numeric / 100, $11::numeric / 100, $12::numeric / 100, $13, $14) " +
  "RETURNING id, tenant_id, entity_id, table_type, state, city_class, regime, financial_year, key_code, " +
  "(slab_min * 100)::bigint AS slab_min_cents, (slab_max * 100)::bigint AS slab_max_cents, " +
  "(rate_pct * 100)::bigint AS rate_pct_bps, (flat_amount * 100)::bigint AS flat_amount_cents, effective_from, effective_to, is_active";

const SELECT_RATE_ROWS =
  "SELECT id, tenant_id, entity_id, table_type, state, city_class, regime, financial_year, key_code, " +
  "(slab_min * 100)::bigint AS slab_min_cents, (slab_max * 100)::bigint AS slab_max_cents, " +
  "(rate_pct * 100)::bigint AS rate_pct_bps, (flat_amount * 100)::bigint AS flat_amount_cents, effective_from, effective_to, is_active " +
  "FROM g10_rate_tables WHERE tenant_id = $1 AND table_type = $2 AND is_deleted = false ORDER BY effective_from";

export interface RateTableRowPg {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  table_type: RateTableType;
  state: string | null;
  city_class: string | null;
  regime: TaxRegime | null;
  financial_year: string | null;
  key_code: string | null;
  slab_min_cents: string | null;
  slab_max_cents: string | null;
  rate_pct_bps: string | null;
  flat_amount_cents: string | null;
  effective_from: Date;
  effective_to: Date | null;
  is_active: boolean;
}

/** Postgres-backed G10 rule-substrate repository (g10_pay_components / g10_pay_rules / g10_rate_tables). */
export class PgPayRuleRepository {
  constructor(private readonly pool: Pool) {}

  async insertComponent(input: {
    tenantId: string;
    entityId?: string;
    componentCode: string;
    name: string;
    category: PayComponentCategory;
    calcMethod: PayCalcMethod;
    isTaxable: boolean;
    isStatutory: boolean;
    displayOrder: number;
    dslGrammarVersion?: string;
    status: PayRuleStatus;
    effectiveFrom?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_PAY_COMPONENT, [
      input.tenantId,
      input.entityId ?? null,
      input.componentCode,
      input.name,
      input.category,
      input.calcMethod,
      input.isTaxable,
      input.isStatutory,
      input.displayOrder,
      input.dslGrammarVersion ?? null,
      input.status,
      input.effectiveFrom ?? null,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  async findComponentByCode(tenantId: string, componentCode: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(SELECT_PAY_COMPONENT_BY_CODE, [tenantId, componentCode]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  async insertRule(input: {
    tenantId: string;
    entityId?: string;
    payComponentId: string;
    version: number;
    calcMethod: PayCalcMethod;
    formulaExpression?: string;
    rateTableId?: string;
    computationOrder: number;
    roundingRule?: string;
    dslGrammarVersion?: string;
    effectiveFrom: string;
    effectiveTo?: string;
    status: PayRuleStatus;
  }): Promise<Record<string, unknown>> {
    const result = await this.pool.query(INSERT_PAY_RULE, [
      input.tenantId,
      input.entityId ?? null,
      input.payComponentId,
      input.version,
      input.calcMethod,
      input.formulaExpression ?? null,
      input.rateTableId ?? null,
      input.computationOrder,
      input.roundingRule ?? null,
      input.dslGrammarVersion ?? null,
      input.effectiveFrom,
      input.effectiveTo ?? null,
      input.status,
    ]);
    return result.rows[0] as Record<string, unknown>;
  }

  /**
   * VAL-G10-RATE-NONOVERLAP: the overlap probe (FOR UPDATE) and the INSERT commit in ONE
   * transaction; a clash on the same key raises ERR-G10-RATE-OVERLAP, never a silent write.
   * Money arrives as integer cents ($9/$10/$12) and integer bps ($11); SQL descal es to NUMERIC.
   */
  async insertRateRow(input: {
    tenantId: string;
    entityId?: string;
    tableType: RateTableType;
    state?: string;
    cityClass?: string;
    regime?: TaxRegime;
    financialYear?: string;
    keyCode?: string;
    slabMinCents?: number;
    slabMaxCents?: number;
    ratePctBps?: number;
    flatAmountCents?: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }): Promise<RateTableRowPg> {
    return withTransaction(this.pool, async (client) => {
      const overlap = await client.query(SELECT_RATE_OVERLAPS_FOR_UPDATE, [
        input.tenantId,
        input.entityId ?? null,
        input.tableType,
        input.state ?? null,
        input.cityClass ?? null,
        input.regime ?? null,
        input.financialYear ?? null,
        input.keyCode ?? null,
        input.slabMinCents ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ]);
      if ((overlap.rowCount ?? 0) > 0) {
        throw new FoundationError("ERR-G10-RATE-OVERLAP", "Overlapping effective rate rows for the same rate-table key", {
          field: "effectiveFrom",
          details: { validation: "VAL-G10-RATE-NONOVERLAP", conflictingRateTableId: (overlap.rows[0] as { id: string }).id },
        });
      }
      const result = await client.query(INSERT_RATE_ROW, [
        input.tenantId,
        input.entityId ?? null,
        input.tableType,
        input.state ?? null,
        input.cityClass ?? null,
        input.regime ?? null,
        input.financialYear ?? null,
        input.keyCode ?? null,
        input.slabMinCents ?? null,
        input.slabMaxCents ?? null,
        input.ratePctBps ?? null,
        input.flatAmountCents ?? null,
        input.effectiveFrom,
        input.effectiveTo ?? null,
      ]);
      return result.rows[0] as RateTableRowPg;
    });
  }

  async listRateRows(tenantId: string, tableType: RateTableType): Promise<RateTableRowPg[]> {
    const result = await this.pool.query(SELECT_RATE_ROWS, [tenantId, tableType]);
    return result.rows as RateTableRowPg[];
  }
}
