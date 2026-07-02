/goal
  objective: Implement the CROSS-CUTTING INFRASTRUCTURE + MIGRATION STAGING for the foundation — X.1 jobs,
    X.2 notifications, X.3 integration boundaries, and read-only migration staging loaders + reconciliation
    reports (employee identity, SR history, documents, legacy workflow) that CANNOT mutate production — then
    prove the whole foundation passes RLS-isolation and security checks. This is the PH-03 gate before the module waves.
  context:
    - docs/spec/phased-plan.yaml , docs/spec/migration-coexistence-inventory.md , docs/spec/legacy-workflow-coexistence-map.yaml
    - apps/api/src/jobs , notifications , migration , security     # scaffold to complete
    - docs/contracts/auth-matrix.yaml , docs/contracts/error-taxonomy.yaml
  constraints:
    - Migration staging is READ-ONLY imports -> reconciliation reports; it MUST NOT bypass production validation, RLS, or audit.
    - Every foundation service enforces RLS tenant/entity isolation. No console.log; no stack traces/internal paths in errors;
      every endpoint explicitly public or protected; secrets only via env.
  work_loops:
    - name: X.1/X.2/X.3 + migration staging
      max_iterations: 6
      repeat_until: apps/api/src/jobs/**, notifications/**, migration/staging/** implement the job runner, notification
        dispatch, integration boundaries, and read-only staging loaders + reconciliation reports.
      steps: [implement X.1 runner, X.2 dispatch, X.3 boundary, staging loaders + reconciliation, no production writes]
    - name: RLS + security proof
      max_iterations: 4
      repeat_until: integration test proves RLS tenant isolation across foundation services and migration staging import
        -> reconciliation without mutating production; security checks pass — 0 production console.log, no stack traces in
        error responses, protected-endpoint coverage. With deps installed `npm test`/typecheck pass; else structural+security pass and noted.
      steps: [write RLS + migration + security tests, npm install if needed, typecheck, run tests, fix leaks]
    - name: PH-03 review packet
      max_iterations: 2
      repeat_until: docs/spec/ph-03-verdict.md maps every PH-03 generated_test + review_criterion to evidence with 0 gaps.
      steps: [assemble the trace + verdict, note residual risks]
  evidence_required:
    - apps/api/src/jobs/** , notifications/** , migration/staging/**
    - integration: RLS tenant isolation; migration staging -> reconciliation (no prod mutation); security: no stack traces / no console.log / protected endpoints
    - docs/spec/ph-03-verdict.md , docs/spec/manifest.json
  escalate_when:
    - Migration staging cannot be proven non-mutating of production.
    - RLS isolation cannot be demonstrated across the foundation services.
