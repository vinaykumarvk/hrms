# PH-31 (Remediation Tranche 18) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-30-verdict.md` (tranche 17)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **475 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **127 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-31A..C oracles were run **externally** by the driver and are GREEN — a fourth
route-exposure pass. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 18 closed

| Module | Route added | Backing service |
|---|---|---|
| **G02** | `POST /api/v1/change-requests/{id}/retro-impact:fan-out` | `retroImpact` (PH-25B) |
| **G05** | `POST /api/v1/transfers/joining-sequence` | `joiningSequence` (PH-18C) |
| **G07** | `POST /api/v1/training/vendor-empanelments` | `vendorEmpanelment` (PH-20A) |

## Remaining gaps (still open — this is NOT a 100% claim)

- **Route exposure still to wire:** G02 changeEsignStepUp/changeRequestTemplate, G03 punchAnomaly, G06
  careerSuccession/correctionCascade, G07 lmsIntegration, G08 feedback360, G11 pensionTreasury grievances/
  objections, G12 timestampAuthority/offlineVerification, G13 certifiedCopy/ocrSearch, G14 predictive fairness.
- **Remaining UI surfaces:** G01 privacy/DPDP console, G06 sealed-cover UI, G14 embedded BI/mobile.
- **Deep engine depth:** G10 remaining TDS edge cases + Form-16 Part-A matching depth; G09 POSH conciliation
  depth; G04 CI port-conformance gate.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations; the route-exposure workstream moves this number tranche by tranche.

## Recommendation for the human reviewer

Approve PH-31D, OR direct a further tranche (PH-32). Route-exposure and the remaining UI surfaces remain
the two open workstreams. Carried debt (unchanged): the newest hand-built services use in-memory
repositories; the `ph06-persistence` migration-list assertion froze at 0008.
