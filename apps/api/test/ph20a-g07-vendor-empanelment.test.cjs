// PH-20A — G07 vendor / external-trainer empanelment (FR-019).
//   vendor_empanelments run APPLIED -> UNDER_REVIEW -> EMPANELLED/REJECTED; the requester cannot
//   approve their own empanelment (SoD); empanelment requires a contract reference.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const APPLICANT = "user-ph20a-applicant";
const APPROVER = "user-ph20a-approver";
function actor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["ld_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph20a",
    ...extra,
  };
}

test("G07 vendor_empanelments: lifecycle APPLIED -> UNDER_REVIEW -> EMPANELLED with a contract ref", () => {
  const s = createFoundationServices();
  const emp = s.vendorEmpanelment.applyForEmpanelment(actor(APPLICANT), { vendorName: "TrainCo", category: "LEADERSHIP", procurementRef: "PROC-9" });
  assert.equal(emp.status, "APPLIED");
  s.vendorEmpanelment.reviewEmpanelment(actor(APPROVER), emp.id);
  const done = s.vendorEmpanelment.decideEmpanelment(actor(APPROVER), emp.id, { decision: "EMPANELLED", contractRef: "CON-77" });
  assert.equal(done.status, "EMPANELLED");
  assert.equal(done.approvedBy, APPROVER);
  assert.equal(done.contractRef, "CON-77");
});

test("G07 vendor_empanelments: the requester cannot approve their own empanelment (SoD)", () => {
  const s = createFoundationServices();
  const emp = s.vendorEmpanelment.applyForEmpanelment(actor(APPLICANT), { vendorName: "SelfCo", category: "TECHNICAL" });
  s.vendorEmpanelment.reviewEmpanelment(actor(APPROVER), emp.id);
  assert.throws(
    () => s.vendorEmpanelment.decideEmpanelment(actor(APPLICANT), emp.id, { decision: "EMPANELLED", contractRef: "CON-1" }),
    (err) => err.code === "FORBIDDEN"
  );
});
