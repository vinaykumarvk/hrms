# PH-36B — Tranche-23 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-36-verdict.md` for remediation tranche 23 (PH-36A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-35-verdict`; cites `brd-coverage-delta-20260703`.
- Carries a **G09** row and names the POSH **conciliation** work.
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes the "necessary … not sufficient" caveat and the 1,306 contract-op caveat.
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-36b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red (do not paper over a red suite in the verdict).
