-- =====================================================================================
-- GOVERNMENT HRMS — G01 EMPLOYEE PROFILE MANAGEMENT (MODULE SCHEMA)  01-G01-employee-profile.sql
-- =====================================================================================
-- G01-owned satellites that EXTEND the core employee golden record. Grounded in:
--   docs/brd/v3/G01-employee-profile-management.md  (Section 5: E2-E34, enum catalog,
--                                                    integrity rules, sample data)
--   docs/data-model/CONVENTIONS.md                  (mandatory conventions)
--   docs/data-model/00-platform-core.sql            (the canonical tables FK'd to here)
--
-- RECON (2026-07-01): reconciled against ground-truth exports — CustomFields-Export.csv,
--   National_ID-Export_1_.csv, Profile.docx. Gap report:
--   docs/data-model/reconciliation/g01-profile-fields.md. Additive-only deltas are in
--   SECTION 6 (RECON ADDITIONS) at the foot of this file: national_id_types config master,
--   employee_personal_details biographical satellite, custom_field_definitions extra
--   attributes + enum values, and employee_identity_documents type-master link. Nothing
--   above SECTION 6 was altered; core employees/employee_dependents are NOT redefined.
--
-- =====================================================================================
-- BUILD NOTES (READ BEFORE RUNNING)
-- =====================================================================================
-- ORDERING. **This file MUST be loaded AFTER 00-platform-core.sql.** It references core
--   tables by id (employees, employee_dependents, entities, org_units, designations,
--   cadres, pay_scales, documents, consent_records, users) and reuses core enum types
--   (employment_status, employment_type, gender, marital_status, social_category,
--   dependent_relationship, record_state). Loading it stand-alone WILL fail.
--
-- OWNERSHIP / NON-REDEFINITION.
--   * employees (E1) and employee_dependents (E4) are CORE-owned (Section 4 of the core,
--     "owned by G01" but physically defined there). This module DOES NOT redefine them;
--     it only adds satellites that FK to employees(id) and, where the core explicitly
--     deferred a forward FK into a module table, wires it back via ALTER (Section 3 below:
--     employees.aadhaar_ref_key -> aadhaar_vault, employees.primary_photo_id ->
--     employee_photos).
--   * consent_records (BRD E27) is CORE-owned (00-platform-core Section 6, DPDPA ledger).
--     This module DOES NOT redefine it — privacy_notices/data_principal_requests/
--     employee_photos reference the core consent_records(id). (See core-table assumptions
--     at the foot of this file.)
--
-- SCOPE — 36 module-owned tables (BRD's 35 physical tables minus the 3 core-owned,
-- plus PH-02 workflow-authority fixture substrates:
--   employees, employee_dependents, consent_records):
--     E2  employee_contacts            E3  employee_addresses
--     E5  employee_nominees            E6  employee_emergency_contacts
--     E7  employee_education           E8  employee_experience
--     E9  employee_identity_documents  E10 employee_bank_accounts
--     E11 employee_photos              E12 positions
--     E13 employee_job_assignments     E14 profile_sections
--     E15 custom_field_definitions     E16 employee_custom_field_values
--     E17 field_access_policies        E18 employee_profile_completeness
--     E19 dedup_candidates             E20a employee_import_batches
--     E20b import_staging_rows         E21 employee_id_aliases
--     E22 aadhaar_vault                E23 employee_attribute_history (append-only)
--     E24 position_history (append-only) E25 employee_certificates
--     E26 privacy_notices              E28 data_principal_requests
--     E29 breach_incidents             E30 retention_policies
--     E31 legal_holds                  E32 governed_field_change_requests
--     E33 outbox_events (append-only)  E34 break_glass_reveals (append-only)
--     PH02 g01_authority_assignments   PH02 g01_authority_delegations
--     PH02 g01_committees              PH02 g01_committee_members
--
-- CONVENTIONS (inherited from CONVENTIONS.md):
--   uuid PK default gen_random_uuid(); tenant_id NOT NULL + entity_id; standard audit
--   columns (created_at/updated_at/created_by/updated_by/is_deleted) + row_version on every
--   MUTABLE table; append-only ledgers carry ONLY created_at/created_by (no updated_at, no
--   is_deleted, no row_version); UPPER_SNAKE_CASE closed enums via CREATE TYPE; every FK is
--   explicit + indexed with a deliberate ON DELETE; RLS enabled with the tenant policy.
-- =====================================================================================


-- =====================================================================================
-- SECTION 0 — EXTENSIONS
-- =====================================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid() (already in core; idempotent)
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- GiST equality on uuid/text for EXCLUDE no-overlap constraints


-- =====================================================================================
-- SECTION 1 — MODULE ENUM TYPES (G01 closed enumerations; UPPER_SNAKE_CASE)
-- =====================================================================================
-- Reuses these CORE enums (NOT redefined here): employment_status, employment_type,
-- gender, marital_status, social_category, dependent_relationship, record_state.

CREATE TYPE g01_contact_type          AS ENUM ('MOBILE','ALT_MOBILE','PERSONAL_EMAIL','OFFICIAL_EMAIL','LANDLINE');
CREATE TYPE g01_field_visibility      AS ENUM ('PUBLIC','INTERNAL','RESTRICTED','PRIVATE');
CREATE TYPE g01_address_type          AS ENUM ('PERMANENT','PRESENT','MAILING','OVERSEAS');
CREATE TYPE g01_benefit_type          AS ENUM ('PF','GRATUITY','PENSION','INSURANCE','NPS','LEAVE_ENCASHMENT');
CREATE TYPE g01_qualification_level   AS ENUM ('SECONDARY','HIGHER_SECONDARY','DIPLOMA','UG','PG','DOCTORATE','CERTIFICATION');
CREATE TYPE g01_identity_doc_type     AS ENUM ('AADHAAR','PAN','PASSPORT','VOTER_ID','DRIVING_LICENSE','PRAN','RATION_CARD');
CREATE TYPE g01_bank_account_type     AS ENUM ('SAVINGS','CURRENT','SALARY');
CREATE TYPE g01_photo_type            AS ENUM ('PROFILE','ID_CARD','BIOMETRIC_REF');
CREATE TYPE g01_processing_purpose    AS ENUM ('IDENTITY_DISPLAY','BIOMETRIC_ATTENDANCE','PAYROLL','PENSION','DIRECTORY','ANALYTICS_AGGREGATE');
CREATE TYPE g01_photo_status          AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE g01_position_status       AS ENUM ('ACTIVE','FROZEN','ABOLISHED');
CREATE TYPE g01_position_change_reason AS ENUM ('CREATE','PAY_REVISION','RECLASSIFY','RESTRUCTURE','FREEZE','ABOLISH');
CREATE TYPE g01_assignment_type       AS ENUM ('SUBSTANTIVE','OFFICIATING','ADDITIONAL_CHARGE','DEPUTATION');
CREATE TYPE g01_assignment_reason     AS ENUM ('HIRE','PROMOTION','TRANSFER','REVERSION','RE_DESIGNATION','CORRECTION');
CREATE TYPE g01_attribute_change_reason AS ENUM ('HIRE','MARRIAGE','GAZETTE','COURT_ORDER','CORRECTION','GENDER_AFFIRMATION','MIGRATION');
CREATE TYPE g01_custom_field_type     AS ENUM ('TEXT','NUMBER','DATE','BOOLEAN','ENUM','DOCUMENT');
CREATE TYPE g01_field_access_level    AS ENUM ('FULL','MASKED','HIDDEN');
CREATE TYPE g01_dq_flag               AS ENUM ('CLEAN','REVIEW','NEEDS_ATTENTION');
CREATE TYPE g01_dedup_status          AS ENUM ('OPEN','MERGED','DISMISSED');
CREATE TYPE g01_validation_profile    AS ENUM ('STRICT','MIGRATION');
CREATE TYPE g01_import_status         AS ENUM ('UPLOADED','VALIDATING','VALIDATED','COMMITTING','COMMITTED','FAILED','ROLLED_BACK');
CREATE TYPE g01_row_status            AS ENUM ('VALID','PROVISIONAL','ERROR','COMMITTED','SKIPPED');
CREATE TYPE g01_aadhaar_lawful_basis  AS ENUM ('AUA_KUA','STATUTE','CONSENT');
CREATE TYPE g01_certificate_type      AS ENUM ('OBC_NON_CREAMY','EWS','SC','ST','PWD_UDID','DOMICILE');
CREATE TYPE g01_certificate_status    AS ENUM ('VALID','EXPIRED','REVOKED');
CREATE TYPE g01_dp_request_type       AS ENUM ('ACCESS','CORRECTION','ERASURE','EXPORT','NOMINATION','CONSENT_WITHDRAWAL','GRIEVANCE');
CREATE TYPE g01_dp_request_status     AS ENUM ('RECEIVED','IN_REVIEW','ACTIONED','REJECTED','ESCALATED','CLOSED');
CREATE TYPE g01_breach_severity       AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE g01_breach_status         AS ENUM ('OPEN','CONTAINED','NOTIFIED','CLOSED');
CREATE TYPE g01_retention_action      AS ENUM ('ARCHIVE','ANONYMISE','PURGE');
CREATE TYPE g01_hold_type             AS ENUM ('DISCIPLINARY','LITIGATION','PENSION','AUDIT','RTI');
CREATE TYPE g01_hold_status           AS ENUM ('ACTIVE','RELEASED');
CREATE TYPE g01_governed_change_status AS ENUM ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','APPLIED');
CREATE TYPE g01_authority_type        AS ENUM (
    'APPOINTING_AUTHORITY','TRANSFER_AUTHORITY','DISCIPLINARY_AUTHORITY','APPELLATE_AUTHORITY',
    'REVIEWING_AUTHORITY','ACCEPTING_AUTHORITY','PENSION_SANCTIONING_AUTHORITY',
    'PAYROLL_SANCTIONING_AUTHORITY','SR_CUSTODIAN','ORG_UNIT_HEAD'
);
CREATE TYPE g01_authority_scope       AS ENUM ('TENANT','ENTITY','ORG_UNIT','CADRE','DESIGNATION','EMPLOYEE');
CREATE TYPE g01_authority_status      AS ENUM ('ACTIVE','INACTIVE','SUSPENDED');
CREATE TYPE g01_delegation_kind       AS ENUM ('DELEGATION','ACTING_CHARGE','ADDITIONAL_CHARGE');
CREATE TYPE g01_delegation_status     AS ENUM ('ACTIVE','EXPIRED','REVOKED');
CREATE TYPE g01_committee_type        AS ENUM ('DPC','INQUIRY_COMMITTEE','POSH_ICC','SCREENING_COMMITTEE','TRANSFER_CLEARANCE');
CREATE TYPE g01_committee_status      AS ENUM ('CONSTITUTED','ACTIVE','CONCLUDED','EXPIRED','DISSOLVED');
CREATE TYPE g01_committee_member_role AS ENUM ('CHAIRPERSON','MEMBER','SECRETARY','INQUIRY_OFFICER','PRESENTING_OFFICER','EXPERT');
CREATE TYPE g01_committee_member_status AS ENUM ('ACTIVE','RECUSED','INACTIVE');


-- =====================================================================================
-- SECTION 2 — TABLES
-- =====================================================================================
-- Ordering respects FK dependencies: parents (positions, profile_sections, privacy_notices,
-- legal_holds, custom_field_definitions, employee_import_batches, employee_attribute_history)
-- precede their referrers.

-- ---------------------------------------------------------------------------------
-- E2 — employee_contacts
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_contacts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)          ON DELETE RESTRICT,
    employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    contact_type  g01_contact_type NOT NULL,
    contact_value varchar(120) NOT NULL,
    country_code  varchar(5) DEFAULT '+91',
    is_primary    boolean NOT NULL DEFAULT false,
    is_verified   boolean NOT NULL DEFAULT false,
    verified_at   timestamptz,
    visibility    g01_field_visibility NOT NULL DEFAULT 'INTERNAL',
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_employee_contacts_tenant   ON employee_contacts(tenant_id);
CREATE INDEX ix_employee_contacts_entity   ON employee_contacts(entity_id);
CREATE INDEX ix_employee_contacts_employee ON employee_contacts(employee_id);
CREATE INDEX ix_employee_contacts_type     ON employee_contacts(contact_type);
-- r4: one primary per (employee, contact_type)
CREATE UNIQUE INDEX uq_employee_contacts_primary
    ON employee_contacts(employee_id, contact_type) WHERE is_primary AND is_deleted = false;
