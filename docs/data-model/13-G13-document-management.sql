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
-- RECON (2026-07 CSV reconciliation — DwnB "Additional Config" exports)
--   Ground-truth config exports reconciled into this schema (see
--   docs/data-model/reconciliation/g13-documents.md). SECTION F (added, self-contained)
--   introduces the tenant-CONFIGURABLE letter/document-config masters that the closed
--   g13_ enums and the vault tables above do NOT cover:
--     document_categories               (DarwinBox "Document Category" — DOCCAT_N; NOT the
--                                        closed g13_doc_category enum — this is a tenant
--                                        master keyed by category_code)
--     document_category_profile_fields  (category -> employee-profile-field linkage)
--     document_template_name_formats    (generated-doc file-naming formats — DOCFORMAT_N)
--     policy_letter_settings            (per-company HR policy sign-off / letter render cfg)
--     self_generate_settings            (self-service letter-generation defaults — SELFGEN_N)
--   All four exports are CONFIG (tenant/company setup), not transactional DATA. The vault
--   tables (documents/document_versions/document_types/...) above are UNCHANGED.
-- =====================================================================================
-- RECON (prototype) (2026-07 PrimeSoft prototype document-management screen reconciliation)
--   Prototype field extracts reconciled into this schema (see
--   docs/data-model/reconciliation/prototype-g13-documents.md). The vault, retention,
--   sign-off (signature_requests/signatures) and CSV-config masters above already cover
--   document master / vault / versioning / templates-by-ref / storage. SECTION G (added,
--   self-contained) introduces the genuinely-MISSING transactional DATA the prototype's
--   letter-generation and policy-acknowledgement screens surface:
--     merge_field_catalog          (da-merge-fields — merge-field catalogue {{token}}->source)
--     letter_generation_requests   (da-letter-queue — per-letter gen queue: merge-field
--                                    resolution, requested-by, signer state, validation error)
--     bulk_letter_jobs             (da-bulk-letters — batch letter/sign-off job progress)
--     acknowledgement_campaigns    (da-ack-campaign / da-signoff-tracker — sign-off & policy
--                                    ack campaigns: audience, cadence, SLA, deadline, counts)
--     document_acknowledgements    (policy-ack / documents-oversight / da-signoff-tracker
--                                    DM25 — per-employee non-repudiation ack record: version
--                                    active, consent-text snapshot, app version)
--   NOT added (reported PARTIAL/config in the gap report, not DATA): the letter-template
--   register (da-templates/letters) stays an M11-owned config master referenced by
--   document_types.letter_template_ref (logical ref); the policy library / policy categories
--   (da-policies/da-categories) are documents + derived counts, not a new entity.
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
-- SECTION F — RECON-ADDED CONFIG MASTERS (DwnB "Additional Config" CSV reconciliation)
-- =====================================================================================
-- Tenant-CONFIGURABLE letter/document-config value sets (CONVENTIONS §4 → master tables
-- with a text *_code business key, NOT Postgres enums). Self-contained: own enum, tables,
-- RLS DO-block and seeds. Vault tables (Sections A–E) are untouched.
-- =====================================================================================

-- F-enum: config lifecycle status (CSV "Status" = Active) --------------------------------
CREATE TYPE g13_config_status AS ENUM ('ACTIVE','INACTIVE');

-- F1 document_categories (DarwinBox "Document Category" — DOCCAT_N) --------------------
-- Distinct from the closed g13_doc_category enum: a tenant master grouping employee
-- document/profile fields under a named category, keyed by category_code.
CREATE TABLE document_categories (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id) ON DELETE RESTRICT,
    category_code varchar(60) NOT NULL,                      -- DOCCAT_1, DOCCAT_2, ...
    name          varchar(200) NOT NULL,                     -- "Personal Identification"
    status        g13_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_categories_code UNIQUE (tenant_id, category_code)
);
CREATE INDEX ix_document_categories_tenant ON document_categories(tenant_id);
CREATE INDEX ix_document_categories_status ON document_categories(status);

-- F2 document_category_profile_fields (category -> employee-profile-field linkage) -----
-- Normalises the CSV "Select Employee Profile Fields" comma-list (one row per field).
CREATE TABLE document_category_profile_fields (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_category_id uuid NOT NULL REFERENCES document_categories(id) ON DELETE CASCADE,
    profile_field_key    varchar(200) NOT NULL,              -- profile_pic / bank_aadhar_img / "BGV Report"
    display_order        integer NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_doc_cat_profile_field UNIQUE (document_category_id, profile_field_key)
);
CREATE INDEX ix_doc_cat_profile_fields_tenant   ON document_category_profile_fields(tenant_id);
CREATE INDEX ix_doc_cat_profile_fields_category ON document_category_profile_fields(document_category_id);

