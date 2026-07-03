# PH-57B — Tranche-44 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-57-verdict.md` for remediation tranche 44 (PH-57A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-56-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (532 / 40.2%) and the G10 FnF/recovery route exposure; carries a **G10** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-57b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
