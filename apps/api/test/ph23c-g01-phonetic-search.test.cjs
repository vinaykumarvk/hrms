// PH-23C — G01 phonetic / transliteration search (FR-EPM-025).
//   A Soundex-style phonetic index (with transliteration normalisation) makes near-homophone names
//   match; a phonetic search returns all employees sharing the query's phonetic code.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const CLERK = "user-ph23c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: CLERK,
    actorUserId: CLERK,
    permissions: ["*"],
    roles: ["records_clerk"],
    fieldGrants: ["*"],
    correlationId: "corr-ph23c",
    ...extra,
  };
}

test("G01 phonetic search: near-homophone spellings match the same phonetic code", () => {
  const s = createFoundationServices();
  s.phoneticSearch.indexName(actor(), { employeeId: "emp-1", name: "Krishnan" });
  s.phoneticSearch.indexName(actor(), { employeeId: "emp-2", name: "Krishnnan" }); // doubled n
  s.phoneticSearch.indexName(actor(), { employeeId: "emp-3", name: "Sharma" }); // different sound

  const res = s.phoneticSearch.searchPhonetic(actor(), { query: "Krishnaan" }); // transliteration variant
  const ids = res.hits.map((h) => h.employeeId).sort();
  assert.deepEqual(ids, ["emp-1", "emp-2"]);
  assert.ok(!ids.includes("emp-3"));
});

test("G01 phonetic search: Smith and Smyth collapse to one phonetic code", () => {
  const s = createFoundationServices();
  s.phoneticSearch.indexName(actor(), { employeeId: "e-smith", name: "Smith" });
  s.phoneticSearch.indexName(actor(), { employeeId: "e-smyth", name: "Smyth" });
  const res = s.phoneticSearch.searchPhonetic(actor(), { query: "Smith" });
  assert.equal(res.hits.length, 2);
  // Transliteration/normalisation yields a stable code.
  assert.equal(s.phoneticSearch.computeCode(actor(), "Smyth"), res.phoneticCode);
});
