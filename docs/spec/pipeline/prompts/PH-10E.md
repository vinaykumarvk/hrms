/goal
  objective: Complete PH-10E - add G14 UI proof, PH-10 verdict, manifest evidence, and full regression checks.
  context:
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - apps/web/src/modules/g14/**
    - docs/spec/manifest.json
  constraints:
    - Keep web hygiene clean: no TypeScript any, as any, console.log, or localhost in apps/web.
    - UI proves operational analytics/readiness status; it is not a marketing page.
    - Do not claim production cutover approval.
  freedom:
    - Add G14 UI workspace, client fixtures, web tests, verdict, manifest evidence, and state markers.
  evidence_required:
    - apps/web/src/modules/g14/AnalyticsWorkspace.tsx
    - apps/web/test/ph10-analytics-release.test.cjs
    - docs/spec/ph-10-verdict.md
    - docs/spec/manifest.json records PH-10 and PH-10A..PH-10E
    - `bash docs/spec/pipeline/checks/ph-10e.sh` GREEN
  escalate_when:
    - Full API/web regression remains RED after repair.
