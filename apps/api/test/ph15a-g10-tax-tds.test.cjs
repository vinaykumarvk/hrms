const test = require("node:test");
const assert = require("node:assert/strict");

// PH-15A oracle tests — G10 income-tax/TDS engine + statutory certificates at BRD depth:
// E15 tax_declarations with regime handling (FR-G10-07 AC1: switching regime recomputes the
// FULL pipeline — gross taxable -> standard_deduction -> Chapter VI-A caps -> slab tax ->
// surcharge with marginal_relief -> cess -> rebate_87a -> 89(1) relief — plus per-month TDS),
// the FR-07 BR2 spread (monthly TDS = (projected annual tax − ledger YTD TDS)/remainingMonths,
// VAL-G10-YTD-DERIVE), the FY proof-cutoff lock (AC3 -> registered ERR-G10-SNAPSHOT-FROZEN),
// missing slab rows failing closed (ERR-G10-TAXSLAB-NOTFOUND), Form-16 whose TDS totals tie
// to Σ TDS payslip_lines for the FY with Part A derived ONLY from MATCHED
// statutory_remittances (FR-G10-17 AC1/AC5), and Form-24Q quarterly aggregation reconciling
// to the monthly TDS ledger (FR-17 AC2).
// All amounts are INTEGER paise; slab boundaries, surcharge thresholds, 87A limits, the
// standard deduction, and Chapter VI-A caps are effective-dated TAX_SLAB rate rows — test
// fixture values, not statutory claims, except the cess rate where BRD G10 FR-07 itself
// names the "4% cess" (400 bps fixture cites that).

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

const FY = "2026-27";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph15a-maker",
    actorUserId: "user-ph15a-maker",
    permissions: ["*"],
    roles: ["payroll_officer"],
    fieldGrants: [],
    correlationId: "corr-ph15a",
    ...extra,
  };
}

function approver() {
  return actor({ userId: "user-ph15a-approver", actorUserId: "user-ph15a-approver" });
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

/**
 * Rule fixture: BASIC (FLAT earning ₹100,000.00/month) + TDS (FLAT deduction ₹5,000.00/month)
 * so the immutable payslip_lines ledger carries the TDS rows that Form-16/24Q and the BR2
 * projection derive from (VAL-G10-YTD-DERIVE).
 */
function seedPayrollRules(services) {
  const maker = actor();
  services.payRules.createPayComponent(maker, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
  services.payRules.createPayComponent(maker, { componentCode: "TDS", name: "Income Tax TDS", category: "DEDUCTION", calcMethod: "FLAT" });
  services.payRules.createPayRule(maker, { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" });
  services.payRules.createPayRule(maker, { componentCode: "TDS", calcMethod: "FLAT", computationOrder: 2, effectiveFrom: "2026-01-01" });
  services.payrollEngine.enrolEmployee(maker, {
    employeeId: ph03Ids.employee,
    componentAmountsCents: { BASIC: 10000000, TDS: 500000 },
    effectiveFrom: "2026-01-01",
  });
}

/**
 * Effective-dated TAX_SLAB rate rows (regime + FY dimensioned) — the statutory computation
 * pipeline resolves EVERY threshold/rate/cap from these rows, never from engine constants.
 * The 400 bps CESS rows cite BRD G10 FR-07 ("4% cess"); the rest are test fixtures.
 */
function seedTaxSlabRows(services) {
  const maker = actor();
  const from = { financialYear: FY, effectiveFrom: "2026-04-01" };
  // NEW regime: 0% to ₹3L, 5% to ₹7L, 20% above (paise fixtures).
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "SLAB", slabMinCents: 0, slabMaxCents: 30000000, ratePctBps: 0, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "SLAB", slabMinCents: 30000000, slabMaxCents: 70000000, ratePctBps: 500, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "SLAB", slabMinCents: 70000000, ratePctBps: 2000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "STD_DEDUCTION", flatAmountCents: 7500000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "CESS", ratePctBps: 400, ...from }); // BRD FR-07: 4% cess
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "REBATE_87A", slabMaxCents: 70000000, flatAmountCents: 2500000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "NEW", keyCode: "SURCHARGE", slabMinCents: 500000000, ratePctBps: 1000, ...from });
  // OLD regime: 0% to ₹2.5L, 5% to ₹5L, 20% to ₹10L, 30% above; Ch VI-A caps 80C ₹1.5L / 80D ₹25k.
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "SLAB", slabMinCents: 0, slabMaxCents: 25000000, ratePctBps: 0, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "SLAB", slabMinCents: 25000000, slabMaxCents: 50000000, ratePctBps: 500, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "SLAB", slabMinCents: 50000000, slabMaxCents: 100000000, ratePctBps: 2000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "SLAB", slabMinCents: 100000000, ratePctBps: 3000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "STD_DEDUCTION", flatAmountCents: 5000000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "CESS", ratePctBps: 400, ...from }); // BRD FR-07: 4% cess
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "REBATE_87A", slabMaxCents: 50000000, flatAmountCents: 1250000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "CAP_80C", flatAmountCents: 15000000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "CAP_80D", flatAmountCents: 2500000, ...from });
  services.payRules.addRateRow(maker, { tableType: "TAX_SLAB", regime: "OLD", keyCode: "SURCHARGE", slabMinCents: 500000000, ratePctBps: 1000, ...from });
}

