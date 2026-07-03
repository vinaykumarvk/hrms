// PH-22A — G08 DSC / non-repudiation signing (FR-20).
//   digital_signatures bind a SHA-256 payload hash + signer identity to an APAR action; the method
//   must be permitted by policy; a downstream action is gated on a valid signature.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const AA = "user-ph22a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: AA,
    actorUserId: AA,
    permissions: ["*"],
    roles: ["accepting_authority"],
    fieldGrants: ["*"],
    correlationId: "corr-ph22a",
    ...extra,
  };
}

test("G08 digital_signatures: certify is signed with a SHA-256 payload hash and gates the action", () => {
  const s = createFoundationServices();
  const form = "apar-form-ph22a";
  // Unsigned certify action is blocked.
  assert.throws(
    () => s.digitalSignature.assertSigned(actor(), form, "CERTIFY"),
    (err) => err.code === "PRECONDITION_FAILED"
  );
  const payload = { formId: form, finalGrade: "A", decidedBy: AA };
  const sig = s.digitalSignature.sign(actor(), { formId: form, actionType: "CERTIFY", method: "DSC", payload, certificateSerial: "DSC-SER-9", signedAt: "2026-07-03" });
  assert.equal(sig.payloadHash, createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"));
  assert.equal(sig.signerId, AA);
  const gate = s.digitalSignature.assertSigned(actor(), form, "CERTIFY");
  assert.equal(gate.method, "DSC");
});

test("G08 digital_signatures: a disallowed method and a DSC without a certificate serial are rejected", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.digitalSignature.sign(actor(), { formId: "f", actionType: "RATIFY", method: "SMS_OTP", payload: {}, signedAt: "2026-07-03" }),
    (err) => err.code === "VALIDATION_FAILED"
  );
  assert.throws(
    () => s.digitalSignature.sign(actor(), { formId: "f", actionType: "RATIFY", method: "DSC", payload: {}, signedAt: "2026-07-03" }),
    (err) => err.code === "VALIDATION_FAILED"
  );
});
