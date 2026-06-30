-- =====================================================================================
-- GOVERNMENT HRMS — MODULE SCHEMA: G13 DOCUMENT MANAGEMENT & SECURE STORAGE (13-G13)
-- =====================================================================================
-- Owner module: G13 (GOV-M13) — the full document vault model. Extends/REUSES the
-- PrimeSoft M11 vault; runs doc-gen/sign-off on the P01 workflow engine; access via P02;
-- mutation audit via the P05 dual log (DB-trigger); access audit + tamper-evidence as the
-- gov extension (document_audit + audit_anchors, tracking OPEN-PLAT-03).
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                       (mandatory module conventions)
--   docs/data-model/00-platform-core.sql                 (canonical tables; reuse, never redefine)
--   docs/brd/v3/G13-document-management-secure-storage.md (§5 entities E3–E26, enums, DI rules)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Load AFTER 00-platform-core.sql (and after any module ordered before it;
--   G13 has no cross-module table dependencies beyond the core). Run as:
--     psql -v ON_ERROR_STOP=1 -f 00-platform-core.sql -f 13-G13-document-management.sql
--
-- CORE TABLES (referenced, NEVER redefined): documents, document_versions (G13 core
--   columns live in 00 Section 7); tenants, entities, org_units, employees, users,
--   workflows/workflow_instances/workflow_actions, audit_log, security_audit_log,
--   consent_records, notifications, jobs, migration_runs. This file FKs to them by id.
--   The core `documents` row already carries every gov column G13 needs (classification,
--   security_domain, is_worm, is_sealed, legal_hold_count, anchor_confirmed,
--   dpdp_erasure_state, …) so NO document_extensions satellite is required.
--
-- ENUMS. Reuses core CLOSED enums as-is (classification_level, document_status,
--   scan_status, source_channel, version_kind, ocr_status, erasure_method for
--   documents.dpdp_erasure_state). Module-owned enums are g13_-prefixed (Section A).
--   Tenant-configurable value sets (document_type, retention class) are MASTER TABLES,
--   not enums (CONVENTIONS §4).
--
-- USER / WORKFLOW REFERENCES. Columns naming a user (created_by/updated_by and the
--   domain actor columns granted_by, placed_by, actor_user_id, …) are LOGICAL uuid refs
--   with NO FK (CONVENTIONS §3) — they survive user removal and avoid bootstrap coupling;
--   they are still indexed where queried. workflow_instance_id is a logical ref to the P01
--   engine (no FK, to avoid coupling to a workflow not yet started). Real FKs are kept for
--   tenants/entities/org_units/employees/consent_records and all intra-G13 references.
--
-- APPEND-ONLY LEDGERS (CONVENTIONS §3): document_audit, scan_results,
--   signature_ltv_artifacts — carry created/occurred timestamp only, NO updated_at, NO
--   is_deleted; immutability enforced by P05 grants/triggers (the sole permitted mutation
--   being a DPDPA redaction marker). All other tables carry the full standard audit set.
--
-- RLS. Every table is tenant-scoped; the P02 tenant-isolation policy is applied in
--   Section D via a DO-block (identical template to the core, CONVENTIONS §6).
--
-- DEFERRED FKs. Section C wires the core forward-reference columns
--   (documents.document_type_id/folder_id/retention_assignment_id,
--   document_versions.storage_object_id) to the module tables now that they exist.
-- =====================================================================================


-- =====================================================================================
-- SECTION A — MODULE ENUM TYPES (g13_-prefixed; UPPER_SNAKE_CASE values)
-- =====================================================================================
CREATE TYPE g13_doc_category            AS ENUM ('IDENTITY','SERVICE','FINANCIAL','DISCIPLINARY','MEDICAL','TRAINING','PENSION','STATUTORY','OTHER');
CREATE TYPE g13_checkout_mode           AS ENUM ('NONE','OPTIONAL','REQUIRED');
CREATE TYPE g13_folder_type             AS ENUM ('CABINET','EMPLOYEE','MODULE','CASE','SHARED','SYSTEM');
CREATE TYPE g13_principal_type          AS ENUM ('USER','ROLE','ORG_UNIT','RELATIONSHIP');
CREATE TYPE g13_acl_effect              AS ENUM ('ALLOW','DENY');
CREATE TYPE g13_tag_type                AS ENUM ('CLASSIFICATION','KEYWORD','PII_CATEGORY','RETENTION_HINT','SYSTEM');
CREATE TYPE g13_tag_origin              AS ENUM ('USER','OCR','DLP','SYSTEM');
CREATE TYPE g13_retention_trigger       AS ENUM ('ON_CREATE','ON_SUPERSEDE','ON_EMPLOYEE_RETIRE','ON_CASE_CLOSE','FISCAL_YEAR_END');
CREATE TYPE g13_disposition_action      AS ENUM ('DESTROY','ARCHIVE_TRANSFER','REVIEW');
CREATE TYPE g13_retention_scope         AS ENUM ('DOCUMENT','DOCUMENT_TYPE','FOLDER');
CREATE TYPE g13_retention_status        AS ENUM ('ACTIVE','DUE','HELD','DISPOSED');
CREATE TYPE g13_legal_hold_status       AS ENUM ('PENDING_APPROVAL','ACTIVE','RELEASE_PROPOSED','RELEASED');
CREATE TYPE g13_hold_match_basis        AS ENUM ('MANUAL','SAVED_SEARCH','EMPLOYEE','CASE');
CREATE TYPE g13_hold_notice_status      AS ENUM ('SENT','ACKNOWLEDGED','OVERDUE','ESCALATED');
CREATE TYPE g13_doc_audit_action        AS ENUM ('VIEW','PREVIEW','DOWNLOAD','PRINT','SHARE','METADATA_UPDATE','VERSION_ADD','CLASSIFY','DISPOSE','HOLD_PLACE','HOLD_RELEASE','ACL_CHANGE','BREAK_GLASS','CLEARANCE_CHANGE','ERASURE');
CREATE TYPE g13_audit_result            AS ENUM ('SUCCESS','DENIED');
CREATE TYPE g13_anchor_target           AS ENUM ('WORM','EXTERNAL_NOTARY','RFC3161_TSA');
CREATE TYPE g13_anchor_verify_status    AS ENUM ('PENDING','VERIFIED','BROKEN');
CREATE TYPE g13_share_type              AS ENUM ('INTERNAL_USER','EXTERNAL_LINK');
CREATE TYPE g13_share_status            AS ENUM ('ACTIVE','EXPIRED','REVOKED','LOCKED');
CREATE TYPE g13_lock_status             AS ENUM ('ACTIVE','RELEASED','EXPIRED','FORCE_RELEASED');
CREATE TYPE g13_signing_mode            AS ENUM ('SEQUENTIAL','PARALLEL');
CREATE TYPE g13_signature_request_status AS ENUM ('DRAFT','SENT','IN_PROGRESS','COMPLETED','DECLINED','EXPIRED','CANCELLED');
CREATE TYPE g13_signature_type          AS ENUM ('AADHAAR_ESIGN','DSC_TOKEN','OTP_ESIGN','DRAWN');
CREATE TYPE g13_signature_status        AS ENUM ('PENDING','SIGNED','DECLINED');
CREATE TYPE g13_ltv_status              AS ENUM ('NONE','TIMESTAMPED','LTV_ENABLED');
CREATE TYPE g13_disposition_status      AS ENUM ('PROPOSED','APPROVED','EXECUTED','REJECTED','BLOCKED_HOLD');
CREATE TYPE g13_erasure_method          AS ENUM ('CRYPTO_SHRED','PHYSICAL_PURGE','EXEMPT_RETAINED');
CREATE TYPE g13_storage_class           AS ENUM ('HOT','WARM','COLD','WORM_LOCKED');
CREATE TYPE g13_key_scope               AS ENUM ('SHARED_CMK','DEDICATED_CMK');
CREATE TYPE g13_dlp_severity            AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE g13_dlp_action              AS ENUM ('TAG','RECLASSIFY','REDACT','BLOCK_SHARE');
CREATE TYPE g13_dlp_finding_status      AS ENUM ('OPEN','ACCEPTED','DISMISSED','REMEDIATED');
CREATE TYPE g13_clearance_principal_type AS ENUM ('USER','ROLE');
CREATE TYPE g13_clearance_status        AS ENUM ('PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRED','REVOKED');
CREATE TYPE g13_dsr_type                AS ENUM ('ACCESS','ERASURE','RECTIFICATION','PORTABILITY');
CREATE TYPE g13_dsr_status              AS ENUM ('RECEIVED','UNDER_REVIEW','EXEMPTED','PARTIALLY_FULFILLED','FULFILLED','REJECTED');
CREATE TYPE g13_lifecycle_event_type    AS ENUM ('EMPLOYEE_RETIRE','EMPLOYEE_MERGE','CASE_CLOSE','FISCAL_YEAR_END','ANCHOR_CORRECTION');
CREATE TYPE g13_event_status            AS ENUM ('RECEIVED','PROCESSED','FAILED','DEAD_LETTER');


