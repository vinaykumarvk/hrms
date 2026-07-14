const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "View/respond to a disciplinary or vigilance case against you" (G09). Exercised over
// HTTP against seedTestEmployees:true real data (Meera's real disciplinary case, run through the
// real open -> charge -> inquiry -> show-cause lifecycle), not mocked/hard-coded records.

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
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  return { services, api, admin, meera, sunita, arjun };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g09-disciplinary-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G09 disciplinary: the seed produces a real disciplinary case for Meera at SHOW_CAUSE stage", () => {
  const { api, meera } = boot();
  const result = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].stage, "INQUIRY_REPORT");
  assert.equal(result.body.items[0].chargedEmployeeId, meera.id);
});

test("G09 disciplinary: wire responses never leak internal tenantId/entityId/workflowInstanceId fields", () => {
  const { api, meera } = boot();
  const cases = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items;
  for (const item of cases) {
    assert.equal("tenantId" in item, false);
    assert.equal("entityId" in item, false);
    assert.equal("workflowInstanceId" in item, false);
  }
  const notices = call(api, actor(meera.id, ["g09.case.read"]), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${cases[0].id}/show-cause-notices`,
  }).body.items;
  for (const notice of notices) {
    assert.equal("tenantId" in notice, false);
    assert.equal("entityId" in notice, false);
  }
});

test("G09 disciplinary: post-full-review-goal fix — an employee can view their own case, but not another employee's", () => {
  const { api, meera, sunita } = boot();
  const own = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` });
  assert.equal(own.status, 200);
  assert.equal(own.body.items.length, 1);

  const stranger = call(api, actor(sunita.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` });
  assert.equal(stranger.status, 403);
});

test("G09 disciplinary: post-full-review-goal fix — case timeline, evidence, and personal-hearings reads are ownership-gated, not any g09.case.read holder", () => {
  const { api, meera, sunita } = boot();
  const caseId = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items[0]
    .id;

  const strangerTimeline = call(api, actor(sunita.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/case-timeline` });
  assert.equal(strangerTimeline.status, 403);

  const strangerEvidence = call(api, actor(sunita.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/evidence` });
  assert.equal(strangerEvidence.status, 403);

  const strangerHearings = call(api, actor(sunita.id, ["g09.case.read"]), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/personal-hearings`,
  });
  assert.equal(strangerHearings.status, 403);

  const ownTimeline = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/case-timeline` });
  assert.equal(ownTimeline.status, 200);
  assert.ok(ownTimeline.body.items.length > 0);

  // hr_admin is deliberately NOT an override role for G09 (separation-of-duties boundary) — only
  // the dedicated disciplinary_authority chain (or self) may read.
  const hrAdminTimeline = call(api, actor("hr-admin-probe", ["g09.case.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/case-timeline`,
  });
  assert.equal(hrAdminTimeline.status, 403);

  const disciplinaryAuthorityTimeline = call(api, actor("disciplinary-authority-probe", ["g09.case.read"], { roles: ["disciplinary_authority"] }), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/case-timeline`,
  });
  assert.equal(disciplinaryAuthorityTimeline.status, 200);
});

test("G09 disciplinary: self-service evidence view only ever shows served artefacts (preliminary inquiry report withheld)", () => {
  const { api, meera } = boot();
  const caseId = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items[0]
    .id;
  const evidence = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/evidence` });
  assert.equal(evidence.status, 200);
  assert.ok(evidence.body.items.every((item) => item.isServed === true));
  assert.ok(evidence.body.items.some((item) => item.artefactType === "CHARGE_MEMO"));
  assert.ok(
    evidence.body.items.every((item) => item.artefactType !== "INQUIRY_REPORT"),
    "the unserved inquiry report must not appear at all in the self-service evidence list"
  );

  // The disciplinary_authority override role sees the full evidence set, including the unserved
  // inquiry report — hr_admin does not (SoD boundary), so it must not be used for this probe.
  const authorityEvidence = call(api, actor("disciplinary-authority-evidence-probe", ["g09.case.read"], { roles: ["disciplinary_authority"] }), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/evidence`,
  });
  assert.ok(authorityEvidence.body.items.some((item) => item.artefactType === "INQUIRY_REPORT" && item.isServed === false));
});

test("G09 disciplinary: an employee can respond to their own show-cause notice, but nobody else can respond on their behalf", () => {
  const { api, meera, sunita } = boot();
  const caseId = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items[0]
    .id;
  const noticeId = call(api, actor(meera.id, ["g09.case.read"]), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/show-cause-notices`,
  }).body.items[0].id;

  const strangerResponds = call(api, actor(sunita.id, ["g09.show-cause.respond"]), {
    method: "POST",
    path: `/api/v1/disciplinary/show-cause-notices/${noticeId}:respond`,
    headers: { "Idempotency-Key": "idem-g09-stranger-respond-001" },
    body: { representationText: "I was not involved", respondedAt: "2026-07-01" },
  });
  assert.equal(strangerResponds.status, 403);

  const ownResponds = call(api, actor(meera.id, ["g09.show-cause.respond"]), {
    method: "POST",
    path: `/api/v1/disciplinary/show-cause-notices/${noticeId}:respond`,
    headers: { "Idempotency-Key": "idem-g09-own-respond-001" },
    body: { representationText: "The absence was due to a documented medical emergency", respondedAt: "2026-07-01" },
  });
  assert.equal(ownResponds.status, 202);
  assert.equal(ownResponds.body.notice.status, "RESPONDED");
  assert.equal("tenantId" in ownResponds.body.notice, false);
});

