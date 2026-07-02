// PH-07C: G02 personal-details workflow at BRD depth — catalog-driven sensitivity, approval
// matrix routing, SoD maker!=checker (ERR-G02-SOD), mandatory decision reason (ERR-REASON-REQ),
// RETURNED/resubmit/withdraw transitions, and the P02-masked field-diff endpoint.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const MAKER = "user-ph07c-maker";
const CHECKER = "user-ph07c-checker";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: MAKER,
    actorUserId: MAKER,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07c-g02",
    ...extra,
  };
}

function checker(extra = {}) {
  return actor({ userId: CHECKER, actorUserId: CHECKER, ...extra });
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph07c-g02", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function submit(services, overrides = {}) {
  return services.personalDetails.createRequest(actor(), {
    employeeId: ph03Ids.employee,
    fieldCode: "displayName",
    newValue: "Kiran Depth Corrected",
    reason: "Gazette update",
    ...overrides,
  }).request;
}

test("PH-07C sensitivity and stage come from field_sensitivity_catalog + approval_matrix_config, not code", () => {
  const services = createFoundationServices();
  const low = submit(services);
  assert.equal(low.sensitivity, "LOW");
  assert.equal(low.workflowStage, "PENDING_MANAGER_REVIEW");

  const high = submit(services, { fieldCode: "pan", newValue: "AAAAA1111A" });
  assert.equal(high.sensitivity, "HIGH");
  assert.equal(high.workflowStage, "PENDING_SENSITIVE_REVIEW");

  // The catalog is authoritative: a new config version reroutes without any code change.
  const catalogEntry = services.personalDetails["repository"].findSensitivityCatalogEntry(actor(), "displayName");
  services.personalDetails["repository"].saveSensitivityCatalogEntry({ ...catalogEntry, sensitivity: "HIGH", version: 2 });
  const rerouted = submit(services);
  assert.equal(rerouted.sensitivity, "HIGH");
  assert.equal(rerouted.workflowStage, "PENDING_SENSITIVE_REVIEW");

  // An unregistered field is rejected instead of falling back to a hardcoded default.
  assert.throws(
    () => submit(services, { fieldCode: "unregisteredField" }),
    (error) => error.code === "VALIDATION_FAILED"
  );
});

test("PH-07C SoD negative: the maker who submitted the request cannot approve it (ERR-G02-SOD)", () => {
  const services = createFoundationServices();
  const request = submit(services);
  assert.throws(
    () => services.personalDetails.approve(actor(), request.id),
    (error) => error.code === "FORBIDDEN" && error.details.messageId === "ERR-G02-SOD"
  );
  // The checker (a different user) can approve the same request.
  const approved = services.personalDetails.approve(checker(), request.id);
  assert.equal(approved.status, "APPROVED");
});

test("PH-07C SoD covers the last editor: resubmitting maker stays barred from deciding (ERR-G02-SOD)", () => {
  const services = createFoundationServices();
  const request = submit(services);
  services.personalDetails.sendBack(checker(), request.id, "Please attach the gazette copy");
  services.personalDetails.resubmit(actor(), request.id, { reason: "Attached gazette copy" });
  assert.throws(
    () => services.personalDetails.reject(actor(), request.id, "self-decision attempt"),
    (error) => error.code === "FORBIDDEN" && error.details.messageId === "ERR-G02-SOD"
  );
});

test("PH-07C mandatory decision reason: reject and sendBack without a comment raise ERR-REASON-REQ", () => {
  const services = createFoundationServices();
  const request = submit(services);
  assert.throws(
    () => services.personalDetails.reject(checker(), request.id, undefined),
    (error) => error.code === "VALIDATION_FAILED" && error.details.messageId === "ERR-REASON-REQ"
  );
  assert.throws(
    () => services.personalDetails.sendBack(checker(), request.id, "   "),
    (error) => error.code === "VALIDATION_FAILED" && error.details.messageId === "ERR-REASON-REQ"
  );
  const rejected = services.personalDetails.reject(checker(), request.id, "Evidence does not match the requested value");
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.decisionComment, "Evidence does not match the requested value");
});

test("PH-07C sendBack -> RETURNED -> resubmit re-routes on a fresh workflow instance with the same requestNo", () => {
  const services = createFoundationServices();
  const request = submit(services);
  const returned = services.personalDetails.sendBack(checker(), request.id, "Name spelling differs from the gazette");
  assert.equal(returned.status, "RETURNED");
  assert.equal(returned.decisionComment, "Name spelling differs from the gazette");

  // Only the requester may resubmit, and only from RETURNED.
  assert.throws(
    () => services.personalDetails.resubmit(checker(), request.id, { reason: "not my request" }),
    (error) => error.code === "FORBIDDEN"
  );
  const resubmitted = services.personalDetails.resubmit(actor(), request.id, {
    newValue: "Kiran Depth Gazette",
    reason: "Corrected to gazette spelling",
  });
  assert.equal(resubmitted.status, "IN_REVIEW");
  assert.equal(resubmitted.revisionNo, 2);
  assert.equal(resubmitted.requestNo, request.requestNo, "BR2: resubmit keeps the same request number");
  assert.notEqual(resubmitted.workflowInstanceId, request.workflowInstanceId, "resubmit re-routes on a new P01 instance");
  assert.throws(
    () => services.personalDetails.resubmit(actor(), request.id, { reason: "double resubmit" }),
    (error) => error.code === "CONFLICT"
  );
});

