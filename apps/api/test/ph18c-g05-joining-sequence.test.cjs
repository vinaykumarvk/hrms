// PH-18C — G05 joining-sequence + inter-se seniority (FR-021).
//   joining_sequence assigns a deterministic sequence_no per joiner using a stable tie-break
//   (order date, then service_no) so re-runs are identical; a duplicate joiner in a batch is
//   rejected; the inter-se seniority order is exposed for G06.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph18c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["establishment_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph18c",
    ...extra,
  };
}

const joiners = [
  { employeeId: "emp-c", orderDate: "2026-07-02", serviceNo: "SR-0009" },
  { employeeId: "emp-a", orderDate: "2026-07-01", serviceNo: "SR-0007" },
  { employeeId: "emp-b", orderDate: "2026-07-01", serviceNo: "SR-0003" }, // same date, smaller service_no => ahead of emp-a
];

test("G05 joining_sequence: deterministic inter-se ordering by order date then service_no", () => {
  const s = createFoundationServices();
  const seq = s.joiningSequence.assignJoiningSequence(actor(), { batchId: "batch-ph18c-1", joiners });
  const order = seq.map((r) => `${r.sequenceNo}:${r.employeeId}`);
  // 2026-07-01 SR-0003 (emp-b) < 2026-07-01 SR-0007 (emp-a) < 2026-07-02 (emp-c).
  assert.deepEqual(order, ["1:emp-b", "2:emp-a", "3:emp-c"]);
  // Re-running yields the identical ordering (determinism).
  const rerun = s.joiningSequence.assignJoiningSequence(actor(), { batchId: "batch-ph18c-1", joiners: [...joiners].reverse() });
  assert.deepEqual(rerun.map((r) => `${r.sequenceNo}:${r.employeeId}`), order);
  // The inter-se seniority list is exposed for G06.
  assert.equal(s.joiningSequence.interSeSeniority(actor(), "batch-ph18c-1").length, 3);
});

test("G05 joining_sequence: a duplicate joiner in a batch is rejected", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.joiningSequence.assignJoiningSequence(actor(), {
      batchId: "batch-ph18c-2",
      joiners: [
        { employeeId: "emp-x", orderDate: "2026-07-01", serviceNo: "SR-1" },
        { employeeId: "emp-x", orderDate: "2026-07-01", serviceNo: "SR-2" },
      ],
    }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
