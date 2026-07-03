// PH-34C — G01 privacy / DPDP console UI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comp = fs.readFileSync("apps/web/src/modules/g01/PrivacyConsole.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
test("PH-34C privacy console is a real controlled form using the client with canonical states", () => {
  for (const m of ["<form", "onSubmit={handleSubmit}", "event.preventDefault()", "useState", "listMyRightsRequests", "raiseRightsRequest", "crypto.randomUUID()"]) assert.equal(comp.includes(m), true, `missing ${m}`);
  for (const m of ['"loading"', '"error"', '"empty"', "OperationalState"]) assert.equal(comp.includes(m), true, `missing state ${m}`);
});
test("PH-34C client + fixture expose rights-request methods and the console is mounted", () => {
  assert.equal(client.includes("raiseRightsRequest"), true);
  assert.equal(fixture.includes("raiseRightsRequest"), true);
  assert.equal(app.includes("PrivacyConsole"), true);
});
