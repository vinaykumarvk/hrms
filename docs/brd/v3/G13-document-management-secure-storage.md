# Document Management and Secure Storage — Government HRMS Module BRD (G13, v3.0 · platform-grounded)

**Programme:** Government HRMS — public-sector configuration & extension of the **PrimeSoft HRMS** platform
**Module:** G13 — Document Management and Secure Storage (G13-DMS) — `GOV-M13`, ex `M13-DMS`
**Relationship:** **EXTEND / REUSE** of PrimeSoft **M11 Document Management** (Reconciliation §A row G13; §B code map; §C overrides; §D net-new)
**Owner of the gov document surface:** This module — but it does **not** fork a parallel store; it **re-anchors onto the existing PrimeSoft M11 vault** (`letter_templates`, document vault, `signoff_transactions`, retention classes) and adds only the gov-statutory extensions (WORM, legal-hold, security-clearance, certified-true-copy, anchored access audit).
**Status:** v3.0 (platform re-grounded — supersedes v2.0 for the government build; preserves all v2 content and rigor)
**Reads with:** `docs/brd/PLATFORM_FOUNDATION.md`, `docs/brd/MODULE_RECONCILIATION.md`, Platform Spec v1.6 (P01–P06, X.1–X.3, W.1–W.3), Foundation FS v1.6 (VAL-*/JOB-*/MSG-*/ERR-* catalogues), RBAC Design v1.7.
**Revision basis:** v2.0 BRD (all 21 Adopted Council Improvements + risks R1–R22) **re-grounded** onto PrimeSoft so the module consumes platform engines by id and never re-authors workflow, RBAC, audit, notification, job, or migration plumbing.

> **Re-grounding rule (Foundation §1.1).** Where v2 invented a convention, contract, or shared entity that the
> real platform already owns, v3 **defers to the platform artefact** and records the override (see
> `## Amendments (v2 → v3)`). PrimeSoft **M11** already ships a versioned, access-controlled, encrypted document
> vault with letter templates/merge fields (`VAL-M11-MERGE`), retention classes (`VAL-M11-RETENTION`), signer
> sign-off (`VAL-M11-SIGNER`), the `DocumentGen.generate / sign-off` service (Platform §Y), `JOB-M11-BULKLTR/
> RETENTION/DISPOSAL/SIGNOFF-REMIND` (Foundation §4), `MSG-M11-*` (Foundation §5), and the **Document Admin**
> role + **Letter Admin** capability flag (RBAC §2.2/§4.3). G13 **aligns to that model** and adds only the
> **gov-specific** statutory controls as **EXTENSIONS**: WORM immutability, legal-hold with SoD, principal
> **security-clearance**, certified-true-copy, DPDPA erasure precedence lattice, and cryptographically anchored
> access audit. The government scope (Reconciliation §A) classes G13 as **REUSE-AS-IS / EXTEND**.

> **Attach/fetch contract (the platform document service).** G13 is the **single attach/fetch contract** every
> other government module **G01–G12** consumes. Modules do **not** store binaries; they attach documents through
> G13's frozen `:attach` / `:fetch?intent=` API and store only a `document_id` reference. G13 expresses this as a
> **platform-consistent document service** layered on PrimeSoft object storage + KMS envelope encryption,
> running document generation/sign-off on **P01 + W.1** via `DocumentGen.generate`, enforcing access via **P02**,
> and auditing every view/download via **P05**.

---

## 1. Executive Summary

### 1.1 Purpose

This BRD specifies the **Government Document Management and Secure Storage** service (G13) as a **public-sector
extension of PrimeSoft M11**. It provides a single, governed, encrypted, access-controlled store for every file
produced or consumed across the government HRMS suite: identity proofs for personal-detail changes (G02), leave
sanction scans and medical certificates (G03/G04), relieving/joining orders (G05), promotion/posting/seniority
orders (G06), training certificates (G07), APAR PDFs (G08), charge-sheets and inquiry exhibits (G09), payslips
and Form-16 (G10), Pension Payment Orders / PPOs and terminal-benefit dossiers (G11), and the statutory Service
Register page-images and certified copies (G12). Documents are stored once (within a single security domain),
versioned, classified, retained per statutory schedule, and made discoverable through permission-aware search —
while every view, download and print is audited via the **P05** dual-log substrate and every binary is encrypted
at rest (KMS envelope) and in transit (TLS 1.2+). The document-generation and sign-off flows run on the existing
**`DocumentGen.generate / sign-off`** service over **P01 WorkflowEngine + W.1**.

### 1.2 Business context

Public-sector HR is **document-centric and statutory**. Service registers, charge memos, pension orders and
seniority records have legal weight; they must be tamper-evident, retained for decades (some permanently),
disposed of only under an approved disposition schedule, and frozen on legal hold during litigation. PrimeSoft
M11 already governs ordinary HR documents (letters, policy library, vault, retention, sign-off, disposal). The
**government delta** is statutory custody: **WORM** immutability, **legal hold** with segregation of duties,
principal **security clearance**, **certified true copies**, an **erasure precedence lattice** reconciled with
the DPDPA right-to-erasure, and **cryptographically anchored** access audit. v3 delivers these as extensions
that run on the platform engines — DPDPA erasure-redaction follows the **P05 redaction-marker path + JOB-M11-
DISPOSAL**, tamper-evidence tracks the platform **OPEN-PLAT-03** hash-chain proposal rather than inventing a
parallel mechanism — aligned to OWASP ASVS, the India DPDP Act 2023, and the IT Act 2000 §3A (electronic
signatures).

### 1.3 Module objectives

1. **Re-anchor** the gov document surface onto the **PrimeSoft M11 vault** (no fork): reuse the vault,
   `letter_templates`/merge-fields, `signoff_transactions`, retention classes, and `DocumentGen.generate`.
2. Provide the **single canonical document service** (`documents` + frozen `:attach`/`:fetch` API) that
   **G01–G12** consume, layered on PrimeSoft object storage + KMS envelope encryption.
3. Enforce **encryption at rest** (envelope encryption via KMS, with a defined key-DR/escrow policy) and **in
   transit** (TLS 1.2+).
4. Provide **versioning** with optional (per-type) check-in/check-out, supersede, and immutable version history.
5. Enforce access via **P02** — RBAC v1.7 + org/relationship scope + **gov security-clearance** + classification
   PII-tier field masking + need-to-know, deny-by-default, mask-on-serialization.
6. Scan every upload for **malware**, validate file-type/size (`VAL-FILE`), and verify **integrity** by checksum.
7. Provide **OCR + permission-aware search**, sandboxed previews, and **domain-scoped deduplication** with no
   existence oracle.
8. Govern content lifecycle: **retention classes (reuse M11), legal hold (gov extension, SoD), approved
   disposition (`JOB-M11-RETENTION/DISPOSAL`)**, with **WORM** immutability for statutory documents and an
   explicit retention/hold/WORM/DPDP-erasure **precedence lattice**.
9. Provide **decade-durable e-signatures** (RFC-3161 + PAdES-LTV) via `DocumentGen` sign-off, watermarking,
   certified copies (v1), redaction (Phase 2), and DLP.
10. **Audit every access** (view/download/print/share) on the **P05** substrate, with gov-statutory hash-chain +
    external anchoring tracking **OPEN-PLAT-03**.

### 1.4 Scope summary

In scope: upload/ingestion; document types & metadata taxonomy (extending `letter_templates`/merge-field model);
classification/tagging; folders/cabinets; versioning; encryption/KMS (+ key-DR); access control via P02 (incl.
gov clearance); malware scanning; validation (`VAL-FILE`); sandboxed OCR/search; retention (reuse M11 retention
classes)/legal-hold (gov)/disposition (`JOB-M11-RETENTION/DISPOSAL`); e-signature (`DocumentGen` sign-off,
LTV-durable); watermarking/certified copies; access audit (P05 + anchoring); secure sharing/expiring links;
WORM; domain-scoped deduplication/integrity; previews; DLP; content lifecycle; orphan reaping; DPDPA
data-subject requests (P05 redaction path); and the provider-abstracted storage/AV/OCR/DLP/PKI layer.
**Phase 2 (fast-follow):** interactive redaction studio. **Out of scope:** business workflows that *use*
documents (those live in G01–G12), payroll/pension calculation, and end-user identity management (platform
`users`, P02/P04).

### 1.5 Key outcomes

- One governed source of truth for all gov HRMS content, **built on the existing M11 vault**, not a parallel store.
- Tamper-evident (P05 + OPEN-PLAT-03 anchored), encrypted, audited custody for statutory records.
- Faster retrieval (permission-aware search + previews) and lower storage cost (domain-scoped dedup).
- Defensible compliance posture: retention enforced, holds honoured (incl. future matches), erasure reconciled
  with statutory duty via the DPDPA redaction path, disposition certified, signatures verifiable for decades.

### 1.6 Plain-language narrative — "what happens when I drag a PDF in"

> *For non-engineers (records officers, clerks, approvers):*
>
> 1. **You drop a file** (or scan/photograph it). You pick the **document type** (e.g., "Charge Sheet") and fill
>    the short form it asks for (a **W.2 form** with `VAL-*` validation).
> 2. The system **checks it for viruses** and confirms the file is what it claims to be. If it is infected, it
>    is locked away and Security is told; you see only "blocked by security scan."
> 3. The clean file is **encrypted and stored once** in the M11 vault. If an identical file already exists *in
>    the same sensitivity level*, the system quietly reuses storage — you are never told whether a copy already
>    existed (so no one can probe for secret documents).
> 4. The system **reads the text** inside (OCR) so you can find it later — but you only ever see documents you
>    are cleared and permitted to see (enforced by **P02**, masked on serialization).
> 5. The document gets a **retention clock** (an M11 retention class) and, for statutory records, a **WORM lock**
>    (cannot be changed or deleted until its lawful time).
> 6. From then on, **every view, download or print is recorded** on the platform audit log (**P05**, DB-trigger).
>    Sharing, signing (via `DocumentGen` sign-off), certifying a true copy, placing a legal hold, and final
>    disposal all follow **P01** approval steps with a second person signing off where the law requires it
>    (segregation of duties enforced by P01/P02, not re-coded here).

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Area | Capability | Primary FR(s) | Platform anchor |
|------|-----------|---------------|-----------------|
| Ingestion | Single/bulk/drag-drop upload, scanner ingestion, mobile capture | FR-G13-001 | M11 vault + `VAL-FILE`; X.1 |
| Taxonomy | Document types, metadata schema, classification & tagging, signature/checkout policy | FR-G13-002 | extends `letter_templates`/merge-fields; `VAL-M11-MERGE`; W.2 |
| Structure | Folders/cabinets, module-context linking, **attach API** | FR-G13-003 | platform document service |
| Versioning | Version history, optional check-in/check-out, supersede | FR-G13-004 | M11 vault versions |
| Cryptography | Envelope encryption (KMS), TLS, key rotation, key-DR/escrow | FR-G13-005 | KMS; P04 integration creds |
| Access control | RBAC v1.7 + relationship + **clearance** + classification + need-to-know; record/field-level | FR-G13-006 | **P02** Authorization.check; RBAC §3.9 |
| Safety | Malware scan, file-type/size validation, quarantine, render sandboxing | FR-G13-007 | `VAL-FILE`; ScanProvider |
| Discovery | Sandboxed OCR, permission-aware search, secured index, faceted filters | FR-G13-008 | P02 post-filter |
| Lifecycle | Retention (reuse M11 classes), legal hold (gov SoD), event-driven disposition | FR-G13-009 | `VAL-M11-RETENTION`; `JOB-M11-RETENTION/DISPOSAL`; P01 |
| Signing | E-signature & digital signing (PAdES-LTV + RFC-3161 TSA) | FR-G13-010 | **`DocumentGen` sign-off**; `VAL-M11-SIGNER`; `JOB-M11-SIGNOFF-REMIND`; P01/W.1 |
| Rendition | Watermarking & certified copies (v1) | FR-G13-011 | M11 doc-gen + WORM extension |
| Audit | View/download/print audit + compliance reporting | FR-G13-012 | **P05** dual log (DB-trigger) |
| Sharing | Secure internal/external sharing, expiring links, anti-brute-force | FR-G13-013 | platform service; X.2 |
| Immutability | WORM storage for statutory documents | FR-G13-014 | **gov EXTENSION** (M11 lacks WORM) |
| Integrity | Domain-scoped dedup, checksums, sandboxed thumbnails/previews | FR-G13-015 | object storage |
| Governance | DLP, content lifecycle, provider-abstracted storage/AV/OCR/DLP/PKI, attach/fetch | FR-G13-016 | platform document service |
| Clearance | Principal security-clearance assignment & lifecycle | FR-G13-017 | **gov EXTENSION**; P02 reads it; P01 maker-checker |
| Privacy | DPDP data-subject requests & erasure precedence lattice | FR-G13-018 | **P05 redaction-marker path + JOB-M11-DISPOSAL**; `consent_records` |
| Hygiene | Orphaned-document lifecycle (orphan reaper) | FR-G13-019 | `JOB-G13-ORPHAN` (X.1) |
| Tamper-evidence | Audit hash-chain integrity & external anchoring | FR-G13-020 | **tracks OPEN-PLAT-03** (P05 hash-chain) |
| Rendition (Phase 2) | Interactive redaction studio (fast-follow) | FR-G13-021 | M11 doc-gen + sandbox |

### 2.2 Common Capabilities (inherited from the platform, not re-authored)

- **`tenant_id` (non-null) and `entity_id` (where entity-scoped) on every G13 table**; scoping enforced at the
  **data/persistence layer** (Platform §0.1) — an unscoped query is rejected, never defaulted to "all".
- UUIDv4 PKs; separate human-readable business keys (`doc_no`).
- **Audit is the platform P05 dual log** (`audit_log` + `security_audit_log`), captured by **DB-trigger** on
  every INSERT/UPDATE/soft-DELETE — G13 does **not** define its own mutation `audit_log`. Gov-statutory access
  audit (view/download/print) and tamper-evidence are the gov extension (FR-G13-012/020), tracking OPEN-PLAT-03.
- UPPER_SNAKE_CASE enums (§5.5); UTC storage; `DD-MMM-YYYY` display; user-locale rendering.
- **Cursor pagination only** (`?limit=` default 25, max 100, `cursor=`, response `next_cursor`); offset paging
  not used (Foundation §1).
- **Maker-checker is a configured P01 flow (W.1)** with SoD enforced by P01/P02 — not re-coded per action —
  for disposition, **legal-hold placement and release**, classification downgrade, clearance grant, DSR decision.
- **Canonical error envelope** `{ error: { code, message, field, details } }` + **`X-Correlation-Id` header**
  (Foundation §1; not a body `requestId`).
- All content-processing engines (AV, OCR, DLP, PKI/eSign) and storage sit behind **provider interfaces**.

### 2.3 Boundaries & integration points

- **G01 Employee Profile (PrimeSoft M01 master)** — documents linked to `employee_id` context; photo/ID proofs;
  emits `EMPLOYEE_RETIRE`/`EMPLOYEE_MERGE` lifecycle events (anchor recompute) via the platform outbox.
- **G02 Personal Details** — proof documents for change requests; the `E·AR` "Request change → approval" flow
  (P01, RBAC §7) routes the sensitive-change; G13 stores the proof.
- **G03/G04 Leave/SR** — medical certificates, sanction orders posted to the **G12 SR ledger**.
- **G05/G06 Transfer/Promotion** — relieving/joining/promotion/seniority order PDFs (often `DocumentGen`-generated).
- **G07 Training** — certificates, course material.
- **G08 Appraisal (PrimeSoft M09)** — APAR/PDF, calibration evidence.
- **G09 Disciplinary** — charge-sheets, inquiry exhibits, sealed PI reports (confidential vault); emits
  `CASE_CLOSE` lifecycle events.
- **G10/G11 Payroll/Pension** — payslips, Form-16, PPO, terminal-benefit dossiers (long retention); G11 emits
  `EMPLOYEE_RETIRE` confirmation.
- **G12 Digital SR** — page-images, certified true copies, WORM statutory records (G12 ledger runs on P05).
- **G14 Dashboard (PrimeSoft M16 Analytics)** — reads document compliance metrics (read-only, `analytics.*`).
- **Platform** — P01 WorkflowEngine, P02 Authorization.check, P04 integration credentials, **P05 dual audit**,
  P06 migration, X.1 jobs, X.2 notifications, X.3 integration; **`DocumentGen.generate / sign-off`** (Platform
  §Y); `users`, `roles`, `org_units`, `consent_records`, `notifications`; KMS (+ key-DR), object storage,
  antivirus, OCR, signing/PKI, RFC-3161 TSA.

### 2.4 Explicit non-goals

- G13 does not implement module-specific business workflows (e.g., disciplinary due-process) — it stores their
  documents and runs only the **document** workflows (generation, sign-off, lifecycle) on P01.
- G13 does not author content (no word processor); it ingests and renders. (Check-out/check-in is **optional per
  type** — FR-G13-004.) Letter authoring uses the existing M11 `letter_templates` model.
- G13 does not own user identity/authentication (platform `users`, P02/P04) — but it **does** own the
  gov **security-clearance** attribute attached to a principal (FR-G13-017), which P02 reads.
- G13 does not compute payroll/pension; it stores their outputs.
- G13 does not re-author workflow, RBAC, audit, notification, job-runner, or migration engines — it **consumes**
  P01, P02, P05, P06, X.1–X.3 by id.

---

## 3. Roles & Permissions

### 3.1 Role mapping to RBAC v1.7 (additions, not a parallel scheme)

Government statutory actors are expressed as **RBAC v1.7 roles + capability flags ADDED to the taxonomy**
(`PLATFORM_FOUNDATION.md` §6.6; Reconciliation §C), registered in RBAC §2.2/§4.3 with grant authority + audit.
**SoD (maker ≠ checker, no self-approval) is enforced by P01/P02**, not re-implemented here. The existing
PrimeSoft **Document Admin** role and **Letter Admin** capability flag are the baseline; G13 adds records/
clearance/legal-hold/DPO roles for statutory custody.

| G13 actor | Express as (RBAC v1.7) | Why distinct (SoD) |
|------|-------------|--------------------|
| **Employee (Self-Service)** | existing **Employee** role (`document.*` own-scope, RBAC §2.4) | End-user persona; views/downloads own permitted docs; e-signs assigned docs. Cannot manage taxonomy/retention. |
| **Document Owner** | **Employee** + optional "manages a shared cabinet" entitlement | Record-scoped management of own non-statutory docs; same human as Employee, different scope (consolidation note below). |
| **Uploader (Module Service)** | platform **service principal** (machine), per-module token | Machine principal attaching on behalf of a G01–G12 workflow; no human read rights. |
| **DMS Librarian** | existing **Document Admin** role (RBAC §2.2) | The **maker** for taxonomy + lifecycle; manages types, folders, classification *upgrades*, retention *assignment*; **proposes** disposition. Cannot approve own proposals. |
| **Records Manager (Custodian)** | **new entity-scoped role** `records_manager` (added, RBAC §2.2) + **Letter Admin** flag where it certifies generated copies | The **checker** for lifecycle; approves disposition, manages WORM, certifies true copies. maker ≠ checker enforced by P01. |
| **Legal Hold Administrator** | **new role** `legal_hold_admin` (added) | **Places** holds; manages e-discovery exports. Separated from the custodian who can destroy. |
| **Legal Hold Approver** | **new role** `legal_hold_approver` (added) | **Approves** high-value placement and **all** releases (dual control). Release re-enables destruction → second authority. |
| **Security / DLP Officer** | **new role** `security_dlp_officer` (added) + capability flags | Classification *downgrade* approval, DLP rules, quarantine release, key policy, **clearance grants**, anti-brute-force unlocks. Holds the "lower the guard" powers. |
| **Data Protection Officer (DPO)** | map to platform **DPO / Org-Admin audit access** (RBAC §6.6; P05 `Audit.query`) + entitlement | Adjudicates DPDP data-subject requests; records legal-basis exemptions. Privacy authority, separate from records custody. |
| **Auditor (read-only)** | **map to existing** Org-Admin audit read + read-only entitlement (RBAC §3.2; P05 query) | Read-only by construction — do **not** invent a parallel write-capable "Auditor" role (Reconciliation §C). |
| **System Administrator** | **map to** Org Admin / Platform Super Admin (RBAC §2.1) | Storage/KMS/scanner/OCR config; **cannot read CONFIDENTIAL+ content** (break-glass only, dual-control, audited to `security_audit_log`). Infrastructure power without content power. |

> **Consolidation note (usability):** *Document Owner* and *Employee (Self-Service)* are the **same human
> persona** acting on, respectively, documents they manage and their own identity records; the platform presents
> them as one **Employee** profile (Foundation §6 menu "Documents") with an optional "manages a shared cabinet"
> flag. *Librarian* (Document Admin, maker) and *Records Manager* (checker) remain distinct to preserve
> disposition SoD — enforced by P01.

> **Segregation of duties (P01/P02-enforced):** disposition approver ≠ proposing Librarian; legal-hold placer ≠
> the approver who releases it; clearance grantee ≠ grantor; no principal may both downgrade a classification and
> access the downgraded record in the same transaction; the DPO who exempts an erasure ≠ the custodian who would
> execute it. P02 multi-role **intersection** (more restrictive wins) and P01 no-self-approval enforce this.

### 3.2 Permission matrix (C=Create/Upload, R=Read/View, U=Update metadata, D=Download, P=Print, A=Approve/Decide, X=No access)

Action-level rights map to RBAC v1.7 four-layer model (Module · Field/Section · Data/row · Action: View · Edit ·
Approve/Reject · Download · Admin). Field masking is applied by **P02 on serialization** (RBAC §3.9), so an
over-broad query cannot leak a masked field.

| Capability | Doc Owner | Uploader | Librarian (Doc Admin) | Records Mgr | LH Admin | LH Approver | Security/DLP | DPO | Auditor | Sys Admin | Employee |
|------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Upload document | C | C | C | C | X | X | X | X | X | X | C (own) |
| View document (per clearance, P02) | R | R | R | R | R | R | R | R | R | X | R (own) |
| Download / Print | D/P | D | D/P | D/P | D | D | D | D | D | X | D/P (own) |
| Update metadata/tags | U | U | U | U | X | X | U | X | X | X | U (own, limited) |
| New version / check-in-out | C/U | C/U | C/U | C/U | X | X | X | X | X | X | C/U (own) |
| Manage document types/taxonomy | X | X | C/U | R | X | X | R | X | R | X | X |
| Classify (upgrade) | X | U | U | U | X | X | A | X | R | X | X |
| Reclassify (downgrade) | X | X | C (propose) | R | X | X | A | X | R | X | X |
| Assign / manage retention class | X | X | C/U | A | X | X | R | R | R | X | X |
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
| Read access-audit trail (P05) | R (own) | X | R | R | R | R | R | R | R | X | R (own) |

### 3.3 Field-level & record-level confidentiality rules (enforced by P02)

- **Clearance gates visibility — and clearance is a real, stored gov attribute read by P02.** A principal sees a
  document only if `effective_clearance_level ≥ document.classification` **AND** an ACL/relationship grant exists
  (deny-by-default). `effective_clearance_level` is read from the gov **`security_clearances`** entity
  (FR-G13-017), defaulting to `INTERNAL` if no active clearance exists. Classifications:
  `PUBLIC < INTERNAL < CONFIDENTIAL < SECRET < TOP_SECRET`. Clearance satisfies only the classification
  dimension; P02 still applies role grant → multi-role intersection → entitlement → **PII Protection Ceiling** →
  data-scope filter → field mask on serialization (Platform §P02).
- **PII tiers / masking are RBAC v1.7 / P02, not a parallel model.** Document fields that surface government
  identifiers (Aadhaar/PAN), bank, or DOB inherit Tier-1/Tier-2 masking (RBAC §3.9, §7 `V/M/H/E/AR`); `E·AR`
  fields route a change through P01, never a direct write.
- **TOP_SECRET — justification.** Retained for genuinely compartmented records (sealed CVC/vigilance PI reports,
  national-security-adjacent matters); restricted to system-seeded statutory types, mandatory dual-approver
  clearance + alerting; never hand-applied by a Librarian.
- **Sealed records** (e.g., G09 PI reports, vigilance) carry `is_sealed=true` and are invisible to the subject
  employee even when they own related records (P02 returns 404-style "no existence" per §P02).
- **Need-to-know** restricts CONFIDENTIAL+ to principals on the document's ACL or in the originating P01 workflow.
- **Auditor** reads per clearance via P05 `Audit.query`, cannot alter; **Sys Admin** cannot read CONFIDENTIAL+
  content except break-glass (dual-control, audited to `security_audit_log`, rate-limited).

---

## 4. Shared Application Foundation (platform-grounded)

