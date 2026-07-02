# PH-10 Verdict — G12/G13/G14 Release Conformance (Coverage Delta vs Audit)

**Date:** 2026-07-03
**Branch:** `ph02-rerun`
**Baseline:** `docs/reviews/brd-coverage-audit-20260702.md` (line-item audit of docs/brd/v3, 2026-07-02)
**Scope of this verdict:** the PH-10 wave (PH-10A..PH-10E) only — G12 integrity, G13 vault hardening,
G14 analytics engine + dashboard UI. It supersedes the earlier self-certified PH-10 verdict, which
claimed release readiness from marker strings; this one reports deltas against the audit baseline.

## Honesty rules applied

- Deltas below are **capability-level**, grounded in shipped code and executed tests. A fresh
  line-item recount of every AC/BR was **not** performed; the audit's NOT_FOUND counts are restated
  as the baseline and only the capabilities demonstrably moved are claimed.
- **No 100% claim is made for any module.** Every section names its remaining NOT_FOUND areas.
- Stores remain in-memory behind repository interfaces. The SQL migrations (0018–0021) define the
  substrate and the Postgres repository seams exist, but Postgres is not the wired runtime default.
  Persistence therefore stays PARTIAL for all three modules.

## G12 Service Register — delta vs audit

Audit baseline: 46 items, 6 CONFIRMED / 5 PARTIAL / **35 NOT_FOUND**; gaps named:
"anchor/status-chain/attestation/§65B/LTV", pseudo-hash chain.

| Area (audit gap) | Now | Evidence |
|---|---|---|
| Pseudo-hash chain (pseudoHash64) | MOVED — real SHA-256 (`sha256Hex`, node crypto) over canonical content incl. server-stamped `recorded_at` trusted time | `apps/api/src/platform/types.ts`, `apps/api/src/modules/g12/serviceRegisterService.ts`, `apps/api/test/ph10a-integrity-substrate.test.cjs` |
| sr_status_events status chain | MOVED — hash-chained append-only sub-ledger; status changes are appends, never field updates | `apps/api/src/modules/g12/srIntegrity.ts`, PH-10A tests |
| Ledger verify + tamper detection | MOVED — verify endpoint recomputes both chains from stored content; a tampered copy FAILs at the offending sequence number; `JOB-G12-INTEGRITY` registered | `apps/api/src/modules/g12/srIntegrityService.ts`, `apps/api/src/routes/g12.routes.ts`, `apps/api/test/ph10b-integrity-pillars.test.cjs` |
| sr_anchors | MOVED — real pairwise-SHA-256 Merkle root over per-employee chain heads (`JOB-G12-ANCHOR`); **external RFC 3161 TSA remains an interface stub** | PH-10B tests |
| Completeness gap register | MOVED — sr_expected_event_rule + sr_gap_register with GAP_FLAGGED lifecycle via `JOB-G12-GAPSCAN` | PH-10B tests |
| Custodian attestation | MOVED — sr_attestations sign the chain head; SERVER_SIGNED banned for statutory attestations | PH-10B tests |
| Certified extracts | MOVED — sr_certified_extracts snapshot the P02-redacted rendering (fail-closed field mask + purpose policy) | PH-10B tests |
| Substrate DDL | PARTIAL — migrations `0018_g12_g13_integrity_substrate.sql`, `0019_g12_integrity_pillars.sql` exist; runtime stores in-memory | `apps/api/db/migrations/` |

**Still open (NOT_FOUND) in G12:** §65B (Indian Evidence Act) certificate generation for extracts;
LTV (long-term validation) of signatures/anchors; subscription/notification feeds on SR changes;
offline QR verification of extracts; real RFC 3161 TSA integration (stub seam only).

## G13 Document Vault — delta vs audit

Audit baseline: 43 items, 9 CONFIRMED / 6 PARTIAL / **28 NOT_FOUND**; gaps named:
"KMS/scan/OCR/e-sign/clearance/DPDP", checkIn mutating one record in place.

| Area (audit gap) | Now | Evidence |
|---|---|---|
| In-place version mutation | MOVED — append-only document_versions rows; prior versions immutable; checkout_locks reject conflicting writes (`ERR-G13-DOCUMENT_LOCKED`) | `apps/api/src/modules/g13/documentVaultService.ts`, `apps/api/test/ph10a-integrity-substrate.test.cjs` |
| Content integrity | MOVED — server-side SHA-256 `content_hash` over stored bytes (caller hash never trusted), re-verified on every fetch; mismatch withholds content (`ERR-G13-INTEGRITY_FAILED`) | `apps/api/src/modules/g13/documentSecurityRepository.ts`, `apps/api/test/ph10c-g13-vault-hardening.test.cjs` |
| Malware scan gate (DI-11) | MOVED — new content enters PENDING_SCAN (unfetchable), CLEAN promotes to ACTIVE, INFECTED quarantines (`ERR-G13-MALWARE_DETECTED`); **scan provider is an injectable fake, no real AV engine** | PH-10C tests |
| Clearance enforcement | MOVED — security_clearances with DENY-BY-DEFAULT classification gate (`ERR-G13-CLEARANCE_INSUFFICIENT`) | PH-10C tests |
| Access audit intent | MOVED — `:fetch?intent=` required (`ERR-G13-FETCH_INTENT_REQUIRED`); VIEW/DOWNLOAD events land on the hash-chained document_audit ledger | PH-10C tests |
| Disposition SoD | MOVED — retention classes with maker≠checker disposition (`ERR-G13-SOD_VIOLATION`); legal hold still blocks execution after approval | PH-10C tests |
| Substrate DDL | PARTIAL — migration `0020_g13_security_hardening.sql`; runtime stores in-memory | `apps/api/db/migrations/` |

