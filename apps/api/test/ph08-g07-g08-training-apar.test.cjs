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
    userId: "user-ph08-g07-g08",
    actorUserId: "user-ph08-g07-g08",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08-g07-g08",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08-g07-g08", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-08 G07 nomination completion issues significant certification and posts TRAINING_CERTIFICATION_POSTED", () => {
  const services = createFoundationServices();
  const session = services.training.createSession(actor(), { programCode: "REV-LAW", title: "Revenue Law Certification", capacity: 1 });
  const nomination = services.training.nominate(actor(), { sessionId: session.id, employeeId: ph03Ids.employee });
  assert.equal(nomination.status, "PENDING_L1");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.metadata.workflowCode === "WF-G07-NOMINATION"));
  services.training.approveNomination(actor(), nomination.id);
  const completed = services.training.completeNomination(actor(), nomination.id, {
    passed: true,
    significantForSr: true,
    completionDate: "2026-08-18",
    idempotencyKey: "idem-ph08-g07-cert-001",
  });
  assert.equal(completed.nomination.status, "COMPLETED");
  assert.equal(completed.certification.significantForSr, true);
  const timeline = services.serviceRegister.getTimeline(actor(), ph03Ids.employee);
  assert.equal(timeline[0].sourceModule, "G07");
  assert.equal(timeline[0].eventTypeCode, "TRAINING_CERTIFICATION_POSTED");
});

test("PH-08 G08 APAR chain posts final grade and sealed-cover suppresses G06 feed", () => {
  const services = createFoundationServices();
  const form = services.apar.openForm(actor(), {
    employeeId: ph03Ids.employee,
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    reportingOfficerId: ph03Ids.manager,
    reviewingOfficerId: ph03Ids.manager,
    acceptingAuthorityId: ph03Ids.manager,
  });
  services.apar.submitSelf(actor(), form.id);
  services.apar.recordReporting(actor(), form.id, { grade: "VERY_GOOD", narrative: "Strong statutory output" });
  services.apar.recordReview(actor(), form.id, { concur: true, remarks: "Concurred" });
  services.apar.accept(actor(), form.id, { finalGrade: "VERY_GOOD" });
  const posted = services.apar.postFinalGrade(actor(), form.id, {
    eventDate: "2027-04-30",
    idempotencyKey: "idem-ph08-g08-post-001",
  });
  assert.equal(posted.form.status, "POSTED");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee)[0].eventTypeCode, "APAR_FINAL_GRADE");

  const sealed = services.apar.openForm(actor(), {
    employeeId: ph03Ids.employee,
    periodStart: "2027-04-01",
    periodEnd: "2028-03-31",
    reportingOfficerId: ph03Ids.manager,
    reviewingOfficerId: ph03Ids.manager,
    acceptingAuthorityId: ph03Ids.manager,
    underCharge: true,
  });
  assert.equal(sealed.status, "SEALED_COVER");
  assert.equal(sealed.g06FeedSuppressed, true);
  assert.throws(
    () => services.apar.postFinalGrade(actor(), sealed.id, { eventDate: "2028-04-30", idempotencyKey: "idem-ph08-g08-sealed-001" }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
  assert.equal(services.apar.summary(actor()).g06FeedSuppressed, 1);
});

test("PH-08 G07/G08 routes expose training and APAR summaries", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const session = call(api, {
    method: "POST",
    path: "/api/v1/training/sessions",
    headers: { "Idempotency-Key": "idem-ph08-g07-route-session-001" },
    body: { programCode: "ETHICS", title: "Ethics", capacity: 1 },
  });
  assert.equal(session.status, 201);
  const form = call(api, {
    method: "POST",
    path: "/api/v1/apar/forms",
    headers: { "Idempotency-Key": "idem-ph08-g08-route-form-001" },
    body: { periodStart: "2026-04-01", periodEnd: "2027-03-31" },
  });
  assert.equal(form.status, 201);
  assert.equal(call(api, { method: "GET", path: "/api/v1/training/summary" }).status, 200);
  assert.equal(call(api, { method: "GET", path: "/api/v1/apar/summary" }).status, 200);
});
