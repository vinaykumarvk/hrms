const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "View promotion & posting history / track promotion case status; view sealed-cover
// status concerning me (G06)". Exercised over HTTP against seedTestEmployees:true real data
// (Sunita's real EFFECTED promotion order + auto-created probation record from a real DPC
// lifecycle; Devika's real SEALED cover), not mocked/hard-coded records.

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["employee"],
    fieldGrants: ["*"],
    ...extra,
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  const devika = services.employeeMaster.getByServiceNo(admin, "GOV-100305");
  return { services, api, admin, sunita, meera, devika };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g06-promotion-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G06 promotions: the seed produces a real EFFECTED promotion order and probation record for Sunita", () => {
  const { api, sunita } = boot();
  const orders = call(api, actor(sunita.id, ["g06.promotion.read"]), { method: "GET", path: "/api/v1/promotions/orders" });
  assert.equal(orders.status, 200);
  assert.equal(orders.body.items.length, 1);
  assert.equal(orders.body.items[0].status, "EFFECTED");
  assert.equal(orders.body.items[0].toDesignation, "Section Officer");

  const probation = call(api, actor(sunita.id, ["g06.promotion.read"]), {
    method: "GET",
    path: "/api/v1/promotions/probation-records",
    query: { employeeId: sunita.id },
  });
  assert.equal(probation.status, 200);
  assert.equal(probation.body.probationRecords.length, 1);
  assert.equal(probation.body.probationRecords[0].status, "ON_PROBATION");
});

test("G06 promotions: wire responses never leak internal tenantId/entityId fields", () => {
  const { api, sunita } = boot();
  const orders = call(api, actor(sunita.id, ["g06.promotion.read"]), { method: "GET", path: "/api/v1/promotions/orders" }).body.items;
  for (const order of orders) {
    assert.equal("tenantId" in order, false);
    assert.equal("entityId" in order, false);
  }
  const probation = call(api, actor(sunita.id, ["g06.promotion.read"]), {
    method: "GET",
    path: "/api/v1/promotions/probation-records",
    query: { employeeId: sunita.id },
  }).body.probationRecords;
  for (const record of probation) {
    assert.equal("tenantId" in record, false);
    assert.equal("entityId" in record, false);
  }
});

test("G06 promotions: post-full-review-goal fix — an employee can view their own promotion orders, but not another employee's", () => {
  const { api, sunita, meera } = boot();
  const own = call(api, actor(sunita.id, ["g06.promotion.read"]), { method: "GET", path: "/api/v1/promotions/orders" });
  assert.equal(own.status, 200);
  assert.equal(own.body.items.length, 1);

  // Meera holds the same ordinary `g06.promotion.read` permission but has no orders of her own —
  // before the fix, this would have returned every employee's orders tenant-wide, including Sunita's.
  const stranger = call(api, actor(meera.id, ["g06.promotion.read"]), { method: "GET", path: "/api/v1/promotions/orders" });
  assert.equal(stranger.status, 200);
  assert.equal(stranger.body.items.length, 0);
});

test("G06 promotions: post-full-review-goal fix — probation/refusal reads are ownership-gated, not any g06.promotion.read holder", () => {
  const { api, sunita, meera } = boot();
  const strangerProbation = call(api, actor(meera.id, ["g06.promotion.read"]), {
    method: "GET",
    path: "/api/v1/promotions/probation-records",
    query: { employeeId: sunita.id },
  });
  assert.equal(strangerProbation.status, 403);

  const strangerRefusals = call(api, actor(meera.id, ["g06.promotion.read"]), {
    method: "GET",
    path: "/api/v1/promotions/refusals",
    query: { employeeId: sunita.id },
  });
  assert.equal(strangerRefusals.status, 403);

  // hr_admin is deliberately NOT an override role for G06 (separation-of-duties boundary) — only
  // the dedicated promotion_officer chain (or self) may read.
  const hrAdminProbation = call(api, actor("hr-admin-probe", ["g06.promotion.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: "/api/v1/promotions/probation-records",
    query: { employeeId: sunita.id },
  });
  assert.equal(hrAdminProbation.status, 403);

  const promotionOfficerProbation = call(api, actor("promotion-officer-probe", ["g06.promotion.read"], { roles: ["promotion_officer"] }), {
    method: "GET",
    path: "/api/v1/promotions/probation-records",
    query: { employeeId: sunita.id },
  });
  assert.equal(promotionOfficerProbation.status, 200);
  assert.equal(promotionOfficerProbation.body.probationRecords.length, 1);
});

test("G06 sealed covers: the seed produces a real SEALED cover for Devika; the employee sees status but not the confidential reason", () => {
  const { api, devika } = boot();
  const own = call(api, actor(devika.id, ["g06.sealedcover.read"]), { method: "GET", path: "/api/v1/promotions/sealed-covers" });
  assert.equal(own.status, 200);
  assert.equal(own.body.items.length, 1);
  assert.equal(own.body.items[0].status, "SEALED");
  assert.equal(own.body.items[0].reason, "", "reason text (names the underlying disciplinary/vigilance matter) must be redacted for self-service");
  assert.equal("tenantId" in own.body.items[0], false);
});

test("G06 sealed covers: post-full-review-goal fix — an unrelated employee cannot see another employee's sealed-cover row at all", () => {
  const { api, meera } = boot();
  const stranger = call(api, actor(meera.id, ["g06.sealedcover.read"]), { method: "GET", path: "/api/v1/promotions/sealed-covers" });
  assert.equal(stranger.status, 200);
  assert.equal(stranger.body.items.length, 0);
});

test("G06 sealed covers: the promotion_officer override role sees the confidential reason; hr_admin does not (SoD boundary)", () => {
  const { api, devika } = boot();
  const hrAdmin = call(api, actor("hr-admin-sealed-cover-probe", ["g06.sealedcover.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: "/api/v1/promotions/sealed-covers",
  });
  assert.equal(hrAdmin.status, 200);
  assert.equal(hrAdmin.body.items.length, 0, "hr_admin is not an override role for G06, so this sees only its own (nonexistent) sealed covers");

  const promotionOfficer = call(api, actor("promotion-officer-sealed-cover-probe", ["g06.sealedcover.read"], { roles: ["promotion_officer"] }), {
    method: "GET",
    path: "/api/v1/promotions/sealed-covers",
  });
  assert.equal(promotionOfficer.status, 200);
  const mine = promotionOfficer.body.items.find((item) => item.employeeId === devika.id);
  assert.equal(mine.reason, "Pending vigilance inquiry");
});