**Still open (NOT_FOUND) in G13:** KMS envelope encryption / key rotation (no encryption at rest in
the runtime); scan/OCR ingestion pipeline (digitisation); e-sign integration; DPDP DSR
(data-subject request) workflows; external/controlled sharing links; real antivirus engine behind
the DI-11 seam.

## G14 Dashboard/Analytics — delta vs audit

Audit baseline: 132 items, 8 CONFIRMED / 9 PARTIAL / **115 NOT_FOUND**; audit finding: "5 read-only
marker endpoints + P02 check + **one static metric card**", 24-table DDL unconsumed, marker-string
self-certification.

| Area (audit gap) | Now | Evidence |
|---|---|---|
| KPI engine | MOVED — governed versioned kpi_definitions with explicit maker≠checker activation (`ERR-G14-PUBLISH-CHECKER`); only one ACTIVE version computes; cross-version aggregation blocked (`ERR-G14-XVER-AGG`) | `apps/api/src/modules/g14/analyticsEngineService.ts`, `apps/api/test/ph10d-g14-analytics-engine.test.cjs` |
| Bitemporal snapshots | MOVED — kpi_snapshots carry valid_time + knowledge_time; restatement appends superseding rows; as-of-knowledge query reproduces pre-restatement values (`ERR-G14-ASOF-NA`) | PH-10D tests |
| Mart refresh | MOVED — seeded MART_LEAVE/MART_ATTENDANCE/MART_APPRAISAL/MART_ESTABLISHMENT refreshed from module read surfaces under `JOB-G14-MART-*`, appending datamart_refresh_logs | PH-10D tests |
| k-anonymity suppression | MOVED — suppression_policies (default k=5) applied fail-closed at the query boundary: small cells return the suppressed shape (`ERR-G14-SMALL-CELL`), complementary suppression + withheld totals prevent recovery (`ERR-G14-COMP-SUPPRESS`) | PH-10D tests |
| Scope policies | MOVED — analytics_scope_policies with maker≠checker activation (`ERR-G14-SCOPE-CHECKER`) | PH-10D tests |
| Static metric card / marker UI | MOVED (PH-10E) — the `evidence-line` marker card and its G14 marker strings are deleted; the dashboard fetches live KPI values through the client (`/api/v1/analytics/kpis`, `/api/v1/analytics/aggregate`), drill-down re-queries the suppression boundary per dimension (identifying grains not offered), and the freshness panel binds datamart_refresh_logs with FAILED/SLA-breach stale flags; canonical loading/error/empty/no-permission states | `apps/web/src/modules/g14/AnalyticsWorkspace.tsx`, `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts`, `apps/web/test/ph10-analytics-release.test.cjs` |
| Suppression proven in the UI | MOVED (PH-10E) — NEGATIVE web test renders a suppressed cohort and asserts the suppression notice is shown while the raw small count is absent from the DOM (and from the wire shape) | `apps/web/test/ph10-analytics-release.test.cjs` ("NEGATIVE: a suppressed cohort renders suppressed…") |
| Substrate DDL | PARTIAL — migration `0021_g14_analytics_engine.sql` mirrors the entity set; runtime stores in-memory | `apps/api/db/migrations/` |

**Still open (NOT_FOUND) in G14:** NLQ (natural-language query); embedded/external BI embedding;
predictive/ML analytics; mobile dashboard surface; report builder, scheduled report delivery and
exports; dashboard composer/widget administration UI; a scope-policy **read** route (the drill-down
dimension allowlist is mirrored client-side because the engine exposes no GET for scope policies —
the server still re-checks scope on every aggregate read); per-domain suppression overrides beyond
the seeded default policy.

## Suites and gates (executed 2026-07-03)

- `npm run typecheck` — green; `npm test` — **279 pass, 1 skipped, 0 fail**
- `npm run web:typecheck` — green; `npm run web:test` — **121 pass, 0 fail** (baseline was 114;
  PH-10E adds the suppressed-cohort negative, live KPI/freshness binding, and canonical-state tests)
- `bash docs/spec/pipeline/checks/ph-10a.sh` … `ph-10e.sh` — external oracles, not self-certified

## Necessary, not sufficient

A GREEN `ph-10e.sh` oracle (and green suites) is **necessary but not sufficient** for this gate.
PH-10E is a HUMAN gate: a human reviewer must inspect the rendered dashboard evidence, the
suppression behaviour, and this coverage delta before the wave is accepted. Nothing in this verdict
approves UAT sign-off, production cutover, migration execution, or deployment — those remain
explicit human release decisions. The remaining NOT_FOUND areas named above (G12 §65B/LTV/
subscriptions/offline-QR, G13 KMS/OCR/e-sign/DPDP-DSR/sharing, G14 NLQ/embed/predictive/mobile)
are open gaps that require further gated phases; the modules are **not** BRD-complete.
