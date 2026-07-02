/goal
  objective: Complete PH-11B - prepare UAT execution journal and defect triage evidence.
  context:
    - docs/release/uat-scripts.md
    - docs/release/uat-execution-journal.md
    - docs/release/uat-defect-triage.md
  constraints:
    - Do not mark UAT as signed off.
    - Every UAT outcome must be rehearsal or pending.
    - Every defect severity must have owner/date/decision path.
  freedom:
    - Add UAT governance docs and tests.
  evidence_required:
    - docs/release/uat-execution-journal.md
    - docs/release/uat-defect-triage.md
    - apps/api/test/ph11-uat-governance.test.cjs
    - `bash docs/spec/pipeline/checks/ph-11b.sh` GREEN
  escalate_when:
    - A UAT result requires business sign-off.
