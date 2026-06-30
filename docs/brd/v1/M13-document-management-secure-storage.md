# Document Management and Secure Storage — HRMS Module BRD

**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government/Public-Sector HCM
**Module:** M13 — Document Management and Secure Storage (M13-DMS)
**BRD code:** M13-DMS
**Owner of canonical `documents` entity:** This module (referenced by M01–M12, M14)
**Status:** v1 (authoritative build contract)
**Reads with:** `docs/brd/SHARED_FOUNDATION.md` (shared entities, conventions, RBAC, technical defaults)

> M13-DMS is the **shared, secure, statutory document repository** every other HRMS module depends on.
> It owns the `documents` entity and all document-related entities (versions, types, ACLs, retention,
> legal hold, audit). M01–M12 do **not** store binaries; they **attach** documents through M13's API
> and store only a `document_id` reference. This BRD defines that contract exhaustively.

---

## 1. Executive Summary

### 1.1 Purpose

This BRD specifies the **Document Management and Secure Storage** service — the enterprise content
repository for the HRMS. It provides a single, governed, encrypted, access-controlled store for every
file produced or consumed across the suite: identity proofs for personal-detail changes (M02), leave
sanction scans (M03/M04), relieving/joining orders (M05), promotion/posting orders (M06), training
certificates (M07), appraisal/APAR PDFs (M08), charge-sheets and inquiry exhibits (M09), payslips and
Form-16 (M10), Pension Payment Orders / PPOs and terminal-benefit dossiers (M11), and the statutory
Service Register page-images and certified copies (M12). Documents are stored once, versioned,
classified, retained per statutory schedule, and made discoverable through full-text search — while
every view, download and print is audited and every binary is encrypted at rest and in transit.

### 1.2 Business context

Public-sector HR is **document-centric and statutory**. Service registers, charge memos, pension
orders and seniority records have legal weight; they must be tamper-evident, retained for decades (some
permanently), disposed of only under an approved disposition schedule, and frozen on legal hold during
litigation. Today these records are paper or scattered across drives with no version control, no
encryption, no access trail, and no retention governance. A breach, a lost original, or an unauthorised
alteration carries legal and audit consequences. M13-DMS centralises content under **defence-in-depth**
controls aligned to OWASP ASVS, the India DPDP Act 2023, and government records-management practice,
delivering the convenience (drag-drop, mobile capture, instant preview, OCR search, e-signature) that
world-class HCM users expect — without compromising statutory custody.

### 1.3 Module objectives

1. Provide a **single canonical `documents` store** with a clean attach/fetch API that M01–M14 consume.
2. Enforce **encryption at rest** (envelope encryption via KMS) and **in transit** (TLS 1.2+).
3. Provide **versioning** with check-in/check-out, supersede, and immutable version history.
4. Enforce **multi-dimensional access control**: RBAC + org-relationship + classification + need-to-know,
   at record and field level, with deny-by-default.
5. Scan every upload for **malware**, validate file-type/size, and verify **integrity** by checksum.
6. Provide **OCR + full-text search**, thumbnails/previews, and deduplication.
7. Govern content lifecycle: **retention schedules, legal hold, and approved disposition**, with **WORM**
   immutability for statutory documents.
8. Provide **e-signature/digital signing, watermarking, certified copies, redaction, and DLP**.
9. **Audit every access** (view/download/print/share) to an immutable trail and surface compliance reports.

### 1.4 Scope summary

In scope: upload/ingestion, document types & metadata taxonomy, classification/tagging, folders/cabinets,
versioning, encryption/KMS, access control, malware scanning, validation, OCR/search, retention/legal-hold/
disposition, e-signature, watermarking/certified copies/redaction, access audit, secure sharing/expiring
links, WORM, deduplication/integrity, previews, DLP, content lifecycle, compliance reporting, and the
storage abstraction over object storage. Out of scope: business workflows that *use* documents (those live
in M01–M12), payroll/pension calculation, and end-user identity management (shared `users`).

### 1.5 Key outcomes

- One governed source of truth for all HRMS content; modules store only references.
- Tamper-evident, encrypted, audited custody for statutory records.
- Faster retrieval (OCR search + previews) and lower storage cost (deduplication).
- Defensible compliance posture: retention enforced, holds honoured, disposition certified.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Area | Capability | Primary FR(s) |
|------|-----------|---------------|
| Ingestion | Single/bulk/drag-drop upload, scanner ingestion, mobile capture | FR-M13-001 |
| Taxonomy | Document types, metadata schema, classification & tagging | FR-M13-002 |
| Structure | Folders/cabinets, module-context linking, attach API | FR-M13-003 |
| Versioning | Version history, check-in/check-out, supersede | FR-M13-004 |
| Cryptography | Envelope encryption (KMS), TLS, key rotation | FR-M13-005 |
| Access control | RBAC + relationship + classification + need-to-know; record/field-level | FR-M13-006 |
| Safety | Malware scan, file-type/size validation, quarantine | FR-M13-007 |
| Discovery | OCR, full-text search, faceted filters | FR-M13-008 |
| Lifecycle | Retention, legal hold, disposition schedules | FR-M13-009 |
| Signing | E-signature & digital signing (PAdES) | FR-M13-010 |
| Rendition | Watermarking, certified copies, redaction | FR-M13-011 |
| Audit | View/download/print audit + compliance reporting | FR-M13-012 |
| Sharing | Secure internal/external sharing, expiring links | FR-M13-013 |
| Immutability | WORM storage for statutory documents | FR-M13-014 |
| Integrity | Deduplication, checksums, thumbnails/previews | FR-M13-015 |
| Governance | DLP, content lifecycle, storage abstraction | FR-M13-016 |

### 2.2 Common Capabilities (inherited, applied module-wide)

- UUIDv4 PKs; separate human-readable business keys (`doc_no`).
- Audit fields on every mutable table; append-only ledgers for audit and version history.
- UPPER_SNAKE_CASE enums catalogued in §5.5.
- UTC storage; `DD-MMM-YYYY` display; user-locale rendering.
- All list endpoints paginated (page/limit, hard max 100).
- Maker-checker for sensitive lifecycle actions (disposition, legal-hold release, classification downgrade).
- Shared canonical error envelope and standard codes (§10).

### 2.3 Boundaries & integration points

- **M01 Employee Profile** — documents are linked to `employee_id` context; employee photo/ID proofs.
- **M02 Personal Details** — proof documents for change requests; verified→attached lifecycle.
- **M03/M04 Leave/SR** — medical certificates, sanction orders posted to Digital SR.
- **M05/M06 Transfer/Promotion** — relieving/joining/promotion order PDFs.
- **M07 Training** — certificates, course material.
- **M08 Appraisal** — APAR/PDF, calibration evidence.
- **M09 Disciplinary** — charge-sheets, inquiry exhibits, sealed PI reports (confidential vault).
- **M10/M11 Payroll/Pension** — payslips, Form-16, PPO, terminal-benefit dossiers (long retention).
- **M12 Digital SR** — page-images, certified true copies, WORM statutory records.
- **M14 Dashboard** — reads document compliance metrics (read-only).
- **Platform** — `users`, `roles`, `org_units`, `notifications`, `audit_log`, KMS, object storage,
  antivirus engine, OCR engine, signing/PKI service.

### 2.4 Explicit non-goals

- M13 does not implement module-specific business workflows (e.g., disciplinary due-process) — it stores
  their documents.
- M13 does not author content (no word processor); it ingests and renders.
- M13 does not own user identity/authentication (shared `users`/OIDC).
- M13 does not compute payroll/pension; it stores their outputs.

---

## 3. Roles & Permissions

### 3.1 Module roles (extend shared RBAC; do not contradict)

| Role | Description |
|------|-------------|
| **Document Owner** | Employee/officer who uploaded or to whom a record belongs; manages own non-statutory docs. |
| **Uploader (Module Service)** | Any M01–M12 service principal attaching documents on behalf of a workflow. |
| **DMS Librarian / Records Officer** | Manages taxonomy, folders, classification, retention assignment. |
| **Records Manager (Custodian)** | Approves disposition, manages WORM, certifies true copies. |
| **Legal Hold Administrator** | Places/releases legal holds; manages e-discovery exports. |
| **Security / DLP Officer** | Manages classification policy, DLP rules, quarantine release, key policy. |
| **Auditor (read-only)** | Reads documents (per clearance) and the full access-audit trail; no write. |
| **System Administrator** | Storage configuration, KMS policy binding, scanner/OCR integration (no record self-approval). |
| **Employee (Self-Service)** | Views/downloads own permitted documents; e-signs assigned documents. |

> Segregation of duties: the disposition approver ≠ the librarian who proposed it; the legal-hold placer
> ≠ the records manager who disposes. No principal may both downgrade a classification and access the
> downgraded record in the same transaction.

### 3.2 Permission matrix (C=Create/Upload, R=Read/View, U=Update metadata, D=Download, P=Print, A=Approve/Decide, X=No access)

| Capability | Document Owner | Uploader (Module) | DMS Librarian | Records Manager | Legal Hold Admin | Security/DLP | Auditor | Sys Admin | Employee |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Upload document | C | C | C | C | X | X | X | X | C (own) |
| View document (per clearance) | R | R | R | R | R | R | R | X | R (own) |
| Download / Print | D/P | D | D/P | D/P | D | D | D | X | D/P (own) |
| Update metadata/tags | U | U | U | U | X | U | X | X | U (own, limited) |
| New version / check-in-out | C/U | C/U | C/U | C/U | X | X | X | X | C/U (own) |
| Manage document types/taxonomy | X | X | C/U | R | X | R | R | X | X |
| Classify / reclassify | X | U | U | U | X | A | R | X | X |
| Assign / manage retention | X | X | C/U | A | X | R | R | X | X |
| Place / release legal hold | X | X | X | R | A | R | R | X | X |
| Approve disposition / destruction | X | X | C (propose) | A | X | R | R | X | X |
| Manage WORM / certified copies | X | X | X | A | X | R | R | X | X |
| Secure share / expiring link | C | C | C | C | X | A | R | X | C (own) |
| Quarantine release (malware) | X | X | X | X | X | A | R | X | X |
| KMS key / storage config | X | X | X | X | X | A | R | A | X |
| Read access-audit trail | R (own) | X | R | R | R | R | R | X | R (own) |

### 3.3 Field-level & record-level confidentiality rules

- **Classification gates visibility.** A principal sees a document only if `clearance_level ≥ document.classification`
  AND an ACL/relationship grant exists (deny-by-default). Classifications: `PUBLIC < INTERNAL < CONFIDENTIAL < SECRET < TOP_SECRET`.
- **Sealed records** (e.g., M09 preliminary-inquiry reports, vigilance) carry `is_sealed=true` and are
  invisible to the subject employee even when they own related records.
- **Need-to-know** restricts CONFIDENTIAL+ to principals on the document's ACL or in the originating
  workflow, regardless of generic role power.
- **Field masking:** in list/search results, restricted documents show only non-sensitive metadata
  (type, date) with body/preview suppressed; full metadata requires record access.
- **Auditor** can read content per clearance but cannot alter; **Sys Admin** manages infrastructure but
  cannot read CONFIDENTIAL+ content (break-glass only, dual-control, audited).

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
  statutory retention.
- **NFR baseline:** P95 API < 500 ms (metadata ops); 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15 min, RTO ≤ 4 h.

**M13-specific platform services consumed:** Key Management Service (KMS), antivirus/malware engine
(ICAP/cloud), OCR engine, content-extraction/text-index engine (e.g., OpenSearch/Elasticsearch),
thumbnail/preview renderer, and PKI/e-signature provider.

---

## 5. Holistic Data Model

### 5.1 Entity inventory

