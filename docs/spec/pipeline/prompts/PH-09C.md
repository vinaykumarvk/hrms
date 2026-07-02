/goal
  objective: Take G11 pension computation to BRD depth. The audit found the scheme field is STORED BUT NEVER USED —
    one flat formula regardless of scheme. Implement real scheme BRANCHING and benefit engines: OPS (50% of
    emoluments per pen_pension_limit_rules min/max), NPS default-benefit path, UPS assured-payout path, and the
    under-10-years SERVICE_GRATUITY route (no pension). Add commutation via pen_commutation_factors lookup keyed by
    age-next-birthday with max-fraction enforcement, reduction, and restoration date = reduction + 15 years; family
    pension with normal and enhanced-window rates from pen_family_pension_rates; gratuity by type
    (RETIREMENT_GRATUITY / DEATH_GRATUITY / SERVICE_GRATUITY) with slabs and pen_gratuity_ceilings clamping; and
    provisional pension (Rule 9) via pen_provisional_pension_records with DCRG fully withheld until the G09
    proceeding concludes.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # G11: 103/118 NOT_FOUND; "compute(one flat formula)"
    - docs/brd/v3/G11-retirement-and-pension.md        # E07 pen_pension_calculations, E08 pen_commutation_records,
                                                       #   E09 pen_gratuity_calculations, E10 pen_family_pension_records,
                                                       #   E41 pen_provisional_pension_records; ERR-G11-COMMUTATION-LIMIT,
                                                       #   ERR-G11-FACTOR-NOT-FOUND, ERR-G11-SCHEME-MISMATCH, ERR-G11-PROVISIONAL-PENDING
    - docs/data-model/11-G11-retirement-pension.sql    # authoritative table/column names
    - apps/api/src/modules/g11/** (incl. PH-09A rule tables E30-E36) , apps/api/src/routes/g11.routes.ts
    - apps/api/src/modules/g09/**                      # disciplinary state consumed by the Rule 9 gate
    - apps/api/test/ph09-g11-pension.test.cjs          # current slice tests to deepen
  constraints:
    - Scheme branching must be real: identical inputs under OPS vs NPS vs UPS must produce different, scheme-correct
      outputs; a benefit requested under the wrong scheme fails with ERR-G11-SCHEME-MISMATCH. Never default silently.
    - Qualifying service below the pension threshold routes to SERVICE_GRATUITY (no pension), per pen_pension_limit_rules.
    - Commutation: fraction above the statutory max throws ERR-G11-COMMUTATION-LIMIT; the factor is a lookup in
      pen_commutation_factors by age-next-birthday (missing row -> ERR-G11-FACTOR-NOT-FOUND, never interpolate);
      persist commuted value, reduced pension, and restoration_date = reduction start + 15 years.
    - Family pension: enhanced rate only inside the BRD window (in-service vs after-retirement paths), normal rate
      after; rates come from pen_family_pension_rates, not literals.
    - Gratuity: type-specific slabs; result clamped to the effective pen_gratuity_ceilings row — clamping recorded.
    - Rule 9: while a G09 proceeding is open, only provisional pension via pen_provisional_pension_records with DCRG
      withheld; release paths follow conclusion outcome.
    - Deterministic integer paise/cents money math; rounding only via pen_rounding_rules.
    - Parameterised queries; transactions for multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Scheme branching + pension paths
      max_iterations: 8
      repeat_until: apps/api/src/modules/g11/** computes OPS/NPS/UPS/SERVICE_GRATUITY through distinct code paths
        grounded in E30-E36 rule tables; ERR-G11-SCHEME-MISMATCH guards cross-scheme benefit requests.
      steps: [branch dispatcher on scheme, OPS 50% + min/max, NPS path, UPS path, sub-10yr service-gratuity route]
    - name: Commutation, family pension, gratuity, Rule 9
      max_iterations: 8
      repeat_until: commutation uses factor-table lookup with limit + restoration date; family pension applies
        enhanced-window then normal rates; gratuity applies type slabs + ceiling clamp; provisional pension withholds
        DCRG while G09 is open.
      steps: [commutation engine, family pension windows, gratuity slabs + ceiling, Rule 9 provisional + DCRG hold]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a scheme-divergence test asserting OPS output != NPS output for the
        same inputs, (b) a pen_commutation_factors lookup test incl. NEGATIVE ERR-G11-FACTOR-NOT-FOUND, (c) NEGATIVE
        ERR-G11-COMMUTATION-LIMIT over-limit test, (d) a gratuity ceiling-clamp test, (e) family pension
        enhanced-vs-normal window test, (f) Rule 9 DCRG-withheld test; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-09c.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g11/** scheme-branched engines naming the BRD entities/codes above
    - apps/api/test/*.test.cjs: scheme divergence, factor lookup, commutation limit, ceiling clamp, Rule 9 tests
    - `bash docs/spec/pipeline/checks/ph-09c.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A statutory factor/rate/ceiling value has no grounded source in BRD/DDL/seed data (never invent statutory numbers).
    - The BRD leaves a scheme rule genuinely ambiguous after one resolution attempt — surface the precise question.
    - The G09 linkage needed for Rule 9 does not expose proceeding state (raise a cross-module gap, do not stub silently).
