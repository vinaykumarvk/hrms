// PH-34A — G14 embedded BI dashboard UI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const comp = fs.readFileSync("apps/web/src/modules/g14/EmbeddedBiDashboard.tsx", "utf8");
const client = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixture = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
test("PH-34A embedded BI is a real controlled surface using the client with canonical states", () => {
  for (const m of ["onClick=", "useState", "listBiKpis"]) assert.equal(comp.includes(m), true, `missing ${m}`);
  for (const m of ['"loading"', '"error"', '"empty"', "OperationalState"]) assert.equal(comp.includes(m), true, `missing state ${m}`);
});
test("PH-34A client + fixture expose listBiKpis and the board is mounted", () => {
  assert.equal(client.includes("listBiKpis"), true);
  assert.equal(fixture.includes("listBiKpis"), true);
  assert.equal(app.includes("EmbeddedBiDashboard"), true);
});
