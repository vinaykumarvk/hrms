const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  FoundationError,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08-g06",
    actorUserId: "user-ph08-g06",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08-g06",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08-g06", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-08 G06 seniority tie-breaks are deterministic", () => {
  const services = createFoundationServices();
  const list = services.promotion.createSeniorityList(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-08-01",
    entries: [
      { employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" },
      { employeeId: ph03Ids.manager, serviceNo: "GOV-100245", appointmentDate: "2018-01-01" },
    ],
  });
  assert.equal(list.entries[0].employeeId, ph03Ids.manager);
  assert.equal(list.entries[0].rank, 1);
});

test("PH-08 G06 DPC enforces DPC_QUORUM and DPC_RECUSAL before promotion SR posting", () => {
  const services = createFoundationServices();
  const list = services.promotion.createSeniorityList(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-08-01",
    entries: [{ employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }],
  });
  services.promotion.publishSeniorityList(actor(), list.id);
  services.promotion.finaliseSeniorityList(actor(), list.id);
  const promotionCase = services.promotion.createPromotionCase(actor(), {
    seniorityListId: list.id,
    vacancies: 1,
    fromDesignation: "Assistant Section Officer",
    toDesignation: "Section Officer",
  });

  assert.throws(
    () => services.promotion.holdDpc(actor(), promotionCase.id, { panelMembers: [{ employeeId: ph03Ids.manager, role: "CHAIRPERSON" }], quorumRequired: 2 }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "DPC_QUORUM"
  );
  assert.throws(
    () =>
      services.promotion.holdDpc(actor(), promotionCase.id, {
        panelMembers: [
          { employeeId: ph03Ids.employee, role: "MEMBER" },
          { externalName: "External PSC Nominee", role: "EXPERT" },
        ],
        quorumRequired: 2,
      }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED" && String(error.details.marker) === "DPC_RECUSAL"
  );

  const dpc = services.promotion.holdDpc(actor(), promotionCase.id, {
    panelMembers: [
      { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
      { externalName: "External PSC Nominee", role: "EXPERT" },
    ],
    quorumRequired: 2,
  });
  assert.equal(dpc.status, "DPC_HELD");
  const orders = services.promotion.issuePromotionOrders(actor(), promotionCase.id);
  const effected = services.promotion.effectPromotionOrder(actor(), orders[0].id, {
    effectDate: "2026-08-15",
    idempotencyKey: "idem-ph08-g06-promotion-001",
  });
  assert.equal(effected.order.status, "EFFECTED");
  assert.equal(effected.payImpactSignal.status, "READY_FOR_G10");
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline[0].sourceModule, "G06");
  assert.equal(timeline[0].eventTypeCode, "PROMOTION_EFFECTED");
});

test("PH-08 G06 MACP effect emits MACP_EFFECTED and G06_PAY_IMPACT_SIGNAL", () => {
  const services = createFoundationServices();
  const macp = services.promotion.effectMacp(actor(), {
    employeeId: ph03Ids.employee,
    level: "MACP-1",
    dueDate: "2026-08-01",
    effectDate: "2026-08-20",
    idempotencyKey: "idem-ph08-g06-macp-001",
  });
  assert.equal(macp.macp.status, "EFFECTED");
  assert.equal(macp.payImpactSignal.kind, "MACP");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].eventTypeCode, "MACP_EFFECTED");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G06_PAY_IMPACT_SIGNAL"));
});

test("PH-08 G06 routes drive seniority and promotion summary", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/promotions/seniority-lists",
    headers: { "Idempotency-Key": "idem-ph08-g06-route-list-001" },
    body: {
      effectiveDate: "2026-08-01",
      entries: [{ employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }],
    },
  });
  assert.equal(created.status, 201);
  const published = call(api, {
    method: "POST",
    path: `/api/v1/promotions/seniority-lists/${created.body.seniorityList.id}:publish`,
    headers: { "Idempotency-Key": "idem-ph08-g06-route-publish-001" },
    body: {},
  });
  assert.equal(published.status, 202);
  const summary = call(api, { method: "GET", path: "/api/v1/promotions/summary" });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.seniorityLists, 1);
});
