const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("UIR-04 existing workflow API contract covers list and supported task verbs", () => {
  const openapi = read("docs/contracts/openapi/P01-workflow.yaml");
  for (const route of ["/workflow/tasks:", "/workflow/tasks/{task_id}/claim:", "/workflow/tasks/{task_id}/approve:", "/workflow/tasks/{task_id}/reject:", "/workflow/tasks/{task_id}/delegate:"]) {
    assert.ok(openapi.includes(route), route);
  }
});

test("UIR-04 unsafe web-client operations preserve Idempotency-Key", () => {
  const client = read("apps/web/src/api/hrmsClient.ts");
  assert.match(client, /Idempotency-Key/);
  assert.match(client, /Authorization/);
  assert.match(client, /X-Correlation-Id/);
});

test("UIR-04 unsupported APIs remain absent and explicitly quarantined", () => {
  const decision = read("docs/spec/ui-remediation/uir-04-disposition.yaml");
  assert.match(decision, /complete_no_new_api_required/);
  assert.match(decision, /quarantine password reset/);
});
