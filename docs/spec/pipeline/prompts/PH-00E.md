/goal
  objective: Prove the extracted workflow-platform preserves PUDA behavior AND supports HRMS — PUDA adapter golden
    tests pass against the extracted package, and HRMS synthetic start/approve/reject/sendBack flows pass against
    HRMS-like employee/org fixtures. Produce the migration/coexistence inventory and clear the PH-00 gate.
  context:
    - /Users/n15318/hrms/docs/spec/phased-plan.yaml                 # PH-00E + PH-00 exit_criteria + review_criteria
    - /Users/n15318/hrms/docs/spec/puda-golden-behavior-baseline.md # the parity target
    - /Users/n15318/workflow-platform                              # extracted package (PH-00C/D) + adapters/{puda,hrms}
    - /Users/n15318/PUDA_workflow_engine                            # READ-ONLY, pinned cadf3973
  constraints:
    - Conformance only; no new features. PUDA production behavior unchanged. No HRMS module imports PUDA/LAC domain code.
  work_loops:
    - name: PUDA conformance
      max_iterations: 4
      repeat_until: The PH-00A golden suite passes against workflow-platform via adapters/puda for all four shapes
        (simple, wait, fork/join, reference) — output parity with the pinned baselines.
      steps: [wire adapters/puda to the extracted package, run golden suite, diff vs baseline fixtures, fix adapter]
    - name: HRMS conformance
      max_iterations: 4
      repeat_until: adapters/hrms runs synthetic start/approve/reject/sendBack flows against synthetic employee/org
        fixtures, with P01 OpenAPI schema validation and HRMS adapter contract tests green.
      steps: [build synthetic fixtures, run the four flows through the HRMS adapter, validate contract + envelope]
    - name: Migration + gate
      max_iterations: 3
      repeat_until: docs/spec/migration-coexistence-inventory.md covers historical workflow states + pending cases,
        and every PH-00 exit_criteria + review_criteria is checked with evidence.
      steps: [inventory in-flight/pending states, verify each exit/review criterion, compile the gate packet]
  evidence_required:
    - docs/spec/workflow-conformance-suite.md                  # PUDA + HRMS conformance results
    - docs/spec/migration-coexistence-inventory.md
    - docs/spec/ph-00-gate-verdict.md                          # PASS/FAIL vs all PH-00 exit_criteria (the gate)
    - docs/spec/manifest.json update: PH-00 gate result
  escalate_when:
    - A PUDA golden shape cannot reach parity through the adapter (invoke rollback: keep PUDA on original path).
    - HRMS synthetic flows cannot pass without embedding domain logic in workflow-core.
    - Any PH-00 exit_criteria cannot be met — do NOT start HRMS module coding (quarantine per plan).
