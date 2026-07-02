import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import {
  G11MoneyRounding,
  G11RuleAppliesTo,
  PenCommutationFactor,
  PenDaReliefRate,
  PenFamilyPensionRate,
  PenGratuityCeiling,
  PenPensionLimitRule,
  PenRetirementAgeRule,
  PenRoundingRule,
  PensionRuleRepository,
  PensionRuleTable,
  effectiveRowsAsOf,
} from "./pensionRuleRepository";

/**
 * PH-09A — BRD G11 FR-19: the E30-E36 rule tables CONSUMED by effective-date resolution.
 * Resolution shares G10 semantics (exactly one covering row, fail closed): an off-window
 * lookup raises ERR-G11-RULE-NOT-EFFECTIVE (422, FR-19 AC5); a commutation-factor lookup
 * whose age-next-birthday key has no row raises ERR-G11-FACTOR-NOT-FOUND (422, FR-06).
 * Money is integer cents; rates are integer basis points; factors are integers x 10^4.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PensionRuleService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repository: PensionRuleRepository
  ) {}

  /** E30 pen_da_relief_rates. */
  addDaReliefRate(
    actor: ActorContext,
    input: {
      ruleCode: string;
      appliesTo?: G11RuleAppliesTo;
      daPercentBps: number;
      payCommissionBasis?: string;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PenDaReliefRate {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    this.assertIntegers({ daPercentBps: input.daPercentBps });
    const row: PenDaReliefRate = {
      ...this.baseRow(actor, "pen_da_relief_rates", input),
      appliesTo: input.appliesTo ?? "PENSIONER",
      daPercentBps: input.daPercentBps,
      payCommissionBasis: input.payCommissionBasis,
    };
    this.repository.insertDaReliefRate(row);
    this.recordRuleAudit(actor, "pen_da_relief_rates", row.id, row.ruleCode);
    return { ...row };
  }

  /** E31 pen_commutation_factors — keyed by age next birthday. */
  addCommutationFactor(
    actor: ActorContext,
    input: { ruleCode: string; ageNextBirthday: number; factorTenThousandths: number; effectiveFrom: string; effectiveTo?: string }
  ): PenCommutationFactor {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    this.assertIntegers({ factorTenThousandths: input.factorTenThousandths });
    if (!Number.isInteger(input.ageNextBirthday) || input.ageNextBirthday < 17 || input.ageNextBirthday > 100) {
      throw new FoundationError("VALIDATION_FAILED", "ageNextBirthday must be an integer between 17 and 100", { field: "ageNextBirthday" });
    }
    const row: PenCommutationFactor = {
      ...this.baseRow(actor, "pen_commutation_factors", input),
      ageNextBirthday: input.ageNextBirthday,
      factorTenThousandths: input.factorTenThousandths,
    };
    this.repository.insertCommutationFactor(row);
    this.recordRuleAudit(actor, "pen_commutation_factors", row.id, row.ruleCode);
    return { ...row };
  }

  /** E32 pen_family_pension_rates. */
  addFamilyPensionRate(
    actor: ActorContext,
    input: {
      ruleCode: string;
      normalRateBps: number;
      enhancedRateBps?: number;
      enhancedInServiceYears?: number;
      enhancedAfterRetireYears?: number;
      enhancedAfterRetireAgeCap?: number;
      dualFpCapCents?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PenFamilyPensionRate {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    this.assertIntegers({
      normalRateBps: input.normalRateBps,
      enhancedRateBps: input.enhancedRateBps,
      dualFpCapCents: input.dualFpCapCents,
    });
    const row: PenFamilyPensionRate = {
      ...this.baseRow(actor, "pen_family_pension_rates", input),
      normalRateBps: input.normalRateBps,
      enhancedRateBps: input.enhancedRateBps,
      enhancedInServiceYears: input.enhancedInServiceYears ?? 10,
      enhancedAfterRetireYears: input.enhancedAfterRetireYears ?? 7,
      enhancedAfterRetireAgeCap: input.enhancedAfterRetireAgeCap ?? 67,
      dualFpCapCents: input.dualFpCapCents,
    };
    this.repository.insertFamilyPensionRate(row);
    this.recordRuleAudit(actor, "pen_family_pension_rates", row.id, row.ruleCode);
    return { ...row };
  }

  /** E33 pen_gratuity_ceilings. */
  addGratuityCeiling(
    actor: ActorContext,
    input: {
      ruleCode: string;
      baseCeilingCents: number;
      daThresholdBps?: number;
      autoStepBps?: number;
      currentEffectiveCeilingCents?: number;
      daRateRef?: string;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PenGratuityCeiling {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    this.assertIntegers({ baseCeilingCents: input.baseCeilingCents, currentEffectiveCeilingCents: input.currentEffectiveCeilingCents });
    const row: PenGratuityCeiling = {
      ...this.baseRow(actor, "pen_gratuity_ceilings", input),
      baseCeilingCents: input.baseCeilingCents,
      daThresholdBps: input.daThresholdBps ?? 5000,
      autoStepBps: input.autoStepBps ?? 2500,
      currentEffectiveCeilingCents: input.currentEffectiveCeilingCents ?? input.baseCeilingCents,
      daRateRef: input.daRateRef,
    };
    this.repository.insertGratuityCeiling(row);
    this.recordRuleAudit(actor, "pen_gratuity_ceilings", row.id, row.ruleCode);
    return { ...row };
  }

  /** E34 pen_retirement_age_rules. */
  addRetirementAgeRule(
    actor: ActorContext,
    input: { ruleCode: string; cadre?: string; category?: string; superannuationAge: number; effectiveFrom: string; effectiveTo?: string }
  ): PenRetirementAgeRule {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    if (!Number.isInteger(input.superannuationAge) || input.superannuationAge < 50 || input.superannuationAge > 75) {
      throw new FoundationError("VALIDATION_FAILED", "superannuationAge must be an integer between 50 and 75", { field: "superannuationAge" });
    }
    const row: PenRetirementAgeRule = {
      ...this.baseRow(actor, "pen_retirement_age_rules", input),
      cadre: input.cadre,
      category: input.category,
      superannuationAge: input.superannuationAge,
    };
    this.repository.insertRetirementAgeRule(row);
    this.recordRuleAudit(actor, "pen_retirement_age_rules", row.id, row.ruleCode);
    return { ...row };
  }

  /** E35 pen_pension_limit_rules. */
  addPensionLimitRule(
    actor: ActorContext,
    input: {
      ruleCode: string;
      minPensionCents: number;
      maxPensionCents: number;
      minQualifyingYearsForPension?: number;
      minQualifyingYearsForFull?: number;
      upsMinGuaranteeCents?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PenPensionLimitRule {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    this.assertIntegers({
      minPensionCents: input.minPensionCents,
      maxPensionCents: input.maxPensionCents,
      upsMinGuaranteeCents: input.upsMinGuaranteeCents,
    });
    if (input.maxPensionCents < input.minPensionCents) {
      throw new FoundationError("VALIDATION_FAILED", "maxPensionCents must be >= minPensionCents", { field: "maxPensionCents" });
    }
    const row: PenPensionLimitRule = {
      ...this.baseRow(actor, "pen_pension_limit_rules", input),
      minPensionCents: input.minPensionCents,
      maxPensionCents: input.maxPensionCents,
      minQualifyingYearsForPension: input.minQualifyingYearsForPension ?? 10,
      minQualifyingYearsForFull: input.minQualifyingYearsForFull ?? 10,
      upsMinGuaranteeCents: input.upsMinGuaranteeCents,
    };
    this.repository.insertPensionLimitRule(row);
    this.recordRuleAudit(actor, "pen_pension_limit_rules", row.id, row.ruleCode);
    return { ...row };
  }

  /** E36 pen_rounding_rules. */
  addRoundingRule(
    actor: ActorContext,
    input: {
      ruleCode: string;
      halfYearThresholdMonths?: number;
      moneyRounding?: G11MoneyRounding;
      qualifyingServiceCapHalfYears?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PenRoundingRule {
    this.assertWrite(actor, input.effectiveFrom, input.effectiveTo);
    const row: PenRoundingRule = {
      ...this.baseRow(actor, "pen_rounding_rules", input),
      halfYearThresholdMonths: input.halfYearThresholdMonths ?? 3,
      moneyRounding: input.moneyRounding ?? "NEXT_HIGHER_RUPEE",
      qualifyingServiceCapHalfYears: input.qualifyingServiceCapHalfYears ?? 66,
    };
    this.repository.insertRoundingRule(row);
    this.recordRuleAudit(actor, "pen_rounding_rules", row.id, row.ruleCode);
    return { ...row };
  }

  /** E30 as-of resolution — off-window lookup fails closed (ERR-G11-RULE-NOT-EFFECTIVE). */
  resolveDaReliefRate(scope: TenantScope, asOf: string, appliesTo: G11RuleAppliesTo = "PENSIONER"): PenDaReliefRate {
    const rows = this.repository.listDaReliefRates(this.readScope(scope, asOf)).filter((row) => row.appliesTo === appliesTo || row.appliesTo === "BOTH");
    return this.exactlyOne(effectiveRowsAsOf(rows, asOf), "pen_da_relief_rates", asOf);
  }

  /**
   * E31 as-of + age-keyed lookup (BRD FR-06): a missing age-next-birthday row fails with
   * ERR-G11-FACTOR-NOT-FOUND; rows for the age exist but none effective as-of the date ->
   * ERR-G11-RULE-NOT-EFFECTIVE. Never falls back to an adjacent age or "latest" row.
   */
  resolveCommutationFactor(scope: TenantScope, asOf: string, ageNextBirthday: number): PenCommutationFactor {
    const forAge = this.repository.listCommutationFactors(this.readScope(scope, asOf)).filter((row) => row.ageNextBirthday === ageNextBirthday);
    if (forAge.length === 0) {
      throw new FoundationError("ERR-G11-FACTOR-NOT-FOUND", `No commutation factor for age next birthday ${ageNextBirthday}`, {
        field: "ageNextBirthday",
        details: { table: "pen_commutation_factors", ageNextBirthday },
      });
    }
    return this.exactlyOne(effectiveRowsAsOf(forAge, asOf), "pen_commutation_factors", asOf);
  }

  /** E32 as-of resolution. */
  resolveFamilyPensionRate(scope: TenantScope, asOf: string): PenFamilyPensionRate {
    return this.exactlyOne(effectiveRowsAsOf(this.repository.listFamilyPensionRates(this.readScope(scope, asOf)), asOf), "pen_family_pension_rates", asOf);
  }

  /** E33 as-of resolution. */
  resolveGratuityCeiling(scope: TenantScope, asOf: string): PenGratuityCeiling {
    return this.exactlyOne(effectiveRowsAsOf(this.repository.listGratuityCeilings(this.readScope(scope, asOf)), asOf), "pen_gratuity_ceilings", asOf);
  }

  /** E34 as-of resolution by cadre/category scope (undefined dims match rule rows without that dim). */
  resolveRetirementAge(scope: TenantScope, asOf: string, query: { cadre?: string; category?: string } = {}): PenRetirementAgeRule {
    const rows = this.repository
      .listRetirementAgeRules(this.readScope(scope, asOf))
      .filter((row) => (row.cadre ?? undefined) === query.cadre && (row.category ?? undefined) === query.category);
    return this.exactlyOne(effectiveRowsAsOf(rows, asOf), "pen_retirement_age_rules", asOf);
  }

  /** E35 as-of resolution. */
  resolvePensionLimits(scope: TenantScope, asOf: string): PenPensionLimitRule {
    return this.exactlyOne(effectiveRowsAsOf(this.repository.listPensionLimitRules(this.readScope(scope, asOf)), asOf), "pen_pension_limit_rules", asOf);
  }

  /** E36 as-of resolution. */
  resolveRoundingRule(scope: TenantScope, asOf: string): PenRoundingRule {
    return this.exactlyOne(effectiveRowsAsOf(this.repository.listRoundingRules(this.readScope(scope, asOf)), asOf), "pen_rounding_rules", asOf);
  }

  private baseRow(
    actor: ActorContext,
    table: PensionRuleTable,
    input: { ruleCode: string; effectiveFrom: string; effectiveTo?: string }
  ): {
    id: string;
    tenantId: string;
    entityId?: string;
    ruleCode: string;
    effectiveFrom: string;
    effectiveTo?: string;
    versionNo: number;
    status: "EFFECTIVE";
  } {
    return {
      id: nextId(table.replace(/_/g, "-"), this.repository.countRows(table)),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      ruleCode: input.ruleCode,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      versionNo: this.repository.countRows(table) + 1,
      status: "EFFECTIVE",
    };
  }

  private exactlyOne<T>(covering: T[], table: PensionRuleTable, asOf: string): T {
    const resolved = covering[0];
    if (!resolved) {
      // FR-19 AC5: missing/inactive rule row for the required date fails closed.
      throw new FoundationError("ERR-G11-RULE-NOT-EFFECTIVE", `No EFFECTIVE ${table} row as of ${asOf}`, {
        field: "asOf",
        details: { table, asOf },
      });
    }
    if (covering.length > 1) {
      throw new FoundationError("CONFLICT", `Multiple EFFECTIVE ${table} rows cover ${asOf}`, {
        field: "asOf",
        details: { table, asOf },
      });
    }
    return { ...resolved };
  }

  private readScope(scope: TenantScope, asOf: string): TenantScope {
    requireTenantScope(scope);
    if (!ISO_DATE.test(asOf)) {
      throw new FoundationError("VALIDATION_FAILED", "asOf must be an ISO date (YYYY-MM-DD)", { field: "asOf" });
    }
    return scope;
  }

  private assertWrite(actor: ActorContext, effectiveFrom: string, effectiveTo: string | undefined): void {
    this.authorization.check(actor, "g11.rules.write", actor);
    if (!ISO_DATE.test(effectiveFrom)) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveFrom must be an ISO date (YYYY-MM-DD)", { field: "effectiveFrom" });
    }
    if (effectiveTo !== undefined && !ISO_DATE.test(effectiveTo)) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveTo must be an ISO date (YYYY-MM-DD)", { field: "effectiveTo" });
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveTo must be on or after effectiveFrom", { field: "effectiveTo" });
    }
  }

  private assertIntegers(values: Record<string, number | undefined>): void {
    for (const [field, value] of Object.entries(values)) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be an integer (cents/bps/x10^4)`, { field });
      }
    }
  }

  private recordRuleAudit(actor: ActorContext, table: PensionRuleTable, rowId: string, ruleCode: string): void {
    this.audit.recordMutation(actor, {
      action: "G11_RULE_ROW_ADDED",
      subjectRef: `${table}:${rowId}`,
      metadata: { table, ruleCode },
    });
  }
}
