/goal
  objective: Rebuild the PH-04 API KERNEL so it delivers real HTTP behaviour, not marker strings — a route
    registry covering all 14 modules + P01, explicit public/protected auth on every route, a sanitized
    error envelope, a WORKING Idempotency-Key replay store (same key -> same stored response), and a real
    cursor pagination helper. The audit (docs/reviews/brd-coverage-audit-20260702.md) proved the previous
    PH-04A pass was self-certified; the re-baselined oracle now asserts behaviour, and it must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # why this phase is re-running
    - apps/api/src/http/**                             # apiKernel, apiTypes, errors, idempotency, pagination, correlation
    - apps/api/src/routes/index.ts , apps/api/src/routes/*.routes.ts
    - docs/contracts/openapi/*.yaml , docs/contracts/error-taxonomy.yaml
    - apps/api/test/ph04-api-kernel.test.cjs           # extend into a real behaviour suite
    - docs/spec/pipeline/checks/ph-04a.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - idempotency.ts only validates header PRESENCE — there is no replay store; a second call with the
      same Idempotency-Key re-executes the handler instead of returning the stored response.
    - RouteDefinition hardcodes `protected: true`; there is no way to declare an explicitly PUBLIC route,
      so "every route explicitly public or protected" is unverifiable. Kernel must branch on it.
    - pagination.ts carries a `next_cursor: null` placeholder object (paginationContract) and routes
      hardcode next_cursor: null instead of computing it from the page window.
    - error envelope never proven stack-free; keep `.stack` out of the entire HTTP layer.
  constraints:
    - Every RouteDefinition must declare `protected: true` (with a permission) or `protected: false`
      (explicit public allowlist — health/liveness class only). Kernel rejects protected calls without an
      actor via UNAUTHENTICATED and always runs Authorization.check for protected routes.
    - Replay store: key by tenant + Idempotency-Key + route, store the first response, return it verbatim
      on replay; conflicting payload for the same key is a CONFLICT. In-memory Map is acceptable this phase.
    - Pagination helper computes next_cursor from the window (null only when the page is genuinely last),
      clamps limit to MAX_LIMIT=100, default 25.
    - Sanitized envelope only: the 8 canonical codes (VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN,
      NOT_FOUND, CONFLICT, PRECONDITION_FAILED, RATE_LIMITED, INTERNAL); no stack traces, internal paths,
      or secret IDs in any response body.
    - Parameterised queries only when touching persistence; no production console.log; secrets only via
      environment variables.
    - Do NOT edit docs/spec/pipeline/checks/** or docs/spec/pipeline/prompts/** — the oracle defines exit
      criteria and weakening it is a hard violation.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: kernel + http layer + routes/index wiring + kernel tests. Module route handlers are
      PH-04B/PH-04C scope.
  work_loops:
    - name: explicit auth + sanitized envelope
      max_iterations: 4
      repeat_until: every route file declares protected true/false on every registration; kernel branches
        on route.protected (public bypasses actor requirement, protected enforces actor + P02 check); the
        8 canonical codes live in errors.ts and no `.stack` reference exists under apps/api/src/http.
      steps: [extend RouteDefinition with explicit protection, update kernel dispatch, sweep route files,
        strip stack leakage]
    - name: idempotency replay store + real pagination
      max_iterations: 5
      repeat_until: idempotency.ts holds a replay store consulted by kernel dispatch for unsafe routes
        (same key -> identical stored response; mismatched payload -> CONFLICT), and pagination.ts computes
        next_cursor with the 100 clamp and no `next_cursor: null` literal remains under apps/api/src/http.
      steps: [implement store, wire into dispatch before handler, compute cursor in pageItems, remove
        placeholder contract object]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: apps/api/test/ph04-api-kernel.test.cjs exercises replay (two dispatches, same key,
        identical body), UNAUTHENTICATED rejection, and public-vs-protected dispatch; `npm run -s typecheck`
        and `npm test` pass; `bash docs/spec/pipeline/checks/ph-04a.sh` prints GREEN.
      steps: [write behaviour tests, npm run -s typecheck, npm test, run the oracle, fix and repeat]
  evidence_required:
    - apps/api/src/http/** diffs , apps/api/src/routes/*.routes.ts protection declarations
    - apps/api/test/ph04-api-kernel.test.cjs behaviour assertions and a passing `npm test` run
    - GREEN output of `bash docs/spec/pipeline/checks/ph-04a.sh` captured in the phase log
  escalate_when:
    - A route genuinely cannot be classified public vs protected from contracts/BRD (name the route; do not guess).
    - Replay semantics conflict with an existing module's own idempotency layer (e.g. G12 ingest) and
      reconciling would require changing module behaviour outside this phase's scope.
    - The oracle stays RED after the loop budget for reasons outside apps/api/src/http.
