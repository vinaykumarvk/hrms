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
