# PH-23 (Remediation Tranche 10) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-22-verdict.md` (tranche 9)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **435 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-23A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph23*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 10 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-23 | Evidence |
|---|---|---|
| **G04** | X.3 outbound integration framework — connector with circuit breaker (CLOSED→OPEN short-circuit), retry/permanent classification, payload versioning, conformance self-test | `ph23a-g04-outbound.test.cjs` |
| **G11** | DigiLocker / DBT delivery — digital_deliveries status machine (QUEUED→DELIVERED / retry / DEAD_LETTER), DBT credit status | `ph23b-g11-digital-delivery.test.cjs` |
| **G01** | phonetic / transliteration search — Soundex index with Indic-Latin normalisation, homophone matching | `ph23c-g01-phonetic-search.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 10 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, retro-impact fan-out.
- **G03**: backdated-leave team-calendar conflict threshold, punch anomaly review depth.
- **G04**: CI port-conformance gate in the build pipeline (the runtime conformance self-test exists).
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow, correction cascade recompute.
- **G07**: content/assessment-item bank.
- **G08**: calibration analytics depth.
- **G09**: POSH conciliation depth, evidence-vault UI listing.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: death-detection / overpayment recovery.
- **G12/G14**: offline-QR verification, real TSA; embedded BI, predictive+fairness, mobile briefing.
- **G13**: real AV/OCR engine binding (the OCR text is currently supplied, not extracted in a sandbox).

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-23D to record the tranche as reviewed, OR direct a further tranche (PH-24) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F..PH-23) use in-memory repositories only; and the `ph06-persistence` migration-list assertion
froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
