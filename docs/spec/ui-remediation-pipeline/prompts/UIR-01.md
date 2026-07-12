/goal
  objective: Restore deterministic web verification and implement the approved design-neutral baseline repairs.
  context:
    - docs/spec/ui-remediation/**
    - package.json
    - apps/web/src/main.tsx
    - apps/web/src/app/AppShell.tsx
    - apps/web/src/app/LoginPanel.tsx
    - apps/web/src/workflow/TaskActionPanel.tsx
    - apps/web/src/styles.css
  constraints:
    - Preserve existing user changes and API/RBAC behavior.
    - No dependencies beyond UIR-00 approval.
    - Do not weaken tests or edit contracts.
  freedom:
    - Choose small reversible implementation structures within approved scope.
  work_loops:
    - name: Baseline repair
      max_iterations: 3
      repeat_until: Clean typecheck/build/tests and PH-05E no longer fail for missing tooling.
      steps: [repair approved dependency source, clean verification, record evidence]
    - name: Neutral fixes
      max_iterations: 3
      repeat_until: UIR-01 external oracle passes.
      steps: [write regression tests, implement boundary and static fixes, rerun checks]
  evidence_required:
    - apps/web/src/app/ErrorBoundary.tsx
    - apps/web/test/ui-remediation-baseline.test.cjs
    - docs/evidence/ui-remediation/baseline-command-log.md
  escalate_when:
    - Dependency resolution needs an unapproved source.
    - An existing oracle is incorrect rather than the implementation.

