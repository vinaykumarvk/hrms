const test = require("node:test");
const assert = require("node:assert/strict");

// PH-09B oracle tests — G10 deterministic payroll run engine at BRD depth:
// DSL-ordered computation over a frozen snapshot, LWP proration from the G03
// payroll_attendance_feed, statutory caps + state-wise PT via rate tables, an
// arrears engine persisting the month-wise breakup (Σ months new − old), the
// payslip_lines-derived YTD ledger (VAL-G10-YTD-DERIVE), post-lock immutability
// (ERR-G10-RUN-IMMUTABLE), the single-in-flight FINAL guard (ERR-G10-RUN-INFLIGHT),
// reopen supersede (originals REVERSED), and the net-pay floor booking excess
// recovery into deduction_carryforwards (ERR-G10-RECOVERY-NET).
// All amounts are INTEGER cents; rates are integer basis points (test fixture
// values, not statutory claims).

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph09b-maker",
    actorUserId: "user-ph09b-maker",
    permissions: ["*"],
    roles: ["payroll_officer"],
    fieldGrants: [],
    correlationId: "corr-ph09b",
    ...extra,
  };
}

function approver() {
  return actor({ userId: "user-ph09b-approver", actorUserId: "user-ph09b-approver" });
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
 * Rule fixture: BASIC (FLAT earning, order 1), DA (FORMULA earning over the DA_RATE
 * table, order 2), NPS (FORMULA deduction capped by the NPS_RATE row's slab max,
 * order 3), PT (state-wise SLAB deduction, order 4) — evaluated in declared order.
 */
function seedRules(services) {
  const maker = actor();
  services.payRules.createPayComponent(maker, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
  services.payRules.createPayComponent(maker, { componentCode: "DA", name: "Dearness Allowance", category: "EARNING", calcMethod: "FORMULA" });
  services.payRules.createPayComponent(maker, { componentCode: "NPS", name: "NPS Contribution", category: "DEDUCTION", calcMethod: "FORMULA" });
  services.payRules.createPayComponent(maker, { componentCode: "PT", name: "Professional Tax", category: "DEDUCTION", calcMethod: "SLAB" });
  services.payRules.createPayRule(maker, { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" });
  services.payRules.createPayRule(maker, {
    componentCode: "DA",
    calcMethod: "FORMULA",
    formulaExpression: "ROUND(BASIC / 10000 * RATE(DA_RATE))",
    computationOrder: 2,
    effectiveFrom: "2026-01-01",
  });
  services.payRules.createPayRule(maker, {
    componentCode: "NPS",
    calcMethod: "FORMULA",
    formulaExpression: "ROUND(BASIC / 10000 * RATE(NPS_RATE))",
    computationOrder: 3,
    effectiveFrom: "2026-01-01",
  });
  services.payRules.createPayRule(maker, { componentCode: "PT", calcMethod: "SLAB", computationOrder: 4, effectiveFrom: "2026-01-01" });
  // DA 42.00% (integer bps), NPS 10.00% with a statutory cap on the rate row (slab max).
  services.payRules.addRateRow(maker, { tableType: "DA_RATE", ratePctBps: 4200, effectiveFrom: "2026-01-01" });
  services.payRules.addRateRow(maker, { tableType: "NPS_RATE", ratePctBps: 1000, slabMaxCents: 250000, effectiveFrom: "2026-01-01" });
  // State-wise PT slabs for KA (ERR-G10-PT-STATE fails closed elsewhere).
  services.payRules.addRateRow(maker, { tableType: "PT_SLAB", state: "KA", slabMinCents: 0, slabMaxCents: 1500000, flatAmountCents: 20000, effectiveFrom: "2026-01-01" });
  services.payRules.addRateRow(maker, { tableType: "PT_SLAB", state: "KA", slabMinCents: 1500001, flatAmountCents: 30000, effectiveFrom: "2026-01-01" });
  services.payrollEngine.enrolEmployee(maker, {
    employeeId: ph03Ids.employee,
    stateOfPosting: "KA",
    componentAmountsCents: { BASIC: 3100000 },
    effectiveFrom: "2026-01-01",
  });
}

/** Drive one period from run creation through lock; returns the locked run id. */
function runPeriodToLock(services, period) {
  const maker = actor();
  const run = services.payrollEngine.createEngineRun(maker, { period, runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, run.id);
  services.payrollEngine.computeEngineRun(maker, run.id);
  services.payrollEngine.approveEngineRun(approver(), run.id);
  services.payrollEngine.lockEngineRun(maker, run.id);
  return run.id;
}

test("PH-09B G10 engine: DSL-ordered compute with G03-fed LWP proration, statutory cap, and state-wise PT", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  // FR-05: LWP facts come from the G03 payroll_attendance_feed (approved leave debit),
  // consumed at snapshot time — never hand-keyed into G10.
  const submitted = services.leave.submit(maker, {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-08-20",
    toDate: "2026-08-21",
    reason: "Personal work",
  });
  services.leave.approve(maker, submitted.application.id, "idem-ph09b-leave-001");
  const feed = services.leave.generatePayrollFeed(maker, "2026-08");
  assert.equal(feed[0].lwpDays, 2);

  const run = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" });
  const snapshotted = services.payrollEngine.snapshotRunInputs(maker, run.id);
  assert.equal(snapshotted.snapshot.attendanceFeed[0].lwpDays, 2);
  const { payslips } = services.payrollEngine.computeEngineRun(maker, run.id);
  assert.equal(payslips.length, 1);
  const [payslip] = payslips;
  const [{ lines }] = services.payrollEngine.listRunPayslips(maker, run.id);

  // Proration: 2 LWP days over the 31-day August basis -> BASIC 31000.00 pays 29/31.
  const basic = lines.find((line) => line.componentCode === "BASIC");
  assert.equal(basic.amountCents, 2900000);
  assert.equal(basic.calcTrace.proration.lwpDays, 2);
  assert.equal(basic.calcTrace.proration.payableDays, 29);
  // The LWP reduction is visible as its own LWP_RECOVERY line (G03 feed provenance).
  const lwpLine = lines.find((line) => line.lineType === "LWP_RECOVERY");
  assert.equal(lwpLine.amountCents, 200000);
  assert.equal(lwpLine.calcTrace.source, "payroll_attendance_feed");
  // DSL order: DA (order 2) computed over the ALREADY-prorated BASIC — 42.00% of 29000.00.
  const da = lines.find((line) => line.componentCode === "DA");
  assert.equal(da.amountCents, 1218000);
  // Statutory cap: NPS 10% (290000) capped at the rate row's slab max 250000.
  const nps = lines.find((line) => line.componentCode === "NPS");
  assert.equal(nps.amountCents, 250000);
  assert.equal(nps.calcTrace.statutoryCap.uncappedCents, 290000);
  // State-wise PT: KA slab above 15000.00 gross probe -> 300.00.
  const pt = lines.find((line) => line.componentCode === "PT");
  assert.equal(pt.amountCents, 30000);
  assert.equal(payslip.grossCents, 4118000);
  assert.equal(payslip.deductionsCents, 280000);
  assert.equal(payslip.netPayCents, 3838000);
  assert.equal(payslip.paidDaysHundredths, 2900);
  assert.equal(payslip.lwpDaysHundredths, 200);
});

test("PH-09B G10 determinism: recompute of the same frozen snapshot yields deep-equal payslips and payslip_lines", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  const run = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, run.id);
  services.payrollEngine.computeEngineRun(maker, run.id);
  const first = services.payrollEngine.listRunPayslips(maker, run.id);
  // Recompute the SAME frozen snapshot: ids, order, and integer-cents amounts must be identical.
  services.payrollEngine.computeEngineRun(maker, run.id);
  const second = services.payrollEngine.listRunPayslips(maker, run.id);
  assert.deepEqual(second, first);
  // Same fixture in a fresh universe reproduces the same snapshot hash and totals.
  const other = createFoundationServices();
  seedRules(other);
  const otherRun = other.payrollEngine.createEngineRun(actor(), { period: "2026-08", runMode: "FINAL" });
  const otherSnapshotted = other.payrollEngine.snapshotRunInputs(actor(), otherRun.id);
  const { run: otherComputed } = other.payrollEngine.computeEngineRun(actor(), otherRun.id);
  assert.equal(otherSnapshotted.snapshotHash, services.payrollEngine.getEngineRun(maker, run.id).snapshotHash);
  const { run: computed } = services.payrollEngine.computeEngineRun(maker, run.id);
  assert.deepEqual(
    { gross: otherComputed.grossTotalCents, deductions: otherComputed.deductionTotalCents, net: otherComputed.netTotalCents },
    { gross: computed.grossTotalCents, deductions: computed.deductionTotalCents, net: computed.netTotalCents }
  );
});

test("PH-09B NEGATIVE: every mutation path after lock throws ERR-G10-RUN-IMMUTABLE", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  const runId = runPeriodToLock(services, "2026-08");
  assert.equal(services.payrollEngine.getEngineRun(maker, runId).status, "LOCKED");
  // Locked runs and their payslips are immutable: snapshot, recompute, and approve all reject.
  assert.equal(codeOf(() => services.payrollEngine.computeEngineRun(maker, runId)), "ERR-G10-RUN-IMMUTABLE");
  assert.equal(codeOf(() => services.payrollEngine.snapshotRunInputs(maker, runId)), "ERR-G10-RUN-IMMUTABLE");
  assert.equal(codeOf(() => services.payrollEngine.approveEngineRun(approver(), runId)), "ERR-G10-RUN-IMMUTABLE");
});

test("PH-09B NEGATIVE: a second concurrent FINAL run for the period throws ERR-G10-RUN-INFLIGHT", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  const first = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" });
  // Concurrent FINAL run for the same period rejects while the first is in flight.
  assert.equal(codeOf(() => services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" })), "ERR-G10-RUN-INFLIGHT");
  // A DRAFT (what-if) run does not take the in-flight slot.
  const draft = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "DRAFT" });
  assert.equal(draft.runMode, "DRAFT");
  // Once the FINAL run is locked (terminal), the period frees up again.
  services.payrollEngine.snapshotRunInputs(maker, first.id);
  services.payrollEngine.computeEngineRun(maker, first.id);
  services.payrollEngine.approveEngineRun(approver(), first.id);
  services.payrollEngine.lockEngineRun(maker, first.id);
  const next = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" });
  assert.equal(next.status, "QUEUED");
});

