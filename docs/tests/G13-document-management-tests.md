# G13 — Document Management and Secure Storage — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|-------|-------|
| Module | G13 — Document Management and Secure Storage (GOV-M13, ex M13-DMS) |
| Scope | The single platform attach/fetch document service consumed by G01–G12: upload/ingestion, taxonomy/classification, folders + attach contract, versioning, KMS envelope encryption + key-DR, access control (RBAC + clearance + classification + relationship + need-to-know), malware scan/quarantine, OCR/permission-aware search, retention + legal hold (SoD) + disposition, e-signature (PAdES-LTV + RFC-3161), watermark/certified copies, access audit (P05) + hash-chain anchoring, secure sharing/expiring links, WORM, domain-scoped dedup/integrity, DLP + VIEW/DOWNLOAD fetch contract, principal clearance, DPDP DSR/erasure lattice, orphan reaper, redaction (Phase 2). |
| Traceability basis | `docs/brd/v3/G13-document-management-secure-storage.md` (FR-G13-001…021, §5.5 enums, §5.6 DI-1…DI-18, §12 state tables); `docs/contracts/openapi/G13.yaml` (v3.0.0); `docs/contracts/error-taxonomy.yaml` (ERR-G13-*, 35 codes); `docs/contracts/state-machines.yaml` (G13 machines); `docs/contracts/auth-matrix.yaml` (G13 actions). |
| Test-case count | 122 (TC-G13-001 … TC-G13-122; includes 12 RECON v3.2 letter/config/acknowledgement cases TC-G13-111 … TC-G13-122) |
| Standard error envelope | `{ error: { code, message, field, details } }` + `X-Correlation-Id` response header. Assert both the module `code` and the HTTP status on every negative case. |
| API base | `/api/v1`; bearer JWT resolved by P02; `Idempotency-Key` on unsafe/transaction POSTs (24h replay returns original); cursor pagination (`limit` 25/100, `cursor`, `next_cursor`). |

### 1.1 Test-environment & data assumptions

- **Multi-tenant:** two live tenants seeded — `TEN-A` (entity `ENT-A1`) and `TEN-B` (entity `ENT-B1`). Every G13 row carries non-null `tenant_id`/`entity_id`; an unscoped query is rejected, never defaulted to "all".
- **Personas / test principals** (mapped to RBAC v1.7 + G13 additions in `auth-matrix.yaml`):
  - `EMP-3001` — Employee (self-service, `document.*` own-scope).
  - `EMP-3002` — a second Employee (used for IDOR / cross-subject tests); `EMP-3009` is `EMP-3001`'s reporting manager (`REPORTING_MANAGER` relationship).
  - `LIB-1` — DMS Librarian (`document_admin`) — taxonomy/lifecycle maker; proposes disposition.
  - `RM-1`, `RM-2` — Records Manager (`records_manager`) — checker; WORM; certified copies; clearance checker.
  - `LHA-1` — Legal Hold Administrator (`legal_hold_admin`) — places holds.
  - `LHAP-1` — Legal Hold Approver (`legal_hold_approver`) — approves high-value placement + all releases.
  - `SEC-1`, `SEC-2` — Security/DLP Officer (`security_dlp_officer` + `g13_security_powers`) — downgrade approval, DLP, quarantine release, clearance grant (maker), break-glass, key policy.
  - `DPO-1` — Data Protection Officer (`dpo`) — DSR adjudication.
  - `AUD-1` — Auditor (Org-Admin audit read, read-only).
  - `SYS-1` — System Administrator (Org/Platform Admin; cannot read CONFIDENTIAL+ except break-glass).
  - `SVC-G09`, `SVC-G11` — module service principals (machine tokens; no human read rights).
- **Clearance tiers** (`classification_level`): `PUBLIC < INTERNAL < CONFIDENTIAL < SECRET < TOP_SECRET`. Default effective clearance = `INTERNAL` when no active `security_clearances` row. Seeded: `EMP-3001`=INTERNAL, `LIB-1`=CONFIDENTIAL, `RM-1`/`SEC-1`=SECRET, `SEC-2`=TOP_SECRET.
- **Seed documents:**
  - `doc-0001` ID_PROOF, CONFIDENTIAL, `DOM_CONFIDENTIAL`, ACTIVE, link G02→`cr-5501`, subject `EMP-3001`.
  - `doc-0002` CHARGE_SHEET, SECRET, is_worm=true, ON_LEGAL_HOLD, link G09→`cs-01`, sealed to subject.
  - `doc-0003` PPO, CONFIDENTIAL, is_worm=true, ACTIVE, link G11→`pc-7001`.
  - `doc-perm` SERVICE_REGISTER, permanent retention (`is_permanent=true`), ACTIVE.
- **Document types:** `ID_PROOF` (checkout_mode=NONE, sig={}), `CHARGE_SHEET` (checkout_mode=OPTIONAL, sig={DSC_TOKEN}, is_worm_default=true), `PPO` (checkout_mode=NONE, sig={DSC_TOKEN,AADHAAR_ESIGN}, is_worm_default=true).
- Providers (AV/OCR/DLP/PKI-eSign/KMS/storage/TSA) are stubbable behind provider interfaces; each has a fault-injection switch (down/timeout) for negative paths.
- **Oracle discipline:** every VIEW/PREVIEW/DOWNLOAD/PRINT/SHARE and lifecycle mutation must write a chained `document_audit` row on the P05 substrate; audit assertions are part of Expected where flagged.

---

## 2. Test Cases

### FR-G13-001 — Upload & Ingestion

**TC-G13-001** · Traces-to: FR-G13-001 AC-1/AC-6 · Type: Functional · Priority: P1
**Title:** Single multipart upload creates an ACTIVE document, version 1, and a chained audit row
**Preconditions:** `LIB-1` authenticated in `TEN-A`; type `ID_PROOF` active; AV stub returns CLEAN.
**Test data:** `POST /documents` multipart: file `aadhaar.pdf` (application/pdf, 1.2 MB), `document_type_id=dt-id-proof`, `title="Aadhaar Proof"`, `folder_id=fld-emp-3001`, metadata satisfies W.2 form, `Idempotency-Key: K-001`.
**Steps:** 1) POST the multipart body. 2) Poll `GET /documents/{id}` until status leaves SCANNING. 3) `GET /documents/{id}/audit`.
**Expected:** `201`; body `documentId`, `docNo` (`DOC/YYYY/…`), `status` progresses DRAFT→SCANNING→ACTIVE, `currentVersionNo=1`; `X-Correlation-Id` present; one chained `document_audit (VERSION_ADD)` row; P05 mutation captured.

**TC-G13-002** · Traces-to: FR-G13-001 AC-2 · Type: Negative · Priority: P1
**Title:** Disallowed MIME rejected pre-storage
**Preconditions:** `ID_PROOF.allowed_mime_types` excludes `application/x-msdownload`.
**Test data:** upload `payload.exe`.
**Steps:** POST `/documents`.
**Expected:** `422` + `ERR-G13-INVALID_FILE_TYPE`; `field` names the file; no `documents`/`storage_objects` row created.

**TC-G13-003** · Traces-to: FR-G13-001 AC-2 · Type: Boundary · Priority: P2
**Title:** File exceeding type size cap rejected; at-cap accepted
**Preconditions:** `ID_PROOF.max_size_mb=10`.
**Test data:** (a) 10.00 MB PDF; (b) 10.01 MB PDF.
**Steps:** POST each.
**Expected:** (a) `201`; (b) `422` + `ERR-G13-FILE_TOO_LARGE`.

**TC-G13-004** · Traces-to: FR-G13-001 (VAL-FILE) · Type: Negative · Priority: P2
**Title:** Zero-byte / corrupt upload rejected
**Test data:** 0-byte `empty.pdf`.
**Steps:** POST `/documents`.
**Expected:** `422` + `ERR-G13-EMPTY_FILE`.

**TC-G13-005** · Traces-to: FR-G13-001 AC-4 · Type: Functional · Priority: P1
**Title:** Bulk upload returns per-file results without aborting the batch
**Test data:** `POST /documents/bulk` 4 files: 2 valid PDFs, 1 oversized, 1 `.exe`.
**Steps:** POST batch.
**Expected:** `207`; array of 4: two `201`-equivalent success items with `documentId`; one `ERR-G13-FILE_TOO_LARGE`; one `ERR-G13-INVALID_FILE_TYPE`; batch not aborted.

**TC-G13-006** · Traces-to: FR-G13-001 AC-8 · Type: Data-Integrity · Priority: P1
**Title:** Idempotency-Key replay within 24h returns the original, not a duplicate
**Test data:** repeat TC-G13-001 body with same `Idempotency-Key: K-001`.
**Steps:** POST twice.
**Expected:** second call returns the original `documentId`/`docNo`; exactly one `documents` row; no new version.

**TC-G13-007** · Traces-to: FR-G13-001 AC-7 (R9) · Type: Security · Priority: P1
**Title:** Upload response reveals no dedup existence oracle
**Preconditions:** identical content already stored in same `security_domain`.
**Steps:** upload identical bytes; compare response body + latency vs a novel upload.
**Expected:** `201` identical in shape; no `deduplicated`/`ref_count` field; response timing normalised; caller cannot infer prior existence.

**TC-G13-008** · Traces-to: FR-G13-001 AC-5 · Type: Functional · Priority: P2
**Title:** Resumable upload session survives transient loss for large file
**Test data:** `POST /documents/{id}/uploads:resume` for a 240 MB file (cap 250 MB); interrupt at ~50%, resume.
**Steps:** start session; upload; drop; resume; finalise.
**Expected:** `200` session descriptor with resume offset; final document ACTIVE, `content_hash` matches full file.

---

### FR-G13-002 — Types, Taxonomy, Classification, Tagging

**TC-G13-009** · Traces-to: FR-G13-002 AC-1 · Type: Functional · Priority: P2
**Title:** Librarian creates a document type with schema, defaults and signature/checkout policy
**Test data:** `POST /document-types` `{type_code:"POSTING_ORDER", default_classification:"INTERNAL", default_security_domain:"DOM_INTERNAL", allowed_mime_types:["application/pdf"], max_size_mb:20, allowed_signature_types:["DSC_TOKEN"], checkout_mode:"OPTIONAL"}` by `LIB-1`.
**Expected:** `201` DocumentType echoing all fields.

