# G12 — Digital Service Register — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | **G12 — Digital Employee Service Register (Digital SR)** — statutory system-of-record; owner of the SR ingestion write-port and the append-only, hash-chained SR ledger (`service_register_events`). |
| Version tested | BRD v3.0 / v3.1 (platform-grounded); OpenAPI `G12.yaml` v3.1.0. |
| Scope | Contract + integrity guarantees of the write-port `POST /api/v1/sr/ingest` (+ `/ingest/reversal`); append-only immutability & hash-chain/status-chain/anchor integrity; corrigendum/annotation/appeal maker-checker with second-custodian SoD; attestation; periodic verification (bulk/assisted/heir) & gap-register completeness; certified extracts + §65B; offline/QR verification; LTV renewal; legacy digitisation; access log; subscriptions; retention & cross-tenant chain continuity. FR-01…FR-21. |
| Out of scope | Originating business processes owned by writer modules (leave approval G03, transfer G05, promotion G06, disciplinary G09, payroll G10, pension computation G11); document byte storage (G13); dashboards (G14). G12 records the statutory fact only. |
| Traceability | Every TC cites `Traces-to` (FR + AC/BR). Error codes/HTTP asserted verbatim from `docs/contracts/error-taxonomy.yaml` (G12 `SR_*` / `ERR-G12-*`) and `G12.yaml`. State transitions per `docs/contracts/state-machines.yaml` (G12). Authorization per `docs/contracts/auth-matrix.yaml` (G12 actions + SoD). |
| Grounding docs | `docs/brd/v3/G12-digital-service-register.md`; `docs/contracts/openapi/G12.yaml`; `docs/contracts/error-taxonomy.yaml`; `docs/contracts/state-machines.yaml`; `docs/contracts/auth-matrix.yaml`. |

### 1.1 Test environment & data assumptions

- **Multi-tenant (P04):** two provisioned tenants `T-ALPHA`, `T-BETA`. Every SR entity carries `tenant_id`; the per-employee chain is scoped to `(tenant_id, employee_id)`. Cross-tenant content operations are reserved to Platform Super Admin tooling.
- **Platform conventions:** base path `/api/v1`; global `bearerAuth`; every response echoes `X-Correlation-Id`; unsafe POSTs carry `Idempotency-Key` (24h replay → original result); cursor pagination (`limit` default 25 / max 100). Canonical error envelope `{ error: { code, message, field, details } }`, correlation id in the header (never a body field).
- **Personas / principals:**
  - `SP-G0x` — source-module **service principals** (mutual-TLS + service JWT) with scope `sr.ingest.write` only, one per writer module **G01, G04, G05, G06, G08, G09, G10, G11**. Cannot read others' SR or issue extracts.
  - `SP-G03` — a non-writer service principal (G03) used for allowlist negative tests.
  - `CUST-1`, `CUST-2` — SR Custodians (`sr_custodian`, entity-scoped, `g12_sr_custodian` flag). `CUST-2` acts as the distinct **Second Custodian** (`sr_second_custodian`).
  - `HRO-1` — HR Officer (`hr_admin`) — assisted verification, legacy-batch maker.
  - `EMP-100245` — employee (self-scope); `HEIR-1` — identity-verified nominee/heir for a DEATH_IN_SERVICE case.
  - `APP-1` — Appellate Authority (`appellate_authority`, read+decision only).
  - `PENS-1` — Pension Officer (`pension_officer`, read-only full).
  - `AUD-1` — Auditor (Org-Admin read + P05 query; read-only; may trigger integrity/anchor verify).
  - `SYS-1` — System Administrator (`org_admin`) — taxonomy drafts, CA/HSM/TSA/anchor/LTV config; no ledger authoring/attestation.
- **The 8 writer modules as callers** post through `POST /api/v1/sr/ingest` citing the exact published `event_type_code` strings from the FR-01.A catalog and the `fact_correlation_rule`-derived `fact_key`.
- **Seed data:** the FR-01.A canonical `sr_event_type` catalog is PUBLISHED (all 18 categories); `sr_expected_event_rule` set (e.g. `ANNUAL_INCREMENT` cadence) is seeded; at least one anchor (`sr_anchors`) exists within cadence; CA/HSM/RFC 3161 TSA/WORM confirmed available.
- **Golden employees:** `EMP-100245` (service_no `GOV-100245`) with a pre-seeded chain (APPOINTMENT→…→PROMOTION seq 42, SUPERSEDED→PROMOTION_CORRIGENDUM seq 43 ACTIVE) in `T-ALPHA`.

---

## 2. Test cases

### FR-01 — SR event taxonomy (catalog FR-01.A + writer matrix FR-01.B)

| ID | TC-G12-001 |
|---|---|
| Traces-to | FR-01 AC1/AC2, BR-01.1 |
| Type | Functional |
| Title | Sys Admin drafts, custodian publishes a new event-type version |
| Preconditions | `SYS-1` authenticated; category has no overlapping published version |
| Test data | `POST /sr/event-types` body: `{event_type_code:"AWARD_CONFERRED", event_category:"AWARD", allowed_source_modules:["G01"], payload_schema:{...valid JSON Schema...}, effective_from:"2026-07-01"}` |
| Steps | 1. `SYS-1` POST creates DRAFT. 2. `CUST-1` POST `/sr/event-types/AWARD_CONFERRED/publish`. |
| Expected | Step1 → **201** EventType status `DRAFT`; Step2 → **200** status `PUBLISHED`; `X-Correlation-Id` present; audit row written |
| Priority | High |

| ID | TC-G12-002 |
|---|---|
| Traces-to | FR-01 AC3; Edge (overlap) |
| Type | Negative / Boundary |
| Title | Publishing a version with overlapping effective range is rejected |
| Preconditions | `PROMOTION` already PUBLISHED effective `2020-01-01..open` |
| Test data | DRAFT `PROMOTION` v2 effective_from `2019-06-01` (overlaps) |
| Steps | 1. `SYS-1` drafts overlapping version. 2. `CUST-1` publishes. |
| Expected | Publish → **409** `error.code=SR_TYPE_OVERLAP`; no new active version |
| Priority | High |

| ID | TC-G12-003 |
|---|---|
| Traces-to | FR-01 AC1; auth-matrix (`sr.taxonomy.publish` = custodian) |
| Type | Authorization |
| Title | Sys Admin cannot publish (checker role required) |
| Preconditions | DRAFT event type exists |
| Test data | `SYS-1` token |
| Steps | `SYS-1` POST `/sr/event-types/{code}/publish` |
| Expected | **403** `FORBIDDEN` (maker ≠ checker; publish reserved to custodian) |
| Priority | High |

| ID | TC-G12-004 |
|---|---|
| Traces-to | FR-01 AC1; Edge (edit PUBLISHED) |
| Type | Immutability |
| Title | Editing a PUBLISHED taxonomy version is blocked (new version only) |
| Preconditions | `PROMOTION` PUBLISHED |
| Test data | Attempt to mutate published `payload_schema` in place |
| Steps | Attempt in-place edit of a PUBLISHED version |
| Expected | Blocked; system offers "create new version" path; published version unchanged |
| Priority | Medium |

| ID | TC-G12-005 |
|---|---|
| Traces-to | FR-01 BR-01.4; FR-01.A `Q?` column |
| Type | Boundary |
| Title | Publishing a qualifying-service type without a `fact_correlation_rule` is rejected |
| Preconditions | DRAFT type `Q?=Y` (qualifying) with empty `fact_correlation_rule` |
| Test data | `{...qualifying_service_impact:"QUALIFYING", fact_correlation_rule:null}` |
| Steps | `CUST-1` publish |
| Expected | **422** `VALIDATION_FAILED` — qualifying-service type must declare a deterministic key derivation (BR-01.4) |
| Priority | Medium |

| ID | TC-G12-006 |
|---|---|
| Traces-to | FR-01 BR-01.5; Edge (cadence→retired rule) |
| Type | Negative |
| Title | Cadence referencing a retired/absent expected-event rule blocks publish |
| Preconditions | Draft type with `expected_cadence` referencing a retired rule code |
| Test data | `expected_cadence:{type:"ANNUAL", unless_event:"RETIRED_RULE"}` |
| Steps | `CUST-1` publish |
| Expected | **422** `VALIDATION_FAILED` — cadence without a backing published rule rejected |
| Priority | Low |

| ID | TC-G12-007 |
|---|---|
| Traces-to | FR-01.A (catalog authoritative); FR-01.B |
| Type | API-Contract |
| Title | Catalog resolves the effective version for an `as_of` date |
| Preconditions | Two non-overlapping versions of a code exist |
| Test data | `GET /sr/event-types?as_of=2019-07-01&status=PUBLISHED` |
| Steps | List/resolve |
| Expected | **200** returns the version effective on `2019-07-01`; `items[]` + `next_cursor` shape |
| Priority | Medium |

### FR-02 — Ingestion write-port (contract + dedup + provenance)

