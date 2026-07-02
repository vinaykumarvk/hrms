import { FoundationError, TenantScope } from "../../platform/types";
import { PenPensionLimitRule, PenRoundingRule, G11MoneyRounding } from "./pensionRuleRepository";

/**
 * PH-09C — BRD G11 benefit records persisted per docs/data-model/11-G11-retirement-pension.sql
 * (migration apps/api/db/migrations/0016):
 *   E07 pen_pension_calculations        — scheme-branched pension outcome (FR-05)
 *   E08 pen_commutation_records         — factor-table commutation + restoration (FR-06)
 *   E09 pen_gratuity_calculations       — RETIREMENT/DEATH/SERVICE gratuity + E33 ceiling (FR-07)
 *   E10 pen_family_pension_records      — normal + ENHANCED-window family pension (FR-08)
 *   E41 pen_provisional_pension_records — Rule 9 provisional pension, DCRG withheld (FR-22)
 * Money is integer cents; rates are integer basis points; factors/slabs are integers x 10^4.
 * This file also hosts the PURE deterministic scheme-branch engine consumed by the services
 * (same placement convention as windowCovers in payRuleRepository).
 */

export type PensionSchemeCode = "OPS" | "NPS" | "UPS";
export type G11BenefitOutcome =
  | "FULL_PENSION"
  | "SERVICE_GRATUITY_ONLY"
  | "NPS_DEFAULT_FAMILY"
  | "NPS_DEFAULT_INVALID"
  | "UPS_ASSURED"
  | "NPS_INDICATIVE";
export type G11EmolumentsMethod = "LAST_DRAWN" | "AVG_10_MONTH" | "BENEFICIAL_OF_BOTH" | "AVG_12_MONTH";
export type G11CalcStatus = "DRAFT" | "COMPUTED" | "SANCTIONED" | "SUPERSEDED";
export type G11CommutationStatus = "DRAFT" | "COMPUTED" | "SANCTIONED" | "RESTORED" | "SUPERSEDED";
export type G11GratuityType = "RETIREMENT_GRATUITY" | "DEATH_GRATUITY" | "SERVICE_GRATUITY";
export type G11GratuityStatus = "DRAFT" | "COMPUTED" | "SANCTIONED" | "PAID" | "WITHHELD_PROCEEDINGS" | "SUPERSEDED";
export type G11EnhancedBasis = "IN_SERVICE" | "AFTER_RETIREMENT";
export type G11FamilyPensionStatus = "DRAFT" | "COMPUTED" | "SANCTIONED" | "ACTIVE" | "TRANSFERRED" | "CEASED" | "SUPERSEDED";
export type G11ProceedingsType = "DEPARTMENTAL" | "JUDICIAL";
export type G11ProvisionalOutcome = "EXONERATED" | "PENALTY_NO_RECOVERY" | "PENALTY_WITH_RECOVERY";
export type G11ProvisionalStatus = "ACTIVE" | "CONCLUDED_REGULARISED" | "CONCLUDED_RECOVERY";
export type NpsBenefitEvent = "SUPERANNUATION" | "DEATH_IN_SERVICE" | "INVALIDATION";

interface BenefitRowBase {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
}

/** E07 pen_pension_calculations row (all money integer cents; fraction integer bps). */
export interface PenPensionCalculation extends BenefitRowBase {
  scheme: PensionSchemeCode;
  benefitOutcome: G11BenefitOutcome;
  emolumentsBaseCents: number;
  emolumentsMethod: G11EmolumentsMethod;
  avgEmolumentsCents?: number;
  qualifyingHalfYears: number;
  pensionFractionBps: number;
  basicPensionCents: number;
  minimumPensionApplied: boolean;
  maximumPensionCapApplied: boolean;
  upsAssuredPayoutCents?: number;
  upsMinGuaranteeApplied: boolean;
  npsDefaultBenefitCents?: number;
  calcTrace: Record<string, unknown>;
  /** IR17: FK to the E35 pen_pension_limit_rules row EFFECTIVE on the relevant date. */
  ruleVersionRef: string;
  status: G11CalcStatus;
}

