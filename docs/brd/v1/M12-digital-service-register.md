# Digital Employee Service Register (Digital SR) — HRMS Module BRD

**Module code:** M12-SR
**Program:** Enterprise HRMS — PeopleGov / HRMS Suite (government / public-sector context, hosted at CGG Data Centre)
**Document version:** v1.0
**Status:** Draft for review
**Author persona:** Global HR/HCM domain expert (Workday / SAP SuccessFactors / Oracle HCM bar) honouring the public-sector statutory context
**Upstream contract:** `SHARED_FOUNDATION.md` (canonical entities, conventions, roles, technical defaults)

> **Reading note.** This BRD defines the **statutory system of record** for an employee's entire service lifecycle: the digital equivalent of the legally significant paper **Service Book**. The append-only ledger entity `service_register_events` is **OWNED BY THIS MODULE** and is defined here in full; every other module (M03/M04 leave, M05 transfer, M06 promotion, M08 appraisal, M09 disciplinary, M10/M11 pay & pension) **writes to it through this module's governed ingestion contract** and never mutates it directly. This module does not own employee master data (`employees` → M01), document bytes (`documents` → M13), or the workflow engine (`workflow_instances`/`workflow_tasks` → shared); it references them. The Digital SR's defining properties are **completeness, immutability, tamper-evidence, attestation, and permanence** — it must survive audit by the Accountant General decades after the originating officer has retired.

---

## Section 1 — Executive Summary

### 1.1 Purpose

In a government HR context the **Service Register (Service Book)** is a legal instrument. Pension, gratuity, seniority, qualifying-service computation, increment dates, disciplinary record, and audit by statutory bodies (Accountant General / Audit) all depend on it being **complete, accurate, chronologically ordered, append-only, and tamper-evident**. The traditional paper Service Book is fragile: pages are lost, entries are back-dated, corrections are made by overwriting, attestation signatures are forged, and reconstruction after loss is impossible. The **Digital Employee Service Register (Digital SR)** replaces it with a cryptographically verifiable, append-only digital ledger that captures **every service life event** from appointment to retirement (and post-retirement archival), with provenance, attestation, and certified-extract generation.

### 1.2 Business problem

The paper service register suffers classic, audit-penalised failure modes: (a) **missing entries** — a promotion or LWP spell never recorded, surfacing as a pension shortfall decades later; (b) **silent tampering** — date-of-birth or date-of-joining altered to extend service; (c) **uncontrolled correction** — overwriting an entry with no trace of the original; (d) **unattested entries** — no proof the custodian or employee verified the record; (e) **no single source** — leave, pay, and disciplinary facts scattered across registers that disagree; (f) **irrecoverable loss** — fire/flood destroys the only copy. Each defect corrupts terminal-benefit computation when it is most expensive to fix. The Digital SR exists to make these failures structurally impossible.

### 1.3 Solution overview

M12-SR delivers:

1. **Canonical SR event model & taxonomy** — a governed, versioned catalog (`sr_event_type`) covering every life event: appointment, confirmation, promotion, transfer, posting, pay-fixation, increment, leave, training, award/reward, punishment, suspension, deputation, name/DOB change, qualification, deputation return, reversion, retirement, death.
2. **Append-only immutable ledger with cryptographic integrity** — `service_register_events` is hash-chained (each entry binds the hash of the previous entry for that employee), giving blockchain-style tamper-evidence and forensic verifiability.
3. **Governed ingestion contract / API** — an **idempotent, versioned, validated** write port through which every other module posts events, with mandatory **source-module provenance**, order reference, and supporting-document linkage.
4. **Correction handling by supersession** — entries are never deleted or overwritten; corrections create **corrigendum / annotation** entries that supersede the original, preserving the full audit chain.
5. **Attestation & verification** — custodian attestation of each entry plus the statutory **periodic (typically 5-yearly) employee service verification** cycle, both digitally signed.
6. **SR timeline & certified extract** — a chronological, filterable, printable **certified true copy** with digital signature and **QR-verifiable** authenticity.
7. **Custody, access control & access logging** — strict RBAC, row-level scoping, and an immutable access log (who viewed/printed which SR, when, why).
8. **Event subscriptions** — downstream modules (pension, seniority, analytics) subscribe to SR change events rather than polling.
9. **Bulk legacy digitisation** — a controlled pipeline to scan, index, data-enter, verify, and reconcile decades of legacy paper service books into the ledger with provenance.
10. **Retention, archival & forensics** — permanent retention, post-retirement archival, legal hold, and an audit/forensics view for tamper investigation.

### 1.4 Key outcomes & success metrics

| Outcome | Metric | Target |
|---|---|---|
| Complete record | Service events recorded vs. events occurred (sampled audit) | 100% |
| Tamper-evidence | Hash-chain integrity verification pass rate | 100% (any break alarms) |
| Idempotent ingestion | Duplicate ledger entries per 10,000 posts | 0 |
| Attestation coverage | ACTIVE entries attested by custodian within SLA | ≥ 99% within 7 days |
| Periodic verification | Employees with completed current 5-yearly verification | ≥ 98% |
| Certified extract integrity | QR-verified extracts confirmed authentic | 100% |
| Correction discipline | Entries hard-deleted or overwritten | 0 (structurally impossible) |
| Legacy digitisation | Legacy service books reconciled & custodian-attested | 100% of in-scope cohort |
| Auditability | SR views/prints recorded in access log | 100% |

### 1.5 Scope at a glance

**In scope:** SR event taxonomy; append-only hash-chained ledger; ingestion contract/API; ledger integrity verification & forensics; correction/annotation by supersession; custodian attestation; periodic employee verification cycles; SR timeline view; certified true copy generation with digital signing + QR; custody/access control & access log; event subscriptions; bulk legacy digitisation; retention/archival/legal hold; SR reporting & analytics.

**Out of scope (owned elsewhere):** employee master data and DOB/DOJ golden source (M01); the business workflows that *generate* events — leave (M03/M04), transfer (M05), promotion (M06), appraisal (M08), disciplinary (M09), payroll (M10), pension computation (M11); document byte storage (M13); cross-module dashboards (M14). M12 **records the statutory fact** of these events; it does not run their business processes.

---

## Section 2 — Scope & Boundaries

### 2.1 In-scope capabilities

- A **versioned, effective-dated SR event taxonomy** (`sr_event_type`) defining every recordable life-event type, its required payload schema, qualifying-service semantics, and attestation rules.
- An **append-only ledger** (`service_register_events`) with per-employee monotonic sequencing and **SHA-256 hash-chaining** for tamper-evidence.
- A **governed ingestion contract** (idempotent, versioned, schema-validated, provenance-stamped) callable only by authorised source modules and the SR custodian.
- **Ledger integrity verification** — on-demand and scheduled hash-chain recomputation, with a forensic view that pinpoints any divergence.
- **Correction & annotation** by append-only supersession (`sr_corrections`) — corrigendum entries, annotations, and disputes — never deletion.
- **Custodian attestation** and the statutory **periodic employee verification** (`sr_attestations`, `sr_verification_cycles`), both digitally signed.
- **SR timeline** (chronological, filterable, paginated) and **certified true copy** (`sr_certified_extracts`) with digital signature and QR verification.
- **Custody & access control**: RBAC + row-level scoping + immutable **access log** (`sr_access_log`).
- **Event subscriptions** (`sr_subscriptions`) for downstream modules.
- **Bulk legacy digitisation** (`sr_legacy_digitisation_batch` / `sr_legacy_digitisation_record`): scan, index, data-entry, verification, reconciliation, custodian promotion.
- **Retention, archival & legal hold** on the permanent record.

### 2.2 Out-of-scope (explicit boundaries)

| Concern | Owner | M12 relationship |
|---|---|---|
| Employee master, DOB/DOJ golden source, employment status | M01-EPM | References `employees`; records *change events* but golden value lives in M01 |
| Leave application/approval & leave→SR posting | M03 / M04 | Receives posted leave events via ingestion contract |
| Transfer / relieving / joining orders | M05-TRJ | Receives posting/transfer events |
| Promotion / seniority computation | M06-PPP | Receives promotion events; emits seniority-relevant facts |
| Appraisal / APAR | M08-PAM | Receives appraisal-recorded events |
| Disciplinary charges, penalties, suspension | M09-DCP | Receives punishment/suspension events |
| Payroll, pay-fixation computation | M10-PAY | Receives pay-fixation/increment events |
| Pension & qualifying-service computation | M11-PEN | **Consumes** SR (subscription/extract); does not write computation back |
| Document byte storage / object store | M13-DMS | References `documents` for scans, orders, signed extracts |
| Cross-module analytics dashboards | M14-DAS | Exposes SR metrics & subscription feeds |
| Auth / RBAC platform | Shared | Inherits OIDC/SSO + RBAC + row-level scoping |

### 2.3 Feature Module Map

| Feature area | FRs | Primary collaborating modules |
|---|---|---|
| SR event taxonomy & payload schemas | FR-01 | All source modules |
| Governed ingestion contract / API (idempotent, versioned) | FR-02 | M03/M04/M05/M06/M08/M09/M10 |
| Append-only hash-chained ledger write | FR-03 | All source modules |
| Ledger integrity verification & forensics | FR-04, FR-16 | Auditor |
| Correction (corrigendum / supersession) | FR-05 | SR Custodian, source modules |
| Annotation & dispute entries | FR-06 | SR Custodian, Employee |
| Custodian attestation | FR-07 | SR Custodian |
| Periodic (5-yearly) employee verification | FR-08 | Employee, SR Custodian |
| SR timeline view | FR-09 | Employee, HR, Auditor |
| Certified true copy + digital signing | FR-10 | SR Custodian, M13 |
| QR / public verification of extracts | FR-11 | External verifiers |
| Custody, access control & access log | FR-12 | Auditor |
| Event subscriptions to downstream modules | FR-13 | M11, M06, M14 |
| Bulk legacy digitisation pipeline | FR-14 | M13, HR data-entry, SR Custodian |
| Retention, archival & legal hold | FR-15 | Auditor, M11 |
| Audit / forensics view & SR analytics | FR-16 | Auditor, M14 |

### 2.4 Common Capabilities (inherited from Shared Foundation, applied here)

- **Audit-everything:** every ingestion, attestation, correction, extract issuance, access, and digitisation promotion writes to `audit_log` (immutable) with actor, before/after, and `requestId`. (The SR ledger itself is a *business* ledger; `audit_log` is the *operational* audit trail — they are complementary.)
- **Maker-checker:** any write to the statutory register that is **manual** (custodian-initiated correction, annotation, legacy batch promotion, name/DOB change record) routes through `workflow_instances`/`workflow_tasks` with maker ≠ checker. Machine-to-machine ingestion from an authenticated source module is non-interactive but is provenance-stamped and validated.
- **RBAC + row-level scoping** by `org_unit_id`; Auditor is read-only across all surfaces; Employee sees only their own SR.
- **Pagination:** all list/timeline endpoints page/limit with hard max page size 100.
- **Time/locale:** store UTC; display `DD-MMM-YYYY`; SR `event_date` is a legal date (no time component) distinct from `recorded_at` (ledger timestamp).
- **Append-only:** the ledger and all SR sub-ledgers (corrections, attestations, access log, ingestion log) are **never** soft-deleted or hard-deleted; they carry `created_at` and `created_by` but **no** `updated_at` or `is_deleted`. Mutable configuration entities (taxonomy drafts, subscriptions, batch headers) carry full audit fields.

### 2.5 Assumptions & dependencies

- Source modules authenticate with a service principal scoped to `sr.ingest.write` and emit events through the ingestion contract (FR-02) with a deterministic `Idempotency-Key`.
- M01 is the authoritative source for `employee_id` ↔ `service_no`; M12 denormalises `service_no` onto each ledger entry for resilience but treats M01 as golden.
- M13 provides durable, encrypted object storage for scans, signed PDFs, and order copies, returning `document_id` references.
- A government PKI / HSM is available for digital signing of certified extracts and attestations (qualified electronic signatures); if PKI is unavailable at launch, signing degrades to server-side signing with an upgrade path recorded.
- A reliable scheduler exists for integrity-verification sweeps, verification-cycle generation, and subscription delivery.
- NTP clock sync across services for ledger timestamps and hash determinism.

---

## Section 3 — Roles & Permissions

### 3.1 Roles relevant to M12 (extends Shared Foundation §4; no contradictions)

- **Employee (Self-Service)** — views own SR timeline; participates in periodic verification (confirm/dispute); requests certified extracts of own record; cannot write ledger entries.
- **Reporting Manager** — views SR of direct reports (scoped, read-only) for context; no write.
- **HR Officer / HR Admin** — initiates manual SR records that have no originating module (rare), prepares legacy digitisation batches (maker), runs data entry; cannot self-approve into the ledger.
- **SR Custodian / Registrar** — the statutory custodian: attests entries, approves corrections/annotations, promotes legacy batches (checker), issues certified extracts, manages access, owns the verification cycle. The single accountable role for SR integrity.
- **Source Module (service principal)** — machine identity for M03/M04/M05/M06/M08/M09/M10 posting events via the ingestion contract; `sr.ingest.write` scope only.
- **Pension Officer** — read SR (full) + subscribe/consume for terminal-benefit computation (M11); no write.
- **Auditor (read-only)** — full read across SR, access log, integrity reports, and forensics view; can trigger integrity verification; no write.
- **System Administrator** — manages SR taxonomy versions, subscription registrations, retention/legal-hold policy, signing/PKI configuration; **no** transactional self-approval; cannot author or attest ledger entries.

> **Platform RBAC mapping (RBAC Design v1.7).** The SR Custodian maps to the platform **Module-Admin tier** (entity-scoped, action access equivalent to HR Admin scoped to SR), administered via `cfg-rbac` / `cfg-rbac-role`. Elevated SR powers (legacy promotion, integrity verification) are **capability flags** (RBAC §4.3), grantable per user and audit-logged. All resolution is deny-by-default with **multi-role INTERSECTION (most restrictive)** and the **PII Protection Ceiling** on DOB/national-ID, enforced at runtime by P02 (Section 4.1).

### 3.2 Permission matrix

| Capability / Action | Employee | HR Officer | SR Custodian | Source Module | Pension Officer | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|
| View own SR timeline | ✔ (self) | — | — | — | — | — | — |
| View any SR timeline (scoped) | — | R (scoped) | R | — | R | R | — |
| Post event via ingestion contract | — | — | ✔ (manual) | ✔ (machine) | — | — | — |
| Attest entry (custodian) | — | — | ✔ | — | — | — | — |
| Initiate correction/corrigendum (maker) | — | ✔ | maker | system | — | — | — |
| Approve correction (checker) | — | — | ✔ | — | — | — | — |
| Add annotation | — | maker | ✔ | — | — | — | — |
| Raise dispute on own entry | ✔ (self) | — | — | — | — | — | — |
| Confirm periodic verification | ✔ (self) | — | finalise | — | — | — | — |
| Issue certified extract | request | request | ✔ (sign) | — | — | — | — |
| Verify certified extract (QR) | ✔ (public) | ✔ | ✔ | — | ✔ | ✔ | ✔ |
| View access log | — | — | R | — | — | R | R |
| Trigger integrity verification | — | — | ✔ | — | — | ✔ | — |
| View forensics view | — | — | R | — | — | R | — |
| Prepare legacy digitisation batch (maker) | — | ✔ | maker | — | — | — | — |
| Promote legacy batch to ledger (checker) | — | — | ✔ | — | — | — | — |
| Manage SR taxonomy version (draft) | — | — | propose | — | — | — | ✔ |
| Approve/publish taxonomy version | — | — | ✔ | — | — | — | — |
| Manage subscriptions | — | — | approve | — | — | — | ✔ |
| Manage retention / legal hold | — | — | propose | — | — | — | ✔ |

Legend: ✔ = perform; R = read; maker/checker = maker-checker split (maker ≠ checker enforced); — = no access. Every ✔ that writes to the statutory register writes to `audit_log` and (where manual) routes through the shared workflow engine.

---

## Section 4 — Shared Application Foundation

This module **inherits** the Shared Foundation §5 technical defaults verbatim and adds SR-specific posture.

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) for the SR timeline, custodian console, verification UI, and forensics view; REST API under `/api/v1/sr`; the ingestion contract is a versioned API (`/api/v1/sr/ingest`); PostgreSQL primary datastore for the ledger and sub-ledgers; M13 object storage for scans/signed PDFs. A background scheduler runs integrity sweeps, verification-cycle generation, and subscription delivery.
- **Auth:** OIDC/SSO + MFA for human roles; mutual-TLS + service JWT for source-module principals; RBAC + row-level scoping by `org_unit_id`. The ingestion principal holds only `sr.ingest.write`; it cannot read other employees' SR or issue extracts.
- **Cryptographic integrity:** ledger entries are hash-chained with **SHA-256** over a canonical, field-ordered serialization that includes `prev_event_hash`. The algorithm identifier and `ledger_version` are stored per row to allow future algorithm migration without rewriting history. Optional periodic **anchor**: the latest chain head per employee (or a Merkle root over all heads) may be timestamped/notarised to an external append-only store for independent verification.
- **Digital signing:** certified extracts, custodian attestations, and verification confirmations are signed via government PKI/HSM (qualified e-signature) where available; signature metadata (signer, certificate serial, timestamp, algorithm) is stored. Signed PDFs carry an embedded signature and a QR code resolving to the verification endpoint (FR-11).
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Inherited error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503). M12-specific codes are cataloged in Section 9.
- **Idempotency:** all ingestion writes carry a deterministic `Idempotency-Key`; the ledger dedupes on `(source_module, source_reference_id, source_event_version)`.
- **Observability:** structured logs with `requestId` + `correlation_id`; metrics (ingestion rate, integrity-verification status, attestation backlog, verification-cycle completion, extract issuance) exposed to M14.
- **Security/compliance:** OWASP ASVS; TLS 1.2+ in transit; AES-256 at rest; DPDP Act 2023 alignment (SR contains sensitive PII — disciplinary, health-linked leave — so access is least-privilege, fully logged, and minimised in payloads); statutory **permanent** retention.
- **NFR baseline:** P95 read/timeline API < 500ms; P95 ingestion write < 400ms; 99.9% uptime; RPO ≤ 15 min; RTO ≤ 4h; WCAG 2.1 AA for all UI.

