# PH-64B — Tranche-51 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-64-verdict.md` for remediation tranche 51 (PH-64A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-63-verdict`; cites `brd-coverage-delta-20260703`.
- Names the net-new education register work (564 / 42.6%, is_highest); carries a **G01** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-64b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