Inherits the **PrimeSoft platform** contracts wholesale (`PLATFORM_FOUNDATION.md`); the invented
`SHARED_FOUNDATION.md` conventions are overridden per Reconciliation §C.

- **Architecture:** physical stack is an engineering choice within the platform's logical architecture
  (Reconciliation §C); G13 specifies behaviour/NFR, not framework. REST `/api/v1`; PostgreSQL for metadata;
  **object storage** (gov cloud blob) for binaries encrypted at rest; KMS for envelope keys; deployed at the
  CGG Data Centre / gov cloud (Standalone/Group-Company deployment model, Vision §1.4).
- **Auth (P02/§3.1):** bearer-token (JWT) session carrying resolved roles + tenant/entity scope; never raw
  permissions — resolved per request by **P02**. Google SSO / username-password; **MFA enforced by default for
  high-privilege roles** (Records Manager, Legal Hold Approver, Security/DLP Officer, DPO).
- **Canonical error envelope (Foundation §1):** `{ "error": { "code": "...", "message": "...", "field": "...",
  "details": { } } }`; correlation id in the **`X-Correlation-Id` response header**, not a body field.
- **Standard error codes (Foundation §1):** `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`,
  `NOT_FOUND(404)`, `CONFLICT(409)`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)` + module
  codes (§10.3). No 503 in the standard table — upstream-engine failures map via X.3 to 500/`ERR-LOADFAIL`.
- **API conventions (Foundation §1):** `/api/v1`; **Idempotency-Key** on all unsafe POSTs that create a
  transaction (24h replay returns the original); **cursor pagination** (`limit` 25/100 + `cursor`/`next_cursor`);
  `?sort=field:asc|desc`; `X-Correlation-Id`; effective-dating via `effective_from` (staged, not live).
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, **P05 dual-log audit**, DPDP 2023, IT Act
  §3A signatures, statutory retention.
- **NFR baseline (Vision §2.9; BRD §7 — overrides invented NFR):** standard API **p95 < 500 ms @ 300 concurrent**;
  read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; **uptime 99.5%/month**; **RTO < 4 h,
  RPO < 1 h**; audit 100% mutation capture; **WCAG 2.1 AA**; responsive 375/768/1280 px, touch ≥ 44×44; soft
  delete only (no hard delete).

**Platform services consumed (by id, never re-authored):** **P01** WorkflowEngine (doc-gen, sign-off,
maker-checker), **P02** Authorization.check (access + field masking), **P04** integration credentials (KMS/AV/
OCR/PKI/TSA), **P05** dual audit log (view/download capture + DPDPA redaction marker), **P06** migration (legacy
document ETL+V), **X.1** job runner (`JOB-M11-*` reuse + `JOB-G13-*` gov jobs), **X.2** notifications
(`MSG-M11-*` reuse + `MSG-G13-*`), **X.3** integration framework, **W.1** process-flow definitions (document-
generation/sign-off = 23 configured doc-gen stages), **W.2** forms, **W.3** notification config, and the
**`DocumentGen.generate / sign-off`** service (Platform §Y). All provider-abstracted (storage/AV/OCR/DLP/PKI).

---

## Alignment with PrimeSoft Platform

This section maps every G13 functional requirement to the platform service(s) it runs on and names the
`GAP (gov-specific)` extensions G13 authors. **No engine is re-implemented.**

### A. Entity reconciliation with PrimeSoft M11 (no fork)

| G13 entity (v3) | PrimeSoft M11 / platform anchor | Relationship |
|---|---|---|
| `documents` | **M11 document vault** master record | **REUSE/EXTEND** — adds gov columns (`classification`, `security_domain`, `is_worm`, `is_sealed`, `legal_hold_count`, `anchor_confirmed`, `dpdp_erasure_state`) + `tenant_id`/`entity_id` |
| `document_versions` / `storage_objects` | M11 vault version + blob descriptor | REUSE/EXTEND — adds `security_domain`, `key_scope`, `dek_shared`, `worm_retain_until` |
| `document_types` | **`letter_templates`** + merge-field model (`VAL-M11-MERGE`) | EXTEND — adds `allowed_signature_types`, `checkout_mode`, `default_security_domain`, WORM/TOP_SECRET flags |
| `retention_policies` / `retention_assignments` | **M11 retention classes** (`VAL-M11-RETENTION`) | REUSE/EXTEND — adds event-confirmed anchor + `requires_confirmed_anchor` |
| `signature_requests` / `signatures` | **`signoff_transactions`** + `DocumentGen` sign-off (`VAL-M11-SIGNER`) | REUSE/EXTEND — adds gov LTV/legal-basis |
| `disposition_records` | M11 disposal (`JOB-M11-DISPOSAL`) | REUSE/EXTEND — adds certificate + tombstone + crypto-shred guard |
| `document_audit` (access events) | **P05** dual log (`audit_log`/`security_audit_log`, DB-trigger) | RUNS ON P05; gov hash-chain + anchor tracks **OPEN-PLAT-03** |
| `document_acls` / `folders` / `document_links` / `document_tags` / `document_shares` / `checkout_locks` / `scan_results` / `dlp_findings` | M11 vault structures + platform document service | REUSE/EXTEND |
| **`security_clearances`** | — | **GAP (gov-specific)** — read by P02 |
| **`legal_holds` / `legal_hold_items` / `hold_notices`** | — | **GAP (gov-specific)** — runs on P01 (SoD) + P05 |
| **`data_subject_requests`** | `consent_records` + DPDPA erasure (Vision §2.7) | **GAP (gov-specific)** — uses **P05 redaction-marker path + JOB-M11-DISPOSAL** |
| **`audit_anchors`** | P05 OPEN-PLAT-03 hash-chain proposal | **GAP (gov-specific)** — statutory tamper-evidence |
| **`lifecycle_event_inbox`** | platform outbox/event bus | **GAP (gov-specific)** — anchor recompute |
| **WORM** (`storage_objects.storage_class`, `worm_retain_until`) | — (M11 lacks WORM) | **GAP (gov-specific)** |
| `signature_ltv_artifacts` | — | **GAP (gov-specific)** — IT Act §3A LTV durability |

### B. FR → platform service map

| FR | Runs on / consumes | GAP (gov-specific) authored |
|----|--------------------|------------------------------|
| FR-G13-001 Upload & Ingestion | M11 vault ingest; `VAL-FILE`; ScanProvider; X.1 | domain-scoped dedup, anti-oracle |
| FR-G13-002 Types/Taxonomy/Signature-Checkout | extends `letter_templates`/`VAL-M11-MERGE`; W.2 forms; P01 (reclassify maker-checker) | classification ladder, clearance-aware policy |
| FR-G13-003 Folders & Attach Contract | platform document service; G01–G12 consumers | attach/fetch contract, link_count/orphan |
| FR-G13-004 Versioning & Check-in/out | M11 vault versions; ScanProvider | optional `checkout_mode` |
| FR-G13-005 Encryption (KMS) & Key-DR | KMS via P04 integration creds; TLS at gateway | per-domain CMK, key-DR/escrow runbook, break-glass |
| FR-G13-006 Access Control | **P02** Authorization.check; RBAC §3.9 PII masking | clearance dimension, sealed hiding |
| FR-G13-007 Malware Scan & Sandboxing | `VAL-FILE`; ScanProvider; X.1 | archive limits, render sandbox |
| FR-G13-008 OCR & Secured Search | OcrProvider/IndexProvider; **P02** post-filter | SECRET+ full-text exclusion |
| FR-G13-009 Retention/Hold/Disposition | **`VAL-M11-RETENTION`**; **`JOB-M11-RETENTION` / `JOB-M11-DISPOSAL`**; **P01** maker-checker; outbox | legal hold + SoD, future-match, event anchor |
| FR-G13-010 E-Signature (PAdES-LTV) | **`DocumentGen.generate / sign-off`**; `VAL-M11-SIGNER`; `JOB-M11-SIGNOFF-REMIND`; P01/W.1 (23 doc-gen stages) | RFC-3161 + PAdES-LTV durability |
| FR-G13-011 Watermark & Certified Copies | `DocumentGen` rendition; WORM extension | certified-true-copy, mandatory watermark |
| FR-G13-012 Access Audit & Compliance | **P05** dual log (DB-trigger); `Audit.query/export` | view/download/print access audit |
| FR-G13-013 Secure Sharing | platform document service; X.2; RateLimiter | external link, anti-brute-force |
| FR-G13-014 WORM Storage | object-lock storage | **entire FR is gov-specific** (M11 lacks WORM) |
| FR-G13-015 Dedup/Integrity/Preview | object storage; sandboxed renderer | domain-scoped dedup, integrity scan |
| FR-G13-016 DLP/Lifecycle/Providers/Attach-Fetch | DlpProvider; provider abstraction; audited fetch proxy | VIEW/DOWNLOAD split, intent contract |
| FR-G13-017 Principal Clearance | **P01** maker-checker; **P02** consumes; X.2 | the clearance model itself |
| FR-G13-018 DPDP DSR & Erasure Lattice | **P05 redaction-marker** path; **`JOB-M11-DISPOSAL`**; `consent_records`; P01 dual-control | precedence lattice |
| FR-G13-019 Orphan Reaper | `JOB-G13-ORPHAN` (X.1) | orphan lifecycle |
| FR-G13-020 Audit Chain & Anchoring | **tracks OPEN-PLAT-03** (P05 hash-chain → WORM) | external anchoring job |
| FR-G13-021 Redaction (Phase 2) | `DocumentGen` rendition; sandbox; OCR | irreversible redaction |

### C. Validation, jobs, messages, errors — reuse vs author

- **Reuse (cite, never restate):** `VAL-FILE`, `VAL-M11-MERGE`, `VAL-M11-RETENTION`, `VAL-M11-SIGNER`,
  `VAL-CONSENT`, `VAL-COMMENT`, `VAL-ENUM`, `VAL-DATE`, `VAL-EFFECTIVE`, `VAL-AADHAAR`, `VAL-PAN`, `VAL-IFSC`;
  `JOB-M11-BULKLTR`, `JOB-M11-RETENTION`, `JOB-M11-DISPOSAL`, `JOB-M11-SIGNOFF-REMIND`; `MSG-M11-*` (policy-
  published, letter-issued, sign-off assigned/remind/declined, disposal-due); shared `ERR-FORBIDDEN`,
  `ERR-LOADFAIL`, `ERR-PRECOND`, `ERR-DUP-INSTANCE`, `ERR-REASON-REQ`, `MSG-SYS-JOBFAIL`.
- **Author as gov-specific (register in Foundation §2/§4/§5):** `VAL-G13-WORM` (WORM extend-only, no shorten),
  `VAL-G13-CLEARANCE` (maker≠checker, level legality), `VAL-G13-HOLD-SOD` (hold release dual-control),
  `VAL-G13-DEDUP-DOMAIN` (domain-scoped dedup, no cross-classification), `VAL-G13-FETCH-INTENT` (intent required),
  `VAL-G13-LATTICE` (DPDP precedence), `VAL-G13-LTV` (statutory LTV required), `VAL-G13-SIGMETHOD` (allowed
  signature method); `JOB-G13-ANCHOR` (audit anchoring), `JOB-G13-CHAINVERIFY`, `JOB-G13-HOLDEVAL` (continuous
  hold eval), `JOB-G13-ORPHAN`, `JOB-G13-INTEGRITY`, `JOB-G13-CLEARANCE-RECERT`, `JOB-G13-KEYROTATE`;
  `MSG-G13-*` (quarantine, hold placed/released, clearance, DSR, integrity/chain alerts, key-DR posture);
  `ERR-G13-*` module error codes (§10.3).

---

## Amendments (v2 → v3: platform re-grounding)

| # | v2 (invented / standalone) | v3 (platform-grounded) | Where |
|---|----------------------------|------------------------|-------|
| 1 | Module code `M13`, FRs `FR-M13-*`, role `M13-DMS` | **`G13`**, **`FR-G13-*`**, `G13-DMS`; consuming modules `G01–G12` | Throughout (Reconciliation §B) |
| 2 | `documents` as a fresh canonical store "owned here" | **Re-anchored on the PrimeSoft M11 vault**; G13 extends, does not fork (`letter_templates`, vault, `signoff_transactions`, retention classes) | §1, Alignment §A |
| 3 | Custom `audit_log` + bespoke `document_audit` immutability by DB-grant | **P05 dual log** (`audit_log` + `security_audit_log`), **DB-trigger** capture; gov access-audit + hash-chain **tracks OPEN-PLAT-03** | §2.2, FR-012/020, §4 |
| 4 | Invented error codes (`VALIDATION_ERROR 400`, `AUTH_REQUIRED 401`, `UPSTREAM_UNAVAILABLE 503`) + body `requestId` | **Platform 8-code table** (`VALIDATION_FAILED 422`, `UNAUTHENTICATED 401`, `PRECONDITION_FAILED 412`, `INTERNAL 500`; no 503) + `{…,details}` + **`X-Correlation-Id` header** | §4, §10.2/10.3 |
| 5 | Bespoke maker-checker per action | **Configured P01 flows (W.1)** with SoD enforced by P01/P02 | §2.2, FR-009/017/018 |
| 6 | E-signature as a standalone signing service | **`DocumentGen.generate / sign-off`** + `VAL-M11-SIGNER` + `JOB-M11-SIGNOFF-REMIND` + 23 W.1 doc-gen stages; LTV is the gov extension | FR-010 |
| 7 | Standalone retention + disposal | **M11 retention classes** (`VAL-M11-RETENTION`) + **`JOB-M11-RETENTION` / `JOB-M11-DISPOSAL`**; event anchor is the gov add | FR-009 |
| 8 | DPDP erasure as a custom crypto-shred pipeline | **P05 right-to-erasure redaction-marker path + `JOB-M11-DISPOSAL`**; lattice + crypto-shred guard are the gov add | FR-018 |
| 9 | Invented role list (Librarian, Records Mgr, etc.) | **RBAC v1.7 roles + capability flags** — Document Admin / Letter Admin baseline + new gov roles registered as ADDITIONS; Auditor→Org-Admin read, Sys Admin→Org/Platform Admin | §3.1, Reconciliation §C |
| 10 | Access control engine authored in-module | **P02 Authorization.check** (deny-by-default → role → intersection → entitlement → flag → **PII ceiling** → scope → field mask on serialization); clearance is one dimension P02 reads | §3.3, FR-006 |
| 11 | Multi-tenancy omitted | **`tenant_id`/`entity_id` non-null on every G13 entity**; data-layer scoping; unscoped query rejected | §2.2, §5 |
| 12 | Pagination "page/limit, max 100" | **Cursor pagination only** (`limit` 25/100, `cursor`, `next_cursor`) | §2.2, §10.1 |
| 13 | NFR 99.9% / RPO ≤ 15 min | **Platform baseline 99.5% / RPO < 1 h / RTO < 4 h / p95 < 500 ms / WCAG 2.1 AA** | §4, §11 |
| 14 | Notifications authored in-module | **X.2 + W.3**, reuse `MSG-M11-*`, author `MSG-G13-*`; statutory notices mandatory/non-suppressible | §13 |
| 15 | Jobs authored in-module | **X.1 runner**; reuse `JOB-M11-BULKLTR/RETENTION/DISPOSAL/SIGNOFF-REMIND`; author `JOB-G13-*` | §2.1, Alignment §C |
| 16 | Validation rules restated | **Cite `VAL-FILE`/`VAL-M11-MERGE/RETENTION/SIGNER`/`VAL-CONSENT`**; author only `VAL-G13-*` | Alignment §C |
| 17 | Migration undefined / custom | **P06 ETL+V** (3 dry runs, waves, `migration_runs`, `<gov>_source_id` traceability) | §15 |
| 18 | New sections required by §6.6/§E | Added **`## Alignment with PrimeSoft Platform`** (FR→service map) and this amendments table | here |
| 19 | All 21 v2 council improvements + risks R1–R22 | **Preserved verbatim in rigor**, re-expressed on platform engines (see §16.5) | §16.5, throughout |

> **Preservation guarantee.** Every v2 entity, FR, acceptance criterion, business rule, data-integrity rule,
> state table, error mode, NFR, notification, report, migration step, and council mitigation (R1–R22) is retained
> in v3 — only re-grounded onto the platform. The v1→v2 amendments table is carried forward unchanged below.

---

## Amendments (v1 → v2) — carried forward unchanged

| # | Adopted improvement (council) | Risk(s) | Where/how incorporated |
|---|-------------------------------|---------|------------------------|
| 1 | Define `clearance_level` | R3 | E21 `security_clearances`; FR-G13-017; §3.3 reads `effective_clearance_level` (now via P02) |
| 2 | Resolve dedup vs key-separation | R1, R9 | `storage_objects.security_domain/key_scope/dek_shared`; DI-6; FR-005/015 |
| 3 | Eliminate dedup oracle | R9 | FR-015 (HMAC-keyed dedup index, no signal); FR-001; DI-6 |
| 4 | Fix the fetch contract (VIEW vs DOWNLOAD) | R2 | FR-016 `:fetch?intent=`; audited proxy render; §10.4; enum `fetch_intent` |
| 5 | Decade-durable signatures (RFC-3161 + PAdES-LTV) | R4 | E26 `signature_ltv_artifacts`; FR-010; on `DocumentGen` sign-off |
| 6 | Cryptographically anchor the audit log | R5 | E12/E23; FR-020; DI-3 — now tracks OPEN-PLAT-03 |
| 7 | Restrict signature methods by document type | legal | `document_types.allowed_signature_types`; FR-002/010 |
| 8 | KMS key-DR/escrow policy | R6 | FR-005; NFR Availability; Appendix E |
| 9 | Secure the search index | R7 | FR-008 (encrypted, access-scoped; SECRET+ excluded) |
| 10 | DPDP precedence lattice | R8 | E22 `data_subject_requests`; FR-018; DI-15 |
| 11 | SoD on legal-hold release | R10 | E10 release fields; FR-009; §12.3 — on P01 |
| 12 | Holds capture future matches | R11 | E24 `hold_notices`; FR-009 (continuous-eval `JOB-G13-HOLDEVAL`) |
| 13 | Event-driven anchor recompute | R12 | E25 `lifecycle_event_inbox`; FR-009; outbox subscription |
| 14 | Provider-abstract all four engines | R13 | §4 provider interfaces; FR-016 LLD |
| 15 | Freeze + stub attach/fetch contract day one | R14 | §15.0; §16.2 step 0; Appendix F |
| 16 | Orphaned-document lifecycle | R15 | FR-G13-019; `document_status` ORPHANED; `JOB-G13-ORPHAN` |
| 17 | Anti-brute-force controls | R16 | `document_shares.failed_attempt_count/locked_until`; FR-013/005 |
| 18 | Sandbox/resource-limit render workers | R17 | FR-007/008/015; error `ERR-G13-RENDER_RESOURCE_LIMIT` |
| 19 | Phase scope; optional check-out; justify TOP_SECRET | R13, R22 | FR-011 certified copies v1 + FR-021 redaction Phase 2; `checkout_mode`; §3.3 |
| 20 | Harden migration/restore/residency/notifications | R18–R21 | §15 (P06 gated migration); NFR residency; §13 sealed-notice suppression |
| 21 | Plain-language narrative + role clarity | usability | §1.6; §3.1 role mapping notes |

---

## Amendments (v3 → v3.1: cross-module remediation)

Applies the authoritative cross-module remediation decisions (`docs/review/REMEDIATION.md` D3; integration review
`docs/review/R4-id-registry-collisions.md`, Findings 2 & 3). **Surgical edits only** — no FR, entity, rule, state
table, or NFR was changed; only error-code identifiers were namespaced and the collision resolved.

| # | R-ref | v3 (as authored) | v3.1 (remediated) | Where |
|---|-------|------------------|-------------------|-------|
| A | R4 #2 (High) | ~34 module error codes defined as bare `UPPER_SNAKE` strings (e.g. `MALWARE_DETECTED`, `WORM_IMMUTABLE`, `SOD_VIOLATION`) in live FR failure-handling, API examples, and the §10.3 catalog | **All module codes namespaced `ERR-G13-<NAME>`** (96 occurrences across FR/API/§10.3), each mapped onto one of the 8 standard HTTP codes; §10.3 is the canonical `ERR-G13-* → HTTP → message id` mapping table | FR-G13-001…021 failure cells, §10.2–10.4 examples, §10.3 catalog |
| B | R4 #3 (Med) | bare `SIGNATURE_INVALID` — string-identical to G12's order-signature code with a divergent meaning (cross-module collision) | Namespaced **`ERR-G13-SIGNATURE_INVALID`**; explicit note that **G12 owns `ERR-G12-…`** and neither module emits the other's namespace | §10.3 catalog + footnote; FR-G13-010 |
| C | R4 #2/§4 | Standard 8-code table retained; `VALIDATION_FAILED`/`FORBIDDEN`/`CONFLICT`/etc. used as HTTP-status codes alongside `ERR-G13-*` | Unchanged — confirmed **no invented `VALIDATION_ERROR`/`AUTH_REQUIRED`/`503`/`UPSTREAM_UNAVAILABLE`** leaks in any live section (those remain only in the v2→v3 override table, row 4); former-upstream failures already map to `INTERNAL 500` via X.3 | §4, §10.1, §10.3 |
| D | R4 §A.2/§C | Shared platform ids `VAL-M11-MERGE/RETENTION/SIGNER`, `MSG-M11-*`, `JOB-M11-BULKLTR/RETENTION/DISPOSAL/SIGNOFF-REMIND` | Unchanged — **confirmed cited, never redefined** (Alignment §C "Reuse (cite, never restate)") | Alignment §C, §2.1 |

> **Preservation guarantee (v3.1).** This amendment is an identifier-hygiene pass only. Every functional
> requirement, acceptance criterion, business rule, data-integrity rule, state transition, NFR, and council
> mitigation (R1–R22) is retained verbatim; only the spelling of module error-code identifiers changed.

---

## 5. Holistic Data Model

> **Tenancy (Platform §0.1, Reconciliation §C).** **Every G13 entity below carries `tenant_id` (non-nullable)
> and, where entity-scoped, `entity_id`.** These are omitted from each field table for brevity but are mandatory;
> all access is scoped at the persistence layer and an unscoped query is rejected. `audit_log` /
> `security_audit_log` / `workflows` / `workflow_instances` / `workflow_actions` / `notifications` /
> `consent_records` / `integration_credentials` / `migration_runs` are **platform-provided** (P05/P01/P04/P06,
> X.2) and are **referenced, never redefined**.

### 5.1 Entity inventory

| # | Entity | Type | Anchor | Purpose |
|---|--------|------|--------|---------|
| E1 | `documents` | **Vault master (REUSE/EXTEND M11)** | M11 vault | Master document/object metadata referenced by all G01–G12 modules |
| E2 | `document_versions` | REUSE/EXTEND M11 | M11 vault | Immutable version history of each document's content |
| E3 | `document_types` | EXTEND (`letter_templates`) | M11 | Type taxonomy + metadata schema + default retention class/classification + signature/checkout policy |
| E4 | `folders` | REUSE/EXTEND M11 | M11 vault | Cabinet/folder hierarchy |
| E5 | `document_acls` | REUSE/EXTEND | platform doc service | Per-document access grants (read by P02) |
| E6 | `document_tags` | REUSE/EXTEND | platform doc service | Classification labels & controlled/free tags |
| E7 | `document_links` | **GAP (attach contract)** | platform doc service | Polymorphic link to a G01–G12 context object |
| E8 | `retention_policies` | **REUSE (M11 retention classes)** | M11 (`VAL-M11-RETENTION`) | Retention/disposition schedules |
| E9 | `retention_assignments` | REUSE/EXTEND M11 | M11 | Binds a retention class to a document/type/folder + computed disposition date |
| E10 | `legal_holds` | **GAP (gov-specific)** | P01 (SoD) + P05 | Legal-hold matters that freeze disposition (placement + release SoD) |
| E11 | `legal_hold_items` | **GAP (gov-specific)** | P01 + P05 | Join of hold to held documents (auto-added future matches) |
| E12 | `document_audit` (access events) | **RUNS ON P05** | P05 dual log | View/download/print/share access events; hash-chain tracks OPEN-PLAT-03 |
| E13 | `document_shares` | REUSE/EXTEND | platform doc service | Secure shares / expiring signed links (anti-brute-force) |
| E14 | `checkout_locks` | REUSE/EXTEND M11 | M11 | Optional check-out / check-in exclusive edit locks |
| E15 | `scan_results` | REUSE/EXTEND | ScanProvider | Malware-scan + content-extraction + integrity results per version |
| E16 | `signature_requests` | **REUSE (`signoff_transactions`)** | `DocumentGen` sign-off | E-signature request + signer envelope |
| E17 | `signatures` | REUSE/EXTEND M11 | `DocumentGen` sign-off | Individual applied signatures (PAdES) |
| E18 | `disposition_records` | REUSE/EXTEND (`JOB-M11-DISPOSAL`) | M11 | Certified destruction/transfer/review events |
| E19 | `storage_objects` | REUSE/EXTEND M11 | object storage + KMS | Physical blob descriptor (bucket/key/checksum/encryption + security-domain) |
| E20 | `dlp_findings` | REUSE/EXTEND | DlpProvider | DLP/classification findings on content |
| **E21** | **`security_clearances`** | **GAP (gov-specific)** | read by P02 | Principal document-domain clearance level + lifecycle (R3) |
| **E22** | **`data_subject_requests`** | **GAP (gov-specific)** | P05 redaction + `JOB-M11-DISPOSAL`; `consent_records` | DPDP access/erasure/rectification requests + precedence outcome (R8) |
| **E23** | **`audit_anchors`** | **GAP (gov-specific)** | tracks OPEN-PLAT-03 | Periodic hash-chain digests anchored to WORM/external notary (R5) |
| **E24** | **`hold_notices`** | **GAP (gov-specific)** | P01 + X.2 | Custodian legal-hold notices + acknowledgements (R11) |
| **E25** | **`lifecycle_event_inbox`** | **GAP (gov-specific)** | platform outbox/event bus | Inbound G01/G09/G11 lifecycle events for anchor recompute (R12) |
| **E26** | **`signature_ltv_artifacts`** | **GAP (gov-specific)** | RFC-3161 TSA | Timestamp tokens + OCSP/CRL for PAdES-LTV (R4) |
| — | `employees`, `users`, `org_units`, `roles`, `consent_records`, `notifications`, `audit_log`, `security_audit_log`, `workflows`/`workflow_instances`/`workflow_actions`, `service_register_events` (G12 ledger) | **Platform / other-module** | M01/G12/platform | Referenced, not redefined |

