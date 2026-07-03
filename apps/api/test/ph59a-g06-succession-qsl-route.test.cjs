const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph59a",
    actorUserId: "user-ph59a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph59a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph59a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-59A G06 succession plan: create -> add candidate -> read", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = call(api, { method: "POST", path: "/api/v1/promotions/succession-plans", headers: { "Idempotency-Key": "sp-1" }, body: { positionId: "POS-DIR", incumbentEmployeeId: ph03Ids.employee } });
  assert.equal(created.status, 201);
  const id = created.body.plan.id;

  const added = call(api, {
    method: "POST",
    path: `/api/v1/promotions/succession-plans/${id}:add-candidate`,
    headers: { "Idempotency-Key": "sp-c" },
    body: { employeeId: ph03Ids.manager, rank: 1, readiness: "READY_NOW" },
  });
  assert.equal(added.status, 202);
  assert.equal(added.body.plan.candidates.length, 1);

  const read = call(api, { method: "GET", path: `/api/v1/promotions/succession-plans/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.plan.id, id);

  const path = call(api, { method: "GET", path: "/api/v1/promotions/career-paths/unknown" });
  assert.equal(path.status, 200);
  assert.equal(path.body.careerPath, null);
});

test("PH-59A G06 promotion-order list + qualifying-service reads", () => {
  const api = createFoundationApi(createFoundationServices());
  const orders = call(api, { method: "GET", path: "/api/v1/promotions/orders" });
  assert.equal(orders.status, 200);
  assert.ok(Array.isArray(orders.body.items));

  // Qualifying-service snapshot read for an unknown snapshot fails closed (NOT_FOUND).
  const snap = call(api, { method: "GET", path: "/api/v1/promotions/qualifying-service/unknown" });
  assert.equal(snap.status, 404);
});

test("PH-59A G06 qualifying-service compute fails closed on an unknown exclusion rule (NOT_FOUND)", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/promotions/qualifying-service:compute",
    headers: { "Idempotency-Key": "qsl-x" },
    body: { employeeId: ph03Ids.employee, gradeDesignationId: "GD-1", asOfDate: "2026-07-01", grossServiceDays: 3650, periods: [], serviceExclusionRuleId: "nope" },
  });
  assert.equal(res.status, 404);
});
