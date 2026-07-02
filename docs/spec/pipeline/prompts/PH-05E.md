/goal
  objective: Complete PH-05E - produce PH-05 UI conformance evidence and the review packet for human UI/demo freeze before PH-06.
  context:
    - docs/spec/ph-05-ui-implementation-plan.md
    - apps/web/src/**
    - apps/web/test/**
    - docs/spec/manifest.json
  constraints:
    - Do not add new UI behavior except small fixes needed to make conformance evidence truthful.
    - Do not weaken tests, hygiene checks, route guards, or permission behavior.
    - Record fixture-mode caveats honestly.
    - PH-05E is a human gate after GREEN because UI acceptance before PH-06 includes judgment.
  freedom:
    - Add UI conformance tests, accessibility/static checks, and a verdict document.
    - Repair implementation gaps discovered by conformance tests.
  work_loops:
    - name: UI conformance
      max_iterations: 4
      repeat_until: The minimum shell, workflow operations, workflow config, G01, G12, and G13 surfaces are mapped to tests and files.
      steps:
        - add conformance test
        - run web checks
        - fix missing evidence
    - name: Review packet
      max_iterations: 3
      repeat_until: docs/spec/ph-05-verdict.md records scope, evidence, caveats, and explicit readiness for PH-06 or deferrals.
      steps:
        - write verdict
        - record fixture-mode caveats
        - update manifest
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-05E oracle is GREEN.
      steps:
        - run bash docs/spec/pipeline/checks/ph-05e.sh
        - fix gaps
  evidence_required:
    - apps/web/test/ph05-ui-conformance.test.cjs
    - docs/spec/ph-05-verdict.md
    - docs/spec/manifest.json records PH-05E
    - `bash docs/spec/pipeline/checks/ph-05e.sh` GREEN
  escalate_when:
    - Human UX acceptance rejects the workspace IA.
    - PH-06 needs UI routes or actions not present in PH-05.
    - A critical accessibility or permission issue cannot be fixed within PH-05.
