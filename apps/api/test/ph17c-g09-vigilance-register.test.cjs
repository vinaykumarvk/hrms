// PH-17C — G09 vigilance / sealed-cover register (FR-015).
//   vigilance_records track clearance_status, integrity_grade and a sealed_cover flag. The
//   clearance lookup consumed by promotion/pension returns cleared=false whenever the status is
//   NOT_CLEARED or a sealed cover is in force; the fail-closed gate throws in that state.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OFFICER = "user-ph17c-vigilance";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OFFICER,
    actorUserId: OFFICER,
    permissions: ["*"],
    roles: ["vigilance_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph17c",
    ...extra,
  };
}

test("G09 vigilance_records: clearance lifecycle PENDING -> CLEARED and the lookup reflects it", async () => {
  const s = createFoundationServices();
  const emp = ph03Ids.employee;
  s.vigilanceRegister.upsertVigilance(actor(), { employeeId: emp, integrityGrade: "NOT_ASSESSED" });
  // Pending => not cleared.
  assert.equal(s.vigilanceRegister.clearanceLookup(actor(), emp).cleared, false);
  const cleared = s.vigilanceRegister.decideClearance(actor(), emp, { decision: "CLEARED", integrityGrade: "INTEGRITY_BEYOND_DOUBT" });
  assert.equal(cleared.clearanceStatus, "CLEARED");
  const lookup = s.vigilanceRegister.clearanceLookup(actor(), emp);
  assert.equal(lookup.cleared, true);
  assert.doesNotThrow(() => s.vigilanceRegister.assertClearedForPromotion(actor(), emp));
});

test("G09 sealed cover / NOT_CLEARED blocks clearance (fail closed)", async () => {
  const s = createFoundationServices();
  const emp = ph03Ids.manager;
  s.vigilanceRegister.upsertVigilance(actor(), { employeeId: emp });
  // A sealed cover forces NOT_CLEARED and cannot be cleared while in force.
  const sealed = s.vigilanceRegister.placeSealedCover(actor(), emp, { reason: "Disciplinary case in progress." });
  assert.equal(sealed.sealedCover, true);
  assert.equal(sealed.clearanceStatus, "NOT_CLEARED");
  assert.throws(
    () => s.vigilanceRegister.decideClearance(actor(), emp, { decision: "CLEARED", integrityGrade: "INTEGRITY_BEYOND_DOUBT" }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
  // The eligibility gate is fail closed while sealed / NOT_CLEARED.
  assert.equal(s.vigilanceRegister.clearanceLookup(actor(), emp).cleared, false);
  assert.throws(
    () => s.vigilanceRegister.assertClearedForPromotion(actor(), emp),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
