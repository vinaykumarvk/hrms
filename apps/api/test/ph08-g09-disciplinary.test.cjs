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
    userId: "user-ph08-g09",
    actorUserId: "user-ph08-g09",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08-g09",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08-g09", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-08 G09 authority competence blocks self disciplinary authority", () => {
  const services = createFoundationServices();
  assert.throws(
    () =>
      services.disciplinary.openCase(actor(), {
        chargedEmployeeId: ph03Ids.employee,
        disciplinaryAuthorityId: ph03Ids.employee,
        allegations: "Self authority should fail",
      }),
    (error) => error instanceof FoundationError && error.code === "CONFLICT" && String(error.details.marker) === "G09_AUTHORITY_COMPETENCE"
  );
});

test("PH-08 G09 charge, inquiry, MAJOR_PENALTY, appeal, and SR impact are auditable", () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Unauthorised absence",
    confidential: true,
  });
  assert.equal(opened.sealedRouting, true);
  services.disciplinary.serveChargeMemo(actor(), opened.id, { articles: ["Article I"], servedOn: "2026-08-01" });
  services.disciplinary.recordInquiryReport(actor(), opened.id, { findings: "PROVED", reportDate: "2026-08-20" });
  const penalty = services.disciplinary.imposePenalty(actor(), opened.id, {
    penaltyType: "MAJOR_PENALTY",
    orderDate: "2026-08-25",
    reason: "Charge proved",
    idempotencyKey: "idem-ph08-g09-penalty-001",
  });
  assert.equal(penalty.penaltyOrder.status, "SERVED");
  assert.equal(penalty.impactSignal.status, "READY_FOR_G06_G11");
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline[0].sourceModule, "G09");
  assert.equal(timeline[0].eventTypeCode, "MAJOR_PENALTY");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G09_CHARGE_MEMO_SERVED"));
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G09_INQUIRY_REPORT"));

  assert.throws(
    () =>
      services.disciplinary.decideAppeal(actor(), opened.id, {
        appellateAuthorityId: ph03Ids.manager,
        decision: "SET_ASIDE",
        decidedOn: "2026-09-01",
        idempotencyKey: "idem-ph08-g09-appeal-conflict-001",
      }),
    (error) => error instanceof FoundationError && error.code === "CONFLICT"
  );
  const appeal = services.disciplinary.decideAppeal(actor(), opened.id, {
    appellateAuthorityId: "appellate-authority-001",
    decision: "SET_ASIDE",
    decidedOn: "2026-09-02",
    idempotencyKey: "idem-ph08-g09-appeal-001",
  });
  assert.equal(appeal.disciplinaryCase.appealDecision, "SET_ASIDE");
  assert.match(appeal.srEventId, /^sr-/);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G09_APPEAL_DECIDED"));
});

test("PH-08 G09 routes drive disciplinary case through penalty", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const opened = call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "idem-ph08-g09-route-open-001" },
    body: { allegations: "Route allegation", confidential: true },
  });
  assert.equal(opened.status, 201);
  const charged = call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${opened.body.disciplinaryCase.id}:charge`,
    headers: { "Idempotency-Key": "idem-ph08-g09-route-charge-001" },
    body: { servedOn: "2026-08-01", articles: ["Article I"] },
  });
  assert.equal(charged.status, 202);
  assert.equal(
    call(api, {
      method: "POST",
      path: `/api/v1/disciplinary/cases/${opened.body.disciplinaryCase.id}:inquiry-report`,
      headers: { "Idempotency-Key": "idem-ph08-g09-route-inquiry-001" },
      body: { findings: "PROVED", reportDate: "2026-08-20" },
    }).status,
    202
  );
  const penalty = call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${opened.body.disciplinaryCase.id}:penalty`,
    headers: { "Idempotency-Key": "idem-ph08-g09-route-penalty-001" },
    body: { penaltyType: "MAJOR_PENALTY", orderDate: "2026-08-25", reason: "Charge proved" },
  });
  assert.equal(penalty.status, 202);
  assert.equal(penalty.body.penaltyOrder.penaltyType, "MAJOR_PENALTY");
  assert.equal(call(api, { method: "GET", path: "/api/v1/disciplinary/summary" }).body.penalties, 1);
});
