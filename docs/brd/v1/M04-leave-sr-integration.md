# Leave Management Integration with Digital Service Register — HRMS Module BRD

**Module code:** M04-LSR
**Program:** Enterprise HRMS — PeopleGov / HRMS Suite (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v1.0
**Status:** Draft for review
**Author persona:** Global HR/HCM domain expert (Workday / SAP SuccessFactors / Oracle HCM bar) honouring the public-sector statutory context
**Upstream contract:** `SHARED_FOUNDATION.md` (canonical entities, conventions, roles, technical defaults)

> **Reading note.** This BRD is the **integration / contract layer** between **M03 Attendance & Leave Management** (the *source* of approved leave events and the leave ledger) and **M12 Digital Employee Service Register** (the *target* append-only statutory ledger). It does **not** redefine the canonical shared entities (`employees`, `service_register_events`, `audit_log`, `notifications`, `documents`, `workflow_instances`/`workflow_tasks`); it references them and adds only the **integration-specific** entities required for reliable, auditable, exactly-once posting, reconciliation, correction/reversal, and statutory annotation.

---

## Section 1 — Executive Summary

### 1.1 Purpose

The Digital Service Register (Digital SR, owned by **M12**) is the **statutory system of record** for an employee's entire service lifecycle. In a government HR context, the Service Register is a legal document: pension, seniority, increments, qualifying-service computation, and audit by the Accountant General all depend on it being **complete, accurate, append-only, and tamper-evident**. Leave — especially **long leave, Leave Without Pay (LWP / EOL), study leave, and suspension-as-leave** — directly affects **qualifying service for pension**, **increment dates**, and **seniority**. Therefore every leave spell that is *approved* in M03 must become a **permanent, immutable SR entry** in M12, and every *cancellation or amendment* of that leave must produce a **correcting SR entry** (the SR is never hard-edited).

**M04-LSR is the integration that guarantees this.** It is not a leave system and not the SR itself; it is the **reliable, idempotent, reconciled, monitorable bridge** that maps leave domain events to statutory SR entries with **exactly-once semantics**, full **replay**, automated **drift detection**, and explicit **failure handling** (retry / dead-letter / manual intervention).

### 1.2 Business problem

Without a formal integration contract, leave-to-SR posting is typically done by manual data entry or fragile point-to-point calls, producing the classic failure modes that auditors penalise: **missing SR entries** (approved leave never recorded), **duplicate entries** (double-posting on retries), **drift** (leave ledger and SR disagree on LWP days), **orphaned corrections** (a leave was cancelled but the SR still shows it as availed), and **silent loss** (a posting failed and nobody noticed). Each of these corrupts qualifying-service and pension computation years later, when the error is expensive to fix and the original approver has retired.

### 1.3 Solution overview

M04-LSR delivers:

1. **Canonical event mapping** — a governed, versioned table that maps each leave type / spell outcome to exactly one SR entry type (e.g., `EARNED_LEAVE_AVAILED`, `LWP_SPELL`, `STUDY_LEAVE`, `LEAVE_CANCELLED_CORRECTION`).
2. **Transactional outbox** — leave-approval events are captured in the same database transaction as the leave-ledger write in M03's domain, guaranteeing no lost events.
3. **Idempotent, exactly-once posting** — a relay worker drains the outbox and posts to M12 with a stable idempotency key, so retries never double-post.
4. **Retry with backoff + dead-letter queue (DLQ)** — transient failures retry; poison messages quarantine for human resolution.
5. **Reconciliation engine** — scheduled and on-demand comparison of the M03 leave ledger against M12 SR entries to detect missing, duplicate, and divergent records, producing reconciliation findings and auto/assisted remediation.
6. **Correction & reversal handling** — cancelled/amended leave posts an append-only correcting/reversing SR entry that references the original, preserving the immutable chain.
7. **Qualifying-service impact flags** — LWP / long-leave spells are flagged as **non-qualifying** (or partially qualifying per rule) and surfaced to **M11 Pension** through the SR.
8. **Historical digitisation** — bulk migration of legacy paper/electronic leave history into the SR with provenance and reconciliation.
9. **Statutory annotations** — machine-readable notes on leave affecting increment, seniority, and probation.
10. **Integration monitoring dashboard** — real-time health, lag, DLQ depth, reconciliation status, and SLA alerts.

### 1.4 Key outcomes & success metrics

| Outcome | Metric | Target |
|---|---|---|
| No lost leave events | Outbox events posted to SR / outbox events created | 100% (eventually) |
| No double-posting | Duplicate SR entries detected per 10,000 postings | 0 |
| Timely posting | P95 lag from leave approval to SR-entry confirmation | ≤ 5 minutes |
| Drift control | Open reconciliation findings older than 7 days | 0 |
| Correction integrity | Cancelled/amended leaves with matching correction entry | 100% |
| Pension correctness | Qualifying-service discrepancies surfaced before pension processing | 100% pre-flagged |
| Operability | DLQ items resolved within SLA | ≥ 99% within 2 business days |

### 1.5 Scope at a glance

**In scope:** event capture from M03, mapping, posting to M12, idempotency, retry/DLQ, reconciliation, correction/reversal, qualifying-service flags, historical digitisation, statutory annotations, monitoring dashboard, replay tooling.
**Out of scope (owned elsewhere):** leave policy/accrual/application/approval (M03); the SR ledger schema and its UI (M12); pension computation (M11); seniority list maintenance (M06); document storage (M13). M04 *references* and *coordinates* these; it does not own them.

---

## Section 2 — Scope & Boundaries

### 2.1 In-scope capabilities

- Capture of **approved**, **cancelled**, and **amended** leave domain events from M03 via a transactional outbox.
- A **governed event-mapping catalog** (leave type + spell semantics → SR entry type + qualifying-service rule), versioned and effective-dated.
- An **idempotent posting relay** to M12's SR write API/port with exactly-once semantics.
- **Retry, backoff, circuit-breaking, and dead-letter** handling for posting failures.
- **Reconciliation** (scheduled + on-demand) between the M03 leave ledger and M12 SR, with finding classification (MISSING / DUPLICATE / DIVERGENT / ORPHAN_CORRECTION) and remediation actions.
- **Correction & reversal** posting for cancelled/amended leave (append-only, references original entry).
- **Qualifying-service / pension impact flags** (LWP, EOL, study leave, suspension) emitted on SR entries and consumable by M11.
- **Historical leave digitisation** pipeline into the SR with provenance, batch validation, and post-load reconciliation.
- **Statutory annotations** (increment deferral, seniority effect, probation extension) attached to SR entries.
- **Integration monitoring dashboard**, alerting, and **replay** tooling.

### 2.2 Out-of-scope (explicit boundaries)

| Concern | Owner | M04 relationship |
|---|---|---|
| Leave types, accrual, balances, application, multi-level approval | M03-ATL | Consumes approved/cancelled/amended events |
| SR ledger storage, SR entry schema, SR custodian UI, SR immutability enforcement | M12-SR | Posts entries via M12 write port; never edits SR rows directly |
| Pension & qualifying-service computation | M11-PEN | Provides qualifying-service flags via SR; does not compute pension |
| Seniority list generation | M06-PPP | Provides seniority-impact annotation; does not maintain lists |
| Document/object storage | M13-DMS | References `documents` for legacy scan provenance |
| Authentication / RBAC platform | Shared | Inherits OIDC/SSO + RBAC |

### 2.3 Feature Module Map

| Feature area | FRs | Primary collaborating modules |
|---|---|---|
| Event capture (transactional outbox) | FR-01 | M03 (source) |
| Event mapping catalog | FR-02 | M03, M12 |
| Idempotent posting relay (exactly-once) | FR-03 | M12 (target) |
| Retry, backoff & dead-letter | FR-04 | — |
| DLQ triage & manual resolution | FR-05 | M12 |
| Reconciliation engine | FR-06 | M03, M12 |
| Reconciliation remediation | FR-07 | M03, M12 |
| Correction & reversal posting | FR-08 | M03, M12 |
| Qualifying-service / pension impact flags | FR-09 | M11, M12 |
| Statutory annotations (increment/seniority/probation) | FR-10 | M06, M12 |
| Historical leave digitisation | FR-11 | M03, M12, M13 |
| Replay & backfill tooling | FR-12 | M12 |
| Integration monitoring dashboard | FR-13 | M14 |
| Integration audit & evidence pack | FR-14 | Auditor, M12 |

### 2.4 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit-everything:** every posting, retry, DLQ move, reconciliation finding, correction, and replay writes to `audit_log` (immutable) with actor, before/after, and `requestId`.
- **Maker-checker:** any *manual* SR posting, correction, DLQ resolution that writes to the statutory register, or historical batch promotion routes through `workflow_instances`/`workflow_tasks` with maker ≠ checker.
- **RBAC + row-level scoping** by `org_unit_id`; Auditor is read-only across all M04 surfaces.
- **Pagination:** all list endpoints page/limit with hard max 100.
- **Time/locale:** store UTC; display `DD-MMM-YYYY`; INR money formatting where relevant.
- **Soft-delete** on mutable config entities; **append-only** on all ledgers (outbox is consume-marked, never deleted; posting log, reconciliation log, DLQ history are append-only).

### 2.5 Assumptions & dependencies

- M03 emits domain events for `LEAVE_APPROVED`, `LEAVE_CANCELLED`, `LEAVE_AMENDED` within the same DB transaction as its ledger commit (transactional outbox pattern available in M03's bounded context, or a shared outbox table M04 reads).
- M12 exposes an **idempotent SR write port** accepting an idempotency key and returning the created `sr_event_id`, and enforces SR append-only immutability on its side.
- M11 reads qualifying-service flags from SR entries (pull) or subscribes to SR change events (push).
- A reliable scheduler (cron/quartz) exists for reconciliation and relay sweeps.
- Clock sync (NTP) across services for lag measurement and effective-dating.

---

## Section 3 — Roles & Permissions

### 3.1 Roles relevant to M04 (extends Shared Foundation §4; no contradictions)

- **Integration Operator (IntegOps)** — M04-specific operational role: monitors the dashboard, triages DLQ, triggers replay/backfill, runs on-demand reconciliation. *Cannot* author SR entries that bypass maker-checker.
- **SR Custodian / Registrar** — M12 statutory custodian; the **checker** for any manual/correcting SR posting initiated via M04 and the approver of historical digitisation batches.
- **HR Officer / HR Admin** — initiates manual reconciliation remediation requests and historical batch preparation (maker).
- **Pension Officer** — consumes qualifying-service flags; read access to impact reports.
- **Auditor (read-only)** — full read on all M04 ledgers, findings, and the audit trail; no writes.
- **System Administrator** — manages event-mapping catalog versions, retry/SLA configuration, scheduler settings; **no** transactional self-approval; cannot resolve own DLQ items into SR.
- **Employee (Self-Service)** — *indirect only*: sees the SR-reflected status of their own leave through M12's employee view; no direct M04 access.

### 3.2 Permission matrix

| Capability / Action | Employee | HR Officer | IntegOps | SR Custodian | Pension Officer | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|
| View integration dashboard | — | R | R/W (ack) | R | R | R | R |
| View posting log | — | R (scoped) | R | R | R (scoped) | R | R |
| Trigger on-demand reconciliation | — | — | ✔ | ✔ | — | — | — |
| View reconciliation findings | — | R | R | R | R | R | R |
| Initiate remediation (maker) | — | ✔ | ✔ | — | — | — | — |
| Approve remediation / SR write (checker) | — | — | — | ✔ | — | — | — |
| Triage / annotate DLQ item | — | — | ✔ | R | — | R | — |
| Resolve DLQ → SR (maker→checker) | — | maker | maker | checker | — | — | — |
| Trigger replay / backfill | — | — | ✔ | approve | — | — | — |
| Manage event-mapping catalog (draft) | — | — | — | — | — | — | ✔ |
| Approve/publish mapping version | — | — | — | ✔ | — | — | — |
| Configure retry/SLA/scheduler | — | — | propose | — | — | — | ✔ |
| Prepare historical batch (maker) | — | ✔ | ✔ | — | — | — | — |
| Approve/promote historical batch (checker) | — | — | — | ✔ | — | — | — |
| Export audit evidence pack | — | R | R | R | R | ✔ | R |

Legend: ✔ = perform; R = read; R/W (ack) = read + acknowledge alerts; — = no access. All ✔ that write to the statutory SR enforce **maker ≠ checker** and write to `audit_log`.

---

## Section 4 — Shared Application Foundation

This module **inherits** the Shared Foundation §5 technical defaults verbatim and adds integration-specific posture.

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) for the monitoring/triage console; REST API under `/api/v1` for management surfaces; the **posting relay** is a backend worker (Node/TypeScript or Java Spring) driven by a scheduler; PostgreSQL primary datastore (outbox, posting log, reconciliation log, DLQ, mappings); message infrastructure is **DB-backed transactional outbox** (preferred for exactly-once with the relational store) with an optional broker (Kafka/RabbitMQ) bridge if the program standardises one.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level scoping by `org_unit_id`. The M12 write port is called with a service principal that has **append-only SR-write** scope and is audited.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Inherited error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503). M04-specific codes are cataloged in Section 9.
- **Idempotency:** all SR write calls carry a deterministic `Idempotency-Key`; M12 must dedupe on it.
- **Observability:** structured logs with `requestId` + `correlation_id` (the leave event id) threaded end-to-end; metrics (lag, throughput, DLQ depth, error rate) exposed to M14.
- **Security/compliance:** OWASP ASVS; TLS 1.2+ in transit; encryption at rest; DPDP Act 2023 alignment (leave reason categories may be sensitive — PII minimisation: M04 carries only the SR-relevant fields, never medical detail); full audit trail; statutory retention.
- **NFR baseline:** P95 management API < 500ms; relay P95 posting lag ≤ 5 min; 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4h; WCAG 2.1 AA for console.

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| E1 | `employees` | Canonical (referenced) | M01 | Employee master; subject of SR entries |
| E2 | `service_register_events` | Canonical (referenced, written via M12 port) | M12 | Append-only statutory SR ledger (target) |
| E3 | `audit_log` | Canonical (referenced) | Shared | Immutable audit trail |
| E4 | `notifications` | Canonical (referenced) | Shared | Outbound notifications |
| E5 | `documents` | Canonical (referenced) | M13 | Legacy scan provenance for digitisation |
| E6 | `workflow_instances` / `workflow_tasks` | Canonical (referenced) | Shared | Maker-checker for manual SR writes/batches |
| E7 | `leave_ledger_entries` | Source (referenced, read-only from M04) | M03 | Approved/cancelled/amended leave spells |
| **E8** | **`leave_event_outbox`** | **M04-owned** | M04 | Transactional outbox of leave domain events to post |
| **E9** | **`sr_event_mapping`** | **M04-owned** | M04 | Versioned mapping: leave type/spell → SR entry type + rules |
| **E10** | **`sr_posting_log`** | **M04-owned** | M04 | Append-only record of every posting attempt & outcome |
| **E11** | **`sr_dead_letter`** | **M04-owned** | M04 | Quarantined poison events awaiting resolution |
| **E12** | **`reconciliation_run`** | **M04-owned** | M04 | A reconciliation execution header |
| **E13** | **`reconciliation_finding`** | **M04-owned** | M04 | A single drift/mismatch finding + remediation state |
| **E14** | **`sr_correction_link`** | **M04-owned** | M04 | Links a correcting/reversing SR entry to its original |
| **E15** | **`historical_leave_batch`** | **M04-owned** | M04 | Digitisation batch header (legacy leave load) |
| **E16** | **`historical_leave_record`** | **M04-owned** | M04 | A staged legacy leave record within a batch |
| **E17** | **`integration_config`** | **M04-owned** | M04 | Retry/SLA/circuit-breaker/scheduler settings (effective-dated) |

