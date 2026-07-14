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
    userId: "user-ph07d-g03",
    actorUserId: "user-ph07d-g03",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07d-g03",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07d-g03", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-07D FR-04 attendance day status is DERIVED: HOLIDAY, ON_LEAVE, HALF_DAY, PRESENT, ABSENT, ANOMALY", async () => {
  const services = createFoundationServices();

  // FR-02 holiday calendar drives HOLIDAY derivation — the caller passes no status.
  services.leave.addHoliday(actor(), { holidayDate: "2026-08-15", name: "Independence Day" });
  const holiday = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-08-15" });
  assert.equal(holiday.status, "HOLIDAY");

  // Approved leave spell drives ON_LEAVE derivation.
  const submitted = services.leave.submit(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-08-10",
    toDate: "2026-08-11",
    reason: "Family function",
  });
  services.leave.approve(actor(), submitted.application.id, "idem-ph07d-derive-approve-001");
  const onLeave = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-08-10" });
  assert.equal(onLeave.status, "ON_LEAVE");

  // Short attendance (< half-day threshold) derives HALF_DAY.
  const halfDay = services.leave.captureAttendance(actor(), {
    employeeId: ph03Ids.employee,
    attendanceDate: "2026-08-12",
    inTime: "09:00",
    outTime: "12:00",
  });
  assert.equal(halfDay.status, "HALF_DAY");

  // Full punches derive PRESENT; no punches derive ABSENT; one punch stays ANOMALY.
  const present = services.leave.captureAttendance(actor(), {
    employeeId: ph03Ids.employee,
    attendanceDate: "2026-08-13",
    inTime: "09:00",
    outTime: "17:30",
  });
  assert.equal(present.status, "PRESENT");
  const absent = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-08-14" });
  assert.equal(absent.status, "ABSENT");
  const anomaly = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-08-17", inTime: "09:05" });
  assert.equal(anomaly.status, "ANOMALY");
  assert.equal(anomaly.anomalyCode, "MISSING_OUT");
});

test("PH-07D FR-05 regularisation enforces the backdate window (WINDOW_EXPIRED) and per-period cap (REGULARISATION_LIMIT)", async () => {
  const services = createFoundationServices();

  // Outside the 30-day backdate window -> WINDOW_EXPIRED, day untouched.
  const stale = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-01-05", inTime: "09:00" });
  assert.throws(
    () => services.leave.regulariseAttendance(actor(), stale.id, "Very late correction", "2026-03-15"),
    (error) => error.code === "WINDOW_EXPIRED"
  );
  assert.equal(services.leave.listAttendance(actor()).find((record) => record.id === stale.id).status, "ANOMALY");

  // Within the window the per-period cap (3) applies: 3 succeed, the 4th is rejected.
  const anomalies = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map((attendanceDate) =>
    services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate, inTime: "09:00" })
  );
  for (const record of anomalies.slice(0, 3)) {
    const result = services.leave.regulariseAttendance(actor(), record.id, "Missed punch", "2026-06-20");
    assert.equal(result.attendance.status, "REGULARISED");
    assert.equal(result.signal.signalType, "ATTENDANCE_REGULARISED");
  }
  assert.throws(
    () => services.leave.regulariseAttendance(actor(), anomalies[3].id, "One too many", "2026-06-20"),
    (error) => error.code === "REGULARISATION_LIMIT"
  );
});

