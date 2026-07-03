// PH-19B — G08 continuous feedback + check-ins (FR-10).
//   continuous_feedback and check_ins are append-only inputs tied to a cycle, each with a mandatory
//   note; an empty note is rejected.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const MGR = "user-ph19b-mgr";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: MGR,
    actorUserId: MGR,
    permissions: ["*"],
    roles: ["reporting_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph19b",
    ...extra,
  };
}

test("G08 continuous_feedback: an entry is recorded against a cycle and listed", () => {
  const s = createFoundationServices();
  const fb = s.continuousFeedback.recordFeedback(actor(), {
    cycleId: "cycle-2026",
    appraiseeId: ph03Ids.employee,
    direction: "DOWNWARD",
    note: "Strong delivery on the revenue migration.",
    recordedAt: "2026-07-03",
  });
  assert.equal(fb.cycleId, "cycle-2026");
  const list = s.continuousFeedback.listFeedback(actor(), "cycle-2026", ph03Ids.employee);
  assert.equal(list.length, 1);
});

test("G08 continuous_feedback: an empty note is rejected", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.continuousFeedback.recordFeedback(actor(), { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, direction: "PEER", note: "   ", recordedAt: "2026-07-03" }),
    (err) => err.code === "VALIDATION_FAILED"
  );
});

test("G08 check_ins: a check-in is recorded with a mandatory note", () => {
  const s = createFoundationServices();
  const ci = s.continuousFeedback.recordCheckIn(actor(), {
    cycleId: "cycle-2026",
    appraiseeId: ph03Ids.employee,
    note: "Mid-cycle check-in: on track for goals 1 and 2.",
    checkInDate: "2026-07-03",
  });
  assert.equal(ci.cycleId, "cycle-2026");
  assert.throws(
    () => s.continuousFeedback.recordCheckIn(actor(), { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, note: "", checkInDate: "2026-07-03" }),
    (err) => err.code === "VALIDATION_FAILED"
  );
  assert.equal(s.continuousFeedback.listCheckIns(actor(), "cycle-2026", ph03Ids.employee).length, 1);
});
