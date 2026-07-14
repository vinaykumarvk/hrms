const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Check my personal dashboard — own leave balance and attendance summary at a glance
// (G14)". Exercised over HTTP against seedTestEmployees:true real data (Sunita's real seeded
// attendance capture/regularisation), not mocked/hard-coded records.

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
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  return { services, api, admin, sunita, meera };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g14-personal-dashboard", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G14 personal dashboard: an employee sees their own real leave balance and attendance summary", async () => {
  const { api, sunita } = boot();
  const result = await call(api, actor(sunita.id, ["g14.analytics.read.self"]), { method: "GET", path: `/api/v1/analytics/employees/${sunita.id}/dashboard` });
  assert.equal(result.status, 200);
  assert.equal(result.body.dashboard.employeeId, sunita.id);
  assert.equal(result.body.dashboard.leaveBalance.leaveTypeId, "EL");
  assert.ok(result.body.dashboard.attendanceSummary.totalRecords >= 1, "Sunita has at least one real seeded attendance record");
});

test("G14 personal dashboard: post-full-review-goal fix — an employee cannot view another employee's dashboard", async () => {
  const { api, sunita, meera } = boot();
  const stranger = await call(api, actor(meera.id, ["g14.analytics.read.self"]), { method: "GET", path: `/api/v1/analytics/employees/${sunita.id}/dashboard` });
  assert.equal(stranger.status, 403);
});

test("G14 personal dashboard: post-full-review fix (F3) — holding only the self-service permission does not reach the org-wide executive dashboard", async () => {
  const { api, sunita } = boot();
  // g14.analytics.read.self (personal dashboard) must NOT satisfy g14.analytics.read (org-wide
  // executive dashboard) — getDashboard() has no per-employee filtering at all, so sharing one
  // permission string the way most other self-service reuse this session does would have let any
  // self-service employee reach org-wide aggregate data directly via the API.
  const selfOnlyActor = actor(sunita.id, ["g14.analytics.read.self"]);
  const executiveDashboard = await call(api, selfOnlyActor, { method: "GET", path: "/api/v1/analytics/dashboards/executive-readiness" });
  assert.equal(executiveDashboard.status, 403);

  const myDashboard = await call(api, selfOnlyActor, { method: "GET", path: `/api/v1/analytics/employees/${sunita.id}/dashboard` });
  assert.equal(myDashboard.status, 200);
});

test("G14 personal dashboard: post-full-review-goal fix — the leave-balance and attendance reads underneath are ownership-gated even when called directly", async () => {
  const { services, sunita, meera } = boot();
  const strangerActor = actor(meera.id, ["g03.leave.read"]);
  assert.throws(
    () => services.leave.getBalance(strangerActor, sunita.id, "EL", 2026),
    (error) => error.code === "FORBIDDEN"
  );
  assert.throws(
    () => services.leave.listMyAttendance(strangerActor, sunita.id),
    (error) => error.code === "FORBIDDEN"
  );
});

test("G14 personal dashboard: an hr_admin override role may view any employee's dashboard", async () => {
  const { api, sunita } = boot();
  const hrAdmin = await call(api, actor("hr-admin-dashboard-probe", ["g14.analytics.read.self"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/analytics/employees/${sunita.id}/dashboard`,
  });
  assert.equal(hrAdmin.status, 200);
  assert.equal(hrAdmin.body.dashboard.employeeId, sunita.id);
});
