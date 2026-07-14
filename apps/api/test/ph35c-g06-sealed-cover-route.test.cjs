const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph35c-g06",
    actorUserId: "user-ph35c-g06",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph35c-g06",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph35c-g06", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-35C G06 sealed-cover register: place, list, release through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());

  const empty = await call(api, { method: "GET", path: "/api/v1/promotions/sealed-covers" });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.items, []);

  const placed = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/sealed-covers",
    headers: { "Idempotency-Key": "sc-place-1" },
    body: { employeeId: ph03Ids.employee, reason: "Pending vigilance inquiry" },
  });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.sealedCover.status, "SEALED");
  const id = placed.body.sealedCover.id;

  const listed = await call(api, { method: "GET", path: "/api/v1/promotions/sealed-covers" });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);

  const released = await call(api, {
    method: "POST",
    path: `/api/v1/promotions/sealed-covers/${id}:release`,
    headers: { "Idempotency-Key": "sc-release-1" },
    body: { reason: "Inquiry concluded — exonerated" },
  });
  assert.equal(released.status, 200);
  assert.equal(released.body.sealedCover.status, "RELEASED");
  assert.equal(released.body.sealedCover.releaseReason, "Inquiry concluded — exonerated");
});

test("PH-35C G06 sealed-cover release requires a reason", async () => {
  const api = createFoundationApi(createFoundationServices());
  const placed = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/sealed-covers",
    headers: { "Idempotency-Key": "sc-place-2" },
    body: { employeeId: ph03Ids.employee, reason: "Pending disciplinary proceeding" },
  });
  const id = placed.body.sealedCover.id;
  const bad = await call(api, {
    method: "POST",
    path: `/api/v1/promotions/sealed-covers/${id}:release`,
    headers: { "Idempotency-Key": "sc-release-2" },
    body: { reason: "   " },
  });
  assert.equal(bad.status, 400);
});
