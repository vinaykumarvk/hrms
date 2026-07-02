/goal
  objective: Complete PH-11A - freeze the UAT and cutover governance rehearsal plan, pipeline wiring, and plan notes.
  context:
    - docs/spec/ph-11-uat-cutover-governance-plan.md
    - docs/spec/phased-plan.yaml
    - docs/spec/pipeline/phases.yaml
    - docs/phased-plan.md
  constraints:
    - PH-11 is not production cutover.
    - Keep all approvals explicitly pending.
    - Keep gates agentic only because each has an executable oracle.
  freedom:
    - Add PH-11 prompts, checks, plan documentation, phase entries, and plan notes.
  evidence_required:
    - docs/spec/ph-11-uat-cutover-governance-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-11A..PH-11E
    - docs/spec/phased-plan.yaml includes PH-11
    - docs/phased-plan.md includes PH-11 implementation evidence note
    - `bash docs/spec/pipeline/checks/ph-11a.sh` GREEN
  escalate_when:
    - A requested step requires real UAT, production credentials, or go-live approval.
