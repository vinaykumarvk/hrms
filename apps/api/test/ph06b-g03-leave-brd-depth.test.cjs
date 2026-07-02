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
    userId: "user-ph06b-g03",
    actorUserId: "user-ph06b-g03",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph06b-g03",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph06b-g03", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-06B FR-10 leave-type catalog drives validation, opening balances, and policy-driven accrual", () => {
  const services = createFoundationServices();

  assert.throws(
    () => services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "XX", fromDate: "2026-07-06", toDate: "2026-07-07" }),
    (err) => err.code === "VALIDATION_FAILED",
    "unknown leave type must be rejected"
  );

  const clBalance = services.leave.getBalance(actor(), ph03Ids.employee, "CL", 2026);
  assert.equal(clBalance.currentBalance, 8, "CL opening balance comes from the leave_types catalog, not a hardcoded 30");

  const catalog = services.leave.listLeaveTypes(actor());
  assert.ok(catalog.some((item) => item.leaveTypeId === "EL" && item.accrualPolicy.frequency === "HALF_YEARLY"));

  const accrued = services.leave.accrue(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", leaveYear: 2026, effectiveDate: "2026-07-01" });
  assert.equal(accrued.currentBalance, 45, "accrual without explicit units follows the leave_accrual_policies quantity (30 + 15)");
});

test("PH-06B LEAVE_OVERLAP blocks date-overlapping spells for the same employee", () => {
  const services = createFoundationServices();
  services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-13", toDate: "2026-07-15" });

  assert.throws(
    () => services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-15", toDate: "2026-07-16" }),
    (err) => err.code === "LEAVE_OVERLAP"
  );

  const nonOverlapping = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-20", toDate: "2026-07-21" });
  assert.equal(nonOverlapping.application.status, "SUBMITTED");
});

test("PH-06B INSUFFICIENT_BALANCE is the named code on the wire (generic CONFLICT is gone)", () => {
  const services = createFoundationServices();

  assert.throws(
    () => services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "CL", fromDate: "2026-08-03", toDate: "2026-08-11" }),
    (err) => err.code === "INSUFFICIENT_BALANCE",
    "9 requested days against the CL opening balance of 8"
  );

  const api = createFoundationApi(createFoundationServices());
  const response = call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-ph06b-insufficient-001" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "CL", fromDate: "2026-08-03", toDate: "2026-08-11" },
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "INSUFFICIENT_BALANCE");
});

test("PH-06B ELIGIBILITY_FAILED and ENTITLEMENT_EXCEEDED gate submission per leave type", () => {
  const services = createFoundationServices();

  assert.throws(
    () => services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "SL", fromDate: "2026-08-03", toDate: "2026-08-05" }),
    (err) => err.code === "ELIGIBILITY_FAILED",
    "Study Leave requires 60 months of completed service"
  );

  assert.throws(
    () => services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "CCL", fromDate: "2026-08-01", toDate: "2026-08-20" }),
    (err) => err.code === "ENTITLEMENT_EXCEEDED",
    "20 days exceeds the CCL sanction cap of 15 even though the balance covers it"
  );
});

test("PH-06B OPTIMISTIC_LOCK_CONFLICT fires on a stale leave_balances version and clears on the current one", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-13", toDate: "2026-07-15" });
  assert.equal(submitted.balance.version, 2, "reservation bumps the balance version");

  assert.throws(
    () => services.leave.approve(actor(), submitted.application.id, "idem-ph06b-approve-stale-001", 1),
    (err) => err.code === "OPTIMISTIC_LOCK_CONFLICT"
  );

  const approved = services.leave.approve(actor(), submitted.application.id, "idem-ph06b-approve-001", submitted.balance.version);
  assert.equal(approved.application.status, "APPROVED");
});

