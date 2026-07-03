// PH-21A — G07 LMS / xAPI integration (FR-015).
//   learning_record_stores register an external LRS; lms_enrollments track enrolment; xAPI
//   statements are idempotent (a duplicate statement_id is a no-op) and a completed verb marks
//   the enrolment COMPLETED.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const ADMIN = "user-ph21a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: ADMIN,
    actorUserId: ADMIN,
    permissions: ["*"],
    roles: ["ld_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph21a",
    ...extra,
  };
}

test("G07 LMS/xAPI: enrolment ingests statements idempotently and completes on the completed verb", () => {
  const s = createFoundationServices();
  const lrs = s.lmsIntegration.registerLrs(actor(), { name: "MoodleLRS", endpoint: "https://lrs.example/xapi", isPrimary: true });
  const enr = s.lmsIntegration.enrol(actor(), { lrsId: lrs.id, employeeId: ph03Ids.employee, courseRef: "COURSE-ETHICS-101" });
  assert.equal(enr.status, "ENROLLED");
  const first = s.lmsIntegration.ingestStatement(actor(), enr.id, { statementId: "stmt-1", verb: "progressed" });
  assert.equal(first.applied, true);
  assert.equal(first.enrollment.status, "IN_PROGRESS");
  // Replaying the same statement_id is a no-op.
  const replay = s.lmsIntegration.ingestStatement(actor(), enr.id, { statementId: "stmt-1", verb: "progressed" });
  assert.equal(replay.applied, false);
  assert.equal(replay.enrollment.appliedStatementIds.length, 1);
  // A completed statement marks the enrolment done.
  const done = s.lmsIntegration.ingestStatement(actor(), enr.id, { statementId: "stmt-2", verb: "completed" });
  assert.equal(done.enrollment.status, "COMPLETED");
});

test("G07 LMS/xAPI: only a single primary learning_record_stores entry is allowed", () => {
  const s = createFoundationServices();
  s.lmsIntegration.registerLrs(actor(), { name: "Primary", endpoint: "https://a", isPrimary: true });
  assert.throws(
    () => s.lmsIntegration.registerLrs(actor(), { name: "Second", endpoint: "https://b", isPrimary: true }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