### 5.2 Full field tables

> Each table additionally carries `tenant_id`, `entity_id` (where entity-scoped), and inherits the platform audit
> trail via P05 DB-triggers — not a per-table `audit_log`.

#### E1 — `documents` (vault master — REUSE/EXTEND PrimeSoft M11 vault)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `document_id` | UUID PK | N | Stable reference held by all G01–G12 modules |
| `tenant_id` | UUID | N | Platform §0.1 (every row) |
| `entity_id` | UUID | Y | Department/directorate scope where applicable |
| `doc_no` | VARCHAR(40) UNIQUE | N | Human key, e.g. `DOC/2026/0001234` |
| `title` | VARCHAR(255) | N | Display name |
| `description` | TEXT | Y | |
| `document_type_id` | UUID FK→document_types | N | Drives metadata schema & defaults |
| `folder_id` | UUID FK→folders | Y | Cabinet/folder placement |
| `owner_employee_id` | UUID FK→employees | Y | Record owner (subject), if person-bound |
| `owning_org_unit_id` | UUID FK→org_units | N | Row-level scope |
| `current_version_id` | UUID FK→document_versions | Y | Pointer to active version (deferrable FK) |
| `current_version_no` | INT | N | Denormalised latest version number; default 1 |
| `classification` | ENUM `classification_level` | N | **gov EXTENSION** — PUBLIC…TOP_SECRET; default INTERNAL |
| `security_domain` | VARCHAR(40) | N | **gov EXTENSION** — key/dedup domain; dedup never crosses this boundary (R1/R9) |
| `status` | ENUM `document_status` | N | State machine (§12.1); incl. `ORPHANED` |
| `link_count` | INT | N | Active `document_links`; 0 ⇒ orphan candidate (R15); default 0 |
| `mime_type` | VARCHAR(120) | N | Of current version |
| `size_bytes` | BIGINT | N | Of current version |
| `content_hash` | CHAR(64) | N | SHA-256 of current version (integrity) |
| `is_sealed` | BOOLEAN | N | **gov EXTENSION** — hidden from subject even if owner; default false |
| `is_worm` | BOOLEAN | N | **gov EXTENSION** — immutable statutory storage; default false |
| `is_record_declared` | BOOLEAN | N | Declared formal record (locks metadata); default false |
| `legal_hold_count` | INT | N | **gov EXTENSION** — >0 ⇒ disposition blocked; default 0 |
| `retention_assignment_id` | UUID FK→retention_assignments | Y | Governing retention class |
| `disposition_due_date` | DATE | Y | Computed eligible-for-disposition date |
| `anchor_confirmed` | BOOLEAN | N | **gov EXTENSION** — true only when retention anchor confirmed by source module; auto-DESTROY blocked while false (R12) |
| `source_channel` | ENUM `source_channel` | N | WEB_UPLOAD / BULK / SCANNER / MOBILE / API / SYSTEM_GENERATED |
| `scan_status` | ENUM `scan_status` | N | PENDING / CLEAN / INFECTED / QUARANTINED / SKIPPED |
| `language_code` | VARCHAR(8) | Y | OCR-detected/declared (`en`/`hi`/`te`) |
| `dpdp_erasure_state` | ENUM `erasure_method` | Y | **gov EXTENSION** — set when a DPDP request resolves (R8) |
| `created_at`/`updated_at` | TIMESTAMPTZ | N | |
| `created_by`/`updated_by` | UUID | N | |
| `is_deleted` | BOOLEAN | N | Soft delete only (no hard delete; blocked while WORM/legal-hold) |

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
| `is_supersede` | BOOLEAN | N | Replaces prior original; default false |
| `superseded_version_id` | UUID FK→document_versions | Y | If supersede |
| `derived_from_version_id` | UUID FK→document_versions | Y | Source for certified/redacted/signed derivatives |
| `ocr_status` | ENUM `ocr_status` | N | PENDING / DONE / FAILED / NOT_APPLICABLE |
| `created_by` | UUID FK→users | N | Who checked in |
| `created_at` | TIMESTAMPTZ | N | Append-only |

#### E3 — `document_types` (EXTEND `letter_templates` / merge-field model)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `document_type_id` | UUID PK | N | |
| `type_code` | VARCHAR(60) UNIQUE | N | e.g. `ID_PROOF`, `CHARGE_SHEET`, `PPO`, `SR_PAGE` |
| `name` | VARCHAR(160) | N | |
| `category` | ENUM `doc_category` | N | IDENTITY / SERVICE / FINANCIAL / DISCIPLINARY / MEDICAL / TRAINING / PENSION / STATUTORY / OTHER |
| `metadata_schema` | JSONB | N | JSON-Schema of metadata fields; realised as a **W.2 form** referencing `VAL-*` |
| `letter_template_ref` | UUID | Y | Link to M11 `letter_templates` where the type is generated (`VAL-M11-MERGE`) |
| `default_classification` | ENUM `classification_level` | N | gov EXTENSION |
| `default_security_domain` | VARCHAR(40) | N | gov EXTENSION — default dedup/key domain |
| `default_retention_policy_id` | UUID FK→retention_policies | Y | **M11 retention class** |
| `is_worm_default` | BOOLEAN | N | gov EXTENSION — statutory types default to WORM |
| `requires_signature` | BOOLEAN | N | Drives `DocumentGen` sign-off |
| `allowed_signature_types` | TEXT[] | N | Whitelist subset of `signature_type`; statutory types exclude `DRAWN` (R7) |
| `signature_legal_basis` | VARCHAR(120) | Y | e.g. `IT_ACT_3A_DSC`, `IT_ACT_3A_AADHAAR` |
| `checkout_mode` | ENUM `checkout_mode` | N | NONE / OPTIONAL / REQUIRED — default OPTIONAL (R22) |
| `allowed_mime_types` | TEXT[] | N | Whitelist (`VAL-FILE`) |
| `max_size_mb` | INT | N | Per-type size cap (`VAL-FILE`) |
| `is_top_secret_eligible` | BOOLEAN | N | gov EXTENSION — only system-seeded statutory types |
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
| `context_module` | VARCHAR(10) | Y | e.g. `G09` when module-scoped |
| `context_ref_id` | UUID | Y | e.g. case_id / employee_id |
| `owning_org_unit_id` | UUID FK→org_units | N | Row-level scope |
| `default_classification` | ENUM `classification_level` | Y | Inherited by children |
| `is_system_managed` | BOOLEAN | N | Auto-provisioned (e.g., per-employee) |
| audit fields | | | created/updated/by/is_deleted |

#### E5 — `document_acls` (read by P02)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `acl_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | Y | Null if folder-level grant |
| `folder_id` | UUID FK→folders | Y | Null if document-level grant |
| `principal_type` | ENUM `principal_type` | N | USER / ROLE / ORG_UNIT / RELATIONSHIP |
| `principal_ref` | VARCHAR(80) | N | user_id / role code / org_unit_id / relationship key |
| `rights` | TEXT[] | N | Subset of {VIEW, DOWNLOAD, PRINT, UPDATE, VERSION, SHARE, MANAGE_ACL} |
| `effect` | ENUM `acl_effect` | N | ALLOW / DENY (DENY wins) |
| `need_to_know` | BOOLEAN | N | Requires P01 workflow membership in addition to role |
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

#### E7 — `document_links` (the attach contract used by G01–G12)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `link_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `module_code` | VARCHAR(10) | N | G01…G12 |
| `entity_name` | VARCHAR(80) | N | Referencing entity, e.g. `change_requests`, `charge_sheets` |
| `entity_ref_id` | UUID | N | PK value in that entity |
| `link_role` | VARCHAR(60) | N | Semantic role, e.g. `PROOF`, `ORDER`, `EXHIBIT`, `CERTIFICATE` |
| `is_primary` | BOOLEAN | N | Primary attachment for the entity |
| `linked_by` | UUID FK→users | N | |
| `detached_at` | TIMESTAMPTZ | Y | Set on detach; drives `documents.link_count` recompute (R15) |
| audit fields | | | created/updated/by/is_deleted |

#### E8 — `retention_policies` (REUSE M11 retention classes — `VAL-M11-RETENTION`)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `retention_policy_id` | UUID PK | N | M11 retention-class id |
| `policy_code` | VARCHAR(60) UNIQUE | N | e.g. `RET_SR_PERMANENT`, `RET_PAYSLIP_8Y` |
| `name` | VARCHAR(160) | N | |
| `trigger_event` | ENUM `retention_trigger` | N | ON_CREATE / ON_SUPERSEDE / ON_EMPLOYEE_RETIRE / ON_CASE_CLOSE / FISCAL_YEAR_END |
| `retention_period_months` | INT | Y | Null ⇒ permanent |
| `is_permanent` | BOOLEAN | N | |
| `disposition_action` | ENUM `disposition_action` | N | DESTROY / ARCHIVE_TRANSFER / REVIEW |
| `review_required` | BOOLEAN | N | Records-manager approval before disposition |
| `requires_confirmed_anchor` | BOOLEAN | N | **gov EXTENSION** — auto-DESTROY blocked until `anchor_confirmed` (R12); default true for event-triggered |
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

#### E10 — `legal_holds` (GAP gov-specific; runs on P01 + P05)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `legal_hold_id` | UUID PK | N | |
| `hold_no` | VARCHAR(40) UNIQUE | N | e.g. `LH/2026/007` |
| `matter_name` | VARCHAR(200) | N | Litigation/inquiry name |
| `reason` | TEXT | N | |
| `authority` | VARCHAR(160) | N | Court/CVC/competent authority |
| `match_criteria` | JSONB | Y | Predicate for continuous evaluation (`JOB-G13-HOLDEVAL`, R11) |
| `is_high_value` | BOOLEAN | N | Placement requires approver (R10); default false |
| `status` | ENUM `legal_hold_status` | N | PENDING_APPROVAL / ACTIVE / RELEASE_PROPOSED / RELEASED |
| `placed_by` | UUID FK→users | N | Legal Hold Admin |
| `placed_at` | TIMESTAMPTZ | N | |
| `placement_approved_by` | UUID FK→users | Y | Legal Hold Approver (high-value); P01 (R10) |
| `release_proposed_by` | UUID FK→users | Y | Maker for release (R10) |
| `release_approved_by` | UUID FK→users | Y | Checker; must ≠ proposer; P01-enforced (R10) |
| `released_at` | TIMESTAMPTZ | Y | |
| `release_reason` | TEXT | Y | Mandatory on release (`VAL-G13-HOLD-SOD`, R10) |
| audit fields | | | created/updated/by/is_deleted |

#### E11 — `legal_hold_items`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hold_item_id` | UUID PK | N | |
| `legal_hold_id` | UUID FK→legal_holds | N | |
| `document_id` | UUID FK→documents | N | |
| `match_basis` | ENUM `hold_match_basis` | N | MANUAL / SAVED_SEARCH / EMPLOYEE / CASE |
| `is_auto_added` | BOOLEAN | N | True when added by continuous-eval for a future match (R11); default false |
| `held_at` | TIMESTAMPTZ | N | |
| `released_at` | TIMESTAMPTZ | Y | |
| UNIQUE(`legal_hold_id`,`document_id`) | | | One row per hold-document |

#### E12 — `document_audit` (access events; RUNS ON P05; hash-chain tracks OPEN-PLAT-03)

> View/download/print/share access events are written to the platform audit substrate. **Mutations** are already
> captured by P05 DB-triggers on the underlying tables; this entity records **read/access** events (which P05
> notes are themselves auditable) plus the gov-statutory **hash-chain** (`prev_hash`/`row_hash`) and anchoring
> (E23) that track **OPEN-PLAT-03** rather than inventing a parallel mechanism.

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `audit_id` | UUID PK | N | |
| `seq_no` | BIGSERIAL | N | Global monotonic sequence for chain ordering (R5) |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | Y | Version accessed |
| `action` | ENUM `doc_audit_action` | N | VIEW / PREVIEW / DOWNLOAD / PRINT / SHARE / METADATA_UPDATE / VERSION_ADD / CLASSIFY / DISPOSE / HOLD_PLACE / HOLD_RELEASE / ACL_CHANGE / BREAK_GLASS / CLEARANCE_CHANGE / ERASURE |
| `actor_user_id` | UUID FK→users | N | |
| `actor_role` | VARCHAR(60) | N | Effective RBAC role at access |
| `correlation_id` | VARCHAR(64) | Y | `X-Correlation-Id` of the request (Foundation §1) |
| `ip_address` | INET | Y | |
| `user_agent` | VARCHAR(255) | Y | |
| `share_id` | UUID FK→document_shares | Y | If accessed via share link |
| `result` | ENUM `audit_result` | N | SUCCESS / DENIED |
| `denial_reason` | VARCHAR(120) | Y | |
| `prev_hash` | CHAR(64) | N | `row_hash` of preceding row (chain link) (R5) |
| `row_hash` | CHAR(64) | N | SHA-256 over canonical row payload ‖ `prev_hash` (R5) |
| `occurred_at` | TIMESTAMPTZ | N | Append-only (P05: no UPDATE/DELETE; sole exception = DPDPA redaction marker) |