> M04 introduces **10 owned entities** (E8–E17) and references **7 canonical/source entities** (E1–E7).

### 5.2 Field tables (M04-owned entities) + sample data

#### E8 — `leave_event_outbox`

| Field | Type | Null | Notes |
|---|---|---|---|
| `outbox_id` | UUID PK | N | |
| `correlation_id` | UUID | N | Stable id of the leave domain event (used as idempotency seed) |
| `employee_id` | UUID FK→employees | N | Subject |
| `leave_ledger_entry_id` | UUID FK→leave_ledger_entries | N | Source spell |
| `event_type` | enum | N | LEAVE_APPROVED / LEAVE_CANCELLED / LEAVE_AMENDED |
| `leave_type_code` | varchar(32) | N | e.g., EL, HPL, LWP, EOL, STUDY, MATERNITY |
| `spell_start` | date | N | |
| `spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | Calendar/qualifying day count from M03 |
| `prior_outbox_id` | UUID | Y | For amendments/cancellations, references the original event |
| `payload` | jsonb | N | Frozen snapshot of source fields needed for mapping/posting |
| `status` | enum | N | PENDING / IN_FLIGHT / POSTED / FAILED / DEAD_LETTERED |
| `available_at` | timestamptz | N | Earliest time relay may pick (backoff) |
| `attempt_count` | int | N | Default 0 |
| `created_at` | timestamptz | N | |
| `created_by` | varchar | N | Source service principal |

*Append-only intent: rows are status-updated by the relay; never deleted.*

Sample data:

| outbox_id | correlation_id | event_type | leave_type_code | spell_start | spell_end | days_count | status | attempt_count |
|---|---|---|---|---|---|---|---|---|
| 6f1a…01 | c0de…aa | LEAVE_APPROVED | EL | 2026-04-01 | 2026-04-10 | 10.0 | POSTED | 1 |
| 6f1a…02 | c0de…bb | LEAVE_APPROVED | LWP | 2026-05-02 | 2026-08-30 | 121.0 | IN_FLIGHT | 2 |
| 6f1a…03 | c0de…cc | LEAVE_CANCELLED | EL | 2026-04-01 | 2026-04-10 | 10.0 | PENDING | 0 |

#### E9 — `sr_event_mapping`

| Field | Type | Null | Notes |
|---|---|---|---|
| `mapping_id` | UUID PK | N | |
| `mapping_version` | int | N | Monotonic per ruleset |
| `leave_type_code` | varchar(32) | N | Match key |
| `event_type` | enum | N | APPROVED/CANCELLED/AMENDED |
| `spell_predicate` | jsonb | Y | Optional conditions (e.g., days_count ≥ 120 ⇒ LONG_LEAVE) |
| `sr_entry_type` | varchar(48) | N | Target SR entry type (M12 vocabulary) |
| `qualifying_service_rule` | enum | N | QUALIFYING / NON_QUALIFYING / PARTIAL / RULE_REF |
| `qualifying_rule_ref` | varchar(64) | Y | Reference to statutory rule for PARTIAL |
| `annotation_template` | text | Y | Template for statutory annotation text |
| `effective_from` | date | N | |
| `effective_to` | date | Y | Null = open |
| `status` | enum | N | DRAFT / PUBLISHED / RETIRED |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Audit fields |

Sample data:

| mapping_id | version | leave_type_code | event_type | sr_entry_type | qualifying_service_rule | status |
|---|---|---|---|---|---|---|
| m1…01 | 3 | EL | APPROVED | EARNED_LEAVE_AVAILED | QUALIFYING | PUBLISHED |
| m1…02 | 3 | LWP | APPROVED | LWP_SPELL | NON_QUALIFYING | PUBLISHED |
| m1…03 | 3 | EL | CANCELLED | LEAVE_CANCELLED_CORRECTION | QUALIFYING | PUBLISHED |

#### E10 — `sr_posting_log`

| Field | Type | Null | Notes |
|---|---|---|---|
| `posting_id` | UUID PK | N | |
| `outbox_id` | UUID FK→leave_event_outbox | N | |
| `correlation_id` | UUID | N | |
| `idempotency_key` | varchar(128) | N | Deterministic: hash(correlation_id+event_type+mapping_version) |
| `mapping_id` | UUID FK→sr_event_mapping | N | Mapping version used |
| `sr_event_id` | UUID | Y | Returned by M12 on success (FK→service_register_events) |
| `sr_entry_type` | varchar(48) | N | |
| `attempt_no` | int | N | |
| `outcome` | enum | N | SUCCESS / RETRYABLE_FAILURE / PERMANENT_FAILURE / DUPLICATE_NOOP |
| `http_status` | int | Y | From M12 |
| `error_code` | varchar(48) | Y | M12 or M04 error code |
| `error_detail` | text | Y | |
| `latency_ms` | int | Y | |
| `posted_at` | timestamptz | N | |
| `posted_by` | varchar | N | Service principal or actor (manual) |

*Append-only.*

Sample data:

| posting_id | correlation_id | idempotency_key | sr_event_id | outcome | attempt_no | latency_ms |
|---|---|---|---|---|---|---|
| p…01 | c0de…aa | k:aa:APPR:v3 | sr…77 | SUCCESS | 1 | 142 |
| p…02 | c0de…bb | k:bb:APPR:v3 | — | RETRYABLE_FAILURE | 1 | 5012 |
| p…03 | c0de…bb | k:bb:APPR:v3 | sr…78 | DUPLICATE_NOOP | 3 | 88 |

#### E11 — `sr_dead_letter`

| Field | Type | Null | Notes |
|---|---|---|---|
| `dlq_id` | UUID PK | N | |
| `outbox_id` | UUID FK | N | |
| `correlation_id` | UUID | N | |
| `failure_class` | enum | N | MAPPING_MISSING / VALIDATION_REJECT / UPSTREAM_DOWN / DATA_CONFLICT / UNKNOWN |
| `last_error_code` | varchar(48) | N | |
| `last_error_detail` | text | Y | |
| `attempts_exhausted` | int | N | |
| `state` | enum | N | OPEN / IN_REVIEW / RESOLVED_REPLAYED / RESOLVED_DISCARDED |
| `assigned_to` | UUID FK→users | Y | |
| `resolution_workflow_id` | UUID FK→workflow_instances | Y | Maker-checker for SR write |
| `resolution_note` | text | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | std | | |

Sample data:

| dlq_id | correlation_id | failure_class | last_error_code | state | attempts_exhausted |
|---|---|---|---|---|---|
| d…01 | c0de…dd | MAPPING_MISSING | LSR_MAPPING_NOT_FOUND | OPEN | 5 |
| d…02 | c0de…ee | UPSTREAM_DOWN | UPSTREAM_UNAVAILABLE | IN_REVIEW | 8 |
| d…03 | c0de…ff | DATA_CONFLICT | LSR_SR_CONFLICT | RESOLVED_REPLAYED | 6 |

#### E12 — `reconciliation_run`

| Field | Type | Null | Notes |
|---|---|---|---|
| `run_id` | UUID PK | N | |
| `run_type` | enum | N | SCHEDULED / ON_DEMAND / PRE_PENSION |
| `scope` | jsonb | N | Filters: org_unit, date range, employee set |
| `leave_records_examined` | int | N | |
| `sr_entries_examined` | int | N | |
| `findings_count` | int | N | |
| `status` | enum | N | RUNNING / COMPLETED / FAILED |
| `started_at` | timestamptz | N | |
| `completed_at` | timestamptz | Y | |
| `triggered_by` | UUID FK→users | Y | Null for scheduled |

Sample data:

| run_id | run_type | leave_records_examined | sr_entries_examined | findings_count | status |
|---|---|---|---|---|---|
| r…01 | SCHEDULED | 12840 | 12835 | 5 | COMPLETED |
| r…02 | ON_DEMAND | 320 | 320 | 0 | COMPLETED |
| r…03 | PRE_PENSION | 41 | 39 | 2 | COMPLETED |

#### E13 — `reconciliation_finding`

| Field | Type | Null | Notes |
|---|---|---|---|
| `finding_id` | UUID PK | N | |
| `run_id` | UUID FK→reconciliation_run | N | |
| `employee_id` | UUID FK→employees | N | |
| `correlation_id` | UUID | Y | If linkable to a leave event |
| `finding_type` | enum | N | MISSING_SR / DUPLICATE_SR / DIVERGENT_FIELD / ORPHAN_CORRECTION / UNMAPPED_LEAVE |
| `severity` | enum | N | LOW / MEDIUM / HIGH / CRITICAL |
| `leave_snapshot` | jsonb | Y | Source side |
| `sr_snapshot` | jsonb | Y | Target side |
| `divergent_fields` | jsonb | Y | Field-level diff |
| `remediation_state` | enum | N | OPEN / REMEDIATION_PROPOSED / APPROVED / APPLIED / WAIVED |
| `remediation_workflow_id` | UUID FK→workflow_instances | Y | |
| `created_at`/`updated_at`/`updated_by` | std | | |

Sample data:

| finding_id | finding_type | severity | remediation_state | employee_id |
|---|---|---|---|---|
| f…01 | MISSING_SR | HIGH | OPEN | emp…12 |
| f…02 | DUPLICATE_SR | CRITICAL | REMEDIATION_PROPOSED | emp…34 |
| f…03 | DIVERGENT_FIELD | MEDIUM | APPLIED | emp…56 |

#### E14 — `sr_correction_link`

| Field | Type | Null | Notes |
|---|---|---|---|
| `link_id` | UUID PK | N | |
| `original_sr_event_id` | UUID FK→service_register_events | N | The entry being corrected/reversed |
| `correcting_sr_event_id` | UUID FK→service_register_events | N | The new append-only entry |
| `correction_type` | enum | N | REVERSAL / AMENDMENT / SUPERSEDE |
| `reason_code` | varchar(48) | N | LEAVE_CANCELLED / LEAVE_AMENDED / RECON_FIX / MIGRATION_FIX |
| `correlation_id` | UUID | Y | Triggering leave event |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| link_id | correction_type | reason_code | original_sr_event_id | correcting_sr_event_id |
|---|---|---|---|---|
| l…01 | REVERSAL | LEAVE_CANCELLED | sr…77 | sr…90 |
| l…02 | AMENDMENT | LEAVE_AMENDED | sr…78 | sr…91 |
| l…03 | SUPERSEDE | RECON_FIX | sr…80 | sr…92 |

#### E15 — `historical_leave_batch`

| Field | Type | Null | Notes |
|---|---|---|---|
| `batch_id` | UUID PK | N | |
| `batch_label` | varchar(120) | N | e.g., "Office X legacy leave 1995-2010" |
| `source_type` | enum | N | PAPER_SCAN / LEGACY_SYSTEM / SPREADSHEET |
| `source_document_id` | UUID FK→documents | Y | Provenance |
| `records_total` | int | N | |
| `records_valid` | int | N | |
| `records_rejected` | int | N | |
| `status` | enum | N | STAGED / VALIDATED / APPROVED / POSTED / PARTIALLY_POSTED / REJECTED |
| `approval_workflow_id` | UUID FK→workflow_instances | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by` | std | | |

