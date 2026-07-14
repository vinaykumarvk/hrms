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
    userId: "user-ph09-g10-maker",
    actorUserId: "user-ph09-g10-maker",
    permissions: ["*"],
    roles: ["payroll_officer"],
    fieldGrants: [],
    correlationId: "corr-ph09-g10",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph09-g10", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function seedPayroll(services, period = "2026-08") {
  const maker = actor();
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
    period,
    sourceModule: "G03",
    code: "LOP",
    lopDays: 2,
    sourceRef: "G03:leave-without-pay:0001",
  });
  services.payroll.addAdjustment(maker, {
    employeeId: ph03Ids.employee,
    period,
    sourceModule: "G06",
    code: "PROMOTION_ARREARS",
    amountCents: 50000,
    sourceRef: "G06:promotion-order:0001",
  });
  const run = services.payroll.createRun(maker, { period });
  services.payroll.lockInputs(maker, run.id);
  const computed = services.payroll.computeRun(maker, run.id);
  services.payroll.reconcileRun(maker, run.id);
  assert.throws(
    () => services.payroll.approveRun(maker, run.id),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "PAYROLL_SOD"
  );
  services.payroll.approveRun(actor({ userId: "user-ph09-g10-approver", actorUserId: "user-ph09-g10-approver" }), run.id);
  services.payroll.lockRun(maker, run.id);
  const disbursed = services.payroll.disburseRun(maker, run.id);
  return { computed, disbursed };
}

test("PH-09 G10 computes deterministic PAYROLL_TRACE with RULE_VERSION_SNAPSHOT and G03_LOP_PAYROLL_IMPACT", async () => {
  const services = createFoundationServices();
  const { computed, disbursed } = seedPayroll(services);
  assert.equal(computed.status, "COMPUTED");
  assert.equal(computed.ruleVersionSnapshot, `${ph03Ids.employee}:PAY-RULE-2026-01`);
  assert.equal(computed.inputSnapshotMarker, "RULE_VERSION_SNAPSHOT");
  assert.equal(computed.provenanceMarker, "PROVENANCE_COMPLETE");
  assert.equal(computed.lines.length, 1);
  assert.equal(computed.lines[0].trace.some((step) => step.marker === "PAYROLL_TRACE"), true);
  assert.equal(computed.lines[0].trace.some((step) => step.marker === "G03_LOP_PAYROLL_IMPACT"), true);
  assert.equal(computed.lines[0].grossCents, 14050001);
  assert.equal(computed.lines[0].deductionsCents, 2011999);
  assert.equal(computed.lines[0].netPayCents, 12038002);
  assert.equal(disbursed.bankBatch.marker, "BANK_X3_EXPORT");
  assert.equal(disbursed.bankBatch.adapter, "X3_BANK_SANDBOX");
  assert.equal(services.payroll.getLastPayDrawn(actor(), ph03Ids.employee).marker, "G10_LAST_PAY_DRAWN_FEED");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G10_PAYROLL_COMPUTED" && entry.metadata.marker === "PAYROLL_TRACE"));
});

test("PH-09 G10 reproducibility gives identical totals for same snapshot inputs", async () => {
  const first = createFoundationServices();
  const second = createFoundationServices();
  const firstRun = seedPayroll(first, "2026-09").computed;
  const secondRun = seedPayroll(second, "2026-09").computed;
  assert.deepEqual(firstRun.totals, secondRun.totals);
  assert.equal(firstRun.inputSnapshotHash, secondRun.inputSnapshotHash);
});

test("PH-09 G10 routes expose protected payroll run lifecycle and summary", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  assert.equal(
    (await call(api, {
      method: "POST",
      path: "/api/v1/payroll/salary-structures",
      headers: { "Idempotency-Key": "idem-ph09-g10-salary-001" },
      body: { effectiveFrom: "2026-07-01" },
    })).status,
    201
  );
  const run = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/runs",
    headers: { "Idempotency-Key": "idem-ph09-g10-run-001" },
    body: { period: "2026-10" },
  });
  assert.equal(run.status, 201);
  assert.equal(
    (await call(api, {
      method: "POST",
      path: `/api/v1/payroll/runs/${run.body.payrollRun.id}:lock-inputs`,
      headers: { "Idempotency-Key": "idem-ph09-g10-lock-inputs-001" },
      body: {},
    })).body.payrollRun.status,
    "INPUT_LOCKED"
  );
  assert.equal(
    (await call(api, {
      method: "POST",
      path: `/api/v1/payroll/runs/${run.body.payrollRun.id}:compute`,
      headers: { "Idempotency-Key": "idem-ph09-g10-compute-001" },
      body: {},
    })).body.payrollRun.status,
    "COMPUTED"
  );
  const summary = await call(api, { method: "GET", path: "/api/v1/payroll/summary" });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.calculationMarker, "PAYROLL_TRACE");
  assert.equal(summary.body.ruleSnapshotMarker, "RULE_VERSION_SNAPSHOT");
});