| # | Entity | Type | Owner | Purpose |
|---|--------|------|-------|---------|
| E1 | `documents` | **Module (CANONICAL, owned here)** | M13 | Master document/object metadata record referenced by all modules |
| E2 | `document_versions` | Module | M13 | Immutable version history of each document's content |
| E3 | `document_types` | Module | M13 | Document-type taxonomy + metadata schema + default retention/classification |
| E4 | `folders` | Module | M13 | Cabinet/folder hierarchy organising documents |
| E5 | `document_acls` | Module | M13 | Per-document access grants (principal × right × scope) |
| E6 | `document_tags` | Module | M13 | Classification labels & free/controlled tags on documents |
| E7 | `document_links` | Module | M13 | Polymorphic link between a document and a module-context object (attach contract) |
| E8 | `retention_policies` | Module | M13 | Retention/disposition schedules (trigger, period, action) |
| E9 | `retention_assignments` | Module | M13 | Binds a retention policy to a document/type/folder + computed disposition date |
| E10 | `legal_holds` | Module | M13 | Legal-hold matters that freeze disposition |
| E11 | `legal_hold_items` | Module | M13 | Join of a legal hold to held documents |
| E12 | `document_audit` | Module (append-only) | M13 | Immutable log of every view/download/print/share access |
| E13 | `document_shares` | Module | M13 | Secure shares / expiring signed links (internal & external) |
| E14 | `checkout_locks` | Module | M13 | Check-out / check-in exclusive edit locks |
| E15 | `scan_results` | Module | M13 | Malware-scan + content-extraction + integrity results per version |
| E16 | `signature_requests` | Module | M13 | E-signature/digital-signing request + signer envelope |
| E17 | `signatures` | Module | M13 | Individual applied signatures (PAdES) on a document version |
| E18 | `disposition_records` | Module | M13 | Certified destruction/transfer/review events at end of retention |
| E19 | `storage_objects` | Module | M13 | Physical blob descriptor (bucket/key/checksum/encryption metadata) |
| E20 | `dlp_findings` | Module | M13 | Data-loss-prevention/classification findings on content |
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
| `status` | ENUM `document_status` | N | State machine (§12.1) |
| `mime_type` | VARCHAR(120) | N | Of current version |
| `size_bytes` | BIGINT | N | Of current version |
| `content_hash` | CHAR(64) | N | SHA-256 of current version (dedup/integrity) |
| `is_sealed` | BOOLEAN | N | Hidden from subject even if owner; default false |
| `is_worm` | BOOLEAN | N | Immutable statutory storage; default false |
| `is_record_declared` | BOOLEAN | N | Declared as a formal record (locks metadata); default false |
| `legal_hold_count` | INT | N | >0 ⇒ disposition blocked; default 0 |
| `retention_assignment_id` | UUID FK→retention_assignments | Y | Governing retention |
| `disposition_due_date` | DATE | Y | Computed eligible-for-disposition date |
| `source_channel` | ENUM `source_channel` | N | WEB_UPLOAD / BULK / SCANNER / MOBILE / API / SYSTEM_GENERATED |
| `scan_status` | ENUM `scan_status` | N | PENDING / CLEAN / INFECTED / QUARANTINED / SKIPPED |
| `language_code` | VARCHAR(8) | Y | OCR-detected/declared (e.g. `en`, `hi`, `te`) |
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
| `is_supersede` | BOOLEAN | N | Replaces prior original (e.g., re-scan); default false |
| `superseded_version_id` | UUID FK→document_versions | Y | If supersede |
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
| `default_retention_policy_id` | UUID FK→retention_policies | Y | |
| `is_worm_default` | BOOLEAN | N | Statutory types default to WORM |
| `requires_signature` | BOOLEAN | N | e.g. certified copies |
| `allowed_mime_types` | TEXT[] | N | Whitelist (e.g. `application/pdf`, `image/tiff`) |
| `max_size_mb` | INT | N | Per-type size cap |
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
| `principal_ref` | VARCHAR(80) | N | user_id / role code / org_unit_id / relationship key (e.g. `REPORTING_MANAGER`) |
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
| `entity_name` | VARCHAR(80) | N | Referencing entity, e.g. `change_requests`, `charge_sheets`, `penalty_orders` |
| `entity_ref_id` | UUID | N | PK value in that entity |
| `link_role` | VARCHAR(60) | N | Semantic role, e.g. `PROOF`, `ORDER`, `EXHIBIT`, `CERTIFICATE` |
| `is_primary` | BOOLEAN | N | Primary attachment for the entity |
| `linked_by` | UUID FK→users | N | |
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
| `status` | ENUM `legal_hold_status` | N | ACTIVE / RELEASED |
| `placed_by` | UUID FK→users | N | Legal Hold Admin |
| `placed_at` | TIMESTAMPTZ | N | |
| `released_by` | UUID FK→users | Y | |
| `released_at` | TIMESTAMPTZ | Y | |
| `release_reason` | TEXT | Y | |
| audit fields | | | created/updated/by/is_deleted |

#### E11 — `legal_hold_items`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hold_item_id` | UUID PK | N | |
| `legal_hold_id` | UUID FK→legal_holds | N | |
| `document_id` | UUID FK→documents | N | |
| `match_basis` | ENUM `hold_match_basis` | N | MANUAL / SAVED_SEARCH / EMPLOYEE / CASE |
| `held_at` | TIMESTAMPTZ | N | |
| `released_at` | TIMESTAMPTZ | Y | |
| UNIQUE(`legal_hold_id`,`document_id`) | | | One row per hold-document |

#### E12 — `document_audit` (append-only; immutable)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `audit_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | Y | Version accessed |
| `action` | ENUM `doc_audit_action` | N | VIEW / PREVIEW / DOWNLOAD / PRINT / SHARE / METADATA_UPDATE / VERSION_ADD / CLASSIFY / DISPOSE / HOLD_PLACE / HOLD_RELEASE / ACL_CHANGE / BREAK_GLASS |
| `actor_user_id` | UUID FK→users | N | |
| `actor_role` | VARCHAR(60) | N | Effective role at access |
| `ip_address` | INET | Y | |
| `user_agent` | VARCHAR(255) | Y | |
| `share_id` | UUID FK→document_shares | Y | If accessed via share link |
| `result` | ENUM `audit_result` | N | SUCCESS / DENIED |
| `denial_reason` | VARCHAR(120) | Y | |
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
| `password_hash` | VARCHAR(255) | Y | Optional link password (bcrypt/argon2) |
| `max_access_count` | INT | Y | Null ⇒ unlimited until expiry |
| `access_count` | INT | N | Default 0 |
| `watermark_required` | BOOLEAN | N | Apply dynamic watermark |
| `expires_at` | TIMESTAMPTZ | N | Mandatory for EXTERNAL_LINK |
| `status` | ENUM `share_status` | N | ACTIVE / EXPIRED / REVOKED |
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
| `integrity_verified` | BOOLEAN | N | Stored hash == recomputed hash |
| `extracted_text_ref` | UUID FK→storage_objects | Y | OCR/text extraction artefact |
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
| `certificate_subject` | VARCHAR(255) | Y | DSC subject DN |
| `signature_hash` | CHAR(64) | N | Hash of signed payload (PAdES) |
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
| `content_hash` | CHAR(64) | N | SHA-256 (dedup join key) |
| `size_bytes` | BIGINT | N | |
| `encryption_alg` | VARCHAR(40) | N | e.g. `AES-256-GCM` |
| `kms_key_id` | VARCHAR(160) | N | KMS CMK reference (envelope) |
| `wrapped_dek` | BYTEA | N | DEK wrapped by KMS CMK |
| `storage_class` | ENUM `storage_class` | N | HOT / WARM / COLD / WORM_LOCKED |
| `worm_retain_until` | TIMESTAMPTZ | Y | Object-lock retention timestamp |
| `ref_count` | INT | N | Dedup reference count |
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

### 5.3 Relationship map

- `documents` 1—N `document_versions`; `documents.current_version_id` → latest `document_versions`.
- `document_versions` N—1 `storage_objects` (many versions may share a blob via dedup; `ref_count`).
- `documents` N—1 `document_types`; `document_types` 1—N `documents`.
- `documents` N—1 `folders`; `folders` self-referential tree (`parent_folder_id`).
- `documents` 1—N `document_acls`; `folders` 1—N `document_acls` (folder-inherited).
- `documents` 1—N `document_tags`, 1—N `document_links`, 1—N `document_audit`, 1—N `document_shares`,
  1—N `dlp_findings` (via versions).
- `documents` 1—0..1 `checkout_locks` (exclusive); 1—N `signature_requests`.
- `signature_requests` 1—N `signatures`.
- `retention_policies` 1—N `retention_assignments`; `retention_assignments` 1—N `documents` (governing).
- `legal_holds` 1—N `legal_hold_items` N—1 `documents`.
- `documents` 1—N `disposition_records`.
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
| `legal_holds` / `_items` | M13 | Legal Hold Admin | Auditor |
| `disposition_records` | M13 | Librarian/Records Mgr | Auditor |
| `signature_requests`/`signatures` | M13 | M13 + signers | Originating module |
| `employees`,`users`,`org_units`,`roles` | M01/platform | their owners | M13 (FK refs) |
| `notifications` | platform | M13 emits | recipients |
| `audit_log` | platform | M13 writes state changes | Auditor |

### 5.5 Enum & reference catalog

| Enum | Values |
|------|--------|
| `classification_level` | PUBLIC, INTERNAL, CONFIDENTIAL, SECRET, TOP_SECRET |
| `document_status` | DRAFT, SCANNING, QUARANTINED, ACTIVE, CHECKED_OUT, SUPERSEDED, ON_LEGAL_HOLD, DISPOSITION_DUE, DISPOSED, ARCHIVED, DELETED |
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
| `legal_hold_status` | ACTIVE, RELEASED |
| `hold_match_basis` | MANUAL, SAVED_SEARCH, EMPLOYEE, CASE |
| `doc_audit_action` | VIEW, PREVIEW, DOWNLOAD, PRINT, SHARE, METADATA_UPDATE, VERSION_ADD, CLASSIFY, DISPOSE, HOLD_PLACE, HOLD_RELEASE, ACL_CHANGE, BREAK_GLASS |
| `audit_result` | SUCCESS, DENIED |
| `share_type` | INTERNAL_USER, EXTERNAL_LINK |
| `share_status` | ACTIVE, EXPIRED, REVOKED |
| `lock_status` | ACTIVE, RELEASED, EXPIRED, FORCE_RELEASED |
| `signing_mode` | SEQUENTIAL, PARALLEL |
| `signature_request_status` | DRAFT, SENT, IN_PROGRESS, COMPLETED, DECLINED, EXPIRED, CANCELLED |
| `signature_type` | AADHAAR_ESIGN, DSC_TOKEN, OTP_ESIGN, DRAWN |
| `signature_status` | PENDING, SIGNED, DECLINED |
| `disposition_status` | PROPOSED, APPROVED, EXECUTED, REJECTED, BLOCKED_HOLD |
| `storage_class` | HOT, WARM, COLD, WORM_LOCKED |
| `dlp_severity` | LOW, MEDIUM, HIGH, CRITICAL |
| `dlp_action` | TAG, RECLASSIFY, REDACT, BLOCK_SHARE |
| `dlp_finding_status` | OPEN, ACCEPTED, DISMISSED, REMEDIATED |

### 5.6 Data integrity rules

- **DI-1:** `documents.current_version_id` must reference a `document_versions` row of the same document;
  `current_version_no` equals that version's `version_no`.
- **DI-2:** `document_versions` is append-only — no UPDATE/DELETE; a correction is a new version or supersede.
- **DI-3:** `document_audit` and `audit_log` are append-only and immutable.
- **DI-4:** A document with `legal_hold_count > 0` or `is_worm = true` cannot be soft-deleted, disposed,
  or have content overwritten before `worm_retain_until`.
- **DI-5:** `content_hash` must equal SHA-256 of the stored bytes; mismatch sets `scan_results.integrity_verified=false`
  and blocks `ACTIVE`.
- **DI-6:** Deduplication: identical `content_hash` reuses a `storage_objects` row and increments `ref_count`;
  blob is deleted only when `ref_count` reaches 0 AND no legal hold/WORM applies.
- **DI-7:** Only one `ACTIVE` `checkout_locks` per `document_id` (unique); expired locks are auto-released.
- **DI-8:** `document_acls` DENY overrides ALLOW; absence of any ALLOW = no access (deny-by-default).
- **DI-9:** `classification` may only be **downgraded** by Security/DLP Officer with maker-checker; upgrades
  allowed by Librarian. Sealed/WORM classification cannot be downgraded below type default.
- **DI-10:** `disposition_records` requires `approved_by ≠ proposed_by`; EXECUTED only if no active legal hold.
- **DI-11:** Every `document_versions` insert must be preceded by a `scan_results` row with `malware_verdict=CLEAN`
  before the version may become `current`.
- **DI-12:** `document_shares` of type EXTERNAL_LINK require `expires_at` not null and `token_hash` set
  (raw token never stored).
- **DI-13:** `retention_assignments.disposition_due_date` is null iff governing policy `is_permanent=true`.
- **DI-14:** FK references from M01–M12 to `documents` are validated on attach via `document_links`; a
  module entity may not point at a `DELETED`/`DISPOSED` document.

### 5.7 Sample data (2–3 rows per module entity)

**`documents`**

| document_id | doc_no | title | document_type_id | classification | status | current_version_no | content_hash | is_worm |
|---|---|---|---|---|---|---|---|---|
| doc-0001 | DOC/2026/0001001 | Aadhaar Proof – EMP-3001 | dt-id-proof | CONFIDENTIAL | ACTIVE | 1 | 9f2a…7c | false |
| doc-0002 | DOC/2026/0001002 | Charge-Sheet CS/2026/201 | dt-charge-sheet | SECRET | ON_LEGAL_HOLD | 2 | 4b81…d0 | true |
| doc-0003 | DOC/2026/0001003 | PPO – EMP-2900 | dt-ppo | CONFIDENTIAL | ACTIVE | 1 | a17e…22 | true |

**`document_versions`**

