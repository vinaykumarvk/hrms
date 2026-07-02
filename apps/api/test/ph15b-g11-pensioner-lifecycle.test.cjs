const test = require("node:test");
const assert = require("node:assert/strict");

// PH-15B oracle tests — G11 pensioner lifecycle + revisions at BRD depth on the PH-09
// pension engine (FR-G11-12 / FR-G11-13):
//   - the pen_pensioners master row is created ON PPO AUTHORISATION, never hand-keyed;
//   - pen_life_certificates: an LC overdue beyond grace suspends the lifecycle to
//     SUSPENDED_NO_LC and HOLDS disbursement (NEGATIVE: ERR-G11-LC-SUSPENDED, fail closed);
//     submitting an LC reactivates the pensioner and releases the held pension WITH ARREAR;
//   - death of a SELF pensioner converts to family pension through the E26
//     pen_family_members hierarchy (PH-09C pen_family_pension_rates engine,
//     enhanced_basis=AFTER_RETIREMENT), issues a FAMILY_PENSION PPO, and moves the
//     pensioner to CONVERTED_TO_FAMILY in one transaction;
//   - pen_revisions: DA-relief and pay-commission batches compute DETERMINISTIC old/new
//     deltas with month-wise arrears from the effective date (recompute is deep-equal),
//     require approval before APPLY, and are IMMUTABLE once applied (NEGATIVE:
//     ERR-G11-REVISION-IMMUTABLE — corrections create a new batch).
// All amounts are INTEGER paise; DA rates come from pen_da_relief_rates fixtures.

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph15b-g11-maker",
    actorUserId: "user-ph15b-g11-maker",
    permissions: ["*"],
    roles: ["pension_officer"],
    fieldGrants: [],
    correlationId: "corr-ph15b-g11",
    ...extra,
  };
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
  const maker = actor({ userId: "user-ph15b-payroll-maker", actorUserId: "user-ph15b-payroll-maker" });
  const approver = actor({ userId: "user-ph15b-payroll-approver", actorUserId: "user-ph15b-payroll-approver" });
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

// E30-E36 effective rule rows (PH-09A substrate) — integer cents/bps fixtures. The
// PENSIONER-scoped pen_da_relief_rates rows feed the FR-13 DA revision batches.
function seedPensionRules(services) {
  const admin = actor({ userId: "user-ph15b-rule-admin", actorUserId: "user-ph15b-rule-admin", roles: ["rule_admin"] });
  services.pensionRules.addPensionLimitRule(admin, {
    ruleCode: "E35-2026",
    minPensionCents: 900000,
    maxPensionCents: 12500000,
    minQualifyingYearsForPension: 10,
    effectiveFrom: "2026-01-01",
  });
  services.pensionRules.addRoundingRule(admin, { ruleCode: "E36-2026", effectiveFrom: "2026-01-01" });
  services.pensionRules.addFamilyPensionRate(admin, {
    ruleCode: "E32-2026",
    normalRateBps: 3000, // BRD FR-08: normal rate (30%)
    enhancedRateBps: 5000, // BRD FR-08: enhanced rate (50%)
    effectiveFrom: "2026-01-01",
  });
  // E30 Dearness Relief for PENSIONERS: 50% until 2027-06-30, then 56% (fixture step).
  services.pensionRules.addDaReliefRate(admin, {
    ruleCode: "E30-DR-2026",
    appliesTo: "PENSIONER",
    daPercentBps: 5000,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-06-30",
  });
  services.pensionRules.addDaReliefRate(admin, {
    ruleCode: "E30-DR-2027",
    appliesTo: "PENSIONER",
    daPercentBps: 5600,
    effectiveFrom: "2027-07-01",
  });
}

