const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Apply for training / view nominations — browse available programs, nominate or get
// nominated, track completion (G07)". Exercised over HTTP against seedTestEmployees:true real data
// (Devika's real self-nomination, approved), not mocked/hard-coded records.

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
  const devika = services.employeeMaster.getByServiceNo(admin, "GOV-100305");
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  return { services, api, admin, devika, rohan, arjun };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g07-training-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G07 training: an employee can browse available sessions over HTTP", async () => {
  const { api, devika } = boot();
  const result = await call(api, actor(devika.id, ["g07.training.read"]), { method: "GET", path: "/api/v1/training/sessions" });
  assert.equal(result.status, 200);
  assert.ok(result.body.items.some((session) => session.programCode === "PROG-LEAD-101"));
});

test("G07 training: the seed produces a real approved self-nomination for Devika", async () => {
  const { api, devika } = boot();
  const result = await call(api, actor(devika.id, ["g07.training.read"]), { method: "GET", path: `/api/v1/training/employees/${devika.id}/nominations` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].status, "APPROVED");
});

test("G07 training: wire responses never leak internal tenantId/entityId/workflowInstanceId fields", async () => {
  const { api, devika } = boot();
  const sessions = (await call(api, actor("probe", ["*"]), { method: "GET", path: "/api/v1/training/sessions" })).body.items;
  for (const session of sessions) {
    assert.equal("tenantId" in session, false);
    assert.equal("entityId" in session, false);
  }
  const nominations = (await call(api, actor(devika.id, ["g07.training.read"]), {
    method: "GET",
    path: `/api/v1/training/employees/${devika.id}/nominations`,
  })).body.items;
  for (const nomination of nominations) {
    assert.equal("tenantId" in nomination, false);
    assert.equal("entityId" in nomination, false);
    assert.equal("workflowInstanceId" in nomination, false);
  }
});

test("G07 training: an employee can view their own nominations but not another employee's (unless their manager)", async () => {
  const { api, devika, rohan } = boot();
  const own = await call(api, actor(devika.id, ["g07.training.read"]), { method: "GET", path: `/api/v1/training/employees/${devika.id}/nominations` });
  assert.equal(own.status, 200);

  // Rohan is not Devika's manager (he reports to Arjun; Devika reports to the PH-03 manager) and
  // holds no override role, so this must be forbidden.
  const crossEmployee = await call(api, actor(rohan.id, ["g07.training.read"]), { method: "GET", path: `/api/v1/training/employees/${devika.id}/nominations` });
  assert.equal(crossEmployee.status, 403);
});

test("G07 training: an employee can self-nominate; a random unrelated employee cannot nominate them", async () => {
  const { api, rohan, arjun } = boot();
  const sessions = (await call(api, actor("probe", ["*"]), { method: "GET", path: "/api/v1/training/sessions" })).body.items;
  const sessionId = sessions[0].id;

  const selfNominate = await call(api, actor(rohan.id, ["g07.nomination.submit"]), {
    method: "POST",
    path: "/api/v1/training/nominations",
    headers: { "Idempotency-Key": "idem-g07-self-nominate-001" },
    body: { sessionId, employeeId: rohan.id },
  });
  assert.equal(selfNominate.status, 201);

  const strangerNominatesRohan = await call(api, actor("unrelated-employee", ["g07.nomination.submit"]), {
    method: "POST",
    path: "/api/v1/training/nominations",
    headers: { "Idempotency-Key": "idem-g07-stranger-nominate-001" },
    body: { sessionId, employeeId: rohan.id },
  });
  assert.equal(strangerNominatesRohan.status, 403);

  // UNIQUE(session, employee) is now enforced: a second nomination for the same pair is rejected
  // (409) even when raised by the resolved reporting-chain manager (Arjun). The manager can still
  // nominate their report — on a distinct session, asserted below.
  const managerReNominateSameSession = await call(api, actor(arjun.id, ["g07.nomination.submit"]), {
    method: "POST",
    path: "/api/v1/training/nominations",
    headers: { "Idempotency-Key": "idem-g07-manager-renominate-001" },
    body: { sessionId, employeeId: rohan.id },
  });
  assert.equal(managerReNominateSameSession.status, 409);

  // FR-G07-009 AC1: Arjun IS Rohan's resolved reporting-chain manager, so he can nominate his
  // report on a distinct session.
  const secondSession = (await call(api, actor("probe", ["*"]), {
    method: "POST",
    path: "/api/v1/training/sessions",
    headers: { "Idempotency-Key": "idem-g07-second-session-001" },
    body: { programCode: "PROG-G07-UNIQUE-VALIDATION", title: "Validation second session", capacity: 5 },
  })).body.session;
  const managerNominatesReport = await call(api, actor(arjun.id, ["g07.nomination.submit"]), {
    method: "POST",
    path: "/api/v1/training/nominations",
    headers: { "Idempotency-Key": "idem-g07-manager-nominate-001" },
    body: { sessionId: secondSession.id, employeeId: rohan.id },
  });
  assert.equal(managerNominatesReport.status, 201);
});

test("G07 training: only a trainer/L&D/admin role can record a completion outcome, never the nominee themselves", async () => {
  const { api, devika } = boot();
  const nominationId = (await call(api, actor(devika.id, ["g07.training.read"]), { method: "GET", path: `/api/v1/training/employees/${devika.id}/nominations` })).body
    .items[0].id;

  const selfComplete = await call(api, actor(devika.id, ["g07.nomination.complete"]), {
    method: "POST",
    path: `/api/v1/training/nominations/${nominationId}:complete`,
    headers: { "Idempotency-Key": "idem-g07-self-complete-001" },
    body: { passed: true, significantForSr: false, completionDate: "2026-08-01" },
  });
  assert.equal(selfComplete.status, 403);

  const ldOfficerComplete = await call(api, actor("ld-officer-probe", ["g07.nomination.complete"], { roles: ["ld_officer"] }), {
    method: "POST",
    path: `/api/v1/training/nominations/${nominationId}:complete`,
    headers: { "Idempotency-Key": "idem-g07-ld-complete-001" },
    body: { passed: true, significantForSr: false, completionDate: "2026-08-01" },
  });
  assert.equal(ldOfficerComplete.status, 202);
  assert.equal(ldOfficerComplete.body.nomination.status, "COMPLETED");
});