-- =====================================================================================
-- SECTION B — MODULE TABLES (ordered so a referenced table precedes its referrers)
-- =====================================================================================

-- E19 storage_objects ----------------------------------------------------------------
CREATE TABLE storage_objects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    bucket            varchar(120) NOT NULL,
    object_key        varchar(512) NOT NULL,
    content_hash      char(64) NOT NULL,
    dedup_index_key   char(64) NOT NULL,                       -- HMAC(content_hash, domain_secret) — no oracle (R9)
    security_domain   varchar(40) NOT NULL DEFAULT 'DEFAULT',  -- dedup/key boundary (R1/R9)
    key_scope         g13_key_scope NOT NULL DEFAULT 'SHARED_CMK',
    dek_shared        boolean NOT NULL DEFAULT false,          -- ref by >1 doc => no crypto-shred (R1)
    size_bytes        bigint NOT NULL,
    encryption_alg    varchar(40) NOT NULL DEFAULT 'AES-256-GCM',
    kms_key_id        varchar(160) NOT NULL,
    wrapped_dek       bytea NOT NULL,
    storage_class     g13_storage_class NOT NULL DEFAULT 'HOT',
    worm_retain_until timestamptz,                             -- gov EXTENSION — object-lock retention
    ref_count         integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_storage_objects_tenant ON storage_objects(tenant_id);
CREATE INDEX ix_storage_objects_dedup  ON storage_objects(security_domain, dedup_index_key);  -- domain-scoped dedup (DI-6)

