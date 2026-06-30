# Document Management and Secure Storage — HRMS Module BRD (v2.0)

**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government/Public-Sector HCM
**Module:** M13 — Document Management and Secure Storage (M13-DMS)
**BRD code:** M13-DMS
**Owner of canonical `documents` entity:** This module (referenced by M01–M12, M14)
**Status:** v2.0 (authoritative build contract — supersedes v1)
**Reads with:** `docs/brd/SHARED_FOUNDATION.md` (shared entities, conventions, RBAC, technical defaults)
**Revision basis:** v1 BRD + Adversarial Council Report (`docs/evaluation/M13-document-management-secure-storage-council.md`) — all 21 Adopted Improvements incorporated; Critical/High risks R1–R22 mitigated as concrete requirements and controls.

> M13-DMS is the **shared, secure, statutory document repository** every other HRMS module depends on.
> It owns the `documents` entity and all document-related entities (versions, types, ACLs, retention,
> legal hold, audit, clearance, DPDP requests). M01–M12 do **not** store binaries; they **attach**
> documents through M13's frozen attach/fetch API and store only a `document_id` reference. This BRD
> defines that contract exhaustively, with the corrected VIEW-vs-DOWNLOAD fetch semantics and a defined
> principal clearance model.

---

## 1. Executive Summary

### 1.1 Purpose

This BRD specifies the **Document Management and Secure Storage** service — the enterprise content
repository for the HRMS. It provides a single, governed, encrypted, access-controlled store for every
file produced or consumed across the suite: identity proofs for personal-detail changes (M02), leave
sanction scans (M03/M04), relieving/joining orders (M05), promotion/posting orders (M06), training
certificates (M07), appraisal/APAR PDFs (M08), charge-sheets and inquiry exhibits (M09), payslips and
Form-16 (M10), Pension Payment Orders / PPOs and terminal-benefit dossiers (M11), and the statutory
Service Register page-images and certified copies (M12). Documents are stored once (within a single
security domain), versioned, classified, retained per statutory schedule, and made discoverable through
permission-aware search — while every view, download and print is audited to a **cryptographically
tamper-evident** trail and every binary is encrypted at rest and in transit.

### 1.2 Business context

Public-sector HR is **document-centric and statutory**. Service registers, charge memos, pension
orders and seniority records have legal weight; they must be tamper-evident, retained for decades (some
permanently), disposed of only under an approved disposition schedule, and frozen on legal hold during
litigation. Today these records are paper or scattered across drives with no version control, no
encryption, no access trail, and no retention governance. A breach, a lost original, or an unauthorised
alteration carries legal and audit consequences. M13-DMS centralises content under **defence-in-depth**
controls aligned to OWASP ASVS, the India DPDP Act 2023, the IT Act 2000 §3A (electronic signatures),
and government records-management practice, delivering the convenience (drag-drop, mobile capture,
instant preview, OCR search, e-signature) that world-class HCM users expect — without compromising
statutory custody.

### 1.3 Module objectives

1. Provide a **single canonical `documents` store** with a frozen, day-one-stubbed attach/fetch API that
   M01–M14 consume.
2. Enforce **encryption at rest** (envelope encryption via KMS, with a defined key-DR/escrow policy) and
   **in transit** (TLS 1.2+).
3. Provide **versioning** with optional (per-type) check-in/check-out, supersede, and immutable version history.
4. Enforce **multi-dimensional access control**: RBAC + org-relationship + **defined clearance** + classification
   + need-to-know, at record and field level, with deny-by-default.
5. Scan every upload for **malware**, validate file-type/size, and verify **integrity** by checksum.
6. Provide **OCR + permission-aware search**, thumbnails/previews (rendered in sandboxed, resource-limited
   workers), and **domain-scoped deduplication** that never leaks existence.
7. Govern content lifecycle: **retention schedules, legal hold (with SoD on placement and release), and
   approved disposition**, with **WORM** immutability for statutory documents and an explicit
   retention/hold/WORM/DPDP-erasure **precedence lattice**.
8. Provide **decade-durable e-signatures** (RFC-3161 timestamping + PAdES-LTV), watermarking, certified
   copies (v1), redaction (fast-follow), and DLP.
9. **Audit every access** (view/download/print/share) to an immutable, **hash-chained, externally-anchored**
   trail and surface compliance reports.

### 1.4 Scope summary

In scope: upload/ingestion, document types & metadata taxonomy, classification/tagging, folders/cabinets,
versioning, encryption/KMS (+ key-DR), access control (incl. principal clearance), malware scanning,
validation, sandboxed OCR/search, retention/legal-hold/disposition (with future-match capture and
event-driven anchors), e-signature (LTV-durable), watermarking/certified copies, access audit
(hash-chained + anchored), secure sharing/expiring links (anti-brute-force), WORM, domain-scoped
deduplication/integrity, previews, DLP, content lifecycle, orphan reaping, DPDP data-subject requests,
and the provider-abstracted storage/AV/OCR/DLP/PKI layer. **Phase 2 (fast-follow):** interactive redaction
studio. Out of scope: business workflows that *use* documents (those live in M01–M12), payroll/pension
calculation, and end-user identity management (shared `users`).

### 1.5 Key outcomes

- One governed source of truth for all HRMS content; modules store only references.
- Tamper-evident (cryptographically anchored), encrypted, audited custody for statutory records.
- Faster retrieval (permission-aware search + previews) and lower storage cost (domain-scoped dedup).
- Defensible compliance posture: retention enforced, holds honoured (incl. future matches), erasure
  reconciled with statutory duty, disposition certified, signatures verifiable for decades.

### 1.6 Plain-language narrative — "what happens when I drag a PDF in"

> *For non-engineers (records officers, clerks, approvers):*
>
> 1. **You drop a file** (or scan/photograph it). You pick the **document type** (e.g., "Charge Sheet")
>    and fill the short form it asks for.
> 2. The system **checks it for viruses** and confirms the file is what it claims to be. If it is infected,
>    it is locked away and Security is told; you see only "blocked by security scan."
> 3. The clean file is **encrypted and stored once**. If an identical file already exists *in the same
>    sensitivity level*, the system quietly reuses storage — you are never told whether a copy already
>    existed (so no one can probe for secret documents).
> 4. The system **reads the text** inside (OCR) so you can find it later by searching words on the page —
>    but you only ever see documents you are cleared and permitted to see.
> 5. The document gets a **retention clock** (how long it must be kept) and, for statutory records, a
>    **WORM lock** (cannot be changed or deleted until its lawful time).
> 6. From then on, **every time anyone views, downloads or prints it, that is recorded** in a tamper-proof
>    log. Sharing, signing, certifying a true copy, placing a legal hold, and final disposal all follow
>    approval steps with a second person signing off where the law requires it.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Area | Capability | Primary FR(s) |
|------|-----------|---------------|
| Ingestion | Single/bulk/drag-drop upload, scanner ingestion, mobile capture | FR-M13-001 |
| Taxonomy | Document types, metadata schema, classification & tagging, allowed-signature/checkout policy | FR-M13-002 |
| Structure | Folders/cabinets, module-context linking, attach API | FR-M13-003 |
| Versioning | Version history, optional check-in/check-out, supersede | FR-M13-004 |
| Cryptography | Envelope encryption (KMS), TLS, key rotation, key-DR/escrow | FR-M13-005 |
| Access control | RBAC + relationship + clearance + classification + need-to-know; record/field-level | FR-M13-006 |
| Safety | Malware scan, file-type/size validation, quarantine, render sandboxing | FR-M13-007 |
| Discovery | Sandboxed OCR, permission-aware search, secured index, faceted filters | FR-M13-008 |
| Lifecycle | Retention, legal hold (SoD + future-match), event-driven disposition | FR-M13-009 |
| Signing | E-signature & digital signing (PAdES-LTV + RFC-3161 TSA) | FR-M13-010 |
| Rendition | Watermarking & certified copies (v1) | FR-M13-011 |
| Audit | View/download/print audit + compliance reporting | FR-M13-012 |
| Sharing | Secure internal/external sharing, expiring links, anti-brute-force | FR-M13-013 |
| Immutability | WORM storage for statutory documents | FR-M13-014 |
| Integrity | Domain-scoped dedup, checksums, sandboxed thumbnails/previews | FR-M13-015 |
| Governance | DLP, content lifecycle, provider-abstracted storage/AV/OCR/DLP/PKI, attach/fetch | FR-M13-016 |
| Clearance | Principal security-clearance assignment & lifecycle | FR-M13-017 |
| Privacy | DPDP data-subject requests & erasure precedence lattice | FR-M13-018 |
| Hygiene | Orphaned-document lifecycle (orphan reaper) | FR-M13-019 |
| Tamper-evidence | Audit hash-chain integrity & external anchoring | FR-M13-020 |
| Rendition (Phase 2) | Interactive redaction studio (fast-follow) | FR-M13-021 |

### 2.2 Common Capabilities (inherited, applied module-wide)

- UUIDv4 PKs; separate human-readable business keys (`doc_no`).
- Audit fields on every mutable table; append-only, **hash-chained** ledgers for access audit and version history.
- UPPER_SNAKE_CASE enums catalogued in §5.5.
- UTC storage; `DD-MMM-YYYY` display; user-locale rendering.
- All list endpoints paginated (page/limit, hard max 100).
- Maker-checker for sensitive lifecycle actions (disposition, **legal-hold placement and release**,
  classification downgrade, clearance grant, DPDP erasure decision).
- Shared canonical error envelope and standard codes (§10).
- All four content-processing engines (AV, OCR, DLP, PKI) and storage sit behind **provider interfaces**
  so build-vs-buy is a deployment choice, not an architecture rewrite.

### 2.3 Boundaries & integration points

- **M01 Employee Profile** — documents linked to `employee_id` context; employee photo/ID proofs;
  emits `EMPLOYEE_RETIRE`/`EMPLOYEE_MERGE` lifecycle events (anchor recompute).
- **M02 Personal Details** — proof documents for change requests; verified→attached lifecycle.
- **M03/M04 Leave/SR** — medical certificates, sanction orders posted to Digital SR.
- **M05/M06 Transfer/Promotion** — relieving/joining/promotion order PDFs.
- **M07 Training** — certificates, course material.
- **M08 Appraisal** — APAR/PDF, calibration evidence.
- **M09 Disciplinary** — charge-sheets, inquiry exhibits, sealed PI reports (confidential vault);
  emits `CASE_CLOSE` lifecycle events.
- **M10/M11 Payroll/Pension** — payslips, Form-16, PPO, terminal-benefit dossiers (long retention);
  M11 emits `EMPLOYEE_RETIRE` confirmation.
- **M12 Digital SR** — page-images, certified true copies, WORM statutory records.
- **M14 Dashboard** — reads document compliance metrics (read-only).
- **Platform** — `users`, `roles`, `org_units`, `notifications`, `audit_log`, KMS (+ key-DR),
  object storage, antivirus engine, OCR engine, signing/PKI service, **RFC-3161 TSA**, **event bus/outbox**.

### 2.4 Explicit non-goals

- M13 does not implement module-specific business workflows (e.g., disciplinary due-process) — it stores
  their documents.
- M13 does not author content (no word processor); it ingests and renders. (This is why check-out/check-in
  is **optional per type**, not mandatory — see FR-M13-004.)
- M13 does not own user identity/authentication (shared `users`/OIDC) — but it **does** own the
  document-domain **clearance** attribute attached to a principal (FR-M13-017).
- M13 does not compute payroll/pension; it stores their outputs.

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict)

Roles are deliberately distinct to preserve **segregation of duties (SoD)**; the council noted apparent
overlap, so each role below now carries an explicit **why-distinct** note. A small office may provision one
person into several roles, but the system still forbids the same principal performing both sides of any
maker-checker action.

| Role | Description | Why distinct (SoD) |
|------|-------------|--------------------|
| **Document Owner** | Subject/officer who uploaded or to whom a record belongs; manages own non-statutory docs. | Owner is record-scoped (one document set); Employee Self-Service is identity-scoped. In practice they may be the same person — see consolidation note below. |
| **Employee (Self-Service)** | Views/downloads own permitted documents; e-signs assigned documents. | The end-user persona; cannot manage taxonomy/retention. |
| **Uploader (Module Service)** | Any M01–M12 service principal attaching documents on behalf of a workflow. | Machine principal; no human read rights. |
| **DMS Librarian** | Manages taxonomy, folders, classification *upgrades*, retention *assignment*; **proposes** disposition. | The **maker** for lifecycle. Cannot approve its own proposals. |
| **Records Manager (Custodian)** | **Approves** disposition, manages WORM, certifies true copies. | The **checker** for lifecycle. maker ≠ checker enforced. |
| **Legal Hold Administrator** | **Places** legal holds; manages e-discovery exports. | Separated from Records Manager so the person who freezes records is not the person who can destroy them. |
| **Legal Hold Approver** | **Approves** placement of high-value holds and **all hold releases** (dual control). | NEW (R10). Release re-enables destruction; it now requires a second authority. |
| **Security / DLP Officer** | Manages classification *downgrade* approval, DLP rules, quarantine release, key policy, **clearance grants**, anti-brute-force unlocks. | Holds the "lower the guard" powers; separated from those who use the records. |
| **Auditor (read-only)** | Reads documents (per clearance) and the full access-audit trail + chain-verification; no write. | Read-only by construction. |
| **System Administrator** | Storage configuration, KMS policy binding, key-DR runbook execution, scanner/OCR integration. **Cannot read CONFIDENTIAL+ content** (break-glass only, dual-control, audited). | Infrastructure power without content power. |
| **Data Protection Officer (DPO)** | Receives and adjudicates DPDP data-subject requests; records legal-basis exemptions. | NEW (R8). Privacy authority, separate from records custody. |

> **Consolidation note (usability, improvement 21):** *Document Owner* and *Employee (Self-Service)* are the
> **same human persona** acting on, respectively, documents they manage and their own identity records; they
> are listed separately only because the permission scopes differ. Provisioning UIs present them as one
> "Employee" profile with an optional "manages a shared cabinet" flag. *Librarian* (maker) and *Records
> Manager* (checker) must remain distinct to preserve disposition SoD.

> **Segregation of duties:** the disposition approver ≠ the librarian who proposed it; the legal-hold placer
> ≠ the approver who releases it; the clearance grantee ≠ the grantor; no principal may both downgrade a
> classification and access the downgraded record in the same transaction; the DPO who exempts an erasure ≠
> the custodian who would execute it.

### 3.2 Permission matrix (C=Create/Upload, R=Read/View, U=Update metadata, D=Download, P=Print, A=Approve/Decide, X=No access)

| Capability | Doc Owner | Uploader | Librarian | Records Mgr | LH Admin | LH Approver | Security/DLP | DPO | Auditor | Sys Admin | Employee |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Upload document | C | C | C | C | X | X | X | X | X | X | C (own) |
| View document (per clearance) | R | R | R | R | R | R | R | R | R | X | R (own) |
| Download / Print | D/P | D | D/P | D/P | D | D | D | D | D | X | D/P (own) |
| Update metadata/tags | U | U | U | U | X | X | U | X | X | X | U (own, limited) |
| New version / check-in-out | C/U | C/U | C/U | C/U | X | X | X | X | X | X | C/U (own) |
| Manage document types/taxonomy | X | X | C/U | R | X | X | R | X | R | X | X |
| Classify (upgrade) | X | U | U | U | X | X | A | X | R | X | X |
| Reclassify (downgrade) | X | X | C (propose) | R | X | X | A | X | R | X | X |
| Assign / manage retention | X | X | C/U | A | X | X | R | R | R | X | X |
| Place legal hold | X | X | X | R | C | A (high-value) | R | R | R | X | X |
| Release legal hold (dual control) | X | X | X | R | C (propose) | A | R | R | R | X | X |
| Approve disposition / destruction | X | X | C (propose) | A | X | X | R | R | R | X | X |
| Manage WORM / certified copies | X | X | X | A | X | X | R | X | R | X | X |
| Secure share / expiring link | C | C | C | C | X | X | A | X | R | X | C (own) |
| Quarantine release (malware) | X | X | X | X | X | X | A | X | R | X | X |
| KMS key / storage / key-DR config | X | X | X | X | X | X | A | X | R | A | X |
| Grant/revoke principal clearance | X | X | X | X | X | X | C (propose) | X | R | X | X |
| Approve clearance grant (checker) | X | X | X | A | X | X | R | X | R | X | X |
| Adjudicate DPDP request / exemption | X | X | X | R | X | X | R | A | R | X | R (raise own) |
| Verify audit hash-chain / anchor | X | X | X | R | X | X | R | X | A | X | X |
| Read access-audit trail | R (own) | X | R | R | R | R | R | R | R | X | R (own) |

### 3.3 Field-level & record-level confidentiality rules

- **Clearance gates visibility — and clearance is now a real, stored attribute.** A principal sees a document
  only if `effective_clearance_level ≥ document.classification` **AND** an ACL/relationship grant exists
  (deny-by-default). `effective_clearance_level` is read from the **`security_clearances`** entity
  (FR-M13-017) for the principal, defaulting to `INTERNAL` if no active clearance exists. Classifications:
  `PUBLIC < INTERNAL < CONFIDENTIAL < SECRET < TOP_SECRET`.
- **TOP_SECRET — justification (R22, improvement 19).** The level is **retained** (not dropped) because the
  public-sector context includes genuinely compartmented records — sealed CVC/vigilance preliminary-inquiry
  reports and certain national-security-adjacent service matters — that require a tier above ordinary SECRET
  with mandatory dual-approver clearance and alerting. It is, however, restricted to system-seeded statutory
  types and may not be hand-applied by a Librarian.
- **Sealed records** (e.g., M09 preliminary-inquiry reports, vigilance) carry `is_sealed=true` and are
  invisible to the subject employee even when they own related records.
- **Need-to-know** restricts CONFIDENTIAL+ to principals on the document's ACL or in the originating
  workflow, regardless of generic role power.
- **Field masking:** in list/search results, restricted documents show only non-sensitive metadata
  (type, date) with body/preview suppressed; full metadata requires record access.
- **Auditor** can read content per clearance but cannot alter; **Sys Admin** manages infrastructure but
  cannot read CONFIDENTIAL+ content (break-glass only, dual-control, audited, rate-limited).

---

## 4. Shared Application Foundation

Inherits `docs/brd/SHARED_FOUNDATION.md` §5 wholesale:

- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) frontend; REST `/api/v1`; PostgreSQL for
  metadata; **object storage** (S3-compatible / government cloud blob) for binaries, **encrypted at rest**;
  KMS for envelope keys; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT access tokens; RBAC + row-level scoping by `org_unit_id`.
- **Canonical error envelope:** `{ "error": { "code": "...", "message": "...", "field": "..." }, "requestId": "..." }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404),
  CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module codes (§10.3).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail, DPDP 2023 alignment,
  IT Act §3A signatures, statutory retention.
- **NFR baseline:** P95 API < 500 ms (metadata ops); 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min, RTO ≤ 4 h.

**M13-specific platform services consumed (all provider-abstracted, improvement 14):** Key Management Service
(KMS, with multi-region/HSM key-DR), antivirus/malware engine (ICAP/cloud) behind `ScanProvider`, OCR engine
behind `OcrProvider`, content-extraction/text-index engine (e.g., OpenSearch/Elasticsearch — **encrypted at
rest, access-scoped**) behind `IndexProvider`, sandboxed thumbnail/preview renderer, PKI/e-signature provider
behind `SigningProvider`, an **RFC-3161 Time-Stamping Authority (TSA)**, and a durable **event bus / outbox**
for module lifecycle events. Each provider is selected by configuration; on-prem (data-sovereignty-compliant)
implementations are the default at CGG, with COTS adapters permitted where residency allows.

---

## Amendments (v1 → v2)

| # | Adopted improvement (council) | Risk(s) | Where/how incorporated in v2 |
|---|-------------------------------|---------|------------------------------|
| 1 | Define `clearance_level` | R3 | New entity **E21 `security_clearances`** (§5.2); new **FR-M13-017**; §3.3 now reads `effective_clearance_level` from a real field; enum `clearance_status`; matrix rows for grant/approve clearance |
| 2 | Resolve dedup vs key-separation | R1, R9 | `storage_objects.security_domain`, `key_scope`, `dek_shared` (§5.2 E19); **DI-6** rewritten (domain-scoped dedup, no cross-classification); FR-005 BR-4, FR-015 BR-1/AC-1; crypto-shred precondition stated |
| 3 | Eliminate dedup oracle | R9 | FR-015 (HMAC-keyed dedup index, no user-visible "duplicate" signal); FR-001 edge cases; DI-6; NFR Privacy |
| 4 | Fix the fetch contract (VIEW vs DOWNLOAD) | R2 | FR-016 `:fetch` rewritten with `intent=VIEW|DOWNLOAD`, structurally different responses; audited proxy render; §10.4 JSON examples replaced; FR-013; enum `fetch_intent`; error `FETCH_INTENT_REQUIRED` |
| 5 | Decade-durable signatures (RFC-3161 + PAdES-LTV) | R4 | New entity **E26 `signature_ltv_artifacts`** (§5.2); `signatures.tsa_token_ref`, `ltv_status`; FR-010 AC/BR; enum `ltv_status`; error `SIGNATURE_LTV_REQUIRED` |
| 6 | Cryptographically anchor the audit log | R5 | `document_audit.prev_hash`, `row_hash` (E12); new entity **E23 `audit_anchors`**; **DI-3** rewritten; new **FR-M13-020**; report "Audit chain health" |
| 7 | Restrict signature methods by document type | legal | `document_types.allowed_signature_types`, `signature_legal_basis`; `signatures.legal_basis`; FR-002 AC, FR-010 BR; error `SIGNATURE_METHOD_NOT_ALLOWED` |
| 8 | KMS key-DR/escrow policy | R6 | FR-005 (BR-5/6, key-recovery runbook, key-loss behaviour); NFR Availability (KMS named top-tier); Appendix E (Key-DR runbook); enum unchanged |
| 9 | Secure the search index | R7 | FR-008 (index encrypted-at-rest, access-scoped; SECRET/TOP_SECRET excluded from full-text → metadata-only / per-domain index); NFR Security |
| 10 | DPDP precedence lattice | R8 | New entity **E22 `data_subject_requests`**; new **FR-M13-018**; **BR (DI-15)** precedence lattice; enums `dsr_type`,`dsr_status`,`erasure_method`; §3 DPO role |
| 11 | SoD on legal-hold release | R10 | `legal_holds.release_proposed_by/release_approved_by`; FR-009 AC-7/BR-4; Legal Hold Approver role; §12.3 state table; error `HOLD_RELEASE_SOD` |
| 12 | Holds capture future matches | R11 | New entity **E24 `hold_notices`**; `legal_hold_items.is_auto_added`; FR-009 AC-8/BR-5 (continuous-evaluation job + custodian acknowledgement); enum `hold_notice_status` |
| 13 | Event-driven anchor recompute | R12 | New entity **E25 `lifecycle_event_inbox`**; FR-009 AC-9/BR-6 (outbox subscription, block auto-DESTROY without confirmed anchor); §10.5 event contracts; enum `lifecycle_event_type` |
| 14 | Provider-abstract all four engines | R13 | §4 provider interfaces; FR-016 LLD (`ScanProvider`/`OcrProvider`/`DlpProvider`/`SigningProvider`/`IndexProvider`); NFR Maintainability |
| 15 | Freeze + stub attach/fetch contract day one | R14 | §15.0 "Day-one contract freeze"; §16.2 build order step 0; §16.3 mock-contract track; Appendix F (stub contract) |
| 16 | Orphaned-document lifecycle | R15 | New **FR-M13-019** (orphan reaper); `document_status` adds `ORPHANED`; `documents.link_count`; report "Orphaned documents"; §12.1 transition |
| 17 | Anti-brute-force controls | R16 | `document_shares.failed_attempt_count`,`locked_until`; FR-013 AC/BR; break-glass lockout in FR-005; errors `SHARE_LOCKED`,`BREAK_GLASS_LOCKED`; NFR Security |
| 18 | Sandbox/resource-limit render workers | R17 | FR-007 (archive/decompression limits), FR-008 & FR-015 (sandboxed OCR/preview, billion-laughs/nested-PDF guards); error `RENDER_RESOURCE_LIMIT`; NFR Security |
| 19 | Phase scope; optional check-out; justify TOP_SECRET | R13, R22 | FR-011 split → certified copies **v1**, **FR-M13-021 redaction (Phase 2)**; `document_types.checkout_mode`; FR-004 optional lock; §3.3 TOP_SECRET justification; §16 phase plan |
| 20 | Harden migration/restore/residency/notifications | R18–R21 | §15 (gated migration with reconciliation SLAs + dead-letter; DB-restore-vs-immutable-store runbook); NFR Data Residency (in-country replicas); §13 (suppress identifiers for sealed/SECRET) |
| 21 | Plain-language narrative + role clarity | usability | §1.6 narrative; §3.1 why-distinct notes + consolidation note; FR-017 clearance assignment described in plain terms |

---

## 5. Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Owner | Purpose |
|---|--------|------|-------|---------|
| E1 | `documents` | **Module (CANONICAL, owned here)** | M13 | Master document/object metadata record referenced by all modules |
| E2 | `document_versions` | Module | M13 | Immutable version history of each document's content |
| E3 | `document_types` | Module | M13 | Document-type taxonomy + metadata schema + default retention/classification + signature/checkout policy |
| E4 | `folders` | Module | M13 | Cabinet/folder hierarchy organising documents |
| E5 | `document_acls` | Module | M13 | Per-document access grants (principal × right × scope) |
| E6 | `document_tags` | Module | M13 | Classification labels & free/controlled tags on documents |
| E7 | `document_links` | Module | M13 | Polymorphic link between a document and a module-context object (attach contract) |
| E8 | `retention_policies` | Module | M13 | Retention/disposition schedules (trigger, period, action) |
| E9 | `retention_assignments` | Module | M13 | Binds a retention policy to a document/type/folder + computed disposition date |
| E10 | `legal_holds` | Module | M13 | Legal-hold matters that freeze disposition (now with release SoD) |
| E11 | `legal_hold_items` | Module | M13 | Join of a legal hold to held documents (now with auto-added future matches) |
| E12 | `document_audit` | Module (append-only, hash-chained) | M13 | Immutable, tamper-evident log of every view/download/print/share access |
| E13 | `document_shares` | Module | M13 | Secure shares / expiring signed links (internal & external) with anti-brute-force |
| E14 | `checkout_locks` | Module | M13 | Optional check-out / check-in exclusive edit locks |
| E15 | `scan_results` | Module | M13 | Malware-scan + content-extraction + integrity results per version |
| E16 | `signature_requests` | Module | M13 | E-signature/digital-signing request + signer envelope |
| E17 | `signatures` | Module | M13 | Individual applied signatures (PAdES) on a document version |
| E18 | `disposition_records` | Module | M13 | Certified destruction/transfer/review events at end of retention |
| E19 | `storage_objects` | Module | M13 | Physical blob descriptor (bucket/key/checksum/encryption + security-domain) |
| E20 | `dlp_findings` | Module | M13 | Data-loss-prevention/classification findings on content |
| **E21** | **`security_clearances`** | **Module (NEW)** | M13 | Principal document-domain clearance level + lifecycle (R3) |
| **E22** | **`data_subject_requests`** | **Module (NEW)** | M13 | DPDP access/erasure/rectification requests + precedence outcome (R8) |
| **E23** | **`audit_anchors`** | **Module (NEW, append-only)** | M13 | Periodic hash-chain digests anchored to WORM/external notary (R5) |
| **E24** | **`hold_notices`** | **Module (NEW)** | M13 | Custodian legal-hold notices + acknowledgements (R11) |
| **E25** | **`lifecycle_event_inbox`** | **Module (NEW)** | M13 | Inbound M01/M09/M11 lifecycle events for anchor recompute (R12) |
| **E26** | **`signature_ltv_artifacts`** | **Module (NEW)** | M13 | RFC-3161 timestamp tokens + OCSP/CRL revocation data for PAdES-LTV (R4) |
| — | `employees`, `users`, `org_units`, `roles`, `service_register_events`, `notifications`, `audit_log` | Shared | M01/M12/platform | Referenced, not redefined |

### 5.2 Full field tables

#### E1 — `documents` (CANONICAL — owned by M13, referenced by all modules)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `document_id` | UUID PK | N | Stable reference held by all modules |
| `doc_no` | VARCHAR(40) UNIQUE | N | Human key, e.g. `DOC/2026/0001234` |
| `title` | VARCHAR(255) | N | Display name |
| `description` | TEXT | Y | |
| `document_type_id` | UUID FK→document_types | N | Drives metadata schema & defaults |
| `folder_id` | UUID FK→folders | Y | Cabinet/folder placement |
| `owner_employee_id` | UUID FK→employees | Y | Record owner (subject), if person-bound |
| `owning_org_unit_id` | UUID FK→org_units | N | Row-level scope |
| `current_version_id` | UUID FK→document_versions | Y | Pointer to active version (deferrable FK) |
| `current_version_no` | INT | N | Denormalised latest version number; default 1 |
| `classification` | ENUM `classification_level` | N | PUBLIC…TOP_SECRET; default INTERNAL |
| `security_domain` | VARCHAR(40) | N | Key/dedup domain (e.g., `DOM_INTERNAL`, `DOM_CONFIDENTIAL`, `DOM_SECRET`); derived from classification + org policy; **dedup never crosses this boundary** (R1/R9) |
| `status` | ENUM `document_status` | N | State machine (§12.1); incl. `ORPHANED` |
| `link_count` | INT | N | Count of active `document_links`; 0 ⇒ orphan candidate (R15); default 0 |
| `mime_type` | VARCHAR(120) | N | Of current version |
| `size_bytes` | BIGINT | N | Of current version |
| `content_hash` | CHAR(64) | N | SHA-256 of current version (integrity) |
| `is_sealed` | BOOLEAN | N | Hidden from subject even if owner; default false |
| `is_worm` | BOOLEAN | N | Immutable statutory storage; default false |
| `is_record_declared` | BOOLEAN | N | Declared as a formal record (locks metadata); default false |
| `legal_hold_count` | INT | N | >0 ⇒ disposition blocked; default 0 |
| `retention_assignment_id` | UUID FK→retention_assignments | Y | Governing retention |
| `disposition_due_date` | DATE | Y | Computed eligible-for-disposition date |
| `anchor_confirmed` | BOOLEAN | N | True only when the retention anchor event is confirmed by source module; **auto-DESTROY blocked while false** (R12); default false |
| `source_channel` | ENUM `source_channel` | N | WEB_UPLOAD / BULK / SCANNER / MOBILE / API / SYSTEM_GENERATED |
| `scan_status` | ENUM `scan_status` | N | PENDING / CLEAN / INFECTED / QUARANTINED / SKIPPED |
| `language_code` | VARCHAR(8) | Y | OCR-detected/declared (e.g. `en`, `hi`, `te`) |
| `dpdp_erasure_state` | ENUM `erasure_method` | Y | Null normally; set when a DPDP request resolves (R8) |
| `created_at`/`updated_at` | TIMESTAMPTZ | N | |
| `created_by`/`updated_by` | UUID | N | |
| `is_deleted` | BOOLEAN | N | Soft delete (blocked while WORM/legal-hold) |

#### E2 — `document_versions`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `version_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `version_no` | INT | N | 1-based, monotonically increasing |
| `storage_object_id` | UUID FK→storage_objects | N | Where bytes live |
| `mime_type` | VARCHAR(120) | N | |
| `size_bytes` | BIGINT | N | |
| `content_hash` | CHAR(64) | N | SHA-256 of this version |
| `change_summary` | VARCHAR(500) | Y | Check-in comment |
| `version_kind` | ENUM `version_kind` | N | ORIGINAL / NEW_VERSION / SUPERSEDE / CERTIFIED_COPY / REDACTED / SIGNED |
| `is_supersede` | BOOLEAN | N | Replaces prior original (e.g., re-scan); default false |
| `superseded_version_id` | UUID FK→document_versions | Y | If supersede |
| `derived_from_version_id` | UUID FK→document_versions | Y | Source for certified/redacted/signed derivatives |
| `ocr_status` | ENUM `ocr_status` | N | PENDING / DONE / FAILED / NOT_APPLICABLE |
| `created_by` | UUID FK→users | N | Who checked in |
| `created_at` | TIMESTAMPTZ | N | Append-only (no update/delete) |

