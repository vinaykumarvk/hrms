const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph61a",
    actorUserId: "user-ph61a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph61a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph61a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-61A G12 SR admissibility/integrity reads respond through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());

  const subs = await call(api, { method: "GET", path: "/api/v1/sr/subscriptions" });
  assert.equal(subs.status, 200);
  assert.ok(Array.isArray(subs.body.items));

  const attestations = await call(api, { method: "GET", path: `/api/v1/sr/employees/${ph03Ids.employee}/attestations` });
  assert.equal(attestations.status, 200);
  assert.ok(Array.isArray(attestations.body.items));

  const getA = await call(api, { method: "GET", path: "/api/v1/sr/attestations/unknown" });
  assert.equal(getA.status, 200);
  assert.equal(getA.body.attestation, null);
});

test("PH-61A G13 OCR index-from-payload + list through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const indexed = await call(api, {
    method: "POST",
    path: "/api/v1/documents:ocr-index",
    headers: { "Idempotency-Key": "ocr-1" },
    body: { documentId: "DOC-1", classification: "INTERNAL", mimeType: "text/plain", content: "Sanction order for Ashok Kumar" },
  });
  assert.equal(indexed.status, 201);
  assert.equal(indexed.body.entry.documentId, "DOC-1");

  const list = await call(api, { method: "GET", path: "/api/v1/documents:ocr-index-list" });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((e) => e.documentId === "DOC-1"));
});
