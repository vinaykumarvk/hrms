/goal
  objective: Complete PH-12E - add PH-12 verdict, manifest evidence, state files, and full regression checks.
  context:
    - docs/spec/ph-12-release-board-readiness-plan.md
    - docs/spec/manifest.json
    - docs/spec/ph-12-verdict.md
  constraints:
    - Do not claim release approved.
    - Keep final status as release-board ready and human approval pending.
  freedom:
    - Add verdict, manifest evidence, state markers, and run full checks.
  evidence_required:
    - docs/spec/ph-12-verdict.md
    - docs/spec/manifest.json records PH-12 and PH-12A..PH-12E
    - `bash docs/spec/pipeline/checks/ph-12e.sh` GREEN
  escalate_when:
    - Full regression fails or a human approval is requested as an agent action.

