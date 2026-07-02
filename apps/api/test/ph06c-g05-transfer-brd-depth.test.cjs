// PH-06C: G05 transfer backend at BRD depth — gapless reserve-then-commit numbering via
// order_number_sequences, relieving_orders + last_working_day, joining_reports + G01
// applyTransferPosting posting update, frozen-catalog SR codes (TRANSFER/RELIEVING/JOINING),
// transfer cancel via the SR reversal envelope, configurable clearance departments.
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
    userId: "user-ph06c-g05",
    actorUserId: "user-ph06c-g05",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph06c-g05",
    ...extra,
  };
}

function transferInput(extra = {}) {
  return {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-07-02",
    effectiveDate: "2026-07-10",
    reason: "BRD-depth transfer",
    ...extra,
  };
}

function clearAll(services, order, completedOn, deemedOn) {
  const codes = order.clearanceItems.map((item) => item.code);
  for (const code of codes.slice(1)) {
    services.transfer.completeClearance(actor(), order.id, code, completedOn);
  }
  services.transfer.deemClearance(actor(), order.id, codes[0], deemedOn);
}

test("PH-06C order numbers are gapless via order_number_sequences reserve-then-commit", () => {
  const services = createFoundationServices();
  const first = services.transfer.initiate(actor(), transferInput());
  const second = services.transfer.initiate(actor(), transferInput({ orderDate: "2026-07-03", effectiveDate: "2026-07-11" }));
  // Numbers are reserved from the per-office/per-fiscal-year counter at issue...
  assert.equal(first.order.orderNo, "TO/2026/00001");
  assert.equal(second.order.orderNo, "TO/2026/00002");
  assert.equal(first.order.orderNumberCommitted, false);
  // ...and committed on approval; the committed series is dense (no length arithmetic, no gaps).
  const approvedFirst = services.transfer.approve(actor(), first.order.id, { idempotencyKey: "idem-ph06c-num-approve-001" });
  const approvedSecond = services.transfer.approve(actor(), second.order.id, { idempotencyKey: "idem-ph06c-num-approve-002" });
  assert.equal(approvedFirst.order.orderNumberCommitted, true);
  assert.equal(approvedSecond.order.orderNumberCommitted, true);
  const values = [approvedFirst.order.orderNumberValue, approvedSecond.order.orderNumberValue];
  assert.deepEqual(values, [1, 2]);
});

test("PH-06C full journey posts frozen-catalog TRANSFER/RELIEVING/JOINING and applies the G01 posting on join", () => {
  const services = createFoundationServices();
  // A transferee whose current posting is the SOURCE office, so the join visibly moves it.
  const created = services.employeeMaster.create(actor(), {
    firstName: "Meera",
    lastName: "Kulkarni",
    orgUnitId: ph03Ids.orgRevenue,
    dateOfJoining: "2020-01-01",
  });
  const employeeId = created.employee.id;
  const before = services.employeeMaster.getById(actor(), employeeId);
  assert.equal(before.orgUnitId, ph03Ids.orgRevenue);

  const initiated = services.transfer.initiate(actor(), transferInput({ employeeId }));
  const approved = services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: "idem-ph06c-journey-approve-001" });
  clearAll(services, approved.order, "2026-07-10", "2026-07-12");
  const joined = services.transfer.relieveAndJoin(actor(), initiated.order.id, {
    relievingDate: "2026-07-12",
    joiningDate: "2026-07-13",
    idempotencyKey: "idem-ph06c-journey-join-001",
  });

  // Frozen G12 catalog codes only — no module-invented event types.
  const timeline = services.serviceRegister.getTimeline(actor(), employeeId);
  assert.deepEqual(timeline.map((event) => event.eventTypeCode), ["TRANSFER", "RELIEVING", "JOINING"]);

  // relieving_orders entity persisted with the statutory last_working_day.
  assert.equal(joined.relievingOrder.lastWorkingDay, "2026-07-12");
  assert.match(joined.relievingOrder.relievingOrderNo, /^RO\/2026\/00001$/);
  const relievingOrders = services.transfer.listRelievingOrders(actor());
  assert.equal(relievingOrders.length, 1);
  assert.equal(relievingOrders[0].srEventId, joined.relievingSrEventId);

  // joining_reports entity persisted and confirmed.
  assert.match(joined.joiningReport.joiningReportNo, /^JR\/2026\/00001$/);
  assert.equal(joined.joiningReport.serviceContinuityAsserted, true);
  const joiningReports = services.transfer.listJoiningReports(actor());
  assert.equal(joiningReports.length, 1);
  assert.equal(joiningReports[0].status, "JOINED_CONFIRMED");

  // G01 posting update on join: EmployeeMasterService.applyTransferPosting moved the org unit.
  const after = services.employeeMaster.getById(actor(), employeeId);
  assert.equal(after.orgUnitId, ph03Ids.orgAssessment);
  assert.equal(after.rowVersion, before.rowVersion + 1);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G01_TRANSFER_POSTING_APPLIED"));
  const postingOutbox = services.employeeMaster
    .listChanges(actor())
    .filter((event) => event.eventType === "POSTING_UPDATED" && event.employeeId === employeeId);
  assert.equal(postingOutbox.length, 1);
  assert.equal(postingOutbox[0].payload.orgUnitId, ph03Ids.orgAssessment);
});

