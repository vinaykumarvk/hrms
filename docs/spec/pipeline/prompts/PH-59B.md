# PH-59B — Tranche-46 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-59-verdict.md` for remediation tranche 46 (PH-59A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-58-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (543 / 41%) and the G06 succession/qualifying-service route exposure; carries a **G06** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-59b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
