// PH-28C — G05 counselling session route (route-exposure for the PH-27B counselling console UI).
//   GET /api/v1/counselling-sessions/{id} returns the session (turn + candidates) end-to-end.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph28c",
    actorUserId: "user-ph28c",
    permissions: ["*"],
    roles: ["transfer_authority"],
    fieldGrants: [],
    correlationId: "corr-ph28c",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph28c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-28C GET /api/v1/counselling-sessions/{id} returns the scheduled session", async () => {
  const api = createFoundationApi(createFoundationServices());
  const scheduled = await call(api, {
    method: "POST",
    path: "/api/v1/transfers/drives/drive-ph28c/counselling-sessions",
    headers: { "Idempotency-Key": "idem-ph28c-sched" },
    body: {
      sessionCode: "COUNSEL-PH28C",
      scheduledAt: "2026-08-01T10:00:00Z",
      turnOrderMethod: "SENIORITY",
      presidingOfficerId: "user-ph28c",
      candidates: [
        { employeeId: ph03Ids.manager, seniorityScore: 10 },
        { employeeId: ph03Ids.employee, seniorityScore: 5 },
      ],
    },
  });
  assert.equal(scheduled.status, 201);
  const sessionId = scheduled.body.session.id;
  const got = await call(api, { method: "GET", path: `/api/v1/counselling-sessions/${sessionId}` });
  assert.equal(got.status, 200);
  assert.equal(got.body.session.id, sessionId);
});