test("PH-06C transfer cancel flows through the SR reversal envelope, never a forward pseudo-event", () => {
  const services = createFoundationServices();
  const initiated = services.transfer.initiate(actor(), transferInput());
  services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: "idem-ph06c-cancel-approve-001" });
  const cancelled = services.transfer.cancel(actor(), initiated.order.id, {
    cancellationDate: "2026-07-05",
    reason: "Administrative withdrawal",
    idempotencyKey: "idem-ph06c-cancel-001",
  });
  assert.equal(cancelled.order.status, "CANCELLED");
  assert.match(cancelled.srEventId, /^sr-/);

  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.deepEqual(timeline.map((event) => event.eventTypeCode), ["TRANSFER", "REVERSAL"]);
  const reversal = timeline[1];
  // The reversal is APPENDED and linked to the original TRANSFER fact (is_reversal envelope).
  assert.equal(reversal.reversalOfEventId, timeline[0].id);
  assert.equal(reversal.payload.is_reversal, true);
  assert.equal(reversal.payload.reverses_source_reference_id, `g05_transfer_orders:${initiated.order.id}`);

  // Cancelling before approval reverses nothing (no ledger fact yet); the reserved statutory
  // number is voided with an audited reason instead.
  const pending = services.transfer.initiate(actor(), transferInput({ orderDate: "2026-07-06", effectiveDate: "2026-07-14" }));
  const preApprovalCancel = services.transfer.cancel(actor(), pending.order.id, {
    cancellationDate: "2026-07-07",
    reason: "Withdrawn before sanction",
    idempotencyKey: "idem-ph06c-cancel-002",
  });
  assert.equal(preApprovalCancel.order.status, "CANCELLED");
  assert.equal(preApprovalCancel.srEventId, undefined);
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 2);
});

test("PH-06C clearance departments are per-office configuration, not a hardcoded list", () => {
  const services = createFoundationServices();
  // Unconfigured office falls back to the seeded g05_clearance_department catalog (7 departments).
  const seeded = services.transfer.initiate(actor(), transferInput());
  const seededApproved = services.transfer.approve(actor(), seeded.order.id, { idempotencyKey: "idem-ph06c-config-approve-001" });
  assert.deepEqual(
    seededApproved.order.clearanceItems.map((item) => item.code),
    ["IT", "LIBRARY", "ACCOUNTS", "STORES", "ADVANCES", "ESTATE_QUARTERS", "HR"]
  );

  // An office may configure fewer departments; only configured departments open branches.
  const services2 = createFoundationServices();
  services2.transfer.configureClearanceDepartments(actor(), ph03Ids.orgRevenue, [
    { code: "ACCOUNTS", label: "Accounts clearance", slaDays: 5 },
    { code: "HR", label: "Establishment clearance", slaDays: 3 },
  ]);
  const configured = services2.transfer.initiate(actor(), transferInput());
  const configuredApproved = services2.transfer.approve(actor(), configured.order.id, { idempotencyKey: "idem-ph06c-config-approve-002" });
  assert.deepEqual(configuredApproved.order.clearanceItems.map((item) => item.code), ["ACCOUNTS", "HR"]);
  assert.ok(services2.audit.listAudit(actor()).some((entry) => entry.action === "G05_CLEARANCE_DEPARTMENTS_CONFIGURED"));

  // Codes outside the g05_clearance_department domain are rejected.
  assert.throws(
    () => services2.transfer.configureClearanceDepartments(actor(), ph03Ids.orgRevenue, [{ code: "VIGILANCE", label: "Not in domain", slaDays: 1 }]),
    (error) => error instanceof FoundationError && error.code === "VALIDATION_FAILED"
  );
});

test("PH-06C route surface still drives the BRD-depth flow end to end", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const initiated = api.dispatch({
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "X-Correlation-Id": "corr-ph06c-g05", "Idempotency-Key": "idem-ph06c-route-init-001" },
    actor: actor(),
    body: transferInput(),
  });
  assert.equal(initiated.status, 201);
  assert.equal(initiated.body.order.orderNo, "TO/2026/00001");

  const approved = api.dispatch({
    method: "POST",
    path: `/api/v1/transfers/orders/${initiated.body.order.id}/approve`,
    headers: { "X-Correlation-Id": "corr-ph06c-g05", "Idempotency-Key": "idem-ph06c-route-approve-001" },
    actor: actor(),
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.match(approved.body.srEventId, /^sr-/);
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].eventTypeCode, "TRANSFER");
});