-- F3 document_template_name_formats (generated-doc file-naming — DOCFORMAT_N) ----------
CREATE TABLE document_template_name_formats (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    format_code     varchar(60) NOT NULL,                    -- DOCFORMAT_1
    format_name     varchar(160) NOT NULL,                   -- "company custom"
    template_folder varchar(160),                            -- CSV "Document Template Folder"
    is_default      boolean NOT NULL DEFAULT false,          -- CSV "Default" = Yes/No
    name_format     varchar(500) NOT NULL,                   -- "Employee Name_Employee ID_Company Letter_Generated On"
    prefix          varchar(120),
    suffix          varchar(120),
    status          g13_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_doc_template_name_formats_code UNIQUE (tenant_id, format_code)
);
CREATE INDEX ix_doc_template_name_formats_tenant  ON document_template_name_formats(tenant_id);
CREATE INDEX ix_doc_template_name_formats_folder  ON document_template_name_formats(template_folder);
CREATE INDEX ix_doc_template_name_formats_default ON document_template_name_formats(is_default);

-- F4 policy_letter_settings (per-company HR policy sign-off / letter render cfg) --------
-- One settings row per company (CSV has no surrogate id — keyed by company_code).
CREATE TABLE policy_letter_settings (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    company_code         varchar(40) NOT NULL,               -- CSV "Select Company" = PSI
    policy_signoff_text  text NOT NULL,                      -- "HR Policy Sign-Off Text*"
    letter_ack_text      text NOT NULL,                      -- "HR Letter Acknowledgment Text*"
    letter_ctc_font_size varchar(20),                        -- "14px"
    letter_ctc_font      varchar(160),                       -- "arial,latoregular, sans-serif"
    letter_ctc_padding   varchar(20),                        -- "5px"
    block_policy_on_mobile boolean NOT NULL DEFAULT false,   -- CSV "Block HR Policy On Mobile" Yes/No
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_policy_letter_settings_company UNIQUE (tenant_id, company_code)
);
CREATE INDEX ix_policy_letter_settings_tenant ON policy_letter_settings(tenant_id);

-- F5 self_generate_settings (self-service letter-generation defaults — SELFGEN_N) ------
-- letter_head/signing_authority/signature refs are LOGICAL refs (varchar codes) to M11
-- letter-head & signing-authority masters that live outside G13 scope — no FK.
CREATE TABLE self_generate_settings (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                    uuid REFERENCES entities(id) ON DELETE RESTRICT,
    setting_code                 varchar(60) NOT NULL,       -- SELFGEN_1
    name                         varchar(160) NOT NULL,      -- "HR Letter Generation Setting Name"
    companies                    text[] NOT NULL DEFAULT '{}',   -- CSV "Select Company" (comma-list)
    company_codes                text[] NOT NULL DEFAULT '{}',   -- CSV "Select Company Code"
    user_assignment              text,                        -- CSV "User Assignment"
    letter_generation_access     text[] NOT NULL DEFAULT '{}',   -- CSV "Letter Generation Access" (users)
    default_letter_head_html_ref varchar(60),                 -- LETHEAD_2 (logical ref)
    default_letter_head_docx_ref varchar(60),                 -- LETHEAD_1 (logical ref)
    default_signing_authority_1  varchar(60),                 -- SIGNAUTH_3 (logical ref)
    default_signing_authority_2  varchar(60),
    default_signing_authority_3  varchar(60),
    default_signing_authority_4  varchar(60),
    default_signature_1          varchar(60),
    default_signature_2          varchar(60),
    default_signature_3          varchar(60),
    default_signature_4          varchar(60),
    status                       g13_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_by                   uuid,
    is_deleted                   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_self_generate_settings_code UNIQUE (tenant_id, setting_code)
);
CREATE INDEX ix_self_generate_settings_tenant ON self_generate_settings(tenant_id);
CREATE INDEX ix_self_generate_settings_status ON self_generate_settings(status);

-- F-RLS: tenant-isolation for the RECON-added masters (CONVENTIONS §6) ------------------
DO $rlsf$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document_categories','document_category_profile_fields','document_template_name_formats',
    'policy_letter_settings','self_generate_settings'
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
$rlsf$;