### 4.1 Alignment with the PrimeSoft HRMS platform deliverables

This BRD is authored against the program's **build contract** (`SHARED_FOUNDATION.md`, government 14-module scheme where M12 = Digital SR) but is **harmonised with the delivered PrimeSoft HRMS platform** (Product Vision v2.6, Platform Specification v1.6, Foundation FS v1.7, RBAC Design v1.7, Document Management FS v1.3). Digital SR is a *consumer* of the platform's horizontal services (P01–P06, X.1–X.3); it does not re-implement them. Reconciliation note: PrimeSoft's commercial module numbering differs (no "M12" there); the SR is the statutory system-of-record layer that sits on the same platform, and where a name differs the platform's term governs build detail while this BRD owns SR requirements, rules, data model, and state machines.

**Multi-tenancy.** The platform is multi-tenant (`tenants`, with segment/geography defaults and per-tenant isolation; Platform Spec P04). Every SR entity carries `tenant_id`; all queries, jobs (X.1), and notifications (X.2) execute per-tenant in isolation. Cross-tenant operations are reserved to **Platform Super Admin** (provisioning + migration tooling only — never SR content). Segment/geography are immutable post-provisioning.

**Workflow engine (P01).** All manual, maker-checker SR writes start a platform workflow via `WorkflowEngine.startInstance({ workflow_code, subject_ref, context, initiator })` — idempotent advance/approve (one `workflow_actions` row per action), SLA timers with escalation, `ERR-DUP-INSTANCE` on duplicate. SR workflow codes: `WF-M12-CORRIGENDUM`, `WF-M12-ANNOTATION`, `WF-M12-IDENTITY-CHANGE` (DOB/name — dual sign-off), `WF-M12-LEGACY-PROMOTE`, `WF-M12-MANUAL-EVENT`.

**Authorization (P02).** Every SR endpoint calls `Authorization.check({ subject(roles,scope), action, resource_ref, fields })`. Resolution order: deny-by-default → role grant → **multi-role INTERSECTION (most restrictive)** → time-bound individual entitlement → capability flag → **PII Protection Ceiling (Tier-1 IDs: national-ID/Aadhaar, DOB — never lifted upward)** → data-scope filter (entity/org dimensions) → **field mask applied on serialization** (so an over-broad query still cannot leak a masked field). Out-of-scope records return a 404-style non-existence response, never a 403 leak. The `SR Custodian / Registrar` maps to the platform's Module-Admin tier pattern (entity-scoped, equivalent to HR Admin scoped to SR), administered through `cfg-rbac` / `cfg-rbac-role`; elevated SR capabilities (e.g., legacy-promotion, integrity-verify) are **capability flags** (RBAC §4.3), grantable and audit-logged.

**Audit & compliance (P05).** SR mutations write to the platform's immutable `audit_log` via **DB triggers** (100% capture, no API bypass; PII stored masked; **reading an SR/audit record is itself an audited action**); auth/permission events write to `security_audit_log`. Minimum 7-year retention, archivable to cold storage after 2 years but queryable within 24h. **The SR ledger's per-employee hash-chaining (FR-03) directly realises and extends the platform's proposed tamper-evidence mechanism (OPEN-PLAT-03: periodic hash-chaining with the chain head exported to WORM storage)** — applied here at the statutory-record level rather than only to audit partitions.

**Background jobs (X.1) / Foundation §4 index.** SR schedulers register with the platform runner as: `JOB-M12-INTEGRITY` (rolling chain verification, FR-04), `JOB-M12-VERIFY-GEN` (periodic/pre-retirement cycle generation, FR-08), `JOB-M12-SUBDELIVER` (subscription delivery, FR-13), `JOB-M12-RETENTION` (archival/disposal eligibility, FR-15). Each is idempotent (per-period run key), retries with exponential backoff, emits `JOB-FAIL → MSG-SYS-JOBFAIL` on terminal failure, runs per-tenant, and writes one audit row per run.

**API conventions (Foundation FS §1).** Success/error envelope is the platform standard `{ "error": { "code", "message", "field", "details" } }`; every request carries/echoes `X-Correlation-Id` (written to every audit and log line). Unsafe POSTs accept an `Idempotency-Key` (a repeat within 24h returns the original result). **Cursor pagination** (`?limit=` default 25, max 100, `cursor=`, response `next_cursor`) — offset paging is not used. Effective-dated mutations stage `effective_from` and are applied by a job, not written live. The **five canonical UI states** (empty / loading / error[ERR-* id + retry] / no-permission[hidden item; deep-link → `ERR-FORBIDDEN`, never a 404 leak] / partial-data[render authorised, mask the rest]) are inherited by every SR screen.

**Migration (P06).** Legacy digitisation (FR-14) and history load run on the platform's **ETL+V** framework (Extract → Validate → Transform → Load → Verify; idempotent, re-runnable). Every migrated SR row carries a permanent `legacy_source_id` (the platform's `darwinbox_source_id` analogue) as traceability + dedup key; runs are recorded in the `migration_runs` ledger; **three mandatory staging dry runs** gate production cutover; reconciliation tolerances are zero for statutory/dated facts; failed records are logged with source row + violated rule; the legacy source remains read-only ≥ 4 weeks post-go-live.

**Notifications (X.2).** SR notifications use platform message ids `MSG-M12-*`; **IN_APP + EMAIL fire in parallel** for approvals and **statutory notifications are mandatory and not user-suppressible**; delivery retries with exponential backoff up to 5 attempts + dead-letter queue; non-urgent IN_APP supports digest mode; quiet-hours/opt-out respected for non-statutory only.

**AI Chat Agent (P03).** The platform's document-grounded assistant may answer SR questions (e.g., "when was I confirmed?") **backend-only, PII-stripped before any model call, informational only** (never triggers a ledger write or workflow), governed by the same PII ceilings as P02; query/response content is not logged (metadata only).

---

## Section 5 — Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Ownership | Purpose |
|---|---|---|---|---|
| E1 | `employees` | Canonical (referenced) | M01 | Employee master; subject of SR entries |
| E2 | `org_units` | Canonical (referenced) | Shared | Org scoping for access control |
| E3 | `users` / `roles` / `tenants` | Canonical (referenced) | Shared / P04 | Identity, RBAC, and tenant scope |
| E4 | `audit_log` | Canonical (referenced) | Shared | Immutable operational audit trail |
| E5 | `notifications` | Canonical (referenced) | Shared | Outbound notifications |
| E6 | `documents` | Canonical (referenced) | M13 | Scans, order copies, signed extract PDFs |
| E7 | `workflow_instances` / `workflow_tasks` | Canonical (referenced) | Shared | Maker-checker for manual SR writes/batches |
| **E8** | **`service_register_events`** | **M12-OWNED (canonical ledger)** | M12 | Append-only, hash-chained statutory SR ledger |
| **E9** | **`sr_event_type`** | **M12-owned** | M12 | Versioned taxonomy of recordable life-event types + payload schema |
| **E10** | **`sr_corrections`** | **M12-owned** | M12 | Corrigendum / annotation / dispute / supersession records |
| **E11** | **`sr_attestations`** | **M12-owned** | M12 | Custodian attestations & employee verification signatures |
| **E12** | **`sr_verification_cycles`** | **M12-owned** | M12 | Periodic (5-yearly) service verification cycles & line items |
| **E13** | **`sr_ingestion_requests`** | **M12-owned** | M12 | Append-only provenance/idempotency log of ingestion calls |
| **E14** | **`sr_certified_extracts`** | **M12-owned** | M12 | Issued certified true copies (signed, QR-verifiable) |
| **E15** | **`sr_access_log`** | **M12-owned** | M12 | Append-only custody/access log (view/print/export) |
| **E16** | **`sr_subscriptions`** | **M12-owned** | M12 | Downstream-module event subscriptions + delivery log |
| **E17** | **`sr_legacy_digitisation_batch`** | **M12-owned** | M12 | Legacy paper service-book digitisation batch header |
| **E18** | **`sr_legacy_digitisation_record`** | **M12-owned** | M12 | A staged legacy entry within a digitisation batch |

> M12 introduces **11 owned entities** (E8–E18) and references **7 canonical entities** (E1–E7). `service_register_events` (E8) is the program's canonical SR ledger, **defined here**; all other modules reference (not redefine) it.

### 5.2 Entity field tables & sample data

#### E8 — `service_register_events` (THE statutory ledger — M12-owned, append-only, hash-chained)

| Field | Type | Null | Notes |
|---|---|---|---|
| `sr_event_id` | UUID PK | N | Immutable ledger entry id |
| `tenant_id` | UUID FK→tenants | N | Tenant scope (platform P04); chain is per `(tenant_id, employee_id)` |
| `employee_id` | UUID FK→employees | N | Subject of the event |
| `service_no` | varchar(32) | N | Denormalised business key (golden in M01) for resilience |
| `sequence_no` | bigint | N | Monotonic per `employee_id` — the "page number" in the service book |
| `event_type_code` | varchar(48) FK→sr_event_type | N | e.g., `APPOINTMENT`, `PROMOTION`, `LWP_SPELL` |
| `event_category` | enum | N | APPOINTMENT / CONFIRMATION / PROMOTION / TRANSFER / POSTING / PAY / INCREMENT / LEAVE / TRAINING / AWARD / PUNISHMENT / SUSPENSION / DEPUTATION / IDENTITY / QUALIFICATION / SEPARATION / OTHER |
| `event_title` | varchar(200) | N | Human-readable summary line |
| `event_description` | text | Y | Narrative detail |
| `event_date` | date | N | **Legal effective date** of the event (no time) |
| `recorded_at` | timestamptz | N | When the entry was committed to the ledger (UTC) |
| `source_module` | varchar(16) | N | Provenance: M01..M14, or `M12_MANUAL`, `M12_LEGACY` |
| `source_reference_id` | varchar(64) | Y | Originating order/transaction id in the source module |
| `source_event_version` | int | N | Source event schema/version (default 1) |
| `order_no` | varchar(64) | Y | Government order / notification number authorising the event |
| `order_date` | date | Y | Date of the order |
| `sanctioning_authority` | varchar(160) | Y | Authority that sanctioned the event |
| `payload` | jsonb | N | Structured, schema-validated event data (designation, pay scale, location, days, etc.) |
| `qualifying_service_impact` | enum | N | QUALIFYING / NON_QUALIFYING / PARTIAL / NOT_APPLICABLE |
| `entry_status` | enum | N | ACTIVE / SUPERSEDED / ANNOTATED |
| `attestation_status` | enum | N | UNATTESTED / ATTESTED / EMPLOYEE_VERIFIED / DISPUTED |
| `supersedes_event_id` | UUID FK→self | Y | If this is a corrigendum, the entry it supersedes |
| `superseded_by_event_id` | UUID FK→self | Y | Set on the original when superseded (only mutable system pointer; see integrity rules) |
| `prev_event_hash` | char(64) | N | SHA-256 of the previous entry in this employee's chain (`GENESIS` sentinel for first) |
| `entry_hash` | char(64) | N | SHA-256 over canonical content + `prev_event_hash` |
| `hash_algorithm` | varchar(16) | N | e.g., `SHA-256` |
| `ledger_version` | int | N | Schema/canonicalisation version for hash recomputation |
| `document_ids` | uuid[] | Y | Supporting documents (M13): order copy, scan |
| `ingestion_request_id` | UUID FK→sr_ingestion_requests | Y | The ingestion call that produced this entry |
| `is_legacy` | boolean | N | True if digitised from a paper service book |
| `legacy_batch_id` | UUID FK→sr_legacy_digitisation_batch | Y | Source digitisation batch |
| `legacy_source_id` | varchar(80) | Y | Permanent migration traceability + dedup key (platform `darwinbox_source_id` analogue, P06) |
| `posted_by` | varchar(64) | N | Service principal or custodian who posted |
| `created_at` | timestamptz | N | Append timestamp (UTC) — **no `updated_at`, no `is_deleted`** |
| `created_by` | varchar(64) | N | Actor |

*Append-only. Content fields are immutable after commit; the **only** permitted post-commit mutations are `superseded_by_event_id`, `entry_status`→SUPERSEDED/ANNOTATED, and `attestation_status` — each via controlled, audited system operations (see Integrity Rules §5.4). The `entry_hash` is computed over content excluding these mutable status pointers, so status changes never break the chain.*

Sample data:

| sr_event_id | service_no | sequence_no | event_type_code | event_date | source_module | entry_status | attestation_status | qualifying_service_impact |
|---|---|---|---|---|---|---|---|---|
| sr…0001 | GOV-100245 | 1 | APPOINTMENT | 2008-07-14 | M01 | ACTIVE | EMPLOYEE_VERIFIED | QUALIFYING |
| sr…0042 | GOV-100245 | 42 | PROMOTION | 2019-06-01 | M06 | SUPERSEDED | ATTESTED | QUALIFYING |
| sr…0043 | GOV-100245 | 43 | PROMOTION_CORRIGENDUM | 2019-06-01 | M12_MANUAL | ACTIVE | ATTESTED | QUALIFYING |

#### E9 — `sr_event_type` (taxonomy catalog — versioned)

| Field | Type | Null | Notes |
|---|---|---|---|
| `event_type_code` | varchar(48) PK (with version) | N | e.g., `PROMOTION`, `LWP_SPELL`, `DOB_CHANGE` |
| `version` | int | N | Monotonic per code |
| `event_category` | enum | N | Same enum as ledger `event_category` |
| `display_name` | varchar(120) | N | UI label |
| `description` | text | Y | Statutory meaning |
| `payload_schema` | jsonb | N | JSON Schema validating the ledger `payload` for this type |
| `requires_order_ref` | boolean | N | If true, `order_no`/`order_date` mandatory |
| `requires_document` | boolean | N | If true, at least one `document_id` mandatory |
| `default_qualifying_impact` | enum | N | QUALIFYING / NON_QUALIFYING / PARTIAL / NOT_APPLICABLE |
| `attestation_required` | boolean | N | Whether custodian attestation is mandatory |
| `allowed_source_modules` | varchar[] | N | Which modules may post this type (provenance allowlist) |
| `is_identity_event` | boolean | N | True for name/DOB/gender changes (extra controls) |
| `status` | enum | N | DRAFT / PUBLISHED / RETIRED |
| `effective_from` | date | N | |
| `effective_to` | date | Y | Null = open |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Audit fields (config entity) |

Sample data:

| event_type_code | version | event_category | requires_order_ref | default_qualifying_impact | status |
|---|---|---|---|---|---|
| APPOINTMENT | 2 | APPOINTMENT | Yes | QUALIFYING | PUBLISHED |
| LWP_SPELL | 2 | LEAVE | No | NON_QUALIFYING | PUBLISHED |
| DOB_CHANGE | 1 | IDENTITY | Yes | NOT_APPLICABLE | PUBLISHED |

#### E10 — `sr_corrections` (corrigendum / annotation / dispute — append-only)

| Field | Type | Null | Notes |
|---|---|---|---|
| `correction_id` | UUID PK | N | |
| `target_event_id` | UUID FK→service_register_events | N | Entry being corrected/annotated/disputed |
| `correction_type` | enum | N | CORRIGENDUM / ANNOTATION / DISPUTE / DISPUTE_RESOLUTION |
| `corrigendum_event_id` | UUID FK→service_register_events | Y | For CORRIGENDUM: the new superseding ledger entry |
| `reason_code` | varchar(48) | N | e.g., `DATA_ENTRY_ERROR`, `ORDER_REVISED`, `COURT_DIRECTION` |
| `reason_text` | text | N | Free-text justification |
| `requested_by` | varchar(64) | N | Maker (HR/custodian/employee for dispute) |
| `workflow_instance_id` | UUID FK→workflow_instances | Y | Maker-checker instance |
| `decision` | enum | N | PENDING / APPROVED / REJECTED |
| `decided_by` | varchar(64) | Y | Checker (SR Custodian) |
| `decided_at` | timestamptz | Y | |
| `supporting_document_ids` | uuid[] | Y | Court order, revised govt order, etc. |
| `created_at`/`created_by` | std | | Append-only (no soft delete) |

Sample data:

| correction_id | target_event_id | correction_type | reason_code | decision |
|---|---|---|---|---|
| cr…01 | sr…0042 | CORRIGENDUM | DATA_ENTRY_ERROR | APPROVED |
| cr…02 | sr…0011 | ANNOTATION | PROBATION_NOTE | APPROVED |
| cr…03 | sr…0030 | DISPUTE | EMPLOYEE_OBJECTION | PENDING |