Sample data:

| batch_id | batch_label | source_type | records_total | records_valid | status |
|---|---|---|---|---|---|
| b…01 | Office-X legacy 1995-2010 | PAPER_SCAN | 1450 | 1438 | VALIDATED |
| b…02 | Legacy HRMS dump 2011-2018 | LEGACY_SYSTEM | 9802 | 9790 | POSTED |
| b…03 | Spreadsheet Dept-Y | SPREADSHEET | 230 | 198 | PARTIALLY_POSTED |

#### E16 — `historical_leave_record`

| Field | Type | Null | Notes |
|---|---|---|---|
| `record_id` | UUID PK | N | |
| `batch_id` | UUID FK→historical_leave_batch | N | |
| `employee_id` | UUID FK→employees | Y | Resolved during validation |
| `service_no_raw` | varchar(64) | N | As-keyed; resolved to employee_id |
| `leave_type_code` | varchar(32) | N | Mapped from legacy code |
| `spell_start`/`spell_end` | date | N | |
| `days_count` | numeric(6,1) | N | |
| `qualifying_flag` | enum | Y | Derived via mapping |
| `validation_state` | enum | N | PENDING / VALID / REJECTED |
| `reject_reason` | varchar(120) | Y | |
| `posted_sr_event_id` | UUID | Y | After posting |
| `created_at`/`created_by` | std | | |

Sample data:

| record_id | service_no_raw | leave_type_code | spell_start | spell_end | validation_state |
|---|---|---|---|---|---|
| h…01 | EMP-1995-1123 | EL | 1998-06-01 | 1998-06-15 | VALID |
| h…02 | EMP-2001-0457 | LWP | 2003-01-10 | 2003-07-09 | VALID |
| h…03 | EMP-9999-XXXX | STUDY | 2005-08-01 | 2006-07-31 | REJECTED |

#### E17 — `integration_config`

| Field | Type | Null | Notes |
|---|---|---|---|
| `config_id` | UUID PK | N | |
| `key` | varchar(64) | N | e.g., max_retries, backoff_base_ms, circuit_threshold, posting_sla_minutes |
| `value` | jsonb | N | |
| `effective_from` | timestamptz | N | |
| `effective_to` | timestamptz | Y | |
| `updated_by` | varchar | N | |
| `created_at`/`updated_at` | std | | |

Sample data:

| config_id | key | value | effective_from |
|---|---|---|---|
| cfg…01 | max_retries | 8 | 2026-01-01 |
| cfg…02 | backoff_base_ms | 2000 | 2026-01-01 |
| cfg…03 | posting_sla_minutes | 5 | 2026-01-01 |

### 5.3 Relationship map

```
employees (M01) 1───* leave_ledger_entries (M03) 1───1 leave_event_outbox (M04)
leave_event_outbox 1───* sr_posting_log ─────► service_register_events (M12)
leave_event_outbox 1───0..1 sr_dead_letter
sr_event_mapping (versioned) ──used-by──► sr_posting_log
reconciliation_run 1───* reconciliation_finding ──► employees / leave_ledger / SR
service_register_events ◄──original── sr_correction_link ──correcting──► service_register_events
historical_leave_batch 1───* historical_leave_record ──posts──► service_register_events
documents (M13) ◄──provenance── historical_leave_batch
workflow_instances (shared) ──governs──► dlq resolution, recon remediation, historical promotion, manual corrections
audit_log (shared) ◄──writes── every M04 state change
```

### 5.4 Ownership / reuse matrix

| Entity | Owner | M04 access | Written by M04? |
|---|---|---|---|
| employees | M01 | Read | No |
| leave_ledger_entries | M03 | Read | No (consumes events) |
| service_register_events | M12 | Write via port + Read | Yes (append-only, via M12 port) |
| audit_log | Shared | Append | Yes |
| notifications | Shared | Append | Yes |
| documents | M13 | Read | No |
| workflow_* | Shared | Read/Write tasks | Yes |
| leave_event_outbox … integration_config (E8–E17) | M04 | Full | Yes |

### 5.5 Enum catalog