| ID | TC-G12-010 |
|---|---|
| Traces-to | FR-02 AC1; FR-01.A (`PROMOTION`/G06) |
| Type | Functional / E2E-Flow |
| Title | Valid promotion ingest by G06 creates exactly one ledger entry |
| Preconditions | `SP-G06` scope `sr.ingest.write`; `EMP-100245` exists in G01; PROMOTION published |
| Test data | body from OpenAPI `promotion` example (`source_module:G06`, `event_type_code:PROMOTION`, `fact_key:"EMP:8f3a-aa\|CAT:PROMOTION\|EFF:2019-06-01\|POST:HEADMASTER"`, `qualifying_service_impact:QUALIFYING`), unique `Idempotency-Key` |
| Steps | `SP-G06` POST `/sr/ingest` |
| Expected | **201** `IngestResponse.validation_result=ACCEPTED`; one new `sr_event_id`; `sequence_no` gap-free; `sr_ingestion_requests` = ACCEPTED |
| Priority | High |

| ID | TC-G12-011 |
|---|---|
| Traces-to | FR-02 AC2, BR (syntactic dedup) |
| Type | Idempotency |
| Title | Replay with same dedup tuple returns original id (no duplicate) |
| Preconditions | TC-G12-010 succeeded |
| Test data | Identical `(source_module=G06, source_reference_id=ord-9912, source_event_version=1)`, same `Idempotency-Key` |
| Steps | Repeat POST `/sr/ingest` |
| Expected | **200** `validation_result=DUPLICATE_NOOP`; **same** `sr_event_id`; ledger count unchanged; request logged `DUPLICATE_NOOP` |
| Priority | High |

| ID | TC-G12-012 |
|---|---|
| Traces-to | FR-02 AC3 (semantic dedup — no double-count) |
| Type | Idempotency / Integrity |
| Title | Different tuple but same `fact_key` → SEMANTIC_DUPLICATE_NOOP (no double-count of qualifying service) |
| Preconditions | TC-G12-010 recorded the promotion fact |
| Test data | New `source_reference_id=ord-9912b`, `source_event_version=1`, **same** `fact_key` and agreeing facts |
| Steps | POST `/sr/ingest` (fresh `Idempotency-Key`) |
| Expected | **200** `validation_result=SEMANTIC_DUPLICATE_NOOP`; **no** second entry; original `sr_event_id` returned |
| Priority | High |

| ID | TC-G12-013 |
|---|---|
| Traces-to | FR-02 AC3, BR-02.6; OpenAPI 409 `semanticConflict` |
| Type | Negative / Integrity |
| Title | Same `fact_key`, disagreeing facts → SEMANTIC_CONFLICT, reconciliation task opened |
| Preconditions | Promotion fact recorded (to `HEADMASTER`, Level-9) |
| Test data | Same `fact_key` but `payload.pay_scale:"Level-10"` (disagrees) |
| Steps | POST `/sr/ingest` |
| Expected | **409** `error.code=SR_SEMANTIC_CONFLICT`, `details.conflicting_event_id` set; **no** ledger entry; reconciliation task created; custodian notified (X.2, non-suppressible) |
| Priority | High |

| ID | TC-G12-014 |
|---|---|
| Traces-to | FR-02 AC6, BR-02.1; FR-01.B (G03 NOT a writer) |
| Type | Authorization / Negative |
| Title | Source module not in allowlist → SR_SOURCE_NOT_ALLOWED |
| Preconditions | `SP-G03` holds `sr.ingest.write` but G03 is absent from `LEAVE` allowlist (`[G04]`) |
| Test data | `source_module:"G03"`, `event_type_code:"EL_AVAILED"` |
| Steps | `SP-G03` POST `/sr/ingest` |
| Expected | **403** `error.code=SR_SOURCE_NOT_ALLOWED`, `field=source_module`, `details.reason=SOURCE_NOT_ALLOWED`; no entry |
| Priority | High |

| ID | TC-G12-015 |
|---|---|
| Traces-to | FR-02 AC4; error-taxonomy `SR_TYPE_NOT_FOUND` (404) |
| Type | Negative |
| Title | Event type not published/effective for `event_date` → SR_TYPE_NOT_FOUND |
| Preconditions | No PUBLISHED version of `event_type_code` effective on `event_date` |
| Test data | `event_type_code:"PROMOTION"`, `event_date:"1990-01-01"` (before effective range) |
| Steps | `SP-G06` POST `/sr/ingest` |
| Expected | **404** `error.code=SR_TYPE_NOT_FOUND`; no entry; request REJECTED |
| Priority | High |

| ID | TC-G12-016 |
|---|---|
| Traces-to | FR-02 AC4; `SR_EMPLOYEE_NOT_FOUND` (404) |
| Type | Negative |
| Title | Unknown employee → SR_EMPLOYEE_NOT_FOUND |
| Preconditions | `employee_id` not present in G01 |
| Test data | `employee_id:"00000000-dead"` |
| Steps | `SP-G06` POST `/sr/ingest` |
| Expected | **404** `error.code=SR_EMPLOYEE_NOT_FOUND`; no entry |
| Priority | Medium |

| ID | TC-G12-017 |
|---|---|
| Traces-to | FR-02 BR-02.5; `SR_FACT_KEY_REQUIRED` (422) |
| Type | Boundary / Negative |
| Title | Qualifying-service event missing `fact_key` → SR_FACT_KEY_REQUIRED |
| Preconditions | `PROMOTION` is `Q?=Y` |
| Test data | Valid promotion body with `fact_key` omitted |
| Steps | `SP-G06` POST `/sr/ingest` |
| Expected | **422** `error.code=SR_FACT_KEY_REQUIRED`, `field=fact_key`, `details.reason=FACT_KEY_REQUIRED`; no entry |
| Priority | High |

| ID | TC-G12-018 |
|---|---|
| Traces-to | FR-02 AC4; `SR_PAYLOAD_INVALID` (422) |
| Type | Negative |
| Title | Payload failing the type JSON Schema → SR_PAYLOAD_INVALID |
| Preconditions | `PROMOTION` schema requires `to_designation` |
| Test data | `payload:{from_designation:"Asst. Teacher"}` (missing `to_designation`) |
| Steps | `SP-G06` POST `/sr/ingest` |
| Expected | **422** `error.code=SR_PAYLOAD_INVALID`; no entry; request REJECTED |
| Priority | High |

| ID | TC-G12-019 |
|---|---|
| Traces-to | FR-02 BR-02.3; `SR_FUTURE_DATE` (422) |
| Type | Boundary |
| Title | `event_date` beyond future tolerance → SR_FUTURE_DATE; back-dating within tolerance accepted |
| Preconditions | Future tolerance configured (e.g. +7 days) |
| Test data | (a) `event_date = today+30d`; (b) back-dated `event_date = 2015-03-01` |
| Steps | POST each variant |
| Expected | (a) **422** `SR_FUTURE_DATE`, no entry; (b) **201** ACCEPTED (back-dating allowed; appended at chain end) |
| Priority | Medium |

| ID | TC-G12-020 |
|---|---|
| Traces-to | FR-02 AC6; auth-matrix (`sr.ingest.write` scope only) |
| Type | Authorization |
| Title | Ingestion principal cannot read another employee's SR |
| Preconditions | `SP-G06` holds only `sr.ingest.write` |
| Test data | `GET /sr/employees/{other}/timeline` |
| Steps | `SP-G06` GET a timeline |
| Expected | **403** `FORBIDDEN` (or 404 scope-safe); ingestion scope grants no read |
| Priority | High |

| ID | TC-G12-021 |
|---|---|
| Traces-to | FR-02 AC1; each writer per FR-01.A/B |
| Type | Functional (parametrised per source module) |
| Title | Valid ingest per source module — one entry each |
| Preconditions | Principals `SP-G01, SP-G04, SP-G05, SP-G08, SP-G09, SP-G10, SP-G11` |
| Test data | G01 `APPOINTMENT`; G04 `EL_AVAILED`; G05 `TRANSFER`; G08 `APAR_FINAL_GRADE`; G09 `MAJOR_PENALTY`; G10 `PAY_FIXATION`; G11 `SUPERANNUATION` — each with catalog-correct `fact_key` (or none for `N` types like `APAR_FINAL_GRADE`) |
| Steps | POST `/sr/ingest` once per module |
| Expected | Each **201** ACCEPTED; exactly one entry; correct `event_category`; G10 rows honoured as deferred-build contract |
| Priority | High |

| ID | TC-G12-022 |
|---|---|
| Traces-to | FR-02 (write-port is the ONLY path); §957 |
| Type | API-Contract / Negative |
| Title | Alternate write URLs / direct INSERT are not honoured |
| Preconditions | — |
| Test data | `POST /sr/events` (write attempt) and any direct-table write |
| Steps | Attempt to write via a non-canonical path |
| Expected | Rejected (404/405 route not a write path); only `/sr/ingest` (+`/ingest/reversal`) mutate the ledger |
| Priority | Medium |

| ID | TC-G12-023 |
|---|---|
| Traces-to | FR-02 AC1; concurrency |
| Type | Idempotency / Boundary |
| Title | Concurrent identical requests create exactly one entry |
| Preconditions | Same dedup tuple + `Idempotency-Key` |
| Test data | 10 parallel identical POSTs |
| Steps | Fire 10 concurrent `/sr/ingest` |
| Expected | Exactly one **201** ACCEPTED; the rest **200** DUPLICATE_NOOP; single ledger row; one `sequence_no` |
| Priority | High |