#### E11 — `sr_attestations` (custodian attestation & employee verification signatures — append-only)

| Field | Type | Null | Notes |
|---|---|---|---|
| `attestation_id` | UUID PK | N | |
| `subject_type` | enum | N | EVENT / VERIFICATION_CYCLE / EXTRACT |
| `subject_id` | UUID | N | FK to the attested object |
| `employee_id` | UUID FK→employees | N | SR owner |
| `attestation_kind` | enum | N | CUSTODIAN_ATTEST / EMPLOYEE_VERIFY / EMPLOYEE_DISPUTE / EXTRACT_SIGN |
| `attested_by` | varchar(64) | N | Custodian or employee user id |
| `attested_role` | varchar(48) | N | SR_CUSTODIAN / EMPLOYEE |
| `signature_method` | enum | N | PKI_QUALIFIED / SERVER_SIGNED / OTP_CONFIRMED |
| `signature_value` | text | Y | Detached signature / signed digest |
| `certificate_serial` | varchar(80) | Y | PKI cert serial if PKI_QUALIFIED |
| `signed_digest` | char(64) | N | SHA-256 of the attested content snapshot |
| `attested_at` | timestamptz | N | |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| attestation_id | subject_type | attestation_kind | signature_method | attested_role |
|---|---|---|---|---|
| at…01 | EVENT | CUSTODIAN_ATTEST | PKI_QUALIFIED | SR_CUSTODIAN |
| at…02 | VERIFICATION_CYCLE | EMPLOYEE_VERIFY | OTP_CONFIRMED | EMPLOYEE |
| at…03 | EXTRACT | EXTRACT_SIGN | PKI_QUALIFIED | SR_CUSTODIAN |

#### E12 — `sr_verification_cycles` (periodic service verification)

| Field | Type | Null | Notes |
|---|---|---|---|
| `cycle_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `cycle_type` | enum | N | PERIODIC_5YR / PRE_RETIREMENT / AD_HOC |
| `period_from` | date | N | Service period under verification |
| `period_to` | date | N | |
| `due_date` | date | N | Statutory due date for completion |
| `status` | enum | N | OPEN / EMPLOYEE_REVIEW / DISPUTED / CUSTODIAN_REVIEW / COMPLETED / OVERDUE |
| `events_in_scope` | int | N | Count of ledger entries in the period |
| `events_confirmed` | int | N | Confirmed by employee |
| `events_disputed` | int | N | Disputed count |
| `employee_attestation_id` | UUID FK→sr_attestations | Y | Employee's signed confirmation |
| `custodian_attestation_id` | UUID FK→sr_attestations | Y | Custodian's finalisation |
| `completed_at` | timestamptz | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Cycle header is a managed entity |

Sample data:

| cycle_id | employee_id | cycle_type | period_from | period_to | status | events_in_scope |
|---|---|---|---|---|---|---|
| vc…01 | emp…aa | PERIODIC_5YR | 2014-04-01 | 2019-03-31 | COMPLETED | 38 |
| vc…02 | emp…bb | PERIODIC_5YR | 2019-04-01 | 2024-03-31 | EMPLOYEE_REVIEW | 41 |
| vc…03 | emp…cc | PRE_RETIREMENT | 1986-01-01 | 2026-06-30 | CUSTODIAN_REVIEW | 312 |

#### E13 — `sr_ingestion_requests` (provenance & idempotency log — append-only)

| Field | Type | Null | Notes |
|---|---|---|---|
| `ingestion_request_id` | UUID PK | N | |
| `idempotency_key` | varchar(128) | N | Deterministic from source; unique |
| `source_module` | varchar(16) | N | Provenance |
| `source_reference_id` | varchar(64) | N | Originating txn/order id |
| `source_event_version` | int | N | |
| `contract_version` | varchar(16) | N | Ingestion API version (e.g., `v1`) |
| `event_type_code` | varchar(48) | N | Requested SR event type |
| `employee_id` | UUID FK→employees | N | |
| `request_payload` | jsonb | N | Frozen request as received |
| `validation_result` | enum | N | ACCEPTED / REJECTED / DUPLICATE_NOOP |
| `rejection_code` | varchar(48) | Y | If REJECTED |
| `created_event_id` | UUID FK→service_register_events | Y | Ledger entry created (if ACCEPTED) |
| `received_at` | timestamptz | N | |
| `created_by` | varchar(64) | N | Source principal |

Sample data:

| ingestion_request_id | idempotency_key | source_module | event_type_code | validation_result | created_event_id |
|---|---|---|---|---|---|
| ig…01 | M06:ord-9912:v1 | M06 | PROMOTION | ACCEPTED | sr…0042 |
| ig…02 | M06:ord-9912:v1 | M06 | PROMOTION | DUPLICATE_NOOP | sr…0042 |
| ig…03 | M09:case-557:v1 | M09 | PUNISHMENT | REJECTED | — |

#### E14 — `sr_certified_extracts` (certified true copies — signed, QR-verifiable)

| Field | Type | Null | Notes |
|---|---|---|---|
| `extract_id` | UUID PK | N | |
| `extract_no` | varchar(40) | N | Human-readable certificate number (unique) |
| `employee_id` | UUID FK→employees | N | Subject |
| `scope` | enum | N | FULL_SR / DATE_RANGE / EVENT_CATEGORY / SINGLE_EVENT |
| `scope_params` | jsonb | Y | Date range / category filters applied |
| `event_count` | int | N | Number of entries included |
| `content_digest` | char(64) | N | SHA-256 of the rendered, ordered content (binds the copy) |
| `document_id` | UUID FK→documents | N | Signed PDF in M13 |
| `signature_attestation_id` | UUID FK→sr_attestations | N | Custodian signature |
| `qr_verification_token` | varchar(64) | N | Opaque token resolving to verification endpoint (unique) |
| `issued_to` | varchar(160) | N | Requestor / purpose |
| `purpose` | varchar(120) | Y | e.g., pension, loan, court |
| `valid_until` | date | Y | Optional validity window |
| `revoked` | boolean | N | Revocation flag (default false) |
| `revoked_reason` | text | Y | |
| `issued_at` | timestamptz | N | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | (Revocation is the only managed mutation) |

Sample data:

| extract_id | extract_no | scope | event_count | revoked | purpose |
|---|---|---|---|---|---|
| ex…01 | SR-EXT-2026-000451 | FULL_SR | 312 | false | Pension processing (M11) |
| ex…02 | SR-EXT-2026-000452 | DATE_RANGE | 38 | false | Loan verification |
| ex…03 | SR-EXT-2025-000119 | FULL_SR | 290 | true | Superseded — DOB corrigendum |

#### E15 — `sr_access_log` (custody / access — append-only)

| Field | Type | Null | Notes |
|---|---|---|---|
| `access_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | Whose SR was accessed |
| `accessed_by` | varchar(64) | N | Actor user id |
| `actor_role` | varchar(48) | N | Role at time of access |
| `action` | enum | N | VIEW_TIMELINE / VIEW_EVENT / PRINT / EXPORT / ISSUE_EXTRACT / VERIFY_INTEGRITY |
| `scope_detail` | jsonb | Y | Filters/event ids accessed |
| `purpose` | varchar(160) | Y | Stated reason (required for non-self access) |
| `ip_address` | varchar(64) | Y | |
| `request_id` | varchar(64) | N | Correlates to `audit_log` |
| `accessed_at` | timestamptz | N | |
| `created_at`/`created_by` | std | | Append-only |

Sample data:

| access_id | employee_id | actor_role | action | purpose |
|---|---|---|---|---|
| ac…01 | emp…aa | EMPLOYEE | VIEW_TIMELINE | Self |
| ac…02 | emp…aa | PENSION_OFFICER | ISSUE_EXTRACT | Pension processing |
| ac…03 | emp…aa | AUDITOR | VERIFY_INTEGRITY | Annual audit |

#### E16 — `sr_subscriptions` (downstream event subscriptions + delivery)

| Field | Type | Null | Notes |
|---|---|---|---|
| `subscription_id` | UUID PK | N | |
| `subscriber_module` | varchar(16) | N | M11 / M06 / M14 etc. |
| `event_categories` | varchar[] | N | Categories subscribed (e.g., PROMOTION, LEAVE) |
| `delivery_mode` | enum | N | WEBHOOK / PULL_FEED / MESSAGE_BUS |
| `endpoint_url` | varchar(300) | Y | For WEBHOOK |
| `secret_ref` | varchar(120) | Y | Env-ref to HMAC signing secret (never the secret) |
| `last_delivered_seq` | bigint | Y | Cursor for at-least-once delivery |
| `status` | enum | N | ACTIVE / PAUSED / RETIRED |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Config entity |

Sample data:

| subscription_id | subscriber_module | event_categories | delivery_mode | status |
|---|---|---|---|---|
| su…01 | M11 | {PROMOTION,PAY,INCREMENT,LEAVE,SUSPENSION,SEPARATION} | PULL_FEED | ACTIVE |
| su…02 | M06 | {PROMOTION,TRANSFER,POSTING} | WEBHOOK | ACTIVE |
| su…03 | M14 | {ALL} | MESSAGE_BUS | ACTIVE |

#### E17 — `sr_legacy_digitisation_batch` (digitisation batch header)

| Field | Type | Null | Notes |
|---|---|---|---|
| `batch_id` | UUID PK | N | |
| `batch_no` | varchar(40) | N | Human-readable (unique) |
| `org_unit_id` | UUID FK→org_units | N | Office whose books are digitised |
| `cohort_description` | varchar(200) | N | e.g., "Retired before 2010, Office X" |
| `record_count` | int | N | Records staged |
| `status` | enum | N | CREATED / SCANNING / DATA_ENTRY / DUAL_VERIFICATION / RECONCILIATION / READY_FOR_PROMOTION / PROMOTED / REJECTED |
| `scan_document_ids` | uuid[] | Y | Master scan bundles (M13) |
| `verified_count` | int | N | Dual-verified records |
| `discrepancy_count` | int | N | Reconciliation discrepancies |
| `workflow_instance_id` | UUID FK→workflow_instances | Y | Promotion approval |
| `promoted_at` | timestamptz | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | Config/process entity |

Sample data:

| batch_id | batch_no | org_unit_id | record_count | status | discrepancy_count |
|---|---|---|---|---|---|
| lb…01 | LEG-2026-OFC12-001 | ou…12 | 240 | PROMOTED | 0 |
| lb…02 | LEG-2026-OFC12-002 | ou…12 | 180 | RECONCILIATION | 7 |
| lb…03 | LEG-2026-OFC07-001 | ou…07 | 96 | DATA_ENTRY | 0 |

#### E18 — `sr_legacy_digitisation_record` (staged legacy entry)

| Field | Type | Null | Notes |
|---|---|---|---|
| `record_id` | UUID PK | N | |
| `batch_id` | UUID FK→sr_legacy_digitisation_batch | N | |
| `employee_id` | UUID FK→employees | Y | Resolved master match (null until matched) |
| `service_no` | varchar(32) | Y | As read from paper |
| `page_ref` | varchar(40) | Y | Original service-book page reference |
| `event_type_code` | varchar(48) | Y | Mapped SR type |
| `event_date` | date | Y | As read |
| `transcribed_payload` | jsonb | N | Data-entered fields |
| `entry_operator` | varchar(64) | Y | Data-entry user (maker) |
| `verifier` | varchar(64) | Y | Dual-verification user (checker) |
| `scan_document_id` | UUID FK→documents | Y | Page scan |
| `match_status` | enum | N | UNMATCHED / MATCHED / AMBIGUOUS |
| `verification_status` | enum | N | PENDING / VERIFIED / DISCREPANCY |
| `discrepancy_note` | text | Y | |
| `promoted_event_id` | UUID FK→service_register_events | Y | Ledger entry created on promotion |
| `legacy_source_id` | varchar(80) | Y | Permanent ETL+V traceability + dedup key (P06 `darwinbox_source_id` analogue) |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | std | | |

Sample data:

| record_id | batch_id | service_no | event_type_code | match_status | verification_status |
|---|---|---|---|---|---|
| lr…01 | lb…01 | GOV-088120 | APPOINTMENT | MATCHED | VERIFIED |
| lr…02 | lb…01 | GOV-088120 | PROMOTION | MATCHED | VERIFIED |
| lr…03 | lb…02 | GOV-077431 | INCREMENT | AMBIGUOUS | DISCREPANCY |

### 5.3 Relationship map

```
employees (M01) 1───∞ service_register_events (E8)            [subject of every entry]
employees (M01) 1───∞ sr_verification_cycles (E12)
service_register_events 1───∞ sr_corrections (E10)            [target_event_id]
service_register_events 1───0..1 service_register_events       [supersedes / superseded_by — corrigendum chain]
service_register_events ∞───1 sr_event_type (E9)              [event_type_code + version]
service_register_events ∞───0..1 sr_ingestion_requests (E13)  [provenance]
service_register_events ∞───0..1 sr_legacy_digitisation_batch (E17)
service_register_events 1───∞ sr_attestations (E11)           [subject EVENT]
sr_verification_cycles  1───∞ service_register_events          [events_in_scope by period]
sr_verification_cycles  1───2  sr_attestations                 [employee + custodian]
sr_certified_extracts   ∞───1 employees ; 1───1 documents (M13); 1───1 sr_attestations [signature]
sr_access_log           ∞───1 employees                        [custody trail]
sr_subscriptions        — consumes service_register_events change feed
sr_legacy_digitisation_batch 1───∞ sr_legacy_digitisation_record (E18)
service_register_events ∞───∞ documents (M13)                  [document_ids array]
every write ───∞ audit_log (shared) ; notifications (shared)
```

The **hash chain** is a self-referential structure on E8: per `employee_id`, ordered by `sequence_no`, each row's `prev_event_hash = previous row.entry_hash`, forming a tamper-evident linked list (genesis sentinel for `sequence_no = 1`).

### 5.4 Ownership / reuse matrix

| Entity | Owner | Writers | Readers |
|---|---|---|---|
| `employees` | M01 | M01 | M12 (read), all |
| `documents` | M13 | M13, M12 (refs) | All |
| `audit_log` | Shared | All (append) | Auditor, Custodian |
| `workflow_instances`/`tasks` | Shared | M12 (manual writes) | M12, approvers |
| `service_register_events` (E8) | **M12** | **M12 ingestion only** (on behalf of source modules + manual + legacy) | M01..M14 (read via API), Employee (self), Auditor |
| `sr_event_type` (E9) | M12 | Sys Admin (draft), Custodian (publish) | All ingestion validation |
| `sr_corrections` (E10) | M12 | HR/Custodian (maker), Custodian (checker), Employee (dispute) | Custodian, Auditor, Employee |
| `sr_attestations` (E11) | M12 | Custodian, Employee | Auditor, Employee |
| `sr_verification_cycles` (E12) | M12 | M12 (scheduler), Employee, Custodian | Employee, Custodian, Auditor |
| `sr_ingestion_requests` (E13) | M12 | M12 ingestion endpoint | Custodian, Auditor |
| `sr_certified_extracts` (E14) | M12 | Custodian | Employee, Pension Officer, public (QR) |
| `sr_access_log` (E15) | M12 | M12 (all read/print paths) | Custodian, Auditor |
| `sr_subscriptions` (E16) | M12 | Sys Admin, Custodian (approve) | M11, M06, M14 |
| `sr_legacy_digitisation_batch/record` (E17/E18) | M12 | HR (maker), Custodian (promote) | Custodian, Auditor |

### 5.5 Enum & reference catalog

| Enum | Values |
|---|---|
| `event_category` | APPOINTMENT, CONFIRMATION, PROMOTION, TRANSFER, POSTING, PAY, INCREMENT, LEAVE, TRAINING, AWARD, PUNISHMENT, SUSPENSION, DEPUTATION, IDENTITY, QUALIFICATION, SEPARATION, OTHER |
| `entry_status` | ACTIVE, SUPERSEDED, ANNOTATED |
| `attestation_status` | UNATTESTED, ATTESTED, EMPLOYEE_VERIFIED, DISPUTED |
| `qualifying_service_impact` | QUALIFYING, NON_QUALIFYING, PARTIAL, NOT_APPLICABLE |
| `correction_type` | CORRIGENDUM, ANNOTATION, DISPUTE, DISPUTE_RESOLUTION |
| `correction.decision` | PENDING, APPROVED, REJECTED |
| `attestation_kind` | CUSTODIAN_ATTEST, EMPLOYEE_VERIFY, EMPLOYEE_DISPUTE, EXTRACT_SIGN |
| `signature_method` | PKI_QUALIFIED, SERVER_SIGNED, OTP_CONFIRMED |
| `cycle_type` | PERIODIC_5YR, PRE_RETIREMENT, AD_HOC |
| `cycle.status` | OPEN, EMPLOYEE_REVIEW, DISPUTED, CUSTODIAN_REVIEW, COMPLETED, OVERDUE |
| `ingestion.validation_result` | ACCEPTED, REJECTED, DUPLICATE_NOOP |
| `extract.scope` | FULL_SR, DATE_RANGE, EVENT_CATEGORY, SINGLE_EVENT |
| `access.action` | VIEW_TIMELINE, VIEW_EVENT, PRINT, EXPORT, ISSUE_EXTRACT, VERIFY_INTEGRITY |
| `subscription.delivery_mode` | WEBHOOK, PULL_FEED, MESSAGE_BUS |
| `subscription.status` | ACTIVE, PAUSED, RETIRED |
| `batch.status` | CREATED, SCANNING, DATA_ENTRY, DUAL_VERIFICATION, RECONCILIATION, READY_FOR_PROMOTION, PROMOTED, REJECTED |
| `record.match_status` | UNMATCHED, MATCHED, AMBIGUOUS |
| `record.verification_status` | PENDING, VERIFIED, DISCREPANCY |
| `event_type.status` | DRAFT, PUBLISHED, RETIRED |
| `source_module` | M01..M14, M12_MANUAL, M12_LEGACY |