#### E3 — `document_types`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `document_type_id` | UUID PK | N | |
| `type_code` | VARCHAR(60) UNIQUE | N | e.g. `ID_PROOF`, `CHARGE_SHEET`, `PPO`, `SR_PAGE` |
| `name` | VARCHAR(160) | N | |
| `category` | ENUM `doc_category` | N | IDENTITY / SERVICE / FINANCIAL / DISCIPLINARY / MEDICAL / TRAINING / PENSION / STATUTORY / OTHER |
| `metadata_schema` | JSONB | N | JSON-Schema of required/optional metadata fields |
| `default_classification` | ENUM `classification_level` | N | |
| `default_security_domain` | VARCHAR(40) | N | Default dedup/key domain for the type |
| `default_retention_policy_id` | UUID FK→retention_policies | Y | |
| `is_worm_default` | BOOLEAN | N | Statutory types default to WORM |
| `requires_signature` | BOOLEAN | N | e.g. certified copies |
| `allowed_signature_types` | TEXT[] | N | Whitelist subset of `signature_type`; statutory types exclude `DRAWN` (R7) |
| `signature_legal_basis` | VARCHAR(120) | Y | e.g. `IT_ACT_3A_DSC`, `IT_ACT_3A_AADHAAR` |
| `checkout_mode` | ENUM `checkout_mode` | N | NONE / OPTIONAL / REQUIRED — M13 does not author content, so default OPTIONAL (R22) |
| `allowed_mime_types` | TEXT[] | N | Whitelist (e.g. `application/pdf`, `image/tiff`) |
| `max_size_mb` | INT | N | Per-type size cap |
| `is_top_secret_eligible` | BOOLEAN | N | Only system-seeded statutory types may carry TOP_SECRET (§3.3) |
| `is_active` | BOOLEAN | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E4 — `folders`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `folder_id` | UUID PK | N | |
| `parent_folder_id` | UUID FK→folders | Y | Null at cabinet root |
| `name` | VARCHAR(160) | N | |
| `path` | VARCHAR(1024) | N | Materialised path, e.g. `/Employees/EMP-3001/Service` |
| `folder_type` | ENUM `folder_type` | N | CABINET / EMPLOYEE / MODULE / CASE / SHARED / SYSTEM |
| `context_module` | VARCHAR(10) | Y | e.g. `M09` when module-scoped |
| `context_ref_id` | UUID | Y | e.g. case_id / employee_id |
| `owning_org_unit_id` | UUID FK→org_units | N | Row-level scope |
| `default_classification` | ENUM `classification_level` | Y | Inherited by children |
| `is_system_managed` | BOOLEAN | N | Auto-provisioned (e.g., per-employee) |
| audit fields | | | created/updated/by/is_deleted |

#### E5 — `document_acls`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `acl_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | Y | Null if folder-level grant |
| `folder_id` | UUID FK→folders | Y | Null if document-level grant |
| `principal_type` | ENUM `principal_type` | N | USER / ROLE / ORG_UNIT / RELATIONSHIP |
| `principal_ref` | VARCHAR(80) | N | user_id / role code / org_unit_id / relationship key |
| `rights` | TEXT[] | N | Subset of {VIEW, DOWNLOAD, PRINT, UPDATE, VERSION, SHARE, MANAGE_ACL} |
| `effect` | ENUM `acl_effect` | N | ALLOW / DENY (DENY wins) |
| `need_to_know` | BOOLEAN | N | Requires workflow membership in addition to role |
| `expires_at` | TIMESTAMPTZ | Y | Time-boxed grant |
| `granted_by` | UUID FK→users | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E6 — `document_tags`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `tag_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `tag_type` | ENUM `tag_type` | N | CLASSIFICATION / KEYWORD / PII_CATEGORY / RETENTION_HINT / SYSTEM |
| `tag_key` | VARCHAR(80) | N | Controlled vocabulary key |
| `tag_value` | VARCHAR(160) | Y | |
| `applied_by` | ENUM `tag_origin` | N | USER / OCR / DLP / SYSTEM |
| `confidence` | NUMERIC(4,3) | Y | For auto-applied (0–1) |
| audit fields | | | created/updated/by/is_deleted |

#### E7 — `document_links` (the attach contract used by M01–M12)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `link_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `module_code` | VARCHAR(10) | N | M01…M12 |
| `entity_name` | VARCHAR(80) | N | Referencing entity, e.g. `change_requests`, `charge_sheets` |
| `entity_ref_id` | UUID | N | PK value in that entity |
| `link_role` | VARCHAR(60) | N | Semantic role, e.g. `PROOF`, `ORDER`, `EXHIBIT`, `CERTIFICATE` |
| `is_primary` | BOOLEAN | N | Primary attachment for the entity |
| `linked_by` | UUID FK→users | N | |
| `detached_at` | TIMESTAMPTZ | Y | Set on detach; drives `documents.link_count` recompute (R15) |
| audit fields | | | created/updated/by/is_deleted |

#### E8 — `retention_policies`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `retention_policy_id` | UUID PK | N | |
| `policy_code` | VARCHAR(60) UNIQUE | N | e.g. `RET_SR_PERMANENT`, `RET_PAYSLIP_8Y` |
| `name` | VARCHAR(160) | N | |
| `trigger_event` | ENUM `retention_trigger` | N | ON_CREATE / ON_SUPERSEDE / ON_EMPLOYEE_RETIRE / ON_CASE_CLOSE / FISCAL_YEAR_END |
| `retention_period_months` | INT | Y | Null ⇒ permanent |
| `is_permanent` | BOOLEAN | N | |
| `disposition_action` | ENUM `disposition_action` | N | DESTROY / ARCHIVE_TRANSFER / REVIEW |
| `review_required` | BOOLEAN | N | Records-manager approval before disposition |
| `requires_confirmed_anchor` | BOOLEAN | N | If true, auto-DESTROY blocked until `documents.anchor_confirmed` (R12); default true for event-triggered |
| `statutory_basis` | VARCHAR(160) | Y | Rule/citation |
| `is_active` | BOOLEAN | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E9 — `retention_assignments`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `retention_assignment_id` | UUID PK | N | |
| `retention_policy_id` | UUID FK→retention_policies | N | |
| `scope_type` | ENUM `retention_scope` | N | DOCUMENT / DOCUMENT_TYPE / FOLDER |
| `scope_ref_id` | UUID | N | Target id per scope_type |
| `trigger_anchor_date` | DATE | Y | Resolved anchor (e.g., retirement date) |
| `anchor_source_event_id` | UUID FK→lifecycle_event_inbox | Y | Event that set/confirmed the anchor (R12) |
| `disposition_due_date` | DATE | Y | anchor + period (null if permanent) |
| `status` | ENUM `retention_status` | N | ACTIVE / DUE / HELD / DISPOSED |
| audit fields | | | created/updated/by/is_deleted |

#### E10 — `legal_holds`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `legal_hold_id` | UUID PK | N | |
| `hold_no` | VARCHAR(40) UNIQUE | N | e.g. `LH/2026/007` |
| `matter_name` | VARCHAR(200) | N | Litigation/inquiry name |
| `reason` | TEXT | N | |
| `authority` | VARCHAR(160) | N | Court/CVC/competent authority |
| `match_criteria` | JSONB | Y | Saved-search/employee/case predicate for continuous evaluation (R11) |
| `is_high_value` | BOOLEAN | N | Placement requires approver (R10); default false |
| `status` | ENUM `legal_hold_status` | N | PENDING_APPROVAL / ACTIVE / RELEASE_PROPOSED / RELEASED |
| `placed_by` | UUID FK→users | N | Legal Hold Admin |
| `placed_at` | TIMESTAMPTZ | N | |
| `placement_approved_by` | UUID FK→users | Y | Legal Hold Approver (high-value) (R10) |
| `release_proposed_by` | UUID FK→users | Y | Maker for release (R10) |
| `release_approved_by` | UUID FK→users | Y | Checker for release; must ≠ proposer (R10) |
| `released_at` | TIMESTAMPTZ | Y | |
| `release_reason` | TEXT | Y | Mandatory on release (R10) |
| audit fields | | | created/updated/by/is_deleted |

#### E11 — `legal_hold_items`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hold_item_id` | UUID PK | N | |
| `legal_hold_id` | UUID FK→legal_holds | N | |
| `document_id` | UUID FK→documents | N | |
| `match_basis` | ENUM `hold_match_basis` | N | MANUAL / SAVED_SEARCH / EMPLOYEE / CASE |
| `is_auto_added` | BOOLEAN | N | True when added by continuous-evaluation job for a future match (R11); default false |
| `held_at` | TIMESTAMPTZ | N | |
| `released_at` | TIMESTAMPTZ | Y | |
| UNIQUE(`legal_hold_id`,`document_id`) | | | One row per hold-document |

#### E12 — `document_audit` (append-only; immutable; **hash-chained**)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `audit_id` | UUID PK | N | |
| `seq_no` | BIGSERIAL | N | Global monotonic sequence for chain ordering (R5) |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | Y | Version accessed |
| `action` | ENUM `doc_audit_action` | N | VIEW / PREVIEW / DOWNLOAD / PRINT / SHARE / METADATA_UPDATE / VERSION_ADD / CLASSIFY / DISPOSE / HOLD_PLACE / HOLD_RELEASE / ACL_CHANGE / BREAK_GLASS / CLEARANCE_CHANGE / ERASURE |
| `actor_user_id` | UUID FK→users | N | |
| `actor_role` | VARCHAR(60) | N | Effective role at access |
| `ip_address` | INET | Y | |
| `user_agent` | VARCHAR(255) | Y | |
| `share_id` | UUID FK→document_shares | Y | If accessed via share link |
| `result` | ENUM `audit_result` | N | SUCCESS / DENIED |
| `denial_reason` | VARCHAR(120) | Y | |
| `prev_hash` | CHAR(64) | N | `row_hash` of the immediately preceding audit row (chain link) (R5) |
| `row_hash` | CHAR(64) | N | SHA-256 over canonical row payload ‖ `prev_hash` (R5) |
| `occurred_at` | TIMESTAMPTZ | N | No update/delete permitted |

#### E13 — `document_shares`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `share_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | Y | Pin to a version (else current) |
| `share_type` | ENUM `share_type` | N | INTERNAL_USER / EXTERNAL_LINK |
| `recipient_user_id` | UUID FK→users | Y | For internal |
| `recipient_email` | VARCHAR(160) | Y | For external |
| `token_hash` | CHAR(64) | Y | SHA-256 of opaque link token (never store raw) |
| `rights` | TEXT[] | N | Subset {VIEW, DOWNLOAD} |
| `password_hash` | VARCHAR(255) | Y | Optional link password (argon2id) |
| `failed_attempt_count` | INT | N | Anti-brute-force counter (R16); default 0 |
| `locked_until` | TIMESTAMPTZ | Y | Lockout window after threshold (R16) |
| `max_access_count` | INT | Y | Null ⇒ unlimited until expiry |
| `access_count` | INT | N | Default 0 |
| `watermark_required` | BOOLEAN | N | Apply dynamic watermark |
| `expires_at` | TIMESTAMPTZ | N | Mandatory for EXTERNAL_LINK |
| `status` | ENUM `share_status` | N | ACTIVE / EXPIRED / REVOKED / LOCKED |
| `created_by` | UUID FK→users | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E14 — `checkout_locks`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `lock_id` | UUID PK | N | |
| `document_id` | UUID FK→documents UNIQUE | N | One active lock per document |
| `locked_by` | UUID FK→users | N | |
| `locked_at` | TIMESTAMPTZ | N | |
| `expires_at` | TIMESTAMPTZ | N | Auto-expire (e.g. +8h) to prevent stuck locks |
| `intent_note` | VARCHAR(255) | Y | |
| `status` | ENUM `lock_status` | N | ACTIVE / RELEASED / EXPIRED / FORCE_RELEASED |

#### E15 — `scan_results`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `scan_id` | UUID PK | N | |
| `version_id` | UUID FK→document_versions | N | |
| `engine` | VARCHAR(80) | N | AV engine + signature DB version |
| `malware_verdict` | ENUM `scan_status` | N | CLEAN / INFECTED / QUARANTINED / SKIPPED |
| `threat_name` | VARCHAR(160) | Y | If infected |
| `archive_depth` | INT | Y | Nesting depth observed (R17 guard) |
| `decompressed_ratio` | NUMERIC(8,2) | Y | Expansion ratio; over threshold ⇒ reject (R17) |
| `integrity_verified` | BOOLEAN | N | Stored hash == recomputed hash |
| `extracted_text_ref` | UUID FK→storage_objects | Y | OCR/text extraction artefact (encrypted) |
| `scanned_at` | TIMESTAMPTZ | N | |

#### E16 — `signature_requests`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `signature_request_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | N | Version being signed |
| `request_no` | VARCHAR(40) UNIQUE | N | |
| `signing_mode` | ENUM `signing_mode` | N | SEQUENTIAL / PARALLEL |
| `status` | ENUM `signature_request_status` | N | DRAFT / SENT / IN_PROGRESS / COMPLETED / DECLINED / EXPIRED / CANCELLED |
| `signer_list` | JSONB | N | Ordered signers [{user_id, order, role, field_coord}] |
| `expires_at` | TIMESTAMPTZ | Y | |
| `signed_document_version_id` | UUID FK→document_versions | Y | Resulting signed version |
| `created_by` | UUID FK→users | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E17 — `signatures`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `signature_id` | UUID PK | N | |
| `signature_request_id` | UUID FK→signature_requests | N | |
| `signer_user_id` | UUID FK→users | N | |
| `sign_order` | INT | N | |
| `signature_type` | ENUM `signature_type` | N | AADHAAR_ESIGN / DSC_TOKEN / OTP_ESIGN / DRAWN |
| `legal_basis` | VARCHAR(120) | Y | e.g. `IT_ACT_3A_DSC` recorded per signature (R7) |
| `certificate_subject` | VARCHAR(255) | Y | DSC subject DN |
| `signature_hash` | CHAR(64) | N | Hash of signed payload (PAdES) |
| `tsa_token_ref` | UUID FK→signature_ltv_artifacts | Y | RFC-3161 timestamp token (R4) |
| `ltv_status` | ENUM `ltv_status` | N | NONE / TIMESTAMPED / LTV_ENABLED (R4) |
| `signed_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM `signature_status` | N | PENDING / SIGNED / DECLINED |
| `decline_reason` | VARCHAR(255) | Y | |

#### E18 — `disposition_records`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `disposition_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `retention_assignment_id` | UUID FK→retention_assignments | Y | |
| `action` | ENUM `disposition_action` | N | DESTROY / ARCHIVE_TRANSFER / REVIEW |
| `proposed_by` | UUID FK→users | N | Librarian |
| `approved_by` | UUID FK→users | Y | Records Manager (maker≠checker) |
| `status` | ENUM `disposition_status` | N | PROPOSED / APPROVED / EXECUTED / REJECTED / BLOCKED_HOLD |
| `erasure_method` | ENUM `erasure_method` | Y | CRYPTO_SHRED only when blob is domain-local & unshared (R1) |
| `certificate_no` | VARCHAR(40) | Y | Destruction certificate |
| `executed_at` | TIMESTAMPTZ | Y | |
| `evidence_hash` | CHAR(64) | Y | Tombstone hash retained after destruction |
| audit fields | | | created/updated/by/is_deleted |

#### E19 — `storage_objects`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `storage_object_id` | UUID PK | N | |
| `bucket` | VARCHAR(120) | N | Logical bucket/container |
| `object_key` | VARCHAR(512) | N | Encrypted path/key |
| `content_hash` | CHAR(64) | N | SHA-256 (integrity) |
| `dedup_index_key` | CHAR(64) | N | **HMAC(content_hash, domain_secret)** — keyed dedup index, prevents existence oracle (R9) |
| `security_domain` | VARCHAR(40) | N | Dedup/key domain; **dedup matches only within identical domain** (R1/R9) |
| `key_scope` | ENUM `key_scope` | N | SHARED_CMK (PUBLIC/INTERNAL) / DEDICATED_CMK (CONFIDENTIAL+) |
| `dek_shared` | BOOLEAN | N | True if blob is referenced by >1 document; **crypto-shred forbidden while true** (R1); default false |
| `size_bytes` | BIGINT | N | |
| `encryption_alg` | VARCHAR(40) | N | e.g. `AES-256-GCM` |
| `kms_key_id` | VARCHAR(160) | N | KMS CMK reference (envelope) |
| `wrapped_dek` | BYTEA | N | DEK wrapped by KMS CMK |
| `storage_class` | ENUM `storage_class` | N | HOT / WARM / COLD / WORM_LOCKED |
| `worm_retain_until` | TIMESTAMPTZ | Y | Object-lock retention timestamp |
| `ref_count` | INT | N | Dedup reference count (within domain) |
| `created_at` | TIMESTAMPTZ | N | |

#### E20 — `dlp_findings`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `finding_id` | UUID PK | N | |
| `version_id` | UUID FK→document_versions | N | |
| `rule_code` | VARCHAR(60) | N | e.g. `PII_AADHAAR`, `PII_PAN`, `BANK_ACCT` |
| `severity` | ENUM `dlp_severity` | N | LOW / MEDIUM / HIGH / CRITICAL |
| `match_count` | INT | N | |
| `suggested_action` | ENUM `dlp_action` | N | TAG / RECLASSIFY / REDACT / BLOCK_SHARE |
| `status` | ENUM `dlp_finding_status` | N | OPEN / ACCEPTED / DISMISSED / REMEDIATED |
| `detected_at` | TIMESTAMPTZ | N | |
| audit fields | | | created/updated/by/is_deleted |

#### E21 — `security_clearances` (NEW — defines `clearance_level`, R3)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `clearance_id` | UUID PK | N | |
| `principal_type` | ENUM `clearance_principal_type` | N | USER / ROLE |
| `principal_ref` | VARCHAR(80) | N | user_id or role code |
| `clearance_level` | ENUM `classification_level` | N | Max classification this principal may access |
| `scope_org_unit_id` | UUID FK→org_units | Y | Optional org scoping of the clearance |
| `status` | ENUM `clearance_status` | N | PENDING_APPROVAL / ACTIVE / SUSPENDED / EXPIRED / REVOKED |
| `justification` | TEXT | N | Why this clearance is granted |
| `granted_by` | UUID FK→users | N | Security/DLP Officer (maker) |
| `approved_by` | UUID FK→users | Y | Records Manager (checker); must ≠ granter |
| `valid_from` | DATE | N | |
| `valid_until` | DATE | Y | Null ⇒ until revoked; periodic recertification required |
| audit fields | | | created/updated/by/is_deleted |

> **Effective clearance resolution:** a principal's `effective_clearance_level` = the highest `clearance_level`
> among ACTIVE rows matching the user directly or via an assigned role, within the relevant org scope;
> defaulting to `INTERNAL` when none exists. PUBLIC/INTERNAL need no explicit grant.

#### E22 — `data_subject_requests` (NEW — DPDP precedence lattice, R8)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `dsr_id` | UUID PK | N | |
| `dsr_no` | VARCHAR(40) UNIQUE | N | e.g. `DSR/2026/0007` |
| `data_subject_employee_id` | UUID FK→employees | N | Whose data |
| `request_type` | ENUM `dsr_type` | N | ACCESS / ERASURE / RECTIFICATION / PORTABILITY |
| `received_at` | TIMESTAMPTZ | N | Statutory clock starts |
| `status` | ENUM `dsr_status` | N | RECEIVED / UNDER_REVIEW / EXEMPTED / PARTIALLY_FULFILLED / FULFILLED / REJECTED |
| `legal_basis_exemption` | VARCHAR(200) | Y | Statutory retention/hold/WORM basis overriding erasure (lattice) |
| `affected_document_count` | INT | Y | Documents in scope |
| `resolution_note` | TEXT | Y | DPO decision narrative |
| `erasure_method` | ENUM `erasure_method` | Y | CRYPTO_SHRED / PHYSICAL_PURGE / EXEMPT_RETAINED |
| `adjudicated_by` | UUID FK→users | Y | DPO |
| audit fields | | | created/updated/by/is_deleted |

#### E23 — `audit_anchors` (NEW — tamper-evident anchoring, R5; append-only)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `anchor_id` | UUID PK | N | |
| `period_start_seq` | BIGINT | N | First `document_audit.seq_no` in window |
| `period_end_seq` | BIGINT | N | Last seq_no in window |
| `digest` | CHAR(64) | N | SHA-256 root over the window's `row_hash` chain (e.g., Merkle root) |
| `anchor_target` | ENUM `anchor_target` | N | WORM / EXTERNAL_NOTARY / RFC3161_TSA |
| `anchor_reference` | VARCHAR(255) | N | WORM object key / notary receipt / TSA token id |
| `anchored_at` | TIMESTAMPTZ | N | |
| `verified_at` | TIMESTAMPTZ | Y | Last successful chain verification |
| `verification_status` | ENUM `anchor_verify_status` | N | PENDING / VERIFIED / BROKEN |

