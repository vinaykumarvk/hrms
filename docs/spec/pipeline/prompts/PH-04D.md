/goal
  objective: Complete PH-04 API conformance and freeze evidence: verify P01/G01/G12/G13 route groups against OpenAPI,
    auth, idempotency, pagination, correlation-id, and error-envelope requirements; produce the PH-04 verdict packet.
  context:
    - docs/spec/ph-04-api-contract-implementation-plan.md
    - docs/spec/phased-plan.yaml
    - docs/contracts/openapi/P01-workflow.yaml
    - docs/contracts/openapi/G01.yaml
    - docs/contracts/openapi/G12.yaml
    - docs/contracts/openapi/G13.yaml
    - docs/contracts/error-taxonomy.yaml
    - apps/api/src/http/**
    - apps/api/src/routes/**
    - apps/api/test/**
  constraints:
    - Do not add new route behavior in this subphase except small fixes needed to make the conformance oracle truthful.
    - Do not change OpenAPI contracts or error taxonomy unless the delta is explicitly recorded in the PH-04 verdict.
    - Do not weaken auth, idempotency, pagination, correlation, or error-envelope checks to pass tests.
    - PH-04D is a human gate after GREEN because it freezes the API surface for PH-05.
  freedom:
    - Add conformance tests and route registry coverage checks.
    - Add docs/spec/ph-04-verdict.md and manifest evidence.
    - Repair implementation gaps discovered by the conformance tests.
  work_loops:
    - name: Contract conformance
      max_iterations: 5
      repeat_until: OpenAPI contracts parse; route registry covers the PH-04 minimum route set; every implemented route
        has auth metadata, idempotency metadata for unsafe POSTs, bounded pagination metadata for lists, and canonical errors.
      steps:
        - add conformance tests
        - run OpenAPI parse and route coverage checks
        - fix route metadata gaps
    - name: Smoke and security
      max_iterations: 4
      repeat_until: P01, G01, G12, and G13 API smoke tests pass; forbidden/not-found non-leakage, idempotency replay,
        pagination bound, correlation-id, and sanitized error tests pass.
      steps:
        - run `npm run check`
        - run PH-04A/B/C regression checks
        - fix gaps
    - name: Verdict packet
      max_iterations: 3
      repeat_until: docs/spec/ph-04-verdict.md maps every PH-04 exit criterion and review criterion to evidence with
        no unowned gap, and docs/spec/manifest.json records PH-04D.
      steps:
        - write verdict
        - record contract deltas or "none"
        - rerun `bash docs/spec/pipeline/checks/ph-04d.sh`
  evidence_required:
    - apps/api/test/ph04-contract-conformance.test.cjs
    - docs/spec/ph-04-verdict.md
    - docs/spec/manifest.json records PH-04D
    - `bash docs/spec/pipeline/checks/ph-04d.sh` GREEN
  escalate_when:
    - OpenAPI contract deltas require product/legal/security acceptance.
    - A protected route cannot call P02 Authorization.check.
    - A route cannot satisfy the canonical error envelope without changing the taxonomy.
