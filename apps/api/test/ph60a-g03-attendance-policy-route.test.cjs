const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph60a",
    actorUserId: "user-ph60a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph60a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph60a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-60A G03 configure attendance policy via the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/attendance/policy",
    headers: { "Idempotency-Key": "pol-1" },
    body: { backdateWindowDays: 7, regularisationCapPerPeriod: 3, halfDayUnderMinutes: 240 },
  });
  assert.equal(res.status, 202);
  assert.equal(res.body.policy.backdateWindowDays, 7);
  assert.equal(res.body.policy.regularisationCapPerPeriod, 3);
});

test("PH-60A G03 attendance policy rejects a non-positive window (VALIDATION_FAILED)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = await call(api, {
    method: "POST",
    path: "/api/v1/attendance/policy",
    headers: { "Idempotency-Key": "pol-bad" },
    body: { backdateWindowDays: 0 },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});

test("PH-60A G03 leave-ledger / attendance / comp-off-balance reads respond through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  for (const path of ["/api/v1/leave/ledger", "/api/v1/attendance/records"]) {
    const res = await call(api, { method: "GET", path });
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(res.body.items), path);
  }

  const balance = await call(api, { method: "GET", path: `/api/v1/attendance/employees/${ph03Ids.employee}/comp-off-balance`, query: { asOfDate: "2026-07-02" } });
  assert.equal(balance.status, 200);
  assert.ok(balance.body.availableBalance !== undefined || balance.body.employeeId !== undefined);
});