-- E4 folders (self-referential tree) -------------------------------------------------
CREATE TABLE folders (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    parent_folder_id     uuid REFERENCES folders(id) ON DELETE RESTRICT,
    name                 varchar(160) NOT NULL,
    path                 varchar(1024) NOT NULL,
    folder_type          g13_folder_type NOT NULL,
    context_module       varchar(10),
    context_ref_id       uuid,
    owning_org_unit_id   uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    default_classification classification_level,
    is_system_managed    boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_folders_tenant   ON folders(tenant_id);
CREATE INDEX ix_folders_parent   ON folders(parent_folder_id);
CREATE INDEX ix_folders_org_unit ON folders(owning_org_unit_id);
CREATE INDEX ix_folders_context  ON folders(context_module, context_ref_id);

-- E8 document_retention_policies (REUSE M11 retention classes) --------------------------------
CREATE TABLE document_retention_policies (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid REFERENCES entities(id) ON DELETE RESTRICT,
    policy_code               varchar(60) NOT NULL,
    name                      varchar(160) NOT NULL,
    trigger_event             g13_retention_trigger NOT NULL,
    retention_period_months   integer,                          -- null => permanent
    is_permanent              boolean NOT NULL DEFAULT false,
    disposition_action        g13_disposition_action NOT NULL DEFAULT 'REVIEW',
    review_required           boolean NOT NULL DEFAULT true,
    requires_confirmed_anchor boolean NOT NULL DEFAULT true,    -- gov EXTENSION — auto-DESTROY gate (R12)
    statutory_basis           varchar(160),
    is_active                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_retention_policies_code UNIQUE (tenant_id, policy_code),
    CONSTRAINT ck_document_retention_policies_period CHECK (is_permanent OR retention_period_months IS NOT NULL)  -- DI-13
);
CREATE INDEX ix_document_retention_policies_tenant ON document_retention_policies(tenant_id);

-- E3 document_types (EXTEND letter_templates / merge-field model) ---------------------
CREATE TABLE document_types (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    type_code                   varchar(60) NOT NULL,
    name                        varchar(160) NOT NULL,
    category                    g13_doc_category NOT NULL,
    metadata_schema             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- JSON-Schema, realised as a W.2 form
    letter_template_ref         uuid,                                -- logical ref to M11 letter_templates
    default_classification      classification_level NOT NULL DEFAULT 'INTERNAL',
    default_security_domain     varchar(40) NOT NULL DEFAULT 'DEFAULT',
    default_retention_policy_id uuid REFERENCES document_retention_policies(id) ON DELETE SET NULL,
    is_worm_default             boolean NOT NULL DEFAULT false,
    requires_signature          boolean NOT NULL DEFAULT false,
    allowed_signature_types     text[] NOT NULL DEFAULT '{}',        -- whitelist subset of g13_signature_type (R7)
    signature_legal_basis       varchar(120),
    checkout_mode               g13_checkout_mode NOT NULL DEFAULT 'OPTIONAL',
    allowed_mime_types          text[] NOT NULL DEFAULT '{}',        -- VAL-FILE
    max_size_mb                 integer NOT NULL DEFAULT 25,
    is_top_secret_eligible      boolean NOT NULL DEFAULT false,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_types_code UNIQUE (tenant_id, type_code)
);
CREATE INDEX ix_document_types_tenant    ON document_types(tenant_id);
CREATE INDEX ix_document_types_retention ON document_types(default_retention_policy_id);

-- E25 lifecycle_event_inbox (GAP — anchor recompute; platform outbox) -----------------
CREATE TABLE lifecycle_event_inbox (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    source_module     varchar(10) NOT NULL,
    event_type        g13_lifecycle_event_type NOT NULL,
    subject_ref_id    uuid NOT NULL,                            -- employee_id / case_id
    effective_date    date NOT NULL,
    is_confirmed      boolean NOT NULL DEFAULT false,           -- only source's final event flips anchor (R12)
    dedupe_key        varchar(120) NOT NULL,                    -- idempotency (at-least-once delivery)
    processing_status g13_event_status NOT NULL DEFAULT 'RECEIVED',
    received_at       timestamptz NOT NULL DEFAULT now(),
    processed_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    CONSTRAINT uq_lifecycle_event_dedupe UNIQUE (tenant_id, dedupe_key)  -- DI-18 idempotency
);
CREATE INDEX ix_lifecycle_event_tenant  ON lifecycle_event_inbox(tenant_id);
CREATE INDEX ix_lifecycle_event_status  ON lifecycle_event_inbox(processing_status);
CREATE INDEX ix_lifecycle_event_subject ON lifecycle_event_inbox(subject_ref_id);

-- E9 retention_assignments -----------------------------------------------------------
CREATE TABLE retention_assignments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    retention_policy_id  uuid NOT NULL REFERENCES document_retention_policies(id) ON DELETE RESTRICT,
    scope_type           g13_retention_scope NOT NULL,
    scope_ref_id         uuid NOT NULL,                         -- document/type/folder id per scope_type
    trigger_anchor_date  date,
    anchor_source_event_id uuid REFERENCES lifecycle_event_inbox(id) ON DELETE SET NULL,  -- (R12)
    disposition_due_date date,                                  -- anchor + period (null if permanent)
    status               g13_retention_status NOT NULL DEFAULT 'ACTIVE',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_retention_assign_tenant   ON retention_assignments(tenant_id);
CREATE INDEX ix_retention_assign_policy   ON retention_assignments(retention_policy_id);
CREATE INDEX ix_retention_assign_scope    ON retention_assignments(scope_type, scope_ref_id);
CREATE INDEX ix_retention_assign_event    ON retention_assignments(anchor_source_event_id);
CREATE INDEX ix_retention_assign_status   ON retention_assignments(status);

-- E5 document_acls (read by P02) -----------------------------------------------------
CREATE TABLE document_acls (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id      uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id    uuid REFERENCES documents(id) ON DELETE CASCADE,   -- null => folder-level grant
    folder_id      uuid REFERENCES folders(id) ON DELETE CASCADE,     -- null => document-level grant
    principal_type g13_principal_type NOT NULL,
    principal_ref  varchar(80) NOT NULL,                              -- user_id / role code / org_unit_id / rel key
    rights         text[] NOT NULL DEFAULT '{}',                      -- {VIEW,DOWNLOAD,PRINT,UPDATE,VERSION,SHARE,MANAGE_ACL}
    effect         g13_acl_effect NOT NULL DEFAULT 'ALLOW',           -- DENY wins (DI-8)
    need_to_know   boolean NOT NULL DEFAULT false,
    expires_at     timestamptz,
    granted_by     uuid,                                              -- logical user ref
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_document_acls_target CHECK (document_id IS NOT NULL OR folder_id IS NOT NULL)
);
CREATE INDEX ix_document_acls_tenant    ON document_acls(tenant_id);
CREATE INDEX ix_document_acls_document  ON document_acls(document_id);
CREATE INDEX ix_document_acls_folder    ON document_acls(folder_id);
CREATE INDEX ix_document_acls_principal ON document_acls(principal_type, principal_ref);

-- E6 document_tags -------------------------------------------------------------------
CREATE TABLE document_tags (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_type    g13_tag_type NOT NULL,
    tag_key     varchar(80) NOT NULL,
    tag_value   varchar(160),
    applied_by  g13_tag_origin NOT NULL DEFAULT 'USER',
    confidence  numeric(4,3),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,
    updated_by  uuid,
    is_deleted  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_document_tags_tenant   ON document_tags(tenant_id);
CREATE INDEX ix_document_tags_document ON document_tags(document_id);
CREATE INDEX ix_document_tags_key      ON document_tags(tag_type, tag_key);

-- E7 document_links (the attach contract used by G01–G12) -----------------------------
CREATE TABLE document_links (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id    uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    module_code  varchar(10) NOT NULL,                          -- G01..G12
    entity_name  varchar(80) NOT NULL,                          -- referencing entity table
    entity_ref_id uuid NOT NULL,                                -- PK value in that entity
    link_role    varchar(60) NOT NULL,                          -- PROOF/ORDER/EXHIBIT/CERTIFICATE
    is_primary   boolean NOT NULL DEFAULT false,
    linked_by    uuid,                                          -- logical user ref
    detached_at  timestamptz,                                   -- drives documents.link_count recompute (R15)
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_document_links_tenant   ON document_links(tenant_id);
CREATE INDEX ix_document_links_document ON document_links(document_id);
CREATE INDEX ix_document_links_context  ON document_links(module_code, entity_name, entity_ref_id);

-- E10 document_legal_holds (GAP — runs on P01 SoD + P05) --------------------------------------
CREATE TABLE document_legal_holds (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id) ON DELETE RESTRICT,
    hold_no                varchar(40) NOT NULL,
    matter_name            varchar(200) NOT NULL,
    reason                 text NOT NULL,
    authority              varchar(160) NOT NULL,
    match_criteria         jsonb,                                -- predicate for JOB-G13-HOLDEVAL (R11)
    is_high_value          boolean NOT NULL DEFAULT false,       -- placement needs approver (R10)
    status                 g13_legal_hold_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    placed_by              uuid,                                 -- logical user ref (LH Admin)
    placed_at              timestamptz NOT NULL DEFAULT now(),
    placement_approved_by  uuid,                                 -- LH Approver (high-value); P01 (R10)
    release_proposed_by    uuid,                                 -- maker for release (R10)
    release_approved_by    uuid,                                 -- checker; must != proposer (R10)
    released_at            timestamptz,
    release_reason         text,                                 -- mandatory on release (VAL-G13-HOLD-SOD)
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_legal_holds_no UNIQUE (tenant_id, hold_no),
    CONSTRAINT ck_document_legal_holds_release_sod CHECK (release_approved_by IS NULL OR release_approved_by <> release_proposed_by)  -- DI-17
);
CREATE INDEX ix_document_legal_holds_tenant ON document_legal_holds(tenant_id);
CREATE INDEX ix_document_legal_holds_status ON document_legal_holds(status);

-- E11 legal_hold_items ---------------------------------------------------------------
CREATE TABLE legal_hold_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id) ON DELETE RESTRICT,
    legal_hold_id uuid NOT NULL REFERENCES document_legal_holds(id) ON DELETE RESTRICT,
    document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    match_basis   g13_hold_match_basis NOT NULL DEFAULT 'MANUAL',
    is_auto_added boolean NOT NULL DEFAULT false,                -- future match by continuous-eval (R11)
    held_at       timestamptz NOT NULL DEFAULT now(),
    released_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_legal_hold_items UNIQUE (legal_hold_id, document_id)
);
CREATE INDEX ix_legal_hold_items_tenant   ON legal_hold_items(tenant_id);
CREATE INDEX ix_legal_hold_items_hold     ON legal_hold_items(legal_hold_id);
CREATE INDEX ix_legal_hold_items_document ON legal_hold_items(document_id);

