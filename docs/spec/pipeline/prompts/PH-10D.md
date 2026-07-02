/goal
  objective: Complete PH-10D - prepare release runbooks, rollback, coexistence, UAT, and evidence pack.
  context:
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - docs/release/**
    - ops/**
  constraints:
    - Do not mark production cutover or UAT sign-off as approved.
    - Every migration exception and residual risk must have owner/date fields.
    - Rollback guidance must preserve operational HRMS while disabling analytics if needed.
  freedom:
    - Add release documents and evidence tests.
  evidence_required:
    - docs/release/deployment-runbook.md
    - docs/release/rollback-plan.md
    - docs/release/coexistence-plan.md
    - docs/release/uat-scripts.md
    - docs/release/release-evidence-pack.md
    - apps/api/test/ph10-release-evidence.test.cjs
    - `bash docs/spec/pipeline/checks/ph-10d.sh` GREEN
  escalate_when:
    - The plan would require actual CAB/go-live approval rather than readiness evidence.
