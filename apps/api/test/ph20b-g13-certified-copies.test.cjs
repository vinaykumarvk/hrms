// PH-20B — G13 watermarking + certified true copies (FR-011).
//   certified_copies are issued only from an ACTIVE source; each carries a visible watermark stamp
//   and records the issuing authority; the rendering digest binds the watermark (tamper-evident).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const REGISTRAR = "user-ph20b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: REGISTRAR,
    actorUserId: REGISTRAR,
    permissions: ["*"],
    roles: ["records_registrar"],
    fieldGrants: ["*"],
    correlationId: "corr-ph20b",
    ...extra,
  };
}

test("G13 certified_copies: an ACTIVE source is certified with a watermark + issuing authority", async () => {
  const s = createFoundationServices();
  const copy = s.certifiedCopy.issueCertifiedCopy(actor(), {
    sourceDocumentId: "doc-service-book-1",
    sourceStatus: "ACTIVE",
    issuingAuthority: "Establishment Section",
    purpose: "Pension processing.",
    issuedAt: "2026-07-03",
  });
  assert.match(copy.watermarkText, /CERTIFIED TRUE COPY/);
  assert.equal(copy.issuingAuthority, "Establishment Section");
  assert.ok(copy.verificationCode && copy.renderingDigest.length === 64);
  assert.equal(s.certifiedCopy.listBySource(actor(), "doc-service-book-1").length, 1);
});

test("G13 certified_copies: a non-ACTIVE source cannot be certified", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.certifiedCopy.issueCertifiedCopy(actor(), {
      sourceDocumentId: "doc-disposed-9",
      sourceStatus: "DISPOSED",
      issuingAuthority: "Establishment Section",
      purpose: "x",
      issuedAt: "2026-07-03",
    }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
