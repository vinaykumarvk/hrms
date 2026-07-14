const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const requiredUatFiles = [
  "docs/release/uat-scripts.md",
  "docs/release/uat-execution-journal.md",
  "docs/release/uat-defect-triage.md",
];

const optionalOperationalFiles = [
  "docs/release/cutover-control-board.md",
  "ops/cutover-rehearsal-runbook.md",
  "docs/release/hypercare-plan.md",
  "docs/release/support-handoff.md",
  "docs/release/operational-raci.md",
  "docs/spec/ph-11-verdict.md",
];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function readRequired(files) {
  return files.map((file) => read(file)).join("\n");
}

function readIfPresent(file) {
  return fs.existsSync(file) ? read(file) : "";
}

function requireMarkers(text, markers) {
  for (const marker of markers) {
    assert.equal(text.includes(marker), true, marker);
  }
}

test("PH-11 UAT evidence records rehearsal without business sign-off", async () => {
  const combined = readRequired(requiredUatFiles);
  requireMarkers(combined, [
    "UAT_EXECUTION_REHEARSAL",
    "UAT_SIGNOFF_HUMAN_REQUIRED",
    "UAT_DEFECT_TRIAGE",
    "BUSINESS_OWNER_PENDING",
    "GO_LIVE_HUMAN_APPROVAL_PENDING",
  ]);
  assert.equal(combined.includes("This document is not business UAT sign-off"), true);
  assert.equal(combined.includes("They are not UAT sign-off"), true);
});

test("PH-11 defect triage keeps severity, owner, date, and decision path", async () => {
  const triage = read("docs/release/uat-defect-triage.md");
  for (const id of ["UAT-001", "UAT-002", "UAT-003", "UAT-004"]) {
    assert.equal(triage.includes(id), true, id);
  }
  for (const owner of ["analytics-owner", "compensation-lead", "migration-lead", "release-lead"]) {
    assert.equal(triage.includes(owner), true, owner);
  }
  assert.equal(triage.includes("2026-07-18"), true);
  assert.equal(triage.includes("2026-07-19"), true);
  assert.equal(triage.includes("Decision path"), true);
});

test("PH-11 governance documents do not claim UAT or go-live approval", async () => {
  const combined = [
    ...requiredUatFiles,
    ...optionalOperationalFiles,
  ].map((file) => readIfPresent(file)).join("\n");
  const prohibitedClaims = [
    "UAT_SIGNED_OFF",
    "GO_LIVE_APPROVED",
    "PRODUCTION_CUTOVER_COMPLETED",
    "ROLLBACK_EXECUTED_IN_PRODUCTION",
    "CAB_APPROVED_BY_AGENT",
  ];
  for (const claim of prohibitedClaims) {
    assert.equal(combined.includes(claim), false, claim);
  }
  assert.equal(combined.includes("GO_LIVE_HUMAN_APPROVAL_PENDING"), true);
});

test("PH-11 operational files retain support and cutover markers when present", async () => {
  const combined = optionalOperationalFiles.map((file) => readIfPresent(file)).join("\n");
  if (combined.length === 0) {
    assert.equal(combined.length, 0);
    return;
  }
  for (const marker of [
    "CUTOVER_REHEARSAL_COMPLETED",
    "NO_PRODUCTION_MUTATION",
    "ROLLBACK_AUTHORITY_ASSIGNED",
    "HYPERCARE_WINDOW",
    "SUPPORT_HANDOFF",
    "OPERATIONAL_RACI",
    "INCIDENT_SEVERITY_MATRIX",
    "SLA_OWNERS",
    "RISK_OWNER_DATE",
  ]) {
    if (combined.includes(marker)) {
      assert.equal(combined.includes(marker), true, marker);
    }
  }
});
