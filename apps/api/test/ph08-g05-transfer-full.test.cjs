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
  services.transfer.approve(actor(), initiated.order.id);
  return initiated.order;
}

test("PH-08 G05 representation retention posts TRANSFER_RETAINED through G12", () => {
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
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].eventTypeCode, "TRANSFER_RETAINED");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_REPRESENTATION_FILED"));
});

test("PH-08 G05 cancellation and deemed relief are separate SR events", () => {
  const services = createFoundationServices();
  const cancellable = approvedOrder(services, "cancel");
  const cancelled = services.transfer.cancel(actor(), cancellable.id, {
    cancellationDate: "2026-08-06",
    reason: "Administrative cancellation",
    idempotencyKey: "idem-ph08-g05-cancel-001",
  });
  assert.equal(cancelled.order.status, "CANCELLED");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].eventTypeCode, "TRANSFER_CANCELLED");

  const reliefOrder = approvedOrder(services, "relief");
  services.transfer.completeClearance(actor(), reliefOrder.id, "HR", "2026-08-10");
  services.transfer.completeClearance(actor(), reliefOrder.id, "ESTATE", "2026-08-10");
  services.transfer.deemClearance(actor(), reliefOrder.id, "VIGILANCE", "2026-08-12");
  const relief = services.transfer.deemRelieved(actor(), reliefOrder.id, {
    deemedRelievingDate: "2026-08-13",
    reason: "Relieving authority failed to act after clearance",
    idempotencyKey: "idem-ph08-g05-deemed-relief-001",
  });
  assert.equal(relief.order.status, "DEEMED_RELIEVED");
  const events = services.serviceRegister.getTimeline(actor(), ph03Ids.employee).map((event) => event.eventTypeCode);
  assert.deepEqual(events, ["TRANSFER_CANCELLED", "TRANSFER_DEEMED_RELIEVED"]);
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
