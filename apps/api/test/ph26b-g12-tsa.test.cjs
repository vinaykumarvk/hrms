// PH-26B — G12 RFC-3161 timestamp authority binding (FR-04).
//   LocalTimestampAuthority issues an RFC-3161-shaped timestamp token over a payload digest;
//   verifyTimestamp recomputes the digest + signature and returns false when the payload (and thus
//   the message imprint) was tampered.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const CUSTODIAN = "user-ph26b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: CUSTODIAN,
    actorUserId: CUSTODIAN,
    permissions: ["*"],
    roles: ["sr_custodian"],
    fieldGrants: ["*"],
    correlationId: "corr-ph26b",
    ...extra,
  };
}

test("G12 RFC-3161 TSA: a genuine payload verifies against its timestamp token", () => {
  const s = createFoundationServices();
  const payload = { merkleRoot: "abc123", anchorSeq: 7 };
  const issued = s.timestampAuthority.issueTimestamp(actor(), { payload });
  assert.ok(issued.token.length > 0);
  assert.equal(issued.authority, "urn:tsa:local:rfc3161");
  const res = s.timestampAuthority.verifyTimestamp(actor(), { payload, token: issued.token });
  assert.equal(res.valid, true);
});

test("G12 RFC-3161 TSA: a tampered payload fails verification (imprint mismatch)", () => {
  const s = createFoundationServices();
  const payload = { merkleRoot: "def456", anchorSeq: 8 };
  const issued = s.timestampAuthority.issueTimestamp(actor(), { payload });
  // Verify against a DIFFERENT payload -> the message imprint no longer matches.
  const res = s.timestampAuthority.verifyTimestamp(actor(), { payload: { merkleRoot: "forged", anchorSeq: 8 }, token: issued.token });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "IMPRINT_MISMATCH");
});
