/goal
  objective: Produce the complete integration evidence package and prepare, but do not self-approve, the human UI release decision.
  context:
    - docs/spec/ui-remediation/**
    - docs/evidence/ui-remediation/**
    - docs/reviews/ui-review-all-2026-07-11.md
    - docs/spec/ph-05-verdict.md
  constraints:
    - All 16 blocking gates must PASS; do not downgrade to PARTIAL.
    - No evidence claim without executed command/artifact.
    - Only the human release owner may record GO.
  freedom:
    - Choose efficient ordering for full regressions and evidence collation.
  work_loops:
    - name: Full validation
      max_iterations: 3
      repeat_until: Clean install, typecheck, build, API/web tests, PH-05E, journeys, denial, viewport, keyboard, and axe checks all pass.
      steps: [run full matrix, repair implementation-only gaps, rerun full matrix]
    - name: Release packet
      max_iterations: 2
      repeat_until: Ledger and evidence package are complete and independently checkable.
      steps: [collate evidence, update review/verdict, run external oracle]
  evidence_required:
    - docs/evidence/ui-remediation/final-command-log.md
    - docs/evidence/ui-remediation/screenshot-matrix/**
    - docs/evidence/ui-remediation/accessibility-summary.md
    - docs/evidence/ui-remediation/keyboard-traversal.md
    - docs/evidence/ui-remediation/authorization-negative-results.md
    - docs/release/ui-remediation-readiness.md
  escalate_when:
    - Any blocking gate remains RED after three bounded repair cycles.
    - Human release judgment is requested from the implementing agent.
