// PH-30A — G01 aadhaar-vault + phonetic-search routes (route exposure for PH-18A/PH-23C engines).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph30a",
    actorUserId: "user-ph30a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph30a",
    ...extra,
  };
}
async function call(api, request) {
  return await api.dispatch({ headers: { "X-Correlation-Id": "corr-ph30a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-30A POST /api/v1/employees/{id}/aadhaar-vault captures with tokenisation (last-4 only)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}/aadhaar-vault`,
    headers: { "Idempotency-Key": "idem-ph30a-av" },
    body: { rawAadhaar: "412345678900" },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.vaultEntry.lastFour, "8900");
  assert.ok(!JSON.stringify(res.body).includes("412345678900"));
});

test("PH-30A GET /api/v1/employees:phonetic-search returns a phonetic code", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, { method: "GET", path: "/api/v1/employees:phonetic-search", query: { q: "Krishnan" } });
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.phoneticCode === "string" && res.body.phoneticCode.length === 4);
  assert.ok(Array.isArray(res.body.hits));
});