| ID | TC-G12-024 |
|---|---|
| Traces-to | FR-02 AC6; UNAUTHENTICATED (401) |
| Type | Authorization |
| Title | Missing/expired bearer token → UNAUTHENTICATED |
| Preconditions | No/expired token |
| Test data | POST `/sr/ingest` without Authorization header |
| Steps | Unauthenticated POST |
| Expected | **401** `UNAUTHENTICATED` |
| Priority | Medium |

| ID | TC-G12-025 |
|---|---|
| Traces-to | FR-02 Edge (upstream outage); error-taxonomy status_503_policy |
| Type | Negative |
| Title | G01/G13 partial outage surfaces as INTERNAL(500)/ERR-LOADFAIL, never 503 |
| Preconditions | G01 existence check upstream unavailable (non-retryable path) |
| Test data | Valid body; upstream forced down |
| Steps | POST `/sr/ingest` |
| Expected | **500** `ERR-LOADFAIL` (no `503`/`UPSTREAM_UNAVAILABLE`); idempotent retry safe under the same key |
| Priority | Medium |

### FR-02 (reversal envelope) — supersede-not-delete

| ID | TC-G12-030 |
|---|---|
| Traces-to | FR-02 AC5, FR-05; OpenAPI `/sr/ingest/reversal` |
| Type | Functional / E2E-Flow / State-Transition |
| Title | Reversal of a quashed penalty spawns corrigendum (supersede, not delete) |
| Preconditions | `MAJOR_PENALTY` (case-557) recorded ACTIVE for `EMP-100245` by G09 |
| Test data | OpenAPI `quash` example: `source_module:G09`, `reverses_source_reference_id:case-557`, `event_type_code:MAJOR_PENALTY_REVERSAL` |
| Steps | `SP-G09` POST `/sr/ingest/reversal` |
| Expected | **201** `ReversalResponse` with correction id; `WF-G12-CORRIGENDUM` spawned; original entry becomes `SUPERSEDED` via status chain (not deleted) |
| Priority | High |

| ID | TC-G12-031 |
|---|---|
| Traces-to | FR-02 AC5; `SR_REVERSAL_TARGET_NOT_FOUND` (404) |
| Type | Negative |
| Title | Reversal referencing unknown source reference → SR_REVERSAL_TARGET_NOT_FOUND |
| Preconditions | No entry with `source_reference_id=ghost-999` |
| Test data | `reverses_source_reference_id:"ghost-999"` |
| Steps | `SP-G09` POST `/sr/ingest/reversal` |
| Expected | **404** `error.code=SR_REVERSAL_TARGET_NOT_FOUND`; no change |
| Priority | Medium |

| ID | TC-G12-032 |
|---|---|
| Traces-to | FR-02 Edge (reversal of already-superseded) |
| Type | State-Transition |
| Title | Reversal of an already-superseded entry resolves to latest ACTIVE successor |
| Preconditions | Original seq 42 already SUPERSEDED by seq 43 (ACTIVE) |
| Test data | Reversal referencing the original source reference of seq 42 |
| Steps | POST `/sr/ingest/reversal` |
| Expected | Corrigendum targets the latest ACTIVE successor (seq 43); no orphan; audit trail preserved |
| Priority | Medium |

### FR-03 — Append-only ledger + status sub-ledger (immutability & chain)

| ID | TC-G12-040 |
|---|---|
| Traces-to | FR-03 AC1 |
| Type | Integrity-Chain / Boundary |
| Title | `sequence_no` is unique & gap-free per employee under concurrent append |
| Preconditions | `EMP-100245` chain at head seq 43 |
| Test data | 5 concurrent valid ingests for the same employee |
| Steps | Fire concurrent appends |
| Expected | Sequences 44–48 assigned with no gaps/dupes; per-employee lock serialises |
| Priority | High |

| ID | TC-G12-041 |
|---|---|
| Traces-to | FR-03 AC2/AC3 |
| Type | Integrity-Chain |
| Title | `prev_event_hash` chains correctly; `entry_hash` reproducible |
| Preconditions | Seeded chain |
| Test data | Recompute `entry_hash` from stored content + `hash_algorithm` + `ledger_version` |
| Steps | For each entry recompute and compare to stored `entry_hash`; verify `prev_event_hash` links |
| Expected | All hashes reproduce; GENESIS for first entry; chain continuous |
| Priority | High |

| ID | TC-G12-042 |
|---|---|
| Traces-to | FR-03 AC4; state-machines invariant `SR_DELETION_FORBIDDEN`; `SR_DELETION_FORBIDDEN` (403) |
| Type | Immutability |
| Title | DELETE of a ledger entry is forbidden |
| Preconditions | Any ACTIVE entry |
| Test data | Attempt DELETE / hard-delete of `sr_event_id` |
| Steps | Attempt to delete a ledger row (API + direct) |
| Expected | **403** `error.code=SR_DELETION_FORBIDDEN`; DB rule blocks; security alert raised |
| Priority | High |

| ID | TC-G12-043 |
|---|---|
| Traces-to | FR-03 AC4; `SR_ENTRY_IMMUTABLE` (409) |
| Type | Immutability |
| Title | UPDATE of an immutable content field is rejected |
| Preconditions | ACTIVE entry seq 43 |
| Test data | Attempt to PATCH `event_date`/`payload`/`entry_hash` |
| Steps | Attempt content update |
| Expected | **409** `error.code=SR_ENTRY_IMMUTABLE`; content unchanged |
| Priority | High |

| ID | TC-G12-044 |
|---|---|
| Traces-to | FR-03 AC5/AC6, BR-03.4 |
| Type | Integrity-Chain |
| Title | Status change appends a `sr_status_events` row; content hash unaffected |
| Preconditions | Entry ACTIVE_UNATTESTED |
| Test data | Trigger a status transition (attest) |
| Steps | Attest, then re-verify content chain |
| Expected | Exactly one `sr_status_events` row with valid `status_hash`; E8 projection equals latest status-chain value; content `entry_hash` unchanged (excludes mutable status) |
| Priority | High |

| ID | TC-G12-045 |
|---|---|
| Traces-to | FR-03 AC7, BR-03.5 |
| Type | Functional / Boundary |
| Title | Each committed entry carries a verifiable RFC 3161 timestamp; TSA timeout defers, never blocks |
| Preconditions | TSA available; then TSA forced to time out |
| Test data | Two ingests: normal + TSA-timeout |
| Steps | Ingest under both conditions |
| Expected | Normal → verifiable RFC 3161 token stored; timeout → entry commits with deferred-timestamp flag, retry job stamps later, deferred state alarmed |
| Priority | Medium |

| ID | TC-G12-046 |
|---|---|
| Traces-to | FR-03 BR-03.4; state-machine (business code never UPDATEs projection) |
| Type | Immutability / Negative |
| Title | Direct write to a status projection field by business code is blocked |
| Preconditions | Entry ACTIVE |
| Test data | Attempt direct UPDATE of `entry_status`/`superseded_by_event_id` |
| Steps | Attempt projection write outside the materialiser |
| Expected | Rejected; only the status-materialiser (in the same tx as `sr_status_events` append) may write projections |
| Priority | Medium |

### FR-04 / FR-16 — Integrity, status-chain & anchor verification / forensics

| ID | TC-G12-050 |
|---|---|
| Traces-to | FR-04; OpenAPI `/sr/integrity/verify` 200 |
| Type | Integrity-Chain |
| Title | Content + status chain verification PASS on an intact employee scope |
| Preconditions | `EMP-100245` chain intact |
| Test data | `POST /sr/integrity/verify {employee_id}` as `AUD-1` |
| Steps | Trigger verification |
| Expected | **200** `IntegrityRun` outcome `PASS` with verified counts |
| Priority | High |

| ID | TC-G12-051 |
|---|---|
| Traces-to | FR-04; `SR_INTEGRITY_FAILED` (422) — non-suppressible |
| Type | Integrity-Chain / Negative |
| Title | Tampered content row → SR_INTEGRITY_FAILED with first divergence |
| Preconditions | A content field mutated out-of-band on seq 42 (WORM bypass simulation) |
| Test data | `POST /sr/integrity/verify` |
| Steps | Run content-chain verification |
| Expected | **422** `error.code=SR_INTEGRITY_FAILED`; first-divergence pinpointed (seq 42); FAIL non-suppressible |
| Priority | High |

| ID | TC-G12-052 |
|---|---|
| Traces-to | FR-04; `SR_STATUS_CHAIN_FAILED` (422) |
| Type | Integrity-Chain / Negative |
| Title | Tampered status sub-ledger → SR_STATUS_CHAIN_FAILED |
| Preconditions | A `sr_status_events` `status_hash` corrupted |
| Test data | `POST /sr/integrity/verify` |
| Steps | Run status-chain verification |
| Expected | **422** `error.code=SR_STATUS_CHAIN_FAILED`; divergence located |
| Priority | High |