// Drive a case to PPO_ISSUED — the PPO authorisation hook enrols the pensioner (FR-12).
function issuedPensioner(services) {
  const maker = actor();
  const sanctioner = actor({ userId: "user-ph15b-sanctioner", actorUserId: "user-ph15b-sanctioner" });
  const pensionCase = services.pension.createCase(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-11-30",
    scheme: "OPS",
  });
  services.pension.verifyService(maker, pensionCase.id, { totalServiceMonths: 360, srCertified: true });
  services.pension.computeBenefits(maker, pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  services.pension.sanction(sanctioner, pensionCase.id);
  const issued = services.pension.issuePpo(maker, pensionCase.id, { idempotencyKey: `idem-ph15b-ppo-${pensionCase.id}` });
  const pensioner = services.pensionerLifecycle.findPensionerByCase(maker, pensionCase.id);
  assert.ok(pensioner, "PPO authorisation must create the pen_pensioners master row");
  return { maker, sanctioner, pensionCase: issued, pensioner };
}

test("PH-15B G11 FR-12 pensioner enrolment: pen_pensioners created on PPO authorisation, never detached", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker, pensionCase, pensioner } = issuedPensioner(services);
  // The master row derives entirely from the authorised PPO + FR-05 calculation.
  assert.equal(pensioner.lifecycleStatus, "ACTIVE");
  assert.equal(pensioner.pensionerType, "SELF");
  assert.equal(pensioner.ppoId, pensionCase.ppo.id);
  assert.equal(pensioner.ppoNo, pensionCase.ppo.ppoNo);
  assert.equal(pensioner.ppoType, "SERVICE_PENSION");
  assert.equal(pensioner.currentPensionBasicPaise, 5000000); // flat 50% of last basic (FR-05)
  // AC1: the first LC falls due one year after commencement.
  assert.equal(pensioner.lifeCertValidUntil, "2027-11-30");
  assert.ok(pensioner.pensionerNo.startsWith("PNR/2026/"));
  assert.equal(services.pensionerLifecycle.getPensioner(maker, pensioner.id).id, pensioner.id);
  // NEGATIVE: a pensioner row can never be hand-keyed off a case without an authorised PPO.
  const detachedCase = services.pension.createCase(maker, { employeeId: ph03Ids.employee, separationDate: "2026-12-31", scheme: "OPS" });
  assert.equal(codeOf(() => services.pensionerLifecycle.enrolFromPpo(maker, detachedCase)), "PRECONDITION_FAILED");
  assert.ok(services.audit.listAudit(maker).some((entry) => entry.action === "G11_PENSIONER_ENROLLED"));
});

test("PH-15B G11 FR-12 AC1/AC2 life-certificate lifecycle: lapse -> SUSPENDED_NO_LC -> submit -> release WITH arrear", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker, pensioner } = issuedPensioner(services);
  // Within grace (BR1: configurable) nothing suspends.
  assert.equal(services.pensionerLifecycle.evaluateLifeCertificates(maker, { asOf: "2027-12-15", graceDays: 30 }).length, 0);
  // AC1: overdue beyond grace (due 2027-11-30 + 30d < 2028-01-15) suspends the lifecycle.
  const suspended = services.pensionerLifecycle.evaluateLifeCertificates(maker, { asOf: "2028-01-15", graceDays: 30 });
  assert.equal(suspended.length, 1);
  assert.equal(suspended[0].lifecycleStatus, "SUSPENDED_NO_LC");
  assert.equal(services.pensionerLifecycle.getPensioner(maker, pensioner.id).lifecycleStatus, "SUSPENDED_NO_LC");
  // AC2: LC submission (DLC) reactivates and releases the held pension WITH ARREAR —
  // suspension counted from the lapsed due date 2027-11-30 to the 2028-02 submission:
  // 3 held months x 5000000 monthly basic = 15000000 paise.
  const submission = services.pensionerLifecycle.submitLifeCertificate(maker, pensioner.id, {
    certificateYear: 2028,
    method: "JEEVAN_PRAMAAN_DLC",
    submittedOn: "2028-02-10",
    jeevanPramaanId: "JP-PH15B-0001",
  });
  assert.equal(submission.releasedFromSuspension, true);
  assert.equal(submission.heldMonths, 3);
  assert.equal(submission.releasedArrearPaise, 15000000);
  assert.equal(submission.pensioner.lifecycleStatus, "ACTIVE");
  assert.equal(submission.lifeCertificate.result, "VALID");
  assert.equal(submission.lifeCertificate.validUntil, "2029-02-10");
  assert.equal(submission.pensioner.lifeCertValidUntil, "2029-02-10");
  const certificates = services.pensionerLifecycle.listLifeCertificates(maker, pensioner.id);
  assert.equal(certificates.filter((row) => row.status === "ACTIVE").length, 1);
});