#### E13 — `document_shares`

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `share_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | Y | Pin to a version (else current) |
| `share_type` | ENUM `share_type` | N | INTERNAL_USER / EXTERNAL_LINK |
| `recipient_user_id` | UUID FK→users | Y | For internal |
| `recipient_email` | VARCHAR(160) | Y | For external (`VAL-EMAIL`) |
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

#### E16 — `signature_requests` (REUSE `signoff_transactions`; on `DocumentGen` sign-off)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `signature_request_id` | UUID PK | N | maps to `signoff_transactions` |
| `document_id` | UUID FK→documents | N | |
| `version_id` | UUID FK→document_versions | N | Version being signed |
| `request_no` | VARCHAR(40) UNIQUE | N | |
| `signing_mode` | ENUM `signing_mode` | N | SEQUENTIAL / PARALLEL (P01 patterns) |
| `status` | ENUM `signature_request_status` | N | DRAFT / SENT / IN_PROGRESS / COMPLETED / DECLINED / EXPIRED / CANCELLED |
| `signer_list` | JSONB | N | Ordered signers (`VAL-M11-SIGNER` resolvable) |
| `workflow_instance_id` | UUID | Y | P01 instance backing the sign-off flow |
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
| `legal_basis` | VARCHAR(120) | Y | e.g. `IT_ACT_3A_DSC` per signature (R7) |
| `certificate_subject` | VARCHAR(255) | Y | DSC subject DN |
| `signature_hash` | CHAR(64) | N | Hash of signed payload (PAdES) |
| `tsa_token_ref` | UUID FK→signature_ltv_artifacts | Y | RFC-3161 timestamp token (R4) |
| `ltv_status` | ENUM `ltv_status` | N | NONE / TIMESTAMPED / LTV_ENABLED (R4) |
| `signed_at` | TIMESTAMPTZ | Y | |
| `status` | ENUM `signature_status` | N | PENDING / SIGNED / DECLINED |
| `decline_reason` | VARCHAR(255) | Y | |

#### E18 — `disposition_records` (REUSE `JOB-M11-DISPOSAL`)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `disposition_id` | UUID PK | N | |
| `document_id` | UUID FK→documents | N | |
| `retention_assignment_id` | UUID FK→retention_assignments | Y | |
| `action` | ENUM `disposition_action` | N | DESTROY / ARCHIVE_TRANSFER / REVIEW |
| `proposed_by` | UUID FK→users | N | Librarian (maker) |
| `approved_by` | UUID FK→users | Y | Records Manager (checker, P01: maker≠checker) |
| `status` | ENUM `disposition_status` | N | PROPOSED / APPROVED / EXECUTED / REJECTED / BLOCKED_HOLD |
| `erasure_method` | ENUM `erasure_method` | Y | CRYPTO_SHRED only when blob domain-local & unshared (R1) |
| `certificate_no` | VARCHAR(40) | Y | Destruction certificate |
| `executed_at` | TIMESTAMPTZ | Y | |
| `evidence_hash` | CHAR(64) | Y | Tombstone hash retained after destruction |
| audit fields | | | created/updated/by/is_deleted |

#### E19 — `storage_objects` (REUSE/EXTEND M11; object storage + KMS envelope)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `storage_object_id` | UUID PK | N | |
| `bucket` | VARCHAR(120) | N | Logical bucket/container |
| `object_key` | VARCHAR(512) | N | Encrypted path/key |
| `content_hash` | CHAR(64) | N | SHA-256 (integrity) |
| `dedup_index_key` | CHAR(64) | N | **HMAC(content_hash, domain_secret)** — keyed dedup index, no existence oracle (R9) |
| `security_domain` | VARCHAR(40) | N | Dedup/key domain; dedup matches only within identical domain (R1/R9) |
| `key_scope` | ENUM `key_scope` | N | SHARED_CMK (PUBLIC/INTERNAL) / DEDICATED_CMK (CONFIDENTIAL+) |
| `dek_shared` | BOOLEAN | N | True if blob referenced by >1 document; crypto-shred forbidden while true (R1); default false |
| `size_bytes` | BIGINT | N | |
| `encryption_alg` | VARCHAR(40) | N | e.g. `AES-256-GCM` |
| `kms_key_id` | VARCHAR(160) | N | KMS CMK reference (credentials via P04) |
| `wrapped_dek` | BYTEA | N | DEK wrapped by KMS CMK |
| `storage_class` | ENUM `storage_class` | N | HOT / WARM / COLD / WORM_LOCKED (**gov EXTENSION**) |
| `worm_retain_until` | TIMESTAMPTZ | Y | **gov EXTENSION** — object-lock retention timestamp |
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

#### E21 — `security_clearances` (GAP gov-specific — defines `clearance_level`, R3; read by P02)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `clearance_id` | UUID PK | N | |
| `principal_type` | ENUM `clearance_principal_type` | N | USER / ROLE |
| `principal_ref` | VARCHAR(80) | N | user_id or RBAC role code |
| `clearance_level` | ENUM `classification_level` | N | Max classification this principal may access |
| `scope_org_unit_id` | UUID FK→org_units | Y | Optional org scoping |
| `status` | ENUM `clearance_status` | N | PENDING_APPROVAL / ACTIVE / SUSPENDED / EXPIRED / REVOKED |
| `justification` | TEXT | N | Why granted (`VAL-COMMENT`) |
| `granted_by` | UUID FK→users | N | Security/DLP Officer (maker) |
| `approved_by` | UUID FK→users | Y | Records Manager (checker, P01: must ≠ granter) |
| `workflow_instance_id` | UUID | Y | P01 maker-checker instance |
| `valid_from` | DATE | N | |
| `valid_until` | DATE | Y | Null ⇒ until revoked; periodic recert (`JOB-G13-CLEARANCE-RECERT`) |
| audit fields | | | created/updated/by/is_deleted |

> **Effective clearance resolution (consumed by P02):** `effective_clearance_level` = highest `clearance_level`
> among ACTIVE rows matching the user directly or via an assigned RBAC role, within org scope; defaults to
> `INTERNAL` when none. PUBLIC/INTERNAL need no explicit grant. P02 reads this as the classification dimension.

#### E22 — `data_subject_requests` (GAP gov-specific — DPDP lattice, R8; uses P05 redaction + `JOB-M11-DISPOSAL`)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `dsr_id` | UUID PK | N | |
| `dsr_no` | VARCHAR(40) UNIQUE | N | e.g. `DSR/2026/0007` |
| `data_subject_employee_id` | UUID FK→employees | N | Whose data |
| `request_type` | ENUM `dsr_type` | N | ACCESS / ERASURE / RECTIFICATION / PORTABILITY |
| `consent_ref_id` | UUID FK→consent_records | Y | Platform `consent_records` basis (DPDPA) |
| `received_at` | TIMESTAMPTZ | N | Statutory clock starts |
| `status` | ENUM `dsr_status` | N | RECEIVED / UNDER_REVIEW / EXEMPTED / PARTIALLY_FULFILLED / FULFILLED / REJECTED |
| `legal_basis_exemption` | VARCHAR(200) | Y | Statutory retention/hold/WORM basis overriding erasure |
| `affected_document_count` | INT | Y | Documents in scope |
| `resolution_note` | TEXT | Y | DPO decision narrative |
| `erasure_method` | ENUM `erasure_method` | Y | CRYPTO_SHRED / PHYSICAL_PURGE / EXEMPT_RETAINED |
| `adjudicated_by` | UUID FK→users | Y | DPO |
| audit fields | | | created/updated/by/is_deleted |

#### E23 — `audit_anchors` (GAP gov-specific — tamper-evident anchoring, R5; tracks OPEN-PLAT-03)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `anchor_id` | UUID PK | N | |
| `period_start_seq` | BIGINT | N | First `document_audit.seq_no` in window |
| `period_end_seq` | BIGINT | N | Last seq_no in window |
| `digest` | CHAR(64) | N | SHA-256 root over the window's `row_hash` chain (Merkle root) |
| `anchor_target` | ENUM `anchor_target` | N | WORM / EXTERNAL_NOTARY / RFC3161_TSA |
| `anchor_reference` | VARCHAR(255) | N | WORM object key / notary receipt / TSA token id |
| `anchored_at` | TIMESTAMPTZ | N | |
| `verified_at` | TIMESTAMPTZ | Y | Last successful chain verification (`JOB-G13-CHAINVERIFY`) |
| `verification_status` | ENUM `anchor_verify_status` | N | PENDING / VERIFIED / BROKEN |

#### E24 — `hold_notices` (GAP gov-specific — custodian acknowledgement, R11; X.2)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `hold_notice_id` | UUID PK | N | |
| `legal_hold_id` | UUID FK→legal_holds | N | |
| `custodian_user_id` | UUID FK→users | N | Person notified to preserve |
| `notice_text` | TEXT | N | Preservation instruction |
| `status` | ENUM `hold_notice_status` | N | SENT / ACKNOWLEDGED / OVERDUE / ESCALATED |
| `sent_at` | TIMESTAMPTZ | N | via X.2 (`MSG-G13-HOLD-NOTICE`) |
| `acknowledged_at` | TIMESTAMPTZ | Y | |
| `reminder_count` | INT | N | Default 0 |
| audit fields | | | created/updated/by/is_deleted |

#### E25 — `lifecycle_event_inbox` (GAP gov-specific — event-driven anchor recompute, R12; platform outbox)

| Field | Type | Null | Notes |
|-------|------|:--:|-------|
| `event_id` | UUID PK | N | |
| `source_module` | VARCHAR(10) | N | G01 / G09 / G11 |
| `event_type` | ENUM `lifecycle_event_type` | N | EMPLOYEE_RETIRE / EMPLOYEE_MERGE / CASE_CLOSE / FISCAL_YEAR_END / ANCHOR_CORRECTION |
| `subject_ref_id` | UUID | N | employee_id / case_id |
| `effective_date` | DATE | N | New anchor date |
| `is_confirmed` | BOOLEAN | N | True only on the source module's final/confirmed event (R12) |
| `dedupe_key` | VARCHAR(120) UNIQUE | N | Idempotency (outbox at-least-once delivery) |
| `processing_status` | ENUM `event_status` | N | RECEIVED / PROCESSED / FAILED / DEAD_LETTER |
| `received_at` | TIMESTAMPTZ | N | |
| `processed_at` | TIMESTAMPTZ | Y | |

#### E26 — `signature_ltv_artifacts` (GAP gov-specific — RFC-3161 + PAdES-LTV durability, R4)

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

- `documents` 1—N `document_versions`; `documents.current_version_id` → latest version.
- `document_versions` N—1 `storage_objects` (many versions may share a blob via **domain-scoped** dedup).
- `documents` N—1 `document_types` (extends `letter_templates`); N—1 `folders` (self-referential tree).
- `documents` 1—N `document_acls` (+ folder-inherited), `document_tags`, `document_links`, `document_audit`,
  `document_shares`, `dlp_findings` (via versions).
- `documents` 1—0..1 `checkout_locks`; 1—N `signature_requests` (`signoff_transactions`) → 1—N `signatures` →
  1—0..1 `signature_ltv_artifacts`.
- `retention_policies` (M11 classes) 1—N `retention_assignments` → governing N `documents`;
  `retention_assignments` N—0..1 `lifecycle_event_inbox` (anchor source).
- `legal_holds` 1—N `legal_hold_items` N—1 `documents`; `legal_holds` 1—N `hold_notices`.
- `documents` 1—N `disposition_records`.
- `document_audit` is a hash chain (`prev_hash`→`row_hash`); windows summarised by `audit_anchors` (OPEN-PLAT-03).
- `security_clearances` N—1 `users`/`roles`; **read by P02** at access time.
- `data_subject_requests` N—1 `employees`; N—1 `consent_records`; affects N `documents`.
- `document_links` connects `documents` to ANY G01–G12 entity (`module_code`+`entity_name`+`entity_ref_id`).

### 5.4 Ownership / reuse matrix

| Entity | Owner / anchor | Written by | Read by |
|--------|----------------|-----------|---------|
| `documents` / `document_versions` | **G13 (on M11 vault)** | G13 (on attach by G01–G12) | G01–G14 |
| `document_types` | G13 (extends `letter_templates`) | Librarian (Document Admin) | All modules |
| `document_acls` | G13 | G13, Security | **P02** enforcement |
| `document_links` | G13 | G01–G12 (attach) | G01–G14 |
| `document_audit` | **P05 substrate** | G13 (all access) | Auditor (P05 `Audit.query`), G14 |
| `retention_policies`/`_assignments` | **M11 classes** | Librarian/Records Mgr | G13, Auditor |
| `legal_holds`/`_items`/`hold_notices` | G13 (gov) | LH Admin/Approver (P01) | Auditor, custodians |
| `disposition_records` | M11 disposal | Librarian/Records Mgr (P01) | Auditor |
| `signature_requests`/`signatures`/`ltv_artifacts` | `DocumentGen` sign-off | G13 + signers + TSA | Originating module |
| `security_clearances` | G13 (gov) | Security (maker)/Records Mgr (checker) via P01 | **P02**, Auditor |
| `data_subject_requests` | G13 (gov) | DPO | Auditor, G01 |
| `audit_anchors` | G13 (gov) | `JOB-G13-ANCHOR` | Auditor |
| `lifecycle_event_inbox` | G13 (gov) | G01/G09/G11 (outbox) | RetentionService |
| `employees`/`users`/`org_units`/`roles`/`consent_records` | platform/other module | their owners | G13 (FK refs) |
| `notifications` | platform (X.2) | G13 emits | recipients |
| `audit_log`/`security_audit_log` | **platform P05** | DB-trigger on G13 tables | Auditor |

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

- **DI-1:** `documents.current_version_id` references a `document_versions` row of the same document;
  `current_version_no` equals that version's `version_no`.
- **DI-2:** `document_versions` is append-only — corrections are a new version or supersede.
- **DI-3 (R5, OPEN-PLAT-03):** `document_audit` is append-only AND **hash-chained** (`row_hash` =
  SHA-256(payload ‖ prev_hash)), periodically summarised into `audit_anchors` and anchored to WORM/notary/TSA;
  a broken chain raises `ERR-G13-AUDIT_CHAIN_BROKEN`. Runs on the P05 substrate; tamper-evidence tracks OPEN-PLAT-03.
- **DI-4:** A document with `legal_hold_count > 0` or `is_worm = true` cannot be soft-deleted, disposed, or
  content-overwritten before `worm_retain_until`.
- **DI-5:** `content_hash` must equal SHA-256 of stored bytes; mismatch sets `integrity_verified=false`, blocks `ACTIVE`.
- **DI-6 (R1/R9):** Dedup is **domain-scoped** — reuse only when `content_hash` AND `security_domain` AND
  `key_scope` match (HMAC `dedup_index_key`). Cross-domain dedup forbidden. `ref_count>1` ⇒ `dek_shared=true`,
  no crypto-shred. No user-visible dedup signal.
- **DI-7:** One `ACTIVE` `checkout_locks` per `document_id`; check-out only where `checkout_mode ≠ NONE`.
- **DI-8:** `document_acls` DENY overrides ALLOW; absence of ALLOW = no access (deny-by-default; **P02**).
- **DI-9:** `classification` downgraded only by Security/DLP via **P01 maker-checker**; upgrades by Librarian.
  Sealed/WORM not downgradable below type default. TOP_SECRET only on `is_top_secret_eligible` types.
- **DI-10:** `disposition_records` requires `approved_by ≠ proposed_by` (P01); EXECUTED only if no active hold
  AND (`requires_confirmed_anchor=false` OR `anchor_confirmed=true`).
- **DI-11:** Every `document_versions` insert is preceded by a `scan_results` row `malware_verdict=CLEAN` before
  it may become `current`.
- **DI-12:** EXTERNAL_LINK shares require `expires_at` not null and `token_hash` set; after N failed password
  attempts, `status=LOCKED` (R16).
- **DI-13:** `disposition_due_date` is null iff governing class `is_permanent=true`.
- **DI-14:** G01–G12 references to `documents` are validated on attach via `document_links`; a module entity may
  not point at a `DELETED`/`DISPOSED`/`ORPHANED` document.
- **DI-15 (R8 — DPDP precedence lattice):** ERASURE precedence = **statutory retention / active legal hold /
  WORM-before-retain-until → override erasure** (`EXEMPT_RETAINED`, basis recorded). Only where none applies is
  erasure fulfilled, via **domain-local crypto-shred** (`dek_shared=false`) or PHYSICAL_PURGE — executed on the
  **P05 redaction-marker path + `JOB-M11-DISPOSAL`**.
- **DI-16 (R3):** Every access decision resolves `effective_clearance_level` from `security_clearances`
  (default INTERNAL) and requires it ≥ `classification`; **P02 reads it**. Grants require maker≠checker (P01).
- **DI-17 (R11):** Releasing a hold requires `release_approved_by ≠ release_proposed_by` + a non-null reason;
  high-value placement requires `placement_approved_by` (P01).
- **DI-18 (R12):** A `lifecycle_event_inbox` row is processed idempotently by `dedupe_key`; an unconfirmed event
  may set a provisional anchor but must NOT flip `anchor_confirmed=true`.

### 5.7 Sample data (illustrative)

**`documents`**

| document_id | doc_no | title | document_type_id | classification | security_domain | status | link_count | is_worm |
|---|---|---|---|---|---|---|---|---|
| doc-0001 | DOC/2026/0001001 | Aadhaar Proof – EMP-3001 | dt-id-proof | CONFIDENTIAL | DOM_CONFIDENTIAL | ACTIVE | 1 | false |
| doc-0002 | DOC/2026/0001002 | Charge-Sheet CS/2026/201 | dt-charge-sheet | SECRET | DOM_SECRET | ON_LEGAL_HOLD | 1 | true |
| doc-0003 | DOC/2026/0001003 | PPO – EMP-2900 | dt-ppo | CONFIDENTIAL | DOM_CONFIDENTIAL | ACTIVE | 1 | true |

**`document_links`** (attach contract — module codes are G01–G12)

| link_id | document_id | module_code | entity_name | entity_ref_id | link_role | is_primary |
|---|---|---|---|---|---|---|
| lk-01 | doc-0001 | G02 | change_requests | cr-5501 | PROOF | true |
| lk-02 | doc-0002 | G09 | charge_sheets | cs-01 | ORDER | true |
| lk-03 | doc-0003 | G11 | pension_cases | pc-7001 | ORDER | true |

**`document_types`** (extends `letter_templates`)

| document_type_id | type_code | name | default_classification | checkout_mode | allowed_signature_types | is_worm_default |
|---|---|---|---|---|---|---|
| dt-id-proof | ID_PROOF | Identity Proof | CONFIDENTIAL | NONE | {} | false |
| dt-charge-sheet | CHARGE_SHEET | Charge Sheet | SECRET | OPTIONAL | {DSC_TOKEN} | true |
| dt-ppo | PPO | Pension Payment Order | CONFIDENTIAL | NONE | {DSC_TOKEN,AADHAAR_ESIGN} | true |

**`retention_policies`** (M11 retention classes)

| retention_policy_id | policy_code | name | trigger_event | retention_period_months | is_permanent | requires_confirmed_anchor |
|---|---|---|---|---|---|---|
| rp-01 | RET_SR_PERMANENT | Service Register – Permanent | ON_CREATE | null | true | false |
| rp-02 | RET_PAYSLIP_8Y | Payslip – 8 Years | FISCAL_YEAR_END | 96 | false | true |
| rp-03 | RET_DISC_30Y | Disciplinary – 30 Years | ON_CASE_CLOSE | 360 | false | true |

**`legal_holds`** (gov extension)

| legal_hold_id | hold_no | matter_name | authority | is_high_value | status | release_approved_by |
|---|---|---|---|---|---|---|
| lh-01 | LH/2026/007 | WP 1234/2026 – EMP-3002 | High Court | true | ACTIVE | null |
| lh-02 | LH/2025/051 | CVC Ref 88/2025 | CVC | true | RELEASED | usr-4002 |

**`document_audit`** (P05 substrate; hash-chained per OPEN-PLAT-03)

| audit_id | seq_no | document_id | action | actor_user_id | result | prev_hash | row_hash |
|---|---|---|---|---|---|---|---|
| au-01 | 1001 | doc-0001 | VIEW | usr-9001 | SUCCESS | 0000…00 | 7a3f…1b |
| au-02 | 1002 | doc-0002 | DOWNLOAD | usr-7001 | SUCCESS | 7a3f…1b | b910…44 |
| au-03 | 1003 | doc-0002 | VIEW | usr-3001 | DENIED | b910…44 | c2d8…90 |

**`security_clearances`** (gov extension; read by P02)

| clearance_id | principal_type | principal_ref | clearance_level | status | approved_by | valid_until |
|---|---|---|---|---|---|---|
| cl-01 | USER | usr-7001 | SECRET | ACTIVE | usr-4002 | 2027-03-31 |
| cl-02 | ROLE | legal_hold_admin | CONFIDENTIAL | ACTIVE | usr-4002 | null |
| cl-03 | USER | usr-3001 | INTERNAL | ACTIVE | usr-4002 | 2027-03-31 |

**`data_subject_requests`** (gov; P05 redaction + `JOB-M11-DISPOSAL`)

| dsr_id | dsr_no | data_subject_employee_id | request_type | status | legal_basis_exemption | erasure_method |
|---|---|---|---|---|---|---|
| dsr-01 | DSR/2026/0007 | emp-3001 | ERASURE | EXEMPTED | Statutory SR permanent retention | EXEMPT_RETAINED |
| dsr-02 | DSR/2026/0008 | emp-5500 | ERASURE | FULFILLED | null | CRYPTO_SHRED |
| dsr-03 | DSR/2026/0009 | emp-4400 | ACCESS | FULFILLED | null | null |

**`signatures`** (on `DocumentGen` sign-off)

| signature_id | signature_request_id | signer_user_id | signature_type | legal_basis | ltv_status | status |
|---|---|---|---|---|---|---|
| sg-01 | sr-01 | usr-2200 | DSC_TOKEN | IT_ACT_3A_DSC | LTV_ENABLED | SIGNED |
| sg-02 | sr-02 | usr-2201 | AADHAAR_ESIGN | IT_ACT_3A_AADHAAR | TIMESTAMPED | PENDING |

> Remaining entity sample rows (`document_versions`, `folders`, `document_acls`, `document_tags`,
> `retention_assignments`, `legal_hold_items`, `document_shares`, `checkout_locks`, `scan_results`,
> `signature_requests`, `disposition_records`, `storage_objects`, `dlp_findings`, `audit_anchors`,
> `hold_notices`, `lifecycle_event_inbox`, `signature_ltv_artifacts`) are unchanged from v2 §5.7 in shape, with
> `tenant_id`/`entity_id` added and module codes re-keyed G01–G12.

---

## 6. Functional Requirements

> Every FR runs on the platform services named in **Alignment §B**. Maker-checker is a **configured P01 flow
> (W.1)**; access checks call **`Authorization.check` (P02)**; access is audited to **P05**; jobs run on **X.1**;
> notifications via **X.2/W.3**. Validation cites `VAL-*` ids and authors only `VAL-G13-*`.

### FR-G13-001 — Document Upload & Ingestion (single, bulk, drag-drop, scanner, mobile)

- **Module:** G13-DMS · **Primary Role(s):** Document Owner, Uploader (module service), DMS Librarian (Document Admin), Employee

**User Story:** As an uploader, I want to add documents via web (single/bulk/drag-drop), scanner ingestion,
mobile capture, or the attach API, so that content enters the **M11 vault** safely, with the right type and
metadata, and becomes searchable and governed.

**Description:** Ingests binaries through a multi-step pipeline on the M11 vault: pre-flight validation
(`VAL-FILE` type/size) → secure upload (multipart/resumable) → malware scan (archive limits, R17) → integrity
hash → **domain-scoped dedup** → metadata capture (W.2 form) → sandboxed OCR/preview → `ACTIVE`. Supports
single/bulk uploads, drag-drop, watched scanner folders, mobile capture, and the programmatic attach API used by
G01–G12. Dedup hits are never surfaced (no existence oracle, R9).

**Acceptance Criteria:**
1. A document is created with `document_type_id`, `title`, target `folder_id`, type-required metadata, `tenant_id`/`entity_id`.
2. Files violating `allowed_mime_types`/`max_size_mb` are rejected pre-upload (`VAL-FILE`) with `ERR-G13-INVALID_FILE_TYPE`/`ERR-G13-FILE_TOO_LARGE`.
3. Every upload is virus-scanned before `ACTIVE`; infected files go to `QUARANTINED` (FR-G13-007).
4. Bulk upload accepts up to 100 files per batch, returning per-file success/failure without aborting.
5. Resumable upload supports files up to the configured cap (default 250 MB) and survives transient loss.
6. On success the response returns `documentId`, `docNo`, `status`, `currentVersionNo=1`; **P05 captures the mutation (DB-trigger)** and a chained `document_audit (VERSION_ADD)` access row is written.
7. The response NEVER indicates whether content was deduplicated; timing is normalised (R9).
8. The unsafe POST accepts an **`Idempotency-Key`**; a 24h replay returns the original result, not a duplicate.

**Business Rules:**
- BR-1: `status` flows DRAFT → SCANNING → (CLEAN ⇒ ACTIVE | INFECTED ⇒ QUARANTINED).
- BR-2: Default classification = `document_types.default_classification` unless caller specifies higher; `security_domain` defaults from the type.
- BR-3: Scanner/mobile sources auto-OCR; system-generated PDFs (e.g., payslips) skip OCR but still index text.
- BR-4: Module attach (API) must include `module_code`, `entity_name`, `entity_ref_id`, `link_role` (FR-G13-003).
- BR-5: Dedup reuse occurs only within the same `security_domain` + `key_scope` (DI-6).

**Data Model:** `documents`, `document_versions`, `storage_objects`, `scan_results`, `document_links`.

**API:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/documents` | Create + upload (single, multipart) |
| POST | `/api/v1/documents/bulk` | Bulk upload batch |
| POST | `/api/v1/documents/{id}/uploads:resume` | Resumable upload session |
| POST | `/api/v1/documents:attach` | Module attach contract (G01–G12) |

**LLD:** Validate `VAL-FILE` → presigned/resumable PUT to staging → SHA-256 + HMAC dedup key → domain-scoped
dedup lookup → AV scan (ScanProvider, archive guards) → on CLEAN promote blob, write
`storage_objects`+`document_versions`+`documents` in a transaction → enqueue sandboxed OCR/preview (X.1) →
P05 captures mutations; chained access audit emitted. Failure: type/size ⇒ 422 `VALIDATION_FAILED`/module code;
infected ⇒ 422 `ERR-G13-MALWARE_DETECTED`; archive bomb ⇒ 422 `ERR-G13-RENDER_RESOURCE_LIMIT`; storage down ⇒ X.3-mapped 500
`ERR-LOADFAIL` with resumable retry. Dependencies: KMS, object storage, AV/OCR providers, G01 employee context.

---

### FR-G13-002 — Document Types, Metadata Taxonomy, Classification, Tagging & Signature/Checkout Policy

- **Module:** G13-DMS · **Primary Role(s):** DMS Librarian (Document Admin), Security/DLP Officer, Uploader

**User Story:** As a Librarian, I want to define document types (extending the M11 `letter_templates`/merge-field
model) with a metadata schema, defaults, allowed signature methods, and check-out behaviour, so that every
document is consistently described, classified, signed lawfully, and discoverable.

**Description:** Manages the `document_types` taxonomy (JSON-Schema realised as a **W.2 form** referencing
`VAL-*`; default classification/domain/retention-class, allowed MIME/size via `VAL-FILE`, WORM/signature
defaults, allowed signature methods, checkout mode), the classification ladder, and tagging (controlled + free +
auto-applied by OCR/DLP). Where a type is generated rather than uploaded, it links a M11 `letter_template`
(`VAL-M11-MERGE` — every `${token}` resolves). Reclassification downgrade is a **P01 maker-checker** flow.

**Acceptance Criteria:**
1. A type defines `metadata_schema`, `default_classification`, `default_security_domain`, `allowed_mime_types`, `max_size_mb`, `allowed_signature_types`, `signature_legal_basis`, `checkout_mode`, optional `letter_template_ref`.
2. Uploads validate metadata against the W.2 form/JSON-Schema; missing required fields fail `VALIDATION_FAILED`/`ERR-G13-METADATA_INVALID`.
3. A document carries exactly one `classification`; changes write chained `document_audit (CLASSIFY)`.
4. Downgrading classification requires Security/DLP + a distinct approver via **P01** + a reason (`VAL-COMMENT`).
5. Tags can be user-applied (controlled vocab, `VAL-ENUM`) and auto-applied by OCR/DLP with a confidence score.
6. Deactivating a type prevents new uploads but preserves existing documents.
7. Statutory types exclude `DRAWN` and pin a `signature_legal_basis` (R7); TOP_SECRET selectable only when `is_top_secret_eligible=true`.
8. Generated types resolve every merge `${token}` against the M11 catalogue before publish (`VAL-M11-MERGE`).

**Business Rules:** BR-1 classification raised by Librarian, lowered only by Security/DLP via P01 (DI-9). BR-2
DLP PII tags auto-suggest CONFIDENTIAL minimum. BR-3 controlled vocab rejects unknown keys. BR-4 `checkout_mode`
defaults OPTIONAL (R22).

**Data Model:** `document_types`, `document_tags`, `documents`, `dlp_findings`, (`letter_templates` ref).

**API:** `POST/PUT /api/v1/document-types`, `GET /api/v1/document-types`, `POST /api/v1/documents/{id}/tags`,
`POST /api/v1/documents/{id}:reclassify` (P01 maker-checker).

**LLD:** CRUD types with schema-version pin + signature/checkout policy → validate uploads against pinned W.2
form → reclassify routes through a **configured P01 flow**. Failure: bad schema ⇒ 422; unauthorised downgrade ⇒
403 `ERR-G13-CLASSIFICATION_LOCKED`; metadata mismatch ⇒ 422 `ERR-G13-METADATA_INVALID`; illegal method ⇒ 422
`ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`; unbound merge token ⇒ 422 (`VAL-M11-MERGE`). Dependencies: P01, DLP (FR-016),
M11 `letter_templates`.

---

### FR-G13-003 — Folder/Cabinet Structure & Module-Context Linking (Attach Contract)

- **Module:** G13-DMS · **Primary Role(s):** DMS Librarian, Uploader (module service), System (auto-provision)

**User Story:** As a module service (G01–G12), I want to attach a document to my business object and place it in
the correct cabinet, so that documents are organised by employee/module/case context and reliably retrievable.

**Description:** Manages the folder hierarchy (auto-provisioned per employee and per module/case) and the
polymorphic **attach contract** (`document_links`) — the platform document service every gov module consumes.
Maintains `documents.link_count` so the orphan reaper (FR-G13-019) can detect zero-link documents. Folders carry
inheritable classification and ACLs (read by P02).

**Acceptance Criteria:**
1. A per-employee cabinet auto-creates on G01 employee creation; module/case subfolders auto-provision on first attach.
2. `documents:attach` links a document to a G01–G12 entity and returns `linkId`; `is_primary` unique per (entity, link_role); increments `link_count`. Accepts `Idempotency-Key`.
3. A document can be linked from multiple modules (re-use) without duplicating the binary.
4. Moving a document between folders preserves version history, P05 audit, retention, and holds.
5. Folder-level ACLs inherited unless overridden by a document-level DENY (P02 deny-by-default).
6. Detaching a link sets `detached_at`, decrements `link_count`; at 0 the document becomes an orphan candidate (FR-G13-019).

**Business Rules:** BR-1 a `DELETED`/`DISPOSED`/`ORPHANED` document cannot be attached (DI-14). BR-2 system folders
not renamable/deletable by non-admins. BR-3 folder classification sets the floor for contained documents.

**Data Model:** `folders`, `document_links`, `document_acls`, `documents`.

**API:** `POST /api/v1/folders`, `POST /api/v1/documents:attach`, `DELETE /api/v1/document-links/{linkId}`,
`GET /api/v1/documents?moduleCode=&entityRefId=&limit=&cursor=` (cursor pagination).

**LLD:** Resolve/auto-provision folder path → attach validates document state + caller scope (P02) → insert link
+ increment link_count → recompute inherited ACLs. Failure: disposed/orphaned doc ⇒ 409
`ERR-G13-DOCUMENT_NOT_ATTACHABLE`; duplicate primary ⇒ 409 `ERR-G13-LINK_CONFLICT`. Dependencies: G01 lifecycle events, all
modules (attach), FR-G13-019.

---

### FR-G13-004 — Versioning, Optional Check-in/Check-out & Supersede

- **Module:** G13-DMS · **Primary Role(s):** Document Owner, Uploader, DMS Librarian

**User Story:** As a document owner, I want to add new versions and (where the type requires it) check a document
out, so that change history is preserved and concurrent edits never collide.

**Description:** Provides immutable version history on the M11 vault, **optional** exclusive check-out/check-in
locks (per `document_types.checkout_mode`), new-version upload, and **supersede**. Check-out is OPTIONAL by
default, NONE for read-only statutory types, REQUIRED only where a type demands serialized edits (R22).

**Acceptance Criteria:**
1. For `checkout_mode ∈ {OPTIONAL, REQUIRED}`, checking out creates an exclusive `ACTIVE` lock; REQUIRED rejects check-in without a held lock.
2. Check-in increments `version_no`, sets new `current_version_id`, requires `change_summary`, runs the full scan pipeline.
3. Version history lists all versions (author, timestamp, size, hash, kind, summary); any version downloadable per P02.
4. Supersede records `version_kind=SUPERSEDE` + `superseded_version_id`; superseded version retained.
5. Locks auto-expire after TTL (default 8h); admin force-release with reason (audited to P05).
6. WORM documents reject content mutation before `worm_retain_until`.

**Business Rules:** BR-1 only lock holder/force-release admin may check in. BR-2 new version inherits
classification/domain/retention/holds/links. BR-3 supersede requires Librarian/owner right + reason. BR-4
`checkout_mode=NONE` adds versions directly with optimistic-concurrency guard.

**Data Model:** `document_versions`, `checkout_locks`, `documents`, `scan_results`.

**API:** `:checkout`, `:checkin`, `:supersede`, `GET /api/v1/documents/{id}/versions`.

