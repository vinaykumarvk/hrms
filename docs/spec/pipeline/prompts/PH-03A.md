/goal
  objective: Implement the CORE PLATFORM SERVICE LAYER in apps/api — embed the extracted P01 workflow platform
    (HRMS adapter repositories + transaction boundary), the Authority Resolution Service implementing all
    resolver families from the PH-02 model, and P05 audit hooks. Wire workflow-platform as a path dependency.
  context:
    - docs/spec/phased-plan.yaml                 # PH-03 goal/requirements/implementation_steps
    - docs/spec/hrms-authority-model.yaml , docs/spec/authority-resolution-contract.yaml   # PH-02A: the 10 resolver_types
    - /Users/n15318/workflow-platform            # PH-00C/D extracted platform (packages/*, adapters/hrms)
    - docs/contracts/openapi/P01-workflow.yaml , docs/contracts/dependency-register.yaml
    - apps/api/src/platform                      # existing scaffold to complete
  constraints:
    - Consume the extracted workflow-platform; do NOT re-implement workflow-core logic here.
    - Services expose contracts; they must NOT leak table internals across module boundaries.
    - Ambiguous authority is BLOCKED, never guessed (P01_RESOLVER_AMBIGUOUS). Persist authority-resolution evidence with each assignment/action.
    - No production console.log; no stack traces / internal paths in error responses; parameterised queries only.
  work_loops:
    - name: P01 embed + audit
      max_iterations: 5
      repeat_until: apps/api/src/platform/workflow/** wires the workflow-platform runtime via the HRMS adapter with a
        tenant-aware transaction boundary, and apps/api/src/platform/audit/** writes P05 mutation+security audit rows.
      steps: [add workflow-platform path dep, implement adapter repos + tx boundary, wire P05 audit hooks]
    - name: Authority Resolution Service
      max_iterations: 6
      repeat_until: apps/api/src/platform/authority-resolution/** implements AuthorityResolver.resolve covering
        REPORTING_CHAIN, STATUTORY_AUTHORITY (position-authority), ORG_UNIT_HEAD, NAMED_ROLE, NAMED_INDIVIDUAL,
        WORK_QUEUE, COMMITTEE, and DELEGATION/acting-charge — precedence per the PH-02 model, ambiguity blocked,
        as-of snapshot persisted; resolver precedence unit tests exist and (if deps installed) pass.
      steps: [implement each resolver family, precedence + as-of snapshot, unit tests, run typecheck/tests]
    - name: Verify
      max_iterations: 3
      repeat_until: `npm run typecheck` passes (install deps if needed) and the workflow start->task->approve->
        action+audit integration test exists and passes; if the toolchain cannot install, structural + resolver-coverage checks pass and this is noted.
      steps: [npm install if needed, typecheck, run resolver + workflow tests, fix]
  evidence_required:
    - apps/api/src/platform/workflow/** , apps/api/src/platform/authority-resolution/** , apps/api/src/platform/audit/**
    - unit tests: authority resolver precedence; integration: workflow start->task->approve->action/audit row
    - docs/spec/manifest.json                    # record PH-03A verdict
  escalate_when:
    - workflow-platform cannot be consumed without changing its core.
    - A resolver family cannot be implemented deterministically from the PH-02 model.
