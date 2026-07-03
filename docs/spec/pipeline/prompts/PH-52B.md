# PH-52B — Tranche-39 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-52-verdict.md` for remediation tranche 39 (PH-52A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-51-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (495 / 37.4%) and the G06 sanctioned-post route exposure; carries a **G06** row.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-52b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