-- E13 document_shares (anti-brute-force) ---------------------------------------------
CREATE TABLE document_shares (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_id          uuid REFERENCES document_versions(id) ON DELETE SET NULL,
    share_type          g13_share_type NOT NULL,
    recipient_user_id   uuid,                                    -- logical user ref (internal)
    recipient_email     varchar(160),
    token_hash          char(64),                                -- SHA-256 of opaque token (never raw)
    rights              text[] NOT NULL DEFAULT '{VIEW}',        -- subset {VIEW,DOWNLOAD}
    password_hash       varchar(255),                            -- argon2id
    failed_attempt_count integer NOT NULL DEFAULT 0,             -- anti-brute-force (R16)
    locked_until        timestamptz,
    max_access_count    integer,
    access_count        integer NOT NULL DEFAULT 0,
    watermark_required  boolean NOT NULL DEFAULT false,
    expires_at          timestamptz NOT NULL,                    -- mandatory (DI-12)
    status              g13_share_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_document_shares_external CHECK (share_type <> 'EXTERNAL_LINK' OR token_hash IS NOT NULL)  -- DI-12
);
CREATE INDEX ix_document_shares_tenant   ON document_shares(tenant_id);
CREATE INDEX ix_document_shares_document ON document_shares(document_id);
CREATE INDEX ix_document_shares_status   ON document_shares(status);
CREATE INDEX ix_document_shares_token    ON document_shares(token_hash);

-- E12 document_audit (APPEND-ONLY; hash-chained; tracks OPEN-PLAT-03) -----------------
CREATE TABLE document_audit (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id) ON DELETE RESTRICT,
    seq_no        bigserial NOT NULL,                            -- global monotonic chain order (R5)
    document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_id    uuid REFERENCES document_versions(id) ON DELETE RESTRICT,
    action        g13_doc_audit_action NOT NULL,
    actor_user_id uuid NOT NULL,                                 -- logical user ref
    actor_role    varchar(60) NOT NULL,
    correlation_id varchar(64),                                  -- X-Correlation-Id (Foundation §1)
    ip_address    inet,
    user_agent    varchar(255),
    share_id      uuid REFERENCES document_shares(id) ON DELETE SET NULL,
    result        g13_audit_result NOT NULL DEFAULT 'SUCCESS',
    denial_reason varchar(120),
    prev_hash     char(64) NOT NULL,                             -- row_hash of preceding row (R5)
    row_hash      char(64) NOT NULL,                             -- SHA-256(payload || prev_hash) (R5)
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    created_by    uuid                                           -- append-only: no updated_at / is_deleted
);
CREATE INDEX ix_document_audit_tenant   ON document_audit(tenant_id);
CREATE INDEX ix_document_audit_document ON document_audit(document_id);
CREATE INDEX ix_document_audit_actor    ON document_audit(actor_user_id);
CREATE INDEX ix_document_audit_action   ON document_audit(action);
CREATE UNIQUE INDEX uq_document_audit_seq ON document_audit(seq_no);

-- E14 checkout_locks -----------------------------------------------------------------
CREATE TABLE checkout_locks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    locked_by   uuid NOT NULL,                                  -- logical user ref
    locked_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,                           -- auto-expire to avoid stuck locks
    intent_note varchar(255),
    status      g13_lock_status NOT NULL DEFAULT 'ACTIVE',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,
    updated_by  uuid,
    is_deleted  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_checkout_locks_tenant   ON checkout_locks(tenant_id);
