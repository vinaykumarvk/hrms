# G04 — Leave→SR Integration — Acceptance & E2E Test Suite

## 1. Header

| Item | Value |
|---|---|
| Module | **G04 — Leave Management Integration with Digital Service Register** (alias `M04-LSR`, `GOV-M04`) |
| Scope | The reliable, idempotent, reconciled bridge that maps approved/cancelled/amended leave events (source **G03**) into the append-only statutory **Digital Service Register** ledger (target **G12**, on the P05 audit substrate) with **exactly-once effect**. Covers FR-01 … FR-18. |
| Ground truth | `docs/brd/v3/G04-leave-sr-integration.md` (FRs, AC, business rules, edge cases, state tables §10) · `docs/contracts/openapi/G04.yaml` (v3.1.0) · `docs/contracts/error-taxonomy.yaml` (`ERR-G04-*` + `SR_*`) · `docs/contracts/state-machines.yaml` (G04 machines) · `docs/contracts/auth-matrix.yaml` (G04 actions/roles) |
| Suite version | 1.0 |
| Test-case count | **76** (TC-G04-001 … TC-G04-076) |

### 1.1 Traceability

Every case names **Traces-to** (FR + AC / BR / edge / state-table id). Section 4 provides the FR→TC matrix (0 gaps across FR-01…FR-18). Section 5 summarises counts by type and priority.

### 1.2 Test-environment & data assumptions

- **Multi-tenant.** Two tenants `T1`, `T2`; every G04 entity (`leave_event_outbox`, `sr_event_mapping`, `sr_posting_log`, `sr_dead_letter`, `reconciliation_run/finding`, `sr_correction_link`, `historical_leave_*`, `integration_config`, `relay_partition_lease`, `port_conformance_run`, `capture_integrity_finding`, `prepension_certificate`) carries non-null `tenant_id`/`entity_id`; a query without resolvable tenant scope is **rejected**, never defaulted to "all" (Platform §0.1).
- **Source (G03).** A test harness that emits HMAC-signed leave domain events (`LEAVE_APPROVED` / `LEAVE_CANCELLED` / `LEAVE_AMENDED`) carrying `leave_spell_lineage_id`, monotonic `event_sequence`, `leave_type_code`, spell window, `days_count`, and `payload_signature`. G03's approve transition side-effect "G04 SR enqueue" is the trigger (state-machines G03 `leave_application`).
- **Target (G12).** A conformant `POST /api/v1/sr/ingest` (+ `/api/v1/sr/ingest/reversal`) test double reachable via the X.3 outbound framework: honours the canonical dedup tuple `(sourceModule="G04", sourceReferenceId, sourceEventVersion)`, mandatory `factKey`, `Idempotency-Key`=`dedupe_key`, returns `srEventId`; append-only P05 substrate (UPDATE/DELETE rejected); dedup-key retention ≥ 2557 days. A "non-conformant G12" variant is available for FR-16 negative cases.
- **Published G12 event codes (verbatim).** `EL_AVAILED`, `HPL_AVAILED`, `COMMUTED_LEAVE`, `STUDY_LEAVE`, `MATERNITY_LEAVE`, `LWP_SPELL`, `EOL_SPELL`; cancellations use the `*_CANCELLED` partner via the `isReversal=true` envelope. Non-SR casual leave = no-op.
- **Roles (auth-matrix G04 + additions).** `integ_ops` (+`g04_dlq_ops`), `sr_custodian` (+`g04_prepension_sign`, `g12_sr_custodian`), `hr_admin`, `pension_officer` (MFA), `org_admin` (Sys Admin / mapping draft), Auditor (Org-Admin read + P05 `Audit.query/export` entitlement), `employee` (no direct G04 access). SoD (maker≠checker) enforced by P01/P02.
- **Platform conventions.** All endpoints under `/api/v1`; bearer JWT resolved by P02 `Authorization.check`; unsafe POSTs accept `Idempotency-Key` (24h replay → `CONFLICT`); cursor pagination (`limit` default 25 / max 100, `next_cursor`); `X-Correlation-Id` echoed; canonical error envelope `{ error: { code, message, field, details } }`; 8-code status table (`VALIDATION_FAILED` 422, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `PRECONDITION_FAILED` 412, `RATE_LIMITED` 429, `INTERNAL` 500). No public 503 — G12 unavailability maps to 412/500 via X.3.
- **Dedupe key.** `dedupe_key = base62(sha256(leave_spell_lineage_id + ':' + event_type + ':' + event_sequence))[:32]` — **mapping-version-independent** (BR-03.1).
- **Config baseline.** `max_retries=3`, exponential backoff+jitter, `lease_timeout` and `reaper_interval` set small (test tuning), relay initially **running**, port-conformance gate initially **OPEN (PASS)** unless a case states otherwise.
- **Determinism.** Time is controllable (clock injection) for lease expiry, backoff, and P95-lag measurement. Reconciliation/relay/reaper jobs (`JOB-G04-RELAY/REAPER/RECON/INTEGRITY/CONFORMANCE/DLQ-SLA`) can be triggered on demand.

---

## 2. Test cases

> Assertions name the **exact wire code** (HTTP + `error.code`). Where a G12-owned `SR_*` code is returned to the relay, both the G12 code and the mapped `ERR-G04-*` (per X.3 error mapping) are asserted.

### FR-01 — Signed transactional-outbox capture

#### TC-G04-001
- **Traces-to:** FR-01 / AC-1
- **Type:** Functional
- **Title:** Approved SR-affecting leave produces exactly one outbox row in the same DB transaction
- **Priority:** P0
- **Preconditions:** Published `POST_SR` mapping exists for `(EL, LEAVE_APPROVED)`; relay paused (isolate capture).
- **Test data:** Employee `E1`/T1; `lineage=L-EL-1`, `event_sequence=1`, `leave_type_code=EL`, `days_count=10.0`, valid signature.
- **Steps:** 1) G03 commits leave-ledger approval + outbox write in one tx. 2) `GET /api/v1/lsr/outbox?leaveSpellLineageId=L-EL-1`.
- **Expected:** Exactly one row; `status=PENDING`, `available_at≈now`, `attempt_count=0`, non-null `leave_spell_lineage_id`/`tenant_id`, valid `payload_signature`. P05 audit row captured.

#### TC-G04-002
- **Traces-to:** FR-01 / AC-2
- **Type:** Data-Integrity
- **Title:** Transaction rollback discards both the leave-ledger write and the outbox row
- **Priority:** P0
- **Preconditions:** Fault injected to abort G03 tx after both writes are staged.
- **Test data:** `lineage=L-RB-1`, seq 1, EL.
- **Steps:** 1) Trigger approval whose tx rolls back. 2) Query G03 ledger and `GET /lsr/outbox?leaveSpellLineageId=L-RB-1`.
- **Expected:** Neither a ledger entry nor an outbox row exists (atomicity holds; no orphan capture).

#### TC-G04-003
- **Traces-to:** FR-01 / AC-3
- **Type:** Data-Integrity
- **Title:** Outbox payload is an immutable snapshot
- **Priority:** P1
- **Preconditions:** Outbox row captured for `L-SNAP-1`.
- **Test data:** After capture, mutate the source spell in G03 (change `days_count`).
- **Steps:** 1) Capture. 2) Edit source spell. 3) Re-read outbox `payload`.
- **Expected:** Outbox `payload` unchanged (frozen snapshot); source edits do not mutate it.

