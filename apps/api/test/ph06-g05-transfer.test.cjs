const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  FoundationError,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph06-g05",
    actorUserId: "user-ph06-g05",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph06-g05",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph06-g05", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function transferInput(extra = {}) {
  return {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-07-02",
    effectiveDate: "2026-07-10",
    reason: "Administrative posting",
    ...extra,
  };
}

// Clear or deem every configured clearance branch: all but the first are completed, the
// first is deemed after its SLA due date so the DEEMED_CLEARED path stays exercised.
function clearAll(services, orderId, order, completedOn, deemedOn) {
  const codes = order.clearanceItems.map((item) => item.code);
  for (const code of codes.slice(1)) {
    services.transfer.completeClearance(actor(), orderId, code, completedOn);
  }
  return services.transfer.deemClearance(actor(), orderId, codes[0], deemedOn);
}

test("PH-06 G05 transfer uses POSITION_AUTHORITY, SoD-safe delegation, parallel clearance, deemed clearance, documents, SR, audit, and notification", async () => {
  const services = createFoundationServices();
  const initiated = services.transfer.initiate(actor(), transferInput());
  assert.equal(initiated.order.status, "PENDING_APPROVAL");
  assert.equal(initiated.order.resolverType, "POSITION_AUTHORITY");
  assert.equal(initiated.order.resolverEvidence.sodBlockedDelegation, true);

  const approved = services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: "idem-ph06-g05-approve-001" });
  assert.equal(approved.order.status, "APPROVED");
  assert.match(approved.document.id, /^doc-/);
  // Clearance branches come from the per-office configuration (seeded 7-department catalog).
  assert.equal(approved.order.clearanceItems.length, 7);
  assert.equal(approved.clearanceWorkflow.instance.workflowCode, "WF-G05-CLEARANCE-PARALLEL_ALL_OF");
  assert.match(approved.srEventId, /^sr-/);

  const deemedCode = approved.order.clearanceItems[0].code;
  const deemed = clearAll(services, initiated.order.id, approved.order, "2026-07-10", "2026-07-12");
  assert.equal(deemed.clearanceItems.find((item) => item.code === deemedCode).status, "DEEMED_CLEARED");

  const joined = services.transfer.relieveAndJoin(actor(), initiated.order.id, {
    relievingDate: "2026-07-12",
    joiningDate: "2026-07-13",
    idempotencyKey: "idem-ph06-g05-join-001",
  });
  assert.equal(joined.order.status, "JOINED");
  assert.match(joined.srEventId, /^sr-/);
  assert.match(joined.document.id, /^doc-/);
  assert.equal(joined.relievingOrder.lastWorkingDay, "2026-07-12");
  assert.equal(joined.joiningReport.status, "JOINED_CONFIRMED");

  const docs = services.documentVault.listByModuleRef(actor(), "G05", initiated.order.id);
  assert.equal(docs.length, 2);
  // Frozen G12 catalog codes: TRANSFER on issue, RELIEVING on relief, JOINING on join.
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.deepEqual(timeline.map((event) => event.eventTypeCode), ["TRANSFER", "RELIEVING", "JOINING"]);
  assert.ok(timeline.every((event) => event.sourceModule === "G05"));
  assert.equal(timeline[2].documentIds.length, 2);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_TRANSFER_RELIEVE_JOIN"));
  assert.ok(services.notifications.list(actor()).some((message) => message.messageId === "G05_JOINING_CONFIRMED"));
});

test("PH-06 G05 validates transfer dates and deemed-clearance SLA", async () => {
  const services = createFoundationServices();
  assert.throws(
    () => services.transfer.initiate(actor(), transferInput({ orderDate: "2026-07-10", effectiveDate: "2026-07-02" })),
    (error) => error instanceof FoundationError && error.code === "VALIDATION_FAILED"
  );
  const initiated = services.transfer.initiate(actor(), transferInput());
  const approved = services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: "idem-ph06-g05-approve-002" });
  assert.throws(
    () => services.transfer.deemClearance(actor(), initiated.order.id, approved.order.clearanceItems[0].code, "2026-07-10"),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
});

test("PH-06 G05 routes drive transfer order approval, clearance, and joining", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const initiated = await call(api, {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-ph06-g05-initiate-route-001" },
    body: transferInput(),
  });
  assert.equal(initiated.status, 201);
  assert.equal(initiated.body.order.resolverType, "POSITION_AUTHORITY");

  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}/approve`,
    headers: { "Idempotency-Key": "idem-ph06-g05-approve-route-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.order.clearanceItems.length, 7);

  const codes = approved.body.order.clearanceItems.map((item) => item.code);
  for (const code of codes.slice(1)) {
    const completed = await call(api, {
      method: "POST",
      path: `/api/v1/transfers/orders/${initiated.body.order.id}/clearances/${code}:complete`,
      headers: { "Idempotency-Key": `idem-ph06-g05-${code.toLowerCase()}-route-001` },
      body: { completedOn: "2026-07-10" },
    });
    assert.equal(completed.status, 202);
  }

  const deemed = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}/clearances/${codes[0]}:deem`,
    headers: { "Idempotency-Key": "idem-ph06-g05-deem-route-001" },
    body: { deemedOn: "2026-07-12" },
  });
  assert.equal(deemed.status, 202);

  const joined = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}:relieve-and-join`,
    headers: { "Idempotency-Key": "idem-ph06-g05-join-route-001" },
    body: { relievingDate: "2026-07-12", joiningDate: "2026-07-13" },
  });
  assert.equal(joined.status, 202);
  assert.equal(joined.body.order.status, "JOINED");
  assert.match(joined.body.srEventId, /^sr-/);
});
