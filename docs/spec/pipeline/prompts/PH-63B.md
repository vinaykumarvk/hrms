# PH-63B — Tranche-50 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-63-verdict.md` for remediation tranche 50 (PH-63A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-62-verdict`; cites `brd-coverage-delta-20260703`.
- Names the net-new emergency-contact register work (560 / 42.3%); carries a **G01** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-63b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