| ID | TC-G12-053 |
|---|---|
| Traces-to | FR-04 (mandatory anchor); OpenAPI `/sr/integrity/verify-anchor` 422 |
| Type | Integrity-Chain / Negative |
| Title | Chain head ≠ external anchor (insider rewrite / stale restore) → SR_ANCHOR_MISMATCH |
| Preconditions | Live head `9f10-ee` differs from stored/anchored `77aa-12` |
| Test data | `POST /sr/integrity/verify-anchor {employee_id}` |
| Steps | Trigger anchor comparison |
| Expected | **422** `error.code=SR_ANCHOR_MISMATCH`, `details.anchor_id/expected_head/stored_head`; non-suppressible FAIL |
| Priority | High |

| ID | TC-G12-054 |
|---|---|
| Traces-to | FR-04; `SR_ANCHOR_MISSING` (412) |
| Type | Boundary / Negative |
| Title | No current anchor within cadence → SR_ANCHOR_MISSING |
| Preconditions | Latest anchor is stale/absent (beyond cadence) |
| Test data | `POST /sr/integrity/verify-anchor` |
| Steps | Trigger anchor verification |
| Expected | **412** `error.code=SR_ANCHOR_MISSING` |
| Priority | Medium |

| ID | TC-G12-055 |
|---|---|
| Traces-to | FR-04; auth-matrix (custodian/auditor `sr.integrity.verify`) |
| Type | Authorization |
| Title | Employee cannot trigger integrity/anchor verification |
| Preconditions | `EMP-100245` token |
| Test data | `POST /sr/integrity/verify` |
| Steps | Employee triggers verification |
| Expected | **403** `FORBIDDEN` (custodian/auditor only) |
| Priority | Medium |

| ID | TC-G12-056 |
|---|---|
| Traces-to | FR-16; OpenAPI `/sr/integrity/runs`, `/sr/anchors` |
| Type | API-Contract |
| Title | Auditor lists integrity runs and anchors with cursor paging |
| Preconditions | Several runs + anchors exist |
| Test data | `GET /sr/integrity/runs?outcome=FAIL&limit=25`; `GET /sr/anchors` |
| Steps | Auditor lists |
| Expected | **200** `items[]`+`next_cursor`; `limit>100` clamped/rejected per pagination bound |
| Priority | Low |

| ID | TC-G12-057 |
|---|---|
| Traces-to | FR-15/FR-04 (tenant-scoped chain); §274 |
| Type | Data-Integrity / Authorization |
| Title | Integrity verification is tenant-scoped; T-BETA cannot verify T-ALPHA chains |
| Preconditions | `EMP-100245` in `T-ALPHA`; auditor scoped to `T-BETA` |
| Test data | `POST /sr/integrity/verify {T-ALPHA employee}` from a T-BETA principal |
| Steps | Cross-tenant verification attempt |
| Expected | **404**/scope-safe (out-of-scope indistinguishable from absent); no chain leak |
| Priority | Medium |

### FR-05 — Corrigendum / supersession (maker-checker + second-custodian SoD)

| ID | TC-G12-060 |
|---|---|
| Traces-to | FR-05; OpenAPI `/sr/events/{id}/corrigendum` 201 |
| Type | Functional / State-Transition |
| Title | Custodian initiates a corrigendum (maker) — original not edited |
| Preconditions | ACTIVE entry seq 43 |
| Test data | `CUST-1` POST `/sr/events/{id}/corrigendum {reason, corrected_payload, evidence}` |
| Steps | Create corrigendum |
| Expected | **201** `Correction` PENDING; original untouched (supersession deferred to approval) |
| Priority | High |

| ID | TC-G12-061 |
|---|---|
| Traces-to | FR-05; OpenAPI 403 SoD (maker==checker) |
| Type | Authorization / State-Transition |
| Title | Maker cannot self-approve a correction (SoD) |
| Preconditions | Corrigendum created by `CUST-1` |
| Test data | `CUST-1` POST `/sr/corrections/{id}/approve` |
| Steps | Same custodian approves own corrigendum |
| Expected | **403** `FORBIDDEN` — separation-of-duties (maker == checker) |
| Priority | High |

| ID | TC-G12-062 |
|---|---|
| Traces-to | FR-05; `SR_SECOND_CUSTODIAN_REQUIRED` (412) |
| Type | Negative / Authorization |
| Title | Routine corrigendum lacks a distinct co-signer → SR_SECOND_CUSTODIAN_REQUIRED |
| Preconditions | Corrigendum approved by `CUST-2` (checker) but no distinct second-custodian co-sign |
| Test data | `POST /sr/corrections/{id}/approve` without co-sign |
| Steps | Approve routine corrigendum without co-sign |
| Expected | **412** `error.code=SR_SECOND_CUSTODIAN_REQUIRED` |
| Priority | High |

| ID | TC-G12-063 |
|---|---|
| Traces-to | FR-05; state-machine `sr_correction` (maker≠checker≠2nd) |
| Type | Authorization |
| Title | Co-signer must be distinct from maker and checker |
| Preconditions | Maker `CUST-1`, checker `CUST-2` |
| Test data | Co-sign attempted by `CUST-1` or `CUST-2` |
| Steps | `POST /sr/corrections/{id}/cosign` by a non-distinct custodian |
| Expected | **412** `SR_SECOND_CUSTODIAN_REQUIRED` (co-signer not distinct); **403** if maker==cosigner |
| Priority | High |

| ID | TC-G12-064 |
|---|---|
| Traces-to | FR-05; E2E supersession chain; §488–489 example |
| Type | E2E-Flow / State-Transition |
| Title | Full corrigendum: maker → checker approve → 2nd co-sign → original SUPERSEDED, corrigendum ACTIVE |
| Preconditions | Distinct `CUST-1` (maker), `CUST-2` (checker+cosign as second custodian) |
| Test data | Corrigendum on seq 43 |
| Steps | 1. `CUST-1` create. 2. `CUST-2` approve. 3. distinct second custodian cosign. |
| Expected | Cosign → **200**; original entry `entry_status=SUPERSEDED` (via status chain), new corrigendum entry ACTIVE_ATTESTED; both preserved (append-only) |
| Priority | High |

| ID | TC-G12-065 |
|---|---|
| Traces-to | FR-05; `SR_ENTRY_SUPERSEDED` (409) |
| Type | Negative / State-Transition |
| Title | Corrigendum on an already-superseded entry → SR_ENTRY_SUPERSEDED (redirect to successor) |
| Preconditions | seq 42 SUPERSEDED by seq 43 |
| Test data | `POST /sr/events/{seq42-id}/corrigendum` |
| Steps | Corrigendum against a superseded entry |
| Expected | **409** `error.code=SR_ENTRY_SUPERSEDED`; response redirects to latest ACTIVE successor |
| Priority | Medium |

| ID | TC-G12-066 |
|---|---|
| Traces-to | FR-05 (identity change → dual sign-off); WF-G12-IDENTITY-CHANGE |
| Type | Authorization / Functional |
| Title | DOB/name (identity) corrigendum requires dual sign-off |
| Preconditions | `DOB_CHANGE` entry (IDENTITY, `is_identity_event=true`) |
| Test data | Corrigendum on a `DOB_CHANGE` entry |
| Steps | Attempt single-custodian approval |
| Expected | Blocked until dual sign-off satisfied (identity events carry extra controls) |
| Priority | Medium |

### FR-06 / FR-21 — Annotation, dispute, appeal

| ID | TC-G12-070 |
|---|---|
| Traces-to | FR-06; OpenAPI `/sr/events/{id}/dispute` 201; state-machine ACTIVE_DISPUTED |
| Type | Functional / State-Transition |
| Title | Employee raises a dispute → attestation_status DISPUTED |
| Preconditions | ACTIVE_ATTESTED entry belonging to `EMP-100245` |
| Test data | `EMP-100245` POST `/sr/events/{id}/dispute {reason}` |
| Steps | Raise dispute |
| Expected | **201** dispute record; entry `attestation_status=DISPUTED` |
| Priority | High |

| ID | TC-G12-071 |
|---|---|
| Traces-to | FR-06; `SR_ENTRY_SUPERSEDED` (409) |
| Type | Negative |
| Title | Cannot dispute a superseded entry |
| Preconditions | seq 42 SUPERSEDED |
| Test data | Dispute on seq 42 |
| Steps | `EMP-100245` dispute a superseded entry |
| Expected | **409** `error.code=SR_ENTRY_SUPERSEDED` |
| Priority | Medium |

| ID | TC-G12-072 |
|---|---|
| Traces-to | FR-06; OpenAPI `/sr/events/{id}/annotate` 201; ACTIVE_ANNOTATED |
| Type | Functional / State-Transition |
| Title | Custodian annotation attaches a note without changing the fact |
| Preconditions | ACTIVE entry |
| Test data | `CUST-1` POST `/sr/events/{id}/annotate {note}` |
| Steps | Add annotation |
| Expected | **201**; `entry_status=ANNOTATED`; content/`entry_hash` unchanged |
| Priority | Medium |

