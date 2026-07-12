/goal
  objective: Expose typed protected bounded API contracts required by approved UI journeys and hide unsupported verbs.
  context:
    - docs/spec/ui-remediation/**
    - apps/api/src/http/**
    - apps/api/src/routes/**
    - apps/api/src/openapi/contractRegistry.ts
    - docs/contracts/openapi/P01-workflow.yaml
    - apps/web/src/api/hrmsClient.ts
  constraints:
    - Every endpoint is explicitly public or project-auth protected.
    - Unsafe operations are idempotent and use existing error taxonomy.
    - Do not invent endpoints for unsupported UI controls.
  freedom:
    - Choose existing route/service integration patterns.
  work_loops:
    - name: API contract slice
      max_iterations: 3
      repeat_until: Contract, auth, scope, idempotency, and error tests pass or approved not-required disposition passes.
      steps: [write tests, implement routes/client types, validate OpenAPI and regression]
  evidence_required:
    - contract-derived tests and updated client types
    - updated finding ledger evidence
  escalate_when:
    - Required behavior has no approved service or contract.

