const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — G03 Attendance & Leave: g03.leave.approve_standard (runtime:
// g03.leave.approve, pre-existing), g03.leave.sanction_special (new: sanctionSpecialLeave() +
// requiresFinalSanction leave-type flag), g03.attendance.regularize_approve (runtime:
// g03.attendance.regularise, pre-existing SOD), g03.punch.review_anomaly (runtime:
// g03.punch.review + new anomaly_reviewer flag check), g03.biometric.govern (new:
// BiometricGovernanceService + dpo_governance flag).

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    ...extra,
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  return { services, api, admin, meera };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-hr-admin-g03", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("g03.leave.sanction_special: a special leave type requires final sanction beyond ordinary approval; only sanctioning_authority (or override) may grant it", () => {
  const { services, api, meera } = boot();
  const admin = actor("test-admin-2", ["*"]);
  services.leave.configureLeaveType(admin, {
    leaveTypeId: "MATERNITY",
    name: "Maternity Leave",
    countsHolidays: true,
    openingBalance: 180,
    accrualPolicy: { frequency: "YEARLY", unitsPerPeriod: 0 },
    requiresFinalSanction: true,
  });

  const submitted = call(api, actor(meera.id, ["g03.leave.submit"], { roles: ["employee"] }), {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-special-submit-001" },
    body: { employeeId: meera.id, leaveTypeId: "MATERNITY", fromDate: "2026-08-01", toDate: "2026-08-05", reason: "Maternity leave" },
  });
  assert.equal(submitted.status, 201);
  const applicationId = submitted.body.application.id;

  // Cannot sanction before ordinary approval.
  const beforeApproval = call(api, actor("sanctioning-authority-probe-1", ["g03.leave.sanction_special"], { roles: ["sanctioning_authority"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${applicationId}:sanction-special`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-sanction-001" },
    body: {},
  });
  assert.equal(beforeApproval.status, 412);

  const approved = call(api, actor(ph03Ids.manager, ["g03.leave.approve", "g04.relay.write"], { roles: ["l1_manager"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${applicationId}/decision`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-special-approve-001" },
    body: { decision: "APPROVE" },
  });
  assert.equal(approved.status, 202);

  // A plain g03.leave.sanction_special holder without the sanctioning_authority role cannot sanction.
  const withoutRole = call(api, actor("hr-admin-no-role-probe", ["g03.leave.sanction_special"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${applicationId}:sanction-special`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-sanction-002" },
    body: {},
  });
  assert.equal(withoutRole.status, 403);

  const sanctioned = call(api, actor("sanctioning-authority-probe-2", ["g03.leave.sanction_special"], { roles: ["sanctioning_authority"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${applicationId}:sanction-special`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-sanction-003" },
    body: {},
  });
  assert.equal(sanctioned.status, 202);
  assert.ok(sanctioned.body.application.finalSanctionedByUserId);

  // A standard (non-special) leave type cannot be sanctioned — nothing to sanction.
  const standardSubmitted = call(api, actor(meera.id, ["g03.leave.submit"], { roles: ["employee"] }), {
    method: "POST",
    path: "/api/v1/atl/leave-applications",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-standard-submit-001" },
    body: { employeeId: meera.id, leaveTypeId: "CL", fromDate: "2026-08-10", toDate: "2026-08-10", reason: "Personal work" },
  });
  const standardApproved = call(api, actor(ph03Ids.manager, ["g03.leave.approve", "g04.relay.write"], { roles: ["l1_manager"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${standardSubmitted.body.application.id}/decision`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-standard-approve-001" },
    body: { decision: "APPROVE" },
  });
  assert.equal(standardApproved.status, 202);
  const standardSanction = call(api, actor("sanctioning-authority-probe-3", ["g03.leave.sanction_special"], { roles: ["sanctioning_authority"] }), {
    method: "POST",
    path: `/api/v1/atl/leave-applications/${standardSubmitted.body.application.id}:sanction-special`,
    headers: { "Idempotency-Key": "idem-hr-admin-g03-sanction-004" },
    body: {},
  });
  assert.equal(standardSanction.status, 400);
});

test("g03.punch.review_anomaly (post-hr_admin-goal fix): reviewing a flagged punch anomaly requires the anomaly_reviewer capability", () => {
  const { services } = boot();
  const admin = actor("test-admin-3", ["*"]);
  const employee = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const t0 = 1_760_000_000_000;
  const review = services.punchAnomaly.screenPunchPair(admin, {
    employeeId: employee.id,
    punchA: { lat: 28.6139, lon: 77.209, atEpochMs: t0 },
    punchB: { lat: 13.0827, lon: 80.2707, atEpochMs: t0 + 10 * 60 * 1000 },
  });
  assert.equal(review.status, "FLAGGED");

  const withoutFlag = actor("hr-admin-no-anomaly-flag", ["g03.punch.review"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.punchAnomaly.resolveReview(withoutFlag, review.id, { decision: "VALID", note: "checked" }),
    (error) => error.code === "FORBIDDEN" && error.message.includes("anomaly_reviewer")
  );

  const withFlag = actor("hr-admin-with-anomaly-flag", ["g03.punch.review"], { roles: ["hr_admin", "anomaly_reviewer"] });
  const resolved = services.punchAnomaly.resolveReview(withFlag, review.id, { decision: "VALID", note: "Verified with employee; travel was plausible" });
  assert.equal(resolved.status, "VALID");
});

test("g03.biometric.govern: recording consent, configuring retention, and purging requires the dpo_governance capability", () => {
  const { api, meera } = boot();
  const withoutFlag = call(api, actor("hr-admin-no-dpo-probe", ["g03.biometric.govern"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: "/api/v1/biometric-governance/consents",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-consent-001" },
    body: { employeeId: meera.id, consentType: "BIOMETRIC", granted: true, lawfulBasis: "Employee consent per IT Act 2000 s.43A" },
  });
  assert.equal(withoutFlag.status, 403);

  const recorded = call(api, actor("hr-admin-with-dpo-probe", ["g03.biometric.govern"], { roles: ["hr_admin", "dpo_governance"] }), {
    method: "POST",
    path: "/api/v1/biometric-governance/consents",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-consent-002" },
    body: { employeeId: meera.id, consentType: "BIOMETRIC", granted: true, lawfulBasis: "Employee consent per IT Act 2000 s.43A" },
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.consent.employeeId, meera.id);

  const missingLawfulBasis = call(api, actor("hr-admin-with-dpo-probe-2", ["g03.biometric.govern"], { roles: ["hr_admin", "dpo_governance"] }), {
    method: "POST",
    path: "/api/v1/biometric-governance/consents",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-consent-003" },
    body: { employeeId: meera.id, consentType: "GEO_LOCATION", granted: true, lawfulBasis: "" },
  });
  assert.equal(missingLawfulBasis.status, 400);

  const listed = call(api, actor("hr-admin-with-dpo-probe-3", ["g03.biometric.govern"], { roles: ["hr_admin", "dpo_governance"] }), {
    method: "GET",
    path: `/api/v1/biometric-governance/employees/${meera.id}/consents`,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);

  const policy = call(api, actor("hr-admin-with-dpo-probe-4", ["g03.biometric.govern"], { roles: ["hr_admin", "dpo_governance"] }), {
    method: "POST",
    path: "/api/v1/biometric-governance/retention-policies",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-retention-001" },
    body: { dataType: "BIOMETRIC", retentionDays: 30 },
  });
  assert.equal(policy.status, 201);
  assert.equal(policy.body.policy.retentionDays, 30);

  const purge = call(api, actor("hr-admin-with-dpo-probe-5", ["g03.biometric.govern"], { roles: ["hr_admin", "dpo_governance"] }), {
    method: "POST",
    path: "/api/v1/biometric-governance:purge",
    headers: { "Idempotency-Key": "idem-hr-admin-g03-purge-001" },
    body: { dataType: "BIOMETRIC", asOfDate: "2027-01-01" },
  });
  assert.equal(purge.status, 201);
  assert.equal(purge.body.purgeLog.eligibleConsentIds.length, 1, "the 30-day-old consent recorded above is past retention by 2027-01-01");
});
