/goal
  objective: Produce the PH-05 UI CONFORMANCE AND REVIEW PACKET honestly for the human gate. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) showed the previous verdict marker-matched words like
    "accessibility" while every module UI was a read-only metric card. The re-baselined oracle now counts
    for itself which of the 14 module surfaces implement the canonical loading/error/empty branches and
    REQUIRES docs/spec/ph-05-verdict.md to state that same count. Your job: close remaining state-branch
    gaps in shipped views, run the oracle, and write a truthful packet.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - docs/spec/pipeline/checks/ph-05e.sh              # the oracle — run it to get the numbers; never edit it
    - apps/web/src/modules/** , apps/web/src/workflow/** , apps/web/src/app/**
    - apps/web/test/ph05-ui-conformance.test.cjs
    - docs/spec/ph-05-verdict.md                       # rewrite as the honest packet
  audit_gaps:                                          # what this packet must never repeat
    - Prior verdict asserted conformance via marker words; it never stated which surfaces actually
      implement empty/loading/error/permission states, so a metric-card scaffold passed a "UI freeze".
    - The wildcard permissions grant and fixture-client wiring made every "state" unreachable in practice;
      the oracle now fails closed on both.
  constraints:
    - HONESTY IS THE DELIVERABLE. Run `bash docs/spec/pipeline/checks/ph-05e.sh` and copy ITS
      `state_coverage: N/14` count into the verdict verbatim; list per-module which state branches exist
      and which are missing. Do not claim a state the oracle did not find.
    - The verdict must contain: (1) a per-module row for G01..G14 (states implemented, API-backed or not,
      guarded or not), (2) the `state_coverage: N/14` line matching the oracle, (3) workflow inbox status,
      (4) an accessibility section reporting real keyboard/focus/contrast findings (name what was checked,
      not aspirations), (5) named remaining gaps (read-only surfaces, missing forms), and (6) a
      recommendation to the human gate (freeze vs continue) traceable to those findings.
    - Closing gaps is allowed ONLY as state-branch completion in already-shipped views (adding canonical
      loading/error/empty branches); building new module features here is scope creep — leave those as
      named gaps for PH-06+.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/ — the human records the gate decision.
    - No console.log, no hardcoded localhost, no fixture client outside src/api+tests, no wildcard
      permission grant — the oracle fails closed on each.
  work_loops:
    - name: close canonical state-branch gaps in shipped views
      max_iterations: 6
      repeat_until: every module surface under apps/web/src/modules/g01..g14 and the workflow inbox
        implements loading, error, and empty branches (canonical OperationalState kinds), and
        ph05-ui-conformance.test.cjs asserts them.
      steps: [run the oracle to list missing branches, add branches per module view, extend the
        conformance test, re-run]
    - name: full toolchain evidence
      max_iterations: 3
      repeat_until: `npm run -s typecheck`, `npm test`, `npm run -s web:typecheck`, and
        `npm run -s web:test` all pass with output captured.
      steps: [run all four commands, fix regressions inside PH-05 scope, capture output]
    - name: write the honest review packet
      max_iterations: 4
      repeat_until: docs/spec/ph-05-verdict.md (>=1500 bytes) contains the per-module table for G01..G14,
        the oracle's `state_coverage: N/14` line, the accessibility findings, the named remaining gaps,
        and the gate recommendation — and `bash docs/spec/pipeline/checks/ph-05e.sh` prints GREEN.
      steps: [capture oracle stdout, draft table + gaps from it and the audit, record accessibility
        findings, state recommendation, re-run oracle]
  evidence_required:
    - docs/spec/ph-05-verdict.md                       # per-module states, state_coverage line, gaps, recommendation
    - captured stdout of `bash docs/spec/pipeline/checks/ph-05e.sh` (GREEN) and the four toolchain runs
    - diff list of state-branch additions made during this phase (each traceable to an oracle RED line)
  escalate_when:
    - A module surface cannot gain real state branches because it has no API-backed data path at all —
      that is PH-06+ scope; record it as a named gap instead of faking branches.
    - Accessibility review finds a blocking defect (focus trap, unlabelled form control) outside PH-05
      files — report with file:line, do not silently patch other phases' scope.
    - The oracle stays RED after the loop budget for causes owned by PH-05A–D; name the owning sub-phase.
