const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph47a",
    actorUserId: "user-ph47a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph47a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph47a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function registerPda(api) {
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/pension/pdas",
    headers: { "Idempotency-Key": "pda-1" },
    body: { pdaCode: "SBI-CPPC", name: "SBI Pension Cell", pdaDisbursementModel: "M11_COMPUTES_FULL" },
  });
  assert.equal(res.status, 201);
  return res.body.pda.id;
}

test("PH-47A G11 PDA go-live: activate requires sandbox certification (fail closed)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await registerPda(api);

  // Go-live gate: an uncertified PDA cannot be activated.
  const early = await call(api, { method: "POST", path: `/api/v1/pension/pdas/${id}:activate`, headers: { "Idempotency-Key": "pda-ea" }, body: {} });
  assert.equal(early.status, 412);

  const certified = await call(api, { method: "POST", path: `/api/v1/pension/pdas/${id}:certify-sandbox`, headers: { "Idempotency-Key": "pda-c" }, body: {} });
  assert.equal(certified.status, 202);
  assert.equal(certified.body.pda.status, "SANDBOX");

  const activated = await call(api, { method: "POST", path: `/api/v1/pension/pdas/${id}:activate`, headers: { "Idempotency-Key": "pda-a" }, body: {} });
  assert.equal(activated.status, 202);
  assert.equal(activated.body.pda.status, "ACTIVE");

  const read = await call(api, { method: "GET", path: `/api/v1/pension/pdas/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.pda.status, "ACTIVE");
});

test("PH-47A G11 grievance close via the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const raised = await call(api, {
    method: "POST",
    path: "/api/v1/pension/grievances",
    headers: { "Idempotency-Key": "gr-1" },
    body: { pensionerId: "pensioner-1", category: "DELAYED_PPO", description: "PPO not received", receivedOn: "2026-07-01" },
  });
  assert.equal(raised.status, 201);
  const id = raised.body.grievance.id;
  const closed = await call(api, { method: "POST", path: `/api/v1/pension/grievances/${id}:close`, headers: { "Idempotency-Key": "gr-c" }, body: { resolutionComment: "PPO reissued and delivered" } });
  assert.equal(closed.status, 202);
});

test("PH-47A G11 pensioner bank-account verification via the kernel", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const pensionCase = services.pension.createCase(actor(), { employeeId: ph03Ids.employee, separationDate: "2026-06-30", scheme: "NPS" });

  const verified = await call(api, {
    method: "POST",
    path: "/api/v1/pension/account-verifications",
    headers: { "Idempotency-Key": "av-1" },
    body: { caseId: pensionCase.id, accountNoMasked: "XXXX1234", ifsc: "SBIN0001234", accountName: "A B Kumar", method: "PENNY_DROP", result: "PASSED" },
  });
  assert.equal(verified.status, 201);
  assert.equal(verified.body.verification.result, "PASSED");

  const list = await call(api, { method: "GET", path: `/api/v1/pension/cases/${pensionCase.id}/account-verifications` });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
});
