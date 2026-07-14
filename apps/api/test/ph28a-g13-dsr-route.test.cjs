// PH-28A — G13 DSR list route (route-exposure for the PH-27A DSR console UI).
//   GET /api/v1/dsr returns the paged data-subject-request list; the console consumes it end-to-end.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph28a",
    actorUserId: "user-ph28a",
    permissions: ["*"],
    roles: ["dpo"],
    fieldGrants: [],
    correlationId: "corr-ph28a",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph28a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-28A GET /api/v1/dsr returns the paged DSR list after a register", async () => {
  const api = createFoundationApi(createFoundationServices());
  // Empty to start.
  const empty = await call(api, { method: "GET", path: "/api/v1/dsr" });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.items.length, 0);
  // Register one DSR through the existing POST route.
  const reg = await call(api, {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-ph28a-1" },
    body: { dataSubjectEmployeeId: ph03Ids.employee, requestType: "ERASURE" },
  });
  assert.equal(reg.status, 201);
  // The list route now surfaces it.
  const listed = await call(api, { method: "GET", path: "/api/v1/dsr" });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.next_cursor, null);
});