/** Drive one period from run creation through lock (publishes the payslip_lines ledger rows). */
function runPeriodToLock(services, period) {
  const maker = actor();
  const run = services.payrollEngine.createEngineRun(maker, { period, runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, run.id);
  services.payrollEngine.computeEngineRun(maker, run.id);
  services.payrollEngine.approveEngineRun(approver(), run.id);
  services.payrollEngine.lockEngineRun(maker, run.id);
  return run.id;
}

/** Standard universe: rules + slab rows + two locked FY months (2026-04, 2026-05). */
function seedUniverse() {
  const services = createFoundationServices();
  seedPayrollRules(services);
  seedTaxSlabRows(services);
  runPeriodToLock(services, "2026-04");
  runPeriodToLock(services, "2026-05");
  return services;
}

test("PH-15A FR-07 AC1: switching regime recomputes EVERY persisted tax_declarations pipeline stage and the per-month TDS", () => {
  const services = seedUniverse();
  const maker = actor();
  // NEW regime declaration. Projected annual salary derives from the payslip_lines ledger:
  // ₹200,000 earned (2 months) + ₹100,000 × 10 remaining months = ₹12,00,000 = 120000000 paise.
  const fresh = services.taxEngine.upsertDeclaration(maker, {
    employeeId: ph03Ids.employee,
    financialYear: FY,
    regime: "NEW",
    declared80cPaise: 20000000, // over-declared: OLD regime clamps to the CAP_80C row (₹1.5L)
    declared80dPaise: 1000000,
    asOf: "2026-06-15",
  });
  assert.equal(fresh.grossTaxablePaise, 120000000);
  assert.equal(fresh.standardDeductionPaise, 7500000);
  assert.equal(fresh.chapterViaTotalPaise, 0); // FR-07 BR1: the new regime ignores Ch VI-A
  assert.equal(fresh.taxableIncomePaise, 112500000);
  assert.equal(fresh.slabTaxPaise, 10500000); // 5% of ₹4L + 20% of ₹4.25L
  assert.equal(fresh.surchargePaise, 0);
  assert.equal(fresh.marginalReliefPaise, 0);
  assert.equal(fresh.cessPaise, 420000); // 4% cess (BRD FR-07) on slab tax
  assert.equal(fresh.rebate87aPaise, 0); // above the 87A threshold row
  assert.equal(fresh.projectedAnnualTaxPaise, 10920000);
  // FR-07 BR2: TDS = (projected annual tax − ledger YTD TDS) / remaining months.
  assert.equal(fresh.projection.validation, "VAL-G10-YTD-DERIVE");
  assert.equal(fresh.projection.ytdTdsPaise, 1000000); // 2 months × ₹5,000 TDS payslip_lines
  assert.equal(fresh.projection.remainingMonths, 10);
  assert.equal(fresh.monthlyTdsPaise, 992000); // (10920000 − 1000000) / 10
  // AC5: every stage is persisted and exposed as a step-by-step breakdown.
  assert.deepEqual(
    fresh.breakdown.map((stage) => stage.stage),
    [
      "gross_taxable",
      "standard_deduction",
      "chapter_via_total",
      "taxable_income",
      "slab_tax",
      "surcharge",
      "marginal_relief",
      "cess",
      "rebate_87a",
      "relief_89_1",
      "projected_annual_tax",
      "monthly_tds",
    ]
  );

  // AC1: the regime switch (NEW -> OLD) recomputes the FULL pipeline + per-month TDS.
  const switched = services.taxEngine.switchRegime(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "OLD", asOf: "2026-06-20" });
  assert.equal(switched.regime, "OLD");
  assert.equal(switched.standardDeductionPaise, 5000000); // OLD-regime STD_DEDUCTION row
  assert.equal(switched.chapterViaTotalPaise, 16000000); // 80C CLAMPED to ₹1.5L cap + 80D ₹10k
  assert.equal(switched.taxableIncomePaise, 99000000);
  assert.equal(switched.slabTaxPaise, 11050000); // 5% of ₹2.5L + 20% of ₹4.9L
  assert.equal(switched.cessPaise, 442000);
  assert.equal(switched.rebate87aPaise, 0);
  assert.equal(switched.projectedAnnualTaxPaise, 11492000);
  assert.equal(switched.monthlyTdsPaise, 1049200); // (11492000 − 1000000) / 10 — TDS re-spread
  // The persisted declaration (not just the response) carries the recomputed stages.
  const persisted = services.taxEngine.getDeclaration(maker, ph03Ids.employee, FY);
  assert.equal(persisted.regime, "OLD");
  assert.equal(persisted.slabTaxPaise, 11050000);
  assert.equal(persisted.monthlyTdsPaise, 1049200);
});

