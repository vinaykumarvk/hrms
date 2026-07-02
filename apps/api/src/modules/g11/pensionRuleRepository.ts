import { FoundationError, TenantScope } from "../../platform/types";
import { windowCovers, windowsOverlap } from "../g10/payRuleRepository";

/**
 * PH-09A — BRD G11 FR-19 effective-dated rule tables E30-E36 (docs/data-model/
 * 11-G11-retirement-pension.sql; migration apps/api/db/migrations/0014):
 *   E30 pen_da_relief_rates       — Dearness Relief % by window
 *   E31 pen_commutation_factors   — factor keyed by AGE NEXT BIRTHDAY
 *   E32 pen_family_pension_rates  — normal/enhanced family-pension rates
 *   E33 pen_gratuity_ceilings     — DA-linked gratuity ceiling
 *   E34 pen_retirement_age_rules  — superannuation age by cadre/category
 *   E35 pen_pension_limit_rules   — min/max pension + qualifying-service floors
 *   E36 pen_rounding_rules        — half-year and money rounding policy
 * Rows are effective-dated (effective_from/effective_to) with NON-OVERLAPPING windows
 * per key (FR-19 AC1: overlap -> 409 CONFLICT). Money is integer cents; percentage
 * rates are integer basis points; commutation factors are integers scaled by 10^4.
 */

export type G11RuleStatus = "DRAFT" | "APPROVED" | "EFFECTIVE" | "SUPERSEDED";
export type G11RuleAppliesTo = "PENSIONER" | "EMPLOYEE" | "BOTH";
export type G11MoneyRounding = "NEXT_HIGHER_RUPEE" | "NEAREST_RUPEE";

interface PensionRuleRowBase {
  id: string;
  tenantId: string;
  entityId?: string;
  ruleCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
  versionNo: number;
  status: G11RuleStatus;
}

/** E30 pen_da_relief_rates row (da_percent as integer basis points). */
export interface PenDaReliefRate extends PensionRuleRowBase {
  appliesTo: G11RuleAppliesTo;
  daPercentBps: number;
  payCommissionBasis?: string;
}

/** E31 pen_commutation_factors row — lookup key is age_next_birthday (factor x 10^4). */
export interface PenCommutationFactor extends PensionRuleRowBase {
  ageNextBirthday: number;
  factorTenThousandths: number;
}

/** E32 pen_family_pension_rates row (rates as integer basis points; cap in cents). */
export interface PenFamilyPensionRate extends PensionRuleRowBase {
  normalRateBps: number;
  enhancedRateBps?: number;
  enhancedInServiceYears: number;
  enhancedAfterRetireYears: number;
  enhancedAfterRetireAgeCap: number;
  dualFpCapCents?: number;
}

/** E33 pen_gratuity_ceilings row (ceilings in integer cents; steps in basis points). */
export interface PenGratuityCeiling extends PensionRuleRowBase {
  baseCeilingCents: number;
  daThresholdBps: number;
  autoStepBps: number;
  currentEffectiveCeilingCents: number;
  daRateRef?: string;
}

/** E34 pen_retirement_age_rules row. */
export interface PenRetirementAgeRule extends PensionRuleRowBase {
  cadre?: string;
  category?: string;
  superannuationAge: number;
}

/** E35 pen_pension_limit_rules row (limits in integer cents). */
export interface PenPensionLimitRule extends PensionRuleRowBase {
  minPensionCents: number;
  maxPensionCents: number;
  minQualifyingYearsForPension: number;
  minQualifyingYearsForFull: number;
  upsMinGuaranteeCents?: number;
}

/** E36 pen_rounding_rules row. */
export interface PenRoundingRule extends PensionRuleRowBase {
  halfYearThresholdMonths: number;
  moneyRounding: G11MoneyRounding;
  qualifyingServiceCapHalfYears: number;
}

export type PensionRuleTable =
  | "pen_da_relief_rates"
  | "pen_commutation_factors"
  | "pen_family_pension_rates"
  | "pen_gratuity_ceilings"
  | "pen_retirement_age_rules"
  | "pen_pension_limit_rules"
  | "pen_rounding_rules";

export interface PensionRuleRepository {
  countRows(table: PensionRuleTable): number;
  /** Overlap-guarded insert per (ruleCode + table key): FR-19 AC1 -> 409 CONFLICT. */
  insertDaReliefRate(row: PenDaReliefRate): void;
  insertCommutationFactor(row: PenCommutationFactor): void;
  insertFamilyPensionRate(row: PenFamilyPensionRate): void;
  insertGratuityCeiling(row: PenGratuityCeiling): void;
  insertRetirementAgeRule(row: PenRetirementAgeRule): void;
  insertPensionLimitRule(row: PenPensionLimitRule): void;
  insertRoundingRule(row: PenRoundingRule): void;
  listDaReliefRates(scope: TenantScope): PenDaReliefRate[];
  listCommutationFactors(scope: TenantScope): PenCommutationFactor[];
  listFamilyPensionRates(scope: TenantScope): PenFamilyPensionRate[];
  listGratuityCeilings(scope: TenantScope): PenGratuityCeiling[];
  listRetirementAgeRules(scope: TenantScope): PenRetirementAgeRule[];
  listPensionLimitRules(scope: TenantScope): PenPensionLimitRule[];
  listRoundingRules(scope: TenantScope): PenRoundingRule[];
}

