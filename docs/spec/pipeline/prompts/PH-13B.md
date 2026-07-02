/goal
  objective: Complete PH-13B - create the release-candidate evidence seal and checksum verifier.
  context:
    - docs/release/release-board-dossier.md
    - docs/release/human-approval-checklist.md
    - docs/spec/ph-12-verdict.md
    - docs/release/release-candidate-manifest.md
    - docs/release/evidence-checksum-manifest.json
  constraints:
    - Do not mutate sealed source artifacts after calculating checksums.
    - Do not imply human approval from checksum verification.
  freedom:
    - Add release-candidate manifest, checksum manifest, verifier script, and tests.
  evidence_required:
    - docs/release/release-candidate-manifest.md
    - docs/release/evidence-checksum-manifest.json
    - ops/verify-release-candidate-seal.sh
    - apps/api/test/ph13-release-candidate-seal.test.cjs
    - `bash docs/spec/pipeline/checks/ph-13b.sh` GREEN
  escalate_when:
    - A sealed artifact changes after the checksum manifest is created.

