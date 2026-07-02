const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const requiredFiles = [
  "apps/web/src/app/AppShell.tsx",
  "apps/web/src/app/WorkspaceSwitcher.tsx",
  "apps/web/src/app/RouteGuard.tsx",
  "apps/web/src/app/OperationalStates.tsx",
  "apps/web/src/workflow/Inbox.tsx",
  "apps/web/src/workflow/TaskDetail.tsx",
  "apps/web/src/workflow/TaskActionPanel.tsx",
  "apps/web/src/workflow/WorkflowConfigConsole.tsx",
  "apps/web/src/modules/g01/EmployeeProfile.tsx",
  "apps/web/src/modules/g12/ServiceRegisterTimeline.tsx",
  "apps/web/src/modules/g13/DocumentVaultView.tsx",
  "apps/web/src/api/hrmsClient.ts",
  "apps/web/src/api/fixtureHrmsClient.ts",
];

// PH-05E: every module workspace must implement the canonical loading/error/empty
// OperationalState branches (re-baselined after docs/reviews/brd-coverage-audit-20260702.md).
const moduleStateSurfaces = [
  "apps/web/src/modules/g01/EmployeeProfile.tsx",
  "apps/web/src/modules/g02/PersonalDetailsWorkspace.tsx",
  "apps/web/src/modules/g03/LeaveWorkspace.tsx",
  "apps/web/src/modules/g04/LeaveSrRelayWorkspace.tsx",
  "apps/web/src/modules/g05/TransferWorkspace.tsx",
  "apps/web/src/modules/g06/PromotionWorkspace.tsx",
  "apps/web/src/modules/g07/TrainingWorkspace.tsx",
  "apps/web/src/modules/g08/AparWorkspace.tsx",
  "apps/web/src/modules/g09/DisciplinaryWorkspace.tsx",
  "apps/web/src/modules/g10/PayrollWorkspace.tsx",
  "apps/web/src/modules/g11/PensionWorkspace.tsx",
  "apps/web/src/modules/g12/ServiceRegisterTimeline.tsx",
  "apps/web/src/modules/g13/DocumentVaultView.tsx",
  "apps/web/src/modules/g14/AnalyticsWorkspace.tsx",
];

const source = requiredFiles.map((path) => fs.readFileSync(path, "utf8")).join("\n");

test("PH-05E UI conformance maps every minimum surface to an implementation file", () => {
  for (const path of requiredFiles) {
    assert.equal(fs.existsSync(path), true, path);
  }
});

test("PH-05E UI conformance covers shell, workflow, and records domains", () => {
  for (const marker of ["Workspace", "Inbox", "Task detail", "Workflow Config", "profile-360", "Service Register", "Document Vault"]) {
    assert.equal(source.includes(marker), true, marker);
  }
});

test("PH-05E UI conformance covers permission, fixture, and accessibility evidence", () => {
  for (const marker of ["route guard", "fixture", "aria-label", "no-permission", "X-Correlation-Id", "Idempotency-Key"]) {
    assert.equal(source.includes(marker), true, marker);
  }
});

test("PH-05E every module workspace implements canonical loading/error/empty state branches", () => {
  for (const path of moduleStateSurfaces) {
    const moduleSource = fs.readFileSync(path, "utf8");
    for (const marker of ['kind === "loading"', 'kind === "error"', '"empty"', "OperationalState"]) {
      assert.equal(moduleSource.includes(marker), true, `${path} missing ${marker}`);
    }
  }
});

test("PH-05E every module workspace fetches through the injected API client", () => {
  const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
  for (const path of moduleStateSurfaces) {
    const moduleSource = fs.readFileSync(path, "utf8");
    assert.equal(moduleSource.includes("client: HrmsClient"), true, `${path} missing injected HrmsClient`);
  }
  const clientInjections = appSource.match(/client=\{client\}/g) ?? [];
  assert.equal(clientInjections.length >= 15, true, `expected >=15 client injections, found ${clientInjections.length}`);
});

test("PH-05E workflow inbox implements canonical loading/error/empty states", () => {
  const inboxSource =
    fs.readFileSync("apps/web/src/workflow/Inbox.tsx", "utf8") + fs.readFileSync("apps/web/src/workflow/inboxState.ts", "utf8");
  for (const marker of ['"loading"', '"error"', '"empty"']) {
    assert.equal(inboxSource.includes(marker), true, `workflow inbox missing ${marker}`);
  }
});
