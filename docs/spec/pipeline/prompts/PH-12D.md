/goal
  objective: Complete PH-12D - prepare release-board agenda, go/no-go template, and rollback authorization template.
  context:
    - docs/release/release-board-agenda.md
    - docs/release/go-no-go-decision-record-template.md
    - docs/release/rollback-authorization-template.md
  constraints:
    - Templates may define approval fields, but must not pre-fill approval.
    - Rollback authority may be assigned, but rollback execution must remain human-controlled.
  freedom:
    - Add board-meeting and decision-record templates plus tests.
  evidence_required:
    - docs/release/release-board-agenda.md
    - docs/release/go-no-go-decision-record-template.md
    - docs/release/rollback-authorization-template.md
    - `bash docs/spec/pipeline/checks/ph-12d.sh` GREEN
  escalate_when:
    - The board decision is requested from the agent.