test("PH-09B arrears engine: month-wise breakup persists old/new/delta rows and total = Σ months (new − old)", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  // Two locked months paid at BASIC 31000.00 (no LWP): Aug + Sep 2026.
  runPeriodToLock(services, "2026-08");
  runPeriodToLock(services, "2026-09");
  // Retrospective revision: BASIC 31000.00 -> 33000.00 across both months.
  const arrear = services.payrollEngine.computeArrear(maker, {
    employeeId: ph03Ids.employee,
    arrearType: "PAY_FIXATION",
    sourceReference: "G06:pay-fixation-order:0001",
    periodFrom: "2026-08",
    periodTo: "2026-09",
    revisedComponentAmountsCents: { BASIC: 3300000 },
  });
  // Month-wise component-wise breakup rows persisted — per month: old value, new value, delta.
  assert.deepEqual(arrear.monthWiseBreakup, [
    { period: "2026-08", componentCode: "BASIC", oldAmountCents: 3100000, newAmountCents: 3300000, deltaCents: 200000 },
    { period: "2026-08", componentCode: "DA", oldAmountCents: 1302000, newAmountCents: 1386000, deltaCents: 84000 },
    { period: "2026-09", componentCode: "BASIC", oldAmountCents: 3100000, newAmountCents: 3300000, deltaCents: 200000 },
    { period: "2026-09", componentCode: "DA", oldAmountCents: 1302000, newAmountCents: 1386000, deltaCents: 84000 },
  ]);
  // Total arrear = Σ over affected months of (new − old), proven from the persisted rows.
  const sumOfDeltas = arrear.monthWiseBreakup.reduce((total, row) => total + row.deltaCents, 0);
  assert.equal(arrear.grossArrearCents, sumOfDeltas);
  assert.equal(arrear.netArrearCents, 568000);
  assert.equal(arrear.deductionArrearCents, 0); // NPS stays at its statutory cap; PT slab unchanged.
  assert.equal(arrear.status, "COMPUTED");

  // Approved arrear books into the NEXT run as an ADDITIVE line carrying arrear_ref.
  services.payrollEngine.approveArrear(approver(), arrear.id);
  const october = services.payrollEngine.createEngineRun(maker, { period: "2026-10", runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, october.id);
  services.payrollEngine.computeEngineRun(maker, october.id);
  const [{ payslip, lines }] = services.payrollEngine.listRunPayslips(maker, october.id);
  const arrearLine = lines.find((line) => line.lineType === "ARREAR");
  assert.equal(arrearLine.amountCents, 568000);
  assert.equal(arrearLine.arrearRef, arrear.id);
  assert.equal(payslip.grossCents, 4402000 + 568000);
  services.payrollEngine.approveEngineRun(approver(), october.id);
  services.payrollEngine.lockEngineRun(maker, october.id);
  const paid = services.payrollEngine.getArrear(maker, arrear.id);
  assert.equal(paid.status, "PAID");
  assert.equal(paid.paidInRunId, october.id);
});

