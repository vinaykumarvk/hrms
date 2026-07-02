/goal
  objective: Complete PH-12C - prepare target-environment readiness dry-run evidence and a non-mutating smoke script.
  context:
    - docs/release/target-environment-readiness.md
    - docs/release/environment-evidence-manifest.md
    - ops/target-environment-readiness-check.sh
  constraints:
    - The script must default to dry-run and must not require production credentials.
    - No production mutation, deployment, migration, or live endpoint calls.
    - Target-environment execution remains a human-controlled post-approval activity.
  freedom:
    - Add dry-run readiness docs and a local verification script.
  evidence_required:
    - docs/release/target-environment-readiness.md
    - docs/release/environment-evidence-manifest.md
    - ops/target-environment-readiness-check.sh
    - `bash docs/spec/pipeline/checks/ph-12c.sh` GREEN
  escalate_when:
    - A check requires production credentials, live infrastructure, or destructive operations.

