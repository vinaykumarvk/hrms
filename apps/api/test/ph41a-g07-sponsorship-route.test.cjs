const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph41a",
    actorUserId: "user-ph41a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph41a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph41a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function createSponsorship(api, key, serviceBondMonths) {
  const created = await call(api, {
    method: "POST",
    path: "/api/v1/training/sponsorships",
    headers: { "Idempotency-Key": key },
    body: {
      employeeId: ph03Ids.employee,
      sponsorshipType: "SPONSORED_PROGRAM",
      sponsoredAmountPaise: 1200000,
      startDate: "2025-12-01",
      serviceBondMonths,
      externalCourseName: "Advanced Public Finance",
    },
  });
  assert.equal(created.status, 201);
  return created.body.sponsorship.id;
}

async function sanctionAndActivate(api, id, keyBase, completionDate) {
  assert.equal((await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:sanction`, headers: { "Idempotency-Key": `${keyBase}-s` }, body: {} })).status, 202);
  const activated = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:activate-bond`, headers: { "Idempotency-Key": `${keyBase}-a` }, body: { completionDate } });
  assert.equal(activated.status, 202);
  return activated.body.sponsorship;
}

test("PH-41A G07 sponsorship: propose -> sanction -> activate -> fulfil the bond", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await createSponsorship(api, "spon-fulfil", 12);
  const active = await sanctionAndActivate(api, id, "ful", "2026-01-01");
  assert.equal(active.obligationStatus, "ACTIVE");
  const fulfilled = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:fulfil`, headers: { "Idempotency-Key": "ful-f" }, body: { asOf: "2027-06-01" } });
  assert.equal(fulfilled.status, 202);
  assert.equal(fulfilled.body.sponsorship.obligationStatus, "FULFILLED");
});

test("PH-41A G07 sponsorship: breach -> emit recovery -> recover (VAL-G07-BOND enforced)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await createSponsorship(api, "spon-breach", 12);
  await sanctionAndActivate(api, id, "brc", "2026-01-01");

  const breached = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:breach`, headers: { "Idempotency-Key": "brc-b" }, body: { breachDate: "2026-07-01" } });
  assert.equal(breached.status, 202);
  assert.equal(breached.body.sponsorship.obligationStatus, "BREACHED");
  assert.ok(breached.body.sponsorship.bondRecoveryAmountPaise > 0);

  // Recover before the BOND_RECOVERY cost exists -> VAL-G07-BOND (409, fail closed).
  const early = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:recover`, headers: { "Idempotency-Key": "brc-e" }, body: {} });
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, "VAL-G07-BOND");

  const cost = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:emit-recovery`, headers: { "Idempotency-Key": "brc-c" }, body: {} });
  assert.equal(cost.status, 201);
  assert.equal(cost.body.cost.payableToPayroll, true);

  const recovered = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:recover`, headers: { "Idempotency-Key": "brc-r" }, body: {} });
  assert.equal(recovered.status, 202);
  assert.equal(recovered.body.sponsorship.obligationStatus, "RECOVERED");

  // Reads.
  const read = await call(api, { method: "GET", path: `/api/v1/training/sponsorships/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.sponsorship.id, id);
  const costs = await call(api, { method: "GET", path: `/api/v1/training/sponsorships/${id}/costs` });
  assert.equal(costs.status, 200);
  assert.ok(costs.body.items.some((c) => c.costType === "BOND_RECOVERY"));
});

test("PH-41A G07 sponsorship: waive an active bond", async () => {
  const api = createFoundationApi(createFoundationServices());
  const id = await createSponsorship(api, "spon-waive", 6);
  await sanctionAndActivate(api, id, "wv", "2026-02-01");
  const waived = await call(api, { method: "POST", path: `/api/v1/training/sponsorships/${id}:waive`, headers: { "Idempotency-Key": "wv-w" }, body: { reason: "Medical hardship" } });
  assert.equal(waived.status, 202);
  assert.equal(waived.body.sponsorship.obligationStatus, "WAIVED");
});