/** As-of helper shared by the G11 rule tables: EFFECTIVE rows whose window covers the date. */
export function effectiveRowsAsOf<T extends PensionRuleRowBase>(rows: T[], asOf: string): T[] {
  return rows.filter((row) => row.status === "EFFECTIVE" && windowCovers(row.effectiveFrom, row.effectiveTo, asOf));
}

/** In-memory PensionRuleRepository (injectable for unit tests; PH-06A repository seam). */
export class InMemoryPensionRuleRepository implements PensionRuleRepository {
  private readonly tables: Record<PensionRuleTable, PensionRuleRowBase[]> = {
    pen_da_relief_rates: [],
    pen_commutation_factors: [],
    pen_family_pension_rates: [],
    pen_gratuity_ceilings: [],
    pen_retirement_age_rules: [],
    pen_pension_limit_rules: [],
    pen_rounding_rules: [],
  };

  countRows(table: PensionRuleTable): number {
    return this.tables[table].length;
  }

  insertDaReliefRate(row: PenDaReliefRate): void {
    this.insertNonOverlapping("pen_da_relief_rates", row, (existing) => (existing as PenDaReliefRate).appliesTo === row.appliesTo);
  }

  insertCommutationFactor(row: PenCommutationFactor): void {
    this.insertNonOverlapping(
      "pen_commutation_factors",
      row,
      (existing) => (existing as PenCommutationFactor).ageNextBirthday === row.ageNextBirthday
    );
  }

  insertFamilyPensionRate(row: PenFamilyPensionRate): void {
    this.insertNonOverlapping("pen_family_pension_rates", row);
  }

  insertGratuityCeiling(row: PenGratuityCeiling): void {
    this.insertNonOverlapping("pen_gratuity_ceilings", row);
  }

  insertRetirementAgeRule(row: PenRetirementAgeRule): void {
    this.insertNonOverlapping(
      "pen_retirement_age_rules",
      row,
      (existing) => (existing as PenRetirementAgeRule).cadre === row.cadre && (existing as PenRetirementAgeRule).category === row.category
    );
  }

  insertPensionLimitRule(row: PenPensionLimitRule): void {
    this.insertNonOverlapping("pen_pension_limit_rules", row);
  }

  insertRoundingRule(row: PenRoundingRule): void {
    this.insertNonOverlapping("pen_rounding_rules", row);
  }

  listDaReliefRates(scope: TenantScope): PenDaReliefRate[] {
    return this.listInScope("pen_da_relief_rates", scope) as PenDaReliefRate[];
  }

  listCommutationFactors(scope: TenantScope): PenCommutationFactor[] {
    return this.listInScope("pen_commutation_factors", scope) as PenCommutationFactor[];
  }

  listFamilyPensionRates(scope: TenantScope): PenFamilyPensionRate[] {
    return this.listInScope("pen_family_pension_rates", scope) as PenFamilyPensionRate[];
  }

  listGratuityCeilings(scope: TenantScope): PenGratuityCeiling[] {
    return this.listInScope("pen_gratuity_ceilings", scope) as PenGratuityCeiling[];
  }

  listRetirementAgeRules(scope: TenantScope): PenRetirementAgeRule[] {
    return this.listInScope("pen_retirement_age_rules", scope) as PenRetirementAgeRule[];
  }

  listPensionLimitRules(scope: TenantScope): PenPensionLimitRule[] {
    return this.listInScope("pen_pension_limit_rules", scope) as PenPensionLimitRule[];
  }

  listRoundingRules(scope: TenantScope): PenRoundingRule[] {
    return this.listInScope("pen_rounding_rules", scope) as PenRoundingRule[];
  }

  private insertNonOverlapping(
    table: PensionRuleTable,
    row: PensionRuleRowBase,
    sameKey: (existing: PensionRuleRowBase) => boolean = () => true
  ): void {
    const clash = this.tables[table].find(
      (existing) =>
        existing.tenantId === row.tenantId &&
        (existing.entityId ?? "") === (row.entityId ?? "") &&
        existing.ruleCode === row.ruleCode &&
        sameKey(existing) &&
        windowsOverlap(existing.effectiveFrom, existing.effectiveTo, row.effectiveFrom, row.effectiveTo)
    );
    if (clash) {
      // FR-19 AC1/edge case: overlapping effective windows per key are rejected (409).
      throw new FoundationError("CONFLICT", `Overlapping effective windows for ${table} rule ${row.ruleCode}`, {
        field: "effectiveFrom",
        details: { table, ruleCode: row.ruleCode, conflictingRowId: clash.id },
      });
    }
    this.tables[table].push(row);
  }

  private listInScope(table: PensionRuleTable, scope: TenantScope): PensionRuleRowBase[] {
    return this.tables[table].filter(
      (row) => row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId)
    );
  }
}