CREATE UNIQUE INDEX uq_checkout_locks_active ON checkout_locks(document_id) WHERE status = 'ACTIVE';  -- DI-7

-- E15 scan_results (APPEND-ONLY) -----------------------------------------------------
CREATE TABLE scan_results (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    version_id         uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
    engine             varchar(80) NOT NULL,
    malware_verdict    scan_status NOT NULL DEFAULT 'PENDING',  -- reuse core scan_status
    threat_name        varchar(160),
    archive_depth      integer,                                 -- R17 guard
    decompressed_ratio numeric(8,2),                            -- over threshold => reject (R17)
    integrity_verified boolean NOT NULL DEFAULT false,          -- stored hash == recomputed (DI-5)
    extracted_text_ref uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
    scanned_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid                                     -- append-only
);
CREATE INDEX ix_scan_results_tenant  ON scan_results(tenant_id);
CREATE INDEX ix_scan_results_version ON scan_results(version_id);

-- E16 signature_requests (REUSE signoff_transactions; on DocumentGen sign-off) -------
CREATE TABLE signature_requests (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id               uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_id                uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
    request_no                varchar(40) NOT NULL,
    signing_mode              g13_signing_mode NOT NULL DEFAULT 'SEQUENTIAL',
    status                    g13_signature_request_status NOT NULL DEFAULT 'DRAFT',
    signer_list               jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ordered signers (VAL-M11-SIGNER)
    workflow_instance_id      uuid,                                 -- logical ref to P01 instance
    expires_at                timestamptz,
    signed_document_version_id uuid REFERENCES document_versions(id) ON DELETE SET NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_signature_requests_no UNIQUE (tenant_id, request_no)
);
CREATE INDEX ix_signature_requests_tenant   ON signature_requests(tenant_id);
CREATE INDEX ix_signature_requests_document ON signature_requests(document_id);
CREATE INDEX ix_signature_requests_status   ON signature_requests(status);

-- E17 signatures (FK to signature_ltv_artifacts wired in Section C — circular) --------
CREATE TABLE signatures (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    signature_request_id uuid NOT NULL REFERENCES signature_requests(id) ON DELETE RESTRICT,
    signer_user_id       uuid NOT NULL,                          -- logical user ref
    sign_order           integer NOT NULL DEFAULT 1,
    signature_type       g13_signature_type NOT NULL,
    legal_basis          varchar(120),                           -- e.g. IT_ACT_3A_DSC (R7)
    certificate_subject  varchar(255),
    signature_hash       char(64) NOT NULL,
    tsa_token_ref        uuid,                                   -- FK -> signature_ltv_artifacts (Section C)
    ltv_status           g13_ltv_status NOT NULL DEFAULT 'NONE', -- (R4)
    signed_at            timestamptz,
    status               g13_signature_status NOT NULL DEFAULT 'PENDING',
    decline_reason       varchar(255),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_signatures_tenant  ON signatures(tenant_id);
CREATE INDEX ix_signatures_request ON signatures(signature_request_id);
CREATE INDEX ix_signatures_signer  ON signatures(signer_user_id);

-- E26 signature_ltv_artifacts (APPEND-ONLY; RFC-3161 + PAdES-LTV durability) ----------
CREATE TABLE signature_ltv_artifacts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    signature_id       uuid NOT NULL REFERENCES signatures(id) ON DELETE RESTRICT,
    tsa_timestamp_token bytea NOT NULL,                          -- RFC-3161 token bytes
    tsa_authority      varchar(160) NOT NULL,
    ocsp_response      bytea,
    crl_data           bytea,
    validation_chain   jsonb,                                    -- full cert chain at signing time
    ltv_level          g13_ltv_status NOT NULL DEFAULT 'TIMESTAMPED',
    captured_at        timestamptz NOT NULL DEFAULT now(),
    created_by         uuid                                      -- append-only
);
CREATE INDEX ix_sig_ltv_tenant    ON signature_ltv_artifacts(tenant_id);
CREATE INDEX ix_sig_ltv_signature ON signature_ltv_artifacts(signature_id);

-- E18 disposition_records (REUSE JOB-M11-DISPOSAL) -----------------------------------
CREATE TABLE disposition_records (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id            uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    retention_assignment_id uuid REFERENCES retention_assignments(id) ON DELETE SET NULL,
    action                 g13_disposition_action NOT NULL,
    proposed_by            uuid NOT NULL,                         -- Librarian (maker) — logical ref
    approved_by            uuid,                                  -- Records Mgr (checker); P01 maker!=checker
    status                 g13_disposition_status NOT NULL DEFAULT 'PROPOSED',
    erasure_method         g13_erasure_method,                    -- CRYPTO_SHRED only if domain-local & unshared (R1)
    certificate_no         varchar(40),
    executed_at            timestamptz,
    evidence_hash          char(64),                              -- tombstone hash retained after destruction
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_disposition_sod CHECK (approved_by IS NULL OR approved_by <> proposed_by)  -- DI-10
);
CREATE INDEX ix_disposition_tenant   ON disposition_records(tenant_id);
CREATE INDEX ix_disposition_document ON disposition_records(document_id);
CREATE INDEX ix_disposition_status   ON disposition_records(status);

-- E20 dlp_findings -------------------------------------------------------------------
CREATE TABLE dlp_findings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id) ON DELETE RESTRICT,
    version_id       uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
    rule_code        varchar(60) NOT NULL,                       -- PII_AADHAAR / PII_PAN / BANK_ACCT
    severity         g13_dlp_severity NOT NULL,
    match_count      integer NOT NULL DEFAULT 0,
    suggested_action g13_dlp_action NOT NULL,
    status           g13_dlp_finding_status NOT NULL DEFAULT 'OPEN',
    detected_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_dlp_findings_tenant  ON dlp_findings(tenant_id);
CREATE INDEX ix_dlp_findings_version ON dlp_findings(version_id);
CREATE INDEX ix_dlp_findings_status  ON dlp_findings(status);

