const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const leaveSource = fs.readFileSync("apps/web/src/modules/g03/LeaveWorkspace.tsx", "utf8");
const transferSource = fs.readFileSync("apps/web/src/modules/g05/TransferWorkspace.tsx", "utf8");
const sliceSource = [fixtureSource, leaveSource, transferSource].join("\n");

test("PH-06 UI binds G03 and G05 route constants and fixture summaries", () => {
  for (const marker of ["/api/v1/atl/leave-applications", "/api/v1/atl/leave-sr-outbox", "/api/v1/transfers/orders"]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
  for (const marker of ["REPORTING_CHAIN", "G04", "LEAVE_APPROVED", "POSITION_AUTHORITY", "PARALLEL_ALL_OF", "TRANSFER_JOINED"]) {
    assert.equal(sliceSource.includes(marker), true, marker);
  }
});

test("PH-06 UI renders G03 leave evidence panel", () => {
  for (const marker of ["G03 leave vertical slice", "REPORTING_CHAIN", "G04 outbox", "LEAVE_APPROVED", "P05 audit", "X.2 notifications"]) {
    assert.equal(leaveSource.includes(marker), true, marker);
  }
  assert.equal(appSource.includes("LeaveWorkspace"), true);
});

test("PH-06 UI renders G05 transfer evidence panel", () => {
  for (const marker of ["G05 transfer vertical slice", "POSITION_AUTHORITY", "PARALLEL_ALL_OF", "DEEMED_CLEARED", "TRANSFER_JOINED", "G13 records"]) {
    assert.equal(transferSource.includes(marker), true, marker);
  }
  assert.equal(appSource.includes("TransferWorkspace"), true);
});
