/goal
  objective: Close remediation tranche 2 with an honest, oracle-checkable verdict. Write docs/spec/ph-15-verdict.md
    updating the coverage position against docs/reviews/brd-coverage-delta-20260703.md for the six modules this
    tranche touched (G03, G06, G09, G10, G11, G12, G13): per-module rows stating what PH-15A..PH-15F closed
    (tax/TDS + Form-16/24Q; pensioner lifecycle + revisions; shifts/rosters/punches/comp-off; 65B certificates +
    subscriptions + LTV; envelope encryption + DPDP DSR; POSH/ICC + hearings + SLA pause + rota-quota) and what
    remains NOT_FOUND in each module from the delta's backlog (e.g. G10 bank-file DSC/positive-pay depth, loans,
    perquisites, GL; G11 treasury/PDA, grievances, DigiLocker; G03 year-close, encashment; G12 offline QR, real
    TSA; G13 OCR/search, e-sign PAdES-LTV, watermarking, sharing, real AV; G09 vigilance register, evidence-vault
    listing; G06 sealed cover full, correction cascade, career paths). The verdict must state the exact API and
    web test pass counts as reported by the suites at verdict time (the oracle recomputes both counts itself and
    fails if the verdict's numbers differ), and must carry the standing necessary-not-sufficient statement: a
    GREEN oracle at this human gate is necessary, not sufficient — the human reviews this verdict before any
    approval token is created.
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # the baseline this verdict updates (per-module backlog lists)
    - docs/spec/pipeline/REBASELINE.md                 # standing rules: honest verdicts, human-only approvals
    - docs/spec/ph-10-verdict.md                       # tone/structure precedent for wave verdicts
    - docs/spec/pipeline/checks/ph-15a.sh .. ph-15f.sh # what the tranche oracles actually enforced
    - apps/api/test/*.test.cjs , apps/web/test/*.test.cjs   # the executed evidence the counts come from
  constraints:
    - Honesty over polish: every "closed" claim must map to a PH-15A..F oracle assertion or an executed test;
      every module row must name its remaining NOT_FOUND items from the delta — an inflated verdict fails the
      human gate even with a GREEN oracle.
    - Run the suites and copy the reported pass counts into the verdict verbatim (the check recomputes
      `npm test` and `npm run web:test` pass counts and greps the verdict for the same numbers — stale or rounded
      numbers make the oracle RED).
    - The verdict must cite docs/reviews/brd-coverage-delta-20260703.md by name, contain a per-module row for each
      of G03, G06, G09, G10, G11, G12, G13, name remaining gaps (no "100% complete" claims), and contain the
      necessary-not-sufficient statement for the human gate.
    - Also note the still-open cross-cutting item from the delta: contract-op coverage remains a small fraction of
      the 1,306 OpenAPI operations — do not imply route-surface completeness.
    - This phase writes documentation only: do NOT modify app code, tests, other phases' files, or any oracle
      under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
    - This gate is HUMAN: a GREEN ph-15g.sh is necessary, not sufficient; only a human creates
      approvals/PH-15G.approved.
  work_loops:
    - name: Evidence collection
      max_iterations: 3
      repeat_until: suite outputs captured (`npm run typecheck`, `npm test`, `npm run web:typecheck`,
        `npm run web:test`) with the exact pass counts recorded, and the PH-15A..F oracle outputs re-run and
        summarised (which assertions are GREEN, any residual RED named honestly).
      steps: [run four suites, record pass counts, re-run tranche oracles, list evidence]
    - name: Verdict document
      max_iterations: 4
      repeat_until: docs/spec/ph-15-verdict.md contains the delta citation, per-module closed-vs-remaining rows
        for all six touched modules plus G13, the exact API and web pass counts, the contract-coverage caveat,
        and the necessary-not-sufficient statement; `bash docs/spec/pipeline/checks/ph-15g.sh` GREEN.
      steps: [draft verdict, verify numbers against suite output, run oracle, fix]
  evidence_required:
    - docs/spec/ph-15-verdict.md (the only file this phase creates)
    - `bash docs/spec/pipeline/checks/ph-15g.sh` GREEN (external oracle; not self-certified), then HUMAN review
  escalate_when:
    - A PH-15A..F oracle is RED at verdict time (report the RED honestly and stop; do not write a verdict that
      claims the tranche is complete).
    - The suites are not green underneath (fix belongs to the owning phase, not to this verdict; quarantine and
      report).
    - The verdict would need to claim coverage the tests do not prove — record the smaller truthful number.