#### TC-G04-004
- **Traces-to:** FR-01 / AC-4, edge (duplicate emission)
- **Type:** Idempotency
- **Title:** Duplicate event emission is a no-op via `(tenant_id, lineage, event_sequence)` uniqueness
- **Priority:** P0
- **Preconditions:** At-least-once source simulated.
- **Test data:** Emit `L-DUP-1/seq=1` twice.
- **Steps:** 1) Emit event. 2) Re-emit identical event. 3) Count outbox rows.
- **Expected:** Exactly one outbox row; second emission is idempotent no-op; no error surfaced to source.

#### TC-G04-005
- **Traces-to:** FR-01 / AC-6, `VAL-G04-LINEAGE`
- **Type:** Negative
- **Title:** Capture with missing lineage rejected
- **Priority:** P0
- **Test data:** Event with `leave_spell_lineage_id=null`.
- **Steps:** Attempt capture.
- **Expected:** **422 `ERR-G04-LINEAGE-MISSING`** (`field: leave_spell_lineage_id`); no outbox row written.

#### TC-G04-006
- **Traces-to:** FR-01 / AC-6, BR-01.4, edge (forged payload)
- **Type:** Negative
- **Title:** Capture with invalid HMAC signature rejected and logged
- **Priority:** P0
- **Test data:** Event with tampered `payload_signature`.
- **Steps:** Attempt capture by the `g04.outbox.write` principal.
- **Expected:** **403 `ERR-G04-SIGNATURE-INVALID`**; no outbox row; `security_audit_log` (P05) entry raised; later surfaced as `SIGNATURE_MISMATCH` integrity finding (FR-17).

#### TC-G04-007
- **Traces-to:** FR-01 / BR-01.1, AC-5, edge (non-SR leave); state-table 10.1
- **Type:** State-Transition
- **Title:** Non-SR casual leave captured then EXCLUDED, never dead-lettered
- **Priority:** P1
- **Preconditions:** `(CASUAL, LEAVE_APPROVED)` mapped `EXCLUDED_NON_SR`.
- **Test data:** `lineage=L-CAS-1`, `leave_type_code=CASUAL`, `days_count=1.0`.
- **Steps:** 1) Capture. 2) Run relay. 3) Inspect status + DLQ.
- **Expected:** Outbox `status=EXCLUDED` (deliberate no-op); no `/sr/ingest` call; **no** `sr_dead_letter` row (no DLQ flood).

### FR-02 — Governed event-mapping catalog

#### TC-G04-008
- **Traces-to:** FR-02 / AC-1
- **Type:** Functional
- **Title:** DRAFT mapping CRUD; PUBLISHED mapping is immutable
- **Priority:** P1
- **Steps:** 1) `POST /lsr/mappings` (draft). 2) `PUT /lsr/mappings/{id}` edit. 3) Publish. 4) Attempt `PUT` on the published version.
- **Expected:** Draft create/edit/soft-delete succeed; edit of a PUBLISHED version rejected **409 `CONFLICT`** (only supersede/retire); new version required for change.

#### TC-G04-009
- **Traces-to:** FR-02 / AC-2; auth `g04.sr_mapping.publish`
- **Type:** State-Transition
- **Title:** Publish requires SR Custodian P01 approval, maker ≠ checker
- **Priority:** P0
- **Preconditions:** Draft authored by `org_admin` (Sys Admin maker).
- **Steps:** 1) `POST /lsr/mappings/{id}/publish` as `org_admin`. 2) Same `org_admin` attempts to approve the P01 instance. 3) `sr_custodian` approves.
- **Expected:** Publish returns **202** (workflow started); self-approval by maker rejected **403 `FORBIDDEN`** (SoD); `sr_custodian` approval → `PUBLISHED`; P05-captured with version+actor.

#### TC-G04-010
- **Traces-to:** FR-02 / AC-3, `VAL-G04-MAPCOVER`
- **Type:** Negative
- **Title:** Overlapping effective ranges rejected at publish
- **Priority:** P0
- **Test data:** Two PUBLISHED-intent mappings for `(EL, LEAVE_APPROVED)` with overlapping `effective_from`/`effective_to`.
- **Steps:** Publish the second.
- **Expected:** **409 `ERR-G04-MAPPING-OVERLAP`**; second version not published.

#### TC-G04-011
- **Traces-to:** FR-02 / AC-6, `VAL-G04-CITATION`
- **Type:** Negative
- **Title:** POST_SR mapping without statutory citation rejected
- **Priority:** P0
- **Test data:** `disposition=POST_SR`, `statutory_rule_ref=null`.
- **Steps:** Attempt publish.
- **Expected:** **422 `VALIDATION_FAILED`** (`field: statutory_rule_ref`); publish blocked.

#### TC-G04-012
- **Traces-to:** FR-02 / BR-02.4, AC (straddle), edge
- **Type:** Boundary
- **Title:** Rule-straddling spell split into per-effective-range SR sub-entries
- **Priority:** P1
- **Preconditions:** Mapping `straddle_handling=SPLIT_BY_EFFECTIVE`; rule change on a date inside the spell.
- **Test data:** LWP spell `01-Mar…30-Apr` straddling a `01-Apr` rule change; `days_count=61`.
- **Steps:** Capture + relay.
- **Expected:** Two SR sub-entries, each with its own `statutory_rule_ref`; sum of sub-entry days = 61 (no over/under count).

### FR-03 — Partitioned idempotent posting relay (exactly-once effect)

#### TC-G04-013
- **Traces-to:** FR-03 / AC-1, AC-6; RM-1; **primary E2E**
- **Type:** E2E-Flow
- **Title:** G03 approved leave → G04 outbox → POST /api/v1/sr/ingest → G12 ledger entry
- **Priority:** P0
- **Preconditions:** Port-conformance gate OPEN; published `(EL, LEAVE_APPROVED)→EL_AVAILED` mapping.
- **Test data:** `E1`/T1, `lineage=L-E2E-1`, seq 1, EL, 10.0 days.
- **Steps:** 1) G03 approves leave (`leave_spell_lineage_id=L-E2E-1`). 2) `JOB-G04-RELAY` claims the partition. 3) Relay POSTs `/api/v1/sr/ingest` over X.3 with `Idempotency-Key=dedupe_key`, tuple `(G04, L-E2E-1:LEAVE_APPROVED, 1)`, `factKey`, `eventTypeCode=EL_AVAILED`, `tenantId/entityId`, `leaveSpellLineageId`. 4) Inspect G12 ledger + `GET /lsr/postings?leaveSpellLineageId=L-E2E-1`.
- **Expected:** **201** from `/sr/ingest` with `srEventId`; exactly one G12 ledger row carrying `dedupe_key`+`correlationId`+`leaveSpellLineageId`; outbox `POSTED`; `sr_posting_log` `SUCCESS` with lineage+dedupe key; `X-Correlation-Id` threaded end-to-end.

#### TC-G04-014
- **Traces-to:** FR-03 / AC-3; error-taxonomy `ERR-G04-IDEMPOTENT-DUPLICATE` / `SR_DUPLICATE_EVENT`
- **Type:** Idempotency
- **Title:** Replayed post with the same dedupe_key returns original srEventId as DUPLICATE_NOOP (no second row)
- **Priority:** P0
- **Preconditions:** `L-E2E-1` already POSTED (TC-013).
- **Steps:** Re-drive the same outbox event to `/sr/ingest` with the identical `Idempotency-Key`.
- **Expected:** **200** `SrIngestDuplicate` `{status: DUPLICATE_NOOP, srEventId: <original>, code: ERR-G04-IDEMPOTENT-DUPLICATE}`; G12 ledger still has exactly one row for the lineage.