| version_id | document_id | version_no | storage_object_id | mime_type | content_hash | is_supersede | ocr_status |
|---|---|---|---|---|---|---|---|
| ver-0001 | doc-0001 | 1 | so-9001 | application/pdf | 9f2a…7c | false | DONE |
| ver-0002 | doc-0002 | 1 | so-9002 | application/pdf | 1c00…aa | false | DONE |
| ver-0003 | doc-0002 | 2 | so-9003 | application/pdf | 4b81…d0 | true | DONE |

**`document_types`**

| document_type_id | type_code | name | category | default_classification | is_worm_default | max_size_mb |
|---|---|---|---|---|---|---|
| dt-id-proof | ID_PROOF | Identity Proof | IDENTITY | CONFIDENTIAL | false | 10 |
| dt-charge-sheet | CHARGE_SHEET | Charge Sheet | DISCIPLINARY | SECRET | true | 25 |
| dt-ppo | PPO | Pension Payment Order | PENSION | CONFIDENTIAL | true | 25 |

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

| retention_policy_id | policy_code | name | trigger_event | retention_period_months | is_permanent | disposition_action |
|---|---|---|---|---|---|---|
| rp-01 | RET_SR_PERMANENT | Service Register – Permanent | ON_CREATE | null | true | REVIEW |
| rp-02 | RET_PAYSLIP_8Y | Payslip – 8 Years | FISCAL_YEAR_END | 96 | false | DESTROY |
| rp-03 | RET_DISC_30Y | Disciplinary – 30 Years | ON_CASE_CLOSE | 360 | false | REVIEW |

**`retention_assignments`**

| retention_assignment_id | retention_policy_id | scope_type | scope_ref_id | disposition_due_date | status |
|---|---|---|---|---|---|
| ra-01 | rp-01 | DOCUMENT_TYPE | dt-ppo | null | ACTIVE |
| ra-02 | rp-02 | DOCUMENT | doc-9100 | 2034-03-31 | ACTIVE |
| ra-03 | rp-03 | DOCUMENT | doc-0002 | 2056-04-01 | HELD |

**`legal_holds`**

| legal_hold_id | hold_no | matter_name | authority | status | placed_at |
|---|---|---|---|---|---|
| lh-01 | LH/2026/007 | WP 1234/2026 – EMP-3002 | High Court | ACTIVE | 2026-04-10T09:00Z |
| lh-02 | LH/2025/051 | CVC Ref 88/2025 | CVC | RELEASED | 2025-11-02T09:00Z |

**`legal_hold_items`**

| hold_item_id | legal_hold_id | document_id | match_basis | held_at |
|---|---|---|---|---|
| hi-01 | lh-01 | doc-0002 | CASE | 2026-04-10T09:01Z |
| hi-02 | lh-01 | doc-0005 | EMPLOYEE | 2026-04-10T09:01Z |

**`document_audit`**

| audit_id | document_id | action | actor_user_id | actor_role | result | occurred_at |
|---|---|---|---|---|---|---|
| au-01 | doc-0001 | VIEW | usr-9001 | Reporting Manager | SUCCESS | 2026-04-12T10:00Z |
| au-02 | doc-0002 | DOWNLOAD | usr-7001 | Inquiry Officer | SUCCESS | 2026-04-12T10:05Z |
| au-03 | doc-0002 | VIEW | usr-3001 | Employee | DENIED | 2026-04-12T10:06Z |

**`document_shares`**

| share_id | document_id | share_type | recipient_email | rights | expires_at | status |
|---|---|---|---|---|---|---|
| sh-01 | doc-0001 | EXTERNAL_LINK | bank@example.gov | {VIEW} | 2026-04-20T00:00Z | ACTIVE |
| sh-02 | doc-0003 | INTERNAL_USER | null | {VIEW,DOWNLOAD} | 2026-05-01T00:00Z | ACTIVE |

**`checkout_locks`**

| lock_id | document_id | locked_by | locked_at | expires_at | status |
|---|---|---|---|---|---|
| ck-01 | doc-0001 | usr-9001 | 2026-04-12T09:00Z | 2026-04-12T17:00Z | RELEASED |
| ck-02 | doc-0005 | usr-7001 | 2026-04-13T11:00Z | 2026-04-13T19:00Z | ACTIVE |

**`scan_results`**

| scan_id | version_id | malware_verdict | integrity_verified | scanned_at |
|---|---|---|---|---|
| sc-01 | ver-0001 | CLEAN | true | 2026-04-11T08:00Z |
| sc-02 | ver-0003 | CLEAN | true | 2026-04-11T08:05Z |

**`signature_requests`**

| signature_request_id | document_id | version_id | request_no | signing_mode | status |
|---|---|---|---|---|---|
| sr-01 | doc-0003 | ver-0003pp | SIG/2026/0001 | SEQUENTIAL | COMPLETED |
| sr-02 | doc-0006 | ver-6001 | SIG/2026/0002 | PARALLEL | IN_PROGRESS |

**`signatures`**

| signature_id | signature_request_id | signer_user_id | sign_order | signature_type | status |
|---|---|---|---|---|---|
| sg-01 | sr-01 | usr-2200 | 1 | DSC_TOKEN | SIGNED |
| sg-02 | sr-02 | usr-2201 | 1 | AADHAAR_ESIGN | PENDING |

**`disposition_records`**

| disposition_id | document_id | action | proposed_by | approved_by | status | certificate_no |
|---|---|---|---|---|---|---|
| dp-01 | doc-9100 | DESTROY | usr-4001 | usr-4002 | APPROVED | DC/2034/045 |
| dp-02 | doc-9101 | ARCHIVE_TRANSFER | usr-4001 | null | PROPOSED | null |

**`storage_objects`**

| storage_object_id | bucket | object_key | content_hash | encryption_alg | kms_key_id | storage_class | ref_count |
|---|---|---|---|---|---|---|---|
| so-9001 | hrms-docs-hot | a1/9f2a…7c.enc | 9f2a…7c | AES-256-GCM | kms/cmk-hrms-01 | HOT | 1 |
| so-9002 | hrms-docs-worm | b2/1c00…aa.enc | 1c00…aa | AES-256-GCM | kms/cmk-hrms-01 | WORM_LOCKED | 1 |
| so-9003 | hrms-docs-worm | c3/4b81…d0.enc | 4b81…d0 | AES-256-GCM | kms/cmk-hrms-01 | WORM_LOCKED | 1 |

**`dlp_findings`**

| finding_id | version_id | rule_code | severity | match_count | suggested_action | status |
|---|---|---|---|---|---|---|
| df-01 | ver-0001 | PII_AADHAAR | HIGH | 1 | RECLASSIFY | ACCEPTED |
| df-02 | ver-0001 | PII_PAN | MEDIUM | 1 | TAG | OPEN |

---

## 6. Functional Requirements

### FR-M13-001 — Document Upload & Ingestion (single, bulk, drag-drop, scanner, mobile)

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Uploader (Module Service), DMS Librarian, Employee

**User Story:** As an uploader, I want to add documents via web (single/bulk/drag-drop), scanner ingestion,
mobile capture, or API, so that content enters the repository safely, with the right type and metadata, and
becomes searchable and governed.

**Description:** Ingests binaries through a multi-step pipeline: pre-flight validation (type/size) → secure
upload (multipart/resumable) → malware scan → integrity hash → dedup check → metadata capture → OCR/preview
→ `ACTIVE`. Supports single and bulk uploads, drag-drop, watched scanner folders (TIFF/PDF), mobile camera
capture with auto-deskew, and the programmatic attach API used by M01–M12.

**Acceptance Criteria:**
1. A document is created with `document_type_id`, `title`, target `folder_id`, and type-required metadata.
2. Files violating `allowed_mime_types` or `max_size_mb` are rejected pre-upload with `INVALID_FILE_TYPE`/`FILE_TOO_LARGE`.
3. Every upload is virus-scanned before becoming `ACTIVE`; infected files go to `QUARANTINED` (FR-M13-007).
4. Bulk upload accepts up to 100 files per batch, returning per-file success/failure without aborting the batch.
5. Resumable upload supports files up to the configured cap (default 250 MB) and survives transient network loss.
6. On success the response returns `document_id`, `doc_no`, `status`, and `current_version_no=1`; an `audit_log` + `document_audit (VERSION_ADD)` entry is written.

**Business Rules:**
- BR-1: `status` flows DRAFT → SCANNING → (CLEAN ⇒ ACTIVE | INFECTED ⇒ QUARANTINED).
- BR-2: Default classification = `document_types.default_classification` unless caller specifies a higher level.
- BR-3: Scanner/mobile sources auto-OCR; system-generated PDFs (e.g., payslips) skip OCR but still index text.
- BR-4: Module attach (API) must include `module_code`, `entity_name`, `entity_ref_id`, `link_role` (FR-M13-003).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `documents` | create master row |
| `document_versions` | version 1 |
| `storage_objects` | persist encrypted blob |
| `scan_results` | malware/integrity |
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
post-upload toast with "View / Add another".

**Edge Cases:** Duplicate content (dedup hit → reuse blob, new metadata row); upload interrupted (resume);
zero-byte/corrupt file (reject `EMPTY_FILE`); password-protected PDF (flag `PREVIEW_UNAVAILABLE`, still stored);
scanner double-feed (dedup + reconcile).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `UploadDropzone`, `BulkUploadGrid`, `MetadataSchemaForm`, `MobileCapture`; services `IngestionService`, `StorageService`, `ScanOrchestrator` |
| Backend Flow | Validate type/size → presigned/resumable PUT to staging → compute SHA-256 → dedup lookup → AV scan → on CLEAN promote blob, write `storage_objects`+`document_versions`+`documents` in txn → enqueue OCR/preview → emit audit |
| Data Operations | INSERT `documents`,`document_versions`,`storage_objects`,`scan_results`; conditional INSERT `document_links`; UPDATE `storage_objects.ref_count` on dedup |
| Validation | MIME sniff (magic bytes, not extension), size cap, required metadata vs `metadata_schema`, classification ≥ type default |
| Authorization | RBAC upload right; folder write scope by `owning_org_unit_id` |
| State Changes & Side Effects | DRAFT→SCANNING→ACTIVE/QUARANTINED; OCR + thumbnail jobs enqueued; notification on quarantine |
| Failure Handling | Type/size ⇒ 400; scan infected ⇒ 422 `MALWARE_DETECTED`; storage down ⇒ 503 `UPSTREAM_UNAVAILABLE` with resumable retry |
| Dependencies | KMS, object storage, AV engine, OCR engine, M01 (employee context) |
| Test Guidance | Unit: MIME sniff, size guard, dedup; Integration: full pipeline to ACTIVE; Negative: infected EICAR, oversized, resume after drop |

---

### FR-M13-002 — Document Types, Metadata Taxonomy, Classification & Tagging

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Security/DLP Officer, Uploader

**User Story:** As a DMS Librarian, I want to define document types with a metadata schema, defaults, and a
controlled tag vocabulary, so that every document is consistently described, classified, and discoverable.

**Description:** Manages the `document_types` taxonomy (schema as JSON-Schema, default classification/retention,
allowed MIME types, size caps, WORM/signature defaults), the classification ladder, and tagging (controlled +
free + auto-applied by OCR/DLP). Reclassification is governed by SoD and maker-checker for downgrades.

**Acceptance Criteria:**
1. A document type defines `metadata_schema`, `default_classification`, `allowed_mime_types`, `max_size_mb`.
2. Uploads validate metadata against the type's JSON-Schema; missing required fields fail with `METADATA_INVALID`.
3. A document carries exactly one `classification`; changing it writes `document_audit (CLASSIFY)`.
4. Downgrading classification requires Security/DLP Officer + a second approver (maker-checker) and a reason.
5. Tags can be applied by users (controlled vocabulary) and auto-applied by OCR/DLP with a confidence score.
6. Deactivating a type prevents new uploads of that type but preserves existing documents.

**Business Rules:**
- BR-1: Classification may be raised by Librarian; only lowered by Security/DLP with maker-checker (DI-9).
- BR-2: PII tags from DLP (`PII_AADHAAR`, `PII_PAN`) auto-suggest CONFIDENTIAL minimum.
- BR-3: Controlled-vocabulary tags reject unknown keys; free keywords allowed under `KEYWORD` type.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_types` | manage taxonomy |
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

**UI Behavior Notes:** Type admin screen with JSON-Schema builder; classification dropdown with lock icon for
downgrades (opens approval dialog); tag chips with autocomplete from controlled vocabulary; DLP-suggested tags
shown with confidence badges to accept/dismiss.

**Edge Cases:** Schema change with existing docs (versioned schema; old docs stay valid); conflicting auto vs
manual classification (highest wins); deactivating a type mid-upload (block new, allow in-flight).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DocumentTypeAdmin`, `SchemaBuilder`, `TagEditor`, `ReclassifyDialog`; `TaxonomyService`, `ClassificationService` |
| Backend Flow | CRUD types with schema version pin → validate uploads against pinned schema → reclassify routes through maker-checker workflow |
| Data Operations | INSERT/UPDATE `document_types`; INSERT/DELETE `document_tags`; UPDATE `documents.classification`; INSERT `document_audit` |
| Validation | JSON-Schema validity; classification monotonicity rule; controlled vocab membership |
| Authorization | Type admin: Librarian; downgrade: Security/DLP + checker |
| State Changes & Side Effects | Reclassify down ⇒ re-evaluate ACLs; audit CLASSIFY; notify owner on downgrade |
| Failure Handling | Bad schema ⇒ 400; unauthorized downgrade ⇒ 403 `CLASSIFICATION_LOCKED`; metadata mismatch ⇒ 422 |
| Dependencies | Workflow engine (maker-checker), DLP (FR-M13-016) |
| Test Guidance | Unit: schema validation, monotonic classification; Integration: downgrade approval; Negative: unknown tag key |

