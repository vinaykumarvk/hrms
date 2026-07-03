# PH-22 (Remediation Tranche 9) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-21-verdict.md` (tranche 8)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **427 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-22A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph22*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 9 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-22 | Evidence |
|---|---|---|
| **G08** | DSC / non-repudiation signing — digital_signatures (SHA-256 payload, signer identity), method policy (DSC/AADHAAR_ESIGN/HSM), action gate on certify/ratify/expunge | `ph22a-g08-digital-signature.test.cjs` |
| **G13** | OCR index + permission-aware search — clearance-filtered results, over-classified (SECRET+) exclusion with no content leak | `ph22b-g13-ocr-search.test.cjs` |
| **G14** | natural-language query — whitelisted-metric mapping, confidence gate (low → not executed), PII-stripped nl_query_log | `ph22c-g14-nl-query.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 9 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: phonetic/transliteration search, dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, retro-impact fan-out.
- **G03**: backdated-leave team-calendar conflict threshold, punch anomaly review depth.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow, correction cascade recompute.
- **G07**: content/assessment-item bank.
- **G08**: calibration analytics depth.
- **G09**: POSH conciliation depth, evidence-vault UI listing.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection recovery.
- **G12/G14**: offline-QR verification, real TSA; embedded BI, predictive+fairness, mobile briefing.
- **G13**: real AV/OCR engine binding (the OCR text is currently supplied, not extracted in a sandbox).

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-22D to record the tranche as reviewed, OR direct a further tranche (PH-23) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F..PH-22) use in-memory repositories only; and the `ph06-persistence` migration-list assertion
froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
