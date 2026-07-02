/goal
  objective: Complete PH-12A - freeze the release-board readiness plan, pipeline wiring, and plan notes.
  context:
    - docs/spec/ph-12-release-board-readiness-plan.md
    - docs/spec/phased-plan.yaml
    - docs/spec/pipeline/phases.yaml
    - docs/phased-plan.md
  constraints:
    - PH-12 is release-board readiness, not go-live approval.
    - Keep UAT, CAB, go-live, cutover, and rollback execution explicitly human-controlled.
    - Use agentic gates only where executable checks exist.
  freedom:
    - Add PH-12 prompts, checks, plan documentation, phase entries, and plan notes.
  evidence_required:
    - docs/spec/ph-12-release-board-readiness-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-12A..PH-12E
    - docs/spec/phased-plan.yaml includes PH-12
    - docs/phased-plan.md includes PH-12 implementation evidence note
    - `bash docs/spec/pipeline/checks/ph-12a.sh` GREEN
  escalate_when:
    - A requested step requires real UAT sign-off, production credentials, CAB approval, go-live approval, or rollback execution.