#### TC-G04-015
- **Traces-to:** FR-03 / AC-3, BR-03.1, edge (remap mid-retry)
- **Type:** Idempotency
- **Title:** Dedupe key is mapping-version-independent — remap between attempts does not duplicate
- **Priority:** P0
- **Preconditions:** Event pinned to `mapping_version=3`, first attempt fails retryably; a new mapping version is published before retry.
- **Steps:** 1) First attempt (retryable failure). 2) Publish mapping v4. 3) Retry.
- **Expected:** `dedupe_key` unchanged (excludes `mapping_version`); retry → `DUPLICATE_NOOP` or single new row; **no** duplicate SR entry; `pinned_mapping_version` stays 3.

#### TC-G04-016
- **Traces-to:** FR-03 / AC-2, BR-03.4; state-table 10.1
- **Type:** Reliability
- **Title:** Concurrent relay instances never double-post; events post per partition in event_sequence order
- **Priority:** P0
- **Preconditions:** Two relay workers; partition `E1` has seq 1,2,3 pending.
- **Steps:** Start both workers concurrently.
- **Expected:** One `relay_partition_lease` holder at a time; each event posted once; G12 receives seq 1→2→3 in order; no interleaving/duplicate.

#### TC-G04-017
- **Traces-to:** FR-03 / edge (crash after G12 success); FR-15
- **Type:** Reliability
- **Title:** Crash after G12 success but before marking POSTED self-heals via reaper + dedupe
- **Priority:** P0
- **Preconditions:** G12 returns 201; relay killed before writing `POSTED`.
- **Steps:** 1) Post succeeds at G12. 2) Kill relay (row stuck `IN_FLIGHT`). 3) Lease expires; `JOB-G04-REAPER` re-enqueues; relay re-posts.
- **Expected:** Re-post returns `DUPLICATE_NOOP`; outbox reaches `POSTED`; exactly one G12 row (no duplicate).

#### TC-G04-018
- **Traces-to:** FR-03 / AC-4, `VAL-G04-ORDER`; state-table 10.1; `ERR-G04-BLOCKED-AWAITING-ORIGINAL`
- **Type:** State-Transition
- **Title:** Correction is not posted while its original is not yet POSTED
- **Priority:** P0
- **Preconditions:** `L-ORD-1` original still PENDING; a `LEAVE_CANCELLED` (seq 2) arrives.
- **Steps:** 1) Capture cancellation. 2) Attempt relay of the correction. 3) Post the original. 4) Re-run relay.
- **Expected:** Correction held `BLOCKED_AWAITING_ORIGINAL`; direct `/sr/ingest/reversal` while blocked → **409 `ERR-G04-BLOCKED-AWAITING-ORIGINAL`**; once original `POSTED`, correction transitions PENDING→POSTED.

#### TC-G04-019
- **Traces-to:** FR-03 / AC-7, BR-03.2
- **Type:** Data-Integrity
- **Title:** pinned_mapping_version resolved once at first claim and never recomputed
- **Priority:** P1
- **Steps:** 1) First claim pins `mapping_version`. 2) Publish a newer mapping. 3) Force retries.
- **Expected:** `sr_posting_log.mapping_id` and outbox `pinned_mapping_version` remain the first-claim version across all retries.

#### TC-G04-020
- **Traces-to:** FR-03 / RM-3, D-3; error-taxonomy `SR_FACT_KEY_REQUIRED`; **key negative**
- **Type:** Negative
- **Title:** Missing fact_key on SR ingest rejected
- **Priority:** P0
- **Preconditions:** Relay builds an ingest payload with `factKey` omitted (defect/edge).
- **Steps:** POST `/api/v1/sr/ingest` without `factKey`.
- **Expected:** **422 `SR_FACT_KEY_REQUIRED`** (mapped to `VALIDATION_FAILED`); no SR row; relay treats as permanent failure → DLQ (no infinite retry).

#### TC-G04-021
- **Traces-to:** FR-03 / D-3; error-taxonomy `SR_SOURCE_NOT_ALLOWED`; **key negative**
- **Type:** Negative
- **Title:** Disallowed source_module rejected by G12 ingest
- **Priority:** P0
- **Test data:** Ingest payload with `sourceModule="G99"` (not in the SR type allowlist).
- **Steps:** POST `/api/v1/sr/ingest`.
- **Expected:** **403 `SR_SOURCE_NOT_ALLOWED`** (`FORBIDDEN`); no SR row; classified permanent → DLQ `VALIDATION_REJECT`.

#### TC-G04-022
- **Traces-to:** FR-03 / RM-2; error-taxonomy `SR_TYPE_NOT_FOUND`; **key negative**
- **Type:** Negative
- **Title:** Event type not in G12 catalog rejected
- **Priority:** P1
- **Test data:** `eventTypeCode="EL_AVAILED_XYZ"` (not published effective on `event_date`).
- **Steps:** POST `/api/v1/sr/ingest`.
- **Expected:** **404 `SR_TYPE_NOT_FOUND`** (alias `ERR-G12-TYPE-NOT-FOUND`); no SR row; DLQ permanent.

#### TC-G04-023
- **Traces-to:** FR-03 / AC-8, edge (sustained outage); state-table 10.5; `ERR-G04-SR-UNAVAILABLE`
- **Type:** Reliability
- **Title:** Sustained G12 outage opens the X.3 breaker; events stay durable; no public 503
- **Priority:** P1
- **Preconditions:** G12 double returns repeated 5xx/timeouts past the breaker threshold.
- **Steps:** 1) Drive several posts. 2) Observe breaker state + posting attempts.
- **Expected:** X.3 breaker `CLOSED→OPEN`; CRITICAL X.2 alert; further posts short-circuit surfaced as **412 `ERR-G04-SR-UNAVAILABLE`** (never wire 503); outbox rows remain durable (not lost); breaker `HALF_OPEN→CLOSED` on probe success.

### FR-04 — Retry, backoff & dead-letter

#### TC-G04-024
- **Traces-to:** FR-04 / AC-1, BR-04.1
- **Type:** Reliability
- **Title:** Retryable failure retries with exponential backoff + jitter
- **Priority:** P1
- **Test data:** G12 returns retryable timeout; `max_retries=3`.
- **Steps:** Observe `available_at`, `attempt_count` across attempts.
- **Expected:** Status `FAILED` between attempts; `available_at = now + base*2^(attempt-1) + jitter` (capped); `attempt_count` increments; each attempt appends `sr_posting_log`.

#### TC-G04-025
- **Traces-to:** FR-04 / AC-2, BR-04.2
- **Type:** Negative
- **Title:** Permanent failure dead-letters immediately without pointless retries
- **Priority:** P0
- **Test data:** G12 returns a permanent `VALIDATION_REJECT` (e.g. `SR_PAYLOAD_INVALID`).
- **Steps:** Drive one post.
- **Expected:** No retry loop; outbox → `DEAD_LETTERED`; exactly one `sr_dead_letter` row; `failure_class=VALIDATION_REJECT`.