### 5.6 Data integrity rules

1. **Append-only ledger.** No `UPDATE` that changes content fields of `service_register_events`; no `DELETE`. Enforced by DB trigger/row-level rule and application policy. Only `superseded_by_event_id`, `entry_status`, and `attestation_status` may transition via controlled operations, and these fields are **excluded** from the hashed canonical content.
2. **Monotonic sequence.** `sequence_no` is unique and gap-free per `(tenant_id, employee_id)`, assigned under a per-employee advisory lock at append time; the hash chain is scoped to the same key.
3. **Hash chain.** `prev_event_hash` of entry *n* equals `entry_hash` of entry *n-1* for the same employee (`GENESIS` for *n=1*). `entry_hash = SHA-256(canonical(content) || prev_event_hash)`. Any recomputed mismatch is a tamper alarm.
4. **Idempotent ingestion.** `(source_module, source_reference_id, source_event_version)` is unique; a repeat returns the original `sr_event_id` (`DUPLICATE_NOOP`).
5. **Payload validity.** `payload` must validate against the `payload_schema` of the resolved `sr_event_type` version, else `SR_PAYLOAD_INVALID`.
6. **Provenance allowlist.** `source_module` must be in the event type's `allowed_source_modules`, else `SR_SOURCE_NOT_ALLOWED`.
7. **Order & document mandates.** If the event type sets `requires_order_ref`/`requires_document`, those fields/links must be present.
8. **Correction discipline.** A CORRIGENDUM creates a new ACTIVE entry, sets the original's `entry_status=SUPERSEDED` and `superseded_by_event_id`; the original remains readable forever. An entry may be superseded at most once (chain forward via successive corrigenda).
9. **Identity events.** IDENTITY-category events (name/DOB/gender) require `order_no`, a supporting document, and maker-checker; DOB changes additionally require dual custodian sign-off.
10. **Attestation gating.** An entry with `attestation_required=true` cannot be included in a COMPLETED verification cycle or a FULL_SR certified extract unless `attestation_status ∈ {ATTESTED, EMPLOYEE_VERIFIED}` (or explicitly annotated as legacy-unverifiable).
11. **Extract binding.** `content_digest` binds the exact rendered content; revocation does not delete, it flags `revoked=true`.
12. **Access logging.** Every read/print/export/extract path writes `sr_access_log`; non-self access requires a stated `purpose`.
13. **Referential integrity.** `employee_id` must exist in M01; `document_ids` must resolve in M13; FK constraints enforced.
14. **Permanent retention.** No SR ledger row, attestation, correction, or access-log row is ever purged; archival moves cold partitions but preserves rows and hashes.

---

## Section 6 — Functional Requirements

> Each FR follows: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table.

### FR-01 — SR event taxonomy & payload schemas (governed, versioned)

- **ID:** FR-01
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (draft), SR Custodian (publish)
- **User Story:** *As an SR Custodian, I want a versioned, effective-dated catalog of every recordable service event type with its required payload schema and provenance rules, so that ingestion is deterministic, validated, and changeable without code deployment.*

**Description.** The taxonomy (`sr_event_type`) defines each recordable life event — appointment, confirmation, promotion, transfer, posting, pay-fixation, increment, leave spell, training, award, punishment, suspension, deputation, name/DOB/gender change, qualification, reversion, retirement, death — with a JSON-Schema `payload_schema`, an `allowed_source_modules` allowlist, order/document mandates, default qualifying-service impact, and attestation requirement. Versions are immutable once PUBLISHED; changes create a new version. Maker (Sys Admin) drafts; checker (SR Custodian) publishes.

**Acceptance Criteria.**
1. A DRAFT type can be created/edited/deleted; a PUBLISHED type cannot be edited (only superseded by a new version or RETIRED).
2. Publishing requires SR Custodian approval (maker ≠ checker) and writes to `audit_log`.
3. No two PUBLISHED versions of the same `event_type_code` may have overlapping effective ranges (`SR_TYPE_OVERLAP`).
4. The catalog covers all 17 `event_category` values with at least one published type each at launch.
5. Ingestion resolves the type version effective at the event's `event_date`; if none, ingestion rejects with `SR_TYPE_NOT_FOUND`.

**Business Rules.**
- BR-01.1 `payload_schema` is valid JSON Schema; ingestion validates `payload` against it.
- BR-01.2 IDENTITY-category types set `is_identity_event=true`, forcing extra controls (FR-05/FR-06).
- BR-01.3 `default_qualifying_impact` seeds the ledger entry's `qualifying_service_impact` unless the source overrides per a published rule.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_event_type` | Create/version/publish (write) |
| `audit_log` | Append publish/retire |
| `workflow_instances` | Maker-checker publish |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/event-types` | Create DRAFT |
| `POST /api/v1/sr/event-types/{code}/publish` | Publish (checker) |
| `GET /api/v1/sr/event-types` | List/resolve (paginated) |

**UI Behavior Notes.** Custodian console "Taxonomy" tab: list with status badges, schema editor (JSON with validation), effective-date pickers, publish action gated to custodian. Diff view between versions.

**Edge Cases.**
- Editing a PUBLISHED type → blocked; offer "create new version".
- Overlapping effective ranges → `SR_TYPE_OVERLAP` at publish.
- Retiring a type still referenced by historical entries → allowed; existing entries keep their version pointer.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `EventTypeService`, `JsonSchemaValidator`, `EventTypeRepository` |
| Backend flow | Draft → maker submit → custodian approve → publish → effective-range check → activate |
| Data operations | INSERT/UPDATE on DRAFT; INSERT new version on publish; SELECT effective version |
| Validation | Valid JSON Schema; non-overlapping ranges; category coverage |
| Authorization | `sr.taxonomy.draft` (admin), `sr.taxonomy.publish` (custodian) |
| State changes & side effects | DRAFT→PUBLISHED→RETIRED; audit_log append |
| Failure handling | Reject overlap/invalid-schema; preserve DRAFT on failure |
| Dependencies | Shared workflow engine |
| Test guidance | Unit: schema validation; integration: publish maker-checker; property: no overlap invariant |

---

### FR-02 — Governed ingestion contract / API (idempotent, versioned, validated, provenance-stamped)

- **ID:** FR-02
- **Module:** M12-SR
- **Primary Role(s):** Source Module (service principal), SR Custodian (manual ingestion)
- **User Story:** *As a source module (e.g., M06 Promotion), I want a single, versioned, idempotent API to post a service event with provenance and supporting references, so that the statutory fact is recorded exactly once, validated, and traceable to its origin.*

**Description.** The ingestion contract (`POST /api/v1/sr/ingest`, contract-versioned) is the **only** write path to the ledger. It accepts `{source_module, source_reference_id, source_event_version, event_type_code, employee_id, event_date, order_no?, order_date?, sanctioning_authority?, payload, document_ids?, qualifying_service_impact?}` plus an `Idempotency-Key` header. It validates provenance allowlist, payload schema, order/document mandates, and employee existence, then delegates to the append engine (FR-03). Every call is recorded in `sr_ingestion_requests` (ACCEPTED / REJECTED / DUPLICATE_NOOP).

**Acceptance Criteria.**
1. A first-time valid request creates exactly one ledger entry and returns its `sr_event_id`.
2. A repeat with the same `(source_module, source_reference_id, source_event_version)` returns the original `sr_event_id` and records `DUPLICATE_NOOP` — never a second entry.
3. Invalid payload/provenance/missing-mandate rejects with a specific M12 error code and records REJECTED; no ledger entry is created.
4. Every call (accepted, rejected, duplicate) is persisted in `sr_ingestion_requests` with the frozen `request_payload`.
5. Only principals with `sr.ingest.write` may call; module principals cannot read other employees' SR.

**Business Rules.**
- BR-02.1 `source_module` must be in the resolved event type's `allowed_source_modules` (`SR_SOURCE_NOT_ALLOWED`).
- BR-02.2 Manual custodian ingestion uses `source_module=M12_MANUAL` and additionally routes through maker-checker.
- BR-02.3 `event_date` may be in the past (back-dated statutory events) but not in the future beyond a configurable tolerance (`SR_FUTURE_DATE`).
- BR-02.4 The contract is versioned; deprecated versions remain callable for a published sunset window.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_ingestion_requests` | Insert (write) |
| `service_register_events` | Append via FR-03 |
| `sr_event_type` | Validate type/schema |
| `employees` (M01) | Existence check |
| `documents` (M13) | Reference validation |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/ingest` | Post an SR event (idempotent) |
| `GET /api/v1/sr/ingest/{ingestion_request_id}` | Inspect a prior ingestion outcome |

**UI Behavior Notes.** No end-user UI for machine ingestion. Manual ingestion is a custodian console form ("Record service event") with type-driven dynamic fields generated from `payload_schema`, order/document fields, and a maker-checker submit.

**Edge Cases.**
- Duplicate emission from an at-least-once source → DUPLICATE_NOOP.
- Event type not found for `event_date` → `SR_TYPE_NOT_FOUND`.
- `employee_id` not in M01 → `SR_EMPLOYEE_NOT_FOUND`.
- Partial outage of M01/M13 reference checks → `UPSTREAM_UNAVAILABLE`, request not recorded as ACCEPTED, source retries with same key.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IngestionController`, `IngestionValidator`, `ProvenanceGuard`, `AppendEngine` (FR-03), `IngestionRepository` |
| Backend flow | Auth → resolve type version → validate payload/provenance/mandates → existence checks → dedupe → append → record ingestion |
| Data operations | INSERT `sr_ingestion_requests`; INSERT `service_register_events` (via FR-03) within one tx |
| Validation | Schema, allowlist, order/doc mandates, future-date tolerance, employee/document existence |
| Authorization | `sr.ingest.write`; M12_MANUAL also requires maker-checker |
| State changes & side effects | New ledger entry; ingestion record; subscription feed event (FR-13); audit_log |
| Failure handling | Validation→REJECTED (no entry); upstream error→503 (no record, retry-safe); unique violation→DUPLICATE_NOOP |
| Dependencies | FR-01 taxonomy, FR-03 append engine, M01, M13 |
| Test guidance | Idempotency under concurrent identical requests; rejection paths per code; provenance allowlist; back-dating tolerance |

---

### FR-03 — Append-only hash-chained ledger write

- **ID:** FR-03
- **Module:** M12-SR
- **Primary Role(s):** System (append engine), SR Custodian (observe)
- **User Story:** *As the HRMS, when an event is ingested, I want it appended to the employee's immutable, hash-chained ledger with a gap-free sequence and tamper-evident linkage, so that the record can never be silently altered or reordered.*

**Description.** The append engine assigns the next `sequence_no` under a per-employee lock, computes the canonical serialization of content, sets `prev_event_hash` to the prior head's `entry_hash` (or `GENESIS`), computes `entry_hash = SHA-256(canonical || prev_event_hash)`, and commits the row. The ledger is strictly append-only; content is immutable post-commit.

**Acceptance Criteria.**
1. `sequence_no` is unique and gap-free per employee; concurrent appends serialise correctly (no duplicate sequence).
2. `prev_event_hash` of each entry equals the previous entry's `entry_hash`; the first entry uses `GENESIS`.
3. `entry_hash` is reproducible from stored content + algorithm + ledger_version.
4. No code path can UPDATE content fields or DELETE a row (enforced by DB rule + app policy).
5. The hashed canonical content excludes mutable status pointers (`superseded_by_event_id`, `entry_status`, `attestation_status`) so status changes never break the chain.

**Business Rules.**
- BR-03.1 Canonicalisation is deterministic (sorted keys, normalised dates/UTC, fixed numeric formatting) and versioned via `ledger_version`.
- BR-03.2 `hash_algorithm` stored per row to permit future migration (re-anchor, never rewrite).
- BR-03.3 Appends happen in the same DB transaction as the ingestion record (FR-02).

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` | Append (write) |
| `sr_ingestion_requests` | Link `created_event_id` |

**API References.**

| API | Purpose |
|---|---|
| (internal) `AppendEngine.append()` | Invoked by FR-02/FR-05/FR-14 |

**UI Behavior Notes.** None directly; the resulting entry surfaces in the timeline (FR-09) with an integrity badge.

**Edge Cases.**
- Concurrent appends for the same employee → advisory lock serialises; no sequence collision.
- Hash collision (practically impossible for SHA-256) → not handled beyond algorithm choice; documented.
- Back-dated event inserted "in the past" → still appended at the **end** of the chain (ledger order is recording order, not event_date order); timeline sorts by `event_date` for display but integrity follows `sequence_no`.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AppendEngine`, `Canonicalizer`, `HashChainService`, `LedgerRepository` |
| Backend flow | Lock(employee) → next seq → fetch prior head hash → canonicalize → hash → INSERT → release |
| Data operations | SELECT max(sequence_no) FOR UPDATE; INSERT row |
| Validation | Required fields present; FK valid; hash computed |
| Authorization | Internal only; callers already authorised |
| State changes & side effects | New ACTIVE entry; chain extended; integrity metric updated |
| Failure handling | Tx rollback discards entry + ingestion record; lock timeout → 503 retry |
| Dependencies | PostgreSQL advisory locks; FR-02 |
| Test guidance | Concurrency: 1000 parallel appends → gap-free seq; chain continuity property; immutability (UPDATE/DELETE blocked) |

---

### FR-04 — Ledger integrity verification (tamper-evidence)

- **ID:** FR-04
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian, Auditor, System (scheduler)
- **User Story:** *As an Auditor, I want to recompute and verify the hash chain for any employee (or the whole register) on demand and on schedule, so that any tampering or corruption is detected and pinpointed immediately.*

**Description.** A verification routine recomputes `entry_hash` and validates `prev_event_hash` linkage across an employee's chain (or a sampled/full population), reporting PASS or the exact `sequence_no` where divergence occurs. Scheduled sweeps run nightly over a rotating population; results feed metrics and alerts. Optional external anchor comparison validates chain heads against a notarised store.

**Acceptance Criteria.**
1. On-demand verification of an employee returns PASS with verified entry count, or FAIL with the first divergent `sequence_no` and expected vs. stored hash.
2. Scheduled sweeps cover 100% of the register over a configurable rolling window (e.g., 30 days) and alert on any FAIL.
3. Verification is read-only; it never mutates the ledger.
4. A FAIL raises a high-severity alert to Custodian + Auditor and opens a forensics case (FR-16).
5. Results are recorded with timestamp, scope, verifier, and outcome.

**Business Rules.**
- BR-04.1 Verification uses the stored `hash_algorithm`/`ledger_version` per row for correct recomputation across migrations.
- BR-04.2 If an external anchor exists, head-hash mismatch is also a FAIL.
- BR-04.3 Auditor and Custodian may trigger; no one may suppress a FAIL.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` | Read (recompute) |
| `audit_log` | Append verification + any FAIL |
| `notifications` | Alert on FAIL |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/integrity/verify` | Verify employee/scope |
| `GET /api/v1/sr/integrity/runs` | List verification runs |

**UI Behavior Notes.** Forensics view shows a green/red integrity banner per employee; FAIL drills to the divergent entry with expected/stored hashes side by side.

**Edge Cases.**
- Algorithm migration in progress → mixed `hash_algorithm` rows verified each with its own algorithm.
- Legacy entries with a different ledger_version → verified under that version's canonicalisation.
- Anchor store unavailable → chain still verified internally; anchor check marked SKIPPED, not FAIL.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `IntegrityVerifier`, `AnchorClient`, `AlertService` |
| Backend flow | Load chain ordered by seq → recompute each hash → compare → first-divergence report → alert if FAIL |
| Data operations | SELECT chain; INSERT audit; INSERT notification on FAIL |
| Validation | Recompute equality; linkage continuity; anchor match |
| Authorization | `sr.integrity.verify` (custodian/auditor) |
| State changes & side effects | None to ledger; metric + possible alert + forensics case |
| Failure handling | Partial sweep failure → resume cursor; FAIL escalation cannot be suppressed |
| Dependencies | FR-03 hashing; optional anchor store |
| Test guidance | Inject tampered row → FAIL at correct seq; full-population sweep performance; migration mixed-algorithm correctness |

---

### FR-05 — Correction handling (corrigendum / supersession — never delete)

- **ID:** FR-05
- **Module:** M12-SR
- **Primary Role(s):** HR Officer (maker), SR Custodian (checker)
- **User Story:** *As an SR Custodian, when an entry is wrong (data-entry error, revised order, court direction), I want to issue a corrigendum that supersedes the original while preserving it forever, so that the record is corrected without ever destroying history.*

