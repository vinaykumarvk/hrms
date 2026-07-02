# PH-15 Verdict — Remediation Tranche 2 (Coverage Delta Update, Human Gate)

**Date:** 2026-07-03
**Branch:** `ph02-rerun`
**Baseline this verdict updates:** `docs/reviews/brd-coverage-delta-20260703.md` (post PH-04→PH-10
gated rebuild delta; per-module NOT_FOUND backlog).
**Scope:** the PH-15 tranche (PH-15A..PH-15F) only — statutory/feature-depth remediation on
G10, G11, G03, G12, G13, G09, G06. This is the PH-15G human-gate packet: it states what the
tranche closed with executed-test evidence, and what remains open from the delta's backlog.

## Honesty rules applied

- Every "closed" claim below maps to a PH-15A..F oracle assertion or an executed test in
  `apps/api/test/ph15a..f-*.test.cjs`. A fresh line-item recount of the ~1,400 BRD items was
  **not** performed; this remains a capability-level delta on top of the 2026-07-03 baseline.
- **No module is claimed 100% complete.** Every row names its remaining NOT_FOUND items,
  restated from the delta report's backlog.
- All six tranche oracles (`docs/spec/pipeline/checks/ph-15a.sh` .. `ph-15f.sh`) were re-run
  externally at verdict time on 2026-07-03: **all six GREEN**, no residual RED.

## Suites (executed 2026-07-03, counts verbatim from the runners)

- `npm run typecheck` — green; `npm test` — **323 pass** (324 tests, 1 skipped, 0 fail).
  Baseline was 279 pass; the tranche adds 44 executed behavioral tests across the six ph15
  test files (7 + 6 + 7 + 6 + 5 + 13).
- `npm run web:typecheck` — green; `npm run web:test` — **121 pass** (0 fail). Unchanged from
  the baseline: this tranche shipped API/domain depth only; no web surfaces were added, so the
  web suite count is intentionally flat.

## Per-module delta — what PH-15A..F closed vs what remains

### G10 Payroll — tax/TDS engine, Form-16, Form-24Q (PH-15A)

| Closed by this tranche | Evidence |
|---|---|
| Tax declarations with regime pipeline, TDS projection over the payslip_lines YTD ledger, Form-16 tie-out to the ledger with Part A gated on MATCHED statutory_remittances, Form-24Q quarterly aggregation, declaration cutoff lock | `apps/api/test/ph15a-g10-tax-tds.test.cjs` (7 tests); migration `apps/api/db/migrations/0022_g10_tax_tds_engine.sql`; oracle `ph-15a.sh` GREEN |

**Still open (NOT_FOUND) in G10:** bank-file DSC/positive-pay depth, loans/advances lifecycle,
perquisites valuation, GL posting/integration.

### G11 Pension — pensioner lifecycle and revisions (PH-15B)

| Closed by this tranche | Evidence |
|---|---|
| pen_pensioners created on PPO authorisation; life certificates with suspend-on-lapse (SUSPENDED_NO_LC) / release-on-submit; death → family-pension conversion (CONVERTED_TO_FAMILY); deterministic DA-relief / pay-commission revision batches with arrears and post-apply immutability | `apps/api/test/ph15b-g11-pensioner-lifecycle.test.cjs` (6 tests); migration `apps/api/db/migrations/0023_g11_pensioner_lifecycle_revisions.sql`; oracle `ph-15b.sh` GREEN |

**Still open (NOT_FOUND) in G11:** treasury/PDA interfaces, pensioner grievances, DigiLocker
integration.

### G03 Attendance/Leave — shifts, rosters, punch ingestion, comp-off (PH-15C)

| Closed by this tranche | Evidence |
|---|---|
| Roster overlap validation (VAL-G03-ROSTER-OVERLAP); append-only punch ledger with dedup + device auth + shift-anchored attendance_date derivation; comp_off_ledger with FIFO redemption and expiry | `apps/api/test/ph15c-g03-attendance-ops.test.cjs` (7 tests); migration `apps/api/db/migrations/0024_g03_attendance_ops.sql`; oracle `ph-15c.sh` GREEN |

**Still open (NOT_FOUND) in G03:** leave year-close processing, leave encashment.

### G12 Service Register — §65B certificates, subscriptions, LTV (PH-15D)