**TC-G13-010** · Traces-to: FR-G13-002 AC-2 · Type: Negative · Priority: P1
**Title:** Upload missing required metadata fails schema validation
**Test data:** upload to `CHARGE_SHEET` omitting required `case_no` metadata field.
**Expected:** `422` + `ERR-G13-METADATA_INVALID`; `field=case_no`.

**TC-G13-011** · Traces-to: FR-G13-002 AC-4 / DI-9 · Type: Authorization-AccessControl · Priority: P1
**Title:** Unauthorised classification downgrade blocked
**Preconditions:** `doc-0001` = CONFIDENTIAL.
**Test data:** `POST /documents/doc-0001:reclassify {toClassification:"INTERNAL"}` by `LIB-1` (not Security/DLP).
**Expected:** `403` + `ERR-G13-CLASSIFICATION_LOCKED`; classification unchanged.

**TC-G13-012** · Traces-to: FR-G13-002 AC-4 (P01) · Type: State-Transition · Priority: P1
**Title:** Authorised downgrade routes through P01 maker-checker
**Test data:** `POST /documents/doc-0001:reclassify {toClassification:"INTERNAL", reason:"declassified per order"}` by `SEC-1`, then distinct approver `RM-1`.
**Expected:** `202` WorkflowAck (downgrade PROPOSED to P01, distinct approver required); on approval, chained `document_audit (CLASSIFY)` written; effective classification changes only after checker approval.

**TC-G13-013** · Traces-to: FR-G13-002 AC-7 / VAL-G13-SIGMETHOD · Type: Negative · Priority: P1
**Title:** DRAWN signature method rejected for statutory type
**Test data:** create signature request on `doc-0002` (CHARGE_SHEET, allowed={DSC_TOKEN}) with `method=DRAWN`.
**Expected:** `422` + `ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`.

**TC-G13-014** · Traces-to: FR-G13-002 AC-5 · Type: Functional · Priority: P3
**Title:** Controlled-vocab + auto (OCR/DLP) tags applied with confidence
**Test data:** `POST /documents/doc-0001/tags` controlled tag `PII_CATEGORY=AADHAAR`; then OCR auto-tag with `confidence`.
**Expected:** `200` TagList; unknown controlled key ⇒ `422` (VAL-ENUM); auto tags carry `tag_origin` + confidence.

---

### FR-G13-003 — Folders & Attach Contract

**TC-G13-015** · Traces-to: FR-G13-003 AC-2 · Type: API-Contract · Priority: P1
**Title:** Module attach binds a document and increments link_count
**Test data:** `POST /documents:attach` by `SVC-G09` `{documentId:doc-new, moduleCode:"G09", entityName:"charge_sheets", entityRefId:"cs-02", linkRole:"ORDER", isPrimary:true}` `Idempotency-Key: A-01`.
**Expected:** `201` AttachResult `{documentId, linkId}`; `link_count` +1; module stores only `document_id`.

**TC-G13-016** · Traces-to: FR-G13-003 BR-1 / DI-14 · Type: Negative · Priority: P1
**Title:** Attach to a disposed/orphaned/deleted document rejected
**Test data:** attach `entityRefId=cs-03` to a DISPOSED document.
**Expected:** `409` + `ERR-G13-DOCUMENT_NOT_ATTACHABLE`.

**TC-G13-017** · Traces-to: FR-G13-003 AC-2 · Type: Negative · Priority: P2
**Title:** Duplicate primary link on same (entity, link_role) rejected
**Test data:** attach a second `isPrimary=true` ORDER link for existing `(charge_sheets, cs-01, ORDER)`.
**Expected:** `409` + `ERR-G13-LINK_CONFLICT`.

**TC-G13-018** · Traces-to: FR-G13-003 AC-6 · Type: State-Transition · Priority: P1
**Title:** Detaching the last link sets detached_at, decrements link_count, and orphans the document
**Preconditions:** single-link non-WORM/non-held `doc-solo` (link_count=1).
**Test data:** `DELETE /document-links/{linkId}`.
**Expected:** `204`; `link_count=0`; document → `ORPHANED` (see FR-019); chained audit written.

**TC-G13-019** · Traces-to: FR-G13-003 AC-3 · Type: Functional · Priority: P2
**Title:** One document linked from multiple modules without duplicating the binary
**Test data:** attach `doc-0003` from G11 (existing) and additionally from G14 read-context.
**Expected:** `201`; single `storage_objects`/binary; `link_count` reflects both links.

---

### FR-G13-004 — Versioning, Check-in/out, Supersede

**TC-G13-020** · Traces-to: FR-G13-004 AC-1 · Type: Functional · Priority: P2
**Title:** Checkout acquires exclusive lock on OPTIONAL/REQUIRED type
**Test data:** `POST /documents/doc-0002:checkout` by `LIB-1` (CHARGE_SHEET, OPTIONAL).
**Expected:** `200` CheckoutLock, `lock_status=ACTIVE`, TTL ~8h; doc → CHECKED_OUT.

**TC-G13-021** · Traces-to: FR-G13-004 / DI-7 · Type: Negative · Priority: P1
**Title:** Checkout on a checkout_mode=NONE type rejected
**Test data:** `POST /documents/doc-0001:checkout` (ID_PROOF, NONE).
**Expected:** `409` + `ERR-G13-CHECKOUT_NOT_SUPPORTED`.

**TC-G13-022** · Traces-to: FR-G13-004 / DI-7 · Type: Negative · Priority: P1
**Title:** Checkout of an already locked document rejected
**Preconditions:** `doc-0002` checked out by `LIB-1` (TC-020).
**Test data:** `POST /documents/doc-0002:checkout` by `RM-1`.
**Expected:** `409` + `ERR-G13-DOCUMENT_LOCKED`.

**TC-G13-023** · Traces-to: FR-G13-004 BR-1 · Type: Authorization-AccessControl · Priority: P1
**Title:** Check-in by non-lock-holder rejected
**Preconditions:** lock held by `LIB-1`.
**Test data:** `POST /documents/doc-0002:checkin` (multipart, `change_summary` set) by `RM-1`.
**Expected:** `403` (not holder) or `409` `ERR-G13-DOCUMENT_LOCKED` per contract; no new version created.

**TC-G13-024** · Traces-to: FR-G13-004 AC-6 / DI-4 · Type: Data-Integrity · Priority: P1
**Title:** Check-in mutating WORM content before retain-until rejected
**Test data:** `POST /documents/doc-0003:checkin` before `worm_retain_until`.
**Expected:** `409` + `ERR-G13-WORM_IMMUTABLE`; version_no unchanged.

**TC-G13-025** · Traces-to: FR-G13-004 AC-4 · Type: Functional · Priority: P2
**Title:** Supersede records SUPERSEDE kind and retains prior version
**Test data:** `POST /documents/doc-new:supersede` multipart with reason.
**Expected:** `200` DocumentVersion `version_kind=SUPERSEDE`, `superseded_version_id` set; prior version retained/queryable.

**TC-G13-026** · Traces-to: FR-G13-004 AC-2 · Type: Negative · Priority: P3
**Title:** Check-in without change_summary fails validation
**Test data:** checkin multipart omitting `change_summary`.
**Expected:** `422` `VALIDATION_FAILED` (field `change_summary`).

---

### FR-G13-005 — Encryption / KMS / Key-DR / Break-glass

**TC-G13-027** · Traces-to: FR-G13-005 AC-1/AC-2 · Type: Functional · Priority: P1
**Title:** Stored blob is envelope-encrypted; no plaintext / only wrapped DEK persisted
**Steps:** upload; inspect `storage_objects`.
**Expected:** stored bytes ciphertext (AES-256-GCM), unique DEK; only `wrapped_dek` + `kms_key_id` persisted; no plaintext DEK anywhere; CONFIDENTIAL+ uses dedicated CMK per domain.

**TC-G13-028** · Traces-to: FR-G13-005 AC-4 · Type: Functional · Priority: P2
**Title:** CMK rotation re-wraps DEKs in background without rewriting object bytes
**Test data:** `POST /admin/keys:rotate` by `SEC-1`.
**Expected:** `202` WorkflowAck; `JOB-G13-KEYROTATE` re-wraps; object byte offsets/`content_hash` unchanged; documents still readable.

**TC-G13-029** · Traces-to: FR-G13-005 LLD · Type: Negative · Priority: P1
**Title:** KMS unavailable yields 500 with no plaintext fallback
**Preconditions:** KMS stub forced down.
**Test data:** fetch DOWNLOAD of an encrypted document.
**Expected:** `500` + `ERR-G13-KEY_SERVICE_UNAVAILABLE` (X.3-mapped, message_id ERR-LOADFAIL); no plaintext served.

**TC-G13-030** · Traces-to: FR-G13-005 AC-6 · Type: Security · Priority: P1
**Title:** Break-glass requires two approvers and writes BREAK_GLASS + security_audit_log
**Test data:** `POST /documents/doc-0002:break-glass` by `SYS-1` with two-approver payload (`SEC-1`+senior authority).
**Expected:** `200` FetchResult; `document_audit (BREAK_GLASS)` + `security_audit_log` rows; single-approver attempt ⇒ `403`.

**TC-G13-031** · Traces-to: FR-G13-005 AC-6 · Type: Security · Priority: P1
**Title:** Break-glass brute-force lockout
**Test data:** repeated failed break-glass auth beyond threshold.
**Expected:** `429` + `ERR-G13-BREAK_GLASS_LOCKED`; alert raised.

**TC-G13-032** · Traces-to: FR-G13-005 AC-7 · Type: Authorization-AccessControl · Priority: P2
**Title:** Key recovery from escrow is dual-control
**Test data:** `POST /admin/keys:recover` single approver, then second approver.
**Expected:** first call `202` "awaiting second approver"; completes only with a distinct second approver; audited.

---

### FR-G13-006 — Access Control (P02 + clearance + relationship)

