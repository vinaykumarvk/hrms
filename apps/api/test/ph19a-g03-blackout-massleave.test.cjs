// PH-19A — G03 blackout periods + mass-leave (FR-23).
//   blackout_periods bar leave whose range intersects the window (BLACKOUT_PERIOD); mass_leave
//   applies a leave span to a cohort and flags each member RETURN_TO_WORK_PENDING until confirmed.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph19a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["leave_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph19a",
    ...extra,
  };
}

test("G03 blackout_periods: leave inside an active blackout window is rejected (BLACKOUT_PERIOD)", async () => {
  const s = createFoundationServices();
  s.leaveBlackoutMass.declareBlackout(actor(), { orgUnitId: ph03Ids.orgRevenue, fromDate: "2026-03-25", toDate: "2026-03-31", reason: "Financial year close." });
  assert.throws(
    () => s.leaveBlackoutMass.assertNotInBlackout(actor(), { orgUnitId: ph03Ids.orgRevenue, fromDate: "2026-03-28", toDate: "2026-03-29" }),
    (err) => err.code === "BLACKOUT_PERIOD"
  );
  // Leave outside the window is fine.
  assert.doesNotThrow(() => s.leaveBlackoutMass.assertNotInBlackout(actor(), { orgUnitId: ph03Ids.orgRevenue, fromDate: "2026-04-02", toDate: "2026-04-03" }));
});

test("G03 mass_leave: applies to a cohort and gates return-to-work (RETURN_TO_WORK_PENDING)", async () => {
  const s = createFoundationServices();
  const batch = s.leaveBlackoutMass.applyMassLeave(actor(), {
    orgUnitId: ph03Ids.orgRevenue,
    leaveTypeId: "EL",
    fromDate: "2026-05-01",
    toDate: "2026-05-05",
    memberEmployeeIds: ["emp-1", "emp-2"],
  });
  assert.equal(batch.status, "APPLIED");
  assert.equal(batch.returnPendingEmployeeIds.length, 2);
  // A downstream action for a member who hasn't returned is blocked.
  assert.throws(
    () => s.leaveBlackoutMass.assertReturned(actor(), batch.id, "emp-1"),
    (err) => err.code === "RETURN_TO_WORK_PENDING"
  );
  s.leaveBlackoutMass.confirmReturn(actor(), batch.id, { employeeId: "emp-1" });
  assert.doesNotThrow(() => s.leaveBlackoutMass.assertReturned(actor(), batch.id, "emp-1"));
  const closed = s.leaveBlackoutMass.confirmReturn(actor(), batch.id, { employeeId: "emp-2" });
  assert.equal(closed.status, "CLOSED");
});

test("G03 mass_leave: cannot be applied over an active blackout", async () => {
  const s = createFoundationServices();
  s.leaveBlackoutMass.declareBlackout(actor(), { orgUnitId: ph03Ids.orgAssessment, fromDate: "2026-06-01", toDate: "2026-06-10", reason: "Audit." });
  assert.throws(
    () => s.leaveBlackoutMass.applyMassLeave(actor(), {
      orgUnitId: ph03Ids.orgAssessment,
      leaveTypeId: "EL",
      fromDate: "2026-06-05",
      toDate: "2026-06-06",
      memberEmployeeIds: ["emp-9"],
    }),
    (err) => err.code === "BLACKOUT_PERIOD"
  );
});