#### TC-G04-026
- **Traces-to:** FR-04 / AC-3; state-table 10.1
- **Type:** State-Transition
- **Title:** Exhausted retries create exactly one DLQ row and set outbox DEAD_LETTERED
- **Priority:** P0
- **Test data:** Retryable failure repeated > `max_retries`.
- **Steps:** Let retries exhaust.
- **Expected:** `attempt_count > max_retries` → `DEAD_LETTERED`; exactly one `sr_dead_letter` row (no duplicates); P05-captured.

#### TC-G04-027
- **Traces-to:** FR-04 / AC-4, BR-04.3; `ERR-G04-RELAY-PAUSED`
- **Type:** Functional
- **Title:** Manual relay-pause halts posting without loss; resume re-drains the outbox
- **Priority:** P1
- **Steps:** 1) `POST /lsr/relay/pause` (reason). 2) Capture new events; attempt a post. 3) `POST /lsr/relay/resume`.
- **Expected:** While paused, direct SR-post attempts return **412 `ERR-G04-RELAY-PAUSED`**; events stay durable PENDING; on resume all drain to POSTED (no data loss).

### FR-05 — Dead-letter triage & maker-checker resolution

#### TC-G04-028
- **Traces-to:** FR-05 / AC-1
- **Type:** Functional
- **Title:** DLQ list filterable by failure_class / age / lineage with cursor pagination
- **Priority:** P2
- **Steps:** `GET /lsr/dlq?failureClass=MAPPING_MISSING&limit=25`.
- **Expected:** 200 page; filters applied; `next_cursor` present; `limit>100` rejected 422 (bound).

#### TC-G04-029
- **Traces-to:** FR-05 / AC-2, BR-05.3; state-table 10.2
- **Type:** Idempotency
- **Title:** DLQ replay re-enqueues with the same lineage-based dedupe key (no duplicate)
- **Priority:** P0
- **Preconditions:** DLQ item for `L-DLQ-1` (transient cause now fixed).
- **Steps:** 1) `POST /lsr/dlq/{id}/replay` (IntegOps maker → P01). 2) SR Custodian approves. 3) Event re-drives.
- **Expected:** Replay re-enqueues outbox to PENDING preserving `dedupe_key`; re-post yields at most one SR row (DUPLICATE_NOOP if already posted); item closes `RESOLVED_REPLAYED` only after POSTED (AC-5).

#### TC-G04-030
- **Traces-to:** FR-05 / BR-05.1, BR-05.4; `ERR-G04-DLQ-REPLAY-BLOCKED`
- **Type:** Negative
- **Title:** Replay blocked while mapping missing or signature unfixed
- **Priority:** P0
- **Test data:** (a) `MAPPING_MISSING` item with no covering `POST_SR` mapping; (b) `SIGNATURE_INVALID` item not re-signed.
- **Steps:** `POST /lsr/dlq/{id}/replay` for each.
- **Expected:** Both → **409 `ERR-G04-DLQ-REPLAY-BLOCKED`**; item stays unresolved; signature-class flagged not operator-editable.

#### TC-G04-031
- **Traces-to:** FR-05 / AC-3, BR-05.2; state-table 10.2; auth `g04.dlq.triage_replay`
- **Type:** State-Transition
- **Title:** Discard requires justification + SR Custodian approval; data retained
- **Priority:** P1
- **Steps:** 1) `POST /lsr/dlq/{id}/discard` without reason. 2) With reason (IntegOps maker). 3) SR Custodian approves via P01.
- **Expected:** Missing reason → 422 `VALIDATION_FAILED`; with reason → 202 workflow; on approval `RESOLVED_DISCARDED`; row retained (never deleted); P05-captured actor/time.

### FR-06 — State-aware reconciliation engine

#### TC-G04-032
- **Traces-to:** FR-06 / AC-2, BR-06.x, edge; `pending_excluded_count`
- **Type:** Reconciliation
- **Title:** MISSING_SR raised only for non-pending/blocked/dead-lettered SR-affecting leave
- **Priority:** P0
- **Preconditions:** Seed: one truly missing entry; one legitimately PENDING; one DEAD_LETTERED.
- **Steps:** `POST /lsr/reconciliation/runs` (scope org_unit).
- **Expected:** One `MISSING_SR` finding (the truly missing); PENDING + DEAD_LETTERED rows counted in `pending_excluded_count`, **not** flagged MISSING.

#### TC-G04-033
- **Traces-to:** FR-06 / AC-3
- **Type:** Reconciliation
- **Title:** DUPLICATE_SR raised when >1 net-effective SR entry shares a lineage key
- **Priority:** P0
- **Preconditions:** Two SR rows for `L-DUP-SR` (injected drift).
- **Steps:** Run reconciliation.
- **Expected:** One `DUPLICATE_SR` finding (severity HIGH/CRITICAL) keyed on lineage.

#### TC-G04-034
- **Traces-to:** FR-06 / AC-4, edge (amended-not-divergent)
- **Type:** Reconciliation
- **Title:** DIVERGENT_FIELD computed after resolving correction chains; amended spell not falsely divergent
- **Priority:** P1
- **Preconditions:** Amended spell with a posted correction chain resolving to net-effective matching G03.
- **Steps:** Run reconciliation.
- **Expected:** No `DIVERGENT_FIELD` for the correctly-amended spell; a genuinely divergent field (unmatched days) → one `DIVERGENT_FIELD` (MEDIUM).

#### TC-G04-035
- **Traces-to:** FR-06 / AC-6, BR (R9)
- **Type:** Reconciliation
- **Title:** CORRECTION_WITHOUT_LINK raised when local sr_correction_link is missing
- **Priority:** P1
- **Preconditions:** G12 holds a correction entry; local `sr_correction_link` deleted/absent.
- **Steps:** Run reconciliation.
- **Expected:** One `CORRECTION_WITHOUT_LINK` finding recoverable from G12-stored lineage.

#### TC-G04-036
- **Traces-to:** FR-06 / AC-7, AC (scope); `ERR-G04-SCOPE-TOO-LARGE`
- **Type:** Data-Integrity
- **Title:** Reconciliation is read-only against G03/G12 and enforces scope bounds
- **Priority:** P1
- **Steps:** 1) Run recon and snapshot G12 before/after. 2) Trigger a run with an oversized scope.
- **Expected:** Zero SR mutations (byte-identical G12 snapshot); oversized scope → **422 `ERR-G04-SCOPE-TOO-LARGE`**.

### FR-07 — Reconciliation remediation

#### TC-G04-037
- **Traces-to:** FR-07 / AC-2
- **Type:** Data-Integrity
- **Title:** No remediation performs UPDATE/DELETE on the SR — corrections are appended
- **Priority:** P0
- **Preconditions:** A `DIVERGENT_FIELD` finding.
- **Steps:** `POST /lsr/findings/{id}/remediate {remediationAction: POST_CORRECTION}` → P01 approve.
- **Expected:** Applied as an appended correction entry; original SR row unchanged; any UPDATE/DELETE attempt on `service_register_events` → **409 `SR_ENTRY_IMMUTABLE`** / **403 `SR_DELETION_FORBIDDEN`**.

#### TC-G04-038
- **Traces-to:** FR-07 / AC-4, AC-5; state-table 10.3
- **Type:** State-Transition
- **Title:** Remediation maker-checker: approve → APPLIED, reject → OPEN, waive → WAIVED
- **Priority:** P1
- **Steps:** 1) Propose remediation (maker). 2a) Checker rejects. 2b) Re-propose; checker approves; re-check clean. 3) Waive a different finding without justification, then with.
- **Expected:** Reject → finding OPEN; approve+clean re-check → APPLIED; waive without justification → 422; with justification → WAIVED (retained, P05).

