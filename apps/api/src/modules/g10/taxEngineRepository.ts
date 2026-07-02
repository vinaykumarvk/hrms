import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { TenantScope } from "../../platform/types";
import { TaxRegime } from "./payRuleRepository";

/**
 * PH-15A — G10 income-tax/TDS engine persistence (BRD G10 FR-07/FR-17/FR-19):
 * E15 tax_declarations (per-employee per-FY declaration with the FULL persisted pipeline —
 * gross taxable -> standard_deduction -> Chapter VI-A caps -> slab tax -> surcharge with
 * marginal_relief -> cess -> rebate_87a -> 89(1)/Form-10E relief -> projected_annual_tax ->
 * monthly TDS spread, FR-07 AC5), and E29 statutory_remittances (deducted -> deposited ->
 * matched liability tracker; Form-16 Part A derives ONLY from MATCHED rows, FR-17 BR4).
 * Physical tables per docs/data-model/10-G10-payroll-benefits.sql: g10_tax_declarations /
 * g10_statutory_remittances (migration 0022). All money is integer paise; no float parsing
 * and no string rounding anywhere. Slab/cap/rate values are effective-dated g10_rate_tables
 * rows (TAX_SLAB, migration 0014) — never constants in engine logic.
 */

export type TaxDeclarationStatus = "DRAFT" | "SUBMITTED" | "PARTIALLY_VERIFIED" | "VERIFIED" | "LOCKED";
export type RemittanceScheme = "TDS" | "PT" | "GPF" | "CPF" | "NPS" | "PENSION" | "INSURANCE";
export type RemittanceStatus = "ACCRUED" | "SCHEDULED" | "DEPOSITED" | "MATCHED" | "OVERDUE" | "SHORT_PAID";

/** Form-12B previous-employer income capture (FR-07 AC6; jsonb on tax_declarations). */
export interface PreviousEmployerIncome {
  incomePaise: number;
  tdsPaise: number;
  employerTan?: string;
}

/** Form-10E / section 89(1) relief working (FR-07 AC7; jsonb on tax_declarations). */
export interface Relief891 {
  reliefPaise: number;
  form10eRef?: string;
}

/** E15 tax_declarations row — declared inputs plus EVERY persisted pipeline stage (FR-07 AC5). */
export interface TaxDeclaration {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  financialYear: string;
  regime: TaxRegime;
  // Declared inputs (Chapter VI-A and exemptions; clamped to rate-table caps on compute).
  declared80cPaise: number;
  declared80dPaise: number;
  hraExemptionPaise: number;
  homeLoanInterestPaise: number;
  previousEmployerIncome?: PreviousEmployerIncome;
  relief891?: Relief891;
  /** Σ ACTIVE perquisites for the FY (§5.6-17; FR-07 BR5 adds it before slab tax). */
  perquisiteTotalPaise: number;
  // Persisted pipeline stages (FR-07 AC5) — recomputed as a whole on every mutation.
  grossTaxablePaise: number;
  standardDeductionPaise: number;
  chapterViaTotalPaise: number;
  taxableIncomePaise: number;
  slabTaxPaise: number;
  surchargePaise: number;
  marginalReliefPaise: number;
  cessPaise: number;
  rebate87aPaise: number;
  relief891Paise: number;
  projectedAnnualTaxPaise: number;
  /** FR-07 BR2: (projected annual tax − ledger YTD TDS) / remaining months. */
  monthlyTdsPaise: number;
  /** FY proof cutoff (FR-07 AC3): mutation after this date throws ERR-G10-SNAPSHOT-FROZEN. */
  proofCutoffDate?: string;
  status: TaxDeclarationStatus;
}

/** E29 statutory_remittances row (deducted -> deposited -> matched; FR-19, FR-17 BR4). */
export interface StatutoryRemittance {
  id: string;
  tenantId: string;
  entityId?: string;
  remittanceNo: string;
  scheme: RemittanceScheme;
  state?: string;
  /** YYYY-MM payroll period the liability accrued for. */
  period: string;
  financialYear: string;
  /** Employee share — derived Σ payslip_lines for the scheme/period (FR-19 AC1). */
  deductedTotalPaise: number;
  employerTotalPaise: number;
  remittableTotalPaise: number;
  statutoryDueDate: string;
  challanNo?: string;
  cin?: string;
  depositDate?: string;
  depositedAmountPaise?: number;
  toleranceVariancePaise?: number;
  status: RemittanceStatus;
  matchedBy?: string;
}