/** E08 pen_commutation_records row. */
export interface PenCommutationRecord extends BenefitRowBase {
  pensionCalcId: string;
  opted: boolean;
  commutedFractionBps: number;
  commutedPensionCents: number;
  ageNextBirthday: number;
  commutationFactorTenThousandths: number;
  /** FK to the E31 pen_commutation_factors row resolved by age-next-birthday (FR-06 AC2). */
  commutationFactorRef: string;
  commutedValueCents: number;
  residualPensionCents: number;
  reductionEffectiveDate: string;
  /** FR-06 AC3a: restoration_due_date = reduction_effective_date + 15 yrs (JOB-G11-RESTORE). */
  restorationDueDate: string;
  restored: boolean;
  status: G11CommutationStatus;
}

/** E09 pen_gratuity_calculations row. */
export interface PenGratuityCalculation extends BenefitRowBase {
  gratuityType: G11GratuityType;
  emolumentsBaseCents: number;
  qualifyingHalfYears: number;
  serviceSlabFactorTenThousandths?: number;
  serviceGratuityMonthsTenThousandths?: number;
  computedAmountCents: number;
  statutoryCeilingCents: number;
  /** FK to the E33 pen_gratuity_ceilings row used (FR-07 AC5 ceiling_ref). */
  ceilingRef: string;
  ceilingApplied: boolean;
  payableAmountCents: number;
  /** Rule 9 / no-dues withholding (FR-07 AC4, FR-22 AC2: DCRG fully withheld). */
  withheldAmountCents: number;
  calcTrace: Record<string, unknown>;
  ruleVersionRef: string;
  status: G11GratuityStatus;
}

/** E10 pen_family_pension_records row. */
export interface PenFamilyPensionRecord extends BenefitRowBase {
  employeeId: string;
  enhancedBasis: G11EnhancedBasis;
  emolumentsBaseCents: number;
  normalRateBps: number;
  enhancedRateBps?: number;
  normalAmountCents: number;
  enhancedAmountCents?: number;
  enhancedFrom?: string;
  enhancedTo?: string;
  /** FR-08 AC2a: which ENHANCED window rule was applied. */
  enhancedWindowRule: string;
  /** FK to the E32 pen_family_pension_rates row consumed. */
  fpRateRef: string;
  status: G11FamilyPensionStatus;
}

/** E41 pen_provisional_pension_records row (Rule 9). */
export interface PenProvisionalPensionRecord extends BenefitRowBase {
  /** Mandatory G09 proceedings reference (FR-22 AC4 linkage guard). */
  proceedingsRef: string;
  proceedingsType: G11ProceedingsType;
  provisionalPensionAmountCents: number;
  /** IR15: DCRG stays fully withheld until the proceeding concludes. */
  dcrgWithheld: boolean;
  dcrgWithheldAmountCents: number;
  commencedOn: string;
  proceedingsConcludedOn?: string;
  conclusionOutcome?: G11ProvisionalOutcome;
  finalRecoveryAmountCents?: number;
  status: G11ProvisionalStatus;
}

export interface PensionBenefitRepository {
  countPensionCalculations(): number;
  countCommutationRecords(): number;
  countGratuityCalculations(): number;
  countFamilyPensionRecords(): number;
  countProvisionalRecords(): number;
  insertPensionCalculation(row: PenPensionCalculation): void;
  insertCommutationRecord(row: PenCommutationRecord): void;
  insertGratuityCalculation(row: PenGratuityCalculation): void;
  insertFamilyPensionRecord(row: PenFamilyPensionRecord): void;
  insertProvisionalRecord(row: PenProvisionalPensionRecord): void;
  /** The current (non-SUPERSEDED) E07 row for a case, if any. */
  findCurrentPensionCalculation(scope: TenantScope, caseId: string): PenPensionCalculation | undefined;
  findGratuityCalculations(scope: TenantScope, caseId: string): PenGratuityCalculation[];
  findCommutationRecords(scope: TenantScope, caseId: string): PenCommutationRecord[];
  findFamilyPensionRecords(scope: TenantScope, caseId: string): PenFamilyPensionRecord[];
  findProvisionalRecords(scope: TenantScope, caseId: string): PenProvisionalPensionRecord[];
  findProvisionalById(scope: TenantScope, provisionalId: string): PenProvisionalPensionRecord | undefined;
  supersedePensionCalculations(scope: TenantScope, caseId: string): void;
  supersedeGratuityCalculations(scope: TenantScope, caseId: string, gratuityType: G11GratuityType): void;
}

/** In-memory PensionBenefitRepository (PH-06A repository seam; DDL mirror in migration 0016). */
export class InMemoryPensionBenefitRepository implements PensionBenefitRepository {
  private readonly pensionCalculations: PenPensionCalculation[] = [];
  private readonly commutationRecords: PenCommutationRecord[] = [];
  private readonly gratuityCalculations: PenGratuityCalculation[] = [];
  private readonly familyPensionRecords: PenFamilyPensionRecord[] = [];
  private readonly provisionalRecords: PenProvisionalPensionRecord[] = [];

