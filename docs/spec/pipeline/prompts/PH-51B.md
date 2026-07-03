# PH-51B — Tranche-38 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-51-verdict.md` for remediation tranche 38 (PH-51A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-50-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (489 / 37%) and the G04 outbound/relay route exposure; carries a **G04** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-51b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
