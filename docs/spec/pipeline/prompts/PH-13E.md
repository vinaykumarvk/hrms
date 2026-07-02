/goal
  objective: Complete PH-13E - add PH-13 verdict, manifest evidence, state files, and full regression checks.
  context:
    - docs/spec/ph-13-release-candidate-seal-plan.md
    - docs/spec/manifest.json
    - docs/spec/ph-13-verdict.md
  constraints:
    - Do not claim release approved.
    - Keep final status as release-candidate sealed and human approvals pending.
  freedom:
    - Add verdict, manifest evidence, state markers, and run full checks.
  evidence_required:
    - docs/spec/ph-13-verdict.md
    - docs/spec/manifest.json records PH-13 and PH-13A..PH-13E
    - `bash docs/spec/pipeline/checks/ph-13e.sh` GREEN
  escalate_when:
    - Full regression fails or human approval is requested as an agent action.

