# PH-44B — Tranche-31 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-44-verdict.md` for remediation tranche 31 (PH-44A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-43-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (443 / 33.5%) and the G13 checkout/read route exposure; carries a **G13** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-44b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
