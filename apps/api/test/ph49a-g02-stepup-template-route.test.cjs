const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph49a",
    actorUserId: "user-ph49a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph49a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph49a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-49A G02 step-up MFA: challenge -> verify; expired verify fails closed", async () => {
  const api = createFoundationApi(createFoundationServices());
  const crId = "cr-ph49a-1";

  const challenge = await call(api, {
    method: "POST",
    path: `/api/v1/change-requests/${crId}:challenge-stepup`,
    headers: { "Idempotency-Key": "su-1" },
    body: { issuedAt: "2026-07-02T10:00:00.000Z", expiresAt: "2026-07-02T10:05:00.000Z" },
  });
  assert.equal(challenge.status, 201);
  const stepUpId = challenge.body.stepUp.id;
  assert.equal(challenge.body.stepUp.status, "CHALLENGED");

  const verified = await call(api, {
    method: "POST",
    path: `/api/v1/change-requests/stepups/${stepUpId}:verify`,
    headers: { "Idempotency-Key": "su-v1" },
    body: { verifiedAt: "2026-07-02T10:03:00.000Z" },
  });
  assert.equal(verified.status, 202);
  assert.equal(verified.body.stepUp.status, "VERIFIED");

  // A fresh challenge verified after expiry fails closed.
  const c2 = await call(api, {
    method: "POST",
    path: `/api/v1/change-requests/${crId}:challenge-stepup`,
    headers: { "Idempotency-Key": "su-2" },
    body: { issuedAt: "2026-07-02T11:00:00.000Z", expiresAt: "2026-07-02T11:05:00.000Z" },
  });
  const expired = await call(api, {
    method: "POST",
    path: `/api/v1/change-requests/stepups/${c2.body.stepUp.id}:verify`,
    headers: { "Idempotency-Key": "su-v2" },
    body: { verifiedAt: "2026-07-02T12:00:00.000Z" },
  });
  assert.equal(expired.status, 403);
  assert.equal(expired.body.error.code, "ERR-G02-STEPUP");

  const esigs = await call(api, { method: "GET", path: `/api/v1/change-requests/${crId}/esignatures` });
  assert.equal(esigs.status, 200);
  assert.ok(Array.isArray(esigs.body.items));
});

test("PH-49A G02 change-request template: create -> list -> start -> deactivate", async () => {
  const api = createFoundationApi(createFoundationServices());
  const created = await call(api, {
    method: "POST",
    path: "/api/v1/change-request-templates",
    headers: { "Idempotency-Key": "tpl-1" },
    body: { templateCode: "ADDRESS_UPDATE", name: "Address update", fields: [{ fieldCode: "ADDRESS_LINE1" }] },
  });
  assert.equal(created.status, 201);
  const templateId = created.body.template.id;

  const list = await call(api, { method: "GET", path: "/api/v1/change-request-templates" });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((t) => t.id === templateId));

  const started = await call(api, {
    method: "POST",
    path: `/api/v1/change-request-templates/${templateId}:start`,
    headers: { "Idempotency-Key": "tpl-s" },
    body: { allowedFields: ["ADDRESS_LINE1"] },
  });
  assert.equal(started.status, 201);
  assert.ok(started.body.prefill);

  const deactivated = await call(api, { method: "POST", path: `/api/v1/change-request-templates/${templateId}:deactivate`, headers: { "Idempotency-Key": "tpl-d" }, body: {} });
  assert.equal(deactivated.status, 202);
});
