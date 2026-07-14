const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph36a",
    actorUserId: "user-ph36a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph36a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph36a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function openPoshCase(api) {
  const opened = await call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "open-posh-case" },
    body: {
      chargedEmployeeId: ph03Ids.employee,
      disciplinaryAuthorityId: ph03Ids.manager,
      allegations: "Sexual-harassment complaint",
      misconductCategory: "HARASSMENT",
    },
  });
  assert.equal(opened.status, 201);
  return opened.body.disciplinaryCase.id;
}

test("PH-36A FR-G09-023 BR-2: POSH conciliation recorded before inquiry via the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const caseId = await openPoshCase(api);

  const recorded = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:conciliation`,
    headers: { "Idempotency-Key": "concil-1" },
    body: { opted: true, outcome: "SETTLED", settlementBasis: "MUTUAL_APOLOGY_AND_TRANSFER", recordedOn: "2026-07-06", summary: "Parties reconciled with a written apology." },
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.conciliation.outcome, "SETTLED");
  assert.equal(recorded.body.disciplinaryCase.conciliationOutcome, "SETTLED");

  const listed = await call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/conciliations` });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
});

test("PH-36A BR-2: a monetary settlement basis is rejected (ERR-G09-CONCILIATION-MONETARY, 422)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const caseId = await openPoshCase(api);
  const bad = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:conciliation`,
    headers: { "Idempotency-Key": "concil-money" },
    body: { opted: true, outcome: "SETTLED", settlementBasis: "MONETARY_PAYMENT", recordedOn: "2026-07-06", summary: "Cash offered." },
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, "ERR-G09-CONCILIATION-MONETARY");
});

test("PH-36A BR-2: a SETTLED conciliation blocks the inquiry report (no inquiry proceeds)", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const caseId = await openPoshCase(api);
  services.disciplinary.serveChargeMemo(actor(), caseId, { articles: ["Art-3(1)"], servedOn: "2026-07-05" });
  services.disciplinary.recordConciliation(actor(), caseId, {
    opted: true,
    outcome: "SETTLED",
    settlementBasis: "WRITTEN_APOLOGY",
    recordedOn: "2026-07-06",
    summary: "Settled.",
  });
  assert.throws(
    () => services.disciplinary.recordInquiryReport(actor(), caseId, { findings: "PROVED", reportDate: "2026-07-10" }),
    /settled at conciliation/i
  );
});
