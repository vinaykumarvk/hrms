#!/usr/bin/env bash
# PH-13 release-candidate checksum verifier. Read-only local evidence check.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

manifest="docs/release/evidence-checksum-manifest.json"

echo "== PH-13 release-candidate seal verification =="
echo "scope=SHA256_EVIDENCE_SEAL"
echo "approval=NO_APPROVAL_IMPLIED"

if [ ! -s "$manifest" ]; then
  echo "RED missing checksum manifest: $manifest"
  exit 1
fi

node <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");

const manifestPath = "docs/release/evidence-checksum-manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let failed = false;

function red(message) {
  console.log(`RED ${message}`);
  failed = true;
}

function grn(message) {
  console.log(`ok  ${message}`);
}

if (manifest.marker !== "EVIDENCE_CHECKSUM_MANIFEST") {
  red("invalid manifest marker");
}
if (manifest.seal !== "SHA256_EVIDENCE_SEAL") {
  red("invalid seal marker");
}
if (manifest.approvalState !== "NO_APPROVAL_IMPLIED") {
  red("invalid approval state");
}
if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 8) {
  red("too few sealed artifacts");
}

for (const artifact of manifest.artifacts || []) {
  if (!artifact.path || !artifact.sha256) {
    red(`invalid artifact entry: ${JSON.stringify(artifact)}`);
    continue;
  }
  if (!fs.existsSync(artifact.path)) {
    red(`missing artifact: ${artifact.path}`);
    continue;
  }
  const digest = crypto.createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex");
  if (digest !== artifact.sha256) {
    red(`hash mismatch: ${artifact.path}`);
  } else {
    grn(`hash verified: ${artifact.path}`);
  }
}

const prohibited = [
  "GO_LIVE_APPROVED",
  "UAT_SIGNED_OFF",
  "CAB_APPROVED",
  "PRODUCTION_CUTOVER_COMPLETED",
  "ROLLBACK_EXECUTED_IN_PRODUCTION",
];
const combined = (manifest.artifacts || [])
  .filter((artifact) => fs.existsSync(artifact.path))
  .map((artifact) => fs.readFileSync(artifact.path, "utf8"))
  .join("\n");
for (const marker of prohibited) {
  if (combined.includes(marker)) {
    red(`prohibited approval marker present: ${marker}`);
  }
}
if (!combined.includes("GO_LIVE_HUMAN_APPROVAL_PENDING")) {
  red("missing human approval pending marker");
}

if (failed) {
  process.exit(1);
}
console.log("PH13_RELEASE_CANDIDATE_SEAL_GREEN");
NODE

