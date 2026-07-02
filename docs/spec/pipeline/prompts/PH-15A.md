/goal
  objective: Take the G10 income-tax/TDS engine and statutory certificates to BRD depth. The coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) names the G10 "TDS/tax engine, Form-16/24Q" backlog as still
    NOT_FOUND after PH-09. Implement: employee tax_declarations (E15) with regime handling — switching regime
    (old/new) recomputes the full pipeline (gross taxable -> standard_deduction -> Chapter VI-A -> slab ->
    surcharge with marginal relief -> 4% cess -> rebate_87a -> 89(1)/Form-10E relief) and per-month TDS;
    TDS projection per FR-G10-07 BR2: TDS = (projected annual tax - YTD TDS derived from the immutable
    payslip_lines ledger) / remaining months; Form-16 generation per FR-G10-17 with the tie-out AC1 (Form-16
    TDS totals tie to SIGMA of TDS payslip_lines for the FY, and Part A derives ONLY from statutory_remittances
    rows in MATCHED status); Form-24Q quarterly aggregation whose quarterly totals reconcile to monthly TDS
    (FR-17 AC2). Declarations lock after the FY proof cutoff (FR-07 AC3).
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G10 remaining: TDS/tax engine, Form-16/24Q
    - docs/brd/v3/G10-payroll-and-benefits.md          # FR-G10-07 (declarations/regime/pipeline), FR-G10-17
                                                       #   (Form-16 Part A from MATCHED, Form-24Q); E15 tax_declarations
                                                       #   (surcharge, marginal_relief, cess, rebate_87a, standard_deduction,
                                                       #   previous_employer_income, relief_89_1, perquisite_total);
                                                       #   E29 statutory_remittances (ACCRUED..DEPOSITED..MATCHED);
                                                       #   ERR-G10-TAXSLAB-NOTFOUND; ERR-G10-SNAPSHOT-FROZEN
    - docs/data-model/10-G10-payroll-benefits.sql      # authoritative table/column names
    - apps/api/src/modules/g10/** , apps/api/src/routes/g10.routes.ts   # PH-09 payroll engine + YTD ledger to build on
    - apps/api/test/ph09b-payroll-engine.test.cjs      # existing ledger/YTD test conventions to follow
  constraints:
    - All money in integer paise; no parseFloat/toFixed in tax math; deterministic recompute for the same inputs.
    - TDS YTD comes ONLY from the payslip_lines ledger (VAL-G10-YTD-DERIVE); never a mutable running counter.
    - Regime switch recomputes every persisted pipeline stage on tax_declarations (each intermediate value stored).
    - Declaration mutation after the FY proof cutoff throws the registered mutation-after-freeze code
      ERR-G10-SNAPSHOT-FROZEN (409) as the thrown error.code — the BRD registers no declaration-specific code;
      do NOT mint a new ERR identifier.
    - Form-16 Part A is blocked while any TDS statutory_remittances row for the FY is not MATCHED (FR-17 AC5 /
      "undeposited TDS -> Part A blocked"); missing slab rows throw ERR-G10-TAXSLAB-NOTFOUND.
    - Form-24Q quarterly totals must reconcile to the monthly TDS payslip_lines in the quarter; mismatch blocks.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Declarations + regime pipeline
      max_iterations: 8
      repeat_until: apps/api/src/modules/g10/** persists tax_declarations with the full pipeline stages
        (standard_deduction, Chapter VI-A caps, slab, surcharge + marginal relief, cess, rebate_87a, relief_89_1,
        previous_employer_income) and switching regime recomputes every stage plus per-month TDS from the ledger.
      steps: [tax_declarations store, pipeline evaluator, regime switch recompute, cutoff lock]
    - name: TDS projection + Form-16/24Q
      max_iterations: 8
      repeat_until: monthly TDS derives from (projected annual tax - ledger YTD TDS) / remaining months; Form-16
        totals tie to SIGMA TDS payslip_lines for the FY and Part A refuses while a remittance is un-MATCHED;
        Form-24Q aggregates quarterly totals that reconcile to monthly TDS.
      steps: [ledger-YTD projection, statutory_remittances MATCHED gate, Form-16 tie-out, Form-24Q aggregation]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a regime-switch recompute test, (b) a Form-16 tie-out test
        asserting Form-16 TDS equals the ledger sum, (c) NEGATIVE post-cutoff declaration mutation asserting
        error.code === 'ERR-G10-SNAPSHOT-FROZEN', (d) NEGATIVE Form-16 blocked while a remittance is un-MATCHED,
        (e) a Form-24Q quarterly reconciliation test; `npm run typecheck` + `npm test` pass;
        `bash docs/spec/pipeline/checks/ph-15a.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g10/** tax engine code naming tax_declarations, statutory_remittances, MATCHED,
      Form-16/Form-24Q, the pipeline stage fields, and the registered ERR codes above
    - apps/api/test/*.test.cjs: regime recompute + Form-16 tie-out + both fail-closed negatives + 24Q test
    - `bash docs/spec/pipeline/checks/ph-15a.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A slab/surcharge/cess/87A threshold has no grounded source in BRD/DDL/seed data (do not invent statutory numbers).
    - The YTD ledger lacks a fact the projection needs (raise against the PH-09 engine; do not add a mutable counter).
    - Form-16 tie-out is impossible because remittance rows cannot reach MATCHED in tests (build the capture/match
      path; do not stub the gate open).
