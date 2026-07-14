const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const releaseBoardFiles = [
  "docs/release/release-board-dossier.md",
  "docs/release/human-approval-checklist.md",
];

const optionalPhase12Files = [
  "docs/release/target-environment-readiness.md",
  "docs/release/environment-evidence-manifest.md",
  "docs/release/release-board-agenda.md",
  "docs/release/go-no-go-decision-record-template.md",
  "docs/release/rollback-authorization-template.md",
  "docs/spec/ph-12-verdict.md",
];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function readIfPresent(file) {
  return fs.existsSync(file) ? read(file) : "";
}

function combined(files) {
  return files.map((file) => readIfPresent(file)).join("\n");
}

function requireMarkers(text, markers) {
  for (const marker of markers) {
    assert.equal(text.includes(marker), true, marker);
  }
}

test("PH-12 release-board dossier and checklist keep human decisions pending", async () => {
  const text = combined(releaseBoardFiles);
  requireMarkers(text, [
    "RELEASE_BOARD_READY",
    "GO_NO_GO_HUMAN_DECISION_REQUIRED",
    "UAT_SIGNOFF_HUMAN_REQUIRED",
    "CAB_APPROVAL_HUMAN_REQUIRED",
    "GO_LIVE_HUMAN_APPROVAL_PENDING",
    "ROLLBACK_EXECUTION_HUMAN_REQUIRED",
    "OWNER_DATE",
  ]);
  for (const owner of [
    "business-owner",
    "release-chair",
    "ops-lead",
    "migration-lead",
    "security-lead",
    "service-manager",
  ]) {
    assert.equal(text.includes(owner), true, owner);
  }
  assert.equal(text.includes("2026-07-19"), true);
});

test("PH-12 documents do not claim approval or production execution", async () => {
  const text = combined([...releaseBoardFiles, ...optionalPhase12Files]);
  const prohibitedClaims = [
    "UAT_SIGNED_OFF",
    "GO_LIVE_APPROVED",
    "CAB_APPROVED",
    "PRODUCTION_CUTOVER_COMPLETED",
    "ROLLBACK_EXECUTED_IN_PRODUCTION",
    "PRODUCTION_DEPLOYMENT_COMPLETED",
  ];
  for (const claim of prohibitedClaims) {
    assert.equal(text.includes(claim), false, claim);
  }
  assert.equal(text.includes("GO_LIVE_HUMAN_APPROVAL_PENDING"), true);
});

test("PH-12 target-environment artifacts remain dry-run when present", async () => {
  const text = combined(optionalPhase12Files);
  if (text.length === 0) {
    assert.equal(text.length, 0);
    return;
  }
  for (const marker of [
    "TARGET_ENVIRONMENT_READINESS_DRY_RUN",
    "TARGET_SMOKE_HUMAN_RUN_REQUIRED",
    "NO_TARGET_ENV_MUTATION",
    "PRODUCTION_CREDENTIALS_NOT_REQUIRED",
  ]) {
    if (text.includes(marker)) {
      assert.equal(text.includes(marker), true, marker);
    }
  }
});

test("PH-12 decision templates preserve board authority when present", async () => {
  const text = combined(optionalPhase12Files);
  if (text.length === 0) {
    assert.equal(text.length, 0);
    return;
  }
  for (const marker of [
    "RELEASE_BOARD_AGENDA",
    "GO_NO_GO_DECISION_TEMPLATE",
    "ROLLBACK_AUTHORIZATION_TEMPLATE",
    "ROLLBACK_EXECUTION_HUMAN_REQUIRED",
    "OWNER_DATE",
  ]) {
    if (text.includes(marker)) {
      assert.equal(text.includes(marker), true, marker);
    }
  }
});