**TC-G13-033** · Traces-to: FR-G13-006 AC-1 / DI-16 · Type: Authorization-AccessControl · Priority: P1
**Title:** Clearance below classification denies access
**Preconditions:** `EMP-3001` effective clearance INTERNAL; `doc-0002` SECRET.
**Test data:** `GET /documents/doc-0002:fetch?intent=VIEW` by `EMP-3001`.
**Expected:** `403` + `ERR-G13-CLEARANCE_INSUFFICIENT`; chained `document_audit (result=DENIED)` + `security_audit_log` with reason.

**TC-G13-034** · Traces-to: FR-G13-006 AC-1 · Type: Security · Priority: P1
**Title:** IDOR — fetching another employee's document is denied without existence leak
**Preconditions:** `doc-0001` belongs to subject `EMP-3001`; no ACL for `EMP-3002`.
**Test data:** `GET /documents/doc-0001` and `:fetch?intent=VIEW` by `EMP-3002`.
**Expected:** `404` NOT_FOUND (or `403` per deny-by-default), never revealing content or existence; DENIED audit row; response body identical shape to a genuinely missing id.

**TC-G13-035** · Traces-to: FR-G13-006 AC-3 / §3.3 · Type: Security · Priority: P1
**Title:** Sealed document invisible to the subject employee
**Preconditions:** `doc-0002` `is_sealed=true`, subject `EMP-3001`.
**Test data:** `GET /documents/doc-0002` by `EMP-3001` (the subject).
**Expected:** `404` (no existence leak), even though the subject owns related records.

**TC-G13-036** · Traces-to: FR-G13-006 AC-2 · Type: Authorization-AccessControl · Priority: P2
**Title:** Reporting manager sees a direct report's permitted document via relationship grant
**Test data:** `GET /documents/doc-0001:fetch?intent=VIEW` by `EMP-3009` (manager of `EMP-3001`), clearance CONFIDENTIAL.
**Expected:** `200` (REPORTING_MANAGER relationship grant + sufficient clearance); a non-manager peer with same clearance but no relationship ⇒ `403`/`404`.

**TC-G13-037** · Traces-to: FR-G13-006 BR-1 / DI-8 · Type: Data-Integrity · Priority: P1
**Title:** Explicit DENY overrides an inherited/folder ALLOW
**Test data:** grant folder ALLOW to `LIB-1`; add document-level DENY on `doc-x`; `GET /documents/doc-x`.
**Expected:** `403`/`404`; DENY wins regardless of inherited ALLOW.

**TC-G13-038** · Traces-to: FR-G13-006 §API access:check · Type: Functional · Priority: P2
**Title:** access:check explains effective P02 decision (clearance vs classification, scope, mask)
**Test data:** `GET /documents/doc-0002/access:check?principal=EMP-3001`.
**Expected:** `200` AccessCheckResult `allowed=false`, effective clearance INTERNAL vs SECRET, reason; sealed target ⇒ `404`.

**TC-G13-039** · Traces-to: FR-G13-006 AC-7 · Type: State-Transition · Priority: P1
**Title:** Suspended/expired clearance immediately denies CONFIDENTIAL+ access
**Preconditions:** `LIB-1` had CONFIDENTIAL clearance, now SUSPENDED.
**Test data:** `GET /documents/doc-0001:fetch?intent=VIEW` by `LIB-1`.
**Expected:** `403` + `ERR-G13-CLEARANCE_INSUFFICIENT`; effective level falls back to INTERNAL live.

**TC-G13-040** · Traces-to: FR-G13-006 AC-6 · Type: Functional · Priority: P3
**Title:** Time-boxed ACL auto-revokes at expires_at
**Test data:** create ACL with `expires_at` = now+1m; wait; re-fetch.
**Expected:** access allowed before expiry, `403`/`404` after entitlement-expiry job runs.

---

### FR-G13-007 — Malware / Quarantine / Sandbox

**TC-G13-041** · Traces-to: FR-G13-007 AC-3/AC-4 / DI-11 · Type: Security · Priority: P1
**Title:** Infected upload is quarantined, never becomes ACTIVE, notifies Security
**Preconditions:** AV stub returns INFECTED (EICAR).
**Test data:** upload `eicar.pdf`.
**Expected:** `422` + `ERR-G13-MALWARE_DETECTED`; document `QUARANTINED`, binary encrypted/hidden; `MSG-G13-QUARANTINE` sent; no ACTIVE version.

**TC-G13-042** · Traces-to: FR-G13-007 §API · Type: Functional · Priority: P3
**Title:** Security lists quarantined items
**Test data:** `GET /admin/quarantine` by `SEC-1`.
**Expected:** `200` cursor-paginated ScanResultPage.

**TC-G13-043** · Traces-to: FR-G13-007 AC-5 · Type: Authorization-AccessControl · Priority: P2
**Title:** Quarantine release requires Security/DLP + reason; others forbidden
**Test data:** `POST /admin/quarantine/{id}:release {reason}` by `LIB-1` (forbidden), then by `SEC-1`.
**Expected:** `LIB-1` ⇒ `403`; `SEC-1` with reason ⇒ `200`, item → ACTIVE, audited; missing reason ⇒ `422`.

**TC-G13-044** · Traces-to: FR-G13-007 AC-7 (R17) · Type: Security · Priority: P1
**Title:** Archive bomb / nesting limit rejected
**Test data:** upload a deeply nested zip exceeding depth/ratio caps.
**Expected:** `422` + `ERR-G13-RENDER_RESOURCE_LIMIT`; recorded in `scan_results`; sandbox not breached.

**TC-G13-045** · Traces-to: FR-G13-007 AC-1 · Type: Security · Priority: P2
**Title:** Magic-byte sniffing overrides a spoofed extension
**Test data:** upload a Windows PE binary renamed `report.pdf`.
**Expected:** `422` + `ERR-G13-INVALID_FILE_TYPE` (content signature, not extension, decides).

---

### FR-G13-008 — OCR & Permission-Aware Search

**TC-G13-046** · Traces-to: FR-G13-008 AC-2 / BR-1 · Type: Authorization-AccessControl · Priority: P1
**Title:** Search post-filters to only documents the caller may view
**Preconditions:** matching corpus includes CONFIDENTIAL docs `EMP-3001` cannot see.
**Test data:** `GET /documents/search?q=aadhaar` by `EMP-3001`.
**Expected:** `200`; results exclude documents failing P02+clearance (post-filter, not rank suppression); no metadata of forbidden docs leaked.

**TC-G13-047** · Traces-to: FR-G13-008 AC-6 (R7) · Type: Security · Priority: P1
**Title:** SECRET/TOP_SECRET full text excluded from shared index (metadata-only)
**Test data:** search a distinctive phrase present only in `doc-0002` (SECRET) body, as `SEC-2` (TOP_SECRET clearance).
**Expected:** `200`; `doc-0002` returns metadata-only snippet; no plaintext SECRET tokens returned from the shared full-text index.

**TC-G13-048** · Traces-to: FR-G13-008 AC-1 · Type: Functional · Priority: P3
**Title:** OCR status reflects lifecycle
**Test data:** `GET /documents/{id}/ocr` for a scanned image before/after OCR; and for a native PDF.
**Expected:** `200` `ocr_status` ∈ {PENDING→DONE} for the scan; `NOT_APPLICABLE`/indexed-text for native PDF; OCR failure does not block storage.

---

### FR-G13-009 — Retention / Legal Hold / Disposition

**TC-G13-049** · Traces-to: FR-G13-009 AC-1/AC-2 · Type: Functional · Priority: P2
**Title:** Retention class assigned; due date computed from anchor; permanent leaves it null
**Test data:** `POST /documents/{id}/retention` non-permanent class (60 months, ON_CREATE); then `doc-perm` permanent class.
**Expected:** `200`; non-permanent sets `disposition_due_date = anchor + period`; permanent ⇒ null (DI-13).

**TC-G13-050** · Traces-to: FR-G13-009 AC-3 · Type: State-Transition · Priority: P1
**Title:** Standard hold placement freezes disposition and sets legal_hold_count
**Test data:** `POST /legal-holds {documentIds:[doc-x], basis:MANUAL}` by `LHA-1`.
**Expected:** `201` LegalHold ACTIVE; `legal_hold_count>0`; document → ON_LEGAL_HOLD; retention assignment → HELD.

**TC-G13-051** · Traces-to: FR-G13-009 AC-3 (R10) · Type: State-Transition · Priority: P1
**Title:** High-value hold enters PENDING_APPROVAL and needs a distinct approver
**Test data:** `POST /legal-holds` flagged high-value by `LHA-1`; then `POST /legal-holds/{id}:approve-placement` by `LHAP-1`.
**Expected:** placement `201`/PENDING_APPROVAL; approval by distinct `LHAP-1` ⇒ `200` ACTIVE.

**TC-G13-052** · Traces-to: FR-G13-009 §approve-placement · Type: Authorization-AccessControl · Priority: P1
**Title:** Self-approval of hold placement violates SoD
**Test data:** `LHA-1` proposes high-value hold, then `LHA-1` calls `:approve-placement`.
**Expected:** `403` + `ERR-G13-SOD_VIOLATION`.

**TC-G13-053** · Traces-to: FR-G13-009 AC-6 / DI-17 (VAL-G13-HOLD-SOD) · Type: Authorization-AccessControl · Priority: P1
**Title:** Hold release missing a distinct approver is blocked
**Test data:** `POST /legal-holds/{id}:release {release_proposed_by:LHA-1, release_approved_by:LHA-1, reason}`.
**Expected:** `403` + `ERR-G13-HOLD_RELEASE_SOD`; hold stays ACTIVE.

**TC-G13-054** · Traces-to: FR-G13-009 AC-6 · Type: State-Transition · Priority: P1
**Title:** Dual-control hold release restores disposition eligibility
**Test data:** release proposed by `LHA-1`, approved by distinct `LHAP-1`, with `release_reason`.
**Expected:** `200`; hold → RELEASED; `legal_hold_count--`; due date recomputed; document leaves ON_LEGAL_HOLD.

**TC-G13-055** · Traces-to: FR-G13-009 BR-1 / DI-4 · Type: Data-Integrity · Priority: P1
**Title:** Disposition proposal blocked while a legal hold is active
**Test data:** `POST /documents/doc-0002/disposition:propose` (doc under active hold).
**Expected:** `409` + `ERR-G13-LEGAL_HOLD_ACTIVE`.

