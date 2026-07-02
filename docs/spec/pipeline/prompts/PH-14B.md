/goal
  objective: Complete PH-14B - create post-seal drift-watch evidence, drift report, checker, and tests.
  context:
    - docs/release/evidence-checksum-manifest.json
    - docs/release/release-candidate-manifest.md
    - ops/verify-release-candidate-seal.sh
  constraints:
    - Do not alter sealed artifacts.
    - Drift check must fail closed on checksum mismatch.
  freedom:
    - Add drift-watch docs, report, checker script, and governance tests.
  evidence_required:
    - docs/release/release-candidate-drift-watch.md
    - docs/release/post-seal-drift-report.md
    - ops/check-release-candidate-drift.sh
    - apps/api/test/ph14-post-seal-drift-watch.test.cjs
    - `bash docs/spec/pipeline/checks/ph-14b.sh` GREEN
  escalate_when:
    - The PH-13 checksum seal no longer verifies.

