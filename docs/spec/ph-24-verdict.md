# PH-24 (Remediation Tranche 11) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-23-verdict.md` (tranche 10)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **442 pass**, 0 fail, 1 skipped (DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` / `npm run web:typecheck`: green.

All three PH-24A..C oracles were run **externally** by the driver and are GREEN; each carries a
fail-closed negative asserted via `error.code ===` in an executed `ph24*-*.test.cjs`. Built by hand —
subagents remain credit-exhausted until 2026-07-08.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 11 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-24 | Evidence |
|---|---|---|
| **G11** | proactive death detection + overpayment recovery — death-registry reconciliation suspends disbursement, overpayment_recoveries with bounded estate/family recovery (over-recovery barred) | `ph24a-g11-death-recovery.test.cjs` |
| **G06** | correction lineage + recompute cascade — correction_events, UNDER_CORRECTION marker, deterministic re-rank into a new versioned snapshot, non-FINALISED guard | `ph24b-g06-correction-cascade.test.cjs` |
| **G12** | offline-QR independent verification — bundle binds entry hash + anchor ref under SHA-256, tamper detection without the live ledger | `ph24c-g12-offline-qr.test.cjs` |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 11 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: dedup ML matcher depth, privacy/DPDP console UI.
- **G02**: extra fraud detectors, retro-impact fan-out.
- **G03**: backdated-leave team-calendar conflict threshold, punch anomaly review depth.
- **G04**: CI port-conformance gate in the build pipeline.
- **G05**: interactive counselling UI, proof-of-service deeming automation.
- **G06**: sealed-cover full workflow (partial), career-path projections.
- **G07**: content/assessment-item bank.
- **G08**: calibration analytics depth.
- **G09**: POSH conciliation depth, evidence-vault UI listing.
- **G10**: full TDS edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G13**: real AV/OCR engine binding.
- **G14**: embedded BI, predictive+fairness, mobile briefing.
- **G12**: real RFC-3161 TSA binding (Merkle anchor exists; the timestamp authority is stubbed).

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`. "All oracles GREEN" reflects the tranche's
targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-24D to record the tranche as reviewed, OR direct a further tranche (PH-25) scoped from the
remaining-gaps list above. Carried engineering debts (unchanged): the newest hand-built services
(PH-16F..PH-24) use in-memory repositories only; and the `ph06-persistence` migration-list assertion
froze at 0008 and should be refreshed when the persistence suite next runs against a live DB.