**Description.** A correction never edits or deletes the original. A CORRIGENDUM creates a **new** ledger entry (via FR-03) capturing the corrected facts, links it through `sr_corrections` and the original's `supersedes/superseded_by` pointers, and sets the original `entry_status=SUPERSEDED`. Maker proposes with a `reason_code` + justification + supporting documents; SR Custodian approves (maker ≠ checker). The original remains visible and verifiable.

**Acceptance Criteria.**
1. Issuing a corrigendum creates a new ACTIVE ledger entry and sets the original to SUPERSEDED with `superseded_by_event_id` populated.
2. The original entry remains readable, hash-valid, and is never deleted or content-edited.
3. Correction requires maker-checker; the maker cannot self-approve.
4. A `reason_code`, free-text reason, and (for IDENTITY events) a supporting document are mandatory.
5. The corrigendum's `payload` is schema-validated against the event type, exactly as ingestion.

**Business Rules.**
- BR-05.1 An entry may be superseded at most once; further correction supersedes the latest ACTIVE entry in the chain.
- BR-05.2 DOB/name corrigenda (IDENTITY) require dual custodian sign-off and a govt order/court reference; values are validated with the platform validation library (`VAL-DOB` for DOB, `VAL-AADHAAR`/`VAL-PAN` for national-ID linkage) and are subject to the PII Protection Ceiling (P02). Routed through `WF-M12-IDENTITY-CHANGE`.
- BR-05.3 Correcting a qualifying-service impact re-emits the event to subscribers (FR-13) so pension (M11) re-reads.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_corrections` | Insert correction record |
| `service_register_events` | Append corrigendum; flag original SUPERSEDED |
| `workflow_instances` | Maker-checker |
| `documents` (M13) | Supporting evidence |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/events/{id}/corrigendum` | Propose corrigendum (maker) |
| `POST /api/v1/sr/corrections/{id}/approve` | Approve (checker) |

**UI Behavior Notes.** Timeline entry shows a "Superseded" badge linking to its corrigendum; corrigendum shows "Corrects entry #N". Correction form pre-fills original values for edit and requires reason/evidence.

**Edge Cases.**
- Attempt to correct an already-SUPERSEDED entry → redirect to its latest ACTIVE successor.
- Reject at checker → no ledger change; correction record marked REJECTED.
- Corrigendum on a legacy (digitised) entry → allowed; provenance marked.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `CorrectionService`, `AppendEngine`, `WorkflowAdapter` → P01 `WorkflowEngine.startInstance` (`WF-M12-CORRIGENDUM`; `WF-M12-IDENTITY-CHANGE` for DOB/name) |
| Backend flow | Maker submit → P01 workflow (idempotent advance) → checker approve → append corrigendum → flag original (status pointer only) → notify subscribers |
| Data operations | INSERT `sr_corrections`; INSERT corrigendum entry; UPDATE original status pointer (non-hashed) |
| Validation | Reason/evidence present; payload schema; single-supersession; identity dual sign-off |
| Authorization | maker `sr.correction.create`; checker `sr.correction.approve` (custodian) |
| State changes & side effects | Original→SUPERSEDED; new ACTIVE entry; subscription re-emit; audit_log |
| Failure handling | Reject → no ledger mutation; concurrency on original → re-resolve latest active |
| Dependencies | FR-03, workflow engine, FR-13 |
| Test guidance | Supersession chain correctness; original immutability; identity dual sign-off enforced; reject path |

---

### FR-06 — Annotation & dispute entries

- **ID:** FR-06
- **Module:** M12-SR
- **Primary Role(s):** Employee (dispute), HR Officer / SR Custodian (annotation/resolution)
- **User Story:** *As an employee, I want to raise a dispute against an entry I believe is wrong, and as a custodian I want to annotate entries with statutory notes, so that context and objections are recorded without altering the underlying fact.*

**Description.** Annotations attach statutory or contextual notes to an entry without changing it (`entry_status=ANNOTATED`). Disputes let an employee formally object; the custodian resolves with DISPUTE_RESOLUTION (which may trigger a corrigendum via FR-05 or uphold the entry). All are append-only `sr_corrections` rows; the entry's `attestation_status` may become DISPUTED.

**Acceptance Criteria.**
1. An employee can raise a DISPUTE on any ACTIVE entry of their own SR with a reason; entry `attestation_status` → DISPUTED.
2. A custodian can add an ANNOTATION to any entry; entry `entry_status` → ANNOTATED (entry content unchanged).
3. Dispute resolution records DISPUTE_RESOLUTION with outcome (UPHELD / CORRIGENDUM_ISSUED) and notifies the employee.
4. Annotations and disputes never modify the original entry content or hash.
5. Open disputes are surfaced to the custodian queue and counted in the verification cycle (FR-08).

**Business Rules.**
- BR-06.1 An entry may carry multiple annotations and a dispute history; all preserved.
- BR-06.2 A DISPUTED entry cannot be marked EMPLOYEE_VERIFIED until resolved.
- BR-06.3 Dispute resolution by corrigendum reuses FR-05.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_corrections` | Insert annotation/dispute/resolution |
| `service_register_events` | Status pointer (ANNOTATED/DISPUTED) |
| `notifications` | Notify employee/custodian |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/events/{id}/dispute` | Employee raises dispute |
| `POST /api/v1/sr/events/{id}/annotate` | Custodian annotates |
| `POST /api/v1/sr/disputes/{id}/resolve` | Custodian resolves |

**UI Behavior Notes.** Timeline shows annotation chips and a "Disputed" badge; employee self-service "Raise objection" action; custodian dispute queue with resolve dialog.

**Edge Cases.**
- Employee disputes an already-superseded entry → blocked; point to active successor.
- Resolution requiring corrigendum → spawns FR-05 workflow.
- Annotation by non-custodian → forbidden.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AnnotationService`, `DisputeService`, `CorrectionService` |
| Backend flow | Raise/annotate → status pointer update → notify → (resolution) uphold or corrigendum |
| Data operations | INSERT `sr_corrections`; UPDATE status pointer (non-hashed) |
| Validation | Self-only dispute; active-entry only; reason mandatory |
| Authorization | Employee self `sr.dispute.create`; custodian `sr.annotate`, `sr.dispute.resolve` |
| State changes & side effects | Status pointer; notifications; possible FR-05 spawn |
| Failure handling | Invalid target → 409; resolution race → idempotent |
| Dependencies | FR-05, notifications |
| Test guidance | Dispute lifecycle; annotation immutability; verified-block-while-disputed |

---

### FR-07 — Custodian attestation of entries

- **ID:** FR-07
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian
- **User Story:** *As an SR Custodian, I want to attest entries (individually or in batches) with my digital signature, so that the register carries proof that the responsible authority has verified each recorded fact.*

**Description.** Attestation records a custodian's signed confirmation of an entry's correctness. It computes a `signed_digest` over the entry snapshot, captures a PKI/qualified signature where available (else server-signed), and sets `attestation_status=ATTESTED`. Attestation can be performed on a single entry or in a filtered batch (e.g., all UNATTESTED entries for an office), each producing a discrete `sr_attestations` row.

**Acceptance Criteria.**
1. Attesting an entry creates an `sr_attestations` row (kind CUSTODIAN_ATTEST) and sets `attestation_status=ATTESTED`.
2. A DISPUTED entry cannot be attested until the dispute is resolved (`SR_ENTRY_DISPUTED`).
3. The signature binds the exact entry content (`signed_digest`); later supersession does not invalidate the historical attestation.
4. Batch attestation processes each entry atomically per row; partial failures don't block the rest.
5. Only the SR Custodian role may attest; the action is logged.

**Business Rules.**
- BR-07.1 Types with `attestation_required=true` must be attested before inclusion in extracts/verification.
- BR-07.2 Server-signed attestation is permitted only where PKI is unavailable; the method is recorded for later upgrade.
- BR-07.3 Re-attestation after a corrigendum attests the new ACTIVE entry, not the superseded one.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_attestations` | Insert attestation |
| `service_register_events` | Status pointer ATTESTED |
| `audit_log` | Append |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/events/{id}/attest` | Attest one entry |
| `POST /api/v1/sr/attestations/batch` | Batch attest by filter |

**UI Behavior Notes.** Custodian console "Attestation queue": filter UNATTESTED, multi-select, signature step (PKI prompt / OTP), progress and per-row outcome.

**Edge Cases.**
- PKI device unavailable → fall back to server-signed with explicit warning + recorded method.
- Entry superseded mid-batch → skipped with note.
- Disputed entry in batch → skipped (`SR_ENTRY_DISPUTED`).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AttestationService`, `SignatureProvider` (PKI/HSM), `AttestationRepository` |
| Backend flow | Snapshot → digest → sign → INSERT attestation → set status pointer |
| Data operations | INSERT `sr_attestations`; UPDATE status pointer |
| Validation | Not disputed; entry ACTIVE; role custodian |
| Authorization | `sr.attest` (custodian) |
| State changes & side effects | attestation_status=ATTESTED; audit_log |
| Failure handling | Signature failure → row fails, others continue; method fallback recorded |
| Dependencies | PKI/HSM; FR-03 |
| Test guidance | Signature binding to content; dispute-block; batch partial-failure isolation |

---

### FR-08 — Periodic (5-yearly) employee service verification

- **ID:** FR-08
- **Module:** M12-SR
- **Primary Role(s):** Employee, SR Custodian, System (scheduler)
- **User Story:** *As an employee, I want to periodically review and confirm my service record (the statutory 5-yearly verification) and dispute anything wrong, so that errors are caught while evidence still exists and my pension is protected.*

**Description.** The scheduler generates verification cycles (`sr_verification_cycles`) per employee per statutory period (default 5 years; plus a mandatory pre-retirement cycle). The employee reviews all in-scope entries, confirms or disputes each, and digitally confirms the cycle (employee attestation). The custodian reviews disputes, ensures resolution, and finalises the cycle with a custodian attestation. Overdue cycles escalate.

**Acceptance Criteria.**
1. The scheduler opens a `PERIODIC_5YR` cycle for each eligible employee at the period boundary with `events_in_scope` correctly counted.
2. The employee can confirm the cycle only after reviewing all in-scope entries; disputes route to FR-06.
3. Employee confirmation captures an `EMPLOYEE_VERIFY` attestation; confirmed entries become `attestation_status=EMPLOYEE_VERIFIED`.
4. Custodian finalisation requires all disputes resolved and captures a custodian attestation; cycle → COMPLETED.
5. Cycles past `due_date` without completion become OVERDUE and notify employee + custodian + reporting manager.

**Business Rules.**
- BR-08.1 A pre-retirement cycle is auto-created N months before superannuation (configurable) and must complete before pension processing (M11).
- BR-08.2 Disputed entries block COMPLETED until resolved.
- BR-08.3 Employee verification is a qualified/OTP-confirmed signature; method recorded.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_verification_cycles` | Create/manage |
| `sr_attestations` | Employee + custodian sign |
| `service_register_events` | Mark EMPLOYEE_VERIFIED |
| `notifications` | Open/overdue/complete |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/sr/verification-cycles?employee_id=` | List cycles |
| `POST /api/v1/sr/verification-cycles/{id}/confirm` | Employee confirm |
| `POST /api/v1/sr/verification-cycles/{id}/finalise` | Custodian finalise |

**UI Behavior Notes.** Employee self-service "Verify my service record" wizard: period summary, scrollable entry list with confirm/dispute per row, progress meter, signature step. Custodian dashboard of open/overdue cycles.

**Edge Cases.**
- Employee on long leave / unreachable → cycle stays OPEN, escalates; custodian may proceed with documented note.
- New disputes raised during review → cycle → DISPUTED until resolved.
- Pre-retirement cycle incomplete at retirement date → blocks M11 pension finalisation with explicit flag.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `VerificationCycleScheduler`, `VerificationService`, `AttestationService` |
| Backend flow | Generate cycle → employee review → confirm (sign) → dispute resolution → custodian finalise (sign) |
| Data operations | INSERT/UPDATE cycle; INSERT attestations; UPDATE entry status pointers |
| Validation | All in-scope reviewed; disputes resolved before finalise |
| Authorization | Employee self `sr.verify.confirm`; custodian `sr.verify.finalise` |
| State changes & side effects | OPEN→EMPLOYEE_REVIEW→(DISPUTED)→CUSTODIAN_REVIEW→COMPLETED/OVERDUE; pension gate |
| Failure handling | Overdue escalation; incomplete pre-retirement blocks M11 |
| Dependencies | Scheduler, FR-06, FR-07, M11 gate |
| Test guidance | Cycle generation correctness; confirm requires full review; overdue transition; pre-retirement pension gate |

---

### FR-09 — SR timeline view (chronological, filterable)

- **ID:** FR-09
- **Module:** M12-SR
- **Primary Role(s):** Employee (self), HR Officer, SR Custodian, Auditor, Pension Officer
- **User Story:** *As an authorised viewer, I want a chronological, filterable, paginated timeline of an employee's service events with integrity and attestation indicators, so that I can understand the full service history at a glance.*

**Description.** The timeline renders `service_register_events` for an employee ordered by `event_date` (with `sequence_no` tiebreak), filterable by category, date range, source module, attestation status, and including/excluding superseded entries. Each row shows title, date, order reference, provenance, attestation and integrity badges, and links to supporting documents and corrigendum/annotation chains. Every view writes `sr_access_log`.

**Acceptance Criteria.**
1. The timeline returns entries ordered by `event_date` desc by default, paginated (max 100/page).
2. Filters by category, date range, source module, attestation status, and superseded-toggle work and compose.
3. Each entry shows attestation badge (UNATTESTED/ATTESTED/EMPLOYEE_VERIFIED/DISPUTED) and an integrity indicator.
4. Superseded entries are visually distinct and link to their corrigendum; corrigenda link back.
5. Every timeline/event view writes an `sr_access_log` row; non-self access requires a `purpose`.

**Business Rules.**
- BR-09.1 Employee sees only their own SR; HR/Custodian see scoped by `org_unit_id`; Auditor sees all (read-only).
- BR-09.2 Sensitive categories (PUNISHMENT, SUSPENSION, certain LEAVE) are access-logged with elevated visibility to auditor.
- BR-09.3 Default view excludes SUPERSEDED unless toggled.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` | Read (timeline) |
| `sr_corrections` | Link annotations/corrigenda |
| `sr_access_log` | Append on view |
| `documents` (M13) | Resolve attachments |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/sr/employees/{id}/timeline` | Paginated timeline |
| `GET /api/v1/sr/events/{id}` | Single entry detail |

**UI Behavior Notes.** Vertical timeline grouped by year; left rail filters; each card has category icon, date, title, provenance pill, badges, expand for payload + documents; "show superseded" toggle. Empty, loading, error, permission states all specified.

**Edge Cases.**
- Employee with zero events (just appointed) → empty state with "Record will populate as events occur".
- Very long service (300+ entries) → virtualised list + pagination.
- Cross-org HR viewing out-of-scope employee → 403.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `TimelineController`, `TimelineQueryService`, `AccessLogger` |
| Backend flow | Authz + scope → query with filters → enrich badges → log access → return page |
| Data operations | SELECT paginated; JOIN corrections; INSERT access_log |
| Validation | Filter params; page size ≤ 100; scope check |
| Authorization | self / scoped / auditor; `sr.timeline.read` |
| State changes & side effects | access_log append only |
| Failure handling | Out-of-scope → 403; missing employee → 404 |
| Dependencies | M13 for documents |
| Test guidance | Filter composition; pagination; access-log written every view; RBAC scoping |

---

### FR-10 — Certified true copy generation with digital signing

- **ID:** FR-10
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian (issue/sign), Employee/Pension Officer (request)
- **User Story:** *As an SR Custodian, I want to generate a certified true copy of an employee's service register (full or scoped) as a digitally signed, QR-verifiable PDF, so that it can be used officially for pension, loans, courts, and audits.*

**Description.** On request, the system renders an ordered, immutable extract (full SR, date range, category, or single event), computes a `content_digest`, generates a signed PDF (custodian PKI signature), stores it in M13, embeds a QR code resolving to the verification endpoint (FR-11), and records `sr_certified_extracts` with a unique `extract_no` and `qr_verification_token`. Extracts can be revoked (e.g., after a corrigendum) but never deleted.

**Acceptance Criteria.**
1. A certified extract renders the selected entries in stable order with a `content_digest` binding the exact content.
2. The PDF is digitally signed by the custodian and stored as a `document_id` in M13; an `EXTRACT_SIGN` attestation is recorded.
3. Each extract has a unique `extract_no` and embedded QR linking to FR-11 verification.
4. FULL_SR extracts include only entries that are attested/verified (or explicitly annotated legacy), excluding superseded entries unless requested.
5. Revoking an extract sets `revoked=true` with reason; the QR verification then reports REVOKED.