---

### FR-M13-003 — Folder/Cabinet Structure & Module-Context Linking (Attach Contract)

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Uploader (Module Service), System (auto-provision)

**User Story:** As a module service, I want to attach a document to my business object and place it in the
correct cabinet, so that documents are organised by employee/module/case context and reliably retrievable.

**Description:** Manages the folder/cabinet hierarchy (auto-provisioned per employee and per module/case) and
the polymorphic **attach contract** (`document_links`) that M01–M12 use to bind a `document_id` to their
entity (`module_code`, `entity_name`, `entity_ref_id`, `link_role`). Folders carry inheritable classification
and ACLs.

**Acceptance Criteria:**
1. A per-employee cabinet folder is auto-created on M01 employee creation; module/case subfolders auto-provision on first attach.
2. `documents:attach` links a document to a module entity and returns the `link_id`; `is_primary` enforced unique per (entity, link_role) where applicable.
3. A document can be linked from multiple modules (re-use) without duplicating the binary.
4. Moving a document between folders preserves version history, audit, retention, and holds.
5. Folder-level ACLs are inherited by contained documents unless overridden by a document-level DENY.
6. Detaching a link does not delete the document; the document persists while any link or retention applies.

**Business Rules:**
- BR-1: A document referenced by a `DELETED`/`DISPOSED` state cannot be attached (DI-14).
- BR-2: System-managed folders cannot be renamed/deleted by non-admins.
- BR-3: Folder classification sets the floor for contained documents.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `folders` | hierarchy/auto-provision |
| `document_links` | attach/detach |
| `document_acls` | folder-inherited grants |
| `documents` | folder placement |

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
merge (re-home cabinet); orphan document (no links) — retained per policy, flagged in housekeeping report.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `FolderTree`, `MoveDialog`, `AttachmentsPanel`; `FolderService`, `LinkService` |
| Backend Flow | Resolve/auto-provision folder path → attach validates document state + caller scope → insert link → recompute inherited ACLs |
| Data Operations | INSERT `folders` (idempotent on path), `document_links`; UPDATE `documents.folder_id`; INSERT `audit_log` |
| Validation | Document not deleted/disposed; unique primary per (entity, role); folder scope match |
| Authorization | Attach: Uploader/module service token; folder admin: Librarian |
| State Changes & Side Effects | Auto-provision subfolders; move re-evaluates inherited ACLs; notify on cross-module link |
| Failure Handling | Disposed doc ⇒ 409 `DOCUMENT_NOT_ATTACHABLE`; duplicate primary ⇒ 409 `LINK_CONFLICT` |
| Dependencies | M01 (employee lifecycle events), all modules (attach) |
| Test Guidance | Unit: path materialisation, primary uniqueness; Integration: multi-module link reuse; Negative: attach disposed doc |

---

### FR-M13-004 — Versioning, Check-in/Check-out & Supersede

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Uploader, DMS Librarian

**User Story:** As a document owner, I want to check a document out, replace its content, and check it back in
with a new version, so that change history is preserved and concurrent edits never collide.

**Description:** Provides immutable version history, exclusive check-out/check-in locks, new-version upload,
and **supersede** (replace a flawed original, e.g., a re-scan, while retaining the superseded version for
audit). The latest version is the active content; older versions remain viewable per permission.

**Acceptance Criteria:**
1. Checking out a document creates an exclusive `ACTIVE` lock; others cannot check in until released/expired.
2. Check-in increments `version_no`, sets new `current_version_id`, requires a `change_summary`, and runs the full scan pipeline.
3. Version history lists all versions with author, timestamp, size, hash, and change summary; any version is downloadable per permission.
4. Supersede records `is_supersede=true` and `superseded_version_id`; the superseded version is retained, not deleted.
5. Locks auto-expire after the configured TTL (default 8h); an admin can force-release with reason (audited).
6. WORM documents reject content mutation before `worm_retain_until` (new version blocked).

**Business Rules:**
- BR-1: Only the lock holder (or force-release admin) may check in.
- BR-2: A new version inherits classification, retention, holds, and links from the document.
- BR-3: Supersede requires Librarian/owner right and a reason; superseded version is excluded from "current" but kept for audit.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | new/superseded versions |
| `checkout_locks` | exclusive lock |
| `documents` | current pointer |
| `scan_results` | scan each version |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:checkout` | Acquire lock |
| POST | `/api/v1/documents/{id}:checkin` | Upload new version |
| POST | `/api/v1/documents/{id}:supersede` | Supersede current |
| GET | `/api/v1/documents/{id}/versions` | Version history |

**UI Behavior Notes:** Lock badge with holder + countdown; "Check out / Check in" buttons; version timeline with
diff metadata; restore/compare actions; force-release control for admins behind confirmation.

**Edge Cases:** Lock holder leaves (TTL auto-release); two check-ins race (second gets 409); supersede on a held
document (blocked); version of a different MIME type (allowed if type permits).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `VersionTimeline`, `LockBadge`, `CheckInDialog`; `VersioningService`, `LockService` |
| Backend Flow | Checkout acquires unique lock (SELECT…FOR UPDATE) → check-in validates lock holder → scan new blob → append version in txn → advance current pointer → release lock |
| Data Operations | INSERT `checkout_locks`/`document_versions`; UPDATE `documents.current_version_id/no/content_hash`; INSERT `scan_results`,`audit_log` |
| Validation | Lock ownership, change_summary required, WORM/hold guard, MIME allowed by type |
| Authorization | VERSION right; force-release: Sys Admin |
| State Changes & Side Effects | CHECKED_OUT↔ACTIVE; supersede sets prior SUPERSEDED; OCR/preview re-run; notify subscribers |
| Failure Handling | Locked ⇒ 409 `DOCUMENT_LOCKED`; not holder ⇒ 403; WORM ⇒ 409 `WORM_IMMUTABLE` |
| Dependencies | FR-M13-005/007 (encrypt+scan each version), FR-M13-014 (WORM) |
| Test Guidance | Unit: lock exclusivity, version increment; Integration: checkout→checkin→supersede; Negative: race check-in, WORM mutation |

---

### FR-M13-005 — Encryption at Rest (Envelope/KMS) & In Transit

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, System Administrator, System

**User Story:** As a Security Officer, I want every stored binary encrypted with envelope encryption under a KMS
key, and all transfers over TLS, so that content is protected at rest and in transit and keys are rotatable.

**Description:** Implements envelope encryption: a per-object Data Encryption Key (DEK) encrypts the blob
(AES-256-GCM); the DEK is wrapped by a KMS Customer Master Key (CMK) and stored as `wrapped_dek`. All API and
storage traffic uses TLS 1.2+. Supports key rotation (re-wrap DEKs without re-encrypting blobs) and per-
classification key policy. Includes audited break-glass decryption with dual control.

**Acceptance Criteria:**
1. Every blob is stored encrypted (AES-256-GCM) with a unique DEK; plaintext is never persisted.
2. The DEK is wrapped by a KMS CMK; only `wrapped_dek` + `kms_key_id` are stored, never the raw DEK.
3. All transport uses TLS 1.2+; non-TLS requests are rejected.
4. CMK rotation re-wraps DEKs in the background without rewriting object bytes; old key remains for decrypt only until retired.
5. Decryption requires an authorised principal; every decrypt for download is audited (FR-M13-012).
6. Break-glass access requires two approvers and is recorded as `document_audit (BREAK_GLASS)`.

**Business Rules:**
- BR-1: CONFIDENTIAL+ documents use a dedicated CMK separate from INTERNAL/PUBLIC.
- BR-2: Keys never leave KMS in plaintext; wrap/unwrap happens in KMS.
- BR-3: A retired/compromised key triggers forced re-wrap of all dependent DEKs.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `storage_objects` | encryption metadata, wrapped DEK |
| `documents` | classification → key policy |
| `document_audit` | decrypt/break-glass |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/admin/keys:rotate` | Trigger CMK rotation/re-wrap |
| POST | `/api/v1/documents/{id}:break-glass` | Dual-control emergency access |
| GET | `/api/v1/admin/encryption/status` | Encryption posture report |

**UI Behavior Notes:** Admin encryption dashboard (key id, rotation date, % re-wrapped); break-glass workflow
with two-approver gate and mandatory reason; no UI ever displays raw keys.

**Edge Cases:** KMS unavailable on download (503, retry, no plaintext fallback); rotation interrupted (resumable
re-wrap job); legacy unencrypted import (migration encrypt-on-ingest).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `EncryptionService` (envelope wrap/unwrap), `KeyRotationJob`, `BreakGlassWorkflow` |
| Backend Flow | On store: generate DEK → encrypt blob → KMS-wrap DEK → persist `wrapped_dek`. On read: KMS-unwrap DEK → decrypt stream → audit |
| Data Operations | INSERT/UPDATE `storage_objects.wrapped_dek/kms_key_id/encryption_alg`; INSERT `document_audit` |
| Validation | TLS enforced at gateway; CMK exists/active; classification→key mapping |
| Authorization | Decrypt: per-document access; rotation/break-glass: Security + second approver |
| State Changes & Side Effects | Rotation re-wraps DEKs; break-glass grants time-boxed access + alert to Security |
| Failure Handling | KMS down ⇒ 503 `KEY_SERVICE_UNAVAILABLE`; unauthorized decrypt ⇒ 403; integrity fail post-decrypt ⇒ 422 |
| Dependencies | KMS, object storage, FR-M13-012 (audit) |
| Test Guidance | Unit: wrap/unwrap, classification→key; Integration: rotate then read old+new; Negative: KMS outage, break-glass single-approver reject |

---

### FR-M13-006 — Access Control (RBAC + Relationship + Classification + Need-to-Know)

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, DMS Librarian, all readers

**User Story:** As a Security Officer, I want access decided by role, org-relationship, classification clearance,
and explicit need-to-know with deny-by-default, so that only entitled principals can see each document at record
and field level.

**Description:** The authorization engine evaluates every access against four dimensions: (1) RBAC right, (2)
org/relationship grants (e.g., reporting manager, originating-workflow membership), (3) classification clearance
(`clearance ≥ document.classification`), and (4) explicit `document_acls`/need-to-know. DENY overrides ALLOW;
absence of ALLOW = no access. Sealed documents are hidden from the subject. List/search results mask restricted
records to metadata-only.

**Acceptance Criteria:**
1. Access is granted only when RBAC right AND classification clearance AND an effective ALLOW (role/relationship/ACL) all hold, with no DENY.
2. A reporting manager can view a direct report's permitted documents via the `REPORTING_MANAGER` relationship grant.
3. Sealed documents (`is_sealed=true`) are invisible to the subject employee even when they own related records.
4. Need-to-know ACLs require workflow membership in addition to role.
5. Denied access is recorded as `document_audit (result=DENIED)` with reason.
6. Time-boxed ACLs (`expires_at`) auto-revoke; expired grants no longer permit access.

**Business Rules:**
- BR-1: DENY always wins (DI-8); deny-by-default everywhere.
- BR-2: Folder ACLs inherit to documents unless a document-level DENY exists.
- BR-3: Auditor reads per clearance; Sys Admin cannot read CONFIDENTIAL+ content except via break-glass.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_acls` | grants/denials |
| `documents` | classification, is_sealed |
| `folders` | inherited ACLs |
| `document_audit` | denied/granted access |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/acls` | Grant/deny |
| DELETE | `/api/v1/acls/{aclId}` | Revoke grant |
| GET | `/api/v1/documents/{id}/access:check` | Evaluate effective access |
| GET | `/api/v1/documents/{id}/acls` | List ACLs |

**UI Behavior Notes:** Permissions panel listing effective access with source (role/relationship/ACL/inherited);
"Why can/can't X see this?" explainer; add-grant dialog with expiry; restricted list rows render lock + metadata
only.

**Edge Cases:** Conflicting ALLOW+DENY (DENY wins); relationship changes after grant (re-evaluated live); expired
ACL still cached (cache invalidation on expiry); cross-org reader (org-scope denies unless explicit grant).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `PermissionsPanel`, `AccessExplainer`; `AuthorizationEngine`, `AclService` |
| Backend Flow | Resolve principal roles/relationships → fetch doc classification + ACLs (doc + inherited folder) → evaluate deny-by-default with DENY precedence → log decision |
| Data Operations | SELECT `document_acls`/`folders`/`documents`; INSERT `document_audit`; INSERT/DELETE ACL rows |
| Validation | Clearance ≥ classification; need-to-know workflow membership; expiry check |
| Authorization | Manage ACL: owner/Librarian/Security with MANAGE_ACL right |
| State Changes & Side Effects | ACL change audited (ACL_CHANGE); cache invalidated; notify on grant to external-like principals |
| Failure Handling | Denied ⇒ 403 `FORBIDDEN` + audited DENIED; sealed ⇒ 404 (existence hidden) |
| Dependencies | M01 (relationships/org), platform roles, FR-M13-012 |
| Test Guidance | Unit: deny precedence, clearance gate, sealed hiding; Integration: relationship-based access; Negative: expired ACL, cross-org |

