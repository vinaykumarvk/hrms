const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-05 approved Tailwind and shadcn-compatible configuration exists", () => {
  assert.match(read("tailwind.config.ts"), /apps\/web\/src/);
  assert.equal(JSON.parse(read("components.json")).tsx, true);
  assert.match(read("postcss.config.mjs"), /@tailwindcss\/postcss/);
});

test("UIR-05 primitive set covers interactive display overlay and feedback contracts", () => {
  for (const component of ["Button", "Input", "Select", "Field", "Alert", "Card", "Dialog", "Drawer", "Table", "Skeleton", "Notifications"]) {
    assert.ok(fs.existsSync(path.join(root, `apps/web/src/components/ui/${component}.tsx`)), component);
  }
  const button = read("apps/web/src/components/ui/Button.tsx");
  assert.match(button, /min-h-11/);
  assert.match(button, /focus-visible/);
  assert.match(button, /disabled/);
  assert.match(button, /loading/);
});

test("UIR-05 overlay primitives use Radix focus and dismissal semantics", () => {
  for (const component of ["Dialog", "Drawer"]) {
    const source = read(`apps/web/src/components/ui/${component}.tsx`);
    assert.match(source, /@radix-ui\/react-dialog/);
    assert.match(source, /DialogPrimitive\.Content/);
    assert.match(source, /DialogPrimitive\.Close/);
  }
});

test("UIR-05 tokens include focus contrast motion and semantic colors", () => {
  const tokens = read("apps/web/src/styles/tokens.css");
  for (const marker of ["--color-focus", "--color-danger", ":focus-visible", "prefers-reduced-motion", "@theme"]) {
    assert.match(tokens, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
