# PH-16 (Remediation Tranche 3) — Human-Gate Verdict

**Date:** 2026-07-03
**Chains from:** `docs/spec/ph-15-verdict.md` (tranche 2)
**Baseline:** `docs/reviews/brd-coverage-delta-20260703.md`
**Branch:** ph02-rerun (merged to main per sub-phase)

## Suite evidence (oracle-recomputed)

- API `npm test`: **384 pass**, 0 fail, 1 skipped (the DATABASE_URL-gated PH-06 persistence test).
- Web `npm run web:test`: **121 pass**, 0 fail.
- `npm run typecheck` and `npm run web:typecheck`: green.

All six PH-16A..F oracles were run **externally** by the driver and are GREEN; each carries at least
one fail-closed negative asserted via `error.code ===` in an executed `ph16*-*.test.cjs` file.

> **GREEN here is necessary, not sufficient.** A GREEN oracle means the tranche's named behaviors are
> built and tested; it does NOT mean the BRDs are complete. This gate requires a human to review the
> residual gaps below before the pipeline advances.

## What tranche 3 closed (delta vs the 2026-07-03 baseline)

| Module | Closed in PH-16 | Evidence |
|---|---|---|
| **G01** | dedup_candidates matcher + alias-transparent merge (RECORDS_MERGED, windowed undo), bulk import PROVISIONAL→promote-active with remediation queue, lifecycle separate/reactivate/archive guards | `ph16a-g01-dedup-import-lifecycle.test.cjs`, migration 0028 |
| **G02** | bulk_correction_batches (dry-run→P01→per-row commit→PARTIAL_FAILED), cr_risk_signals (DUPLICATE_BANK_ACCOUNT, AUTH_CHANNEL_THEN_FINANCIAL) with ERR-G02-RISKBLOCK, ERR-G02-STATUSGATE + DECEASED elevation | `ph16b-g02-bulk-risk-statusgate.test.cjs`, migration 0029 |
| **G04** | sr_event_mapping versioned catalog (ERR-G04-MAPPING-OVERLAP, VAL-G04-CITATION, pinned_mapping_version), relay_partition_lease + JOB-G04-REAPER, prepension_certificate (SHA-256, zero-open-findings gate) | `ph16c-g04-catalog-lease-certificate.test.cjs`, migration 0030 |
| **G05** | vacancy_positions/reservations with PH-08A strength read-through (ERR-G05-VACANCY-FULL), counselling turn engine (ERR-G05-COUNSEL-TURN, AUTO_PASS_TIMEOUT), MUTUAL_TRANSFER pairing (ERR-G05-MUTUAL-PAIR) | `ph16d-g05-counselling-vacancy-mutual.test.cjs`, migration 0031 |
| **G07** | credential_verifications ledger (VAL-G07-CREDREF dup guard, verifier SoD), training_sponsorships bonds (BREACHED→BOND_RECOVERY→RECOVERED gated by VAL-G07-BOND) | `ph16e-g07-g08-depth.test.cjs`, migration 0032 |
| **G08** | calibration as ratified recommendation (ERR-G08-RATIFY, VAL-DISTRIB diagnostic), PIP header + pip_milestones lifecycle, probation_confirmations with probation_extension_max_months cap | `ph16e-g07-g08-depth.test.cjs`, migration 0032 |
| **G10** | loan_repayments instalment ledger (closure invariant, foreclosure, ERR-G10-RECOVERY-NET carryforward), Rule-3 perquisites (is_concessional, ERR-G10-PERQ-REFRATE), balanced gl_journals (total_debit/total_credit, POSTED→ACKNOWLEDGED), bank-file positive-pay SUSPECTED_PROCESSED hold | `ph16f-g10-g11-treasury.test.cjs`, migration 0033 |
| **G11** | pen_disbursing_authorities (pda_disbursement_model PDA_APPLIES_RELIEF, sandbox_certified go-live gate), pen_grievances (sla_due_at, VAL-COMMENT close guard), pen_audit_objections (calc_trace_ref, ACCEPTED_CORRECTED) | `ph16f-g10-g11-treasury.test.cjs`, migration 0033 |

## Remaining gaps (still open — this is NOT a 100% claim)

Tranche 3 did not close, and these remain `NOT_FOUND` / open for a later tranche:

- **G01**: Aadhaar vault tokenisation, phonetic/transliteration search, full privacy/DPDP console.
- **G02**: strong e-signature capture, grievance/objection window, retro-impact downstream fan-out, step-up auth.
- **G03**: leave year-close, encashment (LTC/retirement), full self-service forecast surface.
- **G04**: X.3 outbound framework (circuit-breaker/credentials), CI port-conformance gate.
- **G05**: interactive counselling UI, proof-of-service deeming, inter-se seniority sequencing.
- **G07**: LMS/xAPI integration, content/assessment-item bank, vendor empanelment.
- **G08**: continuous feedback/check-ins, multi-source 360, DSC/non-repudiation signing.
- **G09**: vigilance/sealed-cover register, evidence-vault listing, jurisdiction transfer/retiree bar.
- **G10**: full TDS engine edge cases, Form-16 Part-A remittance matching depth, GL→ERP posting.
- **G11**: treasury/PDA X.3 wire integration, DigiLocker/DBT delivery, death-detection/overpayment recovery.
- **G12/G13/G14**: offline-QR verification, real TSA binding; OCR/watermark/secure-sharing, real AV engine; NLQ, embedded BI, predictive+fairness, mobile briefing.

**Contract-op coverage caveat:** implemented routes still cover only a small fraction of the **1,306**
OpenAPI operations frozen in `docs/contracts/openapi/*.yaml`; most module route surface remains
unimplemented. "All oracles GREEN" reflects the tranche's targeted behaviors, not full API coverage.

## Recommendation for the human reviewer

Approve PH-16G to record the tranche as reviewed, OR direct a further tranche (PH-17) scoped from the
remaining-gaps list above. Note two carried engineering debts surfaced during the build:
1. The PH-16F G10/G11 repositories are in-memory only (Pg impls + the 0033 DDL are staged but not yet
   wired); and the `ph06-persistence` migration-list assertion froze at 0008 several tranches ago and
   should be refreshed when the persistence suite is next run against a live database.
2. PH-16E was completed by hand after the authoring subagent exhausted its credit budget mid-run.
