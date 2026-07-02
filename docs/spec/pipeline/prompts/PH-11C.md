/goal
  objective: Complete PH-11C - prepare non-production cutover rehearsal and local release smoke.
  context:
    - docs/release/deployment-runbook.md
    - docs/release/rollback-plan.md
    - docs/release/cutover-control-board.md
    - ops/cutover-rehearsal-runbook.md
    - ops/local-release-smoke.sh
  constraints:
    - No production credentials, URLs, destructive DB operations, or real deployment.
    - Cutover approval remains pending.
    - Rollback authority is assigned but not exercised.
  freedom:
    - Add cutover control artifacts and a local smoke script.
  evidence_required:
    - ops/cutover-rehearsal-runbook.md
    - ops/local-release-smoke.sh
    - docs/release/cutover-control-board.md
    - `bash docs/spec/pipeline/checks/ph-11c.sh` GREEN
  escalate_when:
    - The rehearsal would need production infrastructure or destructive changes.