export interface TaxEngineRepository {
  countDeclarations(): number;
  saveDeclaration(declaration: TaxDeclaration): void;
  findDeclaration(scope: TenantScope, employeeId: string, financialYear: string): TaxDeclaration | undefined;
  findDeclarationById(scope: TenantScope, declarationId: string): TaxDeclaration | undefined;
  listDeclarations(scope: TenantScope): TaxDeclaration[];

  countRemittances(): number;
  saveRemittance(remittance: StatutoryRemittance): void;
  findRemittance(scope: TenantScope, remittanceId: string): StatutoryRemittance | undefined;
  listRemittances(scope: TenantScope, filter?: { scheme?: RemittanceScheme; financialYear?: string; period?: string }): StatutoryRemittance[];
}

function rowInScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
  return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
}

/** In-memory TaxEngineRepository (injectable for unit tests; same seam as PgTaxEngineRepository). */
export class InMemoryTaxEngineRepository implements TaxEngineRepository {
  private readonly declarations: TaxDeclaration[] = [];
  private readonly remittances: StatutoryRemittance[] = [];

  countDeclarations(): number {
    return this.declarations.length;
  }

  saveDeclaration(declaration: TaxDeclaration): void {
    const index = this.declarations.findIndex((item) => item.id === declaration.id);
    if (index < 0) {
      this.declarations.push(declaration);
      return;
    }
    this.declarations[index] = declaration;
  }

  findDeclaration(scope: TenantScope, employeeId: string, financialYear: string): TaxDeclaration | undefined {
    return this.listDeclarations(scope).find((item) => item.employeeId === employeeId && item.financialYear === financialYear);
  }

  findDeclarationById(scope: TenantScope, declarationId: string): TaxDeclaration | undefined {
    return this.listDeclarations(scope).find((item) => item.id === declarationId);
  }

  listDeclarations(scope: TenantScope): TaxDeclaration[] {
    return this.declarations.filter((item) => rowInScope(item, scope));
  }

  countRemittances(): number {
    return this.remittances.length;
  }

  saveRemittance(remittance: StatutoryRemittance): void {
    const index = this.remittances.findIndex((item) => item.id === remittance.id);
    if (index < 0) {
      this.remittances.push(remittance);
      return;
    }
    this.remittances[index] = remittance;
  }

  findRemittance(scope: TenantScope, remittanceId: string): StatutoryRemittance | undefined {
    return this.listRemittances(scope).find((item) => item.id === remittanceId);
  }

