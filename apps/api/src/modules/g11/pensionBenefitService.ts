import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, nextId } from "../../platform/types";
import { DisciplinaryService } from "../g09/disciplinaryService";
import { PayrollService } from "../g10/payrollService";
import {
  G11EnhancedBasis,
  G11GratuityType,
  G11ProceedingsType,
  G11ProvisionalOutcome,
  PenCommutationRecord,
  PenFamilyPensionRecord,
  PenGratuityCalculation,
  PenProvisionalPensionRecord,
  PensionBenefitRepository,
  addYearsIso,
  computeSchemeBenefit,
  minIsoDate,
  mulDivFloor,
  reckonableHalfYears,
} from "./pensionBenefitRepository";
import { PensionRuleService } from "./pensionRuleService";
import { PensionCase, PensionService } from "./pensionService";

/**
 * PH-09C — BRD G11 benefit engines on the PH-09A rule substrate:
 *   FR-06 commutation: fraction capped (ERR-G11-COMMUTATION-LIMIT), factor looked up in
 *     pen_commutation_factors by age-next-birthday (miss -> ERR-G11-FACTOR-NOT-FOUND, never
 *     interpolated), restoration_due_date = reduction date + 15 yrs (JOB-G11-RESTORE);
 *   FR-07 gratuity: RETIREMENT_GRATUITY / DEATH_GRATUITY / SERVICE_GRATUITY slabs, payable
 *     clamped by the effective pen_gratuity_ceilings row (service gratuity exempt, AC2a);
 *   FR-08 family pension: normal + ENHANCED rates from pen_family_pension_rates with the
 *     path-specific ENHANCED window (IN_SERVICE vs AFTER_RETIREMENT);
 *   FR-22 Rule 9: pen_provisional_pension_records with DCRG fully withheld while the G09
 *     proceeding is OPEN; release before conclusion -> ERR-G11-PROVISIONAL-PENDING.
 * Money is integer cents throughout; statutory percentages the BRD names are cited inline.
 */

/** BRD FR-06 AC1: commuted fraction bounded by the statutory maximum (40%). */
const COMMUTATION_MAX_FRACTION_BPS = 4000;
/** BRD FR-06 AC3a / IR4a: restoration_due_date = reduction_effective_date + 15 years. */
const COMMUTATION_RESTORATION_YEARS = 15;
/** BRD FR-07: retirement gratuity = 1/4 x emoluments x qualifying half-years (capped). */
const RETIREMENT_GRATUITY_QUARTER_DIVISOR = 4;
/** BRD FR-08 BR1: enhanced family pension = min(enhanced formula, would-be pension = 50%). */
const WOULD_BE_PENSION_FRACTION_BPS = 5000;