  countPensionCalculations(): number {
    return this.pensionCalculations.length;
  }

  countCommutationRecords(): number {
    return this.commutationRecords.length;
  }

  countGratuityCalculations(): number {
    return this.gratuityCalculations.length;
  }

  countFamilyPensionRecords(): number {
    return this.familyPensionRecords.length;
  }

  countProvisionalRecords(): number {
    return this.provisionalRecords.length;
  }

  insertPensionCalculation(row: PenPensionCalculation): void {
    this.pensionCalculations.push(row);
  }

  insertCommutationRecord(row: PenCommutationRecord): void {
    this.commutationRecords.push(row);
  }

  insertGratuityCalculation(row: PenGratuityCalculation): void {
    this.gratuityCalculations.push(row);
  }

  insertFamilyPensionRecord(row: PenFamilyPensionRecord): void {
    this.familyPensionRecords.push(row);
  }

  insertProvisionalRecord(row: PenProvisionalPensionRecord): void {
    this.provisionalRecords.push(row);
  }

  findCurrentPensionCalculation(scope: TenantScope, caseId: string): PenPensionCalculation | undefined {
    return this.pensionCalculations.find((row) => this.inScope(row, scope) && row.caseId === caseId && row.status !== "SUPERSEDED");
  }

  findGratuityCalculations(scope: TenantScope, caseId: string): PenGratuityCalculation[] {
    return this.gratuityCalculations.filter((row) => this.inScope(row, scope) && row.caseId === caseId);
  }

  findCommutationRecords(scope: TenantScope, caseId: string): PenCommutationRecord[] {
    return this.commutationRecords.filter((row) => this.inScope(row, scope) && row.caseId === caseId);
  }

  findFamilyPensionRecords(scope: TenantScope, caseId: string): PenFamilyPensionRecord[] {
    return this.familyPensionRecords.filter((row) => this.inScope(row, scope) && row.caseId === caseId);
  }

  findProvisionalRecords(scope: TenantScope, caseId: string): PenProvisionalPensionRecord[] {
    return this.provisionalRecords.filter((row) => this.inScope(row, scope) && row.caseId === caseId);
  }

  findProvisionalById(scope: TenantScope, provisionalId: string): PenProvisionalPensionRecord | undefined {
    return this.provisionalRecords.find((row) => this.inScope(row, scope) && row.id === provisionalId);
  }

  supersedePensionCalculations(scope: TenantScope, caseId: string): void {
    for (const row of this.pensionCalculations) {
      if (this.inScope(row, scope) && row.caseId === caseId && row.status !== "SUPERSEDED") {
        row.status = "SUPERSEDED";
      }
    }
  }

