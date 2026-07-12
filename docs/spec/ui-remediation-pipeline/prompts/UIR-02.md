/goal
  objective: Create deterministic synthetic personas, workspace fixtures, canonical-state controls, authorization-negative cases, and a blocking-gate acceptance matrix.
  context:
    - docs/spec/ui-remediation/**
    - apps/web/src/api/fixtureHrmsClient.ts
    - apps/web/src/app/session.ts
    - docs/contracts/auth-matrix.yaml
  constraints:
    - Synthetic data only; never copy real PII.
    - Test controls must be impossible to activate in production builds.
    - Do not alter production authorization behavior.
  freedom:
    - Choose deterministic fixture IDs and test-only adapter boundaries.
  work_loops:
    - name: Fixture matrix
      max_iterations: 3
      repeat_until: Employee, Manager, Admin, denied, state, stale-cache, and deep-link cases reproduce deterministically.
      steps: [author fixtures, add fixture tests, verify production exclusion]
    - name: Acceptance mapping
      max_iterations: 3
      repeat_until: All 16 blocking gates and UI-01 through UI-28 map to observable evidence.
      steps: [author matrix, link ledger, validate coverage]
  evidence_required:
    - apps/web/test/fixtures/ui-personas.ts
    - apps/web/test/fixtures/ui-workspaces.ts
    - apps/web/test/fixtures/ui-state-controls.ts
    - docs/spec/ui-remediation/gate-acceptance-matrix.yaml
    - docs/spec/ui-remediation/authorization-negative-matrix.yaml
  escalate_when:
    - A scenario requires undefined production semantics rather than a test fixture.