test("PH-15B G11 FR-12 AC1 NEGATIVE: disbursement while SUSPENDED_NO_LC fails closed with ERR-G11-LC-SUSPENDED", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker, pensionCase, pensioner } = issuedPensioner(services);
  // A PASSED pre-credit verification (IR16) so ONLY the LC gate is in question.
  const account = { accountNoMasked: "XXXXXX1234", ifsc: "SBIN0000001" };
  services.pensionDisbursement.recordAccountVerification(maker, {
    caseId: pensionCase.id,
    ...account,
    accountName: "A Sharma",
    method: "PENNY_DROP",
    nameMatchScoreBps: 9800,
    result: "PASSED",
  });
  // While ACTIVE the monthly pension transmits.
  const paid = services.pensionDisbursement.disburse(maker, { caseId: pensionCase.id, lineType: "MONTHLY_PENSION", ...account, amountPaise: 5000000 });
  assert.equal(paid.status, "TRANSMITTED");
  // Lapse the LC beyond grace -> SUSPENDED_NO_LC holds disbursement (AC1).
  services.pensionerLifecycle.evaluateLifeCertificates(maker, { asOf: "2028-01-15", graceDays: 30 });
  assert.throws(
    () => services.pensionDisbursement.disburse(maker, { caseId: pensionCase.id, lineType: "MONTHLY_PENSION", ...account, amountPaise: 5000000 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-LC-SUSPENDED" && String(error.details.pensionerId) === pensioner.id
  );
  // Submitting the LC releases the hold — the same credit now transmits (AC2).
  services.pensionerLifecycle.submitLifeCertificate(maker, pensioner.id, {
    certificateYear: 2028,
    method: "PHYSICAL",
    submittedOn: "2028-02-10",
  });
  const released = services.pensionDisbursement.disburse(maker, { caseId: pensionCase.id, lineType: "MONTHLY_PENSION", ...account, amountPaise: 5000000 });
  assert.equal(released.status, "TRANSMITTED");
});