#### E24 — `hold_notices` (NEW — custodian acknowledgement, R11)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hold_notice_id` | UUID PK | N | |
| `legal_hold_id` | UUID FK→legal_holds | N | |
| `custodian_user_id` | UUID FK→users | N | Person notified to preserve |
| `notice_text` | TEXT | N | Preservation instruction |
| `status` | ENUM `hold_notice_status` | N | SENT / ACKNOWLEDGED / OVERDUE / ESCALATED |
| `sent_at` | TIMESTAMPTZ | N | |
| `acknowledged_at` | TIMESTAMPTZ | Y | |
| `reminder_count` | INT | N | Default 0 |
| audit fields | | | created/updated/by/is_deleted |

#### E25 — `lifecycle_event_inbox` (NEW — event-driven anchor recompute, R12)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `event_id` | UUID PK | N | |
| `source_module` | VARCHAR(10) | N | M01 / M09 / M11 |
| `event_type` | ENUM `lifecycle_event_type` | N | EMPLOYEE_RETIRE / EMPLOYEE_MERGE / CASE_CLOSE / FISCAL_YEAR_END / ANCHOR_CORRECTION |
| `subject_ref_id` | UUID | N | employee_id / case_id |
| `effective_date` | DATE | N | New anchor date |
| `is_confirmed` | BOOLEAN | N | True only on the source module's final/confirmed event (R12) |
| `dedupe_key` | VARCHAR(120) UNIQUE | N | Idempotency (outbox at-least-once delivery) |
| `processing_status` | ENUM `event_status` | N | RECEIVED / PROCESSED / FAILED / DEAD_LETTER |
| `received_at` | TIMESTAMPTZ | N | |
| `processed_at` | TIMESTAMPTZ | Y | |

#### E26 — `signature_ltv_artifacts` (NEW — RFC-3161 + PAdES-LTV durability, R4)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `ltv_artifact_id` | UUID PK | N | |
| `signature_id` | UUID FK→signatures | N | |
| `tsa_timestamp_token` | BYTEA | N | RFC-3161 token bytes |
| `tsa_authority` | VARCHAR(160) | N | TSA identity |
| `ocsp_response` | BYTEA | Y | Embedded OCSP for signer cert |
| `crl_data` | BYTEA | Y | Embedded CRL snapshot |
| `validation_chain` | JSONB | Y | Full cert chain captured at signing time |
| `ltv_level` | ENUM `ltv_status` | N | TIMESTAMPED / LTV_ENABLED |
| `captured_at` | TIMESTAMPTZ | N | |

### 5.3 Relationship map

- `documents` 1—N `document_versions`; `documents.current_version_id` → latest `document_versions`.
- `document_versions` N—1 `storage_objects` (many versions may share a blob via **domain-scoped** dedup; `ref_count`).
- `documents` N—1 `document_types`; `document_types` 1—N `documents`.
- `documents` N—1 `folders`; `folders` self-referential tree (`parent_folder_id`).
- `documents` 1—N `document_acls`; `folders` 1—N `document_acls` (folder-inherited).
- `documents` 1—N `document_tags`, 1—N `document_links`, 1—N `document_audit`, 1—N `document_shares`,
  1—N `dlp_findings` (via versions).
- `documents` 1—0..1 `checkout_locks` (exclusive, optional); 1—N `signature_requests`.
- `signature_requests` 1—N `signatures`; `signatures` 1—0..1 `signature_ltv_artifacts`.
- `retention_policies` 1—N `retention_assignments`; `retention_assignments` 1—N `documents` (governing).
- `retention_assignments` N—0..1 `lifecycle_event_inbox` (anchor source event).
- `legal_holds` 1—N `legal_hold_items` N—1 `documents`; `legal_holds` 1—N `hold_notices`.
- `documents` 1—N `disposition_records`.
- `document_audit` is a **hash chain** (`prev_hash`→`row_hash`); windows summarised by `audit_anchors`.
- `security_clearances` N—1 `users`/`roles` (principal); read by the authorization engine.
- `data_subject_requests` N—1 `employees` (data subject); affects N `documents`.
- `document_links` connects `documents` to ANY module entity (`module_code`+`entity_name`+`entity_ref_id`).

### 5.4 Ownership / reuse matrix

| Entity | Owner | Written by | Read by |
|--------|-------|-----------|---------|
| `documents` | **M13** | M13 (on attach by M01–M12) | M01–M14 |
| `document_versions` | M13 | M13 | M01–M14 |
| `document_types` | M13 | M13 Librarian | All modules (validation) |
| `folders` | M13 | M13 + auto-provision | M01–M12 |
| `document_acls` | M13 | M13, Security | M13 enforcement |
| `document_links` | M13 | M01–M12 (attach) | M01–M14 |
| `document_audit` | M13 | M13 (all access) | Auditor, M14 |
| `retention_policies` / `_assignments` | M13 | Librarian/Records Mgr | M13, Auditor |
| `legal_holds` / `_items` / `hold_notices` | M13 | LH Admin/Approver | Auditor, custodians |
| `disposition_records` | M13 | Librarian/Records Mgr | Auditor |
| `signature_requests`/`signatures`/`ltv_artifacts` | M13 | M13 + signers + TSA | Originating module |
| `security_clearances` | M13 | Security (maker) / Records Mgr (checker) | AuthZ engine, Auditor |
| `data_subject_requests` | M13 | DPO | Auditor, M01 |
| `audit_anchors` | M13 | M13 anchoring job | Auditor |
| `lifecycle_event_inbox` | M13 | M01/M09/M11 (via event bus) | RetentionService |
| `employees`,`users`,`org_units`,`roles` | M01/platform | their owners | M13 (FK refs) |
| `notifications` | platform | M13 emits | recipients |
| `audit_log` | platform | M13 writes state changes | Auditor |

### 5.5 Enum & reference catalog

| Enum | Values |
|------|--------|
| `classification_level` | PUBLIC, INTERNAL, CONFIDENTIAL, SECRET, TOP_SECRET |
| `document_status` | DRAFT, SCANNING, QUARANTINED, ACTIVE, CHECKED_OUT, SUPERSEDED, ON_LEGAL_HOLD, DISPOSITION_DUE, DISPOSED, ARCHIVED, ORPHANED, DELETED |
| `version_kind` | ORIGINAL, NEW_VERSION, SUPERSEDE, CERTIFIED_COPY, REDACTED, SIGNED |
| `source_channel` | WEB_UPLOAD, BULK, SCANNER, MOBILE, API, SYSTEM_GENERATED |
| `scan_status` | PENDING, CLEAN, INFECTED, QUARANTINED, SKIPPED |
| `ocr_status` | PENDING, DONE, FAILED, NOT_APPLICABLE |
| `doc_category` | IDENTITY, SERVICE, FINANCIAL, DISCIPLINARY, MEDICAL, TRAINING, PENSION, STATUTORY, OTHER |
| `folder_type` | CABINET, EMPLOYEE, MODULE, CASE, SHARED, SYSTEM |
| `principal_type` | USER, ROLE, ORG_UNIT, RELATIONSHIP |
| `acl_effect` | ALLOW, DENY |
| `tag_type` | CLASSIFICATION, KEYWORD, PII_CATEGORY, RETENTION_HINT, SYSTEM |
| `tag_origin` | USER, OCR, DLP, SYSTEM |
| `retention_trigger` | ON_CREATE, ON_SUPERSEDE, ON_EMPLOYEE_RETIRE, ON_CASE_CLOSE, FISCAL_YEAR_END |
| `disposition_action` | DESTROY, ARCHIVE_TRANSFER, REVIEW |
| `retention_scope` | DOCUMENT, DOCUMENT_TYPE, FOLDER |
| `retention_status` | ACTIVE, DUE, HELD, DISPOSED |
| `legal_hold_status` | PENDING_APPROVAL, ACTIVE, RELEASE_PROPOSED, RELEASED |
| `hold_match_basis` | MANUAL, SAVED_SEARCH, EMPLOYEE, CASE |
| `hold_notice_status` | SENT, ACKNOWLEDGED, OVERDUE, ESCALATED |
| `doc_audit_action` | VIEW, PREVIEW, DOWNLOAD, PRINT, SHARE, METADATA_UPDATE, VERSION_ADD, CLASSIFY, DISPOSE, HOLD_PLACE, HOLD_RELEASE, ACL_CHANGE, BREAK_GLASS, CLEARANCE_CHANGE, ERASURE |
| `audit_result` | SUCCESS, DENIED |
| `anchor_target` | WORM, EXTERNAL_NOTARY, RFC3161_TSA |
| `anchor_verify_status` | PENDING, VERIFIED, BROKEN |
| `share_type` | INTERNAL_USER, EXTERNAL_LINK |
| `share_status` | ACTIVE, EXPIRED, REVOKED, LOCKED |
| `lock_status` | ACTIVE, RELEASED, EXPIRED, FORCE_RELEASED |
| `checkout_mode` | NONE, OPTIONAL, REQUIRED |
| `signing_mode` | SEQUENTIAL, PARALLEL |
| `signature_request_status` | DRAFT, SENT, IN_PROGRESS, COMPLETED, DECLINED, EXPIRED, CANCELLED |
| `signature_type` | AADHAAR_ESIGN, DSC_TOKEN, OTP_ESIGN, DRAWN |
| `signature_status` | PENDING, SIGNED, DECLINED |
| `ltv_status` | NONE, TIMESTAMPED, LTV_ENABLED |
| `disposition_status` | PROPOSED, APPROVED, EXECUTED, REJECTED, BLOCKED_HOLD |
| `erasure_method` | CRYPTO_SHRED, PHYSICAL_PURGE, EXEMPT_RETAINED |
| `storage_class` | HOT, WARM, COLD, WORM_LOCKED |
| `key_scope` | SHARED_CMK, DEDICATED_CMK |
| `dlp_severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `dlp_action` | TAG, RECLASSIFY, REDACT, BLOCK_SHARE |
| `dlp_finding_status` | OPEN, ACCEPTED, DISMISSED, REMEDIATED |
| `clearance_principal_type` | USER, ROLE |
| `clearance_status` | PENDING_APPROVAL, ACTIVE, SUSPENDED, EXPIRED, REVOKED |
| `dsr_type` | ACCESS, ERASURE, RECTIFICATION, PORTABILITY |
| `dsr_status` | RECEIVED, UNDER_REVIEW, EXEMPTED, PARTIALLY_FULFILLED, FULFILLED, REJECTED |
| `lifecycle_event_type` | EMPLOYEE_RETIRE, EMPLOYEE_MERGE, CASE_CLOSE, FISCAL_YEAR_END, ANCHOR_CORRECTION |
| `event_status` | RECEIVED, PROCESSED, FAILED, DEAD_LETTER |
| `fetch_intent` | VIEW, DOWNLOAD |

### 5.6 Data integrity rules

- **DI-1:** `documents.current_version_id` must reference a `document_versions` row of the same document;
  `current_version_no` equals that version's `version_no`.
- **DI-2:** `document_versions` is append-only — no UPDATE/DELETE; a correction is a new version or supersede.
- **DI-3 (rewritten, R5):** `document_audit` is append-only AND **hash-chained**: each row stores `prev_hash`
  (= prior row's `row_hash`) and `row_hash` = SHA-256(canonical payload ‖ prev_hash). The chain is periodically
  summarised into `audit_anchors` and anchored to WORM/external notary/TSA. Tamper-evidence is therefore
  cryptographic, not merely DB-grant-enforced; a broken chain raises `AUDIT_CHAIN_BROKEN` and alerts.
- **DI-4:** A document with `legal_hold_count > 0` or `is_worm = true` cannot be soft-deleted, disposed,
  or have content overwritten before `worm_retain_until`.
- **DI-5:** `content_hash` must equal SHA-256 of the stored bytes; mismatch sets `scan_results.integrity_verified=false`
  and blocks `ACTIVE`.
- **DI-6 (rewritten, R1/R9):** Deduplication is **domain-scoped**: a `storage_objects` row is reused only when
  `content_hash` AND `security_domain` AND `key_scope` all match (lookup via the HMAC `dedup_index_key`).
  Cross-classification/cross-domain dedup is forbidden. When `ref_count > 1`, `dek_shared = true` and the blob
  may **not** be crypto-shredded (disposal of one referencing document only decrements `ref_count`). No
  user-visible signal ever reveals a dedup hit (no existence oracle).
- **DI-7:** Only one `ACTIVE` `checkout_locks` per `document_id` (unique); expired locks are auto-released.
  Check-out is only available where the document's type `checkout_mode ≠ NONE`.
- **DI-8:** `document_acls` DENY overrides ALLOW; absence of any ALLOW = no access (deny-by-default).
- **DI-9:** `classification` may only be **downgraded** by Security/DLP Officer with maker-checker; upgrades
  allowed by Librarian. Sealed/WORM classification cannot be downgraded below type default. TOP_SECRET may be
  applied only to `is_top_secret_eligible` types.
- **DI-10:** `disposition_records` requires `approved_by ≠ proposed_by`; EXECUTED only if no active legal hold
  AND (`requires_confirmed_anchor=false` OR `documents.anchor_confirmed=true`).
- **DI-11:** Every `document_versions` insert must be preceded by a `scan_results` row with `malware_verdict=CLEAN`
  before the version may become `current`.
- **DI-12:** `document_shares` of type EXTERNAL_LINK require `expires_at` not null and `token_hash` set
  (raw token never stored). After N failed password attempts, `status=LOCKED`/`locked_until` set (R16).
- **DI-13:** `retention_assignments.disposition_due_date` is null iff governing policy `is_permanent=true`.
- **DI-14:** FK references from M01–M12 to `documents` are validated on attach via `document_links`; a
  module entity may not point at a `DELETED`/`DISPOSED`/`ORPHANED` document.
- **DI-15 (NEW, R8 — DPDP precedence lattice):** When a `data_subject_requests` ERASURE targets documents, the
  precedence is **statutory retention / active legal hold / WORM-before-retain-until → override erasure**
  (`erasure_method=EXEMPT_RETAINED`, `legal_basis_exemption` recorded). Only where **no** statutory/hold/WORM
  basis applies is erasure fulfilled, and then by **domain-local crypto-shred** (permitted only when
  `dek_shared=false`); otherwise PHYSICAL_PURGE of the unshared blob.
- **DI-16 (NEW, R3):** Every access decision must resolve `effective_clearance_level` from `security_clearances`
  (defaulting INTERNAL) and require it ≥ `documents.classification`. Clearance grants require maker≠checker.
- **DI-17 (NEW, R11):** Releasing a `legal_holds` requires `release_approved_by ≠ release_proposed_by` and a
  non-null `release_reason`. High-value placement requires `placement_approved_by`.
- **DI-18 (NEW, R12):** A `lifecycle_event_inbox` row is processed idempotently by `dedupe_key`; an
  unconfirmed event may set a provisional anchor but must NOT flip `documents.anchor_confirmed=true`.

### 5.7 Sample data (2–3 rows per module entity)

**`documents`**

| document_id | doc_no | title | document_type_id | classification | security_domain | status | link_count | is_worm |
|---|---|---|---|---|---|---|---|---|
| doc-0001 | DOC/2026/0001001 | Aadhaar Proof – EMP-3001 | dt-id-proof | CONFIDENTIAL | DOM_CONFIDENTIAL | ACTIVE | 1 | false |
| doc-0002 | DOC/2026/0001002 | Charge-Sheet CS/2026/201 | dt-charge-sheet | SECRET | DOM_SECRET | ON_LEGAL_HOLD | 1 | true |
| doc-0003 | DOC/2026/0001003 | PPO – EMP-2900 | dt-ppo | CONFIDENTIAL | DOM_CONFIDENTIAL | ACTIVE | 1 | true |

**`document_versions`**

| version_id | document_id | version_no | storage_object_id | version_kind | content_hash | ocr_status |
|---|---|---|---|---|---|---|
| ver-0001 | doc-0001 | 1 | so-9001 | ORIGINAL | 9f2a…7c | DONE |
| ver-0002 | doc-0002 | 1 | so-9002 | ORIGINAL | 1c00…aa | DONE |
| ver-0003 | doc-0002 | 2 | so-9003 | SUPERSEDE | 4b81…d0 | DONE |

**`document_types`**

| document_type_id | type_code | name | default_classification | checkout_mode | allowed_signature_types | is_worm_default |
|---|---|---|---|---|---|---|
| dt-id-proof | ID_PROOF | Identity Proof | CONFIDENTIAL | NONE | {} | false |
| dt-charge-sheet | CHARGE_SHEET | Charge Sheet | SECRET | OPTIONAL | {DSC_TOKEN} | true |
| dt-ppo | PPO | Pension Payment Order | CONFIDENTIAL | NONE | {DSC_TOKEN,AADHAAR_ESIGN} | true |

**`folders`**

| folder_id | parent_folder_id | name | path | folder_type | context_module |
|---|---|---|---|---|---|
| fol-001 | null | Employees | /Employees | CABINET | null |
| fol-002 | fol-001 | EMP-3001 | /Employees/EMP-3001 | EMPLOYEE | M01 |
| fol-003 | fol-002 | Disciplinary | /Employees/EMP-3001/Disciplinary | CASE | M09 |

**`document_acls`**

| acl_id | document_id | principal_type | principal_ref | rights | effect | need_to_know |
|---|---|---|---|---|---|---|
| acl-01 | doc-0001 | RELATIONSHIP | REPORTING_MANAGER | {VIEW} | ALLOW | false |
| acl-02 | doc-0002 | ROLE | INQUIRY_OFFICER | {VIEW,DOWNLOAD} | ALLOW | true |
| acl-03 | doc-0002 | USER | usr-3001 | {VIEW} | DENY | false |

**`document_tags`**

| tag_id | document_id | tag_type | tag_key | tag_value | applied_by | confidence |
|---|---|---|---|---|---|---|
| tg-01 | doc-0001 | PII_CATEGORY | AADHAAR | present | DLP | 0.985 |
| tg-02 | doc-0001 | KEYWORD | identity | proof | USER | null |
| tg-03 | doc-0003 | KEYWORD | pension | ppo | OCR | 0.910 |

**`document_links`**

| link_id | document_id | module_code | entity_name | entity_ref_id | link_role | is_primary |
|---|---|---|---|---|---|---|
| lk-01 | doc-0001 | M02 | change_requests | cr-5501 | PROOF | true |
| lk-02 | doc-0002 | M09 | charge_sheets | cs-01 | ORDER | true |
| lk-03 | doc-0003 | M11 | pension_cases | pc-7001 | ORDER | true |

**`retention_policies`**

| retention_policy_id | policy_code | name | trigger_event | retention_period_months | is_permanent | requires_confirmed_anchor |
|---|---|---|---|---|---|---|
| rp-01 | RET_SR_PERMANENT | Service Register – Permanent | ON_CREATE | null | true | false |
| rp-02 | RET_PAYSLIP_8Y | Payslip – 8 Years | FISCAL_YEAR_END | 96 | false | true |
| rp-03 | RET_DISC_30Y | Disciplinary – 30 Years | ON_CASE_CLOSE | 360 | false | true |

**`retention_assignments`**

| retention_assignment_id | retention_policy_id | scope_type | scope_ref_id | disposition_due_date | status |
|---|---|---|---|---|---|
| ra-01 | rp-01 | DOCUMENT_TYPE | dt-ppo | null | ACTIVE |
| ra-02 | rp-02 | DOCUMENT | doc-9100 | 2034-03-31 | ACTIVE |
| ra-03 | rp-03 | DOCUMENT | doc-0002 | 2056-04-01 | HELD |

**`legal_holds`**

| legal_hold_id | hold_no | matter_name | authority | is_high_value | status | release_approved_by |
|---|---|---|---|---|---|---|
| lh-01 | LH/2026/007 | WP 1234/2026 – EMP-3002 | High Court | true | ACTIVE | null |
| lh-02 | LH/2025/051 | CVC Ref 88/2025 | CVC | true | RELEASED | usr-4002 |

**`legal_hold_items`**

| hold_item_id | legal_hold_id | document_id | match_basis | is_auto_added | held_at |
|---|---|---|---|---|---|
| hi-01 | lh-01 | doc-0002 | CASE | false | 2026-04-10T09:01Z |
| hi-02 | lh-01 | doc-0005 | EMPLOYEE | true | 2026-05-02T07:00Z |

**`document_audit`**

| audit_id | seq_no | document_id | action | actor_user_id | result | prev_hash | row_hash | occurred_at |
|---|---|---|---|---|---|---|---|---|
| au-01 | 1001 | doc-0001 | VIEW | usr-9001 | SUCCESS | 0000…00 | 7a3f…1b | 2026-04-12T10:00Z |
| au-02 | 1002 | doc-0002 | DOWNLOAD | usr-7001 | SUCCESS | 7a3f…1b | b910…44 | 2026-04-12T10:05Z |
| au-03 | 1003 | doc-0002 | VIEW | usr-3001 | DENIED | b910…44 | c2d8…90 | 2026-04-12T10:06Z |

**`document_shares`**

| share_id | document_id | share_type | recipient_email | rights | failed_attempt_count | expires_at | status |
|---|---|---|---|---|---|---|---|
| sh-01 | doc-0001 | EXTERNAL_LINK | bank@example.gov | {VIEW} | 0 | 2026-04-20T00:00Z | ACTIVE |
| sh-02 | doc-0003 | INTERNAL_USER | null | {VIEW,DOWNLOAD} | 0 | 2026-05-01T00:00Z | ACTIVE |
| sh-03 | doc-0002 | EXTERNAL_LINK | ext@x.gov | {VIEW} | 5 | 2026-04-18T00:00Z | LOCKED |

**`checkout_locks`**

| lock_id | document_id | locked_by | locked_at | expires_at | status |
|---|---|---|---|---|---|
| ck-01 | doc-0001 | usr-9001 | 2026-04-12T09:00Z | 2026-04-12T17:00Z | RELEASED |
| ck-02 | doc-0005 | usr-7001 | 2026-04-13T11:00Z | 2026-04-13T19:00Z | ACTIVE |

**`scan_results`**

| scan_id | version_id | malware_verdict | archive_depth | decompressed_ratio | integrity_verified | scanned_at |
|---|---|---|---|---|---|---|
| sc-01 | ver-0001 | CLEAN | 0 | 1.0 | true | 2026-04-11T08:00Z |
| sc-02 | ver-0003 | CLEAN | 1 | 3.2 | true | 2026-04-11T08:05Z |

**`signature_requests`**

| signature_request_id | document_id | version_id | request_no | signing_mode | status |
|---|---|---|---|---|---|
| sr-01 | doc-0003 | ver-0003pp | SIG/2026/0001 | SEQUENTIAL | COMPLETED |
| sr-02 | doc-0006 | ver-6001 | SIG/2026/0002 | PARALLEL | IN_PROGRESS |

**`signatures`**

| signature_id | signature_request_id | signer_user_id | signature_type | legal_basis | ltv_status | status |
|---|---|---|---|---|---|---|
| sg-01 | sr-01 | usr-2200 | DSC_TOKEN | IT_ACT_3A_DSC | LTV_ENABLED | SIGNED |
| sg-02 | sr-02 | usr-2201 | AADHAAR_ESIGN | IT_ACT_3A_AADHAAR | TIMESTAMPED | PENDING |

**`disposition_records`**

| disposition_id | document_id | action | proposed_by | approved_by | erasure_method | status | certificate_no |
|---|---|---|---|---|---|---|---|
| dp-01 | doc-9100 | DESTROY | usr-4001 | usr-4002 | CRYPTO_SHRED | APPROVED | DC/2034/045 |
| dp-02 | doc-9101 | ARCHIVE_TRANSFER | usr-4001 | null | null | PROPOSED | null |

**`storage_objects`**

| storage_object_id | bucket | content_hash | security_domain | key_scope | dek_shared | storage_class | ref_count |
|---|---|---|---|---|---|---|---|
| so-9001 | hrms-docs-hot | 9f2a…7c | DOM_CONFIDENTIAL | DEDICATED_CMK | false | HOT | 1 |
| so-9002 | hrms-docs-worm | 1c00…aa | DOM_SECRET | DEDICATED_CMK | false | WORM_LOCKED | 1 |
| so-9003 | hrms-docs-worm | 4b81…d0 | DOM_SECRET | DEDICATED_CMK | false | WORM_LOCKED | 1 |

**`dlp_findings`**

| finding_id | version_id | rule_code | severity | match_count | suggested_action | status |
|---|---|---|---|---|---|---|
| df-01 | ver-0001 | PII_AADHAAR | HIGH | 1 | RECLASSIFY | ACCEPTED |
| df-02 | ver-0001 | PII_PAN | MEDIUM | 1 | TAG | OPEN |

**`security_clearances`**

| clearance_id | principal_type | principal_ref | clearance_level | status | approved_by | valid_until |
|---|---|---|---|---|---|---|
| cl-01 | USER | usr-7001 | SECRET | ACTIVE | usr-4002 | 2027-03-31 |
| cl-02 | ROLE | INQUIRY_OFFICER | CONFIDENTIAL | ACTIVE | usr-4002 | null |
| cl-03 | USER | usr-3001 | INTERNAL | ACTIVE | usr-4002 | 2027-03-31 |

**`data_subject_requests`**

| dsr_id | dsr_no | data_subject_employee_id | request_type | status | legal_basis_exemption | erasure_method |
|---|---|---|---|---|---|---|
| dsr-01 | DSR/2026/0007 | emp-3001 | ERASURE | EXEMPTED | Statutory SR permanent retention | EXEMPT_RETAINED |
| dsr-02 | DSR/2026/0008 | emp-5500 | ERASURE | FULFILLED | null | CRYPTO_SHRED |
| dsr-03 | DSR/2026/0009 | emp-4400 | ACCESS | FULFILLED | null | null |

**`audit_anchors`**

| anchor_id | period_start_seq | period_end_seq | digest | anchor_target | verification_status |
|---|---|---|---|---|---|
| an-01 | 1 | 100000 | a91c…ff | WORM | VERIFIED |
| an-02 | 100001 | 200000 | b73d…21 | RFC3161_TSA | VERIFIED |

**`hold_notices`**

| hold_notice_id | legal_hold_id | custodian_user_id | status | sent_at | acknowledged_at |
|---|---|---|---|---|---|
| hn-01 | lh-01 | usr-7001 | ACKNOWLEDGED | 2026-04-10T09:05Z | 2026-04-10T11:20Z |
| hn-02 | lh-01 | usr-7050 | OVERDUE | 2026-04-10T09:05Z | null |

**`lifecycle_event_inbox`**

| event_id | source_module | event_type | subject_ref_id | effective_date | is_confirmed | processing_status |
|---|---|---|---|---|---|---|
| ev-01 | M11 | EMPLOYEE_RETIRE | emp-2900 | 2026-03-31 | true | PROCESSED |
| ev-02 | M09 | CASE_CLOSE | case-201 | 2026-04-01 | true | PROCESSED |
| ev-03 | M01 | ANCHOR_CORRECTION | emp-2900 | 2026-04-30 | false | RECEIVED |

**`signature_ltv_artifacts`**

| ltv_artifact_id | signature_id | tsa_authority | ltv_level | captured_at |
|---|---|---|---|---|
| ltv-01 | sg-01 | CGG-TSA-Gov | LTV_ENABLED | 2026-04-12T12:00Z |
| ltv-02 | sg-02 | CGG-TSA-Gov | TIMESTAMPED | 2026-04-13T09:00Z |

---

## 6. Functional Requirements

### FR-M13-001 — Document Upload & Ingestion (single, bulk, drag-drop, scanner, mobile)

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Uploader (Module Service), DMS Librarian, Employee

**User Story:** As an uploader, I want to add documents via web (single/bulk/drag-drop), scanner ingestion,
mobile capture, or API, so that content enters the repository safely, with the right type and metadata, and
becomes searchable and governed.

**Description:** Ingests binaries through a multi-step pipeline: pre-flight validation (type/size) → secure
upload (multipart/resumable) → malware scan (with archive/decompression limits, R17) → integrity hash →
**domain-scoped dedup check** → metadata capture → sandboxed OCR/preview → `ACTIVE`. Supports single and bulk
uploads, drag-drop, watched scanner folders (TIFF/PDF), mobile camera capture with auto-deskew, and the
programmatic attach API used by M01–M12. Dedup hits are never surfaced to the user (no existence oracle, R9).

**Acceptance Criteria:**
1. A document is created with `document_type_id`, `title`, target `folder_id`, and type-required metadata.
2. Files violating `allowed_mime_types` or `max_size_mb` are rejected pre-upload with `INVALID_FILE_TYPE`/`FILE_TOO_LARGE`.
3. Every upload is virus-scanned before becoming `ACTIVE`; infected files go to `QUARANTINED` (FR-M13-007).
4. Bulk upload accepts up to 100 files per batch, returning per-file success/failure without aborting the batch.
5. Resumable upload supports files up to the configured cap (default 250 MB) and survives transient network loss.
6. On success the response returns `document_id`, `doc_no`, `status`, and `current_version_no=1`; an `audit_log` + chained `document_audit (VERSION_ADD)` entry is written.
7. The upload response NEVER indicates whether content was deduplicated; timing is normalised so a dedup hit is indistinguishable from a fresh store (R9).

**Business Rules:**
- BR-1: `status` flows DRAFT → SCANNING → (CLEAN ⇒ ACTIVE | INFECTED ⇒ QUARANTINED).
- BR-2: Default classification = `document_types.default_classification` unless caller specifies a higher level; `security_domain` defaults from the type.
- BR-3: Scanner/mobile sources auto-OCR; system-generated PDFs (e.g., payslips) skip OCR but still index text.
- BR-4: Module attach (API) must include `module_code`, `entity_name`, `entity_ref_id`, `link_role` (FR-M13-003).
- BR-5: Dedup reuse occurs only within the same `security_domain` + `key_scope` (DI-6).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `documents` | create master row |
| `document_versions` | version 1 |
| `storage_objects` | persist encrypted blob (domain-scoped dedup) |
| `scan_results` | malware/integrity/archive limits |
| `document_links` | module attach |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents` | Create + upload (single, multipart) |
| POST | `/api/v1/documents/bulk` | Bulk upload batch |
| POST | `/api/v1/documents/{id}/uploads:resume` | Resumable upload session |
| POST | `/api/v1/documents:attach` | Module attach contract |

