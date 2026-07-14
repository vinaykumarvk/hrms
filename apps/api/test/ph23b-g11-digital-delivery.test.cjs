// PH-23B — G11 DigiLocker / DBT delivery (FR-24).
//   digital_deliveries push a pension artefact to DIGILOCKER and track the DBT credit status;
//   delivery runs QUEUED -> DELIVERED, retryable failures re-queue up to a cap, and a permanent
//   failure dead-letters.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const OPS = "user-ph23b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: OPS,
    actorUserId: OPS,
    permissions: ["*"],
    roles: ["pension_ops"],
    fieldGrants: ["*"],
    correlationId: "corr-ph23b",
    ...extra,
  };
}

test("G11 digital_deliveries: DigiLocker delivery succeeds and DBT status advances to CREDITED", async () => {
  const s = createFoundationServices();
  const d = s.digitalDelivery.queueDelivery(actor(), { pensionerId: ph03Ids.employee, artefactRef: "PPO-2026-1", channel: "DIGILOCKER" });
  assert.equal(d.status, "QUEUED");
  const delivered = s.digitalDelivery.attemptDelivery(actor(), d.id, { success: true });
  assert.equal(delivered.status, "DELIVERED");
  const credited = s.digitalDelivery.updateDbtStatus(actor(), d.id, { dbtStatus: "CREDITED" });
  assert.equal(credited.dbtStatus, "CREDITED");
});

test("G11 digital_deliveries: retryable failures re-queue up to the cap then dead-letter", async () => {
  const s = createFoundationServices();
  const d = s.digitalDelivery.queueDelivery(actor(), { pensionerId: ph03Ids.employee, artefactRef: "PPO-2026-2", channel: "DIGILOCKER", maxAttempts: 2 });
  const r1 = s.digitalDelivery.attemptDelivery(actor(), d.id, { success: false });
  assert.equal(r1.status, "QUEUED"); // attempt 1 -> re-queued
  const r2 = s.digitalDelivery.attemptDelivery(actor(), d.id, { success: false });
  assert.equal(r2.status, "DEAD_LETTER"); // attempt 2 hits the cap
  // A dead-lettered delivery cannot be silently completed.
  assert.throws(
    () => s.digitalDelivery.attemptDelivery(actor(), d.id, { success: true }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});

test("G11 digital_deliveries: a permanent failure dead-letters immediately", async () => {
  const s = createFoundationServices();
  const d = s.digitalDelivery.queueDelivery(actor(), { pensionerId: ph03Ids.employee, artefactRef: "PPO-2026-3", channel: "DIGILOCKER" });
  const dead = s.digitalDelivery.attemptDelivery(actor(), d.id, { success: false, permanent: true, error: "ACCOUNT_NOT_LINKED" });
  assert.equal(dead.status, "DEAD_LETTER");
});
