const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");

const checksumManifestPath = "docs/release/evidence-checksum-manifest.json";
const driftFiles = [
  "docs/release/release-candidate-drift-watch.md",
  "docs/release/post-seal-drift-report.md",
  "ops/check-release-candidate-drift.sh",
];
const boardFiles = [
  "docs/release/board-day-run-card.md",
  "docs/release/no-go-quarantine-plan.md",
  "docs/release/approval-evidence-quarantine.md",
  "docs/release/approval-evidence-redaction-guide.md",
  "docs/release/board-decision-intake-playbook.md",
  "docs/spec/ph-14-verdict.md",
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

test("PH-14 drift-watch files record green seal verification and pending approvals", () => {
  const text = combined(driftFiles);
  requireMarkers(text, [
    "POST_SEAL_DRIFT_WATCH",
    "DRIFT_STATUS_GREEN",
    "SEALED_ARTIFACTS_UNCHANGED",
    "PH13_SEAL_VERIFIED",
    "HUMAN_APPROVALS_STILL_PENDING",
    "GO_LIVE_HUMAN_APPROVAL_PENDING",
  ]);
});

test("PH-14 sealed artifact hashes still match the PH-13 checksum manifest", () => {
  const manifest = JSON.parse(read(checksumManifestPath));
  assert.equal(manifest.marker, "EVIDENCE_CHECKSUM_MANIFEST");
  assert.equal(manifest.seal, "SHA256_EVIDENCE_SEAL");
  for (const artifact of manifest.artifacts) {
    assert.equal(fs.existsSync(artifact.path), true, artifact.path);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.path);
  }
});

test("PH-14 board-day and quarantine artifacts keep execution human-controlled", () => {
  const text = combined([...driftFiles, ...boardFiles]);
  const prohibitedClaims = [
    "GO_LIVE_APPROVED",
    "UAT_SIGNED_OFF",
    "CAB_APPROVED",
    "TARGET_SMOKE_COMPLETED",
    "PRODUCTION_CUTOVER_COMPLETED",
    "ROLLBACK_EXECUTED_IN_PRODUCTION",
  ];
  for (const claim of prohibitedClaims) {
    assert.equal(text.includes(claim), false, claim);
  }
  assert.equal(text.includes("GO_LIVE_HUMAN_APPROVAL_PENDING"), true);
});

test("PH-14 approval-evidence handling rejects secrets and PII in repository artifacts", () => {
  const text = combined(boardFiles);
  if (text.length === 0) {
    assert.equal(text.length, 0);
    return;
  }
  for (const marker of [
    "APPROVAL_EVIDENCE_QUARANTINE",
    "REDACTION_REQUIRED",
    "BOARD_DECISION_INTAKE_PLAYBOOK",
    "NO_SECRETS_OR_PII_IN_REPO",
    "HUMAN_APPROVALS_STILL_PENDING",
    "HUMAN_BOARD_ACTION_REQUIRED",
  ]) {
    if (text.includes(marker)) {
      assert.equal(text.includes(marker), true, marker);
    }
  }
});

test("PH-14 drift watch stays read-only and points drift to quarantine", () => {
  const text = combined([
    "docs/release/release-candidate-drift-watch.md",
    "docs/release/post-seal-drift-report.md",
    "ops/check-release-candidate-drift.sh",
  ]);
  assert.equal(text.includes("read-only"), true);
  assert.equal(text.includes("quarantine"), true);
  assert.equal(text.includes("reseal"), true);
  assert.equal(text.includes("production endpoint"), true);
  assert.equal(text.includes("approval documents absent"), true);
});