---

### FR-M13-007 — Virus/Malware Scanning, File-Type & Size Validation, Quarantine

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, System

**User Story:** As a Security Officer, I want every upload validated and malware-scanned before it becomes
available, so that no infected or disallowed file enters the repository or reaches downstream users.

**Description:** Validates file type by magic-byte sniffing (not extension), enforces per-type size caps, and
scans every version with the AV engine before activation. Infected files are quarantined (encrypted, isolated,
inaccessible), and Security is notified. Provides quarantine review/release/delete and re-scan on signature
updates.

**Acceptance Criteria:**
1. File type is determined by content signature; mismatched extension is rejected or corrected, never trusted.
2. Files exceeding the type's `max_size_mb` are rejected pre-storage.
3. Every version is scanned; only `CLEAN` versions become `current`/`ACTIVE`.
4. Infected files are `QUARANTINED`, encrypted, hidden from normal access, and Security is notified.
5. Quarantine release requires Security/DLP approval; release without remediation is blocked.
6. On AV signature update, pending/quarantined items can be re-scanned.

**Business Rules:**
- BR-1: A document cannot reach `ACTIVE` with `scan_status≠CLEAN` (DI-11).
- BR-2: Quarantined binaries are never served, previewed, or shared.
- BR-3: Repeated infections from one uploader raise a security alert.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `scan_results` | verdict per version |
| `documents` | scan_status, status |
| `document_versions` | scanned target |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/quarantine` | List quarantined items |
| POST | `/api/v1/admin/quarantine/{id}:release` | Release after review |
| POST | `/api/v1/documents/{id}:rescan` | Re-scan |

**UI Behavior Notes:** Quarantine console with threat name, uploader, timestamp; release/delete actions behind
confirmation; uploader sees "File blocked by security scan" without threat detail leakage.

**Edge Cases:** Scanner timeout (retry, keep SCANNING, do not auto-activate); archive bombs / nested zips (depth
limit, reject); false positive (Security override-with-reason); EICAR test file in non-prod.

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ScanOrchestrator`, `QuarantineConsole`; `ValidationService`, `AvClient` |
| Backend Flow | Sniff MIME + size guard → stream to AV (ICAP) → record verdict → CLEAN promotes, INFECTED quarantines + alerts |
| Data Operations | INSERT `scan_results`; UPDATE `documents.scan_status/status`; INSERT `audit_log`, `notifications` |
| Validation | Magic-byte vs declared MIME; size cap; archive depth/size |
| Authorization | Release/rescan: Security/DLP |
| State Changes & Side Effects | SCANNING→ACTIVE/QUARANTINED; alert to Security; uploader notification |
| Failure Handling | AV down ⇒ keep SCANNING + retry, 503 on sync path; infected ⇒ 422 `MALWARE_DETECTED` |
| Dependencies | AV engine, FR-M13-001/004 |
| Test Guidance | Unit: MIME sniff, size guard; Integration: EICAR quarantine + release; Negative: spoofed extension, zip bomb |

---

### FR-M13-008 — OCR & Full-Text Search

- **Module:** M13-DMS
- **Primary Role(s):** All readers, DMS Librarian

**User Story:** As a user, I want to search documents by content and metadata with permission-aware results, so
that I can find the right record quickly even if I only remember words inside it.

**Description:** Runs OCR on image/scan uploads, extracts text from text-bearing formats, and indexes content +
metadata into a full-text engine. Provides keyword, phrase, faceted (type/classification/date/folder/tag) and
fuzzy search, with results filtered by the authorization engine and snippets/highlights. Supports multi-language
(en/hi/te) OCR.

**Acceptance Criteria:**
1. Scanned images and PDFs are OCR'd; `document_versions.ocr_status` reflects PENDING/DONE/FAILED/NOT_APPLICABLE.
2. Search returns only documents the requesting principal may view (authorization-filtered) with highlighted snippets.
3. Faceted filters (type, classification, date range, folder, tag, owner) narrow results; all results paginated (max 100).
4. Metadata and OCR text are both searchable; restricted docs show metadata-only snippet.
5. Re-indexing occurs on new versions and metadata changes.
6. Multi-language documents are detected (`language_code`) and indexed with the right analyzer.

**Business Rules:**
- BR-1: Search never returns content a principal cannot access (post-filter, not just rank).
- BR-2: OCR failure does not block storage; document remains searchable by metadata.
- BR-3: Sealed/quarantined documents are excluded from non-privileged search entirely.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | ocr_status |
| `scan_results` | extracted_text_ref |
| `documents` | metadata + classification |
| `document_tags` | facet source |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/search?q=&type=&class=&from=&to=` | Full-text + faceted search |
| POST | `/api/v1/documents/{id}:reindex` | Force re-index |
| GET | `/api/v1/documents/{id}/ocr` | OCR text (per permission) |

**UI Behavior Notes:** Search bar with type-ahead; facet rail with counts; result cards with highlighted
snippets, type/classification badges, and quick preview; "no access" rows masked; saved searches.

**Edge Cases:** Handwritten scans (low OCR confidence flag); huge PDFs (async OCR, partial index); mixed-language
page; permission change after indexing (enforced at query time).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SearchBar`, `FacetRail`, `ResultList`; `OcrService`, `IndexService`, `SearchService` |
| Backend Flow | On version DONE scan → extract/OCR text → index doc+metadata → query applies ACL filter + facets → highlight |
| Data Operations | UPDATE `document_versions.ocr_status`; write search index; SELECT with auth post-filter |
| Validation | Query length/limits; facet values; pagination cap 100 |
| Authorization | Results filtered by AuthorizationEngine (FR-M13-006) |
| State Changes & Side Effects | Index updated on version/metadata change; OCR job retries on failure |
| Failure Handling | Index down ⇒ 503 fallback to metadata DB search; OCR fail ⇒ mark FAILED, keep metadata search |
| Dependencies | OCR engine, search engine, FR-M13-006 |
| Test Guidance | Unit: analyzer selection, facet build; Integration: auth-filtered results; Negative: access change post-index |

---

### FR-M13-009 — Retention, Legal Hold & Disposition Schedules

- **Module:** M13-DMS
- **Primary Role(s):** DMS Librarian, Records Manager, Legal Hold Administrator

**User Story:** As a Records Manager, I want documents governed by retention schedules, frozen by legal holds,
and disposed only through an approved, certified process, so that we meet statutory retention and never destroy
records under litigation.

**Description:** Assigns retention policies (trigger event + period or permanent + disposition action) to
documents/types/folders, computes disposition-due dates from anchor events (e.g., retirement, case closure),
places/releases legal holds that freeze disposition, and runs a maker-checker disposition workflow ending in a
certified destruction/transfer/review record. Holds always override disposition.

**Acceptance Criteria:**
1. A retention policy is assignable at document, type, or folder scope; the effective policy resolves most-specific-first.
2. `disposition_due_date` = anchor date + period; permanent policies leave it null.
3. Placing a legal hold sets `legal_hold_count>0`, blocks disposition/delete/overwrite, and marks assignment `HELD`.
4. Disposition requires proposal (Librarian) + approval (Records Manager), `proposed_by ≠ approved_by`.
5. Disposition executes only when no active hold; it produces a `disposition_records` row with a certificate and a retained tombstone hash.
6. Releasing a hold restores eligibility and recomputes due dates.

**Business Rules:**
- BR-1: Legal hold overrides any retention/disposition (DI-4, DI-10).
- BR-2: Statutory types (SR, PPO) default to permanent/REVIEW; never auto-destroy.
- BR-3: Destruction is logical+physical: blob purged, metadata tombstone + certificate retained for audit.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `retention_policies` / `retention_assignments` | schedule + due date |
| `legal_holds` / `legal_hold_items` | freeze |
| `disposition_records` | certified disposition |
| `documents` | hold count, due date, status |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/retention-policies` | Define policy |
| POST | `/api/v1/documents/{id}/retention` | Assign policy |
| POST | `/api/v1/legal-holds` / `/{id}:release` | Place/release hold |
| POST | `/api/v1/documents/{id}/disposition:propose` / `:approve` | Disposition maker-checker |

**UI Behavior Notes:** Retention admin grid; per-document retention badge with due date; legal-hold console with
matter, scope (saved search/employee/case), and held-count; disposition queue (DUE items) with propose/approve
actions and certificate generation; held items show a freeze icon and disabled dispose.

**Edge Cases:** Overlapping policies (most-specific wins); hold placed mid-disposition (abort, `BLOCKED_HOLD`);
permanent doc proposed for destroy (blocked); anchor event date later corrected (recompute due date).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `RetentionAdmin`, `LegalHoldConsole`, `DispositionQueue`; `RetentionService`, `LegalHoldService`, `DispositionService` |
| Backend Flow | Resolve effective policy → compute due date on anchor → scheduler flags DUE → propose/approve → execute purge+certificate if no hold |
| Data Operations | INSERT/UPDATE `retention_assignments`,`legal_holds`,`legal_hold_items`,`disposition_records`; UPDATE `documents.legal_hold_count/status/disposition_due_date` |
| Validation | maker≠checker; no active hold for execute; permanent⇒no destroy; scope resolution |
| Authorization | Retention: Librarian; approve dispose: Records Mgr; hold: Legal Hold Admin |
| State Changes & Side Effects | ACTIVE→DISPOSITION_DUE→DISPOSED/ARCHIVED; hold ⇒ ON_LEGAL_HOLD; notifications + audit; WORM purge only after retain-until |
| Failure Handling | Hold present ⇒ 409 `LEGAL_HOLD_ACTIVE`; self-approve ⇒ 403 `SOD_VIOLATION`; permanent destroy ⇒ 409 `RETENTION_PERMANENT` |
| Dependencies | M01/M09/M11 anchor events, FR-M13-014 (WORM), notifications |
| Test Guidance | Unit: due-date calc, policy resolution; Integration: hold blocks dispose; Negative: self-approve, destroy permanent |

---

### FR-M13-010 — E-Signature & Digital Signing

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, Employee (signer), Records Manager

**User Story:** As an officer, I want to send a document for one or more signatures (sequential or parallel) using
DSC/Aadhaar/OTP e-sign, so that orders and certificates are legally signed and tamper-evident.

**Description:** Orchestrates a signing envelope: defines signer order, signature fields, and method (Aadhaar
eSign, DSC token, OTP eSign, drawn), routes to signers, applies PAdES digital signatures to a new signed version,
and records each signature with certificate subject and hash. Completed signatures lock the signed version
(tamper-evident); any later change invalidates signatures.

**Acceptance Criteria:**
1. A signing request defines ordered/parallel signers, fields, method, and optional expiry.
2. Signers are notified and sign in the configured order; sequential blocks later signers until prior signs.
3. On completion a new signed `document_version` is created and the request marks COMPLETED.
4. Each signature records signer, method, certificate subject (for DSC), and signature hash (PAdES).
5. A decline halts the envelope with reason; an expiry cancels pending signatures.
6. Tampering with a signed version is detectable (hash mismatch invalidates the signature).

**Business Rules:**
- BR-1: A document type with `requires_signature=true` cannot be marked final until signed.
- BR-2: The signed version is WORM-eligible and cannot be superseded silently (new request required).
- BR-3: Signatures bind to a specific `version_id`; signing a superseded version is rejected.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `signature_requests` | envelope |
| `signatures` | applied signatures |
| `document_versions` | signed output version |
| `documents` | requires_signature gating |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/signature-requests` | Create envelope |
| POST | `/api/v1/signature-requests/{id}/sign` | Apply a signature |
| POST | `/api/v1/signature-requests/{id}:cancel` | Cancel |
| GET | `/api/v1/signature-requests/{id}` | Status |

**UI Behavior Notes:** Signer setup with drag-to-place signature fields; method selector; signer view with
secure sign action (OTP/DSC prompt); progress tracker (who signed/pending); completion download of signed PDF.

