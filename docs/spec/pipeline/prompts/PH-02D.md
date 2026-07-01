/goal
  objective: Author the authority-resolution TEST SUITE (the independent oracle) covering every resolver
    behaviour + data invariant, traced to the PH-02A model and PH-02C fixtures, and assemble the PH-02
    review packet so a human can confirm resolution is explainable, auditable, deterministic, and ambiguity is blocked.
  context:
    - docs/spec/hrms-authority-model.yaml , docs/spec/hrms-seed-data-plan.yaml
    - docs/spec/phased-plan.yaml              # PH-02 generated_tests + review_criteria
    - docs/tests/                             # existing test-suite conventions
  constraints:
    - Tests must be black-box against the resolver contract + fixtures; every resolver type has >=1 case.
    - No test-only bypasses of the authority model.
  work_loops:
    - name: Resolution + data tests
      max_iterations: 5
      repeat_until: docs/tests/authority-resolution-tests.md covers reporting-chain L1/L2/skip-level,
        position-authority resolution by as-of date, org-unit-head fallback, delegation & acting-charge precedence,
        committee quorum & recusal, AND the data invariants — no overlapping effective-dated authority,
        tenant/entity scoping, SoD self-approval denial, and historical-correction determinism.
      steps: [write each case with fixture, steps, expected result; trace each to a resolver type + fixture]
    - name: Review packet
      max_iterations: 2
      repeat_until: A traceability table maps every generated_tests item + every PH-02 review_criterion to a test,
        with 0 gaps, ready for human sign-off.
      steps: [build the trace matrix, confirm G03/G05 drivable without bypasses, note residual risks]
  evidence_required:
    - docs/tests/authority-resolution-tests.md    # every resolver behaviour + data invariant, 0 coverage gaps
    - docs/spec/ph-02-verdict.md                  # review packet: coverage, explainability, ambiguity-blocked, residual risks
    - docs/spec/manifest.json                     # record PH-02D verdict
  escalate_when:
    - A review_criterion cannot be evidenced by a test (ambiguous authority resolvable but not explainable).
