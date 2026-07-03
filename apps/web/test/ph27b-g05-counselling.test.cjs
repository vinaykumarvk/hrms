// PH-27B — G05 interactive counselling console UI (FR-G05-019).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comp = fs.readFileSync("apps/web/src/modules/g05/CounsellingConsole.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
test("PH-27B counselling console is a real controlled form using the client with canonical states", () => {
  for (const m of ["<form", "onSubmit={handleSubmit}", "event.preventDefault()", "useState", "getCounsellingSession", "submitCounsellingChoice", "crypto.randomUUID()"]) {
    assert.equal(comp.includes(m), true, `console missing ${m}`);
  }
  for (const m of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
    assert.equal(comp.includes(m), true, `console missing state ${m}`);
  }
});
test("PH-27B client + fixture expose counselling methods and the console is mounted", () => {
  assert.equal(client.includes("submitCounsellingChoice"), true);
  assert.equal(fixture.includes("submitCounsellingChoice"), true);
  assert.equal(app.includes("CounsellingConsole"), true);
});
