const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g10Source = fs.readFileSync("apps/web/src/modules/g10/PayrollWorkspace.tsx", "utf8");
const g11Source = fs.readFileSync("apps/web/src/modules/g11/PensionWorkspace.tsx", "utf8");

test("PH-09 client exposes compensation summary routes", () => {
  for (const marker of ["/api/v1/payroll/summary", "/api/v1/pension/summary"]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-09 fixture evidence covers payroll and pension controls", () => {
  for (const marker of [
    "PAYROLL_TRACE",
    "RULE_VERSION_SNAPSHOT",
    "INPUT_LOCKED",
    "BANK_X3_EXPORT",
    "LAST_PAY_DRAWN",
    "SR_VERIFICATION_GATE",
    "QUALIFYING_SERVICE_LOCKED",
    "PENSION_CALC_TRACE",
    "PPO_ISSUED",
    "G11_SR_POSTED",
  ]) {
    assert.equal(fixtureSource.includes(marker), true, marker);
  }
});

test("PH-09 workspace renders G10 and G11 compensation panels", () => {
  for (const marker of ["G10", "calculationMarker", "ruleSnapshotMarker", "inputLockMarker", "x3Marker", "lastPayMarker"]) {
    assert.equal(g10Source.includes(marker), true, marker);
  }
  for (const marker of ["G11", "serviceGateMarker", "qualifyingServiceMarker", "calculationMarker", "ppoMarker", "srMarker"]) {
    assert.equal(g11Source.includes(marker), true, marker);
  }
  for (const marker of ["PayrollWorkspace", "PensionWorkspace", 'case "/admin/payroll"', 'case "/admin/pension-retirement"']) {
    assert.equal(appSource.includes(marker), true, marker);
  }
});
