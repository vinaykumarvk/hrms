const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph50a",
    actorUserId: "user-ph50a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph50a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph50a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-50A G03 leave year-close simulate + encashment via the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());

  const sim = await call(api, {
    method: "POST",
    path: "/api/v1/leave/year-close:simulate",
    headers: { "Idempotency-Key": "yc-1" },
    body: {
      orgUnitId: "OU-1",
      leaveYear: 2026,
      pendingLeaveCount: 0,
      balances: [{ leaveTypeId: "EL", closingBalanceDays: 300, carryForwardCapDays: 300 }],
    },
  });
  assert.equal(sim.status, 200);
  assert.ok(sim.body.close);

  const encashed = await call(api, {
    method: "POST",
    path: "/api/v1/leave/encashments",
    headers: { "Idempotency-Key": "enc-1" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", context: "IN_SERVICE", requestedDays: 5, availableEncashableDays: 15, isEncashable: true, capDays: 10 },
  });
  assert.equal(encashed.status, 201);
  assert.equal(encashed.body.encashment.encashedDays, 5);

  // Over the cap fails closed.
  const overCap = await call(api, {
    method: "POST",
    path: "/api/v1/leave/encashments",
    headers: { "Idempotency-Key": "enc-2" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", context: "IN_SERVICE", requestedDays: 20, availableEncashableDays: 15, isEncashable: true, capDays: 10 },
  });
  assert.equal(overCap.body.error.code, "ENCASHMENT_CAP_EXCEEDED");

  const list = await call(api, { method: "GET", path: `/api/v1/leave/employees/${ph03Ids.employee}/encashments` });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
});

test("PH-50A G03 mass-leave requires at least one member; a valid batch applies", async () => {
  const api = createFoundationApi(createFoundationServices());
  const empty = await call(api, {
    method: "POST",
    path: "/api/v1/leave/mass-leave",
    headers: { "Idempotency-Key": "ml-0" },
    body: { orgUnitId: "OU-1", leaveTypeId: "CL", fromDate: "2026-08-01", toDate: "2026-08-02", memberEmployeeIds: [] },
  });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "VALIDATION_FAILED");

  const applied = await call(api, {
    method: "POST",
    path: "/api/v1/leave/mass-leave",
    headers: { "Idempotency-Key": "ml-1" },
    body: { orgUnitId: "OU-1", leaveTypeId: "CL", fromDate: "2026-08-01", toDate: "2026-08-02", memberEmployeeIds: [ph03Ids.employee] },
  });
  assert.equal(applied.status, 201);
  assert.ok(applied.body.batch.id);
});

test("PH-50A G03 punch-review read + resolve, and attendance-exception read", async () => {
  const api = createFoundationApi(createFoundationServices());
  const missing = await call(api, { method: "GET", path: "/api/v1/attendance/punch-reviews/unknown-review" });
  assert.equal(missing.status, 200);
  assert.equal(missing.body.review, null);

  // Resolving a non-existent review fails NOT_FOUND (404).
  const badResolve = await call(api, {
    method: "POST",
    path: "/api/v1/attendance/punch-reviews/unknown-review:resolve",
    headers: { "Idempotency-Key": "pr-x" },
    body: { decision: "VALID", note: "n/a" },
  });
  assert.equal(badResolve.status, 404);

  const exceptions = await call(api, { method: "GET", path: `/api/v1/attendance/employees/${ph03Ids.employee}/exceptions` });
  assert.equal(exceptions.status, 200);
  assert.ok(Array.isArray(exceptions.body.items));
});
