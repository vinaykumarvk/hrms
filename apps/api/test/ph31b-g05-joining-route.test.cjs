// PH-31B — G05 joining-sequence route (route exposure for the PH-18C engine).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph31b", actorUserId: "user-ph31b", permissions: ["*"], roles: ["establishment_officer"], fieldGrants: [], correlationId: "corr-ph31b", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph31b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-31B POST /api/v1/transfers/joining-sequence assigns deterministic inter-se seniority", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/transfers/joining-sequence",
    headers: { "Idempotency-Key": "idem-ph31b" },
    body: { batchId: "batch-31b", joiners: [
      { employeeId: "emp-c", orderDate: "2026-07-02", serviceNo: "SR-0009" },
      { employeeId: "emp-b", orderDate: "2026-07-01", serviceNo: "SR-0003" },
    ] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.sequence[0].employeeId, "emp-b");
  assert.equal(res.body.sequence[0].sequenceNo, 1);
});
