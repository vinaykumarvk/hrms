const test = require("node:test");
const assert = require("node:assert/strict");

// PH-09 / PH-09C oracle tests — G11 pension at BRD depth on the PH-09A rule substrate:
// scheme BRANCHING (OPS / NPS / UPS / SERVICE_GRATUITY route, FR-05), commutation via the
// pen_commutation_factors age-next-birthday lookup with the fraction cap and reduction+15y
// restoration (FR-06), gratuity types with the pen_gratuity_ceilings clamp (FR-07), family
// pension normal + ENHANCED window rates from pen_family_pension_rates (FR-08), and Rule 9
// provisional pension with DCRG fully withheld (FR-22). All amounts are INTEGER cents; rate
// fixtures are test values except where the BRD names them (flat 50% pension, 40% commutation
// cap, 30%/50% family-pension rates, the Rs 20L gratuity ceiling, 10-year pension threshold).

const {
  createFoundationApi,
  createFoundationServices,
  FoundationError,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph09-g11-maker",
    actorUserId: "user-ph09-g11-maker",
    permissions: ["*"],
    roles: ["pension_officer"],
    fieldGrants: [],
    correlationId: "corr-ph09-g11",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph09-g11", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof FoundationError, `expected FoundationError, got ${error}`);
    return error.code;
  }
  assert.fail("expected the call to throw");
}

function seedLastPay(services) {
  const maker = actor({ userId: "user-ph09-payroll-maker", actorUserId: "user-ph09-payroll-maker" });
  const approver = actor({ userId: "user-ph09-payroll-approver", actorUserId: "user-ph09-payroll-approver" });
  services.payroll.createSalaryStructure(maker, {
    employeeId: ph03Ids.employee,
    basicPayCents: 10000000,
    daRateBps: 4200,
    hraRateBps: 800,
    npsRateBps: 1000,
    professionalTaxCents: 20000,
    ruleVersion: "PAY-RULE-2026-01",
    effectiveFrom: "2026-07-01",
  });
  const run = services.payroll.createRun(maker, { period: "2026-10" });
  services.payroll.lockInputs(maker, run.id);
  services.payroll.computeRun(maker, run.id);
  services.payroll.reconcileRun(maker, run.id);
  services.payroll.approveRun(approver, run.id);
  services.payroll.lockRun(maker, run.id);
  services.payroll.disburseRun(maker, run.id);
}