-- r17: tenant-unique official email across non-deleted rows
CREATE UNIQUE INDEX uq_employee_contacts_official_email
    ON employee_contacts(tenant_id, lower(contact_value))
    WHERE contact_type = 'OFFICIAL_EMAIL' AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- E3 — employee_addresses
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_addresses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    address_type     g01_address_type NOT NULL,
    line1            varchar(160) NOT NULL,
    line2            varchar(160),
    landmark         varchar(120),
    city             varchar(80) NOT NULL,
    district         varchar(80),
    state            varchar(80) NOT NULL,
    country          varchar(80) NOT NULL DEFAULT 'India',
    pincode          varchar(12) NOT NULL,
    is_current       boolean NOT NULL DEFAULT true,
    same_as_permanent boolean NOT NULL DEFAULT false,
    valid_from       date NOT NULL,
    valid_to         date,
    row_version      integer NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_addresses_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX ix_employee_addresses_tenant   ON employee_addresses(tenant_id);
CREATE INDEX ix_employee_addresses_entity   ON employee_addresses(entity_id);
CREATE INDEX ix_employee_addresses_employee ON employee_addresses(employee_id);
CREATE INDEX ix_employee_addresses_type     ON employee_addresses(address_type);

-- ---------------------------------------------------------------------------------
-- E5 — employee_nominees (references core employee_dependents)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_nominees (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id)             ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)                     ON DELETE RESTRICT,
    employee_id   uuid NOT NULL REFERENCES employees(id)           ON DELETE RESTRICT,
    dependent_id  uuid REFERENCES employee_dependents(id)          ON DELETE SET NULL,
    nominee_name  varchar(160) NOT NULL,
    relationship  dependent_relationship NOT NULL,
    benefit_type  g01_benefit_type NOT NULL,
    share_pct     numeric(5,2) NOT NULL,
    is_minor      boolean NOT NULL DEFAULT false,
    guardian_name varchar(160),
    is_family_pension_recipient boolean NOT NULL DEFAULT false,
    effective_date date NOT NULL,
    requires_four_eyes boolean NOT NULL DEFAULT true,
    proof_document_id uuid REFERENCES documents(id)                ON DELETE SET NULL,
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_nominees_share CHECK (share_pct >= 0 AND share_pct <= 100),
    CONSTRAINT ck_employee_nominees_guardian CHECK (is_minor = false OR guardian_name IS NOT NULL)
);
CREATE INDEX ix_employee_nominees_tenant    ON employee_nominees(tenant_id);
CREATE INDEX ix_employee_nominees_entity    ON employee_nominees(entity_id);
CREATE INDEX ix_employee_nominees_employee  ON employee_nominees(employee_id);
CREATE INDEX ix_employee_nominees_dependent ON employee_nominees(dependent_id);
CREATE INDEX ix_employee_nominees_doc       ON employee_nominees(proof_document_id);

-- ---------------------------------------------------------------------------------
-- E6 — employee_emergency_contacts
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_emergency_contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    contact_name    varchar(160) NOT NULL,
    relationship    dependent_relationship NOT NULL,
    phone_primary   varchar(20) NOT NULL,
    phone_alternate varchar(20),
    address         varchar(320),
    priority        smallint NOT NULL DEFAULT 1,
    row_version     integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_employee_emergency_contacts_tenant   ON employee_emergency_contacts(tenant_id);
CREATE INDEX ix_employee_emergency_contacts_entity   ON employee_emergency_contacts(entity_id);
CREATE INDEX ix_employee_emergency_contacts_employee ON employee_emergency_contacts(employee_id);

-- ---------------------------------------------------------------------------------
-- E7 — employee_education
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_education (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    qualification_level g01_qualification_level NOT NULL,
    degree_name         varchar(120) NOT NULL,
    specialization      varchar(120),
    institution         varchar(200) NOT NULL,
    board_university    varchar(200),
    year_of_passing     smallint,
    grade_or_percentage varchar(20),
    is_highest          boolean NOT NULL DEFAULT false,
    is_verified         boolean NOT NULL DEFAULT false,
    certificate_document_id uuid REFERENCES documents(id)      ON DELETE SET NULL,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_education_year CHECK (year_of_passing IS NULL OR year_of_passing BETWEEN 1950 AND 2100)
);
CREATE INDEX ix_employee_education_tenant   ON employee_education(tenant_id);
CREATE INDEX ix_employee_education_entity   ON employee_education(entity_id);
CREATE INDEX ix_employee_education_employee ON employee_education(employee_id);
CREATE INDEX ix_employee_education_doc      ON employee_education(certificate_document_id);
-- r4: one highest qualification per employee
CREATE UNIQUE INDEX uq_employee_education_highest
    ON employee_education(employee_id) WHERE is_highest AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- E8 — employee_experience (prior employment; reuses core employment_type)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_experience (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    employer_name        varchar(200) NOT NULL,
    designation          varchar(120) NOT NULL,
    employment_type      employment_type,
    from_date            date NOT NULL,
    to_date              date,
    is_government_service boolean NOT NULL DEFAULT false,
    reason_for_leaving   varchar(200),
    last_drawn_pay       numeric(12,2),
    proof_document_id    uuid REFERENCES documents(id)          ON DELETE SET NULL,
    row_version          integer NOT NULL DEFAULT 1,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_experience_dates CHECK (to_date IS NULL OR to_date >= from_date)
);
CREATE INDEX ix_employee_experience_tenant   ON employee_experience(tenant_id);
CREATE INDEX ix_employee_experience_entity   ON employee_experience(entity_id);
CREATE INDEX ix_employee_experience_employee ON employee_experience(employee_id);
CREATE INDEX ix_employee_experience_doc      ON employee_experience(proof_document_id);

-- ---------------------------------------------------------------------------------
-- E22 — aadhaar_vault  (the SOLE home of the raw Aadhaar number; append-only context)
-- PK is the opaque Reference Key (BRD E22) — a documented exception to the uuid-PK rule
-- because employees.aadhaar_ref_key / employee_identity_documents.aadhaar_ref_key FK to it.
-- ---------------------------------------------------------------------------------
CREATE TABLE aadhaar_vault (
    aadhaar_ref_key          varchar(64) PRIMARY KEY,                 -- Reference Key (random, opaque)
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id)        ON DELETE RESTRICT,
    aadhaar_number_encrypted bytea NOT NULL,                          -- KMS-encrypted; only place the number exists
    aadhaar_masked           varchar(20) NOT NULL,                    -- XXXX-XXXX-1234
    hash_for_dedup           varchar(128) NOT NULL,                   -- keyed HMAC for dedup without decrypt
    lawful_basis             g01_aadhaar_lawful_basis NOT NULL,
    lawful_basis_ref         varchar(120),
    linked_employee_id       uuid REFERENCES employees(id)       ON DELETE RESTRICT,
    kms_key_id               varchar(120) NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),      -- append-only: no updated_at / is_deleted
    created_by               uuid,
    CONSTRAINT uq_aadhaar_vault_hash UNIQUE (tenant_id, hash_for_dedup)   -- r19: duplicate-Aadhaar detection
);
CREATE INDEX ix_aadhaar_vault_tenant   ON aadhaar_vault(tenant_id);
CREATE INDEX ix_aadhaar_vault_entity   ON aadhaar_vault(entity_id);
-- 1:0..1 — at most one vault row per employee
CREATE UNIQUE INDEX uq_aadhaar_vault_employee
    ON aadhaar_vault(tenant_id, linked_employee_id) WHERE linked_employee_id IS NOT NULL;
COMMENT ON TABLE aadhaar_vault IS 'Aadhaar Reference-Key vault (G01 E22). Raw number lives ONLY here, KMS-encrypted; revealed only via audited break-glass. Append-only (purge via FR-021).';

-- ---------------------------------------------------------------------------------
-- E9 — employee_identity_documents (Aadhaar via vault ref key only)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_identity_documents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    doc_type           g01_identity_doc_type NOT NULL,
    doc_number_masked  varchar(40) NOT NULL,
    doc_number_token   varchar(128),                          -- encrypted; NULL for AADHAAR
    aadhaar_ref_key    varchar(64) REFERENCES aadhaar_vault(aadhaar_ref_key) ON DELETE RESTRICT,  -- AADHAAR rows only
    issuing_authority  varchar(120),
    issue_date         date,
    expiry_date        date,
    is_verified        boolean NOT NULL DEFAULT false,
    verification_source varchar(40),
    scan_document_id   uuid REFERENCES documents(id)          ON DELETE SET NULL,
    row_version        integer NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    -- r6/r19: an AADHAAR row never carries a raw/tokenised number and must point at the vault
    CONSTRAINT ck_identity_aadhaar CHECK (
        doc_type <> 'AADHAAR' OR (doc_number_token IS NULL AND aadhaar_ref_key IS NOT NULL)
    )
);
CREATE INDEX ix_employee_identity_documents_tenant   ON employee_identity_documents(tenant_id);
CREATE INDEX ix_employee_identity_documents_entity   ON employee_identity_documents(entity_id);
CREATE INDEX ix_employee_identity_documents_employee ON employee_identity_documents(employee_id);
CREATE INDEX ix_employee_identity_documents_aadhaar  ON employee_identity_documents(aadhaar_ref_key);
CREATE INDEX ix_employee_identity_documents_doc      ON employee_identity_documents(scan_document_id);
CREATE INDEX ix_employee_identity_documents_expiry   ON employee_identity_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- ---------------------------------------------------------------------------------
-- E10 — employee_bank_accounts
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_bank_accounts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    account_holder_name   varchar(160) NOT NULL,
    bank_name             varchar(120) NOT NULL,
    branch_name           varchar(120),
    ifsc_code             varchar(11) NOT NULL,
    account_number_masked varchar(34) NOT NULL,
    account_number_token  varchar(128),                          -- encrypted; never returned raw
    account_type          g01_bank_account_type NOT NULL,
    is_primary_salary     boolean NOT NULL DEFAULT false,
    is_verified           boolean NOT NULL DEFAULT false,
    effective_from        date NOT NULL,
    cancelled_cheque_document_id uuid REFERENCES documents(id)   ON DELETE SET NULL,
    row_version           integer NOT NULL DEFAULT 1,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_bank_ifsc CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
);
CREATE INDEX ix_employee_bank_accounts_tenant   ON employee_bank_accounts(tenant_id);
CREATE INDEX ix_employee_bank_accounts_entity   ON employee_bank_accounts(entity_id);
CREATE INDEX ix_employee_bank_accounts_employee ON employee_bank_accounts(employee_id);
CREATE INDEX ix_employee_bank_accounts_doc      ON employee_bank_accounts(cancelled_cheque_document_id);
-- r4: exactly one active primary-salary account per employee
CREATE UNIQUE INDEX uq_employee_bank_primary_salary
    ON employee_bank_accounts(employee_id) WHERE is_primary_salary AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- E11 — employee_photos (binary in G13; biometric isolated; consent for biometric)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_photos (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    photo_type         g01_photo_type NOT NULL,
    processing_purpose g01_processing_purpose NOT NULL,
    document_id        uuid REFERENCES documents(id)          ON DELETE SET NULL,  -- NULL for pure biometric ref
    biometric_template_ref varchar(128),                       -- opaque vault ref; no raw template
    consent_id         uuid REFERENCES consent_records(id)    ON DELETE SET NULL,  -- core DPDPA ledger
    is_primary         boolean NOT NULL DEFAULT false,
    captured_at        timestamptz,
    width_px           integer,
    height_px          integer,
    retention_until    date,
    status             g01_photo_status NOT NULL DEFAULT 'PENDING',
    row_version        integer NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    -- E11/r-biometric: biometric processing requires a captured consent record
    CONSTRAINT ck_employee_photos_biometric_consent CHECK (
        processing_purpose <> 'BIOMETRIC_ATTENDANCE' OR consent_id IS NOT NULL
    )
);
CREATE INDEX ix_employee_photos_tenant   ON employee_photos(tenant_id);
CREATE INDEX ix_employee_photos_entity   ON employee_photos(entity_id);
CREATE INDEX ix_employee_photos_employee ON employee_photos(employee_id);
CREATE INDEX ix_employee_photos_document ON employee_photos(document_id);
CREATE INDEX ix_employee_photos_consent  ON employee_photos(consent_id);
-- r4: one primary PROFILE photo per employee
CREATE UNIQUE INDEX uq_employee_photos_primary_profile
    ON employee_photos(employee_id) WHERE is_primary AND photo_type = 'PROFILE' AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- E12 — positions (sanctioned posts; current cache, history in E24)
