// PH-29C — G14 NL-query + attrition-score routes (route exposure for the PH-22C/PH-26C engines).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph29c",
    actorUserId: "user-ph29c",
    permissions: ["*"],
    roles: ["analytics_viewer"],
    fieldGrants: [],
    correlationId: "corr-ph29c",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph29c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-29C POST /api/v1/analytics/nl-query maps a recognised question to a metric", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/analytics/nl-query",
    headers: { "Idempotency-Key": "idem-ph29c-nlq" },
    body: { question: "What is the current headcount and staff strength?" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "EXECUTED");
  assert.equal(res.body.mappedMetric, "EMPLOYEE_HEADCOUNT");
});

test("PH-29C POST /api/v1/analytics/attrition-score returns a banded risk score", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/analytics/attrition-score",
    headers: { "Idempotency-Key": "idem-ph29c-attr" },
    body: { employeeId: "emp-1", tenureMonths: 6, recentTransfers: 3, leaveUtilisationPct: 90, promotionGapMonths: 60 },
  });
  assert.equal(res.status, 201);
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(res.body.band));
  assert.ok(typeof res.body.riskScore === "number");
});
