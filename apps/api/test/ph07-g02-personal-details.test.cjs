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
    userId: "user-ph07-g02",
    actorUserId: "user-ph07-g02",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["employee.pan"],
    correlationId: "corr-ph07-g02",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07-g02", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-07 G02 routes sensitive fields differently and creates G13 evidence", () => {
  const services = createFoundationServices();
  const sensitive = services.personalDetails.createRequest(actor(), {
    employeeId: ph03Ids.employee,
    fieldCode: "pan",
    newValue: "AAAAA1111A",
    reason: "PAN correction",
    evidenceTitle: "PAN proof",
  });
  assert.equal(sensitive.request.sensitivity, "HIGH");
  assert.equal(sensitive.request.status, "IN_REVIEW");
  assert.equal(sensitive.request.documentIds.length, 1);
  assert.equal(services.documentVault.listByModuleRef(actor(), "G02", sensitive.request.id).length, 1);
});

test("PH-07 G02 approved display-name change commits through G01-owned SR posting and can reverse through G01", () => {
  const services = createFoundationServices();
  const request = services.personalDetails.createRequest(actor(), {
    employeeId: ph03Ids.employee,
    fieldCode: "displayName",
    newValue: "Kiran Patel Corrected",
    reason: "Gazette update",
    evidenceTitle: "Gazette proof",
  }).request;
  services.personalDetails.approve(actor(), request.id);
  const committed = services.personalDetails.commit(actor(), request.id, "idem-ph07-g02-commit-001", "2026-07-24");
  assert.equal(committed.status, "COMMITTED");
  assert.match(committed.srEventId, /^sr-/);
  assert.equal(services.employeeMaster.getById(actor(), ph03Ids.employee).displayName, "Kiran Patel Corrected");

  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].sourceModule, "G01");
  assert.equal(timeline[0].eventTypeCode, "IDENTITY_CHANGE");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G02_CHANGE_REQUEST_COMMIT" && entry.metadata.ownerModule === "G01"));

  const reversed = services.personalDetails.reverse(actor(), request.id, "idem-ph07-g02-reverse-001", "2026-07-25");
  assert.equal(reversed.status, "REVERSED");
  assert.equal(services.employeeMaster.getById(actor(), ph03Ids.employee).displayName, "Kiran Patel");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 2);
});

test("PH-07 G02 API flow creates, approves, commits, and lists change requests", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/personal-details/change-requests",
    headers: { "Idempotency-Key": "idem-ph07-g02-create-route-001" },
    body: {
      employeeId: ph03Ids.employee,
      fieldCode: "displayName",
      newValue: "Kiran Route Corrected",
      reason: "Gazette update",
      evidenceTitle: "Gazette route proof",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.request.sensitivity, "LOW");

  const approved = call(api, {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/${created.body.request.id}:approve`,
    headers: { "Idempotency-Key": "idem-ph07-g02-approve-route-001" },
    body: {},
  });
  assert.equal(approved.status, 202);

  const committed = call(api, {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/${created.body.request.id}:commit`,
    headers: { "Idempotency-Key": "idem-ph07-g02-commit-route-001" },
    body: { effectiveDate: "2026-07-26" },
  });
  assert.equal(committed.status, 202);
  assert.equal(committed.body.request.status, "COMMITTED");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].sourceModule, "G01");

  const list = call(api, { method: "GET", path: "/api/v1/personal-details/change-requests" });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
});
