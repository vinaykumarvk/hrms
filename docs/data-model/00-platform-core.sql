-- =====================================================================================
-- GOVERNMENT HRMS — SHARED PLATFORM CORE SCHEMA (00-platform-core.sql)
-- =====================================================================================
-- Canonical, authoritative DDL for the tables every module (01-G01 .. 14-G14) FKs to.
-- PostgreSQL 14+. Single source of truth for tenancy, identity/RBAC, the employee
-- golden record, the workflow engine (P01), the dual audit log (P05), the document
-- vault (G13/P13), the Service Register ledger (G12), and the cross-cutting
-- infrastructure tables (notifications X.2, jobs X.1, integration_credentials P04/X.3,
-- migration_runs P06).
--
-- Grounded in:
--   docs/brd/PLATFORM_FOUNDATION.md        (tenancy, RBAC v1.7, P01-P06, audit, NFR)
--   docs/platform-grounding/extracts/*     (platform spec §4.14, foundation FS)
--   docs/brd/v3/G01-employee-profile-management.md   (employees E1, employee_dependents E4)
--   docs/brd/v3/G12-digital-service-register.md      (service_register_events E8)
--   docs/brd/v3/G13-document-management-secure-storage.md (documents E1, document_versions E2)
--   docs/brd/MODULE_RECONCILIATION.md §C/§D (platform-provided vs net-new entities)
--
-- =====================================================================================
-- BUILD NOTES (read before running or referencing from a module schema)
-- =====================================================================================
-- ORDERING. Run this file first; every module schema (01-G01 .. 14-G14) depends on it.
--   Sections are ordered so a referenced table is always created before its referrers:
--     0  Extensions
--     1  Enum types (CREATE TYPE ... AS ENUM)
--     2  Tenancy & org masters (tenants -> entities -> org_units -> cadres/designations/
--        grades/pay_scales -> geography/segment masters)
--     3  Identity & RBAC (users, roles, permissions, role_permissions, user_roles,
--        capability_flags, user_capability_flags, individual_entitlements, pii_tiers)
--     4  Employee golden record (employees, employee_dependents)        [G01 owner]
--     5  Workflow engine (workflows, workflow_instances, workflow_actions,
--        skip_settings, sla_settings)                                   [P01]
--     6  Audit & consent (audit_log, security_audit_log, consent_records) [P05/DPDPA]
--     7  Documents (documents, document_versions)                       [G13/P13 owner]
--     8  Service Register ledger (service_register_events)              [G12 owner]
--     9  Cross-cutting infra (notifications, jobs, integration_credentials, migration_runs)
--     10 Deferred cross-section FKs (forward references resolved via ALTER)
--     11 Row-Level Security (P02 data-scope mechanism) — enable + tenant policy template
--     12 Sample seed rows (tenants, employees, roles, service_register_events)
--
-- HOW MODULE SCHEMAS REFERENCE THIS FILE.
--   * Module tables FK to the canonical tables here by id (uuid). They MUST NOT redefine
--     tenants/entities/org_units/employees/documents/service_register_events/workflows/
--     audit_log/consent_records/notifications/jobs/integration_credentials/migration_runs
--     (MODULE_RECONCILIATION §C/§D). They reference; they never fork.
--   * Module schemas inherit the conventions fixed in the header below and summarised in
--     docs/data-model/CONVENTIONS.md.
--   * G01 OWNS the employee satellites (here we define only employees + employee_dependents,
--     the two other modules FK to). G12 OWNS service_register_events and its sub-ledgers
--     (here we define only the core ledger columns other writers reference; sr_status_events,
--     sr_anchors, sr_event_type, etc. live in 12-G12). G13 OWNS the full document model
--     (here we define documents + document_versions core columns; storage_objects, folders,
--     retention, legal holds, clearances live in 13-G13).
--
-- =====================================================================================
-- CONVENTIONS (authoritative — module schemas inherit these; see CONVENTIONS.md)
-- =====================================================================================
--  1. PRIMARY KEYS. Every table: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
--     Human/business keys (service_no, doc_no, order_no, case_no, workflow_code, ...) are
--     SEPARATE columns with their own UNIQUE constraint (scoped by tenant where relevant).
--     EXCEPTIONS: append-only ledgers keep their domain-named PK (sr_event_id, log_id) for
--     fidelity with the owning module BRD, still uuid + gen_random_uuid().
--  2. TENANCY (Platform §0.1). Every business table carries `tenant_id uuid NOT NULL
--     REFERENCES tenants(id)`. Entity-scoped tables also carry `entity_id uuid REFERENCES
--     entities(id)`. Scoping is enforced at the DATA layer via RLS (Section 11), never only
--     in app code. A query without a resolvable tenant scope is REJECTED, not defaulted to all.
--  3. TIMESTAMPS/AUDIT COLUMNS. Every business table: `created_at/updated_at timestamptz
--     NOT NULL DEFAULT now()`, `created_by/updated_by uuid` (logical ref to users(id); FK
--     intentionally omitted so audit history survives user removal and to avoid bootstrap
--     ordering coupling). `is_deleted boolean NOT NULL DEFAULT false` (soft delete only —
--     no hard delete, per NFR). EXCEPTION: append-only ledgers (audit_log, security_audit_log,
--     service_register_events) carry only created_at/created_by — NO updated_at, NO is_deleted.
--  4. ENUMS. UPPER_SNAKE_CASE values. Platform-wide CLOSED enumerations use Postgres
--     `CREATE TYPE ... AS ENUM` (Section 1). Tenant-CONFIGURABLE value sets (designation,
--     cadre, geography, segment, document_type) are MASTER TABLES with `text` codes + a
--     UNIQUE(tenant_id, *_code) constraint and VAL-ENUM/VAL-MASTER-UNIQUE validation — NOT
--     Postgres enums (so a tenant can extend them without a DDL migration).
--  5. INDEXES. Every FK column is indexed. Common query columns (tenant_id, entity_id,
--     status, *_date, business keys) are indexed. Business keys carry UNIQUE constraints.
--  6. FOREIGN KEYS. Explicit, with deliberate ON DELETE behaviour:
--       tenant_id/entity_id            -> ON DELETE RESTRICT (tenants are never hard-deleted)
--       master refs (cadre/designation) -> ON DELETE RESTRICT
--       self/hierarchy (org parent, reporting manager) -> ON DELETE RESTRICT / SET NULL
--       owner refs that may legitimately vanish -> ON DELETE SET NULL
--  7. RLS (Section 11). RLS is ENABLED on every tenant-scoped business table with a tenant
--     isolation policy (the P02 data-scope substrate). Platform Super Admin cross-tenant and
--     Org Admin cross-entity reach are widened scope filters, never bypasses.
-- =====================================================================================

-- =====================================================================================
-- RECON (CSV field reconciliation) — Organisation masters area
-- =====================================================================================
-- Ground-truth Darwinbox CSV exports under
--   docs/HRMS Deliverables to Development Phase/DwnB Form Fields/Organisation/
-- were reconciled against Section 2 (org masters). Gap report + per-CSV mapping:
--   docs/data-model/reconciliation/organisation-masters.md
--
-- ADDED by this reconciliation (ADD-only; nothing existing was changed or removed):
--   * enum separation_type (Deactivation_Reasons: Voluntary/Involuntary)
--   * designations.effective_from            (Designation_Names "Effective From")
--   * grades.band_id / grades.band_code       (Grade "Band Name"/"Band Code")
--   * org_units.business_unit_code, .performance_hod_employee_id,
--     .functional_head_employee_id, .head_hr_employee_id, .group_hr_head_employee_id
--                                             (Department HOD/Functional-Head/Head-HR/…)
--   * new masters: bands, regions, locations, weekly_off_patterns,
--     notice_period_policies, probation_policies, separation_reasons, contribution_levels
--   * RLS + deferred employee/self FKs for the above (Sections 10 & 11)
-- Value lists (528 designations, 57 separation reasons, …) are NOT inlined — the CSVs
-- are the migration seed source; only 2-3 sample rows appear in Section 12.
-- Excluded here: National_ID (owned by G01), Profile_View_settings (UI/masking config),
-- Assignment One/Two/Three (custom grouping configs, not platform-core org masters).
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — EXTENSIONS
-- =====================================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
-- gen_random_uuid() is built in on PG13+; pgcrypto guarantees availability on PG<13 too.


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (platform-wide closed enumerations)
-- =====================================================================================

-- Tenancy / org -----------------------------------------------------------------------
CREATE TYPE tenancy_model      AS ENUM ('STANDALONE', 'GROUP_COMPANY', 'MULTI_TENANT');
CREATE TYPE tenant_status      AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE entity_status      AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED', 'DISSOLVED');
CREATE TYPE org_unit_type      AS ENUM ('DIRECTORATE', 'DEPARTMENT', 'DIVISION', 'SECTION', 'OFFICE', 'UNIT');
CREATE TYPE geo_type           AS ENUM ('COUNTRY', 'STATE', 'DISTRICT', 'TALUK', 'CITY', 'ZONE');
CREATE TYPE separation_type    AS ENUM ('VOLUNTARY', 'INVOLUNTARY');   -- RECON: Deactivation_Reasons

-- Identity / RBAC ---------------------------------------------------------------------
CREATE TYPE user_status        AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'DISABLED', 'DELETED');
CREATE TYPE auth_method        AS ENUM ('PASSWORD', 'GOOGLE_SSO', 'SAML', 'SERVICE_PRINCIPAL');
CREATE TYPE scope_dimension    AS ENUM ('REPORTING_CHAIN', 'ORG_UNIT', 'UAG', 'CONTRIBUTION_LEVEL', 'ENTITY', 'GLOBAL');
CREATE TYPE entitlement_status AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- Employee master ---------------------------------------------------------------------
CREATE TYPE record_state       AS ENUM ('PROVISIONAL', 'ACTIVE', 'ARCHIVED', 'PURGE_PENDING');
CREATE TYPE employment_status  AS ENUM ('ACTIVE','ON_LEAVE','SUSPENDED','TRANSFERRED','RETIRED','RESIGNED','DECEASED','TERMINATED');
CREATE TYPE employment_type    AS ENUM ('PERMANENT','CONTRACT','DEPUTATION','TEMPORARY','CONSULTANT','PROBATION');
CREATE TYPE gender             AS ENUM ('MALE','FEMALE','OTHER','UNDISCLOSED');
CREATE TYPE marital_status     AS ENUM ('SINGLE','MARRIED','DIVORCED','WIDOWED','SEPARATED','OTHER');
CREATE TYPE social_category    AS ENUM ('GEN','OBC','SC','ST','EWS');
CREATE TYPE dependent_relationship AS ENUM ('SPOUSE','SON','DAUGHTER','FATHER','MOTHER','BROTHER','SISTER','GUARDIAN','OTHER');

-- Workflow (P01) ----------------------------------------------------------------------
CREATE TYPE workflow_pattern         AS ENUM ('SEQUENTIAL','PARALLEL_ALL_OF','PARALLEL_ANY_OF','CONDITIONAL','DYNAMIC_APPROVER');
CREATE TYPE workflow_def_status      AS ENUM ('DRAFT','ACTIVE','DEPRECATED');
CREATE TYPE workflow_instance_status AS ENUM ('RUNNING','APPROVED','REJECTED','SENT_BACK','CANCELLED','ESCALATED','COMPLETED');
CREATE TYPE workflow_action_type     AS ENUM ('START','ADVANCE','APPROVE','REJECT','SEND_BACK','DELEGATE','CANCEL','ESCALATE');
CREATE TYPE approver_resolution      AS ENUM ('NAMED_ROLE','REPORTING_CHAIN','NAMED_INDIVIDUAL','COST_CENTRE_HEAD');

-- Audit (P05) / consent ---------------------------------------------------------------
CREATE TYPE audit_operation     AS ENUM ('INSERT','UPDATE','SOFT_DELETE','REDACT');
CREATE TYPE security_event_type AS ENUM ('LOGIN','LOGOUT','LOGIN_FAILED','MFA_CHALLENGE','RBAC_CHANGE',
                                          'PERMISSION_DENIED','IMPERSONATION','BREAK_GLASS','TOKEN_ROTATION','SESSION_REVOKED');
CREATE TYPE consent_status      AS ENUM ('GRANTED','WITHDRAWN','SUPERSEDED');

-- Documents (G13/P13) -----------------------------------------------------------------
CREATE TYPE classification_level AS ENUM ('PUBLIC','INTERNAL','CONFIDENTIAL','SECRET','TOP_SECRET');
CREATE TYPE document_status      AS ENUM ('DRAFT','ACTIVE','SUPERSEDED','ORPHANED','DISPOSED','QUARANTINED');
CREATE TYPE scan_status          AS ENUM ('PENDING','CLEAN','INFECTED','QUARANTINED','SKIPPED');
CREATE TYPE source_channel       AS ENUM ('WEB_UPLOAD','BULK','SCANNER','MOBILE','API','SYSTEM_GENERATED');
CREATE TYPE erasure_method       AS ENUM ('NONE','REDACTED','CRYPTO_SHRED','ANONYMISED');
CREATE TYPE version_kind         AS ENUM ('ORIGINAL','NEW_VERSION','SUPERSEDE','CERTIFIED_COPY','REDACTED','SIGNED');
CREATE TYPE ocr_status           AS ENUM ('PENDING','DONE','FAILED','NOT_APPLICABLE');

-- Service Register ledger (G12) -------------------------------------------------------
CREATE TYPE sr_event_category      AS ENUM ('APPOINTMENT','CONFIRMATION','PROMOTION','TRANSFER','POSTING','PAY','INCREMENT',
                                            'LEAVE','TRAINING','AWARD','PUNISHMENT','SUSPENSION','DEPUTATION','IDENTITY',
                                            'QUALIFICATION','APPRAISAL','SEPARATION','OTHER');  -- 18 categories (§5.5)
CREATE TYPE sr_entry_status        AS ENUM ('ACTIVE','SUPERSEDED','ANNOTATED');
CREATE TYPE sr_attestation_status  AS ENUM ('UNATTESTED','ATTESTED','EMPLOYEE_VERIFIED','DISPUTED');
CREATE TYPE sr_confidence_status   AS ENUM ('VERIFIED','RECONSTRUCTED','LEGACY_UNVERIFIABLE');
CREATE TYPE sr_qualifying_impact   AS ENUM ('QUALIFYING','NON_QUALIFYING','PARTIAL','NOT_APPLICABLE');
CREATE TYPE sr_chain_origin        AS ENUM ('GENESIS','CONTINUED');

-- Cross-cutting infra -----------------------------------------------------------------
CREATE TYPE notification_channel  AS ENUM ('IN_APP','EMAIL','SMS');
CREATE TYPE notification_status   AS ENUM ('PENDING','SENT','DELIVERED','READ','FAILED','DEAD_LETTER');
CREATE TYPE job_run_status        AS ENUM ('SCHEDULED','RUNNING','SUCCEEDED','FAILED','RETRYING','DEAD_LETTER','SKIPPED');
CREATE TYPE migration_run_status  AS ENUM ('CREATED','EXTRACTING','VALIDATING','TRANSFORMING','LOADING','VERIFYING',
                                           'COMPLETED','FAILED','ROLLED_BACK');


-- =====================================================================================
-- SECTION 2 — TENANCY & ORGANISATION MASTERS
-- =====================================================================================

-- tenants -----------------------------------------------------------------------------
-- The tenant is the root scope. The government deployment is typically one tenant; each
-- department/directorate is an `entity`. (Platform §0.1; PLATFORM_FOUNDATION §2)
CREATE TABLE tenants (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code        text NOT NULL,                 -- business key, e.g. 'GOV-KA'
    legal_name         text NOT NULL,
    display_name       text NOT NULL,
    tenancy_model      tenancy_model NOT NULL DEFAULT 'STANDALONE',
    status             tenant_status NOT NULL DEFAULT 'PROVISIONING',
    segment_code       text,                          -- immutable post-provisioning (P04)
    primary_geo_code   text,                          -- default geography
    default_locale     text NOT NULL DEFAULT 'en-IN',
    default_timezone   text NOT NULL DEFAULT 'Asia/Kolkata',
    provisioned_at     timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_tenants_code UNIQUE (tenant_code)
);
COMMENT ON TABLE tenants IS 'Root tenant scope (P04). Every business table FKs tenant_id here.';

-- segment_master ----------------------------------------------------------------------
-- Business/geography segment used by the config cascade (platform->tenant->entity->employee).
CREATE TABLE segment_master (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    segment_code  text NOT NULL,
    name          text NOT NULL,
    description    text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_segment_code UNIQUE (tenant_id, segment_code)   -- VAL-MASTER-UNIQUE
);

-- geo_master (hierarchical geography) -------------------------------------------------
CREATE TABLE geo_master (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    geo_code       text NOT NULL,
    geo_type       geo_type NOT NULL,
    name           text NOT NULL,
    parent_geo_id  uuid REFERENCES geo_master(id) ON DELETE RESTRICT,  -- hierarchy
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_geo_code UNIQUE (tenant_id, geo_code)
);
CREATE INDEX ix_geo_master_tenant       ON geo_master(tenant_id);
CREATE INDEX ix_geo_master_parent       ON geo_master(parent_geo_id);

-- entities (legal entities / directorates) --------------------------------------------
CREATE TABLE entities (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_code        text NOT NULL,                 -- business key
    legal_name         text NOT NULL,
    display_name       text NOT NULL,
    entity_type        text,                          -- e.g. DIRECTORATE / SECRETARIAT
    status             entity_status NOT NULL DEFAULT 'ACTIVE',
    primary_geo_id     uuid REFERENCES geo_master(id) ON DELETE RESTRICT,
    parent_entity_id   uuid REFERENCES entities(id) ON DELETE RESTRICT,  -- group-company
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_entities_code UNIQUE (tenant_id, entity_code)
);
CREATE INDEX ix_entities_tenant ON entities(tenant_id);
CREATE INDEX ix_entities_parent ON entities(parent_entity_id);
CREATE INDEX ix_entities_geo    ON entities(primary_geo_id);

-- org_units (hierarchical organisation structure) -------------------------------------
CREATE TABLE org_units (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    org_unit_code      text NOT NULL,                 -- business key
    name               text NOT NULL,
    org_unit_type      org_unit_type NOT NULL DEFAULT 'DEPARTMENT',
    parent_org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,  -- VAL-ORG-NOCYCLE
    business_unit_code text,                          -- RECON: Department "Business Unit Code"
    head_employee_id   uuid,                          -- HOD; FK added in Section 10 (employees)
    performance_hod_employee_id  uuid,                -- RECON: Department "Performance HOD"; FK in Section 10
    functional_head_employee_id  uuid,                -- RECON: Department "Functional Head"; FK in Section 10
    head_hr_employee_id          uuid,                -- RECON: Department "Head HR"; FK in Section 10
    group_hr_head_employee_id    uuid,                -- RECON: Department "Group HR Head"; FK in Section 10
    cost_centre_code   text,
    depth_level        smallint NOT NULL DEFAULT 0,
    path               text,                          -- materialised path for subtree queries
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_org_units_code UNIQUE (tenant_id, org_unit_code)
);
CREATE INDEX ix_org_units_tenant ON org_units(tenant_id);
CREATE INDEX ix_org_units_entity ON org_units(entity_id);
CREATE INDEX ix_org_units_parent ON org_units(parent_org_unit_id);
CREATE INDEX ix_org_units_head   ON org_units(head_employee_id);
CREATE INDEX ix_org_units_perf_hod   ON org_units(performance_hod_employee_id);
CREATE INDEX ix_org_units_func_head  ON org_units(functional_head_employee_id);
CREATE INDEX ix_org_units_head_hr    ON org_units(head_hr_employee_id);
CREATE INDEX ix_org_units_grp_hr     ON org_units(group_hr_head_employee_id);

-- cadres ------------------------------------------------------------------------------
CREATE TABLE cadres (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    cadre_code   text NOT NULL,
    name         text NOT NULL,
    description  text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_cadres_code UNIQUE (tenant_id, cadre_code)
);
CREATE INDEX ix_cadres_tenant ON cadres(tenant_id);

-- grades (pay band / level) -----------------------------------------------------------
CREATE TABLE grades (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    grade_code   text NOT NULL,
    name         text NOT NULL,
    level_order  smallint NOT NULL,                   -- seniority ordering within tenant
    pay_band     text,                                -- e.g. 'PB-3' (govt pay-band label; distinct from Band master)
    band_id      uuid,                                -- RECON: Grade "Band Name" -> bands.id (FK added below, after bands)
    band_code    text,                                -- RECON: Grade "Band Code" (denormalised)
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_grades_code  UNIQUE (tenant_id, grade_code),
    CONSTRAINT uq_grades_level UNIQUE (tenant_id, level_order)
);
CREATE INDEX ix_grades_tenant ON grades(tenant_id);

-- pay_scales --------------------------------------------------------------------------
CREATE TABLE pay_scales (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    pay_scale_code    text NOT NULL,
    name              text NOT NULL,
    grade_id          uuid REFERENCES grades(id) ON DELETE RESTRICT,   -- VAL-GRADE-BAND
    min_basic         numeric(14,2),
    max_basic         numeric(14,2),
    increment_amount  numeric(14,2),
    currency          char(3) NOT NULL DEFAULT 'INR',
    pay_commission    text,                            -- e.g. '7CPC'
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pay_scales_code UNIQUE (tenant_id, pay_scale_code),
    CONSTRAINT ck_pay_scales_band CHECK (max_basic IS NULL OR min_basic IS NULL OR max_basic >= min_basic)
);
CREATE INDEX ix_pay_scales_tenant ON pay_scales(tenant_id);
CREATE INDEX ix_pay_scales_grade  ON pay_scales(grade_id);

-- designations ------------------------------------------------------------------------
CREATE TABLE designations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    designation_code text NOT NULL,
    name            text NOT NULL,
    cadre_id        uuid REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_id        uuid REFERENCES grades(id) ON DELETE RESTRICT,
    effective_from  date,                             -- RECON: Designation_Names "Effective From" (effective-dating)
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_designations_code UNIQUE (tenant_id, designation_code)
);
CREATE INDEX ix_designations_tenant    ON designations(tenant_id);
CREATE INDEX ix_designations_cadre     ON designations(cadre_id);
CREATE INDEX ix_designations_grade     ON designations(grade_id);
CREATE INDEX ix_designations_effective ON designations(effective_from);


-- =====================================================================================
-- SECTION 2b — ORGANISATION MASTERS EXTENSION (CSV field reconciliation)
-- =====================================================================================
-- Net-new tenant-configurable org masters surfaced by the Darwinbox Organisation exports
-- (see docs/data-model/reconciliation/organisation-masters.md). All follow CONVENTIONS:
-- uuid PK, tenant_id, audit cols, is_deleted, tenant-scoped UNIQUE business key, indexed
-- FKs, and RLS applied in Section 11. Value lists are seeded from the CSVs (migration
-- source), not inlined here.

-- bands (Grade "Band" master; grades.band_id FKs here) --------------------------------
-- Source CSV: Band-Export.csv (header-only export) + Grade-Export.csv Band Name/Code.
CREATE TABLE bands (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    band_code    text NOT NULL,
    name         text NOT NULL,
    description  text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_bands_code UNIQUE (tenant_id, band_code)   -- VAL-MASTER-UNIQUE
);
CREATE INDEX ix_bands_tenant ON bands(tenant_id);

-- Resolve grades.band_id -> bands (bands created after grades to avoid reorder churn).
ALTER TABLE grades
    ADD CONSTRAINT fk_grades_band FOREIGN KEY (band_id) REFERENCES bands(id) ON DELETE RESTRICT;
CREATE INDEX ix_grades_band ON grades(band_id);

-- regions (Location-Region master; groups states) -------------------------------------
-- Source CSV: Location-Region-Export.csv (Region Name / Region Code / States). Member
-- states are seeded from geo_master(STATE); the region<->state mapping is config, not a
-- column here. region_code is nullable (several export rows have no code) -> unique key
-- on name within tenant.
CREATE TABLE regions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    region_code  text,
    name         text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_regions_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_regions_tenant ON regions(tenant_id);

-- locations (physical office / work-location master) ----------------------------------
-- Source CSV: Location-Export.csv. geo_master models the COUNTRY/STATE/CITY hierarchy;
-- this is the concrete office master with full postal address, contacts and heads.
-- Country-specific SSO/payroll fields (Thailand SSO branch) are policy config, not
-- modelled here (see reconciliation report). location_code = Darwinbox "Work Area Code".
CREATE TABLE locations (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid REFERENCES entities(id) ON DELETE RESTRICT,   -- Company
    location_code             text NOT NULL,                    -- Work Area Code (business key)
    name                      text NOT NULL,                    -- Office Area / Location Area
    address                   text,                             -- Office Address
    office_email              text,
    mobile_number             text,
    telephone_number          text,
    pincode                   text,
    city                      text,                             -- Office City
    state                     text,                             -- Office State
    country                   text,                             -- Office Country
    city_code                 text,
    state_code                text,
    country_code              text,
    city_geo_id               uuid REFERENCES geo_master(id) ON DELETE SET NULL,  -- optional geo link
    region_id                 uuid REFERENCES regions(id) ON DELETE SET NULL,
    parent_location_id        uuid REFERENCES locations(id) ON DELETE RESTRICT,   -- Parent Location
    location_type             text,                             -- Location Type
    city_type                 text,                             -- City Type
    centre_type               text,                             -- Centre Type
    location_head_employee_id uuid,                             -- FK added in Section 10 (employees)
    is_registered_office      boolean NOT NULL DEFAULT false,   -- Registered Office (Yes/No)
    is_active                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_locations_code UNIQUE (tenant_id, location_code)
);
CREATE INDEX ix_locations_tenant   ON locations(tenant_id);
CREATE INDEX ix_locations_entity   ON locations(entity_id);
CREATE INDEX ix_locations_city_geo ON locations(city_geo_id);
CREATE INDEX ix_locations_region   ON locations(region_id);
CREATE INDEX ix_locations_parent   ON locations(parent_location_id);
CREATE INDEX ix_locations_head     ON locations(location_head_employee_id);

-- weekly_off_patterns (Weekly Off master) ---------------------------------------------
-- Source CSV: Weekly_Off-Export.csv. No code column in the export -> name is the key.
CREATE TABLE weekly_off_patterns (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    weekly_off_code  text,
    name             text NOT NULL,                   -- Weekly Off Name
    description      text,
    non_working_days text,                            -- e.g. 'All Saturday, All Sunday'
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_weekly_off_patterns_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_weekly_off_patterns_tenant ON weekly_off_patterns(tenant_id);

-- notice_period_policies (Notice master) ----------------------------------------------
-- Source CSV: Notice-Export.csv. Duration data is columnised; the ~12 Yes/No behaviour
-- toggles (consider weekly offs/holidays/unpaid leave, calculate-from-resignation, etc.)
-- are policy config captured in rule_config (jsonb), not query dimensions.
CREATE TABLE notice_period_policies (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    notice_code              text,
    name                     text NOT NULL,           -- Notice Name
    applicable_for           text,
    nationality_applicability text,
    confirmation_days        smallint,
    confirmation_months      smallint,
    probation_days           smallint,
    probation_months         smallint,
    contract_days            smallint,
    contract_months          smallint,
    tenure_based             boolean NOT NULL DEFAULT false,
    rule_config              jsonb,                   -- behaviour toggles (see reconciliation report)
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_notice_period_policies_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_notice_period_policies_tenant ON notice_period_policies(tenant_id);

-- probation_policies (Probation master) -----------------------------------------------
-- Source CSV: Probation-Export.csv.
CREATE TABLE probation_policies (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    probation_code           text,
    name                     text NOT NULL,           -- Probation Name
    period_days              smallint,                -- Set Probation Period In (Days)
    period_months            smallint,                -- Set Probation Period In (Months)
    duration_months          smallint,                -- Duration of Probation
    show_in_extension        boolean NOT NULL DEFAULT false,
    extend_confirmation_auto boolean NOT NULL DEFAULT false,
    start_from_assigned_date boolean NOT NULL DEFAULT false,
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_probation_policies_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_probation_policies_tenant ON probation_policies(tenant_id);

-- separation_reasons (Deactivation Reasons master) ------------------------------------
-- Source CSV: Deactivation_Reasons-Export_1_.csv. The configurable pick-list behind the
-- free-text employees.separation_reason on the golden record.
CREATE TABLE separation_reasons (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    separation_type separation_type NOT NULL,         -- VOLUNTARY / INVOLUNTARY
    reason          text NOT NULL,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_separation_reasons UNIQUE (tenant_id, separation_type, reason)
);
CREATE INDEX ix_separation_reasons_tenant ON separation_reasons(tenant_id);

-- contribution_levels (Neev-Level master; RBAC CONTRIBUTION_LEVEL scope dimension) -----
-- Source CSV: Neev-Level-Export_1_.csv (Darwinbox "Neev Level" == Contribution Level).
CREATE TABLE contribution_levels (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    level_code   text NOT NULL,
    name         text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_contribution_levels_code UNIQUE (tenant_id, level_code)
);
CREATE INDEX ix_contribution_levels_tenant ON contribution_levels(tenant_id);


-- =====================================================================================
-- SECTION 3 — IDENTITY & RBAC (model owned by RBAC v1.7; enforced by P02)
-- =====================================================================================

-- pii_tiers (PLATFORM-GLOBAL REFERENCE — exempt from tenant scoping & RLS) -------------
-- The PII Protection Ceiling reference (RBAC §3.9/§6/§7, Appendix B). Closed reference
-- data shared by all tenants; no tenant_id, no soft delete.
CREATE TABLE pii_tiers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_code    text NOT NULL UNIQUE,               -- TIER_1 / TIER_2 / TIER_3 / NON_PII
    name         text NOT NULL,
    description  text,
    is_ceiling   boolean NOT NULL DEFAULT false,     -- TIER_1 ceiling overrides everything upward
    sort_order   smallint NOT NULL DEFAULT 0
);
COMMENT ON TABLE pii_tiers IS 'Platform-global PII tier reference (RBAC §7). No tenant scoping; no RLS.';

-- permissions (PLATFORM-GLOBAL CATALOG — exempt from tenant scoping & RLS) -------------
-- Action permissions catalog (module.action). Roles (per tenant) grant these.
CREATE TABLE permissions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code  text NOT NULL UNIQUE,            -- e.g. 'document.view', 'leave.approve'
    module_code      text NOT NULL,                   -- G01..G14 / platform
    action           text NOT NULL,                   -- VIEW/EDIT/APPROVE/DOWNLOAD/ADMIN
    description      text,
    pii_tier_id      uuid REFERENCES pii_tiers(id) ON DELETE RESTRICT,  -- field-access tier hint
    is_active        boolean NOT NULL DEFAULT true
);
CREATE INDEX ix_permissions_module ON permissions(module_code);

-- users -------------------------------------------------------------------------------
-- Authentication principal (P02/P04). 1:1 with an employee where the user is staff;
-- service principals (source-module machine identities) have no employee.
CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    username           text NOT NULL,
    official_email     text,                          -- tenant-unique, immutable (G01 note)
    password_hash      text,                          -- one-way hashed; null for SSO/service
    auth_method        auth_method NOT NULL DEFAULT 'PASSWORD',
    status             user_status NOT NULL DEFAULT 'PENDING',
    is_service_principal boolean NOT NULL DEFAULT false,
    mfa_enabled        boolean NOT NULL DEFAULT false,
    force_password_change boolean NOT NULL DEFAULT false,
    last_login_at      timestamptz,
    locked_until       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_users_username UNIQUE (tenant_id, username)
);
-- Tenant-unique official email across non-deleted rows (G01 §5.6 r17).
CREATE UNIQUE INDEX uq_users_email ON users(tenant_id, lower(official_email)) WHERE is_deleted = false AND official_email IS NOT NULL;
CREATE INDEX ix_users_tenant ON users(tenant_id);
CREATE INDEX ix_users_entity ON users(entity_id);
CREATE INDEX ix_users_status ON users(status);

-- roles -------------------------------------------------------------------------------
-- RBAC v1.7 role taxonomy (platform + entity-scoped operational + gov additions).
CREATE TABLE roles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role_code     text NOT NULL,                       -- e.g. 'hr_admin', 'sr_custodian'
    name          text NOT NULL,
    description   text,
    is_platform_role boolean NOT NULL DEFAULT false,   -- platform_super_admin / org_admin
    is_system_seeded boolean NOT NULL DEFAULT false,
    scope_default scope_dimension NOT NULL DEFAULT 'ENTITY',
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_roles_code UNIQUE (tenant_id, role_code)
);
CREATE INDEX ix_roles_tenant ON roles(tenant_id);

-- role_permissions --------------------------------------------------------------------
CREATE TABLE role_permissions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role_id        uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id  uuid NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
    scope_dimension scope_dimension NOT NULL DEFAULT 'ENTITY',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_role_permissions UNIQUE (role_id, permission_id)
);
CREATE INDEX ix_role_permissions_tenant ON role_permissions(tenant_id);
CREATE INDEX ix_role_permissions_role   ON role_permissions(role_id);
CREATE INDEX ix_role_permissions_perm   ON role_permissions(permission_id);

-- user_roles --------------------------------------------------------------------------
-- Role assignment with optional data-scope binding (the five scoping dimensions).
CREATE TABLE user_roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    scope_dimension scope_dimension NOT NULL DEFAULT 'ENTITY',
    scope_org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,  -- when scoped to a dept subtree
    granted_by      uuid,
    granted_at      timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_user_roles UNIQUE (user_id, role_id, scope_dimension, scope_org_unit_id)
);
CREATE INDEX ix_user_roles_tenant   ON user_roles(tenant_id);
CREATE INDEX ix_user_roles_user     ON user_roles(user_id);
CREATE INDEX ix_user_roles_role     ON user_roles(role_id);
CREATE INDEX ix_user_roles_orgunit  ON user_roles(scope_org_unit_id);

-- capability_flags (catalog of grantable flags, RBAC §4.3) -----------------------------
CREATE TABLE capability_flags (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    flag_code      text NOT NULL,                      -- e.g. 'BGV_REVIEW','SR_LEGACY_PROMOTE'
    name           text NOT NULL,
    description    text,
    grant_authority text,                              -- who may grant (e.g. 'org_admin')
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_capability_flags_code UNIQUE (tenant_id, flag_code)
);
CREATE INDEX ix_capability_flags_tenant ON capability_flags(tenant_id);

-- user_capability_flags (grant of a capability flag to a user) ------------------------
CREATE TABLE user_capability_flags (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability_flag_id  uuid NOT NULL REFERENCES capability_flags(id) ON DELETE RESTRICT,
    granted_by          uuid,
    granted_at          timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_user_capability_flags UNIQUE (user_id, capability_flag_id)
);
CREATE INDEX ix_user_capability_flags_tenant ON user_capability_flags(tenant_id);
CREATE INDEX ix_user_capability_flags_user   ON user_capability_flags(user_id);
CREATE INDEX ix_user_capability_flags_flag   ON user_capability_flags(capability_flag_id);

-- individual_entitlements (time-bound, mandatory-expiry, auto-revoked; RBAC §3.2) -----
CREATE TABLE individual_entitlements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id   uuid REFERENCES permissions(id) ON DELETE RESTRICT,
    resource_ref    text,                              -- optional case/record scoping
    scope_dimension scope_dimension NOT NULL DEFAULT 'GLOBAL',
    reason          text NOT NULL,                     -- VAL-COMMENT / ERR-REASON-REQ
    status          entitlement_status NOT NULL DEFAULT 'ACTIVE',
    valid_from      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,              -- MANDATORY expiry (RBAC §3.2)
    approved_by     uuid,                              -- Org-Admin-approved
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_entitlement_window CHECK (expires_at > valid_from)
);
CREATE INDEX ix_individual_entitlements_tenant  ON individual_entitlements(tenant_id);
CREATE INDEX ix_individual_entitlements_user    ON individual_entitlements(user_id);
CREATE INDEX ix_individual_entitlements_perm    ON individual_entitlements(permission_id);
CREATE INDEX ix_individual_entitlements_expiry  ON individual_entitlements(expires_at) WHERE status = 'ACTIVE';


-- =====================================================================================
-- SECTION 4 — EMPLOYEE GOLDEN RECORD (owned by G01; reconciled with G01 E1/E4)
-- =====================================================================================
-- Core master only. G01 module schema (01-G01) ADDS the governance satellites
-- (attribute-history spine, aadhaar_vault, identity docs, bank, education, positions,
-- job assignments, nominees, etc.). Master FKs are NULLABLE to support the PROVISIONAL
-- migration profile (G01 improvement #11): constraints harden as a row is remediated to
-- record_state = ACTIVE.

CREATE TABLE employees (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- == G01 employee_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id) ON DELETE RESTRICT,
    service_no            varchar(20) NOT NULL,                  -- human business key (golden)
    user_id               uuid REFERENCES users(id) ON DELETE SET NULL,  -- login 1:1
    salutation            text,
    first_name            varchar(80) NOT NULL,
    middle_name           varchar(80),
    last_name             varchar(80),                            -- nullable (mononym support)
    has_single_legal_name boolean NOT NULL DEFAULT false,
    display_name          varchar(160) NOT NULL,
    preferred_name        varchar(80),
    name_local            varchar(160),                           -- official local script
    dob                   date,                                   -- PII; relaxed in PROVISIONAL
    gender                gender,
    marital_status        marital_status,
    blood_group           varchar(4),
    nationality           varchar(40) NOT NULL DEFAULT 'INDIAN',
    religion              varchar(40),                            -- sensitive PII (DPDP)
    category              social_category,                        -- GEN/OBC/SC/ST/EWS
    is_differently_abled  boolean NOT NULL DEFAULT false,
    disability_type       varchar(40),
    aadhaar_ref_key       varchar(64),                            -- vault reference only (no raw number)
    aadhaar_masked        varchar(20),                            -- display XXXX-XXXX-1234
    pan                   varchar(10),                            -- VAL-PAN; conditional
    date_of_joining       date,                                   -- relaxed in PROVISIONAL
    group_date_of_joining date,
    confirmation_date     date,
    cadre_id              uuid REFERENCES cadres(id) ON DELETE RESTRICT,
    designation_id        uuid REFERENCES designations(id) ON DELETE RESTRICT,  -- current cache
    grade_id              uuid REFERENCES grades(id) ON DELETE RESTRICT,
    pay_scale_id          uuid REFERENCES pay_scales(id) ON DELETE RESTRICT,    -- current cache
    org_unit_id           uuid REFERENCES org_units(id) ON DELETE RESTRICT,     -- current placement
    employment_type       employment_type,
    employment_status     employment_status NOT NULL DEFAULT 'ACTIVE',
    record_state          record_state NOT NULL DEFAULT 'ACTIVE',  -- PROVISIONAL/ACTIVE/ARCHIVED/PURGE_PENDING
    reporting_manager_id  uuid REFERENCES employees(id) ON DELETE SET NULL,  -- row-scope anchor
    previous_employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,  -- rehire link
    primary_photo_id      uuid,                                   -- FK to G01 employee_photos (module schema)
    profile_completeness_pct numeric(5,2) DEFAULT 0,              -- advisory
    data_quality_flag     varchar(16) DEFAULT 'CLEAN',            -- advisory; no pay gate
    separation_date       date,
    separation_reason     varchar(40),
    source_system         varchar(40),                            -- migrated records
    legacy_id             varchar(40),                            -- P06 migration cross-ref
    row_version           integer NOT NULL DEFAULT 1,             -- optimistic lock / etag
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employees_service_no UNIQUE (tenant_id, service_no),
    -- Statutory floors enforced only once the row is ACTIVE (migration glide path):
    CONSTRAINT ck_employees_dob_active   CHECK (record_state <> 'ACTIVE' OR dob IS NOT NULL),
    CONSTRAINT ck_employees_doj_active   CHECK (record_state <> 'ACTIVE' OR date_of_joining IS NOT NULL),
    CONSTRAINT ck_employees_pan_format   CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')  -- VAL-PAN
);
CREATE INDEX ix_employees_tenant        ON employees(tenant_id);
CREATE INDEX ix_employees_entity        ON employees(entity_id);
CREATE INDEX ix_employees_user          ON employees(user_id);
CREATE INDEX ix_employees_org_unit      ON employees(org_unit_id);
CREATE INDEX ix_employees_cadre         ON employees(cadre_id);
CREATE INDEX ix_employees_designation   ON employees(designation_id);
CREATE INDEX ix_employees_grade         ON employees(grade_id);
CREATE INDEX ix_employees_pay_scale     ON employees(pay_scale_id);
CREATE INDEX ix_employees_manager       ON employees(reporting_manager_id);
CREATE INDEX ix_employees_status        ON employees(employment_status);
CREATE INDEX ix_employees_record_state  ON employees(record_state);
CREATE INDEX ix_employees_legacy_id     ON employees(legacy_id);

-- employee_dependents (G01-owned satellite; G03/G11 reference read-only — D5) ----------
CREATE TABLE employee_dependents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- == G01 dependent_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    full_name           varchar(160) NOT NULL,
    relationship        dependent_relationship NOT NULL,
    dob                 date,
    gender              gender,
    is_dependent        boolean NOT NULL DEFAULT true,
    is_minor            boolean,                                  -- derived from dob
    is_differently_abled boolean NOT NULL DEFAULT false,
    is_legal_heir       boolean NOT NULL DEFAULT false,           -- succession (FR-024)
    heir_succession_rank smallint,                                -- family-pension order
    national_id_masked  varchar(20),                              -- masked, no raw
    proof_document_id   uuid,                                     -- FK -> documents (added Section 10)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_employee_dependents_tenant   ON employee_dependents(tenant_id);
CREATE INDEX ix_employee_dependents_employee ON employee_dependents(employee_id);
CREATE INDEX ix_employee_dependents_doc      ON employee_dependents(proof_document_id);


-- =====================================================================================
-- SECTION 5 — WORKFLOW ENGINE (P01) — one engine drives all approval processes
-- =====================================================================================

-- workflows (definition; versioned; deprecation not deletion) --------------------------
CREATE TABLE workflows (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    workflow_code      text NOT NULL,                  -- e.g. 'WF-G12-CORRIGENDUM'
    version            integer NOT NULL DEFAULT 1,
    name               text NOT NULL,
    pattern            workflow_pattern NOT NULL DEFAULT 'SEQUENTIAL',
    status             workflow_def_status NOT NULL DEFAULT 'DRAFT',
    stages_definition  jsonb NOT NULL,                 -- ordered stages, assignee rules, actions
    sla_definition     jsonb,                          -- per-stage SLA timers
    config_level       text NOT NULL DEFAULT 'TENANT', -- cascade: PLATFORM/TENANT/ENTITY/EMPLOYEE
    activated_at       timestamptz,
    deprecated_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_workflows_code_version UNIQUE (tenant_id, workflow_code, version)
);
CREATE INDEX ix_workflows_tenant ON workflows(tenant_id);
CREATE INDEX ix_workflows_code   ON workflows(tenant_id, workflow_code);
CREATE INDEX ix_workflows_status ON workflows(status);

-- workflow_instances (pins the definition version it began on) -------------------------
CREATE TABLE workflow_instances (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    workflow_id        uuid NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,  -- pinned version
    workflow_code      text NOT NULL,
    pinned_version     integer NOT NULL,               -- in-flight version pinning
    subject_ref        text NOT NULL,                  -- table:id of the subject record
    subject_employee_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
    status             workflow_instance_status NOT NULL DEFAULT 'RUNNING',
    current_stage      text,
    current_assignees  jsonb,                          -- resolved assignee set
    context            jsonb,                          -- instance context for CONDITIONAL/DYNAMIC
    idempotency_key    text,                           -- dedup of workflow-initiating POSTs (24h)
    correlation_id     text,                           -- X-Correlation-Id
    initiated_by       uuid,
    started_at         timestamptz NOT NULL DEFAULT now(),
    completed_at       timestamptz,
    sla_due_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    -- ERR-DUP-INSTANCE: a duplicate workflow start within the idempotency window conflicts.
    CONSTRAINT uq_workflow_instances_idem UNIQUE (tenant_id, workflow_code, idempotency_key)
);
CREATE INDEX ix_workflow_instances_tenant   ON workflow_instances(tenant_id);
CREATE INDEX ix_workflow_instances_workflow ON workflow_instances(workflow_id);
CREATE INDEX ix_workflow_instances_subject  ON workflow_instances(subject_ref);
CREATE INDEX ix_workflow_instances_emp      ON workflow_instances(subject_employee_id);
CREATE INDEX ix_workflow_instances_status   ON workflow_instances(status);
CREATE INDEX ix_workflow_instances_sla      ON workflow_instances(sla_due_at) WHERE status = 'RUNNING';

-- workflow_actions (one row per action; idempotent) ------------------------------------
CREATE TABLE workflow_actions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    instance_id        uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    stage              text NOT NULL,
    action_type        workflow_action_type NOT NULL,
    actor_user_id      uuid,                            -- logical ref to users(id)
    actor_role_code    text,
    decision_comment   text,                            -- VAL-COMMENT (reason where mandatory)
    delegated_to       uuid,
    idempotency_key    text,                            -- a retried approve -> one row, not two
    correlation_id     text,
    acted_at           timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_workflow_actions_idem UNIQUE (instance_id, action_type, idempotency_key)
);
CREATE INDEX ix_workflow_actions_tenant   ON workflow_actions(tenant_id);
CREATE INDEX ix_workflow_actions_instance ON workflow_actions(instance_id);
CREATE INDEX ix_workflow_actions_actor    ON workflow_actions(actor_user_id);

-- skip_settings (skip-condition subject/rule; reassign-to-role; §4.14.12) --------------
CREATE TABLE skip_settings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    workflow_id     uuid REFERENCES workflows(id) ON DELETE CASCADE,
    setting_code    text NOT NULL,
    skip_subject    text NOT NULL,                      -- what is evaluated
    skip_rule       jsonb NOT NULL,                     -- predicate resolved at stage entry
    reassign_to_role text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_skip_settings_code UNIQUE (tenant_id, setting_code)
);
CREATE INDEX ix_skip_settings_tenant   ON skip_settings(tenant_id);
CREATE INDEX ix_skip_settings_workflow ON skip_settings(workflow_id);

-- sla_settings (SLA level, trigger, duration, breach output, escalation) ---------------
CREATE TABLE sla_settings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    workflow_id         uuid REFERENCES workflows(id) ON DELETE CASCADE,
    setting_code        text NOT NULL,
    sla_level           text NOT NULL,
    trigger_when        text NOT NULL DEFAULT 'AFTER',  -- BEFORE / AFTER stage entry
    duration_minutes    integer NOT NULL,
    breach_output       text,                           -- DELEGATE / AUTO_ACT / ESCALATE
    delegate_to_roles   text[],
    cancel_dependent_stages boolean NOT NULL DEFAULT false,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sla_settings_code UNIQUE (tenant_id, setting_code),
    CONSTRAINT ck_sla_duration CHECK (duration_minutes > 0)
);
CREATE INDEX ix_sla_settings_tenant   ON sla_settings(tenant_id);
CREATE INDEX ix_sla_settings_workflow ON sla_settings(workflow_id);


-- =====================================================================================
-- SECTION 6 — AUDIT & COMPLIANCE (P05) + CONSENT (DPDPA)
-- =====================================================================================
-- APPEND-ONLY. audit_log/security_audit_log are written by DB triggers on every business
-- table (capture mechanics live in the platform trigger package, not here). No UPDATE/
-- DELETE; the ONLY permitted mutation is the DPDPA right-to-erasure redaction marker on
-- old_value (operation = 'REDACT'). PII is stored MASKED. No is_deleted; no updated_at.

CREATE TABLE audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- log_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid,
    table_name      text NOT NULL,
    record_id       uuid NOT NULL,
    operation       audit_operation NOT NULL,
    actor_user_id   uuid,                               -- logical ref; no FK (must survive user removal)
    actor_role_code text,
    old_value       jsonb,                              -- MASKED PII; redaction marker target
    new_value       jsonb,                              -- MASKED PII
    changed_columns text[],
    correlation_id  text,                               -- X-Correlation-Id (every log line)
    redacted_at     timestamptz,                        -- set only on DPDPA erasure redaction
    redaction_ref   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid
);
CREATE INDEX ix_audit_log_tenant     ON audit_log(tenant_id);
CREATE INDEX ix_audit_log_record     ON audit_log(table_name, record_id);
CREATE INDEX ix_audit_log_actor      ON audit_log(actor_user_id);
CREATE INDEX ix_audit_log_created    ON audit_log(created_at);
CREATE INDEX ix_audit_log_correlation ON audit_log(correlation_id);
COMMENT ON TABLE audit_log IS 'P05 immutable data-mutation log. Append-only; grant no UPDATE/DELETE to app roles. Sole mutation = DPDPA redaction marker on old_value.';

CREATE TABLE security_audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid,
    event_type      security_event_type NOT NULL,
    actor_user_id   uuid,
    target_user_id  uuid,                               -- for RBAC_CHANGE/impersonation
    resource_ref    text,
    outcome         text,                               -- SUCCESS / DENIED / ERROR
    ip_address      inet,
    user_agent      text,
    detail          jsonb,
    correlation_id  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid
);
CREATE INDEX ix_security_audit_tenant ON security_audit_log(tenant_id);
CREATE INDEX ix_security_audit_actor  ON security_audit_log(actor_user_id);
CREATE INDEX ix_security_audit_event  ON security_audit_log(event_type);
CREATE INDEX ix_security_audit_created ON security_audit_log(created_at);
COMMENT ON TABLE security_audit_log IS 'P05 immutable auth/permission/admin event log. Append-only.';

-- consent_records (DPDPA; immutable — superseded, never deleted) ------------------------
CREATE TABLE consent_records (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id        uuid REFERENCES employees(id) ON DELETE RESTRICT,
    data_principal_user_id uuid,                        -- logical ref to users(id)
    purpose_code       text NOT NULL,                   -- processing purpose
    consent_status     consent_status NOT NULL,         -- GRANTED/WITHDRAWN/SUPERSEDED
    legal_basis        text,                            -- e.g. 'STATUTORY_OBLIGATION' (DPDP §17)
    consent_text_ref   text,                            -- versioned notice id
    granted_at         timestamptz,
    withdrawn_at       timestamptz,
    supersedes_id      uuid REFERENCES consent_records(id) ON DELETE RESTRICT,
    correlation_id     text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
    -- Immutable: superseded by a new row, never updated/deleted. No updated_at/is_deleted.
);
CREATE INDEX ix_consent_records_tenant   ON consent_records(tenant_id);
CREATE INDEX ix_consent_records_employee ON consent_records(employee_id);
CREATE INDEX ix_consent_records_purpose  ON consent_records(purpose_code);
CREATE INDEX ix_consent_records_status   ON consent_records(consent_status);


-- =====================================================================================
-- SECTION 7 — DOCUMENTS (G13/P13 owner) — core vault columns other modules FK to
-- =====================================================================================
-- Core columns only. The full G13 model (storage_objects, folders, retention_policies,
-- legal_holds, security_clearances, signatures, dlp_findings, audit anchors) lives in
-- 13-G13. Other modules attach via document_id and store only the reference.

CREATE TABLE documents (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- == G13 document_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id) ON DELETE RESTRICT,
    doc_no                 varchar(40) NOT NULL,                  -- human key DOC/2026/0001234
    title                  varchar(255) NOT NULL,
    description            text,
    document_type_id       uuid,                                  -- FK -> G13 document_types (module schema)
    folder_id              uuid,                                  -- FK -> G13 folders (module schema)
    owner_employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
    owning_org_unit_id     uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    current_version_id     uuid,                                  -- FK -> document_versions (added Section 10)
    current_version_no     integer NOT NULL DEFAULT 1,
    classification         classification_level NOT NULL DEFAULT 'INTERNAL',  -- gov EXTENSION
    security_domain        varchar(40) NOT NULL DEFAULT 'DEFAULT',            -- key/dedup boundary
    status                 document_status NOT NULL DEFAULT 'ACTIVE',
    link_count             integer NOT NULL DEFAULT 0,            -- 0 -> orphan candidate
    mime_type              varchar(120),
    size_bytes             bigint,
    content_hash           char(64),                             -- SHA-256 of current version
    is_sealed              boolean NOT NULL DEFAULT false,        -- hidden from subject (gov)
    is_worm                boolean NOT NULL DEFAULT false,        -- immutable statutory storage (gov)
    is_record_declared     boolean NOT NULL DEFAULT false,
    legal_hold_count       integer NOT NULL DEFAULT 0,            -- >0 -> disposition blocked
    retention_assignment_id uuid,                                 -- FK -> G13 retention (module schema)
    disposition_due_date   date,
    anchor_confirmed       boolean NOT NULL DEFAULT false,
    source_channel         source_channel NOT NULL DEFAULT 'WEB_UPLOAD',
    scan_status            scan_status NOT NULL DEFAULT 'PENDING',
    language_code          varchar(8),
    dpdp_erasure_state     erasure_method,                       -- set on DPDP request resolve
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,        -- blocked while WORM/legal-hold
    CONSTRAINT uq_documents_doc_no UNIQUE (tenant_id, doc_no)
);
CREATE INDEX ix_documents_tenant       ON documents(tenant_id);
CREATE INDEX ix_documents_entity       ON documents(entity_id);
CREATE INDEX ix_documents_owner        ON documents(owner_employee_id);
CREATE INDEX ix_documents_org_unit     ON documents(owning_org_unit_id);
CREATE INDEX ix_documents_type         ON documents(document_type_id);
CREATE INDEX ix_documents_status       ON documents(status);
CREATE INDEX ix_documents_classification ON documents(classification);
CREATE INDEX ix_documents_content_hash ON documents(security_domain, content_hash);  -- domain-scoped dedup

CREATE TABLE document_versions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- == G13 version_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    document_id            uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_no             integer NOT NULL,                      -- 1-based, monotonic
    storage_object_id      uuid,                                  -- FK -> G13 storage_objects (module schema)
    mime_type              varchar(120),
    size_bytes             bigint,
    content_hash           char(64),                              -- SHA-256 of this version
    change_summary         varchar(500),
    version_kind           version_kind NOT NULL DEFAULT 'ORIGINAL',
    is_supersede           boolean NOT NULL DEFAULT false,
    superseded_version_id  uuid REFERENCES document_versions(id) ON DELETE RESTRICT,
    derived_from_version_id uuid REFERENCES document_versions(id) ON DELETE RESTRICT,
    ocr_status             ocr_status NOT NULL DEFAULT 'PENDING',
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,                                  -- append-only version history
    CONSTRAINT uq_document_versions UNIQUE (document_id, version_no)
);
CREATE INDEX ix_document_versions_tenant   ON document_versions(tenant_id);
CREATE INDEX ix_document_versions_document ON document_versions(document_id);
CREATE INDEX ix_document_versions_storage  ON document_versions(storage_object_id);


-- =====================================================================================
-- SECTION 8 — SERVICE REGISTER LEDGER (G12 owner) — APPEND-ONLY, HASH-CHAINED
-- =====================================================================================
-- Net-new statutory system-of-record (NOT a platform primitive). Built on the P05
-- substrate. Core ledger columns only — the sub-ledgers (sr_status_events, sr_anchors,
-- sr_event_type, sr_corrections, sr_certified_extracts, ...) live in 12-G12. The
-- canonical writer set (G01/G04/G05/G06/G08/G09/G10/G11) posts via G12's ingestion
-- contract; no module mutates this table directly.
--
-- APPEND-ONLY: no UPDATE of content fields, no DELETE, no is_deleted, no updated_at.
-- Status-bearing fields (entry_status, attestation_status, superseded_by_event_id) are
-- DERIVED PROJECTIONS materialised from sr_status_events (12-G12) in the same transaction;
-- entry_hash EXCLUDES them so status changes never break the content chain.

CREATE TABLE service_register_events (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- sr_event_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    service_no              varchar(32) NOT NULL,                  -- denormalised (golden in G01)
    sequence_no             bigint NOT NULL,                       -- monotonic per (tenant,employee)
    event_type_code         varchar(48) NOT NULL,                  -- FK -> G12 sr_event_type (module schema)
    event_category          sr_event_category NOT NULL,
    event_title             varchar(200) NOT NULL,
    event_description       text,
    event_date              date NOT NULL,                         -- legal effective date (no time)
    recorded_at             timestamptz NOT NULL DEFAULT now(),    -- commit time (UTC)
    tsa_timestamp_token     bytea,                                 -- RFC 3161 token over entry_hash
    tsa_authority           varchar(120),                          -- TSA identity / policy OID
    fact_key                varchar(96),                           -- semantic per-fact correlation key
    source_module           varchar(16) NOT NULL,                  -- G01..G14 / G12_MANUAL / G12_LEGACY
    source_reference_id     varchar(64),                           -- originating order/transaction id
    source_event_version    integer NOT NULL DEFAULT 1,
    reverses_event_id       uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    order_no                varchar(64),
    order_date              date,
    sanctioning_authority   varchar(160),
    payload                 jsonb NOT NULL,                        -- schema-validated event data
    qualifying_service_impact sr_qualifying_impact NOT NULL DEFAULT 'NOT_APPLICABLE',
    confidence_status       sr_confidence_status NOT NULL DEFAULT 'VERIFIED',
    entry_status            sr_entry_status NOT NULL DEFAULT 'ACTIVE',         -- derived projection
    attestation_status      sr_attestation_status NOT NULL DEFAULT 'UNATTESTED', -- derived projection
    supersedes_event_id     uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    superseded_by_event_id  uuid REFERENCES service_register_events(id) ON DELETE RESTRICT, -- derived projection
    chain_origin            sr_chain_origin NOT NULL DEFAULT 'GENESIS',
    prior_chain_head_hash   char(64),                              -- CONTINUED chain genesis ref
    prev_event_hash         char(64) NOT NULL,                     -- SHA-256 of previous entry
    entry_hash              char(64) NOT NULL,                     -- SHA-256(content || prev_event_hash)
    hash_algorithm          varchar(16) NOT NULL DEFAULT 'SHA-256',
    ledger_version          integer NOT NULL DEFAULT 1,
    document_ids            uuid[],                                -- supporting docs (G13)
    ingestion_request_id    uuid,                                  -- FK -> G12 sr_ingestion_requests (module)
    is_legacy               boolean NOT NULL DEFAULT false,
    legacy_batch_id         uuid,                                  -- FK -> G12 sr_legacy_digitisation_batch
    legacy_source_id        varchar(80),                           -- permanent migration traceability/dedup
    posted_by               varchar(64) NOT NULL,                  -- service principal or custodian
    created_at              timestamptz NOT NULL DEFAULT now(),    -- append timestamp; NO updated_at/is_deleted
    created_by              varchar(64) NOT NULL,
    -- Gap-free monotonic page number per employee chain:
    CONSTRAINT uq_sr_sequence UNIQUE (tenant_id, employee_id, sequence_no),
    -- Per-employee chain integrity: entry_hash unique within the chain:
    CONSTRAINT uq_sr_entry_hash UNIQUE (tenant_id, employee_id, entry_hash),
    -- Syntactic idempotency / dedup tuple (source-driven):
    CONSTRAINT uq_sr_source_dedup UNIQUE (tenant_id, source_module, source_reference_id, source_event_version),
    CONSTRAINT ck_sr_hash_len  CHECK (length(entry_hash) = 64 AND length(prev_event_hash) = 64)
);
CREATE INDEX ix_sr_events_tenant       ON service_register_events(tenant_id);
CREATE INDEX ix_sr_events_entity       ON service_register_events(entity_id);
CREATE INDEX ix_sr_events_employee     ON service_register_events(tenant_id, employee_id, sequence_no);
CREATE INDEX ix_sr_events_service_no   ON service_register_events(tenant_id, service_no);
CREATE INDEX ix_sr_events_category     ON service_register_events(event_category);
CREATE INDEX ix_sr_events_event_type   ON service_register_events(event_type_code);
CREATE INDEX ix_sr_events_event_date   ON service_register_events(event_date);
CREATE INDEX ix_sr_events_fact_key     ON service_register_events(tenant_id, fact_key) WHERE fact_key IS NOT NULL;
CREATE INDEX ix_sr_events_source       ON service_register_events(source_module, source_reference_id);
CREATE INDEX ix_sr_events_entry_status ON service_register_events(entry_status);
-- Semantic per-fact uniqueness for qualifying-service-bearing events (prevents double-count):
CREATE UNIQUE INDEX uq_sr_fact_key_qualifying
    ON service_register_events(tenant_id, employee_id, fact_key)
    WHERE fact_key IS NOT NULL AND qualifying_service_impact IN ('QUALIFYING','PARTIAL') AND entry_status = 'ACTIVE';
COMMENT ON TABLE service_register_events IS 'G12 statutory SR ledger. Append-only, hash-chained per (tenant_id, employee_id). No UPDATE of content / no DELETE — enforce via DB grants + trigger in 12-G12.';


-- =====================================================================================
-- SECTION 9 — CROSS-CUTTING INFRASTRUCTURE (notifications X.2, jobs X.1, P04, P06)
-- =====================================================================================

-- notifications (X.2) -----------------------------------------------------------------
CREATE TABLE notifications (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    recipient_user_id  uuid REFERENCES users(id) ON DELETE CASCADE,
    recipient_employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
    message_id         text NOT NULL,                   -- MSG-* template id (Foundation §5)
    channel            notification_channel NOT NULL,
    status             notification_status NOT NULL DEFAULT 'PENDING',
    subject            text,
    body_merge_fields  jsonb,                           -- typed merge fields {like_this}
    is_statutory       boolean NOT NULL DEFAULT false,  -- mandatory/non-suppressible (X.2/§9.9)
    related_ref        text,                            -- table:id of triggering record
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    retry_count        integer NOT NULL DEFAULT 0,      -- backoff up to 5 + DLQ
    sent_at            timestamptz,
    delivered_at       timestamptz,
    read_at            timestamptz,
    failed_reason      text,
    correlation_id     text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_notifications_tenant    ON notifications(tenant_id);
CREATE INDEX ix_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX ix_notifications_emp       ON notifications(recipient_employee_id);
CREATE INDEX ix_notifications_status    ON notifications(status);
CREATE INDEX ix_notifications_message   ON notifications(message_id);
CREATE INDEX ix_notifications_unread    ON notifications(recipient_user_id) WHERE read_at IS NULL AND channel = 'IN_APP';

-- jobs (X.1) — scheduled-job run ledger ------------------------------------------------
CREATE TABLE jobs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    job_id             text NOT NULL,                   -- registered id, e.g. 'JOB-G12-ANCHOR'
    run_key            text NOT NULL,                   -- per-period idempotency key
    schedule_cron      text,
    status             job_run_status NOT NULL DEFAULT 'SCHEDULED',
    scheduled_for      timestamptz,
    started_at         timestamptz,
    finished_at        timestamptz,
    rows_affected      bigint,
    attempt            integer NOT NULL DEFAULT 1,      -- retry w/ backoff x3
    max_attempts       integer NOT NULL DEFAULT 3,
    outcome_detail     jsonb,
    error_message      text,                            -- terminal failure -> JOB-FAIL/MSG-SYS-JOBFAIL
    correlation_id     text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_jobs_run_key UNIQUE (tenant_id, job_id, run_key)   -- per-period run key (idempotent)
);
CREATE INDEX ix_jobs_tenant   ON jobs(tenant_id);
CREATE INDEX ix_jobs_job_id   ON jobs(job_id);
CREATE INDEX ix_jobs_status   ON jobs(status);
CREATE INDEX ix_jobs_scheduled ON jobs(scheduled_for) WHERE status IN ('SCHEDULED','RETRYING');

-- integration_credentials (P04/X.3) — encrypted, per-integration scoped ----------------
CREATE TABLE integration_credentials (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    integration_code   text NOT NULL,                   -- e.g. 'TREASURY','TSA','CA','KMS'
    name               text NOT NULL,
    credential_type    text NOT NULL,                   -- OAUTH2 / API_KEY / MTLS / CERT
    secret_ref         text NOT NULL,                   -- KMS/secret-manager reference (NEVER the secret)
    scope              text,                            -- per-integration scoping
    endpoint_url       text,
    rotation_due_at    timestamptz,
    last_rotated_at    timestamptz,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_integration_credentials UNIQUE (tenant_id, integration_code)
);
CREATE INDEX ix_integration_credentials_tenant ON integration_credentials(tenant_id);
COMMENT ON COLUMN integration_credentials.secret_ref IS 'Reference to a secret in KMS/secret-manager. The raw secret is NEVER stored in this column or anywhere in the DB.';

-- migration_runs (P06 ETL+V ledger) ----------------------------------------------------
CREATE TABLE migration_runs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    run_code           text NOT NULL,                   -- business key
    wave               text,                            -- Wave 1/2/3 (Appendix E)
    source_system      text NOT NULL,                   -- legacy register identity
    target_table       text NOT NULL,
    status             migration_run_status NOT NULL DEFAULT 'CREATED',
    is_dry_run         boolean NOT NULL DEFAULT true,   -- 3 mandatory staging dry runs gate cutover
    dry_run_seq        smallint,
    records_total      bigint,
    records_loaded     bigint,
    records_failed     bigint,
    reconciliation_status text,                          -- tolerance result
    failed_records_ref text,                             -- pointer to failed-record log (source row + rule)
    started_at         timestamptz,
    finished_at        timestamptz,
    correlation_id     text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_migration_runs_code UNIQUE (tenant_id, run_code)
);
CREATE INDEX ix_migration_runs_tenant ON migration_runs(tenant_id);
CREATE INDEX ix_migration_runs_status ON migration_runs(status);
CREATE INDEX ix_migration_runs_target ON migration_runs(target_table);


-- =====================================================================================
-- SECTION 10 — DEFERRED CROSS-SECTION FOREIGN KEYS (forward references)
-- =====================================================================================
-- Resolved here to avoid circular create-order coupling between sections.

-- org_units.head_employee_id -> employees
ALTER TABLE org_units
    ADD CONSTRAINT fk_org_units_head_employee
    FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- org_units department-head satellites -> employees (RECON: Department heads)
ALTER TABLE org_units
    ADD CONSTRAINT fk_org_units_perf_hod
    FOREIGN KEY (performance_hod_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE org_units
    ADD CONSTRAINT fk_org_units_func_head
    FOREIGN KEY (functional_head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE org_units
    ADD CONSTRAINT fk_org_units_head_hr
    FOREIGN KEY (head_hr_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE org_units
    ADD CONSTRAINT fk_org_units_grp_hr
    FOREIGN KEY (group_hr_head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- locations.location_head_employee_id -> employees (RECON: Location "Location Head")
ALTER TABLE locations
    ADD CONSTRAINT fk_locations_head_employee
    FOREIGN KEY (location_head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- employee_dependents.proof_document_id -> documents
ALTER TABLE employee_dependents
    ADD CONSTRAINT fk_employee_dependents_proof_doc
    FOREIGN KEY (proof_document_id) REFERENCES documents(id) ON DELETE SET NULL;

-- documents.current_version_id -> document_versions (deferrable: doc row precedes its version)
ALTER TABLE documents
    ADD CONSTRAINT fk_documents_current_version
    FOREIGN KEY (current_version_id) REFERENCES document_versions(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;


-- =====================================================================================
-- SECTION 11 — ROW-LEVEL SECURITY (P02 data-scope mechanism)
-- =====================================================================================
-- RLS is the platform's tenant-isolation substrate (Platform §0.1): a query without a
-- resolvable tenant scope is REJECTED, never defaulted to "all". The application connects
-- as a NON-SUPERUSER role and sets two GUCs per request from the validated session:
--     SET app.current_tenant_id   = '<tenant uuid>';
--     SET app.is_platform_admin   = 'true'|'false';   -- Platform Super Admin cross-tenant
-- (Org-Admin cross-ENTITY reach is a widened entity filter applied ABOVE RLS in P02, not a
--  bypass; field masking is applied on serialization by P02, also above the row filter.)
--
-- ------------------------------------------------------------------------------------
-- COMMENTED EXAMPLE — the canonical per-table tenant-isolation policy template that the
-- DO-block below applies to every tenant-scoped business table. Module-schema authors
-- (01-G01 .. 14-G14) MUST apply this same template to every new tenant-scoped table:
--
--   ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON <table>
--     USING (
--       tenant_id = current_setting('app.current_tenant_id', true)::uuid
--       OR current_setting('app.is_platform_admin', true) = 'true'
--     )
--     WITH CHECK (
--       tenant_id = current_setting('app.current_tenant_id', true)::uuid
--       OR current_setting('app.is_platform_admin', true) = 'true'
--     );
-- ------------------------------------------------------------------------------------

-- Apply the template to every tenant-scoped business table. (Platform-global reference
-- tables pii_tiers and permissions are intentionally EXCLUDED — they carry no tenant_id.)
DO $$
DECLARE
    t text;
    tenant_scoped_tables text[] := ARRAY[
        'segment_master','geo_master','entities','org_units','cadres','grades','pay_scales','designations',
        'bands','regions','locations','weekly_off_patterns','notice_period_policies','probation_policies',
        'separation_reasons','contribution_levels',
        'users','roles','role_permissions','user_roles','capability_flags','user_capability_flags',
        'individual_entitlements','employees','employee_dependents',
        'workflows','workflow_instances','workflow_actions','skip_settings','sla_settings',
        'audit_log','security_audit_log','consent_records',
        'documents','document_versions','service_register_events',
        'notifications','jobs','integration_credentials','migration_runs'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_scoped_tables LOOP
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

-- The tenants table itself is scoped by id (a tenant sees only its own row; platform admin
-- sees all).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_isolation ON tenants
    USING (
        id = current_setting('app.current_tenant_id', true)::uuid
        OR current_setting('app.is_platform_admin', true) = 'true'
    )
    WITH CHECK (
        current_setting('app.is_platform_admin', true) = 'true'   -- only platform admin writes tenants
    );


-- =====================================================================================
-- SECTION 12 — SAMPLE SEED ROWS (tenants, employees, roles, service_register_events)
-- =====================================================================================
-- Fixed UUIDs are used so referential rows line up. In a real run these are produced by
-- P04 provisioning. The session GUCs are set so the RLS WITH CHECK passes for the seed.

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- tenants -----------------------------------------------------------------------------
INSERT INTO tenants (id, tenant_code, legal_name, display_name, tenancy_model, status, segment_code, default_locale, default_timezone, provisioned_at)
VALUES
 ('11111111-1111-1111-1111-111111111111','GOV-STATE','State Government HRMS','State Government','GROUP_COMPANY','ACTIVE','GOVERNMENT','en-IN','Asia/Kolkata', now()),
 ('11111111-1111-1111-1111-111111111112','GOV-DEMO','Demo Directorate Sandbox','Demo Sandbox','STANDALONE','PROVISIONING','GOVERNMENT','en-IN','Asia/Kolkata', now());

-- entities ----------------------------------------------------------------------------
INSERT INTO entities (id, tenant_id, entity_code, legal_name, display_name, entity_type, status)
VALUES
 ('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111111','DIR-REV','Directorate of Revenue','Revenue Directorate','DIRECTORATE','ACTIVE'),
 ('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111111','DIR-EDU','Directorate of Education','Education Directorate','DIRECTORATE','ACTIVE');

-- org_units ---------------------------------------------------------------------------
INSERT INTO org_units (id, tenant_id, entity_id, org_unit_code, name, org_unit_type, depth_level)
VALUES
 ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REV-HQ','Revenue Headquarters','DIRECTORATE',0),
 ('33333333-3333-3333-3333-333333333302','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REV-ASSESS','Assessment Section','SECTION',1);

-- cadres / grades / pay_scales / designations -----------------------------------------
INSERT INTO cadres (id, tenant_id, cadre_code, name)
VALUES ('44444444-4444-4444-4444-444444444401','11111111-1111-1111-1111-111111111111','ADMIN','Administrative Service');

INSERT INTO grades (id, tenant_id, grade_code, name, level_order, pay_band)
VALUES ('55555555-5555-5555-5555-555555555501','11111111-1111-1111-1111-111111111111','L10','Level 10','10','PB-3');

INSERT INTO pay_scales (id, tenant_id, pay_scale_code, name, grade_id, min_basic, max_basic, increment_amount, pay_commission)
VALUES ('66666666-6666-6666-6666-666666666601','11111111-1111-1111-1111-111111111111','PS-L10','Level 10 Scale','55555555-5555-5555-5555-555555555501',56100,177500,1800,'7CPC');

INSERT INTO designations (id, tenant_id, designation_code, name, cadre_id, grade_id)
VALUES ('77777777-7777-7777-7777-777777777701','11111111-1111-1111-1111-111111111111','DC','Deputy Commissioner','44444444-4444-4444-4444-444444444401','55555555-5555-5555-5555-555555555501');

-- roles (RBAC v1.7 + gov additions) ----------------------------------------------------
INSERT INTO roles (id, tenant_id, role_code, name, is_platform_role, is_system_seeded, scope_default)
VALUES
 ('88888888-8888-8888-8888-888888888801','11111111-1111-1111-1111-111111111111','org_admin','Organisation Admin', true, true, 'ENTITY'),
 ('88888888-8888-8888-8888-888888888802','11111111-1111-1111-1111-111111111111','hr_admin','HR Administrator', false, true, 'ENTITY'),
 ('88888888-8888-8888-8888-888888888803','11111111-1111-1111-1111-111111111111','sr_custodian','SR Custodian / Registrar', false, true, 'ORG_UNIT');

-- employees (golden record) ------------------------------------------------------------
INSERT INTO employees (id, tenant_id, entity_id, service_no, first_name, last_name, display_name, dob, gender, category, date_of_joining, cadre_id, designation_id, grade_id, pay_scale_id, org_unit_id, employment_type, employment_status, record_state)
VALUES
 ('99999999-9999-9999-9999-999999999901','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','GOV-100245','Anjali','Rao','Anjali Rao','1985-03-12','FEMALE','GEN','2008-07-14','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','55555555-5555-5555-5555-555555555501','66666666-6666-6666-6666-666666666601','33333333-3333-3333-3333-333333333301','PERMANENT','ACTIVE','ACTIVE'),
 ('99999999-9999-9999-9999-999999999902','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','GOV-088120','Mohan','Kumar','Mohan Kumar','1972-11-30','MALE','OBC','1996-06-01','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','55555555-5555-5555-5555-555555555501','66666666-6666-6666-6666-666666666601','33333333-3333-3333-3333-333333333302','PERMANENT','ACTIVE','ACTIVE');

-- service_register_events (append-only, hash-chained per employee) ----------------------
-- Genesis entry (sequence_no = 1) uses prev_event_hash = literal 'GENESIS' padded to 64 chars.
INSERT INTO service_register_events
 (id, tenant_id, entity_id, employee_id, service_no, sequence_no, event_type_code, event_category, event_title,
  event_date, source_module, source_reference_id, source_event_version, payload, qualifying_service_impact,
  confidence_status, entry_status, attestation_status, chain_origin, prev_event_hash, entry_hash, posted_by, created_by)
VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','GOV-100245',1,'APPOINTMENT','APPOINTMENT','Initial appointment as Deputy Commissioner',
  '2008-07-14','G01','G01-APPT-100245',1,'{"order_no":"REV/APPT/2008/4421","designation":"Deputy Commissioner"}','QUALIFYING',
  'VERIFIED','ACTIVE','EMPLOYEE_VERIFIED','GENESIS','GENESIS000000000000000000000000000000000000000000000000000000000',
  '0a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff','svc:G01','svc:G01'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','GOV-100245',2,'PROMOTION','PROMOTION','Promotion w.e.f. 2019-06-01',
  '2019-06-01','G06','G06-PROMO-77120',1,'{"order_no":"REV/PROMO/2019/881","from":"L9","to":"L10"}','QUALIFYING',
  'VERIFIED','ACTIVE','ATTESTED','GENESIS','0a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff',
  '1f2e3d4c5b6a70819f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928','svc:G06','svc:G06');

-- consent_records (DPDPA) -------------------------------------------------------------
INSERT INTO consent_records (id, tenant_id, entity_id, employee_id, purpose_code, consent_status, legal_basis, granted_at)
VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','HR_PROCESSING','GRANTED','STATUTORY_OBLIGATION', now());

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 00-platform-core.sql
-- =====================================================================================
