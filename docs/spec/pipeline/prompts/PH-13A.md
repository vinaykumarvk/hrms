/goal
  objective: Complete PH-13A - freeze the release-candidate seal plan, pipeline wiring, and plan notes.
  context:
    - docs/spec/ph-13-release-candidate-seal-plan.md
    - docs/spec/phased-plan.yaml
    - docs/spec/pipeline/phases.yaml
    - docs/phased-plan.md
  constraints:
    - PH-13 is evidence sealing and approval intake, not go-live approval.
    - Keep UAT, CAB, go-live, cutover, production credentials, and rollback execution explicitly human-controlled.
  freedom:
    - Add PH-13 prompts, checks, plan documentation, phase entries, and plan notes.
  evidence_required:
    - docs/spec/ph-13-release-candidate-seal-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-13A..PH-13E
    - docs/spec/phased-plan.yaml includes PH-13
    - docs/phased-plan.md includes PH-13 implementation evidence note
    - `bash docs/spec/pipeline/checks/ph-13a.sh` GREEN
  escalate_when:
    - A requested step requires real UAT sign-off, production credentials, CAB approval, go-live approval, or rollback execution.

