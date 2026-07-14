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
    userId: "user-ph07-g03",
    actorUserId: "user-ph07-g03",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07-g03",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07-g03", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-07 G03 accrual, leave approval, cancellation, and payroll signals are stable for G10", async () => {
  const services = createFoundationServices();
  const accrued = services.leave.accrue(actor(), { employeeId: ph03Ids.employee, leaveTypeId: "EL", leaveYear: 2026, units: 2, effectiveDate: "2026-07-01" });
  assert.equal(accrued.currentBalance, 32);

  const submitted = services.leave.submit(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-07-28",
    toDate: "2026-07-29",
    reason: "Personal work",
  });
  const approved = services.leave.approve(actor(), submitted.application.id, "idem-ph07-g03-approve-001");
  assert.equal(approved.outboxEvent.sourceModule, "G04");
  assert.equal(approved.outboxEvent.status, "POSTED");

  const cancelled = services.leave.cancelApproved(actor(), submitted.application.id, "idem-ph07-g03-cancel-001", "2026-07-27");
  assert.equal(cancelled.application.status, "CANCELLED");
  assert.equal(cancelled.outboxEvent.eventTypeCode, "LEAVE_CANCELLED");

  const signals = services.leave.listPayrollSignals(actor());
  assert.equal(signals.some((signal) => signal.signalType === "LEAVE_DEBIT" && signal.status === "READY_FOR_G10"), true);
  assert.equal(signals.some((signal) => signal.signalType === "LEAVE_REVERSAL" && signal.status === "READY_FOR_G10"), true);
});

test("PH-07 G03 attendance regularisation recomputes and emits payroll signals", async () => {
  const services = createFoundationServices();
  const anomalous = services.leave.captureAttendance(actor(), {
    employeeId: ph03Ids.employee,
    attendanceDate: "2026-07-30",
    inTime: "10:15",
  });
  assert.equal(anomalous.status, "ANOMALY");
  assert.equal(anomalous.anomalyCode, "MISSING_OUT");

  const regularised = services.leave.regulariseAttendance(actor(), anomalous.id, "Forgot evening punch");
  assert.equal(regularised.attendance.status, "REGULARISED");
  assert.equal(regularised.job.status, "SUCCEEDED");
  assert.equal(regularised.signal.signalType, "ATTENDANCE_REGULARISED");

  const overtime = services.leave.recordOvertime(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-07-30", minutes: 90 });
  assert.equal(overtime.signalType, "OVERTIME");
  assert.equal(services.leave.listPayrollSignals(actor()).length, 2);
});

test("PH-07 G03 API routes expose attendance regularisation, overtime, and payroll signals", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const attendance = await call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-ph07-g03-attendance-route-001" },
    body: { employeeId: ph03Ids.employee, attendanceDate: "2026-07-31", inTime: "10:00" },
  });
  assert.equal(attendance.status, 201);
  assert.equal(attendance.body.attendance.status, "ANOMALY");

  const regularised = await call(api, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${attendance.body.attendance.id}:regularise`,
    headers: { "Idempotency-Key": "idem-ph07-g03-reg-route-001" },
    body: { reason: "Punch device outage" },
  });
  assert.equal(regularised.status, 202);
  assert.equal(regularised.body.signal.status, "READY_FOR_G10");

  const overtime = await call(api, {
    method: "POST",
    path: "/api/v1/atl/overtime",
    headers: { "Idempotency-Key": "idem-ph07-g03-ot-route-001" },
    body: { employeeId: ph03Ids.employee, attendanceDate: "2026-07-31", minutes: "45" },
  });
  assert.equal(overtime.status, 201);

  const signals = await call(api, { method: "GET", path: "/api/v1/atl/payroll-signals" });
  assert.equal(signals.status, 200);
  assert.equal(signals.body.items.length, 2);
});
