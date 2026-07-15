const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-06 every navigation destination has route workspace icon and permission", () => {
  const nav = read("apps/web/src/app/navigation.ts");
  const routes = read("apps/web/src/App.tsx");
  const destinations = [...nav.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(destinations.length, 24);
  for (const destination of destinations) assert.ok(routes.includes(`case "${destination}"`), destination);
  assert.equal((nav.match(/workspace: "/g) ?? []).length, 24);
  assert.equal((nav.match(/icon: "/g) ?? []).length, 24);
});

test("UIR-06 shell has accessible mobile disclosure and active navigation", () => {
  const shell = read("apps/web/src/app/AppShell.tsx");
  for (const marker of ["aria-expanded", 'aria-label="Open navigation menu"', "<Drawer", 'aria-current={item.href === activePath', 'aria-label="Main navigation"']) assert.ok(shell.includes(marker), marker);
});

test("UIR-06 login blocks double submit clears errors and has no unsupported reset control", () => {
  const login = read("apps/web/src/app/LoginPanel.tsx");
  for (const marker of ["if (submitting) return", "disabled={submitting}", "Signing in…", "setRejected(false)", "aria-describedby", "aria-invalid"]) assert.ok(login.includes(marker), marker);
  assert.doesNotMatch(login, /Forgot password/);
});

test("UIR-06 terminal workflow and payroll actions have explicit dialogs", () => {
  const workflow = read("apps/web/src/workflow/TaskActionPanel.tsx");
  const config = read("apps/web/src/workflow/WorkflowConfigConsole.tsx");
  const payroll = read("apps/web/src/modules/g10/PayrollRunConsole.tsx");
  assert.match(workflow, /Cancel this workflow/);
  assert.match(config, /Publish workflow configuration/);
  assert.match(config, /exportEvidence/);
  assert.match(payroll, /Confirm payroll lifecycle action/);
  assert.match(payroll, /\["lock-inputs", "lock", "disburse"\]/);
});