| ID | TC-G12-073 |
|---|---|
| Traces-to | FR-06; OpenAPI `/sr/disputes/{id}/resolve` |
| Type | State-Transition |
| Title | Custodian resolves dispute UPHELD → returns to prior status; appeal now eligible |
| Preconditions | Open dispute |
| Test data | `CUST-1` POST `/sr/disputes/{id}/resolve {outcome:"UPHELD"}` |
| Steps | Resolve as upheld |
| Expected | **200**; entry back to ACTIVE_ATTESTED; disputant notified; appeal path unlocked (FR-21) |
| Priority | Medium |

| ID | TC-G12-074 |
|---|---|
| Traces-to | FR-21; `SR_APPEAL_NOT_ELIGIBLE` (409) |
| Type | Negative / State-Transition |
| Title | Appeal without a prior custodian uphold → SR_APPEAL_NOT_ELIGIBLE |
| Preconditions | Dispute not yet resolved / not upheld |
| Test data | `EMP-100245` POST `/sr/disputes/{id}/appeal` |
| Steps | Appeal a not-yet-upheld dispute |
| Expected | **409** `error.code=SR_APPEAL_NOT_ELIGIBLE` |
| Priority | Medium |

| ID | TC-G12-075 |
|---|---|
| Traces-to | FR-21; state-machine `appeal` (OVERTURNED → spawn corrigendum) |
| Type | E2E-Flow / State-Transition |
| Title | Appeal after uphold; Appellate Authority overturns → corrigendum spawned |
| Preconditions | Dispute UPHELD (TC-073); `APP-1` independent of upholding custodian |
| Test data | `EMP-100245` appeal → `APP-1` decide OVERTURNED |
| Steps | 1. Raise appeal (201). 2. `APP-1` decides OVERTURNED. |
| Expected | Appeal RAISED→UNDER_APPEAL→OVERTURNED; `WF-G12-CORRIGENDUM` (FR-05) spawned; `APP-1` performs no direct ledger write |
| Priority | High |

| ID | TC-G12-076 |
|---|---|
| Traces-to | FR-21; auth-matrix (`appellate_authority` != upholding custodian) |
| Type | Authorization |
| Title | Appellate Authority must be independent of the upholding custodian |
| Preconditions | Custodian who upheld also holds appellate role |
| Test data | Same person decides the appeal |
| Steps | Attempt appeal decision by the upholding custodian |
| Expected | **403** `FORBIDDEN` — must differ from upholding custodian |
| Priority | Medium |

### FR-07 — Custodian attestation (qualified signature)

| ID | TC-G12-080 |
|---|---|
| Traces-to | FR-07; OpenAPI `/sr/events/{id}/attest` 201; ACTIVE_ATTESTED |
| Type | Functional / State-Transition |
| Title | Custodian attests with qualified signature + RFC 3161 timestamp |
| Preconditions | ACTIVE_UNATTESTED entry; `CUST-1` holds qualified PKI cert |
| Test data | `POST /sr/events/{id}/attest {qualified_signature, cert_serial, timestamp_token}` |
| Steps | Attest |
| Expected | **201** `Attestation`; status → ACTIVE_ATTESTED; signature metadata stored |
| Priority | High |

| ID | TC-G12-081 |
|---|---|
| Traces-to | FR-07; `SR_SIGNATURE_NOT_QUALIFIED` (422) — server-sign banned |
| Type | Negative |
| Title | Server-signed attestation rejected for a statutory output |
| Preconditions | Attempt to attest with a server-generated signature |
| Test data | `signature_type:"SERVER"` |
| Steps | Attest with server signature |
| Expected | **422** `error.code=SR_SIGNATURE_NOT_QUALIFIED` |
| Priority | High |

| ID | TC-G12-082 |
|---|---|
| Traces-to | FR-07; `ERR-G12-SIGNATURE-INVALID` (422) |
| Type | Negative |
| Title | Qualified signature failing validation → ERR-G12-SIGNATURE-INVALID (namespaced vs G13) |
| Preconditions | Tampered/expired qualified signature |
| Test data | Invalid signature payload |
| Steps | Attest |
| Expected | **422** `error.code=ERR-G12-SIGNATURE-INVALID` |
| Priority | Medium |

| ID | TC-G12-083 |
|---|---|
| Traces-to | FR-07; `SR_ENTRY_DISPUTED` (409) |
| Type | Negative / State-Transition |
| Title | Attest blocked by an open dispute → SR_ENTRY_DISPUTED |
| Preconditions | Entry ACTIVE_DISPUTED |
| Test data | `CUST-1` attest a disputed entry |
| Steps | Attest |
| Expected | **409** `error.code=SR_ENTRY_DISPUTED` |
| Priority | Medium |

| ID | TC-G12-084 |
|---|---|
| Traces-to | FR-07; auth-matrix (`sr.attest` = custodian only) |
| Type | Authorization |
| Title | HR Officer cannot attest |
| Preconditions | `HRO-1` token |
| Test data | `POST /sr/events/{id}/attest` |
| Steps | HR attests |
| Expected | **403** `FORBIDDEN` (attestation reserved to SR Custodian) |
| Priority | Medium |

| ID | TC-G12-085 |
|---|---|
| Traces-to | FR-07; OpenAPI `/sr/attestations/batch` 200 |
| Type | Functional |
| Title | Batch attest yields a discrete signed row per entry |
| Preconditions | 3 ACTIVE_UNATTESTED entries |
| Test data | `POST /sr/attestations/batch {entry_ids:[...], signatures:[...]}` |
| Steps | Batch attest |
| Expected | **200** `BatchAttestResult` per-entry outcomes; each yields its own `sr_attestations` row + qualified signature |
| Priority | Low |

### FR-08 — Periodic verification (bulk / assisted / heir) + gap gate

| ID | TC-G12-090 |
|---|---|
| Traces-to | FR-08; OpenAPI `/sr/verification-cycles/{id}/confirm` |
| Type | Functional / State-Transition |
| Title | Employee confirms a verification cycle (self) |
| Preconditions | OPEN cycle for `EMP-100245` |
| Test data | `EMP-100245` POST `/confirm {signature}` |
| Steps | Confirm cycle |
| Expected | **200**; cycle → CUSTODIAN_REVIEW; entry(s) ACTIVE_EMPLOYEE_VERIFIED |
| Priority | High |

| ID | TC-G12-091 |
|---|---|
| Traces-to | FR-08; OpenAPI `/bulk-confirm`; state-machine BULK_REVIEW |
| Type | Functional / Boundary |
| Title | Bulk-confirm-with-exceptions surfaces only changed/sensitive/gap-flagged entries |
| Preconditions | Cycle with 50 routine + 3 exception entries (PUNISHMENT/SUSPENSION/IDENTITY/corrigendum-affected/gap-flagged) |
| Test data | `POST /bulk-confirm {confirm_routine:true, exceptions_reviewed:[...]}` |
| Steps | Bulk-confirm |
| Expected | **200**; routine bulk-confirmed; only the 3 exceptions require individual review |
| Priority | High |

| ID | TC-G12-092 |
|---|---|
| Traces-to | FR-08 (assisted); OpenAPI `/assisted-confirm`; ASSISTED_VERIFY kind |
| Type | Functional / Authorization |
| Title | HR-assisted confirmation requires explicit consent capture |
| Preconditions | Low-literacy employee cycle; `HRO-1` operator |
| Test data | `POST /assisted-confirm {consent_captured:true, operator_id}` (and a variant with consent absent) |
| Steps | Assisted confirm with/without consent |
| Expected | With consent → **200** `ASSISTED_VERIFY` attestation; without consent → **422** `VALIDATION_FAILED`; operator attributed (never anonymous) |
| Priority | Medium |

| ID | TC-G12-093 |
|---|---|
| Traces-to | FR-08 (heir); OpenAPI `/heir-confirm`; HEIR_PENDING→EMPLOYEE_REVIEW |
| Type | Functional / E2E-Flow |
| Title | Nominee/heir verification for DEATH_IN_SERVICE (identity-verified) |
| Preconditions | `DEATH_IN_SERVICE` case; cycle HEIR_PENDING; `HEIR-1` identity verified |
| Test data | `POST /heir-confirm {heir_identity_ref, signature}` |
| Steps | Custodian verifies heir identity → heir confirms |
| Expected | **200** `HEIR_VERIFY`; heir read-scoped to the decedent only |
| Priority | Medium |

| ID | TC-G12-094 |
|---|---|
| Traces-to | FR-08 + FR-17; `SR_GAP_UNRESOLVED` (412) |
| Type | Negative / State-Transition |
| Title | CRITICAL unresolved gap blocks pre-retirement cycle finalisation |
| Preconditions | Pre-retirement cycle with an open CRITICAL gap |
| Test data | `CUST-1` POST `/sr/verification-cycles/{id}/finalise` |
| Steps | Finalise |
| Expected | **412** `error.code=SR_GAP_UNRESOLVED`; cycle stays CUSTODIAN_REVIEW |
| Priority | High |

| ID | TC-G12-095 |
|---|---|
| Traces-to | FR-08; state-machine (finalise guard: no open disputes) |
| Type | State-Transition |
| Title | Custodian finalises after gaps EXPLAINED/CLOSED and no open disputes |
| Preconditions | Gaps resolved; no disputes |
| Test data | `CUST-1` finalise |
| Steps | Finalise |
| Expected | **200**; cycle → COMPLETED |
| Priority | Medium |