#### TC-G04-039
- **Traces-to:** FR-07 / AC-6, edge (concurrent)
- **Type:** Reconciliation
- **Title:** CORRECTION_WITHOUT_LINK remediation reconstructs the link without a new SR entry; concurrent edit conflicts
- **Priority:** P1
- **Steps:** 1) Remediate a `CORRECTION_WITHOUT_LINK` finding. 2) Concurrently remediate the same finding from a second session.
- **Expected:** `sr_correction_link` reconstructed from G12-stored lineage with **no** new SR entry; second concurrent remediation → **409 `CONFLICT`** (optimistic lock).

### FR-08 — Correction & reversal posting (append-only)

#### TC-G04-040
- **Traces-to:** FR-08 / AC-1, BR-08.1, RM-4; **key correction/reversal**
- **Type:** Correction/Reversal
- **Title:** Cancellation posts an is_reversal envelope with *_CANCELLED partner type (supersede-not-delete)
- **Priority:** P0
- **Preconditions:** Original `EL_AVAILED` for `L-CANC-1` is POSTED.
- **Test data:** `LEAVE_CANCELLED` seq 2.
- **Steps:** Relay posts `POST /api/v1/sr/ingest/reversal` with `isReversal=true`, `reversesSourceReferenceId=<original srcRef>`, `eventTypeCode=EL_AVAILED_CANCELLED`, `Idempotency-Key=dedupe_key`.
- **Expected:** **201** reversal entry; G12 auto-spawns corrigendum; original entry remains immutable and present; `sr_correction_link` inserted keyed by lineage.

#### TC-G04-041
- **Traces-to:** FR-08 / AC-2, edge (sequential amendments)
- **Type:** Correction/Reversal
- **Title:** Amendment reverses the superseded entry and posts corrected values as a fresh forward entry
- **Priority:** P0
- **Preconditions:** `L-AMD-1` original POSTED (10 days); amend to 12 days.
- **Steps:** Capture `LEAVE_AMENDED`; relay.
- **Expected:** Reversal of superseded entry (`reversesSourceReferenceId`) + a fresh forward `EL_AVAILED` (12 days) linked by lineage; net-effective = 12; further amendments chain, net-effective = latest.

#### TC-G04-042
- **Traces-to:** FR-08 / AC-1, invariant (SR append-only); error-taxonomy `SR_ENTRY_IMMUTABLE`/`SR_DELETION_FORBIDDEN`
- **Type:** Data-Integrity
- **Title:** SR original is never hard-edited or deleted by a correction path
- **Priority:** P0
- **Steps:** Attempt a direct UPDATE and DELETE on the original SR entry via any G04 path.
- **Expected:** UPDATE → **409 `SR_ENTRY_IMMUTABLE`**; DELETE → **403 `SR_DELETION_FORBIDDEN`**; only append/supersede permitted.

#### TC-G04-043
- **Traces-to:** FR-08 / AC-3, edge (orphan); `ERR-G04-ORPHAN-CORRECTION` / `SR_REVERSAL_TARGET_NOT_FOUND`
- **Type:** Negative
- **Title:** Correction with no locatable original raises orphan, not an unlinked correction
- **Priority:** P0
- **Preconditions:** Correction event whose original was never posted and cannot be located (post-POSTED of its own event).
- **Steps:** Attempt reversal post.
- **Expected:** **422 `ERR-G04-ORPHAN-CORRECTION`** at relay; G12 reversal referencing an unknown ref → **404 `SR_REVERSAL_TARGET_NOT_FOUND`**; no unlinked correction written.

#### TC-G04-044
- **Traces-to:** FR-08 / BR-08.4, FR-09 BR-09.3; state-table 10.6
- **Type:** State-Transition
- **Title:** Qualifying-service change after pension processing started is a hard P01 gate (blocking)
- **Priority:** P0
- **Preconditions:** Employee `E9` pension processing has started; a retrospective LWP correction changes qualifying effect.
- **Steps:** Drive the qualifying-affecting correction.
- **Expected:** Not auto-posted; routed to P01 → `GATE_PENDING`; CRITICAL X.2 alert to G11; on SR Custodian approval → `APPLIED` + certificate re-issue (FR-18); on reject → `BLOCKED` (change not applied), logged P05. (Routine, pre-pension correction auto-posts, flagged/post-audited.)

### FR-09 — Tiered qualifying-service & pension impact flags

#### TC-G04-045
- **Traces-to:** FR-09 / AC-1, AC-2, AC-5; **no double-count**
- **Type:** Data-Integrity
- **Title:** LWP/EOL post NON_QUALIFYING; qualifying service is not double-counted
- **Priority:** P0
- **Preconditions:** Mapping: LWP→`LWP_SPELL` NON_QUALIFYING, EOL→`EOL_SPELL` NON_QUALIFYING.
- **Test data:** LWP 121 days for `E5`.
- **Steps:** Post; `GET /lsr/employees/E5/qualifying-impact`.
- **Expected:** SR entry `qualifying_service_rule=NON_QUALIFYING` + `statutory_rule_ref`; non-qualifying days = 121 exactly once (re-posting/replay does not inflate the total).

#### TC-G04-046
- **Traces-to:** FR-09 / AC-6 (R16)
- **Type:** Boundary
- **Title:** Straddling spell sub-entries' day-sums equal the original spell
- **Priority:** P1
- **Steps:** Post a straddling LWP; sum sub-entry days.
- **Expected:** Per-effective-range sub-entries each cited; Σ sub-entry days = original spell days (no rounding drift).

#### TC-G04-047
- **Traces-to:** FR-09 / AC-5, AC-7
- **Type:** Reconciliation
- **Title:** G11 qualifying-impact total reconciles to the leave ledger; post-pension change blocked
- **Priority:** P1
- **Steps:** 1) `GET /lsr/employees/{id}/qualifying-impact`. 2) Compare to G03 ledger non-qualifying total. 3) Attempt a post-pension-start qualifying change.
- **Expected:** Totals reconcile (lineage-totalled); post-pension-start change blocked pending P01 (not merely alerted).

### FR-10 — Statutory annotations

#### TC-G04-048
- **Traces-to:** FR-10 / AC-1, AC-2
- **Type:** Functional
- **Title:** Configured annotation template renders a structured annotation (type/quantum/rule_ref)
- **Priority:** P2
- **Preconditions:** Mapping with `annotation_template` for increment deferral.
- **Steps:** Post an EOL spell; `GET /lsr/employees/{id}/annotations`.
- **Expected:** Annotation `{type: INCREMENT_DEFERRAL, days: <quantum>, rule_ref: "CCS(Leave) r.X"}` present on the SR entry; queryable by G06.

#### TC-G04-049
- **Traces-to:** FR-10 / AC-3, AC-5, edge
- **Type:** Functional
- **Title:** No spurious annotation when unconfigured; amendment re-emits corrected annotation
- **Priority:** P2
- **Steps:** 1) Post leave whose mapping has no annotation template. 2) Amend a leave whose mapping does.
- **Expected:** No annotation for (1); amendment (2) re-emits a corrected annotation via a correction entry, lineage-linked.

### FR-11 — Historical leave digitisation (on P06)

