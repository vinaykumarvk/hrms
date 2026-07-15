// PH-34B — G06 sealed-cover review UI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comp = fs.readFileSync("apps/web/src/modules/g06/SealedCoverReview.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
test("PH-34B sealed-cover review is a real controlled form using the client with canonical states", () => {
  for (const m of ["<form", "onSubmit={handleFormSubmit}", "useForm(", "useState", "listSealedCovers", "releaseSealedCover", "crypto.randomUUID()"]) assert.equal(comp.includes(m), true, `missing ${m}`);
  for (const m of ['"loading"', '"error"', '"empty"', "OperationalState"]) assert.equal(comp.includes(m), true, `missing state ${m}`);
});
test("PH-34B client + fixture expose sealed-cover methods and the console is mounted", () => {
  assert.equal(client.includes("releaseSealedCover"), true);
  assert.equal(fixture.includes("releaseSealedCover"), true);
  assert.equal(app.includes("SealedCoverReview"), true);
});
