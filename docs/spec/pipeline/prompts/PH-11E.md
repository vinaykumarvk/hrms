/goal
  objective: Complete PH-11E - add PH-11 verdict, manifest evidence, state files, and full regression checks.
  context:
    - docs/spec/ph-11-uat-cutover-governance-plan.md
    - docs/spec/manifest.json
    - docs/spec/ph-11-verdict.md
  constraints:
    - Do not claim go-live approved.
    - Keep final status as governance rehearsal complete and human approval pending.
  freedom:
    - Add verdict, manifest evidence, state markers, and run full checks.
  evidence_required:
    - docs/spec/ph-11-verdict.md
    - docs/spec/manifest.json records PH-11 and PH-11A..PH-11E
    - `bash docs/spec/pipeline/checks/ph-11e.sh` GREEN
  escalate_when:
    - Full regression fails or human approval is requested as an agent action.
