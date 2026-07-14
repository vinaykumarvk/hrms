const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph53a",
    actorUserId: "user-ph53a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph53a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph53a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

async function openCase(api) {
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "case-1" },
    body: { chargedEmployeeId: ph03Ids.employee, disciplinaryAuthorityId: ph03Ids.manager, allegations: "Unauthorised absence" },
  });
  assert.equal(res.status, 201);
  return res.body.disciplinaryCase.id;
}

test("PH-53A G09 case reads: timeline, ICC appointments, personal hearings", async () => {
  const api = createFoundationApi(createFoundationServices());
  const caseId = await openCase(api);

  const timeline = await call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/case-timeline` });
  assert.equal(timeline.status, 200);
  assert.ok(timeline.body.items.length >= 1);

  for (const suffix of ["icc-appointments", "personal-hearings"]) {
    const res = await call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/${suffix}` });
    assert.equal(res.status, 200, suffix);
    assert.ok(Array.isArray(res.body.items), suffix);
  }
});

test("PH-53A G09 mutation routes fail closed on unknown subjects (NOT_FOUND)", async () => {
  const api = createFoundationApi(createFoundationServices());

  const cases = [
    { path: "/api/v1/disciplinary/suspensions/nope:review", body: { outcome: "REVOKE", reviewDate: "2026-07-02" } },
    { path: "/api/v1/disciplinary/show-cause-notices/nope:respond", body: { representationText: "x", respondedAt: "2026-07-02" } },
    { path: "/api/v1/disciplinary/consultations/nope:close", body: { receivedDate: "2026-07-02" } },
    { path: "/api/v1/disciplinary/consultations/nope:waive", body: { waiverReason: "x", waivedOn: "2026-07-02" } },
    { path: "/api/v1/disciplinary/personal-hearings/nope:minutes", body: { heldDate: "2026-07-02", minutesText: "x" } },
  ];
  cases.forEach(async (c, i) => {
    const res = await call(api, { method: "POST", path: c.path, headers: { "Idempotency-Key": `nf-${i}` }, body: c.body });
    assert.equal(res.status, 404, c.path);
  });

  const penalty = await call(api, { method: "GET", path: "/api/v1/disciplinary/penalty-orders/nope" });
  assert.equal(penalty.status, 404);
});
