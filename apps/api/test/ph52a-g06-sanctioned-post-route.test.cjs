const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph52a",
    actorUserId: "user-ph52a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph52a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph52a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function registerBody(overrides = {}) {
  return {
    cadreId: "CADRE-REV",
    gradeDesignationId: "GD-1",
    orgUnitId: "OU-1",
    sanctionOrderRef: "SO-2026-001",
    sanctionedStrength: 10,
    filledCount: 6,
    drQuotaPct: 40,
    promotionQuotaPct: 40,
    ldceQuotaPct: 20,
    asOnDate: "2026-07-01",
    approverActorId: "approver-1",
    ...overrides,
  };
}

test("PH-52A G06 sanctioned post: register (maker!=checker) -> revise -> reconcile -> reads", () => {
  const api = createFoundationApi(createFoundationServices());
  const registered = call(api, { method: "POST", path: "/api/v1/promotions/sanctioned-posts", headers: { "Idempotency-Key": "sp-1" }, body: registerBody() });
  assert.equal(registered.status, 201);
  const id = registered.body.sanctionedPost.id;
  assert.equal(registered.body.sanctionedPost.currentVacancies, 4);

  const revised = call(api, {
    method: "POST",
    path: `/api/v1/promotions/sanctioned-posts/${id}:revise`,
    headers: { "Idempotency-Key": "sp-r" },
    body: { approverActorId: "approver-2", sanctionedStrength: 12 },
  });
  assert.equal(revised.status, 202);
  assert.equal(revised.body.sanctionedPost.version, 2);
  assert.equal(revised.body.sanctionedPost.currentVacancies, 6);

  const reconciled = call(api, { method: "POST", path: `/api/v1/promotions/sanctioned-posts/${id}:reconcile`, headers: { "Idempotency-Key": "sp-rc" }, body: { filledCount: 8 } });
  assert.equal(reconciled.status, 202);
  assert.equal(reconciled.body.sanctionedPost.currentVacancies, 4);

  const read = call(api, { method: "GET", path: `/api/v1/promotions/sanctioned-posts/${id}` });
  assert.equal(read.status, 200);
  const list = call(api, { method: "GET", path: "/api/v1/promotions/sanctioned-posts" });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((p) => p.id === id));
  const vacancy = call(api, { method: "GET", path: `/api/v1/promotions/sanctioned-posts/${id}/vacancy` });
  assert.equal(vacancy.status, 200);
});

test("PH-52A G06 sanctioned post: maker cannot self-approve (SoD, 403)", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/promotions/sanctioned-posts",
    headers: { "Idempotency-Key": "sp-sod" },
    body: registerBody({ approverActorId: "user-ph52a" }),
  });
  assert.equal(res.status, 403);
});

test("PH-52A G06 sanctioned post: reconcile beyond sanctioned strength fails closed (STRENGTH_INCONSISTENT)", () => {
  const api = createFoundationApi(createFoundationServices());
  const registered = call(api, { method: "POST", path: "/api/v1/promotions/sanctioned-posts", headers: { "Idempotency-Key": "sp-2" }, body: registerBody() });
  const id = registered.body.sanctionedPost.id;
  const bad = call(api, { method: "POST", path: `/api/v1/promotions/sanctioned-posts/${id}:reconcile`, headers: { "Idempotency-Key": "sp-bad" }, body: { filledCount: 20 } });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.error.code, "STRENGTH_INCONSISTENT");
});