-- ---------------------------------------------------------------------------------
CREATE TABLE positions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    position_code          varchar(30) NOT NULL,
    title                  varchar(120) NOT NULL,
    designation_id         uuid REFERENCES designations(id)       ON DELETE RESTRICT,
    cadre_id               uuid REFERENCES cadres(id)             ON DELETE RESTRICT,
    pay_scale_id           uuid REFERENCES pay_scales(id)         ON DELETE RESTRICT,
    org_unit_id            uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    reports_to_position_id uuid REFERENCES positions(id)          ON DELETE SET NULL,
    sanctioned_count       integer NOT NULL DEFAULT 0,
    is_vacant              boolean NOT NULL DEFAULT true,
    status                 g01_position_status NOT NULL DEFAULT 'ACTIVE',
    row_version            integer NOT NULL DEFAULT 1,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_positions_code UNIQUE (tenant_id, position_code),
    CONSTRAINT ck_positions_sanctioned CHECK (sanctioned_count >= 0)
);
CREATE INDEX ix_positions_tenant      ON positions(tenant_id);
CREATE INDEX ix_positions_entity      ON positions(entity_id);
CREATE INDEX ix_positions_designation ON positions(designation_id);
CREATE INDEX ix_positions_cadre       ON positions(cadre_id);
CREATE INDEX ix_positions_pay_scale   ON positions(pay_scale_id);
CREATE INDEX ix_positions_org_unit    ON positions(org_unit_id);
CREATE INDEX ix_positions_reports_to  ON positions(reports_to_position_id);
CREATE INDEX ix_positions_status      ON positions(status);

-- ---------------------------------------------------------------------------------
-- E24 — position_history (append-only; no overlaps per position)
-- ---------------------------------------------------------------------------------
CREATE TABLE position_history (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id)    ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id)            ON DELETE RESTRICT,
    position_id            uuid NOT NULL REFERENCES positions(id)  ON DELETE RESTRICT,
    title                  varchar(120) NOT NULL,
    designation_id         uuid REFERENCES designations(id)        ON DELETE RESTRICT,
    pay_scale_id           uuid REFERENCES pay_scales(id)          ON DELETE RESTRICT,
    reports_to_position_id uuid REFERENCES positions(id)           ON DELETE SET NULL,
    sanctioned_count       integer NOT NULL DEFAULT 0,
    status                 g01_position_status NOT NULL DEFAULT 'ACTIVE',
    effective_from         date NOT NULL,
    effective_to           date,
    change_reason          g01_position_change_reason NOT NULL,
    order_ref              varchar(120),
    created_at             timestamptz NOT NULL DEFAULT now(),     -- append-only
    created_by             uuid,
    CONSTRAINT ck_position_history_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_position_history_sanctioned CHECK (sanctioned_count >= 0),
    -- r14: no overlapping effective windows per position
    CONSTRAINT ex_position_history_nooverlap EXCLUDE USING gist (
        position_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    )
);
CREATE INDEX ix_position_history_tenant   ON position_history(tenant_id);
CREATE INDEX ix_position_history_entity   ON position_history(entity_id);
CREATE INDEX ix_position_history_position ON position_history(position_id);

-- ---------------------------------------------------------------------------------
-- E13 — employee_job_assignments (effective-dated; one current; no overlaps)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_job_assignments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id)    ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id)            ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id)  ON DELETE RESTRICT,
    position_id          uuid REFERENCES positions(id)           ON DELETE RESTRICT,
    designation_id       uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    cadre_id             uuid REFERENCES cadres(id)              ON DELETE RESTRICT,
    org_unit_id          uuid NOT NULL REFERENCES org_units(id)  ON DELETE RESTRICT,
    pay_scale_id         uuid REFERENCES pay_scales(id)          ON DELETE RESTRICT,
    reporting_manager_id uuid REFERENCES employees(id)           ON DELETE SET NULL,
    assignment_type      g01_assignment_type NOT NULL,
    effective_from       date NOT NULL,
    effective_to         date,
    change_reason        g01_assignment_reason NOT NULL,
    source_module        varchar(10),
    source_ref_id        uuid,
    row_version          integer NOT NULL DEFAULT 1,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_job_assignments_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- r1: no overlapping assignment windows per employee (active rows only)
    CONSTRAINT ex_job_assignments_nooverlap EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (is_deleted = false)
);
CREATE INDEX ix_job_assignments_tenant    ON employee_job_assignments(tenant_id);
CREATE INDEX ix_job_assignments_entity    ON employee_job_assignments(entity_id);
CREATE INDEX ix_job_assignments_employee  ON employee_job_assignments(employee_id);
CREATE INDEX ix_job_assignments_position  ON employee_job_assignments(position_id);
CREATE INDEX ix_job_assignments_org_unit  ON employee_job_assignments(org_unit_id);
CREATE INDEX ix_job_assignments_manager   ON employee_job_assignments(reporting_manager_id);
-- r1: at most one current (open-ended) assignment per employee
CREATE UNIQUE INDEX uq_job_assignments_current
    ON employee_job_assignments(employee_id) WHERE effective_to IS NULL AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- PH-02 — statutory authority assignments (P01 ApproverResolver input)
-- ---------------------------------------------------------------------------------
CREATE TABLE g01_authority_assignments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id)               ON DELETE RESTRICT,
    authority_type          g01_authority_type NOT NULL,
    authority_code          varchar(60) NOT NULL,
    scope_type              g01_authority_scope NOT NULL,
    scope_org_unit_id       uuid REFERENCES org_units(id)              ON DELETE RESTRICT,
    scope_cadre_id          uuid REFERENCES cadres(id)                 ON DELETE RESTRICT,
    scope_designation_id    uuid REFERENCES designations(id)           ON DELETE RESTRICT,
    subject_employee_id     uuid REFERENCES employees(id)              ON DELETE RESTRICT,
    authority_position_id   uuid REFERENCES positions(id)              ON DELETE RESTRICT,
    authority_employee_id   uuid REFERENCES employees(id)              ON DELETE RESTRICT,
    priority                integer NOT NULL DEFAULT 100,
    effective_from          date NOT NULL,
    effective_to            date,
    rule_version            varchar(40) NOT NULL DEFAULT 'PH-02',
    source_order_ref        varchar(120),
    status                  g01_authority_status NOT NULL DEFAULT 'ACTIVE',
    row_version             integer NOT NULL DEFAULT 1,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g01_auth_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_g01_auth_assignee CHECK (authority_position_id IS NOT NULL OR authority_employee_id IS NOT NULL),
    CONSTRAINT ck_g01_auth_priority CHECK (priority > 0),
    CONSTRAINT ck_g01_auth_scope_required CHECK (
        (scope_type = 'TENANT' AND entity_id IS NULL AND scope_org_unit_id IS NULL AND scope_cadre_id IS NULL AND scope_designation_id IS NULL AND subject_employee_id IS NULL)
        OR (scope_type = 'ENTITY' AND entity_id IS NOT NULL)
        OR (scope_type = 'ORG_UNIT' AND scope_org_unit_id IS NOT NULL)
        OR (scope_type = 'CADRE' AND scope_cadre_id IS NOT NULL)
        OR (scope_type = 'DESIGNATION' AND scope_designation_id IS NOT NULL)
        OR (scope_type = 'EMPLOYEE' AND subject_employee_id IS NOT NULL)
    )
);
CREATE INDEX ix_g01_auth_tenant    ON g01_authority_assignments(tenant_id);
CREATE INDEX ix_g01_auth_entity    ON g01_authority_assignments(entity_id);
CREATE INDEX ix_g01_auth_type      ON g01_authority_assignments(authority_type);
CREATE INDEX ix_g01_auth_org       ON g01_authority_assignments(scope_org_unit_id);
CREATE INDEX ix_g01_auth_cadre     ON g01_authority_assignments(scope_cadre_id);
CREATE INDEX ix_g01_auth_employee  ON g01_authority_assignments(authority_employee_id);
CREATE INDEX ix_g01_auth_position  ON g01_authority_assignments(authority_position_id);
CREATE INDEX ix_g01_auth_effective ON g01_authority_assignments(effective_from, effective_to);
CREATE UNIQUE INDEX uq_g01_auth_current_priority
    ON g01_authority_assignments (
        tenant_id,
        authority_type,
        authority_code,
        COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(scope_org_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(scope_cadre_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(scope_designation_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(subject_employee_id, '00000000-0000-0000-0000-000000000000'::uuid),
        priority
    )
    WHERE effective_to IS NULL AND status = 'ACTIVE' AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- PH-02 — delegation / acting charge windows (P01 ApproverResolver input)
-- ---------------------------------------------------------------------------------
CREATE TABLE g01_authority_delegations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id)               ON DELETE RESTRICT,
    authority_assignment_id uuid NOT NULL REFERENCES g01_authority_assignments(id) ON DELETE RESTRICT,
    from_employee_id        uuid NOT NULL REFERENCES employees(id)     ON DELETE RESTRICT,
    to_employee_id          uuid NOT NULL REFERENCES employees(id)     ON DELETE RESTRICT,
    delegation_kind         g01_delegation_kind NOT NULL,
    effective_from          date NOT NULL,
    effective_to            date NOT NULL,
    reason                  text NOT NULL,
    source_order_ref        varchar(120),
    status                  g01_delegation_status NOT NULL DEFAULT 'ACTIVE',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g01_del_dates CHECK (effective_to >= effective_from),
    CONSTRAINT ck_g01_del_distinct CHECK (from_employee_id <> to_employee_id)
);
CREATE INDEX ix_g01_del_tenant     ON g01_authority_delegations(tenant_id);
CREATE INDEX ix_g01_del_assignment ON g01_authority_delegations(authority_assignment_id);
CREATE INDEX ix_g01_del_from       ON g01_authority_delegations(from_employee_id);
CREATE INDEX ix_g01_del_to         ON g01_authority_delegations(to_employee_id);
CREATE INDEX ix_g01_del_effective  ON g01_authority_delegations(effective_from, effective_to);

-- ---------------------------------------------------------------------------------
-- PH-02 — reusable committee fixtures for resolver quorum/recusal evidence
-- ---------------------------------------------------------------------------------
CREATE TABLE g01_committees (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id)               ON DELETE RESTRICT,
    committee_code        varchar(60) NOT NULL,
    committee_type        g01_committee_type NOT NULL,
    name                  varchar(160) NOT NULL,
    scope_org_unit_id     uuid REFERENCES org_units(id)              ON DELETE RESTRICT,
    scope_cadre_id        uuid REFERENCES cadres(id)                 ON DELETE RESTRICT,
    quorum_required       integer NOT NULL,
    effective_from        date NOT NULL,
    effective_to          date,
    source_module         varchar(10),
    source_ref_id         uuid,
    status                g01_committee_status NOT NULL DEFAULT 'CONSTITUTED',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g01_committees_code UNIQUE (tenant_id, committee_code),
    CONSTRAINT ck_g01_committee_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_g01_committee_quorum CHECK (quorum_required > 0)
);
CREATE INDEX ix_g01_committee_tenant ON g01_committees(tenant_id);
CREATE INDEX ix_g01_committee_entity ON g01_committees(entity_id);
CREATE INDEX ix_g01_committee_type   ON g01_committees(committee_type);
CREATE INDEX ix_g01_committee_org    ON g01_committees(scope_org_unit_id);
CREATE INDEX ix_g01_committee_cadre  ON g01_committees(scope_cadre_id);

