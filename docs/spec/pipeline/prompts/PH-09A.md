/goal
  objective: Build the PERSISTED, EFFECTIVE-DATED RULE SUBSTRATE for the compensation wave (G10/G11) that the
    BRD-coverage audit (docs/reviews/brd-coverage-audit-20260702.md) found absent. Deliver pay_components,
    pay_rules (constrained expression DSL with token-whitelist validation), rate_tables (DA/HRA/NPS/PT slabs,
    state-dimensioned, overlap-rejected), and the G11 rule tables E30-E36: pen_da_relief_rates,
    pen_commutation_factors (by age-next-birthday), pen_family_pension_rates (normal/enhanced),
    pen_gratuity_ceilings, pen_retirement_age_rules, pen_pension_limit_rules, pen_rounding_rules.
    These entities must be CONSUMED by resolution logic, not just declared.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # why: G10 97/111 NOT_FOUND, G11 103/118 NOT_FOUND; rule tables missing
    - docs/brd/v3/G10-payroll-and-benefits.md          # E05 pay_components, E06 pay_rules, E07 rate_tables; ERR-G10-RULE-EXPR,
                                                       #   ERR-G10-RATE-OVERLAP, ERR-G10-PT-STATE, ERR-G10-RATE-NOTFOUND; VAL-G10-DSL-TOKEN, VAL-G10-RATE-NONOVERLAP
    - docs/brd/v3/G11-retirement-and-pension.md        # E30-E36 rule tables; ERR-G11-RULE-NOT-EFFECTIVE, ERR-G11-FACTOR-NOT-FOUND
    - docs/data-model/10-G10-payroll-benefits.sql , docs/data-model/11-G11-retirement-pension.sql   # authoritative DDL names/columns
    - apps/api/src/modules/g10/payrollService.ts , apps/api/src/modules/g11/pensionService.ts       # current thin slices to extend
    - apps/api/src/routes/g10.routes.ts , apps/api/src/routes/g11.routes.ts , apps/api/test/        # route + executed-suite layout
  constraints:
    - Ground every table/column/code name in the BRD + DDL; do not invent names (e.g. it is pen_commutation_factors, not commutation_table).
    - Expression DSL: whitelist-only tokens (component codes, rate refs, arithmetic, min/max/round); any other token
      rejects with ERR-G10-RULE-EXPR (VAL-G10-DSL-TOKEN). No eval of arbitrary strings.
    - Effective dating: every rule row carries effective_from/effective_to; resolution picks exactly one row as-of a date;
      no row for the date -> ERR-G10-RATE-NOTFOUND / ERR-G11-RULE-NOT-EFFECTIVE; overlapping rows on write -> ERR-G10-RATE-OVERLAP (VAL-G10-RATE-NONOVERLAP). Fail closed, never silently pick "latest".
    - PT slabs are state-dimensioned; a PT lookup without a state mapping fails with ERR-G10-PT-STATE.
    - Money is deterministic integer paise/cents arithmetic; no floating-point currency; rounding only via pen_rounding_rules / the G10 rounding component.
    - Parameterised queries only; multi-step writes in transactions; no production console.log; no stack traces or internal paths in error responses.
    - Do NOT weaken, edit, or special-case any file under docs/spec/pipeline/checks/**; do NOT touch docs/spec/pipeline/phases.yaml, .state/, or approvals/.
    - Surgical scope: rule substrate only — run-engine depth, scheme branching, disbursement, and UI belong to PH-09B..E.
  work_loops:
    - name: G10 rule substrate
      max_iterations: 6
      repeat_until: apps/api/src/modules/g10/** persists and consumes pay_components, pay_rules, and rate_tables with
        DSL token-whitelist validation (ERR-G10-RULE-EXPR), effective-date resolution (ERR-G10-RATE-NOTFOUND),
        state-dimensioned PT slabs (ERR-G10-PT-STATE), and overlap rejection on write (ERR-G10-RATE-OVERLAP).
      steps: [define entities per DDL, implement DSL validator + evaluator skeleton, implement as-of resolution + overlap guard, wire routes]
    - name: G11 rule tables E30-E36
      max_iterations: 6
      repeat_until: apps/api/src/modules/g11/** persists and consumes all seven E30-E36 rule tables with effective-date
        resolution shared with G10 semantics; commutation factor rows keyed by age-next-birthday; lookups off the
        effective window fail with ERR-G11-RULE-NOT-EFFECTIVE / ERR-G11-FACTOR-NOT-FOUND.
      steps: [define seven rule tables per DDL, seed statutory reference rows, implement as-of + age-keyed lookup, wire routes]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains executed tests covering (a) effective-date resolution returning different
        rate values either side of an effective boundary, (b) NEGATIVE overlap-rejection asserting ERR-G10-RATE-OVERLAP,
        (c) NEGATIVE DSL-whitelist rejection asserting ERR-G10-RULE-EXPR, (d) pen_commutation_factors as-of lookup;
        `npm run typecheck` and `npm test` pass; `bash docs/spec/pipeline/checks/ph-09a.sh` is GREEN.
      steps: [write tests in apps/api/test/*.test.cjs, run typecheck + test, run the oracle, fix]
  evidence_required:
    - apps/api/src/modules/g10/** and apps/api/src/modules/g11/** rule-substrate code consuming the BRD entity names
    - apps/api/test/*.test.cjs: effective-date resolution test + overlap-rejection and DSL-rejection negative tests
    - `bash docs/spec/pipeline/checks/ph-09a.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A statutory rate/factor value is not derivable from the BRD or seeded reference data (do not invent statutory numbers).
    - Effective-date semantics in the BRD conflict with the DDL for a specific table.
    - The oracle stays RED after the loop budget for a reason outside this phase's scope.
