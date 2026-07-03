# PH-45B — Tranche-32 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-45-verdict.md` for remediation tranche 32 (PH-45A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-44-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (451 / 34.1%) and the G01 aadhaar/legal-hold route exposure; carries a **G01** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-45b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