  supersedeGratuityCalculations(scope: TenantScope, caseId: string, gratuityType: G11GratuityType): void {
    for (const row of this.gratuityCalculations) {
      if (this.inScope(row, scope) && row.caseId === caseId && row.gratuityType === gratuityType && row.status !== "SUPERSEDED") {
        row.status = "SUPERSEDED";
      }
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }
}

// ---------------------------------------------------------------------------------------
// PURE deterministic helpers — integer paise/cents only; no float parsing, no string rounding
// ---------------------------------------------------------------------------------------

/** floor(value * numerator / denominator) in integer arithmetic. */
export function mulDivFloor(value: number, numerator: number, denominator: number): number {
  return Math.floor((value * numerator) / denominator);
}

/** E36 money rounding on integer cents: NEXT_HIGHER_RUPEE ceils, NEAREST_RUPEE half-up. */
export function roundMoneyCents(cents: number, rounding: G11MoneyRounding): number {
  if (rounding === "NEXT_HIGHER_RUPEE") {
    return Math.ceil(cents / 100) * 100;
  }
  return Math.floor((cents + 50) / 100) * 100;
}

/** E36 reckonable half-years from qualifying months (threshold rounds up; cap applies). */
export function reckonableHalfYears(qualifyingServiceMonths: number, rounding: PenRoundingRule): number {
  const full = Math.floor(qualifyingServiceMonths / 6);
  const remainder = qualifyingServiceMonths % 6;
  const rounded = remainder >= rounding.halfYearThresholdMonths ? full + 1 : full;
  return Math.min(rounded, rounding.qualifyingServiceCapHalfYears);
}

/** ISO date + whole years (29 Feb collapses to 28 Feb off leap years). Pure string/int math. */
export function addYearsIso(isoDate: string, years: number): string {
  const year = Number(isoDate.slice(0, 4)) + years;
  const monthDay = isoDate.slice(5);
  if (monthDay === "02-29" && !isLeapYear(year)) {
    return `${String(year).padStart(4, "0")}-02-28`;
  }
  return `${String(year).padStart(4, "0")}-${monthDay}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Earliest of the given ISO dates (lexicographic order is chronological for ISO dates). */
export function minIsoDate(dates: string[]): string {
  const earliest = [...dates].sort()[0];
  if (earliest === undefined) {
    throw new FoundationError("VALIDATION_FAILED", "At least one date is required", { field: "dates" });
  }
  return earliest;
}

export interface SchemeBenefitInput {
  scheme: PensionSchemeCode;
  qualifyingServiceMonths: number;
  /** Last-drawn emoluments base from G10 (integer cents) — OPS / NPS-default base. */
  emolumentsBaseCents: number;
  /** 12-month average pay basis (integer cents) — the UPS assured-payout base (FR-05 AC4b). */
  avgEmoluments12mCents: number;
  limits: PenPensionLimitRule;
  rounding: PenRoundingRule;
  upsOptedIn?: boolean;
  npsEvent?: NpsBenefitEvent;
}

export interface SchemeBenefitResult {
  benefitOutcome: G11BenefitOutcome;
  emolumentsMethod: G11EmolumentsMethod;
  qualifyingHalfYears: number;
  pensionFractionBps: number;
  basicPensionCents: number;
  minimumPensionApplied: boolean;
  maximumPensionCapApplied: boolean;
  upsAssuredPayoutCents?: number;
  upsMinGuaranteeApplied: boolean;
  npsDefaultBenefitCents?: number;
  formula: string;
}

/** BRD FR-05 AC1: flat 50% for >=10 yrs qualifying (no proportionate reduction). */
const FLAT_PENSION_FRACTION_BPS = 5000;

/**
 * BRD G11 FR-05 — the scheme-branch dispatcher. Identical inputs produce scheme-correct,
 * DIFFERENT outputs per branch; nothing defaults silently:
 *   - qualifying service below the E35 pension threshold -> SERVICE_GRATUITY_ONLY, no
 *     monthly pension (AC1a; the FR-07 SERVICE_GRATUITY handoff computes the lump sum);
 *   - OPS  -> flat 50% of emoluments, E35 min/max clamped with flags (AC1/AC3);
 *   - UPS  -> assured payout = 50% of the 12-month average with the E35 minimum guarantee;
 *             requires ups_opted_in, else ERR-G11-SCHEME-MISMATCH (AC4b);
 *   - NPS superannuation -> NO defined-benefit pension is fabricated; corpus/annuity stays
 *     indicative and OUTSIDE this deterministic result (AC4);
 *   - NPS death-in-service / invalidation -> CCS-NPS Rules 2021 OPS-equivalent default (AC4a).
 */
export function computeSchemeBenefit(input: SchemeBenefitInput): SchemeBenefitResult {
  const qualifyingHalfYears = reckonableHalfYears(input.qualifyingServiceMonths, input.rounding);
  const minPensionMonths = input.limits.minQualifyingYearsForPension * 12;
  if (input.qualifyingServiceMonths < minPensionMonths) {
    // FR-05 AC1a: below the threshold there is NO pension under any scheme — the case is
    // routed to the SERVICE_GRATUITY lump sum (mutually exclusive with FULL_PENSION, IR3a).
    return {
      benefitOutcome: "SERVICE_GRATUITY_ONLY",
      emolumentsMethod: "LAST_DRAWN",
      qualifyingHalfYears,
      pensionFractionBps: 0,
      basicPensionCents: 0,
      minimumPensionApplied: false,
      maximumPensionCapApplied: false,
      upsMinGuaranteeApplied: false,
      formula: "qualifying<E35.min_qualifying_years_for_pension => SERVICE_GRATUITY route (FR-05 AC1a; no monthly pension)",
    };
  }
  switch (input.scheme) {
    case "OPS": {
      const flat = roundMoneyCents(mulDivFloor(input.emolumentsBaseCents, FLAT_PENSION_FRACTION_BPS, 10000), input.rounding.moneyRounding);
      const clamped = clampToLimits(flat, input.limits);
      return {
        benefitOutcome: "FULL_PENSION",
        emolumentsMethod: "LAST_DRAWN",
        qualifyingHalfYears,
        pensionFractionBps: FLAT_PENSION_FRACTION_BPS,
        basicPensionCents: clamped.value,
        minimumPensionApplied: clamped.minApplied,
        maximumPensionCapApplied: clamped.maxApplied,
        upsMinGuaranteeApplied: false,
        formula: "OPS: basic_pension=flat 50% of emoluments_base, E35 min/max clamped (FR-05 AC1/AC3)",
      };
    }
    case "UPS": {
      if (!input.upsOptedIn) {
        // FR-05 failure handling: UPS opt-in absent -> 409 ERR-G11-SCHEME-MISMATCH.
        throw new FoundationError("ERR-G11-SCHEME-MISMATCH", "UPS assured payout requires ups_opted_in on the case", {
          field: "upsOptedIn",
          details: { scheme: "UPS" },
        });
      }
      const assuredRaw = roundMoneyCents(mulDivFloor(input.avgEmoluments12mCents, FLAT_PENSION_FRACTION_BPS, 10000), input.rounding.moneyRounding);
      const guarantee = input.limits.upsMinGuaranteeCents;
      const guaranteeApplied = guarantee !== undefined && assuredRaw < guarantee;
      const assured = guaranteeApplied && guarantee !== undefined ? guarantee : assuredRaw;
      const clamped = clampToLimits(assured, input.limits);
      return {
        benefitOutcome: "UPS_ASSURED",
        emolumentsMethod: "AVG_12_MONTH",
        qualifyingHalfYears,
        pensionFractionBps: FLAT_PENSION_FRACTION_BPS,
        basicPensionCents: clamped.value,
        minimumPensionApplied: clamped.minApplied,
        maximumPensionCapApplied: clamped.maxApplied,
        upsAssuredPayoutCents: clamped.value,
        upsMinGuaranteeApplied: guaranteeApplied,
        formula: "UPS: assured_payout=50% of 12-month average pay with E35 ups_min_guarantee (FR-05 AC4b)",
      };
    }
    case "NPS": {
      const npsEvent: NpsBenefitEvent = input.npsEvent ?? "SUPERANNUATION";
      if (npsEvent === "SUPERANNUATION") {
        // FR-05 AC4: NPS superannuation is corpus/PRAN + indicative annuity — the
        // deterministic engine fabricates NO defined-benefit pension.
        return {
          benefitOutcome: "NPS_INDICATIVE",
          emolumentsMethod: "LAST_DRAWN",
          qualifyingHalfYears,
          pensionFractionBps: 0,
          basicPensionCents: 0,
          minimumPensionApplied: false,
          maximumPensionCapApplied: false,
          upsMinGuaranteeApplied: false,
          formula: "NPS superannuation: corpus/PRAN + indicative annuity only — excluded from determinism (FR-05 AC4)",
        };
      }
      const opsEquivalent = roundMoneyCents(mulDivFloor(input.emolumentsBaseCents, FLAT_PENSION_FRACTION_BPS, 10000), input.rounding.moneyRounding);
      const clamped = clampToLimits(opsEquivalent, input.limits);
      return {
        benefitOutcome: npsEvent === "DEATH_IN_SERVICE" ? "NPS_DEFAULT_FAMILY" : "NPS_DEFAULT_INVALID",
        emolumentsMethod: "LAST_DRAWN",
        qualifyingHalfYears,
        pensionFractionBps: FLAT_PENSION_FRACTION_BPS,
        basicPensionCents: clamped.value,
        minimumPensionApplied: clamped.minApplied,
        maximumPensionCapApplied: clamped.maxApplied,
        upsMinGuaranteeApplied: false,
        npsDefaultBenefitCents: clamped.value,
        formula: "NPS death/invalidation: CCS-NPS Rules 2021 OPS-equivalent default benefit (FR-05 AC4a)",
      };
    }
  }
}

function clampToLimits(valueCents: number, limits: PenPensionLimitRule): { value: number; minApplied: boolean; maxApplied: boolean } {
  if (valueCents < limits.minPensionCents) {
    return { value: limits.minPensionCents, minApplied: true, maxApplied: false };
  }
  if (valueCents > limits.maxPensionCents) {
    return { value: limits.maxPensionCents, minApplied: false, maxApplied: true };
  }
  return { value: valueCents, minApplied: false, maxApplied: false };
}