| ID | TC-G12-096 |
|---|---|
| Traces-to | FR-08; auth-matrix (finalise = custodian) |
| Type | Authorization |
| Title | Employee cannot finalise a cycle |
| Preconditions | Cycle in CUSTODIAN_REVIEW |
| Test data | `EMP-100245` POST `/finalise` |
| Steps | Employee finalise |
| Expected | **403** `FORBIDDEN` |
| Priority | Low |

### FR-09 — SR timeline view

| ID | TC-G12-100 |
|---|---|
| Traces-to | FR-09; OpenAPI `/sr/employees/{id}/timeline` 200 |
| Type | Functional / API-Contract |
| Title | Employee views own chronological timeline (paged, filterable) |
| Preconditions | `EMP-100245` self |
| Test data | `GET /timeline?limit=25&sort=event_date:asc&category=PROMOTION` |
| Steps | Self-read |
| Expected | **200** `items[]`+`next_cursor`; chronological; superseded/disputed badges present |
| Priority | High |

| ID | TC-G12-101 |
|---|---|
| Traces-to | FR-09; `SR_PURPOSE_REQUIRED` (422) |
| Type | Negative |
| Title | Non-self access without stated purpose → SR_PURPOSE_REQUIRED |
| Preconditions | `PENS-1` viewing another employee |
| Test data | `GET /sr/employees/{other}/timeline` (no `purpose`) |
| Steps | Non-self read without purpose |
| Expected | **422** `error.code=SR_PURPOSE_REQUIRED` |
| Priority | High |

| ID | TC-G12-102 |
|---|---|
| Traces-to | FR-09; P02 field-mask + scope-safe 404 |
| Type | Authorization / Data-Integrity |
| Title | Out-of-scope timeline returns 404-style, TIER-1 fields masked when in-scope |
| Preconditions | `PENS-1` out of scope for `EMP-X`; in scope for `EMP-100245` |
| Test data | `GET .../timeline?purpose=PENSION` |
| Steps | Read out-of-scope + in-scope |
| Expected | Out-of-scope → **404** (never a 403 leak); in-scope → **200** with DOB/national-ID masked per PII ceiling |
| Priority | High |

| ID | TC-G12-103 |
|---|---|
| Traces-to | FR-09; pagination bound (max 100) |
| Type | Boundary |
| Title | `limit` above max is clamped/rejected |
| Preconditions | — |
| Test data | `GET /timeline?limit=500` |
| Steps | Over-limit request |
| Expected | Clamped to 100 (or **422**); response honours cursor paging |
| Priority | Low |

### FR-10 / FR-18 — Certified extract, redaction, dual custodian, §65B

| ID | TC-G12-110 |
|---|---|
| Traces-to | FR-10; OpenAPI `/sr/employees/{id}/extracts` 201 |
| Type | Functional / E2E-Flow |
| Title | Purpose-driven redacted extract issued (LOAN excludes disciplinary) |
| Preconditions | Employee has PUNISHMENT/SUSPENSION entries |
| Test data | `POST /extracts {purpose:"LOAN", redaction_policy:"LOAN_EXCLUDE_DISCIPLINARY"}` |
| Steps | Issue loan extract |
| Expected | **201** `Extract`; PUNISHMENT/SUSPENSION omitted via P02 field-mask before digest; qualified-signed PDF + `extract_no` + `qr_verification_token` |
| Priority | High |

| ID | TC-G12-111 |
|---|---|
| Traces-to | FR-10; `SR_SECOND_CUSTODIAN_REQUIRED` (412) |
| Type | Authorization / Negative |
| Title | FULL_SR extract requires a distinct second-custodian co-sign |
| Preconditions | `CUST-1` requests FULL_SR |
| Test data | `POST /extracts {purpose:"FULL_SR"}` then no co-sign |
| Steps | Create FULL_SR extract; attempt issue without co-sign |
| Expected | Create **201** (awaiting co-sign); issuing without distinct co-sign → **412** `SR_SECOND_CUSTODIAN_REQUIRED` |
| Priority | High |

| ID | TC-G12-112 |
|---|---|
| Traces-to | FR-10; OpenAPI `/sr/extracts/{id}/cosign` 200 |
| Type | State-Transition |
| Title | Second custodian co-signs FULL_SR → issued |
| Preconditions | FULL_SR awaiting co-sign; `CUST-2` distinct |
| Test data | `CUST-2` POST `/cosign` |
| Steps | Co-sign |
| Expected | **200** extract issued & co-signed |
| Priority | High |

| ID | TC-G12-113 |
|---|---|
| Traces-to | FR-10; `SR_REDACTION_REQUIRED` (412) |
| Type | Negative |
| Title | Requested scope exceeds redaction entitlement → SR_REDACTION_REQUIRED |
| Preconditions | Requester entitled only to redacted scope |
| Test data | Over-broad extract scope request |
| Steps | Request extract beyond entitlement |
| Expected | **412** `error.code=SR_REDACTION_REQUIRED` |
| Priority | Medium |

| ID | TC-G12-114 |
|---|---|
| Traces-to | FR-10 (live dispute rendered on extract) |
| Type | Functional |
| Title | A live dispute/appeal on an included entry renders on the extract |
| Preconditions | One included entry DISPUTED |
| Test data | Issue extract covering the disputed entry |
| Steps | Generate extract |
| Expected | Extract visibly marks the disputed status; not silently hidden |
| Priority | Medium |

| ID | TC-G12-115 |
|---|---|
| Traces-to | FR-18; OpenAPI `/authenticity-certificate` 201 |
| Type | Functional |
| Title | §65B/BSA authenticity certificate generated for an extract |
| Preconditions | Issued extract; current anchor exists |
| Test data | `CUST-1` POST `/sr/extracts/{id}/authenticity-certificate` |
| Steps | Generate certificate |
| Expected | **201** `AuthenticityCertificate` citing content digest, anchor reference, signer, chain-of-custody |
| Priority | High |

| ID | TC-G12-116 |
|---|---|
| Traces-to | FR-18; `SR_ANCHOR_MISSING` (412) |
| Type | Negative |
| Title | §65B generation with no current anchor → SR_ANCHOR_MISSING |
| Preconditions | Anchor absent within cadence |
| Test data | `POST /authenticity-certificate` |
| Steps | Generate certificate |
| Expected | **412** `error.code=SR_ANCHOR_MISSING` |
| Priority | Medium |

| ID | TC-G12-117 |
|---|---|
| Traces-to | FR-10; `SR_EXTRACT_REVOKED` (409); revoke-not-delete |
| Type | Immutability / State-Transition |
| Title | Extract can be revoked but re-revoking → SR_EXTRACT_REVOKED; never deleted |
| Preconditions | Issued extract |
| Test data | `POST /sr/extracts/{id}/revoke {reason}` twice |
| Steps | Revoke, then revoke again |
| Expected | First → **200** revoked (revocation feed updated); second → **409** `SR_EXTRACT_REVOKED`; extract row persists |
| Priority | Medium |

### FR-11 — Offline / QR verification

| ID | TC-G12-120 |
|---|---|
| Traces-to | FR-11; OpenAPI `/sr/verify/{qr_verification_token}` (security:[] public) |
| Type | API-Contract / Functional |
| Title | Public online QR verification returns status without auth |
| Preconditions | Valid issued extract token |
| Test data | `GET /sr/verify/{token}` (no bearer) |
| Steps | Public verify |
| Expected | **200** `PublicVerification` status; unknown token → **404**; rate-limit → **429** |
| Priority | High |

| ID | TC-G12-121 |
|---|---|
| Traces-to | FR-11 (offline bundle self-contained) |
| Type | Functional |
| Title | Offline bundle verifies against published CA chain + embedded anchor without calling issuer |
| Preconditions | Downloaded signed PDF bundle |
| Test data | Offline verifier + published CA chain |
| Steps | Verify offline (issuer endpoint blocked) |
| Expected | Verification succeeds using embedded anchor reference + CA chain; QR is convenience only |
| Priority | Medium |

| ID | TC-G12-122 |
|---|---|
| Traces-to | FR-11; OpenAPI `/sr/revocation-feed` (public) |
| Type | Functional |
| Title | Revoked extract shows revoked in the signed revocation feed |
| Preconditions | Extract revoked (TC-117) |
| Test data | `GET /sr/revocation-feed` |
| Steps | Fetch feed |
| Expected | **200** signed, cacheable feed lists the revoked `extract_no`; public verify reflects revoked |
| Priority | Medium |

### FR-12 — Custody & access log (fail-closed)

| ID | TC-G12-130 |
|---|---|
| Traces-to | FR-12; OpenAPI `/sr/access-log` |
| Type | Functional / Data-Integrity |
| Title | Every SR view/print writes an immutable access-log entry |
| Preconditions | Timeline/extract views performed |
| Test data | `AUD-1` GET `/sr/access-log?employee_id=...&action=VIEW` |
| Steps | Read the access log after views |
| Expected | **200** entries for each access with actor + `X-Correlation-Id`; 100% capture (fail-closed) |
| Priority | Medium |

