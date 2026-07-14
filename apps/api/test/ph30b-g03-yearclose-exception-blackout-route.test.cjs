// PH-30B — G03 year-close / attendance-exception / blackout routes (route exposure).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph30b",
    actorUserId: "user-ph30b",
    permissions: ["*"],
    roles: ["leave_admin"],
    fieldGrants: [],
    correlationId: "corr-ph30b",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph30b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-30B POST /api/v1/atl/leave-year-close:commit commits with CF/lapse", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-year-close:commit",
    headers: { "Idempotency-Key": "idem-ph30b-yc" },
    body: { orgUnitId: ph03Ids.orgRevenue, leaveYear: 2026, pendingLeaveCount: 0, balances: [{ leaveTypeId: "EL", closingBalanceDays: 45, carryForwardCapDays: 30 }] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.close.status, "COMMITTED");
  assert.equal(res.body.close.totalCarriedForwardDays, 30);
  assert.equal(res.body.close.totalLapsedDays, 15);
});

test("PH-30B POST /api/v1/atl/attendance-exceptions files a WFH exception", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-exceptions",
    headers: { "Idempotency-Key": "idem-ph30b-ex" },
    body: { employeeId: ph03Ids.employee, exceptionType: "WFH", fromDate: "2026-07-06", toDate: "2026-07-08" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.exception.exceptionType, "WFH");
  assert.equal(res.body.exception.days, 3);
});

test("PH-30B POST /api/v1/atl/blackout-periods declares a blackout window", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/atl/blackout-periods",
    headers: { "Idempotency-Key": "idem-ph30b-bo" },
    body: { orgUnitId: ph03Ids.orgRevenue, fromDate: "2026-03-25", toDate: "2026-03-31", reason: "FY close" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.blackout.status, "ACTIVE");
});
