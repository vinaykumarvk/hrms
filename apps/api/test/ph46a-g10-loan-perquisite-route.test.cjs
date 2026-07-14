const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph46a",
    actorUserId: "user-ph46a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph46a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph46a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function sanction(api, key, instalmentPaise) {
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/loans:sanction",
    headers: { "Idempotency-Key": key },
    body: { employeeId: ph03Ids.employee, loanType: "HBA", principalPaise: 100000, instalmentPaise },
  });
  assert.equal(res.status, 201);
  return res.body.loan.id;
}

test("PH-46A G10 loan instalment recovery with net-floor carryforward via the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await sanction(api, "loan-1", 25000);

  const paid = await call(api, { method: "POST", path: `/api/v1/payroll/loans/${id}:instalment`, headers: { "Idempotency-Key": "inst-1" }, body: { netAvailablePaise: 25000, recordedAt: "2026-07-02" } });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.repayment.recoveredPaise, 25000);
  assert.equal(paid.body.repayment.outstandingAfterPaise, 75000);

  // Zero net headroom: nothing recovered, whole instalment carries forward, fail closed.
  const blocked = await call(api, { method: "POST", path: `/api/v1/payroll/loans/${id}:instalment`, headers: { "Idempotency-Key": "inst-2" }, body: { netAvailablePaise: 0, recordedAt: "2026-08-02" } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "ERR-G10-RECOVERY-NET");

  const repayments = await call(api, { method: "GET", path: `/api/v1/payroll/loans/${id}/repayments` });
  assert.equal(repayments.status, 200);
  assert.equal(repayments.body.items.length, 1);

  const carryforwards = await call(api, { method: "GET", path: `/api/v1/payroll/employees/${ph03Ids.employee}/carryforwards` });
  assert.equal(carryforwards.status, 200);
  assert.ok(carryforwards.body.items.length >= 1);
});

test("PH-46A G10 loan foreclosure settles the outstanding in one row", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await sanction(api, "loan-fc", 25000);
  const foreclosed = await call(api, { method: "POST", path: `/api/v1/payroll/loans/${id}:foreclose`, headers: { "Idempotency-Key": "fc-1" }, body: { recordedAt: "2026-07-10" } });
  assert.equal(foreclosed.status, 202);
  assert.equal(foreclosed.body.repayment.kind, "FORECLOSURE");
  assert.equal(foreclosed.body.repayment.outstandingAfterPaise, 0);
});

test("PH-46A G10 Rule-3 concessional perquisite valuation; missing reference rate fails closed", async () => {
  const api = createFoundationApi(createFoundationServices());
  const valued = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/perquisites:value",
    headers: { "Idempotency-Key": "perq-1" },
    body: { employeeId: ph03Ids.employee, perquisiteType: "CONCESSIONAL_LOAN", isConcessional: true, baseAmountPaise: 1000000, referenceRateBps: 800, employeeRateBps: 400 },
  });
  assert.equal(valued.status, 201);
  assert.ok(valued.body.perquisite && valued.body.perquisite.id);

  const noRate = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/perquisites:value",
    headers: { "Idempotency-Key": "perq-2" },
    body: { employeeId: ph03Ids.employee, perquisiteType: "CONCESSIONAL_LOAN", isConcessional: true, baseAmountPaise: 1000000, employeeRateBps: 400 },
  });
  assert.equal(noRate.status, 422);
  assert.equal(noRate.body.error.code, "ERR-G10-PERQ-REFRATE");
});
