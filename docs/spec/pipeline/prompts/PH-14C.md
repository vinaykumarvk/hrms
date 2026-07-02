/goal
  objective: Complete PH-14C - prepare board-day run card, no-go quarantine plan, and readiness checker.
  context:
    - docs/release/board-day-run-card.md
    - docs/release/no-go-quarantine-plan.md
    - ops/board-day-readiness-check.sh
  constraints:
    - Board-day materials are checklists only; they cannot approve or execute release.
    - No production credentials or live endpoint calls.
  freedom:
    - Add board-day readiness artifacts and local checker.
  evidence_required:
    - docs/release/board-day-run-card.md
    - docs/release/no-go-quarantine-plan.md
    - ops/board-day-readiness-check.sh
    - `bash docs/spec/pipeline/checks/ph-14c.sh` GREEN
  escalate_when:
    - A board-day step requires actual production execution.

