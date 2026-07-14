// PH-24A — G11 death-detection + overpayment recovery (FR-20).
//   Death-registry reconciliation marks a pensioner DECEASED and suspends disbursement;
//   overpayment_recoveries schedule recovery from the estate / family-pension arrears, bounded so
//   recovery never exceeds the outstanding overpayment.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OPS = "user-ph24a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OPS,
    actorUserId: OPS,
    permissions: ["*"],
    roles: ["pension_ops"],
    fieldGrants: ["*"],
    correlationId: "corr-ph24a",
    ...extra,
  };
}

test("G11 death detection: reconciliation marks DECEASED and suspends disbursement", async () => {
  const s = createFoundationServices();
  const vital = s.deathRecovery.reconcileDeath(actor(), { pensionerId: ph03Ids.employee, dateOfDeath: "2026-05-20" });
  assert.equal(vital.status, "DECEASED");
  assert.equal(vital.disbursementSuspended, true);
});

test("G11 overpayment_recoveries: recovery is bounded and closes when fully recovered", async () => {
  const s = createFoundationServices();
  s.deathRecovery.reconcileDeath(actor(), { pensionerId: ph03Ids.employee, dateOfDeath: "2026-05-20" });
  const rec = s.deathRecovery.openOverpaymentRecovery(actor(), { pensionerId: ph03Ids.employee, overpaidPaise: 50_000_00, recoverFrom: "FAMILY_PENSION_ARREARS" });
  const partial = s.deathRecovery.recordRecovery(actor(), rec.id, { amountPaise: 30_000_00 });
  assert.equal(partial.status, "PARTIALLY_RECOVERED");
  // Over-recovery beyond the outstanding 20,00,000 paise is barred.
  assert.throws(
    () => s.deathRecovery.recordRecovery(actor(), rec.id, { amountPaise: 25_000_00 }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
  const closed = s.deathRecovery.recordRecovery(actor(), rec.id, { amountPaise: 20_000_00 });
  assert.equal(closed.status, "CLOSED");
});

test("G11 overpayment_recoveries: cannot open a recovery for a living pensioner", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.deathRecovery.openOverpaymentRecovery(actor(), { pensionerId: "still-alive", overpaidPaise: 100, recoverFrom: "ESTATE" }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