// E30-E36 effective rule rows (PH-09A substrate) — integer cents/bps/x10^4 fixtures.
function seedPensionRules(services) {
  const admin = actor({ userId: "user-ph09c-rule-admin", actorUserId: "user-ph09c-rule-admin", roles: ["rule_admin"] });
  services.pensionRules.addPensionLimitRule(admin, {
    ruleCode: "E35-2026",
    minPensionCents: 900000,
    maxPensionCents: 12500000,
    minQualifyingYearsForPension: 10, // BRD FR-05 AC1a: <10 yrs -> SERVICE_GRATUITY route
    upsMinGuaranteeCents: 6000000, // fixture: exercises the UPS assured-payout guarantee
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addRoundingRule(admin, { ruleCode: "E36-2026", effectiveFrom: "2026-01-01" });
  services.pensionRules.addDaReliefRate(admin, {
    ruleCode: "E30-2026",
    appliesTo: "EMPLOYEE",
    daPercentBps: 5000, // fixture DA 50% for FR-07 emoluments = basic + DA
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addCommutationFactor(admin, {
    ruleCode: "E31-2026",
    ageNextBirthday: 61,
    factorTenThousandths: 81940, // fixture factor 8.1940 for age-next-birthday 61
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addFamilyPensionRate(admin, {
    ruleCode: "E32-2026",
    normalRateBps: 3000, // BRD FR-08: normal rate (e.g. 30%)
    enhancedRateBps: 5000, // BRD FR-08: enhanced rate (e.g. 50%)
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addGratuityCeiling(admin, {
    ruleCode: "E33-2026",
    baseCeilingCents: 200000000, // BRD FR-09: Rs 20L statutory gratuity cap
    effectiveFrom: "2026-01-01",
  });
}

function verifiedCase(services, scheme, totalServiceMonths, penaltyExclusionMonths = 0) {
  const maker = actor();
  const pensionCase = services.pension.createCase(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-11-30",
    scheme,
  });
  services.pension.verifyService(maker, pensionCase.id, { totalServiceMonths, penaltyExclusionMonths, srCertified: true });
  return pensionCase;
}

test("PH-09 G11 blocks incomplete SR verification before QUALIFYING_SERVICE_LOCKED", () => {
  const services = createFoundationServices();
  const pensionCase = services.pension.createCase(actor(), {
    employeeId: ph03Ids.employee,
    separationDate: "2026-11-30",
    scheme: "OPS",
  });
  assert.throws(
    () => services.pension.verifyService(actor(), pensionCase.id, { totalServiceMonths: 360, srCertified: false }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "SR_VERIFICATION_GATE"
  );
  assert.throws(
    () => services.pension.computeBenefits(actor(), pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
});

test("PH-09C G11 FR-05 scheme DIVERGENCE: identical inputs under OPS vs NPS produce different outputs", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const opsCase = verifiedCase(services, "OPS", 360, 12);
  const npsCase = verifiedCase(services, "NPS", 360, 12);
  const ops = services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  const nps = services.pension.computeBenefits(maker, npsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  // OPS >=10 yrs: flat 50% of emoluments (BRD FR-05 AC1) — never the old flat formula.
  assert.equal(ops.calculation.benefitOutcome, "FULL_PENSION");
  assert.equal(ops.calculation.pensionCents, 5000000);
  // NPS superannuation: corpus/PRAN + indicative annuity only — no defined benefit fabricated (AC4).
  assert.equal(nps.calculation.benefitOutcome, "NPS_INDICATIVE");
  assert.equal(nps.calculation.pensionCents, 0);
  // The scheme field is USED: same inputs, different scheme => different result.
  assert.notEqual(ops.calculation.pensionCents, nps.calculation.pensionCents);
  assert.notDeepEqual(
    { outcome: ops.calculation.benefitOutcome, pensionCents: ops.calculation.pensionCents },
    { outcome: nps.calculation.benefitOutcome, pensionCents: nps.calculation.pensionCents }
  );
  // NPS death-in-service computes the CCS-NPS Rules 2021 OPS-equivalent default (AC4a).
  const npsDeath = services.pension.computeBenefits(maker, npsCase.id, { ruleVersion: "PENSION-RULE-2026-01", npsEvent: "DEATH_IN_SERVICE" });
  assert.equal(npsDeath.calculation.benefitOutcome, "NPS_DEFAULT_FAMILY");
  assert.equal(npsDeath.calculation.pensionCents, 5000000);
  // Determinism (AC5): recompute with identical inputs is identical.
  const opsAgain = services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.equal(opsAgain.calculation.pensionCents, ops.calculation.pensionCents);
  assert.equal(opsAgain.calculation.trace.ruleVersionRef, ops.calculation.trace.ruleVersionRef);
});

test("PH-09C G11 FR-05 UPS assured payout with E35 guarantee; wrong-scheme requests fail (ERR-G11-SCHEME-MISMATCH)", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const upsCase = verifiedCase(services, "UPS", 360);
  // NEGATIVE: UPS benefit without ups_opted_in -> 409 ERR-G11-SCHEME-MISMATCH (never defaults).
  assert.equal(codeOf(() => services.pension.computeBenefits(maker, upsCase.id, { ruleVersion: "PENSION-RULE-2026-01" })), "ERR-G11-SCHEME-MISMATCH");
  const ups = services.pension.computeBenefits(maker, upsCase.id, { ruleVersion: "PENSION-RULE-2026-01", upsOptedIn: true });
  // UPS: ~50% of 12-month average, lifted to the E35 ups_min_guarantee fixture (FR-05 AC4b).
  assert.equal(ups.calculation.benefitOutcome, "UPS_ASSURED");
  assert.equal(ups.calculation.pensionCents, 6000000);
  // UPS output also DIVERGES from the OPS output for the same inputs.
  const opsCase = verifiedCase(services, "OPS", 360);
  const ops = services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.notEqual(ups.calculation.pensionCents, ops.calculation.pensionCents);
  // NEGATIVE: a benefit explicitly requested under the wrong scheme is refused.
  assert.equal(
    codeOf(() => services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01", scheme: "UPS", upsOptedIn: true })),
    "ERR-G11-SCHEME-MISMATCH"
  );
});

test("PH-09C G11 FR-05 sub-10yr qualifying service routes to SERVICE_GRATUITY (no pension)", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const shortCase = verifiedCase(services, "OPS", 96); // 8 yrs < E35 10-yr threshold
  const computed = services.pension.computeBenefits(maker, shortCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.equal(computed.calculation.benefitOutcome, "SERVICE_GRATUITY_ONLY");
  assert.equal(computed.calculation.pensionCents, 0);
  // FR-07 AC2a: the SERVICE_GRATUITY lump sum has NO DCRG ceiling clamp.
  const gratuity = services.pensionBenefits.computeGratuity(maker, shortCase.id, {
    gratuityType: "SERVICE_GRATUITY",
    serviceGratuityMonthsTenThousandths: 80000, // fixture: 8-month multiplier
  });
  // emoluments = basic + DA = 10000000 + 5000000; x 8.0 months = 120000000.
  assert.equal(gratuity.computedAmountCents, 120000000);
  assert.equal(gratuity.payableAmountCents, 120000000);
  assert.equal(gratuity.ceilingApplied, false);
  // IR3a: SERVICE_GRATUITY is mutually exclusive with the FULL_PENSION route.
  const fullCase = verifiedCase(services, "OPS", 360);
  assert.equal(
    codeOf(() => services.pensionBenefits.computeGratuity(maker, fullCase.id, { gratuityType: "SERVICE_GRATUITY", serviceGratuityMonthsTenThousandths: 80000 })),
    "PRECONDITION_FAILED"
  );
});

test("PH-09C G11 FR-06 commutation: pen_commutation_factors lookup, fraction cap, restoration = reduction + 15y", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const opsCase = verifiedCase(services, "OPS", 360);
  services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  // NEGATIVE: over-limit fraction (> 40% statutory max, FR-06 AC1) -> ERR-G11-COMMUTATION-LIMIT.
  assert.throws(
    () =>
      services.pensionBenefits.computeCommutation(maker, opsCase.id, {
        commutedFractionBps: 4100,
        ageNextBirthday: 61,
        reductionEffectiveDate: "2026-12-01",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-COMMUTATION-LIMIT"
  );
  // NEGATIVE: no pen_commutation_factors row for the age-next-birthday -> ERR-G11-FACTOR-NOT-FOUND
  // (fail closed — never an adjacent-age interpolation).
  assert.throws(
    () =>
      services.pensionBenefits.computeCommutation(maker, opsCase.id, {
        commutedFractionBps: 4000,
        ageNextBirthday: 45,
        reductionEffectiveDate: "2026-12-01",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-FACTOR-NOT-FOUND"
  );
  const commutation = services.pensionBenefits.computeCommutation(maker, opsCase.id, {
    commutedFractionBps: 4000, // at the 40% cap
    ageNextBirthday: 61,
    reductionEffectiveDate: "2026-12-01",
  });
  // commuted portion = 40% of 5000000; value = portion x 12 x factor(8.1940); residual = 60%.
  assert.equal(commutation.commutedPensionCents, 2000000);
  assert.equal(commutation.commutedValueCents, 196656000);
  assert.equal(commutation.residualPensionCents, 3000000);
  assert.equal(commutation.restorationDueDate, "2041-12-01"); // reduction + 15 yrs (AC3a)
  assert.ok(commutation.commutationFactorRef); // E31 FK captured (AC2)
  // NEGATIVE: commutation is defined-benefit only — an NPS-superannuation case has no basic
  // pension to commute (ERR-G11-SCHEME-MISMATCH).
  const npsCase = verifiedCase(services, "NPS", 360);
  services.pension.computeBenefits(maker, npsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.equal(
    codeOf(() =>
      services.pensionBenefits.computeCommutation(maker, npsCase.id, { commutedFractionBps: 4000, ageNextBirthday: 61, reductionEffectiveDate: "2026-12-01" })
    ),
    "ERR-G11-SCHEME-MISMATCH"
  );
});

test("PH-09C G11 FR-07 gratuity types: RETIREMENT_GRATUITY clamped by pen_gratuity_ceilings, DEATH_GRATUITY slab", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const opsCase = verifiedCase(services, "OPS", 360, 12);
  // Retirement gratuity: 1/4 x (basic+DA=15000000) x 58 half-years = 217500000 > Rs 20L ceiling.
  const retirement = services.pensionBenefits.computeGratuity(maker, opsCase.id, { gratuityType: "RETIREMENT_GRATUITY" });
  assert.equal(retirement.gratuityType, "RETIREMENT_GRATUITY");
  assert.equal(retirement.computedAmountCents, 217500000);
  assert.equal(retirement.statutoryCeilingCents, 200000000); // pen_gratuity_ceilings row (E33)
  assert.equal(retirement.ceilingApplied, true); // FR-07 AC1: payable = min(computed, ceiling)
  assert.equal(retirement.payableAmountCents, 200000000);
  assert.ok(retirement.ceilingRef); // AC5: the E33 ceiling row used is captured
  // Death gratuity: service-length slab multiplier (E09 service_slab_factor), below the ceiling.
  const death = services.pensionBenefits.computeGratuity(maker, opsCase.id, {
    gratuityType: "DEATH_GRATUITY",
    serviceSlabFactorTenThousandths: 120000, // fixture slab 12.0 x emoluments
  });
  assert.equal(death.gratuityType, "DEATH_GRATUITY");
  assert.equal(death.computedAmountCents, 180000000);
  assert.equal(death.ceilingApplied, false);
  assert.equal(death.payableAmountCents, 180000000);
  assert.notDeepEqual(
    { type: retirement.gratuityType, payable: retirement.payableAmountCents },
    { type: death.gratuityType, payable: death.payableAmountCents }
  );
});

test("PH-09C G11 FR-08 family pension: normal + ENHANCED window rates from pen_family_pension_rates", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const opsCase = verifiedCase(services, "OPS", 360);
  // Death-in-service path: ENHANCED window = +10 yrs, NO age cap (FR-08 AC2).
  const inService = services.pensionBenefits.computeFamilyPension(maker, opsCase.id, {
    enhancedBasis: "IN_SERVICE",
    eventDate: "2026-11-30",
  });
  assert.equal(inService.normalAmountCents, 3000000); // 30% of emoluments (E32 normal rate)
  assert.equal(inService.enhancedAmountCents, 5000000); // min(50%, would-be pension 50%) — BR1
  assert.equal(inService.enhancedFrom, "2026-11-30");
  assert.equal(inService.enhancedTo, "2036-11-30");
  assert.equal(inService.enhancedWindowRule, "ENHANCED_IN_SERVICE_10Y_NO_AGE_CAP");
  assert.ok(inService.enhancedAmountCents > inService.normalAmountCents); // steps DOWN to normal after the window
  // Death-after-retirement path: min(+7 yrs, age-67 date) — the age cap bites here (FR-08 AC2).
  const afterRetirement = services.pensionBenefits.computeFamilyPension(maker, opsCase.id, {
    enhancedBasis: "AFTER_RETIREMENT",
    eventDate: "2026-11-30",
    dateOfBirth: "1962-01-15",
  });
  assert.equal(afterRetirement.enhancedTo, "2029-01-15"); // dob + 67 < eventDate + 7 yrs
  assert.equal(afterRetirement.enhancedWindowRule, "ENHANCED_AFTER_RETIREMENT_MIN_7Y_AGE67");
  // AC2a: the two paths record DIFFERENT window rules and end dates.
  assert.notDeepEqual(
    { rule: inService.enhancedWindowRule, to: inService.enhancedTo },
    { rule: afterRetirement.enhancedWindowRule, to: afterRetirement.enhancedTo }
  );
  assert.ok(inService.fpRateRef); // E32 rate row FK — rates are never literals
});

test("PH-09C G11 FR-22 Rule 9: provisional pension with DCRG fully withheld until the G09 proceeding concludes", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const sanctioner = actor({ userId: "user-ph09-g11-sanctioner", actorUserId: "user-ph09-g11-sanctioner" });
  // An OPEN G09 departmental proceeding against the retiring employee.
  const proceeding = services.disciplinary.openCase(maker, {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Pending departmental proceedings at superannuation (Rule 9)",
  });
  const opsCase = verifiedCase(services, "OPS", 360, 12);
  services.pension.computeBenefits(maker, opsCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  // FR-07 AC4: gratuity (DCRG) computed while proceedings are OPEN is FULLY withheld.
  const gratuity = services.pensionBenefits.computeGratuity(maker, opsCase.id, { gratuityType: "RETIREMENT_GRATUITY" });
  assert.equal(gratuity.status, "WITHHELD_PROCEEDINGS");
  assert.equal(gratuity.withheldAmountCents, gratuity.payableAmountCents);
  // NEGATIVE: the proceedings reference is mandatory and must match an OPEN G09 case (AC4).
  assert.equal(
    codeOf(() =>
      services.pensionBenefits.createProvisionalPension(maker, opsCase.id, {
        proceedingsRef: "no-such-proceeding",
        proceedingsType: "DEPARTMENTAL",
        commencedOn: "2026-12-01",
      })
    ),
    "VALIDATION_FAILED"
  );
  // E41 pen_provisional_pension_records row: provisional pension paid, DCRG withheld (AC1/AC2).
  const provisional = services.pensionBenefits.createProvisionalPension(maker, opsCase.id, {
    proceedingsRef: proceeding.id,
    proceedingsType: "DEPARTMENTAL",
    commencedOn: "2026-12-01",
  });
  assert.equal(provisional.status, "ACTIVE");
  assert.equal(provisional.provisionalPensionAmountCents, 5000000); // BR2: the would-be pension
  assert.equal(provisional.dcrgWithheld, true);
  assert.equal(provisional.dcrgWithheldAmountCents, 200000000); // the full withheld DCRG amount
  // NEGATIVE: DCRG release is IMPOSSIBLE while the G09 proceeding is still OPEN (BR1/IR15).
  assert.throws(
    () =>
      services.pensionBenefits.concludeProvisionalPension(sanctioner, provisional.id, {
        conclusionOutcome: "EXONERATED",
        concludedOn: "2027-03-31",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-PROVISIONAL-PENDING"
  );
  // Conclude the G09 proceeding (charge -> inquiry -> penalty), then regularise with recovery (AC3).
  services.disciplinary.serveChargeMemo(maker, proceeding.id, { articles: ["Article I"], servedOn: "2027-01-10" });
  services.disciplinary.recordInquiryReport(maker, proceeding.id, { findings: "PROVED", reportDate: "2027-02-20" });
  services.disciplinary.imposePenalty(maker, proceeding.id, {
    penaltyType: "MINOR_PENALTY",
    orderDate: "2027-03-01",
    reason: "Charge proved in part",
    idempotencyKey: "idem-ph09c-g09-penalty-001",
  });
  const concluded = services.pensionBenefits.concludeProvisionalPension(sanctioner, provisional.id, {
    conclusionOutcome: "PENALTY_WITH_RECOVERY",
    concludedOn: "2027-03-31",
    finalRecoveryAmountCents: 50000000,
  });
  assert.equal(concluded.status, "CONCLUDED_RECOVERY");
  assert.equal(concluded.dcrgWithheld, false);
  assert.equal(concluded.finalRecoveryAmountCents, 50000000);
  // The E41 record is queryable on the case and no longer withholding.
  const [record] = services.pensionBenefits.getProvisionalPension(maker, opsCase.id);
  assert.equal(record.status, "CONCLUDED_RECOVERY");
  // With the proceeding concluded, a recompute of the gratuity is no longer withheld.
  const releasedGratuity = services.pensionBenefits.computeGratuity(maker, opsCase.id, { gratuityType: "RETIREMENT_GRATUITY" });
  assert.equal(releasedGratuity.status, "COMPUTED"); // no longer WITHHELD_PROCEEDINGS
  assert.equal(releasedGratuity.withheldAmountCents, 0);
  assert.ok(services.audit.listAudit(maker).some((entry) => entry.action === "G11_PROVISIONAL_PENSION_CONCLUDED"));
});

test("PH-09 G11 computes PENSION_CALC_TRACE, enforces PENSION_SOD, issues PPO, and posts G11_SR_POSTED events", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const maker = actor();
  const sanctioner = actor({ userId: "user-ph09-g11-sanctioner", actorUserId: "user-ph09-g11-sanctioner" });
  const pensionCase = services.pension.createCase(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-11-30",
    scheme: "OPS",
  });
  const verified = services.pension.verifyService(maker, pensionCase.id, {
    totalServiceMonths: 360,
    penaltyExclusionMonths: 12,
    srCertified: true,
  });
  assert.equal(verified.serviceVerification.status, "QUALIFYING_SERVICE_LOCKED");
  assert.equal(verified.serviceVerification.penaltyMarker, "G09_PENALTY_QS_EXCLUSION");
  const computed = services.pension.computeBenefits(maker, pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.equal(computed.calculation.trace.marker, "PENSION_CALC_TRACE");
  assert.equal(computed.calculation.trace.inputs.qualifyingServiceMonths, 348);
  assert.equal(computed.calculation.benefitOutcome, "FULL_PENSION");
  assert.equal(computed.calculation.pensionCents, 5000000); // flat 50% of last basic (FR-05 AC1)
  assert.ok(computed.calculation.trace.ruleVersionRef); // IR17: E35 rule-version FK recorded
  assert.throws(
    () => services.pension.sanction(maker, pensionCase.id),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "PENSION_SOD"
  );
  services.pension.sanction(sanctioner, pensionCase.id);
  const issued = services.pension.issuePpo(maker, pensionCase.id, { idempotencyKey: "idem-ph09-g11-ppo-001" });
  assert.equal(issued.ppo.status, "PPO_ISSUED");
  assert.equal(issued.ppo.srEventIds.length, 2);
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline.filter((event) => event.sourceModule === "G11").length, 2);
  assert.equal(timeline.some((event) => event.eventTypeCode === "PPO_ISSUED"), true);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G11_PPO_ISSUED" && entry.metadata.srMarker === "G11_SR_POSTED"));
});

test("PH-09 G11 routes expose pension case verification, benefit engines, and summary", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/pension/cases",
    headers: { "Idempotency-Key": "idem-ph09-g11-case-001" },
    body: { separationDate: "2026-11-30", scheme: "OPS" },
  });
  assert.equal(created.status, 201);
  const verified = call(api, {
    method: "POST",
    path: `/api/v1/pension/cases/${created.body.pensionCase.id}:verify-service`,
    headers: { "Idempotency-Key": "idem-ph09-g11-verify-001" },
    body: { totalServiceMonths: 360, srCertified: true },
  });
  assert.equal(verified.status, 202);
  assert.equal(verified.body.pensionCase.serviceVerification.marker, "SR_VERIFICATION_GATE");
  // PH-09C: the FR-07 gratuity engine over the kernel — E33 ceiling clamp visible on the wire.
  const gratuity = call(api, {
    method: "POST",
    path: `/api/v1/pension/cases/${created.body.pensionCase.id}/gratuity:compute`,
    headers: { "Idempotency-Key": "idem-ph09-g11-gratuity-001" },
    body: { gratuityType: "RETIREMENT_GRATUITY" },
  });
  assert.equal(gratuity.status, 201);
  assert.equal(gratuity.body.gratuity.ceilingApplied, true);
  assert.equal(gratuity.body.gratuity.payableAmountCents, 200000000);
  const summary = call(api, { method: "GET", path: "/api/v1/pension/summary" });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.serviceGateMarker, "SR_VERIFICATION_GATE");
});
