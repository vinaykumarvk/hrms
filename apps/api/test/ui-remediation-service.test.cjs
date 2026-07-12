const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-03 preserves server authorization as authoritative for workflow routes", () => {
  const routes = read("apps/api/src/routes/p01-workflow.routes.ts");
  assert.match(routes, /protected: true/);
  assert.match(routes, /permission: "p01\.workflow\.read"/);
  assert.match(routes, /context\.scope/);
});

test("UIR-03 does not invent password reset or server evidence-export semantics", () => {
  const decision = read("docs/spec/ui-remediation/auth-action-contract-decisions.md");
  assert.match(decision, /Password reset has no approved API contract/);
  assert.match(decision, /No server export endpoint is invented/);
  const routeSources = fs.readdirSync(path.join(root, "apps/api/src/routes"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => fs.readFileSync(path.join(root, "apps/api/src/routes", name), "utf8"))
    .join("\n");
  assert.doesNotMatch(routeSources, /\/api\/v1\/(password-reset|workflow\/evidence-export)/);
});

test("UIR-03 route/workspace contract explicitly keeps client state non-authoritative", () => {
  const contract = read("docs/spec/ui-remediation/route-workspace-contract.md");
  assert.match(contract, /presentation state only/);
  assert.match(contract, /RLS remain authoritative/);
  assert.match(contract, /must fail closed/);
});
