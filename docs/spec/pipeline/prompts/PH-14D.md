/goal
  objective: Complete PH-14D - prepare approval-evidence quarantine, redaction guide, and board-decision intake playbook.
  context:
    - docs/release/approval-evidence-quarantine.md
    - docs/release/approval-evidence-redaction-guide.md
    - docs/release/board-decision-intake-playbook.md
  constraints:
    - Do not receive real approval evidence in this phase.
    - Do not store secrets, credentials, or unredacted PII in the repository.
  freedom:
    - Add approval-evidence handling artifacts plus tests.
  evidence_required:
    - docs/release/approval-evidence-quarantine.md
    - docs/release/approval-evidence-redaction-guide.md
    - docs/release/board-decision-intake-playbook.md
    - `bash docs/spec/pipeline/checks/ph-14d.sh` GREEN
  escalate_when:
    - Real approval evidence or sensitive data is supplied.

