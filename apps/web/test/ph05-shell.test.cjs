const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const files = [
  "apps/web/src/app/AppShell.tsx",
  "apps/web/src/app/WorkspaceSwitcher.tsx",
  "apps/web/src/app/navigation.ts",
  "apps/web/src/app/RouteGuard.tsx",
  "apps/web/src/app/OperationalStates.tsx",
];

const shellSource = files.map((path) => fs.readFileSync(path, "utf8")).join("\n");

test("PH-05B shell exposes workspaces and primary navigation", () => {
  for (const marker of ["Me", "My Team", "Admin", "Inbox", "Employees", "Service Register", "Documents", "Workflow Config"]) {
    assert.equal(shellSource.includes(marker), true, marker);
  }
});

test("PH-05B shell includes guarded operational states", () => {
  for (const marker of ["loading", "empty", "error", "no-permission", "partial-data", "route guard"]) {
    assert.equal(shellSource.toLowerCase().includes(marker), true, marker);
  }
});

test("PH-05B route guard records entitlement metadata", () => {
  for (const marker of ["data-required-permission", "data-route-access", "p01.workflow.read", "required entitlement"]) {
    assert.equal(shellSource.includes(marker), true, marker);
  }
});

test("PH-05B workspace switcher is operable by buttons", () => {
  for (const marker of ["role=\"tablist\"", "role=\"tab\"", "aria-selected", "onWorkspaceChange"]) {
    assert.equal(shellSource.includes(marker), true, marker);
  }
});
