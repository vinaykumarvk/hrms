// PH-30C — G08 DSC e-signature + continuous-feedback routes (route exposure for PH-22A/PH-19B engines).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph30c",
    actorUserId: "user-ph30c",
    permissions: ["*"],
    roles: ["accepting_authority"],
    fieldGrants: [],
    correlationId: "corr-ph30c",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph30c", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-30C POST /api/v1/apar/forms/{id}/e-signature records a DSC signature", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/apar/forms/apar-ph30c/e-signature",
    headers: { "Idempotency-Key": "idem-ph30c-sig" },
    body: { actionType: "CERTIFY", method: "DSC", certificateSerial: "DSC-SER-1", payload: { grade: "A" }, signedAt: "2026-07-03" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.signature.method, "DSC");
  assert.equal(res.body.signature.actionType, "CERTIFY");
  assert.ok(res.body.signature.payloadHash.length === 64);
});

test("PH-30C POST /api/v1/apar/continuous-feedback records a feedback entry", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/apar/continuous-feedback",
    headers: { "Idempotency-Key": "idem-ph30c-fb" },
    body: { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, direction: "DOWNWARD", note: "Strong delivery.", recordedAt: "2026-07-03" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.feedback.cycleId, "cycle-2026");
});
