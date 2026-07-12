const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");

const root = path.resolve(__dirname, "../../..");
const fixtureDir = path.join(root, "apps/web/test/fixtures");
const source = (name) => fs.readFileSync(path.join(fixtureDir, name), "utf8");

function evaluate(name, exports = {}) {
  let text = source(name).replace(/^import[^;]+;\s*/gm, "");
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports };
  Function("module", "exports", js)(module, module.exports);
  return module.exports;
}

test("UIR-02 defines deterministic Employee Manager Admin and denied personas", () => {
  const { UI_PERSONAS } = evaluate("ui-personas.ts");
  assert.deepEqual(Object.keys(UI_PERSONAS), ["employee", "manager", "admin", "denied_user"]);
  assert.deepEqual(UI_PERSONAS.denied_user.permissions, ["workspace.me"]);
  assert.ok(!UI_PERSONAS.employee.permissions.includes("workspace.admin"));
  assert.ok(UI_PERSONAS.admin.permissions.includes("p01.workflow.config.review"));
});

test("UIR-02 workspace record ids are non-overlapping", () => {
  const { UI_WORKSPACE_FIXTURES } = evaluate("ui-workspaces.ts");
  const ids = UI_WORKSPACE_FIXTURES.flatMap((fixture) => fixture.recordIds);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(new Set(UI_WORKSPACE_FIXTURES.map((fixture) => fixture.workspace)).size, 3);
});

test("UIR-02 exposes every canonical state behind a test-only runtime switch", () => {
  const { UI_STATE_CONTROLS, isUiTestRuntime } = evaluate("ui-state-controls.ts");
  assert.deepEqual(Object.keys(UI_STATE_CONTROLS), ["ready", "loading", "empty", "error", "no_permission", "partial_data", "session_expired"]);
  assert.equal(isUiTestRuntime({ NODE_ENV: "test", UI_TEST_FIXTURES: "enabled" }), true);
  assert.equal(isUiTestRuntime({ NODE_ENV: "production", UI_TEST_FIXTURES: "enabled" }), false);
});

test("UIR-02 fixture controls are not imported by production source", () => {
  const production = fs.readdirSync(path.join(root, "apps/web/src"), { recursive: true })
    .filter((name) => typeof name === "string" && /\.(ts|tsx)$/.test(name))
    .map((name) => fs.readFileSync(path.join(root, "apps/web/src", name), "utf8"))
    .join("\n");
  assert.doesNotMatch(production, /ui-state-controls|ui-personas|ui-workspaces/);
});

