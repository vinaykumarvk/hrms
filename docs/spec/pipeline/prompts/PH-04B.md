/goal
  objective: Implement PH-04 P01 workflow and G01 employee API route groups on top of the PH-04A API kernel and PH-03
    foundation services.
  context:
    - docs/spec/ph-04-api-contract-implementation-plan.md
    - docs/contracts/openapi/P01-workflow.yaml
    - docs/contracts/openapi/G01.yaml
    - docs/contracts/error-taxonomy.yaml
    - apps/api/src/http/**
    - apps/api/src/platform/foundationServices.ts
    - apps/api/src/platform/workflow/hrmsWorkflowService.ts
    - apps/api/src/modules/g01/employeeMasterService.ts
  constraints:
    - Implement only P01 and G01 route groups in this subphase.
    - All endpoints must be under `/api/v1`.
    - Every route must be protected and call P02 Authorization.check unless explicitly documented as public.
    - Unsafe/workflow-initiating POSTs require `Idempotency-Key`.
    - G01 routes must use G01 service APIs and P02 field masking; no direct cross-module table/service bypass.
    - No production console.log, no `any`/`as any`, and no stack traces in responses.
  freedom:
    - Add route files under `apps/api/src/routes/p01-workflow.routes.ts` and `apps/api/src/routes/g01.routes.ts`.
    - Add route smoke/contract tests under `apps/api/test/**`.
    - Add lightweight DTO mappers where needed.
  work_loops:
    - name: P01 route group
      max_iterations: 5
      repeat_until: workflow start, advance, approve, reject, send-back, delegate, cancel, query, instance detail, and
        task-list routes are registered with auth, idempotency metadata where unsafe, and tests.
      steps:
        - implement route handlers against HrmsWorkflowService
        - add task list/detail and action tests
        - verify audit/notification side effects
    - name: G01 route group
      max_iterations: 5
      repeat_until: employee list/detail/profile-360/changes and governed-change raise/approve/reject routes are
        registered and tested with P02 masking and G12 posting behavior.
      steps:
        - implement read/list/detail/profile routes
        - implement governed-change entry points against EmployeeMasterService
        - test masking and SR posting
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-04B oracle is GREEN and no route bypasses API kernel/auth metadata.
      steps:
        - run `bash docs/spec/pipeline/checks/ph-04b.sh`
        - fix gaps
        - update manifest evidence
  evidence_required:
    - apps/api/src/routes/p01-workflow.routes.ts
    - apps/api/src/routes/g01.routes.ts
    - apps/api/test/ph04-p01-g01-routes.test.cjs
    - docs/spec/manifest.json records PH-04B
    - `bash docs/spec/pipeline/checks/ph-04b.sh` GREEN
  escalate_when:
    - Existing P01/G01 OpenAPI contracts require incompatible route semantics.
    - A G01 route would bypass P02 field masking or G12 SR ownership.