  listRemittances(scope: TenantScope, filter?: { scheme?: RemittanceScheme; financialYear?: string; period?: string }): StatutoryRemittance[] {
    return this.remittances.filter(
      (item) =>
        rowInScope(item, scope) &&
        (!filter?.scheme || item.scheme === filter.scheme) &&
        (!filter?.financialYear || item.financialYear === filter.financialYear) &&
        (!filter?.period || item.period === filter.period)
    );
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G10 DDL (docs/data-model/10-*.sql; migration
// apps/api/db/migrations/0022_g10_tax_tds_engine.sql): g10_tax_declarations (every pipeline
// stage persisted, FR-07 AC5) and g10_statutory_remittances (ACCRUED -> DEPOSITED ->
// MATCHED). All SQL is parameterised ($1, $2, ...); the declaration upsert persists the
// declared inputs AND the recomputed pipeline stages in ONE transaction so a regime switch
// can never leave a half-recomputed row. Money columns are NUMERIC(15,2)/NUMERIC(18,2);
// paise conversion happens in SQL (($n::numeric / 100) on write, (col * 100)::bigint on
// read) — never through float parsing.
// ---------------------------------------------------------------------------------------

const UPSERT_TAX_DECLARATION =
  "INSERT INTO g10_tax_declarations (tenant_id, entity_id, employee_id, financial_year, regime, " +
  "declared_80c, declared_80d, hra_exemption, home_loan_interest, previous_employer_income, relief_89_1, " +
  "gross_taxable, standard_deduction, chapter_via_total, taxable_income, slab_tax, surcharge, marginal_relief, " +
  "cess, rebate_87a, perquisite_total, projected_annual_tax, monthly_tds, proof_cutoff_date, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::numeric / 100, $7::numeric / 100, $8::numeric / 100, $9::numeric / 100, " +
  "$10::jsonb, $11::jsonb, $12::numeric / 100, $13::numeric / 100, $14::numeric / 100, $15::numeric / 100, " +
  "$16::numeric / 100, $17::numeric / 100, $18::numeric / 100, $19::numeric / 100, $20::numeric / 100, " +
  "$21::numeric / 100, $22::numeric / 100, $23::numeric / 100, $24, $25, $26) " +
  "ON CONFLICT (tenant_id, employee_id, financial_year) DO UPDATE SET regime = EXCLUDED.regime, " +
  "declared_80c = EXCLUDED.declared_80c, declared_80d = EXCLUDED.declared_80d, " +
  "hra_exemption = EXCLUDED.hra_exemption, home_loan_interest = EXCLUDED.home_loan_interest, " +
  "previous_employer_income = EXCLUDED.previous_employer_income, relief_89_1 = EXCLUDED.relief_89_1, " +
  "gross_taxable = EXCLUDED.gross_taxable, standard_deduction = EXCLUDED.standard_deduction, " +
  "chapter_via_total = EXCLUDED.chapter_via_total, taxable_income = EXCLUDED.taxable_income, " +
  "slab_tax = EXCLUDED.slab_tax, surcharge = EXCLUDED.surcharge, marginal_relief = EXCLUDED.marginal_relief, " +
  "cess = EXCLUDED.cess, rebate_87a = EXCLUDED.rebate_87a, perquisite_total = EXCLUDED.perquisite_total, " +
  "projected_annual_tax = EXCLUDED.projected_annual_tax, monthly_tds = EXCLUDED.monthly_tds, " +
  "proof_cutoff_date = EXCLUDED.proof_cutoff_date, status = EXCLUDED.status, updated_at = now() " +
  "RETURNING id";

const SELECT_TAX_DECLARATION =
  "SELECT id, employee_id, financial_year, regime, status, (gross_taxable * 100)::bigint AS gross_taxable_paise, " +
  "(standard_deduction * 100)::bigint AS standard_deduction_paise, (taxable_income * 100)::bigint AS taxable_income_paise, " +
  "(slab_tax * 100)::bigint AS slab_tax_paise, (surcharge * 100)::bigint AS surcharge_paise, " +
  "(marginal_relief * 100)::bigint AS marginal_relief_paise, (cess * 100)::bigint AS cess_paise, " +
  "(rebate_87a * 100)::bigint AS rebate_87a_paise, (projected_annual_tax * 100)::bigint AS projected_annual_tax_paise, " +
  "(monthly_tds * 100)::bigint AS monthly_tds_paise FROM g10_tax_declarations " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND financial_year = $3 AND is_deleted = false";

const INSERT_STATUTORY_REMITTANCE =
  "INSERT INTO g10_statutory_remittances (tenant_id, entity_id, remittance_no, scheme, state, period, " +
  "period_month, period_year, financial_year, deducted_total, employer_total, remittable_total, " +
  "statutory_due_date, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::numeric / 100, $11::numeric / 100, $12::numeric / 100, $13, $14, $15) " +
  "RETURNING id";

const CAPTURE_REMITTANCE_DEPOSIT =
  "UPDATE g10_statutory_remittances SET challan_no = $3, cin = $4, deposit_date = $5, " +
  "deposited_amount = $6::numeric / 100, status = 'DEPOSITED', updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status IN ('ACCRUED','SCHEDULED')";

const MATCH_REMITTANCE =
  // MATCHED only when the deposit ties within tolerance — enforced by the WHERE guard.
  "UPDATE g10_statutory_remittances SET status = 'MATCHED', matched_by = $3, " +
  "tolerance_variance = (deposited_amount - remittable_total), updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'DEPOSITED' " +
  "AND ABS(deposited_amount - remittable_total) <= ($4::numeric / 100)";

const SELECT_FY_TDS_REMITTANCES =
  "SELECT id, period, status, (deducted_total * 100)::bigint AS deducted_total_paise " +
  "FROM g10_statutory_remittances WHERE tenant_id = $1 AND scheme = 'TDS' AND financial_year = $2 AND is_deleted = false " +
  "ORDER BY period";

/** Postgres-backed G10 tax engine repository (g10_tax_declarations + g10_statutory_remittances). */
export class PgTaxEngineRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Upsert the declaration with EVERY recomputed pipeline stage in ONE transaction — a
   * regime switch (FR-07 AC1) replaces declared inputs and all persisted stages atomically.
   */
  async upsertDeclaration(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    financialYear: string;
    regime: TaxRegime;
    declared80cPaise: number;
    declared80dPaise: number;
    hraExemptionPaise: number;
    homeLoanInterestPaise: number;
    previousEmployerIncomeJson: string | null;
    relief891Json: string | null;
    grossTaxablePaise: number;
    standardDeductionPaise: number;
    chapterViaTotalPaise: number;
    taxableIncomePaise: number;
    slabTaxPaise: number;
    surchargePaise: number;
    marginalReliefPaise: number;
    cessPaise: number;
    rebate87aPaise: number;
    perquisiteTotalPaise: number;
    projectedAnnualTaxPaise: number;
    monthlyTdsPaise: number;
    proofCutoffDate: string | null;
    status: TaxDeclarationStatus;
    createdBy?: string;
  }): Promise<string> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(UPSERT_TAX_DECLARATION, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.financialYear,
        input.regime,
        input.declared80cPaise,
        input.declared80dPaise,
        input.hraExemptionPaise,
        input.homeLoanInterestPaise,
        input.previousEmployerIncomeJson,
        input.relief891Json,
        input.grossTaxablePaise,
        input.standardDeductionPaise,
        input.chapterViaTotalPaise,
        input.taxableIncomePaise,
        input.slabTaxPaise,
        input.surchargePaise,
        input.marginalReliefPaise,
        input.cessPaise,
        input.rebate87aPaise,
        input.perquisiteTotalPaise,
        input.projectedAnnualTaxPaise,
        input.monthlyTdsPaise,
        input.proofCutoffDate,
        input.status,
        input.createdBy ?? null,
      ]);
      return (result.rows[0] as { id: string }).id;
    });
  }

  async findDeclaration(tenantId: string, employeeId: string, financialYear: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(SELECT_TAX_DECLARATION, [tenantId, employeeId, financialYear]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  /** Accrue remittance rows for a cycle in ONE transaction (multi-scheme accrual is all-or-nothing). */
  async insertRemittanceAccruals(
    rows: {
      tenantId: string;
      entityId?: string;
      remittanceNo: string;
      scheme: RemittanceScheme;
      state?: string;
      period: string;
      financialYear: string;
      deductedTotalPaise: number;
      employerTotalPaise: number;
      statutoryDueDate: string;
      createdBy?: string;
    }[]
  ): Promise<string[]> {
    return withTransaction(this.pool, async (client) => {
      const ids: string[] = [];
      for (const row of rows) {
        const [yearText, monthText] = row.period.split("-");
        const result = await client.query(INSERT_STATUTORY_REMITTANCE, [
          row.tenantId,
          row.entityId ?? null,
          row.remittanceNo,
          row.scheme,
          row.state ?? null,
          row.period,
          Number(monthText),
          Number(yearText),
          row.financialYear,
          row.deductedTotalPaise,
          row.employerTotalPaise,
          row.deductedTotalPaise + row.employerTotalPaise,
          row.statutoryDueDate,
          "ACCRUED",
          row.createdBy ?? null,
        ]);
        ids.push((result.rows[0] as { id: string }).id);
      }
      return ids;
    });
  }

  /** Challan/CIN capture: ACCRUED/SCHEDULED -> DEPOSITED (FR-19 AC2). */
  async captureDeposit(input: {
    tenantId: string;
    remittanceId: string;
    challanNo: string;
    cin?: string;
    depositDate: string;
    depositedAmountPaise: number;
  }): Promise<number> {
    const result = await this.pool.query(CAPTURE_REMITTANCE_DEPOSIT, [
      input.tenantId,
      input.remittanceId,
      input.challanNo,
      input.cin ?? null,
      input.depositDate,
      input.depositedAmountPaise,
    ]);
    return result.rowCount ?? 0;
  }

  /** DEPOSITED -> MATCHED only when the deposit ties within tolerance (FR-19 AC2). */
  async matchDeposit(input: { tenantId: string; remittanceId: string; matchedBy: string; tolerancePaise: number }): Promise<number> {
    const result = await this.pool.query(MATCH_REMITTANCE, [input.tenantId, input.remittanceId, input.matchedBy, input.tolerancePaise]);
    return result.rowCount ?? 0;
  }

  /** FY TDS remittance rows — the Form-16 Part A source (MATCHED-only consumption, FR-17 BR4). */
  async listFyTdsRemittances(tenantId: string, financialYear: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(SELECT_FY_TDS_REMITTANCES, [tenantId, financialYear]);
    return result.rows as Record<string, unknown>[];
  }
}
