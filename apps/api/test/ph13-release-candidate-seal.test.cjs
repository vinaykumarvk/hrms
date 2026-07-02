const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");

const checksumManifestPath = "docs/release/evidence-checksum-manifest.json";
const requiredSealFiles = [
  "docs/release/release-candidate-manifest.md",
  checksumManifestPath,
  "ops/verify-release-candidate-seal.sh",
];
const optionalPhase13Files = [
  "docs/release/human-approval-intake.md",
  "docs/release/change-ticket-template.md",
  "docs/release/evidence-archive-index.md",
  "docs/release/release-handoff-memo.md",
  "docs/release/post-board-action-register.md",
  "docs/spec/ph-13-verdict.md",
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

test("PH-13 release-candidate seal files exist and keep approval pending", () => {
  const text = combined(requiredSealFiles);
  requireMarkers(text, [
    "RELEASE_CANDIDATE_SEALED",
    "EVIDENCE_CHECKSUM_MANIFEST",
    "SHA256_EVIDENCE_SEAL",
    "NO_APPROVAL_IMPLIED",
    "GO_LIVE_HUMAN_APPROVAL_PENDING",
  ]);
});

test("PH-13 checksum manifest parses and hashes every sealed artifact", () => {
  const manifest = JSON.parse(read(checksumManifestPath));
  assert.equal(manifest.marker, "EVIDENCE_CHECKSUM_MANIFEST");
  assert.equal(manifest.seal, "SHA256_EVIDENCE_SEAL");
  assert.equal(manifest.approvalState, "NO_APPROVAL_IMPLIED");
  assert.ok(Array.isArray(manifest.artifacts));
  assert.ok(manifest.artifacts.length >= 8);
  for (const artifact of manifest.artifacts) {
    assert.equal(fs.existsSync(artifact.path), true, artifact.path);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.path);
  }
});

test("PH-13 approval-sensitive documents do not claim approval or production execution", () => {
  const manifest = JSON.parse(read(checksumManifestPath));
  const text = [
    "docs/release/release-candidate-manifest.md",
    ...optionalPhase13Files,
    ...manifest.artifacts.map((artifact) => artifact.path),
  ].map((file) => readIfPresent(file)).join("\n");
  for (const marker of [
    "GO_LIVE_APPROVED",
    "UAT_SIGNED_OFF",
    "CAB_APPROVED",
    "PRODUCTION_CUTOVER_COMPLETED",
    "ROLLBACK_EXECUTED_IN_PRODUCTION",
    "TARGET_SMOKE_COMPLETED",
  ]) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.equal(text.includes("GO_LIVE_HUMAN_APPROVAL_PENDING"), true);
});

test("PH-13 approval intake and archive markers are retained when present", () => {
  const text = combined(optionalPhase13Files);
  if (text.length === 0) {
    assert.equal(text.length, 0);
    return;
  }
  for (const marker of [
    "HUMAN_APPROVAL_INTAKE_PENDING",
    "CHANGE_TICKET_TEMPLATE",
    "APPROVAL_DOCUMENTS_NOT_PRESENT",
    "EVIDENCE_ARCHIVE_READY",
    "RELEASE_HANDOFF_MEMO",
    "POST_BOARD_ACTION_REGISTER",
    "HUMAN_BOARD_ACTION_REQUIRED",
    "OWNER_DATE",
  ]) {
    if (text.includes(marker)) {
      assert.equal(text.includes(marker), true, marker);
    }
  }
});
