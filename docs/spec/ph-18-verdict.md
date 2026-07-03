# PH-18 (Remediation Tranche 5) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-17-verdict.md` (tranche 4)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **401 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-18A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph18*-*.test.cjs`. PH-18A..C were
built **by hand** — the authoring/execution subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 5 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-18 | Evidence |
|---|---|---|
| **G01** | aadhaar_vault — Verhoeff checksum validation, one-way salted-SHA-256 tokenisation (token + last-4 only, never the raw number), 4-eyes reveal (requester cannot self-approve) | `ph18a-g01-aadhaar-vault.test.cjs` |
| **G03** | attendance_exceptions (WFH, ON_DUTY/TOUR) with EXCEPTION_OVERLAP, WFH_CAP_EXCEEDED, DOCUMENT_REQUIRED (tour order-doc) | `ph18b-g03-attendance-exceptions.test.cjs` |
| **G05** | joining_sequence + inter-se seniority — deterministic sequence_no via a stable tie-break (order date, then service_no), duplicate-joiner guard, G06-consumable order | `ph18c-g05-joining-sequence.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 5 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: phonetic/transliteration search, dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, grievance/objection window, retro-impact fan-out, templates.
- **G03**: mass-leave/blackout windows, backdated-leave team-calendar conflict threshold.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow, correction cascade recompute, career-path/succession.
- **G07**: LMS/xAPI integration, content/assessment-item bank, vendor empanelment.
- **G08**: continuous feedback/check-ins, multi-source 360, DSC/non-repudiation signing.
- **G09**: POSH conciliation depth, jurisdiction transfer/retiree bar, evidence-vault UI.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection recovery.
- **G12/G13/G14**: offline-QR verification, real TSA; OCR/watermark/secure-sharing, real AV engine;
  NLQ, embedded BI, predictive+fairness, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-18D to record the tranche as reviewed, OR direct a further tranche (PH-19) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F/PH-17/PH-18) use in-memory repositories only; and the `ph06-persistence` migration-list
assertion froze at 0008 and should be refreshed when the persistence suite is next run against a live DB.
