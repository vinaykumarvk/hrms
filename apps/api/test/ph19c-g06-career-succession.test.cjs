// PH-19C — G06 career-path + succession planning (FR-014).
//   career_paths define an ordered ladder of career_path_stages; succession_plans rank
//   succession_candidates; a candidate may appear on a plan only once (duplicate rejected).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const HR = "user-ph19c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: HR,
    actorUserId: HR,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph19c",
    ...extra,
  };
}

test("G06 career_paths: an ordered path is defined; non-contiguous stages are rejected", () => {
  const s = createFoundationServices();
  const path = s.careerSuccession.defineCareerPath(actor(), {
    pathCode: "REV-LADDER",
    name: "Revenue cadre ladder",
    stages: [
      { stageNo: 1, gradeDesignationId: "des-inspector", typicalYears: 5 },
      { stageNo: 2, gradeDesignationId: "des-officer", typicalYears: 6 },
    ],
  });
  assert.equal(path.stages.length, 2);
  assert.throws(
    () => s.careerSuccession.defineCareerPath(actor(), {
      pathCode: "BAD",
      name: "Bad",
      stages: [{ stageNo: 1, gradeDesignationId: "a", typicalYears: 1 }, { stageNo: 3, gradeDesignationId: "b", typicalYears: 1 }],
    }),
    (err) => err.code === "VALIDATION_FAILED"
  );
});

test("G06 succession_plans: ranked candidates; a duplicate candidate is rejected", () => {
  const s = createFoundationServices();
  const plan = s.careerSuccession.createSuccessionPlan(actor(), { positionId: "pos-cto", incumbentEmployeeId: ph03Ids.manager });
  s.careerSuccession.addSuccessionCandidate(actor(), plan.id, { employeeId: "emp-1", rank: 2, readiness: "READY_1_2Y" });
  const withTwo = s.careerSuccession.addSuccessionCandidate(actor(), plan.id, { employeeId: "emp-2", rank: 1, readiness: "READY_NOW" });
  // Sorted by rank.
  assert.deepEqual(withTwo.candidates.map((c) => c.employeeId), ["emp-2", "emp-1"]);
  // Duplicate candidate rejected.
  assert.throws(
    () => s.careerSuccession.addSuccessionCandidate(actor(), plan.id, { employeeId: "emp-1", rank: 3, readiness: "READY_3Y_PLUS" }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
