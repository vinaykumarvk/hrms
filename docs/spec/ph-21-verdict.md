# PH-21 (Remediation Tranche 8) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-20-verdict.md` (tranche 7)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **421 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-21A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph21*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 8 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-21 | Evidence |
|---|---|---|
| **G07** | LMS/xAPI — learning_record_stores (single primary), lms_enrollments, idempotent xAPI statement ingestion (duplicate statement_id is a no-op), completion on the completed verb | `ph21a-g07-lms-xapi.test.cjs` |
| **G08** | multi-source feedback_360 — PEER/SUBORDINATE/CUSTOMER/MANAGER raters, MIN_RATERS release gate (anonymity), anonymised aggregate summary | `ph21b-g08-feedback-360.test.cjs` |
| **G09** | jurisdiction transfer (audited chain) + retiree Rule-9 four-year bar (ERR-G09-RETIREE-PROCEEDING-BARRED, sanction override) | `ph21c-g09-jurisdiction-retiree.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 8 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: phonetic/transliteration search, dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, retro-impact fan-out.
- **G03**: backdated-leave team-calendar conflict threshold, punch anomaly review depth.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow, correction cascade recompute.
- **G07**: content/assessment-item bank.
- **G08**: DSC/non-repudiation signing.
- **G09**: POSH conciliation depth, evidence-vault UI listing.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection recovery.
- **G12/G13/G14**: offline-QR verification, real TSA; OCR/secure-sharing, real AV engine;
  NLQ, embedded BI, predictive+fairness, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-21D to record the tranche as reviewed, OR direct a further tranche (PH-22) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F..PH-21) use in-memory repositories only; and the `ph06-persistence` migration-list assertion
froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
