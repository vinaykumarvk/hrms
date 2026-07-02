/goal
  objective: Complete PH-13C - prepare human approval intake and change-ticket guardrails.
  context:
    - docs/release/human-approval-intake.md
    - docs/release/change-ticket-template.md
    - ops/validate-human-approval-intake.sh
  constraints:
    - Approval intake must remain pending.
    - Do not create approval tokens, credentials, go-live approvals, or target-environment execution records.
  freedom:
    - Add approval-intake documents and a local validator.
  evidence_required:
    - docs/release/human-approval-intake.md
    - docs/release/change-ticket-template.md
    - ops/validate-human-approval-intake.sh
    - `bash docs/spec/pipeline/checks/ph-13c.sh` GREEN
  escalate_when:
    - A user asks the agent to mark approval complete.

