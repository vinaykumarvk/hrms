const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-07 all routed module destinations remain substantive", () => {
  const app = read("apps/web/src/App.tsx");
  for (let module = 1; module <= 14; module += 1) {
    const directory = path.join(root, `apps/web/src/modules/g${String(module).padStart(2, "0")}`);
    assert.ok(fs.existsSync(directory), directory);
    const source = fs.readdirSync(directory).filter((name) => name.endsWith(".tsx")).map((name) => fs.readFileSync(path.join(directory, name), "utf8")).join("\n");
    assert.match(source, /client|OperationalState|form|table|data-/i, `G${module} substance`);
  }
  assert.equal((app.match(/case "\/(me|team|admin)\//g) ?? []).length, 24);
});

test("UIR-07 shared form table target and overflow rules cover remaining raw module controls", () => {
  const styles = read("apps/web/src/styles.css");
  assert.match(styles, /button,[\s\S]*min-height: 2\.75rem/);
  assert.match(styles, /\.content-surface table[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.record-panel form/);
});

test("UIR-07 API requests have a bounded timeout and preserve caller signals", () => {
  const client = read("apps/web/src/api/hrmsClient.ts");
  assert.match(client, /requestTimeoutMs \?\? 15_000/);
  assert.match(client, /AbortSignal\.any\(\[init\.signal, timeoutSignal\]\)/);
});

test("UIR-07 has no skeleton user-facing components", () => {
  const app = read("apps/web/src/App.tsx");
  assert.doesNotMatch(app, /TODO|Coming soon|placeholder component/i);
});