#### TC-G04-050
- **Traces-to:** FR-11 / AC-1..4; state-table 10.4; **batch E2E**
- **Type:** E2E-Flow
- **Title:** Historical batch STAGED→VALIDATED→APPROVED→POSTED with MIGRATION provenance
- **Priority:** P1
- **Steps:** 1) `POST /lsr/historical/batches` (with `documents` provenance, `migration_runs` link). 2) `/validate`. 3) `/approve` (SR Custodian P01). 4) `/post`.
- **Expected:** State transitions per §10.4; posted entries append-only, carry `MIGRATION` provenance, lineage, `gov_source_id`; post-load reconciliation (FR-06) runs and reports parity.

#### TC-G04-051
- **Traces-to:** FR-11 / AC-4, BR-11.1 (R14); FR-12 dedupe
- **Type:** Idempotency
- **Title:** Deterministic migration lineage prevents duplicates on re-run and on later genuine G03 emission
- **Priority:** P0
- **Steps:** 1) Post batch. 2) Re-run the same batch. 3) Later emit a genuine G03 event for the same spell.
- **Expected:** `leave_spell_lineage_id` derived from `(employee_id, leave_type, spell_start, spell_end, batch lineage)`; re-run and later live event both dedupe → no duplicate SR entry.

#### TC-G04-052
- **Traces-to:** FR-11 / AC-6, BR-11.4 (R15); state-table 10.4
- **Type:** Data-Integrity
- **Title:** Low-confidence records post PROVISIONAL and are excluded from pension until adjudicated
- **Priority:** P0
- **Preconditions:** Batch with `confidence < HIGH` records.
- **Steps:** 1) Post batch. 2) `GET /lsr/employees/{id}/qualifying-impact`. 3) `POST /lsr/historical/records/{id}/adjudicate {decision: ADJUDICATED_CONFIRMED, statutoryRuleRef}`.
- **Expected:** Provisional entries excluded from pension totals (FR-09/FR-18) until `ADJUDICATED_CONFIRMED`; adjudication P05-captured; adjudicate without a statutory ref where required → 422.

#### TC-G04-053
- **Traces-to:** FR-11 / AC-2, edge; `ERR-G04-BATCH-VALIDATION-FAILED`, `ERR-G04-PORT-NOT-CONFORMANT`, `ERR-G04-PROVISIONAL-ENTRY`
- **Type:** Negative
- **Title:** Batch validation/post negative paths
- **Priority:** P1
- **Steps:** 1) Validate/post a batch with rejected records. 2) Post an approved batch while port-conformance gate is CLOSED. 3) Adjudicate an already-adjudicated record.
- **Expected:** (1) **422 `ERR-G04-BATCH-VALIDATION-FAILED`** (rejected records block post; rejects retained, never posted). (2) **412 `ERR-G04-PORT-NOT-CONFORMANT`**. (3) **409 `ERR-G04-PROVISIONAL-ENTRY`**.

### FR-12 — Replay & backfill (deterministic identity)

#### TC-G04-054
- **Traces-to:** FR-12 / AC-2, AC-5, AC-6, BR-12.1 (R14)
- **Type:** Idempotency
- **Title:** Backfill derives deterministic lineage; backfill + later genuine G03 event do not double-post
- **Priority:** P0
- **Steps:** 1) `POST /lsr/backfill` for a spell with no outbox row. 2) Later emit the genuine G03 event for the same spell.
- **Expected:** Backfilled event's `leave_spell_lineage_id`/`dedupe_key` = what G03 would issue; the later live event dedupes → exactly one SR entry.

#### TC-G04-055
- **Traces-to:** FR-12 / AC-3, AC-4; auth `g04.replay.trigger`
- **Type:** Functional
- **Title:** Dry-run preview count before execution; bulk SR-writing replay/backfill requires SR Custodian P01
- **Priority:** P1
- **Steps:** 1) `POST /lsr/replay {dry_run:true}`. 2) `POST /lsr/replay {dry_run:false}` (IntegOps). 3) SR Custodian approves.
- **Expected:** Dry-run returns affected count with no writes; execution requires SR Custodian P01 approval; operation id links every replayed item for audit.

#### TC-G04-056
- **Traces-to:** FR-12 / AC-1, edge; `ERR-G04-SCOPE-TOO-LARGE`
- **Type:** Negative
- **Title:** Replay/backfill scope bound enforced
- **Priority:** P1
- **Steps:** `POST /lsr/replay` / `POST /lsr/backfill` with a scope exceeding the configured bound.
- **Expected:** **422 `ERR-G04-SCOPE-TOO-LARGE`**; no events enqueued.

### FR-13 — Monitoring dashboard & operating model

#### TC-G04-057
- **Traces-to:** FR-13 / AC-1, AC-2, AC-3, AC-5
- **Type:** Functional
- **Title:** Dashboard shows live KPIs; SLA breach raises an X.2 alert routed per operating model
- **Priority:** P2
- **Steps:** 1) `GET /lsr/dashboard/summary` + `/metrics?metric=posting_lag`. 2) Force a DLQ-depth SLA breach.
- **Expected:** Live counts for outbox statuses (incl. EXCLUDED/BLOCKED), DLQ, reaped-in-flight, findings, relay/breaker state; P95 lag charted; breach → X.2 alert with owner/on-call/SLA-tier; metrics exported to G14.

#### TC-G04-058
- **Traces-to:** FR-13 / AC-4, BR-14.1; auth (Auditor read-only)
- **Type:** API-Contract
- **Title:** Dashboard panels are P02 RBAC-scoped; Auditor read-only; field masks on serialization
- **Priority:** P1
- **Steps:** 1) Access dashboard as Auditor. 2) Attempt an ack action as Auditor. 3) Access as `hr_admin` (org_unit-scoped).
- **Expected:** Auditor can read all panels; ack (write) → **403 `FORBIDDEN`**; `hr_admin` sees only in-scope org_unit rows; PII masked per tier.

### FR-14 — Integration audit & evidence pack

#### TC-G04-059
- **Traces-to:** FR-14 / AC-1, AC-2, AC-3, AC-6; **audit E2E**
- **Type:** E2E-Flow
- **Title:** Full leave→SR chain (by lineage) reconstructable and exportable with citations
- **Priority:** P1
- **Steps:** 1) `GET /lsr/audit/chain?employeeId=E1&leaveSpellLineageId=L-E2E-1`. 2) `POST /lsr/audit/export`.
- **Expected:** Chain joins source event → outbox → posting log → SR entry + correction chain → mapping `statutory_rule_ref` → recon/integrity findings + DLQ history + latest pre-pension certificate; export accepted (202).

#### TC-G04-060
- **Traces-to:** FR-14 / AC-4, AC-5, BR-14.2, BR-14.3
- **Type:** Data-Integrity
- **Title:** Evidence-pack export is checksummed, tamper-evident, PII-masked, and P05-captured
- **Priority:** P1
- **Steps:** 1) Export as Auditor. 2) Verify checksum; tamper a byte and re-verify. 3) Check `Audit.export` capture.
- **Expected:** Pack carries generation timestamp/scope/checksum; tamper → checksum mismatch; export itself P05-captured (who/when/scope); leave-reason PII excluded unless statutorily required.

### FR-15 — Stuck-in-flight lease reaper

#### TC-G04-061
- **Traces-to:** FR-15 / AC-1, AC-4, AC-5; state-table 10.1
- **Type:** Reliability
- **Title:** Expired-lease IN_FLIGHT row returned to retry-eligible within one reaper interval + alert
- **Priority:** P0
- **Preconditions:** Row `IN_FLIGHT` with `lease_expires_at` in the past.
- **Steps:** Run `JOB-G04-REAPER`.
- **Expected:** Row → `FAILED` (retry-eligible); `attempt_count++`; stale `relay_partition_lease` released; `sr_posting_log` appended; metric + X.2 alert `reaped_in_flight_count`.

