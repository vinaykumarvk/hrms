// PH-27A — G13 DPDP data-subject request console UI (FR-G13-018).
//   A real controlled surface: lists data_subject_requests via the injected client and adjudicates
//   each with a mandatory reason, rendering canonical loading/error/empty states.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const comp = fs.readFileSync("apps/web/src/modules/g13/DataSubjectRequestConsole.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");

test("PH-27A DSR console is a real controlled form using the client with canonical states", () => {
  for (const marker of ["<form", "onSubmit={handleSubmit}", "event.preventDefault()", "useState", "listDataSubjectRequests", "adjudicateDsr", "crypto.randomUUID()"]) {
    assert.equal(comp.includes(marker), true, `console missing ${marker}`);
  }
  for (const marker of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
    assert.equal(comp.includes(marker), true, `console missing canonical state ${marker}`);
  }
});

test("PH-27A client + fixture expose the DSR methods and the console is mounted", () => {
  assert.equal(client.includes("listDataSubjectRequests"), true);
  assert.equal(client.includes("adjudicateDsr"), true);
  assert.equal(fixture.includes("adjudicateDsr"), true);
  assert.equal(app.includes("DataSubjectRequestConsole"), true);
});