-- E21 security_clearances (GAP — defines clearance_level; read by P02) ----------------
CREATE TABLE security_clearances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    principal_type      g13_clearance_principal_type NOT NULL,
    principal_ref       varchar(80) NOT NULL,                    -- user_id or RBAC role code
    clearance_level     classification_level NOT NULL,           -- reuse core enum; max accessible class
    scope_org_unit_id   uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    status              g13_clearance_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    justification       text NOT NULL,
    granted_by          uuid NOT NULL,                           -- Security/DLP (maker) — logical ref
    approved_by         uuid,                                    -- Records Mgr (checker); P01 must != granter
    workflow_instance_id uuid,                                   -- logical ref to P01 instance
    valid_from          date NOT NULL DEFAULT CURRENT_DATE,
    valid_until         date,                                    -- null => until revoked
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_clearance_sod CHECK (approved_by IS NULL OR approved_by <> granted_by)  -- DI-16
);
CREATE INDEX ix_clearance_tenant    ON security_clearances(tenant_id);
CREATE INDEX ix_clearance_principal ON security_clearances(principal_type, principal_ref);
CREATE INDEX ix_clearance_status    ON security_clearances(status);

-- E22 data_subject_requests (GAP — DPDP lattice; P05 redaction + JOB-M11-DISPOSAL) ----
CREATE TABLE data_subject_requests (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    dsr_no                   varchar(40) NOT NULL,
    data_subject_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    request_type             g13_dsr_type NOT NULL,
    consent_ref_id           uuid REFERENCES consent_records(id) ON DELETE SET NULL,  -- DPDPA basis
    received_at              timestamptz NOT NULL DEFAULT now(),  -- statutory clock starts
    status                   g13_dsr_status NOT NULL DEFAULT 'RECEIVED',
    legal_basis_exemption    varchar(200),                        -- statutory retention/hold/WORM override
    affected_document_count  integer,
    resolution_note          text,
    erasure_method           g13_erasure_method,                  -- CRYPTO_SHRED/PHYSICAL_PURGE/EXEMPT_RETAINED
    adjudicated_by           uuid,                                -- DPO — logical ref
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_dsr_no UNIQUE (tenant_id, dsr_no)
);
CREATE INDEX ix_dsr_tenant   ON data_subject_requests(tenant_id);
CREATE INDEX ix_dsr_employee ON data_subject_requests(data_subject_employee_id);
CREATE INDEX ix_dsr_status   ON data_subject_requests(status);

-- E23 audit_anchors (GAP — tamper-evident anchoring; tracks OPEN-PLAT-03) -------------
CREATE TABLE audit_anchors (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    period_start_seq    bigint NOT NULL,                         -- first document_audit.seq_no in window
    period_end_seq      bigint NOT NULL,                         -- last seq_no in window
    digest              char(64) NOT NULL,                       -- Merkle root over window's row_hash chain
    anchor_target       g13_anchor_target NOT NULL,
    anchor_reference    varchar(255) NOT NULL,                   -- WORM key / notary receipt / TSA token id
    anchored_at         timestamptz NOT NULL DEFAULT now(),
    verified_at         timestamptz,                             -- last JOB-G13-CHAINVERIFY pass
    verification_status g13_anchor_verify_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid
);
CREATE INDEX ix_audit_anchors_tenant ON audit_anchors(tenant_id);
CREATE INDEX ix_audit_anchors_window ON audit_anchors(period_start_seq, period_end_seq);

-- E24 hold_notices (GAP — custodian acknowledgement; X.2) ----------------------------
CREATE TABLE hold_notices (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    legal_hold_id     uuid NOT NULL REFERENCES document_legal_holds(id) ON DELETE RESTRICT,
    custodian_user_id uuid NOT NULL,                             -- logical user ref
    notice_text       text NOT NULL,
    status            g13_hold_notice_status NOT NULL DEFAULT 'SENT',
    sent_at           timestamptz NOT NULL DEFAULT now(),        -- via X.2 (MSG-G13-HOLD-NOTICE)
    acknowledged_at   timestamptz,
    reminder_count    integer NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_hold_notices_tenant    ON hold_notices(tenant_id);
CREATE INDEX ix_hold_notices_hold      ON hold_notices(legal_hold_id);
CREATE INDEX ix_hold_notices_custodian ON hold_notices(custodian_user_id);


-- =====================================================================================
-- SECTION C — DEFERRED / CIRCULAR FOREIGN KEYS
-- =====================================================================================
-- Wire the core forward-reference columns (00 Section 7 left these as plain uuid) to the
-- now-existing module tables, and resolve the signatures <-> ltv_artifacts cycle.
ALTER TABLE documents
    ADD CONSTRAINT fk_documents_type      FOREIGN KEY (document_type_id)       REFERENCES document_types(id)        ON DELETE RESTRICT,
    ADD CONSTRAINT fk_documents_folder    FOREIGN KEY (folder_id)              REFERENCES folders(id)               ON DELETE SET NULL,
    ADD CONSTRAINT fk_documents_retention FOREIGN KEY (retention_assignment_id) REFERENCES retention_assignments(id) ON DELETE SET NULL;

ALTER TABLE document_versions
    ADD CONSTRAINT fk_document_versions_storage FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id) ON DELETE RESTRICT;

ALTER TABLE signatures
    ADD CONSTRAINT fk_signatures_ltv FOREIGN KEY (tsa_token_ref) REFERENCES signature_ltv_artifacts(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION D — ROW-LEVEL SECURITY (P02 tenant-isolation substrate, CONVENTIONS §6)
-- =====================================================================================
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'storage_objects','folders','document_retention_policies','document_types','lifecycle_event_inbox',
    'retention_assignments','document_acls','document_tags','document_links','document_legal_holds',
    'legal_hold_items','document_shares','document_audit','checkout_locks','scan_results',
    'signature_requests','signatures','signature_ltv_artifacts','disposition_records','dlp_findings',
    'security_clearances','data_subject_requests','audit_anchors','hold_notices'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING (
          tenant_id = current_setting('app.current_tenant_id', true)::uuid
          OR current_setting('app.is_platform_admin', true) = 'true'
        )
        WITH CHECK (
          tenant_id = current_setting('app.current_tenant_id', true)::uuid
          OR current_setting('app.is_platform_admin', true) = 'true'
        );$p$, t);
  END LOOP;
END
$rls$;


-- =====================================================================================
-- SECTION E — SAMPLE SEED ROWS (illustrative; tenant GOV-STATE from 00 Section 12)
-- =====================================================================================
-- RLS is FORCE-enabled; set the tenant scope so seed inserts satisfy WITH CHECK.
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SET app.is_platform_admin = 'true';

