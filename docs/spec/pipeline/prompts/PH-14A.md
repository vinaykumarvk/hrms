/goal
  objective: Complete PH-14A - freeze the post-seal drift-watch plan, pipeline wiring, and plan notes.
  context:
    - docs/spec/ph-14-post-seal-drift-watch-plan.md
    - docs/spec/phased-plan.yaml
    - docs/spec/pipeline/phases.yaml
    - docs/phased-plan.md
  constraints:
    - PH-14 is post-seal drift watch and board-day readiness, not approval or go-live.
    - Keep UAT, CAB, go-live, cutover, target smoke, production credentials, and rollback execution human-controlled.
  freedom:
    - Add PH-14 prompts, checks, plan documentation, phase entries, and plan notes.
  evidence_required:
    - docs/spec/ph-14-post-seal-drift-watch-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-14A..PH-14E
    - docs/spec/phased-plan.yaml includes PH-14
    - docs/phased-plan.md includes PH-14 implementation evidence note
    - `bash docs/spec/pipeline/checks/ph-14a.sh` GREEN
  escalate_when:
    - A requested step requires real approval, production credentials, target-environment smoke, cutover, or rollback execution.

