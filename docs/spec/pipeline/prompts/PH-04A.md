/goal
  objective: Implement the PH-04 API kernel and contract harness for `/api/v1` routes, without building module-specific
    route groups yet. The kernel must enforce auth, correlation IDs, canonical error envelopes, idempotency metadata,
    cursor pagination bounds, route registration, and OpenAPI contract loading.
  context:
    - docs/spec/phased-plan.yaml
    - docs/spec/ph-04-api-contract-implementation-plan.md
    - docs/contracts/error-taxonomy.yaml
    - docs/contracts/openapi/P01-workflow.yaml
    - docs/contracts/openapi/G01.yaml
    - docs/contracts/openapi/G12.yaml
    - docs/contracts/openapi/G13.yaml
    - apps/api/src/platform/foundationServices.ts
    - apps/api/src/platform/authorization/authorizationService.ts
    - apps/api/src/platform/types.ts
  constraints:
    - Do not implement PH-04B/C module route groups in this subphase.
    - Do not add production dependencies unless an amendment is recorded.
    - Every route registered by the kernel must be explicitly protected or explicitly public.
    - Unsafe POST handlers must require `Idempotency-Key`.
    - Every response must carry `X-Correlation-Id`.
    - Errors must use the canonical 8-code envelope; no stack traces/internal paths/secrets in responses.
    - Do not weaken P02 authorization, P05 audit, or G12/G13 ownership boundaries.
  freedom:
    - Add a minimal framework-agnostic HTTP/request dispatcher or route registry under `apps/api/src/http/**`.
    - Add reusable test helpers under `apps/api/test/**`.
    - Keep implementation in-memory, consuming PH-03 services.
  work_loops:
    - name: API kernel
      max_iterations: 5
      repeat_until: `apps/api/src/http/**` provides route registration, request context, protected/public metadata,
        correlation-id handling, canonical error mapping, idempotency-key enforcement, and pagination helpers.
      steps:
        - define request/response and route metadata types
        - implement auth guard calling P02 Authorization.check
        - implement correlation and error-envelope middleware
        - implement idempotency and pagination helpers
    - name: Contract registry
      max_iterations: 3
      repeat_until: `apps/api/src/openapi/**` loads/parses the P01/G01/G12/G13 OpenAPI contracts and exposes the
        PH-04 minimum route set for conformance checks.
      steps:
        - add contract registry
        - map minimum route set from the PH-04 plan
        - expose route coverage checks
    - name: Kernel tests
      max_iterations: 4
      repeat_until: `apps/api/test/ph04-api-kernel.test.cjs` proves auth, correlation, idempotency, pagination, and
        sanitized error behavior; `npm run check` passes.
      steps:
        - add tests
        - run typecheck/build/tests
        - repair failures
  evidence_required:
    - apps/api/src/http/**
    - apps/api/src/openapi/**
    - apps/api/test/ph04-api-kernel.test.cjs
    - docs/spec/manifest.json records PH-04A
    - `bash docs/spec/pipeline/checks/ph-04a.sh` GREEN
  escalate_when:
    - A route cannot be made explicitly protected/public.
    - Kernel behavior requires changing the canonical error taxonomy or auth policy.
    - A destructive or irreversible change is required.