-- document_retention_policies ------------------------------------------------------------------
INSERT INTO document_retention_policies (id, tenant_id, policy_code, name, trigger_event, retention_period_months, is_permanent, disposition_action, review_required, requires_confirmed_anchor, statutory_basis) VALUES
 ('d13c0000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','RET_SR_PERMANENT','Service Register – Permanent','ON_CREATE',NULL,true,'REVIEW',true,false,'Service Rules – permanent'),
 ('d13c0000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','RET_PAYSLIP_8Y','Payslip – 8 Years','FISCAL_YEAR_END',96,false,'DESTROY',true,true,'Income-tax record 8y'),
 ('d13c0000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','RET_DISC_30Y','Disciplinary – 30 Years','ON_CASE_CLOSE',360,false,'ARCHIVE_TRANSFER',true,true,'CCS(CCA) Rules');

-- document_types (extends letter_templates) ------------------------------------------
INSERT INTO document_types (id, tenant_id, type_code, name, category, default_classification, default_security_domain, default_retention_policy_id, is_worm_default, requires_signature, allowed_signature_types, checkout_mode, allowed_mime_types, max_size_mb, is_top_secret_eligible) VALUES
 ('d13d0000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','ID_PROOF','Identity Proof','IDENTITY','CONFIDENTIAL','DOM_CONFIDENTIAL',NULL,false,false,'{}','NONE','{application/pdf,image/jpeg,image/png}',10,false),
 ('d13d0000-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','CHARGE_SHEET','Charge Sheet','DISCIPLINARY','SECRET','DOM_SECRET','d13c0000-0000-0000-0000-0000000000a3',true,true,'{DSC_TOKEN}','OPTIONAL','{application/pdf}',25,false),
 ('d13d0000-0000-0000-0000-0000000000b3','11111111-1111-1111-1111-111111111111','PPO','Pension Payment Order','PENSION','CONFIDENTIAL','DOM_CONFIDENTIAL',NULL,true,true,'{DSC_TOKEN,AADHAAR_ESIGN}','NONE','{application/pdf}',25,false);

-- folders -----------------------------------------------------------------------------
INSERT INTO folders (id, tenant_id, entity_id, parent_folder_id, name, path, folder_type, owning_org_unit_id, default_classification, is_system_managed) VALUES
 ('d13f0000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',NULL,'Employees','/Employees','CABINET','33333333-3333-3333-3333-333333333301','INTERNAL',true),
 ('d13f0000-0000-0000-0000-0000000000c2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d13f0000-0000-0000-0000-0000000000c1','GOV-100245','/Employees/GOV-100245','EMPLOYEE','33333333-3333-3333-3333-333333333301','CONFIDENTIAL',true);

-- storage_objects ---------------------------------------------------------------------
INSERT INTO storage_objects (id, tenant_id, bucket, object_key, content_hash, dedup_index_key, security_domain, key_scope, size_bytes, kms_key_id, wrapped_dek, storage_class, ref_count) VALUES
 ('d1350000-0000-0000-0000-0000000000d1','11111111-1111-1111-1111-111111111111','gov-vault-conf','enc/2026/aadhaar-3001','aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888','f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1','DOM_CONFIDENTIAL','DEDICATED_CMK',184320,'kms://gov/cmk-conf','\xdeadbeef','HOT',1),
 ('d1350000-0000-0000-0000-0000000000d2','11111111-1111-1111-1111-111111111111','gov-vault-secret','enc/2026/cs-201','bbbb1111cccc2222dddd3333eeee4444ffff5555aaaa6666bbbb7777cccc8888','f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2','DOM_SECRET','DEDICATED_CMK',512000,'kms://gov/cmk-secret','\xdeadbeef','WORM_LOCKED',1);

-- documents (core table) + versions ---------------------------------------------------
INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, document_type_id, folder_id, owner_employee_id, owning_org_unit_id, current_version_no, classification, security_domain, status, link_count, mime_type, size_bytes, content_hash, is_worm, source_channel, scan_status) VALUES
 ('d0c00000-0000-0000-0000-000000001001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC/2026/0001001','Aadhaar Proof – GOV-100245','d13d0000-0000-0000-0000-0000000000b1','d13f0000-0000-0000-0000-0000000000c2','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301',1,'CONFIDENTIAL','DOM_CONFIDENTIAL','ACTIVE',1,'application/pdf',184320,'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',false,'WEB_UPLOAD','CLEAN'),
 ('d0c00000-0000-0000-0000-000000001002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC/2026/0001002','Charge-Sheet CS/2026/201','d13d0000-0000-0000-0000-0000000000b2',NULL,'99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333302',1,'SECRET','DOM_SECRET','ACTIVE',1,'application/pdf',512000,'bbbb1111cccc2222dddd3333eeee4444ffff5555aaaa6666bbbb7777cccc8888',true,'SYSTEM_GENERATED','CLEAN');

INSERT INTO document_versions (id, tenant_id, document_id, version_no, storage_object_id, mime_type, size_bytes, content_hash, version_kind, ocr_status) VALUES
 ('d0c00000-0000-0000-0000-00000000e001','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001001',1,'d1350000-0000-0000-0000-0000000000d1','application/pdf',184320,'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888','ORIGINAL','DONE'),
 ('d0c00000-0000-0000-0000-00000000e002','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001002',1,'d1350000-0000-0000-0000-0000000000d2','application/pdf',512000,'bbbb1111cccc2222dddd3333eeee4444ffff5555aaaa6666bbbb7777cccc8888','SIGNED','NOT_APPLICABLE');

UPDATE documents SET current_version_id = 'd0c00000-0000-0000-0000-00000000e001' WHERE id = 'd0c00000-0000-0000-0000-000000001001';
UPDATE documents SET current_version_id = 'd0c00000-0000-0000-0000-00000000e002' WHERE id = 'd0c00000-0000-0000-0000-000000001002';

-- document_links (attach contract; G01–G12) -------------------------------------------
INSERT INTO document_links (id, tenant_id, entity_id, document_id, module_code, entity_name, entity_ref_id, link_role, is_primary) VALUES
 ('d13a0000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0c00000-0000-0000-0000-000000001001','G02','change_requests','c0000000-0000-0000-0000-0000000055e1','PROOF',true),
 ('d13a0000-0000-0000-0000-0000000000f2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0c00000-0000-0000-0000-000000001002','G09','charge_sheets','c0000000-0000-0000-0000-0000000000c5','ORDER',true);

