const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Submit self-appraisal (APAR/PMS) — annual performance review self-assessment (G08)".
// Exercised over HTTP against seedTestEmployees:true real data (Rohan's real open APAR form, RO'd
// by his real resolved manager Arjun), not mocked/hard-coded records.

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
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  return { services, api, admin, rohan, arjun, sunita };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g08-apar-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G08 APAR: the seed produces a real open self-appraisal form for Rohan", async () => {
  const { api, rohan } = boot();
  const result = await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].status, "GOALS_PENDING");
});

test("G08 APAR: wire responses never leak internal tenantId/entityId/workflowInstanceId/documentId/srEventId fields", async () => {
  const { api, rohan } = boot();
  const forms = (await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` })).body.items;
  for (const form of forms) {
    assert.equal("tenantId" in form, false);
    assert.equal("entityId" in form, false);
    assert.equal("workflowInstanceId" in form, false);
    assert.equal("documentId" in form, false);
    assert.equal("srEventId" in form, false);
  }
});

test("G08 APAR: an employee can view their own forms, but not another employee's (even their manager cannot)", async () => {
  const { api, rohan, arjun, sunita } = boot();
  const own = await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` });
  assert.equal(own.status, 200);

  // Arjun is Rohan's real resolved reporting-officer, but the BRD grants appraisee C/R/U on their
  // own APAR only (S3.2) — a manager reads via the RO tier action, never via "my appraisals".
  const managerReads = await call(api, actor(arjun.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` });
  assert.equal(managerReads.status, 403);

  const strangerReads = await call(api, actor(sunita.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` });
  assert.equal(strangerReads.status, 403);
});

test("G08 APAR: an employee can submit their own self-appraisal; nobody else can, not even their RO", async () => {
  const { api, rohan, arjun, sunita } = boot();
  const forms = (await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` })).body.items;
  const formId = forms[0].id;

  const roSubmits = await call(api, actor(arjun.id, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-ro-submit-001" },
    body: { narrative: "Delivered the Q2 migration ahead of schedule." },
  });
  assert.equal(roSubmits.status, 403);

  const strangerSubmits = await call(api, actor(sunita.id, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-stranger-submit-001" },
    body: { narrative: "Delivered the Q2 migration ahead of schedule." },
  });
  assert.equal(strangerSubmits.status, 403);

  const selfSubmits = await call(api, actor(rohan.id, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-self-submit-001" },
    body: { narrative: "Delivered the Q2 migration ahead of schedule." },
  });
  assert.equal(selfSubmits.status, 202);
  assert.equal(selfSubmits.body.form.status, "RO_ASSESSMENT");
  assert.equal(selfSubmits.body.form.selfAppraisalNarrative, "Delivered the Q2 migration ahead of schedule.");
  assert.equal("tenantId" in selfSubmits.body.form, false);
});

test("G08 APAR: the achievements narrative is mandatory (AC2/VAL-REQUIRED)", async () => {
  const { api, rohan } = boot();
  const forms = (await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` })).body.items;
  const formId = forms[0].id;

  const missingNarrative = await call(api, actor(rohan.id, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-no-narrative-001" },
    body: {},
  });
  assert.equal(missingNarrative.status, 400);

  const blankNarrative = await call(api, actor(rohan.id, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-blank-narrative-001" },
    body: { narrative: "   " },
  });
  assert.equal(blankNarrative.status, 400);
});

