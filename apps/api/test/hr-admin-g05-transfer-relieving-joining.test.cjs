const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — G05 Transfer/Relieving/Joining: g05.transfer.initiate (runtime:
// g05.transfer.initiate, exact match, pre-existing), g05.clearance.grant (runtime:
// g05.transfer.clearance/.deem + new g05_clearance_officer flag check), g05.estate.record
// (runtime: g05.quarter.approve/.overstay/.vacate + new g05_estate_officer flag check).

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
  return createFoundationServices();
}

function approvedOrder(services, suffix) {
  const admin = actor("test-admin", ["*"]);
  const initiated = services.transfer.initiate(admin, {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-08-01",
    effectiveDate: "2026-08-10",
    reason: "hr_admin G05 capability audit",
  });
  return services.transfer.approve(admin, initiated.order.id, { idempotencyKey: `idem-hr-admin-g05-approve-${suffix}` });
}

test("g05.transfer.initiate: the runtime permission string matches exactly and works end-to-end", () => {
  const services = boot();
  const initiator = actor("hr-admin-initiate-probe", ["g05.transfer.initiate"], { roles: ["hr_admin"] });
  const initiated = services.transfer.initiate(initiator, {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-08-01",
    effectiveDate: "2026-08-10",
    reason: "Administrative posting",
  });
  assert.ok(initiated.order.id);
  assert.equal(initiated.order.status, "PENDING_APPROVAL");
});

test("g05.clearance.grant (post-hr_admin-goal fix): completing/deeming a departmental clearance requires the g05_clearance_officer capability", () => {
  const services = boot();
  const order = approvedOrder(services, "clearance");
  const code = order.order.clearanceItems[0].code;

  const withoutFlag = actor("hr-admin-no-clearance-flag", ["g05.transfer.clearance"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.transfer.completeClearance(withoutFlag, order.order.id, code, "2026-08-11"),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g05_clearance_officer")
  );

  const withFlag = actor("hr-admin-with-clearance-flag", ["g05.transfer.clearance"], { roles: ["hr_admin", "g05_clearance_officer"] });
  const cleared = services.transfer.completeClearance(withFlag, order.order.id, code, "2026-08-11");
  assert.ok(cleared.id);
});

test("g05.estate.record (post-hr_admin-goal fix): approving/flagging-overstay/recording-vacation of accommodation requires the g05_estate_officer capability", () => {
  const services = boot();
  const order = approvedOrder(services, "estate");
  const requester = actor("hr-admin-quarter-requester", ["g05.quarter.request"], { roles: ["hr_admin"] });
  const requested = services.transfer.requestQuarterRetention(requester, order.order.id, {
    quarterRef: "QTR-HR-ADMIN-01",
    vacateByDate: "2026-09-15",
    licenceFeeRate: 1200,
    penalLicenceFeeRate: 4800,
  });

  const approveWithoutFlag = actor("hr-admin-no-estate-flag", ["g05.quarter.approve"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.transfer.approveQuarterRetention(approveWithoutFlag, requested.id, { approvedOn: "2026-08-12" }),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g05_estate_officer")
  );

  const approveWithFlag = actor("hr-admin-with-estate-flag", ["g05.quarter.approve"], { roles: ["hr_admin", "g05_estate_officer"] });
  const approved = services.transfer.approveQuarterRetention(approveWithFlag, requested.id, { approvedOn: "2026-08-12" });
  assert.equal(approved.retentionStatus, "RETENTION_APPROVED");

  const overstayWithoutFlag = actor("hr-admin-no-estate-flag-2", ["g05.quarter.overstay"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.transfer.flagQuarterOverstay(overstayWithoutFlag, requested.id, { asOf: "2026-09-20" }),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g05_estate_officer")
  );
  const overstayWithFlag = actor("hr-admin-with-estate-flag-2", ["g05.quarter.overstay"], { roles: ["hr_admin", "g05_estate_officer"] });
  const overstayed = services.transfer.flagQuarterOverstay(overstayWithFlag, requested.id, { asOf: "2026-09-20" });
  assert.equal(overstayed.retentionStatus, "OVERSTAY");
  assert.ok(overstayed.licenceFeeRecoveryRef);

  const vacateWithoutFlag = actor("hr-admin-no-estate-flag-3", ["g05.quarter.vacate"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.transfer.recordQuarterVacation(vacateWithoutFlag, requested.id, { vacatedOn: "2026-09-25" }),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g05_estate_officer")
  );
  const vacateWithFlag = actor("hr-admin-with-estate-flag-3", ["g05.quarter.vacate"], { roles: ["hr_admin", "g05_estate_officer"] });
  const vacated = services.transfer.recordQuarterVacation(vacateWithFlag, requested.id, { vacatedOn: "2026-09-25" });
  assert.equal(vacated.retentionStatus, "VACATED");
});
