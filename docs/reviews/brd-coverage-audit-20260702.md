# HRMS BRD Coverage Audit — v3 (G01–G14)

**Date:** 2026-07-02
**Branch:** ph02-rerun
**Method:** `brd-coverage` line-item audit (14 parallel read-only auditors), each tracing every
acceptance criterion / business rule / edge case / failure-handling item in `docs/brd/v3/Gxx-*.md`
against `apps/api/src/modules/gxx/**`, `apps/web/src/modules/gxx/**`, `apps/api/src/platform/**`,
and the test suites. Verdicts: CONFIRMED (cited `file:line`) / PARTIAL / NOT_FOUND.

## Headline

The current build is a set of **thin happy-path vertical slices** — one narrow flow per module that
emits the expected audit/SR markers and is covered by a slice-scoped test. **The green test suite
(125 API + 32 web) exercises only those slices.** It is NOT evidence of BRD implementation: across the
14 modules, the large majority of line items are `NOT_FOUND`. "All green" reflects slice coverage, not
requirement coverage.

## Per-module coverage (line-item)

| BRD | Items | CONFIRMED | PARTIAL | NOT_FOUND | Implemented slice (what is real) |
|---|---:|---:|---:|---:|---|
| G01 Employee Profile | ~180 | ~12 | ~10 | ~158 | identity read + P02 masking + governed change→G12 SR |
| G02 Personal-Details Workflow | 118 | 14 | 16 | 88 | displayName change-request submit→approve→commit→SR + reversal |
| G03 Attendance & Leave | 118 | 9 | 12 | 97 | leave submit→reserve→approve→ledger debit→G04 relay; attendance capture |
| G04 Leave↔SR Integration | 62 | 8 | 6 | 48 | in-memory enqueue→idempotent G12 ingest→DLQ replay/discard→count |
| G05 Transfer/Relieving/Joining | 34* | 9 | 6 | 19 | admin transfer initiate→order→clearance→relieve/join→SR |
| G06 Promotion/Posting | 108 | 9 | 12 | 87 | seniority→DPC quorum→order→SR; bare MACP effect |
| G07 Training | 118 | 8 | 6 | 104 | nominate→approve→complete→certificate→SR |
| G08 Performance/APAR | 22 FR | 2 | 4 | 16 | linear APAR open→self→RO→RvO→AA→post-SR + sealed-cover |
| G09 Disciplinary | 96 | 12 | 9 | 75 | open case→charge→inquiry report→penalty→SR; appeal SET_ASIDE reversal |
| G10 Payroll | 111 | 8 | 6 | 97 | run lifecycle create→lock→compute→reconcile→approve→lock→disburse (in-memory) |
| G11 Retirement/Pension | 118 | 9 | 6 | 103 | case→verify→compute(one flat formula)→sanction→PPO→SR |
| G12 Service Register | 46 | 6 | 5 | 35 | append-only ingest + idempotency/dedup + pseudo-hash chain + timeline |
| G13 Document Vault | 43 | 9 | 6 | 28 | attach + versioning + legal-hold/retention + WORM disposal guard |
| G14 Dashboard/Analytics | 132 | 8 | 9 | 115 | 5 read-only marker endpoints + P02 check + one static metric card |

\* G05 audited at coarser (FR/capability) grain; others at AC/BR line-item grain.

**Aggregate:** roughly **1,400 line items, ~120 CONFIRMED (~9%), ~110 PARTIAL, ~1,170 NOT_FOUND (~84%).**

## Cross-cutting gaps (recur in nearly every module)

- **Persistence:** services use in-memory arrays; the SQL data model (`docs/data-model/*.sql`, incl. G14's
  24-table DDL) is largely **unconsumed** by runtime. Most owned entities have no repository.
- **UI:** every module's web surface is a read-only metric/summary card. No create/edit/approve forms,
  wizards, queues, or the required canonical states (empty/loading/error/permission). All user-facing
  FRs are UI-MISSING — this is the "no skeleton UI" rule inverted.
- **Workflow:** P01 flows are mostly single-step stubs; maker-checker/SoD, parallel topologies, SLA
  timers, escalation, delegation are absent.
- **Error taxonomy:** module `ERR-Gxx-*` codes are not emitted; only generic platform errors.
- **Jobs (X.1):** scheduled jobs (`JOB-Gxx-*`) are unregistered across modules.
- **Notifications (X.2):** statutory IN_APP+EMAIL templates largely unimplemented.
- **Statutory cores** (the reason these gov modules exist) are the biggest gaps: G10 rate-table/DSL/TDS/
  arrears/bank-file/GL; G11 scheme branching (OPS/NPS/UPS), commutation factor tables, family pension,
  GPF, disbursement; G09 full natural-justice chain (PI, suspension, show-cause, consultation, competence
  matrix, POSH); G06 sanctioned-posts/QSL/roster/rota-quota; G12 anchor/status-chain/attestation/§65B/LTV;
  G13 KMS/scan/OCR/e-sign/clearance/DPDP; G14 KPI engine/bitemporal/suppression/scope-policy.

## Verdict

**Not BRD-complete.** The build is a demonstrative scaffold proving the platform spine (workflow embed,
SR ledger, audit, masking, RLS) end-to-end through one flow per module. Closing the ~1,170 NOT_FOUND
items = the actual PH-04 (API) → PH-05 (UI) → PH-06–PH-10 (module waves) build, which is gated,
multi-phase, and involves human review gates, DB migrations, and statutory design decisions. It cannot
be responsibly auto-completed in a single unattended goal loop.

## Recommended path

Drive remediation **through the existing gated pipeline harness** (`docs/spec/pipeline/`), one module
wave at a time, each wave: real persistence + API + UI + statutory rules + tests, verified by an
external oracle and a human gate — not self-certified. Prioritise by statutory risk: the systems of
record and money/pension/disciplinary modules (G10, G11, G09, G12) first.
