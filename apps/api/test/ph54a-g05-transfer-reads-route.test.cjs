const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph54a",
    actorUserId: "user-ph54a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph54a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph54a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-54A G05 transfer/counselling list reads respond through the kernel", () => {
  const api = createFoundationApi(createFoundationServices());
  const listPaths = [
    "/api/v1/transfers/reservations",
    "/api/v1/transfers/mutual-orders",
    "/api/v1/transfers/relieving-orders",
    "/api/v1/transfers/joining-reports",
    "/api/v1/transfers/orders/any-order/charge-handovers",
    "/api/v1/transfers/drives/DRIVE-1/employees/EMP-1/preferences",
  ];
  for (const path of listPaths) {
    const res = call(api, { method: "GET", path });
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(res.body.items), path);
  }
});

test("PH-54A G05 get-by-id reads fail closed on unknown subjects (NOT_FOUND)", () => {
  const api = createFoundationApi(createFoundationServices());
  for (const path of [
    "/api/v1/transfers/vacancy-positions/nope",
    "/api/v1/transfers/reservations/nope",
    "/api/v1/transfers/mutual-orders/nope",
  ]) {
    const res = call(api, { method: "GET", path });
    assert.equal(res.status, 404, path);
  }
});
