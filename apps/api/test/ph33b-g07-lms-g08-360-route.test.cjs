// PH-33B — G07 LMS registry + G08 360-feedback routes (route exposure).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph33b", actorUserId: "user-ph33b", permissions: ["*"], roles: ["ld_admin"], fieldGrants: [], correlationId: "corr-ph33b", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph33b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-33B POST /api/v1/training/learning-record-stores registers an LRS", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/training/learning-record-stores", headers: { "Idempotency-Key": "idem-ph33b-lrs" }, body: { name: "MoodleLRS", endpoint: "https://lrs", isPrimary: true } });
  assert.equal(res.status, 201);
  assert.equal(res.body.lrs.isPrimary, true);
});
test("PH-33B POST /api/v1/apar/360-feedback opens a 360 collection", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/apar/360-feedback", headers: { "Idempotency-Key": "idem-ph33b-360" }, body: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, minRaters: 3 } });
  assert.equal(res.status, 201);
  assert.equal(res.body.feedback360.status, "OPEN");
  assert.equal(res.body.feedback360.minRaters, 3);
});
