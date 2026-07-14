// PH-17A — G03 leave-year close and encashment (FR-15 / FR-16).
//   leave_year_close is simulate-then-commit: the simulation computes carry-forward (capped) and
//   lapse per balance; commit persists and stamps COMMITTED. A pending leave blocks the close
//   (PENDING_LEAVE_BLOCKS_CLOSE); a second commit for the same year fails YEAR_ALREADY_CLOSED.
//   leave_encashment is bounded by the type cap (ENCASHMENT_CAP_EXCEEDED) and encashability
//   (NOT_ENCASHABLE).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph17a-officer";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["leave_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph17a",
    ...extra,
  };
}

const balances = [
  { leaveTypeId: "EL", closingBalanceDays: 45, carryForwardCapDays: 30 }, // 30 CF, 15 lapse
  { leaveTypeId: "HPL", closingBalanceDays: 20, carryForwardCapDays: 240, isHalfPay: true, hplConversionRatioPct: 50 },
];

test("G03 leave_year_close: simulate computes carry-forward + lapse without committing", async () => {
  const s = createFoundationServices();
  const sim = s.leaveYearClose.simulateYearClose(actor(), {
    orgUnitId: ph03Ids.orgRevenue,
    leaveYear: 2026,
    pendingLeaveCount: 0,
    balances,
  });
  assert.equal(sim.status, "SIMULATED");
  const el = sim.lines.find((l) => l.leaveTypeId === "EL");
  assert.equal(el.carriedForwardDays, 30);
  assert.equal(el.lapsedDays, 15);
  // A simulation is not persisted as a committed close.
  const committed = s.leaveYearClose.commitYearClose(actor(), {
    orgUnitId: ph03Ids.orgRevenue,
    leaveYear: 2026,
    pendingLeaveCount: 0,
    balances,
  });
  assert.equal(committed.status, "COMMITTED");
  // EL carries 30 (cap), HPL carries 20 (under cap) -> 50; only EL lapses 15.
  assert.equal(committed.totalCarriedForwardDays, 50);
  assert.equal(committed.totalLapsedDays, 15);
});

test("G03 leave_year_close: pending leave blocks the close (PENDING_LEAVE_BLOCKS_CLOSE)", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.leaveYearClose.commitYearClose(actor(), {
      orgUnitId: ph03Ids.orgRevenue,
      leaveYear: 2026,
      pendingLeaveCount: 2,
      balances,
    }),
    (err) => err.code === "PENDING_LEAVE_BLOCKS_CLOSE"
  );
});

test("G03 leave_year_close: a second commit for the same year fails YEAR_ALREADY_CLOSED", async () => {
  const s = createFoundationServices();
  s.leaveYearClose.commitYearClose(actor(), { orgUnitId: ph03Ids.orgRevenue, leaveYear: 2027, pendingLeaveCount: 0, balances });
  assert.throws(
    () => s.leaveYearClose.commitYearClose(actor(), { orgUnitId: ph03Ids.orgRevenue, leaveYear: 2027, pendingLeaveCount: 0, balances }),
    (err) => err.code === "YEAR_ALREADY_CLOSED"
  );
});

test("G03 leave_encashment: cap and encashability are enforced", async () => {
  const s = createFoundationServices();
  // Over the cap -> ENCASHMENT_CAP_EXCEEDED.
  assert.throws(
    () => s.leaveYearClose.encashLeave(actor(), {
      employeeId: ph03Ids.employee,
      leaveTypeId: "EL",
      context: "RETIREMENT",
      requestedDays: 400,
      availableEncashableDays: 300,
      isEncashable: true,
      capDays: 300,
    }),
    (err) => err.code === "ENCASHMENT_CAP_EXCEEDED"
  );
  // A non-encashable type -> NOT_ENCASHABLE.
  assert.throws(
    () => s.leaveYearClose.encashLeave(actor(), {
      employeeId: ph03Ids.employee,
      leaveTypeId: "CL",
      context: "IN_SERVICE",
      requestedDays: 5,
      availableEncashableDays: 10,
      isEncashable: false,
      capDays: 10,
    }),
    (err) => err.code === "NOT_ENCASHABLE"
  );
  // Within cap -> settled.
  const enc = s.leaveYearClose.encashLeave(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    context: "RETIREMENT",
    requestedDays: 240,
    availableEncashableDays: 300,
    isEncashable: true,
    capDays: 300,
  });
  assert.equal(enc.status, "SETTLED");
  assert.equal(enc.encashedDays, 240);
});
