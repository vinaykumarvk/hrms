// PH-24C — G12 offline-QR independent verification (FR-11).
//   A verification bundle (QR payload) binds the entry hash + anchor ref under a SHA-256 signature;
//   offline verification recomputes it from the published key and detects a tampered field WITHOUT
//   the live ledger.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const REG = "user-ph24c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: REG,
    actorUserId: REG,
    permissions: ["*"],
    roles: ["sr_custodian"],
    fieldGrants: ["*"],
    correlationId: "corr-ph24c",
    ...extra,
  };
}

test("G12 offline-QR: a genuine bundle verifies offline", async () => {
  const s = createFoundationServices();
  const bundle = s.offlineVerification.issueBundle(actor(), {
    subjectRef: "sr-event-991",
    entryHash: "a".repeat(64),
    anchorRef: "anchor-77",
    issuedAt: "2026-07-03",
  });
  const res = s.offlineVerification.verifyBundle(bundle);
  assert.equal(res.valid, true);
});

test("G12 offline-QR: a tampered bundle fails verification (no live ledger needed)", async () => {
  const s = createFoundationServices();
  const bundle = s.offlineVerification.issueBundle(actor(), {
    subjectRef: "sr-event-992",
    entryHash: "b".repeat(64),
    anchorRef: "anchor-88",
    issuedAt: "2026-07-03",
  });
  // Tamper with the entry hash while keeping the original signature.
  const tampered = { ...bundle, entryHash: "c".repeat(64) };
  const res = s.offlineVerification.verifyBundle(tampered);
  assert.equal(res.valid, false);
  assert.equal(res.reason, "SIGNATURE_MISMATCH");

  // Tampering the anchor ref also fails.
  const tampered2 = { ...bundle, anchorRef: "anchor-forged" };
  assert.equal(s.offlineVerification.verifyBundle(tampered2).valid, false);
});