CREATE TABLE g01_committee_members (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id)       ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id)               ON DELETE RESTRICT,
    committee_id           uuid NOT NULL REFERENCES g01_committees(id) ON DELETE RESTRICT,
    member_employee_id     uuid REFERENCES employees(id)              ON DELETE RESTRICT,
    external_member_name   varchar(160),
    member_role            g01_committee_member_role NOT NULL,
    voting_weight          numeric(5,2) NOT NULL DEFAULT 1.00,
    is_required_for_quorum boolean NOT NULL DEFAULT true,
    recusal_reason         text,
    status                 g01_committee_member_status NOT NULL DEFAULT 'ACTIVE',
    effective_from         date NOT NULL,
    effective_to           date,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g01_committee_member_identity CHECK (
        (member_employee_id IS NOT NULL AND external_member_name IS NULL)
        OR (member_employee_id IS NULL AND external_member_name IS NOT NULL)
    ),
    CONSTRAINT ck_g01_committee_member_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ck_g01_committee_member_weight CHECK (voting_weight > 0),
    CONSTRAINT ck_g01_committee_member_recusal CHECK (
        (status = 'RECUSED' AND recusal_reason IS NOT NULL) OR status <> 'RECUSED'
    )
);
CREATE INDEX ix_g01_cm_tenant    ON g01_committee_members(tenant_id);
CREATE INDEX ix_g01_cm_entity    ON g01_committee_members(entity_id);
CREATE INDEX ix_g01_cm_committee ON g01_committee_members(committee_id);
CREATE INDEX ix_g01_cm_employee  ON g01_committee_members(member_employee_id);

-- ---------------------------------------------------------------------------------
-- E14 — profile_sections (Phase 2 config)
-- ---------------------------------------------------------------------------------
CREATE TABLE profile_sections (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    section_key   varchar(40) NOT NULL,
    label         varchar(120) NOT NULL,
    display_order smallint NOT NULL,
    is_system     boolean NOT NULL DEFAULT false,
    is_enabled    boolean NOT NULL DEFAULT true,
    applicable_employment_types text[],
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_profile_sections_key UNIQUE (tenant_id, section_key)
);
CREATE INDEX ix_profile_sections_tenant ON profile_sections(tenant_id);

-- ---------------------------------------------------------------------------------
-- E15 — custom_field_definitions (Phase 2 config)
-- ---------------------------------------------------------------------------------
CREATE TABLE custom_field_definitions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id)         ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id)                 ON DELETE RESTRICT,
    section_id       uuid NOT NULL REFERENCES profile_sections(id) ON DELETE RESTRICT,
    field_key        varchar(60) NOT NULL,
    label            varchar(120) NOT NULL,
    data_type        g01_custom_field_type NOT NULL,
    enum_options     text[],
    is_required      boolean NOT NULL DEFAULT false,
    is_pii           boolean NOT NULL DEFAULT false,
    validation_regex varchar(200),
    display_order    smallint NOT NULL,
    is_active        boolean NOT NULL DEFAULT true,
    row_version      integer NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_custom_field_def_key UNIQUE (section_id, field_key)
);
CREATE INDEX ix_custom_field_def_tenant  ON custom_field_definitions(tenant_id);
CREATE INDEX ix_custom_field_def_section ON custom_field_definitions(section_id);

-- ---------------------------------------------------------------------------------
-- E16 — employee_custom_field_values (Phase 2)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_custom_field_values (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    field_def_id      uuid NOT NULL REFERENCES custom_field_definitions(id) ON DELETE RESTRICT,
    value_text        text,
    value_number      numeric,
    value_date        date,
    value_bool        boolean,
    value_document_id uuid REFERENCES documents(id)          ON DELETE SET NULL,
    row_version       integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_custom_value UNIQUE (employee_id, field_def_id)
);
CREATE INDEX ix_employee_custom_value_tenant   ON employee_custom_field_values(tenant_id);
CREATE INDEX ix_employee_custom_value_employee ON employee_custom_field_values(employee_id);
CREATE INDEX ix_employee_custom_value_field    ON employee_custom_field_values(field_def_id);

-- ---------------------------------------------------------------------------------
-- E17 — field_access_policies (field-level PII access + 4-eyes + special-category)
-- ---------------------------------------------------------------------------------
CREATE TABLE field_access_policies (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    field_path            varchar(120) NOT NULL,
    role_key              varchar(40) NOT NULL,
    access_level          g01_field_access_level NOT NULL,
    requires_reason       boolean NOT NULL DEFAULT false,
    requires_four_eyes    boolean NOT NULL DEFAULT false,
    break_glass_window_cap integer,
    is_special_category   boolean NOT NULL DEFAULT false,
    is_self_visible       boolean NOT NULL DEFAULT true,
    row_version           integer NOT NULL DEFAULT 1,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_field_access_policy UNIQUE (tenant_id, field_path, role_key)
);
CREATE INDEX ix_field_access_policies_tenant ON field_access_policies(tenant_id);

-- ---------------------------------------------------------------------------------
-- E18 — employee_profile_completeness (advisory; 1:1)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_profile_completeness (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id            uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    overall_pct            numeric(5,2) NOT NULL DEFAULT 0,
    section_scores         jsonb NOT NULL DEFAULT '{}'::jsonb,
    missing_required_fields text[],
    dq_issues              jsonb,
    data_quality_flag      g01_dq_flag NOT NULL DEFAULT 'CLEAN',
    last_computed_at       timestamptz NOT NULL DEFAULT now(),
    row_version            integer NOT NULL DEFAULT 1,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_profile_completeness_employee UNIQUE (employee_id),
    CONSTRAINT ck_profile_completeness_pct CHECK (overall_pct >= 0 AND overall_pct <= 100)
);
CREATE INDEX ix_profile_completeness_tenant ON employee_profile_completeness(tenant_id);

-- ---------------------------------------------------------------------------------
-- E19 — dedup_candidates
-- ---------------------------------------------------------------------------------
CREATE TABLE dedup_candidates (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_a_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    employee_b_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    match_score        numeric(5,2) NOT NULL,
    matched_attributes jsonb NOT NULL,
    status             g01_dedup_status NOT NULL DEFAULT 'OPEN',
    resolution         varchar(24),
    resolved_by        uuid,
    resolved_at        timestamptz,
    row_version        integer NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_dedup_candidates_pair UNIQUE (employee_a_id, employee_b_id),
    CONSTRAINT ck_dedup_candidates_distinct CHECK (employee_a_id <> employee_b_id),
    CONSTRAINT ck_dedup_candidates_score CHECK (match_score >= 0 AND match_score <= 100)
);
CREATE INDEX ix_dedup_candidates_tenant ON dedup_candidates(tenant_id);
CREATE INDEX ix_dedup_candidates_a      ON dedup_candidates(employee_a_id);
CREATE INDEX ix_dedup_candidates_b      ON dedup_candidates(employee_b_id);
CREATE INDEX ix_dedup_candidates_status ON dedup_candidates(status);

-- ---------------------------------------------------------------------------------
-- E20a — employee_import_batches
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_import_batches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    file_document_id  uuid REFERENCES documents(id)        ON DELETE SET NULL,
    template_version  varchar(16) NOT NULL,
    validation_profile g01_validation_profile NOT NULL DEFAULT 'STRICT',
    total_rows        integer NOT NULL DEFAULT 0,
    valid_rows        integer NOT NULL DEFAULT 0,
    provisional_rows  integer NOT NULL DEFAULT 0,
    error_rows        integer NOT NULL DEFAULT 0,
    status            g01_import_status NOT NULL DEFAULT 'UPLOADED',
    committed_at      timestamptz,
    committed_by      uuid,
    row_version       integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_import_batches_counts CHECK (total_rows >= 0 AND valid_rows >= 0 AND provisional_rows >= 0 AND error_rows >= 0)
);
CREATE INDEX ix_import_batches_tenant ON employee_import_batches(tenant_id);
CREATE INDEX ix_import_batches_status ON employee_import_batches(status);
CREATE INDEX ix_import_batches_doc    ON employee_import_batches(file_document_id);

-- ---------------------------------------------------------------------------------
-- E20b — import_staging_rows
-- ---------------------------------------------------------------------------------
CREATE TABLE import_staging_rows (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    batch_id            uuid NOT NULL REFERENCES employee_import_batches(id) ON DELETE CASCADE,
    row_number          integer NOT NULL,
    raw_payload         jsonb NOT NULL,
    validation_status   g01_row_status NOT NULL DEFAULT 'VALID',
    validation_errors   jsonb,
    remediation_state   varchar(16),
    resolved_employee_id uuid REFERENCES employees(id)       ON DELETE SET NULL,
    dedup_match_id      uuid REFERENCES dedup_candidates(id) ON DELETE SET NULL,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_import_staging_row UNIQUE (batch_id, row_number)
);
CREATE INDEX ix_import_staging_tenant   ON import_staging_rows(tenant_id);
CREATE INDEX ix_import_staging_batch    ON import_staging_rows(batch_id);
CREATE INDEX ix_import_staging_status   ON import_staging_rows(validation_status);
CREATE INDEX ix_import_staging_resolved ON import_staging_rows(resolved_employee_id);

-- ---------------------------------------------------------------------------------
-- E21 — employee_id_aliases (loser_id -> survivor_id identity resolution)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_id_aliases (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    loser_id            uuid NOT NULL,                          -- retired record's employee_id (soft-deleted)
    survivor_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    dedup_candidate_id  uuid REFERENCES dedup_candidates(id)   ON DELETE SET NULL,
    merged_at           timestamptz NOT NULL DEFAULT now(),
    merged_by           uuid NOT NULL,
    approved_by         uuid,
    mergeable_back_until timestamptz NOT NULL,
    is_reversed         boolean NOT NULL DEFAULT false,
    merge_snapshot      jsonb NOT NULL,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_id_aliases_loser UNIQUE (tenant_id, loser_id),   -- r11: one alias per loser
    CONSTRAINT ck_employee_id_aliases_distinct CHECK (loser_id <> survivor_id)
);
CREATE INDEX ix_employee_id_aliases_tenant   ON employee_id_aliases(tenant_id);
CREATE INDEX ix_employee_id_aliases_survivor ON employee_id_aliases(survivor_id);
CREATE INDEX ix_employee_id_aliases_dedup    ON employee_id_aliases(dedup_candidate_id);

-- ---------------------------------------------------------------------------------
-- E23 — employee_attribute_history (append-only; effective-dated; no overlaps)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_attribute_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attribute_path  varchar(60) NOT NULL,
    value_text      text,
    value_date      date,
    effective_from  date NOT NULL,
    effective_to    date,
    change_reason   g01_attribute_change_reason NOT NULL,
    source          varchar(20) NOT NULL,
    gazette_ref     varchar(120),
    governed_change_id uuid,                                 -- FK wired in Section 3 (forward ref to E32)
    proof_document_id  uuid REFERENCES documents(id)        ON DELETE SET NULL,
    recorded_by     uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),      -- append-only
    created_by      uuid,
    CONSTRAINT ck_attr_history_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- r15/r7: no overlapping windows per (employee, attribute)
    CONSTRAINT ex_attr_history_nooverlap EXCLUDE USING gist (
        employee_id WITH =,
        attribute_path WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    )
);
CREATE INDEX ix_attr_history_tenant   ON employee_attribute_history(tenant_id);
CREATE INDEX ix_attr_history_entity   ON employee_attribute_history(entity_id);
CREATE INDEX ix_attr_history_employee ON employee_attribute_history(employee_id);
CREATE INDEX ix_attr_history_path     ON employee_attribute_history(employee_id, attribute_path);
CREATE INDEX ix_attr_history_govchg   ON employee_attribute_history(governed_change_id);