| Enum | Values |
|---|---|
| `outbox.event_type` | LEAVE_APPROVED, LEAVE_CANCELLED, LEAVE_AMENDED |
| `outbox.status` | PENDING, IN_FLIGHT, POSTED, FAILED, DEAD_LETTERED |
| `mapping.qualifying_service_rule` | QUALIFYING, NON_QUALIFYING, PARTIAL, RULE_REF |
| `mapping.status` | DRAFT, PUBLISHED, RETIRED |
| `posting.outcome` | SUCCESS, RETRYABLE_FAILURE, PERMANENT_FAILURE, DUPLICATE_NOOP |
| `dlq.failure_class` | MAPPING_MISSING, VALIDATION_REJECT, UPSTREAM_DOWN, DATA_CONFLICT, UNKNOWN |
| `dlq.state` | OPEN, IN_REVIEW, RESOLVED_REPLAYED, RESOLVED_DISCARDED |
| `recon.run_type` | SCHEDULED, ON_DEMAND, PRE_PENSION |
| `recon.finding_type` | MISSING_SR, DUPLICATE_SR, DIVERGENT_FIELD, ORPHAN_CORRECTION, UNMAPPED_LEAVE |
| `recon.severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `recon.remediation_state` | OPEN, REMEDIATION_PROPOSED, APPROVED, APPLIED, WAIVED |
| `correction.type` | REVERSAL, AMENDMENT, SUPERSEDE |
| `correction.reason_code` | LEAVE_CANCELLED, LEAVE_AMENDED, RECON_FIX, MIGRATION_FIX |
| `batch.source_type` | PAPER_SCAN, LEGACY_SYSTEM, SPREADSHEET |
| `batch.status` | STAGED, VALIDATED, APPROVED, POSTED, PARTIALLY_POSTED, REJECTED |
| `hist_record.validation_state` | PENDING, VALID, REJECTED |

### 5.6 Data integrity rules

1. **Outbox uniqueness:** `(correlation_id, event_type)` is unique — one outbox row per logical leave event occurrence; amendments create a new event with a new `correlation_id` and `prior_outbox_id` link.
2. **Idempotency determinism:** `idempotency_key = hash(correlation_id + ':' + event_type + ':' + mapping_version)`; M12 dedupes on it. A repeat call returns `DUPLICATE_NOOP` with the original `sr_event_id`.
3. **Append-only ledgers:** `sr_posting_log`, `sr_correction_link`, `audit_log`, and `service_register_events` are never updated/deleted; `leave_event_outbox` rows are status-mutated but never deleted.
4. **No hard SR edit:** M04 must never UPDATE or DELETE a `service_register_events` row; corrections are *new* entries linked via `sr_correction_link`.
5. **Mapping coverage:** every `(leave_type_code, event_type)` reaching the relay must resolve to exactly one PUBLISHED mapping effective at `spell_start`; absence ⇒ DLQ `MAPPING_MISSING` (never a silent drop).
6. **Correction integrity:** a `LEAVE_CANCELLED`/`LEAVE_AMENDED` event must produce a correction entry referencing the original; if the original SR entry cannot be found, raise `ORPHAN_CORRECTION` finding rather than posting an unlinked correction.
7. **Qualifying-service consistency:** the `qualifying_service_rule` recorded on the SR entry must equal the mapping's rule at posting time; reconciliation flags `DIVERGENT_FIELD` if they differ.
8. **Effective-dated config/mapping:** only one PUBLISHED mapping version per `(leave_type_code, event_type)` may be effective at any date; overlapping effective ranges are rejected at publish.
9. **FK respect:** all FKs to `employees`, `service_register_events`, `documents`, `workflow_instances` must reference existing, non-deleted rows.
10. **Bounded retries:** `attempt_count ≤ max_retries (config)`; on exhaustion ⇒ move to `sr_dead_letter` and set outbox `DEAD_LETTERED`.

---

## Section 6 — Functional Requirements

> Each FR follows: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table.

---

### FR-01 — Capture approved leave events via transactional outbox

- **ID:** FR-01
- **Module:** M04-LSR
- **Primary Role(s):** System (M03 source service principal), IntegOps (observe)
- **User Story:** *As the HRMS, when a leave application is approved (or cancelled/amended) in M03, I want the event captured durably in the same transaction as the leave-ledger write, so that no leave event can ever be lost before reaching the Service Register.*

**Description.** On a terminal leave decision in M03 (`LEAVE_APPROVED`, `LEAVE_CANCELLED`, `LEAVE_AMENDED`), an outbox row is written **atomically** with the M03 ledger commit. M04 reads the outbox; M03 never calls M12 directly. The outbox row carries a frozen `payload` snapshot of all fields the mapping/posting will need, so later source mutations cannot change what gets posted.

**Acceptance Criteria.**
1. Every approved/cancelled/amended leave commit produces exactly one outbox row in the same DB transaction (verified: no committed leave decision without a corresponding outbox row).
2. If the transaction rolls back, neither the ledger nor the outbox row persists.
3. The outbox `payload` is an immutable snapshot; subsequent edits to the source spell do not mutate it.
4. `(correlation_id, event_type)` uniqueness is enforced; duplicate emission is a no-op.
5. New outbox rows default to `status=PENDING`, `available_at=now()`, `attempt_count=0`.

**Business Rules.**
- BR-01.1 Outbox capture is mandatory for all leave types configured to affect the SR; non-SR-affecting leave (e.g., short casual leave, if policy excludes it) is filtered by mapping coverage, not by dropping the event.
- BR-01.2 Amendments create a new `correlation_id` and set `prior_outbox_id`.
- BR-01.3 The source principal is recorded in `created_by`.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Insert (write) |
| `leave_ledger_entries` (M03) | Read snapshot source |
| `audit_log` | Append capture event |

**API References.**

| API | Purpose |
|---|---|
| Internal outbox write (within M03 tx) | Atomic capture |
| `GET /api/v1/lsr/outbox` | IntegOps observability (paginated) |

**UI Behavior Notes.** No end-user UI; outbox visible read-only in the monitoring console (Section 7) as the "Inbound queue" panel with status counts.

**Edge Cases.**
- Duplicate event emission (at-least-once source) → unique constraint makes it idempotent.
- M03 emits an event for a leave type with no mapping → captured anyway; fails later into DLQ (never dropped at capture).
- Clock skew on `available_at` → relay tolerates ±1 min.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `OutboxWriter` (in M03 tx boundary or shared lib), `OutboxRepository` |
| Backend flow | M03 commits ledger + outbox in one tx → row visible to relay poll |
| Data operations | INSERT into `leave_event_outbox`; SELECT snapshot of source spell |
| Validation | Required fields present; enum valid; `(correlation_id,event_type)` unique |
| Authorization | Source service principal with `lsr.outbox.write` scope |
| State changes & side effects | New PENDING outbox row; audit_log append |
| Failure handling | Tx rollback discards both writes; on unique violation, treat as no-op |
| Dependencies | M03 ledger schema; shared DB transaction |
| Test guidance | Unit: atomic commit/rollback; concurrency: duplicate emission idempotent; property: payload immutability |

---

### FR-02 — Governed event-mapping catalog (leave → SR entry type + qualifying rule)

- **ID:** FR-02
- **Module:** M04-LSR
- **Primary Role(s):** System Administrator (author DRAFT), SR Custodian (approve/publish)
- **User Story:** *As an SR Custodian, I want a versioned, effective-dated catalog mapping each leave type and spell condition to the correct statutory SR entry type and qualifying-service rule, so that posting is deterministic, auditable, and changeable without code deployment.*

**Description.** The catalog (`sr_event_mapping`) defines, per `(leave_type_code, event_type[, spell_predicate])`, the target `sr_entry_type`, the `qualifying_service_rule`, an optional `annotation_template`, and an effective-date range. Versions are immutable once PUBLISHED; changes create a new version. Maker (Sys Admin) drafts; checker (SR Custodian) publishes.

**Acceptance Criteria.**
1. A DRAFT mapping can be created, edited, and deleted; a PUBLISHED mapping cannot be edited (only superseded by a new version or RETIRED).
2. Publishing requires SR Custodian approval (maker ≠ checker).
3. No two PUBLISHED mappings for the same `(leave_type_code, event_type)` may have overlapping effective ranges (rejected at publish with `LSR_MAPPING_OVERLAP`).
4. The relay resolves the mapping effective at `spell_start`; if none, the event dead-letters as `MAPPING_MISSING`.
5. Every publish/retire writes to `audit_log` with version and actor.

**Business Rules.**
- BR-02.1 `spell_predicate` may classify long leave (e.g., `days_count ≥ 120 ⇒ LONG_LEAVE` flag) and route LWP/EOL to `NON_QUALIFYING`.
- BR-02.2 The qualifying rule on the resulting SR entry is sourced solely from the mapping (single source of truth).
- BR-02.3 Mapping versions are referenced in `sr_posting_log.mapping_id` for traceability.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_event_mapping` | CRUD (draft) / publish |
| `workflow_instances` | Maker-checker for publish |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/mappings` | Create draft |
| `PUT /api/v1/lsr/mappings/{id}` | Edit draft |
| `POST /api/v1/lsr/mappings/{id}/publish` | Submit for approval |
| `GET /api/v1/lsr/mappings` | List (effective-date filter) |

**UI Behavior Notes.** Admin "Mapping Catalog" screen: list with version, status, effective range; diff view between versions; publish action gated by role; predicate builder for spell conditions.

**Edge Cases.**
- Legacy leave type with no modern equivalent → map to a generic `LEGACY_LEAVE_AVAILED` SR type with annotation.
- Mid-spell mapping change → resolution is by `spell_start`, deterministic.
- Attempt to retire a mapping with in-flight events → allowed; in-flight postings retain their pinned `mapping_version`.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `MappingService`, `MappingResolver`, `MappingPublishWorkflow` |
| Backend flow | Draft → submit → checker approves → PUBLISHED with effective range validation |
| Data operations | INSERT/UPDATE (draft only); INSERT new version on change |
| Validation | Overlap check; predicate schema; enum validity |
| Authorization | Sys Admin (draft), SR Custodian (publish) |
| State changes & side effects | Version status transitions; audit append |
| Failure handling | Overlap → `LSR_MAPPING_OVERLAP`; publish-by-non-checker → FORBIDDEN |
| Dependencies | M12 SR entry-type vocabulary; workflow engine |
| Test guidance | Overlap matrix tests; resolver-by-date tests; immutability of published version |

---

### FR-03 — Idempotent posting relay with exactly-once semantics

- **ID:** FR-03
- **Module:** M04-LSR
- **Primary Role(s):** System (relay worker), IntegOps (monitor)
- **User Story:** *As the integration, I want a relay that drains the outbox and posts each event to the M12 SR write port exactly once, using a deterministic idempotency key, so that retries and concurrent workers never create duplicate statutory entries.*

**Description.** A scheduled relay claims PENDING/retry-eligible outbox rows (row-lock / `SELECT … FOR UPDATE SKIP LOCKED`), resolves the mapping, computes the deterministic `idempotency_key`, and calls M12's idempotent SR write port. On success it records `sr_event_id`, marks the outbox `POSTED`, and appends to `sr_posting_log`. M12 dedupes on the key, so a repeat returns the original `sr_event_id` as `DUPLICATE_NOOP`.

**Acceptance Criteria.**
1. Each successfully posted event results in exactly one `service_register_events` row (verified by reconciliation).
2. Concurrent relay instances never post the same outbox row twice (lock + idempotency key).
3. A replayed/duplicated call to M12 with the same key returns the original `sr_event_id` and is logged `DUPLICATE_NOOP` (no second SR row).
4. Posting latency (claim→confirm) is recorded; P95 ≤ 5 minutes under normal load.
5. Every attempt (success or failure) appends a `sr_posting_log` row.

**Business Rules.**
- BR-03.1 `idempotency_key = hash(correlation_id + ':' + event_type + ':' + mapping_version)`.
- BR-03.2 The relay pins the mapping version at claim time and records it in the posting log.
- BR-03.3 Outbox transitions: PENDING → IN_FLIGHT (on claim) → POSTED (success) | FAILED (retryable) | DEAD_LETTERED (exhausted).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Claim + status update |
| `sr_posting_log` | Append attempt |
| `sr_event_mapping` | Resolve |
| `service_register_events` (M12) | Write via port |

**API References.**

| API | Purpose |
|---|---|
| `POST {M12}/api/v1/sr/events` (Idempotency-Key) | Append SR entry |
| `GET /api/v1/lsr/postings` | Posting log (paginated) |

**UI Behavior Notes.** Console "Posting log" panel: searchable by correlation_id/employee, outcome filter, latency column, link to SR entry.

**Edge Cases.**
- M12 returns 200 but relay crashes before marking POSTED → next claim re-posts with same key → `DUPLICATE_NOOP`, then marks POSTED (self-heals).
- M12 returns ambiguous timeout → treat as RETRYABLE; idempotency guarantees safety on retry.
- Mapping resolves to NON_QUALIFYING long-leave → posting includes qualifying flag (FR-09).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RelayWorker`, `SrPostingClient`, `IdempotencyKeyFactory`, `OutboxClaimRepository` |
| Backend flow | Poll → claim (SKIP LOCKED) → resolve mapping → build key → POST to M12 → record outcome → update outbox |
| Data operations | UPDATE outbox status; INSERT posting_log; read mapping |
| Validation | Payload completeness; mapping resolved; key deterministic |
| Authorization | Relay service principal `sr.events.write` (append-only) |
| State changes & side effects | New SR entry (M12); outbox POSTED; metrics emitted |
| Failure handling | Retryable→FR-04; permanent→DLQ; ambiguous→retry (idempotent-safe) |
| Dependencies | M12 idempotent write port; scheduler; config (FR-04) |
| Test guidance | Crash-after-success replay test; concurrency double-claim test; idempotency dedupe test; latency SLA test |

---

### FR-04 — Retry with backoff, circuit breaker & dead-letter

- **ID:** FR-04
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), Sys Admin (configure), IntegOps (observe)
- **User Story:** *As the integration, I want transient failures retried with exponential backoff and a circuit breaker, and poison events quarantined to a dead-letter store after exhausting retries, so that upstream outages self-heal and unrecoverable events are never silently lost.*

**Description.** Failures are classified retryable (UPSTREAM_UNAVAILABLE, timeouts, 5xx, RATE_LIMITED) vs permanent (VALIDATION_REJECT, MAPPING_MISSING, DATA_CONFLICT). Retryable failures increment `attempt_count`, set `available_at = now + backoff(attempt)`, and keep status FAILED until the next claim. A circuit breaker trips after a configurable consecutive-failure threshold against M12, pausing the relay and alerting. On exhausting `max_retries`, the event moves to `sr_dead_letter` and outbox becomes DEAD_LETTERED.

**Acceptance Criteria.**
1. Retryable failures retry up to `max_retries` (config) with exponential backoff + jitter.
2. Permanent failures dead-letter immediately (no pointless retries).
3. Exhausted retries create exactly one `sr_dead_letter` row and set outbox DEAD_LETTERED.
4. Circuit breaker trips at the configured threshold, pauses posting, and raises a CRITICAL alert; it half-opens after a cooldown.
5. All retries/DLQ moves append to `sr_posting_log` and `audit_log`.

**Business Rules.**
- BR-04.1 Backoff: `available_at = now + base * 2^(attempt-1) + jitter`, capped at a max delay.
- BR-04.2 Failure classification is centralised and config-tunable.
- BR-04.3 Circuit-breaker state is observable in the dashboard and emits notifications.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Update attempt/status/available_at |
| `sr_dead_letter` | Insert on exhaustion |
| `sr_posting_log` | Append |
| `integration_config` | Read retry/backoff/threshold |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` | List DLQ |
| `PUT /api/v1/lsr/config` | Update retry/SLA/breaker (Sys Admin) |

**UI Behavior Notes.** Dashboard shows breaker state (CLOSED/OPEN/HALF_OPEN), DLQ depth, retry histogram; config screen for thresholds.

**Edge Cases.**
- Thundering herd after outage → jitter spreads retries.
- Permanent error misclassified as retryable → bounded by `max_retries` then DLQ.
- Breaker stuck open due to persistent M12 outage → alerts escalate; manual override to test half-open.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RetryPolicy`, `FailureClassifier`, `CircuitBreaker`, `DeadLetterService` |
| Backend flow | On failure → classify → (retryable: schedule) | (permanent/exhausted: DLQ) |
| Data operations | UPDATE outbox; INSERT dlq; INSERT posting_log |
| Validation | attempt_count ≤ max_retries; classification deterministic |
| Authorization | Relay principal; Sys Admin for config |
| State changes & side effects | Outbox FAILED/DEAD_LETTERED; breaker state; alerts |
| Failure handling | DLQ guarantees no silent loss; breaker prevents cascading failure |
| Dependencies | config; notifications; scheduler |
| Test guidance | Backoff math tests; classifier tests; breaker trip/half-open tests; exhaustion→DLQ test |

---

### FR-05 — Dead-letter triage & maker-checker resolution

- **ID:** FR-05
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps / HR Officer (maker), SR Custodian (checker)
- **User Story:** *As an Integration Operator, I want to triage dead-lettered events, diagnose the cause, fix the root issue, and replay or discard them under maker-checker control, so that every quarantined leave event is resolved with full auditability.*

**Description.** DLQ items are listed with `failure_class`, last error, and snapshots. An operator can assign, investigate, and choose **Replay** (after fixing mapping/data) or **Discard** (with justification). Replaying re-enqueues the original outbox row (resets to PENDING, preserves idempotency key). Any resolution that results in an SR write runs through maker-checker (IntegOps maker → SR Custodian checker).

**Acceptance Criteria.**
1. DLQ items are filterable by failure_class, severity, org_unit, age.
2. Replay re-enqueues with the same idempotency key (no duplicate risk).
3. Discard requires a justification and SR Custodian approval; the item moves to RESOLVED_DISCARDED.
4. Resolution transitions and approvals are audited with actor and timestamp.
5. A DLQ item resolved as RESOLVED_REPLAYED is closed only after the replayed event reaches POSTED.

**Business Rules.**
- BR-05.1 Replay must not bypass mapping coverage — a `MAPPING_MISSING` item is only replayable after a covering mapping is published.
- BR-05.2 Discard never deletes data; the row is retained as RESOLVED_DISCARDED with reason.
- BR-05.3 SR-writing resolutions require maker ≠ checker.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_dead_letter` | Update state/assignment/resolution |
| `leave_event_outbox` | Re-enqueue on replay |
| `workflow_instances` | Maker-checker |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dlq` | List |
| `POST /api/v1/lsr/dlq/{id}/assign` | Assign |
| `POST /api/v1/lsr/dlq/{id}/replay` | Replay (creates workflow) |
| `POST /api/v1/lsr/dlq/{id}/discard` | Discard (creates workflow) |

**UI Behavior Notes.** DLQ triage board (Kanban: Open / In review / Resolved); detail drawer with leave vs SR snapshot, error history, replay/discard actions; checker approval inbox.

