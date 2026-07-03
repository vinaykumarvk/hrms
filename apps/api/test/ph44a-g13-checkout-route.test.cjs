const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph44a",
    actorUserId: "user-ph44a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph44a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph44a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function newDocument(services) {
  return services.documentVault.createDocument(actor(), {
    title: "Sanction Order",
    classification: "INTERNAL",
    content: "body",
    isWorm: false,
  }).id;
}

test("PH-44A G13 checkout lock: checkout -> read lock -> release via the kernel", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const id = newDocument(services);

  const checkout = call(api, { method: "POST", path: `/api/v1/documents/${id}:checkout`, headers: { "Idempotency-Key": "co-1" }, body: { intentNote: "Amend metadata" } });
  assert.equal(checkout.status, 202);
  assert.equal(checkout.body.lock.status, "ACTIVE");

  const read = call(api, { method: "GET", path: `/api/v1/documents/${id}/checkout-lock` });
  assert.equal(read.status, 200);
  assert.equal(read.body.lock.status, "ACTIVE");

  const release = call(api, { method: "POST", path: `/api/v1/documents/${id}:release-checkout`, headers: { "Idempotency-Key": "co-r" }, body: {} });
  assert.equal(release.status, 202);
  assert.equal(release.body.lock.status, "RELEASED");

  // A second release fails: the document is no longer checked out.
  const again = call(api, { method: "POST", path: `/api/v1/documents/${id}:release-checkout`, headers: { "Idempotency-Key": "co-r2" }, body: {} });
  assert.equal(again.status, 412);
});

test("PH-44A G13 access-audit + scan-result reads respond through the kernel", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const id = newDocument(services);
  for (const suffix of ["access-audit", "scan-results"]) {
    const res = call(api, { method: "GET", path: `/api/v1/documents/${id}/${suffix}` });
    assert.equal(res.status, 200, suffix);
    assert.ok(Array.isArray(res.body.items), suffix);
  }
});

test("PH-44A G13 by-module-ref requires moduleCode and entityRefId", () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = call(api, { method: "GET", path: "/api/v1/documents:by-module-ref", query: { moduleCode: "G09" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");

  const ok = call(api, { method: "GET", path: "/api/v1/documents:by-module-ref", query: { moduleCode: "G09", entityRefId: "case-1" } });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.items));
});