-- F-seeds (illustrative; tenant GOV-STATE, entity from 00 Section 12) -------------------
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SET app.is_platform_admin = 'true';

INSERT INTO document_categories (id, tenant_id, entity_id, category_code, name, status) VALUES
 ('dca10000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCCAT_1','Personal Identification','ACTIVE'),
 ('dca10000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCCAT_2','Employment Documents','ACTIVE'),
 ('dca10000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCCAT_3','Education and Training Certificates','ACTIVE');

INSERT INTO document_category_profile_fields (id, tenant_id, entity_id, document_category_id, profile_field_key, display_order) VALUES
 ('dcf10000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','dca10000-0000-0000-0000-0000000000a1','profile_pic',0),
 ('dcf10000-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','dca10000-0000-0000-0000-0000000000a1','bank_aadhar_img',1),
 ('dcf10000-0000-0000-0000-0000000000b3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','dca10000-0000-0000-0000-0000000000a3','Certificate Attachment',0);

INSERT INTO document_template_name_formats (id, tenant_id, entity_id, format_code, format_name, template_folder, is_default, name_format, status) VALUES
 ('df110000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCFORMAT_1','company custom','company custom',true,'Employee Name_Employee ID_Company Letter_Generated On','ACTIVE'),
 ('df110000-0000-0000-0000-0000000000c2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCFORMAT_2','Employee onboarding','Employee onboarding',true,'Employee Name_Employee ID_Onboarding Document_Generated On','ACTIVE'),
 ('df110000-0000-0000-0000-0000000000c3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOCFORMAT_4','Employee separation','Employee separation',true,'Employee Name_Employee ID_Separation Document_Generated On','ACTIVE');

INSERT INTO policy_letter_settings (id, tenant_id, entity_id, company_code, policy_signoff_text, letter_ack_text, letter_ctc_font_size, letter_ctc_font, letter_ctc_padding, block_policy_on_mobile) VALUES
 ('9011c000-0000-0000-0000-0000000000d1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PSI','I confirm that I have read and understood this document completely and would like to sign off on the document','I confirm that I have read and understood this document completely and would like to acknowledge the document','14px','arial,latoregular, sans-serif','5px',false);

INSERT INTO self_generate_settings (id, tenant_id, entity_id, setting_code, name, companies, company_codes, default_letter_head_html_ref, default_letter_head_docx_ref, default_signing_authority_1, default_signing_authority_2, default_signing_authority_3, status) VALUES
 ('5e6f0000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SELFGEN_1','PSI','{PrimeSoft,"PrimeSoft IP Solutions Private Limited.","Igenero Web Solutions Private Limited"}','{"",PSI,IWSPL}','LETHEAD_2','LETHEAD_1','SIGNAUTH_3','SIGNAUTH_2','SIGNAUTH_6','ACTIVE'),
 ('5e6f0000-0000-0000-0000-0000000000e2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SELFGEN_2','Tejora','{"Tejora Private Limited"}','{TPL}','LETHEAD_3','LETHEAD_4','SIGNAUTH_3','SIGNAUTH_4','SIGNAUTH_5','ACTIVE');

RESET app.is_platform_admin;
RESET app.current_tenant_id;


-- =====================================================================================
-- SECTION G — RECON-ADDED LETTER-GEN & ACKNOWLEDGEMENT DATA (PrimeSoft prototype recon)
-- =====================================================================================
-- Transactional DATA the prototype letter-generation & policy-acknowledgement screens
-- surface and that the vault/sign-off tables above do NOT cover. Self-contained: own
-- enums, tables, RLS DO-block and seeds. Follows CONVENTIONS (uuid PK, tenant_id/entity_id,
-- standard audit set, tenant-scoped RLS, FK + query indexes, tenant-scoped business keys).
-- Letter-template / letter-head / signing-authority / UAG-population references are stored
-- as LOGICAL refs (masters owned outside G13 DATA scope) — no cross-module FK.
-- =====================================================================================