**LLD:** Checkout acquires unique lock (SELECT…FOR UPDATE) → check-in validates lock/optimistic version → scan →
append version in txn → advance current pointer → release lock; P05 captures. Failure: locked ⇒ 409
`ERR-G13-DOCUMENT_LOCKED`; not holder ⇒ 403; WORM ⇒ 409 `ERR-G13-WORM_IMMUTABLE`; checkout on NONE ⇒ 409 `ERR-G13-CHECKOUT_NOT_SUPPORTED`.
Dependencies: FR-G13-005/007/014.

---

### FR-G13-005 — Encryption at Rest (Envelope/KMS), In Transit & Key Disaster Recovery

- **Module:** G13-DMS · **Primary Role(s):** Security/DLP Officer, System Administrator (Org/Platform Admin), System

**User Story:** As a Security Officer, I want every stored binary encrypted with envelope encryption under a KMS
key (credentials via P04), all transfers over TLS, keys rotatable, and a tested key-DR/escrow plan, so content
is protected and no key loss can darken the archive.

**Description:** Envelope encryption: a per-object DEK encrypts the blob (AES-256-GCM); the DEK is wrapped by a
KMS CMK (`wrapped_dek`). CONFIDENTIAL+ use a dedicated CMK per security domain. KMS integration credentials are
stored/rotated via **P04 `integration_credentials`**. All traffic TLS 1.2+. Supports key rotation (re-wrap DEKs
without re-encrypting blobs, `JOB-G13-KEYROTATE`). Adds key-DR/escrow (R6): CMK backup, multi-region/HSM
replication, recovery runbook, defined key-loss behaviour. Break-glass is dual-control, audited to
`security_audit_log`, rate-limited (R16).

**Acceptance Criteria:**
1. Every blob stored encrypted (AES-256-GCM) with a unique DEK; plaintext never persisted.
2. The DEK is wrapped by a KMS CMK; only `wrapped_dek` + `kms_key_id` stored.
3. All transport TLS 1.2+; non-TLS rejected at the gateway.
4. CMK rotation re-wraps DEKs in the background (`JOB-G13-KEYROTATE`) without rewriting object bytes.
5. Decryption requires an authorised principal (P02); every decrypt-for-download audited (FR-G13-012).
6. Break-glass requires two approvers, records `document_audit (BREAK_GLASS)` + `security_audit_log`, locks after repeated failures (`ERR-G13-BREAK_GLASS_LOCKED`).
7. CMKs backed up/escrowed (multi-region/HSM); rehearsed recovery runbook; defined key-loss behaviour (R6).

**Business Rules:** BR-1 CONFIDENTIAL+ use dedicated CMK per domain. BR-2 keys never leave KMS in plaintext.
BR-3 retired/compromised key forces re-wrap. BR-4 shared blob (`dek_shared=true`) never crypto-shredded (DI-6).
BR-5 CMK replicated to an in-country HSM/region; restore tested quarterly. BR-6 recovery runbook before any data
is declared lost.

**Data Model:** `storage_objects`, `documents`, `document_audit`.

**API:** `POST /api/v1/admin/keys:rotate`, `POST /api/v1/documents/{id}:break-glass`,
`GET /api/v1/admin/encryption/status`, `POST /api/v1/admin/keys:recover` (dual-control).

**LLD:** On store: generate DEK → encrypt → KMS-wrap → persist. On read: KMS-unwrap → decrypt stream → chained
audit. DR: escrow replication continuous; recovery dual-control. Failure: KMS down ⇒ X.3-mapped 500
`ERR-G13-KEY_SERVICE_UNAVAILABLE` (no plaintext fallback); unauthorised decrypt ⇒ 403; break-glass lockout ⇒ 429
`ERR-G13-BREAK_GLASS_LOCKED`. Dependencies: KMS (+ HSM/multi-region escrow via P04), object storage, FR-G13-012.

---

### FR-G13-006 — Access Control (P02 + Relationship + Clearance + Classification + Need-to-Know)

- **Module:** G13-DMS · **Primary Role(s):** Security/DLP Officer, DMS Librarian, all readers

**User Story:** As a Security Officer, I want access decided by RBAC role, org-relationship, a defined clearance
attribute, classification, and explicit need-to-know with deny-by-default, so only entitled principals can see
each document at record and field level.

**Description:** Access is enforced by **`Authorization.check` (P02)** — endpoints never re-implement permission
logic. P02 resolution: deny-by-default → role grant (RBAC §5.1) → multi-role **intersection** (more restrictive)
→ individual entitlement → capability flag → **PII Protection Ceiling** (overrides upward) → data-scope filter →
**field mask on serialization**. G13 contributes two resource attributes P02 evaluates: (a) the document
`classification`/`is_sealed`/`document_acls`, and (b) the principal's `effective_clearance_level` from
`security_clearances` (FR-G13-017, default INTERNAL). The clearance gate requires
`effective_clearance_level ≥ classification`. List/search results are masked to metadata-only for restricted
records (P02 mask-on-serialization).

**Acceptance Criteria:**
1. Access granted only when RBAC right AND `effective_clearance_level ≥ classification` AND an effective ALLOW hold, no DENY — resolved by P02.
2. A reporting manager views a direct report's permitted documents via the `REPORTING_MANAGER` relationship grant (RBAC scoping dimension).
3. Sealed documents are invisible to the subject employee even when they own related records (P02 404-style, no existence leak).
4. Need-to-know ACLs require P01 workflow membership in addition to role.
5. Denied access is recorded as chained `document_audit (result=DENIED)` + `security_audit_log` with reason.
6. Time-boxed ACLs (`expires_at`) auto-revoke (platform entitlement-expiry job).
7. Clearance read live; SUSPENDED/EXPIRED/REVOKED immediately denies CONFIDENTIAL+ access.

**Business Rules:** BR-1 DENY always wins (DI-8). BR-2 folder ACLs inherit unless document-level DENY. BR-3
Auditor reads per clearance; Sys Admin cannot read CONFIDENTIAL+ except break-glass. BR-4 missing clearance
defaults INTERNAL (DI-16).

**Data Model:** `document_acls`, `documents`, `folders`, `security_clearances`, `document_audit`.

**API:** `POST /api/v1/documents/{id}/acls`, `DELETE /api/v1/acls/{aclId}`,
`GET /api/v1/documents/{id}/access:check`, `GET /api/v1/documents/{id}/acls`.

**LLD:** Each access calls `Authorization.check({subject(roles,scope), action, resource_ref, fields[]})` →
`{allowed, scope_filter, field_mask[]}`; G13 supplies clearance + classification + ACLs as resource context.
Failure: denied ⇒ 403 `FORBIDDEN`/`ERR-G13-CLEARANCE_INSUFFICIENT` + audited DENIED; sealed ⇒ 404. Dependencies: **P02**,
G01 relationships/org, FR-G13-017, FR-G13-012.

---

### FR-G13-007 — Virus/Malware Scanning, File-Type & Size Validation, Quarantine & Render Sandboxing

- **Module:** G13-DMS · **Primary Role(s):** Security/DLP Officer, System

**User Story:** As a Security Officer, I want every upload validated, malware-scanned, and processed in
resource-limited sandboxes before it becomes available.

**Description:** Validates file type by magic-byte sniffing, enforces per-type size caps (`VAL-FILE`), scans
every version via `ScanProvider` (ICAP/cloud), and enforces **archive/decompression limits** (R17). Infected
files are quarantined (encrypted, isolated). All content-processing (OCR/preview/render) runs in **sandboxed,
resource-limited workers**.

**Acceptance Criteria:**
1. File type determined by content signature; mismatched extension never trusted.
2. Files exceeding `max_size_mb` rejected pre-storage (`VAL-FILE`).
3. Every version scanned; only `CLEAN` versions become `current`/`ACTIVE`.
4. Infected files `QUARANTINED`, encrypted, hidden; Security notified via X.2 (`MSG-G13-QUARANTINE`).
5. Quarantine release requires Security/DLP approval.
6. On AV signature update, pending/quarantined items can be re-scanned.
7. Archive depth/ratio/nesting limits enforced; violations ⇒ `ERR-G13-RENDER_RESOURCE_LIMIT`, recorded in `scan_results` (R17).

**Business Rules:** BR-1 no `ACTIVE` with `scan_status≠CLEAN` (DI-11). BR-2 quarantined binaries never served.
BR-3 repeated infections raise a security alert. BR-4 OCR/preview/render run in ephemeral sandboxes with CPU/
memory/time caps; a breach cannot reach KMS or the metadata DB.

**Data Model:** `scan_results`, `documents`, `document_versions`.

**API:** `GET /api/v1/admin/quarantine`, `POST /api/v1/admin/quarantine/{id}:release`,
`POST /api/v1/documents/{id}:rescan`.

**LLD:** Sniff MIME + size guard (`VAL-FILE`) → archive depth/ratio guard → stream to AV → record verdict →
CLEAN promotes, INFECTED quarantines + alerts (X.2); all extraction in sandbox. Failure: AV down ⇒ keep
SCANNING + retry; infected ⇒ 422 `ERR-G13-MALWARE_DETECTED`; bomb ⇒ 422 `ERR-G13-RENDER_RESOURCE_LIMIT`. Dependencies: ScanProvider,
sandbox runtime, FR-G13-001/004.

---

### FR-G13-008 — Sandboxed OCR & Permission-Aware Search (Secured Index)

- **Module:** G13-DMS · **Primary Role(s):** All readers, DMS Librarian

**User Story:** As a user, I want to search documents by content and metadata with permission-aware results.

**Description:** Runs OCR (sandboxed, `OcrProvider`) on image/scan uploads, indexes content + metadata into a
full-text engine (`IndexProvider`) **encrypted at rest and access-scoped** (R7). **SECRET/TOP_SECRET full text
is excluded** (metadata-only) or routed to a separately-secured per-domain index; results are **post-filtered by
P02** (not rank suppression). Multi-language (en/hi/te) OCR.

**Acceptance Criteria:**
1. Scanned images/PDFs OCR'd in sandboxed workers; `ocr_status` reflects PENDING/DONE/FAILED/NOT_APPLICABLE.
2. Search returns only documents the principal may view (P02 + clearance filtered) with highlighted snippets.
3. Faceted filters (type, classification, date, folder, tag, owner); **cursor-paginated** (limit 25/100).
4. Metadata and OCR text searchable; restricted docs show metadata-only snippet.
5. Re-indexing on new versions and metadata changes.
6. Index encrypted at rest + access-scoped; SECRET/TOP_SECRET excluded from full-text (R7).
7. Multi-language detected (`language_code`) and indexed with the right analyzer.

**Business Rules:** BR-1 search never returns content a principal cannot access (P02 post-filter). BR-2 OCR
failure does not block storage. BR-3 sealed/quarantined excluded from non-privileged search. BR-4 no plaintext
SECRET/TOP_SECRET tokens in the shared index (R7).

**Data Model:** `document_versions`, `scan_results`, `documents`, `document_tags`.

**API:** `GET /api/v1/documents/search?q=&type=&class=&from=&to=&limit=&cursor=`,
`POST /api/v1/documents/{id}:reindex`, `GET /api/v1/documents/{id}/ocr`.

**LLD:** On version DONE → sandboxed extract/OCR → index (full-text for ≤CONFIDENTIAL; metadata-only SECRET+) →
query applies P02 ACL+clearance filter + facets → highlight. Failure: index down ⇒ fallback to metadata DB
search; OCR fail ⇒ mark FAILED. Dependencies: OcrProvider, IndexProvider (encrypted), **P02**.

---

### FR-G13-009 — Retention (M11 classes), Legal Hold (SoD + Future-Match) & Event-Driven Disposition

- **Module:** G13-DMS · **Primary Role(s):** DMS Librarian, Records Manager, Legal Hold Administrator, Legal Hold Approver

**User Story:** As a Records Manager, I want documents governed by **M11 retention classes**, frozen by legal
holds (gov extension, dual control + future-match capture), and disposed only via approved/certified process on a
confirmed anchor.

**Description:** Assigns **M11 retention classes** (`VAL-M11-RETENTION`), computes disposition-due dates from
**event-confirmed anchors** (R12), places/releases legal holds with **SoD on placement (high-value) and release**
via **P01** (R10), runs a **continuous-evaluation job** (`JOB-G13-HOLDEVAL`) that auto-adds future documents
matching `match_criteria` and issues custodian hold-notices (X.2) requiring acknowledgement (R11), and runs the
disposition maker-checker on **P01** ending in **`JOB-M11-RETENTION`** (flag due) → **`JOB-M11-DISPOSAL`**
(execute approved disposal / DPDPA erasure via P05 redaction marker). Holds always override disposition.

**Acceptance Criteria:**
1. A retention class is assignable at document/type/folder scope; effective class resolves most-specific-first.
2. `disposition_due_date` = anchor + period; permanent classes leave it null.
3. Placing a hold sets `legal_hold_count>0`, blocks disposition/delete/overwrite, marks assignment `HELD`; high-value holds require `placement_approved_by` (P01, R10).
4. Disposition requires proposal (Librarian) + approval (Records Manager) via P01, `proposed_by ≠ approved_by`.
5. Disposition executes only when no active hold AND confirmed anchor; produces a `disposition_records` row with certificate + tombstone via `JOB-M11-DISPOSAL` (DI-10, R12).
6. Releasing a hold requires `release_proposed_by` + distinct `release_approved_by` + mandatory `release_reason` (`VAL-G13-HOLD-SOD`, R10), then restores eligibility.
7. `JOB-G13-HOLDEVAL` auto-adds new documents matching an ACTIVE hold's `match_criteria` (`is_auto_added=true`) and issues `hold_notices` (X.2) requiring acknowledgement (R11).
8. Due dates (re)computed from `lifecycle_event_inbox` confirmed events; an unconfirmed/corrected anchor blocks auto-DESTROY (R12).

**Business Rules:** BR-1 hold overrides any retention/disposition (DI-4/DI-10). BR-2 statutory types (SR, PPO)
default permanent/REVIEW. BR-3 destruction is logical+physical (blob purged or crypto-shred if unshared,
tombstone + certificate). BR-4 hold release dual-control via P01 (DI-17). BR-5 auto-DESTROY blocked unless anchor
confirmed (DI-18). BR-6 overdue hold-notices escalate to LH Approver (X.2).

**Data Model:** `retention_policies`/`_assignments`, `legal_holds`/`_items`/`hold_notices`,
`lifecycle_event_inbox`, `disposition_records`, `documents`.

**API:** `POST /api/v1/retention-policies`, `POST /api/v1/documents/{id}/retention`,
`POST /api/v1/legal-holds` / `:release`, `:approve-placement`, `POST /api/v1/hold-notices/{id}:acknowledge`,
`POST /api/v1/documents/{id}/disposition:propose` / `:approve`.

**LLD:** Resolve effective class → consume confirmed anchor event → compute due → `JOB-M11-RETENTION` flags DUE →
P01 propose/approve → `JOB-M11-DISPOSAL` executes purge+certificate if no hold AND confirmed anchor;
`JOB-G13-HOLDEVAL` matches new docs, auto-holds, issues notices. Failure: hold present ⇒ 409 `ERR-G13-LEGAL_HOLD_ACTIVE`;
self-approve ⇒ 403 `ERR-G13-SOD_VIOLATION` (P01-enforced); release without checker ⇒ 403 `ERR-G13-HOLD_RELEASE_SOD`; permanent
destroy ⇒ 409 `ERR-G13-RETENTION_PERMANENT`; unconfirmed anchor ⇒ 409 `ERR-G13-ANCHOR_UNCONFIRMED`. Dependencies: G01/G09/G11
anchor events (outbox), FR-G13-014 (WORM), `JOB-M11-RETENTION/DISPOSAL`, P01, X.2.

---

### FR-G13-010 — E-Signature & Digital Signing (PAdES-LTV + RFC-3161 Timestamping) on DocumentGen Sign-off

- **Module:** G13-DMS · **Primary Role(s):** Document Owner, Employee (signer), Records Manager

**User Story:** As an officer, I want to send a document for one or more legally-valid signatures that remain
verifiable for decades, using the platform's existing sign-off machinery.

**Description:** Runs on the **`DocumentGen.generate / sign-off`** service (Platform §Y) over **P01 + W.1**
(document-generation = 23 configured doc-gen stages) and the M11 `signoff_transactions` model; signer-set
resolvability is enforced by **`VAL-M11-SIGNER`** and pending tasks reminded by **`JOB-M11-SIGNOFF-REMIND`**.
G13 **extends** this with the gov-statutory durability layer: **RFC-3161 trusted timestamping** and **PAdES-LTV**
(embedding OCSP/CRL + validation chain) so signatures verify after certificate expiry (R4). Methods restricted to
the type's `allowed_signature_types`; legal basis recorded per signature (R7).

**Acceptance Criteria:**
1. A signing request (P01 sign-off flow) defines ordered/parallel signers, fields, method (from `allowed_signature_types`), optional expiry; signer set resolvable (`VAL-M11-SIGNER`).
2. Signers notified (X.2 `MSG-M11-*` sign-off assigned) and sign in order; sequential blocks later signers.
3. On completion a new signed `document_version` (`version_kind=SIGNED`) is created; the request marks COMPLETED.
4. Each signature records signer, method, legal basis, certificate subject (DSC), signature hash (PAdES).
5. A decline halts the envelope with reason; an expiry cancels pending signatures; `JOB-M11-SIGNOFF-REMIND` nudges pending.
6. Tampering with a signed version is detectable (hash mismatch invalidates).
7. Statutory/WORM documents receive an RFC-3161 timestamp + PAdES-LTV revocation data in `signature_ltv_artifacts`; `ltv_status` reaches `LTV_ENABLED` (R4, `VAL-G13-LTV`).
8. `DRAWN` rejected for statutory types; DSC or Aadhaar eSign (IT Act §3A) required, basis recorded (R7).

**Business Rules:** BR-1 a type with `requires_signature=true` cannot be final until signed. BR-2 the signed
version is WORM-eligible. BR-3 signatures bind to a specific `version_id`. BR-4 statutory signatures must be
LTV-enabled before COMPLETE (`ERR-G13-SIGNATURE_LTV_REQUIRED`). BR-5 method must be in `allowed_signature_types`
(`ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`).

**Data Model:** `signature_requests` (`signoff_transactions`), `signatures`, `signature_ltv_artifacts`,
`document_versions`, `documents`.

**API:** `POST /api/v1/documents/{id}/signature-requests`, `POST /api/v1/signature-requests/{id}/sign`,
`:cancel`, `GET /api/v1/signature-requests/{id}`, `GET /api/v1/signatures/{id}/verify`.

**LLD:** Create envelope on the P01 sign-off flow → notify signer(s) (X.2) → on sign, `DocumentGen` applies PAdES
via SigningProvider → obtain RFC-3161 timestamp → embed OCSP/CRL (LTV) → store artifact → on last signer emit
signed version → mark COMPLETED. Failure: decline ⇒ 200 DECLINED; PKI/TSA down ⇒ X.3-mapped 500
`ERR-G13-SIGNING_SERVICE_UNAVAILABLE` / retry; tamper ⇒ 422 `ERR-G13-SIGNATURE_INVALID`; missing LTV ⇒ 422
`ERR-G13-SIGNATURE_LTV_REQUIRED`; bad method ⇒ 422 `ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`. Dependencies: **`DocumentGen` sign-off**,
`VAL-M11-SIGNER`, `JOB-M11-SIGNOFF-REMIND`, PKI/eSign provider, RFC-3161 TSA, FR-G13-004/014, P01/W.1, X.2.

---

### FR-G13-011 — Watermarking & Certified True Copies (v1)

- **Module:** G13-DMS · **Primary Role(s):** Records Manager, DMS Librarian, Security/DLP Officer

**User Story:** As a Records Manager, I want to issue watermarked, certified true copies of statutory records.

**Description:** Generates dynamic watermarks (user, timestamp, purpose) on previews/downloads/prints of
restricted documents and issues **certified true copies** (stamped, optionally LTV-signed renditions via
`DocumentGen`) with a certificate number, WORM-stored for statutory records. Certified copies are **v1**;
interactive redaction is **FR-G13-021 (Phase 2)** (R19).

**Acceptance Criteria:**
1. Restricted documents render with a dynamic watermark (viewer identity, timestamp, document number).
2. A certified true copy is a new derivative (`version_kind=CERTIFIED_COPY`) stamped "CERTIFIED TRUE COPY" with `certificate_no`, issuer, date, optionally e-signed (LTV via FR-010).
3. The original is never altered; the derivative links via `derived_from_version_id`.
4. Certified copies of statutory documents are WORM-stored (FR-G13-014).
5. Every issuance recorded in chained `document_audit` (P05).
6. Watermark mandatory (non-removable) for CONFIDENTIAL+ downloads/prints.

**Business Rules:** BR-1 only Records Manager certifies statutory true copies. BR-2 certified copies
inherit/raise classification. BR-3 watermark rendering in a sandboxed renderer (FR-G13-007).

**Data Model:** `document_versions`, `documents`, `signatures`/`signature_ltv_artifacts`, `document_audit`.

**API:** `POST /api/v1/documents/{id}:certified-copy`, `GET /api/v1/documents/{id}/render?watermark=1`
(audited proxy).

**LLD:** Render source → apply watermark/stamp to a derivative (`DocumentGen` rendition) → store as new version
(WORM if statutory) → optional LTV sign → chained audit. Failure: render fail ⇒ 422 `ERR-G13-RENDITION_FAILED`; wrong
role ⇒ 403. Dependencies: sandboxed renderer, FR-G13-010/014.

---

### FR-G13-012 — Access Audit (View/Download/Print/Share) & Compliance Reporting (P05)

- **Module:** G13-DMS · **Primary Role(s):** Auditor, Security/DLP Officer, Records Manager

**User Story:** As an Auditor, I want an immutable, tamper-evident record of every view, download, print and
share, queryable through the platform audit service.

**Description:** Records every access event (success or denied) to the **P05** substrate (`document_audit`
access rows + the platform `audit_log`/`security_audit_log` from DB-triggers on mutations), hash-chained
(FR-G13-020, tracking OPEN-PLAT-03) with actor, role, IP/user-agent, action, version, share context, result, and
`correlation_id`. Provides per-document access history, per-user activity, and compliance reports via **P05
`Audit.query / Audit.export`**. Immutable (P05: no UPDATE/DELETE; sole exception = DPDPA redaction marker).

**Acceptance Criteria:**
1. Every VIEW/PREVIEW/DOWNLOAD/PRINT/SHARE and metadata/lifecycle action writes one immutable, chained access row; mutations are captured by P05 DB-triggers.
2. Denied accesses recorded with `result=DENIED` + reason (and `security_audit_log`).
3. A document's access history viewable by Auditor/Records Manager/owner (own) via `Audit.query`.
4. Compliance reports: documents missing retention, overdue disposition, active holds, sensitive-access log, classification mix, audit-chain health, orphaned documents, DPDP requests.
5. The audit log cannot be updated/deleted (DI-3, P05); attempts fail and alert.
6. Audit data exportable (CSV/JSON) for a date/scope range via `Audit.export`, with chain-verification proof.

**Business Rules:** BR-1 print capture only on the platform watermarked print path; out-of-band printing
best-effort (Appendix D). BR-2 audit retention ≥ document retention and ≥ 7 years (P05). BR-3 reading the audit
trail is itself audited (P05).

**Data Model:** `document_audit`, `audit_anchors`, `documents`, `document_shares`, platform `audit_log`/`security_audit_log`.

**API:** `GET /api/v1/documents/{id}/audit`, `GET /api/v1/audit/documents?userId=&from=&to=&limit=&cursor=`,
`GET /api/v1/reports/compliance/{reportCode}`, `POST /api/v1/audit:export` (via `Audit.export`).

**LLD:** Every gateway access emits a chained access event to the durable P05 sink → reports aggregate over
`document_audit` + metadata via `Audit.query`. Failure: sink down ⇒ buffer + retry, never drop; tamper attempt ⇒
403 + alert; chain break ⇒ `ERR-G13-AUDIT_CHAIN_BROKEN`. Dependencies: **P05**, FR-G13-013/020.

---

### FR-G13-013 — Secure Sharing & Expiring Links (Anti-Brute-Force)

- **Module:** G13-DMS · **Primary Role(s):** Document Owner, DMS Librarian, Security/DLP Officer

**User Story:** As a document owner, I want to share a document with an internal user or via a time-limited,
optionally password-protected external link that resists guessing.

**Description:** Creates internal shares or external tokenised links with scoped rights, mandatory expiry for
external links, optional argon2id password and access-count cap, optional watermark, and full P05 audit.
**Anti-brute-force (R16):** failed password attempts increment `failed_attempt_count`; past threshold,
`status=LOCKED`/`locked_until`, alert Security (X.2). All served bytes go through the audited proxy and write
`document_audit` (R2).