test("PH-15A FR-07 BR4 + AC6: surcharge applies with marginal relief, and Form-12B previous-employer income joins the pipeline", () => {
  const services = seedUniverse();
  const maker = actor();
  // Form-12B pushes taxable just past the ₹50L surcharge threshold row: taxable ₹50.25L.
  const declaration = services.taxEngine.upsertDeclaration(maker, {
    employeeId: ph03Ids.employee,
    financialYear: FY,
    regime: "NEW",
    previousEmployerIncome: { incomePaise: 390000000, tdsPaise: 0, employerTan: "TAN-PREV-01" },
    asOf: "2026-06-15",
  });
  assert.equal(declaration.grossTaxablePaise, 510000000);
  assert.equal(declaration.taxableIncomePaise, 502500000);
  assert.equal(declaration.slabTaxPaise, 88500000);
  // Marginal relief: the surcharge increment may not exceed the ₹2.5L income excess over
  // the threshold — raw 10% surcharge 8850000 is relieved down by 6850000 to 2000000.
  assert.equal(declaration.marginalReliefPaise, 6850000);
  assert.equal(declaration.surchargePaise, 2000000);
  assert.equal(declaration.cessPaise, 3620000); // 4% cess on (slab tax + relieved surcharge)
  assert.equal(declaration.projectedAnnualTaxPaise, 94120000);
});

test("PH-15A NEGATIVE FR-07: missing TAX_SLAB rows for the regime/FY fail closed with ERR-G10-TAXSLAB-NOTFOUND", () => {
  const services = createFoundationServices();
  seedPayrollRules(services);
  runPeriodToLock(services, "2026-04");
  // No TAX_SLAB rows seeded at all — the pipeline must refuse, never assume statutory numbers.
  assert.equal(
    codeOf(() =>
      services.taxEngine.upsertDeclaration(actor(), { employeeId: ph03Ids.employee, financialYear: FY, regime: "NEW", asOf: "2026-06-15" })
    ),
    "ERR-G10-TAXSLAB-NOTFOUND"
  );
});

