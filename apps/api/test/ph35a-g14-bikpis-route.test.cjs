// PH-35A — G14 bi-kpis route (backs the PH-34A embedded BI dashboard end-to-end).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) { return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph35a", actorUserId: "user-ph35a", permissions: ["*"], roles: ["analytics_viewer"], fieldGrants: [], correlationId: "corr-ph35a", ...extra }; }
async function call(api, request) { return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph35a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-35A GET /api/v1/analytics/bi-kpis returns KPI tiles", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, { method: "GET", path: "/api/v1/analytics/bi-kpis" });
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length >= 1);
  assert.ok(res.body.items.some((t) => t.kpiCode === "EMPLOYEE_HEADCOUNT"));
  assert.ok(["UP", "DOWN", "FLAT"].includes(res.body.items[0].trend));
});
