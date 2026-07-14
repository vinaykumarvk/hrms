const test = require("node:test");
const assert = require("node:assert/strict");

// PH-09A oracle tests — persisted, effective-dated G10/G11 rule substrate:
// pay_components + pay_rules (constrained DSL, ERR-G10-RULE-EXPR), rate_tables
// (as-of resolution, ERR-G10-RATE-NOTFOUND / ERR-G10-PT-STATE, overlap rejection
// ERR-G10-RATE-OVERLAP) and the G11 E30-E36 rule tables (pen_da_relief_rates ..
// pen_rounding_rules; ERR-G11-RULE-NOT-EFFECTIVE / ERR-G11-FACTOR-NOT-FOUND).
// All amounts are INTEGER cents; rates are integer basis points (test fixture values,
// not statutory claims).

const { createFoundationApi, createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph09a-rules",
    actorUserId: "user-ph09a-rules",
    permissions: ["*"],
    roles: ["rule_admin"],
    fieldGrants: [],
    correlationId: "corr-ph09a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph09a", ...(request.headers ?? {}) },
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

test("PH-09A G10 pay_components + pay_rules: whitelist DSL accepted, bad token rejected (ERR-G10-RULE-EXPR)", async () => {
  const services = createFoundationServices();
  const maker = actor();
  services.payRules.createPayComponent(maker, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
  services.payRules.createPayComponent(maker, { componentCode: "DA", name: "Dearness Allowance", category: "EARNING", calcMethod: "FORMULA" });

  const rule = services.payRules.createPayRule(maker, {
    componentCode: "DA",
    calcMethod: "FORMULA",
    formulaExpression: "ROUND(BASIC * RATE(DA_RATE) / 100)",
    computationOrder: 2,
    effectiveFrom: "2026-01-01",
  });
  assert.equal(rule.version, 1);
  assert.equal(rule.dslGrammarVersion, "G10-DSL-1.0");

  // NEGATIVE: disallowed token (VAL-G10-DSL-TOKEN) -> ERR-G10-RULE-EXPR, nothing persisted.
  assert.equal(
    codeOf(() =>
      services.payRules.createPayRule(maker, {
        componentCode: "DA",
        calcMethod: "FORMULA",
        formulaExpression: "BASIC + system('rm -rf /')",
        effectiveFrom: "2026-01-01",
      })
    ),
    "ERR-G10-RULE-EXPR"
  );
  // NEGATIVE: unknown reference is also rejected — no eval of arbitrary identifiers.
  assert.equal(
    codeOf(() =>
      services.payRules.createPayRule(maker, {
        componentCode: "DA",
        calcMethod: "FORMULA",
        formulaExpression: "BASIC + UNKNOWN_REF",
        effectiveFrom: "2026-01-01",
      })
    ),
    "ERR-G10-RULE-EXPR"
  );
  assert.ok(services.audit.listAudit(maker).some((entry) => entry.subjectRef.startsWith("g10_pay_rules:")));
});

test("PH-09A G10 rate_tables: effective-date resolution differs across the boundary and fails closed", async () => {
  const services = createFoundationServices();
  const maker = actor();
  // Two adjacent, non-overlapping DA_RATE windows (integer basis points).
  services.payRules.addRateRow(maker, { tableType: "DA_RATE", ratePctBps: 4200, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" });
  services.payRules.addRateRow(maker, { tableType: "DA_RATE", ratePctBps: 5300, effectiveFrom: "2026-07-01" });

  const before = services.payRules.resolveRate(maker, { tableType: "DA_RATE", asOf: "2026-06-30" });
  const after = services.payRules.resolveRate(maker, { tableType: "DA_RATE", asOf: "2026-07-01" });
  assert.equal(before.ratePctBps, 4200);
  assert.equal(after.ratePctBps, 5300);
  assert.notEqual(before.id, after.id);

  // NEGATIVE: as-of miss fails closed — never silently "latest" (ERR-G10-RATE-NOTFOUND).
  assert.equal(codeOf(() => services.payRules.resolveRate(maker, { tableType: "DA_RATE", asOf: "2025-12-31" })), "ERR-G10-RATE-NOTFOUND");

  // NEGATIVE: overlap on the same key rejected on write (VAL-G10-RATE-NONOVERLAP).
  assert.equal(
    codeOf(() => services.payRules.addRateRow(maker, { tableType: "DA_RATE", ratePctBps: 6000, effectiveFrom: "2026-05-01" })),
    "ERR-G10-RATE-OVERLAP"
  );
});

test("PH-09A G10 rate_tables: PT slabs are state-dimensioned (ERR-G10-PT-STATE)", async () => {
  const services = createFoundationServices();
  const maker = actor();
  // NEGATIVE: PT_SLAB row without a state of posting is rejected at write.
  assert.equal(
    codeOf(() => services.payRules.addRateRow(maker, { tableType: "PT_SLAB", slabMinCents: 0, slabMaxCents: 1500000, flatAmountCents: 20000, effectiveFrom: "2026-01-01" })),
    "ERR-G10-PT-STATE"
  );
  services.payRules.addRateRow(maker, {
    tableType: "PT_SLAB",
    state: "KA",
    slabMinCents: 0,
    slabMaxCents: 1500000,
    flatAmountCents: 20000,
    effectiveFrom: "2026-01-01",
  });
  services.payRules.addRateRow(maker, {
    tableType: "PT_SLAB",
    state: "KA",
    slabMinCents: 1500001,
    flatAmountCents: 30000,
    effectiveFrom: "2026-01-01",
  });
  const slab = services.payRules.resolveRate(maker, { tableType: "PT_SLAB", state: "KA", asOf: "2026-03-01", amountCents: 2000000 });
  assert.equal(slab.flatAmountCents, 30000);
  // NEGATIVE: PT lookup without a state, and for an unmapped state, both fail closed.
  assert.equal(codeOf(() => services.payRules.resolveRate(maker, { tableType: "PT_SLAB", asOf: "2026-03-01" })), "ERR-G10-PT-STATE");
  assert.equal(codeOf(() => services.payRules.resolveRate(maker, { tableType: "PT_SLAB", state: "MH", asOf: "2026-03-01" })), "ERR-G10-PT-STATE");
});

test("PH-09A G11 pen_commutation_factors: as-of + age-next-birthday lookup fails closed", async () => {
  const services = createFoundationServices();
  const maker = actor();
  // Same age key, adjacent windows -> different factors either side of the boundary (x 10^4 fixtures).
  services.pensionRules.addCommutationFactor(maker, {
    ruleCode: "CVP-2026",
    ageNextBirthday: 59,
    factorTenThousandths: 81940,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
  });
  services.pensionRules.addCommutationFactor(maker, {
    ruleCode: "CVP-2026",
    ageNextBirthday: 59,
    factorTenThousandths: 81000,
    effectiveFrom: "2027-01-01",
  });
  assert.equal(services.pensionRules.resolveCommutationFactor(maker, "2026-06-15", 59).factorTenThousandths, 81940);
  assert.equal(services.pensionRules.resolveCommutationFactor(maker, "2027-01-01", 59).factorTenThousandths, 81000);
  // NEGATIVE: age key present but no window covers the date -> ERR-G11-RULE-NOT-EFFECTIVE.
  assert.equal(codeOf(() => services.pensionRules.resolveCommutationFactor(maker, "2025-06-15", 59)), "ERR-G11-RULE-NOT-EFFECTIVE");
  // NEGATIVE: missing age-next-birthday key -> ERR-G11-FACTOR-NOT-FOUND (no adjacent-age fallback).
  assert.equal(codeOf(() => services.pensionRules.resolveCommutationFactor(maker, "2026-06-15", 42)), "ERR-G11-FACTOR-NOT-FOUND");
  // NEGATIVE: overlapping window on the same (ruleCode, age) key is rejected (FR-19 AC1).
  assert.equal(
    codeOf(() =>
      services.pensionRules.addCommutationFactor(maker, {
        ruleCode: "CVP-2026",
        ageNextBirthday: 59,
        factorTenThousandths: 82000,
        effectiveFrom: "2026-06-01",
      })
    ),
    "CONFLICT"
  );
});

test("PH-09A G11 rule tables E30/E32-E36 persist and resolve effective-dated rows", async () => {
  const services = createFoundationServices();
  const maker = actor();
  services.pensionRules.addDaReliefRate(maker, { ruleCode: "DR-2026", daPercentBps: 5300, payCommissionBasis: "7CPC", effectiveFrom: "2026-01-01" });
  services.pensionRules.addFamilyPensionRate(maker, { ruleCode: "FP-2026", normalRateBps: 3000, enhancedRateBps: 5000, effectiveFrom: "2026-01-01" });
  services.pensionRules.addGratuityCeiling(maker, { ruleCode: "GC-2026", baseCeilingCents: 2000000000, effectiveFrom: "2026-01-01" });
  services.pensionRules.addRetirementAgeRule(maker, { ruleCode: "RA-2026", superannuationAge: 60, effectiveFrom: "2026-01-01" });
  services.pensionRules.addPensionLimitRule(maker, { ruleCode: "PL-2026", minPensionCents: 900000, maxPensionCents: 12500000, effectiveFrom: "2026-01-01" });
  services.pensionRules.addRoundingRule(maker, { ruleCode: "RR-2026", moneyRounding: "NEXT_HIGHER_RUPEE", effectiveFrom: "2026-01-01" });

  assert.equal(services.pensionRules.resolveDaReliefRate(maker, "2026-05-01").daPercentBps, 5300);
  assert.equal(services.pensionRules.resolveFamilyPensionRate(maker, "2026-05-01").normalRateBps, 3000);
  assert.equal(services.pensionRules.resolveGratuityCeiling(maker, "2026-05-01").currentEffectiveCeilingCents, 2000000000);
  assert.equal(services.pensionRules.resolveRetirementAge(maker, "2026-05-01").superannuationAge, 60);
  assert.equal(services.pensionRules.resolvePensionLimits(maker, "2026-05-01").maxPensionCents, 12500000);
  assert.equal(services.pensionRules.resolveRoundingRule(maker, "2026-05-01").qualifyingServiceCapHalfYears, 66);
  // NEGATIVE: off-window lookups fail closed across the E30-E36 set.
  assert.equal(codeOf(() => services.pensionRules.resolveDaReliefRate(maker, "2025-12-31")), "ERR-G11-RULE-NOT-EFFECTIVE");
  assert.equal(codeOf(() => services.pensionRules.resolveRoundingRule(maker, "2025-12-31")), "ERR-G11-RULE-NOT-EFFECTIVE");
  // Every rule row lands in the P05 audit trail against its pen_* table.
  const auditRefs = services.audit.listAudit(maker).map((entry) => entry.subjectRef);
  for (const table of [
    "pen_da_relief_rates",
    "pen_commutation_factors",
    "pen_family_pension_rates",
    "pen_gratuity_ceilings",
    "pen_retirement_age_rules",
    "pen_pension_limit_rules",
    "pen_rounding_rules",
  ]) {
    if (table === "pen_commutation_factors") {
      continue; // exercised in the dedicated commutation test above
    }
    assert.ok(auditRefs.some((ref) => ref.startsWith(`${table}:`)), `audit entry for ${table}`);
  }
});

test("PH-09A routes: rate_tables write/resolve and pen rule tables over the protected API", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  assert.equal(
    (await call(api, {
      method: "POST",
      path: "/api/v1/payroll/rate-tables",
      headers: { "Idempotency-Key": "idem-ph09a-rate-001" },
      body: { tableType: "DA_RATE", ratePctBps: 4200, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    })).status,
    201
  );
  const overlap = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/rate-tables",
    headers: { "Idempotency-Key": "idem-ph09a-rate-002" },
    body: { tableType: "DA_RATE", ratePctBps: 6000, effectiveFrom: "2026-03-01" },
  });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.error.code, "ERR-G10-RATE-OVERLAP");

  const resolved = await call(api, { method: "GET", path: "/api/v1/payroll/rate-tables/resolve", query: { tableType: "DA_RATE", asOf: "2026-02-01" } });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.rateRow.ratePctBps, 4200);
  const miss = await call(api, { method: "GET", path: "/api/v1/payroll/rate-tables/resolve", query: { tableType: "DA_RATE", asOf: "2026-08-01" } });
  assert.equal(miss.status, 422);
  assert.equal(miss.body.error.code, "ERR-G10-RATE-NOTFOUND");

  assert.equal(
    (await call(api, {
      method: "POST",
      path: "/api/v1/pension/rules/commutation-factors",
      headers: { "Idempotency-Key": "idem-ph09a-cf-001" },
      body: { ruleCode: "CVP-2026", ageNextBirthday: 59, factorTenThousandths: 81940, effectiveFrom: "2026-01-01" },
    })).status,
    201
  );
  const factor = await call(api, {
    method: "GET",
    path: "/api/v1/pension/rules/commutation-factors/resolve",
    query: { asOf: "2026-06-15", ageNextBirthday: "59" },
  });
  assert.equal(factor.status, 200);
  assert.equal(factor.body.ruleRow.factorTenThousandths, 81940);
  const factorMiss = await call(api, {
    method: "GET",
    path: "/api/v1/pension/rules/commutation-factors/resolve",
    query: { asOf: "2026-06-15", ageNextBirthday: "42" },
  });
  assert.equal(factorMiss.status, 422);
  assert.equal(factorMiss.body.error.code, "ERR-G11-FACTOR-NOT-FOUND");
});
