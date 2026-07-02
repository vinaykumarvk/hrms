/goal
  objective: Complete PH-07E - add PH-07 UI proof, conformance verdict, manifest evidence, and run full checks.
  context:
    - apps/web/src/modules/g02/**
    - apps/web/src/modules/g03/**
    - apps/web/src/modules/g04/**
    - apps/web/test/ph07-employee-wave.test.cjs
    - docs/spec/manifest.json
  constraints:
    - Do not add a second shell or duplicate navigation system.
    - Preserve web hygiene: no TypeScript any, no console.log, no hardcoded localhost in web source.
    - Keep PH-07E auto only while the executable oracle remains complete.
  freedom:
    - Add UI panels, conformance tests, verdict doc, manifest entries, and repair gaps.
  evidence_required:
    - docs/spec/ph-07-verdict.md
    - docs/spec/manifest.json records PH-07 and PH-07A..PH-07E
    - `bash docs/spec/pipeline/checks/ph-07e.sh` GREEN
  escalate_when:
    - Full API or web regression remains red after repair.