**TC-G13-056** · Traces-to: FR-G13-009 BR-2 / DI-13 · Type: Negative · Priority: P1
**Title:** Disposition of a permanent record rejected
**Test data:** `POST /documents/doc-perm/disposition:propose`.
**Expected:** `409` + `ERR-G13-RETENTION_PERMANENT`.

**TC-G13-057** · Traces-to: FR-G13-009 AC-4 / DI-10 · Type: Authorization-AccessControl · Priority: P1
**Title:** Disposition self-approval (proposer == approver) violates SoD
**Test data:** `LIB-1` proposes disposition on eligible `doc-y`; `LIB-1` calls `:approve`.
**Expected:** `403` + `ERR-G13-SOD_VIOLATION`.

**TC-G13-058** · Traces-to: FR-G13-009 AC-8 / DI-18 · Type: Data-Integrity · Priority: P1
**Title:** Disposition approval blocked when retention anchor is unconfirmed
**Preconditions:** governing class `requires_confirmed_anchor=true`, `anchor_confirmed=false`.
**Test data:** `LIB-1` proposes, `RM-1` calls `:approve`.
**Expected:** `409` + `ERR-G13-ANCHOR_UNCONFIRMED`; no DESTROY executed.

**TC-G13-059** · Traces-to: FR-G13-009 AC-5 · Type: E2E-Flow · Priority: P1
**Title:** Certified disposition happy path executes purge + certificate + tombstone
**Preconditions:** eligible `doc-y`, no hold, `anchor_confirmed=true`.
**Test data:** `LIB-1` propose → `RM-1` (distinct) approve.
**Expected:** propose `201` PROPOSED; approve `200` → APPROVED→EXECUTED via `JOB-M11-DISPOSAL`; `disposition_records` row with certificate + tombstone; crypto-shred only if `dek_shared=false`; document → DISPOSED.

**TC-G13-060** · Traces-to: FR-G13-009 AC-7 (R11) · Type: Functional · Priority: P2
**Title:** Continuous-eval hold auto-adds future matches and issues acknowledgeable notices
**Test data:** ACTIVE hold with `match_criteria` (employee X); upload a new document matching X; run `JOB-G13-HOLDEVAL`; `POST /hold-notices/{id}:acknowledge`.
**Expected:** new document auto-added (`is_auto_added=true`); `hold_notices` SENT to custodian; acknowledge ⇒ `200`; overdue escalates to LH Approver.

---

### FR-G13-010 — E-Signature (PAdES-LTV + RFC-3161)

**TC-G13-061** · Traces-to: FR-G13-010 AC-1/AC-3 · Type: State-Transition · Priority: P2
**Title:** Signing request runs sequential signers to COMPLETED with a SIGNED version
**Test data:** `POST /documents/{id}/signature-requests {mode:SEQUENTIAL, signers:[A,B], method:DSC_TOKEN}`; both sign via `/signature-requests/{id}/sign`.
**Expected:** `201` SENT → first sign IN_PROGRESS → all signed COMPLETED; new `document_version` `version_kind=SIGNED`; each signature records signer/method/legal basis/cert subject/hash.

**TC-G13-062** · Traces-to: FR-G13-010 BR-5 · Type: Negative · Priority: P1
**Title:** Signature method not in the type's allowed list rejected
**Test data:** request `method=OTP_ESIGN` on `CHARGE_SHEET` (allowed={DSC_TOKEN}).
**Expected:** `422` + `ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`.

**TC-G13-063** · Traces-to: FR-G13-010 AC-7 / BR-4 (VAL-G13-LTV) · Type: Data-Integrity · Priority: P1
**Title:** Statutory signature without RFC-3161 timestamp / LTV cannot COMPLETE
**Preconditions:** statutory/WORM document; TSA disabled so LTV not embedded.
**Test data:** complete all signatures; attempt to finalise.
**Expected:** `422` + `ERR-G13-SIGNATURE_LTV_REQUIRED`; `ltv_status` never reaches LTV_ENABLED; request not COMPLETED.

**TC-G13-064** · Traces-to: FR-G13-010 AC-6 · Type: Security · Priority: P1
**Title:** Tampering with a signed version is detected
**Test data:** alter bytes of a SIGNED version; `GET /signatures/{id}/verify`.
**Expected:** `422` + `ERR-G13-SIGNATURE_INVALID` (hash mismatch); distinct from G12's `ERR-G12-SIGNATURE-INVALID`.

**TC-G13-065** · Traces-to: FR-G13-010 LLD · Type: Negative · Priority: P2
**Title:** PKI/eSign provider down maps to 500 with retry semantics
**Preconditions:** SigningProvider stub down.
**Test data:** submit a signature.
**Expected:** `500` + `ERR-G13-SIGNING_SERVICE_UNAVAILABLE` (X.3-mapped, ERR-LOADFAIL); request remains resumable.

**TC-G13-066** · Traces-to: FR-G13-010 AC-5 · Type: State-Transition · Priority: P3
**Title:** Decline halts the envelope; expiry cancels pending
**Test data:** signer B declines with reason; separately let another request expire.
**Expected:** decline ⇒ DECLINED (200) with reason, later signers halted; expiry ⇒ EXPIRED; `JOB-M11-SIGNOFF-REMIND` nudges pending before expiry.

---

### FR-G13-011 — Watermark & Certified Copies

**TC-G13-067** · Traces-to: FR-G13-011 AC-2/AC-3/AC-4 · Type: Functional · Priority: P2
**Title:** Certified true copy is a new WORM derivative; original unaltered
**Test data:** `POST /documents/doc-0002:certified-copy` by `RM-1`.
**Expected:** `200`/`201` new version `version_kind=CERTIFIED_COPY` stamped "CERTIFIED TRUE COPY" with `certificate_no`, issuer, date; `derived_from_version_id` set; original bytes unchanged; statutory copy WORM-stored; chained audit written.

**TC-G13-068** · Traces-to: FR-G13-011 AC-1/AC-6 · Type: Security · Priority: P1
**Title:** CONFIDENTIAL+ render carries a mandatory non-removable watermark
**Test data:** `GET /documents/doc-0001/render?watermark=1`; attempt `watermark=0` on CONFIDENTIAL.
**Expected:** watermark (viewer identity, timestamp, doc number) always present for CONFIDENTIAL+; `watermark=0` ignored/forced on.

**TC-G13-069** · Traces-to: FR-G13-011 LLD · Type: Negative · Priority: P3
**Title:** Rendition failure returns RENDITION_FAILED
**Preconditions:** renderer stub fails on a corrupt source.
**Expected:** `422` + `ERR-G13-RENDITION_FAILED`.

---

### FR-G13-012 — Access Audit & Compliance

**TC-G13-070** · Traces-to: FR-G13-012 AC-1 · Type: Data-Integrity · Priority: P1
**Title:** VIEW and DOWNLOAD each write a distinct chained access row
**Test data:** `:fetch?intent=VIEW` then `:fetch?intent=DOWNLOAD` on `doc-0001` by an entitled caller; `GET /documents/doc-0001/audit`.
**Expected:** two rows `doc_audit_action ∈ {VIEW, DOWNLOAD}`, each with actor/role/IP/UA/version/result=SUCCESS/`correlation_id`, hash-chained.

**TC-G13-071** · Traces-to: FR-G13-012 AC-2 · Type: Data-Integrity · Priority: P1
**Title:** Denied access recorded with result=DENIED + reason
**Test data:** re-use TC-G13-033 denial; query audit.
**Expected:** `document_audit (result=DENIED)` + `security_audit_log` with reason.

**TC-G13-072** · Traces-to: FR-G13-012 AC-5 / DI-3 · Type: Security · Priority: P1
**Title:** Audit rows cannot be updated or deleted
**Test data:** attempt UPDATE/DELETE on `document_audit` (direct + via any API).
**Expected:** rejected (P05 immutable, no endpoint exists); attempt alerts; sole allowed mutation is the DPDPA redaction marker.

**TC-G13-073** · Traces-to: FR-G13-012 AC-4/AC-6 · Type: Functional · Priority: P2
**Title:** Compliance report + export with chain-verification proof
**Test data:** `GET /reports/compliance/OVERDUE_DISPOSITION` by `AUD-1`; `POST /audit:export` for a date range.
**Expected:** `200` report; export (CSV/JSON) includes anchor references + chain-verification proof.

**TC-G13-074** · Traces-to: FR-G13-012 BR-3 · Type: Data-Integrity · Priority: P3
**Title:** Reading the audit trail is itself audited
**Test data:** `AUD-1` reads `GET /documents/doc-0001/audit`.
**Expected:** a further audit entry recording the read event.

---

### FR-G13-013 — Secure Sharing & Expiring Links

**TC-G13-075** · Traces-to: FR-G13-013 AC-2 / DI-12 · Type: Negative · Priority: P1
**Title:** External link requires expires_at and stores only a hashed token
**Test data:** `POST /documents/{id}/shares {share_type:EXTERNAL_LINK}` without `expires_at`.
**Expected:** `422` `VALIDATION_FAILED` (field `expires_at`); a valid link stores only `token_hash`, never the raw token.

**TC-G13-076** · Traces-to: FR-G13-013 AC-3 · Type: Boundary · Priority: P2
**Title:** Access-count cap enforced
**Test data:** external link `max_access_count=2`; access via `GET /shared/{token}` three times.
**Expected:** first two `200`; third `403` + `ERR-G13-SHARE_LIMIT_REACHED`.

**TC-G13-077** · Traces-to: FR-G13-013 AC-7 / DI-12 (R16) · Type: Security · Priority: P1
**Title:** Password brute-force locks the share
**Test data:** 5 wrong passwords on a password-protected link.
**Expected:** after threshold `429` + `ERR-G13-SHARE_LOCKED`; `status=LOCKED`, `locked_until` set; Security alerted (X.2).

**TC-G13-078** · Traces-to: FR-G13-013 AC-6 / BR-1 · Type: Authorization-AccessControl · Priority: P1
**Title:** DLP BLOCK_SHARE prevents external sharing of a flagged document
**Test data:** document with open `dlp_findings.action=BLOCK_SHARE`; `POST /documents/{id}/shares {EXTERNAL_LINK}`.
**Expected:** `403` + `ERR-G13-SHARE_BLOCKED_DLP`; CONFIDENTIAL+ external link additionally requires Security/DLP approval + watermark.