| ID | TC-G12-131 |
|---|---|
| Traces-to | FR-12; auth-matrix (custodian/auditor read) |
| Type | Authorization |
| Title | Employee cannot query the access log |
| Preconditions | `EMP-100245` token |
| Test data | `GET /sr/access-log` |
| Steps | Employee reads access log |
| Expected | **403** `FORBIDDEN` |
| Priority | Low |

### FR-13 — Event subscriptions (single pull-feed)

| ID | TC-G12-140 |
|---|---|
| Traces-to | FR-13; OpenAPI `/sr/subscriptions` 201 |
| Type | Functional |
| Title | Register + activate a PULL_FEED subscription (G11/G06/G14 consumer) |
| Preconditions | `SYS-1`/custodian approves |
| Test data | `POST /sr/subscriptions {delivery_mode:"PULL_FEED"}` → `POST /{id}/activate` |
| Steps | Register then activate |
| Expected | **201** then **200** ACTIVE |
| Priority | Medium |

| ID | TC-G12-141 |
|---|---|
| Traces-to | FR-13; `SR_DELIVERY_MODE_DEFERRED` (409) |
| Type | Negative |
| Title | WEBHOOK/MESSAGE_BUS registration → SR_DELIVERY_MODE_DEFERRED |
| Preconditions | Deferred modes disabled at launch |
| Test data | `POST /sr/subscriptions {delivery_mode:"WEBHOOK"}` |
| Steps | Register deferred mode |
| Expected | **409** `error.code=SR_DELIVERY_MODE_DEFERRED` |
| Priority | Medium |

| ID | TC-G12-142 |
|---|---|
| Traces-to | FR-13; OpenAPI `/sr/feed` (since_seq watermark) |
| Type | API-Contract |
| Title | Authenticated pull-feed returns changes from a sequence watermark |
| Preconditions | Active subscription; new events since watermark |
| Test data | `GET /sr/feed?since_seq=100&limit=50` |
| Steps | Pull the change feed |
| Expected | **200** ordered changes after seq 100; cursor honoured; only authorised consumer |
| Priority | Low |

### FR-14 — Legacy digitisation (confidence-flagged)

| ID | TC-G12-150 |
|---|---|
| Traces-to | FR-14; state-machine legacy_digitisation_batch |
| Type | E2E-Flow / State-Transition |
| Title | Legacy batch progresses CREATED→…→PROMOTED with dual verification |
| Preconditions | `HRO-1` maker, `CUST-1` checker; scans in G13 |
| Test data | Batch with VERIFIED records matched to G01 |
| Steps | Scan→data-entry→dual-verify (maker≠verifier)→reconcile→promote |
| Expected | Promotion appends `is_legacy=true`, `confidence_status`, page ref, scan linkage (FR-03 bulk append); maker-checker enforced |
| Priority | High |

| ID | TC-G12-151 |
|---|---|
| Traces-to | FR-14 (confidence lane; co-sign for flagged) |
| Type | Functional / Authorization |
| Title | RECONSTRUCTED/LEGACY_UNVERIFIABLE facts promote only with provenance + note + corroboration + second co-sign |
| Preconditions | Batch has flagged (non-VERIFIED) records |
| Test data | Promote flagged records |
| Steps | Promote with/without provenance note & co-sign |
| Expected | Without provenance/co-sign → blocked; with both → promoted flagged; VERIFIED facts keep zero-tolerance reconciliation |
| Priority | High |

| ID | TC-G12-152 |
|---|---|
| Traces-to | FR-14 (semantic dedup on promote); `SR_LEGACY_UNMATCHED` (409) |
| Type | Negative / Idempotency |
| Title | Promotion blocked for an unmatched record; re-promoting an already-recorded fact is a semantic no-op |
| Preconditions | (a) record not matched to G01; (b) fact already in ledger with same `fact_key` |
| Test data | Promote both variants |
| Steps | Promote unmatched + duplicate-fact |
| Expected | (a) **409** `SR_LEGACY_UNMATCHED`; (b) semantic dedup prevents re-promotion (no double entry) |
| Priority | Medium |

### FR-15 — Retention, legal hold, cross-tenant continuity, DR anchor

| ID | TC-G12-160 |
|---|---|
| Traces-to | FR-15; state-machines invariant (append-only, permanent) |
| Type | Immutability |
| Title | Ledger is exempt from erasure (DPDP §17 statutory basis); correction maps to corrigendum |
| Preconditions | Data-principal correction request |
| Test data | Correction request against a ledger fact |
| Steps | Submit correction |
| Expected | No row edited/deleted; request routes to FR-05 corrigendum; both original & corrected preserved |
| Priority | High |

| ID | TC-G12-161 |
|---|---|
| Traces-to | FR-15; `SR_LEGAL_HOLD_ACTIVE` (409) |
| Type | Negative |
| Title | Tiering/archival change blocked by an active legal hold |
| Preconditions | Legal hold on `EMP-100245` |
| Test data | Attempt archival/tiering change |
| Steps | Attempt change under hold |
| Expected | **409** `error.code=SR_LEGAL_HOLD_ACTIVE` |
| Priority | Medium |

| ID | TC-G12-162 |
|---|---|
| Traces-to | FR-15 (cross-tenant chain continuity); §274 |
| Type | Integrity-Chain / Data-Integrity |
| Title | Transfer across tenants CONTINUES the chain (prior head linked, no fork) |
| Preconditions | `EMP-100245` transfers `T-ALPHA`→`T-BETA` |
| Test data | First entry in `T-BETA` scope |
| Steps | Post JOINING in new tenant scope |
| Expected | First new-scope entry carries `prior_chain_head_hash` genesis reference; sequence continuous; unbroken evidentiary link; content ops still tenant-scoped |
| Priority | High |

| ID | TC-G12-163 |
|---|---|
| Traces-to | FR-15/FR-04 (DR anchor reconciliation); `SR_STALE_RESTORE` (409) |
| Type | Negative / Integrity-Chain |
| Title | Restored chain heads predating the external anchor → SR_STALE_RESTORE |
| Preconditions | DB restored from a backup older than the latest anchor |
| Test data | Post-restore anchor reconciliation |
| Steps | Run restore gate / anchor reconcile |
| Expected | **409** `error.code=SR_STALE_RESTORE`; restore gate blocks silent rewind |
| Priority | Medium |

### FR-17 — Completeness assurance & gap register

| ID | TC-G12-170 |
|---|---|
| Traces-to | FR-17; OpenAPI `/sr/gaps` (Gaps); JOB-G12-GAPSCAN |
| Type | Functional |
| Title | Gap scan raises GAP_FLAGGED for a missing expected event |
| Preconditions | `ANNUAL_INCREMENT` expected (July cadence) but absent, no suppressor |
| Test data | Run gap scan / list gaps |
| Steps | Trigger `JOB-G12-GAPSCAN`; list findings |
| Expected | `sr_gap_register` finding `GAP_FLAGGED`, severity CRITICAL (pension-affecting) |
| Priority | High |

| ID | TC-G12-171 |
|---|---|
| Traces-to | FR-17 (legitimate suppressors) |
| Type | Boundary |
| Title | Suppressor event (SUSPENSION/LWP_SPELL/INCREMENT_WITHHELD) prevents a false gap |
| Preconditions | Increment absent but `INCREMENT_WITHHELD` recorded for the period |
| Test data | Gap scan over the suppressed period |
| Steps | Run gap scan |
| Expected | No `GAP_FLAGGED` for the suppressed period (absence legitimately explained) |
| Priority | Medium |

| ID | TC-G12-172 |
|---|---|
| Traces-to | FR-17 (corroboration WF-G12-GAP-RESOLVE) |
| Type | State-Transition |
| Title | Gap resolved EXPLAINED / CLOSED_RECORDED / CLOSED_FALSE_POSITIVE |
| Preconditions | Open `GAP_FLAGGED` |
| Test data | Custodian + employee corroborate |
| Steps | Resolve gap via each disposition |
| Expected | Gap transitions to the chosen disposition; CLOSED_RECORDED links the recorded event (FR-02/05/14) |
| Priority | Medium |

### FR-19 — LTV / evidence-record renewal

| ID | TC-G12-180 |
|---|---|
| Traces-to | FR-19; OpenAPI LTV tag; JOB-G12-LTV |
| Type | Functional |
| Title | LTV renewal re-timestamps signed extracts before cert/algorithm expiry |
| Preconditions | Signed extract nearing cert expiry |
| Test data | Run `JOB-G12-LTV` |
| Steps | Trigger LTV renewal |
| Expected | PAdES-LTV envelope renewed via RFC 4998 evidence record; `sr_ltv_renewals` row; extract stays verifiable; history not rewritten |
| Priority | Medium |

| ID | TC-G12-181 |
|---|---|
| Traces-to | FR-19 / FR-03 BR-03.2 (crypto-agility) |
| Type | Integrity-Chain |
| Title | Crypto migration re-anchors to a new algorithm without rewriting history |
| Preconditions | New `hash_algorithm` provisioned |
| Test data | Migration re-anchor procedure |
| Steps | Re-anchor under a new algorithm |
| Expected | New anchor covers heads under the new algorithm; existing `entry_hash`/`hash_algorithm` per-row preserved; old chain still verifies |
| Priority | Low |

