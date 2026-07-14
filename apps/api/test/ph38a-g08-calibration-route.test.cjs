const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph38a-ratifier",
    actorUserId: "user-ph38a-ratifier",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph38a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph38a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-38A G08 calibration lifecycle: convene -> recommend -> ratify -> apply -> distribution", async () => {
  const api = createFoundationApi(createFoundationServices());

  const session = await call(api, {
    method: "POST",
    path: "/api/v1/appraisals/calibration-sessions",
    headers: { "Idempotency-Key": "cal-1" },
    body: { cycleId: "cycle-2026", orgUnitScope: "DIV-A", method: "COMMITTEE_REVIEW", committeeMemberIds: ["committee-member-1"] },
  });
  assert.equal(session.status, 201);
  const sessionId = session.body.calibrationSession.id;
  assert.equal(session.body.calibrationSession.status, "IN_SESSION");

  const rec = await call(api, {
    method: "POST",
    path: `/api/v1/appraisals/calibration-sessions/${sessionId}:recommend`,
    headers: { "Idempotency-Key": "cal-rec-1" },
    body: { formId: "form-1", currentGrade: "6", recommendedGrade: "7", rationale: "Consistently exceeded targets." },
  });
  assert.equal(rec.status, 201);
  const recommendationId = rec.body.calibrationRecommendation.id;
  assert.equal(rec.body.calibrationRecommendation.recommendationStatus, "PROPOSED");

  // Ratifier is not a committee member (SoD) -> RATIFIED.
  const ratified = await call(api, {
    method: "POST",
    path: `/api/v1/appraisals/calibration-sessions/${sessionId}/recommendations/${recommendationId}:ratify`,
    headers: { "Idempotency-Key": "cal-ratify-1" },
    body: {},
  });
  assert.equal(ratified.status, 202);
  assert.equal(ratified.body.calibrationRecommendation.recommendationStatus, "RATIFIED");

  const applied = await call(api, {
    method: "POST",
    path: `/api/v1/appraisals/calibration-sessions/${sessionId}/recommendations/${recommendationId}:apply`,
    headers: { "Idempotency-Key": "cal-apply-1" },
    body: {},
  });
  assert.equal(applied.status, 202);
  assert.equal(applied.body.calibrationAdjustment.status, "APPLIED");
  assert.equal(applied.body.calibrationAdjustment.appliedGrade, 7);

  const dist = await call(api, { method: "GET", path: `/api/v1/appraisals/calibration-sessions/${sessionId}/distribution` });
  assert.equal(dist.status, 200);
  assert.ok(dist.body.actual !== undefined);
});

test("PH-38A G08 calibration: applying a non-ratified recommendation fails closed (ERR-G08-RATIFY)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const session = await call(api, {
    method: "POST",
    path: "/api/v1/appraisals/calibration-sessions",
    headers: { "Idempotency-Key": "cal-2" },
    body: { cycleId: "cycle-2026", orgUnitScope: "DIV-B", method: "NORMALISATION", committeeMemberIds: ["committee-member-9"] },
  });
  const sessionId = session.body.calibrationSession.id;
  const rec = await call(api, {
    method: "POST",
    path: `/api/v1/appraisals/calibration-sessions/${sessionId}:recommend`,
    headers: { "Idempotency-Key": "cal-rec-2" },
    body: { formId: "form-2", currentGrade: "5", recommendedGrade: "8", rationale: "Proposed only." },
  });
  const recommendationId = rec.body.calibrationRecommendation.id;
  const applied = await call(api, {
    method: "POST",
    path: `/api/v1/appraisals/calibration-sessions/${sessionId}/recommendations/${recommendationId}:apply`,
    headers: { "Idempotency-Key": "cal-apply-2" },
    body: {},
  });
  assert.equal(applied.status, 409);
  assert.equal(applied.body.error.code, "ERR-G08-RATIFY");
});
