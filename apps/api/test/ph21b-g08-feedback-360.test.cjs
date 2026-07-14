// PH-21B — G08 multi-source (360) feedback (FR-11).
//   feedback_360 collects PEER/SUBORDINATE/CUSTOMER/MANAGER ratings; release is blocked below
//   MIN_RATERS (anonymity), and the released summary carries no rater identities.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const HR = "user-ph21b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: HR,
    actorUserId: HR,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph21b",
    ...extra,
  };
}

test("G08 feedback_360: release is blocked below MIN_RATERS and succeeds once met (anonymised)", async () => {
  const s = createFoundationServices();
  const f = s.feedback360.open360(actor(), { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, minRaters: 3 });
  s.feedback360.submitRating(actor(), f.id, { raterId: "r1", raterType: "PEER", score: 4 });
  s.feedback360.submitRating(actor(), f.id, { raterId: "r2", raterType: "SUBORDINATE", score: 5 });
  // Only 2 raters -> release blocked.
  assert.throws(
    () => s.feedback360.release360(actor(), f.id),
    (err) => err.code === "PRECONDITION_FAILED"
  );
  s.feedback360.submitRating(actor(), f.id, { raterId: "r3", raterType: "CUSTOMER", score: 3 });
  const rel = s.feedback360.release360(actor(), f.id);
  assert.equal(rel.raterCount, 3);
  assert.equal(rel.aggregateScore, 4); // (4+5+3)/3
  // The released summary carries no rater identities.
  assert.ok(!JSON.stringify(rel).includes("r1"));
  assert.equal(rel.byRaterType.PEER.count, 1);
});

test("G08 feedback_360: an appraisee cannot rate themselves and duplicate raters are rejected", async () => {
  const s = createFoundationServices();
  const f = s.feedback360.open360(actor(), { cycleId: "cycle-2026", appraiseeId: ph03Ids.employee, minRaters: 2 });
  assert.throws(
    () => s.feedback360.submitRating(actor(), f.id, { raterId: ph03Ids.employee, raterType: "PEER", score: 5 }),
    (err) => err.code === "FORBIDDEN"
  );
  s.feedback360.submitRating(actor(), f.id, { raterId: "r1", raterType: "PEER", score: 4 });
  assert.throws(
    () => s.feedback360.submitRating(actor(), f.id, { raterId: "r1", raterType: "PEER", score: 3 }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