-- document_acls -----------------------------------------------------------------------
INSERT INTO document_acls (id, tenant_id, document_id, principal_type, principal_ref, rights, effect, need_to_know) VALUES
 ('ac100000-0000-0000-0000-000000000a01','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001001','ROLE','hr_admin','{VIEW,DOWNLOAD}','ALLOW',false),
 ('ac100000-0000-0000-0000-000000000a02','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001002','ROLE','sr_custodian','{VIEW}','ALLOW',true);

-- document_tags -----------------------------------------------------------------------
INSERT INTO document_tags (id, tenant_id, document_id, tag_type, tag_key, tag_value, applied_by, confidence) VALUES
 ('ed100000-0000-0000-0000-000000000b01','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001001','PII_CATEGORY','aadhaar','present','DLP',0.990),
 ('ed100000-0000-0000-0000-000000000b02','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001002','CLASSIFICATION','sensitivity','SECRET','SYSTEM',NULL);

-- document_legal_holds + items -----------------------------------------------------------------
INSERT INTO document_legal_holds (id, tenant_id, hold_no, matter_name, reason, authority, is_high_value, status, placed_by) VALUES
 ('1eaa0000-0000-0000-0000-000000000701','11111111-1111-1111-1111-111111111111','LH/2026/007','WP 1234/2026 – GOV-088120','Pending writ petition','High Court',true,'ACTIVE','e0000000-0000-0000-0000-0000000040a1'),
 ('1eaa0000-0000-0000-0000-000000000702','11111111-1111-1111-1111-111111111111','LH/2025/051','CVC Ref 88/2025','Vigilance inquiry','CVC',true,'RELEASED','e0000000-0000-0000-0000-0000000040a1');
UPDATE document_legal_holds SET release_proposed_by='e0000000-0000-0000-0000-0000000040a1', release_approved_by='e0000000-0000-0000-0000-0000000040a2', release_reason='Inquiry closed', released_at=now() WHERE id='1eaa0000-0000-0000-0000-000000000702';

INSERT INTO legal_hold_items (id, tenant_id, legal_hold_id, document_id, match_basis, is_auto_added) VALUES
 ('1ebb0000-0000-0000-0000-000000000801','11111111-1111-1111-1111-111111111111','1eaa0000-0000-0000-0000-000000000701','d0c00000-0000-0000-0000-000000001002','EMPLOYEE',false);

-- security_clearances -----------------------------------------------------------------
INSERT INTO security_clearances (id, tenant_id, principal_type, principal_ref, clearance_level, status, justification, granted_by, approved_by, valid_until) VALUES
 ('c1ea0000-0000-0000-0000-000000000c01','11111111-1111-1111-1111-111111111111','USER','e0000000-0000-0000-0000-0000000070a1','SECRET','ACTIVE','Disciplinary case handling','e0000000-0000-0000-0000-0000000050a1','e0000000-0000-0000-0000-0000000040a2','2027-03-31'),
 ('c1ea0000-0000-0000-0000-000000000c02','11111111-1111-1111-1111-111111111111','ROLE','sr_custodian','CONFIDENTIAL','ACTIVE','Records custody role baseline','e0000000-0000-0000-0000-0000000050a1','e0000000-0000-0000-0000-0000000040a2',NULL);

-- data_subject_requests ---------------------------------------------------------------
INSERT INTO data_subject_requests (id, tenant_id, dsr_no, data_subject_employee_id, request_type, status, legal_basis_exemption, erasure_method) VALUES
 ('d5120000-0000-0000-0000-000000000701','11111111-1111-1111-1111-111111111111','DSR/2026/0007','99999999-9999-9999-9999-999999999901','ERASURE','EXEMPTED','Statutory SR permanent retention','EXEMPT_RETAINED'),
 ('d5120000-0000-0000-0000-000000000702','11111111-1111-1111-1111-111111111111','DSR/2026/0009','99999999-9999-9999-9999-999999999902','ACCESS','FULFILLED',NULL,NULL);

-- signature_requests + signatures -----------------------------------------------------
INSERT INTO signature_requests (id, tenant_id, document_id, version_id, request_no, signing_mode, status, signer_list) VALUES
 ('51610000-0000-0000-0000-000000000901','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001002','d0c00000-0000-0000-0000-00000000e002','SR/2026/0901','SEQUENTIAL','COMPLETED','[{"order":1,"role":"records_manager"}]');
INSERT INTO signatures (id, tenant_id, signature_request_id, signer_user_id, sign_order, signature_type, legal_basis, signature_hash, ltv_status, signed_at, status) VALUES
 ('51670000-0000-0000-0000-000000000a01','11111111-1111-1111-1111-111111111111','51610000-0000-0000-0000-000000000901','e0000000-0000-0000-0000-0000000022a0',1,'DSC_TOKEN','IT_ACT_3A_DSC','cccc1111dddd2222eeee3333ffff4444aaaa5555bbbb6666cccc7777dddd8888','LTV_ENABLED',now(),'SIGNED');

-- document_audit (append-only, hash-chained) ------------------------------------------
INSERT INTO document_audit (id, tenant_id, document_id, action, actor_user_id, actor_role, result, prev_hash, row_hash) VALUES
 ('a0d10000-0000-0000-0000-000000001001','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001001','VIEW','e0000000-0000-0000-0000-0000000090a1','hr_admin','SUCCESS','0000000000000000000000000000000000000000000000000000000000000000','7a3f00000000000000000000000000000000000000000000000000000000001b'),
 ('a0d10000-0000-0000-0000-000000001002','11111111-1111-1111-1111-111111111111','d0c00000-0000-0000-0000-000000001002','DOWNLOAD','e0000000-0000-0000-0000-0000000070a1','records_manager','SUCCESS','7a3f00000000000000000000000000000000000000000000000000000000001b','b910000000000000000000000000000000000000000000000000000000000044');

RESET app.is_platform_admin;
RESET app.current_tenant_id;

-- =====================================================================================
-- END 13-G13-document-management.sql — 24 module tables (E3–E26); documents/document_versions are core.
-- =====================================================================================