-- ---------------------------------------------------------------------------------
-- E25 — employee_certificates (category / PwD / domicile)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_certificates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    certificate_type    g01_certificate_type NOT NULL,
    certificate_number  varchar(60) NOT NULL,
    issuing_authority   varchar(160) NOT NULL,
    valid_from          date NOT NULL,
    valid_to            date,
    disability_percentage numeric(5,2),
    udid_number         varchar(40),
    is_creamy_layer     boolean,
    is_verified         boolean NOT NULL DEFAULT false,
    certificate_document_id uuid REFERENCES documents(id)      ON DELETE SET NULL,
    status              g01_certificate_status NOT NULL DEFAULT 'VALID',
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_certificates_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT ck_certificates_disability CHECK (disability_percentage IS NULL OR (disability_percentage >= 0 AND disability_percentage <= 100))
);
CREATE INDEX ix_certificates_tenant   ON employee_certificates(tenant_id);
CREATE INDEX ix_certificates_entity   ON employee_certificates(entity_id);
CREATE INDEX ix_certificates_employee ON employee_certificates(employee_id);
CREATE INDEX ix_certificates_type     ON employee_certificates(certificate_type);
CREATE INDEX ix_certificates_doc      ON employee_certificates(certificate_document_id);

-- ---------------------------------------------------------------------------------
-- E26 — privacy_notices (notice catalog; references core processing purpose)
-- ---------------------------------------------------------------------------------
CREATE TABLE privacy_notices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    notice_key    varchar(60) NOT NULL,
    version       varchar(16) NOT NULL,
    purpose       g01_processing_purpose NOT NULL,
    language      varchar(10) NOT NULL,
    body_text     text NOT NULL,
    effective_from date NOT NULL,
    is_active     boolean NOT NULL DEFAULT true,
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_privacy_notices_key UNIQUE (tenant_id, notice_key, version, language)
);
CREATE INDEX ix_privacy_notices_tenant ON privacy_notices(tenant_id);

-- ---------------------------------------------------------------------------------
-- E31 — legal_holds (block purge/erasure)
-- ---------------------------------------------------------------------------------
CREATE TABLE legal_holds (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    hold_type     g01_hold_type NOT NULL,
    reason        varchar(200) NOT NULL,
    placed_by     uuid NOT NULL,
    source_module varchar(10),
    placed_at     timestamptz NOT NULL DEFAULT now(),
    released_at   timestamptz,
    status        g01_hold_status NOT NULL DEFAULT 'ACTIVE',
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_legal_holds_tenant   ON legal_holds(tenant_id);
CREATE INDEX ix_legal_holds_entity   ON legal_holds(entity_id);
CREATE INDEX ix_legal_holds_employee ON legal_holds(employee_id);
CREATE INDEX ix_legal_holds_status   ON legal_holds(status) WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------------
-- E28 — data_principal_requests (DPDP rights & grievances)
-- ---------------------------------------------------------------------------------
CREATE TABLE data_principal_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    request_type        g01_dp_request_type NOT NULL,
    details             text,
    status              g01_dp_request_status NOT NULL DEFAULT 'RECEIVED',
    sla_due_at          timestamptz NOT NULL,
    resolution_note     text,
    linked_legal_hold_id uuid REFERENCES legal_holds(id)       ON DELETE SET NULL,
    assigned_dpo        uuid REFERENCES users(id)              ON DELETE SET NULL,
    resolved_at         timestamptz,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_dp_requests_tenant   ON data_principal_requests(tenant_id);
CREATE INDEX ix_dp_requests_entity   ON data_principal_requests(entity_id);
CREATE INDEX ix_dp_requests_employee ON data_principal_requests(employee_id);
CREATE INDEX ix_dp_requests_status   ON data_principal_requests(status);
CREATE INDEX ix_dp_requests_hold     ON data_principal_requests(linked_legal_hold_id);
CREATE INDEX ix_dp_requests_sla      ON data_principal_requests(sla_due_at);

-- ---------------------------------------------------------------------------------
-- E29 — breach_incidents
-- ---------------------------------------------------------------------------------
CREATE TABLE breach_incidents (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    detected_at           timestamptz NOT NULL,
    severity              g01_breach_severity NOT NULL,
    nature                varchar(40) NOT NULL,
    affected_employee_ids uuid[] NOT NULL,
    affected_field_paths  text[],
    dpb_notified_at       timestamptz,
    principals_notified_at timestamptz,
    status                g01_breach_status NOT NULL DEFAULT 'OPEN',
    containment_note      text,
    owner_dpo             uuid REFERENCES users(id)            ON DELETE SET NULL,
    row_version           integer NOT NULL DEFAULT 1,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_breach_incidents_tenant ON breach_incidents(tenant_id);
CREATE INDEX ix_breach_incidents_status ON breach_incidents(status);
CREATE INDEX ix_breach_incidents_owner  ON breach_incidents(owner_dpo);

-- ---------------------------------------------------------------------------------
-- E30 — retention_policies (per record-class statutory schedule)
-- ---------------------------------------------------------------------------------
CREATE TABLE retention_policies (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    record_class        varchar(40) NOT NULL,
    retain_years        integer NOT NULL,
    basis_reference     varchar(160) NOT NULL,
    post_retention_action g01_retention_action NOT NULL,
    erasure_overridable boolean NOT NULL DEFAULT false,
    is_active           boolean NOT NULL DEFAULT true,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_retention_policies_class UNIQUE (tenant_id, record_class),
    CONSTRAINT ck_retention_policies_years CHECK (retain_years >= 0)
);
CREATE INDEX ix_retention_policies_tenant ON retention_policies(tenant_id);

-- ---------------------------------------------------------------------------------
-- E32 — governed_field_change_requests (governed DOB/category/name/gender change)
-- ---------------------------------------------------------------------------------
CREATE TABLE governed_field_change_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    field_path          varchar(60) NOT NULL,
    current_value       text NOT NULL,
    requested_value     text NOT NULL,
    new_effective_from  date NOT NULL,
    justification       text NOT NULL,
    proof_document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    gazette_ref         varchar(120),
    alteration_count    smallint NOT NULL DEFAULT 1,
    approving_authority_id uuid REFERENCES users(id)           ON DELETE SET NULL,
    status              g01_governed_change_status NOT NULL DEFAULT 'DRAFT',
    requires_four_eyes  boolean NOT NULL DEFAULT true,
    applied_attribute_history_id uuid REFERENCES employee_attribute_history(id) ON DELETE SET NULL,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_governed_change_alteration CHECK (alteration_count >= 1)
);
CREATE INDEX ix_governed_change_tenant   ON governed_field_change_requests(tenant_id);
CREATE INDEX ix_governed_change_entity   ON governed_field_change_requests(entity_id);
CREATE INDEX ix_governed_change_employee ON governed_field_change_requests(employee_id);
CREATE INDEX ix_governed_change_status   ON governed_field_change_requests(status);
CREATE INDEX ix_governed_change_attrhist ON governed_field_change_requests(applied_attribute_history_id);
CREATE INDEX ix_governed_change_doc      ON governed_field_change_requests(proof_document_id);

-- ---------------------------------------------------------------------------------
-- E33 — outbox_events (append-only transactional change-feed backbone)
-- BIGSERIAL PK provides the monotonic cursor (BRD E33) — a documented exception to uuid PK.
-- ---------------------------------------------------------------------------------
CREATE TABLE outbox_events (
    event_id        bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    aggregate_id    uuid NOT NULL,                        -- employee_id / position_id
    event_type      varchar(40) NOT NULL,
    payload         jsonb NOT NULL,                       -- minimal, no raw PII
    is_tombstone    boolean NOT NULL DEFAULT false,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    publish_attempts integer NOT NULL DEFAULT 0,
    dead_lettered   boolean NOT NULL DEFAULT false,
    retention_until timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),   -- append-only
    created_by      uuid
);
CREATE INDEX ix_outbox_events_tenant     ON outbox_events(tenant_id);
CREATE INDEX ix_outbox_events_aggregate  ON outbox_events(aggregate_id);
CREATE INDEX ix_outbox_events_type       ON outbox_events(event_type);
CREATE INDEX ix_outbox_events_unpublished ON outbox_events(event_id) WHERE published_at IS NULL AND dead_lettered = false;

-- ---------------------------------------------------------------------------------
-- E34 — break_glass_reveals (append-only reveal ledger)
-- ---------------------------------------------------------------------------------
CREATE TABLE break_glass_reveals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    actor_id            uuid NOT NULL,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    field_path          varchar(120) NOT NULL,
    reason              varchar(300) NOT NULL,
    is_special_category boolean NOT NULL DEFAULT false,
    four_eyes_approver_id uuid,
    revealed_at         timestamptz NOT NULL DEFAULT now(),
    window_count_at_reveal integer NOT NULL,
    anomaly_score       numeric(6,3),
    alerted             boolean NOT NULL DEFAULT false,
    audit_id            uuid,                                  -- link to async audit_log row
    created_at          timestamptz NOT NULL DEFAULT now(),   -- append-only
    created_by          uuid
);
CREATE INDEX ix_break_glass_tenant   ON break_glass_reveals(tenant_id);
CREATE INDEX ix_break_glass_entity   ON break_glass_reveals(entity_id);
CREATE INDEX ix_break_glass_employee ON break_glass_reveals(employee_id);
CREATE INDEX ix_break_glass_actor    ON break_glass_reveals(actor_id);
CREATE INDEX ix_break_glass_revealed ON break_glass_reveals(revealed_at);


-- =====================================================================================
-- SECTION 3 — DEFERRED / FORWARD FOREIGN KEYS
-- =====================================================================================
-- (a) Forward ref inside this module: attribute-history -> governed change request.
ALTER TABLE employee_attribute_history
    ADD CONSTRAINT fk_attr_history_governed_change
    FOREIGN KEY (governed_change_id) REFERENCES governed_field_change_requests(id) ON DELETE SET NULL;

-- (b) Wire the forward FKs the CORE intentionally deferred to this module schema
--     (00-platform-core: employees.aadhaar_ref_key is "vault reference only";
--      employees.primary_photo_id is "FK to G01 employee_photos (module schema)").
--     These ADD CONSTRAINTs do NOT redefine employees — they only attach the satellite FKs.
ALTER TABLE employees
    ADD CONSTRAINT fk_employees_aadhaar_vault
    FOREIGN KEY (aadhaar_ref_key) REFERENCES aadhaar_vault(aadhaar_ref_key) ON DELETE SET NULL;

