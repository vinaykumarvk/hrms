/goal
  objective: Give the statutory wave (G05-G09) its REAL user-facing surface and an honest conformance verdict,
    then present the evidence at the human gate. The 2026-07-02 coverage audit found every module's web surface
    is a read-only metric card — the "no skeleton UI" rule inverted — and the prior verdict doc self-certified
    coverage that did not exist. Build:
    (1) G09 case workbench: complaint/case intake form + charge (article-of-charge) form, case list and detail
        with stage visibility,
    (2) G06 DPC screens: convene panel, and per-member verdict capture (each member's recommendation recorded
        individually, quorum visible),
    (3) G08 APAR forms: self-appraisal, RO assessment, and RvO review as real forms bound to the tier the
        actor holds,
    (4) G07 training nomination UI: nominate to a session/campaign with capacity/eligibility feedback.
    Every surface has loading, empty, and error states, real fields, real API calls through the shared API
    client, and honest failure rendering. Finish with docs/spec/ph-08-verdict.md rewritten as an HONEST
    coverage-delta against the audit — what this wave closed, what remains NOT_FOUND — for the human gate.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md        # the baseline the verdict must delta against
    - docs/brd/v3/G05..G09 *.md                          # screen-relevant FRs, states, role gates
    - apps/web/src/modules/g05..g09/*.tsx                # current read-only cards to replace/extend
    - apps/web/src/App.tsx , apps/web/src/  (api client, shell, routing)
    - apps/api/src/routes/g05..g09.routes.ts             # the real endpoints the UI must call
    - docs/spec/ph-08-verdict.md                         # to be rewritten honestly
  constraints:
    - No skeleton UI: every form submits to a real API route and renders the server's success/error result;
      domain error codes (e.g. QUORUM_NOT_MET, ERR-G09-AUTHORITY-NOT-COMPETENT) surface as readable messages,
      never raw stack traces or swallowed failures.
    - Canonical states: each new surface implements loading, empty, and error states; keyboard-operable
      controls with labelled fields (WCAG AA basics).
    - Role/SoD awareness in UI: an APAR appraisee does not see RO/RvO authoring controls; DPC verdict capture
      is per-member for panel members only.
    - The verdict doc must CITE docs/reviews/brd-coverage-audit-20260702.md and state the per-module delta
      (closed vs remaining NOT_FOUND areas) truthfully — a verdict claiming full coverage contradicting the
      audit is a gate failure. This subphase's gate is HUMAN: the verdict + green suites are the packet the
      reviewer approves; do not self-approve.
    - No production console.log; no hardcoded localhost in production paths; no `any`/`as any`.
    - Do NOT weaken oracles: no edits to docs/spec/pipeline/checks/**, docs/spec/pipeline/phases.yaml,
      .state/**, approvals/**, or other phases' prompt files.
  work_loops:
    - name: G09 workbench + G06 DPC screens
      max_iterations: 6
      repeat_until: g09 module has intake + charge forms wired to the API with loading/empty/error states;
        g06 module has DPC convening and per-member verdict capture with quorum visibility.
      steps: [g09 intake form, g09 charge form + case detail, g06 DPC convene, g06 per-member verdict capture, states]
    - name: G08 APAR forms + G07 nomination UI
      max_iterations: 6
      repeat_until: g08 module has self/RO/RvO forms gated by the actor's tier; g07 module has a nomination
        form with capacity/eligibility feedback; all with loading/empty/error states.
      steps: [APAR self form, RO/RvO forms + tier gating, training nomination form, states]
    - name: conformance + verdict + gate packet
      max_iterations: 4
      repeat_until: apps/web/test/ph08f-statutory-ui.test.cjs exercises the new surfaces incl. at least one
        error-state rendering; `npm run typecheck`, `npm test`, `npm run web:typecheck`, `npm run web:test` all
        pass; docs/spec/ph-08-verdict.md is rewritten citing the audit with the honest per-module coverage
        delta and remaining NOT_FOUND areas; `bash docs/spec/pipeline/checks/ph-08f.sh` GREEN.
      steps: [web tests incl. error state, run all four suites, rewrite verdict honestly, run ph-08f.sh, assemble human-gate packet]
  evidence_required:
    - apps/web/src/modules/g06..g09 with real forms, API wiring, and loading/empty/error states
    - apps/web/test/ph08f-statutory-ui.test.cjs
    - docs/spec/ph-08-verdict.md citing docs/reviews/brd-coverage-audit-20260702.md with the coverage delta
    - `npm run typecheck` + `npm test` + `npm run web:typecheck` + `npm run web:test` green; ph-08f.sh GREEN
    - human gate approval recorded by the reviewer (not by this agent)
  escalate_when:
    - A BRD verb maps to multiple plausible UI surfaces with equal evidence (per escalation contract rule 5).
    - An API route needed by a required screen does not exist and cannot be added without re-opening PH-08B..E scope.
    - The honest coverage delta shows a previously-approved subphase regressed (report; do not paper over).
