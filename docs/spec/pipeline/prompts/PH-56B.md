# PH-56B — Tranche-43 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-56-verdict.md` for remediation tranche 43 (PH-56A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-55-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (526 / 39.8%) and the G10 engine-run route exposure; carries a **G10** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-56b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
