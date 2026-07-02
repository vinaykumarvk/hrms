/goal
  objective: Complete PH-13D - prepare the evidence archive index, release handoff memo, and post-board action register.
  context:
    - docs/release/evidence-archive-index.md
    - docs/release/release-handoff-memo.md
    - docs/release/post-board-action-register.md
  constraints:
    - Handoff and archive documents are readiness artifacts only.
    - Every post-board action must have owner/date/status.
  freedom:
    - Add archive and handoff artifacts plus tests.
  evidence_required:
    - docs/release/evidence-archive-index.md
    - docs/release/release-handoff-memo.md
    - docs/release/post-board-action-register.md
    - `bash docs/spec/pipeline/checks/ph-13d.sh` GREEN
  escalate_when:
    - A board action requires human decision or external evidence.

