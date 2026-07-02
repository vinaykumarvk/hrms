/goal
  objective: Complete PH-14E - add PH-14 verdict, manifest evidence, state files, and full regression checks.
  context:
    - docs/spec/ph-14-post-seal-drift-watch-plan.md
    - docs/spec/manifest.json
    - docs/spec/ph-14-verdict.md
  constraints:
    - Do not claim release approved.
    - Keep final status as post-seal drift watch green and human approvals pending.
  freedom:
    - Add verdict, manifest evidence, state markers, and run full checks.
  evidence_required:
    - docs/spec/ph-14-verdict.md
    - docs/spec/manifest.json records PH-14 and PH-14A..PH-14E
    - `bash docs/spec/pipeline/checks/ph-14e.sh` GREEN
  escalate_when:
    - Full regression fails or the PH-13 seal no longer verifies.

