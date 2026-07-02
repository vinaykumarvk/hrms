const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const packageSource = fs.readFileSync("package.json", "utf8");

test("PH-05A API client binds the PH-04 route families", () => {
  for (const marker of [
    "/api/v1/workflow/tasks",
    "/api/v1/employees",
    "/api/v1/sr/ingest",
    "/api/v1/documents",
    "X-Correlation-Id",
    "Idempotency-Key",
  ]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-05A fixture adapter mirrors the contract envelope shape", () => {
  assert.equal(fixtureSource.includes("fixture"), true);
  assert.equal(fixtureSource.includes("next_cursor"), true);
  assert.equal(fixtureSource.includes("semanticDuplicate"), true);
});

test("PH-05A root package exposes web verification scripts", () => {
  const packageJson = JSON.parse(packageSource);
  assert.equal(typeof packageJson.scripts["web:typecheck"], "string");
  assert.equal(typeof packageJson.scripts["web:build"], "string");
  assert.equal(typeof packageJson.scripts["web:test"], "string");
  assert.equal(typeof packageJson.scripts["web:check"], "string");
});
