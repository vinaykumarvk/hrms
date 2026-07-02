/goal
  objective: Replace the static G14 analytics card with a real dashboard bound to the PH-10D KPI engine, and close
    the wave with an honest release-conformance verdict. The audit found "one static metric card" and marker-string
    self-certification. Build: dashboard tiles rendering live KPI values fetched from the KPI engine endpoints (no
    hardcoded figures, no marker paragraphs); drill-down that respects k-anonymity suppression (suppressed cells
    render the suppressed shape, never a raw small count, and drill paths cannot bypass it); a freshness panel
    showing real per-mart refresh state from datamart_refresh_logs (stale marts visibly flagged); canonical
    empty/loading/error/permission states; full API + web suites green; and docs/spec/ph-10-verdict.md — an honest
    coverage-delta for G12/G13/G14 against docs/reviews/brd-coverage-audit-20260702.md (moved vs still-open items,
    no inflated claims).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # baseline: G12 35/46, G13 28/43, G14 115/132 NOT_FOUND
    - docs/brd/v3/G14-dashboard-and-analytics.md       # dashboards/widgets, drill-through, suppression UX, freshness
    - apps/web/src/modules/g14/AnalyticsWorkspace.tsx  # static card to REPLACE (drop evidence-line/G14_READ_ONLY markers)
    - apps/web/src/api/hrmsClient.ts , apps/web/src/api/fixtureHrmsClient.ts   # client to extend with kpi/drill/freshness routes
    - apps/api/src/routes/g14.routes.ts (PH-10D engine endpoints) , apps/web/test/ph10-analytics-release.test.cjs
  constraints:
    - No skeleton UI and no marker strings: the workspace must fetch KPI values through hrmsClient and render what
      the engine returns; the oracle fails while the "evidence-line"/"G14_READ_ONLY" marker card remains.
    - Suppression is honoured end-to-end: the UI renders the engine's suppressed-cell shape (banded "<5" or
      suppressed placeholder) and never displays a raw count below k; a web test must assert a suppressed cohort
      renders suppressed and the raw number is absent from the output.
    - Drill-down surfaces only dimensions the scope policy allows and keeps suppression applied at every level.
    - Freshness panel binds to datamart_refresh_logs data (mart, last refresh time, status); it must not be a
      hardcoded "fresh" badge.
    - All four canonical states per surface; API errors surface as visible error states; no console.log; WCAG AA
      and keyboard/focus per project guidelines.
    - docs/spec/ph-10-verdict.md must reference brd-coverage-audit-20260702, cover G12, G13, and G14 separately,
      and enumerate remaining NOT_FOUND/open areas. Honesty over polish — an inflated verdict fails the human gate.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
    - This gate is HUMAN: GREEN oracle output is necessary, not sufficient; a human reviews UI evidence + verdict.
  work_loops:
    - name: Live dashboard + drill-down
      max_iterations: 8
      repeat_until: apps/web/src/modules/g14/** renders KPI tiles from engine responses via hrmsClient, drill-down
        respects suppression and scope, and the static marker card is gone.
      steps: [extend client with kpi/drill routes, tile rendering from live data, drill-down with suppression shape]
    - name: Freshness panel + states
      max_iterations: 5
      repeat_until: the freshness panel lists marts with real refresh timestamps/status from datamart_refresh_logs
        and stale marts are flagged; empty/loading/error/permission states exist on each surface.
      steps: [freshness route + panel, staleness flagging, canonical states]
    - name: Suites + verdict + oracle
      max_iterations: 4
      repeat_until: web tests assert suppressed rendering (raw small count absent), live KPI binding, and freshness
        binding; docs/spec/ph-10-verdict.md carries the honest G12/G13/G14 delta; `npm run typecheck`, `npm test`,
        `npm run web:typecheck`, `npm run web:test` all pass; `bash docs/spec/pipeline/checks/ph-10e.sh` GREEN.
      steps: [web tests, api regression, write verdict, run oracle, fix]
  evidence_required:
    - apps/web/src/modules/g14/**, apps/web/src/api/** (live-bound dashboard, no markers)
    - apps/web/test/*.test.cjs suppression + binding + freshness assertions; green api + web suites
    - docs/spec/ph-10-verdict.md coverage-delta vs the audit for G12/G13/G14
    - `bash docs/spec/pipeline/checks/ph-10e.sh` GREEN, then HUMAN gate review
  escalate_when:
    - An engine endpoint needed by a BRD-required widget does not exist (raise against PH-10D; do not fake data client-side).
    - Suppression shape for a widget type is not defined by BRD/design tokens (ask; do not invent a leaky rendering).
    - The verdict would need to claim coverage tests do not prove — record the smaller truthful number.
