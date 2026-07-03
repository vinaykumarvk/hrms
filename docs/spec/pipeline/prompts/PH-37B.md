# PH-37B — Tranche-24 verdict (human gate)

## Objective
Write an honest `docs/spec/ph-37-verdict.md` for remediation tranche 24 (PH-37A) and park for human approval.

## Constraints (the verdict oracle greps for these)
- Chains from `ph-36-verdict`; cites `brd-coverage-delta-20260703`.
- Names the contract-coverage gate and the measured coverage figure (29.6%).
- States the **exact** oracle-recomputed suite pass counts (API + web).
- Names remaining gaps; includes "necessary … not sufficient" and the (now quantified) contract-op caveat.
- No approval token minted by the agent — `gate: human`.

## Evidence required
- `bash docs/spec/pipeline/checks/ph-37b.sh` GREEN (external), suites green underneath.

## Escalate when
- Any suite is red (do not paper over a red suite in the verdict).