test("PH-07C withdraw: requester recalls a pending request to WITHDRAWN; never after APPROVED", () => {
  const services = createFoundationServices();
  const request = submit(services);
  assert.throws(
    () => services.personalDetails.withdraw(checker(), request.id),
    (error) => error.code === "FORBIDDEN"
  );
  const withdrawn = services.personalDetails.withdraw(actor(), request.id, "No longer needed");
  assert.equal(withdrawn.status, "WITHDRAWN");

  const approvedRequest = submit(services);
  services.personalDetails.approve(checker(), approvedRequest.id);
  assert.throws(
    () => services.personalDetails.withdraw(actor(), approvedRequest.id),
    (error) => error.code === "CONFLICT"
  );
});

test("PH-07C masked diff: GET /change-requests/{id}/diff applies P02 masking for readers without the field grant", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/personal-details/change-requests",
    headers: { "Idempotency-Key": "idem-ph07c-diff-001" },
    body: { employeeId: ph03Ids.employee, fieldCode: "pan", newValue: "AAAAA1111A", reason: "PAN correction" },
  });
  assert.equal(created.status, 201);
  const requestId = created.body.request.id;

  const maskedDiff = call(api, { method: "GET", path: `/api/v1/change-requests/${requestId}/diff` });
  assert.equal(maskedDiff.status, 200);
  assert.equal(maskedDiff.body.fields.length, 1);
  assert.equal(maskedDiff.body.fields[0].masked, true);
  assert.equal(maskedDiff.body.fields[0].oldValue, "[HIDDEN]");
  assert.equal(maskedDiff.body.fields[0].newValue, "[HIDDEN]");
  assert.equal(JSON.stringify(maskedDiff.body).includes("AAAAA1111A"), false, "raw sensitive value never leaks");

  const unmaskedDiff = call(api, {
    method: "GET",
    path: `/api/v1/change-requests/${requestId}/diff`,
    actor: { fieldGrants: ["employee.pan"] },
  });
  assert.equal(unmaskedDiff.body.fields[0].masked, false);
  assert.equal(unmaskedDiff.body.fields[0].newValue, "AAAAA1111A");
});

test("PH-07C lifecycle routes: send-back, resubmit, and withdraw are registered and guarded end-to-end", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/personal-details/change-requests",
    headers: { "Idempotency-Key": "idem-ph07c-route-001" },
    body: { employeeId: ph03Ids.employee, fieldCode: "displayName", newValue: "Kiran Route Depth", reason: "Gazette update" },
  });
  const requestId = created.body.request.id;

  const missingReason = call(api, {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/${requestId}:send-back`,
    headers: { "Idempotency-Key": "idem-ph07c-route-002" },
    body: {},
    actor: { userId: CHECKER, actorUserId: CHECKER },
  });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.body.error.details.messageId, "ERR-REASON-REQ");

  const sodBreach = call(api, {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/${requestId}:approve`,
    headers: { "Idempotency-Key": "idem-ph07c-route-003" },
    body: {},
  });
  assert.equal(sodBreach.status, 403);
  assert.equal(sodBreach.body.error.details.messageId, "ERR-G02-SOD");

  const returned = call(api, {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/${requestId}:send-back`,
    headers: { "Idempotency-Key": "idem-ph07c-route-004" },
    body: { comment: "Attach evidence" },
    actor: { userId: CHECKER, actorUserId: CHECKER },
  });
  assert.equal(returned.status, 202);
  assert.equal(returned.body.request.status, "RETURNED");

  const resubmitted = call(api, {
    method: "POST",
    path: `/api/v1/change-requests/${requestId}/resubmit`,
    headers: { "Idempotency-Key": "idem-ph07c-route-005" },
    body: { reason: "Evidence attached" },
  });
  assert.equal(resubmitted.status, 202);
  assert.equal(resubmitted.body.request.status, "IN_REVIEW");
  assert.equal(resubmitted.body.request.revisionNo, 2);

  const withdrawn = call(api, {
    method: "POST",
    path: `/api/v1/change-requests/${requestId}/withdraw`,
    headers: { "Idempotency-Key": "idem-ph07c-route-006" },
    body: { reason: "Requester recall" },
  });
  assert.equal(withdrawn.status, 202);
  assert.equal(withdrawn.body.request.status, "WITHDRAWN");
});
