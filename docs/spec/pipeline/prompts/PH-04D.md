/goal
  objective: Produce the PH-04 API CONFORMANCE AND FREEZE PACKET honestly. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) showed the previous verdict self-certified a thin slice
    while ~84% of BRD line items were unimplemented. The re-baselined oracle now computes contract
    coverage itself (implemented route registry diffed against every operation in
    docs/contracts/openapi/*.yaml) and REQUIRES docs/spec/ph-04-verdict.md to state the oracle's own
    numbers. Your job is to run that computation, write a truthful packet, and hand it to the human gate.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - docs/spec/pipeline/checks/ph-04d.sh              # the oracle — run it to get the numbers; never edit it
    - apps/api/src/routes/*.routes.ts                  # the implemented registry the oracle parses
    - docs/contracts/openapi/*.yaml                    # P01 + G01..G14 contract operations
    - docs/contracts/error-taxonomy.yaml
    - apps/api/test/ph04-contract-conformance.test.cjs
  audit_gaps:                                          # what a freeze packet must never repeat
    - The prior verdict declared PH-04 met based on marker greps; it did not state how many contract
      operations were actually implemented, so the human gate approved a scaffold as a build.
    - Route drift was invisible: implemented convenience routes (e.g. */summary slices) exist in no
      contract, and no one reported them.
  constraints:
    - HONESTY IS THE DELIVERABLE. Run `bash docs/spec/pipeline/checks/ph-04d.sh` and copy ITS coverage
      percentage, per-contract rows, and `unmatched_implemented` drift count into the verdict verbatim.
      Do not round differently, re-derive, or editorialise the numbers upward.
    - The verdict must contain: (1) a per-module coverage table with a row for P01 and G01..G14
      (implemented/total operations and %), (2) the overall coverage % exactly as the oracle prints it,
      (3) a line `unmatched_implemented: <N>` with the oracle's drift count and the drifting routes named,
      (4) a named-gaps section (what is NOT implemented, per module, grounded in the audit), and
      (5) an explicit recommendation to the human gate (freeze scope vs continue).
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/ — the human records the gate decision.
    - Do NOT change app code to inflate coverage in this phase; PH-04D is evidence-only. If typecheck or
      tests fail, fix-forward belongs to the owning sub-phase (PH-04A/B/C) — report, quarantine, escalate.
    - No console.log, no stack traces in any output artefact, secrets via env (unchanged code).
  work_loops:
    - name: run the independent conformance computation
      max_iterations: 3
      repeat_until: `npm run -s typecheck` and `npm test` pass, and `bash docs/spec/pipeline/checks/ph-04d.sh`
        has been executed with its per-contract ROW lines, DRIFT lines, overall COVERAGE %, and UNMATCHED
        count captured from stdout.
      steps: [npm run -s typecheck, npm test, run the oracle, capture its printed numbers]
    - name: write the honest freeze packet
      max_iterations: 4
      repeat_until: docs/spec/ph-04-verdict.md (>=1500 bytes) contains the coverage table for P01+G01..G14,
        the oracle's overall percentage string, the `unmatched_implemented: N` line, the named per-module
        gap list, and the freeze recommendation — and re-running the oracle prints GREEN.
      steps: [draft table from ROW lines, list drift routes, write gaps from the audit + oracle output,
        state recommendation, re-run oracle]
    - name: conformance regression evidence
      max_iterations: 3
      repeat_until: apps/api/test/ph04-contract-conformance.test.cjs still passes inside `npm test` and the
        final oracle run is GREEN with its output stored in the phase log.
      steps: [npm test, rerun oracle, attach outputs]
  evidence_required:
    - docs/spec/ph-04-verdict.md                        # coverage table, drift, gaps, recommendation
    - captured stdout of `bash docs/spec/pipeline/checks/ph-04d.sh` (GREEN) and of `npm test`
    - list of drifting implemented routes with a disposition each (amend contract vs remove later)
  escalate_when:
    - The oracle reports RED because typecheck/tests fail — the fix belongs to PH-04A/B/C, not to this
      packet; stop and report which sub-phase owns it.
    - Contract files fail to parse or contradict each other (contract amendment needed before freeze).
    - Coverage is so low the human gate cannot reasonably freeze — say so explicitly in the
      recommendation rather than softening the numbers.