**Edge Cases.**
- Replay after the source leave was further amended → relay re-snapshots? No — outbox payload is frozen; if stale, operator discards and lets the newer event flow.
- Bulk replay after a fixed mapping → batch action with single workflow approval per batch.
- Checker rejects replay → item returns to IN_REVIEW with rejection note.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DlqService`, `ReplayService`, `DlqResolutionWorkflow` |
| Backend flow | Assign → investigate → replay/discard → workflow → on approve apply |
| Data operations | UPDATE dlq; UPDATE outbox (replay); INSERT workflow tasks |
| Validation | Mapping coverage before replay; justification for discard |
| Authorization | Maker (IntegOps/HR), checker (SR Custodian) |
| State changes & side effects | DLQ state; outbox re-enqueue; audit |
| Failure handling | Failed replay re-enters retry/DLQ; rejected workflow reverts state |
| Dependencies | FR-02 (mapping), FR-03 (relay), workflow engine |
| Test guidance | Replay idempotency; discard audit; maker-checker enforcement; bulk replay |

---

### FR-06 — Reconciliation engine (drift detection)

- **ID:** FR-06
- **Module:** M04-LSR
- **Primary Role(s):** System (scheduled), IntegOps / SR Custodian (on-demand)
- **User Story:** *As an SR Custodian, I want scheduled and on-demand reconciliation comparing the M03 leave ledger against the M12 Service Register, so that missing, duplicate, or divergent entries are detected and surfaced as actionable findings before they corrupt pension/seniority computation.*

**Description.** A reconciliation run loads the leave ledger and SR entries for a scope (org_unit, date range, employee set, or `PRE_PENSION` for a retiring cohort) and compares them by `correlation_id` and business keys. It classifies findings: `MISSING_SR` (leave with no SR entry), `DUPLICATE_SR` (more than one SR entry for one event), `DIVERGENT_FIELD` (e.g., days_count/qualifying flag mismatch), `ORPHAN_CORRECTION` (correction with no original), `UNMAPPED_LEAVE` (leave type never mapped). Findings are persisted with snapshots and severity.

**Acceptance Criteria.**
1. A run records counts examined on both sides and produces zero or more findings.
2. MISSING_SR is raised for any approved, SR-affecting leave without a corresponding POSTED entry.
3. DUPLICATE_SR is raised when >1 SR entry shares an event's idempotency key/business key.
4. DIVERGENT_FIELD captures a field-level diff (`divergent_fields` JSON).
5. `PRE_PENSION` runs can be triggered for an employee/cohort and complete before pension processing (FR-09 / M11 dependency).
6. Reconciliation is read-only against M03 and M12 (never mutates SR directly).

**Business Rules.**
- BR-06.1 Scheduled full reconciliation runs at least daily; incremental (since last run) hourly.
- BR-06.2 Severity: MISSING_SR/DUPLICATE_SR/ORPHAN_CORRECTION = HIGH/CRITICAL; DIVERGENT_FIELD = MEDIUM; cosmetic = LOW.
- BR-06.3 Findings are deduplicated across runs (same issue not re-created if still OPEN).

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_run` | Insert header |
| `reconciliation_finding` | Insert findings |
| `leave_ledger_entries` (M03) | Read |
| `service_register_events` (M12) | Read |
| `sr_posting_log` | Cross-check |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/reconciliation/runs` | Trigger on-demand/pre-pension |
| `GET /api/v1/lsr/reconciliation/runs/{id}` | Run status + summary |
| `GET /api/v1/lsr/reconciliation/findings` | List findings (paginated) |

**UI Behavior Notes.** "Reconciliation" screen: run history, trigger button (scope picker), findings table with type/severity filters, side-by-side leave/SR diff viewer.

**Edge Cases.**
- Leave posted but SR entry later corrected → match the latest effective SR entry via correction links.
- In-flight events at run time → excluded from MISSING (status not yet POSTED) but reported as "pending" informational.
- Large cohort → run is chunked and resumable.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationEngine`, `MatcherByCorrelation`, `FieldDiffer`, `FindingDeduper` |
| Backend flow | Load scope → index both sides → match → classify → persist findings |
| Data operations | Bulk read M03/M12; INSERT run + findings |
| Validation | Scope bounds; pagination on reads |
| Authorization | IntegOps/SR Custodian (trigger); system (scheduled) |
| State changes & side effects | New run + findings; no SR mutation |
| Failure handling | Partial run → status FAILED with checkpoint; resumable |
| Dependencies | M03 ledger read API; M12 SR read API; correction links (FR-08) |
| Test guidance | Seeded drift fixtures (missing/dup/divergent); dedupe across runs; pre-pension scope |

---

### FR-07 — Reconciliation remediation (maker-checker correction)

- **ID:** FR-07
- **Module:** M04-LSR
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker)
- **User Story:** *As an SR Custodian, I want each reconciliation finding to drive a controlled remediation — re-post a missing entry, supersede a duplicate, or correct a divergent field via an append-only correction — so that drift is closed without ever hard-editing the statutory register.*

**Description.** From a finding, an operator proposes a remediation: **MISSING_SR → re-enqueue/post**; **DUPLICATE_SR → supersede the surplus entry** (append a SUPERSEDE correction marking the duplicate void, never delete); **DIVERGENT_FIELD → append an AMENDMENT correction** with corrected values; **ORPHAN_CORRECTION → link or void**; **UNMAPPED_LEAVE → create mapping then replay**. All SR-affecting remediations are maker-checker, produce `sr_correction_link` entries where applicable, and transition the finding to APPLIED (or WAIVED with justification).

**Acceptance Criteria.**
1. Each finding type has a defined remediation action set; selecting one creates a workflow.
2. No remediation performs an UPDATE/DELETE on `service_register_events`; corrections are appended.
3. Duplicate remediation marks the surplus entry void via a SUPERSEDE correction linking original→correcting.
4. On checker approval the action applies and the finding becomes APPLIED; rejection returns it to OPEN.
5. WAIVED findings require a justification and are retained for audit.

**Business Rules.**
- BR-07.1 Remediation reason codes: RECON_FIX (and MIGRATION_FIX for batch-origin findings).
- BR-07.2 The applied correction must reference the finding and the original SR entry.
- BR-07.3 After APPLIED, a verification re-check confirms the finding no longer reproduces.

**Data Model References.**

| Entity | Use |
|---|---|
| `reconciliation_finding` | Update remediation_state |
| `sr_correction_link` | Insert for corrections |
| `service_register_events` (M12) | Append correction via port |
| `workflow_instances` | Maker-checker |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/findings/{id}/remediate` | Propose remediation (workflow) |
| `POST /api/v1/lsr/findings/{id}/waive` | Waive with justification |
| `GET /api/v1/lsr/findings/{id}` | Detail |

**UI Behavior Notes.** Finding detail with recommended action, proposed correction preview (before/after), approve/reject (checker), waive with reason.

**Edge Cases.**
- Concurrent remediation of the same finding → optimistic lock; second attempt sees state change.
- Remediation that itself fails posting → returns to OPEN, surfaces error.
- Divergent field that is actually correct in SR (source was wrong) → route fix to M03, waive SR-side.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RemediationService`, `CorrectionPoster`, `RemediationWorkflow`, `VerificationRecheck` |
| Backend flow | Propose → workflow → on approve apply correction via M12 port → re-check |
| Data operations | INSERT correction_link; append SR entry; UPDATE finding |
| Validation | Action valid for finding type; append-only enforced |
| Authorization | Maker (HR/IntegOps), checker (SR Custodian) |
| State changes & side effects | Finding APPLIED/WAIVED; new SR correction; audit |
| Failure handling | Apply failure → finding OPEN + error; reject → OPEN |
| Dependencies | FR-06 findings; FR-08 correction posting; workflow |
| Test guidance | Per-finding-type remediation tests; append-only assertion; re-check closes finding |

---

### FR-08 — Correction & reversal posting (append-only)

- **ID:** FR-08
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), SR Custodian (governs)
- **User Story:** *As the integration, when a previously posted leave is cancelled or amended, I want to post an append-only correcting or reversing SR entry that references the original, so that the Service Register reflects the truth without ever being hard-edited.*

**Description.** A `LEAVE_CANCELLED` event posts a **REVERSAL** SR entry that nullifies the original's service effect; a `LEAVE_AMENDED` event posts an **AMENDMENT** SR entry with the corrected spell/qualifying values. Both create an `sr_correction_link` (original→correcting). The original entry remains intact and visible; statutory readers (pension, seniority) follow the correction chain to the net-effective state.

**Acceptance Criteria.**
1. A cancellation posts a REVERSAL entry linked to the original; the original is never deleted/edited.
2. An amendment posts an AMENDMENT entry capturing corrected values, linked to the original.
3. If the original SR entry cannot be located, the relay raises `ORPHAN_CORRECTION` (DLQ/finding) rather than posting an unlinked correction.
4. The net-effective state of a leave (after chain resolution) is queryable.
5. Correction posting is idempotent (same idempotency-key rule).

**Business Rules.**
- BR-08.1 Correction type derives from event_type via mapping (CANCELLED→REVERSAL, AMENDED→AMENDMENT).
- BR-08.2 Reason code is set (LEAVE_CANCELLED/LEAVE_AMENDED/RECON_FIX/MIGRATION_FIX).
- BR-08.3 Corrections to qualifying-service must re-emit the qualifying flag (FR-09) so M11 sees the corrected effect.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (M12) | Append correction |
| `sr_correction_link` | Insert link |
| `leave_event_outbox` | Source event |
| `sr_posting_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST {M12}/api/v1/sr/events` | Append correction (Idempotency-Key) |
| `GET /api/v1/lsr/corrections?original={sr_event_id}` | Resolve chain |

**UI Behavior Notes.** SR entry view (in M12, surfaced here) shows a correction chain timeline: original → reversal/amendment with reason and link to leave event.

**Edge Cases.**
- Multiple sequential amendments → a chain of AMENDMENT entries; net-effective = latest.
- Cancellation of an already-amended leave → REVERSAL referencing the latest effective entry.
- Original posted by historical digitisation (FR-11) → correction links to the migrated entry.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CorrectionResolver`, `CorrectionPoster`, `ChainResolver` |
| Backend flow | Locate original via correlation/business key → post correction → link → log |
| Data operations | Append SR entry; INSERT correction_link; INSERT posting_log |
| Validation | Original exists; correction type valid; idempotency key |
| Authorization | Relay principal; SR Custodian governance |
| State changes & side effects | New SR correction; chain updated; qualifying flag re-emitted |
| Failure handling | Original missing → ORPHAN_CORRECTION finding/DLQ |
| Dependencies | FR-03, FR-09, M12 port |
| Test guidance | Cancel/amend chain tests; orphan detection; net-effective resolution; idempotency |

---

### FR-09 — Qualifying-service & pension impact flags (LWP / long leave)

- **ID:** FR-09
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), Pension Officer (consume), SR Custodian (govern)
- **User Story:** *As a Pension Officer, I want every leave SR entry to carry a precise qualifying-vs-non-qualifying service flag (LWP/EOL = non-qualifying, long leave per rule), so that qualifying-service and pension computation in M11 are correct and auditable.*

**Description.** When posting (FR-03) or correcting (FR-08), the relay attaches the `qualifying_service_rule` (and any `qualifying_rule_ref` / day apportionment) from the mapping to the SR entry. LWP/EOL spells reduce qualifying service; long-leave spells beyond a threshold are flagged per statutory rule (e.g., partial counting). These flags are the contract M11 reads to compute net qualifying service. A `PRE_PENSION` reconciliation (FR-06) verifies flags before pension processing.

**Acceptance Criteria.**
1. Every leave SR entry carries an explicit qualifying flag (QUALIFYING/NON_QUALIFYING/PARTIAL with rule ref).
2. LWP/EOL spells post as NON_QUALIFYING by default mapping.
3. PARTIAL spells carry the apportionment basis (`qualifying_rule_ref`).
4. Corrections re-emit the corrected qualifying effect.
5. M11 can retrieve, for an employee, the total non-qualifying days derived from SR leave entries; the figure reconciles to the leave ledger.

**Business Rules.**
- BR-09.1 The qualifying rule is sourced only from the published mapping (no ad-hoc computation in M04).
- BR-09.2 Long-leave threshold and apportionment are config/mapping driven, not hardcoded.
- BR-09.3 Any change to qualifying effect after pension processing has started triggers a CRITICAL alert to M11.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (M12) | Carries qualifying flag |
| `sr_event_mapping` | Source of rule |
| `reconciliation_run` (PRE_PENSION) | Verify |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/qualifying-impact` | Non-qualifying days summary for M11 |
| `POST /api/v1/lsr/reconciliation/runs` (PRE_PENSION) | Pre-pension verification |