### FR-20 — Bulk corrigendum (cadre-wide, sampling approval)

| ID | TC-G12-190 |
|---|---|
| Traces-to | FR-20; state-machine bulk_corrigendum |
| Type | E2E-Flow / State-Transition |
| Title | Bulk corrigendum DRAFT→PREVIEW→SAMPLING_APPROVAL→APPROVED→APPLIED |
| Preconditions | Selector matches N cadre entries; `CUST-1` maker, `CUST-2` approver |
| Test data | Pay-commission correction batch |
| Steps | Create+selector → preview (count+sample) → submit sample → 2nd custodian approves → apply |
| Expected | Applies per-entry FR-05 supersession; failures logged (not aborting); full per-entry audit retained |
| Priority | High |

| ID | TC-G12-191 |
|---|---|
| Traces-to | FR-20; SoD (maker != approver) |
| Type | Authorization |
| Title | Bulk maker cannot approve own sample |
| Preconditions | `CUST-1` maker |
| Test data | `CUST-1` approves the sampling |
| Steps | Same person approves |
| Expected | **403** `FORBIDDEN` (maker != approver) |
| Priority | Medium |

| ID | TC-G12-192 |
|---|---|
| Traces-to | FR-20; state-machine (sample fails → REJECTED, nothing applied) |
| Type | State-Transition / Negative |
| Title | Sample below threshold → REJECTED, no entries changed |
| Preconditions | Sampling accuracy below threshold |
| Test data | Failing sample |
| Steps | Approver reviews failing sample |
| Expected | Batch → REJECTED; zero ledger changes |
| Priority | Medium |

### Cross-cutting: idempotency, envelope, correlation

| ID | TC-G12-200 |
|---|---|
| Traces-to | Platform conventions; error envelope |
| Type | API-Contract |
| Title | Every response carries `X-Correlation-Id`; errors use the canonical envelope |
| Preconditions | Any endpoint |
| Test data | Success + failure calls |
| Steps | Inspect headers/body |
| Expected | `X-Correlation-Id` header on every response; 4xx/5xx bodies = `{error:{code,message,field,details}}` only; correlation id never in body |
| Priority | Medium |

| ID | TC-G12-201 |
|---|---|
| Traces-to | Platform Idempotency-Key (24h replay → original) |
| Type | Idempotency |
| Title | 24h idempotency replay on a workflow POST returns the original result |
| Preconditions | A corrigendum created with `Idempotency-Key=K1` |
| Test data | Repeat POST with `K1` within 24h |
| Steps | Replay the same POST |
| Expected | Original result returned; no duplicate workflow instance (`CONFLICT`/replay semantics) |
| Priority | Medium |

| ID | TC-G12-202 |
|---|---|
| Traces-to | FR-12 / FR-16; audit-everything |
| Type | Data-Integrity |
| Title | Every ingest/attest/correction/extract/anchor writes an audit_log row |
| Preconditions | Perform one of each action |
| Test data | Audit query by correlation id |
| Steps | Query `audit_log` after each action |
| Expected | One immutable audit row per action with actor + before/after + `X-Correlation-Id` |
| Priority | Medium |

---

## 3. Traceability matrix (FR → TC — 0 gaps)

| FR | Coverage | Test cases |
|---|---|---|
| FR-01 Taxonomy (+FR-01.A catalog, FR-01.B writer matrix) | ✅ | TC-001, 002, 003, 004, 005, 006, 007, 014, 015, 021 |
| FR-02 Ingestion write-port (idempotent, semantic-dedup, reversal) | ✅ | TC-010, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 030, 031, 032 |
| FR-03 Append-only ledger + status sub-ledger | ✅ | TC-040, 041, 042, 043, 044, 045, 046 |
| FR-04 Integrity + status + anchor verification | ✅ | TC-050, 051, 052, 053, 054, 055, 057, 163 |
| FR-05 Corrigendum / supersession | ✅ | TC-030, 060, 061, 062, 063, 064, 065, 066, 160, 190 |
| FR-06 Annotation / dispute | ✅ | TC-070, 071, 072, 073 |
| FR-07 Custodian attestation (qualified signature) | ✅ | TC-080, 081, 082, 083, 084, 085 |
| FR-08 Verification (bulk / assisted / heir + gap gate) | ✅ | TC-090, 091, 092, 093, 094, 095, 096 |
| FR-09 SR timeline view | ✅ | TC-100, 101, 102, 103 |
| FR-10 Certified extract + redaction + dual custodian | ✅ | TC-110, 111, 112, 113, 114, 117 |
| FR-11 Offline / QR verification | ✅ | TC-120, 121, 122 |
| FR-12 Custody, access control & access log | ✅ | TC-130, 131, 202 |
| FR-13 Event subscriptions (single pull-feed) | ✅ | TC-140, 141, 142 |
| FR-14 Legacy digitisation (confidence-flagged) | ✅ | TC-150, 151, 152 |
| FR-15 Retention / legal hold / cross-tenant / DR anchor | ✅ | TC-160, 161, 162, 163 |
| FR-16 Forensics view & SR analytics | ✅ | TC-056, 130, 202 |
| FR-17 Completeness assurance & gap register | ✅ | TC-094, 170, 171, 172 |
| FR-18 §65B / BSA authenticity certificate | ✅ | TC-115, 116 |
| FR-19 LTV / evidence-record renewal | ✅ | TC-180, 181 |
| FR-20 Bulk corrigendum | ✅ | TC-190, 191, 192 |
| FR-21 Grievance & appeal escalation | ✅ | TC-074, 075, 076 |
| Cross-cutting (envelope, idempotency, correlation, audit) | ✅ | TC-200, 201, 202 |

All 21 FRs covered — **0 gaps**.

---

## 4. Coverage summary

**Total test cases: 82**

### By type

| Type | Count | TC ids |
|---|---|---|
| Functional | 16 | 001, 021, 060, 072, 080, 085, 090, 091, 100, 110, 114, 115, 121, 122, 140, 170, 180 (representative) |
| Boundary | 8 | 002, 005, 019, 023, 040, 054, 103, 171 |
| Negative | 20 | 002, 006, 013, 014, 015, 016, 017, 018, 025, 031, 062, 071, 074, 081, 082, 083, 101, 113, 116, 141, 152, 161, 163, 192 |
| Authorization | 15 | 003, 014, 020, 024, 055, 061, 063, 066, 076, 084, 092, 096, 111, 131, 191 |
| Immutability | 6 | 004, 042, 043, 046, 117, 160 |
| Idempotency | 6 | 011, 012, 023, 152, 201 |
| Integrity-Chain | 10 | 040, 041, 044, 051, 052, 053, 057, 162, 163, 181 |
| State-Transition | 12 | 030, 032, 060, 064, 065, 070, 072, 073, 075, 094, 095, 172, 190, 192 |
| API-Contract | 7 | 007, 022, 056, 100, 120, 142, 200 |
| E2E-Flow | 8 | 010, 030, 064, 075, 093, 110, 150, 190 |
| Data-Integrity | 5 | 057, 102, 130, 162, 202 |

> Note: several TCs assert more than one dimension (e.g. an E2E flow that also validates a state transition and an error code); they are listed under their primary type in the total-of-82 count and cross-listed above for visibility.

### By priority

| Priority | Count |
|---|---|
| High | 41 |
| Medium | 33 |
| Low | 8 |

### Contract & integrity guarantee coverage (write-port focus)

| Guarantee | Covered by |
|---|---|
| Valid ingest per source module | TC-010, 021 |
| Dedup tuple idempotent replay (same tuple → same result) | TC-011, 023, 201 |
| Semantic dedup on `fact_key` (no double-count) | TC-012, 013, 152 |
| `source_module` allowlist (`SR_SOURCE_NOT_ALLOWED`) | TC-014 |
| Event type in catalog (`SR_TYPE_NOT_FOUND`) | TC-015 |
| `fact_key` required for qualifying types (`SR_FACT_KEY_REQUIRED`) | TC-017 |
| Append-only immutability (update/delete forbidden) | TC-042, 043, 046, 160, `SR_DELETION_FORBIDDEN`/`SR_ENTRY_IMMUTABLE` |
| Hash-chain integrity + tamper detection | TC-041, 050, 051, 052 |
| Reversal via `is_reversal` envelope (supersede-not-delete) | TC-030, 031, 032 |
| Corrigendum/annotation maker-checker + second-custodian SoD | TC-060–066 |
| Attestation (qualified signature; server-sign banned) | TC-080–085 |
| Periodic verification (bulk/assisted/heir) | TC-090–096 |
| Gap register / completeness gate | TC-094, 170–172 |
| Certified extract + §65B (via G13) | TC-110–117 |
| Anchors / anchor-mismatch / LTV renewal | TC-053, 054, 180, 181 |
| Legacy digitisation (confidence-flagged) | TC-150–152 |
| Chain continuity / tenant-scoped chain | TC-057, 162, 163 |
