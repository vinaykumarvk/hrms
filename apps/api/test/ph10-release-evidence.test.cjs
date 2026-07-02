const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const releaseFiles = [
  "docs/release/deployment-runbook.md",
  "docs/release/rollback-plan.md",
  "docs/release/coexistence-plan.md",
  "docs/release/uat-scripts.md",
  "docs/release/release-evidence-pack.md",
];

function readAll() {
  return releaseFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
}

test("PH-10 release evidence pack includes runbook, rollback, coexistence, UAT, and traceability markers", () => {
  const combined = readAll();
  for (const marker of [
    "UAT_ACCEPTANCE_PACK",
    "CUTOVER_HUMAN_APPROVAL_REQUIRED",
    "ROLLBACK_PLAN",
    "REQUIREMENT_TRACEABILITY",
    "MIGRATION_EXCEPTION_OWNERS",
    "RISK_OWNER_DATE",
  ]) {
    assert.equal(combined.includes(marker), true, marker);
  }
});

test("PH-10 release evidence keeps production approval human-controlled", () => {
  const deployment = fs.readFileSync("docs/release/deployment-runbook.md", "utf8");
  const uat = fs.readFileSync("docs/release/uat-scripts.md", "utf8");
  assert.equal(deployment.includes("does not approve UAT, production cutover, or rollback execution"), true);
  assert.equal(uat.includes("They are not UAT sign-off"), true);
  assert.equal(deployment.includes("CUTOVER_HUMAN_APPROVAL_REQUIRED"), true);
});

test("PH-10 risks and migration exceptions have owner/date evidence", () => {
  const coexistence = fs.readFileSync("docs/release/coexistence-plan.md", "utf8");
  const evidence = fs.readFileSync("docs/release/release-evidence-pack.md", "utf8");
  for (const owner of ["workflow-lead", "legal-lead", "migration-lead", "release-lead", "ops-lead"]) {
    assert.equal(`${coexistence}\n${evidence}`.includes(owner), true, owner);
  }
  assert.equal(evidence.includes("2026-07-15"), true);
});

test("PH-10 release documents preserve operational data during rollback", () => {
  const rollback = fs.readFileSync("docs/release/rollback-plan.md", "utf8");
  assert.equal(rollback.includes("Do not delete Service Register rows"), true);
  assert.equal(rollback.includes("Do not unlock already locked payroll periods"), true);
  assert.equal(rollback.includes("Preserve audit/security audit logs"), true);
});