**Acceptance Criteria:**
1. Internal share grants scoped rights to a named user without a public URL.
2. External link requires `expires_at`, stores only a hashed token.
3. Optional password (argon2id) and `max_access_count` enforced.
4. Accessing via a share writes chained `document_audit` with `share_id` and applies watermark if required.
5. Revoking a share immediately invalidates it.
6. DLP `BLOCK_SHARE` findings prevent external sharing of flagged documents.
7. After N (default 5) failed password attempts the link locks (`ERR-G13-SHARE_LOCKED`), sets `locked_until`, alerts Security (R16).

**Business Rules:** BR-1 CONFIDENTIAL+ external links require Security/DLP approval + watermark. BR-2 external
links cannot grant PRINT/UPDATE. BR-3 expired/revoked/locked links return 404 to anonymous callers (no leak).

**Data Model:** `document_shares`, `documents`, `dlp_findings`, `document_audit`.

**API:** `POST /api/v1/documents/{id}/shares`, `GET /api/v1/shared/{token}` (rate-limited),
`POST /api/v1/shares/{id}:revoke`, `GET /api/v1/documents/{id}/shares`.

**LLD:** Validate rights + DLP gate → generate opaque token, store `token_hash` → on access verify
hash/password/expiry/count/lockout → serve watermarked render via audited proxy → chained P05 audit. Failure:
expired/revoked ⇒ 404; over count ⇒ 403 `ERR-G13-SHARE_LIMIT_REACHED`; DLP block ⇒ 403 `ERR-G13-SHARE_BLOCKED_DLP`; locked ⇒ 429
`ERR-G13-SHARE_LOCKED`. Dependencies: FR-G13-006/011/012/016, X.2, RateLimiter.

---

### FR-G13-014 — Immutable WORM Storage for Statutory Documents (gov EXTENSION)

- **Module:** G13-DMS · **Primary Role(s):** Records Manager, Security/DLP Officer, System

**User Story:** As a Records Manager, I want statutory documents stored Write-Once-Read-Many with object-lock
retention, so they cannot be altered or deleted before lawful expiry, even by administrators.

**Description:** **This FR is entirely gov-specific — PrimeSoft M11 has no WORM.** Stores statutory documents in
WORM-locked object storage with `worm_retain_until`. WORM documents reject overwrite/supersede/delete/disposition
before the horizon; even Sys Admin/break-glass cannot mutate content. Legal holds extend immutability
indefinitely. The WORM guarantee is **proven on the actual CGG storage backend as a gating launch spike**
(§15.3).

**Acceptance Criteria:**
1. `is_worm=true` documents stored in `WORM_LOCKED` class with `worm_retain_until` set.
2. Any overwrite/version-mutate/delete/dispose before `worm_retain_until` is rejected.
3. WORM defaults applied automatically for statutory types (`is_worm_default=true`).
4. A legal hold on a WORM document blocks disposition even after `worm_retain_until`.
5. WORM status + retain-until visible/auditable (P05); retain-until can only extend (`VAL-G13-WORM`).
6. After retain-until and no hold, disposition follows the certified workflow (FR-G13-009).

**Business Rules:** BR-1 WORM immutability enforced at the storage layer (object-lock). BR-2 `worm_retain_until`
extend-only. BR-3 certified true copies of statutory records WORM by default.

**Data Model:** `documents`, `storage_objects`, `document_versions`, `disposition_records`.

**API:** `POST /api/v1/documents/{id}:declare-worm`, `:extend-retention`, `GET /api/v1/documents/{id}/worm-status`.

**LLD:** Declare ⇒ set object-lock + class + retain-until → all mutation paths check WORM guard. Failure: mutation
⇒ 409 `ERR-G13-WORM_IMMUTABLE`; shorten retain ⇒ 422 `ERR-G13-RETENTION_SHORTEN_FORBIDDEN`. Dependencies: object-lock-capable
storage (proven on CGG backend), FR-G13-004/009.

---

### FR-G13-015 — Domain-Scoped Deduplication, Integrity & Sandboxed Thumbnail/Preview

- **Module:** G13-DMS · **Primary Role(s):** System, DMS Librarian

**User Story:** As a system, I want to deduplicate identical content within a single security domain, verify
integrity by checksum, and generate previews in sandboxes.

**Description:** Computes SHA-256 over every blob and an **HMAC dedup index key** scoped to the security domain;
identical content within the same `security_domain` + `key_scope` reuses a single `storage_objects` row
(reference-counted); cross-domain identical content stored separately (R1). Periodic (`JOB-G13-INTEGRITY`) and
on-read integrity checks detect bit-rot/tampering. A sandboxed renderer (R17) produces thumbnails/previews. Dedup
never surfaced (R9).

**Acceptance Criteria:**
1. Uploading content identical to an existing blob **in the same domain** reuses it (`ref_count++`); cross-domain identical content is NOT deduplicated.
2. A blob is physically deleted only when `ref_count`=0 and no WORM/hold; crypto-shred only when `dek_shared=false`.
3. Stored `content_hash` verified on download and periodically (`JOB-G13-INTEGRITY`); mismatch flags `integrity_verified=false`, quarantines the version.
4. Thumbnails/multi-page previews generated in sandboxed workers, served per P02.
5. Preview never exposes content to unauthorised principals (P02 + clearance checked).
6. Integrity failures alert and block serving the affected version.
7. No user-visible signal (timing, message, ref_count) reveals dedup (R9).

**Business Rules:** BR-1 dedup on `dedup_index_key` within a domain; metadata/ACLs per-document. BR-2 WORM/held/
shared blobs never GC'd/crypto-shredded. BR-3 preview is a sandbox derivative; watermark for restricted docs.

**Data Model:** `storage_objects`, `document_versions`, `scan_results`, `documents`.

**API:** `GET /api/v1/documents/{id}/thumbnail`, `GET /api/v1/documents/{id}/preview?page=`,
`POST /api/v1/admin/integrity:scan`.

**LLD:** On store hash + HMAC domain key → domain-scoped dedup → reuse (set `dek_shared`) or create blob; on read
verify hash; render in sandbox with P02 + watermark. Failure: integrity mismatch ⇒ 422 `ERR-G13-INTEGRITY_FAILED` +
quarantine; render over-limit ⇒ 422 `ERR-G13-RENDER_RESOURCE_LIMIT`. Dependencies: object storage, sandboxed renderer,
FR-G13-007/011.

---

### FR-G13-016 — DLP, Content Lifecycle, Provider-Abstracted Engines & Corrected Attach/Fetch Contract

- **Module:** G13-DMS · **Primary Role(s):** Security/DLP Officer, DMS Librarian, Uploader (module service)

**User Story:** As a Security Officer and integrating developer, I want sensitive content detected (DLP), all
engines provider-abstracted, and a stable attach/fetch contract whose fetch makes "view" and "download"
structurally different.

**Description:** Runs DLP content inspection (`DlpProvider`) producing `dlp_findings`; manages content lifecycle;
exposes the **provider-abstracted** storage/AV/OCR/DLP/PKI layer (R13); and defines the **canonical, day-one-frozen
attach/fetch contract** — the document service every gov module consumes. The fetch contract (R2): callers MUST
specify `intent=VIEW|DOWNLOAD` (`VAL-G13-FETCH-INTENT`) and receive **structurally different** responses — VIEW
returns a short-TTL, one-time, session/user(+IP)-bound **streamed watermarked render URL through the audited
proxy** (no raw blob); DOWNLOAD returns a file only with the DOWNLOAD right. CONFIDENTIAL+ never returns a raw
forwardable blob URL, and every served byte writes `document_audit` (P05).

**Acceptance Criteria:**
1. DLP scans extracted text on ingest and new versions → `dlp_findings` (rule, severity, count, suggested action).
2. HIGH/CRITICAL PII findings auto-raise classification to ≥ CONFIDENTIAL (and set `security_domain`) and tag the document.
3. The storage layer is provider-agnostic: switching backend/tier never changes `document_id` or the API; AV/OCR/DLP/PKI likewise behind interfaces (R13).
4. Content lifecycle transitions follow §12.1 with chained P05 audit at every transition.
5. `:attach` lets any G01–G12 module bind a document, returning a stable `documentId`/`linkId`; accepts `Idempotency-Key`.
6. `:fetch` requires `intent`; VIEW returns a one-time short-TTL session-bound watermarked render URL via the audited proxy; DOWNLOAD returns a file ONLY with the DOWNLOAD right; neither returns a raw forwardable blob URL for CONFIDENTIAL+; every served byte audited (R2).

**Business Rules:** BR-1 DLP `BLOCK_SHARE` prevents external sharing until remediated. BR-2 storage tiering never
weakens encryption/WORM. BR-3 modules never receive raw storage keys — only `document_id` + short-lived,
session-bound, single-use signed render/download URLs through the audited proxy (R2). BR-4 a VIEW grant never
yields a downloadable file (R2).

**Data Model:** `dlp_findings`, `documents`, `storage_objects`, `document_links`.

**API:** `POST /api/v1/documents:attach`, `GET /api/v1/documents/{id}:fetch?intent=VIEW|DOWNLOAD`,
`GET /api/v1/documents/{id}/dlp`, `POST /api/v1/dlp-findings/{id}:resolve`.

**LLD:** Extract text → DLP rules → findings + auto-classify/tag → lifecycle transitions guarded by the state
machine → attach validates + links → fetch resolves intent: VIEW issues one-time session-bound render token
through the audited proxy; DOWNLOAD checks DOWNLOAD right (P02) then streams audited file. Failure: attach
incomplete ⇒ 422; missing intent ⇒ 422 `ERR-G13-FETCH_INTENT_REQUIRED`; download without right ⇒ 403; fetch disposed ⇒
404 `ERR-G13-DOCUMENT_DISPOSED`; DLP engine down ⇒ defer scan, store, block serving until scanned. Dependencies:
DLP/storage/AV/OCR/PKI providers, FR-G13-002/006/013, all G01–G12 modules (consumers), **P05**.

---

### FR-G13-017 — Principal Security-Clearance Management (GAP gov-specific, R3)

- **Module:** G13-DMS · **Primary Role(s):** Security/DLP Officer (maker), Records Manager (checker), Auditor

**User Story:** As a Security Officer, I want to grant, time-box, suspend and revoke a principal's document-domain
clearance through a maker-checker workflow, so **P02** has a real, audited `clearance_level` to gate
CONFIDENTIAL+ documents.

**Description:** Owns the gov `security_clearances` entity and a **P01 maker-checker** workflow to assign a
`clearance_level` (PUBLIC…TOP_SECRET) to a USER or RBAC ROLE, optionally org-scoped, with validity dates and
periodic recertification (`JOB-G13-CLEARANCE-RECERT`). Grants proposed by Security (maker), approved by Records
Manager (checker, maker≠checker via P01); every change writes chained audit (P05). **P02** reads
`effective_clearance_level` live; default INTERNAL when none.

**Acceptance Criteria:**
1. A grant specifies principal (USER/ROLE), `clearance_level`, optional org scope, justification, validity window.
2. Grants require a maker (Security) and a distinct checker (Records Manager) via P01; self-grant rejected (`ERR-G13-SOD_VIOLATION`).
3. ACTIVE clearance resolved live by P02; SUSPENDED/EXPIRED/REVOKED immediately removes CONFIDENTIAL+ access.
4. A principal with no clearance defaults INTERNAL.
5. Clearances support `valid_until` + periodic recert; lapses auto-expire to INTERNAL (`JOB-G13-CLEARANCE-RECERT`).
6. Every change writes chained `document_audit (CLEARANCE_CHANGE)` + `security_audit_log`.
7. TOP_SECRET requires two approvers and alerts.

**Business Rules:** BR-1 maker≠checker (DI-16, P01). BR-2 ROLE clearance applies to all users holding that RBAC
role within scope; USER overrides upward only. BR-3 clearance only satisfies the classification dimension — an
ALLOW ACL/relationship is still required (P02 deny-by-default). BR-4 recert overdue ⇒ auto-SUSPENDED + notify.

**Data Model:** `security_clearances`, `documents`, `document_audit`, `users`/`roles`.

**API:** `POST /api/v1/clearances:propose`, `:approve`, `:suspend`/`:revoke`,
`GET /api/v1/clearances?principal=&limit=&cursor=`.

**LLD:** Propose → checker approve via P01 (maker≠checker) → ACTIVE → P02 resolves effective level per principal
(TTL + invalidation on change); `JOB-G13-CLEARANCE-RECERT` expires/suspends on lapse. Failure: self-approve ⇒
403 `ERR-G13-SOD_VIOLATION`; unknown principal ⇒ 404; insufficient approvers (TOP_SECRET) ⇒ 422. Dependencies:
FR-G13-006 (P02 consumer), **P01**, X.2.

---

### FR-G13-018 — DPDP Data-Subject Requests & Erasure Precedence Lattice (GAP gov-specific, R8)

- **Module:** G13-DMS · **Primary Role(s):** Data Protection Officer (DPO), Records Manager, Auditor

**User Story:** As a DPO, I want to receive and adjudicate DPDP data-subject requests against a clear precedence
lattice, so we honour privacy rights without breaching statutory retention, legal holds, or WORM.

**Description:** Owns `data_subject_requests` (linked to platform `consent_records`) and implements the
**precedence lattice (DI-15)**: statutory retention / active legal hold / WORM-before-retain-until **override**
erasure (`EXEMPT_RETAINED` + `legal_basis_exemption`); only where none applies is erasure fulfilled — executed on
the **P05 right-to-erasure redaction-marker path + `JOB-M11-DISPOSAL`**, by **domain-local crypto-shred**
(`dek_shared=false`) or physical purge of the unshared blob. ACCESS/PORTABILITY assemble the subject's permitted
documents; RECTIFICATION routes corrections to the owning module.

**Acceptance Criteria:**
1. A request records subject, type, received timestamp (statutory clock), optional `consent_ref_id`.
2. ERASURE evaluates each in-scope document against the lattice; statutory/hold/WORM documents exempted (`EXEMPT_RETAINED`) with recorded basis.
3. Non-exempt documents erased via the P05 redaction-marker path + `JOB-M11-DISPOSAL` (crypto-shred when `dek_shared=false`, else physical purge); shared blobs never shredded (DI-6).
4. ACCESS/PORTABILITY assemble only entitled documents, watermarked, via the audited fetch path.
5. Every decision/erasure writes chained `document_audit (ERASURE)`; updates `documents.dpdp_erasure_state`; audit PII overwritten with the P05 redaction marker (Vision §2.7).
6. The lifecycle (RECEIVED→UNDER_REVIEW→EXEMPTED/PARTIALLY_FULFILLED/FULFILLED/REJECTED) is auditable/reportable.
7. The DPO who exempts ≠ the custodian who executes the purge (SoD, P01).

**Business Rules:** BR-1 statutory/hold/WORM always overrides erasure (DI-15). BR-2 crypto-shred only on
`dek_shared=false`. BR-3 tombstone + certificate retained. BR-4 ACCESS excludes sealed records the subject is
not entitled to see. **BR-5 statutory data has legally mandated retention — erasure applies to non-statutory data
only (Vision §2.7); statutory floors are never breached.**

**Data Model:** `data_subject_requests`, `documents`, `storage_objects`, `disposition_records`, `document_audit`,
`consent_records`.

**API:** `POST /api/v1/dsr`, `:adjudicate`, `:execute` (dual-control), `GET /api/v1/dsr/{id}`.

**LLD:** Register → enumerate subject documents → evaluate lattice per document → adjudicate (DPO) → execute
(P01 dual-control): crypto-shred/purge non-exempt unshared blobs via `JOB-M11-DISPOSAL` + P05 redaction marker,
mark exempt with basis → chained audit. Failure: erasure of held/WORM ⇒ `EXEMPT_RETAINED`; crypto-shred of shared
blob ⇒ blocked (metadata-only removal); self-execute ⇒ 403 `ERR-G13-SOD_VIOLATION`. Dependencies: FR-G13-009/014/005,
**P05 redaction path**, **`JOB-M11-DISPOSAL`**, `consent_records`, G01 (subject).

---

### FR-G13-019 — Orphaned-Document Lifecycle (Orphan Reaper) (GAP gov-specific, R15)

- **Module:** G13-DMS · **Primary Role(s):** DMS Librarian, Records Manager, System

**User Story:** As a Records Manager, I want documents that lose all module links to enter a defined orphan
lifecycle with a default retention and a review queue.

**Description:** When `documents.link_count` reaches 0 and no retention/hold/WORM governs it, the document
transitions to `ORPHANED`, receives a default orphan retention class, and enters a review queue. A periodic
**`JOB-G13-ORPHAN`** (X.1) surfaces orphans for Librarian review; a Records Manager may re-home, retain, or route
to disposition (never auto-destroy).

**Acceptance Criteria:**
1. A document whose `link_count` drops to 0 and that is not WORM/held transitions to `ORPHANED` + default orphan retention class.
2. Orphans appear in a review queue with last-known links, owner, age.
3. A Librarian/Records Manager may re-link, retain with a new class, or propose disposition (P01 maker-checker).
4. Orphans are never auto-destroyed; disposition follows FR-G13-009.
5. WORM/held documents never become orphans regardless of `link_count`.
6. Every transition writes chained audit (P05); an "Orphaned documents" report lists current orphans.

**Business Rules:** BR-1 ORPHANED reversible by re-linking (→ ACTIVE). BR-2 default orphan retention configurable
(e.g., 1 year REVIEW), never below statutory floor. BR-3 orphan reaping is a review surface, not an auto-destroyer.

**Data Model:** `documents`, `document_links`, `retention_assignments`, `document_audit`.

**API:** `GET /api/v1/admin/orphans`, `POST /api/v1/documents/{id}:rehome`, `POST /api/v1/admin/orphans:scan`.

**LLD:** On detach decrement `link_count` → if 0 and not WORM/held → set ORPHANED + default class → enqueue
review; `JOB-G13-ORPHAN` reconciles `link_count` vs links. Failure: re-home to disposed entity ⇒ 409; dispose
orphan under hold ⇒ 409 `ERR-G13-LEGAL_HOLD_ACTIVE`. Dependencies: FR-G13-003/009, X.1.

---

### FR-G13-020 — Audit Hash-Chain Integrity & External Anchoring (GAP gov-specific, R5; tracks OPEN-PLAT-03)

- **Module:** G13-DMS · **Primary Role(s):** Auditor, Security/DLP Officer, System

**User Story:** As an Auditor, I want the access-audit trail cryptographically tamper-evident and periodically
anchored outside the database.

**Description:** Maintains the `document_audit` **hash chain** (`row_hash` = SHA-256 over canonical payload ‖
prior `row_hash`) on the P05 substrate and a periodic **anchoring job** (`JOB-G13-ANCHOR`) that computes a Merkle
root over each window and writes it to `audit_anchors`, anchored to WORM/external notary/RFC-3161 TSA. A
**verification job** (`JOB-G13-CHAINVERIFY`) recomputes and compares; any mismatch raises `ERR-G13-AUDIT_CHAIN_BROKEN`
and alerts. **This implements the platform OPEN-PLAT-03 proposal (hash-chaining of audit partitions, chain head
to WORM) for the gov-statutory tier rather than inventing a parallel mechanism.**

**Acceptance Criteria:**
1. Every `document_audit` insert computes `row_hash` chained to `prev_hash`; append-only (P05).
2. `JOB-G13-ANCHOR` summarises each contiguous window into an `audit_anchors` digest anchored to WORM/notary/TSA.
3. `JOB-G13-CHAINVERIFY` recomputes a range and compares; a break sets `verification_status=BROKEN` + `ERR-G13-AUDIT_CHAIN_BROKEN` + alert.
4. Auditors can request on-demand verification for a date/scope range and receive pass/fail + offending `seq_no`.
5. Anchors are immutable (WORM/notary receipts retained).
6. e-discovery exports (FR-G13-012) include anchor references + verification proof.

**Business Rules:** BR-1 chain genesis uses a fixed `prev_hash`; ordering by `seq_no`. BR-2 anchoring cadence
configurable. BR-3 a detected break never auto-repairs — investigated as a security incident.

**Data Model:** `document_audit`, `audit_anchors`.

**API:** `POST /api/v1/audit:verify?from=&to=`, `GET /api/v1/audit/anchors`, `POST /api/v1/admin/audit:anchor`.

**LLD:** Insert computes `row_hash` from prior row → `JOB-G13-ANCHOR` builds Merkle root per window → writes
`audit_anchors` to WORM/notary/TSA → `JOB-G13-CHAINVERIFY` recomputes + compares. Failure: chain break ⇒
`ERR-G13-AUDIT_CHAIN_BROKEN` (500) + incident alert; anchor target down ⇒ retry/buffer. Dependencies: **P05**,
FR-G13-014 (WORM anchor sink), RFC-3161 TSA, X.1. **Open dependency: confirm OPEN-PLAT-03 before build (Platform §Z).**

---

### FR-G13-021 — Interactive Redaction Studio (Phase 2 / Fast-Follow) (R19)

- **Module:** G13-DMS · **Primary Role(s):** DMS Librarian, Security/DLP Officer, Records Manager

**Phasing note:** Fast-follow (Phase 2), deferred from the launch core (R19). Until it ships, disclosure/RTI needs
are served by certified true copies (FR-G13-011) + manual interim redaction. Specified in full so the contract is
stable.

**User Story:** As a Librarian, I want to produce a redacted derivative where selected regions are irreversibly
removed and verified-removed.

**Description:** Produces a **redacted derivative version** (`version_kind=REDACTED`) where selected regions are
burned out of a rasterised render (`DocumentGen` rendition) and re-OCR'd to **verify the redacted text is
unrecoverable**. The original is never altered; the derivative inherits/raises classification. Runs in the
sandboxed renderer (FR-G13-007).

**Acceptance Criteria:**
1. Redaction produces a new `REDACTED` derivative with selected regions burned out; redacted text not recoverable.
2. The derivative is re-OCR'd and diffed to confirm removal; incomplete ⇒ `ERR-G13-REDACTION_INCOMPLETE`.
3. The original is never altered; derivative links via `derived_from_version_id`.
4. Derivatives inherit/raise classification.
5. Every redaction recorded in chained `document_audit` (P05).
6. Redaction of a WORM/held source allowed (read-only source; derivative is a new object).

**Business Rules:** BR-1 redaction irreversible by construction (burned raster). BR-2 re-OCR verification
mandatory. BR-3 runs in the sandboxed renderer (R17).

**Data Model:** `document_versions`, `documents`, `document_audit`.

**API:** `POST /api/v1/documents/{id}:redact`, `GET /api/v1/documents/{id}/redactions`.

**LLD:** Rasterise → burn regions → re-OCR derivative → diff against redacted regions → store derivative (WORM if
statutory) → chained audit. Failure: recoverable redaction ⇒ 422 `ERR-G13-REDACTION_INCOMPLETE`; render fail ⇒ 422
`ERR-G13-RENDITION_FAILED`. Dependencies: sandboxed renderer, OCR, FR-G13-011/014.

---

## 7. UI Requirements

### 7.1 Screen inventory

| Screen | Purpose | Primary FRs | Surfaced via |
|--------|---------|-------------|--------------|
| Document Explorer (tree + grid) | Browse cabinets/folders, thumbnails, search | 003, 008, 015 | Foundation §6 "Documents" menu |
| Upload / Bulk Upload | Drag-drop, scanner, mobile capture, metadata (W.2 form) | 001, 002 | W.2 form-bound |
| Document Detail | Preview, metadata, versions, ACLs, P05 audit, lifecycle | 004, 006, 012, 016 | |
| Version History | Timeline, (optional) check-in/out, supersede, compare | 004 | |
| Permissions Panel | Effective access (incl. clearance) explainer | 006, 017 | P02 access:check |
| Clearance Admin | Grant/approve/suspend principal clearances | 017 | P01 maker-checker queue |
| Classification & Tags | Reclassify (P01 maker-checker), tag editor, DLP findings | 002, 016 | |
| Retention & Holds Console | Classes, assignments, holds (dual-control + future-match), disposition queue | 009, 014 | |
| Hold Notice Tracker | Custodian preservation notices + acknowledgements | 009 | X.2 |
| Signature Center | `DocumentGen` sign-off setup, sign action, LTV verify, progress | 010 | P01/W.1 doc-gen stages |
| Certified Copy | Issue certified true copy (v1); redaction entry (Phase 2 stub) | 011, 021 | |
| Share Manager | Create/revoke internal & external shares, lockout status | 013 | |
| Quarantine Console | Review/release infected uploads | 007 | |
| Auditor / Compliance Dashboard | P05 access trail, chain health, compliance reports, exports | 012, 020 | P05 `Audit.query` |
| DSR Console | DPDP data-subject requests + lattice outcomes | 018 | `consent_records` |
| Orphan Review Queue | Zero-link documents review/re-home | 019 | `JOB-G13-ORPHAN` |
| Admin (Types, Storage, Keys, Key-DR) | Taxonomy, storage tiers, encryption + key-DR posture | 002, 005, 016 | |

