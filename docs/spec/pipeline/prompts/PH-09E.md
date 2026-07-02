/goal
  objective: Replace the G10/G11 read-only summary cards with the real compensation-wave UI and produce an honest
    conformance verdict. The audit classed every G10/G11 user-facing FR as UI-MISSING (metric cards only, the
    "no skeleton UI" rule inverted). Build: a payslip view rendering component lines with masked PAN and masked bank
    account; a payroll run console with the lifecycle actions (create -> lock snapshot -> compute -> reconcile ->
    approve -> lock -> disburse) wired to the real API; a pension case UI plus a benefit-estimator form posting to
    the estimation endpoint; canonical empty/loading/error/permission states on every surface; and
    docs/spec/ph-09-verdict.md — an honest coverage-delta against docs/reviews/brd-coverage-audit-20260702.md
    (what moved from NOT_FOUND, what remains open; no 100% claims).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # UI-MISSING findings for G10/G11; the baseline the verdict must delta against
    - docs/brd/v3/G10-payroll-and-benefits.md , docs/brd/v3/G11-retirement-and-pension.md   # screens, states, masking rules (P02)
    - apps/web/src/modules/g10/PayrollWorkspace.tsx , apps/web/src/modules/g11/PensionWorkspace.tsx   # stubs to REPLACE (drop the evidence-line marker cards)
    - apps/web/src/api/hrmsClient.ts , apps/web/src/api/fixtureHrmsClient.ts   # client to extend with run-lifecycle + payslip + estimator routes
    - apps/api/src/routes/g10.routes.ts , apps/api/src/routes/g11.routes.ts    # PH-09B/C/D endpoints the UI must consume
    - apps/web/test/ph09-compensation-wave.test.cjs , apps/api/test/           # suites to extend
  constraints:
    - No skeleton UI: real fields, real API calls through hrmsClient, real rendered data, and all four canonical
      states (empty/loading/error/permission) per surface. Do not keep the marker "evidence-line" paragraphs.
    - Masking is P02-driven and fail-closed: PAN and bank account render masked by default; the raw value never
      reaches the DOM for an ungranted actor — assert this in a web test (masked shown, raw absent).
    - The run console exposes only lifecycle actions valid for the current run state; invalid actions are disabled
      or absent, and API rejections surface as user-visible error states (no swallowed errors, no console.log).
    - The estimator form validates inputs client-side and round-trips the server estimate; it never computes
      statutory figures in the browser.
    - docs/spec/ph-09-verdict.md must reference brd-coverage-audit-20260702, tabulate per-module (G10, G11) items
      moved vs still-open, and list remaining NOT_FOUND areas explicitly. Honesty over polish.
    - Keyboard/focus behaviour and WCAG AA contrast per project guidelines; use the existing design tokens.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
    - This gate is HUMAN: the check going GREEN is necessary, not sufficient; a human reviews the UI evidence.
  work_loops:
    - name: Payslip view + run console (G10)
      max_iterations: 8
      repeat_until: apps/web/src/modules/g10/** renders payslip component lines with masked PAN/account and a run
        console driving the full lifecycle against the API, with empty/loading/error/permission states.
      steps: [extend hrmsClient + fixture client, payslip view with masking, run console actions, states]
    - name: Pension case UI + estimator (G11)
      max_iterations: 6
      repeat_until: apps/web/src/modules/g11/** renders the pension case surface and a working estimator form that
        posts to the estimation endpoint and renders the returned scheme-correct figures, with canonical states.
      steps: [pension case surface, estimator form + validation, states]
    - name: Suites + verdict + oracle
      max_iterations: 4
      repeat_until: web tests assert masked-PAN rendering (raw PAN absent from output), lifecycle actions, and
        estimator round-trip; docs/spec/ph-09-verdict.md carries the honest coverage-delta; `npm run typecheck`,
        `npm test`, `npm run web:typecheck`, `npm run web:test` all pass; `bash docs/spec/pipeline/checks/ph-09e.sh` GREEN.
      steps: [web tests, api regression, write verdict, run oracle, fix]
  evidence_required:
    - apps/web/src/modules/g10/**, apps/web/src/modules/g11/**, apps/web/src/api/** (real UI, no marker cards)
    - apps/web/test/*.test.cjs masking + lifecycle + estimator assertions; green api + web suites
    - docs/spec/ph-09-verdict.md coverage-delta vs the audit
    - `bash docs/spec/pipeline/checks/ph-09e.sh` GREEN, then HUMAN gate review
  escalate_when:
    - A BRD screen requirement maps to multiple plausible surfaces with equal evidence (name the options, ask).
    - Masking rules for a field are not derivable from P02/BRD (do not guess exposure of PII).
    - The verdict delta would require claiming coverage that tests do not prove — write the smaller truthful number.
