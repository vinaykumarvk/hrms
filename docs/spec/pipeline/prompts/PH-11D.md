/goal
  objective: Complete PH-11D - prepare operational handoff, RACI, incident, hypercare, and SLA evidence.
  context:
    - docs/release/hypercare-plan.md
    - docs/release/support-handoff.md
    - docs/release/operational-raci.md
  constraints:
    - Support handoff is readiness evidence, not live operations acceptance.
    - Every operational task must have owner/date.
  freedom:
    - Add operational readiness documents and tests.
  evidence_required:
    - docs/release/hypercare-plan.md
    - docs/release/support-handoff.md
    - docs/release/operational-raci.md
    - `bash docs/spec/pipeline/checks/ph-11d.sh` GREEN
  escalate_when:
    - Operations acceptance requires a human support owner sign-off.