| Closed by this tranche | Evidence |
|---|---|
| sr_authenticity_certificates (§65B) binding content_digest + anchor + generated chain-of-custody with tamper refusal; sr_subscriptions with a per-subscriber cursored pull feed (no cross-subscriber leak); sr_ltv_renewals re-anchoring over existing anchors without rewriting history | `apps/api/test/ph15d-g12-admissibility.test.cjs` (6 tests); migration `apps/api/db/migrations/0025_g12_admissibility_longevity.sql`; oracle `ph-15d.sh` GREEN |

**Still open (NOT_FOUND) in G12:** offline QR verification of extracts, real RFC 3161 TSA
integration (interface stub only).

### G13 Document Vault — envelope encryption + DPDP DSR (PH-15E)

| Closed by this tranche | Evidence |
|---|---|
| Per-object AES-256-GCM DEKs wrapped behind an injectable KeyProvider (only wrapped_dek + kms_key_id persisted); key rotation re-wrap without rewriting ciphertext; wrong-key fail-closed; data_subject_requests with VAL-G13-LATTICE erasure precedence (EXEMPT_RETAINED, redaction-marker path) | `apps/api/test/ph15e-g13-envelope-dsr.test.cjs` (5 tests); migration `apps/api/db/migrations/0026_g13_envelope_encryption_dsr.sql`; oracle `ph-15e.sh` GREEN |

**Still open (NOT_FOUND) in G13:** OCR/search digitisation pipeline, e-sign PAdES-LTV,
watermarking/certified copies, external/controlled sharing links, real antivirus engine behind
the DI-11 seam (the KeyProvider itself is an injectable seam — no external KMS is wired).

### G09 Disciplinary — POSH/ICC, hearings, SLA pause (PH-15F)

| Closed by this tranche | Evidence |
|---|---|
| POSH/ICC route with committee composition validation; personal hearings with deny-with-reason; SLA pause/resume ledger with deadline recompute | `apps/api/test/ph15f-g09-posh-sla-g06-rota-quota.test.cjs` (13 tests, shared with G06); migration `apps/api/db/migrations/0027_g09_posh_hearings_sla_pause_g06_rota_quota.sql`; oracle `ph-15f.sh` GREEN |

**Still open (NOT_FOUND) in G09:** vigilance register, evidence-vault listing.

### G06 Promotion — rota-quota (PH-15F)

| Closed by this tranche | Evidence |
|---|---|
| Multi-stream rota-quota seniority construction with rotation trace and input guards | `apps/api/test/ph15f-g09-posh-sla-g06-rota-quota.test.cjs` (13 tests, shared with G09); migration `apps/api/db/migrations/0027_g09_posh_hearings_sla_pause_g06_rota_quota.sql`; oracle `ph-15f.sh` GREEN |

**Still open (NOT_FOUND) in G06:** sealed cover full procedure, correction cascade, career paths.

## Remaining backlog in modules this tranche did NOT touch

Restated from `docs/reviews/brd-coverage-delta-20260703.md` — these remain open gaps, unmoved:
G01 (Aadhaar vault, dedup/merge, privacy/DPDP console, bulk import, lifecycle
separate/reactivate); G02 (bulk corrections, e-sign, fraud/velocity, grievance, retro-impact
fan-out, step-up auth); G04 (mapping catalog, partition leases/reaper, conformance gate,
pre-pension certificate); G05 (counselling, drives, vacancy lifecycle, mutual transfer);
G07 (LMS/xAPI, credentials, sponsorship/bonds, DPDP retention); G08 (calibration, 360, PIP,
DSC signing, probation confirmation); G14 (NLQ, embedded BI, predictive+fairness, mobile
briefing, report builder).

## Cross-cutting caveat: contract-op coverage

Contract-op coverage remains a small fraction of the **1,306 OpenAPI operations** defined in the
contract — the tranche added targeted domain routes, not route-surface breadth. Nothing in this
verdict implies OpenAPI route-surface completeness; most of the 1,306 operations remain
unimplemented route surface.

## Necessary, not sufficient

A GREEN `ph-15g.sh` oracle (and green suites) is **necessary, not sufficient** for this gate.
PH-15G is a HUMAN gate: a human reviewer must read this verdict — the closed-vs-remaining rows,
the suite counts, and the contract-coverage caveat — before any approval token is created. Per
`docs/spec/pipeline/REBASELINE.md`, only a human creates `approvals/PH-15G.approved`. Nothing in
this verdict approves UAT sign-off, production cutover, migration execution, or deployment. The
remaining NOT_FOUND items named above require further gated tranches; the modules are **not**
BRD-complete.
