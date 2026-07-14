// PH-33A — G02 e-signature + template routes and G03 punch-anomaly route (route exposure).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph33a", actorUserId: "user-ph33a", permissions: ["*"], roles: ["hr_admin"], fieldGrants: [], correlationId: "corr-ph33a", ...extra };
}
async function call(api, request) { return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph33a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-33A POST /api/v1/change-requests/{id}/e-signatures signs a change", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, { method: "POST", path: "/api/v1/change-requests/cr-33a/e-signatures", headers: { "Idempotency-Key": "idem-ph33a-sig" }, body: { method: "DSC", payload: { field: "name" }, signedAt: "2026-07-03" } });
  assert.equal(res.status, 201);
  assert.equal(res.body.signature.method, "DSC");
});
test("PH-33A POST /api/v1/change-request-templates creates a template", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, { method: "POST", path: "/api/v1/change-request-templates", headers: { "Idempotency-Key": "idem-ph33a-tpl" }, body: { templateCode: "ADDR", name: "Address", fields: [{ fieldCode: "city" }] } });
  assert.equal(res.status, 201);
  assert.equal(res.body.template.status, "ACTIVE");
});
test("PH-33A POST /api/v1/atl/punch-anomaly:screen flags impossible travel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const t0 = 1760000000000;
  const res = await call(api, { method: "POST", path: "/api/v1/atl/punch-anomaly:screen", headers: { "Idempotency-Key": "idem-ph33a-pa" }, body: { employeeId: "emp-x", punchA: { lat: 28.6139, lon: 77.209, atEpochMs: t0 }, punchB: { lat: 13.0827, lon: 80.2707, atEpochMs: t0 + 600000 } } });
  assert.equal(res.status, 201);
  assert.equal(res.body.anomaly.anomalyType, "IMPOSSIBLE_TRAVEL");
});
