// PH-32B — G12 timestamp + offline-verification-bundle routes (route exposure for PH-26B/PH-24C).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph32b", actorUserId: "user-ph32b", permissions: ["*"], roles: ["sr_custodian"], fieldGrants: [], correlationId: "corr-ph32b", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph32b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-32B POST /api/v1/sr/timestamp issues an RFC-3161 token", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/sr/timestamp", headers: { "Idempotency-Key": "idem-ph32b-ts" }, body: { payload: { merkleRoot: "abc", seq: 1 } } });
  assert.equal(res.status, 201);
  assert.equal(res.body.authority, "urn:tsa:local:rfc3161");
  assert.ok(res.body.token.length > 0);
});
test("PH-32B POST /api/v1/sr/verification-bundle issues an offline-QR bundle", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/sr/verification-bundle", headers: { "Idempotency-Key": "idem-ph32b-vb" }, body: { subjectRef: "sr-1", entryHash: "a".repeat(64), anchorRef: "anchor-7", issuedAt: "2026-07-03" } });
  assert.equal(res.status, 201);
  assert.ok(res.body.bundle.signature.length > 0);
});
