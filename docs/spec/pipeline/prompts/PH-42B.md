# PH-42B — Tranche-29 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-42-verdict.md` for remediation tranche 29 (PH-42A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-41-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (430 / 32.5%) and the G07 credential/empanelment route exposure; carries a **G07** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-42b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
