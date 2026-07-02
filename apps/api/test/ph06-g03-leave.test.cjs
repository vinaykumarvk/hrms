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
    userId: "user-ph06-g03",
    actorUserId: "user-ph06-g03",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph06-g03",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph06-g03", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-06 G03 leave runs REPORTING_CHAIN workflow, delegation, ledger debit, G04 outbox, SR, audit, and notification", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-07-13",
    toDate: "2026-07-15",
    reason: "Family function",
  });
  assert.equal(submitted.application.status, "SUBMITTED");
  assert.equal(submitted.application.resolverType, "REPORTING_CHAIN");
  assert.equal(submitted.balance.reserved, 3);
  assert.equal(submitted.balance.availableBalance, 27);
  assert.equal(services.workflow.listTasks(actor()).some((task) => task.resolution.selectedAssignees[0].employeeId === ph03Ids.manager), true);

  const delegated = services.leave.delegate(actor(), submitted.application.id, ph03Ids.manager);
  assert.equal(delegated.action.action, "DELEGATE");
  assert.equal(delegated.application.delegatedToEmployeeId, ph03Ids.manager);

  const approved = services.leave.approve(actor(), submitted.application.id, "idem-ph06-g03-approve-001");
  assert.equal(approved.application.status, "APPROVED");
  assert.equal(approved.action.action, "APPROVE");
  assert.equal(approved.outboxEvent.sourceModule, "G04");
  assert.equal(approved.outboxEvent.status, "POSTED");
  assert.match(approved.srEventId, /^sr-/);

  const balance = services.leave.getBalance(actor(), ph03Ids.employee, "EL", 2026);
  assert.equal(balance.reserved, 0);
  assert.equal(balance.debited, 3);
  assert.equal(balance.availableBalance, 27);

  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].sourceModule, "G04");
  assert.equal(timeline[0].eventTypeCode, "LEAVE_APPROVED");
  assert.equal(services.leave.listOutbox(actor())[0].srEventId, timeline[0].id);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G03_LEAVE_APPROVE"));
  assert.ok(services.notifications.list(actor()).some((message) => message.messageId === "G03_LEAVE_APPROVED"));
});

test("PH-06 G03 routes submit and approve a leave application without manual state edits", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const submitted = call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-ph06-g03-submit-route-001" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-20", toDate: "2026-07-21" },
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.application.resolverType, "REPORTING_CHAIN");

  const delegated = call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${submitted.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-ph06-g03-delegate-route-001" },
    body: { decision: "DELEGATE", delegateEmployeeId: ph03Ids.manager },
  });
  assert.equal(delegated.status, 202);
  assert.equal(delegated.body.action.action, "DELEGATE");

  const approved = call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${submitted.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-ph06-g03-approve-route-001" },
    body: { decision: "APPROVE" },
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.outboxEvent.sourceModule, "G04");

  const balance = call(api, { method: "GET", path: "/api/v1/atl/leave-balances", query: { employeeId: ph03Ids.employee, leaveTypeId: "EL" } });
  assert.equal(balance.status, 200);
  assert.equal(balance.body.balance.debited, 2);

  const outbox = call(api, { method: "GET", path: "/api/v1/atl/leave-sr-outbox" });
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.items.length, 1);
});