### 7.2 Cross-cutting UI rules (canonical UI-state standard, Foundation §3)

- **Five canonical states on every screen:** empty, loading (skeleton, no layout shift), **error** (inline from an
  `ERR-*` id + retry, never a raw stack), **no-permission** (gating menu hidden; deep-linked forbidden shows
  `ERR-FORBIDDEN`, not a 404 leak), **partial-data** (render what is authorised, mask the rest per RBAC §3.9 — never
  fail the whole screen). **No skeleton-only UI** — real fields, data, API calls, states.
- WCAG 2.1 AA; keyboard-navigable tree/grid; focus-visible; screen-reader labels; responsive 375/768/1280;
  touch ≥ 44×44.
- Classification badge + status icons (WORM/held/sealed/orphaned) on every document surface.
- **Masked fields** per RBAC §3.9 / P02 (masked-own-view: owner sees Tier-1 IDs masked on screen, may export full
  record unmasked); the access explainer names the failing dimension (RBAC / clearance / ACL / need-to-know).
- Dynamic watermark always visible on restricted previews/downloads/prints; VIEW renders are streamed (no file).
- `E·AR` fields (e.g. linked Aadhaar/PAN/bank metadata) render read-only with a "Request change" control routing
  to the P01 sensitive-changes flow — never a direct write.
- Destructive/lifecycle actions (dispose, release hold, downgrade, clearance revoke, DSR execute) require
  confirmation + reason (`VAL-COMMENT`) and show the SoD second-approver step (P01).
- All lists **cursor-paginated** (limit 25/100) with facets/filters; `DD-MMM-YYYY` dates; user-locale rendering.

---

## 10. API & Integration

### 10.1 Conventions (platform-adopted, Foundation §1)

- Base path `/api/v1`; JSON over HTTPS (TLS 1.2+); OIDC/JWT bearer auth; **P02** RBAC + org scope + clearance.
- **Cursor pagination only** (`?limit=` default 25, max 100, `cursor=`; response `next_cursor`). Offset paging not used.
- Binaries only via short-lived, single-use, session/user-bound signed render/download URLs through the **audited
  proxy** (never a raw blob URL).
- **`Idempotency-Key`** header on all unsafe POSTs that create a transaction (24h replay returns the original).
- **`X-Correlation-Id`** carried/assigned per request, echoed in the response header, written to every P05 audit line.
- Action-style endpoints use the `:verb` suffix (`:attach`, `:checkin`, `:fetch`). `:fetch` REQUIRES
  `intent=VIEW|DOWNLOAD` (`VAL-G13-FETCH-INTENT`, R2).
- Endpoints never re-implement permission logic — they call `Authorization.check` (P02).

### 10.2 Canonical error envelope (Foundation §1)

```json
{ "error": { "code": "ERR-G13-WORM_IMMUTABLE", "message": "Document is under WORM lock until 2046-04-01.", "field": "documentId", "details": {} } }
```

> The correlation id is returned in the **`X-Correlation-Id` response header**, **not** a body `requestId` field
> (Reconciliation §C override of the v2 envelope).

### 10.3 Error-code catalog

**Standard platform codes (Foundation §1):** `VALIDATION_FAILED(422)`, `UNAUTHENTICATED(401)`, `FORBIDDEN(403)`,
`NOT_FOUND(404)`, `CONFLICT(409)`, `PRECONDITION_FAILED(412)`, `RATE_LIMITED(429)`, `INTERNAL(500)`. No 503 —
upstream-engine (KMS/PKI/TSA/storage) failures map via X.3 to 500 / `ERR-LOADFAIL`.

**Module-specific `ERR-G13-*` codes (in addition).** Each module code is namespaced `ERR-G13-<NAME>` and mapped
onto exactly one of the 8 standard HTTP codes above; the **Meaning** column is the message id rendered in the
envelope `message`. No module code carries a non-standard HTTP status (no 400/503 — upstream failures collapse to
`INTERNAL 500` via X.3 retry).

| `ERR-G13-*` code | HTTP | Message id (Meaning) |
|------|------|---------|
| `ERR-G13-INVALID_FILE_TYPE` | 422 | MIME not in type whitelist (`VAL-FILE`) |
| `ERR-G13-FILE_TOO_LARGE` | 422 | Exceeds type size cap (`VAL-FILE`) |
| `ERR-G13-EMPTY_FILE` | 422 | Zero-byte/corrupt upload |
| `ERR-G13-FETCH_INTENT_REQUIRED` | 422 | `:fetch` without `intent=VIEW\|DOWNLOAD` (R2) |
| `ERR-G13-METADATA_INVALID` | 422 | Metadata fails type W.2/JSON-Schema |
| `ERR-G13-MALWARE_DETECTED` | 422 | AV flagged the upload |
| `ERR-G13-RENDER_RESOURCE_LIMIT` | 422 | Archive/decompression/nesting limit exceeded (R17) |
| `ERR-G13-INTEGRITY_FAILED` | 422 | Checksum mismatch (tamper/bit-rot) |
| `ERR-G13-DOCUMENT_LOCKED` | 409 | Checked out by another user |
| `ERR-G13-CHECKOUT_NOT_SUPPORTED` | 409 | Type `checkout_mode=NONE` |
| `ERR-G13-WORM_IMMUTABLE` | 409 | Mutation/delete blocked by WORM lock |
| `ERR-G13-RETENTION_SHORTEN_FORBIDDEN` | 422 | Attempt to reduce retain-until (`VAL-G13-WORM`) |
| `ERR-G13-RETENTION_PERMANENT` | 409 | Destroy attempted on permanent record |
| `ERR-G13-LEGAL_HOLD_ACTIVE` | 409 | Action blocked by active legal hold |
| `ERR-G13-HOLD_RELEASE_SOD` | 403 | Hold release missing distinct approver (R10) |
| `ERR-G13-ANCHOR_UNCONFIRMED` | 409 | Auto-DESTROY blocked; retention anchor not confirmed (R12) |
| `ERR-G13-SOD_VIOLATION` | 403 | Maker == checker / self-approval (P01-enforced) |
| `ERR-G13-CLASSIFICATION_LOCKED` | 403 | Unauthorised downgrade |
| `ERR-G13-CLEARANCE_INSUFFICIENT` | 403 | Principal clearance < document classification (R3) |
| `ERR-G13-DOCUMENT_NOT_ATTACHABLE` | 409 | Document deleted/disposed/orphaned |
| `ERR-G13-LINK_CONFLICT` | 409 | Duplicate primary link |
| `ERR-G13-SHARE_BLOCKED_DLP` | 403 | DLP blocks external share |
| `ERR-G13-SHARE_LIMIT_REACHED` | 403 | Access-count/expiry exceeded |
| `ERR-G13-SHARE_LOCKED` | 429 | Share password brute-force lockout (R16) |
| `ERR-G13-BREAK_GLASS_LOCKED` | 429 | Break-glass auth brute-force lockout (R16) |
| `ERR-G13-SIGNATURE_INVALID` | 422 | Signed content tampered |
| `ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED` | 422 | Method not in type's allowed list (R7) |
| `ERR-G13-SIGNATURE_LTV_REQUIRED` | 422 | Statutory signature missing timestamp/LTV (R4) |
| `ERR-G13-SIGNING_SERVICE_UNAVAILABLE` | 500 | PKI/eSign down (X.3-mapped) |
| `ERR-G13-KEY_SERVICE_UNAVAILABLE` | 500 | KMS unavailable (X.3-mapped) |
| `ERR-G13-RENDITION_FAILED` | 422 | Watermark/redaction/preview render failed |
| `ERR-G13-REDACTION_INCOMPLETE` | 422 | Re-OCR found recoverable text (R19/FR-021) |
| `ERR-G13-AUDIT_CHAIN_BROKEN` | 500 | Audit hash-chain verification failed (R5) |
| `ERR-G13-ERASURE_EXEMPTED` | 409 | DPDP erasure overridden by statutory/hold/WORM basis (R8) |
| `ERR-G13-DOCUMENT_DISPOSED` | 404 | Fetch of disposed document |

> All `ERR-G13-*` ids and `VAL-G13-*`/`JOB-G13-*`/`MSG-G13-*` ids are registered in the Foundation §2/§4/§5 indexes.
>
> **Cross-module collision resolved (R4):** the document-signature failure is namespaced **`ERR-G13-SIGNATURE_INVALID`**
> so the bare string no longer collides with the G12 order-signature concept. **G12 owns `ERR-G12-…`** (its SR/
> order-signature codes); G13 never emits or redefines a `G12` code, and G12 never emits an `ERR-G13-*` code.

### 10.4 Representative request/response examples

**Module attach (G02 proof for a personal-detail change):**

```http
POST /api/v1/documents:attach
Content-Type: multipart/form-data
Idempotency-Key: 7c1f...e2
X-Correlation-Id: corr-a1b2c3

{ "documentTypeCode": "ID_PROOF", "title": "Aadhaar – EMP-3001",
  "moduleCode": "G02", "entityName": "change_requests", "entityRefId": "cr-5501",
  "linkRole": "PROOF", "isPrimary": true, "classification": "CONFIDENTIAL" }
  + file=<binary>
```

```json
{ "documentId": "doc-0001", "docNo": "DOC/2026/0001001",
  "linkId": "lk-01", "status": "SCANNING", "currentVersionNo": 1,
  "securityDomain": "DOM_CONFIDENTIAL" }
```
*(Correlation id returned in the `X-Correlation-Id` response header.)*

**Fetch — VIEW intent (R2: streamed, watermarked, one-time, session-bound render; no raw blob):**

```json
{ "documentId": "doc-0001", "title": "Aadhaar – EMP-3001", "classification": "CONFIDENTIAL",
  "status": "ACTIVE", "currentVersionNo": 1, "mimeType": "application/pdf",
  "renderUrl": "https://dms.gov/api/v1/proxy/render/ot_9f1a...?bind=sess_44ab",
  "renderUrlMode": "STREAM_WATERMARKED", "oneTimeUse": true,
  "boundSession": "sess_44ab", "renderUrlExpiresAt": "2026-04-12T10:10:00Z",
  "downloadAvailable": false }
```

**Fetch without intent (rejected — note 422, platform code):**

```json
{ "error": { "code": "ERR-G13-FETCH_INTENT_REQUIRED", "message": "Specify intent=VIEW or intent=DOWNLOAD.", "field": "intent", "details": {} } }
```

**Clearance-insufficient access (rejected, P02 gate):**

```json
{ "error": { "code": "ERR-G13-CLEARANCE_INSUFFICIENT", "message": "Clearance INTERNAL is below document classification CONFIDENTIAL.", "field": "clearance", "details": {} } }
```

**DPDP erasure exempted by statutory basis:**

```json
{ "dsrId": "dsr-01", "status": "EXEMPTED", "erasureMethod": "EXEMPT_RETAINED",
  "legalBasisExemption": "Statutory Service Register permanent retention", "affectedDocumentCount": 4 }
```

### 10.5 Integration contracts

| Consumer | Integration | Direction |
|----------|-------------|-----------|
| G01–G12 | `documents:attach` / `:fetch?intent=` (binaries by reference) | Modules → G13 |
| G01 | `EMPLOYEE_RETIRE` / `EMPLOYEE_MERGE` lifecycle events (anchor recompute) | G01 → G13 (platform outbox) |
| G09 | Charge-sheets, exhibits, sealed PI reports; `CASE_CLOSE` events | G09 → G13 |
| G11/G12 | PPO, SR pages, certified copies (WORM); `EMPLOYEE_RETIRE` confirmation | G11/G12 → G13 |
| G14 | Compliance metrics (read-only, `analytics.*`) | G13 → G14 |
| Platform | **P01** (doc-gen/sign-off/maker-checker), **P02** (Authorization.check), **P04** (KMS/AV/OCR/PKI creds), **P05** (audit/redaction), **P06** (migration), **X.1/X.2/X.3**, **`DocumentGen.generate / sign-off`**, `notifications`, `consent_records`, KMS, AV, OCR, DLP, PKI, RFC-3161 TSA, object storage | bidirectional |

> **Lifecycle event contract (R12):** events delivered at-least-once via the platform outbox/event bus,
> de-duplicated by `dedupe_key` into `lifecycle_event_inbox`; only `is_confirmed=true` events flip
> `documents.anchor_confirmed` and unblock auto-DESTROY. `ANCHOR_CORRECTION` events recompute due dates.

---

## 11. Non-Functional Requirements (platform NFR baseline, Vision §2.9 / BRD §7)

| Category | Requirement |
|----------|-------------|
| Performance | **p95 < 500 ms @ 300 concurrent** for metadata ops; read-heavy p95 < 300 ms cached / < 1000 ms uncached; writes p95 < 1500 ms; upload 250 MB resumable; preview first-page < 2 s; search p95 < 800 ms; web LCP < 2.5 s (4G) |
| Scalability | Horizontal API scaling; object storage to PB scale; domain-scoped dedup keeps growth sub-linear |
| Availability | **99.5%/month uptime**; degrade gracefully (metadata search if index down; resumable upload on storage blips). KMS named top-tier risk (R6): no single CMK loss may darken the archive — multi-region/HSM escrow + tested recovery runbook |
| Durability | Object storage ≥ 11 nines with cross-zone replication; **RTO < 4 h, RPO < 1 h**; CMK escrow restore tested quarterly |
| Security | Envelope encryption (AES-256-GCM) + KMS; TLS 1.2+; OWASP ASVS L2; **P02** deny-by-default + PII ceiling + field mask on serialization; clearance gate; hash-chained + anchored audit (OPEN-PLAT-03); encrypted access-scoped search index excluding SECRET+ full text; anti-brute-force; sandboxed render workers; no raw storage keys to clients; VIEW/DOWNLOAD structurally separated |
| Privacy | DPDP 2023 alignment; DLP PII detection + minimisation; **P05 right-to-erasure redaction-marker path**; `consent_records`; data-subject-request lifecycle + erasure precedence lattice; no dedup existence oracle |
| Data Residency | All data and all replicas (cross-zone, escrow, index, audit anchors) reside **in-country** (DPDP localisation); no provider/COTS adapter may move PII out of the sovereign boundary (R21) |
| Compliance | Statutory retention (M11 classes, never below floor); WORM immutability (proven on CGG backend); certified destruction; immutable, anchored P05 audit (≥ 7 yr); e-discovery export with chain proof; IT Act §3A signatures (LTV-durable) |
| Audit completeness | 100% mutation capture (P05 DB-trigger, zero gaps) + gov access-audit |
| Integrity | SHA-256 checksums; periodic integrity scans (`JOB-G13-INTEGRITY`); tamper detection blocks serving; audit hash-chain verification |
| Accessibility | WCAG 2.1 AA across all screens |
| Observability | Metrics on ingest/scan/OCR latency, quarantine rate, integrity failures, disposition backlog, audit-chain health, key-DR posture, hold-notice ack SLA, DSR SLA, dead-letter depth (per Platform §0.5); `JOB-FAIL`→`MSG-SYS-JOBFAIL` |
| Maintainability | Provider-abstracted storage + AV + OCR + DLP + PKI; versioned `document_types` (W.2) schemas; API `/v1` stability; thin orchestration core consuming platform engines |
| Deletions | Soft delete only — no hard delete (platform rule) |

---

## 12. Workflow & State Diagrams (State Tables)

> Maker-checker transitions execute as **configured P01 flows (W.1)** with SoD enforced by P01/P02.

### 12.1 Document lifecycle (`document_status`)

| From | Event | To | Guard / Side effect |
|------|-------|----|----|
| (none) | Upload accepted | DRAFT | `VAL-FILE` passed |
| DRAFT | Scan starts | SCANNING | AV queued (archive guards) |
| SCANNING | Scan CLEAN | ACTIVE | Sandboxed OCR/preview enqueued (X.1); P05 captures; chained audit VERSION_ADD |
| SCANNING | Scan INFECTED | QUARANTINED | Isolate + notify Security (X.2) |
| QUARANTINED | Released (Security) | ACTIVE | Override-with-reason audited |
| ACTIVE | Check-out (lockable types) | CHECKED_OUT | Exclusive lock |
| CHECKED_OUT | Check-in | ACTIVE | New version; lock released |
| ACTIVE | New version supersedes | ACTIVE | Prior version → SUPERSEDED |
| ACTIVE | Legal hold placed | ON_LEGAL_HOLD | Disposition frozen |
| ON_LEGAL_HOLD | Hold released (P01 dual-control) | ACTIVE | Recompute due date |
| ACTIVE | Last link detached (not WORM/held) | ORPHANED | Default orphan class + review queue (R15) |
| ORPHANED | Re-home / re-link | ACTIVE | Returns to active (R15) |
| ACTIVE | Disposition due | DISPOSITION_DUE | No active hold; anchor confirmed (`JOB-M11-RETENTION`) |
| DISPOSITION_DUE | Disposition executed | DISPOSED/ARCHIVED | Certificate + tombstone (`JOB-M11-DISPOSAL`; crypto-shred if unshared) |
| ACTIVE | Soft delete | DELETED | Not allowed if WORM/hold |

### 12.2 Version state table

| From | Event | To |
|------|-------|----|
| (none) | Check-in / add | CURRENT |
| CURRENT | New version added | SUPERSEDED |
| CURRENT | Supersede (re-scan) | SUPERSEDED (kept for audit) |
| CURRENT | Certified-copy / redact / sign derivative | CURRENT (derivative is a new linked version) |

### 12.3 Legal hold state table (placement + release SoD on P01, R10)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Place (standard) | ACTIVE | LH Admin; `legal_hold_count++`, doc→ON_LEGAL_HOLD |
| (none) | Place (high-value) | PENDING_APPROVAL | LH Admin proposes (P01) |
| PENDING_APPROVAL | Approve placement | ACTIVE | LH Approver (≠ placer, P01) |
| ACTIVE | Continuous-eval future match | ACTIVE | `JOB-G13-HOLDEVAL` auto-adds item + custodian notice (X.2) |
| ACTIVE | Propose release | RELEASE_PROPOSED | `release_proposed_by` + reason |
| RELEASE_PROPOSED | Approve release | RELEASED | `release_approved_by ≠ proposer` (P01); `legal_hold_count--`; recompute due |

### 12.4 Disposition state table

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Propose | PROPOSED | Librarian (P01); doc DISPOSITION_DUE |
| PROPOSED | Approve | APPROVED | Records Mgr; maker≠checker (P01); no hold; anchor confirmed |
| PROPOSED | Reject | REJECTED | With reason |
| APPROVED | Execute | EXECUTED | No hold; confirmed anchor; `JOB-M11-DISPOSAL` purge/crypto-shred + certificate + tombstone |
| any | Hold present | BLOCKED_HOLD | Abort execution |

### 12.5 Signature request state table (on `DocumentGen` sign-off / P01)

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

### 12.7 Clearance state table (R3; P01 maker-checker)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Propose | PENDING_APPROVAL | Security (maker) |
| PENDING_APPROVAL | Approve | ACTIVE | Records Mgr (≠ maker, P01); TOP_SECRET needs 2 approvers |
| ACTIVE | Recert overdue | SUSPENDED | `JOB-G13-CLEARANCE-RECERT`; notify Security |
| ACTIVE | valid_until passed | EXPIRED | Auto → effective INTERNAL |
| ACTIVE/SUSPENDED | Revoke | REVOKED | With reason |

### 12.8 DSR state table (R8)

| From | Event | To | Guard |
|------|-------|----|----|
| (none) | Register | RECEIVED | Clock starts |
| RECEIVED | DPO review | UNDER_REVIEW | |
| UNDER_REVIEW | All in-scope exempt | EXEMPTED | Statutory/hold/WORM basis recorded |
| UNDER_REVIEW | Mixed outcome | PARTIALLY_FULFILLED | Some erased (P05 redaction + `JOB-M11-DISPOSAL`), some exempt |
| UNDER_REVIEW | All erasable | FULFILLED | Crypto-shred/purge (unshared) |
| UNDER_REVIEW | Not actionable | REJECTED | With reason |

### 12.9 Lifecycle-event inbox state table (R12)

| From | Event | To |
|------|-------|----|
| (none) | Event received | RECEIVED |
| RECEIVED | Processed (anchor recompute) | PROCESSED |
| RECEIVED | Processing error | FAILED |
| FAILED | Retries exhausted | DEAD_LETTER |

---

## 13. Notifications (X.2 / W.3; reuse `MSG-M11-*`, author `MSG-G13-*`)

Channels per BRD §9.1 (IN_APP + EMAIL fire in parallel for approvals); EMAIL for approval-workflow and statutory
notices is **mandatory / non-suppressible** (Platform §X.2, BRD §9.9). Templates referenced by `MSG-*` id;
recipient/channel/timing resolved by **W.3**; delivered by **X.2** (retry ×5 + dead-letter; every dispatch audited).

| Event | Recipient | Channel | Template id |
|-------|-----------|---------|-------------|
| Letter/document generated → vault | Issuer | In-app + email | **`MSG-M11-*`** (letter-issued) reuse |
| Sign-off assigned / reminder / declined | Signer / originator | In-app + email | **`MSG-M11-*`** reuse; `JOB-M11-SIGNOFF-REMIND` |
| Disposal due | Records Manager, Librarian | In-app | **`MSG-M11-*`** (disposal-due) reuse |
| Upload quarantined (malware) | Security/DLP, uploader | In-app + email | `MSG-G13-QUARANTINE` |
| Reclassification (downgrade) pending | Second approver | In-app | `MSG-G13-RECLASS-APPROVE` |
| Check-out auto-expiry | Lock holder | In-app | `MSG-G13-LOCK-EXPIRE` |
| Disposition approval requested | Records Manager | In-app | `MSG-G13-DISPOSE-APPROVE` |
| Legal hold placed / release proposed / released | Records Mgr, LH Approver, custodians | In-app + email | `MSG-G13-HOLD-STATUS` |
| Hold preservation notice / overdue | Custodian / LH Approver | In-app + email | `MSG-G13-HOLD-NOTICE` |
| Share created / expiring / locked | Recipient/owner, Security | Email | `MSG-G13-SHARE` |
| Integrity failure detected | Security/DLP, Records Manager | In-app + email | `MSG-G13-INTEGRITY` |
| Audit chain break detected | Security/DLP, Auditor | In-app + email | `MSG-G13-CHAIN-BREAK` |
| Break-glass access / lockout | Security/DLP | In-app + email | `MSG-G13-BREAKGLASS` |
| Clearance granted / expiring / suspended | Principal, Security | In-app + email | `MSG-G13-CLEARANCE` |
| DSR received / adjudicated | DPO, subject | In-app + email | `MSG-G13-DSR` |
| Document orphaned | DMS Librarian | In-app | `MSG-G13-ORPHAN` |
| Key-DR posture degraded | Sys Admin, Security | In-app + email | `MSG-G13-KEYDR` |
| Scheduled job failure | Owning admin + platform ops | In-app + email | **`MSG-SYS-JOBFAIL`** (shared) |

> **Sensitive-notification rule (R20):** for `is_sealed=true` or SECRET/TOP_SECRET documents and sealed matters,
> notifications **omit identifiers** (`docNo`, `holdNo`, `matterName`) and content; recipients get a generic
> notice and must retrieve details **in-app after authentication**. All dispatches write to the platform
> `notifications` ledger and are audited (X.2).

---

## 14. Reporting & Analytics (G14 / PrimeSoft M16 consumes read-only)

| Report | Description | Audience |
|--------|-------------|----------|
| Documents without retention | Docs missing a retention class | Records Manager |
| Overdue disposition | DISPOSITION_DUE past due, not held | Records Manager |
| Legal-hold inventory | Active holds + held + auto-added counts | LH Admin/Approver, Auditor |
| Hold-notice acknowledgement | Sent/acknowledged/overdue per matter | LH Approver |
| Sensitive-access log | Who accessed CONFIDENTIAL+ in a period (P05) | Auditor, Security |
| Classification distribution | Counts by classification/type/org unit | Security, G14 |
| Quarantine/infection rate | AV blocks over time, repeat offenders | Security |
| Integrity health | Verified vs failed checksum scans | Security, Records Manager |
| Audit chain health | Last anchor, last verification, any break (OPEN-PLAT-03) | Auditor, Security |
| Storage & dedup efficiency | Logical vs physical bytes, tier mix, domain-scoped dedup ratio | Sys Admin |
| Signing throughput | Pending/completed/declined envelopes, LTV coverage, cycle time | Records Manager |
| DLP findings | Open/remediated PII findings by rule/severity | Security/DLP |
| Clearance register | Active clearances by level/scope, recert-due | Security, Auditor |
| DPDP request log | DSRs by type/status/SLA, exemptions vs fulfilments | DPO, Auditor |
| Orphaned documents | Current orphans, age, last links | Records Manager, Librarian |
| Key-DR posture | Escrow/replication status, last DR rehearsal | Sys Admin, Security |