export class PensionBenefitService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly pension: PensionService,
    private readonly pensionRules: PensionRuleService,
    private readonly payroll: PayrollService,
    private readonly disciplinary: DisciplinaryService,
    private readonly repository: PensionBenefitRepository
  ) {}

  /**
   * FR-G11-06 — commutation of pension. Defined-benefit only: an NPS-superannuation case has
   * no basic pension to commute (ERR-G11-SCHEME-MISMATCH). The factor is a TABLE LOOKUP in
   * pen_commutation_factors keyed by age-next-birthday — a missing row fails closed with
   * ERR-G11-FACTOR-NOT-FOUND (resolved in PensionRuleService), never an interpolation.
   */
  computeCommutation(
    actor: ActorContext,
    caseId: string,
    input: { commutedFractionBps: number; ageNextBirthday: number; reductionEffectiveDate: string; asOf?: string }
  ): PenCommutationRecord {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.pension.getCase(actor, caseId);
    const calculation = this.repository.findCurrentPensionCalculation(actor, caseId);
    if (!calculation) {
      throw new FoundationError("PRECONDITION_FAILED", "Pension calculation (FR-05) is required before commutation");
    }
    if (calculation.basicPensionCents <= 0) {
      // Commutation applies to a defined-benefit monthly pension; NPS_INDICATIVE /
      // SERVICE_GRATUITY_ONLY outcomes have none (FR-06 depends on FR-05).
      throw new FoundationError("ERR-G11-SCHEME-MISMATCH", `Commutation is not available for benefit outcome ${calculation.benefitOutcome}`, {
        field: "caseId",
        details: { scheme: pensionCase.scheme, benefitOutcome: calculation.benefitOutcome },
      });
    }
    if (!Number.isInteger(input.commutedFractionBps) || input.commutedFractionBps <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "commutedFractionBps must be a positive integer (basis points)", { field: "commutedFractionBps" });
    }
    if (input.commutedFractionBps > COMMUTATION_MAX_FRACTION_BPS) {
      // FR-06 AC1: over-limit commutation is rejected, not clamped.
      throw new FoundationError("ERR-G11-COMMUTATION-LIMIT", `Commuted fraction exceeds the statutory maximum of ${COMMUTATION_MAX_FRACTION_BPS} bps`, {
        field: "commutedFractionBps",
        details: { commutedFractionBps: input.commutedFractionBps, maxFractionBps: COMMUTATION_MAX_FRACTION_BPS },
      });
    }
    const asOf = input.asOf ?? input.reductionEffectiveDate;
    // E31 lookup by age-next-birthday: miss -> ERR-G11-FACTOR-NOT-FOUND (FR-06 AC2).
    const factor = this.pensionRules.resolveCommutationFactor(actor, asOf, input.ageNextBirthday);
    const commutedPensionCents = mulDivFloor(calculation.basicPensionCents, input.commutedFractionBps, 10000);
    // FR-06: commuted value = commuted portion x factor x 12 (factor stored x 10^4).
    const commutedValueCents = mulDivFloor(commutedPensionCents * 12, factor.factorTenThousandths, 10000);
    const residualPensionCents = calculation.basicPensionCents - commutedPensionCents;
    const restorationDueDate = addYearsIso(input.reductionEffectiveDate, COMMUTATION_RESTORATION_YEARS);
    const record: PenCommutationRecord = {
      id: nextId("pen-commutation", this.repository.countCommutationRecords()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      pensionCalcId: calculation.id,
      opted: true,
      commutedFractionBps: input.commutedFractionBps,
      commutedPensionCents,
      ageNextBirthday: input.ageNextBirthday,
      commutationFactorTenThousandths: factor.factorTenThousandths,
      commutationFactorRef: factor.id,
      commutedValueCents,
      residualPensionCents,
      reductionEffectiveDate: input.reductionEffectiveDate,
      restorationDueDate,
      restored: false,
      status: "COMPUTED",
    };
    this.repository.insertCommutationRecord(record);
    this.audit.recordMutation(actor, {
      action: "G11_COMMUTATION_COMPUTED",
      subjectRef: `pen_commutation_records:${record.id}`,
      metadata: { commutationFactorRef: factor.id, restorationDueDate, marker: "JOB-G11-RESTORE" },
    });
    return { ...record };
  }

  /**
   * FR-G11-07 — gratuity by type. Emoluments = basic + DA at the retirement/death date (BR1,
   * DA from E30). RETIREMENT_GRATUITY = 1/4 x emoluments x half-years; DEATH_GRATUITY applies
   * the captured service-length slab multiplier; SERVICE_GRATUITY (<10 yrs) is the one-time
   * lump sum with NO DCRG ceiling (AC2a). Retirement/death payable = min(computed, E33
   * ceiling) with ceiling_ref + ceiling_applied recorded (AC1/AC5). While a G09 proceeding is
   * OPEN the gratuity (DCRG) is fully withheld (AC4 / FR-22 AC2).
   */
  computeGratuity(
    actor: ActorContext,
    caseId: string,
    input: {
      gratuityType: G11GratuityType;
      asOf?: string;
      /** DEATH_GRATUITY service-length slab multiplier x 10^4 (E09 service_slab_factor). */
      serviceSlabFactorTenThousandths?: number;
      /** SERVICE_GRATUITY months multiplier x 10^4 (E09 service_gratuity_months). */
      serviceGratuityMonthsTenThousandths?: number;
    }
  ): PenGratuityCalculation {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.pension.getCase(actor, caseId);
    const verification = this.requireVerification(pensionCase);
    const asOf = input.asOf ?? pensionCase.separationDate;
    const lastPay = this.payroll.getLastPayDrawn(actor, pensionCase.employeeId);
    const daRate = this.pensionRules.resolveDaReliefRate(actor, asOf, "EMPLOYEE");
    // FR-07 BR1: emoluments = basic + DA at the retirement/death date.
    const emolumentsBaseCents = lastPay.basicPayCents + mulDivFloor(lastPay.basicPayCents, daRate.daPercentBps, 10000);
    const rounding = this.pensionRules.resolveRoundingRule(actor, asOf);
    const limits = this.pensionRules.resolvePensionLimits(actor, asOf);
    const qualifyingHalfYears = reckonableHalfYears(verification.qualifyingServiceMonths, rounding);
    let computedAmountCents: number;
    switch (input.gratuityType) {
      case "RETIREMENT_GRATUITY":
        computedAmountCents = Math.floor((emolumentsBaseCents * qualifyingHalfYears) / RETIREMENT_GRATUITY_QUARTER_DIVISOR);
        break;
      case "DEATH_GRATUITY": {
        const slab = input.serviceSlabFactorTenThousandths;
        if (slab === undefined || !Number.isInteger(slab) || slab <= 0) {
          throw new FoundationError("VALIDATION_FAILED", "DEATH_GRATUITY requires serviceSlabFactorTenThousandths (E09 service_slab_factor)", {
            field: "serviceSlabFactorTenThousandths",
          });
        }
        computedAmountCents = mulDivFloor(emolumentsBaseCents, slab, 10000);
        break;
      }
      case "SERVICE_GRATUITY": {
        if (verification.qualifyingServiceMonths >= limits.minQualifyingYearsForPension * 12) {
          // IR3a: SERVICE_GRATUITY is mutually exclusive with the FULL_PENSION route.
          throw new FoundationError("PRECONDITION_FAILED", "SERVICE_GRATUITY applies only below the E35 minimum qualifying service", {
            details: { qualifyingServiceMonths: verification.qualifyingServiceMonths, minQualifyingYearsForPension: limits.minQualifyingYearsForPension },
          });
        }
        const months = input.serviceGratuityMonthsTenThousandths;
        if (months === undefined || !Number.isInteger(months) || months <= 0) {
          throw new FoundationError("VALIDATION_FAILED", "SERVICE_GRATUITY requires serviceGratuityMonthsTenThousandths (E09 service_gratuity_months)", {
            field: "serviceGratuityMonthsTenThousandths",
          });
        }
        computedAmountCents = mulDivFloor(emolumentsBaseCents, months, 10000);
        break;
      }
    }
    const ceiling = this.pensionRules.resolveGratuityCeiling(actor, asOf);
    // FR-07 AC1: payable = min(computed, E33 ceiling); AC2a: SERVICE_GRATUITY has no DCRG ceiling.
    const ceilingApplies = input.gratuityType !== "SERVICE_GRATUITY";
    const ceilingApplied = ceilingApplies && computedAmountCents > ceiling.currentEffectiveCeilingCents;
    const payableAmountCents = ceilingApplied ? ceiling.currentEffectiveCeilingCents : computedAmountCents;
    // FR-07 AC4 / FR-22 AC2: DCRG fully withheld while a G09 proceeding is OPEN.
    const openProceedings = this.disciplinary.listOpenProceedings(actor, pensionCase.employeeId);
    const withheldForProceedings = openProceedings.length > 0;
    this.repository.supersedeGratuityCalculations(actor, caseId, input.gratuityType);
    const record: PenGratuityCalculation = {
      id: nextId("pen-gratuity", this.repository.countGratuityCalculations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      gratuityType: input.gratuityType,
      emolumentsBaseCents,
      qualifyingHalfYears,
      serviceSlabFactorTenThousandths: input.serviceSlabFactorTenThousandths,
      serviceGratuityMonthsTenThousandths: input.serviceGratuityMonthsTenThousandths,
      computedAmountCents,
      statutoryCeilingCents: ceiling.currentEffectiveCeilingCents,
      ceilingRef: ceiling.id,
      ceilingApplied,
      payableAmountCents,
      withheldAmountCents: withheldForProceedings ? payableAmountCents : 0,
      calcTrace: {
        formula:
          input.gratuityType === "RETIREMENT_GRATUITY"
            ? "retirement gratuity = 1/4 x emoluments x qualifying half-years, clamped by pen_gratuity_ceilings (FR-07 AC1)"
            : input.gratuityType === "DEATH_GRATUITY"
              ? "death gratuity = emoluments x service-length slab factor, clamped by pen_gratuity_ceilings (FR-07 AC2)"
              : "service gratuity (<10 yrs) = emoluments x months multiplier; NO DCRG ceiling (FR-07 AC2a)",
        ceilingRef: ceiling.id,
        daRateRef: daRate.id,
        dcrgWithheldForProceedings: withheldForProceedings,
      },
      ruleVersionRef: limits.id,
      status: withheldForProceedings ? "WITHHELD_PROCEEDINGS" : "COMPUTED",
    };
    this.repository.insertGratuityCalculation(record);
    this.audit.recordMutation(actor, {
      action: "G11_GRATUITY_COMPUTED",
      subjectRef: `pen_gratuity_calculations:${record.id}`,
      metadata: { gratuityType: input.gratuityType, ceilingApplied, ceilingRef: ceiling.id, dcrgWithheld: withheldForProceedings },
    });
    return { ...record };
  }

  /**
   * FR-G11-08 — family pension. Normal and ENHANCED amounts come from the effective
   * pen_family_pension_rates row (never literals); enhanced = min(enhanced formula,
   * would-be pension) per BR1. The ENHANCED window is path-specific (AC2):
   * IN_SERVICE = +enhanced_in_service_years with NO age cap; AFTER_RETIREMENT =
   * min(+enhanced_after_retire_years, age-cap date, would-be superannuation date).
   */
  computeFamilyPension(
    actor: ActorContext,
    caseId: string,
    input: { enhancedBasis: G11EnhancedBasis; eventDate: string; dateOfBirth?: string; wouldBeSuperannuationDate?: string; asOf?: string }
  ): PenFamilyPensionRecord {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.pension.getCase(actor, caseId);
    const asOf = input.asOf ?? input.eventDate;
    const rate = this.pensionRules.resolveFamilyPensionRate(actor, asOf);
    const lastPay = this.payroll.getLastPayDrawn(actor, pensionCase.employeeId);
    const emolumentsBaseCents = lastPay.basicPayCents;
    const normalAmountCents = mulDivFloor(emolumentsBaseCents, rate.normalRateBps, 10000);
    const wouldBePensionCents = mulDivFloor(emolumentsBaseCents, WOULD_BE_PENSION_FRACTION_BPS, 10000);
    const enhancedAmountCents =
      rate.enhancedRateBps === undefined ? undefined : Math.min(mulDivFloor(emolumentsBaseCents, rate.enhancedRateBps, 10000), wouldBePensionCents);
    let enhancedTo: string | undefined;
    let enhancedWindowRule: string;
    if (enhancedAmountCents === undefined) {
      enhancedWindowRule = "NO_ENHANCED_RATE_EFFECTIVE";
    } else if (input.enhancedBasis === "IN_SERVICE") {
      // FR-08 AC2: death-in-service -> +N years, NO age cap.
      enhancedTo = addYearsIso(input.eventDate, rate.enhancedInServiceYears);
      enhancedWindowRule = `ENHANCED_IN_SERVICE_${rate.enhancedInServiceYears}Y_NO_AGE_CAP`;
    } else {
      // FR-08 AC2: death-after-retirement -> min(+N years, age cap, would-be superannuation).
      const bounds = [addYearsIso(input.eventDate, rate.enhancedAfterRetireYears)];
      if (input.dateOfBirth) {
        bounds.push(addYearsIso(input.dateOfBirth, rate.enhancedAfterRetireAgeCap));
      }
      if (input.wouldBeSuperannuationDate) {
        bounds.push(input.wouldBeSuperannuationDate);
      }
      enhancedTo = minIsoDate(bounds);
      enhancedWindowRule = `ENHANCED_AFTER_RETIREMENT_MIN_${rate.enhancedAfterRetireYears}Y_AGE${rate.enhancedAfterRetireAgeCap}`;
    }
    const record: PenFamilyPensionRecord = {
      id: nextId("pen-family-pension", this.repository.countFamilyPensionRecords()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      employeeId: pensionCase.employeeId,
      enhancedBasis: input.enhancedBasis,
      emolumentsBaseCents,
      normalRateBps: rate.normalRateBps,
      enhancedRateBps: rate.enhancedRateBps,
      normalAmountCents,
      enhancedAmountCents,
      enhancedFrom: enhancedAmountCents === undefined ? undefined : input.eventDate,
      enhancedTo,
      enhancedWindowRule,
      fpRateRef: rate.id,
      status: "COMPUTED",
    };
    this.repository.insertFamilyPensionRecord(record);
    this.audit.recordMutation(actor, {
      action: "G11_FAMILY_PENSION_COMPUTED",
      subjectRef: `pen_family_pension_records:${record.id}`,
      metadata: { enhancedBasis: input.enhancedBasis, enhancedWindowRule, fpRateRef: rate.id },
    });
    return { ...record };
  }

  /**
   * FR-G11-22 — Rule 9 provisional pension. Requires an OPEN G09 proceeding (the linkage is
   * mandatory, AC4); pays the would-be pension provisionally (BR2) and withholds the DCRG
   * (gratuity) FULLY until conclusion (AC2/IR15).
   */
  createProvisionalPension(
    actor: ActorContext,
    caseId: string,
    input: { proceedingsRef: string; proceedingsType: G11ProceedingsType; commencedOn: string; asOf?: string }
  ): PenProvisionalPensionRecord {
    this.authorization.check(actor, "g11.pension.compute", actor);
    const pensionCase = this.pension.getCase(actor, caseId);
    const verification = this.requireVerification(pensionCase);
    const openProceedings = this.disciplinary.listOpenProceedings(actor, pensionCase.employeeId);
    if (openProceedings.length === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "Rule 9 provisional pension requires an OPEN G09 proceeding", {
        details: { employeeId: pensionCase.employeeId },
      });
    }
    if (!openProceedings.some((proceeding) => proceeding.id === input.proceedingsRef || proceeding.caseNo === input.proceedingsRef)) {
      // FR-22 AC4: the G09 proceedings reference is mandatory and must match an OPEN case.
      throw new FoundationError("VALIDATION_FAILED", "proceedingsRef must reference an OPEN G09 proceeding", { field: "proceedingsRef" });
    }
    if (this.repository.findProvisionalRecords(actor, caseId).some((record) => record.status === "ACTIVE")) {
      throw new FoundationError("CONFLICT", "An ACTIVE provisional pension record already exists for this case");
    }
    // FR-22 BR2: the provisional amount is the would-be pension — reuse the FR-05 result
    // when present, otherwise compute the OPS-equivalent would-be pension from the rules.
    const currentCalculation = this.repository.findCurrentPensionCalculation(actor, caseId);
    let provisionalPensionAmountCents: number;
    if (currentCalculation && currentCalculation.basicPensionCents > 0) {
      provisionalPensionAmountCents = currentCalculation.basicPensionCents;
    } else {
      const asOf = input.asOf ?? pensionCase.separationDate;
      const wouldBe = computeSchemeBenefit({
        scheme: "OPS",
        qualifyingServiceMonths: verification.qualifyingServiceMonths,
        emolumentsBaseCents: this.payroll.getLastPayDrawn(actor, pensionCase.employeeId).basicPayCents,
        avgEmoluments12mCents: this.payroll.getLastPayDrawn(actor, pensionCase.employeeId).basicPayCents,
        limits: this.pensionRules.resolvePensionLimits(actor, asOf),
        rounding: this.pensionRules.resolveRoundingRule(actor, asOf),
      });
      provisionalPensionAmountCents = wouldBe.basicPensionCents;
    }
    // FR-22 AC2: DCRG fully withheld — the gratuity computed for the case is the DCRG amount.
    const dcrgWithheldAmountCents = this.repository
      .findGratuityCalculations(actor, caseId)
      .filter((gratuity) => gratuity.gratuityType !== "SERVICE_GRATUITY" && gratuity.status !== "SUPERSEDED")
      .reduce((total, gratuity) => total + gratuity.payableAmountCents, 0);
    const record: PenProvisionalPensionRecord = {
      id: nextId("pen-provisional", this.repository.countProvisionalRecords()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      caseId,
      proceedingsRef: input.proceedingsRef,
      proceedingsType: input.proceedingsType,
      provisionalPensionAmountCents,
      dcrgWithheld: true,
      dcrgWithheldAmountCents,
      commencedOn: input.commencedOn,
      status: "ACTIVE",
    };
    this.repository.insertProvisionalRecord(record);
    this.audit.recordMutation(actor, {
      action: "G11_PROVISIONAL_PENSION_CREATED",
      subjectRef: `pen_provisional_pension_records:${record.id}`,
      metadata: { proceedingsRef: input.proceedingsRef, dcrgWithheld: true, dcrgWithheldAmountCents },
    });
    return { ...record };
  }

  /**
   * FR-G11-22 AC3/BR1 — conclusion drives regularisation. DCRG release is IMPOSSIBLE while
   * the linked G09 proceeding is still OPEN (ERR-G11-PROVISIONAL-PENDING). EXONERATED /
   * PENALTY_NO_RECOVERY release the full DCRG; PENALTY_WITH_RECOVERY nets the decided
   * recovery and releases the balance.
   */
  concludeProvisionalPension(
    actor: ActorContext,
    provisionalId: string,
    input: { conclusionOutcome: G11ProvisionalOutcome; concludedOn: string; finalRecoveryAmountCents?: number }
  ): PenProvisionalPensionRecord {
    this.authorization.check(actor, "g11.pension.sanction", actor);
    const record = this.repository.findProvisionalById(actor, provisionalId);
    if (!record) {
      throw new FoundationError("NOT_FOUND", "Provisional pension record not found");
    }
    if (record.status !== "ACTIVE") {
      throw new FoundationError("CONFLICT", "Provisional pension record is already concluded");
    }
    const pensionCase = this.pension.getCase(actor, record.caseId);
    const stillOpen = this.disciplinary
      .listOpenProceedings(actor, pensionCase.employeeId)
      .some((proceeding) => proceeding.id === record.proceedingsRef || proceeding.caseNo === record.proceedingsRef);
    if (stillOpen) {
      // FR-22 BR1 / IR15: never release DCRG before the proceeding concludes.
      throw new FoundationError("ERR-G11-PROVISIONAL-PENDING", "DCRG release is blocked while the G09 proceeding is still OPEN", {
        details: { proceedingsRef: record.proceedingsRef },
      });
    }
    let finalRecoveryAmountCents = 0;
    if (input.conclusionOutcome === "PENALTY_WITH_RECOVERY") {
      if (input.finalRecoveryAmountCents === undefined || !Number.isInteger(input.finalRecoveryAmountCents) || input.finalRecoveryAmountCents < 0) {
        throw new FoundationError("VALIDATION_FAILED", "PENALTY_WITH_RECOVERY requires finalRecoveryAmountCents", { field: "finalRecoveryAmountCents" });
      }
      finalRecoveryAmountCents = Math.min(input.finalRecoveryAmountCents, record.dcrgWithheldAmountCents);
    }
    const dcrgReleasedCents = record.dcrgWithheldAmountCents - finalRecoveryAmountCents;
    record.dcrgWithheld = false;
    record.proceedingsConcludedOn = input.concludedOn;
    record.conclusionOutcome = input.conclusionOutcome;
    record.finalRecoveryAmountCents = input.conclusionOutcome === "PENALTY_WITH_RECOVERY" ? finalRecoveryAmountCents : undefined;
    record.status = input.conclusionOutcome === "PENALTY_WITH_RECOVERY" ? "CONCLUDED_RECOVERY" : "CONCLUDED_REGULARISED";
    // Release the withheld gratuity (DCRG) rows for the case (net of any decided recovery).
    for (const gratuity of this.repository.findGratuityCalculations(actor, record.caseId)) {
      if (gratuity.status === "WITHHELD_PROCEEDINGS") {
        gratuity.withheldAmountCents = Math.min(finalRecoveryAmountCents, gratuity.payableAmountCents);
        gratuity.status = "COMPUTED";
      }
    }
    this.audit.recordMutation(actor, {
      action: "G11_PROVISIONAL_PENSION_CONCLUDED",
      subjectRef: `pen_provisional_pension_records:${record.id}`,
      metadata: { conclusionOutcome: input.conclusionOutcome, dcrgReleasedCents, finalRecoveryAmountCents },
    });
    return { ...record };
  }

  /** Provisional-pension detail for a case (FR-22 GET surface). */
  getProvisionalPension(actor: ActorContext, caseId: string): PenProvisionalPensionRecord[] {
    this.pension.getCase(actor, caseId);
    return this.repository.findProvisionalRecords(actor, caseId).map((record) => ({ ...record }));
  }

  private requireVerification(pensionCase: PensionCase): NonNullable<PensionCase["serviceVerification"]> {
    const verification = pensionCase.serviceVerification;
    if (!verification || verification.status !== "QUALIFYING_SERVICE_LOCKED") {
      throw new FoundationError("PRECONDITION_FAILED", "QUALIFYING_SERVICE_LOCKED verification is required first", {
        details: { marker: "SR_VERIFICATION_GATE" },
      });
    }
    return verification;
  }
}
