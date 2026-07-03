const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph40a",
    actorUserId: "user-ph40a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph40a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph40a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-40A G08 360-feedback: open -> rate x2 -> release -> read via the kernel", () => {
  const api = createFoundationApi(createFoundationServices());
  const opened = call(api, {
    method: "POST",
    path: "/api/v1/apar/360-feedback",
    headers: { "Idempotency-Key": "f360-open" },
    body: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, minRaters: 2 },
  });
  assert.equal(opened.status, 201);
  const id = opened.body.feedback360.id;

  for (const [i, rater] of [["r1", "PEER"], ["r2", "MANAGER"]].entries()) {
    const rated = call(api, {
      method: "POST",
      path: `/api/v1/appraisals/360-feedback/${id}:rate`,
      headers: { "Idempotency-Key": `f360-rate-${i}` },
      body: { raterId: rater[0], raterType: rater[1], score: 4 },
    });
    assert.equal(rated.status, 202);
  }

  const released = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/360-feedback/${id}:release`,
    headers: { "Idempotency-Key": "f360-release" },
    body: {},
  });
  assert.equal(released.status, 202);
  assert.equal(released.body.release.raterCount, 2);
  assert.equal(released.body.release.aggregateScore, 4);

  const read = call(api, { method: "GET", path: `/api/v1/appraisals/360-feedback/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.feedback360.status, "RELEASED");
});

test("PH-40A G08 360-feedback: releasing below MIN_RATERS is blocked", () => {
  const api = createFoundationApi(createFoundationServices());
  const opened = call(api, {
    method: "POST",
    path: "/api/v1/apar/360-feedback",
    headers: { "Idempotency-Key": "f360-open-2" },
    body: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, minRaters: 3 },
  });
  const id = opened.body.feedback360.id;
  const blocked = call(api, {
    method: "POST",
    path: `/api/v1/appraisals/360-feedback/${id}:release`,
    headers: { "Idempotency-Key": "f360-release-2" },
    body: {},
  });
  assert.equal(blocked.status, 412);
});

test("PH-40A G08 continuous-feedback check-in + list, and signatures read", () => {
  const api = createFoundationApi(createFoundationServices());
  const checkIn = call(api, {
    method: "POST",
    path: "/api/v1/appraisals/continuous-feedback/check-ins",
    headers: { "Idempotency-Key": "ci-1" },
    body: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, note: "Quarterly sync", checkInDate: "2026-07-02" },
  });
  assert.equal(checkIn.status, 201);

  const listed = call(api, {
    method: "GET",
    path: "/api/v1/appraisals/continuous-feedback/check-ins",
    query: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee },
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);

  // Missing required query -> VALIDATION_FAILED (400).
  const badQuery = call(api, { method: "GET", path: "/api/v1/appraisals/continuous-feedback/check-ins", query: { cycleId: "cycle-2026" } });
  assert.equal(badQuery.status, 400);

  const signatures = call(api, { method: "GET", path: "/api/v1/apar/forms/form-unknown/signatures" });
  assert.equal(signatures.status, 200);
  assert.ok(Array.isArray(signatures.body.items));
});