**UI Behavior Notes:** Drag-drop zone with per-file progress chips; type selector that dynamically renders
the metadata schema form; bulk grid with status icons; mobile capture with auto-crop/deskew preview;
post-upload toast with "View / Add another". No "duplicate detected" message is ever shown.

**Edge Cases:** Duplicate content within domain (silent dedup → reuse blob, new metadata row, no user signal);
cross-domain identical content (separate blob, no dedup); upload interrupted (resume); zero-byte/corrupt file
(reject `EMPTY_FILE`); password-protected PDF (flag `PREVIEW_UNAVAILABLE`, still stored); nested archive over
depth/ratio limit (reject `RENDER_RESOURCE_LIMIT`); scanner double-feed (dedup + reconcile).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `UploadDropzone`, `BulkUploadGrid`, `MetadataSchemaForm`, `MobileCapture`; services `IngestionService`, `StorageService` (via `StorageProvider`), `ScanOrchestrator` (via `ScanProvider`) |
| Backend Flow | Validate type/size → presigned/resumable PUT to staging → compute SHA-256 + HMAC dedup key → domain-scoped dedup lookup → AV scan (archive guards) → on CLEAN promote blob, write `storage_objects`+`document_versions`+`documents` in txn → enqueue sandboxed OCR/preview → emit chained audit |
| Data Operations | INSERT `documents`,`document_versions`,`storage_objects`,`scan_results`; conditional INSERT `document_links`; UPDATE `storage_objects.ref_count`/`dek_shared` on dedup |
| Validation | MIME sniff (magic bytes, not extension), size cap, required metadata vs `metadata_schema`, classification ≥ type default, archive depth/ratio |
| Authorization | RBAC upload right; folder write scope by `owning_org_unit_id` |
| State Changes & Side Effects | DRAFT→SCANNING→ACTIVE/QUARANTINED; OCR + thumbnail jobs enqueued (sandboxed); notification on quarantine |
| Failure Handling | Type/size ⇒ 400; scan infected ⇒ 422 `MALWARE_DETECTED`; archive bomb ⇒ 422 `RENDER_RESOURCE_LIMIT`; storage down ⇒ 503 `UPSTREAM_UNAVAILABLE` with resumable retry |
| Dependencies | KMS, object storage, AV engine, OCR engine, M01 (employee context) |
| Test Guidance | Unit: MIME sniff, size guard, domain-scoped dedup, timing-normalisation; Integration: full pipeline to ACTIVE; Negative: infected EICAR, oversized, zip bomb, resume after drop |

---

### FR-M13-002 — Document Types, Metadata Taxonomy, Classification, Tagging & Signature/Checkout Policy

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Security/DLP Officer, Uploader

**User Story:** As a DMS Librarian, I want to define document types with a metadata schema, defaults, allowed
signature methods, and check-out behaviour, so that every document is consistently described, classified,
signed lawfully, and discoverable.

**Description:** Manages the `document_types` taxonomy (schema as JSON-Schema, default classification/domain/
retention, allowed MIME types, size caps, WORM/signature defaults, **allowed signature methods**, **checkout
mode**), the classification ladder, and tagging (controlled + free + auto-applied by OCR/DLP). Reclassification
is governed by SoD and maker-checker for downgrades.

**Acceptance Criteria:**
1. A document type defines `metadata_schema`, `default_classification`, `default_security_domain`, `allowed_mime_types`, `max_size_mb`, `allowed_signature_types`, `signature_legal_basis`, and `checkout_mode`.
2. Uploads validate metadata against the type's JSON-Schema; missing required fields fail with `METADATA_INVALID`.
3. A document carries exactly one `classification`; changing it writes chained `document_audit (CLASSIFY)`.
4. Downgrading classification requires Security/DLP Officer + a second approver (maker-checker) and a reason.
5. Tags can be applied by users (controlled vocabulary) and auto-applied by OCR/DLP with a confidence score.
6. Deactivating a type prevents new uploads of that type but preserves existing documents.
7. Statutory types exclude `DRAWN` from `allowed_signature_types` and pin a `signature_legal_basis` (R7); TOP_SECRET is selectable only when `is_top_secret_eligible=true`.

**Business Rules:**
- BR-1: Classification may be raised by Librarian; only lowered by Security/DLP with maker-checker (DI-9).
- BR-2: PII tags from DLP (`PII_AADHAAR`, `PII_PAN`) auto-suggest CONFIDENTIAL minimum.
- BR-3: Controlled-vocabulary tags reject unknown keys; free keywords allowed under `KEYWORD` type.
- BR-4: `checkout_mode` defaults to OPTIONAL (M13 does not author content); types that never need editing set NONE (R22).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_types` | manage taxonomy, signature/checkout policy |
| `document_tags` | apply/remove tags |
| `documents` | classification field |
| `dlp_findings` | auto-tag source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST/PUT | `/api/v1/document-types` | Create/update type |
| GET | `/api/v1/document-types` | List types + schema |
| POST | `/api/v1/documents/{id}/tags` | Apply tags |
| POST | `/api/v1/documents/{id}:reclassify` | Reclassify (maker-checker) |

**UI Behavior Notes:** Type admin screen with JSON-Schema builder, signature-method multiselect, and checkout-
mode selector; classification dropdown with lock icon for downgrades (opens approval dialog); tag chips with
autocomplete; DLP-suggested tags shown with confidence badges to accept/dismiss.

**Edge Cases:** Schema change with existing docs (versioned schema; old docs stay valid); conflicting auto vs
manual classification (highest wins); deactivating a type mid-upload (block new, allow in-flight); statutory
type configured with DRAWN (rejected at save).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DocumentTypeAdmin`, `SchemaBuilder`, `TagEditor`, `ReclassifyDialog`; `TaxonomyService`, `ClassificationService` |
| Backend Flow | CRUD types with schema version pin + signature/checkout policy → validate uploads against pinned schema → reclassify routes through maker-checker workflow |
| Data Operations | INSERT/UPDATE `document_types`; INSERT/DELETE `document_tags`; UPDATE `documents.classification`; INSERT chained `document_audit` |
| Validation | JSON-Schema validity; classification monotonicity; controlled vocab; signature-method legality (no DRAWN for statutory) |
| Authorization | Type admin: Librarian; downgrade: Security/DLP + checker |
| State Changes & Side Effects | Reclassify down ⇒ re-evaluate ACLs + security_domain; audit CLASSIFY; notify owner on downgrade |
| Failure Handling | Bad schema ⇒ 400; unauthorized downgrade ⇒ 403 `CLASSIFICATION_LOCKED`; metadata mismatch ⇒ 422; illegal signature method ⇒ 422 `SIGNATURE_METHOD_NOT_ALLOWED` |
| Dependencies | Workflow engine (maker-checker), DLP (FR-M13-016) |
| Test Guidance | Unit: schema validation, monotonic classification, signature-method whitelist; Integration: downgrade approval; Negative: unknown tag key, DRAWN on statutory type |

---

### FR-M13-003 — Folder/Cabinet Structure & Module-Context Linking (Attach Contract)

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Uploader (Module Service), System (auto-provision)

**User Story:** As a module service, I want to attach a document to my business object and place it in the
correct cabinet, so that documents are organised by employee/module/case context and reliably retrievable.

**Description:** Manages the folder/cabinet hierarchy (auto-provisioned per employee and per module/case) and
the polymorphic **attach contract** (`document_links`). Maintains `documents.link_count` so the orphan reaper
(FR-M13-019) can detect zero-link documents. Folders carry inheritable classification and ACLs.

**Acceptance Criteria:**
1. A per-employee cabinet folder is auto-created on M01 employee creation; module/case subfolders auto-provision on first attach.
2. `documents:attach` links a document to a module entity and returns the `link_id`; `is_primary` enforced unique per (entity, link_role) where applicable; increments `link_count`.
3. A document can be linked from multiple modules (re-use) without duplicating the binary.
4. Moving a document between folders preserves version history, audit, retention, and holds.
5. Folder-level ACLs are inherited by contained documents unless overridden by a document-level DENY.
6. Detaching a link sets `detached_at`, decrements `link_count`, and does not delete the document; when `link_count` reaches 0 the document becomes an orphan candidate (FR-M13-019).

**Business Rules:**
- BR-1: A document in `DELETED`/`DISPOSED`/`ORPHANED` state cannot be attached (DI-14).
- BR-2: System-managed folders cannot be renamed/deleted by non-admins.
- BR-3: Folder classification sets the floor for contained documents.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `folders` | hierarchy/auto-provision |
| `document_links` | attach/detach + link_count |
| `document_acls` | folder-inherited grants |
| `documents` | folder placement, link_count |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/folders` | Create folder |
| POST | `/api/v1/documents:attach` | Attach to module entity |
| DELETE | `/api/v1/document-links/{linkId}` | Detach |
| GET | `/api/v1/documents?moduleCode=&entityRefId=` | List by context |

**UI Behavior Notes:** Tree navigator (cabinets → employee → module → case); breadcrumb path; drag-to-move with
permission check; "Attached in" panel on a document showing every module link with deep-link back to source.

**Edge Cases:** Same document attached as PROOF in M02 and EXHIBIT in M09 (two links, one binary); employee
merge (re-home cabinet via `EMPLOYEE_MERGE` event); orphan document (no links) — routed to orphan reaper.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `FolderTree`, `MoveDialog`, `AttachmentsPanel`; `FolderService`, `LinkService` |
| Backend Flow | Resolve/auto-provision folder path → attach validates document state + caller scope → insert link + increment link_count → recompute inherited ACLs |
| Data Operations | INSERT `folders` (idempotent on path), `document_links`; UPDATE `documents.folder_id`,`link_count`; INSERT `audit_log` |
| Validation | Document not deleted/disposed/orphaned; unique primary per (entity, role); folder scope match |
| Authorization | Attach: Uploader/module service token; folder admin: Librarian |
| State Changes & Side Effects | Auto-provision subfolders; move re-evaluates inherited ACLs; detach may trigger ORPHANED candidacy |
| Failure Handling | Disposed/orphaned doc ⇒ 409 `DOCUMENT_NOT_ATTACHABLE`; duplicate primary ⇒ 409 `LINK_CONFLICT` |
| Dependencies | M01 (employee lifecycle events), all modules (attach), FR-M13-019 |
| Test Guidance | Unit: path materialisation, primary uniqueness, link_count math; Integration: multi-module link reuse; Negative: attach disposed doc |

---

### FR-M13-004 — Versioning, Optional Check-in/Check-out & Supersede

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Uploader, DMS Librarian

**User Story:** As a document owner, I want to add new versions and (where the type requires it) check a
document out, so that change history is preserved and concurrent edits never collide — without forcing a heavy
lock on document types M13 only stores.

**Description:** Provides immutable version history, **optional** exclusive check-out/check-in locks (governed by
`document_types.checkout_mode`), new-version upload, and **supersede**. Because M13 does not author content,
check-out is OPTIONAL by default and NONE for read-only statutory types; it is REQUIRED only where a type
explicitly demands serialized edits (R22).

**Acceptance Criteria:**
1. For types with `checkout_mode ∈ {OPTIONAL, REQUIRED}`, checking out creates an exclusive `ACTIVE` lock; for `REQUIRED`, check-in without a held lock is rejected.
2. Check-in increments `version_no`, sets new `current_version_id`, requires a `change_summary`, and runs the full scan pipeline.
3. Version history lists all versions with author, timestamp, size, hash, kind, and change summary; any version is downloadable per permission.
4. Supersede records `version_kind=SUPERSEDE` and `superseded_version_id`; the superseded version is retained, not deleted.
5. Locks auto-expire after the configured TTL (default 8h); an admin can force-release with reason (audited).
6. WORM documents reject content mutation before `worm_retain_until` (new version blocked).

**Business Rules:**
- BR-1: Only the lock holder (or force-release admin) may check in (for REQUIRED/OPTIONAL-locked).
- BR-2: A new version inherits classification, security_domain, retention, holds, and links from the document.
- BR-3: Supersede requires Librarian/owner right and a reason; superseded version excluded from "current" but kept for audit.
- BR-4: For `checkout_mode=NONE`, new versions are added directly (no lock) with optimistic-concurrency guard.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | new/superseded versions |
| `checkout_locks` | optional exclusive lock |
| `documents` | current pointer |
| `scan_results` | scan each version |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:checkout` | Acquire lock (if type allows) |
| POST | `/api/v1/documents/{id}:checkin` | Upload new version |
| POST | `/api/v1/documents/{id}:supersede` | Supersede current |
| GET | `/api/v1/documents/{id}/versions` | Version history |

**UI Behavior Notes:** Lock controls shown only for lockable types; lock badge with holder + countdown; version
timeline with diff metadata; restore/compare actions; force-release control for admins behind confirmation.

**Edge Cases:** Lock holder leaves (TTL auto-release); two check-ins race (second gets 409 for locked types, or
optimistic-conflict for NONE); supersede on a held document (blocked); version of a different MIME type (allowed
if type permits); checkout attempted on `checkout_mode=NONE` (rejected `409 CHECKOUT_NOT_SUPPORTED`).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `VersionTimeline`, `LockBadge`, `CheckInDialog`; `VersioningService`, `LockService` |
| Backend Flow | Checkout (lockable types) acquires unique lock (SELECT…FOR UPDATE) → check-in validates lock/optimistic version → scan new blob → append version in txn → advance current pointer → release lock |
| Data Operations | INSERT `checkout_locks`/`document_versions`; UPDATE `documents.current_version_id/no/content_hash`; INSERT `scan_results`, chained audit |
| Validation | Lock ownership (lockable), change_summary required, WORM/hold guard, MIME allowed, optimistic version for NONE |
| Authorization | VERSION right; force-release: Sys Admin |
| State Changes & Side Effects | CHECKED_OUT↔ACTIVE; supersede sets prior SUPERSEDED; OCR/preview re-run (sandboxed); notify subscribers |
| Failure Handling | Locked ⇒ 409 `DOCUMENT_LOCKED`; not holder ⇒ 403; WORM ⇒ 409 `WORM_IMMUTABLE`; checkout on NONE ⇒ 409 |
| Dependencies | FR-M13-005/007 (encrypt+scan each version), FR-M13-014 (WORM) |
| Test Guidance | Unit: lock exclusivity, optional-mode bypass, version increment; Integration: checkout→checkin→supersede; Negative: race check-in, WORM mutation, checkout on NONE |

---

### FR-M13-005 — Encryption at Rest (Envelope/KMS), In Transit & Key Disaster Recovery

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, System Administrator, System

**User Story:** As a Security Officer, I want every stored binary encrypted with envelope encryption under a KMS
key, all transfers over TLS, keys rotatable, and a tested key-DR/escrow plan, so that content is protected and
no key loss can permanently darken the archive.

**Description:** Implements envelope encryption: a per-object DEK encrypts the blob (AES-256-GCM); the DEK is
wrapped by a KMS CMK and stored as `wrapped_dek`. CONFIDENTIAL+ use a dedicated CMK (`key_scope=DEDICATED_CMK`)
per security domain. All API/storage traffic uses TLS 1.2+. Supports key rotation (re-wrap DEKs without
re-encrypting blobs). **Adds a key-DR/escrow policy (R6):** CMK backup, multi-region/HSM replication, a
documented key-recovery runbook, and defined behaviour on key loss. Break-glass decryption is dual-control,
audited, and rate-limited (R16).

**Acceptance Criteria:**
1. Every blob is stored encrypted (AES-256-GCM) with a unique DEK; plaintext is never persisted.
2. The DEK is wrapped by a KMS CMK; only `wrapped_dek` + `kms_key_id` are stored, never the raw DEK.
3. All transport uses TLS 1.2+; non-TLS requests are rejected.
4. CMK rotation re-wraps DEKs in the background without rewriting object bytes; old key remains for decrypt only until retired.
5. Decryption requires an authorised principal; every decrypt for download is audited (FR-M13-012).
6. Break-glass access requires two approvers, is recorded as `document_audit (BREAK_GLASS)`, and is rate-limited/locked after repeated failures (`BREAK_GLASS_LOCKED`).
7. CMKs are backed up/escrowed with multi-region or HSM replication; a documented key-recovery runbook exists and is rehearsed; key-loss behaviour is defined (no silent data loss) (R6).