test("PH-15B G11 FR-12 AC4 death conversion: E26 hierarchy -> family pension + FAMILY_PENSION PPO -> CONVERTED_TO_FAMILY", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker, pensioner } = issuedPensioner(services);
  // NEGATIVE (failure handling): no ACTIVE E26 member -> conversion halts with the
  // legal-heir flag; the pensioner is NOT half-converted.
  assert.equal(codeOf(() => services.pensionerLifecycle.reportDeath(maker, pensioner.id, { dateOfDeath: "2027-03-15" })), "PRECONDITION_FAILED");
  assert.equal(services.pensionerLifecycle.getPensioner(maker, pensioner.id).lifecycleStatus, "ACTIVE");
  // BR3/IR8: the statutory hierarchy — rank 1 (spouse) converts before rank 2 (child).
  services.pensionerLifecycle.registerFamilyMember(maker, {
    employeeId: ph03Ids.employee,
    memberName: "S Sharma",
    relation: "SPOUSE",
    statutoryRank: 1,
    dateOfBirth: "1968-05-20",
  });
  services.pensionerLifecycle.registerFamilyMember(maker, {
    employeeId: ph03Ids.employee,
    memberName: "R Sharma",
    relation: "SON",
    statutoryRank: 2,
    dateOfBirth: "1995-09-02",
  });
  const conversion = services.pensionerLifecycle.reportDeath(maker, pensioner.id, { dateOfDeath: "2027-03-15", source: "REPORTED" });
  // AC4: the SELF pensioner moved to CONVERTED_TO_FAMILY with the death facts recorded.
  assert.equal(conversion.pensioner.lifecycleStatus, "CONVERTED_TO_FAMILY");
  assert.equal(conversion.pensioner.dateOfDeath, "2027-03-15");
  assert.equal(services.pensionerLifecycle.getPensioner(maker, pensioner.id).lifecycleStatus, "CONVERTED_TO_FAMILY");
  // The E26 rank-1 member is the beneficiary — never the nominee register.
  assert.equal(conversion.familyMember.statutoryRank, 1);
  assert.equal(conversion.familyMember.relation, "SPOUSE");
  // FR-08 via the PH-09C engine: pen_family_pension_records with AFTER_RETIREMENT basis,
  // rates from the E32 pen_family_pension_rates fixture (30% normal / 50% enhanced).
  assert.equal(conversion.familyPension.enhancedBasis, "AFTER_RETIREMENT");
  assert.equal(conversion.familyPension.normalAmountCents, 3000000);
  assert.equal(conversion.familyPension.enhancedAmountCents, 5000000);
  assert.ok(conversion.familyPension.fpRateRef);
  // A FAMILY_PENSION PPO backs the spawned FAMILY pensioner row.
  assert.equal(conversion.familyPensioner.ppoType, "FAMILY_PENSION");
  assert.equal(conversion.familyPensioner.pensionerType, "FAMILY");
  assert.equal(conversion.familyPensioner.lifecycleStatus, "FAMILY_PENSION_ACTIVE");
  assert.equal(conversion.familyPensioner.sourcePensionerId, pensioner.id);
  assert.equal(conversion.familyPensioner.familyPensionRef, conversion.familyPension.id);
  assert.equal(conversion.familyPensioner.currentPensionBasicPaise, 5000000); // enhanced window from the event date
  // NEGATIVE: the terminated lifecycle rejects further LC/death mutations.
  assert.equal(
    codeOf(() => services.pensionerLifecycle.submitLifeCertificate(maker, pensioner.id, { certificateYear: 2028, method: "PHYSICAL", submittedOn: "2028-01-05" })),
    "CONFLICT"
  );
  assert.ok(services.audit.listAudit(maker).some((entry) => entry.action === "G11_DEATH_CONVERTED_TO_FAMILY" && entry.metadata.marker === "CONVERTED_TO_FAMILY"));
});

test("PH-15B G11 FR-13 revision determinism: pen_revisions DA batch recompute yields deep-equal deltas with month-wise arrears", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker } = issuedPensioner(services);
  const approver = actor({ userId: "user-ph15b-rev-approver", actorUserId: "user-ph15b-rev-approver" });
  // DA batch effective 2027-07-01: the E30 PENSIONER rate steps 50% -> 56% (snapshot BR1).
  const batch = services.pensionRevisions.createBatch(maker, { revisionType: "DA", effectiveDate: "2027-07-01" });
  assert.equal(batch.status, "DRAFT");
  assert.ok(batch.daRateRef); // pen_da_relief_rates row pinned to the batch — never a constant
  assert.equal(batch.daPercentBps, 5600);
  const first = services.pensionRevisions.computeBatch(maker, batch.id, { asOf: "2027-10-31" });
  assert.equal(first.length, 1);
  // Old monthly = 5000000 basic + 0 relief; new relief = 56% of basic = 2800000.
  assert.equal(first[0].oldBasicPaise, 5000000);
  assert.equal(first[0].newBasicPaise, 5000000);
  assert.equal(first[0].newDaReliefPaise, 2800000);
  assert.equal(first[0].monthlyDeltaPaise, 2800000);
  // AC2: month-wise arrears from the effective date — Jul..Oct = 4 months x 2800000.
  assert.equal(first[0].arrearMonths, 4);
  assert.equal(first[0].arrearsPaise, 11200000);
  assert.deepStrictEqual(
    first[0].calcTrace.monthWiseArrears.map((entry) => entry.month),
    ["2027-07", "2027-08", "2027-09", "2027-10"]
  );
  // §16.9 (IR18): DA applies at order 3 after pay-commission re-fix and restoration.
  assert.equal(first[0].applicationOrder, 3);
  assert.equal(services.pensionRevisions.getBatch(maker, batch.id).calcTrace.applicationOrderTable.PAY_COMMISSION, 1);
  // AC3 DETERMINISM: recomputing the SAME batch inputs yields DEEP-EQUAL deltas.
  const second = services.pensionRevisions.computeBatch(maker, batch.id, { asOf: "2027-10-31" });
  assert.deepStrictEqual(second, first);
  // AC3: P01 approval is required before APPLY — and the maker cannot self-approve (SoD).
  assert.equal(codeOf(() => services.pensionRevisions.applyBatch(maker, batch.id, { appliedOn: "2027-11-01" })), "PRECONDITION_FAILED");
  assert.equal(codeOf(() => services.pensionRevisions.approveBatch(maker, batch.id)), "PRECONDITION_FAILED");
  services.pensionRevisions.approveBatch(approver, batch.id);
  const applied = services.pensionRevisions.applyBatch(approver, batch.id, { appliedOn: "2027-11-01" });
  assert.equal(applied.status, "APPLIED");
  assert.ok(String(applied.jobRunRef).startsWith("JOB-G11-PENSION-RUN:"));
  // The pensioner master now carries the revised relief.
  const revised = services.pensionerLifecycle.getPensioner(maker, first[0].pensionerId);
  assert.equal(revised.currentDaReliefPaise, 2800000);
});