**TC-G13-079** · Traces-to: FR-G13-013 AC-5 / BR-3 · Type: Security · Priority: P2
**Title:** Revoked/expired link returns 404 to anonymous caller (no leak)
**Test data:** `POST /shares/{id}:revoke`; then `GET /shared/{token}`.
**Expected:** revoke `200`; subsequent anonymous fetch `404` (also for expired/locked) — no existence/content leak.

---

### FR-G13-014 — WORM Storage

**TC-G13-080** · Traces-to: FR-G13-014 AC-1/AC-3 · Type: Functional · Priority: P1
**Title:** Declaring WORM sets WORM_LOCKED class + retain-until; auto-applied for statutory types
**Test data:** `POST /documents/{id}:declare-worm {retainUntil}`; upload of a `is_worm_default=true` type.
**Expected:** `is_worm=true`, `storage_class=WORM_LOCKED`, `worm_retain_until` set; statutory-type upload auto-WORM; visible via `GET /documents/{id}/worm-status`.

**TC-G13-081** · Traces-to: FR-G13-014 AC-2 / DI-4 · Type: Data-Integrity · Priority: P1
**Title:** Any mutate/delete/dispose before retain-until is rejected — even for Sys Admin
**Test data:** `SYS-1` attempts supersede/checkin/soft-delete on `doc-0003` before horizon.
**Expected:** `409` + `ERR-G13-WORM_IMMUTABLE` on every path; no admin override.

**TC-G13-082** · Traces-to: FR-G13-014 AC-5 (VAL-G13-WORM) · Type: Negative · Priority: P1
**Title:** Retain-until is extend-only — shortening rejected
**Test data:** `POST /documents/doc-0003:extend-retention` with an earlier date.
**Expected:** `422` + `ERR-G13-RETENTION_SHORTEN_FORBIDDEN`; a later date ⇒ `200`.

**TC-G13-083** · Traces-to: FR-G13-014 AC-4 · Type: Data-Integrity · Priority: P1
**Title:** Legal hold on a WORM document blocks disposition even after retain-until
**Preconditions:** `doc-0003` past `worm_retain_until` but under active hold.
**Test data:** `POST /documents/doc-0003/disposition:propose`.
**Expected:** `409` + `ERR-G13-LEGAL_HOLD_ACTIVE` (hold overrides expired WORM window).

---

### FR-G13-015 — Dedup / Integrity / Preview

**TC-G13-084** · Traces-to: FR-G13-015 AC-1 / DI-6 · Type: Data-Integrity · Priority: P1
**Title:** Domain-scoped dedup reuses one blob in the same domain; cross-domain does NOT
**Test data:** upload identical bytes twice into `DOM_CONFIDENTIAL` (expect `ref_count` reuse internally), then the same bytes into `DOM_SECRET`.
**Expected:** same-domain second upload reuses `storage_objects` (`ref_count++`, `dek_shared=true`) — not surfaced to caller; cross-domain upload creates a separate encrypted blob (no cross-classification reuse).

**TC-G13-085** · Traces-to: FR-G13-015 AC-3/AC-6 / DI-5 · Type: Data-Integrity · Priority: P1
**Title:** Checksum mismatch on read flags integrity failure and blocks serving
**Preconditions:** corrupt stored bytes so `content_hash` no longer matches.
**Test data:** DOWNLOAD the version; run `POST /admin/integrity:scan`.
**Expected:** `422` + `ERR-G13-INTEGRITY_FAILED`; `integrity_verified=false`; version quarantined; alert raised.

**TC-G13-086** · Traces-to: FR-G13-015 AC-2 / DI-6 · Type: Data-Integrity · Priority: P1
**Title:** Shared blob is never crypto-shredded
**Preconditions:** blob with `ref_count>1` (`dek_shared=true`).
**Test data:** trigger erasure/GC targeting that blob.
**Expected:** crypto-shred blocked; only metadata/per-document ACL removed; physical delete only when `ref_count=0` and no WORM/hold.

**TC-G13-087** · Traces-to: FR-G13-015 AC-5 · Type: Authorization-AccessControl · Priority: P2
**Title:** Preview/thumbnail never exposes content to an unauthorised principal
**Test data:** `GET /documents/doc-0002/thumbnail` by `EMP-3001` (insufficient clearance).
**Expected:** `403`/`404`; preview served only under P02 + clearance, watermarked for restricted docs.

---

### FR-G13-016 — DLP & Attach/Fetch Contract

**TC-G13-088** · Traces-to: FR-G13-016 AC-6 / VAL-G13-FETCH-INTENT · Type: API-Contract · Priority: P1
**Title:** Fetch without intent is rejected
**Test data:** `GET /documents/doc-0001:fetch` (no `intent`).
**Expected:** `422` + `ERR-G13-FETCH_INTENT_REQUIRED`.

**TC-G13-089** · Traces-to: FR-G13-016 AC-6 / BR-4 (R2) · Type: API-Contract · Priority: P1
**Title:** VIEW and DOWNLOAD return structurally different responses; VIEW never yields a downloadable/forwardable blob
**Preconditions:** caller has VIEW right but NOT DOWNLOAD on a CONFIDENTIAL doc.
**Test data:** `:fetch?intent=VIEW`, then `:fetch?intent=DOWNLOAD`.
**Expected:** VIEW ⇒ `200` short-TTL, one-time, session/user(+IP)-bound watermarked render URL through the audited proxy (no raw blob); DOWNLOAD ⇒ `403` (lacks DOWNLOAD right). CONFIDENTIAL+ never returns a raw forwardable blob URL; both served bytes audited.

**TC-G13-090** · Traces-to: FR-G13-016 LLD · Type: Negative · Priority: P2
**Title:** Fetch of a disposed document returns DOCUMENT_DISPOSED
**Test data:** `:fetch?intent=VIEW` on a DISPOSED document.
**Expected:** `404` + `ERR-G13-DOCUMENT_DISPOSED`.

> **Note (FR-G13-016 DLP auto-classify):** covered functionally at TC-G13-078 (BLOCK_SHARE) and asserted here — HIGH/CRITICAL PII findings auto-raise classification to ≥ CONFIDENTIAL and tag the document (verify via `GET /documents/{id}/dlp` after ingesting a doc containing an Aadhaar/PAN pattern; classification rises, `security_domain` set).

---

### FR-G13-017 — Principal Clearance

**TC-G13-091** · Traces-to: FR-G13-017 AC-2 / DI-16 · Type: State-Transition · Priority: P1
**Title:** Clearance grant is maker-checker; self-grant rejected
**Test data:** `POST /clearances:propose {principal:EMP-3001, level:CONFIDENTIAL}` by `SEC-1`; `:approve` by distinct `RM-1`; separately `SEC-1` approves own proposal.
**Expected:** propose → PENDING_APPROVAL; distinct approver ⇒ ACTIVE; self-approve ⇒ `403` + `ERR-G13-SOD_VIOLATION`; `document_audit (CLEARANCE_CHANGE)` + `security_audit_log` written.

**TC-G13-092** · Traces-to: FR-G13-017 AC-7 · Type: Authorization-AccessControl · Priority: P2
**Title:** TOP_SECRET clearance requires two approvers and alerts
**Test data:** propose TOP_SECRET with a single approver, then with two.
**Expected:** single approver ⇒ `422` (insufficient approvers); two distinct approvers ⇒ ACTIVE with alert.

**TC-G13-093** · Traces-to: FR-G13-017 AC-5 / BR-4 · Type: State-Transition · Priority: P2
**Title:** Recert lapse auto-suspends clearance to effective INTERNAL
**Test data:** ACTIVE clearance with `valid_until` past / recert overdue; run `JOB-G13-CLEARANCE-RECERT`.
**Expected:** clearance → SUSPENDED/EXPIRED, effective level falls to INTERNAL, Security notified; CONFIDENTIAL+ access removed immediately.

---

### FR-G13-018 — DPDP DSR & Erasure Lattice

**TC-G13-094** · Traces-to: FR-G13-018 AC-2 / DI-15 · Type: Data-Integrity · Priority: P1
**Title:** Erasure of a statutory/hold/WORM document is exempted, basis recorded
**Test data:** `POST /dsr {type:ERASURE, subject:EMP-3001}` covering `doc-0002` (SECRET/WORM/held); DPO adjudicates; `:execute`.
**Expected:** in-scope statutory/hold/WORM doc marked `EXEMPT_RETAINED` with `legal_basis_exemption`; execution attempt on it ⇒ `409` + `ERR-G13-ERASURE_EXEMPTED`; DSR → EXEMPTED/PARTIALLY_FULFILLED; statutory floor never breached.

**TC-G13-095** · Traces-to: FR-G13-018 AC-3 / DI-6 · Type: E2E-Flow · Priority: P1
**Title:** Non-exempt unshared document erased via P05 redaction marker + JOB-M11-DISPOSAL
**Preconditions:** a non-statutory, unheld, non-WORM document with `dek_shared=false`.
**Test data:** DSR ERASURE → DPO review → dual-control execute.
**Expected:** RECEIVED→UNDER_REVIEW→FULFILLED; crypto-shred (unshared) via `JOB-M11-DISPOSAL`; `document_audit (ERASURE)`; `documents.dpdp_erasure_state` updated; audit PII overwritten with P05 redaction marker; shared blob (if any) never shredded.

**TC-G13-096** · Traces-to: FR-G13-018 AC-7 · Type: Authorization-AccessControl · Priority: P1
**Title:** The DPO who exempts cannot also execute the purge (SoD)
**Test data:** `DPO-1` adjudicates and then attempts `:execute` alone.
**Expected:** `403` + `ERR-G13-SOD_VIOLATION`; execution requires a distinct custodian (P01 dual-control).

**TC-G13-097** · Traces-to: FR-G13-018 AC-4 / BR-4 · Type: Security · Priority: P2
**Title:** ACCESS/PORTABILITY assemble only entitled documents, watermarked, excluding sealed
**Test data:** `POST /dsr {type:ACCESS, subject:EMP-3001}`.
**Expected:** returns only documents the subject is entitled to (via audited watermarked fetch path); sealed records the subject may not see are excluded — no existence leak.

