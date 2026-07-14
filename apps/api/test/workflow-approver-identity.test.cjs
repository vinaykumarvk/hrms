const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// P01 platform fix: HrmsWorkflowService.act() now requires that APPROVE/REJECT/SEND_BACK be
// performed either by the resolved REPORTING_CHAIN assignee (actor.userId === selectedAssignees[].employeeId,
// the same convention apps/web/src/app/session.ts uses for employee-issued session tokens) or by
// an org-wide override role (hr_admin, leave_admin, hrbp, sanctioning_authority, transfer_authority,
// system) per docs/contracts/auth-matrix.yaml `scope: team` on g03.leave.approve_standard. Before this
// fix, any actor holding the flat `g03.leave.approve` permission could approve any employee's leave.

function actorFor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["g03.leave.submit", "g03.leave.approve", "g03.leave.reject", "g03.leave.read", "g04.relay.write"],
    roles: ["l1_manager"],
    fieldGrants: [],
    ...extra,
  };
}

test("workflow-approver-identity: an actor who is not the resolved reporting-chain approver cannot approve", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actorFor(ph03Ids.employee), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "CL",
    fromDate: "2026-07-20",
    toDate: "2026-07-20",
  });
  assert.equal(submitted.workflow.instance.status, "RUNNING");

  // A manager-role actor who is NOT ph03Ids.manager (the actual resolved approver) and holds no
  // override role must be rejected, even though they carry the g03.leave.approve permission string.
  const impostor = actorFor("99999999-9999-9999-9999-999999999999");
  assert.throws(
    () => services.leave.approve(impostor, submitted.application.id, "idem-impostor-001"),
    (error) => error.code === "FORBIDDEN"
  );

  // Application must remain SUBMITTED — the rejected attempt must not have mutated state.
  const stillSubmitted = services.leave.listApplications(actorFor(ph03Ids.manager)).find((item) => item.id === submitted.application.id);
  assert.equal(stillSubmitted.status, "SUBMITTED");
});

test("workflow-approver-identity: the actual resolved approver can approve", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actorFor(ph03Ids.employee), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "CL",
    fromDate: "2026-07-21",
    toDate: "2026-07-21",
  });
  const approved = services.leave.approve(actorFor(ph03Ids.manager), submitted.application.id, "idem-real-approver-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("workflow-approver-identity: an hr_admin override role can approve on behalf of the resolved approver", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actorFor(ph03Ids.employee), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "CL",
    fromDate: "2026-07-22",
    toDate: "2026-07-22",
  });

  const hrAdmin = actorFor("88888888-8888-8888-8888-888888888888", { roles: ["hr_admin"] });
  const approved = services.leave.approve(hrAdmin, submitted.application.id, "idem-hr-admin-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("workflow-approver-identity: a non-assignee, non-override actor cannot reject either", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actorFor(ph03Ids.employee), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "CL",
    fromDate: "2026-07-23",
    toDate: "2026-07-23",
  });

  const impostor = actorFor("77777777-7777-7777-7777-777777777777");
  assert.throws(
    () => services.leave.reject(impostor, submitted.application.id),
    (error) => error.code === "FORBIDDEN"
  );
});