test("PH-15A NEGATIVE FR-07 AC3: tax_declaration mutation after the FY proof cutoff throws ERR-G10-SNAPSHOT-FROZEN", () => {
  const services = seedUniverse();
  const maker = actor();
  services.taxEngine.upsertDeclaration(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "NEW", asOf: "2026-06-15" });
  services.taxEngine.setProofCutoff(maker, { employeeId: ph03Ids.employee, financialYear: FY, cutoffDate: "2027-01-31" });
  // Before the cutoff, mutation is still allowed (regime switch recomputes normally).
  const beforeCutoff = services.taxEngine.switchRegime(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "OLD", asOf: "2027-01-15" });
  assert.equal(beforeCutoff.regime, "OLD");
  // After the cutoff EVERY declaration mutation throws the REGISTERED freeze code (409) —
  // the BRD registers no declaration-specific code, so no new identifier is minted.
  try {
    services.taxEngine.switchRegime(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "NEW", asOf: "2027-02-15" });
    assert.fail("expected the post-cutoff regime switch to throw");
  } catch (error) {
    assert.ok(error instanceof FoundationError);
    assert.equal(error.code, "ERR-G10-SNAPSHOT-FROZEN");
    assert.equal(error.details.proofCutoffDate, "2027-01-31");
  }
  assert.equal(
    codeOf(() =>
      services.taxEngine.upsertDeclaration(maker, {
        employeeId: ph03Ids.employee,
        financialYear: FY,
        regime: "OLD",
        declared80cPaise: 5000000,
        asOf: "2027-03-01",
      })
    ),
    "ERR-G10-SNAPSHOT-FROZEN"
  );
  // The frozen declaration survives untouched in its pre-cutoff state.
  assert.equal(services.taxEngine.getDeclaration(maker, ph03Ids.employee, FY).regime, "OLD");
});

test("PH-15A FR-17 AC1: Form-16 TDS totals tie to Σ TDS payslip_lines for the FY and Part A derives from MATCHED statutory_remittances", () => {
  const services = seedUniverse();
  const maker = actor();
  services.taxEngine.upsertDeclaration(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "NEW", asOf: "2026-06-15" });
  // E29 lifecycle per month: deducted_total DERIVES from the payslip_lines ledger (FR-19 AC1),
  // then challan capture -> DEPOSITED, then tie-within-tolerance -> MATCHED.
  for (const period of ["2026-04", "2026-05"]) {
    const accrued = services.taxEngine.accrueRemittance(maker, { scheme: "TDS", period, statutoryDueDate: `${period}-30` });
    assert.equal(accrued.deductedTotalPaise, 500000); // Σ TDS payslip_lines for the month
    assert.equal(accrued.status, "ACCRUED");
    const deposited = services.taxEngine.captureDeposit(maker, accrued.id, {
      challanNo: `CHLN-${period}`,
      cin: `CIN-${period}`,
      depositDate: `${period}-28`,
      depositedAmountPaise: 500000,
    });
    assert.equal(deposited.status, "DEPOSITED");
    const matched = services.taxEngine.matchRemittance(approver(), accrued.id, { tolerancePaise: 0 });
    assert.equal(matched.status, "MATCHED");
  }
  const form16 = services.taxEngine.generateForm16(approver(), { employeeId: ph03Ids.employee, financialYear: FY });
  // AC1 tie-out: the certificate TDS figure IS the ledger sum over surviving payslip_lines.
  const ytd = services.payrollEngine.getYtdStatement(maker, ph03Ids.employee);
  assert.equal(ytd.validation, "VAL-G10-YTD-DERIVE");
  assert.equal(form16.ledgerTdsTotalPaise, ytd.byComponent.TDS);
  assert.equal(form16.ledgerTdsTotalPaise, 1000000);
  // Part A derives ONLY from MATCHED statutory_remittances and ties to the same ledger.
  assert.equal(form16.partA.source, "statutory_remittances");
  assert.equal(form16.partA.requiredStatus, "MATCHED");
  assert.equal(form16.partA.totalPaise, form16.ledgerTdsTotalPaise);
  const q1 = form16.partA.quarters.find((quarter) => quarter.quarter === "Q1");
  assert.equal(q1.tdsPaise, 1000000);
  assert.equal(q1.remittanceIds.length, 2);
  // Part B reflects the full FR-07 pipeline from the persisted declaration stages.
  assert.equal(form16.partB.standardDeductionPaise, 7500000);
  assert.equal(form16.partB.projectedAnnualTaxPaise, 10920000);
});

