const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationServices,
  FoundationError,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph09-integration-maker",
    actorUserId: "user-ph09-integration-maker",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph09-integration",
    ...extra,
  };
}

test("PH-09 G03 LOP, G09 penalty, G10_LAST_PAY_DRAWN_FEED, SoD, and PROVENANCE_COMPLETE compose for pension", () => {
  const services = createFoundationServices();
  const maker = actor();
  const payrollApprover = actor({ userId: "user-ph09-payroll-approver", actorUserId: "user-ph09-payroll-approver" });
  const pensionSanctioner = actor({ userId: "user-ph09-pension-sanctioner", actorUserId: "user-ph09-pension-sanctioner" });

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
  services.payroll.addAdjustment(maker, {
    employeeId: ph03Ids.employee,
    period: "2026-12",
    sourceModule: "G03",
    code: "LOP",
    lopDays: 1,
    sourceRef: "G03:lop:PH09",
  });
  services.payroll.addAdjustment(maker, {
    employeeId: ph03Ids.employee,
    period: "2026-12",
    sourceModule: "G09",
    code: "PENALTY_RECOVERY",
    amountCents: 25000,
    sourceRef: "G09:penalty:PH09",
  });
  const run = services.payroll.createRun(maker, { period: "2026-12" });
  const locked = services.payroll.lockInputs(maker, run.id);
  assert.equal(locked.provenanceMarker, "PROVENANCE_COMPLETE");
  const computed = services.payroll.computeRun(maker, run.id);
  assert.equal(computed.lines[0].trace.some((step) => step.marker === "G03_LOP_PAYROLL_IMPACT"), true);
  services.payroll.reconcileRun(maker, run.id);
  assert.throws(
    () => services.payroll.approveRun(maker, run.id),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "PAYROLL_SOD"
  );
  services.payroll.approveRun(payrollApprover, run.id);
  services.payroll.lockRun(maker, run.id);
  services.payroll.disburseRun(maker, run.id);
  assert.equal(services.payroll.getLastPayDrawn(maker, ph03Ids.employee).marker, "G10_LAST_PAY_DRAWN_FEED");

  const pensionCase = services.pension.createCase(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-12-31",
    scheme: "OPS",
  });
  const verified = services.pension.verifyService(maker, pensionCase.id, {
    totalServiceMonths: 360,
    penaltyExclusionMonths: 6,
    srCertified: true,
  });
  assert.equal(verified.serviceVerification.penaltyMarker, "G09_PENALTY_QS_EXCLUSION");
  const calculated = services.pension.computeBenefits(maker, pensionCase.id, { ruleVersion: "PENSION-RULE-2026-01" });
  assert.equal(calculated.calculation.trace.marker, "PENSION_CALC_TRACE");
  assert.throws(
    () => services.pension.sanction(maker, pensionCase.id),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "PENSION_SOD"
  );
  services.pension.sanction(pensionSanctioner, pensionCase.id);
  const ppo = services.pension.issuePpo(maker, pensionCase.id, { idempotencyKey: "idem-ph09-integration-ppo-001" });
  assert.equal(ppo.ppo.marker, "PPO_ISSUED");
  assert.equal(services.serviceRegister.getTimeline(maker, ph03Ids.employee).filter((event) => event.sourceModule === "G11").length, 2);
});
