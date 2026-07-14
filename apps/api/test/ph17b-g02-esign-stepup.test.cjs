// PH-17B — G02 strong e-signature + requester step-up (FR-015 / FR-023).
//   esignatures: apply/commit is gated on a valid strong e-signature (ERR-G02-ESIGN); each
//     signature binds a SHA-256 payloadHash into an append-only per-request hash-chain; a method
//     not permitted by policy fails ERR-G02-ESIGN-METHOD.
//   cr_step_up_events: a HIGH/STATUTORY self-service submission requires a completed step-up,
//     else ERR-G02-STEPUP.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const REQUESTER = "user-ph17b-requester";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: REQUESTER,
    actorUserId: REQUESTER,
    permissions: ["*"],
    roles: ["employee"],
    fieldGrants: ["*"],
    correlationId: "corr-ph17b",
    ...extra,
  };
}

test("G02 esignatures: commit fails ERR-G02-ESIGN until a valid signature exists; the chain binds SHA-256 payloadHash", async () => {
  const s = createFoundationServices();
  const cr = "cr-ph17b-1";
  // Unsigned commit is fail-closed.
  assert.throws(
    () => s.changeEsignStepUp.assertSignedForCommit(actor(), cr),
    (err) => err.code === "ERR-G02-ESIGN"
  );
  const payload = { field: "displayName", old: "A", new: "B" };
  const sig = s.changeEsignStepUp.signChange(actor(), { changeRequestId: cr, method: "DSC", payload, signedAt: "2026-07-03" });
  // payloadHash is the real SHA-256 of the serialized payload.
  assert.equal(sig.payloadHash, createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"));
  assert.equal(sig.prevHash, "0".repeat(64));
  // Now commit passes and chain integrity verifies.
  const head = s.changeEsignStepUp.assertSignedForCommit(actor(), cr);
  assert.equal(head.sequenceNo, 1);
});

test("G02 esignatures: a method outside policy fails ERR-G02-ESIGN-METHOD", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.changeEsignStepUp.signChange(actor(), { changeRequestId: "cr-ph17b-2", method: "SMS_OTP", payload: {}, signedAt: "2026-07-03" }),
    (err) => err.code === "ERR-G02-ESIGN-METHOD"
  );
});

test("G02 cr_step_up_events: a HIGH self-service submit requires a completed step-up (ERR-G02-STEPUP)", async () => {
  const s = createFoundationServices();
  const cr = "cr-ph17b-3";
  // No step-up yet -> blocked.
  assert.throws(
    () => s.changeEsignStepUp.assertStepUpForSubmission(actor(), { changeRequestId: cr, sensitivity: "HIGH" }),
    (err) => err.code === "ERR-G02-STEPUP"
  );
  // An expired verification is rejected too.
  const challenge = s.changeEsignStepUp.challengeStepUp(actor(), { changeRequestId: cr, issuedAt: "2026-07-03T10:00:00Z", expiresAt: "2026-07-03T10:05:00Z" });
  assert.throws(
    () => s.changeEsignStepUp.verifyStepUp(actor(), challenge.id, { verifiedAt: "2026-07-03T10:10:00Z" }),
    (err) => err.code === "ERR-G02-STEPUP"
  );
  // A fresh, in-window verification satisfies the gate.
  const c2 = s.changeEsignStepUp.challengeStepUp(actor(), { changeRequestId: cr, issuedAt: "2026-07-03T11:00:00Z", expiresAt: "2026-07-03T11:05:00Z" });
  s.changeEsignStepUp.verifyStepUp(actor(), c2.id, { verifiedAt: "2026-07-03T11:02:00Z" });
  assert.doesNotThrow(() => s.changeEsignStepUp.assertStepUpForSubmission(actor(), { changeRequestId: cr, sensitivity: "HIGH" }));
  // LOW never needs a step-up.
  assert.doesNotThrow(() => s.changeEsignStepUp.assertStepUpForSubmission(actor(), { changeRequestId: "cr-low", sensitivity: "LOW" }));
});