test("PH-15A NEGATIVE FR-17 AC5: Form-16 Part A is blocked while any FY TDS remittance is not MATCHED", () => {
  const services = seedUniverse();
  const maker = actor();
  services.taxEngine.upsertDeclaration(maker, { employeeId: ph03Ids.employee, financialYear: FY, regime: "NEW", asOf: "2026-06-15" });
  // No remittances at all -> blocked: Part A cannot derive from an empty MATCHED set.
  assert.equal(codeOf(() => services.taxEngine.generateForm16(approver(), { employeeId: ph03Ids.employee, financialYear: FY })), "PRECONDITION_FAILED");
  const april = services.taxEngine.accrueRemittance(maker, { scheme: "TDS", period: "2026-04", statutoryDueDate: "2026-04-30" });
  const may = services.taxEngine.accrueRemittance(maker, { scheme: "TDS", period: "2026-05", statutoryDueDate: "2026-05-31" });
  services.taxEngine.captureDeposit(maker, april.id, { challanNo: "CHLN-04", depositDate: "2026-04-28", depositedAmountPaise: 500000 });
  services.taxEngine.matchRemittance(approver(), april.id, {});
  services.taxEngine.captureDeposit(maker, may.id, { challanNo: "CHLN-05", depositDate: "2026-05-28", depositedAmountPaise: 500000 });
  // May is DEPOSITED but not yet MATCHED — TDS deducted-but-unmatched blocks certification.
  try {
    services.taxEngine.generateForm16(approver(), { employeeId: ph03Ids.employee, financialYear: FY });
    assert.fail("expected Form-16 generation to be blocked while a remittance is un-MATCHED");
  } catch (error) {
    assert.ok(error instanceof FoundationError);
    assert.equal(error.code, "PRECONDITION_FAILED");
    assert.equal(error.details.requiredStatus, "MATCHED");
    assert.deepEqual(
      error.details.pending.map((row) => ({ period: row.period, status: row.status })),
      [{ period: "2026-05", status: "DEPOSITED" }]
    );
  }
  // Matching the pending deposit unblocks Part A — the gate is built, not stubbed open.
  services.taxEngine.matchRemittance(approver(), may.id, {});
  const form16 = services.taxEngine.generateForm16(approver(), { employeeId: ph03Ids.employee, financialYear: FY });
  assert.equal(form16.partA.totalPaise, 1000000);
});

test("PH-15A FR-17 AC2: Form-24Q quarterly totals reconcile to the monthly TDS payslip_lines in the quarter", () => {
  const services = seedUniverse();
  const maker = actor();
  const form24q = services.taxEngine.generateForm24Q(maker, { financialYear: FY, quarter: "Q1" });
  // Quarterly aggregation: Apr + May carry ₹5,000.00 TDS each from the ledger; June has none.
  assert.deepEqual(form24q.months, [
    { period: "2026-04", tdsPaise: 500000, employeeCount: 1 },
    { period: "2026-05", tdsPaise: 500000, employeeCount: 1 },
    { period: "2026-06", tdsPaise: 0, employeeCount: 0 },
  ]);
  // AC2 reconciliation: the quarterly total equals Σ of the monthly TDS ledger sums.
  const sumOfMonths = form24q.months.reduce((total, month) => total + month.tdsPaise, 0);
  assert.equal(form24q.quarterlyTotalPaise, sumOfMonths);
  assert.equal(form24q.quarterlyTotalPaise, 1000000);
  assert.equal(form24q.reconciled, true);
  // A later quarter with no payroll aggregates to zero — still reconciled, never invented.
  const q3 = services.taxEngine.generateForm24Q(maker, { financialYear: FY, quarter: "Q3" });
  assert.equal(q3.quarterlyTotalPaise, 0);

  // NEGATIVE: an accrual that goes stale against the ledger blocks 24Q (fail closed).
  const june = services.taxEngine.accrueRemittance(maker, { scheme: "TDS", period: "2026-06", statutoryDueDate: "2026-06-30" });
  assert.equal(june.deductedTotalPaise, 0); // accrued before June payroll ran
  runPeriodToLock(services, "2026-06"); // June ledger now carries ₹5,000 TDS the accrual lacks
  assert.equal(codeOf(() => services.taxEngine.generateForm24Q(maker, { financialYear: FY, quarter: "Q1" })), "ERR-G10-RECON-TIEOUT");
});
