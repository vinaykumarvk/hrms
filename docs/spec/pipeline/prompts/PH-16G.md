/goal
  objective: Close remediation tranche 3 with an honest, oracle-checkable verdict. Write docs/spec/ph-16-verdict.md
    updating the coverage position against docs/reviews/brd-coverage-delta-20260703.md and docs/spec/ph-15-verdict.md
    for the eight modules this tranche touched (G01, G02, G04, G05, G07, G08, G10, G11): per-module rows stating
    what PH-16A..PH-16F closed (dedup/alias-merge + bulk import + lifecycle; bulk corrections + fraud/velocity +
    status gates; mapping catalog + leases/reaper + pre-pension certificate; counselling + vacancy lifecycle +
    mutual transfer; credentials/bonds + calibration/PIP/probation; loans/perquisites/GL/bank-file +
    PDA/grievances/objections) and what remains NOT_FOUND in each module from the delta's backlog (e.g. G01
    Aadhaar vault, privacy/DPDP console; G02 e-sign, grievance, retro-impact fan-out, step-up auth; G04
    conformance gate; G05 drives depth; G07 LMS/xAPI, DPDP retention; G08 360, DSC signing; G10 bank-file DSC
    depth remaining; G11 DigiLocker). The verdict must state the exact API and web test pass counts as reported
    by the suites at verdict time (the oracle recomputes both counts itself and fails if the verdict's numbers
    differ), and must carry the standing necessary-not-sufficient statement: a GREEN oracle at this human gate
    is necessary, not sufficient — the human reviews this verdict before any approval token is created.
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # the baseline delta (per-module backlog lists)
    - docs/spec/ph-15-verdict.md                       # tranche-2 verdict this one chains from (tone/structure)
    - docs/spec/pipeline/REBASELINE.md                 # standing rules: honest verdicts, human-only approvals
    - docs/spec/pipeline/checks/ph-16a.sh .. ph-16f.sh # what the tranche oracles actually enforced
    - apps/api/test/*.test.cjs , apps/web/test/*.test.cjs   # the executed evidence the counts come from
  constraints:
    - Honesty over polish: every "closed" claim must map to a PH-16A..F oracle assertion or an executed test;
      every module row must name its remaining NOT_FOUND items from the delta — an inflated verdict fails the
      human gate even with a GREEN oracle.
    - Run the suites and copy the reported pass counts into the verdict verbatim (the check recomputes
      `npm test` and `npm run web:test` pass counts and greps the verdict for the same numbers — stale or
      rounded numbers make the oracle RED).
    - The verdict must cite docs/reviews/brd-coverage-delta-20260703.md by name, contain a per-module row for
      each of G01, G02, G04, G05, G07, G08, G10, G11, name remaining gaps (no "100% complete" claims), and
      contain the necessary-not-sufficient statement for the human gate.
    - Also restate the still-open cross-cutting item: contract-op coverage remains a small fraction of the
      1,306 OpenAPI operations — do not imply route-surface completeness.
    - This phase writes documentation only: do NOT modify app code, tests, other phases' files, or any oracle
      under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
    - This gate is HUMAN: a GREEN ph-16g.sh is necessary, not sufficient; only a human creates
      approvals/PH-16G.approved.
  work_loops:
    - name: Evidence collection
      max_iterations: 3
      repeat_until: suite outputs captured (`npm run typecheck`, `npm test`, `npm run web:typecheck`,
        `npm run web:test`) with the exact pass counts recorded, and the PH-16A..F oracle outputs re-run and
        summarised (which assertions are GREEN, any residual RED named honestly).
      steps: [run four suites, record pass counts, re-run tranche oracles, list evidence]
    - name: Verdict document
      max_iterations: 4
      repeat_until: docs/spec/ph-16-verdict.md contains the delta citation, per-module closed-vs-remaining rows
        for all eight touched modules, the exact API and web pass counts, the contract-coverage caveat, and
        the necessary-not-sufficient statement; `bash docs/spec/pipeline/checks/ph-16g.sh` GREEN.
      steps: [draft verdict, verify numbers against suite output, run oracle, fix]
  evidence_required:
    - docs/spec/ph-16-verdict.md (the only file this phase creates)
    - `bash docs/spec/pipeline/checks/ph-16g.sh` GREEN (external oracle; not self-certified), then HUMAN review
  escalate_when:
    - A PH-16A..F oracle is RED at verdict time (report the RED honestly and stop; do not write a verdict that
      claims the tranche is complete).
    - The suites are not green underneath (fix belongs to the owning phase, not to this verdict; quarantine and
      report).
    - The verdict would need to claim coverage the tests do not prove — record the smaller truthful number.
    - A prior human gate token (approvals/PH-15G.approved or earlier) is missing when this phase is reached —
      report the sequencing breach to the driver; never create an approval token yourself.
