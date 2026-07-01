/goal
  objective: Add the platform's persistence, config governance, and resolver/hook SPIs — workflow-postgres,
    workflow-config, workflow-resolvers (initial WORK_QUEUE resolver), and adapters/hrms stubs (employee/position/
    org-unit/document/notification/audit/SR hooks). Amend the HRMS P01 schema/contract for durable
    task/wait/fork/reference/resolution snapshots.
  context:
    - /Users/n15318/hrms/docs/spec/phased-plan.yaml                 # PH-00D + expected_files.modify
    - /Users/n15318/hrms/docs/spec/puda-vs-hrms-capability-gap.md   # C/D/E gaps drive the SPIs; B1/B2 => resolver SPI
    - /Users/n15318/hrms/docs/data-model/00-platform-core.sql       # amend for durable snapshots
    - /Users/n15318/hrms/docs/brd/PLATFORM_FOUNDATION.md , docs/contracts/dependency-register.yaml
    - /Users/n15318/workflow-platform                              # extends PH-00C
  constraints:
    - workflow-postgres is tenant-aware + RLS-compatible; no PUDA-specific tables in reusable packages.
    - The HRMS hierarchy/authority resolver is NOT built here — only the ApproverResolver SPI + WORK_QUEUE default
      + HRMS adapter STUBS (the resolver is the first PH-01 enhancement). Keep PUDA green via adapters/puda.
  work_loops:
    - name: Persistence
      max_iterations: 5
      repeat_until: workflow-postgres provides repositories for instances/tasks/waits/fork-join/references with
        tenant-aware transactions + idempotency; Postgres transaction/idempotency + version-pinning tests pass.
      steps: [define repo interfaces, implement, add tests, verify against a throwaway PG]
    - name: Config governance
      max_iterations: 4
      repeat_until: workflow-config implements W.1 schema, validation, versioning, publish-review, evidence packs;
        publish/version-pinning tests pass.
      steps: [port config model from PH-00C, add validation + publish-guard tests]
    - name: Resolver + hook SPIs
      max_iterations: 4
      repeat_until: workflow-resolvers defines ApproverResolver (+WORK_QUEUE impl) and adapters/hrms exposes stubbed
        employee/position/org-unit/document/notification/audit/SR side-effect hooks with contract tests.
      steps: [define SPI interfaces, WORK_QUEUE resolver, HRMS stub hooks, contract tests with synthetic fixtures]
    - name: HRMS contract amendment
      max_iterations: 3
      repeat_until: 00-platform-core.sql + PLATFORM_FOUNDATION.md + dependency-register.yaml carry durable
        task/assignee-snapshot/wait/fork-join/reference/resolution-snapshot structures; schema still loads clean end-to-end.
      steps: [add missing structures, re-run the full 00->14 schema load validation, update the contract docs]
  evidence_required:
    - /Users/n15318/workflow-platform/packages/{workflow-postgres,workflow-config,workflow-resolvers}/** + adapters/hrms/**
    - docs/spec/workflow-platform-governance.md , docs/spec/workflow-platform-gap-analysis.yaml
    - amended docs/data-model/00-platform-core.sql (+ full-load re-validation output)
    - docs/spec/ph-00d-verdict.md + docs/spec/manifest.json update
  escalate_when:
    - A durable-snapshot amendment would break the validated HRMS schema graph.
    - The resolver SPI cannot host the future HRMS hierarchy resolver without leaking domain into workflow-core.