-- G-enums (g13_-prefixed; UPPER_SNAKE_CASE) ---------------------------------------------
CREATE TYPE g13_letter_request_status AS ENUM ('DRAFT','PENDING_RESOLUTION','VALIDATION_ERROR','AWAITING_SIGNATURE','SCHEDULED','GENERATED','ISSUED','FAILED','CANCELLED');
CREATE TYPE g13_bulk_job_status       AS ENUM ('QUEUED','IN_PROGRESS','HELD','AWAITING_EMPLOYEE_ACTION','AWAITING_ACK','COMPLETE','FAILED');
CREATE TYPE g13_ack_campaign_status   AS ENUM ('DRAFT','ACTIVE','CLOSING','COMPLETE');
CREATE TYPE g13_ack_status            AS ENUM ('PENDING','ACKNOWLEDGED','OVERDUE');

-- G1 merge_field_catalog (da-merge-fields — {{token}} -> source catalogue) --------------
-- Reference catalogue of merge fields available to letter templates. Source is the
-- originating module/system (open set -> varchar, not enum).
CREATE TABLE merge_field_catalog (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    field_key       varchar(80) NOT NULL,                    -- token inside {{ }} e.g. LETTER_SERIAL_NO
    label           varchar(200) NOT NULL,                   -- "Auto-generated letter serial number"
    source          varchar(60) NOT NULL,                    -- M01_EMPLOYEE_MASTER / M03_SEPARATION / M06_PAYROLL / P04_TENANT / SYSTEM
    resolution_note varchar(255),                            -- "Resolved at sign time" / "Populated only for confirmed employees"
    status          g13_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_merge_field_catalog_key UNIQUE (tenant_id, field_key)
);
CREATE INDEX ix_merge_field_catalog_tenant ON merge_field_catalog(tenant_id);
CREATE INDEX ix_merge_field_catalog_source ON merge_field_catalog(source);

-- G2 letter_generation_requests (da-letter-queue — per-letter generation queue) ---------
-- One row per requested letter. template_ref is a logical ref to the M11 letter-template
-- register (document_types.letter_template_ref); the produced file lands as a documents row.
CREATE TABLE letter_generation_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id) ON DELETE RESTRICT,
    request_no            varchar(40) NOT NULL,
    letter_type           varchar(120) NOT NULL,             -- "Appointment Letter" / "Relieving Letter"
    template_ref          uuid,                              -- logical ref to M11 letter template
    document_type_id      uuid REFERENCES document_types(id) ON DELETE SET NULL,
    employee_id           uuid REFERENCES employees(id) ON DELETE RESTRICT,   -- null for candidate letters
    subject_name          varchar(200),                      -- "Candidate One" when no employee_id yet
    requested_by          uuid,                              -- logical user ref
    request_context       varchar(120),                      -- "HR Admin (M09 cycle)" / "M03 Separation flow" / "Employee self-service"
    merge_fields_total    integer NOT NULL DEFAULT 0,        -- "All 10 resolved" -> 10
    merge_fields_resolved integer NOT NULL DEFAULT 0,
    signer_summary        varchar(160),                      -- "Awaiting HR sig" / "Awaiting CEO sig"
    signature_request_id  uuid REFERENCES signature_requests(id) ON DELETE SET NULL,
    generated_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,   -- produced letter
    scheduled_at          timestamptz,                       -- "Scheduled"
    validation_error      text,                              -- populated when status = VALIDATION_ERROR
    status                g13_letter_request_status NOT NULL DEFAULT 'DRAFT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_letter_generation_requests_no UNIQUE (tenant_id, request_no)
);
CREATE INDEX ix_letter_gen_requests_tenant   ON letter_generation_requests(tenant_id);
CREATE INDEX ix_letter_gen_requests_employee ON letter_generation_requests(employee_id);
CREATE INDEX ix_letter_gen_requests_status   ON letter_generation_requests(status);
CREATE INDEX ix_letter_gen_requests_signreq  ON letter_generation_requests(signature_request_id);
CREATE INDEX ix_letter_gen_requests_doc      ON letter_generation_requests(generated_document_id);

-- G3 bulk_letter_jobs (da-bulk-letters — batch letter/sign-off job progress) ------------
-- job_ref is a logical ref to the core jobs row driving the batch (no FK).
CREATE TABLE bulk_letter_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    job_no          varchar(40) NOT NULL,
    job_name        varchar(200) NOT NULL,                   -- "Q1 Confirmation batch"
    template_ref    uuid,                                    -- logical ref to M11 letter template
    job_ref         uuid,                                    -- logical ref to core jobs(id)
    record_count    integer NOT NULL DEFAULT 0,
    processed_count integer NOT NULL DEFAULT 0,
    failed_count    integer NOT NULL DEFAULT 0,
    progress_pct    numeric(5,2) NOT NULL DEFAULT 0,
    eta             timestamptz,
    status          g13_bulk_job_status NOT NULL DEFAULT 'QUEUED',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_bulk_letter_jobs_no UNIQUE (tenant_id, job_no)
);
CREATE INDEX ix_bulk_letter_jobs_tenant ON bulk_letter_jobs(tenant_id);
CREATE INDEX ix_bulk_letter_jobs_status ON bulk_letter_jobs(status);

