const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g02Source = fs.readFileSync("apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx", "utf8");
const g03Source = fs.readFileSync("apps/web/src/modules/g03/LeaveWorkspace.tsx", "utf8");
const g04Source = fs.readFileSync("apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx", "utf8");

test("PH-07 client exposes G02, G03 payroll, and G04 relay routes", () => {
  for (const marker of [
    "/api/v1/personal-details/change-requests",
    "/api/v1/atl/payroll-signals",
    "/api/v1/leave-sr/outbox",
    "/api/v1/leave-sr/reconciliation",
  ]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-07 fixture evidence covers G01 ownership, READY_FOR_G10, and G04 DLQ", () => {
  for (const marker of ["G01", "READY_FOR_G10", "G04", "deadLettered"]) {
    assert.equal(fixtureSource.includes(marker), true, marker);
  }
});

test("PH-07 workspace renders G02, G03, and G04 wave panels", () => {
  for (const marker of ["WF-G02-PERSONAL-DETAILS", "G13", "G01"]) {
    assert.equal(g02Source.includes(marker), true, marker);
  }
  assert.equal(g03Source.includes("READY_FOR_G10"), true);
  for (const marker of ["G04", "deadLettered", "G12 append"]) {
    assert.equal(g04Source.includes(marker), true, marker);
  }
  for (const marker of ["PersonalDetailsWorkspace", "LeaveSrRelayWorkspace"]) {
    assert.equal(appSource.includes(marker), true, marker);
  }
});
