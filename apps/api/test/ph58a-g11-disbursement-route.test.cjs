const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph58a",
    actorUserId: "user-ph58a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph58a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph58a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-58A G11 disbursement rejects non-positive paise (VALIDATION_FAILED)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = await call(api, {
    method: "POST",
    path: "/api/v1/pension/disbursements",
    headers: { "Idempotency-Key": "dis-bad" },
    body: { caseId: "any-case", lineType: "MONTHLY_PENSION", accountNoMasked: "XXXX1234", ifsc: "SBIN0001234", amountPaise: 0 },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});

test("PH-58A G11 pension disbursement/lifecycle reads respond through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());

  const disbursements = await call(api, { method: "GET", path: "/api/v1/pension/cases/any-case/disbursements" });
  assert.equal(disbursements.status, 200);
  assert.ok(Array.isArray(disbursements.body.items));

  // life certificates require an existing pensioner — an unknown pensioner fails closed (NOT_FOUND).
  const lifeCerts = await call(api, { method: "GET", path: "/api/v1/pension/pensioners/any-pensioner/life-certificates" });
  assert.equal(lifeCerts.status, 404);

  const pensioner = await call(api, { method: "GET", path: "/api/v1/pension/cases/any-case/pensioner" });
  assert.equal(pensioner.status, 200);
  assert.equal(pensioner.body.pensioner, null);
});