-- G4 acknowledgement_campaigns (da-ack-campaign / da-signoff-tracker campaign level) -----
-- A sign-off / policy-acknowledgement drive over an audience. document_id is nullable
-- (the policy/letter is a documents row when vaulted; document_title carries the display
-- name when it is not). audience_uag_ref / escalate_after_sla_to are logical refs.
CREATE TABLE acknowledgement_campaigns (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    campaign_no          varchar(40) NOT NULL,
    name                 varchar(200) NOT NULL,              -- "Code of Conduct 2026" / "Q1 POSH refresh acknowledgement"
    document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,   -- the acknowledged policy/letter
    document_title       varchar(255),                       -- display name when not (yet) a documents row
    document_version_no  integer,                            -- which version is active for the drive (DM25)
    purpose              varchar(160),                       -- "annual refresh" / "Non-repudiation"
    audience_description varchar(200),                       -- "All employees" / "Engineering UAG" / "India entity"
    audience_uag_ref     varchar(80),                        -- logical ref to UAG/population
    reminder_cadence     varchar(80),                        -- "Weekly" / "Every 3 days" / "Daily (final week)"
    escalate_after_sla_to varchar(80),                       -- logical role ref
    started_at           timestamptz,
    deadline             date,
    assigned_count       integer NOT NULL DEFAULT 0,
    acknowledged_count   integer NOT NULL DEFAULT 0,
    pending_count        integer NOT NULL DEFAULT 0,
    overdue_count        integer NOT NULL DEFAULT 0,
    status               g13_ack_campaign_status NOT NULL DEFAULT 'DRAFT',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_acknowledgement_campaigns_no UNIQUE (tenant_id, campaign_no)
);
CREATE INDEX ix_ack_campaigns_tenant   ON acknowledgement_campaigns(tenant_id);
CREATE INDEX ix_ack_campaigns_document ON acknowledgement_campaigns(document_id);
CREATE INDEX ix_ack_campaigns_status   ON acknowledgement_campaigns(status);

-- G5 document_acknowledgements (policy-ack / documents-oversight / DM25 record) ----------
-- Per-employee non-repudiation acknowledgement record. Captures which version was active,
-- the consent-text snapshot shown, and the app/browser version (DM25). May link to the
-- platform consent_records row. Row transitions PENDING -> ACKNOWLEDGED/OVERDUE (standard
-- audit set); the acknowledged snapshot fields are write-once by application contract.
CREATE TABLE document_acknowledgements (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    campaign_id          uuid REFERENCES acknowledgement_campaigns(id) ON DELETE SET NULL,
    document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,   -- what was acknowledged
    document_title       varchar(255),                       -- display name when not a documents row
    document_version_no  integer,                            -- which version was active at the time (DM25)
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- who acknowledged
    consent_text_snapshot text,                              -- snapshot of the consent text shown (DM25)
    app_version          varchar(120),                       -- browser / app version (DM25)
    ip_address           inet,
    assigned_at          timestamptz NOT NULL DEFAULT now(),
    due_date             date,
    acknowledged_at      timestamptz,
    consent_record_id    uuid REFERENCES consent_records(id) ON DELETE SET NULL,  -- platform consent linkage
    status               g13_ack_status NOT NULL DEFAULT 'PENDING',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_acknowledgements UNIQUE (campaign_id, employee_id)
);
CREATE INDEX ix_document_acks_tenant   ON document_acknowledgements(tenant_id);
CREATE INDEX ix_document_acks_campaign ON document_acknowledgements(campaign_id);
CREATE INDEX ix_document_acks_document ON document_acknowledgements(document_id);
CREATE INDEX ix_document_acks_employee ON document_acknowledgements(employee_id);
CREATE INDEX ix_document_acks_status   ON document_acknowledgements(status);

-- G-RLS: tenant-isolation for the RECON-added letter-gen & ack DATA (CONVENTIONS §6) -----
DO $rlsg$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'merge_field_catalog','letter_generation_requests','bulk_letter_jobs',
    'acknowledgement_campaigns','document_acknowledgements'
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
$rlsg$;