test("PH-15B G11 FR-13 pay-commission re-fix + NEGATIVE: mutating an APPLIED batch throws ERR-G11-REVISION-IMMUTABLE", () => {
  const services = createFoundationServices();
  seedLastPay(services);
  seedPensionRules(services);
  const { maker } = issuedPensioner(services);
  const approver = actor({ userId: "user-ph15b-rev-approver", actorUserId: "user-ph15b-rev-approver" });
  // AC2: pay-commission batch re-fixes basic by the snapshot fitment factor (2.57 x 10^4).
  const payCommission = services.pensionRevisions.createBatch(maker, {
    revisionType: "PAY_COMMISSION",
    effectiveDate: "2027-01-01",
    fitmentFactorTenThousandths: 25700,
  });
  const lines = services.pensionRevisions.computeBatch(maker, payCommission.id, { asOf: "2027-03-31" });
  assert.equal(lines[0].oldBasicPaise, 5000000);
  assert.equal(lines[0].newBasicPaise, 12850000); // 5000000 x 2.57 re-fixed basic
  assert.equal(lines[0].applicationOrder, 1); // §16.9: pay-commission re-fix applies FIRST
  assert.equal(lines[0].arrearMonths, 3); // Jan..Mar month-wise arrears
  assert.equal(lines[0].arrearsPaise, 23550000); // 3 x 7850000 monthly delta
  services.pensionRevisions.approveBatch(approver, payCommission.id);
  services.pensionRevisions.applyBatch(approver, payCommission.id, { appliedOn: "2027-04-01" });
  const revised = services.pensionerLifecycle.getPensioner(maker, lines[0].pensionerId);
  assert.equal(revised.currentPensionBasicPaise, 12850000);
  // NEGATIVE (AC4/P05): EVERY mutation of the APPLIED batch fails closed with
  // ERR-G11-REVISION-IMMUTABLE — recompute, re-approve, and re-apply alike.
  assert.throws(
    () => services.pensionRevisions.computeBatch(maker, payCommission.id, { asOf: "2027-06-30" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G11-REVISION-IMMUTABLE"
  );
  assert.equal(codeOf(() => services.pensionRevisions.approveBatch(approver, payCommission.id)), "ERR-G11-REVISION-IMMUTABLE");
  assert.equal(codeOf(() => services.pensionRevisions.applyBatch(approver, payCommission.id, { appliedOn: "2027-07-01" })), "ERR-G11-REVISION-IMMUTABLE");
  // Corrections create a NEW batch — which computes cleanly off the revised base.
  const correction = services.pensionRevisions.createBatch(maker, {
    revisionType: "PAY_COMMISSION",
    effectiveDate: "2027-01-01",
    fitmentFactorTenThousandths: 25800,
  });
  const correctionLines = services.pensionRevisions.computeBatch(maker, correction.id, { asOf: "2027-06-30" });
  assert.equal(correctionLines[0].oldBasicPaise, 12850000);
  assert.notEqual(correction.id, payCommission.id);
});