---

### FR-G13-019 — Orphan Reaper

**TC-G13-098** · Traces-to: FR-G13-019 AC-1/AC-4 · Type: State-Transition · Priority: P2
**Title:** Zero-link non-WORM/non-held document becomes ORPHANED, never auto-destroyed
**Test data:** detach the last link of `doc-solo`; run `POST /admin/orphans:scan`.
**Expected:** document → ORPHANED + default orphan retention class; appears in `GET /admin/orphans` review queue with last-known links/owner/age; not auto-destroyed.

**TC-G13-099** · Traces-to: FR-G13-019 AC-5 · Type: Data-Integrity · Priority: P1
**Title:** WORM/held documents never become orphans regardless of link_count
**Test data:** detach last link of `doc-0003` (WORM).
**Expected:** `link_count` may reach 0 but status stays ACTIVE/ON-hold — not ORPHANED.

**TC-G13-100** · Traces-to: FR-G13-019 AC-3 / BR-1 · Type: State-Transition · Priority: P3
**Title:** Orphan re-home returns document to ACTIVE
**Test data:** `POST /documents/{id}:rehome` (re-link to a valid entity); attempt re-home to a disposed entity.
**Expected:** valid re-home → ACTIVE; re-home to disposed entity ⇒ `409`.

---

### FR-G13-020 — Audit Hash-Chain & Anchoring

**TC-G13-101** · Traces-to: FR-G13-020 AC-3/AC-4 · Type: Data-Integrity · Priority: P1
**Title:** On-demand chain verification returns pass with anchor references
**Test data:** `POST /audit:verify?from=&to=` over an untampered range by `AUD-1`.
**Expected:** `200` pass; `GET /audit/anchors` shows immutable WORM/notary/TSA-anchored digests.

**TC-G13-102** · Traces-to: FR-G13-020 AC-3 / DI-3 · Type: Security · Priority: P1
**Title:** A broken chain is detected, flagged BROKEN, and never auto-repaired
**Preconditions:** inject a tampered `document_audit` row breaking `row_hash` continuity.
**Test data:** run `JOB-G13-CHAINVERIFY` / `POST /audit:verify`.
**Expected:** `500` + `ERR-G13-AUDIT_CHAIN_BROKEN`; `verification_status=BROKEN`; offending `seq_no` reported; incident alert; no auto-repair.

---

### FR-G13-021 — Redaction Studio (Phase 2)

**TC-G13-103** · Traces-to: FR-G13-021 AC-1/AC-3 · Type: Functional · Priority: P3
**Title:** Redaction produces an irreversible REDACTED derivative; original unaltered
**Test data:** `POST /documents/{id}:redact {regions:[…]}` by `LIB-1`.
**Expected:** new `version_kind=REDACTED` derivative with burned regions; `derived_from_version_id` set; original bytes unchanged; derivative classification inherits/raises.

**TC-G13-104** · Traces-to: FR-G13-021 AC-2 / BR-2 · Type: Data-Integrity · Priority: P2
**Title:** Re-OCR verification catches incomplete redaction
**Preconditions:** redaction leaves recoverable text under the mask.
**Test data:** `:redact` then re-OCR/diff.
**Expected:** `422` + `ERR-G13-REDACTION_INCOMPLETE`; derivative not published.

---

### Cross-cutting: Tenant Isolation, State-Machine Guards, E2E Flows

**TC-G13-105** · Traces-to: §2.2 multi-tenancy / DI (tenant scoping) · Type: Security · Priority: P1
**Title:** Cross-tenant document access is impossible; unscoped query rejected
**Test data:** `GET /documents/doc-0001` (in `TEN-A`) by a `TEN-B` principal; and a query with no tenant scope.
**Expected:** `404` (no cross-tenant existence leak); unscoped query rejected (never defaulted to "all"); no `TEN-A` row returned to `TEN-B`.

**TC-G13-106** · Traces-to: §12.1 document lifecycle · Type: State-Transition · Priority: P2
**Title:** Invalid lifecycle transitions are rejected
**Test data:** attempt DISPOSED→ACTIVE re-activation; attempt QUARANTINED→ACTIVE without Security release; attempt ACTIVE→DELETED on a WORM/held document.
**Expected:** each rejected (`409`/`412`/`ERR-G13-WORM_IMMUTABLE`/`ERR-G13-LEGAL_HOLD_ACTIVE` as applicable); state unchanged.

**TC-G13-107** · Traces-to: §12.9 lifecycle-event inbox / DI-18 · Type: Data-Integrity · Priority: P2
**Title:** Unconfirmed lifecycle event sets provisional anchor but does not confirm it
**Test data:** deliver an `EMPLOYEE_RETIRE` event twice (same `dedupe_key`); one unconfirmed.
**Expected:** processed idempotently by `dedupe_key`; provisional anchor allowed; `anchor_confirmed` NOT flipped true; auto-DESTROY stays blocked (ties to TC-G13-058).

**TC-G13-108** · Traces-to: FR-G13-003/016/012 (attach→fetch) · Type: E2E-Flow · Priority: P1
**Title:** E2E — G09 charge-sheet: module attaches, then fetches VIEW and DOWNLOAD, both audited
**Preconditions:** `SVC-G09` machine token; charge-sheet PDF (SECRET); a cleared human reviewer `SEC-1` (SECRET clearance) with DOWNLOAD right.
**Steps:** 1) `SVC-G09` `POST /documents:attach` binding G09 `charge_sheets/cs-10` (`Idempotency-Key`). 2) `SEC-1` `GET /documents/{id}:fetch?intent=VIEW`. 3) `SEC-1` `GET /documents/{id}:fetch?intent=DOWNLOAD`. 4) `EMP-3001` (subject, INTERNAL, sealed) attempts VIEW. 5) `GET /documents/{id}/audit`.
**Expected:** attach `201` returns stable `documentId`/`linkId`; VIEW ⇒ watermarked one-time render URL; DOWNLOAD ⇒ single-use signed download URL; both write VIEW/DOWNLOAD audit rows; subject fetch ⇒ `404` (sealed, no leak) with a DENIED audit row; module never received a raw blob key.

**TC-G13-109** · Traces-to: FR-G13-001/003/010/014/016 · Type: E2E-Flow · Priority: P1
**Title:** E2E — G11 PPO: attach, LTV-sign, WORM-lock, fetch, then disposal blocked before window
**Preconditions:** `SVC-G11`; PPO type (WORM default, sig={DSC_TOKEN,AADHAAR_ESIGN}).
**Steps:** 1) attach PPO to G11 `pension_cases/pc-9001`. 2) create signature request DSC_TOKEN; sign with RFC-3161 + PAdES-LTV. 3) confirm WORM auto-applied + retain-until. 4) `SEC-1` fetch DOWNLOAD. 5) `LIB-1` propose disposition before `worm_retain_until`.
**Expected:** attach `201`; signed version `SIGNED`, `ltv_status=LTV_ENABLED`; `is_worm=true`/`WORM_LOCKED`; DOWNLOAD audited; disposition ⇒ `409` `ERR-G13-WORM_IMMUTABLE`/`ERR-G13-RETENTION_PERMANENT` per class; every step chained-audited.

**TC-G13-110** · Traces-to: FR-G13-009/012 (retention vs legal-hold conflict) · Type: Data-Integrity · Priority: P1
**Title:** E2E — retention-due vs legal-hold conflict: hold wins, then release enables certified disposal
**Steps:** 1) document reaches `disposition_due_date`; 2) place legal hold; `JOB-M11-RETENTION` cannot flip to DESTROY; 3) `LIB-1` propose disposition ⇒ blocked; 4) dual-control release hold; 5) `LIB-1` propose → `RM-1` approve with confirmed anchor.
**Expected:** step 3 ⇒ `409` `ERR-G13-LEGAL_HOLD_ACTIVE`; after release, disposition executes with certificate + tombstone (DI-4/DI-10); precedence (hold > retention) upheld throughout.

---

### RECON v3.2 — Letter/document config, letter generation & acknowledgements

> Covers the v3.2 field-reconciliation additions (BRD §5.2 E27–E36; SQL Sections F/G): tenant config masters
> (`document_categories` + `document_category_profile_fields`, `merge_field_catalog`), the letter-generation queue
> (`letter_generation_requests`, `bulk_letter_jobs`) and the policy-acknowledgement surface
> (`acknowledgement_campaigns`, `document_acknowledgements`). All rows are tenant-scoped (`TEN-A`/`ENT-A1`).
> New seed refs: category `cat-doccat3` (DOCCAT_3, "Education and Training Certificates"); merge fields
> `LETTER_SERIAL_NO` (SYSTEM), `L1_MANAGER_NAME` (M01_EMPLOYEE_MASTER), `CURRENT_ANNUAL_CTC` (M06_PAYROLL);
> letter type "Relieving Letter" on type `PPO` (sig allowed `{DSC_TOKEN, AADHAAR_ESIGN}`); campaign
> `camp-coc-2026` ("Code of Conduct 2026", version 42) with assignments to `EMP-3001` (self) and `EMP-3002`.

**TC-G13-111** · Traces-to: FR-G13-002 (RECON `document_categories`/`document_category_profile_fields`) · Type: Functional · Priority: P2
**Title:** Configure a document category and link an employee-profile field
**Preconditions:** `LIB-1` authenticated in `TEN-A`.
**Test data:** `POST /document-categories` `{ categoryCode:"DOCCAT_9", name:"Health Records", status:"ACTIVE" }`, `Idempotency-Key: K-cat-9`; then `POST /document-categories/{id}/profile-fields` `{ profileFieldKey:"bank_aadhar_img", displayOrder:1 }`.
**Steps:** 1) POST the category. 2) POST the profile-field link on the returned id. 3) `GET /document-categories/{id}/profile-fields`.
**Expected:** category `201` with `id`, `categoryCode="DOCCAT_9"`, `status="ACTIVE"`, `X-Correlation-Id`; link `201` with `profileFieldKey="bank_aadhar_img"`, `displayOrder=1`; list returns exactly one link (display-order ascending). Rows carry non-null `tenant_id`/`entity_id`.

