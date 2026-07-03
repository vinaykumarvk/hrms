# PH-39B — Tranche-26 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-39-verdict.md` for remediation tranche 26 (PH-39A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-38-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (404 / 30.5%) and the PIP/probation route exposure; carries a **G08** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-39b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
