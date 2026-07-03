# PH-25 (Remediation Tranche 12) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-24-verdict.md` (tranche 11)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **449 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-25A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph25*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 12 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-25 | Evidence |
|---|---|---|
| **G10** | GL→ERP posting export — gl_export_batches, idempotent post (repeat = no-op), ACK reconciliation (POSTED→ACKNOWLEDGED / MISMATCH), balance guard | `ph25a-g10-gl-erp.test.cjs` |
| **G02** | retro-impact downstream fan-out — retro_impact_events per target (G10/G11/G06), idempotent dispatch (PENDING→SENT→ACKED), DEAD_LETTER on exhaustion | `ph25b-g02-retro-impact.test.cjs` |
| **G03** | punch anomaly review — impossible-travel detection (haversine speed), punch_anomaly_reviews FLAGGED→CONFIRMED_FRAUD/VALID, self-review SoD block | `ph25c-g03-punch-anomaly.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 12 did not close, and these remain `NOT_FOUND` / open for a later tranche — the residual is
now dominated by UI surfaces, real-engine bindings, and deep analytics:

- **G01**: dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: additional fraud/velocity detectors.
- **G03**: backdated-leave team-calendar conflict threshold.
- **G04**: CI port-conformance gate in the build pipeline.
- **G05**: interactive counselling UI.
- **G06**: sealed-cover full workflow UI.
- **G07**: content/assessment-item bank.
- **G08**: calibration analytics depth.
- **G09**: POSH conciliation depth, evidence-vault UI listing.
- **G10**: remaining TDS edge cases, Form-16 Part-A remittance matching depth.
- **G13**: real AV/OCR engine binding.
- **G14**: embedded BI, predictive+fairness, mobile briefing.
- **G12**: real RFC-3161 TSA binding.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-25D to record the tranche as reviewed, OR direct a further tranche (PH-26) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F..PH-25) use in-memory repositories only; and the `ph06-persistence` migration-list assertion
froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