**Business Rules.**
- BR-10.1 Non-self extract requests require a stated `purpose` and are access-logged.
- BR-10.2 A corrigendum to any included entry should prompt re-issuance; the prior extract is revoked.
- BR-10.3 Extract content reflects the ledger at `issued_at`; the digest pins it.
- BR-10.4 Generation reuses the platform document services (M11): serial numbering, configured **signer set** (active signers with signatures, `VAL-M11-SIGNER`), letterhead rendering, and storage of the signed PDF in the **employee vault** with a permanent **retention class** (`VAL-M11-RETENTION` — disposal blocked before window). Bulk extract issuance runs as a background job. Employee letter/extract requests are tracked requests; self-generation stays restricted to configured permission holders.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_certified_extracts` | Insert issued extract |
| `service_register_events` | Read content |
| `sr_attestations` | Signature record |
| `documents` (M13) | Store signed PDF |
| `sr_access_log` | Append issuance |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/employees/{id}/extracts` | Generate certified extract |
| `POST /api/v1/sr/extracts/{id}/revoke` | Revoke an extract |
| `GET /api/v1/sr/extracts/{id}` | Extract metadata |

**UI Behavior Notes.** Custodian "Issue certified copy" dialog: scope selection, purpose, preview, sign step; result shows download + extract number + QR. Employee can request; custodian signs.

**Edge Cases.**
- Requested scope includes unattested mandatory-attest entries → blocked with list, or issue as "provisional" if policy allows (configurable).
- Signing fails → no extract record persisted; retry.
- Re-issue after corrigendum → old extract auto-revoked, new issued.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ExtractService`, `PdfRenderer`, `SignatureProvider`, `QrTokenService`, `ExtractRepository` |
| Backend flow | Gather entries → render → digest → sign → store PDF (M13) → record extract + token → log |
| Data operations | SELECT entries; INSERT extract + attestation; M13 store |
| Validation | Attestation gating; scope params; purpose for non-self |
| Authorization | `sr.extract.issue` (custodian); request by self/pension |
| State changes & side effects | New extract row; PDF in M13; access_log; possible prior-extract revoke |
| Failure handling | Sign/store failure → no persistence; revoke is idempotent |
| Dependencies | M13, PKI, FR-11 |
| Test guidance | Digest binds content; revoke flow; attestation gating; QR token uniqueness |

---

### FR-11 — QR / public verification of certified extracts

- **ID:** FR-11
- **Module:** M12-SR
- **Primary Role(s):** External verifier (public), any authorised role
- **User Story:** *As anyone holding a certified extract, I want to scan its QR code and confirm it is authentic, current, and not revoked, so that I can trust the document without contacting the office.*

**Description.** A public, unauthenticated verification endpoint resolves a `qr_verification_token` to a minimal authenticity response: VALID / REVOKED / NOT_FOUND, with extract number, issue date, employee name (masked per privacy policy), scope, event count, and `content_digest`. It does **not** expose the full SR content to the public — only enough to confirm authenticity. Rate-limited and access-logged.

**Acceptance Criteria.**
1. Scanning the QR / hitting the endpoint with a valid token returns VALID plus extract metadata and `content_digest`.
2. A revoked extract returns REVOKED with revocation date/reason category.
3. An unknown token returns NOT_FOUND (no enumeration leak; constant-time-ish).
4. The public response never exposes full SR event content or sensitive PII beyond the minimal authenticity set.
5. The endpoint is rate-limited (`RATE_LIMITED`) and verification hits are counted.

**Business Rules.**
- BR-11.1 Privacy: employee name is partially masked unless the verifier is authenticated and authorised.
- BR-11.2 No authentication required for VALID/REVOKED/NOT_FOUND, but content remains protected.
- BR-11.3 The `content_digest` lets a holder confirm their PDF matches what was issued.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_certified_extracts` | Read by token |
| `sr_access_log` | Append (action VERIFY) |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/sr/verify/{qr_verification_token}` | Public authenticity check |

**UI Behavior Notes.** A lightweight public verification page: status banner (green VALID / red REVOKED / grey NOT_FOUND), extract number, issue date, masked name, scope, "digest matches your copy?" instruction. WCAG AA, mobile-first.

**Edge Cases.**
- Token guessing / enumeration → high-entropy tokens + rate limiting + uniform NOT_FOUND.
- Authenticated authorised viewer → may see fuller metadata (still not full content here; use FR-09/FR-10).
- Expired `valid_until` → returns VALID-but-EXPIRED status.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `PublicVerifyController`, `RateLimiter`, `MaskingService` |
| Backend flow | Resolve token → status → mask → respond → log |
| Data operations | SELECT by token; INSERT access_log |
| Validation | Token format; rate limit |
| Authorization | Public (unauthenticated); content protected |
| State changes & side effects | access_log append; verification metric |
| Failure handling | Unknown → NOT_FOUND uniform; over-limit → 429 |
| Dependencies | FR-10 tokens |
| Test guidance | No content leak; revoked/expired/not-found paths; rate-limit; enumeration resistance |

---

### FR-12 — Custody, access control & access logging

- **ID:** FR-12
- **Module:** M12-SR
- **Primary Role(s):** SR Custodian, Auditor, System
- **User Story:** *As an Auditor, I want every access to a service register — view, print, export, extract — recorded immutably with actor, purpose, and scope, so that custody is provable and misuse is detectable.*

**Description.** All read/print/export/extract/integrity paths funnel through an access-logging interceptor that writes `sr_access_log` (append-only) with actor, role, action, scope, purpose (required for non-self), IP, and `request_id`. RBAC + row-level scoping by `org_unit_id` govern who may access whom. The custodian/auditor can review access trails per employee or per actor and detect anomalies (e.g., bulk views).

**Acceptance Criteria.**
1. Every VIEW/PRINT/EXPORT/ISSUE_EXTRACT/VERIFY action writes exactly one `sr_access_log` row.
2. Non-self access requires a non-empty `purpose`; absence is rejected (`SR_PURPOSE_REQUIRED`).
3. Access is denied (403) when the actor lacks role or org-scope for the target employee.
4. The access log is append-only — never edited or deleted.
5. Auditor can query the access log by employee, actor, action, and date range (paginated).

**Business Rules.**
- BR-12.1 Employee self-access does not require a purpose but is still logged.
- BR-12.2 Anomaly rules (e.g., one actor viewing > N distinct employees/hour) raise an alert.
- BR-12.3 Sensitive-category access is flagged for elevated audit visibility.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_access_log` | Insert (every access) |
| `audit_log` | Append denials/anomalies |
| `notifications` | Anomaly alerts |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/sr/access-log` | Query access trail (auditor/custodian) |

**UI Behavior Notes.** Auditor/custodian "Access trail" view: filter by employee/actor/action/date; anomaly highlights; export. Purpose prompt on non-self open.

**Edge Cases.**
- Access denied mid-bulk → logged as denial; no data returned.
- High-volume legitimate access (pension drive) → anomaly rule tuned via config, not hard block.
- Service-principal reads (subscriptions) → logged with module identity.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `AccessInterceptor` → P02 `Authorization.check` (scope filter + field mask on serialization; PII Protection Ceiling for DOB/national-ID; masked-own-view for the record owner), `AccessLogRepository`, `AnomalyDetector` |
| Backend flow | Pre-handler `Authorization.check` (deny-by-default, multi-role intersection) → on success log to `sr_access_log` + `audit_log` (read is itself audited, P05) → anomaly evaluate |
| Data operations | INSERT access_log; SELECT for trail |
| Validation | Purpose for non-self; scope; role |
| Authorization | `sr.accesslog.read` (auditor/custodian) |
| State changes & side effects | access_log append; possible alert |
| Failure handling | Denials logged; log write failure fails the read (fail-closed on audit) |
| Dependencies | RBAC platform |
| Test guidance | Every path logged; purpose enforcement; fail-closed when log unavailable; anomaly trigger |

---

### FR-13 — Event subscriptions to downstream modules

- **ID:** FR-13
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (register), SR Custodian (approve), Subscriber modules
- **User Story:** *As the Pension module (M11), I want to subscribe to SR change events for relevant categories, so that I consume authoritative service facts in near-real-time instead of polling the ledger.*

**Description.** Downstream modules register subscriptions (`sr_subscriptions`) for event categories via webhook, pull-feed, or message bus. On every ledger append/supersession, the change-feed publisher emits a signed event (HMAC) with at-least-once delivery and a per-subscriber cursor (`last_delivered_seq`). Subscribers dedupe by `sr_event_id`. Corrigenda re-emit so consumers can re-read corrected facts.

**Acceptance Criteria.**
1. A subscription can be registered for one or more `event_categories` and a delivery mode; activation requires custodian approval.
2. Every committed ledger append (and supersession) generates a delivery to matching ACTIVE subscriptions.
3. Delivery is at-least-once with a durable cursor; failed webhooks retry with backoff.
4. Delivered payloads are signed (HMAC via `secret_ref`) and contain `sr_event_id`, category, employee_id, and a content reference — not sensitive full payloads unless the subscriber is authorised.
5. Subscribers dedupe by `sr_event_id`; corrigenda are delivered as new events referencing the superseded entry.

**Business Rules.**
- BR-13.1 Secrets are referenced via env (`secret_ref`), never stored in the row.
- BR-13.2 PAUSED/RETIRED subscriptions receive no deliveries; resumed subscriptions replay from cursor.
- BR-13.3 Payload minimisation: sensitive categories deliver references; the subscriber fetches authorised detail via API.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_subscriptions` | Manage subscriptions + cursor |
| `service_register_events` | Source of change feed |
| `audit_log` | Append registration changes |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/subscriptions` | Register subscription |
| `POST /api/v1/sr/subscriptions/{id}/activate` | Custodian approve |
| `GET /api/v1/sr/feed?since_seq=` | Pull feed |

**UI Behavior Notes.** Admin "Subscriptions" tab: list, register (module, categories, mode, endpoint), status, last-delivered cursor, redeliver. No secret values shown.

**Edge Cases.**
- Webhook endpoint down → retry/backoff; after threshold, PAUSE + alert.
- Duplicate delivery → subscriber idempotent on `sr_event_id`.
- Category `ALL` subscription → receives every event.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ChangeFeedPublisher`, `WebhookDeliverer`, `SubscriptionRepository`, `HmacSigner` |
| Backend flow | On append commit → enqueue → match subscriptions → deliver/sign → advance cursor |
| Data operations | INSERT/UPDATE subscriptions; read feed by seq |
| Validation | Endpoint URL; category validity; secret ref present |
| Authorization | admin register; custodian activate; `sr.feed.read` for pull |
| State changes & side effects | Deliveries; cursor advance; audit |
| Failure handling | Retry/backoff; pause on repeated failure; replay from cursor |
| Dependencies | FR-03 append commit hook |
| Test guidance | At-least-once + idempotent consume; cursor replay; HMAC verify; payload minimisation |

---

### FR-14 — Bulk legacy digitisation pipeline

- **ID:** FR-14
- **Module:** M12-SR
- **Primary Role(s):** HR Officer (data entry / maker), SR Custodian (promote / checker)
- **User Story:** *As an HR Officer, I want a controlled pipeline to scan, index, data-enter, dual-verify, and reconcile legacy paper service books, so that decades of history are digitised into the ledger accurately and with provenance.*

**Description.** Legacy service books are digitised in batches (`sr_legacy_digitisation_batch`). The pipeline progresses CREATED → SCANNING (M13 scans) → DATA_ENTRY (transcription into staged records, `sr_legacy_digitisation_record`) → DUAL_VERIFICATION (maker ≠ verifier per record) → RECONCILIATION (resolve discrepancies, match to M01 master) → READY_FOR_PROMOTION → PROMOTED (records appended to the ledger via FR-03 with `is_legacy=true`, `source_module=M12_LEGACY`, page reference and scan linkage). Promotion requires custodian (checker) approval.

**Acceptance Criteria.**
1. A batch progresses through the defined states; each transition is recorded and gated.
2. Each staged record requires dual verification (entry operator ≠ verifier) before it can be promoted.
3. Records must be matched to an M01 `employee_id` (or flagged AMBIGUOUS/UNMATCHED) before promotion; unmatched records cannot be promoted.
4. Promotion appends ledger entries with `is_legacy=true`, `legacy_batch_id`, `page_ref`, and the scan `document_id`, preserving the original `event_date`.
5. Promotion requires SR Custodian approval (maker-checker) and reconciliation discrepancy count = 0 (or explicitly waived with note).

**Business Rules.**
- BR-14.1 Legacy entries are appended in chronological `event_date` order within the chain where feasible; the hash chain still follows recording order.
- BR-14.2 Legacy entries default `attestation_status=UNATTESTED` and are flagged for custodian attestation (FR-07) or marked legacy-unverifiable with annotation.
- BR-14.3 Every staged record links its source scan for evidentiary traceability.

**Data Model References.**

| Entity | Use |
|---|---|
| `sr_legacy_digitisation_batch` | Batch lifecycle |
| `sr_legacy_digitisation_record` | Staged records |
| `service_register_events` | Append on promotion (FR-03) |
| `documents` (M13) | Scans |
| `workflow_instances` | Promotion approval |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/legacy/batches` | Create batch |
| `POST /api/v1/sr/legacy/batches/{id}/records` | Add staged records |
| `POST /api/v1/sr/legacy/records/{id}/verify` | Dual verify |
| `POST /api/v1/sr/legacy/batches/{id}/promote` | Promote (checker) |

**UI Behavior Notes.** Digitisation workbench: batch board (Kanban by status), split-screen scan + data-entry form, verification queue with side-by-side compare, reconciliation discrepancy list, promote action gated to custodian with summary.

**Edge Cases.**
- Illegible scan / missing page → record flagged DISCREPANCY with note; excluded until resolved.
- AMBIGUOUS master match (two employees same name) → manual resolution required before promote.
- Duplicate of an already-digitised event → reconciliation flags and excludes.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `DigitisationService` (P06 ETL+V pipeline), `MasterMatcher`, `ReconciliationService`, `AppendEngine`, `WorkflowAdapter` → P01 (`WF-M12-LEGACY-PROMOTE`); writes `migration_runs` ledger |
| Backend flow | Create → scan link → data entry → dual verify → match/reconcile (zero tolerance on dated/statutory facts) → custodian promote (P01) → bulk append with `legacy_source_id` dedup |
| Data operations | INSERT batch/records; UPDATE statuses; bulk INSERT ledger on promote |
| Validation | Dual verification; master match; discrepancy=0 or waived |
| Authorization | HR maker `sr.legacy.entry`; custodian `sr.legacy.promote` |
| State changes & side effects | Batch lifecycle; ledger appended (is_legacy); audit_log |
| Failure handling | Promotion atomic per batch; partial failure rolls back batch promotion |
| Dependencies | M13 scans, M01 match, FR-03, workflow |
| Test guidance | Dual-verification enforced; unmatched blocked; promotion atomicity; legacy provenance correctness |

---

### FR-15 — Retention, archival & legal hold

- **ID:** FR-15
- **Module:** M12-SR
- **Primary Role(s):** System Administrator (policy), SR Custodian (legal hold), Auditor
- **User Story:** *As a System Administrator, I want the SR retained permanently with post-retirement archival and legal-hold support, so that the statutory record is always available for pension, audit, and litigation, and never improperly destroyed.*

**Description.** The SR ledger and all sub-ledgers are retained **permanently** (no purge). After retirement/separation, an employee's SR moves to an archival tier (cold storage / archived partition) while remaining fully readable and integrity-verifiable. Legal hold flags an SR (or set) to prevent any tier movement and to mark it for litigation. Retention/hold policy is configurable but cannot authorise deletion of the statutory ledger.

**Acceptance Criteria.**
1. No API, job, or admin action can delete a `service_register_events` row, attestation, correction, or access-log row.
2. On separation/retirement, the employee's SR is marked archived but stays readable and verifiable (integrity unaffected).
3. A legal hold can be applied/released by the custodian; held SRs are excluded from any archival tier movement and flagged in views.
4. Archived SRs remain available for certified extracts and pension consumption (M11).
5. Retention policy changes are versioned and audited; none may permit ledger deletion.

**Business Rules.**
- BR-15.1 Archival is a storage-tier/partition concern only; it never alters rows or hashes.
- BR-15.2 Legal hold overrides archival lifecycle and any future retention change.
- BR-15.3 Post-retirement access still follows RBAC + access logging.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` | Read (archival tiering metadata external) |
| `audit_log` | Append policy/hold changes |
| `employees` (M01) | Status (RETIRED/SEPARATED) trigger |

**API References.**

| API | Purpose |
|---|---|
| `POST /api/v1/sr/employees/{id}/legal-hold` | Apply/release hold |
| `GET /api/v1/sr/retention-policy` | View policy |

**UI Behavior Notes.** Admin "Retention & legal hold" panel: policy view (read-only deletion-prohibited), per-employee hold toggle with reason, archived badge in timeline.

**Edge Cases.**
- Attempted deletion via any path → blocked, logged as a security event.
- Archival of a held SR → blocked while hold active.
- Re-employment after retirement → SR un-archives and continues appending (same chain).

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `RetentionPolicyService`, `ArchivalManager`, `LegalHoldService` |
| Backend flow | Separation event → mark archived → (hold check) → tier move; deletion attempts rejected |
| Data operations | Metadata flags; partition move; INSERT audit |
| Validation | Deletion always rejected; hold blocks tiering |
| Authorization | admin policy; custodian hold; `sr.retention.manage` |
| State changes & side effects | Tier/archival flags; audit; no row deletion ever |
| Failure handling | Tiering failure retried; deletion attempt → security alert |
| Dependencies | Storage tiering infra; M01 status |
| Test guidance | Deletion impossible (all paths); hold blocks archival; archived still readable/verifiable |

---

### FR-16 — Audit / forensics view & SR analytics

