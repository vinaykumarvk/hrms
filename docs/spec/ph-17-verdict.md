# PH-17 (Remediation Tranche 4) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-16-verdict.md` (tranche 3)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **393 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-17A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph17*-*.test.cjs`. Note: PH-17A..C
were built **by hand** — the authoring/execution subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 4 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-17 | Evidence |
|---|---|---|
| **G03** | leave_year_close (simulate→commit, carry-forward/lapse/HPL-conversion), PENDING_LEAVE_BLOCKS_CLOSE + YEAR_ALREADY_CLOSED guards; leave_encashment with ENCASHMENT_CAP_EXCEEDED + NOT_ENCASHABLE | `ph17a-g03-yearclose-encashment.test.cjs` |
| **G02** | esignatures with SHA-256 payload hash-chain, apply/commit gate ERR-G02-ESIGN, method policy ERR-G02-ESIGN-METHOD; cr_step_up_events with ERR-G02-STEPUP on HIGH/STATUTORY self-service | `ph17b-g02-esign-stepup.test.cjs` |
| **G09** | vigilance_records (clearance_status transitions, integrity_grade, sealed_cover), fail-closed clearance lookup consumed by promotion/pension (NOT_CLEARED/sealed-cover blocks clearance) | `ph17c-g09-vigilance-register.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 4 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: Aadhaar vault tokenisation, phonetic/transliteration search, privacy/DPDP console.
- **G02**: fraud/velocity extra detectors, grievance/objection window, retro-impact fan-out, templates.
- **G03**: mass-leave/blackout, WFH/on-duty exceptions, backdated-leave team-calendar conflicts.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming, inter-se seniority sequencing.
- **G06**: sealed-cover full workflow, correction cascade recompute, career-path/succession.
- **G07**: LMS/xAPI integration, content/assessment-item bank, vendor empanelment.
- **G08**: continuous feedback/check-ins, multi-source 360, DSC/non-repudiation signing.
- **G09**: POSH conciliation depth, jurisdiction transfer/retiree bar, evidence-vault UI listing.
- **G10**: full TDS engine edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection recovery.
- **G12/G13/G14**: offline-QR verification, real TSA; OCR/watermark/secure-sharing, real AV engine;
  NLQ, embedded BI, predictive+fairness, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-17D to record the tranche as reviewed, OR direct a further tranche (PH-18) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged from tranche 3): the newest hand-built
services (PH-16F/PH-17A..C) use in-memory repositories only — Pg impls + migration DDL are partially
staged; and the `ph06-persistence` migration-list assertion froze at 0008 and should be refreshed when
the persistence suite is next run against a live database.
