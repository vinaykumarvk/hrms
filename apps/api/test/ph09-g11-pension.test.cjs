const test = require("node:test");
const assert = require("node:assert/strict");

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

test("PH-09 G11 computes PENSION_CALC_TRACE, enforces PENSION_SOD, issues PPO, and posts G11_SR_POSTED events", () => {
  const services = createFoundationServices();
  seedLastPay(services);
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
  assert.equal(computed.calculation.pensionCents, 2636364);
  assert.equal(computed.calculation.gratuityCents, 52727273);
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

test("PH-09 G11 routes expose pension case verification and summary", () => {
  const services = createFoundationServices();
  seedLastPay(services);
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
  const summary = call(api, { method: "GET", path: "/api/v1/pension/summary" });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.serviceGateMarker, "SR_VERIFICATION_GATE");
});