- **ID:** FR-16
- **Module:** M12-SR
- **Primary Role(s):** Auditor, SR Custodian
- **User Story:** *As an Auditor, I want a forensics view that combines integrity status, the correction/supersession history, attestation coverage, and the access trail, so that I can investigate any suspected tampering and assess SR health.*

**Description.** The forensics view aggregates, per employee or population: hash-chain integrity status (FR-04), the full supersession/correction lineage (FR-05/FR-06), attestation and verification coverage (FR-07/FR-08), and the access trail (FR-12). It supports point-in-time reconstruction ("what did the SR show on date X"), divergence drill-down, and SR analytics (event volumes by category, attestation backlog, verification completion, digitisation progress) exposed to M14.

**Acceptance Criteria.**
1. The view shows integrity PASS/FAIL with divergent-entry drill-down for any employee.
2. It reconstructs the SR as-of any past date (excluding entries recorded after that date), using append order.
3. It surfaces the complete correction/supersession lineage for any entry.
4. It reports attestation coverage, verification-cycle status, and access anomalies.
5. Analytics aggregates (by category, org_unit, status) are exposed to M14 and exportable, respecting RBAC.

**Business Rules.**
- BR-16.1 Point-in-time reconstruction relies on `recorded_at`/`sequence_no` (append order), not `event_date`.
- BR-16.2 Forensics access is itself logged (FR-12).
- BR-16.3 A FAIL integrity finding cannot be closed without a recorded resolution note.

**Data Model References.**

| Entity | Use |
|---|---|
| `service_register_events` | Read (reconstruct/lineage) |
| `sr_corrections` | Lineage |
| `sr_attestations` / `sr_verification_cycles` | Coverage |
| `sr_access_log` | Trail/anomaly |

**API References.**

| API | Purpose |
|---|---|
| `GET /api/v1/sr/forensics/employees/{id}` | Forensics bundle |
| `GET /api/v1/sr/forensics/as-of?date=` | Point-in-time reconstruction |
| `GET /api/v1/sr/analytics/summary` | Aggregates for M14 |

**UI Behavior Notes.** Forensics dashboard: integrity banner, lineage graph (entry → corrigenda), coverage gauges, access-anomaly list, as-of date picker. Analytics cards feed M14.

**Edge Cases.**
- As-of date before first entry → empty reconstruction.
- Integrity FAIL during reconstruction → reconstruction proceeds but flags affected segment.
- Very large population analytics → precomputed aggregates / async export.

**LLD.**

| Aspect | Detail |
|---|---|
| Components | `ForensicsService`, `PointInTimeReconstructor`, `AnalyticsAggregator` |
| Backend flow | Gather integrity + lineage + coverage + access → assemble bundle; as-of filters by recorded_at |
| Data operations | SELECT across SR entities; aggregate queries |
| Validation | Date params; RBAC scope |
| Authorization | `sr.forensics.read` (auditor/custodian) |
| State changes & side effects | Read-only; access logged |
| Failure handling | Large queries async; partial-data flagged |
| Dependencies | FR-04/05/07/08/12; M14 |
| Test guidance | As-of correctness; lineage completeness; coverage accuracy; access-logged forensics |

---

## Section 7 — UI Requirements

### 7.1 Surfaces & layouts

| Surface | Primary role | Key elements | States covered |
|---|---|---|---|
| **SR Timeline (self-service)** | Employee | Vertical year-grouped timeline; filters (category/date/status); entry cards with badges; document links; "show superseded" toggle | empty / loading / error / permission / populated |
| **Custodian Console** | SR Custodian | Tabs: Attestation queue, Corrections, Taxonomy, Verification cycles, Extracts, Subscriptions, Access trail | per-tab empty/error/success |
| **Manual Record Event** | SR Custodian / HR | Type-driven dynamic form from `payload_schema`; order/document fields; maker-checker submit | validation / success / conflict |
| **Periodic Verification Wizard** | Employee | Period summary; per-entry confirm/dispute; progress meter; signature step | in-progress / disputed / complete |
| **Correction / Corrigendum** | HR / Custodian | Original vs. corrected diff; reason/evidence; approve step | pending / approved / rejected |
| **Digitisation Workbench** | HR / Custodian | Batch Kanban; split scan + entry; verification compare; reconciliation list; promote | each pipeline state |
| **Forensics Dashboard** | Auditor / Custodian | Integrity banner; lineage graph; coverage gauges; as-of picker; access anomalies | pass / fail / loading |
| **Certified Extract** | Custodian / Employee | Scope picker; preview; sign; download + QR | gated / signed / revoked |
| **Public Verification Page** | Public | Status banner; minimal metadata; digest-match instruction | valid / revoked / not-found / rate-limited |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA: keyboard navigation, focus order, ARIA labels, AA contrast, no colour-only status (badges carry text).
- Mobile-first: collapsible sidebar/hamburger; timeline and verification wizard fully usable on mobile.
- Dark mode supported via design tokens.
- Every list paginated (≤100), with empty/loading/error states; destructive/irreversible-looking actions (revoke, promote) confirm with explicit consequence text.
- Dates display `DD-MMM-YYYY`; provenance and integrity always visible on entries.
- No skeleton-only screens: real fields, data, API calls, and states throughout.

---

## Section 8 — API & Integration

### 8.1 Conventions

