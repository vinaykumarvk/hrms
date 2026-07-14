const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "View payslips and payroll history — download payslips, check salary breakdowns, tax
// deductions (G10)". Exercised over HTTP against the seedTestEmployees:true real payroll-engine
// lifecycle (Arjun's real 2026-06 PUBLISHED payslip), not mocked/hard-coded records.

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["employee"],
    fieldGrants: ["*"],
    ...extra,
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  return { services, api, admin, arjun, rohan };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g10-payslip-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G10 payslips: the seed produces a real PUBLISHED payslip for Arjun (2026-06) with a full earnings/deductions breakdown", () => {
  const { api, arjun } = boot();
  const result = call(api, actor(arjun.id, ["g10.payroll.read"]), { method: "GET", path: `/api/v1/payroll/employees/${arjun.id}/payslips` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  const record = result.body.items[0];
  assert.equal(record.payslip.status, "PUBLISHED");
  assert.equal(record.payslip.period, "2026-06");
  assert.equal(record.payslip.grossCents, 8500000);
  assert.ok(record.lines.some((line) => line.componentCode === "BASIC" && line.lineType === "EARNING"));
  assert.ok(record.lines.some((line) => line.componentCode === "PT" && line.lineType === "DEDUCTION"));
});

test("G10 payslips: the wire response never leaks internal tenantId/entityId/runId/calcTrace fields", () => {
  const { api, arjun } = boot();
  const result = call(api, actor(arjun.id, ["g10.payroll.read"]), { method: "GET", path: `/api/v1/payroll/employees/${arjun.id}/payslips` });
  assert.equal(result.status, 200);
  const record = result.body.items[0];
  for (const internalField of ["tenantId", "entityId", "runId"]) {
    assert.equal(internalField in record.payslip, false, `payslip must not leak ${internalField}`);
  }
  for (const line of record.lines) {
    assert.equal("calcTrace" in line, false, "line must not leak calcTrace");
    assert.equal("tenantId" in line, false, "line must not leak tenantId");
    assert.equal("payslipId" in line, false, "line must not leak payslipId");
  }
  assert.equal(record.payslip.version, 1);
});

test("G10 payslips: an employee can view their own YTD statement over HTTP", () => {
  const { api, arjun } = boot();
  const result = call(api, actor(arjun.id, ["g10.payroll.read"]), { method: "GET", path: `/api/v1/payroll/employees/${arjun.id}/ytd` });
  assert.equal(result.status, 200);
  assert.equal(result.body.ytd.grossCents, 8500000);
  assert.equal(result.body.ytd.deductionsCents, 30000);
  assert.equal(result.body.ytd.netCents, 8470000);
});

test("G10 payslips: an employee cannot view another employee's payslips or YTD (P02 own-record scope)", () => {
  const { api, arjun, rohan } = boot();
  const forbiddenPayslips = call(api, actor(rohan.id, ["g10.payroll.read"]), {
    method: "GET",
    path: `/api/v1/payroll/employees/${arjun.id}/payslips`,
  });
  assert.equal(forbiddenPayslips.status, 403);

  const forbiddenYtd = call(api, actor(rohan.id, ["g10.payroll.read"]), {
    method: "GET",
    path: `/api/v1/payroll/employees/${arjun.id}/ytd`,
  });
  assert.equal(forbiddenYtd.status, 403);
});

test("G10 payslips: the enrolment route persists componentAmountsCents that a subsequent engine run picks up", () => {
  const { api, admin, rohan } = boot();
  const payrollOfficer = actor(
    "payroll-officer-enrol-probe",
    ["g10.salary.write", "g10.payroll.run.create", "g10.payroll.input.lock", "g10.payroll.compute", "g10.payroll.approve", "g10.payroll.lock", "g10.payroll.read"],
    { roles: ["payroll_officer"] }
  );
  call(api, admin, {
    method: "POST",
    path: "/api/v1/payroll/pay-components",
    headers: { "Idempotency-Key": "idem-enrol-comp-basic" },
    body: { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" },
  });
  call(api, admin, {
    method: "POST",
    path: "/api/v1/payroll/pay-rules",
    headers: { "Idempotency-Key": "idem-enrol-rule-basic" },
    body: { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" },
  });
  const enrolled = call(api, payrollOfficer, {
    method: "POST",
    path: `/api/v1/payroll/employees/${rohan.id}/enrolments`,
    headers: { "Idempotency-Key": "idem-enrol-001" },
    body: { stateOfPosting: "KA", componentAmountsCents: { BASIC: 3000000 }, effectiveFrom: "2026-01-01" },
  });
  assert.equal(enrolled.status, 201);
  assert.equal(enrolled.body.enrolment.componentAmountsCents.BASIC, 3000000);

  const run = call(api, payrollOfficer, { method: "POST", path: "/api/v1/payroll/engine-runs", headers: { "Idempotency-Key": "idem-enrol-run" }, body: { period: "2026-04", runMode: "FINAL" } });
  call(api, payrollOfficer, { method: "POST", path: `/api/v1/payroll/engine-runs/${run.body.run.id}:snapshot`, headers: { "Idempotency-Key": "idem-enrol-snap" }, body: {} });
  const computed = call(api, payrollOfficer, { method: "POST", path: `/api/v1/payroll/engine-runs/${run.body.run.id}:compute`, headers: { "Idempotency-Key": "idem-enrol-compute" }, body: {} });
  assert.equal(computed.status, 202);

  const approver = actor("payroll-officer-enrol-approver", ["g10.payroll.approve"], { roles: ["payroll_officer"] });
  call(api, approver, { method: "POST", path: `/api/v1/payroll/engine-runs/${run.body.run.id}:approve`, headers: { "Idempotency-Key": "idem-enrol-approve" }, body: {} });
  call(api, payrollOfficer, { method: "POST", path: `/api/v1/payroll/engine-runs/${run.body.run.id}:lock`, headers: { "Idempotency-Key": "idem-enrol-lock" }, body: {} });

  const payslips = call(api, actor(rohan.id, ["g10.payroll.read"]), { method: "GET", path: `/api/v1/payroll/employees/${rohan.id}/payslips` });
  assert.equal(payslips.status, 200);
  assert.ok(payslips.body.items.some((entry) => entry.payslip.period === "2026-04" && entry.payslip.grossCents === 3000000));
});

test("G10 payslips: a payroll officer (override role) can view any employee's payslips and YTD", () => {
  const { api, arjun } = boot();
  const payrollOfficer = actor("payroll-officer-probe", ["g10.payroll.read"], { roles: ["payroll_officer"] });
  const payslips = call(api, payrollOfficer, { method: "GET", path: `/api/v1/payroll/employees/${arjun.id}/payslips` });
  assert.equal(payslips.status, 200);
  assert.equal(payslips.body.items.length, 1);

  const ytd = call(api, payrollOfficer, { method: "GET", path: `/api/v1/payroll/employees/${arjun.id}/ytd` });
  assert.equal(ytd.status, 200);
  assert.equal(ytd.body.ytd.grossCents, 8500000);
});
