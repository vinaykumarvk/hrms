# PH-61B — Tranche-48 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-61-verdict.md` for remediation tranche 48 (PH-61A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-60-verdict`; cites `brd-coverage-delta-20260703`.
- Names the coverage ratchet (552 / 41.7%) and the G12/G13 admissibility/OCR route exposure; carries **G12** and **G13** rows.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the quantified contract-op caveat (1,323).
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-61b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red, or coverage did not actually advance.
