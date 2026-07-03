// PH-31A — G02 retro-impact fan-out route (route exposure for the PH-25B engine).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph31a", actorUserId: "user-ph31a", permissions: ["*"], roles: ["hr_admin"], fieldGrants: [], correlationId: "corr-ph31a", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph31a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-31A POST /api/v1/change-requests/{id}/retro-impact:fan-out fans out per target", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/change-requests/cr-31a/retro-impact:fan-out",
    headers: { "Idempotency-Key": "idem-ph31a" },
    body: { effectiveDate: "2026-01-01", targets: ["G10", "G11", "G06"] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.events.length, 3);
});