test("G08 APAR: lock-goals, disclose, post-sr, and aggregate-grade responses never leak internal tenantId/entityId/workflowInstanceId fields", async () => {
  const { api, sunita } = boot();
  const hrAdmin = actor("hr-admin-lifecycle-probe", ["*"]);
  const employeeId = sunita.id;
  const openResult = await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/forms",
    headers: { "Idempotency-Key": "idem-g08-lifecycle-open-002" },
    body: {
      employeeId,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      reportingOfficerId: "lifecycle-ro-probe",
      reviewingOfficerId: "lifecycle-rvo-probe",
      acceptingAuthorityId: "lifecycle-aa-probe",
    },
  });
  assert.equal(openResult.status, 201);
  const formId = openResult.body.form.id;
  assert.equal("tenantId" in openResult.body.form, false);

  const goal = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}/goals`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-goal-001" },
    body: { title: "Deliver the annual project plan", goalType: "PERFORMANCE", weightage: 100 },
  });
  assert.equal(goal.status, 201);

  const lockGoals = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:lock-goals`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-lock-001" },
    body: { lockedAt: "2026-06-01" },
  });
  assert.equal(lockGoals.status, 202);
  assert.equal("tenantId" in lockGoals.body.form, false);
  for (const snapshot of lockGoals.body.snapshots) {
    assert.equal("tenantId" in snapshot, false);
  }

  const submitSelf = await call(api, actor(employeeId, ["g08.apar.self.submit"]), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-submit-001" },
    body: { narrative: "Delivered the annual project plan on schedule." },
  });
  assert.equal(submitSelf.status, 202);

  const reporting = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:report`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-report-001" },
    body: { grade: "VERY_GOOD", narrative: "Consistently strong delivery" },
  });
  assert.equal(reporting.status, 202);

  const review = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:review`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-review-001" },
    body: { concur: true, remarks: "Concur" },
  });
  assert.equal(review.status, 202);

  const accept = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:accept`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-accept-001" },
    body: { finalGrade: "VERY_GOOD" },
  });
  assert.equal(accept.status, 202);
  assert.equal("tenantId" in accept.body.form, false);

  const disclose = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:disclose`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-disclose-001" },
    body: { dispatchedOn: "2026-07-10" },
  });
  assert.equal(disclose.status, 202);
  assert.equal("tenantId" in disclose.body.form, false);
  assert.equal("tenantId" in disclose.body.disclosure, false);

  const postSr = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:post-sr`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-post-sr-001" },
    body: { eventDate: "2026-07-11" },
  });
  assert.equal(postSr.status, 202);
  assert.equal("tenantId" in postSr.body.form, false);

  const reportPeriod = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}/report-periods`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-period-001" },
    body: { sequenceNo: 1, periodStart: "2026-01-01", periodEnd: "2026-12-31", supervisionMonths: 12, partPeriodGrade: 8 },
  });
  assert.equal(reportPeriod.status, 201);

  const aggregate = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:aggregate-grade`,
    headers: { "Idempotency-Key": "idem-g08-lifecycle-aggregate-001" },
    body: {},
  });
  assert.equal(aggregate.status, 202);
  assert.equal("tenantId" in aggregate.body.form, false);
  for (const period of aggregate.body.periods) {
    assert.equal("tenantId" in period, false);
    assert.equal("entityId" in period, false);
  }
});

test("G08 APAR: an HR/APAR-Cell override role may act on an appraisee's behalf", async () => {
  const { api, rohan } = boot();
  const forms = (await call(api, actor(rohan.id, ["g08.apar.read"]), { method: "GET", path: `/api/v1/apar/employees/${rohan.id}/forms` })).body.items;
  const formId = forms[0].id;

  const hrAdminSubmits = await call(api, actor("hr-admin-probe", ["g08.apar.self.submit"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-hr-admin-submit-001" },
    body: { narrative: "Recorded on the appraisee's behalf by HR/APAR Cell." },
  });
  assert.equal(hrAdminSubmits.status, 202);
  assert.equal(hrAdminSubmits.body.form.status, "RO_ASSESSMENT");
});

test("G08 APAR: post-full-review fix — opening a form over HTTP threads cycleId through, enforcing the cycle's rating-scale bounds on self-submit", async () => {
  const { api, sunita } = boot();
  const hrAdmin = actor("hr-admin-cycle-probe", ["*"]);
  const employeeId = sunita.id;

  const ratingScale = (await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/rating-scales",
    headers: { "Idempotency-Key": "idem-g08-cycle-scale-001" },
    body: { scaleCode: "SCALE-1-5", name: "APAR 1-5", minValue: 1, maxValue: 5, benchmarkGrade: 3, adverseThreshold: 2 },
  })).body.ratingScale;

  const template = (await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/templates",
    headers: { "Idempotency-Key": "idem-g08-cycle-template-001" },
    body: { templateCode: "TPL-CYCLE-PROBE", name: "Cycle Probe Template" },
  })).body.template;

  const cycle = (await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/cycles",
    headers: { "Idempotency-Key": "idem-g08-cycle-def-001" },
    body: {
      cycleCode: "CY-CYCLE-PROBE",
      name: "Cycle Probe",
      fiscalYear: "2026-27",
      appraisalPeriodStart: "2026-04-01",
      appraisalPeriodEnd: "2027-03-31",
      templateId: template.id,
      ratingScaleId: ratingScale.id,
    },
  })).body.cycle;

  // Opening a form NOT citing the cycle must still work (cycleId remains optional).
  const openWithoutCycle = await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/forms",
    headers: { "Idempotency-Key": "idem-g08-cycle-open-nocycle-001" },
    body: {
      employeeId,
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      reportingOfficerId: "cycle-probe-ro",
      reviewingOfficerId: "cycle-probe-rvo",
      acceptingAuthorityId: "cycle-probe-aa",
    },
  });
  assert.equal(openWithoutCycle.status, 201);
  assert.equal(openWithoutCycle.body.form.cycleId, undefined);

  // A garbage cycleId over HTTP is rejected — proves the route forwards cycleId to the service,
  // which validates it exists (`openForm` throws NOT_FOUND for a dangling cycleId).
  const openWithBadCycle = await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/forms",
    headers: { "Idempotency-Key": "idem-g08-cycle-open-badcycle-001" },
    body: {
      employeeId,
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      reportingOfficerId: "cycle-probe-ro",
      reviewingOfficerId: "cycle-probe-rvo",
      acceptingAuthorityId: "cycle-probe-aa",
      cycleId: "no-such-cycle",
    },
  });
  assert.equal(openWithBadCycle.status, 404);

  const openWithCycle = await call(api, hrAdmin, {
    method: "POST",
    path: "/api/v1/apar/forms",
    headers: { "Idempotency-Key": "idem-g08-cycle-open-001" },
    body: {
      employeeId,
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      reportingOfficerId: "cycle-probe-ro",
      reviewingOfficerId: "cycle-probe-rvo",
      acceptingAuthorityId: "cycle-probe-aa",
      cycleId: cycle.id,
    },
  });
  assert.equal(openWithCycle.status, 201);
  const formId = openWithCycle.body.form.id;
  assert.equal(openWithCycle.body.form.cycleId, cycle.id);

  const goal = (await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}/goals`,
    headers: { "Idempotency-Key": "idem-g08-cycle-goal-001" },
    body: { title: "Cycle-bound goal", goalType: "PERFORMANCE", weightage: 100 },
  })).body;

  await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:lock-goals`,
    headers: { "Idempotency-Key": "idem-g08-cycle-lock-001" },
    body: { lockedAt: "2026-06-01" },
  });

  // A rating outside the cycle's 1-5 scale is rejected — this is the branch F-02 made reachable.
  const outOfBounds = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-cycle-submit-oob-001" },
    body: { narrative: "Delivered the cycle-bound goal.", selfRatings: { [goal.goal.id]: 9 } },
  });
  assert.equal(outOfBounds.status, 400);
  assert.equal(outOfBounds.body.error.code, "VALIDATION_FAILED");

  // A non-numeric rating is rejected outright rather than silently coercing to NaN and bypassing
  // the scale-bounds check (NaN < min / NaN > max are both false).
  const nonNumeric = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-cycle-submit-nan-001" },
    body: { narrative: "Delivered the cycle-bound goal.", selfRatings: { [goal.goal.id]: "not-a-number" } },
  });
  assert.equal(nonNumeric.status, 400);

  // A rating within bounds succeeds.
  const withinBounds = await call(api, hrAdmin, {
    method: "POST",
    path: `/api/v1/apar/forms/${formId}:submit-self`,
    headers: { "Idempotency-Key": "idem-g08-cycle-submit-ok-001" },
    body: { narrative: "Delivered the cycle-bound goal.", selfRatings: { [goal.goal.id]: 4 } },
  });
  assert.equal(withinBounds.status, 202);
});
