// PH-31C — G07 vendor-empanelment route (route exposure for the PH-20A engine).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph31c", actorUserId: "user-ph31c", permissions: ["*"], roles: ["ld_admin"], fieldGrants: [], correlationId: "corr-ph31c", ...extra };
}
async function call(api, request) { return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph31c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-31C POST /api/v1/training/vendor-empanelments applies for empanelment", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/training/vendor-empanelments",
    headers: { "Idempotency-Key": "idem-ph31c" },
    body: { vendorName: "TrainCo", category: "LEADERSHIP", procurementRef: "PROC-9" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.empanelment.status, "APPLIED");
  assert.equal(res.body.empanelment.vendorName, "TrainCo");
});
