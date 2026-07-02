/goal
  objective: Complete PH-09E - add PH-09 UI proof, verdict, manifest evidence, and full regression checks.
  context:
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - apps/web/src/modules/g10/**
    - apps/web/src/modules/g11/**
    - docs/spec/manifest.json
  constraints:
    - Keep web hygiene clean: no TypeScript any, as any, console.log, or localhost in apps/web.
    - UI proves operational status; it is not a marketing page.
    - PH-09E remains auto only while the executable oracle is complete.
  freedom:
    - Add G10/G11 UI workspaces, client fixtures, web tests, verdict, and manifest evidence.
  evidence_required:
    - apps/web/src/modules/g10/PayrollWorkspace.tsx
    - apps/web/src/modules/g11/PensionWorkspace.tsx
    - apps/web/test/ph09-compensation-wave.test.cjs
    - docs/spec/ph-09-verdict.md
    - docs/spec/manifest.json records PH-09 and PH-09A..PH-09E
    - `bash docs/spec/pipeline/checks/ph-09e.sh` GREEN
  escalate_when:
    - Full API/web regression remains RED after repair.
