/goal
  objective: PH-06E — vertical-slice conformance and scale-up gate (gate:human). Prove PH-06A..D actually
    moved BRD coverage: run the full API + web suites, re-verify every item the audit
    (docs/reviews/brd-coverage-audit-20260702.md) marked NOT_FOUND that PH-06 claimed to close, and
    produce an HONEST coverage-delta verdict for the human reviewer deciding whether to scale the wave
    pattern to the remaining modules.
  audit_gaps_closed:
    - "All green reflects slice coverage, not requirement coverage" — this gate makes the delta explicit
      instead of self-certifying.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md          # baseline numbers: G03 9/118 CONFIRMED, G05 9/34, ~84% NOT_FOUND overall
    - docs/spec/pipeline/checks/ph-06a.sh .. ph-06d.sh     # the upstream oracles (must all be GREEN first)
    - apps/api/src/modules/g03/** , apps/api/src/modules/g05/** , apps/web/src/modules/g03|g05/**
    - docs/brd/v3/G03-attendance-and-leave-management.md , docs/brd/v3/G05-transfer-relieving-joining-workflow.md
  deliverables:
    - Run and record: `npm run typecheck`, `npm test`, `npm run web:typecheck`, `npm run web:test` — all green.
    - Re-run `bash docs/spec/pipeline/checks/ph-06a.sh` .. `ph-06d.sh` and capture their GREEN output.
    - Write docs/spec/ph-06-verdict.md containing:
        * a coverage-delta table with one row per module (G03, G05) and columns:
          audit baseline (CONFIRMED/PARTIAL/NOT_FOUND from brd-coverage-audit-20260702), items closed by
          PH-06 (each with file:line evidence), items still NOT_FOUND / remaining, and the new totals;
        * an explicit "Remaining gaps" section — the verdict must NOT claim BRD completeness; the audit
          counted 118 G03 items and PH-06 closes a bounded subset, so remaining NOT_FOUND counts stay visible;
        * the persistence substrate outcome (which entities now live in Postgres, which remain in memory);
        * a scale-up recommendation with risks for the human gate.
  constraints:
    - Evidence-first: every "closed" row must cite the implementing file and the test that exercises it.
      If verification could not be run, say so explicitly — do not claim done without it.
    - Do not repair implementation in this phase; if a re-grep or suite fails, the verdict records it and
      the phase goes RED (fix belongs to the owning sub-phase).
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
    - No edits to phases.yaml; the human approval flow is external to this goal.
  work_loops:
    - name: full verification pass
      max_iterations: 3
      repeat_until: all four npm suites are green and ph-06a..d oracles report GREEN, with outputs captured
        for the verdict.
      steps: [run api suites, run web suites, run the four upstream oracles, collect outputs]
    - name: coverage-delta verdict
      max_iterations: 3
      repeat_until: docs/spec/ph-06-verdict.md exists with the per-module delta table (baseline vs closed vs
        remaining), file:line evidence per closed item, remaining-gap counts, and a scale-up recommendation;
        `bash docs/spec/pipeline/checks/ph-06e.sh` GREEN.
      steps: [tabulate closures against the audit line items, write verdict, run oracle]
  freedom:
    - Verdict layout is yours beyond the required elements (per-module table, file:line evidence,
      remaining-gap accounting, substrate outcome, recommendation).
    - You may add appendices (e.g. raw oracle output, suite timings) if they aid the reviewer.
    - Sampling depth for re-verification beyond the oracle's re-grep list is your judgment — state what
      was and was not re-checked.
  verdict_table_hint: |
    | Module | Audit CONFIRMED | Audit NOT_FOUND | Closed in PH-06 (evidence) | Remaining NOT_FOUND |
    |---|---|---|---|---|
    | G03 | 9/118 | 97 | ... file:line + test ... | ... |
    | G05 | 9/34 | 19 | ... file:line + test ... | ... |
  evidence_required:
    - docs/spec/ph-06-verdict.md (honest coverage-delta vs docs/reviews/brd-coverage-audit-20260702.md)
    - green output of the four npm suites and ph-06a..d
    - ph-06e.sh GREEN, then park for human approval
  escalate_when:
    - Any upstream PH-06 oracle is RED (do not paper over — quarantine and report).
    - The measured delta materially contradicts what PH-06B/C/D reported (process defect — surface it).
