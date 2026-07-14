// PH-24B — G06 correction lineage + recompute cascade (FR-018).
//   A correction to an appointment date on a FINALISED seniority list records a correction_events
//   row, marks the list UNDER_CORRECTION, and cascades a deterministic re-rank into a new snapshot;
//   a correction against a non-FINALISED list is rejected.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph24b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["establishment_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph24b",
    ...extra,
  };
}

test("G06 correction_events: a corrected appointment date cascades a re-rank into a new snapshot", async () => {
  const s = createFoundationServices();
  s.correctionCascade.finaliseList(actor(), {
    listCode: "REV-2026",
    entries: [
      { employeeId: "emp-a", appointmentDate: "2020-01-10", serviceNo: "SR-1" }, // rank 1
      { employeeId: "emp-b", appointmentDate: "2020-06-10", serviceNo: "SR-2" }, // rank 2
      { employeeId: "emp-c", appointmentDate: "2021-01-10", serviceNo: "SR-3" }, // rank 3
    ],
  });
  // Correct emp-c's appointment date to be the earliest -> emp-c moves to rank 1.
  const out = s.correctionCascade.applyCorrection(actor(), { listCode: "REV-2026", employeeId: "emp-c", newAppointmentDate: "2019-01-01", reason: "Antedated appointment order produced." });
  assert.equal(out.list.version, 2);
  assert.equal(out.list.status, "FINALISED");
  assert.equal(out.list.entries.find((e) => e.employeeId === "emp-c").rank, 1);
  // The correction lineage records the affected set.
  assert.ok(out.correction.affectedEmployeeIds.includes("emp-c"));
  assert.equal(out.correction.oldValue, "2021-01-10");
  assert.equal(out.correction.newValue, "2019-01-01");
});

test("G06 correction_events: a correction on a non-FINALISED (DRAFT) list is rejected (SENIORITY_LIST_NOT_FINAL)", async () => {
  const s = createFoundationServices();
  s.correctionCascade.createDraftList(actor(), { listCode: "DRAFT-2026", entries: [{ employeeId: "e1", appointmentDate: "2020-01-01", serviceNo: "S1" }] });
  assert.throws(
    () => s.correctionCascade.applyCorrection(actor(), { listCode: "DRAFT-2026", employeeId: "e1", newAppointmentDate: "2019-01-01", reason: "premature correction" }),
    (err) => err.code === "PRECONDITION_FAILED" && /SENIORITY_LIST_NOT_FINAL/.test(String(err.message))
  );
});
