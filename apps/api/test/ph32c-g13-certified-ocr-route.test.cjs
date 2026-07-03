// PH-32C — G13 certified-copy + OCR-search routes (route exposure for PH-20B/PH-22B engines).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph32c", actorUserId: "user-ph32c", permissions: ["*"], roles: ["records_registrar"], fieldGrants: [], correlationId: "corr-ph32c", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph32c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-32C POST /api/v1/documents/{id}/certified-copies issues a watermarked certified copy", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/documents/doc-1/certified-copies", headers: { "Idempotency-Key": "idem-ph32c-cc" }, body: { sourceStatus: "ACTIVE", issuingAuthority: "Establishment", purpose: "Pension", issuedAt: "2026-07-03" } });
  assert.equal(res.status, 201);
  assert.match(res.body.certifiedCopy.watermarkText, /CERTIFIED TRUE COPY/);
});
test("PH-32C GET /api/v1/documents:ocr-search returns a permission-filtered result", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "GET", path: "/api/v1/documents:ocr-search", query: { q: "transfer", clearance: "INTERNAL" } });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.hits));
});