**UI Behavior Notes.** Pension-impact report per employee: timeline of qualifying vs non-qualifying spells, total non-qualifying days, drill-down to SR entries.

**Edge Cases.**
- Spell straddling a rule-change effective date → split by mapping effective dates.
- Retrospective LWP regularisation → posts AMENDMENT correcting qualifying flag.
- Suspension period later treated as duty → correction flips NON_QUALIFYING→QUALIFYING with audit.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `QualifyingFlagResolver`, `QualifyingImpactReport`, `PensionAlertEmitter` |
| Backend flow | On post/correct → attach flag from mapping → expose summary API |
| Data operations | Write flag on SR entry; aggregate read for summary |
| Validation | Flag present; rule ref for PARTIAL; sums reconcile |
| Authorization | Pension Officer read; relay write |
| State changes & side effects | SR entry flag; alert on post-processing change |
| Failure handling | Missing rule → DLQ MAPPING_MISSING |
| Dependencies | FR-02, FR-03, FR-08, M11 |
| Test guidance | LWP non-qualifying tests; partial apportionment; straddle split; M11 reconciliation total |

---

### FR-10 — Statutory annotations (increment / seniority / probation effect)

- **ID:** FR-10
- **Module:** M04-LSR
- **Primary Role(s):** System (relay), SR Custodian / HR Officer (govern), M06 (consume)
- **User Story:** *As an SR Custodian, I want leave SR entries to carry machine-readable statutory annotations (increment deferral, seniority effect, probation extension) where the leave triggers them, so that downstream seniority and increment processing act on authoritative data rather than manual interpretation.*

**Description.** Certain leave (e.g., long LWP/EOL) statutorily defers the next increment date, affects seniority, or extends probation. The mapping's `annotation_template` produces a structured annotation on the SR entry (e.g., `{type: INCREMENT_DEFERRAL, days: 90, rule_ref: FR-x}`). These annotations are consumed by M06 (progression/seniority) and visible in the SR. Annotations follow corrections (an amended leave updates its annotation via a new correction entry).

**Acceptance Criteria.**
1. Leave types configured with an annotation template produce structured annotations on the SR entry.
2. Annotation includes type, quantum (e.g., deferral days), and statutory rule reference.
3. Amendments/cancellations re-emit corrected annotations via correction entries.
4. M06 can query annotations affecting increment/seniority for an employee.
5. No annotation is produced where the mapping does not configure one (no spurious effects).

**Business Rules.**
- BR-10.1 Annotation quantum derives from mapping rule (e.g., increment deferral = non-qualifying days) — config-driven.
- BR-10.2 Annotations are advisory data to M06; M06 owns the seniority/increment decision.
- BR-10.3 Annotation changes are auditable and chained with corrections.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` (M12) | Carries annotation |
| `sr_event_mapping` | Annotation template |
| `sr_correction_link` | Annotation updates |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/employees/{id}/annotations` | Annotations for M06 |

**UI Behavior Notes.** SR entry shows annotation chips (e.g., "Increment deferred 90 days"); progression report lists annotation impacts.

**Edge Cases.**
- Overlapping annotations from consecutive spells → aggregated by M06; M04 emits each per spell.
- Annotation rule changes retroactively → correction re-emits.
- Leave that affects increment but not seniority → only the configured annotation type emitted.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AnnotationRenderer`, `AnnotationApi` |
| Backend flow | On post/correct → render annotation from template → attach to SR entry |
| Data operations | Write annotation; read for M06 |
| Validation | Template schema; quantum computed; rule ref present |
| Authorization | Relay write; M06/HR read |
| State changes & side effects | SR annotation; correction chain |
| Failure handling | Template error → DLQ VALIDATION_REJECT |
| Dependencies | FR-02, FR-08, M06 |
| Test guidance | Annotation rendering tests; correction re-emit; M06 query |

---

### FR-11 — Historical leave digitisation into SR

- **ID:** FR-11
- **Module:** M04-LSR
- **Primary Role(s):** HR Officer / IntegOps (maker), SR Custodian (checker)
- **User Story:** *As an SR Custodian, I want legacy paper/electronic leave history loaded into the Service Register through a validated, provenance-tracked batch pipeline with post-load reconciliation, so that historical leave correctly contributes to qualifying service and the SR is complete from day one.*

**Description.** Legacy leave (paper scans, legacy system dumps, spreadsheets) is staged as `historical_leave_record` rows under a `historical_leave_batch`. Validation resolves `service_no_raw`→`employee_id`, maps legacy leave codes via FR-02, derives qualifying flags, and flags rejects. After SR Custodian approval (maker-checker), valid records post to the SR as migrated entries (with `MIGRATION` provenance and source `document_id`). A post-load reconciliation confirms parity. Records that fail post into PARTIALLY_POSTED batches for re-work.

**Acceptance Criteria.**
1. A batch can be created from a source with `documents` provenance and staged records.
2. Validation classifies each record VALID/REJECTED with reason; counts roll up to the batch.
3. Posting requires SR Custodian batch approval (maker ≠ checker).
4. Posted historical entries are append-only, idempotent (re-running a batch does not duplicate), and carry MIGRATION provenance.
5. Post-load reconciliation (FR-06) runs automatically and reports parity/findings.

**Business Rules.**
- BR-11.1 Idempotency for migration uses a deterministic key from `(employee_id, leave_type, spell_start, spell_end, batch lineage)`.
- BR-11.2 Rejected records never post; they remain for correction and re-validation.
- BR-11.3 Migrated entries are flagged distinctly so audit can separate migrated vs live-captured history.

**Data Model References.**

| Entity | Use |
|---|---|
| `historical_leave_batch` | Header |
| `historical_leave_record` | Staged records |
| `documents` (M13) | Provenance |
| `service_register_events` (M12) | Append migrated entries |
| `reconciliation_run` | Post-load parity |
| `workflow_instances` | Batch approval |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/historical/batches` | Create batch |
| `POST /api/v1/lsr/historical/batches/{id}/validate` | Validate |
| `POST /api/v1/lsr/historical/batches/{id}/approve` | Approve (checker) |
| `POST /api/v1/lsr/historical/batches/{id}/post` | Post valid records |
| `GET /api/v1/lsr/historical/batches/{id}` | Status |

**UI Behavior Notes.** Batch wizard: upload/import → validation report (valid/reject with reasons) → checker approval → post → reconciliation summary; reject grid editable for correction.

**Edge Cases.**
- Duplicate legacy record across batches → idempotency key prevents double posting.
- Employee not found (e.g., pre-system retiree) → REJECTED with reason; escalate to M01.
- Partial spell with unclear qualifying status → mapped to PARTIAL with rule ref, or held for SR Custodian decision.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `BatchIngestService`, `RecordValidator`, `MigrationPoster`, `BatchApprovalWorkflow` |
| Backend flow | Stage → validate → approve → post (idempotent) → reconcile |
| Data operations | INSERT batch/records; append SR entries; INSERT recon run |
| Validation | Employee resolution; mapping coverage; date sanity; duplicate detection |
| Authorization | Maker (HR/IntegOps), checker (SR Custodian) |
| State changes & side effects | Batch status transitions; SR migrated entries; audit |
| Failure handling | Per-record failure → PARTIALLY_POSTED; rejects retained |
| Dependencies | FR-02, FR-06, M12, M13 |
| Test guidance | Idempotent re-post; reject handling; provenance; post-load parity |

---

### FR-12 — Replay & backfill tooling

- **ID:** FR-12
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps (operate), SR Custodian (approve)
- **User Story:** *As an Integration Operator, I want safe, audited replay and backfill tools (by event, time window, or employee) that respect idempotency, so that after a fix or outage I can re-drive events to the SR without creating duplicates.*

**Description.** Replay re-enqueues selected outbox events (single, by filter, or by time window); backfill generates outbox events for source leave that was never captured (e.g., pre-integration gap). Both rely on idempotency so re-posting is safe. Bulk operations are previewed (dry-run count), require SR Custodian approval for SR-writing scope, and are fully audited.

**Acceptance Criteria.**
1. Replay by id/filter/time-window re-enqueues matching events with original idempotency keys.
2. Backfill detects source leave with no outbox row and generates capture events.
3. A dry-run preview shows affected count before execution.
4. Bulk SR-writing replay/backfill requires SR Custodian approval.
5. Replays/backfills are idempotent — re-running produces no duplicate SR entries.

**Business Rules.**
- BR-12.1 Replay never mutates the original payload (frozen snapshot preserved).
- BR-12.2 Backfill is bounded by an explicit scope and approved before execution.
- BR-12.3 Every replayed/backfilled item links to the operation id for audit.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox` | Re-enqueue / create backfill rows |
| `sr_posting_log` | Append |
| `workflow_instances` | Approval for bulk |
| `audit_log` | Append operation |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/lsr/replay` (dry_run flag) | Replay by scope |
| `POST /api/v1/lsr/backfill` (dry_run flag) | Backfill missing |

**UI Behavior Notes.** "Replay / Backfill" tool: scope builder, dry-run preview with counts, approval gate, progress tracker.

**Edge Cases.**
- Replay window overlaps in-flight events → idempotency makes overlap safe.
- Backfill for leave that should not affect SR → filtered by mapping coverage.
- Massive backfill → chunked, rate-limited to protect M12, resumable.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ReplayService`, `BackfillScanner`, `BulkOpWorkflow`, `OpProgressTracker` |
| Backend flow | Scope → dry-run → approve → execute (chunked, idempotent) |
| Data operations | UPDATE/INSERT outbox; INSERT posting_log |
| Validation | Scope bounds; mapping coverage; approval present |
| Authorization | IntegOps operate; SR Custodian approve |
| State changes & side effects | Re-enqueued events; SR entries (idempotent); audit |
| Failure handling | Per-item failure → retry/DLQ; resumable on crash |
| Dependencies | FR-03, FR-04, workflow |
| Test guidance | Idempotent replay/backfill; dry-run accuracy; chunk resume; approval enforcement |

---

### FR-13 — Integration monitoring dashboard

- **ID:** FR-13
- **Module:** M04-LSR
- **Primary Role(s):** IntegOps, SR Custodian, Auditor (read), Sys Admin
- **User Story:** *As an Integration Operator, I want a real-time dashboard of integration health — queue depth, posting lag, success/error rates, DLQ depth, circuit-breaker state, and reconciliation status — with SLA alerts, so that I can detect and act on problems before they affect statutory data.*

**Description.** A console summarising: inbound outbox by status, posting throughput and P95 lag, error rate by code, DLQ depth and age, circuit-breaker state, last reconciliation result and open findings by severity, and historical batch progress. Configurable SLA thresholds raise notifications (FR / Section 12). Feeds M14 with KPIs.

**Acceptance Criteria.**
1. Dashboard shows live counts for outbox statuses, postings, DLQ, findings, breaker state.
2. Posting lag P95 and success rate are charted over selectable windows.
3. SLA breaches (lag > threshold, DLQ depth > threshold, open HIGH/CRITICAL findings) raise alerts.
4. All panels are RBAC-scoped (Auditor read-only; org_unit scoping for HR).
5. Metrics are exported to M14 Dashboard & Analytics.

**Business Rules.**
- BR-13.1 Thresholds are config-driven (`integration_config`).
- BR-13.2 Alerts are deduplicated and escalate by severity.
- BR-13.3 Dashboard is read-only except acknowledge-alert actions (IntegOps).

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_dead_letter`, `reconciliation_run/finding`, `historical_leave_batch` | Aggregate reads |
| `integration_config` | Thresholds |
| `notifications` | Alerts |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/dashboard/summary` | Aggregated KPIs |
| `GET /api/v1/lsr/dashboard/metrics` | Time-series |
| `POST /api/v1/lsr/alerts/{id}/ack` | Acknowledge |

**UI Behavior Notes.** Cards (queue/lag/DLQ/breaker), trend charts, findings-by-severity, batch progress; empty/loading/error states; alert banner with ack.

**Edge Cases.**
- No data yet → empty-state guidance.
- Metric pipeline lag → "as of" timestamp shown.
- Alert storm during outage → grouped alert.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DashboardAggregator`, `MetricsService`, `AlertEvaluator`, React console |
| Backend flow | Aggregate queries + cached metrics → summary/timeseries APIs |
| Data operations | Read-only aggregates; INSERT notifications on breach |
| Validation | Window bounds; RBAC scope |
| Authorization | Role-scoped read; IntegOps ack |
| State changes & side effects | Alert notifications; ack state |
| Failure handling | Stale cache → show "as of"; degrade gracefully |
| Dependencies | All M04 ledgers; M14; notifications |
| Test guidance | Aggregation correctness; threshold breach alert; RBAC scoping; empty/error states |