ALTER TABLE employees
    ADD CONSTRAINT fk_employees_primary_photo
    FOREIGN KEY (primary_photo_id) REFERENCES employee_photos(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION 4 — ROW-LEVEL SECURITY (P02 tenant-isolation; CONVENTIONS §6 template)
-- =====================================================================================
-- Applied to every G01 tenant-scoped table, including append-only ledgers (read isolation;
-- their immutability is a separate grant/trigger concern).
DO $$
DECLARE
    t text;
    g01_tables text[] := ARRAY[
        'employee_contacts','employee_addresses','employee_nominees','employee_emergency_contacts',
        'employee_education','employee_experience','employee_identity_documents','employee_bank_accounts',
        'employee_photos','positions','position_history','employee_job_assignments',
        'g01_authority_assignments','g01_authority_delegations','g01_committees','g01_committee_members',
        'profile_sections','custom_field_definitions','employee_custom_field_values','field_access_policies',
        'employee_profile_completeness','dedup_candidates','employee_import_batches','import_staging_rows',
        'employee_id_aliases','aadhaar_vault','employee_attribute_history','employee_certificates',
        'privacy_notices','data_principal_requests','breach_incidents','retention_policies','legal_holds',
        'governed_field_change_requests','outbox_events','break_glass_reveals'
    ];
BEGIN
    FOREACH t IN ARRAY g01_tables LOOP
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
-- SECTION 5 — SAMPLE SEED ROWS (2-3 per main table)
-- =====================================================================================
-- Reuses fixed UUIDs seeded by 00-platform-core.sql:
--   tenant      11111111-1111-1111-1111-111111111111
--   entity      22222222-2222-2222-2222-222222222201
--   org_unit    33333333-3333-3333-3333-333333333301 / ...302
--   designation 77777777-7777-7777-7777-777777777701
--   grade       55555555-5555-5555-5555-555555555501
--   pay_scale   66666666-6666-6666-6666-666666666601
--   cadre       44444444-4444-4444-4444-444444444401
--   employees   99999999-...-9901 (Anjali Rao), 99999999-...-9902 (Mohan Kumar)
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- aadhaar_vault (must precede the employees FK + identity-doc references) --------------
INSERT INTO aadhaar_vault (aadhaar_ref_key, tenant_id, entity_id, aadhaar_number_encrypted, aadhaar_masked, hash_for_dedup, lawful_basis, lawful_basis_ref, linked_employee_id, kms_key_id, created_by)
VALUES
 ('rk-7a1f0001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201', decode('deadbeef','hex'),'XXXX-XXXX-4321','hmac-9f01','STATUTE','GO-PolicyPay-2019','99999999-9999-9999-9999-999999999901','kms-key-aadhaar-01',NULL),
 ('rk-9c220002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201', decode('beadfeed','hex'),'XXXX-XXXX-7788','hmac-2b02','AUA_KUA','AUA-REG-0456','99999999-9999-9999-9999-999999999902','kms-key-aadhaar-01',NULL);

-- employee_contacts -------------------------------------------------------------------
INSERT INTO employee_contacts (id, tenant_id, entity_id, employee_id, contact_type, contact_value, is_primary, is_verified, visibility)
VALUES
 ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','MOBILE','+91 98xxxxxx21', true, true, 'INTERNAL'),
 ('c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','OFFICIAL_EMAIL','anjali.rao@gov.in', true, true, 'PUBLIC'),
 ('c0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','MOBILE','+91 99xxxxxx34', true, false, 'RESTRICTED');

-- employee_addresses ------------------------------------------------------------------
INSERT INTO employee_addresses (id, tenant_id, entity_id, employee_id, address_type, line1, city, state, pincode, is_current, valid_from)
VALUES
 ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','PERMANENT','12 MG Road','Hyderabad','Telangana','500001', true,'2008-07-14'),
 ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','PERMANENT','7 Lake View','Vijayawada','Andhra Pradesh','520010', true,'1996-06-01');

-- employee_identity_documents (Aadhaar via ref key; PAN via token) --------------------
INSERT INTO employee_identity_documents (id, tenant_id, entity_id, employee_id, doc_type, doc_number_masked, doc_number_token, aadhaar_ref_key, issuing_authority, is_verified)
VALUES
 ('1d000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','AADHAAR','XXXX-XXXX-4321', NULL,'rk-7a1f0001','UIDAI', true),
 ('1d000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','PAN','XXXPK9876L','tok-pan-9876', NULL,'Income Tax Dept', true);

-- employee_bank_accounts --------------------------------------------------------------
INSERT INTO employee_bank_accounts (id, tenant_id, entity_id, employee_id, account_holder_name, bank_name, ifsc_code, account_number_masked, account_number_token, account_type, is_primary_salary, is_verified, effective_from)
VALUES
 ('bb000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','Anjali Rao','SBI','SBIN0001234','XXXXXX4567','tok-acc-4567','SALARY', true, true,'2008-07-14'),
 ('bb000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','Mohan Kumar','HDFC','HDFC0000456','XXXXXX8899','tok-acc-8899','SAVINGS', true, false,'1996-06-01');

-- positions ---------------------------------------------------------------------------
INSERT INTO positions (id, tenant_id, entity_id, position_code, title, designation_id, cadre_id, pay_scale_id, org_unit_id, reports_to_position_id, sanctioned_count, is_vacant, status)
VALUES
 ('b0000000-0000-0000-0000-000000000201','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','POS-REV-DC-01','Deputy Commissioner (Revenue)','77777777-7777-7777-7777-777777777701','44444444-4444-4444-4444-444444444401','66666666-6666-6666-6666-666666666601','33333333-3333-3333-3333-333333333301', NULL, 2, false, 'ACTIVE'),
 ('b0000000-0000-0000-0000-000000000150','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','POS-REV-AS-05','Assessment Officer','77777777-7777-7777-7777-777777777701','44444444-4444-4444-4444-444444444401','66666666-6666-6666-6666-666666666601','33333333-3333-3333-3333-333333333302', 'b0000000-0000-0000-0000-000000000201', 5, true, 'ACTIVE');

-- employee_job_assignments ------------------------------------------------------------
INSERT INTO employee_job_assignments (id, tenant_id, entity_id, employee_id, position_id, designation_id, cadre_id, org_unit_id, pay_scale_id, reporting_manager_id, assignment_type, effective_from, effective_to, change_reason)
VALUES
 ('da000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','b0000000-0000-0000-0000-000000000201','77777777-7777-7777-7777-777777777701','44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333301','66666666-6666-6666-6666-666666666601', NULL,'SUBSTANTIVE','2019-06-01', NULL,'PROMOTION'),
 ('da000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','b0000000-0000-0000-0000-000000000150','77777777-7777-7777-7777-777777777701','44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333302','66666666-6666-6666-6666-666666666601','99999999-9999-9999-9999-999999999901','SUBSTANTIVE','1996-06-01', NULL,'HIRE');

-- PH-02 resolver authority/delegation/committee fixtures ------------------------------
INSERT INTO g01_authority_assignments (id, tenant_id, entity_id, authority_type, authority_code, scope_type, scope_org_unit_id, scope_cadre_id, authority_position_id, authority_employee_id, priority, effective_from, rule_version, source_order_ref, status)
VALUES
 ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRANSFER_AUTHORITY','G05_TRANSFER_REVENUE','ORG_UNIT','33333333-3333-3333-3333-333333333301',NULL,'b0000000-0000-0000-0000-000000000201','99999999-9999-9999-9999-999999999901',10,'2026-01-01','PH-02','GO-TRF-2026-001','ACTIVE'),
 ('a1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ORG_UNIT_HEAD','G03_LEAVE_HEAD_ASSESSMENT','ORG_UNIT','33333333-3333-3333-3333-333333333302',NULL,'b0000000-0000-0000-0000-000000000201','99999999-9999-9999-9999-999999999901',10,'2026-01-01','PH-02','GO-LV-2026-001','ACTIVE'),
 ('a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APPOINTING_AUTHORITY','G06_APPOINTING_GROUP_B','CADRE',NULL,'44444444-4444-4444-4444-444444444401','b0000000-0000-0000-0000-000000000201','99999999-9999-9999-9999-999999999901',10,'2026-01-01','PH-02','GO-APP-2026-001','ACTIVE'),
 ('a1000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SR_CUSTODIAN','G12_SR_CUSTODIAN_ENTITY','ENTITY',NULL,NULL,'b0000000-0000-0000-0000-000000000201','99999999-9999-9999-9999-999999999901',10,'2026-01-01','PH-02','GO-SR-2026-001','ACTIVE');

INSERT INTO g01_authority_delegations (id, tenant_id, entity_id, authority_assignment_id, from_employee_id, to_employee_id, delegation_kind, effective_from, effective_to, reason, source_order_ref, status)
VALUES
 ('d1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a1000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','99999999-9999-9999-9999-999999999902','ACTING_CHARGE','2026-07-01','2026-07-31','PH-02 acting-charge fixture; P01 SoD still blocks self-approval','GO-ACT-2026-001','ACTIVE');

INSERT INTO g01_committees (id, tenant_id, entity_id, committee_code, committee_type, name, scope_org_unit_id, scope_cadre_id, quorum_required, effective_from, source_module, status)
VALUES
 ('c1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PH02-DPC-REVENUE','DPC','PH-02 Revenue DPC Fixture','33333333-3333-3333-3333-333333333301','44444444-4444-4444-4444-444444444401',2,'2026-01-01','G06','ACTIVE');

INSERT INTO g01_committee_members (id, tenant_id, entity_id, committee_id, member_employee_id, external_member_name, member_role, voting_weight, is_required_for_quorum, status, effective_from)
VALUES
 ('c2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','c1000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901',NULL,'CHAIRPERSON',1.00,true,'ACTIVE','2026-01-01'),
 ('c2000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','c1000000-0000-0000-0000-000000000001',NULL,'External PSC Nominee','EXPERT',1.00,true,'ACTIVE','2026-01-01');

-- employee_attribute_history (append-only; name change spine) -------------------------
INSERT INTO employee_attribute_history (id, tenant_id, entity_id, employee_id, attribute_path, value_text, effective_from, effective_to, change_reason, source, gazette_ref, recorded_by, created_by)
VALUES
 ('ab000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','last_name','Verma','2008-07-14','2012-11-30','HIRE','HR_DIRECT', NULL,'99999999-9999-9999-9999-999999999901',NULL),
 ('ab000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','last_name','Rao','2012-12-01', NULL,'MARRIAGE','GOVERNED_CHANGE','GAZ-2012-8841','99999999-9999-9999-9999-999999999901',NULL);

-- employee_certificates ---------------------------------------------------------------
INSERT INTO employee_certificates (id, tenant_id, entity_id, employee_id, certificate_type, certificate_number, issuing_authority, valid_from, valid_to, is_creamy_layer, is_verified, status)
VALUES
 ('ce000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','OBC_NON_CREAMY','OBC/2025/4471','Tahsildar, Vijayawada','2025-04-01','2026-03-31', false, true,'VALID');

-- privacy_notices ---------------------------------------------------------------------
INSERT INTO privacy_notices (id, tenant_id, entity_id, notice_key, version, purpose, language, body_text, effective_from, is_active)
VALUES
 ('9a000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PROFILE_PROCESSING','v1','IDENTITY_DISPLAY','en','Purpose, rights and DPO contact for HR profile processing.','2026-01-01', true),
 ('9a000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BIOMETRIC_ATTENDANCE','v1','BIOMETRIC_ATTENDANCE','en','Consent notice for biometric attendance processing.','2026-01-01', true);

-- legal_holds -------------------------------------------------------------------------
INSERT INTO legal_holds (id, tenant_id, entity_id, employee_id, hold_type, reason, placed_by, source_module, placed_at, status)
VALUES
 ('11100000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','DISCIPLINARY','Pending inquiry CV-2026-12','99999999-9999-9999-9999-999999999901','G09','2026-04-01T00:00:00Z','ACTIVE');

-- retention_policies ------------------------------------------------------------------
INSERT INTO retention_policies (id, tenant_id, entity_id, record_class, retain_years, basis_reference, post_retention_action, erasure_overridable)
VALUES
 ('7e000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SERVED_EMPLOYEE', 75,'Service-Record Rules','ARCHIVE', false),
 ('7e000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APPLICANT', 2,'DPDP minimisation','PURGE', true);

-- governed_field_change_requests (needs a documents row for the mandatory proof FK) ----
INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, classification, status, source_channel, created_by)
VALUES ('d0c00000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC-GCR-0001','DOB correction affidavit','CONFIDENTIAL','ACTIVE','WEB_UPLOAD',NULL);

INSERT INTO governed_field_change_requests (id, tenant_id, entity_id, employee_id, field_path, current_value, requested_value, new_effective_from, justification, proof_document_id, alteration_count, status)
VALUES
 ('9c000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','dob','1972-11-30','1973-01-10','1973-01-10','Matriculation certificate correction','d0c00000-0000-0000-0000-000000000001', 1,'UNDER_REVIEW');

