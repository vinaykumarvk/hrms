const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-01 wraps the application in a safe error boundary", () => {
  const main = read("apps/web/src/main.tsx");
  const boundary = read("apps/web/src/app/ErrorBoundary.tsx");
  assert.match(main, /<ErrorBoundary(?:\s|>)/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /Reload application/);
  assert.doesNotMatch(boundary, /console\.(log|error)/);
});

test("UIR-01 removes the production operational-state gallery", () => {
  assert.doesNotMatch(read("apps/web/src/app/AppShell.tsx"), /StandardOperationalStates/);
});

test("UIR-01 uses dynamic viewport units and reduced-motion support", () => {
  const styles = read("apps/web/src/styles.css");
  assert.doesNotMatch(styles, /\b100vh\b/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("UIR-01 exposes password visibility state and direct aria-invalid semantics", () => {
  const login = read("apps/web/src/app/LoginPanel.tsx");
  const actions = read("apps/web/src/workflow/TaskActionPanel.tsx");
  assert.match(login, /aria-pressed=\{showPassword\}/);
  assert.match(login, /Hide password/);
  assert.match(actions, /aria-invalid=\{fieldError !== null\}/);
});