-- G-seeds (illustrative; tenant GOV-STATE, entity/employees from Sections 12 / E) --------
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SET app.is_platform_admin = 'true';

INSERT INTO merge_field_catalog (id, tenant_id, entity_id, field_key, label, source, resolution_note, status) VALUES
 ('a5f10000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LETTER_SERIAL_NO','Auto-generated letter serial number','SYSTEM','Resolved at sign time','ACTIVE'),
 ('a5f10000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CURRENT_ANNUAL_CTC','Current annual CTC','M06_PAYROLL','Populated only for confirmed employees','ACTIVE'),
 ('a5f10000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','L1_MANAGER_NAME','L1 manager full name','M01_EMPLOYEE_MASTER','Resolved at render time','ACTIVE');

INSERT INTO letter_generation_requests (id, tenant_id, entity_id, request_no, letter_type, employee_id, subject_name, request_context, merge_fields_total, merge_fields_resolved, signer_summary, signature_request_id, status) VALUES
 ('1e770000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LTR/2026/0001','Relieving Letter','99999999-9999-9999-9999-999999999901',NULL,'M03 Separation flow',12,12,'Awaiting HR sig','51610000-0000-0000-0000-000000000901','AWAITING_SIGNATURE'),
 ('1e770000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LTR/2026/0002','Appointment Letter',NULL,'Candidate One','HR Admin (M08 recruitment)',10,8,NULL,NULL,'VALIDATION_ERROR'),
 ('1e770000-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LTR/2026/0003','Increment / Salary Revision Letter','99999999-9999-9999-9999-999999999902',NULL,'HR Admin (M09 cycle)',14,14,'Awaiting CEO sig',NULL,'SCHEDULED');
UPDATE letter_generation_requests SET validation_error='Merge field CURRENT_ANNUAL_CTC unresolved (candidate has no payroll record)' WHERE id='1e770000-0000-0000-0000-0000000000a2';

INSERT INTO bulk_letter_jobs (id, tenant_id, entity_id, job_no, job_name, record_count, processed_count, failed_count, progress_pct, status) VALUES
 ('b41c0000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BLK/2026/001','Q1 Confirmation batch',120,120,0,100.00,'COMPLETE'),
 ('b41c0000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BLK/2026/002','Q1 POSH refresh acknowledgement',450,300,2,66.67,'IN_PROGRESS');

INSERT INTO acknowledgement_campaigns (id, tenant_id, entity_id, campaign_no, name, document_title, document_version_no, purpose, audience_description, audience_uag_ref, reminder_cadence, escalate_after_sla_to, started_at, deadline, assigned_count, acknowledged_count, pending_count, overdue_count, status) VALUES
 ('ac9c0000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ACK/2026/001','Code of Conduct v4.2 (annual refresh)','Code of Conduct 2026',42,'annual refresh','All employees',NULL,'Weekly','hr_admin',now(),'2026-08-31',450,300,140,10,'ACTIVE'),
 ('ac9c0000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ACK/2026/002','POSH Policy v3.1 (annual refresh)','POSH Policy',31,'annual refresh','India entity','ENGINEERING_UAG','Every 3 days','hrbp',now(),'2026-07-31',120,118,0,2,'CLOSING');

INSERT INTO document_acknowledgements (id, tenant_id, entity_id, campaign_id, document_title, document_version_no, employee_id, consent_text_snapshot, app_version, status, due_date, acknowledged_at) VALUES
 ('d0ac0000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ac9c0000-0000-0000-0000-0000000000a1','Code of Conduct 2026',42,'99999999-9999-9999-9999-999999999901','I confirm that I have read and understood this document completely and would like to sign off on the document','Chrome/126.0 (macOS)','ACKNOWLEDGED','2026-08-31',now()),
 ('d0ac0000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ac9c0000-0000-0000-0000-0000000000a1','Code of Conduct 2026',42,'99999999-9999-9999-9999-999999999902',NULL,NULL,'PENDING','2026-08-31',NULL);

RESET app.is_platform_admin;
RESET app.current_tenant_id;


-- =====================================================================================
-- END 13-G13-document-management.sql — 24 vault module tables (E3–E26) + 5 RECON config
-- masters (SECTION F) + 5 RECON letter-gen/ack DATA tables (SECTION G);
-- documents/document_versions are core (00-platform-core.sql).
-- =====================================================================================