-- data_principal_requests -------------------------------------------------------------
INSERT INTO data_principal_requests (id, tenant_id, entity_id, employee_id, request_type, status, sla_due_at, linked_legal_hold_id)
VALUES
 ('d9000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','ACCESS','ACTIONED','2026-07-07T00:00:00Z', NULL),
 ('d9000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','ERASURE','REJECTED','2026-07-10T00:00:00Z','11100000-0000-0000-0000-000000000001');

-- outbox_events (append-only) ---------------------------------------------------------
INSERT INTO outbox_events (tenant_id, entity_id, aggregate_id, event_type, payload, occurred_at, retention_until, created_by)
VALUES
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','PLACEMENT_CHANGED','{"position_code":"POS-REV-DC-01"}','2026-06-30T05:12:00Z','2026-07-30T05:12:00Z',NULL),
 ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','GOVERNED_FIELD_CHANGED','{"field":"dob","status":"UNDER_REVIEW"}','2026-06-29T07:00:00Z','2026-07-29T07:00:00Z',NULL);

-- break_glass_reveals (append-only) ---------------------------------------------------
INSERT INTO break_glass_reveals (id, tenant_id, entity_id, actor_id, employee_id, field_path, reason, is_special_category, revealed_at, window_count_at_reveal, anomaly_score, alerted, created_by)
VALUES
 ('b9000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','99999999-9999-9999-9999-999999999902','aadhaar_vault.aadhaar_number','Pension KYC INC-4571', false,'2026-06-15T09:00:00Z', 3, 0.40, false,NULL),
 ('b9000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','99999999-9999-9999-9999-999999999902','employees.category','Roster audit AUD-22', true,'2026-06-18T11:00:00Z', 18, 2.10, true,NULL);

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- SECTION 6 — RECON ADDITIONS (2026-07-01) — additive-only reconciliation deltas
-- =====================================================================================
-- Source of truth: docs/data-model/reconciliation/g01-profile-fields.md.
-- Everything here is ADD-only: new tables, ADD COLUMN, ADD VALUE, ADD CONSTRAINT. No
-- existing DDL above this section is modified. Runs in psql autocommit (each statement
-- commits), so ALTER TYPE ... ADD VALUE below is usable by the seeds further down.

-- ---------------------------------------------------------------------------------
-- 6.1 — national_id_types (configurable statutory-ID master; CONVENTIONS §4 master table,
--       replacing reliance on the closed g01_identity_doc_type enum). Grounds:
--       National_ID-Export_1_.csv (Aadhaar/PAN/Passport/DL/EPF/ESIC/PRAN/UAN…).
-- ---------------------------------------------------------------------------------
CREATE TABLE national_id_types (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    id_code                  varchar(60)  NOT NULL,               -- CSV "Code" (adhar_card_number, bank_pan_num…)
    label                    varchar(160) NOT NULL,               -- CSV "Option"
    applicable_for           varchar(40)  NOT NULL DEFAULT 'All Employees',  -- CSV "Applicable For" (India / All Employees)
    is_enabled               boolean NOT NULL DEFAULT true,       -- CSV "Enable/Disable"
    alias                    varchar(160),                        -- CSV "Alias"
    temporary_id_enabled     boolean NOT NULL DEFAULT false,      -- CSV "Temporary ID Enable/Disable"
    temporary_id_alias       varchar(120),                        -- CSV "Temporary ID Alias"
    issued_from_enabled      boolean NOT NULL DEFAULT false,
    issued_from_alias        varchar(120),
    issued_from_mandatory    boolean NOT NULL DEFAULT false,
    issued_till_enabled      boolean NOT NULL DEFAULT false,
    issued_till_alias        varchar(120),
    issued_till_mandatory    boolean NOT NULL DEFAULT false,
    id_document_enabled      boolean NOT NULL DEFAULT false,      -- CSV "ID Document Enable/Disable"
    id_document_alias        varchar(120),
    id_document_mandatory    boolean NOT NULL DEFAULT false,      -- drives whether a scan is required
    mandatory_for_activation boolean NOT NULL DEFAULT false,      -- CSV "Mandatory for Activation"
    mandatory_for_addition   boolean NOT NULL DEFAULT false,      -- CSV "Mandatory for Addition"
    is_unique                boolean NOT NULL DEFAULT false,      -- CSV "Is Unique"
    masking                  varchar(40),                         -- CSV "Masking" (nullable mask pattern)
    maps_to_doc_type         g01_identity_doc_type,               -- optional bridge to the legacy closed enum
    display_order            smallint NOT NULL DEFAULT 0,
    row_version              integer NOT NULL DEFAULT 1,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_national_id_types_code UNIQUE (tenant_id, id_code)
);
CREATE INDEX ix_national_id_types_tenant  ON national_id_types(tenant_id);
CREATE INDEX ix_national_id_types_entity  ON national_id_types(entity_id);
CREATE INDEX ix_national_id_types_enabled ON national_id_types(is_enabled) WHERE is_enabled;
COMMENT ON TABLE national_id_types IS 'Tenant-configurable statutory-ID type master (G01 RECON). Per-type alias, mandatory, temporary-id, issued-from/till and document config; per-employee values live in employee_identity_documents.';

-- 6.2 — extend per-employee statutory-ID storage to reference the config master + temp-ID.
ALTER TABLE employee_identity_documents
    ADD COLUMN national_id_type_id uuid REFERENCES national_id_types(id) ON DELETE RESTRICT,
    ADD COLUMN is_temporary_id     boolean NOT NULL DEFAULT false,
    ADD COLUMN temporary_id_value  varchar(60);
CREATE INDEX ix_employee_identity_documents_type ON employee_identity_documents(national_id_type_id);

-- ---------------------------------------------------------------------------------
-- 6.3 — custom_field_definitions: add the CSV framework attributes the profile-scoped
--       baseline lacked, and allow non-profile-section fields (CSV "Display in" targets).
-- ---------------------------------------------------------------------------------
ALTER TYPE g01_custom_field_type ADD VALUE IF NOT EXISTS 'DROPDOWN';
ALTER TYPE g01_custom_field_type ADD VALUE IF NOT EXISTS 'MULTI_SELECT_DROPDOWN';
ALTER TYPE g01_custom_field_type ADD VALUE IF NOT EXISTS 'TEXT_AREA';

ALTER TABLE custom_field_definitions
    ADD COLUMN external_field_id varchar(40),      -- CSV "Field Id" (a64902e57de4a6-style)
    ADD COLUMN display_target    varchar(80),      -- CSV "Display in" (HR Documents, Recruitment Requisition…)
    ADD COLUMN for_object        varchar(40),      -- CSV "FOR" (object class; e.g. Others)
    ADD COLUMN is_editable       boolean NOT NULL DEFAULT true,   -- CSV "Is Editable"
    ADD COLUMN allow_decimals    boolean NOT NULL DEFAULT false,  -- CSV "Allow Decimals"
    ADD COLUMN number_separator  varchar(8);        -- CSV "Number Separator"
ALTER TABLE custom_field_definitions ALTER COLUMN section_id DROP NOT NULL;  -- CSV fields target arbitrary HR objects, not only profile sections
CREATE INDEX ix_custom_field_def_target   ON custom_field_definitions(display_target);
CREATE UNIQUE INDEX uq_custom_field_def_extid
    ON custom_field_definitions(tenant_id, external_field_id) WHERE external_field_id IS NOT NULL AND is_deleted = false;

-- ---------------------------------------------------------------------------------
-- 6.4 — employee_personal_details (1:1 biographical satellite for Profile.docx fields
--       not present on the core employees golden record; core is NOT redefined).
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_personal_details (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    country_of_birth         varchar(80),
    place_of_birth           varchar(120),
    marital_status_since     date,
    marriage_anniversary_date date,
    father_name              varchar(160),
    mother_name              varchar(160),
    spouse_name              varchar(160),
    languages_spoken         text[],
    linkedin_id              varchar(200),
    row_version              integer NOT NULL DEFAULT 1,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_personal_details_employee UNIQUE (employee_id)
);
CREATE INDEX ix_employee_personal_details_tenant   ON employee_personal_details(tenant_id);
CREATE INDEX ix_employee_personal_details_entity   ON employee_personal_details(entity_id);
CREATE INDEX ix_employee_personal_details_employee ON employee_personal_details(employee_id);

-- 6.5 — RLS for the RECON tables (CONVENTIONS §6 tenant-isolation template).
DO $$
DECLARE
    t text;
    recon_tables text[] := ARRAY['national_id_types','employee_personal_details'];
BEGIN
    FOREACH t IN ARRAY recon_tables LOOP
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

-- 6.6 — RECON sample seed rows (reuse the fixed tenant/entity/employee UUIDs from Section 5).
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- national_id_types (configurable statutory-ID master) --------------------------------
INSERT INTO national_id_types (id, tenant_id, entity_id, id_code, label, applicable_for, is_enabled, alias, temporary_id_enabled, temporary_id_alias, issued_from_enabled, issued_from_alias, issued_till_enabled, issued_till_alias, id_document_enabled, mandatory_for_activation, mandatory_for_addition, is_unique, maps_to_doc_type, display_order)
VALUES
 ('a1d70000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','adhar_card_number','Aadhaar','India', true,'Aadhaar', true,'Temporary', false, NULL, false, NULL, false, false, false, true,'AADHAAR',1),
 ('a1d70000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','bank_pan_num','PAN','India', true,'PAN', false, NULL, false, NULL, false, NULL, false, false, false, true,'PAN',2),
 ('a1d70000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','passport_number','Passport','All Employees', true,'Passport', false, NULL, true,'Issued From', true,'Issued Till', false, false, false, false,'PASSPORT',3);

-- link the seeded PAN identity document to its configurable type ----------------------
UPDATE employee_identity_documents
   SET national_id_type_id = 'a1d70000-0000-0000-0000-000000000002'
 WHERE id = '1d000000-0000-0000-0000-000000000002';
UPDATE employee_identity_documents
   SET national_id_type_id = 'a1d70000-0000-0000-0000-000000000001'
 WHERE id = '1d000000-0000-0000-0000-000000000001';

-- profile_sections + custom_field_definitions + one value (CSV framework demo) ---------
INSERT INTO profile_sections (id, tenant_id, entity_id, section_key, label, display_order, is_system)
VALUES ('5ec70000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','HR_DOCUMENTS','HR Documents', 10, true);

