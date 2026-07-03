// PH-22B — G13 OCR + permission-aware search (FR-008).
//   ocr_index holds extracted text with a classification; search returns only documents at or below
//   the caller's clearance — over-classified (SECRET+) hits are excluded and never leak content.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const CLERK = "user-ph22b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: CLERK,
    actorUserId: CLERK,
    permissions: ["*"],
    roles: ["records_clerk"],
    fieldGrants: ["*"],
    correlationId: "corr-ph22b",
    ...extra,
  };
}

test("G13 ocr_index: permission-aware search excludes over-classified documents", () => {
  const s = createFoundationServices();
  s.ocrSearch.indexDocument(actor(), { documentId: "doc-pub", classification: "INTERNAL", text: "Annual transfer policy circular" });
  s.ocrSearch.indexDocument(actor(), { documentId: "doc-secret", classification: "SECRET", text: "Confidential transfer of the vigilance officer" });

  // A CONFIDENTIAL-cleared caller sees the INTERNAL doc but NOT the SECRET one.
  const res = s.ocrSearch.search(actor(), { query: "transfer", clearance: "CONFIDENTIAL" });
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].documentId, "doc-pub");
  assert.equal(res.excludedCount, 1);
  // The SECRET content never appears in the result payload.
  assert.ok(!JSON.stringify(res).includes("vigilance officer"));

  // A SECRET-cleared caller sees both.
  const res2 = s.ocrSearch.search(actor(), { query: "transfer", clearance: "SECRET" });
  assert.equal(res2.hits.length, 2);
  assert.equal(res2.excludedCount, 0);
});
