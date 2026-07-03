# PH-19 (Remediation Tranche 6) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-18-verdict.md` (tranche 5)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **409 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-19A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph19*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 6 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-19 | Evidence |
|---|---|---|
| **G03** | blackout_periods (leave in-window barred, BLACKOUT_PERIOD) + mass_leave cohort batch with per-member RETURN_TO_WORK_PENDING gate | `ph19a-g03-blackout-massleave.test.cjs` |
| **G08** | continuous_feedback + check_ins — cycle-tied append-only inputs with a mandatory note | `ph19b-g08-continuous-feedback.test.cjs` |
| **G06** | career_paths + ordered career_path_stages; succession_plans + ranked succession_candidates with a duplicate-candidate guard | `ph19c-g06-career-succession.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 6 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: phonetic/transliteration search, dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, retro-impact fan-out, request templates.
- **G03**: backdated-leave team-calendar conflict threshold, punch anomaly review depth.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow, correction cascade recompute.
- **G07**: LMS/xAPI integration, content/assessment-item bank, vendor empanelment.
- **G08**: multi-source 360 aggregation, DSC/non-repudiation signing.
- **G09**: POSH conciliation depth, jurisdiction transfer/retiree bar, evidence-vault UI.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection recovery.
- **G12/G13/G14**: offline-QR verification, real TSA; OCR/watermark/secure-sharing, real AV engine;
  NLQ, embedded BI, predictive+fairness, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-19D to record the tranche as reviewed, OR direct a further tranche (PH-20) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F/PH-17/PH-18/PH-19) use in-memory repositories only; and the `ph06-persistence` migration-list
assertion froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