test("PH-06B FR-13 withdraw of a SUBMITTED spell releases the reservation and is routed", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-13", toDate: "2026-07-15" });
  assert.equal(submitted.balance.reserved, 3);

  const withdrawn = services.leave.withdraw(actor(), submitted.application.id);
  assert.equal(withdrawn.application.status, "WITHDRAWN");
  assert.equal(withdrawn.balance.reserved, 0);
  assert.equal(withdrawn.balance.availableBalance, 30);
  assert.ok(services.leave.listLedger(actor()).some((entry) => entry.leaveApplicationId === submitted.application.id && entry.entryType === "RELEASE"));
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G03_LEAVE_WITHDRAW"));

  assert.throws(
    () => services.leave.withdraw(actor(), submitted.application.id),
    (err) => err.code === "PRECONDITION_FAILED",
    "WITHDRAWN is reachable only from SUBMITTED"
  );

  const api = createFoundationApi(createFoundationServices());
  const routed = call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-ph06b-withdraw-submit-001" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-07-13", toDate: "2026-07-15" },
  });
  const routedWithdraw = call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${routed.body.application.id}:withdraw`,
    headers: { "Idempotency-Key": "idem-ph06b-withdraw-route-001" },
    body: {},
  });
  assert.equal(routedWithdraw.status, 202);
  assert.equal(routedWithdraw.body.application.status, "WITHDRAWN");
});

test("PH-06B FR-13 partial cancel of an APPROVED spell credits remaining days and relays a corrected G04 fact", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-08-10", toDate: "2026-08-14" });
  services.leave.approve(actor(), submitted.application.id, "idem-ph06b-partial-approve-001");

  const partial = services.leave.cancelApprovedPartial(actor(), submitted.application.id, "idem-ph06b-partial-cancel-001", { cancelFromDate: "2026-08-13" });
  assert.equal(partial.cancelledDays, 2);
  assert.equal(partial.application.status, "APPROVED", "the shortened spell stays APPROVED");
  assert.equal(partial.application.toDate, "2026-08-12");
  assert.equal(partial.application.totalDays, 3);
  assert.equal(partial.balance.debited, 3);
  assert.equal(partial.outboxEvent.eventTypeCode, "LEAVE_CANCELLED");
  assert.equal(partial.outboxEvent.status, "POSTED");
  assert.equal(partial.outboxEvent.payload.partial, true);
  assert.equal(partial.outboxEvent.payload.cancelledDays, 2);
  assert.ok(services.leave.listLedger(actor()).some((entry) => entry.leaveApplicationId === submitted.application.id && entry.entryType === "CANCELLATION_CREDIT" && entry.units === 2));
  assert.ok(services.leave.listPayrollSignals(actor()).some((signal) => signal.signalType === "LEAVE_REVERSAL" && signal.units === 2));

  const api = createFoundationApi(createFoundationServices());
  const routedSubmit = call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-ph06b-partial-submit-001" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-08-10", toDate: "2026-08-14" },
  });
  call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${routedSubmit.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-ph06b-partial-approve-route-001" },
    body: { decision: "APPROVE" },
  });
  const routedPartial = call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${routedSubmit.body.application.id}:cancel-partial`,
    headers: { "Idempotency-Key": "idem-ph06b-partial-cancel-route-001" },
    body: { cancelFromDate: "2026-08-13" },
  });
  assert.equal(routedPartial.status, 202);
  assert.equal(routedPartial.body.cancelledDays, 2);
});

test("PH-06B FR-02 holiday calendar excludes holidays from totalDays for non-holiday-counting leave types", () => {
  const services = createFoundationServices();
  const holiday = services.leave.addHoliday(actor(), { holidayDate: "2026-09-14", name: "Onam" });
  assert.equal(holiday.calendarId, "default");

  const cl = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "CL", fromDate: "2026-09-14", toDate: "2026-09-15" });
  assert.equal(cl.application.totalDays, 1, "Casual Leave excludes the holiday from the day count");

  services.leave.addHoliday(actor(), { holidayDate: "2026-09-21", name: "Local Holiday" });
  const el = services.leave.submit(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-09-21", toDate: "2026-09-22" });
  assert.equal(el.application.totalDays, 2, "Earned Leave counts holidays (sandwich rule)");

  const api = createFoundationApi(createFoundationServices());
  const routedHoliday = call(api, {
    method: "POST",
    path: "/api/v1/atl/holidays",
    headers: { "Idempotency-Key": "idem-ph06b-holiday-001" },
    body: { holidayDate: "2026-10-02", name: "Gandhi Jayanti" },
  });
  assert.equal(routedHoliday.status, 201);
  const listed = call(api, { method: "GET", path: "/api/v1/atl/holidays" });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.items.some((item) => item.holidayDate === "2026-10-02"));

  const routedType = call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-types",
    headers: { "Idempotency-Key": "idem-ph06b-leave-type-001" },
    body: { leaveTypeId: "RH", name: "Restricted Holiday", countsHolidays: false, openingBalance: 2, accrualFrequency: "YEARLY", accrualUnitsPerPeriod: 2 },
  });
  assert.equal(routedType.status, 201);
  const types = call(api, { method: "GET", path: "/api/v1/atl/leave-types" });
  assert.ok(types.body.items.some((item) => item.leaveTypeId === "RH" && item.openingBalance === 2));
});
