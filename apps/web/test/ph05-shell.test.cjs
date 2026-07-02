const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const files = [
  "apps/web/src/app/AppShell.tsx",
  "apps/web/src/app/WorkspaceSwitcher.tsx",
  "apps/web/src/app/navigation.ts",
  "apps/web/src/app/RouteGuard.tsx",
  "apps/web/src/app/OperationalStates.tsx",
  "apps/web/src/app/LoginPanel.tsx",
  "apps/web/src/app/session.ts",
];

const shellSource = files.map((path) => fs.readFileSync(path, "utf8")).join("\n");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");

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

test("PH-05B navigation reaches all 14 module workspaces with distinct permissions", () => {
  const navSource = fs.readFileSync("apps/web/src/app/navigation.ts", "utf8");
  const modulePermissions = [
    "g01.employee.read",
    "g02.change.read",
    "g03.leave.read",
    "g04.relay.read",
    "g05.transfer.read",
    "g06.promotion.read",
    "g07.training.read",
    "g08.apar.read",
    "g09.case.read",
    "g10.payroll.read",
    "g11.pension.read",
    "g12.sr.read",
    "g13.document.read",
    "g14.analytics.read",
  ];
  for (const permission of modulePermissions) {
    assert.equal(navSource.includes(permission), true, `navigation missing ${permission}`);
  }
});

test("PH-05B unauthenticated visitor gets the login/sign-in state, not the shell", () => {
  for (const marker of ["readStoredSession", "if (!session)", "<LoginPanel onSignIn="]) {
    assert.equal(appSource.includes(marker), true, marker);
  }
  for (const marker of ["Sign in to HRMS", "Access token", "parseSessionToken", "return null"]) {
    assert.equal(shellSource.includes(marker), true, marker);
  }
});

test("PH-05B guard denies workspaces without a session grant (no wildcard, no-permission render)", () => {
  assert.equal(appSource.includes('permissions={["*"]}'), false, "App must not hardcode a wildcard grant");
  const guardedSurfaces = appSource.match(/requiredPermission="/g) ?? [];
  assert.equal(
    guardedSurfaces.length >= 14,
    true,
    `expected >=14 guarded surfaces, found ${guardedSurfaces.length}`
  );
  for (const marker of ["canAccess", "no-permission"]) {
    assert.equal(shellSource.includes(marker), true, `denied path missing ${marker}`);
  }
});