- Base path `/api/v1/sr`; ingestion contract `/api/v1/sr/ingest` (separately versioned for source modules).
- **Cursor pagination** on all list/timeline endpoints (`?limit=` default 25, max 100; `cursor=`; response `next_cursor`) — offset paging is not used (Foundation FS §1).
- All unsafe POSTs accept an `Idempotency-Key` header; a repeat within 24h returns the original result, not a duplicate.
- Every request carries/echoes `X-Correlation-Id`, written to every audit and log line.
- **Platform error envelope** (Foundation FS §1 / BRD §6.2): `{ "error": { "code": "...", "message": "...", "field": "...", "details": { } } }`. (The `SHARED_FOUNDATION` `requestId` is carried as `X-Correlation-Id`.) User-facing copy resolves via `ERR-*` message ids in the platform Message Catalogue.
- **Inherited standard codes** (platform): `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409, incl. idempotency replays & state conflicts), `PRECONDITION_FAILED` (412), `RATE_LIMITED` (429), `INTERNAL` (500).

### 8.2 Error-code catalog (M12-specific, in addition to inherited)

| Code | HTTP | Meaning |
|---|---|---|
| `SR_TYPE_NOT_FOUND` | 404 | No published event type effective for the given date |
| `SR_TYPE_OVERLAP` | 409 | Overlapping effective ranges on publish |
| `SR_PAYLOAD_INVALID` | 422 | Payload fails the type's JSON Schema |
| `SR_SOURCE_NOT_ALLOWED` | 403 | Source module not in the type's allowlist |
| `SR_EMPLOYEE_NOT_FOUND` | 404 | `employee_id` not in M01 |
| `SR_FUTURE_DATE` | 422 | `event_date` beyond future tolerance |
| `SR_DUPLICATE_EVENT` | 409 | (Surfaced as `DUPLICATE_NOOP` on ingest) duplicate idempotency key |
| `SR_ENTRY_IMMUTABLE` | 409 | Attempt to edit/delete a ledger entry |
| `SR_ENTRY_SUPERSEDED` | 409 | Action invalid on a superseded entry |
| `SR_ENTRY_DISPUTED` | 409 | Attest/verify blocked by open dispute |
| `SR_ATTESTATION_REQUIRED` | 412 | Action needs prior attestation (precondition) |
| `SR_INTEGRITY_FAILED` | 422 | Hash-chain verification failed |
| `SR_PURPOSE_REQUIRED` | 422 | Non-self access without stated purpose |
| `SR_EXTRACT_REVOKED` | 409 | Operation on a revoked extract |
| `SR_LEGACY_UNMATCHED` | 409 | Promotion blocked: record not matched to master |
| `SR_LEGAL_HOLD_ACTIVE` | 409 | Tiering/change blocked by legal hold |
| `SR_DELETION_FORBIDDEN` | 403 | Any deletion attempt on the statutory ledger |

User-facing copy for each is carried as an `ERR-M12-*` id in the platform Message Catalogue (Foundation FS §5); shared `ERR-FORBIDDEN` / `ERR-LOADFAIL` apply to the no-permission and load-failure UI states.

### 8.3 JSON examples

**Ingest an event (request):**

```json
POST /api/v1/sr/ingest
Idempotency-Key: M06:ord-9912:v1
{
  "source_module": "M06",
  "source_reference_id": "ord-9912",
  "source_event_version": 1,
  "event_type_code": "PROMOTION",
  "employee_id": "8f3a...aa",
  "event_date": "2019-06-01",
  "order_no": "PROM/2019/9912",
  "order_date": "2019-05-20",
  "sanctioning_authority": "Director of Education",
  "payload": {
    "from_designation": "Asst. Teacher",
    "to_designation": "Headmaster",
    "pay_scale": "Level-9",
    "post_location_org_unit_id": "ou-12"
  },
  "document_ids": ["doc-aa11"],
  "qualifying_service_impact": "QUALIFYING"
}
```

**Ingest (success response):**

```json
{
  "sr_event_id": "sr-0042",
  "sequence_no": 42,
  "entry_hash": "9f2c...e1",
  "prev_event_hash": "1b77...c0",
  "attestation_status": "UNATTESTED",
  "validation_result": "ACCEPTED",
  "correlationId": "X-Correlation-Id: 9c1f-7781"
}
```

**Ingest (duplicate):**

```json
{
  "sr_event_id": "sr-0042",
  "validation_result": "DUPLICATE_NOOP",
  "correlationId": "X-Correlation-Id: 9c1f-7782"
}
```

**Validation error (platform envelope, `VALIDATION_FAILED`/`SR_PAYLOAD_INVALID` → 422):**

```json
{
  "error": {
    "code": "SR_PAYLOAD_INVALID",
    "message": "payload.pay_scale is required",
    "field": "payload.pay_scale",
    "details": { "schema": "PROMOTION@v2", "messageId": "ERR-M12-PAYLOAD" }
  }
}
```
*(`X-Correlation-Id` is returned as a response header and written to `audit_log`.)*

**Public QR verification (valid):**

```json
GET /api/v1/sr/verify/3kQ9...tokn
{
  "status": "VALID",
  "extract_no": "SR-EXT-2026-000451",
  "issued_at": "2026-06-15",
  "employee_name_masked": "R**** K****",
  "scope": "FULL_SR",
  "event_count": 312,
  "content_digest": "a91f...77"
}
```

### 8.4 Integration map

| Counterparty | Direction | Mechanism |
|---|---|---|
| M03/M04 (leave) | inbound | Ingestion contract (leave spell events) |
| M05 (transfer) | inbound | Ingestion contract (posting/transfer/relieving/joining) |
| M06 (promotion) | inbound + subscription | Ingestion + subscribes to PROMOTION/TRANSFER |
| M08 (appraisal) | inbound | Ingestion (appraisal-recorded) |
| M09 (disciplinary) | inbound | Ingestion (punishment/suspension) |
| M10 (payroll) | inbound | Ingestion (pay-fixation/increment) |
| M11 (pension) | outbound | Subscription + certified extract consumption; pre-retirement verification gate |
| M01 (employee) | reference | Existence/identity checks; status triggers archival |
| M13 (documents) | reference | Scans, order copies, signed extract PDFs |
| M14 (analytics) | outbound | Analytics aggregates + change feed |

---

## Section 9 — Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | P95 timeline/read API < 500ms; P95 ingestion write < 400ms; integrity verification of a single chain < 1s (typical), full-population sweep within nightly window |
| **Availability** | 99.9% uptime; ingestion endpoint must be highly available (source modules retry on 503 with idempotency) |
| **Scalability** | Horizontal scale of read/ingestion; ledger partitioned by employee/time; tens of millions of entries |
| **Durability** | RPO ≤ 15 min; RTO ≤ 4h; ledger is permanent — backups + WAL archiving; archival tier for retired cohorts |
| **Integrity** | SHA-256 hash-chaining; 100% chain-verifiable; optional external anchoring; deletion structurally forbidden |
| **Security** | OWASP ASVS; TLS 1.2+; AES-256 at rest; least-privilege RBAC + org row-scoping; ingestion principal cannot read; fail-closed access logging |
| **Privacy** | DPDP Act 2023 alignment; payload minimisation (no medical detail beyond statutory need); masked public verification; full access trail |
| **Auditability** | Every read/write/print/extract logged; immutable `audit_log` + `sr_access_log`; forensics reconstruction |
| **Accessibility** | WCAG 2.1 AA across all UI |
| **Retention** | Permanent statutory retention; legal hold; no purge path |
| **Observability** | Metrics: ingestion rate, integrity status, attestation backlog, verification completion, extract issuance, subscription lag |
| **Compatibility** | Versioned ingestion contract with published sunset windows; per-row `hash_algorithm`/`ledger_version` for crypto migration |

---

## Section 10 — Workflow & State Diagrams (state tables)

### 10.1 Ledger entry lifecycle (`entry_status` / `attestation_status`)

| From | Event | To | Guard / Side effect |
|---|---|---|---|
| (none) | Ingest valid event | ACTIVE / UNATTESTED | Append + hash-chain (FR-03) |
| ACTIVE / UNATTESTED | Custodian attest | ACTIVE / ATTESTED | Attestation row + signed digest (FR-07) |
| ACTIVE / ATTESTED | Employee verify in cycle | ACTIVE / EMPLOYEE_VERIFIED | Cycle confirmation (FR-08) |
| ACTIVE / * | Employee raises dispute | ACTIVE / DISPUTED | Dispute record (FR-06) |
| ACTIVE / DISPUTED | Dispute resolved (upheld) | ACTIVE / (prior status) | Resolution note |
| ACTIVE / DISPUTED | Dispute resolved (corrigendum) | SUPERSEDED | New ACTIVE corrigendum (FR-05) |
| ACTIVE / * | Corrigendum issued | SUPERSEDED | `superseded_by_event_id` set; new ACTIVE entry |
| ACTIVE / * | Annotation added | ANNOTATED (content unchanged) | Annotation record (FR-06) |
| any | Delete attempt | (rejected) | `SR_DELETION_FORBIDDEN` + security alert |

### 10.2 Correction (`sr_corrections.decision`)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Maker submits corrigendum | PENDING | Reason + evidence (identity ⇒ dual sign-off) |
| PENDING | Custodian approves | APPROVED | maker ≠ checker; appends corrigendum, supersedes original |
| PENDING | Custodian rejects | REJECTED | No ledger change |

### 10.3 Verification cycle (`sr_verification_cycles.status`)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Scheduler opens | OPEN | Period boundary / pre-retirement window |
| OPEN | Employee starts review | EMPLOYEE_REVIEW | — |
| EMPLOYEE_REVIEW | Dispute raised | DISPUTED | Routes to FR-06 |
| DISPUTED | All disputes resolved | CUSTODIAN_REVIEW | — |
| EMPLOYEE_REVIEW | Employee confirms (sign) | CUSTODIAN_REVIEW | All in-scope reviewed |
| CUSTODIAN_REVIEW | Custodian finalises (sign) | COMPLETED | No open disputes |
| OPEN/EMPLOYEE_REVIEW/DISPUTED | Past due_date | OVERDUE | Escalation notifications |

### 10.4 Legacy digitisation batch (`batch.status`)

| From | Event | To | Guard |
|---|---|---|---|
| CREATED | Scans linked | SCANNING | M13 documents attached |
| SCANNING | Transcription done | DATA_ENTRY | Staged records created |
| DATA_ENTRY | Records entered | DUAL_VERIFICATION | — |
| DUAL_VERIFICATION | All verified (maker ≠ verifier) | RECONCILIATION | — |
| RECONCILIATION | Discrepancies = 0 (or waived) + matched | READY_FOR_PROMOTION | All matched to M01 |
| READY_FOR_PROMOTION | Custodian promotes | PROMOTED | maker-checker; bulk append (FR-03) |
| any | Custodian rejects | REJECTED | Reason recorded |

### 10.5 Certified extract (`extract`)

| From | Event | To | Guard |
|---|---|---|---|
| (none) | Generate + sign | ISSUED (revoked=false) | Attestation gating; signed PDF in M13 |
| ISSUED | Corrigendum to included entry / custodian revokes | REVOKED | Reason; QR reports REVOKED |

---

## Section 11 — Notifications

| Event | Trigger | Recipients | Channel |
|---|---|---|---|
| New SR entry recorded | Ingestion ACCEPTED for an employee | Employee (digest), Custodian queue | In-app, optional email |
| Entry requires attestation | UNATTESTED mandatory-attest entry | SR Custodian | In-app queue |
| Verification cycle opened | Scheduler opens cycle | Employee | In-app, email |
| Verification overdue | Past due_date | Employee, Custodian, Reporting Manager | In-app, email |
| Dispute raised | Employee disputes entry | SR Custodian | In-app |
| Dispute resolved | Custodian resolves | Employee | In-app, email |
| Corrigendum issued | Correction approved | Employee, subscribers (M11) | In-app + change feed |
| Integrity FAIL | Verification fails | SR Custodian, Auditor | In-app (high severity), email |
| Access anomaly | Anomaly rule triggers | SR Custodian, Auditor | In-app |
| Certified extract issued | Extract generated | Requestor, Employee | In-app, email (link) |
| Extract revoked | Revocation | Holder/requestor, Employee | In-app, email |
| Legacy batch ready / promoted | Status transition | HR maker, Custodian | In-app |
| Pre-retirement verification due | N months before superannuation | Employee, Custodian, M11 | In-app, email |

**Platform alignment (X.2 / Foundation §5).** Each row maps to a platform message id `MSG-M12-*` (e.g., `MSG-M12-ENTRY-RECORDED`, `MSG-M12-ATTEST-DUE`, `MSG-M12-VERIFY-OPEN`, `MSG-M12-VERIFY-OVERDUE`, `MSG-M12-DISPUTE`, `MSG-M12-CORRIGENDUM`, `MSG-M12-INTEGRITY-FAIL`, `MSG-M12-EXTRACT-ISSUED`, `MSG-M12-PRERETIRE-VERIFY`); copy lives once in the Message Catalogue and is referenced by id. **IN_APP + EMAIL fire in parallel** for approval-bearing events; **statutory notifications (verification due/overdue, integrity FAIL, pre-retirement verification) are mandatory and not user-suppressible**; non-urgent IN_APP supports digest mode and quiet-hours. Delivery uses the platform engine with exponential-backoff retry up to 5 attempts + dead-letter queue; every dispatch is audit-logged. All notifications write to the shared `notifications` ledger; sensitive content is referenced, not embedded. Optional surfaces: Microsoft Teams actionable cards for SR approvals (additive channel, never the system of record).

---

## Section 12 — Reporting & Analytics

| Report | Audience | Contents |
|---|---|---|
| SR completeness | Custodian, Auditor | Events recorded vs. expected by category/org_unit; gaps |
| Attestation backlog | Custodian | UNATTESTED mandatory-attest entries by age/office |
| Verification completion | Custodian, HR | Cycles by status; overdue list; pre-retirement readiness |
| Integrity health | Auditor | Chains verified, FAIL findings, anchor status |
| Access & anomaly | Auditor | Access volumes by actor/employee; flagged anomalies |
| Correction & dispute log | Auditor | Corrigenda, annotations, disputes with outcomes |
| Digitisation progress | HR, Custodian | Batches by status; records verified/promoted; discrepancies |
| Extract issuance | Custodian | Extracts issued/revoked, by purpose |
| Event volume analytics | M14 | Events by category/time/org_unit (feeds dashboards) |

Aggregates are exposed to M14 via `GET /api/v1/sr/analytics/summary` and the change feed; all respect RBAC and access logging. Exports are paginated/async for large populations.

---

## Section 13 — Migration & Launch

### 13.1 Migration approach

Runs on the platform **P06 ETL+V** framework (Extract → Validate → Transform → Load → Verify; idempotent, re-runnable), recorded in the `migration_runs` ledger, with **three mandatory staging dry runs** before production cutover, **zero reconciliation tolerance** on dated/statutory facts, failed records logged with source row + violated rule, and the legacy source kept read-only ≥ 4 weeks post-go-live. Every migrated row carries a permanent `legacy_source_id` traceability/dedup key. Sequenced after the platform's Wave 1 (employee master + org structure) so SR appends resolve against an authoritative M01.

1. **Taxonomy seed (FR-01):** publish the launch SR event-type catalog covering all 17 categories with payload schemas, allowlists, and attestation rules.
2. **Master alignment:** confirm M01 `employee_id`/`service_no` golden source (post Wave 1); build the matcher for legacy records.
3. **Bulk legacy digitisation (FR-14):** prioritised cohorts (near-retirement first, then active), scan → data entry → dual verify → reconcile → custodian promote, with `is_legacy=true` provenance, `legacy_source_id`, and scan linkage.
4. **Genesis & chain bootstrap:** for each employee, first appended entry uses `GENESIS` prev-hash; legacy entries appended in chronological order where feasible.
5. **Attestation backfill (FR-07):** custodian attests promoted legacy entries or marks legacy-unverifiable with annotation.
6. **Source-module cutover (FR-02):** enable ingestion principals for M03/M04/M05/M06/M08/M09/M10 with idempotent posting; run dual-write/verification window with M04 reconciliation for leave.
7. **Subscriptions (FR-13):** register M11/M06/M14 subscriptions before pension/seniority cutover.
8. **Pre-retirement verification (FR-08):** open cycles for the near-retirement cohort to validate digitised history before pension processing.

### 13.2 Launch readiness gates

| Gate | Criterion |
|---|---|
| Taxonomy complete | All categories have published types with schemas |
| Ingestion live | All source modules post idempotently; 0 duplicate entries in soak |
| Integrity green | 100% chain verification on migrated population |
| Digitisation reconciled | In-scope legacy cohort promoted with discrepancy = 0 (or waived + noted) |
| Verification piloted | Near-retirement cohort cycles completed |
| Access & audit | Access logging fail-closed; forensics view operational |
| DR validated | Restore from backup verifies chain integrity end-to-end |

### 13.3 Rollback / contingency

- Ingestion is idempotent and append-only; a faulty source can be paused without data loss; replay resumes from the source.
- Digitisation promotion is atomic per batch; a bad batch is REJECTED, not partially promoted.
- No ledger deletion exists; correction-by-supersession handles any post-launch error.

---

## Section 14 — Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix (FR → entities → APIs → state tables)

| FR | Primary entities | Key APIs | State table |
|---|---|---|---|
| FR-01 Taxonomy | `sr_event_type` | `/sr/event-types*` | §10 (config) |
| FR-02 Ingestion contract | `sr_ingestion_requests`, `service_register_events` | `/sr/ingest` | 10.1 |
| FR-03 Append + hash chain | `service_register_events` | (internal append) | 10.1 |
| FR-04 Integrity verification | `service_register_events` | `/sr/integrity/*` | 10.1 |
| FR-05 Corrigendum/supersession | `sr_corrections`, `service_register_events` | `/sr/events/{id}/corrigendum` | 10.1, 10.2 |
| FR-06 Annotation/dispute | `sr_corrections`, `service_register_events` | `/sr/events/{id}/dispute|annotate` | 10.1 |
| FR-07 Attestation | `sr_attestations`, `service_register_events` | `/sr/events/{id}/attest` | 10.1 |
| FR-08 Periodic verification | `sr_verification_cycles`, `sr_attestations` | `/sr/verification-cycles/*` | 10.3 |
| FR-09 Timeline | `service_register_events`, `sr_access_log` | `/sr/employees/{id}/timeline` | — |
| FR-10 Certified extract | `sr_certified_extracts`, `sr_attestations`, `documents` | `/sr/employees/{id}/extracts` | 10.5 |
| FR-11 QR verification | `sr_certified_extracts`, `sr_access_log` | `/sr/verify/{token}` | 10.5 |
| FR-12 Custody/access | `sr_access_log` | `/sr/access-log` | — |
| FR-13 Subscriptions | `sr_subscriptions`, `service_register_events` | `/sr/subscriptions/*`, `/sr/feed` | — |
| FR-14 Legacy digitisation | `sr_legacy_digitisation_batch/record`, `service_register_events` | `/sr/legacy/*` | 10.4 |
| FR-15 Retention/legal hold | `service_register_events` (policy/flags) | `/sr/.../legal-hold` | — |
| FR-16 Forensics/analytics | all SR entities | `/sr/forensics/*`, `/sr/analytics/summary` | — |

### 14.2 Dependency graph (build order)

```
FR-01 (taxonomy) → FR-02 (ingestion) → FR-03 (append/hash)
                                   ├→ FR-04 (integrity)
                                   ├→ FR-05 (corrigendum) → FR-06 (annotate/dispute)
                                   ├→ FR-07 (attest) → FR-08 (verification cycles)
                                   ├→ FR-09 (timeline) → FR-12 (access log)
                                   ├→ FR-10 (extract) → FR-11 (QR verify)
                                   ├→ FR-13 (subscriptions)
                                   ├→ FR-14 (legacy digitisation, uses FR-03)
                                   ├→ FR-15 (retention/hold)
                                   └→ FR-16 (forensics/analytics, reads all)
```

### 14.3 Parallel-agent plan

| Track | FRs | Can parallelise after |
|---|---|---|
| Core ledger | FR-01, FR-02, FR-03 | foundation; build first, serially |
| Integrity & forensics | FR-04, FR-16 | after FR-03 |
| Correction & attestation | FR-05, FR-06, FR-07, FR-08 | after FR-03 (FR-08 after FR-07) |
| Read & custody | FR-09, FR-12 | after FR-03 |
| Extracts | FR-10, FR-11 | after FR-07, FR-09 |
| Integration | FR-13 | after FR-03 |
| Migration | FR-14 | after FR-03 |
| Retention | FR-15 | after FR-03 |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area (from prompt) | Covered by | Status |
|---|---|---|
| Canonical SR event model & taxonomy | FR-01, E9 | ✅ |
| Every life event (appointment…retirement) | E9 catalog + `event_category` enum (17) | ✅ |
| Append-only immutability + crypto integrity (hash-chain) | FR-03, FR-04, integrity rules §5.6 | ✅ |
| Ingestion contract/API (idempotent, versioned, validated, provenance) | FR-02, E13 | ✅ |
| Correction handling (corrigendum/annotation, supersede, never delete) | FR-05, FR-06, E10 | ✅ |
| Attestation/verification by custodian | FR-07, E11 | ✅ |
| Periodic (5-yearly) service verification | FR-08, E12 | ✅ |
| SR view/timeline (chronological, filterable, printable) | FR-09 | ✅ |
| Digital signing & certified true copy | FR-10, E14 | ✅ |
| QR-verifiable certificates | FR-11 | ✅ |
| Custody & access control + access log | FR-12, E15 | ✅ |
| Retention (permanent + post-retirement archival) | FR-15 | ✅ |
| Bulk digitisation of legacy paper service books | FR-14, E17, E18 | ✅ |
| Blockchain-style verifiable ledger | FR-03 hash-chain + optional anchor (§4) | ✅ |
| Event subscriptions | FR-13, E16 | ✅ |
| Audit/forensics view | FR-16 | ✅ |
| `service_register_events` defined (full) | E8 (owned here) | ✅ |
| `sr_event_type` catalog | E9 | ✅ |
| `sr_corrections`/annotations | E10 | ✅ |
| `sr_attestations` | E11 | ✅ |
| `sr_verification_cycles` | E12 | ✅ |
| `sr_legacy_digitisation` | E17, E18 | ✅ |
| Multi-tenancy (tenants, isolation, P04) | §4.1, `tenant_id` on entities | ✅ |
| Platform workflow engine (P01) reuse | §4.1, FR-05/07/08/14 `WF-M12-*` | ✅ |
| Platform authorization + PII ceiling (P02) | §3.1 note, §4.1, FR-12 | ✅ |
| Dual audit logs + WORM tamper-evidence (P05 / OPEN-PLAT-03) | §4.1, FR-03/04 | ✅ |
| Background-jobs runner (X.1) | §4.1 `JOB-M12-*` | ✅ |
| Platform API conventions (envelope, cursor paging, idempotency, correlation id) | §4.1, §8.1 | ✅ |
| Migration ETL+V + `legacy_source_id` + `migration_runs` + waves (P06) | §13.1, FR-14, E8/E18 | ✅ |
| Notification standards + MSG-M12-* + Teams (X.2) | §11 | ✅ |
| Document vault / signer / retention class (M11) | FR-10 BR-10.4 | ✅ |
| AI chat agent grounding (P03) | §4.1 | ✅ |

**Unresolved gaps: 0.** This BRD is harmonised with the PrimeSoft HRMS platform deliverables (Product Vision v2.6, Platform Spec v1.6, Foundation FS v1.7, RBAC v1.7, Document Management FS v1.3).

---

## Section 15 — Glossary

| Term | Definition |
|---|---|
| **Service Register (SR) / Service Book** | The statutory, legally significant record of an employee's entire service history |
| **Digital SR** | The digital, append-only, tamper-evident equivalent of the paper service book (this module) |
| **Ledger entry** | A single immutable `service_register_events` row recording one life event |
| **Hash chain** | Per-employee linked sequence where each entry binds the previous entry's hash for tamper-evidence |
| **Entry hash / prev hash** | SHA-256 of an entry's canonical content (entry hash) and of the prior entry (prev hash) |
| **Provenance** | The `source_module` + reference identifying which system recorded the event |
| **Ingestion contract** | The governed, idempotent, versioned API by which modules post events |
| **Idempotency key** | Deterministic key ensuring an event is recorded exactly once despite retries |
| **Corrigendum** | A correcting entry that supersedes an erroneous one without deleting it |
| **Supersession** | Marking an entry SUPERSEDED while preserving it and pointing to its successor |
| **Annotation** | A statutory/contextual note attached to an entry without changing its content |
| **Attestation** | A signed confirmation (custodian or employee) of an entry's correctness |
| **Periodic verification** | The statutory (typically 5-yearly) employee review/confirmation of the SR |
| **Certified true copy / extract** | A digitally signed, QR-verifiable official copy of the SR (full or scoped) |
| **Qualifying service** | Service counted toward pension; impacted by leave/suspension events |
| **Legal hold** | A flag preventing archival movement and marking an SR for litigation |
| **SR Custodian / Registrar** | The accountable statutory custodian of the register |
| **Anchor** | An external notarised record of chain heads for independent integrity verification |

---

## Section 16 — Appendices

### 16.1 Appendix A — Canonical hashing specification

- **Canonical content** (hashed): `sr_event_id`, `tenant_id`, `employee_id`, `service_no`, `sequence_no`, `event_type_code`, `event_category`, `event_title`, `event_description`, `event_date`, `recorded_at`, `source_module`, `source_reference_id`, `source_event_version`, `order_no`, `order_date`, `sanctioning_authority`, canonicalised `payload` (sorted keys), `qualifying_service_impact`, `is_legacy`, `legacy_batch_id`, `legacy_source_id`, `document_ids` (sorted), `prev_event_hash`.
- **Excluded** (mutable status pointers, not hashed): `superseded_by_event_id`, `entry_status`, `attestation_status`.
- **Algorithm:** `SHA-256`; serialization JSON with sorted keys, UTC ISO-8601 timestamps, dates as `YYYY-MM-DD`, fixed numeric formatting. `ledger_version` records the canonicalisation revision.
- **Genesis:** first entry per employee uses `prev_event_hash = "GENESIS"`.
- **Anchoring (optional):** periodic Merkle root over per-employee chain heads timestamped to an external append-only store.

### 16.2 Appendix B — Launch SR event-type catalog (illustrative)

| Category | Example `event_type_code`s |
|---|---|
| APPOINTMENT | APPOINTMENT, RE_APPOINTMENT, AD_HOC_APPOINTMENT |
| CONFIRMATION | CONFIRMATION, PROBATION_EXTENSION, PROBATION_DECLARED |
| PROMOTION | PROMOTION, REVERSION, PROMOTION_CORRIGENDUM |
| TRANSFER / POSTING | TRANSFER, POSTING, RELIEVING, JOINING, MUTUAL_TRANSFER |
| PAY / INCREMENT | PAY_FIXATION, ANNUAL_INCREMENT, INCREMENT_WITHHELD, PAY_PROTECTION |
| LEAVE | EL_AVAILED, HPL_AVAILED, LWP_SPELL, EOL_SPELL, STUDY_LEAVE, MATERNITY_LEAVE, COMMUTED_LEAVE |
| TRAINING / QUALIFICATION | TRAINING_COMPLETED, QUALIFICATION_ADDED, DEPARTMENTAL_EXAM_PASSED |
| AWARD | AWARD, REWARD, COMMENDATION |
| PUNISHMENT / SUSPENSION | MINOR_PENALTY, MAJOR_PENALTY, SUSPENSION, SUSPENSION_REVOKED, CENSURE |
| DEPUTATION | DEPUTATION, DEPUTATION_RETURN, FOREIGN_SERVICE |
| IDENTITY | NAME_CHANGE, DOB_CHANGE, GENDER_CHANGE |
| SEPARATION | RETIREMENT, VOLUNTARY_RETIREMENT, RESIGNATION, DISMISSAL, DEATH_IN_SERVICE |

### 16.3 Appendix C — Cross-module write responsibilities

| Source module | SR event types it posts (examples) |
|---|---|
| M01 | APPOINTMENT, CONFIRMATION, IDENTITY (golden change records) |
| M03/M04 | LEAVE spells (EL/HPL/LWP/EOL/STUDY/MATERNITY) |
| M05 | TRANSFER, POSTING, RELIEVING, JOINING |
| M06 | PROMOTION, REVERSION, POSTING |
| M08 | APPRAISAL_RECORDED (APAR summary) |
| M09 | MINOR/MAJOR_PENALTY, SUSPENSION, CENSURE |
| M10 | PAY_FIXATION, ANNUAL_INCREMENT, INCREMENT_WITHHELD |
| M11 | (consumer; reads SR + pre-retirement verification gate) |
| M12 (this) | manual records, corrigenda, legacy digitisation, annotations |

### 16.4 Appendix D — Open assumptions

- Government PKI/HSM availability for qualified signatures; server-signed fallback recorded with upgrade path.
- Statutory verification cadence default 5 years; configurable per service rules.
- External anchoring store optional at launch; internal hash-chain verification is mandatory.
- Future-date tolerance for `event_date` configurable (default 0 days).

---

*End of M12-SR BRD v1.0.*
