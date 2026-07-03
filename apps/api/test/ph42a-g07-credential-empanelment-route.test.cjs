const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph42a",
    actorUserId: "user-ph42a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph42a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph42a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

const submitter = { userId: "cred-submitter", actorUserId: "cred-submitter" };
const reviewer = { userId: "cred-reviewer", actorUserId: "cred-reviewer" };

test("PH-42A G07 external credential: capture -> review-evidence -> verify (SoD enforced)", () => {
  const api = createFoundationApi(createFoundationServices());
  const captured = call(api, {
    method: "POST",
    path: "/api/v1/training/external-credentials",
    headers: { "Idempotency-Key": "cred-1" },
    actor: submitter,
    body: { employeeId: ph03Ids.employee, title: "PMP", issuingBody: "PMI", externalReferenceNo: "PMP-001", issueDate: "2025-06-01" },
  });
  assert.equal(captured.status, 201);
  const id = captured.body.credential.id;
  assert.equal(captured.body.credential.verificationStatus, "PENDING");

  // SoD: the submitter cannot review their own credential.
  const selfReview = call(api, {
    method: "POST",
    path: `/api/v1/training/external-credentials/${id}:review-evidence`,
    headers: { "Idempotency-Key": "cred-self" },
    actor: submitter,
    body: { reviewedOn: "2025-06-05" },
  });
  assert.equal(selfReview.status, 403);

  const reviewed = call(api, {
    method: "POST",
    path: `/api/v1/training/external-credentials/${id}:review-evidence`,
    headers: { "Idempotency-Key": "cred-rev" },
    actor: reviewer,
    body: { reviewedOn: "2025-06-05", comments: "Certificate authentic" },
  });
  assert.equal(reviewed.status, 202);

  const verified = call(api, {
    method: "POST",
    path: `/api/v1/training/external-credentials/${id}:verify`,
    headers: { "Idempotency-Key": "cred-ver" },
    actor: reviewer,
    body: { verifiedOn: "2025-06-08", verificationMethod: "ISSUER_PORTAL" },
  });
  assert.equal(verified.status, 202);
  assert.equal(verified.body.credential.verificationStatus, "VERIFIED");

  const trail = call(api, { method: "GET", path: `/api/v1/training/external-credentials/${id}/verifications` });
  assert.equal(trail.status, 200);
  assert.ok(trail.body.items.length >= 3); // SUBMITTED, EVIDENCE_REVIEWED, VERIFIED
});

test("PH-42A G07 external credential: duplicate external reference is rejected (VAL-G07-CREDREF)", () => {
  const api = createFoundationApi(createFoundationServices());
  const body = { employeeId: ph03Ids.employee, title: "AWS SA", issuingBody: "AWS", externalReferenceNo: "AWS-DUP", issueDate: "2025-01-01" };
  const first = call(api, { method: "POST", path: "/api/v1/training/external-credentials", headers: { "Idempotency-Key": "dup-1" }, actor: submitter, body });
  assert.equal(first.status, 201);
  const dup = call(api, { method: "POST", path: "/api/v1/training/external-credentials", headers: { "Idempotency-Key": "dup-2" }, actor: submitter, body });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, "VAL-G07-CREDREF");
});

test("PH-42A G07 vendor empanelment: apply -> review -> decide (4-eyes enforced)", () => {
  const api = createFoundationApi(createFoundationServices());
  const requester = { userId: "emp-requester", actorUserId: "emp-requester" };
  const approver = { userId: "emp-approver", actorUserId: "emp-approver" };

  const applied = call(api, {
    method: "POST",
    path: "/api/v1/training/vendor-empanelments",
    headers: { "Idempotency-Key": "emp-1" },
    actor: requester,
    body: { vendorName: "Acme Training", category: "LEADERSHIP" },
  });
  assert.equal(applied.status, 201);
  const id = applied.body.empanelment.id;

  assert.equal(call(api, { method: "POST", path: `/api/v1/training/vendor-empanelments/${id}:review`, headers: { "Idempotency-Key": "emp-r" }, actor: approver, body: {} }).status, 202);

  // 4-eyes: the requester cannot approve their own empanelment.
  const selfApprove = call(api, {
    method: "POST",
    path: `/api/v1/training/vendor-empanelments/${id}:decide`,
    headers: { "Idempotency-Key": "emp-self" },
    actor: requester,
    body: { decision: "EMPANELLED", contractRef: "CTR-1" },
  });
  assert.equal(selfApprove.status, 403);

  const decided = call(api, {
    method: "POST",
    path: `/api/v1/training/vendor-empanelments/${id}:decide`,
    headers: { "Idempotency-Key": "emp-d" },
    actor: approver,
    body: { decision: "EMPANELLED", contractRef: "CTR-1" },
  });
  assert.equal(decided.status, 202);
  assert.equal(decided.body.empanelment.status, "EMPANELLED");

  const read = call(api, { method: "GET", path: `/api/v1/training/vendor-empanelments/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.empanelment.id, id);
});
