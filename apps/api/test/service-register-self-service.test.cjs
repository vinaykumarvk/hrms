const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Access service register / employment history — postings, promotions, service record
// timeline (G12)". Exercised over HTTP against seedTestEmployees:true real data (Meera's real
// LEAVE_APPROVED G04-to-G12 relay event), not mocked/hard-coded records.

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
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  return { services, api, admin, meera, rohan };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g12-sr-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G12 service register: the seed produces a real LEAVE_APPROVED timeline entry for Meera via the G04 relay", () => {
  const { api, meera } = boot();
  const result = call(api, actor(meera.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].eventTypeCode, "LEAVE_APPROVED");
  assert.equal(result.body.items[0].sourceModule, "G04");
});

test("G12 service register: an employee can view their own timeline but not another employee's (FR-09/BR-09.1 self-scope)", () => {
  const { api, meera, rohan } = boot();
  const own = call(api, actor(meera.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  assert.equal(own.status, 200);

  const crossEmployee = call(api, actor(rohan.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  assert.equal(crossEmployee.status, 403);
});

test("G12 service register: GET /api/v1/sr/events/{id} enforces the same self-scope as the timeline (was live-exploitable before this fix)", () => {
  const { api, meera, rohan } = boot();
  const timeline = call(api, actor(meera.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  const eventId = timeline.body.items[0].id;

  const ownEvent = call(api, actor(meera.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/events/${eventId}` });
  assert.equal(ownEvent.status, 200);

  const crossEmployeeEvent = call(api, actor(rohan.id, ["g12.sr.read"]), { method: "GET", path: `/api/v1/sr/events/${eventId}` });
  assert.equal(crossEmployeeEvent.status, 403);

  const hrAdminEvent = call(api, actor("hr-admin-probe", ["g12.sr.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/sr/events/${eventId}`,
  });
  assert.equal(hrAdminEvent.status, 200);
});

test("G12 service register: an hr_admin (override role) can view any employee's timeline", () => {
  const { api, meera } = boot();
  const hrAdmin = actor("hr-admin-probe", ["g12.sr.read"], { roles: ["hr_admin"] });
  const result = call(api, hrAdmin, { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
});

test("G12 service register: a wildcard-permission actor bypasses self-scope (existing convention preserved)", () => {
  const { api, meera } = boot();
  const wildcard = actor("wildcard-probe", ["*"]);
  const result = call(api, wildcard, { method: "GET", path: `/api/v1/sr/employees/${meera.id}/timeline` });
  assert.equal(result.status, 200);
});