#### TC-G04-062
- **Traces-to:** FR-15 / AC-3, edge (reaped after genuine success)
- **Type:** Idempotency
- **Title:** Re-post of an event that already succeeded at G12 returns DUPLICATE_NOOP (no duplicate)
- **Priority:** P0
- **Steps:** 1) G12 succeeds; relay crashes pre-POSTED. 2) Reaper re-enqueues; re-post.
- **Expected:** Re-post → `DUPLICATE_NOOP`; then `POSTED`; exactly one SR entry.

#### TC-G04-063
- **Traces-to:** FR-15 / AC-2, BR-15.3, edge (lease renewal)
- **Type:** Boundary
- **Title:** Repeated reaping bounded by max_retries → DLQ; a live-but-slow relay is not reaped
- **Priority:** P1
- **Steps:** 1) Force repeated lease expiry past `max_retries`. 2) Separately, keep the relay alive but slow, renewing the lease.
- **Expected:** (1) After `max_retries` → `DEAD_LETTERED` (class `UPSTREAM_DOWN`/`UNKNOWN`). (2) Lease renewal extends `lease_expires_at`; reaper does **not** act on the still-active lease.

### FR-16 — G12 SR write-port bilateral contract & conformance

#### TC-G04-064
- **Traces-to:** FR-16 / AC-1, AC-3, AC-4
- **Type:** API-Contract
- **Title:** Conformance run records retention/index/append-only/dedupe-replay = PASS
- **Priority:** P0
- **Steps:** `POST /lsr/port/conformance/runs {contractVersion}`; `GET /lsr/port/conformance/runs/{id}`.
- **Expected:** `port_conformance_run` records `dedupe_retention_days≥2557`, index verification, append-only verification, dedupe-replay (same key after simulated horizon returns original `srEventId`, no 2nd row) → overall **PASS** + evidence checksum.

#### TC-G04-065
- **Traces-to:** FR-16 / AC-2, edge (retention too short)
- **Type:** Boundary
- **Title:** Retention < 2557 days yields FAIL
- **Priority:** P0
- **Preconditions:** Non-conformant G12 with `dedupe_retention_days=365`.
- **Steps:** Trigger a conformance run.
- **Expected:** Result **FAIL**; CRITICAL X.2 alert; live-posting gate stays CLOSED.

#### TC-G04-066
- **Traces-to:** FR-16 / AC-4, AC-5, `VAL-G04-CONFORM`; state-table 10.7; `ERR-G04-PORT-NOT-CONFORMANT`
- **Type:** State-Transition
- **Title:** Append-only probe rejects UPDATE/DELETE; live posting gated on latest PASS
- **Priority:** P0
- **Steps:** 1) Append-only probe attempts UPDATE/DELETE on an SR entry. 2) With no PASS run for the active contract version, attempt a live post.
- **Expected:** Probe UPDATE/DELETE rejected (P05 substrate); with no PASS run → post blocked **412 `ERR-G04-PORT-NOT-CONFORMANT`**; a contract-version bump without a re-run flips the gate CLOSED.

### FR-17 — Source-ledger ↔ outbox integrity reconciliation

#### TC-G04-067
- **Traces-to:** FR-17 / AC-2, BR-17.3
- **Type:** Reconciliation
- **Title:** LEDGER_WITHOUT_OUTBOX detected and remediable by deterministic backfill
- **Priority:** P0
- **Preconditions:** A G03 SR-affecting ledger entry with no outbox row (capture loss / polling fallback).
- **Steps:** Run `JOB-G04-INTEGRITY`; then backfill (FR-12) the finding.
- **Expected:** `LEDGER_WITHOUT_OUTBOX` finding raised; one-click backfill derives deterministic lineage → dedupes with any later genuine emission; re-run shows the gap closed.

#### TC-G04-068
- **Traces-to:** FR-17 / AC-3
- **Type:** Reconciliation
- **Title:** OUTBOX_WITHOUT_LEDGER detected
- **Priority:** P1
- **Preconditions:** An outbox row with no matching G03 ledger entry (spurious/forged).
- **Steps:** Run integrity reconciliation.
- **Expected:** `OUTBOX_WITHOUT_LEDGER` finding raised for investigation.

#### TC-G04-069
- **Traces-to:** FR-17 / AC-4, BR-17.2, edge (forged writer)
- **Type:** Data-Integrity
- **Title:** SIGNATURE_MISMATCH is CRITICAL, logged to security_audit_log, and blocks posting
- **Priority:** P0
- **Preconditions:** An outbox row whose `payload_signature` fails HMAC verification.
- **Steps:** Run integrity reconciliation; attempt to post the affected event.
- **Expected:** `SIGNATURE_MISMATCH` finding (CRITICAL); `security_audit_log` (P05) entry; affected event blocked and routed DLQ `SIGNATURE_INVALID` (not posted).

### FR-18 — Pre-pension completeness certificate

#### TC-G04-070
- **Traces-to:** FR-18 / AC-1, AC-2, AC-4
- **Type:** Functional
- **Title:** PASS certificate requires zero HIGH/CRITICAL findings, complete lineage, zero provisional
- **Priority:** P0
- **Preconditions:** Clean `PRE_PENSION` recon for `E1` (0 open HIGH/CRITICAL, lineage complete, 0 provisional).
- **Steps:** `POST /lsr/prepension/certificates {employeeId, runId}`.
- **Expected:** **201** certificate `PASS`; records `total_non_qualifying_days` reconciled to the ledger; generated from a completed PRE_PENSION run only.

#### TC-G04-071
- **Traces-to:** FR-18 / AC-2, AC-3; `ERR-G04-CERTIFICATE-FAILED`; auth `g04.prepension.sign`
- **Type:** Negative
- **Title:** FAIL certificate lists blockers; a FAIL certificate cannot be signed
- **Priority:** P0
- **Preconditions:** Employee with one open HIGH finding.
- **Steps:** 1) `POST /lsr/prepension/certificates`. 2) `POST /lsr/prepension/certificates/{id}/sign`.
- **Expected:** Generate → **422 `ERR-G04-CERTIFICATE-FAILED`** (blocking list returned); sign of a FAIL → **412 `ERR-G04-CERTIFICATE-FAILED`**; only `sr_custodian` with `g04.prepension.sign` may sign a PASS.

#### TC-G04-072
- **Traces-to:** FR-18 / BR-18.1, BR-18.2, edge
- **Type:** Data-Integrity
- **Title:** A remaining provisional entry blocks PASS; a new HIGH finding after sign invalidates the certificate
- **Priority:** P1
- **Steps:** 1) Attempt PASS with an unadjudicated provisional entry present. 2) Sign a PASS; then raise a new HIGH finding before pension completes.
- **Expected:** (1) Certificate FAIL until adjudicated. (2) Certificate invalidated/superseded → new run required; append-only history retained and P05-captured.

### FR-18 / cross-cutting — G11 consumption & auth

#### TC-G04-073
- **Traces-to:** FR-18 / AC-3, AC-5; auth `g04.prepension.sign` (SoD)
- **Type:** State-Transition
- **Title:** Certificate sign flow (system/HR maker → SR Custodian sign) and G11 consumption timestamp
- **Priority:** P1
- **Steps:** 1) Generate PASS (system/HR maker). 2) `sr_custodian` (with flag) signs via P01. 3) G11 (`pension_officer`) retrieves latest.
- **Expected:** Maker cannot self-sign (SoD); Custodian sign → checksummed, append-only; `GET /lsr/prepension/certificates?employeeId` returns latest; `consumed_by_g11_at` timestamp recorded.