**Business Rules:**
- BR-1: CONFIDENTIAL+ documents use a dedicated CMK separate from INTERNAL/PUBLIC, **per security domain**.
- BR-2: Keys never leave KMS in plaintext; wrap/unwrap happens in KMS.
- BR-3: A retired/compromised key triggers forced re-wrap of all dependent DEKs.
- BR-4: A shared blob (`dek_shared=true`) is never crypto-shredded; only `ref_count` decrements on disposal (DI-6).
- BR-5: CMK material is replicated to a geographically separate, in-country HSM/region; restore is tested quarterly.
- BR-6: On suspected key loss, the recovery runbook restores from escrow before any data is declared lost.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `storage_objects` | encryption metadata, wrapped DEK, key_scope, security_domain, dek_shared |
| `documents` | classification → key policy |
| `document_audit` | decrypt/break-glass (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/admin/keys:rotate` | Trigger CMK rotation/re-wrap |
| POST | `/api/v1/documents/{id}:break-glass` | Dual-control emergency access |
| GET | `/api/v1/admin/encryption/status` | Encryption + key-DR posture report |
| POST | `/api/v1/admin/keys:recover` | Execute key-recovery runbook (dual-control) |

**UI Behavior Notes:** Admin encryption dashboard (key id, rotation date, % re-wrapped, **replication/escrow
status, last DR rehearsal**); break-glass workflow with two-approver gate, mandatory reason, and lockout
indicator; no UI ever displays raw keys.

**Edge Cases:** KMS unavailable on download (503, retry, no plaintext fallback); rotation interrupted (resumable
re-wrap job); legacy unencrypted import (migration encrypt-on-ingest); break-glass brute-force (lockout +
alert); CMK corruption (recover from escrow per runbook before declaring loss).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `EncryptionService` (envelope wrap/unwrap), `KeyRotationJob`, `BreakGlassWorkflow`, `KeyRecoveryRunbook` |
| Backend Flow | On store: generate DEK → encrypt blob → KMS-wrap DEK → persist. On read: KMS-unwrap DEK → decrypt stream → chained audit. DR: escrow replication continuous; recovery dual-control |
| Data Operations | INSERT/UPDATE `storage_objects.wrapped_dek/kms_key_id/encryption_alg/key_scope/security_domain`; INSERT chained `document_audit` |
| Validation | TLS enforced at gateway; CMK exists/active; classification→key→domain mapping; break-glass rate-limit |
| Authorization | Decrypt: per-document access; rotation/break-glass/recover: Security + second approver |
| State Changes & Side Effects | Rotation re-wraps DEKs; break-glass grants time-boxed access + alert; recovery restores CMK |
| Failure Handling | KMS down ⇒ 503 `KEY_SERVICE_UNAVAILABLE`; unauthorized decrypt ⇒ 403; break-glass lockout ⇒ 429 `BREAK_GLASS_LOCKED`; integrity fail post-decrypt ⇒ 422 |
| Dependencies | KMS (+ HSM/multi-region escrow), object storage, FR-M13-012 |
| Test Guidance | Unit: wrap/unwrap, classification→key, break-glass lockout; Integration: rotate then read old+new, escrow-restore drill; Negative: KMS outage, single-approver break-glass |

---

### FR-M13-006 — Access Control (RBAC + Relationship + Clearance + Classification + Need-to-Know)

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, DMS Librarian, all readers

**User Story:** As a Security Officer, I want access decided by role, org-relationship, a **defined clearance
attribute**, classification, and explicit need-to-know with deny-by-default, so that only entitled principals
can see each document at record and field level.

**Description:** The authorization engine evaluates every access against four dimensions: (1) RBAC right, (2)
org/relationship grants, (3) **classification clearance** (`effective_clearance_level ≥ document.classification`,
resolved from `security_clearances` — FR-M13-017 — defaulting INTERNAL), and (4) explicit `document_acls`/
need-to-know. DENY overrides ALLOW; absence of ALLOW = no access. Sealed documents are hidden from the subject.
List/search results mask restricted records to metadata-only.

**Acceptance Criteria:**
1. Access is granted only when RBAC right AND `effective_clearance_level ≥ classification` AND an effective ALLOW all hold, with no DENY.
2. A reporting manager can view a direct report's permitted documents via the `REPORTING_MANAGER` relationship grant.
3. Sealed documents (`is_sealed=true`) are invisible to the subject employee even when they own related records.
4. Need-to-know ACLs require workflow membership in addition to role.
5. Denied access is recorded as chained `document_audit (result=DENIED)` with reason (e.g., `CLEARANCE_INSUFFICIENT`).
6. Time-boxed ACLs (`expires_at`) auto-revoke; expired grants no longer permit access.
7. Clearance is read live from `security_clearances`; a SUSPENDED/EXPIRED/REVOKED clearance immediately denies CONFIDENTIAL+ access.

**Business Rules:**
- BR-1: DENY always wins (DI-8); deny-by-default everywhere.
- BR-2: Folder ACLs inherit to documents unless a document-level DENY exists.
- BR-3: Auditor reads per clearance; Sys Admin cannot read CONFIDENTIAL+ content except via break-glass.
- BR-4: Missing clearance defaults to INTERNAL, which denies CONFIDENTIAL+ (DI-16).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_acls` | grants/denials |
| `documents` | classification, is_sealed |
| `folders` | inherited ACLs |
| `security_clearances` | effective clearance resolution |
| `document_audit` | denied/granted access (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/acls` | Grant/deny |
| DELETE | `/api/v1/acls/{aclId}` | Revoke grant |
| GET | `/api/v1/documents/{id}/access:check` | Evaluate effective access (shows clearance gate) |
| GET | `/api/v1/documents/{id}/acls` | List ACLs |

**UI Behavior Notes:** Permissions panel listing effective access with source (role/relationship/clearance/ACL/
inherited); "Why can/can't X see this?" explainer that names the failing dimension (e.g., "clearance INTERNAL <
CONFIDENTIAL"); add-grant dialog with expiry; restricted list rows render lock + metadata only.

**Edge Cases:** Conflicting ALLOW+DENY (DENY wins); relationship changes after grant (re-evaluated live); clearance
revoked mid-session (next access denied, cache invalidated); cross-org reader (org-scope denies unless explicit grant).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PermissionsPanel`, `AccessExplainer`; `AuthorizationEngine`, `AclService`, `ClearanceResolver` |
| Backend Flow | Resolve principal roles/relationships + effective clearance → fetch doc classification + ACLs (doc + inherited folder) → evaluate deny-by-default with DENY precedence + clearance gate → log decision |
| Data Operations | SELECT `document_acls`/`folders`/`documents`/`security_clearances`; INSERT chained `document_audit`; INSERT/DELETE ACL rows |
| Validation | Clearance ≥ classification; need-to-know workflow membership; expiry check |
| Authorization | Manage ACL: owner/Librarian/Security with MANAGE_ACL right |
| State Changes & Side Effects | ACL change audited (ACL_CHANGE); clearance change invalidates cache; notify on grant to external-like principals |
| Failure Handling | Denied ⇒ 403 `FORBIDDEN`/`CLEARANCE_INSUFFICIENT` + audited DENIED; sealed ⇒ 404 (existence hidden) |
| Dependencies | M01 (relationships/org), platform roles, FR-M13-017 (clearance), FR-M13-012 |
| Test Guidance | Unit: deny precedence, clearance gate, sealed hiding; Integration: relationship + clearance access; Negative: expired ACL, suspended clearance, cross-org |

---

### FR-M13-007 — Virus/Malware Scanning, File-Type & Size Validation, Quarantine & Render Sandboxing

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, System

**User Story:** As a Security Officer, I want every upload validated, malware-scanned, and processed in
resource-limited sandboxes before it becomes available, so that no infected, disallowed, or hostile file enters
the repository or can DoS the renderers.

**Description:** Validates file type by magic-byte sniffing, enforces per-type size caps, scans every version
via the `ScanProvider` (ICAP/cloud), and enforces **archive/decompression limits** (depth, expansion ratio,
nested-PDF/billion-laughs guards, R17). Infected files are quarantined (encrypted, isolated). All
content-processing (OCR/preview/render) runs in **sandboxed, resource-limited workers** treating untrusted
content as hostile.

**Acceptance Criteria:**
1. File type is determined by content signature; mismatched extension is rejected or corrected, never trusted.
2. Files exceeding the type's `max_size_mb` are rejected pre-storage.
3. Every version is scanned; only `CLEAN` versions become `current`/`ACTIVE`.
4. Infected files are `QUARANTINED`, encrypted, hidden from normal access, and Security is notified.
5. Quarantine release requires Security/DLP approval; release without remediation is blocked.
6. On AV signature update, pending/quarantined items can be re-scanned.
7. Archive depth, decompression ratio, and nested-document limits are enforced; violations are rejected with `RENDER_RESOURCE_LIMIT` and recorded in `scan_results` (R17).

**Business Rules:**
- BR-1: A document cannot reach `ACTIVE` with `scan_status≠CLEAN` (DI-11).
- BR-2: Quarantined binaries are never served, previewed, or shared.
- BR-3: Repeated infections from one uploader raise a security alert.
- BR-4: OCR/preview/render workers run in ephemeral sandboxes with CPU/memory/time caps; a worker breach cannot reach KMS or the metadata DB.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `scan_results` | verdict + archive_depth + decompressed_ratio |
| `documents` | scan_status, status |
| `document_versions` | scanned target |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/quarantine` | List quarantined items |
| POST | `/api/v1/admin/quarantine/{id}:release` | Release after review |
| POST | `/api/v1/documents/{id}:rescan` | Re-scan |

**UI Behavior Notes:** Quarantine console with threat name, uploader, timestamp; release/delete behind
confirmation; uploader sees "File blocked by security scan" without threat detail leakage.

**Edge Cases:** Scanner timeout (retry, keep SCANNING, no auto-activate); archive bombs / nested zips (depth/
ratio limit, reject); deeply nested PDF / XML entity expansion (sandbox kills, reject); false positive (Security
override-with-reason); EICAR in non-prod.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ScanOrchestrator`, `QuarantineConsole`; `ValidationService`, `ScanProvider` (interface), sandboxed `RenderWorker` |
| Backend Flow | Sniff MIME + size guard → archive depth/ratio guard → stream to AV → record verdict → CLEAN promotes, INFECTED quarantines + alerts; all extraction in sandbox |
| Data Operations | INSERT `scan_results` (incl. archive metrics); UPDATE `documents.scan_status/status`; INSERT `audit_log`, `notifications` |
| Validation | Magic-byte vs declared MIME; size cap; archive depth/size/ratio; sandbox resource caps |
| Authorization | Release/rescan: Security/DLP |
| State Changes & Side Effects | SCANNING→ACTIVE/QUARANTINED; alert to Security; uploader notification |
| Failure Handling | AV down ⇒ keep SCANNING + retry, 503 on sync path; infected ⇒ 422 `MALWARE_DETECTED`; bomb ⇒ 422 `RENDER_RESOURCE_LIMIT` |
| Dependencies | AV engine (provider), sandbox runtime, FR-M13-001/004 |
| Test Guidance | Unit: MIME sniff, size guard, ratio/depth caps; Integration: EICAR quarantine + release, zip-bomb rejection; Negative: spoofed extension, billion-laughs XML |

---

### FR-M13-008 — Sandboxed OCR & Permission-Aware Search (Secured Index)

- **Module:** M13-DMS
- **Primary Role(s):** All readers, DMS Librarian

**User Story:** As a user, I want to search documents by content and metadata with permission-aware results, so
that I can find the right record quickly — without the index becoming a second, weaker copy of secret content.

**Description:** Runs OCR (sandboxed) on image/scan uploads, extracts text, and indexes content + metadata into a
full-text engine that is **encrypted at rest and access-scoped** (R7). **SECRET/TOP_SECRET full text is excluded
from the shared index** (metadata-only) or routed to a separately-secured per-domain index; results are filtered
by the authorization engine (post-filter, not rank suppression). Supports multi-language (en/hi/te) OCR.

**Acceptance Criteria:**
1. Scanned images and PDFs are OCR'd in sandboxed workers; `document_versions.ocr_status` reflects PENDING/DONE/FAILED/NOT_APPLICABLE.
2. Search returns only documents the requesting principal may view (authorization + clearance filtered) with highlighted snippets.
3. Faceted filters (type, classification, date range, folder, tag, owner) narrow results; all results paginated (max 100).
4. Metadata and OCR text are searchable; restricted docs show metadata-only snippet.
5. Re-indexing occurs on new versions and metadata changes.
6. The search index is encrypted at rest and access-scoped; SECRET/TOP_SECRET content is excluded from full-text indexing (metadata-only) or isolated in a per-domain secured index (R7).
7. Multi-language documents are detected (`language_code`) and indexed with the right analyzer.

**Business Rules:**
- BR-1: Search never returns content a principal cannot access (post-filter, not just rank).
- BR-2: OCR failure does not block storage; document remains searchable by metadata.
- BR-3: Sealed/quarantined documents are excluded from non-privileged search entirely.
- BR-4: No plaintext SECRET/TOP_SECRET tokens are written to the shared index (R7).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | ocr_status |
| `scan_results` | extracted_text_ref (encrypted) |
| `documents` | metadata + classification + security_domain |
| `document_tags` | facet source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/search?q=&type=&class=&from=&to=` | Full-text + faceted search |
| POST | `/api/v1/documents/{id}:reindex` | Force re-index |
| GET | `/api/v1/documents/{id}/ocr` | OCR text (per permission) |

**UI Behavior Notes:** Search bar with type-ahead; facet rail with counts; result cards with highlighted snippets,
type/classification badges, quick preview; "no access" rows masked; saved searches. SECRET results show
metadata-only (no snippet).

**Edge Cases:** Handwritten scans (low OCR confidence flag); huge PDFs (async sandboxed OCR, partial index);
mixed-language page; permission/clearance change after indexing (enforced at query time); SECRET document
(metadata-only result).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SearchBar`, `FacetRail`, `ResultList`; `OcrService` (via `OcrProvider`, sandboxed), `IndexService` (via `IndexProvider`, encrypted), `SearchService` |
| Backend Flow | On version DONE scan → sandboxed extract/OCR → index doc+metadata (full-text only for ≤CONFIDENTIAL; metadata-only for SECRET+) → query applies ACL+clearance filter + facets → highlight |
| Data Operations | UPDATE `document_versions.ocr_status`; write encrypted search index; SELECT with auth post-filter |
| Validation | Query length/limits; facet values; pagination cap 100; classification→index-policy |
| Authorization | Results filtered by AuthorizationEngine (FR-M13-006) |
| State Changes & Side Effects | Index updated on version/metadata change; OCR job retries on failure |
| Failure Handling | Index down ⇒ 503 fallback to metadata DB search; OCR fail ⇒ mark FAILED, keep metadata search |
| Dependencies | OCR engine, search engine (encrypted/access-scoped), FR-M13-006 |
| Test Guidance | Unit: analyzer selection, facet build, SECRET-exclusion rule; Integration: auth+clearance-filtered results; Negative: access change post-index, SECRET full-text leak attempt |

---

### FR-M13-009 — Retention, Legal Hold (SoD + Future-Match) & Event-Driven Disposition

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Records Manager, Legal Hold Administrator, Legal Hold Approver

**User Story:** As a Records Manager, I want documents governed by retention schedules, frozen by legal holds
(with dual control and automatic capture of future matches), disposed only via approved/certified process on a
confirmed anchor, so that we meet statutory retention and never destroy records under litigation or on a stale
date.

**Description:** Assigns retention policies, computes disposition-due dates from **event-confirmed anchors**
(R12), places/releases legal holds with **SoD on both placement (high-value) and release** (R10), runs a
**continuous-evaluation job** that auto-adds future documents matching an active hold's `match_criteria` and
issues custodian hold-notices requiring acknowledgement (R11), and runs a maker-checker disposition workflow
ending in a certified record. Holds always override disposition.

**Acceptance Criteria:**
1. A retention policy is assignable at document, type, or folder scope; the effective policy resolves most-specific-first.
2. `disposition_due_date` = anchor date + period; permanent policies leave it null.
3. Placing a legal hold sets `legal_hold_count>0`, blocks disposition/delete/overwrite, and marks assignment `HELD`; high-value holds require `placement_approved_by` (R10).
4. Disposition requires proposal (Librarian) + approval (Records Manager), `proposed_by ≠ approved_by`.
5. Disposition executes only when no active hold AND a confirmed anchor (`requires_confirmed_anchor=false` OR `anchor_confirmed=true`); it produces a `disposition_records` row with a certificate and tombstone hash (DI-10, R12).
6. Releasing a hold requires `release_proposed_by` + a distinct `release_approved_by` and a mandatory `release_reason` (R10); it then restores eligibility and recomputes due dates.
7. A continuous-evaluation job auto-adds new documents matching an ACTIVE hold's `match_criteria` (`is_auto_added=true`) and issues `hold_notices` to custodians requiring acknowledgement (R11).
8. Disposition due dates are (re)computed from `lifecycle_event_inbox` confirmed events; an unconfirmed/corrected anchor blocks auto-DESTROY (R12).

**Business Rules:**
- BR-1: Legal hold overrides any retention/disposition (DI-4, DI-10).
- BR-2: Statutory types (SR, PPO) default to permanent/REVIEW; never auto-destroy.
- BR-3: Destruction is logical+physical: blob purged (or crypto-shred if unshared), metadata tombstone + certificate retained.
- BR-4: Hold release is dual-control (DI-17); placement of high-value holds is dual-control.
- BR-5: Auto-DESTROY is blocked unless the governing anchor is confirmed (DI-18).
- BR-6: Overdue/unacknowledged hold-notices escalate to the Legal Hold Approver.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `retention_policies` / `retention_assignments` | schedule + due date + anchor source |
| `legal_holds` / `legal_hold_items` / `hold_notices` | freeze, future-match, acknowledgement |
| `lifecycle_event_inbox` | anchor confirmation |
| `disposition_records` | certified disposition |
| `documents` | hold count, due date, status, anchor_confirmed |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/retention-policies` | Define policy |
| POST | `/api/v1/documents/{id}/retention` | Assign policy |
| POST | `/api/v1/legal-holds` / `/{id}:release` | Place / release hold (release dual-control) |
| POST | `/api/v1/legal-holds/{id}:approve-placement` | Approve high-value placement |
| POST | `/api/v1/hold-notices/{id}:acknowledge` | Custodian acknowledgement |
| POST | `/api/v1/documents/{id}/disposition:propose` / `:approve` | Disposition maker-checker |

**UI Behavior Notes:** Retention admin grid; per-document retention badge with due date + anchor-confirmed
indicator; legal-hold console with matter, scope, held-count, auto-added items, and custodian acknowledgement
status; release flow shows the dual-control second-approver step; disposition queue (DUE items) with propose/
approve and certificate generation; held items show a freeze icon.

**Edge Cases:** Overlapping policies (most-specific wins); hold placed mid-disposition (abort, `BLOCKED_HOLD`);
permanent doc proposed for destroy (blocked); anchor event later corrected (`ANCHOR_CORRECTION` recompute,
auto-DESTROY re-gated); future document matches active hold (auto-held + notice); release without second
approver (rejected `HOLD_RELEASE_SOD`).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `RetentionAdmin`, `LegalHoldConsole`, `DispositionQueue`, `HoldNoticeTracker`; `RetentionService`, `LegalHoldService`, `ContinuousHoldEvaluator`, `DispositionService`, `LifecycleEventConsumer` |
| Backend Flow | Resolve effective policy → consume confirmed anchor event → compute due date → scheduler flags DUE → propose/approve → execute purge+certificate if no hold AND confirmed anchor; hold evaluator periodically matches new docs, auto-holds, issues notices |
| Data Operations | INSERT/UPDATE `retention_assignments`,`legal_holds`,`legal_hold_items`,`hold_notices`,`disposition_records`,`lifecycle_event_inbox`; UPDATE `documents.legal_hold_count/status/disposition_due_date/anchor_confirmed` |
| Validation | maker≠checker (dispose + hold release); confirmed anchor for auto-DESTROY; no active hold for execute; permanent⇒no destroy; scope resolution |
| Authorization | Retention: Librarian; approve dispose: Records Mgr; place hold: LH Admin; approve placement/release: LH Approver |
| State Changes & Side Effects | ACTIVE→DISPOSITION_DUE→DISPOSED/ARCHIVED; hold ⇒ ON_LEGAL_HOLD; notifications + chained audit; WORM purge only after retain-until |
| Failure Handling | Hold present ⇒ 409 `LEGAL_HOLD_ACTIVE`; self-approve ⇒ 403 `SOD_VIOLATION`; release without checker ⇒ 403 `HOLD_RELEASE_SOD`; permanent destroy ⇒ 409 `RETENTION_PERMANENT`; unconfirmed anchor ⇒ 409 `ANCHOR_UNCONFIRMED` |
| Dependencies | M01/M09/M11 anchor events (event bus), FR-M13-014 (WORM), notifications |
| Test Guidance | Unit: due-date calc, policy resolution, release SoD, future-match; Integration: hold blocks dispose, event-driven recompute, auto-hold + notice; Negative: self-approve, destroy permanent, release without checker, destroy on unconfirmed anchor |

---

### FR-M13-010 — E-Signature & Digital Signing (PAdES-LTV + RFC-3161 Timestamping)

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Employee (signer), Records Manager

**User Story:** As an officer, I want to send a document for one or more legally-valid signatures that remain
verifiable for decades, so that orders and certificates stay tamper-evident even after the signer's certificate
expires.

**Description:** Orchestrates a signing envelope (sequential/parallel), applies PAdES digital signatures to a new
signed version, and — for statutory/WORM and all long-lived documents — applies **RFC-3161 trusted
timestamping** and **PAdES-LTV** (embedding OCSP/CRL revocation data and the validation chain) so signatures
remain verifiable after certificate expiry/revocation (R4). Signature methods are restricted to the document
type's `allowed_signature_types`, and the legal basis is recorded per signature (R7).

**Acceptance Criteria:**
1. A signing request defines ordered/parallel signers, fields, method (from `allowed_signature_types`), and optional expiry.
2. Signers are notified and sign in the configured order; sequential blocks later signers until prior signs.
3. On completion a new signed `document_version` (`version_kind=SIGNED`) is created and the request marks COMPLETED.
4. Each signature records signer, method, **legal basis**, certificate subject (DSC), and signature hash (PAdES).
5. A decline halts the envelope with reason; an expiry cancels pending signatures.
6. Tampering with a signed version is detectable (hash mismatch invalidates the signature).
7. Statutory/WORM documents (and all signatures by policy) receive an RFC-3161 timestamp token and PAdES-LTV revocation data stored in `signature_ltv_artifacts`; `ltv_status` reaches `LTV_ENABLED` (R4).
8. `DRAWN` is rejected for statutory types; DSC or Aadhaar eSign (IT Act §3A) is required, and the basis recorded (R7).

**Business Rules:**
- BR-1: A document type with `requires_signature=true` cannot be marked final until signed.
- BR-2: The signed version is WORM-eligible and cannot be superseded silently (new request required).
- BR-3: Signatures bind to a specific `version_id`; signing a superseded version is rejected.
- BR-4: Statutory signatures must be LTV-enabled before the request can COMPLETE (`SIGNATURE_LTV_REQUIRED` otherwise) (R4).
- BR-5: Signature method must be in the type's `allowed_signature_types` (`SIGNATURE_METHOD_NOT_ALLOWED` otherwise) (R7).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `signature_requests` | envelope |
| `signatures` | applied signatures + legal_basis + ltv_status |
| `signature_ltv_artifacts` | RFC-3161 token + OCSP/CRL (R4) |
| `document_versions` | signed output version |
| `documents` | requires_signature gating |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/signature-requests` | Create envelope |
| POST | `/api/v1/signature-requests/{id}/sign` | Apply a signature (+ timestamp + LTV) |
| POST | `/api/v1/signature-requests/{id}:cancel` | Cancel |
| GET | `/api/v1/signature-requests/{id}` | Status |
| GET | `/api/v1/signatures/{id}/verify` | Verify signature + LTV validity |

**UI Behavior Notes:** Signer setup with drag-to-place fields; method selector limited to allowed types; signer
view with secure sign action (OTP/DSC prompt); progress tracker; completion download of signed PDF; a
"verifiable until / LTV-enabled" badge.

**Edge Cases:** Signer out of office (delegate/reassign with reason); DSC token failure (retry/alternate allowed
method); parallel signers race (independent); expired envelope (cancel pending); TSA unavailable (retry; block
COMPLETE for statutory until timestamp obtained).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SignerSetup`, `SignActionPanel`, `SignProgress`, `SignatureVerifier`; `SignatureService`, `SigningProvider` (interface), `TsaClient`, `LtvService` |
| Backend Flow | Create envelope → notify signer(s) → on sign, apply PAdES via provider → obtain RFC-3161 timestamp → embed OCSP/CRL (LTV) → store artifact → on last signer emit signed version → mark COMPLETED |
| Data Operations | INSERT `signature_requests`,`signatures`,`signature_ltv_artifacts`; INSERT signed `document_versions`; UPDATE request/document status |
| Validation | Signer order, method ∈ allowed types, version not superseded, expiry, LTV obtained for statutory |
| Authorization | Create: owner/Records Mgr; sign: assigned signer only |
| State Changes & Side Effects | DRAFT→SENT→IN_PROGRESS→COMPLETED/DECLINED/EXPIRED; signed version WORM-eligible; notifications |
| Failure Handling | Decline ⇒ 200 DECLINED; PKI down ⇒ 503 `SIGNING_SERVICE_UNAVAILABLE`; TSA down ⇒ retry / 503; tamper ⇒ 422 `SIGNATURE_INVALID`; missing LTV ⇒ 422 `SIGNATURE_LTV_REQUIRED`; bad method ⇒ 422 `SIGNATURE_METHOD_NOT_ALLOWED` |
| Dependencies | PKI/eSign provider, RFC-3161 TSA, FR-M13-004/014, notifications |
| Test Guidance | Unit: order enforcement, hash binding, method whitelist, LTV embedding; Integration: full sequential sign → signed LTV version → verify after simulated cert expiry; Negative: sign superseded version, DRAWN on statutory, complete without timestamp |

---

### FR-M13-011 — Watermarking & Certified True Copies (v1)

- **Module:** M13-DMS
- **Primary Role(s):** Records Manager, DMS Librarian, Security/DLP Officer

**User Story:** As a Records Manager, I want to issue watermarked, certified true copies of statutory records,
so that shared/printed copies are traceable and RTI/disclosure obligations are met.

**Description:** Generates dynamic watermarks (user, timestamp, purpose) on previews/downloads/prints of
restricted documents and issues **certified true copies** (stamped, optionally LTV-signed renditions of
statutory records) with a certificate number. **Certified copies are v1** (statutory/RTI necessity, reusing the
version + WORM machinery). Interactive redaction is split out to **FR-M13-021 (Phase 2, fast-follow)** (R19).

**Acceptance Criteria:**
1. Restricted documents render with a dynamic watermark showing viewer identity, timestamp, and document number.
2. A certified true copy is a new derivative version (`version_kind=CERTIFIED_COPY`) stamped "CERTIFIED TRUE COPY" with `certificate_no`, issuer, and date, optionally e-signed (LTV).
3. The original is never altered; the derivative links to the source via `derived_from_version_id`.
4. Certified copies of statutory documents are WORM-stored.
5. Every certified-copy issuance is recorded in chained `document_audit`.
6. Watermark is mandatory (non-removable) for CONFIDENTIAL+ downloads/prints.

**Business Rules:**
- BR-1: Only Records Manager may certify true copies of statutory records.
- BR-2: Certified copies inherit/raise classification; never lower than source.
- BR-3: Watermark rendering happens in a sandboxed renderer (FR-M13-007).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | certified derivative |
| `documents` | source + classification |
| `signatures`/`signature_ltv_artifacts` | optional cert-copy signing |
| `document_audit` | issuance events (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:certified-copy` | Issue certified copy |
| GET | `/api/v1/documents/{id}/render?watermark=1` | Watermarked render (audited proxy) |

**UI Behavior Notes:** Certified-copy dialog with issuer/purpose and preview of stamp; watermark always visible
on restricted previews; "Redaction" entry point shows "Available in Phase 2 — use certified copy + manual
redaction interim."

**Edge Cases:** Certified copy of a held document (allowed, read-only); watermark on non-rasterisable formats
(convert to PDF render first); certify by wrong role (403).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `CertifiedCopyDialog`, `WatermarkRenderer` (sandboxed); `RenditionService` |
| Backend Flow | Render source → apply watermark/stamp to a derivative → store as new version (WORM if statutory) → optional LTV sign → chained audit |
| Data Operations | INSERT derivative `document_versions`,`storage_objects`; optional `signatures`/`signature_ltv_artifacts`; INSERT chained `document_audit` |
| Validation | Issuer role; classification floor; WORM for statutory |
| Authorization | Certify: Records Mgr |
| State Changes & Side Effects | New derivative version; certified copy WORM-locked; notifications/audit |
| Failure Handling | Render fail ⇒ 422 `RENDITION_FAILED`; wrong role ⇒ 403 |
| Dependencies | Sandboxed preview renderer, FR-M13-010/014 |
| Test Guidance | Unit: watermark presence, classification floor; Integration: certified copy WORM-stored + audited; Negative: certify by wrong role |

---

### FR-M13-012 — Access Audit (View/Download/Print/Share) & Compliance Reporting

- **Module:** M13-DMS
- **Primary Role(s):** Auditor, Security/DLP Officer, Records Manager

**User Story:** As an Auditor, I want an immutable, tamper-evident record of every view, download, print and
share of every document, so that I can prove who accessed what, when, and detect misuse.

**Description:** Records every access event (success or denied) to the append-only, **hash-chained**
`document_audit` (FR-M13-020 anchors it) with actor, role, IP/user-agent, action, version, share context, and
result. Provides per-document access history, per-user activity, and compliance reports. The audit trail is
immutable, **cryptographically verifiable**, and exportable for e-discovery.

**Acceptance Criteria:**
1. Every VIEW/PREVIEW/DOWNLOAD/PRINT/SHARE and metadata/lifecycle action writes one immutable, chained `document_audit` row.
2. Denied accesses are recorded with `result=DENIED` and reason.
3. A document's access history is viewable by Auditor/Records Manager/owner (own).
4. Compliance reports include: documents missing retention, overdue disposition, active holds, sensitive-access log, classification mix, audit-chain health, orphaned documents, DPDP requests.
5. The audit log cannot be updated or deleted (DI-3); attempts fail and are themselves alerted.
6. Audit data is exportable (CSV/JSON) for a date/scope range for e-discovery, with chain-verification proof.

**Business Rules:**
- BR-1: Print actions are captured where the platform controls rendering (watermarked print path); out-of-band printing is best-effort and labelled as such (see Appendix D).
- BR-2: Audit retention is at least as long as the document's retention.
- BR-3: Access to the audit trail is itself audited.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_audit` | access events (chained) |
| `audit_anchors` | chain verification |
| `documents` | subject |
| `document_shares` | share context |
| `audit_log` | state-change cross-ref |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/{id}/audit` | Access history |
| GET | `/api/v1/audit/documents?userId=&from=&to=` | Cross-document access query |
| GET | `/api/v1/reports/compliance/{reportCode}` | Compliance report |
| POST | `/api/v1/audit:export` | e-discovery export (+ chain proof) |

**UI Behavior Notes:** Access-history timeline per document; auditor console with filters; compliance dashboard
cards with drill-down; export button with scope picker; chain-health indicator.

**Edge Cases:** High-volume access (audit write must not block read path — durable queue with guaranteed
delivery); print outside platform (best-effort, flagged); export of large ranges (async job + download link).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AccessHistory`, `AuditorConsole`, `ComplianceDashboard`; `AuditService`, `ReportService` |
| Backend Flow | Every gateway access emits a chained audit event to a durable append-only sink → reports aggregate over `document_audit` + metadata |
| Data Operations | INSERT-only `document_audit` (with prev_hash/row_hash); SELECT aggregations; export job |
| Validation | Append-only enforced at DB (no UPDATE/DELETE grants) + hash-chain; report params |
| Authorization | Read trail: Auditor/Records Mgr/owner(own); export: Auditor/Security |
| State Changes & Side Effects | None to documents; alert on tamper attempt; export produces signed file |
| Failure Handling | Sink down ⇒ buffer + retry, never silently drop; tamper attempt ⇒ 403 + alert; chain break ⇒ `AUDIT_CHAIN_BROKEN` |
| Dependencies | All FRs emit audit; FR-M13-013 (share context), FR-M13-020 (anchoring) |
| Test Guidance | Unit: immutability, denied logging, hash linkage; Integration: access→history; Negative: attempt UPDATE audit row |

---

### FR-M13-013 — Secure Sharing & Expiring Links (Anti-Brute-Force)

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, DMS Librarian, Security/DLP Officer

**User Story:** As a document owner, I want to share a document with an internal user or via a time-limited,
optionally password-protected external link that resists guessing, so that recipients get exactly the access I
grant, only for as long as I allow.

**Description:** Creates internal shares or external tokenised links with scoped rights (view/download),
mandatory expiry for external links, optional argon2id password and access-count cap, optional watermark, and
full audit. **Anti-brute-force (R16):** repeated failed password attempts increment `failed_attempt_count` and,
past threshold, set `status=LOCKED`/`locked_until` and alert Security. All served bytes go through the audited
proxy and write `document_audit` (R2).

**Acceptance Criteria:**
1. Internal share grants scoped rights to a named user without exposing a public URL.
2. External link requires `expires_at`, stores only a hashed token, and never embeds the raw token server-side.
3. Optional password (argon2id) and `max_access_count` are enforced; exceeding either denies access.
4. Accessing via a share writes chained `document_audit` with `share_id` context and applies watermark if required.
5. Revoking a share immediately invalidates the link/grant.
6. DLP `BLOCK_SHARE` findings prevent external sharing of flagged documents.
7. After N (configurable, default 5) failed password attempts the link locks (`SHARE_LOCKED`), sets `locked_until`, and alerts Security (R16).

**Business Rules:**
- BR-1: CONFIDENTIAL+ external links require Security/DLP approval and watermark.
- BR-2: External links cannot grant PRINT or UPDATE; download only if explicitly allowed.
- BR-3: Expired/revoked/locked links return 404 (no existence leak) to anonymous callers.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_shares` | share/link + failed_attempt_count + locked_until |
| `documents` | subject + classification |
| `dlp_findings` | block-share gate |
| `document_audit` | access via share (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/shares` | Create share/link |
| GET | `/api/v1/shared/{token}` | Resolve external link (rate-limited) |
| POST | `/api/v1/shares/{id}:revoke` | Revoke |
| GET | `/api/v1/documents/{id}/shares` | List shares |

**UI Behavior Notes:** Share dialog with internal-user picker or "create link"; expiry/password/access-count
controls; copy-link with one-time reveal of token; active-shares list with revoke and lock status; recipient
landing page with optional password (lockout message after threshold) and watermark.

**Edge Cases:** Link forwarded (access-count cap + password + lockout mitigate); recipient without account
(external path); classification raised after sharing (re-evaluate, auto-revoke if over policy); clock skew
(server-side authoritative); password brute-force (lockout + alert).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ShareDialog`, `ActiveShares`, `SharedLanding`; `ShareService`, `RateLimiter` |
| Backend Flow | Validate rights + DLP gate → generate opaque token, store `token_hash` → on access verify hash/password/expiry/count/lockout → serve watermarked render via audited proxy → chained audit |
| Data Operations | INSERT/UPDATE `document_shares` (incl. failed_attempt_count/locked_until); INSERT chained `document_audit`; UPDATE `access_count` |
| Validation | Expiry mandatory (external); rights subset; DLP not BLOCK_SHARE; password strength; lockout threshold |
| Authorization | Create: owner/Librarian; CONFIDENTIAL+ external: Security approval; unlock: Security |
| State Changes & Side Effects | ACTIVE→EXPIRED/REVOKED/LOCKED; watermark applied; notifications to recipient + Security on lockout |
| Failure Handling | Expired/revoked ⇒ 404; over count ⇒ 403 `SHARE_LIMIT_REACHED`; DLP block ⇒ 403 `SHARE_BLOCKED_DLP`; locked ⇒ 429 `SHARE_LOCKED` |
| Dependencies | FR-M13-006/011/012/016 |
| Test Guidance | Unit: token hashing, expiry/count, lockout counter; Integration: external link access + audit; Negative: forwarded expired link, DLP-blocked share, password brute-force lockout |

---

### FR-M13-014 — Immutable WORM Storage for Statutory Documents

- **Module:** M13-DMS
- **Primary Role(s):** Records Manager, Security/DLP Officer, System

**User Story:** As a Records Manager, I want statutory documents stored Write-Once-Read-Many with object-lock
retention, so that they cannot be altered or deleted before their lawful retention expires, even by
administrators.

**Description:** Stores statutory documents in WORM-locked object storage with an object-lock `worm_retain_until`
timestamp. WORM documents reject overwrite, supersede, delete, and disposition before the retention horizon;
even Sys Admin/break-glass cannot mutate content. Legal holds extend immutability indefinitely. The WORM
guarantee is **proven on the actual CGG storage backend as a gating launch spike** (council R-Executor; §15.3).

**Acceptance Criteria:**
1. A document marked `is_worm=true` is stored in `WORM_LOCKED` storage class with `worm_retain_until` set.
2. Any attempt to overwrite, version-mutate, delete, or dispose a WORM document before `worm_retain_until` is rejected.
3. WORM defaults are applied automatically for statutory document types (`is_worm_default=true`).
4. A legal hold on a WORM document blocks disposition even after `worm_retain_until`.
5. WORM status and retain-until are visible and auditable; retain-until can only extend, never shorten.
6. After retain-until and with no hold, disposition follows the certified workflow (FR-M13-009).

**Business Rules:**
- BR-1: WORM immutability is enforced at the storage layer (object-lock), not only in the application.
- BR-2: `worm_retain_until` may be extended but never reduced.
- BR-3: Certified true copies of statutory records are WORM by default.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `documents` | is_worm flag |
| `storage_objects` | storage_class, worm_retain_until |
| `document_versions` | immutable content |
| `disposition_records` | post-retention disposition |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:declare-worm` | Lock as WORM |
| POST | `/api/v1/documents/{id}:extend-retention` | Extend retain-until |
| GET | `/api/v1/documents/{id}/worm-status` | WORM posture |

**UI Behavior Notes:** WORM badge with retain-until date; "Declare as record" action for statutory types;
extend-retention dialog (extend-only); disabled delete/supersede with explanatory tooltip on WORM docs.

**Edge Cases:** Attempt to shorten retain-until (rejected); WORM doc under hold past retain-until (still frozen);
storage-tier migration (preserve object-lock); accidental WORM on non-statutory doc (governance warning at
declare time — cannot undo before horizon).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `WormBadge`, `DeclareRecordDialog`, `ExtendRetentionDialog`; `WormService` |
| Backend Flow | Declare ⇒ set object-lock + storage class + retain-until → all mutation paths check WORM guard before write/delete |
| Data Operations | UPDATE `documents.is_worm`, `storage_objects.storage_class/worm_retain_until`; INSERT `audit_log` |
| Validation | retain-until extend-only; statutory-type auto-WORM; no mutate before horizon |
| Authorization | Declare/extend: Records Mgr |
| State Changes & Side Effects | Sets immutability; blocks FR-M13-004 mutate, FR-M13-009 dispose; audit |
| Failure Handling | Mutation attempt ⇒ 409 `WORM_IMMUTABLE`; shorten retain ⇒ 422 `RETENTION_SHORTEN_FORBIDDEN` |
| Dependencies | Object-lock-capable storage (proven on CGG backend), FR-M13-004/009 |
| Test Guidance | Unit: WORM guard, extend-only; Integration: WORM blocks delete/supersede on real backend; Negative: shorten retain, admin mutate |

---

### FR-M13-015 — Domain-Scoped Deduplication, Integrity & Sandboxed Thumbnail/Preview

- **Module:** M13-DMS
- **Primary Role(s):** System, DMS Librarian

**User Story:** As a system, I want to deduplicate identical content **within a single security domain**, verify
integrity by checksum, and generate previews in sandboxes, so that storage is efficient, key-separation and
crypto-shred remain possible, no existence oracle leaks, and renderers cannot be DoS'd.

**Description:** Computes SHA-256 over every blob and an **HMAC dedup index key** scoped to the security domain;
identical content **within the same `security_domain` + `key_scope`** reuses a single `storage_objects` row
(reference-counted); cross-domain identical content is stored separately (R1). Periodic and on-read integrity
checks detect bit-rot/tampering. A **sandboxed, resource-limited renderer** (R17) produces thumbnails and
paginated previews. Dedup is never surfaced to users (R9).

**Acceptance Criteria:**
1. Uploading content identical to an existing blob **in the same security domain** reuses it and increments `ref_count` (no duplicate bytes); cross-domain identical content is NOT deduplicated.
2. A blob is physically deleted only when `ref_count` reaches 0 and no WORM/hold applies; crypto-shred is permitted only when `dek_shared=false`.
3. Stored `content_hash` is verified on download and on a periodic scan; mismatch flags `integrity_verified=false` and quarantines the version.
4. Thumbnails and multi-page previews are generated in sandboxed workers for supported formats and served per permission.
5. Preview generation never exposes content to unauthorised principals (auth + clearance checked render).
6. Integrity failures raise an alert and block serving the affected version.
7. No user-visible signal (timing, message, ref_count) reveals whether content was deduplicated (R9).

**Business Rules:**
- BR-1: Dedup operates on `dedup_index_key` (HMAC of content hash) **within a domain**; metadata/ACLs remain per-document.
- BR-2: WORM/held blobs and shared blobs (`dek_shared=true`) are never garbage-collected / crypto-shredded.
- BR-3: Preview is a derivative render in a sandbox, not the stored original; watermark applies for restricted docs.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `storage_objects` | hash, dedup_index_key, security_domain, ref_count, dek_shared |
| `document_versions` | content_hash |
| `scan_results` | integrity_verified |
| `documents` | content_hash, size, security_domain |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/{id}/thumbnail` | Thumbnail (sandboxed render) |
| GET | `/api/v1/documents/{id}/preview?page=` | Paginated preview (sandboxed) |
| POST | `/api/v1/admin/integrity:scan` | Trigger integrity scan |

**UI Behavior Notes:** Grid/list thumbnails; in-app preview pane with page navigation and zoom; integrity badge
(verified/last-checked); broken-integrity items flagged in admin console. No dedup indicator anywhere.

**Edge Cases:** Hash collision (cryptographically negligible under SHA-256); unsupported format (icon + "preview
unavailable"); large file preview (progressive/async sandboxed render); bit-rot detected (restore from replica,
alert); cross-domain identical bytes (two blobs, by design).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ThumbnailGrid`, `PreviewPane`; `DedupService`, `IntegrityService`, `PreviewRenderer` (sandboxed) |
| Backend Flow | On store hash + HMAC domain key → domain-scoped dedup lookup → reuse (set dek_shared) or create blob; on read verify hash; render thumbnails/preview in sandbox with auth + watermark |
| Data Operations | SELECT/UPDATE `storage_objects.ref_count/dek_shared`; UPDATE `scan_results.integrity_verified`; render artefacts cached |
| Validation | Hash recompute match; supported MIME for preview; ref-count GC guards (WORM/hold/dek_shared); sandbox limits |
| Authorization | Preview/thumbnail auth + clearance checked (FR-M13-006) |
| State Changes & Side Effects | Dedup adjusts ref_count + dek_shared; integrity fail quarantines version + alert |
| Failure Handling | Integrity mismatch ⇒ 422 `INTEGRITY_FAILED` + quarantine; render fail/over-limit ⇒ 422 `RENDITION_FAILED`/`RENDER_RESOURCE_LIMIT`, original intact |
| Dependencies | Object storage, sandboxed preview renderer, FR-M13-007/011 |
| Test Guidance | Unit: domain-scoped dedup ref-count, dek_shared, hash verify, timing-normalisation; Integration: tamper→integrity fail; Negative: GC of held/shared blob, cross-domain dedup attempt |

---

### FR-M13-016 — DLP, Content Lifecycle, Provider-Abstracted Engines & Corrected Attach/Fetch Contract

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, DMS Librarian, Uploader (Module Service)

**User Story:** As a Security Officer and integrating developer, I want sensitive content detected (DLP), all
engines provider-abstracted, and a stable attach/fetch contract whose fetch makes "view" and "download"
structurally different so the easy path is the safe path.

**Description:** Runs DLP content inspection (via `DlpProvider`) producing `dlp_findings`; manages content
lifecycle states; exposes the **provider-abstracted** storage/AV/OCR/DLP/PKI layer (R13); and defines the
**canonical, day-one-frozen attach/fetch contract**. The fetch contract is rewritten (R2): callers MUST specify
`intent=VIEW|DOWNLOAD` and receive **structurally different** responses — VIEW returns a short-TTL, one-time,
session/user(+IP)-bound **streamed watermarked render URL through the audited proxy** (no raw blob); DOWNLOAD
returns a file only when the caller holds the DOWNLOAD right. CONFIDENTIAL+ never returns a raw forwardable blob
URL, and every served byte writes `document_audit`.

**Acceptance Criteria:**
1. DLP scans extracted text on ingest and new versions, producing `dlp_findings` with rule, severity, count, suggested action.
2. HIGH/CRITICAL PII findings auto-raise classification to at least CONFIDENTIAL (and set security_domain accordingly) and tag the document.
3. The storage layer is provider-agnostic: switching backend/tier does not change `document_id` or the API contract; AV/OCR/DLP/PKI are likewise behind interfaces (R13).
4. Content lifecycle transitions follow the state machine (§12.1) with chained audit at every transition.
5. The attach contract (`POST /documents:attach`) lets any module bind a document, returning a stable `document_id`/`link_id`.
6. The fetch contract requires `intent`; VIEW returns a one-time, short-TTL, session/user-bound watermarked **render** URL through the audited proxy; DOWNLOAD returns a file ONLY with the DOWNLOAD right; neither ever returns a raw forwardable blob URL for CONFIDENTIAL+; every served byte is audited (R2).

**Business Rules:**
- BR-1: DLP `BLOCK_SHARE` findings prevent external sharing until remediated (FR-M13-013).
- BR-2: Storage tiering is policy-driven and never weakens encryption or WORM.
- BR-3: Modules never receive raw storage keys — only `document_id` and short-lived, session-bound, single-use signed render/download URLs that route through the audited proxy (R2).
- BR-4: A VIEW grant never yields a downloadable file; VIEW and DOWNLOAD are separate rights and separate response shapes (R2).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `dlp_findings` | detections |
| `documents` | lifecycle, classification, security_domain |
| `storage_objects` | tiering/abstraction |
| `document_links` | attach contract |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents:attach` | Module attach (returns document_id/link_id) |
| GET | `/api/v1/documents/{id}:fetch?intent=VIEW\|DOWNLOAD` | Metadata + intent-specific access (R2) |
| GET | `/api/v1/documents/{id}/dlp` | DLP findings |
| POST | `/api/v1/dlp-findings/{id}:resolve` | Accept/dismiss/remediate |

**UI Behavior Notes:** DLP findings panel with severity badges and suggested actions; lifecycle state chip;
admin storage view showing tier distribution; attach is server-to-server but appears in the source module's
"Attachments" panel. Fetch is API-only; SDK helpers expose `view()` (render) and `download()` (file) as
separate methods so developers cannot accidentally leak a download URL from a view (R2).

**Edge Cases:** False-positive PII (dismiss-with-reason); module attaches before scan completes (link allowed,
serving blocked until CLEAN); storage backend migration mid-life (transparent via abstraction); fetch of a
disposed document (404 with tombstone reason); fetch without `intent` (400 `FETCH_INTENT_REQUIRED`); VIEW URL
reused/forwarded (rejected — one-time, session/IP-bound).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DlpFindingsPanel`, `LifecycleChip`, `StorageAdmin`; `DlpService` (via `DlpProvider`), `StorageProvider`, `ScanProvider`, `OcrProvider`, `SigningProvider` (interfaces), `LifecycleService`, `AttachService`, `AuditedFetchProxy` |
| Backend Flow | Extract text → DLP rules → findings + auto-classify/tag → lifecycle transitions guarded by state machine → attach validates + links → fetch resolves intent: VIEW issues one-time session-bound render token through audited proxy; DOWNLOAD checks DOWNLOAD right then streams audited file |
| Data Operations | INSERT `dlp_findings`,`document_links`; UPDATE `documents.classification/status/security_domain`; tiering updates `storage_objects.storage_class` |
| Validation | DLP rule set; lifecycle transition legality; attach completeness; intent required; VIEW/DOWNLOAD right separation; render-token TTL + binding |
| Authorization | DLP manage: Security; attach: module service token; fetch VIEW: VIEW right; fetch DOWNLOAD: DOWNLOAD right |
| State Changes & Side Effects | Auto-classify/tag; BLOCK_SHARE flag; lifecycle audit; tiering jobs; every served byte audited |
| Failure Handling | Attach incomplete ⇒ 400; missing intent ⇒ 400 `FETCH_INTENT_REQUIRED`; download without right ⇒ 403; fetch disposed ⇒ 404 `DOCUMENT_DISPOSED`; DLP engine down ⇒ defer scan, store, block serving until scanned |
| Dependencies | DLP/storage/AV/OCR/PKI providers, FR-M13-002/006/013, all modules (consumers) |
| Test Guidance | Unit: DLP auto-classify, lifecycle guards, intent routing, VIEW-vs-DOWNLOAD response shapes, render-token one-time/binding; Integration: attach→fetch(VIEW) round-trip with audit, fetch(DOWNLOAD) gated by right; Negative: fetch without intent, VIEW URL reuse, download with VIEW-only |

---

### FR-M13-017 — Principal Security-Clearance Management (NEW, R3)

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer (maker), Records Manager (checker), Auditor

**User Story:** As a Security Officer, I want to grant, time-box, suspend and revoke a principal's
document-domain clearance through a maker-checker workflow, so that the access engine has a real, audited
`clearance_level` to gate CONFIDENTIAL+ documents — closing the gap where v1 referenced an undefined attribute.

**Description:** Owns the `security_clearances` entity and the workflow to assign a `clearance_level`
(PUBLIC…TOP_SECRET) to a USER or ROLE, optionally org-scoped, with validity dates and periodic recertification.
Grants are proposed by Security (maker) and approved by Records Manager (checker, maker≠checker), and every
grant/suspend/revoke writes chained audit. The authorization engine (FR-M13-006) reads `effective_clearance_level`
live; default is INTERNAL when no active clearance exists. In plain terms: this is "who decides a clerk may see
CONFIDENTIAL records, and where that decision is recorded" (council Outsider).

**Acceptance Criteria:**
1. A clearance grant specifies principal (USER/ROLE), `clearance_level`, optional org scope, justification, and validity window.
2. Grants require a maker (Security) and a distinct checker (Records Manager); self-grant is rejected (`SOD_VIOLATION`).
3. ACTIVE clearance is resolved live by the access engine; SUSPENDED/EXPIRED/REVOKED immediately removes CONFIDENTIAL+ access.
4. A principal with no clearance row defaults to INTERNAL (can see PUBLIC/INTERNAL only).
5. Clearances support `valid_until` and periodic recertification; lapses auto-expire to INTERNAL.
6. Every clearance change writes chained `document_audit (CLEARANCE_CHANGE)` and `audit_log`.
7. TOP_SECRET clearance requires two approvers and is alerted (mirrors the data classification tier).

**Business Rules:**
- BR-1: maker≠checker on all clearance grants (DI-16).
- BR-2: ROLE-level clearance applies to all users holding that role within the org scope; USER-level overrides upward only.
- BR-3: Clearance never grants access by itself — it only satisfies the classification dimension; an ALLOW ACL/relationship is still required (deny-by-default).
- BR-4: Recertification overdue ⇒ clearance auto-SUSPENDED and Security notified.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `security_clearances` | grant/lifecycle |
| `documents` | classification gate target |
| `document_audit` | clearance change (chained) |
| `users`/`roles` | principals |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/clearances:propose` | Propose a clearance (maker) |
| POST | `/api/v1/clearances/{id}:approve` | Approve (checker) |
| POST | `/api/v1/clearances/{id}:suspend` / `:revoke` | Suspend/revoke |
| GET | `/api/v1/clearances?principal=` | List clearances for a principal |

**UI Behavior Notes:** Clearance admin screen with principal picker, level selector, scope, validity, and
justification; pending-approval queue for the checker; principal clearance card showing level, scope, validity,
recert-due; revoke/suspend with reason. The access explainer (FR-006) deep-links here to show why a clearance
failed.

**Edge Cases:** Role clearance + conflicting user clearance (highest active wins within scope); clearance expiring
mid-session (next access re-resolved and denied); bulk role recertification; revocation of a clearance currently
relied on by an active break-glass (break-glass session ends).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ClearanceAdmin`, `ClearanceApprovalQueue`, `ClearanceCard`; `ClearanceService`, `ClearanceResolver` |
| Backend Flow | Propose → checker approve (maker≠checker) → ACTIVE → resolver caches effective level per principal with TTL + invalidation on change; scheduler expires/suspends on recert lapse |
| Data Operations | INSERT/UPDATE `security_clearances`; INSERT chained `document_audit`, `audit_log` |
| Validation | maker≠checker; level legality; scope validity; two approvers for TOP_SECRET |
| Authorization | Propose: Security; approve: Records Mgr; read: Auditor |
| State Changes & Side Effects | PENDING_APPROVAL→ACTIVE→SUSPENDED/EXPIRED/REVOKED; cache invalidation; notifications |
| Failure Handling | Self-approve ⇒ 403 `SOD_VIOLATION`; unknown principal ⇒ 404; insufficient approvers (TOP_SECRET) ⇒ 422 |
| Dependencies | FR-M13-006 (consumer), workflow engine, notifications |
| Test Guidance | Unit: effective-level resolution, default INTERNAL, maker≠checker; Integration: grant→access allowed, revoke→access denied; Negative: self-grant, expired clearance access |

---

### FR-M13-018 — DPDP Data-Subject Requests & Erasure Precedence Lattice (NEW, R8)

- **Module:** M13-DMS
- **Primary Role(s):** Data Protection Officer (DPO), Records Manager, Auditor

**User Story:** As a DPO, I want to receive and adjudicate DPDP data-subject requests (access/erasure/
rectification/portability) against a clear precedence lattice, so that we honour privacy rights without
breaching statutory retention, legal holds, or WORM immutability.

**Description:** Owns `data_subject_requests` and implements the **precedence lattice (DI-15)**: statutory
retention / active legal hold / WORM-before-retain-until **override** erasure (recorded as `EXEMPT_RETAINED`
with a `legal_basis_exemption`); only where no such basis applies is erasure fulfilled, and then by **domain-local
crypto-shred** (permitted only when `dek_shared=false`) or physical purge of the unshared blob. ACCESS and
PORTABILITY requests assemble the subject's permitted documents; RECTIFICATION routes corrections to the owning
module. This resolves the v1 contradiction where WORM/dedup/crypto-shred/DPDP-erasure pulled in four directions.

**Acceptance Criteria:**
1. A request records subject, type (ACCESS/ERASURE/RECTIFICATION/PORTABILITY), and received timestamp (statutory clock).
2. ERASURE evaluates each in-scope document against the lattice; documents under statutory retention/hold/WORM are exempted with a recorded `legal_basis_exemption` (`EXEMPT_RETAINED`).
3. Non-exempt documents are erased by domain-local crypto-shred when `dek_shared=false`, else physical purge of the unshared blob; shared blobs are never shredded (DI-6).
4. ACCESS/PORTABILITY assemble only documents the subject is entitled to, watermarked, via the audited fetch path.
5. Every decision and erasure writes chained `document_audit (ERASURE)` and updates `documents.dpdp_erasure_state`.
6. The request lifecycle (RECEIVED→UNDER_REVIEW→EXEMPTED/PARTIALLY_FULFILLED/FULFILLED/REJECTED) is auditable and reportable.
7. The DPO who exempts an erasure ≠ the custodian who would execute the purge (SoD).

**Business Rules:**
- BR-1: Statutory/hold/WORM basis always overrides erasure (DI-15).
- BR-2: Crypto-shred only on `dek_shared=false` blobs; otherwise the shared blob survives and only this document's metadata/keys-scope reference is removed.
- BR-3: Tombstone + certificate retained for executed erasures (parallels disposition).
- BR-4: ACCESS responses exclude sealed records the subject is not entitled to see.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `data_subject_requests` | request lifecycle + outcome |
| `documents` | scope, dpdp_erasure_state |
| `storage_objects` | dek_shared, crypto-shred eligibility |
| `disposition_records` | erasure as a disposition variant |
| `document_audit` | ERASURE events (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/dsr` | Register a data-subject request |
| POST | `/api/v1/dsr/{id}:adjudicate` | DPO decision (lattice applied) |
| POST | `/api/v1/dsr/{id}:execute` | Execute fulfilment (dual-control) |
| GET | `/api/v1/dsr/{id}` | Status + affected documents |

**UI Behavior Notes:** DSR console listing requests with type, subject, clock/SLA; per-document lattice outcome
(exempt + basis, or eligible-for-erasure + method); adjudication screen with the legal-basis picker; execution
behind dual-control confirmation; subject-facing summary for ACCESS.

**Edge Cases:** Mixed scope (some exempt, some erasable → PARTIALLY_FULFILLED); erasure target under legal hold
(exempt until released); shared-blob document (metadata reference removed, blob retained for co-referencing doc);
rectification of a WORM record (new corrected version, original retained).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DsrConsole`, `LatticeOutcomePanel`, `DsrExecutionDialog`; `DsrService`, `ErasureService`, `LatticeEvaluator` |
| Backend Flow | Register → enumerate subject documents → evaluate lattice per document → adjudicate (DPO) → execute (dual-control): crypto-shred/purge non-exempt unshared blobs, mark exempt with basis → chained audit |
| Data Operations | INSERT/UPDATE `data_subject_requests`; UPDATE `documents.dpdp_erasure_state`; INSERT `disposition_records` (erasure variant), chained `document_audit` |
| Validation | Lattice precedence; dek_shared guard for crypto-shred; SoD on execute; subject entitlement for ACCESS |
| Authorization | Adjudicate: DPO; execute: dual-control (DPO proposes, Records Mgr executes) |
| State Changes & Side Effects | Request lifecycle; erasure tombstones; notifications to subject + Auditor |
| Failure Handling | Erasure of held/WORM ⇒ `EXEMPT_RETAINED`; crypto-shred of shared blob ⇒ blocked (metadata-only removal); self-execute ⇒ 403 `SOD_VIOLATION` |
| Dependencies | FR-M13-009 (retention/hold), FR-M13-014 (WORM), FR-M13-005 (crypto-shred), M01 (subject) |
| Test Guidance | Unit: lattice precedence, dek_shared guard; Integration: erasure exempts held doc, shreds unshared doc; Negative: shred shared blob, self-execute |

---

### FR-M13-019 — Orphaned-Document Lifecycle (Orphan Reaper) (NEW, R15)

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Records Manager, System

**User Story:** As a Records Manager, I want documents that lose all module links to enter a defined orphan
lifecycle with a default retention and a review queue, so that zero-link documents are never silently abandoned
(or silently destroyed).

**Description:** Replaces v1's "flagged in housekeeping" with a real lifecycle. When `documents.link_count`
reaches 0 (last link detached) and no retention/hold/WORM otherwise governs the document, it transitions to
`ORPHANED`, receives a **default orphan retention policy**, and enters a **review queue**. A periodic
**orphan-reaper job** surfaces orphans for Librarian review; a Records Manager may re-home, retain, or route to
disposition (never auto-destroy without review).

**Acceptance Criteria:**
1. A document whose `link_count` drops to 0 and that is not WORM/held transitions to `ORPHANED` and is assigned the default orphan retention policy.
2. Orphans appear in a review queue with their last-known links, owner, and age.
3. A Librarian/Records Manager may re-link (re-home), retain with a new policy, or propose disposition (maker-checker).
4. Orphans are never auto-destroyed; disposition follows FR-M13-009.
5. WORM/held documents never become orphans regardless of link_count.
6. Every transition writes chained audit; an "Orphaned documents" compliance report lists current orphans.

**Business Rules:**
- BR-1: ORPHANED is reversible by re-linking (returns to ACTIVE).
- BR-2: Default orphan retention is configurable (e.g., 1 year REVIEW) and never shorter than any statutory floor for the type.
- BR-3: Orphan reaping is a review surface, not an automatic destroyer.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `documents` | status=ORPHANED, link_count |
| `document_links` | detached_at drives orphan detection |
| `retention_assignments` | default orphan policy |
| `document_audit` | transitions (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/orphans` | Orphan review queue |
| POST | `/api/v1/documents/{id}:rehome` | Re-link to a module entity |
| POST | `/api/v1/admin/orphans:scan` | Trigger orphan-reaper job |

**UI Behavior Notes:** Orphan review queue with age, last links, owner, suggested action; re-home dialog (pick
module/entity); bulk retain/propose-disposition; orphan badge on the document detail.

**Edge Cases:** Link re-attached during review (auto-returns to ACTIVE); orphan that is statutory (kept, flagged,
never destroyed); mass detach after a module decommission (batch into queue, not auto-dispose).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `OrphanQueue`, `RehomeDialog`; `OrphanReaperJob`, `OrphanService` |
| Backend Flow | On detach decrement link_count → if 0 and not WORM/held → set ORPHANED + default policy → enqueue review; job periodically reconciles link_count vs links |
| Data Operations | UPDATE `documents.status/link_count`; INSERT default `retention_assignments`; INSERT chained `document_audit` |
| Validation | WORM/hold exclusion; statutory floor on default policy |
| Authorization | Review/re-home: Librarian/Records Mgr |
| State Changes & Side Effects | ACTIVE↔ORPHANED; disposition only via FR-009; notifications to Librarian |
| Failure Handling | Re-home to disposed entity ⇒ 409; dispose orphan under hold ⇒ 409 `LEGAL_HOLD_ACTIVE` |
| Dependencies | FR-M13-003 (links), FR-M13-009 (disposition) |
| Test Guidance | Unit: link_count→ORPHANED transition, WORM exclusion; Integration: detach last link→orphan→re-home→ACTIVE; Negative: auto-destroy orphan (must be blocked) |

---

### FR-M13-020 — Audit Hash-Chain Integrity & External Anchoring (NEW, R5)

- **Module:** M13-DMS
- **Primary Role(s):** Auditor, Security/DLP Officer, System

**User Story:** As an Auditor, I want the access-audit trail to be cryptographically tamper-evident and
periodically anchored outside the database, so that even a privileged DBA cannot silently alter history.

**Description:** Maintains the `document_audit` **hash chain** (each row's `row_hash` = SHA-256 over its
canonical payload ‖ the prior row's `row_hash`) and a periodic **anchoring job** that computes a digest (Merkle
root) over each window of audit rows and writes it to `audit_anchors`, anchored to WORM storage, an external
notary, or an RFC-3161 TSA. A **verification job** recomputes the chain and compares against anchors; any
mismatch raises `AUDIT_CHAIN_BROKEN` and alerts. This makes immutability provable, not merely DB-grant-enforced.

**Acceptance Criteria:**
1. Every `document_audit` insert computes `row_hash` over its payload chained to `prev_hash`; inserts are append-only.
2. A periodic anchoring job summarises each contiguous window into an `audit_anchors` digest anchored to WORM/notary/TSA.
3. A verification job recomputes the chain over a range and compares to anchors; a break sets `verification_status=BROKEN` and raises `AUDIT_CHAIN_BROKEN` + alert.
4. Auditors can request on-demand verification for a date/scope range and receive a pass/fail with the offending `seq_no`.
5. Anchors are themselves immutable (WORM/notary receipts retained).
6. e-discovery exports (FR-M13-012) include the anchor references and a verification proof.

**Business Rules:**
- BR-1: The chain genesis row uses a fixed `prev_hash` (zero); ordering is by `seq_no`.
- BR-2: Anchoring cadence is configurable (e.g., hourly to WORM, daily to external notary).
- BR-3: A detected break never auto-repairs; it is investigated as a security incident.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_audit` | prev_hash/row_hash/seq_no chain |
| `audit_anchors` | periodic digests + anchor references |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/audit:verify?from=&to=` | On-demand chain verification |
| GET | `/api/v1/audit/anchors` | List anchors + verification status |
| POST | `/api/v1/admin/audit:anchor` | Force an anchoring run |

**UI Behavior Notes:** Audit-chain health card (last anchor, last verification, status); verify-range action with
pass/fail and offending sequence; anchor list with target (WORM/notary/TSA) and receipt reference.

**Edge Cases:** Clock skew (ordering by `seq_no`, not time); high insert volume (windowed Merkle batching);
anchor target temporarily unavailable (buffer + retry, never skip a window); legitimate gap from archived audit
partitions (anchored before archival).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AuditChainHealth`, `VerifyRangePanel`; `HashChainService`, `AnchoringJob`, `ChainVerifier` |
| Backend Flow | Insert computes row_hash from prev row → anchoring job builds Merkle root per window → writes `audit_anchors` to WORM/notary/TSA → verifier recomputes + compares |
| Data Operations | INSERT-only `document_audit`, `audit_anchors`; SELECT for verification |
| Validation | Chain continuity (prev_hash linkage); anchor immutability; window completeness |
| Authorization | Verify/anchor: Auditor/Security |
| State Changes & Side Effects | Anchors written to WORM/notary; alert on break |
| Failure Handling | Chain break ⇒ `AUDIT_CHAIN_BROKEN` (500) + incident alert; anchor target down ⇒ retry/buffer |
| Dependencies | FR-M13-012, FR-M13-014 (WORM anchor sink), RFC-3161 TSA |
| Test Guidance | Unit: row_hash linkage, Merkle root; Integration: anchor→verify pass; Negative: simulated row tamper→verify fail at correct seq_no |

---

### FR-M13-021 — Interactive Redaction Studio (Phase 2 / Fast-Follow) (R19)

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Security/DLP Officer, Records Manager

**Phasing note:** This FR is **fast-follow (Phase 2)**, deliberately deferred from v1's launch core (R19). Until
it ships, disclosure/RTI needs are served by **certified true copies (FR-M13-011) plus manual interim
redaction**. It is specified here in full so the contract is stable and the build is unblocked when scheduled.

**User Story:** As a Librarian, I want to produce a redacted derivative where selected regions are irreversibly
removed and verified-removed, so that sensitive data can be disclosed safely while the original remains intact
and access-controlled.

**Description:** Produces a **redacted derivative version** (`version_kind=REDACTED`) where selected regions are
burned out of a rasterised render and re-OCR'd to **verify the redacted text is unrecoverable**. The original is
never altered; the derivative inherits/raises classification and links to the source. Redaction runs in the
sandboxed renderer (FR-M13-007).

**Acceptance Criteria:**
1. Redaction produces a new derivative (`REDACTED`) with selected regions burned out; redacted text is not recoverable from the derivative.
2. The derivative is re-OCR'd and diffed to confirm removal; an incomplete redaction fails with `REDACTION_INCOMPLETE`.
3. The original is never altered; derivative links via `derived_from_version_id`.
4. Redaction derivatives inherit/raise classification; never lower than source.
5. Every redaction is recorded in chained `document_audit`.
6. Redaction of a WORM/held source is allowed (read-only source; derivative is a new object).

**Business Rules:**
- BR-1: Redaction is irreversible by construction (burned raster, not overlay).
- BR-2: Re-OCR verification is mandatory before the derivative is served.
- BR-3: Redaction runs in the sandboxed renderer with resource limits (R17).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | redacted derivative |
| `documents` | source + classification |
| `document_audit` | redaction events (chained) |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:redact` | Produce redacted derivative |
| GET | `/api/v1/documents/{id}/redactions` | List redacted derivatives |

**UI Behavior Notes:** Redaction tool with box/area selection over the preview; irreversibility confirmation;
post-redaction verification result; derivative appears as a linked version.

**Edge Cases:** Redaction over OCR text (re-OCR confirms removal); multi-page redaction; vector PDF (rasterise
first); verification finds residual text (block, `REDACTION_INCOMPLETE`).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `RedactionTool`, `RedactionVerifier`; `RenditionService` (sandboxed) |
| Backend Flow | Rasterise → burn regions → re-OCR derivative → diff against redacted regions → store derivative (WORM if statutory) → chained audit |
| Data Operations | INSERT derivative `document_versions`,`storage_objects`; INSERT chained `document_audit` |
| Validation | Irreversibility (raster burn); re-OCR removal proof; classification floor; sandbox limits |
| Authorization | Redact: Librarian/Security |
| State Changes & Side Effects | New derivative version; notifications/audit |
| Failure Handling | Recoverable redaction ⇒ 422 `REDACTION_INCOMPLETE`; render fail ⇒ 422 `RENDITION_FAILED` |
| Dependencies | Sandboxed renderer, OCR, FR-M13-011/014 |
| Test Guidance | Unit: burn-not-overlay, re-OCR diff; Integration: redact→re-OCR confirms removal; Negative: overlay-only redaction recoverable |

---
## 7. UI Requirements

### 7.1 Screen inventory

| Screen | Purpose | Primary FRs |
|--------|---------|-------------|
| Document Explorer (tree + grid) | Browse cabinets/folders, thumbnails, search | 003, 008, 015 |
| Upload / Bulk Upload | Drag-drop, scanner, mobile capture, metadata form | 001, 002 |
| Document Detail | Preview, metadata, versions, ACLs, audit, lifecycle | 004, 006, 012, 016 |
| Version History | Timeline, (optional) check-in/out, supersede, compare | 004 |
| Permissions Panel | Effective access (incl. clearance), grants/denials, explainer | 006, 017 |
| Clearance Admin | Grant/approve/suspend principal clearances | 017 |
| Classification & Tags | Reclassify (maker-checker), tag editor, DLP findings | 002, 016 |
| Retention & Holds Console | Policies, assignments, holds (dual-control + future-match), disposition queue | 009, 014 |
| Hold Notice Tracker | Custodian preservation notices + acknowledgements | 009 |
| Signature Center | Envelope setup, sign action, LTV verify, progress | 010 |
| Certified Copy | Issue certified true copy (v1); redaction entry (Phase 2 stub) | 011, 021 |
| Share Manager | Create/revoke internal & external shares, lockout status | 013 |
| Quarantine Console | Review/release infected uploads | 007 |
| Auditor / Compliance Dashboard | Access trail, chain health, compliance reports, exports | 012, 020 |
| DSR Console | DPDP data-subject requests + lattice outcomes | 018 |
| Orphan Review Queue | Zero-link documents review/re-home | 019 |
| Admin (Types, Storage, Keys, Key-DR) | Taxonomy, storage tiers, encryption + key-DR posture | 002, 005, 016 |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA; keyboard-navigable tree/grid; focus-visible; screen-reader labels on all actions.
- Real data, real states (empty/loading/error/permission-denied/offline) on every screen — no skeleton-only UI.
- Classification badge and (if WORM/held/sealed/orphaned) status icons on every document surface.
- Restricted documents render metadata-only with a clear "no access" affordance — never partial content leak;
  the access explainer names the failing dimension (RBAC / clearance / ACL / need-to-know).
- Dynamic watermark always visible on restricted previews/downloads/prints; VIEW renders are streamed (no file).
- Destructive/lifecycle actions (dispose, **release hold**, downgrade, **clearance revoke**, **DSR execute**)
  require confirmation + reason and show the SoD second-approver step.
- All lists paginated (max 100) with facets/filters; `DD-MMM-YYYY` dates; user-locale rendering.

---

## 8. (Reserved — merged into §6 LLDs)

## 9. (Reserved — see §6 and §10)

---

## 10. API & Integration

### 10.1 Conventions

- Base path `/api/v1`; JSON over HTTPS (TLS 1.2+); OIDC/JWT bearer auth; RBAC + org scope + clearance.
- All list endpoints paginated (`page`,`limit`≤100) and filterable; binaries only via short-lived, single-use,
  session/user-bound signed render/download URLs routed through the **audited proxy** (never a raw blob URL).
- Idempotency-Key header supported on upload/attach to make retries safe.
- Action-style endpoints use the `:verb` suffix (e.g., `:attach`, `:checkin`, `:fetch`).
- `:fetch` REQUIRES `intent=VIEW|DOWNLOAD` (R2).

### 10.2 Canonical error envelope

```json
{
  "error": { "code": "WORM_IMMUTABLE", "message": "Document is under WORM lock until 2046-04-01.", "field": "documentId" },
  "requestId": "req_8f2a91c4"
}
```

### 10.3 Error-code catalog (module-specific, in addition to shared codes)

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_FILE_TYPE` | 400 | MIME not in type whitelist |
| `FILE_TOO_LARGE` | 400 | Exceeds type size cap |
| `EMPTY_FILE` | 400 | Zero-byte/corrupt upload |
| `FETCH_INTENT_REQUIRED` | 400 | `:fetch` called without `intent=VIEW\|DOWNLOAD` (R2) |
| `METADATA_INVALID` | 422 | Metadata fails type JSON-Schema |
| `MALWARE_DETECTED` | 422 | AV flagged the upload |
| `RENDER_RESOURCE_LIMIT` | 422 | Archive/decompression/nesting limit exceeded (R17) |
| `INTEGRITY_FAILED` | 422 | Checksum mismatch (tamper/bit-rot) |
| `DOCUMENT_LOCKED` | 409 | Checked out by another user |
| `CHECKOUT_NOT_SUPPORTED` | 409 | Type `checkout_mode=NONE` |
| `WORM_IMMUTABLE` | 409 | Mutation/delete blocked by WORM lock |
| `RETENTION_SHORTEN_FORBIDDEN` | 422 | Attempt to reduce retain-until |
| `RETENTION_PERMANENT` | 409 | Destroy attempted on permanent record |
| `LEGAL_HOLD_ACTIVE` | 409 | Action blocked by active legal hold |
| `HOLD_RELEASE_SOD` | 403 | Hold release missing distinct approver (R10) |
| `ANCHOR_UNCONFIRMED` | 409 | Auto-DESTROY blocked; retention anchor not confirmed (R12) |
| `SOD_VIOLATION` | 403 | Maker == checker / self-approval |
| `CLASSIFICATION_LOCKED` | 403 | Unauthorised downgrade |
| `CLEARANCE_INSUFFICIENT` | 403 | Principal clearance < document classification (R3) |
| `DOCUMENT_NOT_ATTACHABLE` | 409 | Document deleted/disposed/orphaned |
| `LINK_CONFLICT` | 409 | Duplicate primary link |
| `SHARE_BLOCKED_DLP` | 403 | DLP blocks external share |
| `SHARE_LIMIT_REACHED` | 403 | Access-count/expiry exceeded |
| `SHARE_LOCKED` | 429 | Share password brute-force lockout (R16) |
| `BREAK_GLASS_LOCKED` | 429 | Break-glass auth brute-force lockout (R16) |
| `SIGNATURE_INVALID` | 422 | Signed content tampered |
| `SIGNATURE_METHOD_NOT_ALLOWED` | 422 | Method not in type's allowed list (R7) |
| `SIGNATURE_LTV_REQUIRED` | 422 | Statutory signature missing timestamp/LTV (R4) |
| `SIGNING_SERVICE_UNAVAILABLE` | 503 | PKI/eSign down |
| `KEY_SERVICE_UNAVAILABLE` | 503 | KMS unavailable |
| `RENDITION_FAILED` | 422 | Watermark/redaction/preview render failed |
| `REDACTION_INCOMPLETE` | 422 | Re-OCR found recoverable text (R19/FR-021) |
| `AUDIT_CHAIN_BROKEN` | 500 | Audit hash-chain verification failed (R5) |
| `ERASURE_EXEMPTED` | 409 | DPDP erasure overridden by statutory/hold/WORM basis (R8) |
| `DOCUMENT_DISPOSED` | 404 | Fetch of disposed document |

### 10.4 Representative request/response examples

**Module attach (M02 proof for a personal-detail change):**

```http
POST /api/v1/documents:attach
Content-Type: multipart/form-data
Idempotency-Key: 7c1f...e2

{ "documentTypeCode": "ID_PROOF", "title": "Aadhaar – EMP-3001",
  "moduleCode": "M02", "entityName": "change_requests", "entityRefId": "cr-5501",
  "linkRole": "PROOF", "isPrimary": true, "classification": "CONFIDENTIAL" }
  + file=<binary>
```

```json
{
  "documentId": "doc-0001", "docNo": "DOC/2026/0001001",
  "linkId": "lk-01", "status": "SCANNING", "currentVersionNo": 1,
  "securityDomain": "DOM_CONFIDENTIAL",
  "requestId": "req_a1b2c3"
}
```

**Fetch — VIEW intent (R2: streamed, watermarked, one-time, session-bound render; no raw blob):**

```http
GET /api/v1/documents/doc-0001:fetch?intent=VIEW
Authorization: Bearer <jwt>
```

```json
{
  "documentId": "doc-0001", "title": "Aadhaar – EMP-3001", "classification": "CONFIDENTIAL",
  "status": "ACTIVE", "currentVersionNo": 1, "mimeType": "application/pdf",
  "renderUrl": "https://dms.gov/api/v1/proxy/render/ot_9f1a...?bind=sess_44ab",
  "renderUrlMode": "STREAM_WATERMARKED", "oneTimeUse": true,
  "boundSession": "sess_44ab", "renderUrlExpiresAt": "2026-04-12T10:10:00Z",
  "downloadAvailable": false,
  "requestId": "req_d4e5f6"
}
```

**Fetch — DOWNLOAD intent (only with DOWNLOAD right; audited file via proxy):**

```json
{
  "documentId": "doc-0001", "classification": "CONFIDENTIAL", "currentVersionNo": 1,
  "downloadUrl": "https://dms.gov/api/v1/proxy/download/dl_77be...?bind=sess_44ab",
  "downloadUrlMode": "FILE_AUDITED", "oneTimeUse": true,
  "downloadUrlExpiresAt": "2026-04-12T10:10:00Z",
  "requestId": "req_d7e8f9"
}
```

**Fetch without intent (rejected):**

```json
{ "error": { "code": "FETCH_INTENT_REQUIRED", "message": "Specify intent=VIEW or intent=DOWNLOAD.", "field": "intent" }, "requestId": "req_aa01" }
```

**Clearance-insufficient access (rejected):**

```json
{ "error": { "code": "CLEARANCE_INSUFFICIENT", "message": "Clearance INTERNAL is below document classification CONFIDENTIAL.", "field": "clearance" }, "requestId": "req_bb02" }
```

**Hold release without second approver (rejected):**

```json
{ "error": { "code": "HOLD_RELEASE_SOD", "message": "Hold release requires an approver distinct from the proposer.", "field": "releaseApprovedBy" }, "requestId": "req_cc03" }
```

**DPDP erasure exempted by statutory basis:**

```json
{ "dsrId": "dsr-01", "status": "EXEMPTED", "erasureMethod": "EXEMPT_RETAINED",
  "legalBasisExemption": "Statutory Service Register permanent retention",
  "affectedDocumentCount": 4, "requestId": "req_dd04" }
```

### 10.5 Integration contracts

| Consumer | Integration | Direction |
|----------|-------------|-----------|
| M01–M12 | `documents:attach` / `:fetch?intent=` (binaries by reference) | Modules → M13 |
| M01 | `EMPLOYEE_RETIRE` / `EMPLOYEE_MERGE` lifecycle events (anchor recompute) | M01 → M13 (event bus) |
| M09 | Charge-sheets, exhibits, sealed PI reports; `CASE_CLOSE` events | M09 → M13 |
| M11/M12 | PPO, SR pages, certified copies (WORM); `EMPLOYEE_RETIRE` confirmation | M11/M12 → M13 |
| M14 | Compliance metrics (read-only reports) | M13 → M14 |
| Platform | `notifications`, `audit_log`, KMS (+ key-DR), AV, OCR, DLP, PKI, RFC-3161 TSA, object storage, event bus | bidirectional |

> **Lifecycle event contract (R12):** events are delivered at-least-once via the platform outbox/event bus,
> de-duplicated by `dedupe_key` into `lifecycle_event_inbox`; only `is_confirmed=true` events flip
> `documents.anchor_confirmed` and unblock auto-DESTROY. `ANCHOR_CORRECTION` events recompute due dates and
> re-gate disposition.

---

## 11. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | P95 < 500 ms for metadata ops; upload throughput supports 250 MB resumable; preview first-page < 2 s; search P95 < 800 ms |
| Scalability | Horizontal API scaling; object storage to PB scale; domain-scoped dedup keeps growth sub-linear to ingest |
| Availability | 99.9% uptime; degrade gracefully (metadata search if index down; resumable upload on storage blips). **KMS is a named top-tier availability risk (R6): no single CMK loss may darken the archive — multi-region/HSM escrow + tested recovery runbook required** |
| Durability | Object storage ≥ 11 nines durability with cross-zone replication; RPO ≤ 15 min, RTO ≤ 4 h; CMK escrow restore tested quarterly |
| Security | Envelope encryption (AES-256-GCM) + KMS; TLS 1.2+; OWASP ASVS L2; deny-by-default ACL + defined clearance; **hash-chained + anchored audit**; **encrypted, access-scoped search index excluding SECRET+ full text**; anti-brute-force on shares + break-glass; **sandboxed render workers**; no raw storage keys to clients; **VIEW/DOWNLOAD structurally separated** |
| Privacy | DPDP 2023 alignment; PII detection (DLP) + minimisation; certified copies (redaction Phase 2); purpose-bound sharing; **data-subject-request lifecycle + erasure precedence lattice**; **no dedup existence oracle** |
| Data Residency | **All data and all replicas (incl. cross-zone, escrow, index, audit anchors) reside in-country (DPDP localisation); no provider/COTS adapter may move PII out of the sovereign boundary (R21)** |
| Compliance | Statutory retention enforced; WORM immutability (proven on CGG backend); certified destruction; immutable, anchored audit; e-discovery export with chain proof; IT Act §3A signatures (LTV-durable) |
| Integrity | SHA-256 checksums; periodic integrity scans; tamper detection blocks serving; audit hash-chain verification |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Metrics on ingest/scan/OCR latency, quarantine rate, integrity failures, disposition backlog, **audit-chain health, key-DR posture, hold-notice acknowledgement SLA, DSR SLA, dead-letter depth**; alerting |
| Maintainability | **Provider-abstracted storage + AV + OCR + DLP + PKI** (build-vs-buy is a deployment choice); versioned `document_types` schemas; API `/v1` stability; thin orchestration core |

---

## 12. Workflow & State Diagrams (State Tables)

### 12.1 Document lifecycle (`document_status`)

| From | Event | To | Guard / Side effect |
|------|-------|----|----|
| (none) | Upload accepted | DRAFT | Validation passed |
| DRAFT | Scan starts | SCANNING | AV queued (archive guards) |
| SCANNING | Scan CLEAN | ACTIVE | Sandboxed OCR/preview enqueued; chained audit VERSION_ADD |
| SCANNING | Scan INFECTED | QUARANTINED | Isolate + notify Security |
| QUARANTINED | Released (Security) | ACTIVE | Override-with-reason audited |
| ACTIVE | Check-out (lockable types) | CHECKED_OUT | Exclusive lock |
| CHECKED_OUT | Check-in | ACTIVE | New version; lock released |
| ACTIVE | New version supersedes | ACTIVE | Prior version → SUPERSEDED |
| ACTIVE | Legal hold placed | ON_LEGAL_HOLD | Disposition frozen |
| ON_LEGAL_HOLD | Hold released (dual-control) | ACTIVE | Recompute due date |
| ACTIVE | Last link detached (not WORM/held) | ORPHANED | Default orphan retention + review queue (R15) |
| ORPHANED | Re-home / re-link | ACTIVE | Returns to active (R15) |
| ACTIVE | Disposition due | DISPOSITION_DUE | No active hold; anchor confirmed |
| DISPOSITION_DUE | Disposition executed | DISPOSED/ARCHIVED | Certificate + tombstone (crypto-shred if unshared) |
| ACTIVE | Soft delete | DELETED | Not allowed if WORM/hold |

### 12.2 Version state table

| From | Event | To |
|------|-------|----|
| (none) | Check-in / add | CURRENT |
| CURRENT | New version added | SUPERSEDED |
| CURRENT | Supersede (re-scan) | SUPERSEDED (kept for audit) |
| CURRENT | Certified-copy / redact / sign derivative | CURRENT (derivative is a new linked version) |

### 12.3 Legal hold state table (now with placement + release SoD, R10)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Place (standard) | ACTIVE | LH Admin; sets `legal_hold_count++`, doc→ON_LEGAL_HOLD |
| (none) | Place (high-value) | PENDING_APPROVAL | LH Admin proposes |
| PENDING_APPROVAL | Approve placement | ACTIVE | LH Approver (≠ placer) |
| ACTIVE | Continuous-eval future match | ACTIVE | Auto-add `legal_hold_items` (is_auto_added) + custodian notice |
| ACTIVE | Propose release | RELEASE_PROPOSED | `release_proposed_by` + reason |
| RELEASE_PROPOSED | Approve release | RELEASED | `release_approved_by ≠ proposer`; `legal_hold_count--`; recompute due |

### 12.4 Disposition state table

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Propose | PROPOSED | Librarian; doc DISPOSITION_DUE |
| PROPOSED | Approve | APPROVED | Records Mgr; maker≠checker; no hold; anchor confirmed |
| PROPOSED | Reject | REJECTED | With reason |
| APPROVED | Execute | EXECUTED | No hold; confirmed anchor; purge/crypto-shred + certificate + tombstone |
| any | Hold present | BLOCKED_HOLD | Abort execution |

### 12.5 Signature request state table

| From | Event | To |
|------|-------|----|
| DRAFT | Send | SENT |
| SENT | First sign | IN_PROGRESS |
| IN_PROGRESS | All signed (+ timestamp + LTV for statutory) | COMPLETED |
| IN_PROGRESS | Decline | DECLINED |
| SENT/IN_PROGRESS | Expiry | EXPIRED |
| any | Cancel | CANCELLED |

### 12.6 Share state table

| From | Event | To |
|------|-------|----|
| (none) | Create | ACTIVE |
| ACTIVE | Expiry/limit reached | EXPIRED |
| ACTIVE | Password brute-force threshold | LOCKED |
| LOCKED | Lockout window elapsed / Security unlock | ACTIVE |
| ACTIVE | Revoke | REVOKED |

### 12.7 Clearance state table (NEW, R3)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Propose | PENDING_APPROVAL | Security (maker) |
| PENDING_APPROVAL | Approve | ACTIVE | Records Mgr (≠ maker); TOP_SECRET needs 2 approvers |
| ACTIVE | Recert overdue | SUSPENDED | Auto; notify Security |
| ACTIVE | valid_until passed | EXPIRED | Auto → effective INTERNAL |
| ACTIVE/SUSPENDED | Revoke | REVOKED | With reason |

### 12.8 DSR state table (NEW, R8)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Register | RECEIVED | Clock starts |
| RECEIVED | DPO review | UNDER_REVIEW | |
| UNDER_REVIEW | All in-scope exempt | EXEMPTED | Statutory/hold/WORM basis recorded |
| UNDER_REVIEW | Mixed outcome | PARTIALLY_FULFILLED | Some erased, some exempt |
| UNDER_REVIEW | All erasable | FULFILLED | Crypto-shred/purge (unshared) |
| UNDER_REVIEW | Not actionable | REJECTED | With reason |

### 12.9 Lifecycle-event inbox state table (NEW, R12)

| From | Event | To |
|------|-------|----|
| (none) | Event received | RECEIVED |
| RECEIVED | Processed (anchor recompute) | PROCESSED |
| RECEIVED | Processing error | FAILED |
| FAILED | Retries exhausted | DEAD_LETTER |

---

## 13. Notifications

| Event | Recipient | Channel | Template (abbrev) |
|-------|-----------|---------|-------------------|
| Upload quarantined (malware) | Security/DLP, uploader | In-app + email | "Upload {docNo} blocked by security scan" |
| Reclassification (downgrade) pending | Second approver | In-app | "Approve classification downgrade for {docNo}" |
| Check-out auto-expiry | Lock holder | In-app | "Your lock on {docNo} expired" |
| Signature requested | Signer | In-app + email | "Action: sign {docNo}" |
| Signature completed/declined | Originator | In-app + email | "{docNo} signing {status}" |
| Disposition due | Records Manager, Librarian | In-app | "{n} documents due for disposition" |
| Disposition approval requested | Records Manager | In-app | "Approve disposition of {docNo}" |
| Legal hold placed / release proposed / released | Records Manager, LH Approver, custodians | In-app + email | "Legal hold {holdNo} {status}" |
| Hold preservation notice | Custodian | In-app + email | "Preserve records for matter {holdNo}; acknowledge" |
| Hold notice overdue | LH Approver | In-app + email | "Custodian acknowledgement overdue for {holdNo}" |
| Share created / expiring soon / locked | Recipient/owner, Security (lockout) | Email | "Document {docNo} shared / link expiring / link locked" |
| Integrity failure detected | Security/DLP, Records Manager | In-app + email | "Integrity check failed for {docNo}" |
| Audit chain break detected | Security/DLP, Auditor | In-app + email | "Audit chain verification failed — incident raised" |
| Break-glass access / lockout | Security/DLP | In-app + email | "Break-glass access to {docNo} by {user}" |
| Clearance granted / expiring / suspended | Principal, Security | In-app + email | "Clearance {level} {status}" |
| DSR received / adjudicated | DPO, subject | In-app + email | "Data-subject request {dsrNo} {status}" |
| Document orphaned | DMS Librarian | In-app | "{n} documents are now orphaned — review" |
| Key-DR posture degraded | Sys Admin, Security | In-app + email | "Key escrow/replication degraded — act" |

> **Sensitive-notification rule (R20):** for `is_sealed=true` or SECRET/TOP_SECRET documents and sealed matters,
> notifications **omit document/matter identifiers** (`docNo`, `holdNo`, `matterName`) and content; recipients
> get a generic notice ("a sealed record requires your action") and must retrieve details **in-app after
> authentication**. All notifications write to the shared `notifications` ledger.

---

## 14. Reporting & Analytics

| Report | Description | Audience |
|--------|-------------|----------|
| Documents without retention | Docs missing a retention assignment | Records Manager |
| Overdue disposition | DISPOSITION_DUE past due, not held | Records Manager |
| Legal-hold inventory | Active holds + held + auto-added counts | Legal Hold Admin/Approver, Auditor |
| Hold-notice acknowledgement | Sent/acknowledged/overdue per matter | Legal Hold Approver |
| Sensitive-access log | Who accessed CONFIDENTIAL+ in a period | Auditor, Security |
| Classification distribution | Counts by classification/type/org unit | Security, M14 |
| Quarantine/infection rate | AV blocks over time, repeat offenders | Security |
| Integrity health | Verified vs failed checksum scans | Security, Records Manager |
| Audit chain health | Last anchor, last verification, any break | Auditor, Security |
| Storage & dedup efficiency | Logical vs physical bytes, tier mix, domain-scoped dedup ratio | Sys Admin |
| Signing throughput | Pending/completed/declined envelopes, LTV coverage, cycle time | Records Manager |
| DLP findings | Open/remediated PII findings by rule/severity | Security/DLP |
| Clearance register | Active clearances by level/scope, recert-due | Security, Auditor |
| DPDP request log | DSRs by type/status/SLA, exemptions vs fulfilments | DPO, Auditor |
| Orphaned documents | Current orphans, age, last links | Records Manager, Librarian |
| Key-DR posture | Escrow/replication status, last DR rehearsal | Sys Admin, Security |

All reports are permission-scoped, paginated, and exportable (CSV/JSON); M14 consumes aggregates read-only.

---

## 15. Migration & Launch

### 15.0 Day-one contract freeze (R14 — the One Thing To Do First)

Before any internals are built, **freeze and publish the stubbed attach/fetch contract** (`:attach`,
`:fetch?intent=VIEW|DOWNLOAD`, error catalog §10.3, `document_id`/`securityDomain` semantics, and the defined
`clearance_level`/`security_clearances` model) as a **mock service** (Appendix F). All 13 other module teams
develop and test against this mock while M13's internals are constructed behind it, removing M13 from the
program critical path. The contract version is pinned (`/api/v1`) and changes only via amendment.

### 15.1 Data migration (gated programme, R18)

- Treat legacy migration as a **gated programme**, not a one-page step: inventory legacy stores (file shares,
  scanned archives, module-local blobs); classify by type, sensitivity, and **security domain**.
- Ingest each file through the standard pipeline (scan + hash + domain-scoped dedup + sandboxed OCR), encrypting
  on ingest; assign `document_type`, classification, retention, WORM for statutory records, and clearance-bearing
  ACLs.
- Backfill `document_links` from each module's attachment references; verify FK integrity (DI-14) and recompute
  `link_count` (orphan detection).
- **Reconciliation SLAs and dead-letter handling:** every batch reports matched/unmatched counts and checksum
  parity against a target SLA; failures route to a **dead-letter queue** for triage, never silent drop; a
  migration audit report (and chained audit) is produced per batch.

### 15.2 Cutover & launch

- Stand up storage buckets (HOT/WARM/COLD/WORM), KMS keys (+ escrow/replication), AV/OCR/DLP/PKI/TSA
  integrations, encrypted search index; smoke-test the pipeline.
- Dual-run: modules attach to M13 (real) while legacy remains read-only; verify fetch(VIEW/DOWNLOAD)/preview/
  search parity and audit chaining.
- Freeze legacy writes; flip modules to M13 attach contract; decommission legacy after reconciliation sign-off.

### 15.3 Launch readiness checklist

- [ ] Encryption (KMS) + TLS verified; no plaintext at rest.
- [ ] **Key-DR proven:** CMK escrow/replication live; recovery runbook rehearsed end-to-end (R6).
- [ ] **WORM object-lock verified on the ACTUAL CGG storage backend** as a gating spike, not a checkbox (R-Executor).
- [ ] AV (archive limits), sandboxed OCR/preview/render, DLP, PKI, **RFC-3161 TSA + PAdES-LTV** integrations green.
- [ ] Retention/hold/disposition tested with maker-checker, **hold-release dual control**, and **event-driven anchor** recompute.
- [ ] **Audit hash-chain + anchoring** verified (insert→anchor→verify; tamper detected).
- [ ] **Clearance model** seeded; access engine reads `effective_clearance_level`; default-INTERNAL verified.
- [ ] **Fetch contract** VIEW vs DOWNLOAD structurally separated; no raw blob URL for CONFIDENTIAL+; every byte audited.
- [ ] **Anti-brute-force** lockouts active on `/shared/{token}` and break-glass.
- [ ] **DPDP DSR** lattice tested (exempt held/WORM; crypto-shred unshared).
- [ ] **Search index** encrypted + access-scoped; SECRET/TOP_SECRET excluded from full text.
- [ ] **DB-restore-vs-immutable-store/KMS consistency runbook** validated (R19): a point-in-time DB restore
      reconciles metadata against disposed blobs/keys (no resurrected disposed documents; no dangling metadata).
- [ ] **Data residency** confirmed: all replicas/escrow/index/anchors in-country (R21).
- [ ] Attach/fetch contract validated against M01, M02, M09, M11.
- [ ] Compliance reports populated; M14 read-only access confirmed.
- [ ] Migration reconciliation: 0 unmatched links, 0 failed checksums (or dead-lettered + logged).

### 15.4 DB-restore vs immutable-store/KMS consistency runbook (R19)

A point-in-time PostgreSQL restore can desynchronise metadata from the immutable object store and KMS. The
runbook: (1) after restore, run a **consistency reconciler** that cross-checks `documents`/`document_versions`
against `storage_objects`, disposition tombstones, and KMS key state; (2) any **disposed** document whose
metadata reappears is re-tombstoned (blob/key already gone); (3) any metadata referencing a missing blob is
flagged for integrity review; (4) the audit chain is re-verified against `audit_anchors` to detect restore-window
gaps. No restored state is trusted until the reconciler passes.

---

## 16. Traceability / Dependency / Parallel-Agent Plan

### 16.1 Requirements ↔ entities ↔ APIs traceability matrix

| FR | Title | Key entities | Key APIs |
|----|-------|--------------|----------|
| FR-M13-001 | Upload & Ingestion | documents, document_versions, storage_objects, scan_results, document_links | POST /documents, /documents/bulk, :resume, :attach |
| FR-M13-002 | Types/Taxonomy/Classification/Signature-Checkout Policy | document_types, document_tags, documents, dlp_findings | POST /document-types, /tags, :reclassify |
| FR-M13-003 | Folders & Attach Contract | folders, document_links, document_acls, documents | POST /folders, :attach, DELETE /document-links |
| FR-M13-004 | Versioning & Optional Check-in/out | document_versions, checkout_locks, documents, scan_results | :checkout, :checkin, :supersede, /versions |
| FR-M13-005 | Encryption (KMS), TLS & Key-DR | storage_objects, documents, document_audit | /keys:rotate, :break-glass, /encryption/status, /keys:recover |
| FR-M13-006 | Access Control (+clearance) | document_acls, documents, folders, security_clearances, document_audit | POST /acls, /access:check |
| FR-M13-007 | Malware Scan, Validation & Sandboxing | scan_results, documents, document_versions | /quarantine, :release, :rescan |
| FR-M13-008 | Sandboxed OCR & Secured Search | document_versions, scan_results, documents, document_tags | /search, :reindex, /ocr |
| FR-M13-009 | Retention/Hold(SoD+future)/Event Disposition | retention_policies, retention_assignments, legal_holds, legal_hold_items, hold_notices, lifecycle_event_inbox, disposition_records | /retention-policies, /retention, /legal-holds, :approve-placement, :release, /hold-notices:acknowledge, :propose/:approve |
| FR-M13-010 | E-Signature (PAdES-LTV + TSA) | signature_requests, signatures, signature_ltv_artifacts, document_versions | /signature-requests, /sign, :cancel, /verify |
| FR-M13-011 | Watermark & Certified Copies (v1) | document_versions, documents, signatures, document_audit | :certified-copy, /render |
| FR-M13-012 | Access Audit & Compliance | document_audit, audit_anchors, documents, document_shares, audit_log | /audit, /reports/compliance, :export |
| FR-M13-013 | Secure Sharing (anti-brute-force) | document_shares, documents, dlp_findings, document_audit | /shares, /shared/{token}, :revoke |
| FR-M13-014 | WORM Storage | documents, storage_objects, document_versions, disposition_records | :declare-worm, :extend-retention, /worm-status |
| FR-M13-015 | Domain-Scoped Dedup/Integrity/Preview | storage_objects, document_versions, scan_results, documents | /thumbnail, /preview, /integrity:scan |
| FR-M13-016 | DLP/Lifecycle/Providers/Attach-Fetch | dlp_findings, documents, storage_objects, document_links | :attach, :fetch?intent=, /dlp, :resolve |
| FR-M13-017 | Principal Clearance | security_clearances, documents, document_audit | /clearances:propose, :approve, :suspend, :revoke |
| FR-M13-018 | DPDP DSR & Erasure Lattice | data_subject_requests, documents, storage_objects, disposition_records, document_audit | /dsr, :adjudicate, :execute |
| FR-M13-019 | Orphan Reaper | documents, document_links, retention_assignments, document_audit | /admin/orphans, :rehome, /orphans:scan |
| FR-M13-020 | Audit Chain & Anchoring | document_audit, audit_anchors | /audit:verify, /audit/anchors, /audit:anchor |
| FR-M13-021 | Interactive Redaction (Phase 2) | document_versions, documents, document_audit | :redact, /redactions |

### 16.2 Dependency / build order

0. **Day-one (R14):** freeze + publish the stubbed attach/fetch contract, error catalog, `documents` entity,
   and `clearance_level`/`security_clearances` model as a mock (Appendix F) — unblocks all 13 modules.
1. **Foundation:** storage abstraction + KMS encryption + key-DR (FR-005) and core entities (documents,
   versions, storage_objects with security_domain).
2. **Ingestion safety:** validation + malware scan + render sandboxing (FR-007), then upload/ingestion (FR-001).
3. **Organisation:** types/taxonomy/signature-checkout policy (FR-002), folders + attach contract (FR-003).
4. **Content ops:** versioning (FR-004), domain-scoped dedup/integrity/sandboxed preview (FR-015), secured
   OCR/search (FR-008).
5. **Governance core:** clearance (FR-017), access control (FR-006), audit + hash-chain + anchoring (FR-012,
   FR-020), retention/hold/event-disposition (FR-009), WORM (FR-014).
6. **Privacy & hygiene:** DPDP DSR lattice (FR-018), orphan reaper (FR-019).
7. **Advanced:** e-signature LTV (FR-010), watermark/certified copies (FR-011), sharing (FR-013), DLP/lifecycle/
   providers/fetch (FR-016). **Phase 2 fast-follow:** interactive redaction (FR-021).

### 16.3 Parallel-agent plan

| Track | FRs | Notes |
|-------|-----|-------|
| 0 — Contract freeze | 003/016 (stub) | Mock attach/fetch + clearance model day one; unblocks all modules |
| A — Storage & Crypto | 005, 015 | Storage provider + KMS + key-DR + domain-scoped dedup/integrity; unblocks all |
| B — Ingestion & Safety | 001, 007 | Depends on A; render sandboxing |
| C — Taxonomy & Structure | 002, 003 | Parallel to B after entities exist |
| D — Content Ops | 004, 008 | Depends on A/B; secured index |
| E — Governance | 006, 009, 012, 014, 017, 020 | Clearance + access + audit-chain + retention; depends on entities + A |
| F — Privacy & Hygiene | 018, 019 | Depends on E (retention/hold/crypto-shred/links) |
| G — Advanced | 010, 011, 013, 016 | Depends on D/E |
| H — Phase 2 | 021 | Fast-follow redaction; depends on 011 |

Shared contracts (entities, error catalog, attach/fetch API, clearance model) are frozen first to enable safe
parallelism.

### 16.4 Final reconciliation table (0 unresolved gaps)

| Checkpoint | Status |
|-----------|--------|
| All 26 entities have full field tables | ✅ |
| All 26 entities have 2–3 sample rows | ✅ |
| Canonical `documents` defined here; shared entities referenced not redefined | ✅ |
| 21 FRs, each with full structure + LLD table | ✅ |
| Every FR maps to entities + APIs (16.1) | ✅ |
| Error catalog covers all FR failure modes (incl. v2 additions) | ✅ |
| State tables cover document/version/hold/disposition/signature/share/clearance/DSR/event | ✅ |
| Amendments (v1→v2) table maps every adopted improvement | ✅ |
| All 21 adopted improvements incorporated | ✅ |
| Critical risks R1–R4 mitigated as requirements/controls | ✅ |
| High risks R5–R12, R14 mitigated | ✅ |
| Med/Low risks R15–R22 mitigated | ✅ |
| Notifications/Reporting/Migration sections complete (incl. residency, restore runbook) | ✅ |
| Attach/fetch contract (VIEW vs DOWNLOAD) for M01–M12 specified + frozen | ✅ |
| Encryption/key-DR/WORM/retention/anchored-audit (statutory) specified | ✅ |
| Unresolved gaps | **0** |

### 16.5 Risk → mitigation traceability (council Risk Register)

| Risk | Severity | Mitigated in |
|------|----------|--------------|
| R1 Dedup vs CMK vs crypto-shred | Critical | E19 (security_domain/key_scope/dek_shared), DI-6, FR-005 BR-4, FR-015 |
| R2 Signed-URL fetch bypass | Critical | FR-016 (intent VIEW/DOWNLOAD, audited proxy), §10.4, FR-013 |
| R3 `clearance_level` undefined | Critical | E21, FR-017, FR-006, DI-16, §3.3 |
| R4 PAdES not durable | Critical | E26, FR-010 (RFC-3161+LTV), `ltv_status` |
| R5 Audit immutability DB-only | High | E12 (prev/row_hash), E23, FR-020, DI-3 |
| R6 KMS single point of failure | High | FR-005 (key-DR/escrow/runbook), NFR Availability, Appendix E |
| R7 Search index weak copy | High | FR-008 (encrypted, access-scoped, SECRET+ excluded), NFR Security |
| R8 DPDP vs retention unreconciled | High | E22, FR-018, DI-15 lattice |
| R9 Dedup oracle | High | E19 (HMAC dedup_index_key), DI-6, FR-001 AC-7, FR-015 AC-7 |
| R10 No SoD on hold release | High | E10 (release fields), FR-009 AC-6, DI-17, §12.3 |
| R11 Holds miss future matches | High | E24, FR-009 AC-7 (continuous eval + notices) |
| R12 Stale anchor disposition | High | E25, FR-009 AC-8, DI-18, anchor_confirmed |
| R13 Over-build engines | Med-High | §4 + FR-016 provider abstraction; phase plan |
| R14 M13 serialises program | High | §15.0, §16.2 step 0, Appendix F |
| R15 Orphaned documents | Med | FR-019, ORPHANED state, link_count |
| R16 No anti-brute-force | Med | E13 (lockout fields), FR-013/005, errors SHARE_LOCKED/BREAK_GLASS_LOCKED |
| R17 Render DoS | Med | FR-007/008/015 sandbox + archive limits, RENDER_RESOURCE_LIMIT |
| R18 Migration underspecified | Med | §15.1 gated programme + dead-letter |
| R19 DB restore inconsistency | Med | §15.4 reconciler runbook |
| R20 Notification metadata leak | Med | §13 sensitive-notification rule |
| R21 Data residency | Med | NFR Data Residency |
| R22 TOP_SECRET / heavy check-out over-engineering | Low-Med | §3.3 TOP_SECRET justification; `checkout_mode` optional |

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| Envelope encryption | Encrypting data with a per-object DEK that is itself encrypted (wrapped) by a KMS master key |
| DEK / CMK | Data Encryption Key / Customer Master Key (KMS) |
| Key-DR / escrow | Backup/replication of CMK material enabling recovery, preventing permanent data darkening |
| Security domain | The classification/key boundary within which (and only within which) deduplication may occur |
| Crypto-shred | Rendering data irrecoverable by destroying its key; permitted only for unshared (`dek_shared=false`) blobs |
| WORM | Write-Once-Read-Many immutable storage with object-lock retention |
| Legal hold | A freeze preventing disposition/deletion of records relevant to litigation/inquiry |
| Disposition | The end-of-retention action: destroy, archive-transfer, or review |
| Retention anchor | The event-confirmed date from which a retention period is computed |
| Clearance level | A principal's document-domain access ceiling (PUBLIC…TOP_SECRET), stored in `security_clearances` |
| Check-out / check-in | Optional exclusive lock + new-version workflow (per-type `checkout_mode`) |
| Supersede | Replacing a flawed original with a corrected version while keeping the old for audit |
| Classification | Sensitivity label (PUBLIC…TOP_SECRET) gating visibility |
| Need-to-know | Access requiring workflow membership beyond a generic role |
| Domain-scoped dedup | Storing identical content once **within a single security domain**, never across classifications |
| Dedup oracle | An information leak whereby a dedup hit confirms a document's existence — eliminated via HMAC index + no signal |
| DLP | Data Loss Prevention — detecting/limiting exposure of sensitive content |
| PAdES / PAdES-LTV | PDF Advanced Electronic Signatures / Long-Term Validation (embeds revocation data + timestamp) |
| RFC-3161 TSA | Trusted Time-Stamping Authority providing cryptographic proof of signing time |
| Hash chain | Audit rows linked by `row_hash = H(payload ‖ prev_hash)`, making tampering detectable |
| Audit anchor | A periodic digest of the audit chain written to WORM/notary/TSA for external tamper-evidence |
| Certified true copy | Officially stamped/signed faithful reproduction of a statutory record |
| Break-glass | Audited, dual-control, rate-limited emergency access |
| Tombstone | Metadata + hash retained after a binary is destroyed/erased, for audit |
| DSR | DPDP Data-Subject Request (access/erasure/rectification/portability) |
| Precedence lattice | Ordering of conflicting duties: statutory retention/hold/WORM > DPDP erasure; erasure else via domain-local crypto-shred |
| Orphan reaper | The lifecycle/job handling documents that have lost all module links |

## 18. Appendices

### Appendix A — Default retention schedule (illustrative, configurable)

| Document type | Trigger | Period | Action |
|---------------|---------|--------|--------|
| Service Register page | ON_CREATE | Permanent | REVIEW (never auto-destroy) |
| Pension Payment Order (PPO) | ON_EMPLOYEE_RETIRE | Permanent | REVIEW |
| Charge-sheet / inquiry record | ON_CASE_CLOSE | 30 years | REVIEW |
| Payslip / Form-16 | FISCAL_YEAR_END | 8 years | DESTROY |
| Training certificate | ON_CREATE | 10 years | REVIEW |
| ID proof (change request) | ON_CREATE | 3 years post-verification | DESTROY |
| Orphaned document (default) | ON_ORPHAN | 1 year | REVIEW (never auto-destroy) |

### Appendix B — Classification → control map

| Classification | Watermark | External share | Default key (per domain) | Search index | Audit |
|----------------|-----------|----------------|--------------------------|--------------|-------|
| PUBLIC | optional | allowed | shared CMK | full-text | yes |
| INTERNAL | optional | allowed | shared CMK | full-text | yes |
| CONFIDENTIAL | mandatory | Security approval | dedicated CMK | full-text (encrypted) | yes |
| SECRET | mandatory | blocked (internal only) | dedicated CMK | **metadata-only** | yes |
| TOP_SECRET | mandatory | blocked | dedicated CMK | **metadata-only (per-domain index)** | yes + alert |

> TOP_SECRET is retained (justified, §3.3) for compartmented sealed vigilance/PI records; applicable only to
> `is_top_secret_eligible` system-seeded types and requiring two-approver clearance.

### Appendix C — Allowed MIME types (baseline, per type override)

`application/pdf`, `image/tiff`, `image/jpeg`, `image/png`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### Appendix D — Assumptions & caveats

- KMS (+ in-country HSM/multi-region escrow), object-storage object-lock, AV (ICAP), sandboxed OCR/preview,
  DLP, PKI/eSign, and an RFC-3161 TSA are available platform services at CGG; each is provider-abstracted.
- **Print auditing is reliable only through the platform's watermarked print path; out-of-band printing is
  best-effort.** The permission matrix `P`/print and FR-012 reflect *platform-controlled* printing; this caveat
  is stated in the body (FR-012 BR-1), not only here (council Outsider).
- Exact statutory retention periods are configurable and must be confirmed against governing rules at deployment.
- SHA-256 collision risk is treated as cryptographically negligible for integrity/dedup purposes.
- The WORM guarantee must be **proven on the actual CGG storage backend** before FR-014 is credible (gating
  spike, §15.3).
- Whether AV/OCR/DLP/PKI are built in-house or COTS is a **deployment choice** behind the provider interfaces;
  data-sovereignty (Appendix/NFR residency) may force on-prem implementations for PII.

### Appendix E — KMS Key-DR / Escrow Runbook (R6)

1. **Replication:** every CMK is replicated to a geographically separate, **in-country** HSM/region; wrapped
   DEKs are stored alongside their objects (already in `storage_objects.wrapped_dek`).
2. **Escrow:** CMK material is escrowed under split-knowledge / dual-control (Shamir-style) so no single
   custodian can extract a key.
3. **Recovery:** on suspected loss/corruption, execute `/admin/keys:recover` (dual-control) to restore the CMK
   from escrow/replica **before** any data is declared lost; re-wrap affected DEKs if the key was rotated.
4. **Rehearsal:** the recovery drill is rehearsed **quarterly**; results feed the Key-DR posture report.
5. **Key-loss behaviour:** if recovery is genuinely impossible, affected documents are marked unrecoverable and
   reported — but this is a *defined, alarmed* state reached only after escrow recovery fails, never a silent
   loss.

### Appendix F — Day-One Stub Attach/Fetch Contract (R14)

A mock service implementing the frozen contract is published on day one so all modules build against it:

- `POST /api/v1/documents:attach` → returns `{documentId, docNo, linkId, status:"SCANNING", securityDomain}`.
- `GET /api/v1/documents/{id}:fetch?intent=VIEW` → returns a `renderUrl` (stub streams a placeholder watermarked
  PDF) with `downloadAvailable:false`.
- `GET /api/v1/documents/{id}:fetch?intent=DOWNLOAD` → returns a `downloadUrl` only if the stub token carries the
  DOWNLOAD right, else `403`.
- Error catalog (§10.3) returned verbatim, including `FETCH_INTENT_REQUIRED`, `CLEARANCE_INSUFFICIENT`,
  `DOCUMENT_NOT_ATTACHABLE`.
- `clearance_level` semantics published: principals default to INTERNAL; CONFIDENTIAL+ requires an ACTIVE
  `security_clearances` row.

The mock's responses are byte-compatible with the production service so the cutover (§15.2) requires no module
code changes.