**Edge Cases:** Signer out of office (delegate/reassign with reason); DSC token failure (retry/alternate method);
parallel signers race (independent); expired envelope (cancel pending, notify originator).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `SignerSetup`, `SignActionPanel`, `SignProgress`; `SignatureService`, `PkiClient` |
| Backend Flow | Create envelope → notify next signer(s) → on sign, call PKI to apply PAdES → on last, emit signed version → mark COMPLETED |
| Data Operations | INSERT `signature_requests`,`signatures`; INSERT signed `document_versions`; UPDATE request/document status |
| Validation | Signer order, method allowed, version not superseded, expiry |
| Authorization | Create: owner/Records Mgr; sign: assigned signer only |
| State Changes & Side Effects | DRAFT→SENT→IN_PROGRESS→COMPLETED/DECLINED/EXPIRED; signed version WORM-eligible; notifications |
| Failure Handling | Decline ⇒ 200 with DECLINED; PKI down ⇒ 503 `SIGNING_SERVICE_UNAVAILABLE`; tamper ⇒ 422 `SIGNATURE_INVALID` |
| Dependencies | PKI/eSign provider, FR-M13-004/014, notifications |
| Test Guidance | Unit: order enforcement, hash binding; Integration: full sequential sign → signed version; Negative: sign superseded version, decline |

---

### FR-M13-011 — Watermarking, Certified Copies & Redaction

- **Module:** M13-DMS
- **Primary Role(s):** Records Manager, DMS Librarian, Security/DLP Officer

**User Story:** As a Records Manager, I want to issue watermarked, certified true copies and to produce redacted
versions, so that shared/printed copies are traceable and sensitive data can be removed for disclosure.

**Description:** Generates dynamic watermarks (user, timestamp, purpose) on previews/downloads/prints of
restricted documents; issues **certified true copies** (stamped, optionally signed renditions of statutory
records) with a certificate number; and produces **redacted** versions where PII/sensitive regions are
irreversibly removed from a derivative while the original remains intact and access-controlled.

**Acceptance Criteria:**
1. Restricted documents render with a dynamic watermark showing viewer identity, timestamp, and document number.
2. A certified true copy is a new derivative version stamped "CERTIFIED TRUE COPY" with `certificate_no`, issuer, and date, optionally e-signed.
3. Redaction produces a new derivative with selected regions burned out; redacted text is not recoverable from the derivative.
4. The original is never altered by watermark/redaction; derivatives are linked to the source.
5. Certified copies of statutory documents are WORM-stored.
6. Every certified-copy issuance and redaction is audited.

**Business Rules:**
- BR-1: Only Records Manager may certify true copies of statutory records.
- BR-2: Redaction derivatives inherit/raise classification; never lower than source.
- BR-3: Watermark is mandatory (non-removable) for CONFIDENTIAL+ downloads/prints.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_versions` | derivative (certified/redacted) |
| `documents` | source + classification |
| `signatures` | optional cert-copy signing |
| `document_audit` | issuance/redaction events |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}:certified-copy` | Issue certified copy |
| POST | `/api/v1/documents/{id}:redact` | Produce redacted derivative |
| GET | `/api/v1/documents/{id}/render?watermark=1` | Watermarked render |

**UI Behavior Notes:** Certified-copy dialog with issuer/purpose and preview of stamp; redaction tool with box/
area selection over the preview and a confirmation that redaction is irreversible; watermark always visible on
restricted previews.

**Edge Cases:** Redaction over OCR text (re-OCR derivative to confirm removal); certified copy of a held document
(allowed, read-only); watermark on non-rasterisable formats (convert to PDF render first).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `CertifiedCopyDialog`, `RedactionTool`, `WatermarkRenderer`; `RenditionService` |
| Backend Flow | Render source → apply watermark/stamp/redaction to a derivative → store as new version (WORM if statutory) → re-OCR redaction → audit |
| Data Operations | INSERT derivative `document_versions`,`storage_objects`; optional `signatures`; INSERT `document_audit` |
| Validation | Issuer role; classification floor; redaction irreversibility check (re-OCR) |
| Authorization | Certify: Records Mgr; redact: Librarian/Security |
| State Changes & Side Effects | New derivative version; certified copy WORM-locked; notifications/audit |
| Failure Handling | Render fail ⇒ 422 `RENDITION_FAILED`; recoverable redaction ⇒ 422 `REDACTION_INCOMPLETE` |
| Dependencies | Preview renderer, OCR, FR-M13-010/014 |
| Test Guidance | Unit: watermark presence, classification floor; Integration: redact→re-OCR confirms removal; Negative: certify by wrong role |

---

### FR-M13-012 — Access Audit (View/Download/Print/Share) & Compliance Reporting

- **Module:** M13-DMS
- **Primary Role(s):** Auditor, Security/DLP Officer, Records Manager

**User Story:** As an Auditor, I want an immutable record of every view, download, print and share of every
document, so that I can prove who accessed what, when, and detect misuse.

**Description:** Records every access event (success or denied) to the append-only `document_audit` with actor,
role, IP/user-agent, action, version, share context, and result. Provides per-document access history, per-user
activity, and compliance reports (e.g., who accessed a sensitive record, documents without retention, overdue
disposition, holds inventory, classification distribution). The audit trail is immutable and exportable for
e-discovery.

**Acceptance Criteria:**
1. Every VIEW/PREVIEW/DOWNLOAD/PRINT/SHARE and metadata/lifecycle action writes one immutable `document_audit` row.
2. Denied accesses are recorded with `result=DENIED` and reason.
3. A document's access history is viewable by Auditor/Records Manager/owner (own).
4. Compliance reports include: documents missing retention, overdue disposition, active holds, sensitive-access log, classification mix.
5. The audit log cannot be updated or deleted (DI-3); attempts fail and are themselves alerted.
6. Audit data is exportable (CSV/JSON) for a date/scope range for e-discovery.

**Business Rules:**
- BR-1: Print actions are captured where the platform controls rendering (watermarked print path).
- BR-2: Audit retention is at least as long as the document's retention.
- BR-3: Access to the audit trail is itself audited.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_audit` | access events |
| `documents` | subject |
| `document_shares` | share context |
| `audit_log` | state-change cross-ref |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/{id}/audit` | Access history |
| GET | `/api/v1/audit/documents?userId=&from=&to=` | Cross-document access query |
| GET | `/api/v1/reports/compliance/{reportCode}` | Compliance report |
| POST | `/api/v1/audit:export` | e-discovery export |

**UI Behavior Notes:** Access-history timeline per document; auditor console with filters (user, action, date,
classification); compliance dashboard cards with drill-down; export button with scope picker.

**Edge Cases:** High-volume access (audit write must not block read path — async durable queue with guaranteed
delivery); print outside platform (best-effort, flagged); export of large ranges (async job + download link).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `AccessHistory`, `AuditorConsole`, `ComplianceDashboard`; `AuditService`, `ReportService` |
| Backend Flow | Every gateway access emits an audit event to a durable append-only sink → reports aggregate over `document_audit` + metadata |
| Data Operations | INSERT-only `document_audit`; SELECT aggregations; export job |
| Validation | Append-only enforced at DB (no UPDATE/DELETE grants); report params |
| Authorization | Read trail: Auditor/Records Mgr/owner(own); export: Auditor/Security |
| State Changes & Side Effects | None to documents; alert on tamper attempt; export produces signed file |
| Failure Handling | Sink down ⇒ buffer + retry, never silently drop; tamper attempt ⇒ 403 + alert |
| Dependencies | All FRs emit audit; FR-M13-013 (share context) |
| Test Guidance | Unit: immutability, denied logging; Integration: access→history; Negative: attempt UPDATE audit row |

---

### FR-M13-013 — Secure Sharing & Expiring Links

- **Module:** M13-DMS
- **Primary Role(s):** Document Owner, DMS Librarian, Security/DLP Officer

**User Story:** As a document owner, I want to share a document with an internal user or via a time-limited,
optionally password-protected external link, so that recipients get exactly the access I grant, only for as long
as I allow.

**Description:** Creates internal shares (to a `users` principal) or external shares (opaque tokenised links) with
scoped rights (view/download), mandatory expiry for external links, optional password and access-count cap,
optional watermark, and full audit. Links can be revoked instantly; DLP rules can block sharing of sensitive
content.

**Acceptance Criteria:**
1. Internal share grants scoped rights to a named user without exposing a public URL.
2. External link requires `expires_at`, stores only a hashed token, and never embeds the raw token server-side.
3. Optional password (hashed) and `max_access_count` are enforced; exceeding either denies access.
4. Accessing via a share writes `document_audit` with `share_id` context and applies watermark if required.
5. Revoking a share immediately invalidates the link/grant.
6. DLP `BLOCK_SHARE` findings prevent external sharing of flagged documents.

**Business Rules:**
- BR-1: CONFIDENTIAL+ external links require Security/DLP approval and watermark.
- BR-2: External links cannot grant PRINT or UPDATE; download only if explicitly allowed.
- BR-3: Expired/revoked links return 404 (no existence leak).

**Data Model References:**

| Entity | Use |
|--------|-----|
| `document_shares` | share/link |
| `documents` | subject + classification |
| `dlp_findings` | block-share gate |
| `document_audit` | access via share |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents/{id}/shares` | Create share/link |
| GET | `/api/v1/shared/{token}` | Resolve external link |
| POST | `/api/v1/shares/{id}:revoke` | Revoke |
| GET | `/api/v1/documents/{id}/shares` | List shares |

**UI Behavior Notes:** Share dialog with internal-user picker or "create link"; expiry/password/access-count
controls; copy-link with one-time reveal of token; active-shares list with revoke; recipient landing page with
optional password and watermark.

**Edge Cases:** Link forwarded to others (access-count cap + password mitigate); recipient without account
(external link path); classification raised after sharing (re-evaluate, auto-revoke if now over policy); clock
skew on expiry (server-side authoritative).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ShareDialog`, `ActiveShares`, `SharedLanding`; `ShareService` |
| Backend Flow | Validate rights + DLP gate → generate opaque token, store `token_hash` → on access verify hash/password/expiry/count → serve watermarked render → audit |
| Data Operations | INSERT/UPDATE `document_shares`; INSERT `document_audit`; UPDATE `access_count` |
| Validation | Expiry mandatory (external); rights subset; DLP not BLOCK_SHARE; password strength |
| Authorization | Create: owner/Librarian; CONFIDENTIAL+ external: Security approval |
| State Changes & Side Effects | ACTIVE→EXPIRED/REVOKED; watermark applied; notifications to recipient |
| Failure Handling | Expired/revoked ⇒ 404; over count ⇒ 403 `SHARE_LIMIT_REACHED`; DLP block ⇒ 403 `SHARE_BLOCKED_DLP` |
| Dependencies | FR-M13-006/011/012/016 |
| Test Guidance | Unit: token hashing, expiry/count; Integration: external link access + audit; Negative: forwarded expired link, DLP-blocked share |

---

### FR-M13-014 — Immutable WORM Storage for Statutory Documents

- **Module:** M13-DMS
- **Primary Role(s):** Records Manager, Security/DLP Officer, System

**User Story:** As a Records Manager, I want statutory documents stored Write-Once-Read-Many with object-lock
retention, so that they cannot be altered or deleted before their lawful retention expires, even by
administrators.

**Description:** Stores statutory documents (SR pages, PPOs, charge-sheets, certified copies) in WORM-locked
object storage with an object-lock `worm_retain_until` timestamp. WORM documents reject overwrite, supersede,
delete, and disposition before the retention horizon; even Sys Admin/break-glass cannot mutate content. Legal
holds extend immutability indefinitely.

**Acceptance Criteria:**
1. A document marked `is_worm=true` is stored in `WORM_LOCKED` storage class with `worm_retain_until` set.
2. Any attempt to overwrite, version-mutate, delete, or dispose a WORM document before `worm_retain_until` is rejected.
3. WORM defaults are applied automatically for statutory document types (`is_worm_default=true`).
4. A legal hold on a WORM document blocks disposition even after `worm_retain_until`.
5. WORM status and retain-until are visible and auditable; changes to retain-until can only extend, never shorten.
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
storage-tier migration (preserve object-lock); accidental WORM on non-statutory doc (cannot undo before horizon —
governance warning at declare time).

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
| Dependencies | Object-lock-capable storage, FR-M13-004/009 |
| Test Guidance | Unit: WORM guard, extend-only; Integration: WORM blocks delete/supersede; Negative: shorten retain, admin mutate |

---

### FR-M13-015 — Deduplication, Integrity (Checksums) & Thumbnail/Preview Generation

- **Module:** M13-DMS
- **Primary Role(s):** System, DMS Librarian

**User Story:** As a system, I want to deduplicate identical content, verify integrity by checksum, and generate
thumbnails/previews, so that storage is efficient, tampering is detectable, and users get instant previews.

**Description:** Computes a SHA-256 over every blob; identical hashes reuse a single `storage_objects` row
(reference-counted) rather than re-storing; periodic and on-read integrity checks compare stored vs recomputed
hashes to detect bit-rot/tampering; and a renderer produces thumbnails and paginated previews (PDF/image/Office)
for fast viewing without download.

**Acceptance Criteria:**
1. Uploading content identical to an existing blob reuses it and increments `ref_count` (no duplicate bytes).
2. A blob is physically deleted only when `ref_count` reaches 0 and no WORM/hold applies.
3. Stored `content_hash` is verified on download and on a periodic scan; mismatch flags `integrity_verified=false` and quarantines the version.
4. Thumbnails and multi-page previews are generated for supported formats and served per permission.
5. Preview generation never exposes content to unauthorised principals (auth-checked render).
6. Integrity failures raise an alert and block serving the affected version.

