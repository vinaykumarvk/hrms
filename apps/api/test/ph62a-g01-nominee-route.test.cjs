const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph62a",
    actorUserId: "user-ph62a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph62a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph62a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function addNominee(api, key, body) {
  return await call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/nominees`, headers: { "Idempotency-Key": key }, body });
}

test("PH-62A G01 nominee register: shares within a benefit type may total 100, no more (VAL-NOMINEE)", async () => {
  const api = createFoundationApi(createFoundationServices());

  const first = await addNominee(api, "nom-1", { name: "Spouse", benefitType: "GRATUITY", sharePct: 60 });
  assert.equal(first.status, 201);
  assert.equal(first.body.nominee.sharePct, 60);
  assert.equal(first.body.nominee.status, "ACTIVE");
  assert.equal(first.body.nominee.rowVersion, 1);

  const second = await addNominee(api, "nom-2", { name: "Child", benefitType: "GRATUITY", sharePct: 40, guardian: "Spouse" });
  assert.equal(second.status, 201);

  // 60 + 40 + 10 = 110 > 100 -> VAL-NOMINEE (422).
  const over = await addNominee(api, "nom-3", { name: "Parent", benefitType: "GRATUITY", sharePct: 10 });
  assert.equal(over.status, 422);
  assert.equal(over.body.error.code, "VAL-NOMINEE");

  // A different benefit type has an independent 100% budget.
  const gpf = await addNominee(api, "nom-gpf", { name: "Spouse", benefitType: "GPF", sharePct: 100 });
  assert.equal(gpf.status, 201);

  const list = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/nominees` });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.filter((n) => n.status === "ACTIVE").length, 3);
});

test("PH-62A G01 nominee update uses row_version optimistic locking", async () => {
  const api = createFoundationApi(createFoundationServices());
  const created = await addNominee(api, "nu-1", { name: "Spouse", benefitType: "GRATUITY", sharePct: 50 });
  const id = created.body.nominee.id;

  const updated = await call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/nominees/${id}`,
    headers: { "Idempotency-Key": "nu-u" },
    body: { rowVersion: 1, sharePct: 70 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.nominee.sharePct, 70);
  assert.equal(updated.body.nominee.rowVersion, 2);

  // A stale row_version is rejected (CONFLICT 409).
  const stale = await call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/nominees/${id}`,
    headers: { "Idempotency-Key": "nu-s" },
    body: { rowVersion: 1, sharePct: 80 },
  });
  assert.equal(stale.status, 409);
});

test("PH-62A G01 soft-delete frees the nominee's share", async () => {
  const api = createFoundationApi(createFoundationServices());
  const created = await addNominee(api, "nd-1", { name: "Spouse", benefitType: "GRATUITY", sharePct: 100 });
  const id = created.body.nominee.id;

  // With 100% allocated, a further nominee is blocked.
  assert.equal((await addNominee(api, "nd-2", { name: "Child", benefitType: "GRATUITY", sharePct: 10 })).status, 422);

  const removed = await call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/nominees/${id}:remove`, headers: { "Idempotency-Key": "nd-r" }, body: {} });
  assert.equal(removed.status, 200);

  // The freed share is available again.
  assert.equal((await addNominee(api, "nd-3", { name: "Child", benefitType: "GRATUITY", sharePct: 100 })).status, 201);
});
