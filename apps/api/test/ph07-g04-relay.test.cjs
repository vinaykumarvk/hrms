const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph07-g04",
    actorUserId: "user-ph07-g04",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07-g04",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07-g04", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-07 G04 relay posts leave SR events idempotently and reconciles the outbox", () => {
  const services = createFoundationServices();
  const event = services.leaveSrRelay.enqueueApprovedLeave(actor(), {
    leaveApplicationId: "leave-app-ph07-001",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-20",
    payload: { applicationNo: "LA/2026/90001", totalDays: 2 },
  });
  assert.equal(event.status, "READY");

  const posted = services.leaveSrRelay.relayEvent(actor(), event.id);
  assert.equal(posted.status, "POSTED");
  assert.match(posted.srEventId, /^sr-/);
  const replay = services.leaveSrRelay.relayEvent(actor(), event.id);
  assert.equal(replay.srEventId, posted.srEventId);
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 1);

  const report = services.leaveSrRelay.reconcile(actor());
  assert.equal(report.total, 1);
  assert.equal(report.posted, 1);
});

test("PH-07 G04 DLQ replay and discard are explicit custodian actions", () => {
  const services = createFoundationServices();
  const event = services.leaveSrRelay.enqueueApprovedLeave(actor(), {
    leaveApplicationId: "leave-app-ph07-002",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-21",
    payload: { applicationNo: "LA/2026/90002", totalDays: 1 },
  });
  assert.equal(services.leaveSrRelay.relayEvent(actor(), event.id, { simulateFailure: true }).status, "FAILED");
  assert.equal(services.leaveSrRelay.relayEvent(actor(), event.id, { simulateFailure: true }).status, "DEAD_LETTERED");

  const replayed = services.leaveSrRelay.replayDeadLetter(actor(), event.id);
  assert.equal(replayed.status, "POSTED");
  assert.equal(services.leaveSrRelay.reconcile(actor()).posted, 1);

  const discardEvent = services.leaveSrRelay.enqueueApprovedLeave(actor(), {
    leaveApplicationId: "leave-app-ph07-003",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-22",
    payload: { applicationNo: "LA/2026/90003", totalDays: 1 },
  });
  services.leaveSrRelay.relayEvent(actor(), discardEvent.id, { simulateFailure: true });
  services.leaveSrRelay.relayEvent(actor(), discardEvent.id, { simulateFailure: true });
  const discarded = services.leaveSrRelay.discardDeadLetter(actor(), discardEvent.id, "Source request cancelled before relay");
  assert.equal(discarded.status, "DISCARDED");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G04_RELAY_DISCARD"));
});

test("PH-07 G04 routes expose outbox relay and reconciliation", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const event = services.leaveSrRelay.enqueueApprovedLeave(actor(), {
    leaveApplicationId: "leave-app-ph07-route-001",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-23",
    payload: { applicationNo: "LA/2026/90004", totalDays: 1 },
  });

  const relayed = call(api, {
    method: "POST",
    path: `/api/v1/leave-sr/outbox/${event.id}:relay`,
    headers: { "Idempotency-Key": "idem-ph07-g04-relay-route-001" },
    body: {},
  });
  assert.equal(relayed.status, 202);
  assert.equal(relayed.body.outboxEvent.status, "POSTED");

  const outbox = call(api, { method: "GET", path: "/api/v1/leave-sr/outbox" });
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.items.length, 1);

  const reconciliation = call(api, { method: "GET", path: "/api/v1/leave-sr/reconciliation" });
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.report.posted, 1);
});