test("PH-07D FR-17 payroll feed: generation, period lock (PERIOD_ALREADY_LOCKED), and locked-period adjustment emission (R6)", async () => {
  const services = createFoundationServices();

  // Build July inputs: approved leave (LEAVE_DEBIT), present day, overtime.
  const submitted = services.leave.submit(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-07-20",
    toDate: "2026-07-21",
    reason: "Personal work",
  });
  services.leave.approve(actor(), submitted.application.id, "idem-ph07d-feed-approve-001");
  services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-07-15", inTime: "09:00", outTime: "17:30" });
  services.leave.recordOvertime(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-07-15", minutes: 60 });

  // FR-17: per-employee per-period payroll_attendance_feed row is generated and persisted.
  const rows = services.leave.generatePayrollFeed(actor(), "2026-07");
  assert.equal(rows.length, 1);
  const feedRow = rows[0];
  assert.equal(feedRow.payPeriod, "2026-07");
  assert.equal(feedRow.employeeId, ph03Ids.employee);
  assert.equal(feedRow.lwpDays, 2);
  assert.equal(feedRow.paidOtMinutes, 60);
  assert.equal(feedRow.presentUnits, 1);
  assert.equal(feedRow.isLocked, false);

  // Lock the period: rows freeze (is_locked + EXPORTED).
  const locked = services.leave.lockPayrollFeedPeriod(actor(), "2026-07");
  assert.equal(locked.lockedRows, 1);
  const lockedRow = services.leave.listPayrollFeed(actor(), "2026-07")[0];
  assert.equal(lockedRow.isLocked, true);
  assert.equal(lockedRow.exportStatus, "EXPORTED");

  // NEGATIVE: any direct write into the locked period fails closed with PERIOD_ALREADY_LOCKED.
  assert.throws(
    () => services.leave.generatePayrollFeed(actor(), "2026-07"),
    (error) => error.code === "PERIOD_ALREADY_LOCKED"
  );
  assert.throws(
    () => services.leave.lockPayrollFeedPeriod(actor(), "2026-07"),
    (error) => error.code === "PERIOD_ALREADY_LOCKED"
  );

  // R6: an approved-leave cancellation inside the locked period does NOT mutate the locked
  // feed row — it emits a payroll_feed_adjustments row against the next open period.
  services.leave.cancelApproved(actor(), submitted.application.id, "idem-ph07d-feed-cancel-001", "2026-07-21");
  const adjustments = services.leave.listPayrollFeedAdjustments(actor());
  assert.equal(adjustments.length, 1);
  assert.equal(adjustments[0].originalFeedId, feedRow.id);
  assert.equal(adjustments[0].appliedInPayPeriod, "2026-08");
  assert.equal(adjustments[0].adjustmentType, "LWP_DELTA");
  assert.equal(adjustments[0].deltaValue, -2);
  assert.equal(adjustments[0].sourceRefType, "LEAVE_CANCEL");
  assert.equal(adjustments[0].status, "PENDING");

  // Locked feed row is immutable — the correction went next-period, not in-place.
  const afterCancel = services.leave.listPayrollFeed(actor(), "2026-07")[0];
  assert.equal(afterCancel.lwpDays, 2);
  assert.equal(afterCancel.isLocked, true);
  // No LEAVE_REVERSAL signal leaked into the locked period.
  assert.equal(services.leave.listPayrollSignals(actor()).some((signal) => signal.signalType === "LEAVE_REVERSAL"), false);

  // Regularisation of a locked-period day also routes as an adjustment (FR-05 R6).
  const anomaly = services.leave.captureAttendance(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-07-16", inTime: "09:00" });
  const regularised = services.leave.regulariseAttendance(actor(), anomaly.id, "Device outage", "2026-07-25");
  assert.equal(regularised.attendance.status, "REGULARISED");
  assert.equal(regularised.signal, undefined);
  assert.equal(regularised.adjustment.adjustmentType, "PRESENT_DELTA");
  assert.equal(regularised.adjustment.sourceRefType, "REGULARISATION");
  assert.equal(regularised.adjustment.appliedInPayPeriod, "2026-08");
});

test("PH-07D API routes expose feed generation, period lock, feed rows, and adjustments", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);

  const submitted = await call(api, {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-ph07d-route-submit-001" },
    body: { employeeId: ph03Ids.employee, leaveTypeId: "EL", fromDate: "2026-09-07", toDate: "2026-09-08" },
  });
  assert.equal(submitted.status, 201);
  const decided = await call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${submitted.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-ph07d-route-approve-001" },
    body: { decision: "APPROVE" },
  });
  assert.equal(decided.status, 202);

  const generated = await call(api, {
    method: "POST",
    path: "/api/v1/atl/payroll-feed:generate",
    headers: { "Idempotency-Key": "idem-ph07d-route-feedgen-001" },
    body: { payPeriod: "2026-09" },
  });
  assert.equal(generated.status, 202);
  assert.equal(generated.body.items.length, 1);
  assert.equal(generated.body.items[0].lwpDays, 2);

  const lock = await call(api, {
    method: "POST",
    path: "/api/v1/atl/payroll-feed:lock",
    headers: { "Idempotency-Key": "idem-ph07d-route-feedlock-001" },
    body: { payPeriod: "2026-09" },
  });
  assert.equal(lock.status, 202);
  assert.equal(lock.body.lockedRows, 1);

  // NEGATIVE over the wire: locked period rejects generation with 409 PERIOD_ALREADY_LOCKED.
  const relocked = await call(api, {
    method: "POST",
    path: "/api/v1/atl/payroll-feed:generate",
    headers: { "Idempotency-Key": "idem-ph07d-route-feedgen-002" },
    body: { payPeriod: "2026-09" },
  });
  assert.equal(relocked.status, 409);
  assert.equal(relocked.body.error.code, "PERIOD_ALREADY_LOCKED");

  // Locked-period cancellation emits an adjustment visible through the API.
  const cancelled = await call(api, {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${submitted.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-ph07d-route-cancel-001" },
    body: { decision: "CANCEL", cancelDate: "2026-09-08" },
  });
  assert.equal(cancelled.status, 202);

  const feed = await call(api, { method: "GET", path: "/api/v1/atl/payroll-feed", query: { payPeriod: "2026-09" } });
  assert.equal(feed.status, 200);
  assert.equal(feed.body.items[0].isLocked, true);
  assert.equal(feed.body.items[0].lwpDays, 2);

  const adjustments = await call(api, { method: "GET", path: "/api/v1/atl/payroll-feed-adjustments" });
  assert.equal(adjustments.status, 200);
  assert.equal(adjustments.body.items.length, 1);
  assert.equal(adjustments.body.items[0].appliedInPayPeriod, "2026-10");

  // WINDOW_EXPIRED negative over the wire (422).
  const anomaly = await call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-ph07d-route-att-001" },
    body: { employeeId: ph03Ids.employee, attendanceDate: "2026-01-05", inTime: "09:00" },
  });
  assert.equal(anomaly.status, 201);
  const expired = await call(api, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${anomaly.body.attendance.id}:regularise`,
    headers: { "Idempotency-Key": "idem-ph07d-route-reg-001" },
    body: { reason: "Too late", asOfDate: "2026-03-15" },
  });
  assert.equal(expired.status, 422);
  assert.equal(expired.body.error.code, "WINDOW_EXPIRED");
});
