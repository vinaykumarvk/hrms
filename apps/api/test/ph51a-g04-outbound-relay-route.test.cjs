const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph51a",
    actorUserId: "user-ph51a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph51a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph51a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-51A G04 outbound connector: register -> send -> conformance -> read", () => {
  const api = createFoundationApi(createFoundationServices());
  const registered = call(api, {
    method: "POST",
    path: "/api/v1/integration/connectors",
    headers: { "Idempotency-Key": "conn-1" },
    body: { name: "PFMS", endpoint: "https://pfms.example/api" },
  });
  assert.equal(registered.status, 201);
  const id = registered.body.connector.id;
  assert.equal(registered.body.connector.breakerState, "CLOSED");

  const sent = call(api, { method: "POST", path: `/api/v1/integration/connectors/${id}:send`, headers: { "Idempotency-Key": "send-1" }, body: { payload: { amount: 100 } } });
  assert.equal(sent.status, 202);
  assert.equal(sent.body.send.outcome, "DELIVERED");

  const conformance = call(api, { method: "POST", path: `/api/v1/integration/connectors/${id}:conformance`, headers: { "Idempotency-Key": "conf-1" }, body: {} });
  assert.equal(conformance.status, 200);
  assert.equal(conformance.body.passed, true);

  const read = call(api, { method: "GET", path: `/api/v1/integration/connectors/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.connector.id, id);
});

test("PH-51A G04 leave->SR relay enqueue (approved + cancellation) + dead-letter read", () => {
  const api = createFoundationApi(createFoundationServices());

  const approved = call(api, {
    method: "POST",
    path: "/api/v1/leave-sr/enqueue-approved",
    headers: { "Idempotency-Key": "enq-a" },
    body: { leaveApplicationId: "LA-1", employeeId: ph03Ids.employee, eventDate: "2026-07-02", payload: { leaveTypeCode: "EL" }, leaveTypeCode: "EL" },
  });
  assert.equal(approved.status, 201);
  assert.ok(approved.body.event.id);

  const cancelled = call(api, {
    method: "POST",
    path: "/api/v1/leave-sr/enqueue-cancellation",
    headers: { "Idempotency-Key": "enq-c" },
    body: { leaveApplicationId: "LA-1", employeeId: ph03Ids.employee, eventDate: "2026-07-03", payload: { leaveTypeCode: "EL" }, leaveTypeCode: "EL" },
  });
  assert.equal(cancelled.status, 201);
  assert.ok(cancelled.body.event.id);

  const deadLetters = call(api, { method: "GET", path: "/api/v1/leave-sr/dead-letters" });
  assert.equal(deadLetters.status, 200);
  assert.ok(Array.isArray(deadLetters.body.items));
});
