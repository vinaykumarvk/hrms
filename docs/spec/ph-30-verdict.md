# PH-30 (Remediation Tranche 17) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-29-verdict.md` (tranche 16)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **472 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **127 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-30A..C oracles were run **externally** by the driver and are GREEN — a third
route-exposure pass. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 17 closed

| Module | Routes added | Backing service |
|---|---|---|
| **G01** | `POST /api/v1/employees/{id}/aadhaar-vault`, `GET /api/v1/employees:phonetic-search` | `aadhaarVault` (PH-18A), `phoneticSearch` (PH-23C) |
| **G03** | `POST /api/v1/atl/leave-year-close:commit`, `POST /api/v1/atl/attendance-exceptions`, `POST /api/v1/atl/blackout-periods` | `leaveYearClose` (PH-17A), `attendanceException` (PH-18B), `leaveBlackoutMass` (PH-19A) |
| **G08** | `POST /api/v1/apar/forms/{id}/e-signature`, `POST /api/v1/apar/continuous-feedback` | `digitalSignature` (PH-22A), `continuousFeedback` (PH-19B) |

## Remaining gaps (still open — this is NOT a 100% claim)

- **Route exposure still to wire:** G02 retroImpact/changeEsignStepUp/changeRequestTemplate, G03 punchAnomaly,
  G05 joiningSequence, G06 careerSuccession/correctionCascade, G07 vendorEmpanelment/lmsIntegration, G08
  feedback360, G12 timestampAuthority/offlineVerification, G13 certifiedCopy/ocrSearch, G14 predictive fairness
  report, G11 pensionTreasury grievances/objections.
- **Remaining UI surfaces:** G01 privacy/DPDP console, G06 sealed-cover UI, G14 embedded BI/mobile.
- **Deep engine depth:** G10 remaining TDS edge cases + Form-16 Part-A matching depth; G09 POSH conciliation
  depth; G04 CI port-conformance gate.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations; the route-exposure workstream moves this number tranche by tranche.

## Recommendation for the human reviewer

Approve PH-30D, OR direct a further tranche (PH-31). Route-exposure and the remaining UI surfaces remain
the two open workstreams. Carried debt (unchanged): the newest hand-built services use in-memory
repositories; the `ph06-persistence` migration-list assertion froze at 0008.
