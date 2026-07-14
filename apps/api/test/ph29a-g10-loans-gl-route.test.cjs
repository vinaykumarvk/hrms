// PH-29A — G10 loans + GL->ERP export routes (route exposure for the PH-16F/PH-25A engines).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph29a",
    actorUserId: "user-ph29a",
    permissions: ["*"],
    roles: ["finance_officer"],
    fieldGrants: [],
    correlationId: "corr-ph29a",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph29a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-29A POST /api/v1/payroll/loans:sanction sanctions a loan", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/loans:sanction",
    headers: { "Idempotency-Key": "idem-ph29a-loan" },
    body: { employeeId: ph03Ids.employee, loanType: "HBA", principalPaise: 1000000, instalmentPaise: 400000 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.loan.outstandingPaise, 1000000);
  assert.equal(res.body.loan.status, "ACTIVE");
});

test("PH-29A POST /api/v1/payroll/gl-export posts a balanced GL batch to the ERP", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/gl-export",
    headers: { "Idempotency-Key": "idem-ph29a-gl" },
    body: { exportKey: "GLX-ROUTE-1", totalDebitPaise: 500000, totalCreditPaise: 500000, erpReference: "ERP-DOC-9" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.batch.status, "POSTED");
  assert.equal(res.body.replayed, false);
});
