/goal
  objective: Complete PH-08F - add PH-08 UI proof, conformance verdict, manifest evidence, and run full checks.
  context:
    - apps/web/src/modules/g05/**
    - apps/web/src/modules/g06/**
    - apps/web/src/modules/g07/**
    - apps/web/src/modules/g08/**
    - apps/web/src/modules/g09/**
    - apps/web/test/ph08-statutory-wave.test.cjs
    - docs/spec/manifest.json
  constraints:
    - Do not add a second shell or duplicate navigation system.
    - Preserve web hygiene: no TypeScript any, no console.log, no hardcoded localhost in web source.
    - Keep PH-08F auto only while the executable oracle remains complete.
  freedom:
    - Add statutory UI panels, fixture summaries, conformance tests, verdict doc, manifest entries, and repair gaps.
  evidence_required:
    - docs/spec/ph-08-verdict.md
    - docs/spec/manifest.json records PH-08 and PH-08A..PH-08F
    - `bash docs/spec/pipeline/checks/ph-08f.sh` GREEN
  escalate_when:
    - Full API or web regression remains red after repair.
