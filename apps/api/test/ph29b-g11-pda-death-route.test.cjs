// PH-29B — G11 PDA registry + death-recovery routes (route exposure for the PH-16F/PH-24A engines).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph29b",
    actorUserId: "user-ph29b",
    permissions: ["*"],
    roles: ["pension_ops"],
    fieldGrants: [],
    correlationId: "corr-ph29b",
    ...extra,
  };
}
function call(api, request) {
  return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph29b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-29B POST /api/v1/pension/pdas registers a disbursing authority", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/pension/pdas",
    headers: { "Idempotency-Key": "idem-ph29b-pda" },
    body: { pdaCode: "TREASURY-DL", name: "Delhi Treasury", pdaDisbursementModel: "PDA_APPLIES_RELIEF" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.pda.pdaDisbursementModel, "PDA_APPLIES_RELIEF");
  assert.equal(res.body.pda.sandboxCertified, false);
});

test("PH-29B POST /api/v1/pension/death-reconcile marks DECEASED and suspends", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/pension/death-reconcile",
    headers: { "Idempotency-Key": "idem-ph29b-death" },
    body: { pensionerId: ph03Ids.employee, dateOfDeath: "2026-05-20" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.vital.status, "DECEASED");
  assert.equal(res.body.vital.disbursementSuspended, true);
});
