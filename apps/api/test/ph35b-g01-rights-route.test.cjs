// PH-35B — G01 self-service data-rights routes (backs the PH-34C privacy console end-to-end).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
const SUBJECT = "user-ph35b";
function actor(extra = {}) { return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: SUBJECT, actorUserId: SUBJECT, permissions: ["*"], roles: ["employee"], fieldGrants: [], correlationId: "corr-ph35b", ...extra }; }
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph35b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-35B POST then GET /api/v1/me/rights-requests raises and lists a self-service request", () => {
  const api = createFoundationApi(createFoundationServices());
  const empty = call(api, { method: "GET", path: "/api/v1/me/rights-requests" });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.items.length, 0);
  const raised = call(api, { method: "POST", path: "/api/v1/me/rights-requests", headers: { "Idempotency-Key": "idem-ph35b" }, body: { requestType: "ACCESS" } });
  assert.equal(raised.status, 201);
  const listed = call(api, { method: "GET", path: "/api/v1/me/rights-requests" });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
});