test("PH-09B net-pay floor: excess recovery is held (ERR-G10-RECOVERY-NET) and booked into deduction_carryforwards", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  // FR-09: 20000.00 recovery demanded against a 50% protected net-pay floor.
  services.payrollEngine.addRecoveryDemand(maker, {
    employeeId: ph03Ids.employee,
    period: "2026-08",
    amountCents: 2000000,
    sourceType: "RECOVERY",
    sourceRef: "G09:penalty-order:0001",
  });
  const run = services.payrollEngine.createEngineRun(maker, { period: "2026-08", runMode: "FINAL" });
  services.payrollEngine.snapshotRunInputs(maker, run.id);
  const { payslips } = services.payrollEngine.computeEngineRun(maker, run.id);
  const [payslip] = payslips;
  // Gross 44020.00, floor 22010.00, net-before-recovery 41220.00 -> only 19210.00 may apply.
  const [{ lines }] = services.payrollEngine.listRunPayslips(maker, run.id);
  const recoveryLine = lines.find((line) => line.componentCode === "RECOVERY");
  assert.equal(recoveryLine.amountCents, 1921000);
  assert.equal(payslip.netPayCents, 2201000); // exactly the protected floor
  // The excess beyond the floor is HELD with ERR-G10-RECOVERY-NET, not silently dropped.
  assert.equal(payslip.recoveryHold.code, "ERR-G10-RECOVERY-NET");
  assert.equal(payslip.recoveryHold.heldCents, 79000);
  // Lock books the held excess into an E35 deduction_carryforwards row for the next cycle.
  services.payrollEngine.approveEngineRun(approver(), run.id);
  services.payrollEngine.lockEngineRun(maker, run.id);
  const carryforwards = services.payrollEngine.listCarryforwards(maker, ph03Ids.employee);
  assert.equal(carryforwards.length, 1);
  const [carryforward] = carryforwards;
  assert.equal(carryforward.sourceType, "RECOVERY");
  assert.equal(carryforward.originalAmountCents, 79000);
  assert.equal(carryforward.outstandingCents, 79000);
  assert.equal(carryforward.recoveredToDateCents, 0);
  assert.equal(carryforward.status, "OPEN");
  assert.equal(carryforward.bookedFromRunId, run.id);
  assert.ok(services.audit.listAudit(maker).some((entry) => entry.subjectRef.startsWith("g10_deduction_carryforwards:")));
});

