-- =====================================================================================
-- GOVERNMENT HRMS — G12 DIGITAL EMPLOYEE SERVICE REGISTER (Digital SR)
-- Module schema: 12-G12-digital-service-register.sql
-- =====================================================================================
-- G12 OWNS the statutory Service Register. The CORE append-only, hash-chained ledger
-- `service_register_events` is defined in 00-platform-core.sql §8 and is NOT redefined
-- here. This file defines G12's MODULE-OWNED SUPPORTING tables (BRD v3 §5, entities
-- E9..E26): the taxonomy catalog, the hash-chained status sub-ledger, the external
-- anchor ledger, the completeness (expected-rule + gap) model, corrections/annotations,
-- attestations, verification cycles, appeals, §65B certificates, PAdES-LTV renewals,
-- ingestion provenance, certified extracts, access log, subscriptions, bulk corrigendum
-- batches, and legacy digitisation batches/records. Every table REFERENCES — never
-- redefines — the platform-core canonical tables.
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                          (mandatory module conventions)
--   docs/data-model/00-platform-core.sql                    (canonical core tables; load FIRST)
--   docs/brd/v3/G12-digital-service-register.md             (§5 entities, §5.5 enums, §5.6
--                                                            integrity rules, FR-01.A catalog,
--                                                            FR-01.B writer matrix)
--   docs/brd/v1/M12-digital-service-register.md §5.2        (E9..E18 full field tables)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Load AFTER 00-platform-core.sql. The only hard DDL dependencies are on CORE
--   tables: tenants, entities, org_units, employees, service_register_events,
--   workflow_instances, documents, migration_runs. Logically loads alongside the writer
--   modules (G01/G04/G05/G06/G08/G09/G10/G11) — there is no DDL dependency on them.
--
-- CORE-TABLE ASSUMPTIONS (FK / reference only — NOT redefined here).
--   * service_register_events(id) — G12-owned CORE ledger (core §8). Append-only,
--     hash-chained per (tenant_id, employee_id). The status-bearing projections
--     (entry_status / attestation_status / superseded_by_event_id) on that table are
--     materialised in the SAME transaction as the corresponding sr_status_events append.
--     This module's sub-ledgers FK to it by id (the assigned sr_event_id always exists).
--   * employees(id)            — G01 golden record; subject of SR entries/cycles/appeals.
--   * documents(id)            — G13 vault: signed extract PDFs, anchor WORM export, scans.
--   * workflow_instances(id)   — P01 maker-checker (corrigendum, appeal, bulk, legacy promote).
--   * org_units(id)            — office whose books are digitised (legacy batch).
--   * migration_runs(id)       — P06 ETL+V ledger linkage for legacy digitisation batches.
--   * tenants(id)/entities(id) — tenancy scope (Platform §0.1); ON DELETE RESTRICT.
--   * users(id)                — actor/signer/decider columns (created_by, posted_by,
--                                attested_by, decided_by, …) are LOGICAL refs (varchar/uuid,
--                                NO FK) per CONVENTIONS §3 (survive user removal).
--
-- CONVENTIONS APPLIED (CONVENTIONS.md).
--   * PK: every table `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (BRD domain name in
--     a comment; pgcrypto provided by core §0).
--   * Tenancy: tenant_id NOT NULL -> tenants ON DELETE RESTRICT on every table; entity_id
--     -> entities ON DELETE RESTRICT (NOT NULL on entity/employee-scoped tables; nullable
--     on tenant-wide config: taxonomy, expected-rule, subscriptions, anchors, bulk batch).
--   * Standard columns on CONFIG/PROCESS entities: created_at/updated_at/created_by/
--     updated_by/is_deleted (soft delete only).
--   * APPEND-ONLY sub-ledgers (sr_status_events, sr_anchors, sr_corrections,
--     sr_attestations, sr_ingestion_requests, sr_access_log, sr_authenticity_certificates,
--     sr_ltv_renewals) carry ONLY created_at/created_by — NO updated_at, NO is_deleted.
--     No UPDATE of content / no DELETE — enforce via DB grants + trigger (operational).
--   * Enums: module-unique CLOSED enumerations as `CREATE TYPE g12_* AS ENUM` (UPPER_SNAKE).
--     CORE enums are reused, never duplicated: sr_event_category, sr_qualifying_impact,
--     sr_confidence_status (for confidence_status fields).
--   * Indexes on every FK + common query columns; business keys carry UNIQUE constraints.
--   * RLS tenant-isolation applied to every table in the RLS section (P02 substrate).
--
-- SECTIONS.
--   1  Enum types (g12_*)
--   2  Taxonomy catalog            (E9  sr_event_type)
--   3  Status sub-ledger           (E19 sr_status_events)            [append-only]
--   4  External anchors            (E20 sr_anchors)                  [append-only]
--   5  Completeness model          (E21 sr_expected_event_rule, E22 sr_gap_register)
--   6  Corrections / annotations   (E10 sr_corrections)              [append-only]
--   7  Attestations                (E11 sr_attestations)             [append-only]
--   8  Verification cycles         (E12 sr_verification_cycles)
--   9  Appeals                     (E23 sr_appeals)
--   10 §65B certificates           (E24 sr_authenticity_certificates)[append-only]
--   11 LTV renewals                (E25 sr_ltv_renewals)             [append-only]
--   12 Bulk corrigendum batches    (E26 sr_bulk_corrigendum_batch)
--   13 Ingestion provenance        (E13 sr_ingestion_requests)       [append-only]
--   14 Certified extracts          (E14 sr_certified_extracts)
--   15 Access log                  (E15 sr_access_log)               [append-only]
--   16 Subscriptions               (E16 sr_subscriptions)
--   17 Legacy digitisation         (E17 sr_legacy_digitisation_batch, E18 ..._record)
--   18 Cross-section FKs (forward refs resolved via ALTER)
--   19 Row-Level Security (tenant isolation)
--   20 Sample seed rows (incl. the published sr_event_type catalog seed)
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (module-unique CLOSED enumerations; g12_ prefix, UPPER_SNAKE)
-- =====================================================================================
-- Taxonomy / completeness -------------------------------------------------------------
CREATE TYPE g12_taxonomy_status      AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TYPE g12_severity             AS ENUM ('INFO','WARN','CRITICAL');
CREATE TYPE g12_rule_status          AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TYPE g12_gap_status           AS ENUM ('GAP_FLAGGED','UNDER_REVIEW','EXPLAINED','CLOSED_RECORDED','CLOSED_FALSE_POSITIVE');

-- Status sub-ledger -------------------------------------------------------------------
CREATE TYPE g12_transition_kind      AS ENUM ('ENTRY_STATUS','ATTESTATION_STATUS','SUPERSESSION');

-- Corrections / attestations / signatures ---------------------------------------------
CREATE TYPE g12_correction_type      AS ENUM ('CORRIGENDUM','ANNOTATION','DISPUTE','DISPUTE_RESOLUTION','REVERSAL_CORRIGENDUM','BULK_CORRIGENDUM');
CREATE TYPE g12_correction_decision  AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE g12_attestation_subject  AS ENUM ('EVENT','VERIFICATION_CYCLE','EXTRACT');
CREATE TYPE g12_attestation_kind     AS ENUM ('CUSTODIAN_ATTEST','EMPLOYEE_VERIFY','EMPLOYEE_DISPUTE','EXTRACT_SIGN','HEIR_VERIFY','ASSISTED_VERIFY');
CREATE TYPE g12_signature_method     AS ENUM ('PKI_QUALIFIED','OTP_CONFIRMED','SERVER_SIGNED');

-- Verification cycles -----------------------------------------------------------------
CREATE TYPE g12_cycle_type           AS ENUM ('PERIODIC_5YR','PRE_RETIREMENT','AD_HOC','HEIR_VERIFICATION');
CREATE TYPE g12_cycle_status         AS ENUM ('OPEN','EMPLOYEE_REVIEW','BULK_REVIEW','DISPUTED','CUSTODIAN_REVIEW','COMPLETED','OVERDUE','ASSISTED','HEIR_PENDING');

-- Appeals -----------------------------------------------------------------------------
CREATE TYPE g12_appeal_status        AS ENUM ('RAISED','UNDER_APPEAL','UPHELD','OVERTURNED','REMANDED','WITHDRAWN');

-- LTV / longevity ---------------------------------------------------------------------
CREATE TYPE g12_ltv_subject          AS ENUM ('EXTRACT','ATTESTATION','ANCHOR');
CREATE TYPE g12_ltv_renewal_kind     AS ENUM ('LTV_INITIAL','ARCHIVE_TIMESTAMP','ALGORITHM_MIGRATION','RE_ANCHOR');
CREATE TYPE g12_ltv_trigger          AS ENUM ('SCHEDULE','CERT_EXPIRY','ALGO_DEPRECATION','MANUAL');
CREATE TYPE g12_extract_ltv_status   AS ENUM ('NONE','LTV_APPLIED','LTV_RENEWED');

-- Bulk corrigendum --------------------------------------------------------------------
CREATE TYPE g12_bulk_status          AS ENUM ('DRAFT','PREVIEW','SAMPLING_APPROVAL','APPROVED','APPLYING','APPLIED','REJECTED');

-- Ingestion provenance ----------------------------------------------------------------
CREATE TYPE g12_ingestion_validation AS ENUM ('ACCEPTED','REJECTED','DUPLICATE_NOOP','SEMANTIC_DUPLICATE_NOOP','SEMANTIC_CONFLICT');
CREATE TYPE g12_semantic_dedup_result AS ENUM ('NEW_FACT','SEMANTIC_DUPLICATE','SEMANTIC_CONFLICT');

-- Certified extracts ------------------------------------------------------------------
CREATE TYPE g12_extract_scope        AS ENUM ('FULL_SR','DATE_RANGE','EVENT_CATEGORY','SINGLE_EVENT');
CREATE TYPE g12_redaction_policy      AS ENUM ('NONE','LOAN_EXCLUDE_DISCIPLINARY','PUBLIC_MINIMAL','PENSION_FULL','COURT_FULL');

-- Access log --------------------------------------------------------------------------
CREATE TYPE g12_access_action        AS ENUM ('VIEW_TIMELINE','VIEW_EVENT','PRINT','EXPORT','ISSUE_EXTRACT','VERIFY_INTEGRITY','VERIFY_ANCHOR','GENERATE_65B');

-- Subscriptions -----------------------------------------------------------------------
CREATE TYPE g12_subscription_mode    AS ENUM ('PULL_FEED','WEBHOOK','MESSAGE_BUS');
CREATE TYPE g12_subscription_status  AS ENUM ('ACTIVE','PAUSED','RETIRED');

-- Legacy digitisation -----------------------------------------------------------------
CREATE TYPE g12_batch_status         AS ENUM ('CREATED','SCANNING','DATA_ENTRY','DUAL_VERIFICATION','RECONCILIATION','READY_FOR_PROMOTION','PROMOTED','REJECTED');
CREATE TYPE g12_match_status         AS ENUM ('UNMATCHED','MATCHED','AMBIGUOUS');
CREATE TYPE g12_record_verification  AS ENUM ('PENDING','VERIFIED','DISCREPANCY');
CREATE TYPE g12_corroboration_status AS ENUM ('NOT_REQUIRED','PENDING_EMPLOYEE','CORROBORATED','UNCORROBORATED');


-- =====================================================================================
-- SECTION 2 — TAXONOMY CATALOG  (E9 sr_event_type) — config entity, versioned
-- =====================================================================================
-- The governed, versioned SR event taxonomy. Freezes every code the writer set emits
-- (FR-01.A) with its category, allowed_source_modules allowlist, fact_correlation_rule
-- (FR-02 semantic dedup), payload_schema, qualifying-service flag, expected_cadence
-- (FR-17 completeness hint) and supports_reversal (FR-02/FR-05). A code+version is the
-- immutable publish unit; versions are append-by-new-version.
CREATE TABLE sr_event_type (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- event_type id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide
    event_type_code          varchar(48) NOT NULL,                          -- e.g. PROMOTION, LWP_SPELL
    version                  integer NOT NULL DEFAULT 1,                     -- monotonic per code
    event_category           sr_event_category NOT NULL,                    -- CORE enum (reused)
    display_name             varchar(120) NOT NULL,
    description              text,
    payload_schema           jsonb NOT NULL,                                -- JSON Schema validating ledger payload
    allowed_source_modules   varchar(16)[] NOT NULL,                        -- provenance allowlist (FR-01.B)
    fact_correlation_rule    jsonb,                                         -- how fact_key is derived (FR-02)
    is_qualifying_service    boolean NOT NULL DEFAULT false,                -- Q? — fact_key mandatory if true
    default_qualifying_impact sr_qualifying_impact NOT NULL DEFAULT 'NOT_APPLICABLE', -- CORE enum
    expected_cadence         jsonb,                                         -- completeness hint (FR-17)
    supports_reversal        boolean NOT NULL DEFAULT false,                -- has *_CANCELLED/*_REVERSAL partner
    requires_order_ref       boolean NOT NULL DEFAULT false,                -- order_no/order_date mandatory
    requires_document        boolean NOT NULL DEFAULT false,                -- >=1 document_id mandatory
    attestation_required     boolean NOT NULL DEFAULT true,
    is_identity_event        boolean NOT NULL DEFAULT false,                -- name/DOB/gender (extra controls)
    status                   g12_taxonomy_status NOT NULL DEFAULT 'DRAFT',
    effective_from           date NOT NULL,
    effective_to             date,                                          -- null = open
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_event_type_code_ver UNIQUE (tenant_id, event_type_code, version)
);
CREATE INDEX ix_sr_event_type_tenant   ON sr_event_type(tenant_id);
CREATE INDEX ix_sr_event_type_entity   ON sr_event_type(entity_id);
CREATE INDEX ix_sr_event_type_code      ON sr_event_type(tenant_id, event_type_code);
CREATE INDEX ix_sr_event_type_category  ON sr_event_type(event_category);
CREATE INDEX ix_sr_event_type_status    ON sr_event_type(status);
COMMENT ON TABLE sr_event_type IS 'G12 E9: versioned SR taxonomy catalog (FR-01.A). allowed_source_modules + fact_correlation_rule + payload_schema + qualifying flag. event_type_code on service_register_events is validated against PUBLISHED rows by ingestion (no DB FK — core loads first).';


-- =====================================================================================
-- SECTION 3 — STATUS SUB-LEDGER  (E19 sr_status_events) — APPEND-ONLY, hash-chained
-- =====================================================================================
-- Hash-chained per (tenant_id, employee_id) status chain. Entry-status, attestation-
-- status and supersession transitions are tamper-evident here; the projections on
-- service_register_events are read-only derivations of the latest value (BRD §5.6 r.4).
CREATE TABLE sr_status_events (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- status_event_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- owner of the chain
    target_event_id          uuid NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry whose status changed
    status_sequence_no       bigint NOT NULL,                               -- monotonic per (tenant,employee) status chain
    transition_kind          g12_transition_kind NOT NULL,
    from_value               varchar(32),                                   -- null on first
    to_value                 varchar(32) NOT NULL,
    related_event_id         uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- e.g. corrigendum causing SUPERSEDED
    reason_ref               varchar(64),                                   -- logical ref to sr_corrections/_attestations/_appeals
    actor                    varchar(64) NOT NULL,                          -- who/what caused the transition
    prev_status_hash         char(64) NOT NULL,                             -- SHA-256 of prior chain entry (GENESIS for first)
    status_hash              char(64) NOT NULL,                             -- SHA-256(canonical(status content) || prev_status_hash)
    hash_algorithm           varchar(16) NOT NULL DEFAULT 'SHA-256',
    recorded_at              timestamptz NOT NULL DEFAULT now(),
    tsa_timestamp_token      bytea,                                         -- RFC 3161 token over status_hash (sensitive transitions)
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT uq_sr_status_seq      UNIQUE (tenant_id, employee_id, status_sequence_no),
    CONSTRAINT uq_sr_status_hash     UNIQUE (tenant_id, employee_id, status_hash),
    CONSTRAINT ck_sr_status_hash_len CHECK (length(status_hash) = 64 AND length(prev_status_hash) = 64)
);
CREATE INDEX ix_sr_status_tenant   ON sr_status_events(tenant_id);
CREATE INDEX ix_sr_status_entity   ON sr_status_events(entity_id);
CREATE INDEX ix_sr_status_employee ON sr_status_events(tenant_id, employee_id, status_sequence_no);
CREATE INDEX ix_sr_status_target   ON sr_status_events(target_event_id);
CREATE INDEX ix_sr_status_related  ON sr_status_events(related_event_id);
CREATE INDEX ix_sr_status_kind     ON sr_status_events(transition_kind);
COMMENT ON TABLE sr_status_events IS 'G12 E19: append-only hash-chained status/supersession sub-ledger. No UPDATE/DELETE. Materialiser writes one row per status change in the same txn as the E8 projection refresh.';


-- =====================================================================================
-- SECTION 4 — EXTERNAL ANCHORS  (E20 sr_anchors) — APPEND-ONLY
-- =====================================================================================
-- Periodic Merkle root over all per-employee {content head, status head} leaves, RFC
-- 3161 trusted-timestamped and written to independent WORM (G13 document). Anchors are
-- per-tenant and chained. FR-04 compares live chain heads to the latest anchor; a
-- head-vs-anchor mismatch is a non-suppressible FAIL (BRD §5.6 r.5).
CREATE TABLE sr_anchors (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- anchor_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide anchor
    anchor_seq               bigint NOT NULL,                               -- monotonic per tenant
    period_from              timestamptz NOT NULL,
    period_to                timestamptz NOT NULL,
    merkle_root              char(64) NOT NULL,                             -- root over chain-head leaves
    leaf_count               bigint NOT NULL,                               -- employee chains covered
    head_snapshot_digest     char(64) NOT NULL,                            -- digest of ordered head list (reconstruction)
    tsa_timestamp_token      bytea NOT NULL,                                -- RFC 3161 token over merkle_root
    tsa_authority            varchar(120) NOT NULL,                         -- TSA identity / policy OID
    worm_document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, -- immutable WORM export (G13)
    external_notary_ref      varchar(160),                                  -- optional transparency-log/notary ref
    prev_anchor_hash         char(64) NOT NULL,                             -- chains anchors (GENESIS for first)
    anchor_hash              char(64) NOT NULL,                             -- SHA-256(canonical(anchor) || prev_anchor_hash)
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT uq_sr_anchor_seq      UNIQUE (tenant_id, anchor_seq),
    CONSTRAINT uq_sr_anchor_hash     UNIQUE (tenant_id, anchor_hash),
    CONSTRAINT ck_sr_anchor_hash_len CHECK (length(merkle_root) = 64 AND length(anchor_hash) = 64 AND length(prev_anchor_hash) = 64),
    CONSTRAINT ck_sr_anchor_period   CHECK (period_to >= period_from)
);
CREATE INDEX ix_sr_anchors_tenant   ON sr_anchors(tenant_id, anchor_seq);
CREATE INDEX ix_sr_anchors_entity   ON sr_anchors(entity_id);
CREATE INDEX ix_sr_anchors_period   ON sr_anchors(period_to);
CREATE INDEX ix_sr_anchors_worm_doc ON sr_anchors(worm_document_id);
COMMENT ON TABLE sr_anchors IS 'G12 E20: append-only external Merkle-root anchors (RFC 3161 + WORM). Root of insider/stale-restore resistance. No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 5 — COMPLETENESS MODEL  (E21 sr_expected_event_rule, E22 sr_gap_register)
-- =====================================================================================
-- E21: expected-event rules per cadre/service rule (config entity). JOB-G12-GAPSCAN
-- reconciles expected vs recorded and raises E22 gaps.
CREATE TABLE sr_expected_event_rule (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- rule_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide
    rule_code                varchar(48) NOT NULL,                          -- e.g. ANNUAL_INCREMENT
    applies_to_cadre         varchar(48)[],                                 -- cadres in scope (null = all)
    expected_event_category  sr_event_category NOT NULL,                    -- CORE enum
    cadence                  jsonb NOT NULL,                                -- recurrence spec
    suppressed_by_categories varchar(48)[],                                 -- events that legitimately explain absence
    source_rule_ref          varchar(120),                                  -- pointer to G06/G10/service-rule master
    severity                 g12_severity NOT NULL DEFAULT 'WARN',
    status                   g12_rule_status NOT NULL DEFAULT 'DRAFT',
    effective_from           date NOT NULL,
    effective_to             date,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_exp_rule_code UNIQUE (tenant_id, rule_code, effective_from)
);
CREATE INDEX ix_sr_exp_rule_tenant   ON sr_expected_event_rule(tenant_id);
CREATE INDEX ix_sr_exp_rule_entity   ON sr_expected_event_rule(entity_id);
CREATE INDEX ix_sr_exp_rule_category ON sr_expected_event_rule(expected_event_category);
CREATE INDEX ix_sr_exp_rule_status   ON sr_expected_event_rule(status);
COMMENT ON TABLE sr_expected_event_rule IS 'G12 E21: expected-event model for completeness (FR-17). G12 references substantive G06/G10 service rules; it does not own them.';

-- E22: detected completeness gaps + corroboration lifecycle (process entity).
CREATE TABLE sr_gap_register (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- gap_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    rule_id                  uuid NOT NULL REFERENCES sr_expected_event_rule(id) ON DELETE RESTRICT,
    expected_period_from     date NOT NULL,
    expected_period_to       date NOT NULL,
    expected_event_category  sr_event_category NOT NULL,                    -- CORE enum
    gap_status               g12_gap_status NOT NULL DEFAULT 'GAP_FLAGGED',
    explanation_code         varchar(48),                                   -- WITHHELD/NOT_DUE/LEGACY_MISSING/RECORDED_LATE
    resolved_event_id        uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry closing the gap
    corroborated_by          varchar(64),                                   -- employee/heir who corroborated
    severity                 g12_severity NOT NULL DEFAULT 'WARN',          -- inherited from rule
    detected_at              timestamptz NOT NULL DEFAULT now(),
    closed_at                timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_sr_gap_tenant     ON sr_gap_register(tenant_id);
CREATE INDEX ix_sr_gap_entity     ON sr_gap_register(entity_id);
CREATE INDEX ix_sr_gap_employee   ON sr_gap_register(tenant_id, employee_id);
CREATE INDEX ix_sr_gap_rule       ON sr_gap_register(rule_id);
CREATE INDEX ix_sr_gap_status     ON sr_gap_register(gap_status);
CREATE INDEX ix_sr_gap_resolved   ON sr_gap_register(resolved_event_id);
CREATE INDEX ix_sr_gap_severity   ON sr_gap_register(severity);
COMMENT ON TABLE sr_gap_register IS 'G12 E22: detected completeness gaps + corroboration (FR-17). A CRITICAL open gap blocks pre-retirement cycle completion until EXPLAINED/CLOSED.';


-- =====================================================================================
-- SECTION 6 — CORRECTIONS / ANNOTATIONS  (E10 sr_corrections) — APPEND-ONLY
-- =====================================================================================
-- Corrigendum / annotation / dispute / supersession records. A CORRIGENDUM points to
-- the new superseding ledger entry; the original is preserved and superseded once
-- forward (BRD §5.6 r.9). Maker-checker runs on P01 workflow_instances.
CREATE TABLE sr_corrections (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- correction_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    target_event_id          uuid NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry corrected/annotated/disputed
    correction_type          g12_correction_type NOT NULL,
    corrigendum_event_id     uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- for CORRIGENDUM: new superseding entry
    bulk_batch_id            uuid,                                          -- FK -> sr_bulk_corrigendum_batch (deferred ALTER §18)
    reason_code              varchar(48) NOT NULL,                          -- DATA_ENTRY_ERROR/ORDER_REVISED/COURT_DIRECTION
    reason_text              text NOT NULL,
    requested_by             varchar(64) NOT NULL,                          -- maker (HR/custodian/employee for dispute)
    workflow_instance_id     uuid REFERENCES workflow_instances(id) ON DELETE SET NULL, -- maker-checker
    decision                 g12_correction_decision NOT NULL DEFAULT 'PENDING',
    decided_by               varchar(64),                                   -- checker (SR Custodian)
    decided_at               timestamptz,
    supporting_document_ids  uuid[],                                        -- court order, revised GO, etc. (G13)
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid
);
CREATE INDEX ix_g12_sr_corr_tenant   ON sr_corrections(tenant_id);
CREATE INDEX ix_g12_sr_corr_entity   ON sr_corrections(entity_id);
CREATE INDEX ix_g12_sr_corr_target   ON sr_corrections(target_event_id);
CREATE INDEX ix_g12_sr_corr_corrig   ON sr_corrections(corrigendum_event_id);
CREATE INDEX ix_g12_sr_corr_bulk     ON sr_corrections(bulk_batch_id);
CREATE INDEX ix_g12_sr_corr_wf       ON sr_corrections(workflow_instance_id);
CREATE INDEX ix_g12_sr_corr_type     ON sr_corrections(correction_type);
CREATE INDEX ix_g12_sr_corr_decision ON sr_corrections(decision);
COMMENT ON TABLE sr_corrections IS 'G12 E10: append-only corrigendum/annotation/dispute/supersession records. No UPDATE/DELETE; the decision lifecycle is recorded by appended rows + workflow_actions.';


-- =====================================================================================
-- SECTION 7 — ATTESTATIONS  (E11 sr_attestations) — APPEND-ONLY
-- =====================================================================================
-- Custodian/employee/heir qualified signatures + trusted timestamps over an event,
-- a verification cycle, or an extract. Statutory signatures MUST be PKI_QUALIFIED;
-- SERVER_SIGNED is rejected for statutory outputs (BRD §5.6 r.11).
CREATE TABLE sr_attestations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- attestation_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    subject_type             g12_attestation_subject NOT NULL,             -- EVENT/VERIFICATION_CYCLE/EXTRACT
    subject_id               uuid NOT NULL,                                 -- polymorphic ref (no single FK target)
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- SR owner
    attestation_kind         g12_attestation_kind NOT NULL,
    attested_by              varchar(64) NOT NULL,                          -- custodian/employee/heir user id
    attested_role            varchar(48) NOT NULL,                          -- SR_CUSTODIAN/EMPLOYEE/HEIR
    signature_method         g12_signature_method NOT NULL,
    signature_value          text,                                          -- detached signature / signed digest
    certificate_serial       varchar(80),                                   -- PKI cert serial if PKI_QUALIFIED
    tsa_timestamp_token      bytea,                                         -- RFC 3161 token over signed_digest
    tsa_authority            varchar(120),
    signed_digest            char(64) NOT NULL,                             -- SHA-256 of attested content snapshot
    attested_at              timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT ck_sr_attest_digest_len CHECK (length(signed_digest) = 64)
);
CREATE INDEX ix_sr_attest_tenant   ON sr_attestations(tenant_id);
CREATE INDEX ix_sr_attest_entity   ON sr_attestations(entity_id);
CREATE INDEX ix_sr_attest_subject  ON sr_attestations(subject_type, subject_id);
CREATE INDEX ix_sr_attest_employee ON sr_attestations(tenant_id, employee_id);
CREATE INDEX ix_sr_attest_kind     ON sr_attestations(attestation_kind);
COMMENT ON TABLE sr_attestations IS 'G12 E11: append-only qualified-signature attestations (custodian/employee/heir/extract). No UPDATE/DELETE. Polymorphic subject_id resolved by subject_type.';


-- =====================================================================================
-- SECTION 8 — VERIFICATION CYCLES  (E12 sr_verification_cycles) — managed entity
-- =====================================================================================
-- Periodic + bulk/assisted/heir verification cycles. Header is managed; the signed
-- confirmations are immutable sr_attestations rows referenced here.
CREATE TABLE sr_verification_cycles (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- cycle_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    cycle_type               g12_cycle_type NOT NULL,
    period_from              date NOT NULL,
    period_to                date NOT NULL,
    due_date                 date NOT NULL,
    status                   g12_cycle_status NOT NULL DEFAULT 'OPEN',
    events_in_scope          integer NOT NULL DEFAULT 0,
    events_confirmed         integer NOT NULL DEFAULT 0,
    events_disputed          integer NOT NULL DEFAULT 0,
    employee_attestation_id  uuid REFERENCES sr_attestations(id) ON DELETE SET NULL, -- employee/heir signed confirmation
    custodian_attestation_id uuid REFERENCES sr_attestations(id) ON DELETE SET NULL, -- custodian finalisation
    completed_at             timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_sr_cycle_period CHECK (period_to >= period_from)
);
CREATE INDEX ix_sr_cycle_tenant   ON sr_verification_cycles(tenant_id);
CREATE INDEX ix_sr_cycle_entity   ON sr_verification_cycles(entity_id);
CREATE INDEX ix_sr_cycle_employee ON sr_verification_cycles(tenant_id, employee_id);
CREATE INDEX ix_sr_cycle_status   ON sr_verification_cycles(status);
CREATE INDEX ix_sr_cycle_due      ON sr_verification_cycles(due_date);
CREATE INDEX ix_sr_cycle_emp_att  ON sr_verification_cycles(employee_attestation_id);
CREATE INDEX ix_sr_cycle_cust_att ON sr_verification_cycles(custodian_attestation_id);
COMMENT ON TABLE sr_verification_cycles IS 'G12 E12: periodic/bulk/assisted/heir verification cycles (FR-08). Header managed; confirmations are immutable sr_attestations.';


-- =====================================================================================
-- SECTION 9 — APPEALS  (E23 sr_appeals) — process entity
-- =====================================================================================
-- Grievance/appeal escalation beyond custodian uphold (FR-21). WF-G12-APPEAL on P01;
-- an OVERTURNED appeal may spawn a corrigendum.
CREATE TABLE sr_appeals (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- appeal_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- appellant subject
    target_event_id          uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry under appeal (if entry-specific)
    source_dispute_id        uuid REFERENCES sr_corrections(id) ON DELETE SET NULL, -- the upheld dispute being appealed
    appeal_reason            text NOT NULL,
    appellate_authority      varchar(64),                                   -- assigned higher authority/tribunal
    workflow_instance_id     uuid REFERENCES workflow_instances(id) ON DELETE SET NULL, -- WF-G12-APPEAL
    status                   g12_appeal_status NOT NULL DEFAULT 'RAISED',
    decision_text            text,
    resulting_correction_id  uuid REFERENCES sr_corrections(id) ON DELETE SET NULL, -- corrigendum spawned if overturned
    decided_by               varchar(64),
    decided_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_sr_appeal_tenant   ON sr_appeals(tenant_id);
CREATE INDEX ix_sr_appeal_entity   ON sr_appeals(entity_id);
CREATE INDEX ix_sr_appeal_employee ON sr_appeals(tenant_id, employee_id);
CREATE INDEX ix_sr_appeal_target   ON sr_appeals(target_event_id);
CREATE INDEX ix_sr_appeal_dispute  ON sr_appeals(source_dispute_id);
CREATE INDEX ix_sr_appeal_wf       ON sr_appeals(workflow_instance_id);
CREATE INDEX ix_sr_appeal_status   ON sr_appeals(status);
CREATE INDEX ix_sr_appeal_result   ON sr_appeals(resulting_correction_id);
COMMENT ON TABLE sr_appeals IS 'G12 E23: grievance/appeal escalation (FR-21). Disputed status is visible on extracts; an OVERTURNED appeal can spawn a corrigendum.';


-- =====================================================================================
-- SECTION 10 — §65B / BSA CERTIFICATES  (E24 sr_authenticity_certificates) — APPEND-ONLY
-- =====================================================================================
-- Machine-generated electronic-record authenticity certificate per certified extract
-- (FR-18), citing content digest, anchor, signer, chain of custody, system description.
CREATE TABLE sr_authenticity_certificates (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- certificate_id
    tenant_id                 uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    extract_id                uuid NOT NULL,                                -- FK -> sr_certified_extracts (deferred ALTER §18)
    certificate_no            varchar(48) NOT NULL,                         -- human-readable (unique)
    statute_reference         varchar(80) NOT NULL,                         -- BSA 2023 s.63 / IT Act s.65B
    content_digest            char(64) NOT NULL,                            -- matches extract content_digest
    anchor_id                 uuid NOT NULL REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- proves tamper-evident state at issue
    signer_identity           varchar(160) NOT NULL,                        -- custodian + certificate serial
    signing_certificate_serial varchar(80) NOT NULL,
    tsa_timestamp_token       bytea NOT NULL,                               -- RFC 3161 token at certificate issue
    chain_of_custody          jsonb NOT NULL,                               -- provenance/ingestion/attestation lineage
    system_description        text NOT NULL,                                -- statutory statement of producing system
    document_id               uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, -- signed certificate PDF (G13)
    issued_at                 timestamptz NOT NULL DEFAULT now(),
    created_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    CONSTRAINT uq_sr_cert_no       UNIQUE (tenant_id, certificate_no),
    CONSTRAINT ck_sr_cert_dig_len  CHECK (length(content_digest) = 64)
);
CREATE INDEX ix_sr_cert_tenant  ON sr_authenticity_certificates(tenant_id);
CREATE INDEX ix_sr_cert_entity  ON sr_authenticity_certificates(entity_id);
CREATE INDEX ix_sr_cert_extract ON sr_authenticity_certificates(extract_id);
CREATE INDEX ix_sr_cert_anchor  ON sr_authenticity_certificates(anchor_id);
CREATE INDEX ix_sr_cert_doc     ON sr_authenticity_certificates(document_id);
COMMENT ON TABLE sr_authenticity_certificates IS 'G12 E24: append-only §65B/BSA certificate-of-authenticity per certified extract (FR-18). No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 11 — LTV RENEWALS  (E25 sr_ltv_renewals) — APPEND-ONLY
-- =====================================================================================
-- PAdES-LTV / RFC 4998 evidence-record renewal events; crypto-migration re-anchor (FR-19).
CREATE TABLE sr_ltv_renewals (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- renewal_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide (anchor renewals)
    subject_type             g12_ltv_subject NOT NULL,                     -- EXTRACT/ATTESTATION/ANCHOR
    subject_id               uuid NOT NULL,                                 -- polymorphic ref to renewed artefact
    renewal_kind             g12_ltv_renewal_kind NOT NULL,
    prior_algorithm          varchar(16),
    new_algorithm            varchar(16),
    evidence_record_ref      varchar(160) NOT NULL,                         -- RFC 4998 ERS / archive timestamp id
    tsa_timestamp_token      bytea NOT NULL,                                -- fresh RFC 3161 token at renewal
    new_anchor_id            uuid REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- anchor re-issued on RE_ANCHOR/migration
    triggered_by             g12_ltv_trigger NOT NULL,
    renewed_at               timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid
);
CREATE INDEX ix_sr_ltv_tenant     ON sr_ltv_renewals(tenant_id);
CREATE INDEX ix_sr_ltv_entity     ON sr_ltv_renewals(entity_id);
CREATE INDEX ix_sr_ltv_subject    ON sr_ltv_renewals(subject_type, subject_id);
CREATE INDEX ix_sr_ltv_kind       ON sr_ltv_renewals(renewal_kind);
CREATE INDEX ix_sr_ltv_new_anchor ON sr_ltv_renewals(new_anchor_id);
COMMENT ON TABLE sr_ltv_renewals IS 'G12 E25: append-only PAdES-LTV / RFC 4998 evidence-record renewals and crypto-migration re-anchors (FR-19). No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 12 — BULK CORRIGENDUM BATCHES  (E26 sr_bulk_corrigendum_batch) — process entity
-- =====================================================================================
-- Cadre-wide / pay-commission bulk corrigendum with sampling-based maker-checker (FR-20).
CREATE TABLE sr_bulk_corrigendum_batch (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- bulk_batch_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = cross-entity cadre batch
    batch_no                 varchar(40) NOT NULL,                          -- human-readable (unique)
    trigger_reference        varchar(160) NOT NULL,                         -- Pay Commission GO no., re-fixation order
    reason_code              varchar(48) NOT NULL,                          -- PAY_COMMISSION_REVISION/SENIORITY_REFIXATION/COURT_DIRECTION
    target_selector          jsonb NOT NULL,                                -- selection criteria
    target_count             integer NOT NULL DEFAULT 0,
    sample_size              integer NOT NULL DEFAULT 0,
    sample_approved_count    integer NOT NULL DEFAULT 0,
    status                   g12_bulk_status NOT NULL DEFAULT 'DRAFT',
    workflow_instance_id     uuid REFERENCES workflow_instances(id) ON DELETE SET NULL, -- WF-G12-BULK-CORRIGENDUM
    applied_count            integer NOT NULL DEFAULT 0,
    failed_count             integer NOT NULL DEFAULT 0,
    applied_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_bulk_no UNIQUE (tenant_id, batch_no)
);
CREATE INDEX ix_sr_bulk_tenant ON sr_bulk_corrigendum_batch(tenant_id);
CREATE INDEX ix_sr_bulk_entity ON sr_bulk_corrigendum_batch(entity_id);
CREATE INDEX ix_sr_bulk_status ON sr_bulk_corrigendum_batch(status);
CREATE INDEX ix_sr_bulk_wf     ON sr_bulk_corrigendum_batch(workflow_instance_id);
COMMENT ON TABLE sr_bulk_corrigendum_batch IS 'G12 E26: cadre-wide/pay-commission bulk corrigendum batch (FR-20). Per-entry corrigenda are appended to sr_corrections with bulk_batch_id set.';


-- =====================================================================================
-- SECTION 13 — INGESTION PROVENANCE  (E13 sr_ingestion_requests) — APPEND-ONLY
-- =====================================================================================
-- Idempotency + semantic-dedup + provenance log for every ingestion call (FR-02).
CREATE TABLE sr_ingestion_requests (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- ingestion_request_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    idempotency_key          varchar(128) NOT NULL,                         -- deterministic from source; unique
    source_module            varchar(16) NOT NULL,                          -- provenance
    source_reference_id      varchar(64) NOT NULL,                          -- originating txn/order id
    source_event_version     integer NOT NULL DEFAULT 1,
    contract_version         varchar(16) NOT NULL,                          -- ingestion API version (e.g. v1)
    event_type_code          varchar(48) NOT NULL,                          -- requested SR event type
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    fact_key                 varchar(96),                                   -- semantic key supplied/derived (FR-02)
    request_payload          jsonb NOT NULL,                                -- frozen request as received
    validation_result        g12_ingestion_validation NOT NULL,
    semantic_dedup_result    g12_semantic_dedup_result,                     -- NEW_FACT/SEMANTIC_DUPLICATE/SEMANTIC_CONFLICT
    is_reversal              boolean NOT NULL DEFAULT false,
    rejection_code           varchar(48),                                   -- if REJECTED
    created_event_id         uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- ledger entry created (if ACCEPTED)
    conflicting_event_id     uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- prior entry on semantic conflict
    received_at              timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT uq_sr_ingest_idem UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX ix_sr_ingest_tenant   ON sr_ingestion_requests(tenant_id);
CREATE INDEX ix_sr_ingest_entity   ON sr_ingestion_requests(entity_id);
CREATE INDEX ix_sr_ingest_source   ON sr_ingestion_requests(source_module, source_reference_id);
CREATE INDEX ix_sr_ingest_employee ON sr_ingestion_requests(tenant_id, employee_id);
CREATE INDEX ix_sr_ingest_factkey  ON sr_ingestion_requests(tenant_id, fact_key) WHERE fact_key IS NOT NULL;
CREATE INDEX ix_sr_ingest_result   ON sr_ingestion_requests(validation_result);
CREATE INDEX ix_sr_ingest_created  ON sr_ingestion_requests(created_event_id);
COMMENT ON TABLE sr_ingestion_requests IS 'G12 E13: append-only ingestion provenance/idempotency/semantic-dedup log (FR-02). No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 14 — CERTIFIED EXTRACTS  (E14 sr_certified_extracts) — managed (revocation only)
-- =====================================================================================
-- Issued certified true copies — signed, purpose-redacted, §65B-certified, LTV-wrapped,
-- offline/QR-verifiable (FR-10/FR-11/FR-18/FR-19).
CREATE TABLE sr_certified_extracts (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- extract_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    extract_no                  varchar(40) NOT NULL,                       -- human-readable cert number (unique)
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    scope                       g12_extract_scope NOT NULL,
    scope_params                jsonb,                                      -- date range / category filters
    event_count                 integer NOT NULL DEFAULT 0,
    content_digest              char(64) NOT NULL,                          -- SHA-256 of rendered ordered content (binds copy)
    redaction_policy            g12_redaction_policy NOT NULL DEFAULT 'NONE', -- purpose-driven redaction (FR-10)
    redacted_categories         varchar(32)[],                              -- categories excluded by the policy
    document_id                 uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT, -- signed PDF (G13)
    signature_attestation_id    uuid REFERENCES sr_attestations(id) ON DELETE RESTRICT, -- custodian signature
    authenticity_certificate_id uuid,                                       -- FK -> sr_authenticity_certificates (deferred ALTER §18)
    anchor_id                   uuid REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- embedded anchor ref (offline verify)
    offline_bundle_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL, -- self-contained offline bundle (G13)
    ltv_status                  g12_extract_ltv_status NOT NULL DEFAULT 'NONE',
    qr_verification_token       varchar(64) NOT NULL,                       -- opaque token -> verification endpoint (unique)
    issued_to                   varchar(160) NOT NULL,                      -- requestor / purpose
    purpose                     varchar(120),                              -- pension/loan/court
    valid_until                 date,
    revoked                     boolean NOT NULL DEFAULT false,
    revoked_reason              text,
    issued_at                   timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_extract_no  UNIQUE (tenant_id, extract_no),
    CONSTRAINT uq_sr_extract_qr  UNIQUE (qr_verification_token),
    CONSTRAINT ck_sr_extract_dig CHECK (length(content_digest) = 64)
);
CREATE INDEX ix_sr_extract_tenant   ON sr_certified_extracts(tenant_id);
CREATE INDEX ix_sr_extract_entity   ON sr_certified_extracts(entity_id);
CREATE INDEX ix_sr_extract_employee ON sr_certified_extracts(tenant_id, employee_id);
CREATE INDEX ix_sr_extract_doc      ON sr_certified_extracts(document_id);
CREATE INDEX ix_sr_extract_sig      ON sr_certified_extracts(signature_attestation_id);
CREATE INDEX ix_sr_extract_anchor   ON sr_certified_extracts(anchor_id);
CREATE INDEX ix_sr_extract_scope    ON sr_certified_extracts(scope);
COMMENT ON TABLE sr_certified_extracts IS 'G12 E14: certified true copies (FR-10). Revocation is the only managed mutation; content_digest binds the redacted rendering.';


-- =====================================================================================
-- SECTION 15 — ACCESS LOG  (E15 sr_access_log) — APPEND-ONLY (fail-closed)
-- =====================================================================================
-- Custody/access trail; non-self access requires a stated purpose; a read fails if it
-- cannot be logged (BRD §5.6 r.15).
CREATE TABLE sr_access_log (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- access_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- whose SR was accessed
    accessed_by              varchar(64) NOT NULL,                          -- actor user id
    actor_role               varchar(48) NOT NULL,                          -- role at time of access
    action                   g12_access_action NOT NULL,
    scope_detail             jsonb,                                         -- filters / event ids accessed
    purpose                  varchar(160),                                  -- stated reason (required for non-self)
    ip_address               varchar(64),
    correlation_id           varchar(64) NOT NULL,                          -- correlates to audit_log (X-Correlation-Id)
    accessed_at              timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid
);
CREATE INDEX ix_sr_access_tenant   ON sr_access_log(tenant_id);
CREATE INDEX ix_sr_access_entity   ON sr_access_log(entity_id);
CREATE INDEX ix_sr_access_employee ON sr_access_log(tenant_id, employee_id);
CREATE INDEX ix_sr_access_action   ON sr_access_log(action);
CREATE INDEX ix_sr_access_corr     ON sr_access_log(correlation_id);
CREATE INDEX ix_sr_access_at       ON sr_access_log(accessed_at);
COMMENT ON TABLE sr_access_log IS 'G12 E15: append-only fail-closed custody/access log (FR-12). No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 16 — SUBSCRIPTIONS  (E16 sr_subscriptions) — config entity
-- =====================================================================================
-- Downstream pull-feed subscriptions + cursor. PULL_FEED at launch; WEBHOOK/MESSAGE_BUS
-- deferred behind a documented real-time requirement (FR-13).
CREATE TABLE sr_subscriptions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- subscription_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide
    subscriber_module        varchar(16) NOT NULL,                          -- G11/G06/G14 etc.
    event_categories         varchar(32)[] NOT NULL,                        -- categories subscribed
    delivery_mode            g12_subscription_mode NOT NULL DEFAULT 'PULL_FEED',
    endpoint_url             varchar(300),                                  -- for WEBHOOK (deferred)
    secret_ref               varchar(120),                                  -- env-ref to HMAC secret (never the secret)
    last_delivered_seq       bigint,                                        -- cursor for at-least-once
    status                   g12_subscription_status NOT NULL DEFAULT 'ACTIVE',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_sub_module UNIQUE (tenant_id, subscriber_module)
);
CREATE INDEX ix_sr_sub_tenant ON sr_subscriptions(tenant_id);
CREATE INDEX ix_sr_sub_entity ON sr_subscriptions(entity_id);
CREATE INDEX ix_sr_sub_status ON sr_subscriptions(status);
COMMENT ON TABLE sr_subscriptions IS 'G12 E16: downstream pull-feed subscriptions + cursor (FR-13). secret_ref is an env reference, never the secret value.';


-- =====================================================================================
-- SECTION 17 — LEGACY DIGITISATION  (E17 batch, E18 record) — process entities
-- =====================================================================================
-- Confidence-flagged legacy service-book digitisation on the P06 ETL+V framework (FR-14).
CREATE TABLE sr_legacy_digitisation_batch (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- batch_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_no                 varchar(40) NOT NULL,                          -- human-readable (unique)
    org_unit_id              uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT, -- office whose books are digitised
    cohort_description       varchar(200) NOT NULL,
    record_count             integer NOT NULL DEFAULT 0,
    status                   g12_batch_status NOT NULL DEFAULT 'CREATED',
    scan_document_ids        uuid[],                                        -- master scan bundles (G13)
    verified_count           integer NOT NULL DEFAULT 0,
    discrepancy_count        integer NOT NULL DEFAULT 0,
    migration_run_id         uuid REFERENCES migration_runs(id) ON DELETE SET NULL, -- P06 ETL+V ledger linkage
    workflow_instance_id     uuid REFERENCES workflow_instances(id) ON DELETE SET NULL, -- WF-G12-LEGACY-PROMOTE
    promoted_at              timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_legbatch_no UNIQUE (tenant_id, batch_no)
);
CREATE INDEX ix_sr_legbatch_tenant ON sr_legacy_digitisation_batch(tenant_id);
CREATE INDEX ix_sr_legbatch_entity ON sr_legacy_digitisation_batch(entity_id);
CREATE INDEX ix_sr_legbatch_org    ON sr_legacy_digitisation_batch(org_unit_id);
CREATE INDEX ix_sr_legbatch_status ON sr_legacy_digitisation_batch(status);
CREATE INDEX ix_sr_legbatch_mig    ON sr_legacy_digitisation_batch(migration_run_id);
CREATE INDEX ix_sr_legbatch_wf     ON sr_legacy_digitisation_batch(workflow_instance_id);
COMMENT ON TABLE sr_legacy_digitisation_batch IS 'G12 E17: legacy digitisation batch header (FR-14) on P06 ETL+V (migration_runs). Confidence-flagged lane.';

CREATE TABLE sr_legacy_digitisation_record (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- record_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_id                 uuid NOT NULL REFERENCES sr_legacy_digitisation_batch(id) ON DELETE RESTRICT,
    employee_id              uuid REFERENCES employees(id) ON DELETE RESTRICT, -- resolved master match (null until matched)
    service_no               varchar(32),                                   -- as read from paper
    page_ref                 varchar(40),                                   -- original service-book page ref
    event_type_code          varchar(48),                                   -- mapped SR type
    event_date               date,                                          -- as read
    transcribed_payload      jsonb NOT NULL,                                -- data-entered fields
    entry_operator           varchar(64),                                   -- data-entry user (maker)
    verifier                 varchar(64),                                   -- dual-verification user (checker)
    scan_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL, -- page scan (G13)
    match_status             g12_match_status NOT NULL DEFAULT 'UNMATCHED',
    verification_status      g12_record_verification NOT NULL DEFAULT 'PENDING',
    confidence_status        sr_confidence_status NOT NULL DEFAULT 'RECONSTRUCTED', -- CORE enum (FR-14 lane)
    corroboration_status     g12_corroboration_status NOT NULL DEFAULT 'NOT_REQUIRED',
    evidence_quality_note    text,                                          -- faded-ink/missing-page best-evidence note
    discrepancy_note         text,
    promoted_event_id        uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- ledger entry on promotion
    legacy_source_id         varchar(80),                                   -- permanent ETL+V traceability + dedup key
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_sr_legrec_tenant   ON sr_legacy_digitisation_record(tenant_id);
CREATE INDEX ix_sr_legrec_entity   ON sr_legacy_digitisation_record(entity_id);
CREATE INDEX ix_sr_legrec_batch    ON sr_legacy_digitisation_record(batch_id);
CREATE INDEX ix_sr_legrec_employee ON sr_legacy_digitisation_record(employee_id);
CREATE INDEX ix_sr_legrec_match    ON sr_legacy_digitisation_record(match_status);
CREATE INDEX ix_sr_legrec_verif    ON sr_legacy_digitisation_record(verification_status);
CREATE INDEX ix_sr_legrec_promoted ON sr_legacy_digitisation_record(promoted_event_id);
CREATE INDEX ix_sr_legrec_legsrc   ON sr_legacy_digitisation_record(tenant_id, legacy_source_id) WHERE legacy_source_id IS NOT NULL;
COMMENT ON TABLE sr_legacy_digitisation_record IS 'G12 E18: staged legacy entry with confidence + corroboration flags (FR-14). Promotion creates the immutable ledger entry.';


-- =====================================================================================
-- SECTION 18 — DEFERRED CROSS-SECTION FOREIGN KEYS (forward references)
-- =====================================================================================
-- Resolve the two circular module-internal references now that both tables exist.
ALTER TABLE sr_corrections
    ADD CONSTRAINT fk_sr_corr_bulk_batch
    FOREIGN KEY (bulk_batch_id) REFERENCES sr_bulk_corrigendum_batch(id) ON DELETE SET NULL;

ALTER TABLE sr_authenticity_certificates
    ADD CONSTRAINT fk_sr_cert_extract
    FOREIGN KEY (extract_id) REFERENCES sr_certified_extracts(id) ON DELETE RESTRICT;

ALTER TABLE sr_certified_extracts
    ADD CONSTRAINT fk_sr_extract_authcert
    FOREIGN KEY (authenticity_certificate_id) REFERENCES sr_authenticity_certificates(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION 19 — ROW-LEVEL SECURITY (P02 data-scope substrate)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to every G12-owned table. Append-only
-- ledgers are still RLS-scoped for read isolation; their immutability is a separate
-- grant/trigger concern (operational).
DO $$
DECLARE
    t text;
    g12_tables text[] := ARRAY[
        'sr_event_type','sr_status_events','sr_anchors','sr_expected_event_rule',
        'sr_gap_register','sr_corrections','sr_attestations','sr_verification_cycles',
        'sr_appeals','sr_authenticity_certificates','sr_ltv_renewals',
        'sr_bulk_corrigendum_batch','sr_ingestion_requests','sr_certified_extracts',
        'sr_access_log','sr_subscriptions','sr_legacy_digitisation_batch',
        'sr_legacy_digitisation_record'
    ];
BEGIN
    FOREACH t IN ARRAY g12_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
            USING (
                tenant_id = current_setting('app.current_tenant_id', true)::uuid
                OR current_setting('app.is_platform_admin', true) = 'true'
            )
            WITH CHECK (
                tenant_id = current_setting('app.current_tenant_id', true)::uuid
                OR current_setting('app.is_platform_admin', true) = 'true'
            );
        $f$, t);
    END LOOP;
END $$;


-- =====================================================================================
-- SECTION 20 — SAMPLE SEED ROWS (BRD §5.2 + FR-01.A catalog seed)
-- =====================================================================================
-- Reuse core seed fixtures (00-platform-core.sql §12): tenant 1111…1111, entity …2201,
-- org_unit …3301, employees …9901 (Anjali Rao, GOV-100245) / …9902 (Mohan Kumar,
-- GOV-088120), SR events aaaa…aa01 (APPOINTMENT seq 1) / aaaa…aa02 (PROMOTION seq 2).
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- E9 sr_event_type — published canonical catalog seed (FR-01.A subset across families) --
INSERT INTO sr_event_type
 (id, tenant_id, entity_id, event_type_code, version, event_category, display_name, payload_schema,
  allowed_source_modules, fact_correlation_rule, is_qualifying_service, default_qualifying_impact,
  expected_cadence, supports_reversal, requires_order_ref, requires_document, attestation_required,
  is_identity_event, status, effective_from)
VALUES
 ('12e90001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'APPOINTMENT',1,'APPOINTMENT',
  'Initial Appointment','{"type":"object","required":["order_no","post"]}','{G01,G12_MANUAL,G12_LEGACY}',
  '{"key":"EMP|CAT:APPOINTMENT|EFF:event_date"}',true,'QUALIFYING',NULL,false,true,true,true,false,'PUBLISHED','2000-01-01'),
 ('12e90001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,'DOB_CHANGE',1,'IDENTITY',
  'Date of Birth Change','{"type":"object","required":["old_dob","new_dob","order_no"]}','{G01,G12_MANUAL}',
  '{"key":"EMP|CAT:IDENTITY|ATTR:DOB|EFF:event_date"}',false,'NOT_APPLICABLE',NULL,false,true,true,true,true,'PUBLISHED','2000-01-01'),
 ('12e90001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',NULL,'LWP_SPELL',1,'LEAVE',
  'Leave Without Pay Spell','{"type":"object","required":["leave_spell_lineage_id","from","to","days"]}','{G04,G12_MANUAL,G12_LEGACY}',
  '{"key":"EMP|CAT:LEAVE|LINEAGE:leave_spell_lineage_id"}',true,'NON_QUALIFYING',NULL,false,false,false,true,false,'PUBLISHED','2000-01-01'),
 ('12e90001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',NULL,'PROMOTION',1,'PROMOTION',
  'Promotion','{"type":"object","required":["from_post","to_post","order_no"]}','{G06,G12_MANUAL,G12_LEGACY}',
  '{"key":"EMP|CAT:PROMOTION|EFF:event_date|POST:to_post"}',true,'QUALIFYING',NULL,true,true,true,true,false,'PUBLISHED','2000-01-01'),
 ('12e90001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',NULL,'ANNUAL_INCREMENT',1,'INCREMENT',
  'Annual Increment','{"type":"object","required":["increment_date","new_pay"]}','{G10,G12_MANUAL,G12_LEGACY}',
  '{"key":"EMP|CAT:INCREMENT|EFF:event_date"}',true,'QUALIFYING','{"type":"ANNUAL","month":7,"unless_event":"INCREMENT_WITHHELD"}',false,false,false,true,false,'PUBLISHED','2000-01-01'),
 ('12e90001-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111',NULL,'SUPERANNUATION',1,'SEPARATION',
  'Superannuation','{"type":"object","required":["retirement_date","order_no"]}','{G11,G12_MANUAL,G12_LEGACY}',
  '{"key":"EMP|CAT:SEPARATION|ATTR:SUPERANNUATION|EFF:event_date"}',true,'QUALIFYING',NULL,false,true,true,true,false,'PUBLISHED','2000-01-01');

-- E19 sr_status_events — attestation + supersession transitions on the core PROMOTION entry --
INSERT INTO sr_status_events
 (id, tenant_id, entity_id, employee_id, target_event_id, status_sequence_no, transition_kind, from_value, to_value,
  related_event_id, actor, prev_status_hash, status_hash, created_by)
VALUES
 ('12e19001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',1,'ATTESTATION_STATUS','UNATTESTED','ATTESTED',
  NULL,'custodian.rao','GENESIS000000000000000000000000000000000000000000000000000000000',
  'aa01bb02cc03dd04ee05ff06aa07bb08cc09dd10ee11ff12aa13bb14cc15dd16',NULL),
 ('12e19001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',2,'ATTESTATION_STATUS','UNATTESTED','EMPLOYEE_VERIFIED',
  NULL,'emp.rao','aa01bb02cc03dd04ee05ff06aa07bb08cc09dd10ee11ff12aa13bb14cc15dd16',
  'bb02cc03dd04ee05ff06aa07bb08cc09dd10ee11ff12aa13bb14cc15dd16ee17',NULL);

-- E20 sr_anchors — a tenant anchor (WORM export uses a placeholder G13 document below) --
-- A G13 document row for the WORM anchor export (referenced by the anchor + §65B cert).
INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, status, created_by)
VALUES ('12d0c001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
        'SR-ANCHOR-2026-0001','SR Anchor WORM Export 2026-06-30','ACTIVE',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO sr_anchors
 (id, tenant_id, entity_id, anchor_seq, period_from, period_to, merkle_root, leaf_count, head_snapshot_digest,
  tsa_timestamp_token, tsa_authority, worm_document_id, prev_anchor_hash, anchor_hash, created_by)
VALUES
 ('12e20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,1,
  '2026-06-29T18:30:00Z','2026-06-30T18:30:00Z','7c4ab1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddee',2,
  'd1e2f30415263748596a7b8c9daebfc0112233445566778899aabbccddeeff00','\x3082',
  'CGG-TSA Policy 1.2.3','12d0c001-0000-0000-0000-000000000001',
  'GENESIS000000000000000000000000000000000000000000000000000000000',
  '9f10ee21324354657687980a1b2c3d4e5f60718293a4b5c6d7e8f90011223344',NULL);

-- E21 sr_expected_event_rule --
INSERT INTO sr_expected_event_rule
 (id, tenant_id, entity_id, rule_code, applies_to_cadre, expected_event_category, cadence,
  suppressed_by_categories, source_rule_ref, severity, status, effective_from, created_by)
VALUES
 ('12e21001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'ANNUAL_INCREMENT','{ADMIN}','INCREMENT',
  '{"type":"ANNUAL","month":7}','{INCREMENT,SUSPENSION,LEAVE}','G10:SR-INCR-RULE','CRITICAL','PUBLISHED','2000-01-01',NULL),
 ('12e21001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,'CONFIRMATION_DUE',NULL,'CONFIRMATION',
  '{"type":"ONCE","months_after_join":24}','{PROMOTION}','G06:SR-CONF-RULE','WARN','PUBLISHED','2000-01-01',NULL);

-- E22 sr_gap_register --
INSERT INTO sr_gap_register
 (id, tenant_id, entity_id, employee_id, rule_id, expected_period_from, expected_period_to, expected_event_category,
  gap_status, severity, created_by)
VALUES
 ('12e22001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999902','12e21001-0000-0000-0000-000000000001','2014-07-01','2014-07-31','INCREMENT','GAP_FLAGGED','CRITICAL',NULL),
 ('12e22001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','12e21001-0000-0000-0000-000000000002','2010-07-14','2010-07-31','CONFIRMATION','EXPLAINED','WARN',NULL);

-- E10 sr_corrections --
INSERT INTO sr_corrections
 (id, tenant_id, entity_id, target_event_id, correction_type, reason_code, reason_text, requested_by, decision, created_by)
VALUES
 ('12e10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02','ANNOTATION','PROBATION_NOTE','Probation period note appended.','hr.officer','APPROVED',NULL),
 ('12e10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','DISPUTE','EMPLOYEE_OBJECTION','Employee disputes the recorded post.','emp.rao','PENDING',NULL);

-- E11 sr_attestations --
INSERT INTO sr_attestations
 (id, tenant_id, entity_id, subject_type, subject_id, employee_id, attestation_kind, attested_by, attested_role,
  signature_method, signed_digest, created_by)
VALUES
 ('12e11001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'EVENT','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02','99999999-9999-9999-9999-999999999901','CUSTODIAN_ATTEST','custodian.rao','SR_CUSTODIAN',
  'PKI_QUALIFIED','aa07bb08cc09dd10ee11ff12aa13bb14cc15dd16ee17ff18aa19bb20cc21dd22',NULL),
 ('12e11001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'EVENT','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','99999999-9999-9999-9999-999999999901','EMPLOYEE_VERIFY','emp.rao','EMPLOYEE',
  'OTP_CONFIRMED','bb08cc09dd10ee11ff12aa13bb14cc15dd16ee17ff18aa19bb20cc21dd22ee23',NULL);

-- E12 sr_verification_cycles --
INSERT INTO sr_verification_cycles
 (id, tenant_id, entity_id, employee_id, cycle_type, period_from, period_to, due_date, status,
  events_in_scope, events_confirmed, created_by)
VALUES
 ('12e12001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','PERIODIC_5YR','2019-04-01','2024-03-31','2024-06-30','EMPLOYEE_REVIEW',2,1,NULL),
 ('12e12001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999902','PRE_RETIREMENT','1996-06-01','2026-06-30','2026-05-31','CUSTODIAN_REVIEW',1,1,NULL);

-- E23 sr_appeals --
INSERT INTO sr_appeals
 (id, tenant_id, entity_id, employee_id, target_event_id, source_dispute_id, appeal_reason, appellate_authority, status, created_by)
VALUES
 ('12e23001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','12e10001-0000-0000-0000-000000000002',
  'Custodian upheld the disputed entry; appellant escalates.','Director (Appeals)','UNDER_APPEAL',NULL);

-- E14 sr_certified_extracts (before §65B cert; cert references it) --
-- A G13 document for the signed extract PDF.
INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, status, created_by)
VALUES ('12d0c001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
        'SR-EXT-2026-000451','Certified SR Extract - Anjali Rao','ACTIVE',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO sr_certified_extracts
 (id, tenant_id, entity_id, extract_no, employee_id, scope, event_count, content_digest, redaction_policy,
  document_id, signature_attestation_id, anchor_id, ltv_status, qr_verification_token, issued_to, purpose, created_by)
VALUES
 ('12e14001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'SR-EXT-2026-000451','99999999-9999-9999-9999-999999999901','FULL_SR',2,
  'cc09dd10ee11ff12aa13bb14cc15dd16ee17ff18aa19bb20cc21dd22ee23ff24','PENSION_FULL',
  '12d0c001-0000-0000-0000-000000000002','12e11001-0000-0000-0000-000000000001','12e20001-0000-0000-0000-000000000001',
  'LTV_APPLIED','QR-SR-2026-000451-7c4ab1','Pension processing (G11)','pension',NULL);

-- E24 sr_authenticity_certificates --
INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, status, created_by)
VALUES ('12d0c001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
        'SR-65B-2026-000451','§65B Certificate - Anjali Rao Extract','ACTIVE',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO sr_authenticity_certificates
 (id, tenant_id, entity_id, extract_id, certificate_no, statute_reference, content_digest, anchor_id,
  signer_identity, signing_certificate_serial, tsa_timestamp_token, chain_of_custody, system_description, document_id, created_by)
VALUES
 ('12e24001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '12e14001-0000-0000-0000-000000000001','SR-65B-2026-000451','Bharatiya Sakshya Adhiniyam 2023 s.63 / IT Act 2000 s.65B',
  'cc09dd10ee11ff12aa13bb14cc15dd16ee17ff18aa19bb20cc21dd22ee23ff24','12e20001-0000-0000-0000-000000000001',
  'SR Custodian (custodian.rao); cert serial 0x4F2A','0x4F2A','\x3082',
  '{"ingestion":"G01-APPT-100245","attestation":"custodian.rao","anchor_seq":1}',
  'Digital SR system, PostgreSQL ledger with per-employee hash chain and RFC 3161-anchored Merkle root.',
  '12d0c001-0000-0000-0000-000000000003',NULL);

-- Link extract -> §65B cert (deferred FK).
UPDATE sr_certified_extracts SET authenticity_certificate_id = '12e24001-0000-0000-0000-000000000001'
 WHERE id = '12e14001-0000-0000-0000-000000000001';

-- E25 sr_ltv_renewals --
INSERT INTO sr_ltv_renewals
 (id, tenant_id, entity_id, subject_type, subject_id, renewal_kind, prior_algorithm, new_algorithm,
  evidence_record_ref, tsa_timestamp_token, triggered_by, created_by)
VALUES
 ('12e25001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'EXTRACT','12e14001-0000-0000-0000-000000000001','LTV_INITIAL','SHA-256','SHA-256','ERS-2026-000451','\x3082','MANUAL',NULL),
 ('12e25001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,
  'ANCHOR','12e20001-0000-0000-0000-000000000001','ALGORITHM_MIGRATION','SHA-256','SHA-384','ERS-ANCHOR-0001','\x3082','ALGO_DEPRECATION',NULL);

-- E26 sr_bulk_corrigendum_batch --
INSERT INTO sr_bulk_corrigendum_batch
 (id, tenant_id, entity_id, batch_no, trigger_reference, reason_code, target_selector, target_count, sample_size,
  sample_approved_count, status, applied_count, created_by)
VALUES
 ('12e26001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'BULK-2026-PC7-001',
  '7th Pay Commission GO 2026/PC7/441','PAY_COMMISSION_REVISION','{"cadre":"ADMIN","date_range":["2016-01-01","2016-12-31"]}',
  14820,200,200,'APPLIED',14820,NULL),
 ('12e26001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BULK-2026-SEN-002',
  'Seniority re-fixation order REV/SEN/2026/12','SENIORITY_REFIXATION','{"cadre":"ADMIN"}',640,64,40,'SAMPLING_APPROVAL',0,NULL);

-- E13 sr_ingestion_requests --
INSERT INTO sr_ingestion_requests
 (id, tenant_id, entity_id, idempotency_key, source_module, source_reference_id, source_event_version, contract_version,
  event_type_code, employee_id, fact_key, request_payload, validation_result, semantic_dedup_result, created_event_id, created_by)
VALUES
 ('12e13001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'G06:G06-PROMO-77120:v1','G06','G06-PROMO-77120',1,'v1','PROMOTION','99999999-9999-9999-9999-999999999901',
  'EMP9901|CAT:PROMOTION|EFF:2019-06-01|POST:L10','{"order_no":"REV/PROMO/2019/881"}','ACCEPTED','NEW_FACT',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',NULL),
 ('12e13001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'G06:G06-PROMO-77120:v1-dup','G06','G06-PROMO-77120',1,'v1','PROMOTION','99999999-9999-9999-9999-999999999901',
  'EMP9901|CAT:PROMOTION|EFF:2019-06-01|POST:L10','{"order_no":"REV/PROMO/2019/881"}','DUPLICATE_NOOP','SEMANTIC_DUPLICATE',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',NULL);

-- E15 sr_access_log --
INSERT INTO sr_access_log
 (id, tenant_id, entity_id, employee_id, accessed_by, actor_role, action, purpose, correlation_id, created_by)
VALUES
 ('12e15001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','emp.rao','EMPLOYEE','VIEW_TIMELINE','Self','corr-12-0001',NULL),
 ('12e15001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','pension.officer','PENSION_OFFICER','ISSUE_EXTRACT','Pension processing','corr-12-0002',NULL);

-- E16 sr_subscriptions --
INSERT INTO sr_subscriptions
 (id, tenant_id, entity_id, subscriber_module, event_categories, delivery_mode, last_delivered_seq, status, created_by)
VALUES
 ('12e16001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'G11',
  '{PROMOTION,PAY,INCREMENT,LEAVE,SUSPENSION,SEPARATION}','PULL_FEED',2,'ACTIVE',NULL),
 ('12e16001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,'G06',
  '{PROMOTION,TRANSFER,POSTING}','PULL_FEED',2,'ACTIVE',NULL);

-- E17 sr_legacy_digitisation_batch + E18 record --
INSERT INTO sr_legacy_digitisation_batch
 (id, tenant_id, entity_id, batch_no, org_unit_id, cohort_description, record_count, status, verified_count, discrepancy_count, created_by)
VALUES
 ('12e17001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'LEG-2026-REVHQ-001','33333333-3333-3333-3333-333333333301','Retired before 2010, Revenue HQ',240,'RECONCILIATION',233,7,NULL);

INSERT INTO sr_legacy_digitisation_record
 (id, tenant_id, entity_id, batch_id, employee_id, service_no, page_ref, event_type_code, event_date,
  transcribed_payload, entry_operator, verifier, match_status, verification_status, confidence_status,
  corroboration_status, legacy_source_id, created_by)
VALUES
 ('12e18001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '12e17001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','GOV-088120','SB-12/p.7','ANNUAL_INCREMENT','1996-07-01',
  '{"increment_date":"1996-07-01","new_pay":"legible"}','op.entry','op.verify','MATCHED','VERIFIED','RECONSTRUCTED',
  'PENDING_EMPLOYEE','legbook:REVHQ:SB-12:p7',NULL),
 ('12e18001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '12e17001-0000-0000-0000-000000000001',NULL,'GOV-OLD-441','SB-12/p.9','PROMOTION',NULL,
  '{"note":"faded ink; post illegible"}','op.entry',NULL,'AMBIGUOUS','DISCREPANCY','LEGACY_UNVERIFIABLE',
  'UNCORROBORATED','legbook:REVHQ:SB-12:p9',NULL);

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 12-G12-digital-service-register.sql
-- =====================================================================================