---

### FR-14 — Integration audit & evidence pack

- **ID:** FR-14
- **Module:** M04-LSR
- **Primary Role(s):** Auditor (read/export), SR Custodian
- **User Story:** *As an Auditor, I want to retrieve, for any employee or time window, the complete provable chain from leave decision to SR entry (including corrections, reconciliations, and DLQ resolutions), so that I can certify statutory completeness and integrity.*

**Description.** Produces an exportable, immutable evidence pack joining: source leave event → outbox → posting log → SR entry (and correction chain) → any reconciliation findings/remediations → DLQ history. Supports per-employee, per-batch, and per-time-window queries; export is read-only, watermarked, and itself audited.

**Acceptance Criteria.**
1. For a given employee, the full leave→SR chain (incl. corrections) is reconstructable and exportable.
2. The pack lists any reconciliation findings and their resolution state for the scope.
3. DLQ items and their resolutions in scope are included.
4. Export action is audited (who, when, scope).
5. The pack is tamper-evident (hash/checksum) and read-only.

**Business Rules.**
- BR-14.1 Auditor access is read-only across all M04 data, including audit_log.
- BR-14.2 Exports carry a generation timestamp, scope, and integrity checksum.
- BR-14.3 PII minimisation: leave reason detail is excluded unless statutorily required.

**Data Model References.**

| Entity | Use |
|---|---|
| `leave_event_outbox`, `sr_posting_log`, `sr_correction_link`, `service_register_events`, `reconciliation_finding`, `sr_dead_letter`, `audit_log` | Read/join |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/lsr/audit/chain?employeeId=` | Reconstruct chain |
| `POST /api/v1/lsr/audit/export` | Generate evidence pack |

**UI Behavior Notes.** Audit explorer: timeline visualisation of leave→SR→correction chain; export button (PDF/CSV/JSON) with checksum.

**Edge Cases.**
- Very long service history → paginated/chunked export.
- Chain with multiple corrections → full lineage rendered.
- Missing link (pre-integration) → flagged as "no integration record (migrated)".

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AuditChainBuilder`, `EvidencePackExporter`, `ChecksumService` |
| Backend flow | Join across ledgers by correlation/employee → render → export + checksum |
| Data operations | Read-only joins; INSERT audit_log for export |
| Validation | Scope bounds; RBAC (Auditor) |
| Authorization | Auditor/SR Custodian read; export audited |
| State changes & side effects | Audit_log export record only |
| Failure handling | Partial data → annotate gaps; never fabricate |
| Dependencies | All M04 ledgers; M12; audit_log |
| Test guidance | Chain reconstruction; checksum integrity; export audit; gap annotation |

---

## Section 7 — UI Requirements

The M04 surface is an **operational console** (not an end-user app). Screens (React + Tailwind + shadcn/ui, WCAG 2.1 AA, dark-mode, responsive, full empty/loading/error/permission states):

1. **Integration Dashboard** (FR-13) — KPI cards (outbox by status, posting P95 lag, success rate, DLQ depth/age, breaker state), trend charts, findings-by-severity, batch progress, alert banner with acknowledge.
2. **Posting Log** (FR-03) — searchable table (correlation_id, employee, outcome, latency, SR link), filters, detail drawer.
3. **DLQ Triage Board** (FR-05) — Kanban (Open/In review/Resolved), detail drawer with leave-vs-SR snapshot and error history, replay/discard actions, checker approval inbox.
4. **Reconciliation** (FR-06/07) — run history, trigger with scope picker, findings table with side-by-side diff viewer, remediation proposal preview, approve/reject/waive.
5. **Mapping Catalog** (FR-02) — versioned list, effective-date and status columns, version diff, predicate builder, publish gate.
6. **Historical Digitisation** (FR-11) — batch wizard (import → validation report → approval → post → reconciliation summary), editable reject grid.
7. **Replay / Backfill** (FR-12) — scope builder, dry-run preview, approval gate, progress tracker.
8. **Audit Explorer** (FR-14) — leave→SR→correction chain timeline, export with checksum.
9. **Configuration** (FR-04/13) — retry/backoff/breaker/SLA threshold settings (Sys Admin).

**Cross-cutting UI rules:** all destructive/SR-writing actions show a confirm modal and route to maker-checker; every list is paginated (max 100); all timestamps display `DD-MMM-YYYY HH:mm` in user TZ; correlation_id and sr_event_id are click-to-copy; toasts for async actions; no skeleton-only screens (real data, fields, states).

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/lsr`; M12 calls to `{M12_BASE}/api/v1/sr`.
- Auth: Bearer JWT (OIDC); RBAC + org_unit row scoping.
- Idempotency: SR writes carry `Idempotency-Key` header.
- Pagination: `?page=&limit=` (max 100) or cursor; responses include `pageInfo`.
- Canonical error envelope (Shared Foundation):
  `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`

### 8.2 Error-code catalog

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid request (inherited) |
| AUTH_REQUIRED | 401 | Missing/invalid token (inherited) |
| FORBIDDEN | 403 | RBAC / maker-checker / SoD violation (inherited) |
| NOT_FOUND | 404 | Entity not found (inherited) |
| CONFLICT | 409 | State/optimistic-lock conflict (inherited) |
| RATE_LIMITED | 429 | Throttled (inherited) |
| INTERNAL_ERROR | 500 | Unexpected (inherited) |
| UPSTREAM_UNAVAILABLE | 503 | M12 SR port unreachable (inherited; retryable) |
| LSR_MAPPING_NOT_FOUND | 422 | No published mapping for (leave_type, event_type) at spell_start |
| LSR_MAPPING_OVERLAP | 409 | Overlapping effective ranges at publish |
| LSR_SR_CONFLICT | 409 | M12 rejected due to conflicting SR state |
| LSR_ORPHAN_CORRECTION | 422 | Correction has no locatable original entry |
| LSR_IDEMPOTENT_DUPLICATE | 200 | Duplicate detected; original sr_event_id returned (no-op) |
| LSR_DLQ_REPLAY_BLOCKED | 409 | Replay blocked (e.g., mapping still missing) |
| LSR_BATCH_VALIDATION_FAILED | 422 | Historical batch has rejected records blocking post |
| LSR_CIRCUIT_OPEN | 503 | Posting paused by circuit breaker |
| LSR_SCOPE_TOO_LARGE | 400 | Replay/backfill/recon scope exceeds bound |

### 8.3 JSON examples

**Post SR entry (relay → M12):**
```http
POST /api/v1/sr/events
Idempotency-Key: k:c0deaa:LEAVE_APPROVED:v3
Authorization: Bearer <relay-jwt>
```
```json
{
  "employeeId": "emp-12",
  "srEntryType": "EARNED_LEAVE_AVAILED",
  "sourceModule": "M04-LSR",
  "correlationId": "c0de-aa",
  "spell": { "start": "2026-04-01", "end": "2026-04-10", "days": 10.0 },
  "qualifyingServiceRule": "QUALIFYING",
  "annotations": [],
  "provenance": { "type": "LIVE_CAPTURE", "mappingVersion": 3 }
}
```
**Success:**
```json
{ "srEventId": "sr-77", "status": "CREATED", "requestId": "req-9001" }
```
**Idempotent duplicate:**
```json
{ "srEventId": "sr-77", "status": "DUPLICATE_NOOP", "code": "LSR_IDEMPOTENT_DUPLICATE", "requestId": "req-9002" }
```

**Trigger pre-pension reconciliation:**
```json
POST /api/v1/lsr/reconciliation/runs
{ "runType": "PRE_PENSION", "scope": { "employeeIds": ["emp-12"] } }
```
```json
{ "runId": "r-03", "status": "RUNNING", "requestId": "req-9100" }
```

**Reconciliation finding (MISSING_SR):**
```json
{
  "findingId": "f-01", "runId": "r-01", "employeeId": "emp-12",
  "findingType": "MISSING_SR", "severity": "HIGH",
  "leaveSnapshot": { "leaveType": "EL", "start": "2026-04-01", "end": "2026-04-10" },
  "srSnapshot": null, "remediationState": "OPEN", "requestId": "req-9200"
}
```

**Mapping overlap error:**
```json
{ "error": { "code": "LSR_MAPPING_OVERLAP", "message": "Effective range overlaps published version 3 for (EL, APPROVED)", "field": "effective_from" }, "requestId": "req-9300" }
```

### 8.4 Integration points

| Direction | Counterparty | Contract |
|---|---|---|
| Inbound | M03 | Transactional outbox of leave events (in-DB) |
| Outbound | M12 | Idempotent SR write port + SR read API |
| Outbound | M11 | Qualifying-impact summary API / SR flags |
| Outbound | M06 | Annotations API |
| Outbound | M14 | Metrics/KPI export |
| Bi-dir | M13 | Document provenance reference |
| Outbound | Notifications | Alerts/SLA breach |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Relay P95 posting lag (approval→SR confirm) ≤ 5 min; management API P95 < 500ms; reconciliation of 100k records < 30 min. |
| Throughput/Scalability | Horizontal relay workers (SKIP LOCKED claim); handle ≥ 50 events/sec sustained, bursts ≥ 500/sec into outbox. |
| Reliability | Exactly-once posting; no event loss (durable outbox); RPO ≤ 15 min, RTO ≤ 4h; 99.9% uptime. |
| Consistency | Eventual consistency between leave ledger and SR with bounded lag; reconciliation closes residual drift. |
| Availability/Resilience | Circuit breaker + retry/backoff insulates against M12 outage; DLQ guarantees no silent loss. |
| Security | OIDC/SSO+MFA; RBAC + org_unit scoping; relay principal limited to append-only SR write; TLS 1.2+; encryption at rest; OWASP ASVS. |
| Privacy | DPDP Act 2023 alignment; PII minimisation (no medical/leave-reason detail in M04 payloads); audit retains only SR-relevant fields. |
| Auditability | Every state change in audit_log; append-only ledgers; tamper-evident evidence packs. |
| Observability | Structured logs with requestId+correlation_id; metrics (lag, throughput, DLQ depth, error rate, breaker state); alerting. |
| Maintainability | Mapping & config changes without redeploy; versioned mappings. |
| Accessibility | Console WCAG 2.1 AA; keyboard/focus; dark mode. |
| Data retention | Ledgers retained per statutory schedule (service register retention); DLQ history retained ≥ 7 years. |

---

## Section 10 — Workflow & State Diagrams (state tables)

### 10.1 Outbox event lifecycle

| Current | Event | Next | Guard / Side effect |
|---|---|---|---|
| (none) | Leave approved/cancelled/amended in M03 | PENDING | Outbox row written in tx (FR-01) |
| PENDING | Relay claims | IN_FLIGHT | Row-lock; mapping resolved |
| IN_FLIGHT | M12 success | POSTED | sr_event_id stored; posting_log SUCCESS |
| IN_FLIGHT | Retryable failure | FAILED | attempt++; available_at=backoff |
| FAILED | available_at reached | IN_FLIGHT | Re-claim |
| IN_FLIGHT | Permanent failure | DEAD_LETTERED | DLQ row created |
| FAILED | attempt_count > max_retries | DEAD_LETTERED | DLQ row created |
| DEAD_LETTERED | Replay (resolved) | PENDING | Same idempotency key (FR-05/12) |

### 10.2 DLQ item lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Assign | IN_REVIEW | Operator assigned |
| IN_REVIEW | Replay (approved) | RESOLVED_REPLAYED | Mapping coverage present; closed after POSTED |
| IN_REVIEW | Discard (approved) | RESOLVED_DISCARDED | Justification required |
| IN_REVIEW | Checker rejects | IN_REVIEW | Rejection note |

### 10.3 Reconciliation finding lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | Propose remediation | REMEDIATION_PROPOSED | Maker action → workflow |
| REMEDIATION_PROPOSED | Checker approves | APPROVED | Maker ≠ checker |
| APPROVED | Apply succeeds + re-check clean | APPLIED | Correction appended |
| APPROVED | Apply fails | OPEN | Error surfaced |
| OPEN/PROPOSED | Waive | WAIVED | Justification required |

### 10.4 Historical batch lifecycle

| Current | Event | Next | Guard |
|---|---|---|---|
| STAGED | Validate | VALIDATED | Records classified |
| VALIDATED | Checker approves | APPROVED | Maker ≠ checker |
| APPROVED | Post (all valid succeed) | POSTED | Idempotent |
| APPROVED | Post (some fail) | PARTIALLY_POSTED | Failed retained |
| STAGED/VALIDATED | Reject batch | REJECTED | Justification |

### 10.5 Circuit-breaker state

| Current | Event | Next |
|---|---|---|
| CLOSED | Consecutive failures ≥ threshold | OPEN (alert) |
| OPEN | Cooldown elapsed | HALF_OPEN |
| HALF_OPEN | Probe succeeds | CLOSED |
| HALF_OPEN | Probe fails | OPEN |

---

## Section 11 — Notifications

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| Posting SLA breach | P95 lag > threshold | IntegOps | Dashboard alert + email |
| Circuit breaker OPEN | Breaker trips | IntegOps, Sys Admin | Email + push |
| DLQ item created | Event dead-lettered | IntegOps | Dashboard + email (batched) |
| DLQ depth threshold | Depth > config | IntegOps, SR Custodian | Email |
| HIGH/CRITICAL finding | Reconciliation finding | SR Custodian, IntegOps | Email |
| Pre-pension finding open | PRE_PENSION run finds drift | Pension Officer, SR Custodian | Email |
| Remediation needs approval | Maker submitted | SR Custodian | Workflow inbox + email |
| Batch approval needed | Historical batch validated | SR Custodian | Workflow inbox |
| Qualifying-effect changed post-pension-start | Correction after pension processing | M11 / Pension Officer | CRITICAL email + push |
| Mapping published | Catalog version published | IntegOps, Auditor | In-app |

All notifications write to the shared `notifications` ledger; deduplicated and severity-escalated.

---

## Section 12 — Reporting & Analytics

| Report | Description | Consumer |
|---|---|---|
| Integration health KPI | Lag, throughput, success rate, DLQ depth, breaker uptime | IntegOps, M14 |
| Reconciliation summary | Findings by type/severity/age; closure rate | SR Custodian, Auditor |
| Qualifying-service impact | Per-employee non-qualifying days from SR leave entries | Pension Officer, M11 |
| Correction ledger report | All reversals/amendments with reasons | Auditor, SR Custodian |
| Historical digitisation progress | Batches posted/partial/rejected; coverage % | HR, SR Custodian |
| DLQ aging & resolution SLA | Open/resolved DLQ by age and class | IntegOps |
| Audit evidence pack | Full leave→SR chain export with checksum | Auditor |
| Mapping change history | Version timeline and effective ranges | Auditor, Sys Admin |

All reports respect RBAC + org_unit scoping; exportable (CSV/PDF/JSON); feed M14 for cross-module analytics.

---

## Section 13 — Migration & Launch

### 13.1 Migration

1. **Mapping seed:** author and publish the initial `sr_event_mapping` catalog covering all live leave types + legacy codes (FR-02), reviewed by SR Custodian.
2. **Config seed:** load `integration_config` (max_retries, backoff, breaker threshold, SLA) (FR-04/13).
3. **Backfill live gap:** for leave approved before integration go-live but not yet in SR, run audited backfill (FR-12).
4. **Historical digitisation:** ingest legacy leave via batches (FR-11) prioritised by near-retirement cohorts (pension impact first).
5. **Baseline reconciliation:** run full reconciliation; resolve all findings to zero before declaring SR complete for a cohort.

### 13.2 Launch / rollout

- **Phase 0 (shadow):** relay posts to a staging SR; reconciliation compares; no production writes.
- **Phase 1 (pilot org_unit):** enable live posting for one office; monitor lag/DLQ/findings for 2 weeks.
- **Phase 2 (cohort rollout):** expand by org_unit; backfill + historical digitisation per cohort.
- **Phase 3 (steady state):** all leave events post live; scheduled reconciliation continuous; pre-pension reconciliation mandatory gate before M11 processing.

### 13.3 Cutover acceptance gates

- Zero unresolved HIGH/CRITICAL reconciliation findings for the cohort.
- DLQ empty or all items resolved.
- Mapping catalog fully covers live + legacy leave types.
- Evidence pack reproducible for sampled employees.

### 13.4 Rollback

- Posting relay can be paused (breaker manual override) without data loss (outbox durable); resume re-drains. No SR rollback (append-only) — errors corrected via FR-08 corrections, never deletion.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state tables → tests)

| FR | Primary entities | Key APIs | State table | Test focus |
|---|---|---|---|---|
| FR-01 | leave_event_outbox | outbox write, GET outbox | 10.1 | Atomic capture, idempotent emission |
| FR-02 | sr_event_mapping | mappings CRUD/publish | — | Overlap, resolve-by-date, immutability |
| FR-03 | outbox, sr_posting_log, SR | POST sr/events, GET postings | 10.1 | Exactly-once, crash replay, concurrency |
| FR-04 | outbox, sr_dead_letter, config | GET dlq, PUT config | 10.1, 10.5 | Backoff, classify, breaker, exhaustion |
| FR-05 | sr_dead_letter, outbox, workflow | dlq assign/replay/discard | 10.2 | Replay idempotency, maker-checker |
| FR-06 | reconciliation_run/finding | recon runs/findings | 10.3 | Missing/dup/divergent, dedupe |
| FR-07 | finding, sr_correction_link, SR | findings remediate/waive | 10.3 | Append-only fix, re-check |
| FR-08 | sr_correction_link, SR | POST sr/events, corrections | — | Reversal/amend chain, orphan |
| FR-09 | SR, mapping, recon | qualifying-impact, PRE_PENSION | — | LWP non-qualifying, partial, totals |
| FR-10 | SR, mapping, correction_link | annotations | — | Annotation render, re-emit |
| FR-11 | historical_batch/record, SR, documents | batches validate/approve/post | 10.4 | Idempotent migrate, reject handling |
| FR-12 | outbox, posting_log, workflow | replay, backfill | 10.1 | Idempotent replay/backfill, dry-run |
| FR-13 | all ledgers, config, notifications | dashboard summary/metrics, ack | 10.5 | Aggregation, alerts, RBAC |
| FR-14 | all ledgers, audit_log | audit chain/export | — | Chain reconstruction, checksum |

### 14.2 Dependency graph

```
M03 ──(outbox)──► FR-01 ──► FR-03 ──► M12 (SR)
                   FR-02 ──► FR-03, FR-08, FR-09, FR-10
                   FR-03 ──► FR-04 ──► FR-05
                   FR-06 ──► FR-07 ──► FR-08
                   FR-08 ──► FR-09 ──► M11
                   FR-10 ──► M06
                   FR-11 ──► FR-06, M12, M13
                   FR-12 ──► FR-03
                   FR-13, FR-14 ──► all (read)