test("G09 disciplinary: an employee can request their own personal hearing, but nobody else can request one on their behalf", () => {
  const { api, meera, sunita } = boot();
  const caseId = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items[0]
    .id;

  const strangerRequests = call(api, actor(sunita.id, ["g09.personal-hearing.request"]), {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:personal-hearing`,
    headers: { "Idempotency-Key": "idem-g09-stranger-hearing-001" },
    body: { stage: "SHOW_CAUSE", requestedOn: "2026-07-02" },
  });
  assert.equal(strangerRequests.status, 403);

  const ownRequests = call(api, actor(meera.id, ["g09.personal-hearing.request"]), {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:personal-hearing`,
    headers: { "Idempotency-Key": "idem-g09-own-hearing-001" },
    body: { stage: "SHOW_CAUSE", requestedOn: "2026-07-02" },
  });
  assert.equal(ownRequests.status, 201);
  assert.equal(ownRequests.body.personalHearing.status, "REQUESTED");
  assert.equal("tenantId" in ownRequests.body.personalHearing, false);

  const ownHearings = call(api, actor(meera.id, ["g09.case.read"]), {
    method: "GET",
    path: `/api/v1/disciplinary/cases/${caseId}/personal-hearings`,
  });
  assert.equal(ownHearings.status, 200);
  assert.equal(ownHearings.body.items.length, 1);
});

test("G09 disciplinary: the disciplinary_authority override role may act on an employee's case on their behalf; hr_admin may not (SoD boundary)", () => {
  const { api, meera } = boot();
  const caseId = call(api, actor(meera.id, ["g09.case.read"]), { method: "GET", path: `/api/v1/disciplinary/employees/${meera.id}/cases` }).body.items[0]
    .id;
  const hrAdminCases = call(api, actor("hr-admin-cases-probe", ["g09.case.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/disciplinary/employees/${meera.id}/cases`,
  });
  assert.equal(hrAdminCases.status, 403);

  const authorityCases = call(api, actor("disciplinary-authority-cases-probe", ["g09.case.read"], { roles: ["disciplinary_authority"] }), {
    method: "GET",
    path: `/api/v1/disciplinary/employees/${meera.id}/cases`,
  });
  assert.equal(authorityCases.status, 200);
  assert.equal(authorityCases.body.items.length, 1);
  assert.equal(authorityCases.body.items[0].id, caseId);
});