**TC-G13-112** · Traces-to: FR-G13-002 (RECON, `UNIQUE (tenant_id, category_code)`) · Type: Negative · Priority: P2
**Title:** Duplicate category_code rejected within a tenant
**Preconditions:** `DOCCAT_3` already exists in `TEN-A` (`cat-doccat3`).
**Test data:** `POST /document-categories` `{ categoryCode:"DOCCAT_3", name:"Duplicate", status:"ACTIVE" }`, `Idempotency-Key: K-cat-dup`.
**Steps:** POST the category.
**Expected:** `409` `CONFLICT`; `field` names `categoryCode`; no second `document_categories` row created; the existing DOCCAT_3 unchanged. (`TEN-B` may still create its own DOCCAT_3 — uniqueness is tenant-scoped.)

**TC-G13-113** · Traces-to: FR-G13-010 (RECON `merge_field_catalog`) · Type: Functional · Priority: P2
**Title:** Register a merge field in the catalogue
**Preconditions:** `LIB-1` authenticated in `TEN-A`.
**Test data:** `POST /merge-fields` `{ fieldKey:"RELIEVING_DATE", label:"Relieving date", source:"M03_SEPARATION", resolutionNote:"Resolved at render time", status:"ACTIVE" }`, `Idempotency-Key: K-mf-1`.
**Steps:** 1) POST the merge field. 2) `GET /merge-fields?source=M03_SEPARATION`.
**Expected:** `201` with `id`, `fieldKey="RELIEVING_DATE"`, `source="M03_SEPARATION"`, `status="ACTIVE"`; list contains the new entry; `X-Correlation-Id` present.

**TC-G13-114** · Traces-to: FR-G13-010 (RECON, `UNIQUE (tenant_id, field_key)`) · Type: Negative · Priority: P3
**Title:** Duplicate merge-field key rejected within a tenant
**Preconditions:** `LETTER_SERIAL_NO` already registered in `TEN-A`.
**Test data:** `POST /merge-fields` `{ fieldKey:"LETTER_SERIAL_NO", label:"dup", source:"SYSTEM" }`, `Idempotency-Key: K-mf-dup`.
**Steps:** POST the merge field.
**Expected:** `409` `CONFLICT`; `field` names `fieldKey`; no duplicate `merge_field_catalog` row created.

**TC-G13-115** · Traces-to: FR-G13-010 (RECON `letter_generation_requests`, merge resolution + sign) · Type: E2E-Flow · Priority: P1
**Title:** Generate a letter — all merge tokens resolve, then sign to ISSUED
**Preconditions:** `LIB-1` in `TEN-A`; merge fields `LETTER_SERIAL_NO`, `L1_MANAGER_NAME` registered and resolvable for `EMP-3001` (a confirmed employee with an L1 manager); type `PPO` allows `DSC_TOKEN`; PKI/eSign stub returns success with RFC-3161 + LTV.
**Test data:** `POST /letter-generation-requests` `{ requestNo:"LTR/2026/9001", letterType:"Relieving Letter", documentTypeId:"dt-ppo", employeeId:"EMP-3001", requestContext:"M03 Separation flow" }`, `Idempotency-Key: K-ltr-1`.
**Steps:** 1) POST the request (status DRAFT). 2) `POST /letter-generation-requests/{id}:resolve-merge`. 3) `POST /letter-generation-requests/{id}:generate`. 4) `POST /letter-generation-requests/{id}:sign` `{ method:"DSC_TOKEN" }`. 5) `GET /letter-generation-requests/{id}`.
**Expected:** resolve `200` `mergeFieldsResolved==mergeFieldsTotal`, `unresolvedTokens:[]`; generate `200` produces `generatedDocumentId` (a `documents` row) and advances to `AWAITING_SIGNATURE`; sign `200` binds a `signatureRequestId`, applies PAdES-LTV, and (last signer) advances to `ISSUED`; every step writes a chained `document_audit` row on the P05 substrate.

**TC-G13-116** · Traces-to: FR-G13-010 (RECON, unresolved-token block; VAL-M11-MERGE) · Type: Negative · Priority: P1
**Title:** Unresolved merge token blocks generation; request goes VALIDATION_ERROR
**Preconditions:** merge field `CURRENT_ANNUAL_CTC` (source `M06_PAYROLL`, "Populated only for confirmed employees") is unresolvable for a candidate with no payroll record.
**Test data:** `POST /letter-generation-requests` `{ requestNo:"LTR/2026/9002", letterType:"Appointment Letter", subjectName:"Candidate One", requestContext:"HR Admin (M08 recruitment)" }`; then `:generate`.
**Steps:** 1) POST the request. 2) `POST /letter-generation-requests/{id}:generate`. 3) `GET /letter-generation-requests/{id}`.
**Expected:** generate `422` `ERR-G13-METADATA_INVALID`; `field`/`details` name the unresolved token `CURRENT_ANNUAL_CTC`; request `status="VALIDATION_ERROR"` with `validationError` populated; **no** `generatedDocumentId` and no `documents` row produced.

**TC-G13-117** · Traces-to: FR-G13-010 (RECON sign; `allowed_signature_types`) · Type: Negative · Priority: P2
**Title:** Signing a letter with a method outside the type's allowed list is rejected
**Preconditions:** a generated letter request on type `ID_PROOF` (sig `{}` — no method allowed) at `AWAITING_SIGNATURE`.
**Test data:** `POST /letter-generation-requests/{id}:sign` `{ method:"AADHAAR_ESIGN" }`, `Idempotency-Key: K-sign-bad`.
**Steps:** POST the sign action.
**Expected:** `422` `ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED`; no `signatureRequestId` bound; request stays `AWAITING_SIGNATURE`; a DENIED audit row is written.

**TC-G13-118** · Traces-to: FR-G13-010 (RECON `bulk_letter_jobs`, start + status) · Type: State-Transition · Priority: P2
**Title:** Start a bulk letter job and poll its progress
**Preconditions:** `LIB-1` in `TEN-A`; `JOB-M11-BULKLTR` worker stubbed to process the batch.
**Test data:** `POST /bulk-letter-jobs` `{ jobNo:"BLK/2026/900", jobName:"Q3 Confirmation batch", recordCount:120 }`, `Idempotency-Key: K-blk-1`.
**Steps:** 1) POST to start the job. 2) `GET /bulk-letter-jobs/{id}` (poll). 3) drive the stub to completion; `GET` again.
**Expected:** start `202` with `status="QUEUED"`, `recordCount=120`, `progressPct=0`; poll shows `IN_PROGRESS` with `processedCount` increasing and `progressPct` in [0,100] and an `eta`; terminal `GET` shows `status="COMPLETE"`, `processedCount=120`, `progressPct=100.00`.

**TC-G13-119** · Traces-to: FR-G13-012 (RECON `acknowledgement_campaigns`, create/track) · Type: State-Transition · Priority: P2
**Title:** Create a policy acknowledgement campaign and track its rollup
**Preconditions:** `LIB-1` in `TEN-A`; policy document "Code of Conduct 2026" version 42 vaulted.
**Test data:** `POST /acknowledgement-campaigns` `{ campaignNo:"ACK/2026/900", name:"Code of Conduct v4.2 (annual refresh)", documentTitle:"Code of Conduct 2026", documentVersionNo:42, purpose:"annual refresh", audienceDescription:"All employees", reminderCadence:"Weekly", escalateAfterSlaTo:"hr_admin", deadline:"2026-08-31" }`, `Idempotency-Key: K-camp-1`.
**Steps:** 1) POST the campaign (status DRAFT). 2) `GET /acknowledgement-campaigns/{id}:track`.
**Expected:** `201` with `campaignNo="ACK/2026/900"`, `status="DRAFT"`, `documentVersionNo=42`; track `200` returns rollup fields `assignedCount`/`acknowledgedCount`/`pendingCount`/`overdueCount` (all consistent, `acknowledgedCount+pendingCount+overdueCount==assignedCount`).

**TC-G13-120** · Traces-to: FR-G13-012 (RECON `document_acknowledgements`, DM25 non-repudiation) · Type: Data-Integrity · Priority: P1
**Title:** Record a policy acknowledgement — non-repudiation snapshot captured, PENDING → ACKNOWLEDGED
**Preconditions:** campaign `camp-coc-2026` ACTIVE; assignment `ack-3001` (`EMP-3001`, PENDING, version 42); per-company `policy_letter_settings` sign-off text seeded.
**Test data:** `EMP-3001` `POST /acknowledgement-campaigns/camp-coc-2026/acknowledgements` `{ employeeId:"EMP-3001", documentVersionNo:42, consentTextSnapshot:"I confirm that I have read and understood this document completely and would like to sign off on the document", appVersion:"Chrome/126.0 (macOS)" }`, `Idempotency-Key: K-ack-1`.
**Steps:** 1) `EMP-3001` POST the acknowledgement. 2) `GET /acknowledgement-campaigns/camp-coc-2026/acknowledgements?status=ACKNOWLEDGED`.
**Expected:** `201` with `status="ACKNOWLEDGED"`, `acknowledgedAt` set, `documentVersionNo=42`, and the write-once non-repudiation fields captured (`consentTextSnapshot`, `appVersion`, server-captured `ipAddress`); the row is unique on `(campaignId, employeeId)`; campaign `acknowledgedCount` increments by 1 and `pendingCount` decrements by 1; a chained `document_audit` row is written on the P05 substrate.

**TC-G13-121** · Traces-to: FR-G13-012 (RECON, IDOR / own-scope) · Type: Authorization-AccessControl · Priority: P1
**Title:** An employee cannot acknowledge on behalf of another (IDOR)
**Preconditions:** assignment `ack-3002` belongs to `EMP-3002`.
**Test data:** `EMP-3001` `POST /acknowledgement-campaigns/camp-coc-2026/acknowledgements` `{ employeeId:"EMP-3002", documentVersionNo:42, consentTextSnapshot:"…", appVersion:"Chrome/126.0" }`.
**Steps:** `EMP-3001` POST acknowledging `EMP-3002`'s assignment.
**Expected:** `403` `FORBIDDEN`; `EMP-3002`'s assignment stays `PENDING` with no snapshot written; a DENIED audit row is recorded; existence of the other assignment is never leaked.