```

### 14.3 Parallel-agent build plan

| Track | FRs | Can start when | Parallelism |
|---|---|---|---|
| A. Capture & mapping | FR-01, FR-02 | Foundation ready | Parallel |
| B. Posting core | FR-03, FR-04 | After A (mapping/outbox) | Sequential after A |
| C. DLQ & replay | FR-05, FR-12 | After B | Parallel with D |
| D. Reconciliation | FR-06, FR-07 | After B | Parallel with C |
| E. Corrections & statutory | FR-08, FR-09, FR-10 | After B/D | Parallel internally |
| F. Historical | FR-11 | After B, D | Parallel |
| G. Console & audit | FR-13, FR-14 | After C–F provide data | Last |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement theme (from module focus) | Covered by | Status |
|---|---|---|
| Canonical event mapping | FR-02 | ✅ |
| Eventing/queue (transactional outbox) | FR-01 | ✅ |
| Idempotent posting / exactly-once | FR-03 | ✅ |
| Retry / dead-letter | FR-04, FR-05 | ✅ |
| Reconciliation (drift, missing/duplicate) | FR-06 | ✅ |
| Reconciliation remediation | FR-07 | ✅ |
| Correction & reversal (append-only SR) | FR-08 | ✅ |
| Long-leave & LWP qualifying flags (pension link M11) | FR-09 | ✅ |
| Statutory annotations (increment/seniority) | FR-10 | ✅ |
| Historical leave digitisation on migration | FR-11 | ✅ |
| Replay / backfill | FR-12 | ✅ |
| Integration monitoring dashboard | FR-13 | ✅ |
| Integration audit / evidence | FR-14 | ✅ |
| M03 (source) reference | FR-01, FR-06 | ✅ |
| M12 (target) reference | FR-03, FR-08 | ✅ |
| Integration-specific entities (mappings, posting log, recon, dead-letter) | E8–E17 | ✅ |
| Shared entities reused (employees, SR events, audit_log, notifications, workflow) | Section 5.4 | ✅ |

**Unresolved gaps: 0.**

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| Digital SR | Statutory append-only Service Register (M12), system of record for service events. |
| Transactional outbox | Pattern: write events to a DB table in the same tx as the domain change, drained by a relay — guarantees no lost events. |
| Idempotency key | Deterministic key that lets repeated posts dedupe to a single SR entry (exactly-once). |
| Exactly-once | Effective guarantee that one logical event yields one SR entry despite retries/concurrency. |
| Dead-letter (DLQ) | Quarantine store for events that exhausted retries or hit permanent errors. |
| Reconciliation | Comparison of leave ledger (M03) vs SR (M12) to detect drift. |
| Drift | Divergence between source and target (missing/duplicate/divergent entries). |
| Correction / reversal | Append-only SR entry that amends or nullifies a prior entry (SR never hard-edited). |
| Qualifying service | Service period counting toward pension; LWP/EOL typically non-qualifying. |
| LWP / EOL | Leave Without Pay / Extraordinary Leave — generally non-qualifying. |
| Annotation | Structured statutory note on an SR entry (e.g., increment deferral). |
| Backfill | Generating capture events for source leave never previously captured. |
| Replay | Re-driving existing events to the SR safely via idempotency. |
| Circuit breaker | Mechanism that pauses posting during sustained upstream failure. |
| Correlation id | Stable id of a leave domain event threaded across the integration. |

---

## Section 16 — Appendices

### Appendix A — Idempotency key derivation

`idempotency_key = base62(sha256(correlation_id + ':' + event_type + ':' + mapping_version))[:32]`. M12 stores the key on the SR entry and rejects/no-ops duplicates. Mapping version is included so a remap intentionally produces a new logical post (governed via correction, not silent overwrite).

### Appendix B — Failure classification reference

| Source signal | Class | Action |
|---|---|---|
| 503 / timeout / connection reset | RETRYABLE (UPSTREAM_DOWN) | Backoff retry |
| 429 | RETRYABLE (rate) | Backoff retry |
| 5xx | RETRYABLE | Backoff retry |
| 422 LSR_MAPPING_NOT_FOUND | PERMANENT (MAPPING_MISSING) | DLQ immediately |
| 400 VALIDATION_ERROR | PERMANENT (VALIDATION_REJECT) | DLQ immediately |
| 409 LSR_SR_CONFLICT | PERMANENT (DATA_CONFLICT) | DLQ; recon |
| 200 LSR_IDEMPOTENT_DUPLICATE | SUCCESS (no-op) | Mark POSTED |

### Appendix C — Reconciliation matching algorithm (summary)

1. Index leave ledger by `correlation_id` and business key `(employee_id, leave_type, spell_start, spell_end)`.
2. Index SR leave entries by `correlation_id`/idempotency key and business key, resolving correction chains to net-effective.
3. Left-anti-join leave→SR ⇒ MISSING_SR; right grouping >1 per key ⇒ DUPLICATE_SR; matched with field diff ⇒ DIVERGENT_FIELD; corrections lacking originals ⇒ ORPHAN_CORRECTION; leave types absent from mapping ⇒ UNMAPPED_LEAVE.
4. Dedupe against still-OPEN findings; persist new findings with snapshots.

### Appendix D — Sample correction chain

`EARNED_LEAVE_AVAILED (sr-78, 10d)` → amended to 7d → `LEAVE_AMENDED AMENDMENT (sr-91, net 7d)` linked via `sr_correction_link (l-02, AMENDMENT, LEAVE_AMENDED)`. Net-effective resolver returns sr-91. Pension/seniority readers follow the chain to the latest effective entry.

### Appendix E — Open items / future enhancements

- Optional broker (Kafka) bridge if program standardises event streaming (current design is DB-outbox, broker-optional).
- ML-assisted anomaly detection on posting lag/drift patterns (feed to FR-13).
- Self-service employee view of "leave reflected in SR" (delegated to M12 employee surface).

---

*End of M04-LSR BRD v1.0.*
