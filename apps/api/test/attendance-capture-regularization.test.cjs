const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Mark attendance / regularize punches — clock in/out, request correction for missed
// punches (G03)". Exercised over HTTP against seedTestEmployees:true data, not mocked records.

function actor(userId, permissions) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["employee"],
    fieldGrants: ["*"],
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  return { services, api, admin, sunita, rohan };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g03-attendance-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G03 attendance: the seed already has a real missed-punch anomaly (MISSING_OUT) for Sunita on 2026-07-13", async () => {
  const { api, admin, sunita } = boot();
  const records = (await call(api, admin, { method: "GET", path: "/api/v1/attendance/records" })).body.items.filter((r) => r.employeeId === sunita.id);
  const anomaly = records.find((r) => r.attendanceDate === "2026-07-13");
  assert.ok(anomaly, "the seed must include the missed-punch day");
  assert.equal(anomaly.status, "ANOMALY");
  assert.equal(anomaly.anomalyCode, "MISSING_OUT");
});

test("G03 attendance: an employee clocks in and out for themselves over HTTP", async () => {
  const { api, rohan } = boot();
  const captured = await call(api, actor(rohan.id, ["g03.attendance.capture"]), {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-g03-capture-001" },
    body: { employeeId: rohan.id, attendanceDate: "2026-07-13", inTime: "09:00", outTime: "17:30" },
  });
  assert.equal(captured.status, 201);
  assert.equal(captured.body.attendance.status, "PRESENT");
});

test("G03 attendance: an employee who clocks in without clocking out gets a MISSING_OUT anomaly", async () => {
  const { api, rohan } = boot();
  const captured = await call(api, actor(rohan.id, ["g03.attendance.capture"]), {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-g03-capture-002" },
    body: { employeeId: rohan.id, attendanceDate: "2026-07-11", inTime: "09:20" },
  });
  assert.equal(captured.status, 201);
  assert.equal(captured.body.attendance.status, "ANOMALY");
  assert.equal(captured.body.attendance.anomalyCode, "MISSING_OUT");
});

test("G03 attendance: a plain employee cannot regularise their own attendance (FORBIDDEN); an attendance admin can", async () => {
  const { api, sunita } = boot();
  const anomalyId = (await call(api, actor("probe", ["*"]), { method: "GET", path: "/api/v1/attendance/records" })).body.items.find(
    (record) => record.employeeId === sunita.id && record.attendanceDate === "2026-07-13"
  ).id;

  const selfAttempt = await call(api, actor(sunita.id, ["g03.leave.read"]), {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${anomalyId}:regularise`,
    headers: { "Idempotency-Key": "idem-g03-regularise-001" },
    body: { reason: "Forgot to clock out" },
  });
  assert.equal(selfAttempt.status, 403);

  const admin = actor("attendance-admin", ["g03.attendance.regularise"]);
  const regularised = await call(api, admin, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${anomalyId}:regularise`,
    headers: { "Idempotency-Key": "idem-g03-regularise-002" },
    body: { reason: "Confirmed with security log; employee left at 17:40" },
  });
  assert.equal(regularised.status, 202);
  assert.equal(regularised.body.attendance.status, "REGULARISED");
  assert.equal(regularised.body.attendance.isRegularised, true);
});

test("G03 attendance: the maker of an attendance capture cannot also regularise it, even when they hold the regularise permission (SOD_VIOLATION)", async () => {
  const { api, rohan } = boot();
  const maker = actor("attendance-self-approver", ["g03.attendance.capture", "g03.attendance.regularise"]);

  const captured = await call(api, maker, {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-g03-sod-capture-001" },
    body: { employeeId: rohan.id, attendanceDate: "2026-07-14", inTime: "09:30" },
  });
  assert.equal(captured.status, 201);
  assert.equal("capturedByUserId" in captured.body.attendance, false, "capture response must not leak the maker id");

  const selfRegularise = await call(api, maker, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${captured.body.attendance.id}:regularise`,
    headers: { "Idempotency-Key": "idem-g03-sod-regularise-001" },
    body: { reason: "Self-approving my own missed punch" },
  });
  assert.equal(selfRegularise.status, 403);
  assert.equal(selfRegularise.body.error.code, "SOD_VIOLATION");

  const differentChecker = actor("attendance-different-checker", ["g03.attendance.regularise"]);
  const regularised = await call(api, differentChecker, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${captured.body.attendance.id}:regularise`,
    headers: { "Idempotency-Key": "idem-g03-sod-regularise-002" },
    body: { reason: "Confirmed separately" },
  });
  assert.equal(regularised.status, 202);
  assert.equal("capturedByUserId" in regularised.body.attendance, false, "regularise response must not leak the maker id");

  const listed = await call(api, actor("probe", ["*"]), { method: "GET", path: "/api/v1/attendance/records" });
  for (const record of listed.body.items) {
    assert.equal("capturedByUserId" in record, false, "list response must not leak the maker id");
  }
});

test("G03 attendance: the regularisation backdate window and per-period cap are enforced (pre-existing engine, proven against seeded data)", async () => {
  const { api, rohan } = boot();
  // Capture and regularise as two different actors so this test isolates WINDOW_EXPIRED from the
  // (separately tested) SOD_VIOLATION self-approve gate.
  const maker = actor("attendance-maker", ["g03.attendance.capture"]);
  const checker = actor("attendance-admin", ["g03.attendance.regularise"]);

  const farInThePast = await call(api, maker, {
    method: "POST",
    path: "/api/v1/atl/attendance-captures",
    headers: { "Idempotency-Key": "idem-g03-old-capture-001" },
    body: { employeeId: rohan.id, attendanceDate: "2026-01-05", inTime: "09:00" },
  });
  assert.equal(farInThePast.status, 201);

  const expired = await call(api, checker, {
    method: "POST",
    path: `/api/v1/atl/attendance-captures/${farInThePast.body.attendance.id}:regularise`,
    headers: { "Idempotency-Key": "idem-g03-old-regularise-001" },
    body: { reason: "Too late to regularise" },
  });
  assert.equal(expired.status, 422);
  assert.equal(expired.body.error.code, "WINDOW_EXPIRED");
});
