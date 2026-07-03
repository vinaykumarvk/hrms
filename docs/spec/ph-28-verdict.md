# PH-28 (Remediation Tranche 15) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-27-verdict.md` (tranche 14)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **459 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **127 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-28A..C oracles were run **externally** by the driver and are GREEN. This tranche was a
**route-exposure pass**: each oracle asserts a real kernel route registered in the module's routes file
that calls the backing service, plus an API test that dispatches the route through `createFoundationApi`.
Built by hand — subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** This gate requires a human review before advancing.

## What tranche 15 closed (delta vs the PH-27 UI tranche)

The three PH-27 UI surfaces now have their backing `/api/v1` routes, so they run end-to-end (real
route → service → response), not only against the in-memory fixture:

| Module | Route | Backing service | Evidence |
|---|---|---|---|
| **G13** | `GET /api/v1/dsr` (DSR list) | `documentVault.listDataSubjectRequests` (PH-15E) | `ph28a-g13-dsr-route.test.cjs` |
| **G09** | `GET /api/v1/disciplinary/cases/{id}/evidence` | `disciplinary.listCaseEvidence` (new) | `ph28b-g09-evidence-route.test.cjs` |
| **G05** | `GET /api/v1/counselling-sessions/{id}` | `transferCounselling.getCounsellingSession` (PH-16D) | `ph28c-g05-counselling-route.test.cjs` |

The `adjudicateDsr` / choose-vacancy write routes already existed (PH-15E / PH-16D); this pass added
the read/list routes the consoles need to load.

## Remaining gaps (still open — this is NOT a 100% claim)

- **Route exposure for the remaining in-memory PH-16F..PH-26 services** (loans/GL, PDA, treasury,
  tax/TDS, GL→ERP, retro-impact, punch anomaly, death recovery, correction cascade, LMS, 360, DSC,
  OCR, TSA, predictive) — these are service+test complete but not all route-exposed.
- **G01**: privacy/DPDP console UI. **G06**: sealed-cover full workflow UI. **G14**: embedded BI, mobile.
- **G02**: additional fraud detectors. **G03**: backdated-leave team-calendar conflict threshold.
- **G04**: CI port-conformance gate. **G07**: content/assessment-item bank. **G08**: calibration
  analytics depth. **G09**: POSH conciliation depth. **G10**: remaining TDS edge cases, Form-16 Part-A
  matching depth.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`.

## Recommendation for the human reviewer

Approve PH-28D, OR direct a further tranche (PH-29). Continued route-exposure passes (wiring the
in-memory services onto `/api/v1` handlers) plus the remaining UI surfaces are the two open workstreams.
Carried debt (unchanged): the newest hand-built services use in-memory repositories; the
`ph06-persistence` migration-list assertion froze at 0008.
