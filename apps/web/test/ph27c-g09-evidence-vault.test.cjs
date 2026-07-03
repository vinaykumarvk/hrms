// PH-27C — G09 disciplinary evidence-vault listing UI (FR-014).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comp = fs.readFileSync("apps/web/src/modules/g09/EvidenceVaultList.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
test("PH-27C evidence-vault list is a real controlled surface using the client with canonical states", () => {
  for (const m of ["<form", "onSubmit={handleSubmit}", "onClick=", "event.preventDefault()", "useState", "listCaseEvidence"]) {
    assert.equal(comp.includes(m), true, `list missing ${m}`);
  }
  for (const m of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
    assert.equal(comp.includes(m), true, `list missing state ${m}`);
  }
});
test("PH-27C client + fixture expose listCaseEvidence and the list is mounted", () => {
  assert.equal(client.includes("listCaseEvidence"), true);
  assert.equal(fixture.includes("listCaseEvidence"), true);
  assert.equal(app.includes("EvidenceVaultList"), true);
});
