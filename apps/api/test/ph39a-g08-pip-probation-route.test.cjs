const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph39a",
    actorUserId: "user-ph39a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph39a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph39a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-39A G08 PIP lifecycle: create -> update milestone -> close via the kernel", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = call(api, {
    method: "POST",
    path: "/api/v1/appraisals/pips",
    headers: { "Idempotency-Key": "pip-1" },
    body: {
      appraiseeId: ph03Ids.employee,
      reason: "Sustained under-performance",
      successCriteria: "Meet all milestones",
      startDate: "2026-07-01",
      targetEndDate: "2026-10-01",
      milestones: [{ title: "Close backlog", dueDate: "2026-08-01", metric: "0 open tickets" }],
    },
  });
  assert.equal(created.status, 201);
  const pipId = created.body.pip.id;
  const milestoneId = created.body.milestones[0].id;
  assert.equal(created.body.pip.status, "ACTIVE");

  const updated = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/pips/${pipId}/milestones/${milestoneId}:update`,
    headers: { "Idempotency-Key": "pip-ms-1" },
    body: { status: "MET", progressNote: "Backlog cleared" },
  });
  assert.equal(updated.status, 202);
  assert.equal(updated.body.milestone.status, "MET");

  const closed = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/pips/${pipId}:close`,
    headers: { "Idempotency-Key": "pip-close-1" },
    body: { outcome: "SUCCESSFUL", outcomeSummary: "Improved to standard" },
  });
  assert.equal(closed.status, 202);
  assert.equal(closed.body.pip.status, "CLOSED");
  assert.equal(closed.body.pip.outcome, "SUCCESSFUL");
});

test("PH-39A G08 probation confirmation: open -> extend (cap enforced) -> decide", () => {
  const api = createFoundationApi(createFoundationServices());
  const opened = call(api, {
    method: "POST",
    path: "/api/v1/appraisals/probation-confirmations",
    headers: { "Idempotency-Key": "prob-1" },
    body: { appraiseeId: ph03Ids.employee, probationEndDate: "2026-12-31", probationPeriodMonths: 12, probationExtensionMaxMonths: 6 },
  });
  assert.equal(opened.status, 201);
  const id = opened.body.probationConfirmation.id;
  assert.equal(opened.body.probationConfirmation.status, "IN_PROBATION");

  const extended = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/probation-confirmations/${id}:decide`,
    headers: { "Idempotency-Key": "prob-ext-1" },
    body: { outcome: "EXTENDED", extensionMonths: 3 },
  });
  assert.equal(extended.status, 202);
  assert.equal(extended.body.probationConfirmation.status, "EXTENDED");

  // Cumulative extension beyond the 6-month cap is rejected (VALIDATION_FAILED -> 400).
  const overCap = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/probation-confirmations/${id}:decide`,
    headers: { "Idempotency-Key": "prob-ext-2" },
    body: { outcome: "EXTENDED", extensionMonths: 4 },
  });
  assert.equal(overCap.status, 400);
  assert.equal(overCap.body.error.code, "VALIDATION_FAILED");

  const confirmed = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/probation-confirmations/${id}:decide`,
    headers: { "Idempotency-Key": "prob-confirm-1" },
    body: { outcome: "CONFIRMED", effectiveDate: "2027-01-01" },
  });
  assert.equal(confirmed.status, 202);
  assert.equal(confirmed.body.probationConfirmation.status, "CONFIRMED");
});

test("PH-39A G08 APAR read endpoints respond through the kernel", () => {
  const api = createFoundationApi(createFoundationServices());
  const rp = call(api, { method: "GET", path: "/api/v1/apar/forms/form-unknown/report-periods" });
  assert.equal(rp.status, 200);
  assert.ok(Array.isArray(rp.body.items));
  const gs = call(api, { method: "GET", path: "/api/v1/apar/forms/form-unknown/goal-snapshots" });
  assert.equal(gs.status, 200);
  assert.ok(Array.isArray(gs.body.items));
});
