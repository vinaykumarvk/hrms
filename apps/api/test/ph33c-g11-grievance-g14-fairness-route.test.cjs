// PH-33C — G11 grievance + G14 fairness-report routes (route exposure, finishing the backlog).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph33c", actorUserId: "user-ph33c", permissions: ["*"], roles: ["pension_ops"], fieldGrants: [], correlationId: "corr-ph33c", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph33c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-33C POST /api/v1/pension/grievances raises a grievance with an SLA clock", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/pension/grievances", headers: { "Idempotency-Key": "idem-ph33c-grv" }, body: { pensionerId: ph03Ids.employee, category: "NON_PAYMENT", description: "Not credited", receivedOn: "2026-07-05" } });
  assert.equal(res.status, 201);
  assert.equal(res.body.grievance.slaDueAt, "2026-07-12");
});
test("PH-33C POST /api/v1/analytics/fairness-report flags disparity", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, { method: "POST", path: "/api/v1/analytics/fairness-report", headers: { "Idempotency-Key": "idem-ph33c-fair" }, body: { attribute: "gender", observations: [ { group: "A", riskScore: 0.2 }, { group: "B", riskScore: 0.8 } ] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.flagged, true);
});