INSERT INTO custom_field_definitions (id, tenant_id, entity_id, section_id, field_key, label, data_type, is_required, display_order, external_field_id, display_target, for_object, is_editable, allow_decimals, number_separator)
VALUES
 ('cfd00000-0000-0000-0000-000000000001'::uuid,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','5ec70000-0000-0000-0000-000000000001','annual_compensation','Annual Compensation','NUMBER', true, 1,'a66c4614e7f7ac','HR Documents','Others', false, true,','),
 ('cfd00000-0000-0000-0000-000000000002'::uuid,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201', NULL,'reason_for_letter','Reason for letter','DROPDOWN', false, 2,'a64902e57de4a6','HR Documents','Others', false, false, NULL);

INSERT INTO employee_custom_field_values (id, tenant_id, entity_id, employee_id, field_def_id, value_number)
VALUES ('cf00a000-0000-0000-0000-000000000001'::uuid,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','cfd00000-0000-0000-0000-000000000001'::uuid, 1850000);

-- employee_personal_details (biographical satellite) ----------------------------------
INSERT INTO employee_personal_details (id, tenant_id, entity_id, employee_id, country_of_birth, place_of_birth, marital_status_since, father_name, languages_spoken, linkedin_id)
VALUES
 ('9e700000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','India','Hyderabad','2012-12-01','Ramesh Verma', ARRAY['Telugu','English','Hindi'],'in.linkedin.com/in/anjali-rao'),
 ('9e700000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','India','Vijayawada', NULL,'Kotaiah Kumar', ARRAY['Telugu','English'], NULL);

RESET app.current_tenant_id;
RESET app.is_platform_admin;


-- =====================================================================================
-- SECTION 7 — RECON (prototype) ADDITIONS (2026-07-01) — additive-only reconciliation
--   of the PrimeSoft prototype employee-profile screens against G01 + platform-core.
-- =====================================================================================
-- Source of truth: docs/data-model/reconciliation/prototype-g01-profile.md.
-- Screens reconciled: add-skill, add-visa, add-certification (professional), add-education,
--   add-experience, bank-entry, nominees, add-dependent, plus the *-employee-detail /
--   my-profile / directory / org-chart display surfaces. ADD-only: new enums, new tables,
--   ADD COLUMN, ALTER TYPE ADD VALUE. Nothing above is modified; core employees /
--   employee_dependents are NOT redefined (only satellites + data inserts). Runs in psql
--   autocommit so ALTER TYPE ... ADD VALUE is usable by seeds below.

-- 7.1 — new module enums (prototype-driven closed sets) -------------------------------
CREATE TYPE g01_skill_proficiency  AS ENUM ('BEGINNER','INTERMEDIATE','ADVANCED','EXPERT');   -- add-skill "Proficiency"
CREATE TYPE g01_visa_sponsor_type  AS ENUM ('SELF_SPONSORED','EXTERNAL_SPONSOR');             -- add-visa "Sponsored by"
CREATE TYPE g01_penny_drop_status  AS ENUM ('PENDING','VERIFIED','FAILED');                   -- bank-entry "Penny drop status"

-- nominees "Type": ESIC is a statutory nomination class absent from the benefit enum.
ALTER TYPE g01_benefit_type ADD VALUE IF NOT EXISTS 'ESIC';

-- 7.2 — in-place column adds on existing satellites -----------------------------------
-- add-education: "Start year" + "Grade type" (CGPA/GPA/Percentage/Grade) — value already
-- stored in grade_or_percentage; the qualifier and the start year were absent.
ALTER TABLE employee_education
    ADD COLUMN start_year smallint,                       -- add-education "Start year" (year_of_passing = End year)
    ADD COLUMN grade_type varchar(20),                    -- add-education "Grade type" (CGPA/GPA/PERCENTAGE/GRADE)
    ADD CONSTRAINT ck_employee_education_start_year
        CHECK (start_year IS NULL OR start_year BETWEEN 1950 AND 2100);

-- add-experience: free-text "Description" of the prior role.
ALTER TABLE employee_experience
    ADD COLUMN job_description varchar(500);               -- add-experience "Description"

-- bank-entry: "Penny drop status" is tri-state (Pending/Verified/Failed); is_verified alone
-- cannot represent FAILED. Add the status column (is_verified retained for back-compat).
ALTER TABLE employee_bank_accounts
    ADD COLUMN penny_drop_status g01_penny_drop_status NOT NULL DEFAULT 'PENDING';

-- ---------------------------------------------------------------------------------
-- 7.3 — employee_profile_skills (add-skill: Skill name / Proficiency / Years of experience / Last used)
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_profile_skills (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    skill_name          varchar(120) NOT NULL,                -- "Skill name" (e.g. Python)
    proficiency         g01_skill_proficiency,                -- "Proficiency"
    years_of_experience numeric(4,1),                         -- "Years of experience"
    last_used_date      date,                                 -- "Last used"
    is_verified         boolean NOT NULL DEFAULT false,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_skills_years CHECK (years_of_experience IS NULL OR years_of_experience >= 0)
);
CREATE INDEX ix_employee_profile_skills_tenant   ON employee_profile_skills(tenant_id);
CREATE INDEX ix_employee_profile_skills_entity   ON employee_profile_skills(entity_id);
CREATE INDEX ix_employee_profile_skills_employee ON employee_profile_skills(employee_id);
-- one non-deleted row per (employee, skill)
CREATE UNIQUE INDEX uq_employee_skills_name
    ON employee_profile_skills(employee_id, lower(skill_name)) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------------
-- 7.4 — employee_visas (add-visa: Country / Visa type / Number / Issue-Valid-till /
--       Issuing authority / Max stay / Sponsor / scan). Distinct from statutory IDs.
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_visas (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    country            varchar(80) NOT NULL,                  -- "Country"
    visa_type          varchar(80) NOT NULL,                  -- "Visa type" (Employment Pass, Dependent visa, Schengen Short-stay, Other)
    visa_number        varchar(60),                           -- "Visa number" (As printed)
    issue_date         date,                                  -- "Issue date"
    valid_till         date,                                  -- "Valid till"
    issuing_authority  varchar(160),                          -- "Issuing authority"
    max_stay_days      smallint,                              -- "Maximum stay (days per entry)"
    sponsor_type       g01_visa_sponsor_type,                 -- "Sponsored by" (Self/External)
    sponsored_by       varchar(200),                          -- external sponsor name
    is_dependent_visa  boolean NOT NULL DEFAULT false,        -- "Dependent visa"
    scan_document_id   uuid REFERENCES documents(id)          ON DELETE SET NULL,  -- "Visa scan / soft copy"
    row_version        integer NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_visas_dates CHECK (valid_till IS NULL OR issue_date IS NULL OR valid_till >= issue_date),
    CONSTRAINT ck_employee_visas_maxstay CHECK (max_stay_days IS NULL OR max_stay_days >= 0)
);
CREATE INDEX ix_employee_visas_tenant   ON employee_visas(tenant_id);
CREATE INDEX ix_employee_visas_entity   ON employee_visas(entity_id);
CREATE INDEX ix_employee_visas_employee ON employee_visas(employee_id);
CREATE INDEX ix_employee_visas_doc      ON employee_visas(scan_document_id);
CREATE INDEX ix_employee_visas_expiry   ON employee_visas(valid_till) WHERE valid_till IS NOT NULL;

-- ---------------------------------------------------------------------------------
-- 7.5 — employee_professional_certifications (add-certification: professional creds e.g.
--       AWS Solutions Architect). Distinct from statutory employee_certificates (E25:
--       caste/EWS/PWD_UDID/domicile). Grounds: add-certification.txt.
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_professional_certifications (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id              uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id            uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    certification_name     varchar(200) NOT NULL,             -- "Certification name"
    issuing_organisation   varchar(200),                      -- "Issuing organisation"
    credential_id          varchar(120),                      -- "Credential ID"
    issue_date             date,                              -- "Issue date"
    expiry_date            date,                              -- "Expiry date"
    is_verified            boolean NOT NULL DEFAULT false,
    certificate_document_id uuid REFERENCES documents(id)     ON DELETE SET NULL,  -- "Certificate file"
    row_version            integer NOT NULL DEFAULT 1,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_prof_cert_dates CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date)
);
CREATE INDEX ix_prof_cert_tenant   ON employee_professional_certifications(tenant_id);
CREATE INDEX ix_prof_cert_entity   ON employee_professional_certifications(entity_id);
CREATE INDEX ix_prof_cert_employee ON employee_professional_certifications(employee_id);
CREATE INDEX ix_prof_cert_doc      ON employee_professional_certifications(certificate_document_id);
CREATE INDEX ix_prof_cert_expiry   ON employee_professional_certifications(expiry_date) WHERE expiry_date IS NOT NULL;

-- ---------------------------------------------------------------------------------
-- 7.6 — employee_dependent_details (add-dependent extras + "Insurance covered" column on
--       the *-employee-detail dependents grid). 1:1 satellite of core employee_dependents
--       (which is NOT redefined); carries the fields the core golden record lacks.
-- ---------------------------------------------------------------------------------
CREATE TABLE employee_dependent_details (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id)             ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id)                     ON DELETE RESTRICT,
    dependent_id                uuid NOT NULL REFERENCES employee_dependents(id) ON DELETE RESTRICT,
    nationality                 varchar(40),                  -- add-dependent "Nationality"
    phone                       varchar(20),                  -- add-dependent "Phone"
    country_code                varchar(5) DEFAULT '+91',
    address_line                varchar(320),                 -- add-dependent "Address"
    same_as_employee_address    boolean NOT NULL DEFAULT false,  -- "Same as employee address?"
    is_covered_group_insurance  boolean NOT NULL DEFAULT false,  -- "Add to group medical insurance" / detail grid "Insurance covered"
    row_version                 integer NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_dependent_details UNIQUE (dependent_id)
);
CREATE INDEX ix_dependent_details_tenant    ON employee_dependent_details(tenant_id);
CREATE INDEX ix_dependent_details_entity    ON employee_dependent_details(entity_id);
CREATE INDEX ix_dependent_details_dependent ON employee_dependent_details(dependent_id);

-- 7.7 — RLS for the prototype RECON tables (CONVENTIONS §6 tenant-isolation template).
DO $$
DECLARE
    t text;
    recon_tables text[] := ARRAY['employee_profile_skills','employee_visas',
                                  'employee_professional_certifications','employee_dependent_details'];
BEGIN
    FOREACH t IN ARRAY recon_tables LOOP
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

-- 7.8 — prototype RECON sample seed rows (reuse fixed tenant/entity/employee UUIDs).
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- employee_profile_skills ----------------------------------------------------------------------
INSERT INTO employee_profile_skills (id, tenant_id, entity_id, employee_id, skill_name, proficiency, years_of_experience, last_used_date, is_verified)
VALUES
 ('5c110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','Python','ADVANCED', 8.0,'2026-06-01', true),
 ('5c110000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','PostgreSQL','INTERMEDIATE', 5.5,'2026-05-15', false),
 ('5c110000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','Project Management','EXPERT', 15.0,'2026-06-20', false);

-- employee_visas -----------------------------------------------------------------------
INSERT INTO employee_visas (id, tenant_id, entity_id, employee_id, country, visa_type, visa_number, issue_date, valid_till, issuing_authority, max_stay_days, sponsor_type, sponsored_by, is_dependent_visa)
VALUES
 ('71540000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','Singapore','Employment Pass','EP-4471228','2025-02-10','2027-02-09','Ministry of Manpower', 90,'EXTERNAL_SPONSOR','PrimeSoft Pte Ltd', false),
 ('71540000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','Germany','Schengen Short-stay','C-90887711','2026-01-05','2026-07-04','U.S. Consulate, Chennai', 180,'SELF_SPONSORED', NULL, false);

-- employee_professional_certifications -------------------------------------------------
INSERT INTO employee_professional_certifications (id, tenant_id, entity_id, employee_id, certification_name, issuing_organisation, credential_id, issue_date, expiry_date, is_verified)
VALUES
 ('ce270000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','AWS Solutions Architect – Associate','Amazon Web Services','AWS-ASA-88213','2024-09-01','2027-09-01', true),
 ('ce270000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','PMP','Project Management Institute','PMP-552310','2019-03-15','2025-03-15', false);

-- dependents (core table; data insert only — NOT a redefinition) + 1:1 detail satellite -
INSERT INTO employee_dependents (id, tenant_id, entity_id, employee_id, full_name, relationship, dob, gender, is_dependent, national_id_masked)
VALUES
 ('de900000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','Spouse One','SPOUSE','1986-08-20','MALE', true,'XXXX XXXX 4321'),
 ('de900000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','Child One','SON','2014-04-02','MALE', true, NULL);

INSERT INTO employee_dependent_details (id, tenant_id, entity_id, dependent_id, nationality, phone, address_line, same_as_employee_address, is_covered_group_insurance)
VALUES
 ('dd900000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','de900000-0000-0000-0000-000000000001','Indian','+91 98XXXX4455', NULL, true, true),
 ('dd900000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','de900000-0000-0000-0000-000000000002','Indian', NULL, NULL, true, true);

RESET app.current_tenant_id;
RESET app.is_platform_admin;


-- =====================================================================================
-- END 01-G01-employee-profile.sql
-- =====================================================================================