All reports are permission-scoped (P02), cursor-paginated, and exportable (CSV/JSON); G14 consumes aggregates
read-only via `analytics.*`.

---

## 15. Migration & Launch (on P06 ETL+V)

### 15.0 Day-one contract freeze (R14)

Before any internals are built, **freeze and publish the stubbed attach/fetch contract** (`:attach`,
`:fetch?intent=VIEW|DOWNLOAD`, error catalog §10.3, `documentId`/`securityDomain` semantics, the gov
`clearance_level`/`security_clearances` model read by P02) as a **mock service** (Appendix F). All other G01–G12
module teams develop against this mock while G13's internals are built behind it, removing G13 from the program
critical path. The contract version is pinned (`/api/v1`) and changes only via amendment.

### 15.1 Data migration (gated programme on P06, R18)

- Run on **P06 ETL+V** (Extract → Validate → Transform → Load → Verify), scripted idempotently, with **three
  mandatory staging dry runs**, **waves**, a **`migration_runs`** ledger, and a permanent **`<gov>_source_id`**
  traceability/dedup column (follows the `darwinbox_source_id` pattern against the actual legacy register —
  `GAP (gov-specific)` source system).
- Inventory legacy stores (file shares, scanned archives, module-local blobs); classify by type, sensitivity, and
  **security domain**.
- Ingest each file through the standard pipeline (scan + hash + domain-scoped dedup + sandboxed OCR), encrypting
  on ingest; assign `document_type` (M11 `letter_template` where applicable), classification, **M11 retention
  class**, WORM for statutory records, and clearance-bearing ACLs.
- Backfill `document_links` from each module's attachment references; verify FK integrity (DI-14); recompute
  `link_count` (orphan detection).
- **Reconciliation tolerances + dead-letter:** every batch reports matched/unmatched counts and checksum parity
  against a target SLA; failures route to a **dead-letter queue** (P06), never silent drop; a migration audit
  report (P05) is produced per batch.

### 15.2 Cutover & launch

- Stand up storage buckets (HOT/WARM/COLD/WORM), KMS keys (+ escrow/replication via P04), AV/OCR/DLP/PKI/TSA
  integrations (X.3), encrypted search index; smoke-test the pipeline.
- Dual-run: modules attach to G13 (real) while legacy remains read-only; verify fetch(VIEW/DOWNLOAD)/preview/
  search parity and P05 audit chaining.
- Freeze legacy writes; flip modules to the G13 attach contract; decommission legacy after reconciliation sign-off
  (legacy kept read-only ≥ 4 weeks post-go-live, per P06).

### 15.3 Launch readiness checklist

- [ ] Encryption (KMS) + TLS verified; no plaintext at rest.
- [ ] **Key-DR proven:** CMK escrow/replication live; recovery runbook rehearsed end-to-end (R6).
- [ ] **WORM object-lock verified on the ACTUAL CGG storage backend** (gating spike — M11 has no WORM, this is net-new).
- [ ] AV (archive limits), sandboxed OCR/preview/render, DLP, PKI, **RFC-3161 TSA + PAdES-LTV** integrations green.
- [ ] Retention (M11 classes) / hold / disposition tested on **P01** with maker-checker, **hold-release dual control**, and **event-driven anchor** recompute; `JOB-M11-RETENTION/DISPOSAL` wired.
- [ ] **Audit hash-chain + anchoring** verified against **OPEN-PLAT-03** (insert→anchor→verify; tamper detected); confirm OPEN-PLAT-03 status before build.
- [ ] **Clearance model** seeded; **P02** reads `effective_clearance_level`; default-INTERNAL verified.
- [ ] **Fetch contract** VIEW vs DOWNLOAD structurally separated; no raw blob URL for CONFIDENTIAL+; every byte audited (P05).
- [ ] **Anti-brute-force** lockouts active on `/shared/{token}` and break-glass.
- [ ] **DPDP DSR** lattice tested (exempt held/WORM; crypto-shred unshared via **P05 redaction + JOB-M11-DISPOSAL**).
- [ ] **Search index** encrypted + access-scoped; SECRET/TOP_SECRET excluded from full text.
- [ ] **DB-restore-vs-immutable-store/KMS consistency runbook** validated (§15.4).
- [ ] **Data residency** confirmed: all replicas/escrow/index/anchors in-country (R21).
- [ ] Attach/fetch contract validated against G01, G02, G09, G11; `tenant_id`/`entity_id` scoping enforced.
- [ ] Compliance reports populated; G14 read-only access confirmed; `MSG-M11-*`/`MSG-G13-*` registered (X.2).
- [ ] Migration reconciliation: 0 unmatched links, 0 failed checksums (or dead-lettered + logged) on P06.

### 15.4 DB-restore vs immutable-store/KMS consistency runbook (R19)

A point-in-time PostgreSQL restore can desynchronise metadata from the immutable object store and KMS. The
runbook: (1) after restore, run a **consistency reconciler** cross-checking `documents`/`document_versions`
against `storage_objects`, disposition tombstones, and KMS key state; (2) any **disposed** document whose
metadata reappears is re-tombstoned; (3) any metadata referencing a missing blob is flagged for integrity review;
(4) the audit chain is re-verified against `audit_anchors` (OPEN-PLAT-03) to detect restore-window gaps. No
restored state is trusted until the reconciler passes.

---

## 16. Traceability / Dependency / Parallel-Agent Plan

### 16.1 Requirements ↔ entities ↔ APIs ↔ platform service traceability

| FR | Title | Key entities | Platform service |
|----|-------|--------------|------------------|
| FR-G13-001 | Upload & Ingestion | documents, document_versions, storage_objects, scan_results, document_links | M11 vault; ScanProvider; X.1; P05 |
| FR-G13-002 | Types/Taxonomy/Signature-Checkout | document_types, document_tags, documents, dlp_findings | `letter_templates`/`VAL-M11-MERGE`; W.2; P01 |
| FR-G13-003 | Folders & Attach Contract | folders, document_links, document_acls, documents | platform doc service |
| FR-G13-004 | Versioning & Check-in/out | document_versions, checkout_locks, documents, scan_results | M11 vault; ScanProvider |
| FR-G13-005 | Encryption (KMS) & Key-DR | storage_objects, documents, document_audit | KMS via P04; `JOB-G13-KEYROTATE` |
| FR-G13-006 | Access Control (+clearance) | document_acls, documents, folders, security_clearances, document_audit | **P02** |
| FR-G13-007 | Malware Scan & Sandboxing | scan_results, documents, document_versions | `VAL-FILE`; ScanProvider; X.1 |
| FR-G13-008 | OCR & Secured Search | document_versions, scan_results, documents, document_tags | OcrProvider/IndexProvider; P02 |
| FR-G13-009 | Retention/Hold/Disposition | retention_policies/_assignments, legal_holds/_items, hold_notices, lifecycle_event_inbox, disposition_records | `VAL-M11-RETENTION`; `JOB-M11-RETENTION/DISPOSAL`; `JOB-G13-HOLDEVAL`; P01 |
| FR-G13-010 | E-Signature (PAdES-LTV) | signature_requests, signatures, signature_ltv_artifacts, document_versions | **`DocumentGen` sign-off**; `VAL-M11-SIGNER`; `JOB-M11-SIGNOFF-REMIND`; P01/W.1 |
| FR-G13-011 | Watermark & Certified Copies | document_versions, documents, signatures, document_audit | `DocumentGen` rendition; WORM |
| FR-G13-012 | Access Audit & Compliance | document_audit, audit_anchors, documents, document_shares | **P05** `Audit.query/export` |
| FR-G13-013 | Secure Sharing | document_shares, documents, dlp_findings, document_audit | platform doc service; X.2 |
| FR-G13-014 | WORM Storage | documents, storage_objects, document_versions, disposition_records | object-lock storage (gov-specific) |
| FR-G13-015 | Dedup/Integrity/Preview | storage_objects, document_versions, scan_results, documents | object storage; `JOB-G13-INTEGRITY` |
| FR-G13-016 | DLP/Lifecycle/Providers/Attach-Fetch | dlp_findings, documents, storage_objects, document_links | DlpProvider; provider abstraction; P05 |
| FR-G13-017 | Principal Clearance | security_clearances, documents, document_audit | **P01** maker-checker; **P02** consumer |
| FR-G13-018 | DPDP DSR & Erasure Lattice | data_subject_requests, documents, storage_objects, disposition_records, document_audit, consent_records | **P05 redaction**; **`JOB-M11-DISPOSAL`**; P01 |
| FR-G13-019 | Orphan Reaper | documents, document_links, retention_assignments, document_audit | `JOB-G13-ORPHAN` (X.1) |
| FR-G13-020 | Audit Chain & Anchoring | document_audit, audit_anchors | **OPEN-PLAT-03**; `JOB-G13-ANCHOR/CHAINVERIFY` |
| FR-G13-021 | Interactive Redaction (Phase 2) | document_versions, documents, document_audit | `DocumentGen` rendition; sandbox; OCR |

### 16.2 Dependency / build order

0. **Day-one (R14):** freeze + publish the stubbed attach/fetch contract, error catalog, `documents` entity, and
   `clearance_level`/`security_clearances` model as a mock (Appendix F) — unblocks all G01–G12 modules.
1. **Foundation:** confirm M11 vault reuse + storage abstraction + KMS encryption + key-DR (FR-005) and core
   entities (documents, versions, storage_objects with security_domain).
2. **Ingestion safety:** validation (`VAL-FILE`) + malware scan + render sandboxing (FR-007), then upload (FR-001).
3. **Organisation:** types/taxonomy/signature-checkout policy (FR-002, extends `letter_templates`), folders +
   attach contract (FR-003).
4. **Content ops:** versioning (FR-004), domain-scoped dedup/integrity/sandboxed preview (FR-015), secured
   OCR/search (FR-008).
5. **Governance core:** clearance (FR-017, P01/P02), access control (FR-006, P02), audit + hash-chain + anchoring
   (FR-012/020, P05/OPEN-PLAT-03), retention/hold/event-disposition (FR-009, `JOB-M11-*`/P01), WORM (FR-014).
6. **Privacy & hygiene:** DPDP DSR lattice (FR-018, P05 redaction + `JOB-M11-DISPOSAL`), orphan reaper (FR-019).
7. **Advanced:** e-signature LTV (FR-010, `DocumentGen` sign-off), watermark/certified copies (FR-011), sharing
   (FR-013), DLP/lifecycle/providers/fetch (FR-016). **Phase 2 fast-follow:** interactive redaction (FR-021).

### 16.3 Parallel-agent plan

| Track | FRs | Notes |
|-------|-----|-------|
| 0 — Contract freeze | 003/016 (stub) | Mock attach/fetch + clearance model day one; unblocks all modules |
| A — Storage & Crypto | 005, 015 | M11 vault + KMS + key-DR + domain-scoped dedup/integrity |
| B — Ingestion & Safety | 001, 007 | Depends on A; render sandboxing |
| C — Taxonomy & Structure | 002, 003 | Parallel to B after entities exist; reuses `letter_templates` |
| D — Content Ops | 004, 008 | Depends on A/B; secured index |
| E — Governance | 006, 009, 012, 014, 017, 020 | Clearance (P01/P02) + access (P02) + audit-chain (P05/OPEN-PLAT-03) + retention (`JOB-M11-*`) |
| F — Privacy & Hygiene | 018, 019 | Depends on E (retention/hold/crypto-shred/links); P05 redaction |
| G — Advanced | 010, 011, 013, 016 | Depends on D/E; `DocumentGen` sign-off |
| H — Phase 2 | 021 | Fast-follow redaction; depends on 011 |

### 16.4 Final reconciliation table (0 unresolved gaps — incl. platform rows)

| Checkpoint | Status |
|-----------|--------|
| All 26 entities have full field tables (+ `tenant_id`/`entity_id`) | ✅ |
| Entities reconciled with PrimeSoft M11 (vault, `letter_templates`, `signoff_transactions`, retention classes) — no fork | ✅ |
| 21 FRs, each with full structure + LLD | ✅ |
| Every FR maps to entities + APIs + **platform service** (16.1, Alignment §B) | ✅ |
| Error catalog uses platform 8-code table (422/412/no-503) + `{…,details}` + `X-Correlation-Id` header | ✅ |
| State tables cover document/version/hold/disposition/signature/share/clearance/DSR/event | ✅ |
| Maker-checker expressed as configured **P01** flows; SoD by P01/P02 | ✅ |
| Access control via **P02** (deny-by-default → intersection → PII ceiling → field mask) | ✅ |
| Audit via **P05** dual log (DB-trigger); tamper-evidence tracks **OPEN-PLAT-03** | ✅ |
| Retention/disposal reuse **M11 classes** + `JOB-M11-RETENTION/DISPOSAL`; sign-off on `DocumentGen` | ✅ |
| DPDP erasure via **P05 redaction-marker path + JOB-M11-DISPOSAL** | ✅ |
| Roles mapped to **RBAC v1.7** (Document Admin/Letter Admin baseline + gov roles/flags as ADDITIONS) | ✅ |
| `VAL-M11-MERGE/RETENTION/SIGNER`, `JOB-M11-*`, `MSG-M11-*` cited; `VAL-G13-*`/`JOB-G13-*`/`MSG-G13-*` authored | ✅ |
| `tenant_id`/`entity_id` on every entity; cursor pagination; Idempotency-Key | ✅ |
| NFR = platform baseline (99.5% / RPO < 1 h / p95 < 500 ms / WCAG 2.1 AA) | ✅ |
| Migration on **P06** (3 dry runs, waves, `migration_runs`, `<gov>_source_id`) | ✅ |
| `## Alignment with PrimeSoft Platform` + `## Amendments (v2 → v3)` present | ✅ |
| Attach/fetch contract (VIEW vs DOWNLOAD) for G01–G12 specified + frozen | ✅ |
| WORM/legal-hold/clearance/certified-copy authored as gov EXTENSIONS | ✅ |
| All 21 v2 council improvements + risks R1–R22 preserved (16.5) | ✅ |
| Unresolved gaps | **0** |

### 16.5 Risk → mitigation traceability (council Risk Register, re-grounded)

| Risk | Severity | Mitigated in (v3 platform-grounded) |
|------|----------|--------------|
| R1 Dedup vs CMK vs crypto-shred | Critical | E19 (security_domain/key_scope/dek_shared), DI-6, FR-005/015 |
| R2 Signed-URL fetch bypass | Critical | FR-016 (intent VIEW/DOWNLOAD, audited proxy), §10.4, FR-013 |
| R3 `clearance_level` undefined | Critical | E21, FR-017 (P01), FR-006 (**P02 reads it**), DI-16, §3.3 |
| R4 PAdES not durable | Critical | E26, FR-010 on `DocumentGen` sign-off (RFC-3161+LTV) |
| R5 Audit immutability DB-only | High | E12/E23, FR-020 tracking **OPEN-PLAT-03**, DI-3, on **P05** |
| R6 KMS single point of failure | High | FR-005 (key-DR/escrow via P04), NFR Availability, Appendix E |
| R7 Search index weak copy | High | FR-008 (encrypted, access-scoped, SECRET+ excluded), P02 post-filter |
| R8 DPDP vs retention unreconciled | High | E22, FR-018, DI-15 lattice on **P05 redaction + JOB-M11-DISPOSAL** |
| R9 Dedup oracle | High | E19 (HMAC dedup_index_key), DI-6, FR-001/015 |
| R10 No SoD on hold release | High | E10, FR-009, DI-17, §12.3 — on **P01** |
| R11 Holds miss future matches | High | E24, FR-009 (`JOB-G13-HOLDEVAL` + notices X.2) |
| R12 Stale anchor disposition | High | E25, FR-009, DI-18, `anchor_confirmed` (platform outbox) |
| R13 Over-build engines | Med-High | §4 + FR-016 provider abstraction; **reuse of P01/P02/P05/DocumentGen** |
| R14 G13 serialises program | High | §15.0, §16.2 step 0, Appendix F |
| R15 Orphaned documents | Med | FR-019, ORPHANED state, `JOB-G13-ORPHAN` |
| R16 No anti-brute-force | Med | E13, FR-013/005, errors SHARE_LOCKED/BREAK_GLASS_LOCKED |
| R17 Render DoS | Med | FR-007/008/015 sandbox + archive limits |
| R18 Migration underspecified | Med | §15.1 on **P06** gated programme + dead-letter |
| R19 DB restore inconsistency | Med | §15.4 reconciler runbook (vs OPEN-PLAT-03 anchors) |
| R20 Notification metadata leak | Med | §13 sensitive-notification rule (X.2) |
| R21 Data residency | Med | NFR Data Residency |
| R22 TOP_SECRET / heavy check-out over-engineering | Low-Med | §3.3 TOP_SECRET justification; `checkout_mode` optional |

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| PrimeSoft M11 | The existing platform Document Management module (vault, `letter_templates`, `signoff_transactions`, retention classes) that G13 extends |
| `DocumentGen.generate / sign-off` | The platform document-generation + sign-off service (Platform §Y) on which FR-010 runs |
| Envelope encryption | Encrypting data with a per-object DEK itself wrapped by a KMS master key |
| DEK / CMK | Data Encryption Key / Customer Master Key (KMS) |
| Key-DR / escrow | Backup/replication of CMK material enabling recovery, preventing permanent data darkening |
| Security domain | The classification/key boundary within which (and only within which) deduplication may occur |
| Crypto-shred | Rendering data irrecoverable by destroying its key; only for unshared (`dek_shared=false`) blobs |
| WORM | Write-Once-Read-Many immutable storage with object-lock retention (gov extension; M11 lacks it) |
| Legal hold | A freeze preventing disposition/deletion of records relevant to litigation/inquiry (gov, on P01) |
| Disposition | The end-of-retention action: destroy, archive-transfer, or review (`JOB-M11-DISPOSAL`) |
| Retention anchor | The event-confirmed date from which a retention period is computed |
| Clearance level | A principal's document-domain access ceiling (PUBLIC…TOP_SECRET), in `security_clearances`, read by P02 |
| OPEN-PLAT-03 | The platform's proposed audit hash-chaining (chain head to WORM); G13's tamper-evidence tracks it |
| P02 PII ceiling | The RBAC v1.7 protection ceiling that overrides every role upward; applied on serialization |
| PAdES / PAdES-LTV | PDF Advanced Electronic Signatures / Long-Term Validation (embeds revocation data + timestamp) |
| RFC-3161 TSA | Trusted Time-Stamping Authority providing cryptographic proof of signing time |
| Hash chain | Audit rows linked by `row_hash = H(payload ‖ prev_hash)`, making tampering detectable |
| Certified true copy | Officially stamped/signed faithful reproduction of a statutory record |
| Break-glass | Audited, dual-control, rate-limited emergency access (to `security_audit_log`) |
| Tombstone | Metadata + hash retained after a binary is destroyed/erased, for audit |
| DSR | DPDP Data-Subject Request (access/erasure/rectification/portability), uses P05 redaction path |
| Precedence lattice | Ordering of conflicting duties: statutory retention/hold/WORM > DPDP erasure |
| Orphan reaper | The `JOB-G13-ORPHAN` lifecycle handling documents that have lost all module links |

## 18. Appendices

### Appendix A — Default retention schedule (illustrative — realised as M11 retention classes)

| Document type | Trigger | Period | Action |
|---------------|---------|--------|--------|
| Service Register page | ON_CREATE | Permanent | REVIEW (never auto-destroy) |
| Pension Payment Order (PPO) | ON_EMPLOYEE_RETIRE | Permanent | REVIEW |
| Charge-sheet / inquiry record | ON_CASE_CLOSE | 30 years | REVIEW |
| Payslip / Form-16 | FISCAL_YEAR_END | 8 years | DESTROY |
| Training certificate | ON_CREATE | 10 years | REVIEW |
| ID proof (change request) | ON_CREATE | 3 years post-verification | DESTROY |
| Orphaned document (default) | ON_ORPHAN | 1 year | REVIEW (never auto-destroy) |

> Each row is a configured **M11 retention class** (`VAL-M11-RETENTION`); exact statutory periods are confirmed
> against governing rules at deployment and never set below the statutory floor.

### Appendix B — Classification → control map (gov extension over M11)

| Classification | Watermark | External share | Default key (per domain) | Search index | Audit (P05) |
|----------------|-----------|----------------|--------------------------|--------------|-------|
| PUBLIC | optional | allowed | shared CMK | full-text | yes |
| INTERNAL | optional | allowed | shared CMK | full-text | yes |
| CONFIDENTIAL | mandatory | Security approval | dedicated CMK | full-text (encrypted) | yes |
| SECRET | mandatory | blocked (internal only) | dedicated CMK | **metadata-only** | yes |
| TOP_SECRET | mandatory | blocked | dedicated CMK | **metadata-only (per-domain index)** | yes + alert |

> TOP_SECRET retained (justified, §3.3) for compartmented sealed vigilance/PI records; only `is_top_secret_eligible`
> system-seeded types; two-approver clearance required. Field masking for any document metadata carrying gov
> identifiers follows **RBAC v1.7 PII tiers** (§3.3), enforced by P02 on serialization.

### Appendix C — Allowed MIME types (baseline, `VAL-FILE`, per type override)

`application/pdf`, `image/tiff`, `image/jpeg`, `image/png`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### Appendix D — Assumptions & caveats

- KMS (+ in-country HSM/multi-region escrow, credentials via P04), object-storage object-lock, AV (ICAP),
  sandboxed OCR/preview, DLP, PKI/eSign (`DocumentGen` SigningProvider), and an RFC-3161 TSA are available
  platform services at CGG; each is provider-abstracted.
- **Print auditing is reliable only through the platform's watermarked print path; out-of-band printing is
  best-effort** (FR-012 BR-1).
- Exact statutory retention periods are configurable M11 retention classes, confirmed at deployment.
- SHA-256 collision risk treated as cryptographically negligible for integrity/dedup.
- **The WORM guarantee must be proven on the actual CGG storage backend** before FR-014 is credible (gating
  spike, §15.3) — M11 has no WORM, so this is net-new gov infrastructure.
- **Audit tamper-evidence depends on confirming platform OPEN-PLAT-03** (hash-chain proposal) before build
  (Platform §Z); G13 tracks it rather than authoring a parallel mechanism.
- Whether AV/OCR/DLP/PKI are built in-house or COTS is a deployment choice behind provider interfaces;
  data-sovereignty (NFR residency) may force on-prem implementations for PII.

### Appendix E — KMS Key-DR / Escrow Runbook (R6)

1. **Replication:** every CMK replicated to a geographically separate, **in-country** HSM/region; wrapped DEKs
   stored alongside their objects (`storage_objects.wrapped_dek`).
2. **Escrow:** CMK material escrowed under split-knowledge / dual-control (Shamir-style); no single custodian can
   extract a key. Credentials managed via **P04 `integration_credentials`**.
3. **Recovery:** on suspected loss/corruption, execute `/admin/keys:recover` (dual-control) to restore the CMK
   from escrow/replica **before** any data is declared lost; re-wrap affected DEKs if the key was rotated.
4. **Rehearsal:** the recovery drill is rehearsed **quarterly**; results feed the Key-DR posture report.
5. **Key-loss behaviour:** if recovery is genuinely impossible, affected documents are marked unrecoverable and
   reported — a *defined, alarmed* state reached only after escrow recovery fails, never a silent loss.

### Appendix F — Day-One Stub Attach/Fetch Contract (R14)

A mock service implementing the frozen contract is published on day one so all G01–G12 modules build against it:

- `POST /api/v1/documents:attach` → `{documentId, docNo, linkId, status:"SCANNING", securityDomain}`; accepts
  `Idempotency-Key`; `X-Correlation-Id` echoed.
- `GET /api/v1/documents/{id}:fetch?intent=VIEW` → `renderUrl` (stub streams a placeholder watermarked PDF),
  `downloadAvailable:false`.
- `GET /api/v1/documents/{id}:fetch?intent=DOWNLOAD` → `downloadUrl` only if the stub token carries the DOWNLOAD
  right, else `403`.
- Error catalog (§10.3) returned verbatim with the **platform envelope** (`{error:{code,message,field,details}}`,
  `X-Correlation-Id` header), including `ERR-G13-FETCH_INTENT_REQUIRED`, `ERR-G13-CLEARANCE_INSUFFICIENT`, `ERR-G13-DOCUMENT_NOT_ATTACHABLE`.
- `clearance_level` semantics published: principals default to INTERNAL; CONFIDENTIAL+ requires an ACTIVE
  `security_clearances` row that **P02** reads.

The mock's responses are byte-compatible with the production service so the cutover (§15.2) requires no module
code changes.
