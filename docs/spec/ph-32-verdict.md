# PH-32 (Remediation Tranche 19) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-31-verdict.md` (tranche 18)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **481 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **127 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-32A..C oracles were run **externally** by the driver and are GREEN — a fifth
route-exposure pass. Built by hand — subagents credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** Human review required before advancing.

## What tranche 19 closed

| Module | Routes added | Backing service |
|---|---|---|
| **G06** | `POST /api/v1/promotions/career-paths`, `POST /api/v1/promotions/seniority-lists:finalise` | `careerSuccession` (PH-19C), `correctionCascade` (PH-24B) |
| **G12** | `POST /api/v1/sr/timestamp`, `POST /api/v1/sr/verification-bundle` | `timestampAuthority` (PH-26B), `offlineVerification` (PH-24C) |
| **G13** | `POST /api/v1/documents/{id}/certified-copies`, `GET /api/v1/documents:ocr-search` | `certifiedCopy` (PH-20B), `ocrSearch` (PH-22B) |

## Remaining gaps (still open — this is NOT a 100% claim)

- **Route exposure still to wire:** G02 changeEsignStepUp/changeRequestTemplate, G03 punchAnomaly,
  G07 lmsIntegration, G08 feedback360, G11 pensionTreasury grievances/objections, G14 predictive fairness.
- **Remaining UI surfaces:** G01 privacy/DPDP console, G06 sealed-cover UI, G14 embedded BI/mobile.
- **Deep engine depth:** G10 remaining TDS edge cases + Form-16 Part-A matching depth; G09 POSH conciliation
  depth; G04 CI port-conformance gate.

**Contract-op coverage caveat:** implemented routes still cover only a fraction of the **1,306** OpenAPI
operations; the route-exposure workstream moves this number tranche by tranche.

## Recommendation for the human reviewer

Approve PH-32D, OR direct a further tranche (PH-33). The route-exposure backlog is now short (a handful
of services), after which the remaining UI surfaces and deep-engine items are the last workstreams.
Carried debt (unchanged): the newest hand-built services use in-memory repositories; the
`ph06-persistence` migration-list assertion froze at 0008.
