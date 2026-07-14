const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — G01 Employee Profile: epm.employee.manage (runtime:
// g01.employee.create), epm.field.pii_unmask (runtime: field-grant-gated readProfile() +
// new correctPii() write path), g01.bank.approve (already built/tested this session).
// Exercised over HTTP against seedTestEmployees:true real data where relevant.

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["hr_admin"],
    fieldGrants: [],
    ...extra,
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"], { fieldGrants: ["*"] });
  const meera = services.employeeMaster.getByServiceNo(admin, "GOV-100304");
  return { services, api, admin, meera };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-hr-admin-g01", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("epm.employee.manage (runtime: g01.employee.create): hr_admin can create an employee master record", () => {
  const { api } = boot();
  const result = call(api, actor("hr-admin-create-probe", ["g01.employee.create"]), {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-hr-admin-g01-create-001" },
    body: {
      firstName: "Kavita",
      lastName: "Rao",
      orgUnitId: ph03Ids.orgRevenue,
      dateOfJoining: "2026-07-01",
      pan: "ABCDE1234F",
      dob: "1995-03-14",
    },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.employee.firstName, "Kavita");
});

test("epm.field.pii_unmask (read side): hr_admin with the right field grants sees unmasked PAN/DOB/category; without grants sees [HIDDEN]", () => {
  const { api, meera } = boot();
  const created = call(api, actor("hr-admin-pii-setup-probe", ["g01.employee.create"], { fieldGrants: ["*"] }), {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-hr-admin-g01-pii-setup-001" },
    body: { firstName: "Nikhil", lastName: "Verma", orgUnitId: ph03Ids.orgRevenue, dateOfJoining: "2026-06-01", pan: "PQRSX5678Z", dob: "1990-01-20", category: "GENERAL" },
  });
  const employeeId = created.body.employee.id;

  const withGrants = call(api, actor("hr-admin-with-grants", ["g01.employee.read"], { fieldGrants: ["employee.pan", "employee.aadhaar", "employee.category", "employee.dob"] }), {
    method: "GET",
    path: `/api/v1/employees/${employeeId}/profile-360`,
  });
  assert.equal(withGrants.status, 200);
  assert.equal(withGrants.body.profile.pan, "PQRSX5678Z");
  assert.equal(withGrants.body.profile.dob, "1990-01-20");
  assert.equal(withGrants.body.profile.category, "GENERAL");

  const withoutGrants = call(api, actor("hr-admin-without-grants", ["g01.employee.read"], { fieldGrants: [] }), {
    method: "GET",
    path: `/api/v1/employees/${employeeId}/profile-360`,
  });
  assert.equal(withoutGrants.status, 200);
  assert.equal(withoutGrants.body.profile.pan, "[HIDDEN]");
  assert.equal(withoutGrants.body.profile.dob, "[HIDDEN]");
  assert.equal(withoutGrants.body.profile.category, "[HIDDEN]");
  void meera;
});

