/goal
  objective: Create the workflow-platform monorepo and extract PURE workflow logic into packages/workflow-core
    (state, transition, guard, action, wait, fork/join, route-model, config-validation) with zero PUDA domain
    coupling. Consume it from the PH-00B facade for the four workflow shapes.
  context:
    - /Users/n15318/hrms/docs/spec/phased-plan.yaml                 # PH-00C increment
    - /Users/n15318/hrms/docs/spec/puda-workflow-inventory.yaml     # reusable-core vs adapter vs domain classifications
    - /Users/n15318/hrms/docs/spec/puda-golden-behavior-baseline.md # extraction must preserve these
    - /Users/n15318/PUDA_workflow_engine                            # source of extracted logic, READ-ONLY; pinned cadf3973
  target: /Users/n15318/workflow-platform                          # NEW shared package repo
  constraints:
    - workflow-core is PURE: no PUDA table names, business constants, LAC/LOI/payment semantics, or DB access.
    - Preserve behavior: every extracted unit is covered by a golden/characterization test that still passes.
    - Record provenance (source file + commit + license) for every extracted file. PUDA behavior unchanged.
  work_loops:
    - name: Scaffold
      max_iterations: 2
      repeat_until: workflow-platform/{package.json, packages/workflow-core, packages/workflow-test-kit} builds + typechecks.
      steps: [scaffold monorepo + workflow-core + test-kit, tsconfig/build, empty CI]
    - name: Extract-by-slice
      max_iterations: 8
      repeat_until: transition/guard/action/wait/fork-join/route-model/config-validation logic is in workflow-core,
        domain-free, each slice green under unit tests and under the PH-00A golden baselines via a temporary shim.
      steps: [extract one slice from PUDA into workflow-core, strip domain constants, add unit tests, run golden parity, record provenance]
    - name: Review-repair
      max_iterations: 3
      repeat_until: A domain-leakage scan finds no PUDA table/constant in workflow-core; all tests green.
      steps: [grep for PUDA identifiers, fix leaks, re-run build + tests]
  evidence_required:
    - /Users/n15318/workflow-platform/packages/workflow-core/**  + workflow-test-kit/**
    - docs/spec/workflow-platform-extraction.md                 # provenance + what moved + what stayed
    - docs/spec/ph-00c-verdict.md + docs/spec/manifest.json update
  escalate_when:
    - A "pure" behavior cannot be separated from PUDA domain without a rewrite (record as an extraction risk).
    - Extraction breaks a golden baseline and cannot be made green without changing behavior.
