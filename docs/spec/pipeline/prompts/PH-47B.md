# PH-47B — Tranche-34 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-47-verdict.md` for remediation tranche 34 (PH-47A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-46-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (462 / 34.9%) and the G11 PDA/verification route exposure; carries a **G11** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-47b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
