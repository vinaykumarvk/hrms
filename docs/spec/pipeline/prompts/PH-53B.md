# PH-53B — Tranche-40 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-53-verdict.md` for remediation tranche 40 (PH-53A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-52-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (504 / 38.1%) and the G09 disciplinary route exposure; carries a **G09** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-53b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