**Business Rules:**
- BR-1: Dedup operates on content hash only; metadata/ACLs remain per-document.
- BR-2: WORM/held blobs are never garbage-collected regardless of `ref_count`.
- BR-3: Preview is a derivative render, not the stored original; watermark applies for restricted docs.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `storage_objects` | hash, ref_count, dedup |
| `document_versions` | content_hash |
| `scan_results` | integrity_verified |
| `documents` | content_hash, size |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/documents/{id}/thumbnail` | Thumbnail |
| GET | `/api/v1/documents/{id}/preview?page=` | Paginated preview |
| POST | `/api/v1/admin/integrity:scan` | Trigger integrity scan |

**UI Behavior Notes:** Grid/list thumbnails; in-app preview pane with page navigation and zoom; integrity badge
(verified/last-checked); broken-integrity items flagged in admin console.

**Edge Cases:** Hash collision (cryptographically negligible; treat as same — still safe under SHA-256);
unsupported format for preview (icon + "preview unavailable"); large file preview (progressive/async render);
bit-rot detected (restore from replica, alert).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `ThumbnailGrid`, `PreviewPane`; `DedupService`, `IntegrityService`, `PreviewRenderer` |
| Backend Flow | On store hash→dedup lookup→reuse or create blob; on read verify hash; render thumbnails/preview with auth + watermark |
| Data Operations | SELECT/UPDATE `storage_objects.ref_count`; UPDATE `scan_results.integrity_verified`; render artefacts cached |
| Validation | Hash recompute match; supported MIME for preview; ref-count GC guards (WORM/hold) |
| Authorization | Preview/thumbnail auth-checked (FR-M13-006) |
| State Changes & Side Effects | Dedup adjusts ref_count; integrity fail quarantines version + alert |
| Failure Handling | Integrity mismatch ⇒ 422 `INTEGRITY_FAILED` + quarantine; render fail ⇒ preview-unavailable, original intact |
| Dependencies | Object storage, preview renderer, FR-M13-007/011 |
| Test Guidance | Unit: dedup ref-count, hash verify; Integration: tamper→integrity fail; Negative: GC of held blob |

---

### FR-M13-016 — DLP, Content Lifecycle & Storage Abstraction (Module Attach Contract)

- **Module:** M13-DMS
- **Primary Role(s):** Security/DLP Officer, DMS Librarian, Uploader (Module Service)

**User Story:** As a Security Officer, I want sensitive content detected (DLP), the storage backend abstracted,
and a stable attach contract for all modules, so that PII is governed, storage can evolve, and M01–M12 integrate
through one clean interface.

**Description:** Runs DLP content inspection (Aadhaar/PAN/bank/PII patterns) producing `dlp_findings` that drive
auto-classification, tagging, redaction prompts, and share blocking; manages content lifecycle states (draft →
active → superseded → disposition-due → disposed/archived); and exposes the **storage abstraction** so binaries
sit behind a provider-agnostic interface (S3-compatible/government blob) with tiering (HOT/WARM/COLD/WORM). This
FR also defines the **canonical attach/fetch contract** consumed by all other modules.

**Acceptance Criteria:**
1. DLP scans extracted text on ingest and new versions, producing `dlp_findings` with rule, severity, count, and suggested action.
2. HIGH/CRITICAL PII findings auto-raise classification to at least CONFIDENTIAL and tag the document.
3. The storage layer is provider-agnostic: switching backend/tier does not change `document_id` or the API contract.
4. Content lifecycle transitions follow the state machine (§12.1) with audit at every transition.
5. The attach contract (`POST /documents:attach`) lets any module bind a document with `module_code`, `entity_name`, `entity_ref_id`, `link_role`, returning a stable `document_id`/`link_id`.
6. The fetch contract returns metadata + a permission-checked, time-limited content URL (never a public URL).

**Business Rules:**
- BR-1: DLP `BLOCK_SHARE` findings prevent external sharing until remediated (FR-M13-013).
- BR-2: Storage tiering is policy-driven (age/access) and never weakens encryption or WORM.
- BR-3: Modules never receive raw storage keys — only `document_id` and short-lived signed render/download URLs.

**Data Model References:**

| Entity | Use |
|--------|-----|
| `dlp_findings` | detections |
| `documents` | lifecycle, classification |
| `storage_objects` | tiering/abstraction |
| `document_links` | attach contract |

**API References:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents:attach` | Module attach (returns document_id/link_id) |
| GET | `/api/v1/documents/{id}:fetch` | Metadata + signed content URL |
| GET | `/api/v1/documents/{id}/dlp` | DLP findings |
| POST | `/api/v1/dlp-findings/{id}:resolve` | Accept/dismiss/remediate |

**UI Behavior Notes:** DLP findings panel with severity badges and suggested actions (reclassify/redact/dismiss);
lifecycle state chip on each document; admin storage view showing tier distribution; attach is server-to-server
(no end-user UI) but appears in the source module's "Attachments" panel.

**Edge Cases:** False-positive PII (dismiss-with-reason); module attaches before scan completes (link allowed,
serving blocked until CLEAN); storage backend migration mid-life (transparent via abstraction); fetch of a
disposed document (404 with tombstone reason).

**LLD:**

| Aspect | Detail |
|--------|--------|
| Components | `DlpFindingsPanel`, `LifecycleChip`, `StorageAdmin`; `DlpService`, `StorageProvider` (interface), `LifecycleService`, `AttachService` |
| Backend Flow | Extract text → DLP rules → findings + auto-classify/tag → lifecycle transitions guarded by state machine → attach validates + links → fetch issues signed short-lived URL |
| Data Operations | INSERT `dlp_findings`,`document_links`; UPDATE `documents.classification/status`; tiering updates `storage_objects.storage_class` |
| Validation | DLP rule set; lifecycle transition legality; attach payload completeness; signed-URL TTL |
| Authorization | DLP manage: Security; attach: module service token; fetch: per-document access |
| State Changes & Side Effects | Auto-classify/tag; BLOCK_SHARE flag; lifecycle audit; tiering jobs |
| Failure Handling | Attach incomplete ⇒ 400; fetch disposed ⇒ 404 `DOCUMENT_DISPOSED`; DLP engine down ⇒ defer scan, store, block serving until scanned |
| Dependencies | DLP engine, storage provider, FR-M13-002/006/013, all modules (consumers) |
| Test Guidance | Unit: DLP auto-classify, lifecycle guards, signed-URL TTL; Integration: attach→fetch round-trip with auth; Negative: fetch disposed, share blocked by DLP |

---

## 7. UI Requirements

### 7.1 Screen inventory

| Screen | Purpose | Primary FRs |
|--------|---------|-------------|
| Document Explorer (tree + grid) | Browse cabinets/folders, thumbnails, search | 003, 008, 015 |
| Upload / Bulk Upload | Drag-drop, scanner, mobile capture, metadata form | 001, 002 |
| Document Detail | Preview, metadata, versions, ACLs, audit, lifecycle | 004, 006, 012, 016 |
| Version History | Timeline, check-in/out, supersede, compare | 004 |
| Permissions Panel | Effective access, grants/denials, explainer | 006 |
| Classification & Tags | Reclassify (maker-checker), tag editor, DLP findings | 002, 016 |
| Retention & Holds Console | Policies, assignments, legal holds, disposition queue | 009, 014 |
| Signature Center | Envelope setup, sign action, progress | 010 |
| Certified Copy / Redaction | Issue certified copy, redact regions | 011 |
| Share Manager | Create/revoke internal & external shares | 013 |
| Quarantine Console | Review/release infected uploads | 007 |
| Auditor / Compliance Dashboard | Access trail, compliance reports, exports | 012 |
| Admin (Types, Storage, Keys) | Taxonomy, storage tiers, encryption posture | 002, 005, 016 |

### 7.2 Cross-cutting UI rules

- WCAG 2.1 AA; keyboard-navigable tree/grid; focus-visible; screen-reader labels on all actions.
- Real data, real states (empty/loading/error/permission-denied/offline) on every screen — no skeleton-only UI.
- Classification badge and (if WORM/held/sealed) status icons on every document surface.
- Restricted documents render metadata-only with a clear "no access" affordance — never partial content leak.
- Dynamic watermark always visible on restricted previews/downloads/prints.
- Destructive/lifecycle actions (dispose, release hold, downgrade) require confirmation + reason and show SoD second-approver step.
- All lists paginated (max 100) with facets/filters; `DD-MMM-YYYY` dates; user-locale rendering.

---

## 8. (Reserved — merged into §6 LLDs)

## 9. (Reserved — see §6 and §10)

---

## 10. API & Integration

### 10.1 Conventions