test("epm.field.pii_unmask (write side): hr_admin can correct PAN/DOB with a recorded reason; a reason is mandatory; PAN format is validated", () => {
  const { api } = boot();
  const created = call(api, actor("hr-admin-correct-setup-probe", ["g01.employee.create"]), {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-hr-admin-g01-correct-setup-001" },
    body: { firstName: "Anita", lastName: "Desai", orgUnitId: ph03Ids.orgRevenue, dateOfJoining: "2026-05-01", pan: "AAAAA1111A", dob: "1988-08-08" },
  });
  const employeeId = created.body.employee.id;

  const correctProbeFieldGrants = { fieldGrants: ["employee.pan", "employee.aadhaar", "employee.category", "employee.dob"] };
  const missingReason = call(api, actor("hr-admin-correct-probe", ["g01.employee.pii.correct"], correctProbeFieldGrants), {
    method: "POST",
    path: `/api/v1/employees/${employeeId}:correct-pii`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-correct-001" },
    body: { dob: "1988-08-09" },
  });
  assert.equal(missingReason.status, 400);

  const badPan = call(api, actor("hr-admin-correct-probe", ["g01.employee.pii.correct"]), {
    method: "POST",
    path: `/api/v1/employees/${employeeId}:correct-pii`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-correct-002" },
    body: { pan: "not-a-pan", reason: "Correcting a data-entry typo" },
  });
  assert.equal(badPan.status, 400);

  const corrected = call(api, actor("hr-admin-correct-probe", ["g01.employee.pii.correct"], correctProbeFieldGrants), {
    method: "POST",
    path: `/api/v1/employees/${employeeId}:correct-pii`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-correct-003" },
    body: { pan: "BBBBB2222B", dob: "1988-08-09", reason: "Corrected per original birth certificate on file" },
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.profile.pan, "BBBBB2222B");
  assert.equal(corrected.body.profile.dob, "1988-08-09");

  // A plain g01.employee.read holder (no g01.employee.pii.correct) cannot correct.
  const forbidden = call(api, actor("employee-reader-probe", ["g01.employee.read"]), {
    method: "POST",
    path: `/api/v1/employees/${employeeId}:correct-pii`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-correct-004" },
    body: { dob: "1999-01-01", reason: "attempted unauthorised correction" },
  });
  assert.equal(forbidden.status, 403);
});

test("g01.bank.approve: hr_admin (checker) can approve a bank-account change but not one they themselves submitted (maker!=checker SOD)", () => {
  const { api, meera } = boot();
  const submitted = call(api, actor(meera.id, ["g01.bank.write"], { roles: ["employee"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bank-accounts`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bank-001" },
    body: { accountNumberMasked: "XXXX1234", ifsc: "SBIN0001234", bankName: "State Bank" },
  });
  assert.equal(submitted.status, 201);
  const accountId = submitted.body.bankAccount.id;

  const selfApprove = call(api, actor(meera.id, ["g01.bank.approve"], { roles: ["employee"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bank-accounts/${accountId}:approve`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bank-002" },
    body: {},
  });
  assert.equal(selfApprove.status, 403);

  const hrAdminApprove = call(api, actor("hr-admin-bank-approver-probe", ["g01.bank.approve"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bank-accounts/${accountId}:approve`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bank-003" },
    body: {},
  });
  assert.equal(hrAdminApprove.status, 202);
});

test("bgv_review: a vendor/onboarding-desk actor records a BGV result; hr_admin without the bgv_reviewer role cannot review it; with the role, can", () => {
  const { api, meera } = boot();
  const recorded = call(api, actor("onboarding-desk-probe", ["g01.bgv.record"], { roles: ["onboarding_admin"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bgv-records`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-record-001" },
    body: {
      vendorName: "Sample Verification Services Pvt Ltd",
      verificationType: "IDENTITY",
      status: "DISCREPANCY_FOUND",
      reportDate: "2026-07-10",
      discrepancyNotes: "Address on file does not match verification report",
    },
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.bgvRecord.status, "DISCREPANCY_FOUND");
  assert.equal("tenantId" in recorded.body.bgvRecord, false);
  const recordId = recorded.body.bgvRecord.id;

  // hr_admin without the bgv_reviewer capability role cannot review the discrepancy.
  const withoutFlag = call(api, actor("hr-admin-no-flag-probe", ["g01.bgv.review"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: `/api/v1/bgv-records/${recordId}:review`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-review-001" },
    body: { outcome: "ACCEPTED", notes: "Reviewed and accepted" },
  });
  assert.equal(withoutFlag.status, 403);

  // hr_admin WITH the bgv_reviewer capability role can review it.
  const withFlag = call(api, actor("hr-admin-with-flag-probe", ["g01.bgv.review"], { roles: ["hr_admin", "bgv_reviewer"] }), {
    method: "POST",
    path: `/api/v1/bgv-records/${recordId}:review`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-review-002" },
    body: { outcome: "ESCALATED", notes: "Escalated to vigilance for further inquiry" },
  });
  assert.equal(withFlag.status, 200);
  assert.equal(withFlag.body.bgvRecord.reviewOutcome, "ESCALATED");

  const listed = call(api, actor("hr-admin-list-probe", ["g01.bgv.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/employees/${meera.id}/bgv-records`,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].reviewOutcome, "ESCALATED");
});

test("bgv_review: a CLEAR result cannot be reviewed/dispositioned (nothing to review); a discrepancy result requires notes", () => {
  const { api, meera } = boot();
  const clearRecord = call(api, actor("onboarding-desk-probe-2", ["g01.bgv.record"], { roles: ["onboarding_admin"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bgv-records`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-record-002" },
    body: { vendorName: "Sample Verification Services Pvt Ltd", verificationType: "EMPLOYMENT_HISTORY", status: "CLEAR", reportDate: "2026-07-10" },
  });
  assert.equal(clearRecord.status, 201);

  const reviewClear = call(api, actor("hr-admin-review-clear-probe", ["g01.bgv.review"], { roles: ["hr_admin", "bgv_reviewer"] }), {
    method: "POST",
    path: `/api/v1/bgv-records/${clearRecord.body.bgvRecord.id}:review`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-review-003" },
    body: { outcome: "ACCEPTED", notes: "n/a" },
  });
  assert.equal(reviewClear.status, 412);

  const missingNotes = call(api, actor("onboarding-desk-probe-3", ["g01.bgv.record"], { roles: ["onboarding_admin"] }), {
    method: "POST",
    path: `/api/v1/employees/${meera.id}/bgv-records`,
    headers: { "Idempotency-Key": "idem-hr-admin-g01-bgv-record-003" },
    body: { vendorName: "Sample Verification Services Pvt Ltd", verificationType: "CRIMINAL", status: "DISCREPANCY_FOUND", reportDate: "2026-07-10" },
  });
  assert.equal(missingNotes.status, 400);
});
