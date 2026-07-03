const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph45a",
    actorUserId: "user-ph45a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph45a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph45a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

const approver = { userId: "reveal-approver", actorUserId: "reveal-approver" };

test("PH-45A G01 Aadhaar reveal (4-eyes): request -> approve; read vault", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const vault = services.aadhaarVault.captureAadhaar(actor(), { employeeId: ph03Ids.employee, rawAadhaar: "412345678900" });

  const req = call(api, {
    method: "POST",
    path: `/api/v1/employees/aadhaar-vault/${vault.id}:request-reveal`,
    headers: { "Idempotency-Key": "rev-1" },
    body: { purpose: "Pension disbursement verification" },
  });
  assert.equal(req.status, 201);
  const revealId = req.body.reveal.id;
  assert.equal(req.body.reveal.status, "REQUESTED");

  // 4-eyes: the requester cannot approve their own reveal.
  const selfApprove = call(api, { method: "POST", path: `/api/v1/employees/aadhaar-reveals/${revealId}:approve`, headers: { "Idempotency-Key": "rev-self" }, body: {} });
  assert.equal(selfApprove.status, 403);

  const approved = call(api, { method: "POST", path: `/api/v1/employees/aadhaar-reveals/${revealId}:approve`, headers: { "Idempotency-Key": "rev-ap" }, actor: approver, body: {} });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.request.status, "APPROVED");
  assert.match(approved.body.maskedAadhaar, /^XXXX-XXXX-\d{4}$/);

  const read = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/aadhaar-vault` });
  assert.equal(read.status, 200);
  assert.equal(read.body.vault.id, vault.id);
});

test("PH-45A G01 employee legal hold: place -> release; blocking obligation: register -> clear", () => {
  const api = createFoundationApi(createFoundationServices());
  const placed = call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}:place-legal-hold`,
    headers: { "Idempotency-Key": "lh-1" },
    body: { holdType: "LITIGATION", reason: "Pending writ petition" },
  });
  assert.equal(placed.status, 201);
  const holdId = placed.body.hold.id;
  assert.equal(placed.body.hold.status, "ACTIVE");

  const released = call(api, { method: "POST", path: `/api/v1/employees/legal-holds/${holdId}:release`, headers: { "Idempotency-Key": "lh-r" }, body: {} });
  assert.equal(released.status, 202);
  assert.equal(released.body.hold.status, "RELEASED");

  const obligation = call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}:register-obligation`,
    headers: { "Idempotency-Key": "ob-1" },
    body: { description: "Recover training bond" },
  });
  assert.equal(obligation.status, 201);
  const obligationId = obligation.body.obligation.id;
  assert.equal(obligation.body.obligation.status, "OPEN");

  const cleared = call(api, { method: "POST", path: `/api/v1/employees/obligations/${obligationId}:clear`, headers: { "Idempotency-Key": "ob-c" }, body: {} });
  assert.equal(cleared.status, 202);
  assert.equal(cleared.body.obligation.status, "CLEARED");
});

test("PH-45A G01 service-no lookup requires serviceNo and resolves a seeded employee", () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = call(api, { method: "GET", path: "/api/v1/employees:by-service-no" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");

  const found = call(api, { method: "GET", path: "/api/v1/employees:by-service-no", query: { serviceNo: "GOV-100245" } });
  assert.equal(found.status, 200);
  assert.equal(found.body.employee.serviceNo, "GOV-100245");
});