**TC-G13-122** · Traces-to: FR-G13-012 (RECON `document_acknowledgements`, write-once) · Type: Negative · Priority: P2
**Title:** Re-recording an already-acknowledged assignment is rejected (write-once)
**Preconditions:** assignment `ack-3001` already `ACKNOWLEDGED` (TC-G13-120).
**Test data:** `POST /document-acknowledgements/ack-3001:record` `{ consentTextSnapshot:"tampered", appVersion:"curl/8", documentVersionNo:42 }`, `Idempotency-Key: K-rec-dup`.
**Steps:** POST the record action on the already-acknowledged row.
**Expected:** `409` `CONFLICT`; the original `consentTextSnapshot`/`appVersion`/`acknowledgedAt` are unchanged (snapshot fields are write-once); no audit tamper.

---

## 3. Traceability Matrix (FR → TC ids)

| FR | Title | Test cases |
|----|-------|------------|
| FR-G13-001 | Upload & Ingestion | TC-G13-001, 002, 003, 004, 005, 006, 007, 008, 109 |
| FR-G13-002 | Types / Taxonomy / Classification / Tagging | TC-G13-009, 010, 011, 012, 013, 014, 111, 112 |
| FR-G13-003 | Folders & Attach Contract | TC-G13-015, 016, 017, 018, 019, 108 |
| FR-G13-004 | Versioning / Check-in-out / Supersede | TC-G13-020, 021, 022, 023, 024, 025, 026 |
| FR-G13-005 | Encryption / KMS / Key-DR / Break-glass | TC-G13-027, 028, 029, 030, 031, 032 |
| FR-G13-006 | Access Control (P02 + clearance + relationship) | TC-G13-033, 034, 035, 036, 037, 038, 039, 040 |
| FR-G13-007 | Malware / Quarantine / Sandbox | TC-G13-041, 042, 043, 044, 045 |
| FR-G13-008 | OCR & Permission-Aware Search | TC-G13-046, 047, 048 |
| FR-G13-009 | Retention / Legal Hold / Disposition | TC-G13-049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 110 |
| FR-G13-010 | E-Signature (PAdES-LTV + RFC-3161) | TC-G13-061, 062, 063, 064, 065, 066, 109, 113, 114, 115, 116, 117, 118 |
| FR-G13-011 | Watermark & Certified Copies | TC-G13-067, 068, 069 |
| FR-G13-012 | Access Audit & Compliance | TC-G13-070, 071, 072, 073, 074, 108, 119, 120, 121, 122 |
| RECON v3.2 — Letter/document config, generation & acknowledgements | `document_categories`(+profile fields), `merge_field_catalog`, `letter_generation_requests`, `bulk_letter_jobs`, `acknowledgement_campaigns`, `document_acknowledgements` (BRD §5.2 E27–E36) | TC-G13-111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122 |
| FR-G13-013 | Secure Sharing & Expiring Links | TC-G13-075, 076, 077, 078, 079 |
| FR-G13-014 | WORM Storage | TC-G13-080, 081, 082, 083, 109 |
| FR-G13-015 | Dedup / Integrity / Preview | TC-G13-084, 085, 086, 087 |
| FR-G13-016 | DLP & Attach/Fetch Contract | TC-G13-088, 089, 090, 108 |
| FR-G13-017 | Principal Clearance | TC-G13-091, 092, 093 |
| FR-G13-018 | DPDP DSR & Erasure Lattice | TC-G13-094, 095, 096, 097 |
| FR-G13-019 | Orphan Reaper | TC-G13-098, 099, 100 |
| FR-G13-020 | Audit Hash-Chain & Anchoring | TC-G13-101, 102 |
| FR-G13-021 | Redaction Studio (Phase 2) | TC-G13-103, 104 |
| Cross-cutting (tenant isolation, state guards, event inbox) | §2.2 / §12.1 / §12.9 | TC-G13-105, 106, 107 |

**Gaps: 0** — every FR-G13-001…021 has ≥ 2 test cases; the MUST-cover surfaces (attach/fetch VIEW vs DOWNLOAD, versioning, classification+clearance+relationship access control, IDOR, encryption/crypto-shred, virus/quarantine, retention/WORM, legal-hold dual-control SoD, e-signature PAdES-LTV, expiring share links, DPDP erasure, audit of every view/download, and the G09/G11 attach-then-fetch E2E) are all represented.

### 3.1 Error-code coverage (ERR-G13-*, 35 codes)

| Error code | HTTP | TC |
|-----------|------|----|
| ERR-G13-INVALID_FILE_TYPE | 422 | TC-G13-002, 045 |
| ERR-G13-FILE_TOO_LARGE | 422 | TC-G13-003 |
| ERR-G13-EMPTY_FILE | 422 | TC-G13-004 |
| ERR-G13-FETCH_INTENT_REQUIRED | 422 | TC-G13-088 |
| ERR-G13-METADATA_INVALID | 422 | TC-G13-010, 116 |
| ERR-G13-MALWARE_DETECTED | 422 | TC-G13-041 |
| ERR-G13-RENDER_RESOURCE_LIMIT | 422 | TC-G13-044 |
| ERR-G13-INTEGRITY_FAILED | 422 | TC-G13-085 |
| ERR-G13-DOCUMENT_LOCKED | 409 | TC-G13-022, 023 |
| ERR-G13-CHECKOUT_NOT_SUPPORTED | 409 | TC-G13-021 |
| ERR-G13-WORM_IMMUTABLE | 409 | TC-G13-024, 081, 106, 109 |
| ERR-G13-RETENTION_SHORTEN_FORBIDDEN | 422 | TC-G13-082 |
| ERR-G13-RETENTION_PERMANENT | 409 | TC-G13-056, 109 |
| ERR-G13-LEGAL_HOLD_ACTIVE | 409 | TC-G13-055, 083, 110 |
| ERR-G13-HOLD_RELEASE_SOD | 403 | TC-G13-053 |
| ERR-G13-ANCHOR_UNCONFIRMED | 409 | TC-G13-058 |
| ERR-G13-SOD_VIOLATION | 403 | TC-G13-052, 057, 091, 096 |
| ERR-G13-CLASSIFICATION_LOCKED | 403 | TC-G13-011 |
| ERR-G13-CLEARANCE_INSUFFICIENT | 403 | TC-G13-033, 039 |
| ERR-G13-DOCUMENT_NOT_ATTACHABLE | 409 | TC-G13-016 |
| ERR-G13-LINK_CONFLICT | 409 | TC-G13-017 |
| ERR-G13-SHARE_BLOCKED_DLP | 403 | TC-G13-078 |
| ERR-G13-SHARE_LIMIT_REACHED | 403 | TC-G13-076 |
| ERR-G13-SHARE_LOCKED | 429 | TC-G13-077 |
| ERR-G13-BREAK_GLASS_LOCKED | 429 | TC-G13-031 |
| ERR-G13-SIGNATURE_INVALID | 422 | TC-G13-064 |
| ERR-G13-SIGNATURE_METHOD_NOT_ALLOWED | 422 | TC-G13-013, 062, 117 |
| ERR-G13-SIGNATURE_LTV_REQUIRED | 422 | TC-G13-063 |
| ERR-G13-SIGNING_SERVICE_UNAVAILABLE | 500 | TC-G13-065 |
| ERR-G13-KEY_SERVICE_UNAVAILABLE | 500 | TC-G13-029 |
| ERR-G13-RENDITION_FAILED | 422 | TC-G13-069 |
| ERR-G13-REDACTION_INCOMPLETE | 422 | TC-G13-104 |
| ERR-G13-AUDIT_CHAIN_BROKEN | 500 | TC-G13-102 |
| ERR-G13-ERASURE_EXEMPTED | 409 | TC-G13-094 |
| ERR-G13-DOCUMENT_DISPOSED | 404 | TC-G13-090 |

All 35 module error codes are asserted (code + HTTP status).

---

## 4. Coverage Summary

### 4.1 By type

| Type | Count | Test cases |
|------|-------|-----------|
| Functional | 16 | 001, 005, 008, 009, 014, 019, 025, 027, 028, 042, 048, 049, 067, 073, 103, 111, 113 |
| Boundary | 3 | 003, 076 (+ implicit at 026) |
| Negative | 20 | 002, 004, 010, 013, 016, 017, 021, 022, 026, 056, 062, 065, 069, 075, 090, 112, 114, 116, 117, 122 |
| Authorization-AccessControl | 15 | 011, 023, 032, 033, 036, 038(func-adjacent), 043, 046, 052, 053, 057, 078, 087, 092, 096, 121 |
| Security | 12 | 007, 030, 031, 034, 035, 041, 044, 045, 047, 064, 068, 072, 079, 097, 102, 105 |
| State-Transition | 13 | 012, 018, 020, 039, 050, 051, 054, 061, 066, 091, 093, 098, 100, 106, 118, 119 |
| Data-Integrity | 14 | 006, 024, 037, 055, 058, 070, 071, 074, 081, 083, 084, 085, 086, 099, 104, 107, 110, 120 |
| API-Contract | 3 | 015, 088, 089 |
| E2E-Flow | 5 | 059, 095, 108, 109, 115 |

> Note: several cases legitimately carry a dominant type above; where a case exercises two concerns (e.g., an authorization denial that must also be audited), it is counted under its primary declared Type. Total distinct cases = 122 (110 base + 12 RECON v3.2).

### 4.2 By priority

| Priority | Meaning | Count |
|----------|---------|-------|
| P1 | Critical (statutory custody, access control, SoD, WORM, integrity, E2E contract) | 60 |
| P2 | High (core functional + important negatives) | 33 |
| P3 | Medium (secondary functional / edge) | 9 |

### 4.3 Totals

| Metric | Value |
|--------|-------|
| Total test cases | 122 |
| FRs covered | 21 of 21 (100%, 0 gaps) + RECON v3.2 letter/config/acknowledgement surface (TC-G13-111…122) |
| ERR-G13-* codes asserted | 35 of 35 |
| State tables exercised | §12.1–12.9 (document, version, legal-hold, disposition, signature, share, clearance, DSR, event-inbox) |
| Multi-tenant isolation | TC-G13-105 |
| MUST-cover E2E (G09 attach→fetch, G11 PPO) | TC-G13-108, 109 |
