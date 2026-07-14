const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — G02 Personal Details Change Workflow: g02.change_request.review
// (runtime: g02.change.approve), g02.fraud.review (runtime: g02.risk.review + new fraud_reviewer
// flag check), g02.grievance.handle (runtime: G13 DSR adjudicate + new grievance_officer flag
// check — the same underlying "handle a data-subject privacy grievance" capability, not
// duplicated as a separate G02 mechanism), g02.sr.post (runtime: g02.change.commit, pre-existing).

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
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-hr-admin-g02", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("g02.fraud.review (post-hr_admin-goal fix): reviewing the fraud queue requires the fraud_reviewer capability, not just g02.risk.review", () => {
  const { services } = boot();
  const withoutFlag = actor("g02-risk-reviewer-no-flag", ["g02.risk.review"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.changeGovernance.reviewRiskSignal(withoutFlag, "nonexistent-request", "nonexistent-signal", { outcome: "CLEARED", comment: "n/a" }),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN" && error.message.includes("fraud_reviewer")
  );

  const withFlag = actor("g02-risk-reviewer-with-flag", ["g02.risk.review"], { roles: ["hr_admin", "fraud_reviewer"] });
  // With the flag, the FORBIDDEN-for-missing-flag check no longer fires; it now fails on the next
  // check (NOT_FOUND for the nonexistent request), proving the flag gate itself is the thing that
  // changed, not some other side effect.
  assert.throws(
    () => services.changeGovernance.reviewRiskSignal(withFlag, "nonexistent-request", "nonexistent-signal", { outcome: "CLEARED", comment: "n/a" }),
    (error) => error instanceof FoundationError && error.code === "NOT_FOUND"
  );
});

test("g02.grievance.handle (post-hr_admin-goal fix): adjudicating a data-subject request requires the grievance_officer capability", () => {
  const { api, meera } = boot();
  const registered = call(api, actor("dsr-registrar-probe", ["g13.dsr.register"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-hr-admin-g02-dsr-001" },
    body: { dataSubjectEmployeeId: meera.id, requestType: "ACCESS" },
  });
  assert.equal(registered.status, 201);
  const dsrId = registered.body.dataSubjectRequest.id;

  const withoutFlag = call(api, actor("dsr-adjudicator-no-flag", ["g13.dsr.adjudicate"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:adjudicate`,
    headers: { "Idempotency-Key": "idem-hr-admin-g02-dsr-002" },
    body: { decision: "PROCEED" },
  });
  assert.equal(withoutFlag.status, 403);

  const withFlag = call(api, actor("dsr-adjudicator-with-flag", ["g13.dsr.adjudicate"], { roles: ["hr_admin", "grievance_officer"] }), {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:adjudicate`,
    headers: { "Idempotency-Key": "idem-hr-admin-g02-dsr-003" },
    body: { decision: "PROCEED" },
  });
  assert.equal(withFlag.status, 202);
});

test("g02.change_request.review (runtime: g02.change.approve) and g02.sr.post (runtime: g02.change.commit): the runtime permission strings work end-to-end", () => {
  const { services, meera } = boot();
  const maker = actor("g02-change-maker-probe", ["*"], { roles: ["hr_admin"], fieldGrants: ["*"] });
  const created = services.changeGovernance.submitChange(maker, {
    employeeId: meera.id,
    fieldKey: "mobileNumber",
    newValue: "+91-99999-11111",
    reason: "Mobile number correction",
    origin: "HR_ON_BEHALF",
  });
  assert.ok(created.id);

  const approver = actor("g02-change-approver-probe", ["g02.change.approve"], { roles: ["hr_admin"] });
  const approved = services.changeGovernance.approveChange(approver, created.id);
  assert.equal(approved.status, "APPROVED");

  // g02.sr.post: committing an approved change is what posts it to the G12 SR ledger.
  const committer = actor("g02-change-committer-probe", ["g02.change.commit"], { roles: ["hr_admin"] });
  const committed = services.changeGovernance.commitChange(committer, created.id, "idem-hr-admin-g02-commit-001");
  assert.equal(committed.status, "COMMITTED");
});
