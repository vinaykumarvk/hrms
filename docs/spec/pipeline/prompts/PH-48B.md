# PH-48B — Tranche-35 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-48-verdict.md` for remediation tranche 35 (PH-48A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-47-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (469 / 35.4%) and the G12 chain/verify route exposure; carries a **G12** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-48b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