- Base path `/api/v1`; JSON over HTTPS (TLS 1.2+); OIDC/JWT bearer auth; RBAC + org scope.
- All list endpoints paginated (`page`,`limit`≤100) and filterable; binaries via short-lived signed URLs only.
- Idempotency-Key header supported on upload/attach to make retries safe.
- Action-style endpoints use the `:verb` suffix (e.g., `:attach`, `:checkin`).

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
| `METADATA_INVALID` | 422 | Metadata fails type JSON-Schema |
| `MALWARE_DETECTED` | 422 | AV flagged the upload |
| `INTEGRITY_FAILED` | 422 | Checksum mismatch (tamper/bit-rot) |
| `DOCUMENT_LOCKED` | 409 | Checked out by another user |
| `WORM_IMMUTABLE` | 409 | Mutation/delete blocked by WORM lock |
| `RETENTION_SHORTEN_FORBIDDEN` | 422 | Attempt to reduce retain-until |
| `RETENTION_PERMANENT` | 409 | Destroy attempted on permanent record |
| `LEGAL_HOLD_ACTIVE` | 409 | Action blocked by active legal hold |
| `SOD_VIOLATION` | 403 | Maker == checker / self-approval |
| `CLASSIFICATION_LOCKED` | 403 | Unauthorised downgrade |
| `DOCUMENT_NOT_ATTACHABLE` | 409 | Document deleted/disposed |
| `LINK_CONFLICT` | 409 | Duplicate primary link |
| `SHARE_BLOCKED_DLP` | 403 | DLP blocks external share |
| `SHARE_LIMIT_REACHED` | 403 | Access-count/expiry exceeded |
| `SIGNATURE_INVALID` | 422 | Signed content tampered |
| `SIGNING_SERVICE_UNAVAILABLE` | 503 | PKI/eSign down |
| `KEY_SERVICE_UNAVAILABLE` | 503 | KMS unavailable |
| `RENDITION_FAILED` | 422 | Watermark/redaction/preview render failed |
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
  "requestId": "req_a1b2c3"
}
```

**Fetch (signed content URL):**

```json
{
  "documentId": "doc-0001", "title": "Aadhaar – EMP-3001", "classification": "CONFIDENTIAL",
  "status": "ACTIVE", "currentVersionNo": 1, "mimeType": "application/pdf",
  "contentUrl": "https://blob.gov/hrms/doc-0001?sig=...&exp=1714000000",
  "contentUrlExpiresAt": "2026-04-12T10:10:00Z", "requestId": "req_d4e5f6"
}
```

**WORM mutation rejected:**

```json
{ "error": { "code": "WORM_IMMUTABLE", "message": "Document is under WORM lock until 2046-04-01.", "field": "documentId" }, "requestId": "req_99aa" }
```

### 10.5 Integration contracts

| Consumer | Integration | Direction |
|----------|-------------|-----------|
| M01–M12 | `documents:attach` / `:fetch` (binaries by reference) | Modules → M13 |
| M02 | Proof documents linked to change requests | M02 → M13 |
| M09 | Charge-sheets, exhibits, sealed PI reports (vault) | M09 → M13 |
| M11/M12 | PPO, SR pages, certified copies (WORM) | M11/M12 → M13 |
| M14 | Compliance metrics (read-only reports) | M13 → M14 |
| Platform | `notifications`, `audit_log`, KMS, AV, OCR, PKI, object storage | bidirectional |

---

## 11. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | P95 < 500 ms for metadata ops; upload throughput supports 250 MB resumable; preview first-page < 2 s; search P95 < 800 ms |
| Scalability | Horizontal API scaling; object storage to PB scale; dedup keeps growth sub-linear to ingest |
| Availability | 99.9% uptime; degrade gracefully (metadata search if index down; resumable upload on storage blips) |
| Durability | Object storage ≥ 11 nines durability with cross-zone replication; RPO ≤ 15 min, RTO ≤ 4 h |
| Security | Envelope encryption (AES-256-GCM) + KMS; TLS 1.2+; OWASP ASVS L2; deny-by-default ACL; full access audit; no raw storage keys to clients |
| Privacy | DPDP 2023 alignment; PII detection (DLP) + minimisation; redaction; purpose-bound sharing |
| Compliance | Statutory retention enforced; WORM immutability; certified destruction; immutable audit; e-discovery export |
| Integrity | SHA-256 checksums; periodic integrity scans; tamper detection blocks serving |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Metrics on ingest/scan/OCR latency, quarantine rate, integrity failures, disposition backlog; alerting |
| Maintainability | Provider-agnostic storage abstraction; versioned `document_types` schemas; API `/v1` stability |

---

## 12. Workflow & State Diagrams (State Tables)

### 12.1 Document lifecycle (`document_status`)

| From | Event | To | Guard / Side effect |
|------|-------|----|----|
| (none) | Upload accepted | DRAFT | Validation passed |
| DRAFT | Scan starts | SCANNING | AV queued |
| SCANNING | Scan CLEAN | ACTIVE | OCR/preview enqueued; audit VERSION_ADD |
| SCANNING | Scan INFECTED | QUARANTINED | Isolate + notify Security |
| QUARANTINED | Released (Security) | ACTIVE | Override-with-reason audited |
| ACTIVE | Check-out | CHECKED_OUT | Exclusive lock |
| CHECKED_OUT | Check-in | ACTIVE | New version; lock released |
| ACTIVE | New version supersedes | ACTIVE | Prior version → SUPERSEDED |
| ACTIVE | Legal hold placed | ON_LEGAL_HOLD | Disposition frozen |
| ON_LEGAL_HOLD | Hold released | ACTIVE | Recompute due date |
| ACTIVE | Disposition due | DISPOSITION_DUE | No active hold |
| DISPOSITION_DUE | Disposition executed | DISPOSED/ARCHIVED | Certificate + tombstone |
| ACTIVE | Soft delete | DELETED | Not allowed if WORM/hold |

### 12.2 Version state table

| From | Event | To |
|------|-------|----|
| (none) | Check-in | CURRENT |
| CURRENT | New version added | SUPERSEDED |
| CURRENT | Supersede (re-scan) | SUPERSEDED (kept for audit) |

### 12.3 Legal hold state table

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Place hold | ACTIVE | Sets `legal_hold_count++`, doc→ON_LEGAL_HOLD |
| ACTIVE | Release | RELEASED | `legal_hold_count--`; recompute due |

### 12.4 Disposition state table

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Propose | PROPOSED | Librarian; doc DISPOSITION_DUE |
| PROPOSED | Approve | APPROVED | Records Mgr; maker≠checker; no hold |
| PROPOSED | Reject | REJECTED | With reason |
| APPROVED | Execute | EXECUTED | No hold; purge + certificate + tombstone |
| any | Hold present | BLOCKED_HOLD | Abort execution |

### 12.5 Signature request state table

| From | Event | To |
|------|-------|----|
| DRAFT | Send | SENT |
| SENT | First sign | IN_PROGRESS |
| IN_PROGRESS | All signed | COMPLETED |
| IN_PROGRESS | Decline | DECLINED |
| SENT/IN_PROGRESS | Expiry | EXPIRED |
| any | Cancel | CANCELLED |

### 12.6 Share state table

| From | Event | To |
|------|-------|----|
| (none) | Create | ACTIVE |
| ACTIVE | Expiry/limit reached | EXPIRED |
| ACTIVE | Revoke | REVOKED |

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
| Legal hold placed/released | Records Manager, custodians | In-app + email | "Legal hold {holdNo} {status}" |
| Share created/expiring soon | Recipient/owner | Email | "Document {docNo} shared / link expiring" |
| Integrity failure detected | Security/DLP, Records Manager | In-app + email | "Integrity check failed for {docNo}" |
| Break-glass access | Security/DLP | In-app + email | "Break-glass access to {docNo} by {user}" |

All notifications write to the shared `notifications` ledger; sensitive notifications omit content details.

---

## 14. Reporting & Analytics

| Report | Description | Audience |
|--------|-------------|----------|
| Documents without retention | Docs missing a retention assignment | Records Manager |
| Overdue disposition | DISPOSITION_DUE past due, not held | Records Manager |
| Legal-hold inventory | Active holds + held document counts | Legal Hold Admin, Auditor |
| Sensitive-access log | Who accessed CONFIDENTIAL+ in a period | Auditor, Security |
| Classification distribution | Counts by classification/type/org unit | Security, M14 |
| Quarantine/infection rate | AV blocks over time, repeat offenders | Security |
| Integrity health | Verified vs failed checksum scans | Security, Records Manager |
| Storage & dedup efficiency | Logical vs physical bytes, tier mix, dedup ratio | Sys Admin |
| Signing throughput | Pending/completed/declined envelopes, cycle time | Records Manager |
| DLP findings | Open/remediated PII findings by rule/severity | Security/DLP |

All reports are permission-scoped, paginated, and exportable (CSV/JSON); M14 consumes aggregates read-only.

---

## 15. Migration & Launch

### 15.1 Data migration

- Inventory legacy stores (file shares, scanned archives, module-local blobs); classify by type and sensitivity.
- Ingest each file through the standard pipeline (scan + hash + dedup + OCR), encrypting on ingest; assign
  `document_type`, classification, retention, and WORM for statutory records.
- Backfill `document_links` from each module's existing attachment references; verify FK integrity (DI-14).
- Reconcile counts and checksums; quarantine anything failing scan; produce a migration audit report.

### 15.2 Cutover & launch

- Stand up storage buckets (HOT/WARM/COLD/WORM), KMS keys, AV/OCR/PKI integrations; smoke-test the pipeline.
- Dual-run: modules attach to M13 while legacy remains read-only; verify fetch/preview/search parity.
- Freeze legacy writes; flip modules to M13 attach contract; decommission legacy after reconciliation sign-off.

### 15.3 Launch readiness checklist

- [ ] Encryption (KMS) + TLS verified; no plaintext at rest.
- [ ] AV, OCR, preview, PKI integrations green.
- [ ] WORM object-lock verified on a statutory sample.
- [ ] Retention/hold/disposition workflow tested with maker-checker.
- [ ] Access-audit immutability verified (UPDATE/DELETE denied).
- [ ] Attach/fetch contract validated against M01, M02, M09, M11.
- [ ] Compliance reports populated; M14 read-only access confirmed.
- [ ] Migration reconciliation: 0 unmatched links, 0 failed checksums (or quarantined + logged).

---

## 16. Traceability / Dependency / Parallel-Agent Plan

### 16.1 Requirements ↔ entities ↔ APIs traceability matrix

| FR | Title | Key entities | Key APIs |
|----|-------|--------------|----------|
| FR-M13-001 | Upload & Ingestion | documents, document_versions, storage_objects, scan_results, document_links | POST /documents, /documents/bulk, :resume, :attach |
| FR-M13-002 | Types/Taxonomy/Classification/Tagging | document_types, document_tags, documents, dlp_findings | POST /document-types, /tags, :reclassify |
| FR-M13-003 | Folders & Attach Contract | folders, document_links, document_acls, documents | POST /folders, :attach, DELETE /document-links |
| FR-M13-004 | Versioning & Check-in/out | document_versions, checkout_locks, documents, scan_results | :checkout, :checkin, :supersede, /versions |
| FR-M13-005 | Encryption (KMS) & TLS | storage_objects, documents, document_audit | /keys:rotate, :break-glass, /encryption/status |
| FR-M13-006 | Access Control | document_acls, documents, folders, document_audit | POST /acls, /access:check |
| FR-M13-007 | Malware Scan & Validation | scan_results, documents, document_versions | /quarantine, :release, :rescan |
| FR-M13-008 | OCR & Search | document_versions, scan_results, documents, document_tags | /search, :reindex, /ocr |
| FR-M13-009 | Retention/Hold/Disposition | retention_policies, retention_assignments, legal_holds, legal_hold_items, disposition_records | /retention-policies, /retention, /legal-holds, :propose/:approve |
| FR-M13-010 | E-Signature | signature_requests, signatures, document_versions | /signature-requests, /sign, :cancel |
| FR-M13-011 | Watermark/Certified/Redact | document_versions, documents, signatures, document_audit | :certified-copy, :redact, /render |
| FR-M13-012 | Access Audit & Compliance | document_audit, documents, document_shares, audit_log | /audit, /reports/compliance, :export |
| FR-M13-013 | Secure Sharing | document_shares, documents, dlp_findings, document_audit | /shares, /shared/{token}, :revoke |
| FR-M13-014 | WORM Storage | documents, storage_objects, document_versions, disposition_records | :declare-worm, :extend-retention, /worm-status |
| FR-M13-015 | Dedup/Integrity/Preview | storage_objects, document_versions, scan_results, documents | /thumbnail, /preview, /integrity:scan |
| FR-M13-016 | DLP/Lifecycle/Storage Abstraction | dlp_findings, documents, storage_objects, document_links | :attach, :fetch, /dlp, :resolve |

### 16.2 Dependency / build order

1. **Foundation:** storage abstraction + KMS encryption (FR-005) and entities (documents, versions, storage_objects).
2. **Ingestion safety:** validation + malware scan (FR-007), then upload/ingestion (FR-001).
3. **Organisation:** types/taxonomy (FR-002), folders + attach contract (FR-003).
4. **Content ops:** versioning (FR-004), dedup/integrity/preview (FR-015), OCR/search (FR-008).
5. **Governance:** access control (FR-006), audit (FR-012), retention/hold/disposition (FR-009), WORM (FR-014).
6. **Advanced:** e-signature (FR-010), watermark/certified/redact (FR-011), sharing (FR-013), DLP/lifecycle (FR-016).

### 16.3 Parallel-agent plan

| Track | FRs | Notes |
|-------|-----|-------|
| A — Storage & Crypto | 005, 015 | Storage provider + KMS + dedup/integrity; unblocks all |
| B — Ingestion & Safety | 001, 007 | Depends on A |
| C — Taxonomy & Structure | 002, 003 | Parallel to B after entities exist |
| D — Content Ops | 004, 008 | Depends on A/B |
| E — Governance | 006, 009, 012, 014 | Depends on entities + A |
| F — Advanced | 010, 011, 013, 016 | Depends on D/E |

Shared contracts (entities, error catalog, attach/fetch API) are frozen first to enable safe parallelism.

### 16.4 Final reconciliation table (0 unresolved gaps)

| Checkpoint | Status |
|-----------|--------|
| All 20 entities have full field tables | ✅ |
| All 20 entities have 2–3 sample rows | ✅ |
| Canonical `documents` defined here; shared entities referenced not redefined | ✅ |
| 16 FRs, each with full structure + LLD table | ✅ |
| Every FR maps to entities + APIs (16.1) | ✅ |
| Error catalog covers all FR failure modes | ✅ |
| State tables cover document/version/hold/disposition/signature/share | ✅ |
| Notifications/Reporting/Migration sections complete | ✅ |
| Attach/fetch contract for M01–M12 specified | ✅ |
| Encryption/WORM/retention/audit (statutory) specified | ✅ |
| Unresolved gaps | **0** |

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| Envelope encryption | Encrypting data with a per-object DEK that is itself encrypted (wrapped) by a KMS master key |
| DEK / CMK | Data Encryption Key / Customer Master Key (KMS) |
| WORM | Write-Once-Read-Many immutable storage with object-lock retention |
| Legal hold | A freeze preventing disposition/deletion of records relevant to litigation/inquiry |
| Disposition | The end-of-retention action: destroy, archive-transfer, or review |
| Retention schedule | Policy defining how long a record is kept and what happens after |
| Check-out / check-in | Exclusive lock + new-version workflow preventing concurrent edits |
| Supersede | Replacing a flawed original with a corrected version while keeping the old for audit |
| Classification | Sensitivity label (PUBLIC…TOP_SECRET) gating visibility |
| Need-to-know | Access requiring workflow membership beyond a generic role |
| Dedup | Storing identical content once, referenced by multiple documents |
| DLP | Data Loss Prevention — detecting/limiting exposure of sensitive content |
| PAdES | PDF Advanced Electronic Signatures standard |
| Certified true copy | Officially stamped/signed faithful reproduction of a statutory record |
| Break-glass | Audited emergency access under dual control |
| Tombstone | Metadata + hash retained after a binary is destroyed, for audit |

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

### Appendix B — Classification → control map

| Classification | Watermark | External share | Default key | Audit |
|----------------|-----------|----------------|-------------|-------|
| PUBLIC | optional | allowed | shared CMK | yes |
| INTERNAL | optional | allowed | shared CMK | yes |
| CONFIDENTIAL | mandatory | Security approval | dedicated CMK | yes |
| SECRET | mandatory | blocked (internal only) | dedicated CMK | yes |
| TOP_SECRET | mandatory | blocked | dedicated CMK | yes + alert |

### Appendix C — Allowed MIME types (baseline, per type override)

`application/pdf`, `image/tiff`, `image/jpeg`, `image/png`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### Appendix D — Assumptions & caveats

- KMS, object-storage object-lock, AV (ICAP), OCR, and PKI/eSign are available platform services at CGG.
- Print auditing is reliable only through the platform's watermarked print path; out-of-band printing is best-effort.
- Exact statutory retention periods are configurable and must be confirmed against the governing rules at deployment.
- SHA-256 collision risk is treated as cryptographically negligible for dedup/integrity purposes.