test("PH-09B reopen supersedes: originals REVERSED, successor recomputes v2, and YTD (VAL-G10-YTD-DERIVE) self-heals", async () => {
  const services = createFoundationServices();
  seedRules(services);
  const maker = actor();
  const runId = runPeriodToLock(services, "2026-08");
  const ytdBefore = services.payrollEngine.getYtdStatement(maker, ph03Ids.employee);
  assert.equal(ytdBefore.validation, "VAL-G10-YTD-DERIVE");
  assert.equal(ytdBefore.grossCents, 4402000);

  const { supersededRun, successorRun } = services.payrollEngine.reopenEngineRun(maker, runId, { reason: "Bank detail correction before transmission" });
  assert.equal(supersededRun.status, "SUPERSEDED");
  assert.equal(successorRun.supersededRunId, runId);
  // Originals flip to REVERSED — the payslip_lines ledger rows are never edited.
  const originals = services.payrollEngine.listRunPayslips(maker, runId);
  assert.equal(originals[0].payslip.status, "REVERSED");
  assert.equal(originals[0].payslip.supersessionReason, "REOPEN");
  // YTD derives from SURVIVING lines only, so the reversed month drops out immediately.
  assert.equal(services.payrollEngine.getYtdStatement(maker, ph03Ids.employee).grossCents, 0);

  // Successor recompute publishes version 2; YTD self-heals from the new surviving lines.
  services.payrollEngine.snapshotRunInputs(maker, successorRun.id);
  services.payrollEngine.computeEngineRun(maker, successorRun.id);
  services.payrollEngine.approveEngineRun(approver(), successorRun.id);
  services.payrollEngine.lockEngineRun(maker, successorRun.id);
  const [{ payslip: reissued }] = services.payrollEngine.listRunPayslips(maker, successorRun.id);
  assert.equal(reissued.version, 2);
  assert.equal(reissued.status, "PUBLISHED");
  const ytdAfter = services.payrollEngine.getYtdStatement(maker, ph03Ids.employee);
  assert.equal(ytdAfter.grossCents, 4402000);
  assert.equal(ytdAfter.byComponent.BASIC, 3100000);

  // NEGATIVE: reopen after bank transmission is blocked (ERR-G10-REOPEN-BLOCKED).
  services.payrollEngine.markRunTransmitted(maker, successorRun.id);
  assert.equal(codeOf(() => services.payrollEngine.reopenEngineRun(maker, successorRun.id, { reason: "Too late" })), "ERR-G10-REOPEN-BLOCKED");
});
