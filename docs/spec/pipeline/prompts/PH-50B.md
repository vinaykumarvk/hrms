# PH-50B — Tranche-37 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-50-verdict.md` for remediation tranche 37 (PH-50A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-49-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (482 / 36.4%) and the G03 leave/attendance route exposure; carries a **G03** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-50b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
