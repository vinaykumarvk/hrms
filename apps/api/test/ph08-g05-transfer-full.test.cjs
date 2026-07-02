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
    userId: "user-ph08-g05",
    actorUserId: "user-ph08-g05",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08-g05",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08-g05", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function transferInput(extra = {}) {
  return {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-08-01",
    effectiveDate: "2026-08-10",
    reason: "Statutory transfer drive",
    ...extra,
  };
}

function approvedOrder(services, suffix = "001") {
  const initiated = services.transfer.initiate(actor(), transferInput({ reason: `Drive ${suffix}` }));
  const approved = services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: `idem-ph08-g05-approve-${suffix}` });
  return approved.order;
}

function clearAll(services, order, completedOn, deemedOn) {
  const codes = order.clearanceItems.map((item) => item.code);
  for (const code of codes.slice(1)) {
    services.transfer.completeClearance(actor(), order.id, code, completedOn);
  }
  services.transfer.deemClearance(actor(), order.id, codes[0], deemedOn);
}

test("PH-08 G05 representation retention rescinds the TRANSFER fact through the SR reversal envelope", () => {
  const services = createFoundationServices();
  const order = approvedOrder(services);
  const representation = services.transfer.fileRepresentation(actor(), order.id, {
    grounds: "Spouse medical grounds",
    evidenceTitle: "Medical representation",
  });
  assert.equal(representation.status, "UNDER_REVIEW");

  const retained = services.transfer.retainOnRepresentation(actor(), representation.id, {
    decisionDate: "2026-08-05",
    reason: "Accepted statutory retention grounds",
    idempotencyKey: "idem-ph08-g05-retain-001",
  });
  assert.equal(retained.order.status, "RETAINED");
  assert.equal(retained.representation.status, "RETAINED");
  assert.match(retained.srEventId, /^sr-/);
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  // Frozen catalog: TRANSFER on issue; retention appends a linked reversal, never a forward pseudo-event.
  assert.deepEqual(timeline.map((event) => event.eventTypeCode), ["TRANSFER", "REVERSAL"]);
  assert.equal(timeline[1].reversalOfEventId, timeline[0].id);
  assert.equal(timeline[1].payload.is_reversal, true);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_REPRESENTATION_FILED"));
});

test("PH-08 G05 cancellation reverses the ledger fact and deemed relief posts catalog RELIEVING", () => {
  const services = createFoundationServices();
  const cancellable = approvedOrder(services, "cancel");
  const cancelled = services.transfer.cancel(actor(), cancellable.id, {
    cancellationDate: "2026-08-06",
    reason: "Administrative cancellation",
    idempotencyKey: "idem-ph08-g05-cancel-001",
  });
  assert.equal(cancelled.order.status, "CANCELLED");
  let timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.deepEqual(timeline.map((event) => event.eventTypeCode), ["TRANSFER", "REVERSAL"]);
  assert.equal(timeline[1].reversalOfEventId, timeline[0].id);

  const reliefOrder = approvedOrder(services, "relief");
  clearAll(services, reliefOrder, "2026-08-10", "2026-08-12");
  const relief = services.transfer.deemRelieved(actor(), reliefOrder.id, {
    deemedRelievingDate: "2026-08-13",
    reason: "Relieving authority failed to act after clearance",
    idempotencyKey: "idem-ph08-g05-deemed-relief-001",
  });
  assert.equal(relief.order.status, "DEEMED_RELIEVED");
  assert.equal(relief.order.lastWorkingDay, "2026-08-13");
  timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.deepEqual(
    timeline.map((event) => event.eventTypeCode),
    ["TRANSFER", "REVERSAL", "TRANSFER", "RELIEVING"]
  );
  // Deemed relief maps to the catalog RELIEVING code with the forced-action detail in the payload.
  assert.equal(timeline[3].payload.deemed_relief, true);
  assert.equal(timeline[3].payload.forced_action, "DEEMED_RELIEF");
});

test("PH-08 G05 routes expose representation and retention", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const initiated = call(api, {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-ph08-g05-route-init-001" },
    body: transferInput(),
  });
  assert.equal(initiated.status, 201);
  const approved = call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}/approve`,
    headers: { "Idempotency-Key": "idem-ph08-g05-route-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);

  const represented = call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}/representations`,
    headers: { "Idempotency-Key": "idem-ph08-g05-route-rep-001" },
    body: { grounds: "Hardship representation" },
  });
  assert.equal(represented.status, 201);

  const retained = call(api, {
    method: "POST",
    path: `/api/v1/transfers/representations/${represented.body.representation.id}:retain`,
    headers: { "Idempotency-Key": "idem-ph08-g05-route-retain-001" },
    body: { decisionDate: "2026-08-05", reason: "Accepted" },
  });
  assert.equal(retained.status, 202);
  assert.equal(retained.body.order.status, "RETAINED");
});