### Cross-cutting — platform API conventions

#### TC-G04-074
- **Traces-to:** Foundation §1 (Idempotency); RG-9
- **Type:** API-Contract
- **Title:** Idempotency-Key 24h replay on an unsafe POST returns CONFLICT
- **Priority:** P1
- **Steps:** `POST /lsr/mappings` (or `/reconciliation/runs`) twice with the same `Idempotency-Key` within 24h.
- **Expected:** First → success; replay → **409 `CONFLICT`** (`ERR-DUP-INSTANCE`); no duplicate resource/workflow.

#### TC-G04-075
- **Traces-to:** Foundation §1 (envelope, correlation, pagination); RG-8/RG-9
- **Type:** API-Contract
- **Title:** Canonical error envelope, X-Correlation-Id header, and cursor-pagination bound
- **Priority:** P1
- **Steps:** 1) Trigger any 4xx. 2) Inspect response envelope + headers. 3) `GET /lsr/postings?limit=250`.
- **Expected:** Body `{ error: { code, message, field, details } }` only; `X-Correlation-Id` echoed in the response header (never a body `requestId`); `limit=250` rejected **422** (max 100); success pages carry `next_cursor`.

#### TC-G04-076
- **Traces-to:** auth-matrix G04; Platform §0.1 (multi-tenant isolation)
- **Type:** Negative
- **Title:** Cross-tenant access and unauthenticated access are denied; employee has no direct G04 surface
- **Priority:** P0
- **Steps:** 1) T1 IntegOps `GET /lsr/outbox?leaveSpellLineageId=<T2 lineage>`. 2) Any G04 call with no/expired bearer token. 3) `employee` calls `GET /lsr/dashboard/summary`.
- **Expected:** (1) T2 rows invisible → **404 `NOT_FOUND`** (never leaks existence). (2) **401 `UNAUTHENTICATED`**. (3) **403 `FORBIDDEN`** (Employee has no direct G04 access).

---

## 3. Traceability matrix (FR → TC)

| FR | Title | Test cases | Gaps |
|---|---|---|---|
| FR-01 | Signed transactional-outbox capture | TC-G04-001, 002, 003, 004, 005, 006, 007 | none |
| FR-02 | Governed event-mapping catalog | TC-G04-008, 009, 010, 011, 012 | none |
| FR-03 | Partitioned idempotent relay (exactly-once effect) | TC-G04-013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023 | none |
| FR-04 | Retry, backoff & dead-letter | TC-G04-024, 025, 026, 027 | none |
| FR-05 | DLQ triage & maker-checker | TC-G04-028, 029, 030, 031 | none |
| FR-06 | State-aware reconciliation | TC-G04-032, 033, 034, 035, 036 | none |
| FR-07 | Reconciliation remediation | TC-G04-037, 038, 039 | none |
| FR-08 | Correction & reversal (append-only) | TC-G04-040, 041, 042, 043, 044 | none |
| FR-09 | Tiered qualifying-service / pension flags | TC-G04-045, 046, 047 | none |
| FR-10 | Statutory annotations | TC-G04-048, 049 | none |
| FR-11 | Historical digitisation (P06) | TC-G04-050, 051, 052, 053 | none |
| FR-12 | Replay & backfill (deterministic identity) | TC-G04-054, 055, 056 | none |
| FR-13 | Monitoring dashboard & operating model | TC-G04-057, 058 | none |
| FR-14 | Integration audit & evidence pack | TC-G04-059, 060 | none |
| FR-15 | Stuck-in-flight lease reaper | TC-G04-061, 062, 063 | none |
| FR-16 | G12 write-port contract & conformance | TC-G04-064, 065, 066 | none |
| FR-17 | Source-ledger ↔ outbox integrity | TC-G04-067, 068, 069 | none |
| FR-18 | Pre-pension completeness certificate | TC-G04-070, 071, 072, 073 | none |
| Cross-cutting | Platform API conventions / tenancy / auth | TC-G04-074, 075, 076 | n/a |

**FR coverage: 18 of 18 (0 gaps).**

### 3.1 Integration-guarantee coverage (cross-index)

| Guarantee | Test cases |
|---|---|
| Exactly-once effect (retry/replay → no duplicate SR entry; dedupe tuple + fact_key) | TC-G04-013, 014, 015, 017, 018, 020, 029, 051, 054, 062 |
| Transactional-outbox relay (atomic capture in G03 tx) | TC-G04-001, 002, 003 |
| Ordering (BLOCKED_AWAITING_ORIGINAL) | TC-G04-007, 018 |
| Dead-letter + replay | TC-G04-025, 026, 028, 029, 030, 031 |
| Reconciliation (missing/duplicate/divergent/drift) | TC-G04-032, 033, 034, 035, 067, 068 |
| Correction/reversal into append-only SR (is_reversal envelope, no delete) | TC-G04-040, 041, 042, 043, 044 |
| Qualifying-service flags for LWP/EOL (no double-count) | TC-G04-045, 046, 047 |
| Historical digitisation batches | TC-G04-050, 051, 052, 053 |
| E2E: G03 approved leave → outbox → /sr/ingest → G12 ledger | TC-G04-013, 059 |
| Negative: missing fact_key / disallowed source_module / event type not in catalog / partial failure | TC-G04-020, 021, 022, 025, 053 |
| Data-integrity: idempotency, no double-count of qualifying service | TC-G04-004, 019, 042, 045, 051, 054, 062 |

---

## 4. Coverage summary

### 4.1 By test type

| Type | Count | Test cases |
|---|---|---|
| Functional | 9 | 001, 008, 027, 028, 048, 049, 055, 057, 070 |
| Boundary | 4 | 012, 046, 063, 065 |
| Negative | 14 | 005, 006, 010, 011, 020, 021, 022, 025, 030, 043, 053, 056, 071, 076 |
| Reliability | 5 | 016, 017, 023, 024, 061 |
| Idempotency | 7 | 004, 014, 015, 029, 051, 054, 062 |
| Reconciliation | 8 | 032, 033, 034, 035, 039, 047, 067, 068 |
| State-Transition | 9 | 007, 009, 018, 026, 031, 038, 044, 066, 073 |
| Data-Integrity | 11 | 002, 003, 019, 036, 037, 042, 045, 052, 060, 069, 072 |
| API-Contract | 4 | 058, 064, 074, 075 |
| Correction/Reversal | 2 | 040, 041 |
| E2E-Flow | 3 | 013, 050, 059 |

> Each case is counted once under its primary type above; some carry a secondary dimension (e.g. a negative case with an auth aspect). Primary-type totals sum to 76.

### 4.2 By priority

| Priority | Count | Meaning |
|---|---|---|
| P0 | 42 | Statutory-critical: exactly-once effect, atomic capture, append-only SR, ordering, qualifying-service integrity, conformance gate, signature integrity, cross-tenant isolation. |
| P1 | 30 | Core reliability/reconciliation/remediation, correction chains, historical digitisation, evidence pack, API conventions. |
| P2 | 4 | Observability, annotations, DLQ listing ergonomics. |

**Total: 76 test cases · FR coverage 18/18 (0 gaps).**
