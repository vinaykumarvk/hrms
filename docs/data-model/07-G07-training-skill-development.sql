-- =====================================================================================
-- GOVERNMENT HRMS — G07 TRAINING & SKILL DEVELOPMENT MANAGEMENT (07-G07-...sql)
-- =====================================================================================
-- Module-owned DDL for G07 (alias GOV-M07). Authors the 37 module entities of BRD v3 §5.1.
-- Platform-native extension of PrimeSoft: competency framework, skill inventory, gap
-- analysis, training calendar/plan, catalog/content, sessions, nominations, campaigns,
-- attendance, assessment, certification, external credentials, vendor empanelment,
-- sponsorship/service-bond, LMS/LRS metadata, budget/cost, and DPDP retention.
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                         (MANDATORY conventions)
--   docs/data-model/00-platform-core.sql                   (shared core — FK targets)
--   docs/brd/v3/G07-training-skill-development.md §5        (entities, enums, integrity)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Run AFTER 00-platform-core.sql (and 01-G01 for the employee satellites,
--   though G07 only needs the core `employees`/`org_units`/`designations`/`roles`/
--   `documents`/`workflow_instances`/`service_register_events`/`integration_credentials`
--   tables, all defined in 00). Load order: 00 -> 01 -> ... -> 07.
--
-- CORE TABLES REFERENCED (FK by id; NEVER redefined here):
--   tenants, entities, org_units, designations, roles, employees,
--   workflow_instances (P01), documents (G13), service_register_events (G12),
--   integration_credentials (P04/X.3).  audit_log/notifications/jobs are written by the
--   platform substrate (P05 trigger / X.2 / X.1), not by module DDL.
--
-- KEY DESIGN POINTS (per BRD + CONVENTIONS):
--   * Every business table carries tenant_id (NOT NULL) + entity_id where entity-scoped.
--   * Standard audit columns on non-ledger tables; append-only LEDGERS carry only
--     created_at/created_by (NO updated_at, NO is_deleted): skill_assessments,
--     training_assessments, training_feedback, cpd_records, credential_verifications,
--     learning_data_retention_actions.
--   * Nominations / plans / campaigns / empanelment / sponsorship / master publication run
--     on the P01 engine — `workflow_instance_id` references workflow_instances; this schema
--     stores the reference only and does NOT re-implement approval state machines.
--   * LMS/LRS connectors store `integration_credential_ref` -> a P04 integration_credentials
--     reference; NO plaintext secret is ever stored in a module table.
--   * Significant certifications post to the core G12 ledger: `service_register_event_id`
--     references service_register_events. G07 is a WRITER via G12's ingestion contract;
--     it never mutates the ledger in DDL (no trigger/insert into it here).
--   * Module enums use Postgres ENUM types (closed enumerations), prefixed `g07_`, with
--     UPPER_SNAKE_CASE values, to avoid collision with core types.
--   * RLS: the canonical tenant-isolation policy (CONVENTIONS §6) is applied to ALL 37
--     tables (Section R), including the append-only ledgers (read isolation).
--
-- CORE-TABLE ASSUMPTIONS:
--   * `roles` exists in core (RBAC v1.7) — used by competency_models.role_id (ROLE scope).
--   * `designations`/`org_units` exist in core — competency_models scope keys.
--   * Seed rows reuse the 00-core fixed UUIDs (tenant 1111…1111, employees 9999…9901/02,
--     org_unit 3333…3301, designation 7777…7701, role 8888…8802, SR event aaaa…aa01).
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G07 closed enumerations; BRD §5.5)
-- =====================================================================================
CREATE TYPE g07_master_status          AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE g07_content_status         AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TYPE g07_active_status          AS ENUM ('ACTIVE','INACTIVE');

CREATE TYPE g07_competency_type        AS ENUM ('TECHNICAL','BEHAVIOURAL','LEADERSHIP','FUNCTIONAL','COMPLIANCE');
CREATE TYPE g07_model_scope_type       AS ENUM ('DESIGNATION','ROLE','CADRE','ORG_UNIT','GENERIC');

CREATE TYPE g07_skill_source           AS ENUM ('SELF','MANAGER','ASSESSMENT','CERTIFICATION','IMPORT');
CREATE TYPE g07_skill_status           AS ENUM ('DECLARED','VALIDATED','EXPIRED','REVOKED');
CREATE TYPE g07_freshness_status       AS ENUM ('FRESH','STALE','EXPIRED');

CREATE TYPE g07_scoring_mode           AS ENUM ('BINARY','WEIGHTED');
CREATE TYPE g07_recompute_trigger      AS ENUM ('FULL','INCREMENTAL_SKILL_EVENT','INCREMENTAL_MODEL_EVENT','ON_DEMAND');
CREATE TYPE g07_gap_analysis_status    AS ENUM ('DRAFT','FINALIZED','SUPERSEDED');
CREATE TYPE g07_gap_item_source        AS ENUM ('GAP_ANALYSIS','APPRAISAL','MANDATORY');

CREATE TYPE g07_need_source            AS ENUM ('GAP_ANALYSIS','APPRAISAL','MANDATORY','MANAGER','SELF','INDUCTION');
CREATE TYPE g07_need_priority          AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE g07_need_status            AS ENUM ('IDENTIFIED','CONSOLIDATED','PLANNED','ADDRESSED','DEFERRED','REJECTED');

CREATE TYPE g07_plan_status            AS ENUM ('DRAFT','SUBMITTED','APPROVED','ACTIVE','CLOSED');
CREATE TYPE g07_plan_item_status       AS ENUM ('PLANNED','SCHEDULED','COMPLETED','DROPPED');
CREATE TYPE g07_budget_status          AS ENUM ('DRAFT','APPROVED','CLOSED');

CREATE TYPE g07_delivery_mode          AS ENUM ('CLASSROOM','ELEARNING','BLENDED','EXTERNAL','ON_THE_JOB','WEBINAR');
CREATE TYPE g07_provider_type          AS ENUM ('INTERNAL','EXTERNAL','VENDOR','GOVT_INSTITUTE');
CREATE TYPE g07_trainer_type           AS ENUM ('INTERNAL','EXTERNAL');
CREATE TYPE g07_venue_type             AS ENUM ('PHYSICAL','VIRTUAL');
CREATE TYPE g07_session_status         AS ENUM ('DRAFT','OPEN','FULL','RUNNING','COMPLETED','CANCELLED');

CREATE TYPE g07_nomination_type        AS ENUM ('SELF','MANAGER','HR','MANDATORY','INDUCTION','CAMPAIGN');
CREATE TYPE g07_nomination_status      AS ENUM ('DRAFT','PENDING_L1','PENDING_L2','APPROVED','WAITLISTED','REJECTED','WITHDRAWN','CANCELLED','COMPLETED','NO_SHOW');
CREATE TYPE g07_completion_status      AS ENUM ('PASS','FAIL','INCOMPLETE');

CREATE TYPE g07_attendance_status      AS ENUM ('PRESENT','ABSENT','LATE','EXCUSED');
CREATE TYPE g07_capture_mode           AS ENUM ('ONLINE','KIOSK','ASSISTED','OFFLINE_SYNC','LMS_DERIVED');
CREATE TYPE g07_attendance_actor_type  AS ENUM ('EMPLOYEE','TRAINER','KIOSK_OPERATOR');

CREATE TYPE g07_assessment_phase       AS ENUM ('PRE','POST','REASSESSMENT');
CREATE TYPE g07_assessment_result      AS ENUM ('PASS','FAIL');
CREATE TYPE g07_assessment_actor_type  AS ENUM ('EMPLOYEE','TRAINER','SYSTEM');
CREATE TYPE g07_kirkpatrick_level      AS ENUM ('L1_REACTION','L2_LEARNING','L3_BEHAVIOUR','L4_RESULTS');

CREATE TYPE g07_credential_source      AS ENUM ('INTERNAL_PROGRAM','EXTERNAL_PROFESSIONAL');
CREATE TYPE g07_verification_status    AS ENUM ('NOT_REQUIRED','PENDING','VERIFIED','REJECTED');
CREATE TYPE g07_certification_status   AS ENUM ('ACTIVE','EXPIRED','REVOKED','SUPERSEDED');
CREATE TYPE g07_sr_posting_status      AS ENUM ('NOT_REQUIRED','PENDING','POSTED','FAILED');
CREATE TYPE g07_verification_action    AS ENUM ('SUBMITTED','EVIDENCE_REVIEWED','VERIFIED','REJECTED','RE_VERIFIED');
CREATE TYPE g07_verification_method    AS ENUM ('DOCUMENT','ISSUER_PORTAL','THIRD_PARTY','MANUAL_ATTEST');

CREATE TYPE g07_cost_type              AS ENUM ('TRAINER_FEE','VENUE','MATERIAL','TRAVEL','REIMBURSEMENT','LMS_LICENSE','SPONSORSHIP','BOND_RECOVERY','OTHER');
CREATE TYPE g07_cost_stage             AS ENUM ('COMMITTED','ACTUAL');
CREATE TYPE g07_cost_status            AS ENUM ('DRAFT','APPROVED','PAID','CANCELLED');

CREATE TYPE g07_lms_standard           AS ENUM ('SCORM_12','SCORM_2004','XAPI','NONE');
CREATE TYPE g07_sync_mode              AS ENUM ('XAPI_LRS','SCORM_POLL','MANUAL');
CREATE TYPE g07_lms_completion_status  AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETED','FAILED');
CREATE TYPE g07_connector_type         AS ENUM ('LRS_XAPI','LMS_REPORTING_API','SCORM_SELF_HOSTED');
CREATE TYPE g07_hosting                AS ENUM ('SELF_HOSTED','EXTERNAL_LMS');
CREATE TYPE g07_wcag_conformance       AS ENUM ('AA','A','NON_CONFORMANT','UNKNOWN');
CREATE TYPE g07_item_type              AS ENUM ('SINGLE_CHOICE','MULTI_CHOICE','TRUE_FALSE','NUMERIC','FREE_TEXT');

CREATE TYPE g07_campaign_scope_type    AS ENUM ('ORG_UNIT','CADRE','DESIGNATION','ALL_STAFF');
CREATE TYPE g07_campaign_status        AS ENUM ('DRAFT','APPROVED','RUNNING','PAUSED','COMPLETED','CANCELLED');
CREATE TYPE g07_coverage_rule          AS ENUM ('ELIGIBLE_ALL','EXCLUDE_LONG_LEAVE','EXCLUDE_NON_LOGIN_UNMAPPED','CUSTOM');
CREATE TYPE g07_target_status          AS ENUM ('PENDING','NOMINATED','IN_PROGRESS','COMPLETED','OVERDUE','EXEMPT','FAILED');

CREATE TYPE g07_empanelment_status     AS ENUM ('DRAFT','PENDING_APPROVAL','EMPANELLED','SUSPENDED','EXPIRED','BLACKLISTED');
CREATE TYPE g07_sponsorship_type       AS ENUM ('STUDY_LEAVE','DEPUTATION','DEGREE','EXTERNAL_COURSE');
CREATE TYPE g07_obligation_status      AS ENUM ('PROPOSED','SANCTIONED','ACTIVE','FULFILLED','BREACHED','RECOVERED','WAIVED');

CREATE TYPE g07_retention_trigger      AS ENUM ('RETIRED','RESIGNED','TERMINATED','DECEASED','DSR_ERASURE_REQUEST');
CREATE TYPE g07_retention_action_type  AS ENUM ('ANONYMISE_SELF_ASSESSMENT','ERASE_MARKETPLACE_PRESENCE','DETACH_FEEDBACK_AUTHOR','RETAIN_STATUTORY','EXPORT');


-- =====================================================================================
-- SECTION 2 — COMPETENCY FRAMEWORK MASTERS
-- =====================================================================================

-- skill_categories --------------------------------------------------------------------
CREATE TABLE skill_categories (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code               varchar(40) NOT NULL,                       -- VAL-MASTER-UNIQUE
    name               varchar(150) NOT NULL,
    description        text,
    parent_category_id uuid REFERENCES skill_categories(id) ON DELETE RESTRICT,
    status             g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_skill_categories_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_skill_categories_tenant ON skill_categories(tenant_id);
CREATE INDEX ix_skill_categories_entity ON skill_categories(entity_id);
CREATE INDEX ix_skill_categories_parent ON skill_categories(parent_category_id);
CREATE INDEX ix_skill_categories_status ON skill_categories(status);

-- skills ------------------------------------------------------------------------------
CREATE TABLE skills (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    skill_category_id             uuid NOT NULL REFERENCES skill_categories(id) ON DELETE RESTRICT,
    code                          varchar(40) NOT NULL,            -- VAL-MASTER-UNIQUE
    name                          varchar(150) NOT NULL,
    description                   text,
    is_compliance_skill           boolean NOT NULL DEFAULT false,
    default_validity_months       integer,                         -- required when compliance skill
    revalidation_interval_months  integer,                         -- VAL-G07-REVAL (>=1); NULL = never decays
    status                        g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid,
    updated_by                    uuid,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_skills_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_skills_reval   CHECK (revalidation_interval_months IS NULL OR revalidation_interval_months >= 1),
    CONSTRAINT ck_skills_validity CHECK (default_validity_months IS NULL OR default_validity_months >= 1),
    CONSTRAINT ck_skills_compliance_validity CHECK (NOT is_compliance_skill OR default_validity_months IS NOT NULL)
);
CREATE INDEX ix_skills_tenant   ON skills(tenant_id);
CREATE INDEX ix_skills_entity   ON skills(entity_id);
CREATE INDEX ix_skills_category ON skills(skill_category_id);
CREATE INDEX ix_skills_status   ON skills(status);

-- proficiency_levels (tenant-scoped scale) --------------------------------------------
CREATE TABLE proficiency_levels (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    level_order  integer NOT NULL,                                  -- 1..N contiguous ascending
    code         varchar(20) NOT NULL,                              -- VAL-MASTER-UNIQUE (L1..L5)
    name         varchar(60) NOT NULL,
    descriptor   text NOT NULL,                                     -- VAL-G07-ANCHOR (behavioural)
    status       g07_master_status NOT NULL DEFAULT 'PUBLISHED',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_proficiency_levels_code  UNIQUE (tenant_id, code),
    CONSTRAINT uq_proficiency_levels_order UNIQUE (tenant_id, level_order),
    CONSTRAINT ck_proficiency_levels_order CHECK (level_order >= 1)
);
CREATE INDEX ix_proficiency_levels_tenant ON proficiency_levels(tenant_id);
CREATE INDEX ix_proficiency_levels_status ON proficiency_levels(status);

-- competencies ------------------------------------------------------------------------
CREATE TABLE competencies (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code              varchar(40) NOT NULL,                         -- VAL-MASTER-UNIQUE
    name              varchar(150) NOT NULL,
    competency_type   g07_competency_type NOT NULL,
    description       text,
    linked_skill_ids  uuid[] NOT NULL DEFAULT '{}',                 -- composes 0..N skills (skills.id)
    status            g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_competencies_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_competencies_tenant ON competencies(tenant_id);
CREATE INDEX ix_competencies_entity ON competencies(entity_id);
CREATE INDEX ix_competencies_type   ON competencies(competency_type);
CREATE INDEX ix_competencies_status ON competencies(status);

-- competency_models (governed; role/designation/cadre/org-unit scoped) -----------------
CREATE TABLE competency_models (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code              varchar(40) NOT NULL,                         -- VAL-MASTER-UNIQUE
    name              varchar(150) NOT NULL,
    scope_type        g07_model_scope_type NOT NULL,
    designation_id    uuid REFERENCES designations(id) ON DELETE RESTRICT,   -- scope=DESIGNATION
    role_id           uuid REFERENCES roles(id) ON DELETE RESTRICT,          -- scope=ROLE
    cadre             varchar(60),                                            -- scope=CADRE
    org_unit_id       uuid REFERENCES org_units(id) ON DELETE RESTRICT,       -- scope=ORG_UNIT
    owner_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- accountable steward
    review_due_date   date NOT NULL,                                -- drives JOB-G07-MODELREVIEW
    effective_from    date NOT NULL,
    effective_to      date,
    version           integer NOT NULL DEFAULT 1,
    status            g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_competency_models_code    UNIQUE (tenant_id, code, version),
    CONSTRAINT ck_competency_models_eff     CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- VAL-G07-SCOPEKEY: exactly one scope key matching scope_type (all null only when GENERIC)
    CONSTRAINT ck_competency_models_scopekey CHECK (
        (scope_type = 'DESIGNATION' AND designation_id IS NOT NULL AND role_id IS NULL AND cadre IS NULL AND org_unit_id IS NULL)
     OR (scope_type = 'ROLE'        AND role_id IS NOT NULL AND designation_id IS NULL AND cadre IS NULL AND org_unit_id IS NULL)
     OR (scope_type = 'CADRE'       AND cadre IS NOT NULL AND designation_id IS NULL AND role_id IS NULL AND org_unit_id IS NULL)
     OR (scope_type = 'ORG_UNIT'    AND org_unit_id IS NOT NULL AND designation_id IS NULL AND role_id IS NULL AND cadre IS NULL)
     OR (scope_type = 'GENERIC'     AND designation_id IS NULL AND role_id IS NULL AND cadre IS NULL AND org_unit_id IS NULL)
    )
);
CREATE INDEX ix_competency_models_tenant      ON competency_models(tenant_id);
CREATE INDEX ix_competency_models_entity      ON competency_models(entity_id);
CREATE INDEX ix_competency_models_designation ON competency_models(designation_id);
CREATE INDEX ix_competency_models_role        ON competency_models(role_id);
CREATE INDEX ix_competency_models_org_unit    ON competency_models(org_unit_id);
CREATE INDEX ix_competency_models_owner       ON competency_models(owner_id);
CREATE INDEX ix_competency_models_status      ON competency_models(status);
CREATE INDEX ix_competency_models_review_due  ON competency_models(review_due_date);

-- competency_model_items --------------------------------------------------------------
CREATE TABLE competency_model_items (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    competency_model_id         uuid NOT NULL REFERENCES competency_models(id) ON DELETE RESTRICT,
    competency_id               uuid NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
    target_proficiency_level_id uuid NOT NULL REFERENCES proficiency_levels(id) ON DELETE RESTRICT,
    is_critical                 boolean NOT NULL DEFAULT false,
    weight                      numeric(5,2),                       -- only when WEIGHTED scoring
    sequence_no                 integer NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_competency_model_items UNIQUE (competency_model_id, competency_id)
);
CREATE INDEX ix_cmi_tenant     ON competency_model_items(tenant_id);
CREATE INDEX ix_cmi_entity     ON competency_model_items(entity_id);
CREATE INDEX ix_cmi_model      ON competency_model_items(competency_model_id);
CREATE INDEX ix_cmi_competency ON competency_model_items(competency_id);
CREATE INDEX ix_cmi_target     ON competency_model_items(target_proficiency_level_id);


-- =====================================================================================
-- SECTION 3 — SKILL INVENTORY, ASSESSMENTS & GAPS
-- =====================================================================================

-- employee_skills (one current row per skill) -----------------------------------------
CREATE TABLE employee_skills (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                    uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    skill_id                     uuid NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    current_proficiency_level_id uuid NOT NULL REFERENCES proficiency_levels(id) ON DELETE RESTRICT,
    source                       g07_skill_source NOT NULL DEFAULT 'SELF',
    validated_by                 uuid REFERENCES employees(id) ON DELETE SET NULL,
    validated_at                 timestamptz,
    last_validated_at            timestamptz,                       -- basis for freshness
    acquired_on                  date,
    expires_on                   date,                              -- currency for renewable skills
    freshness_status             g07_freshness_status NOT NULL DEFAULT 'FRESH',  -- JOB-G07-FRESHNESS
    status                       g07_skill_status NOT NULL DEFAULT 'DECLARED',
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_by                   uuid,
    is_deleted                   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_skills UNIQUE (tenant_id, employee_id, skill_id)
);
CREATE INDEX ix_employee_skills_tenant    ON employee_skills(tenant_id);
CREATE INDEX ix_employee_skills_entity    ON employee_skills(entity_id);
CREATE INDEX ix_employee_skills_employee  ON employee_skills(employee_id);
CREATE INDEX ix_employee_skills_skill     ON employee_skills(skill_id);
CREATE INDEX ix_employee_skills_level     ON employee_skills(current_proficiency_level_id);
CREATE INDEX ix_employee_skills_validator ON employee_skills(validated_by);
CREATE INDEX ix_employee_skills_status    ON employee_skills(status);
CREATE INDEX ix_employee_skills_freshness ON employee_skills(freshness_status);
CREATE INDEX ix_employee_skills_expires   ON employee_skills(expires_on);

-- skill_assessments (APPEND-ONLY history) ---------------------------------------------
CREATE TABLE skill_assessments (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    employee_skill_id        uuid REFERENCES employee_skills(id) ON DELETE SET NULL,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    skill_id                 uuid NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
    assessed_proficiency_level_id uuid NOT NULL REFERENCES proficiency_levels(id) ON DELETE RESTRICT,
    source                   g07_skill_source NOT NULL,
    assessor_id              uuid REFERENCES employees(id) ON DELETE SET NULL,
    assessed_at              timestamptz NOT NULL DEFAULT now(),
    evidence_document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,
    comments                 text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid
);
CREATE INDEX ix_skill_assessments_tenant   ON skill_assessments(tenant_id);
CREATE INDEX ix_skill_assessments_empskill ON skill_assessments(employee_skill_id);
CREATE INDEX ix_skill_assessments_employee ON skill_assessments(employee_id);
CREATE INDEX ix_skill_assessments_skill    ON skill_assessments(skill_id);
CREATE INDEX ix_skill_assessments_assessor ON skill_assessments(assessor_id);
CREATE INDEX ix_skill_assessments_doc      ON skill_assessments(evidence_document_id);

-- skill_gap_analyses (header) ---------------------------------------------------------
CREATE TABLE skill_gap_analyses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    competency_model_id uuid NOT NULL REFERENCES competency_models(id) ON DELETE RESTRICT,
    scoring_mode        g07_scoring_mode NOT NULL DEFAULT 'BINARY',
    appraisal_cycle_ref varchar(40),                                -- G08 cycle id; UNAVAILABLE in degraded mode
    model_stale_flag    boolean NOT NULL DEFAULT false,
    stale_skill_count   integer NOT NULL DEFAULT 0,
    overall_gap_score   numeric(6,2),                               -- only when WEIGHTED
    critical_gap_count  integer NOT NULL DEFAULT 0,
    generated_on        timestamptz NOT NULL DEFAULT now(),
    recompute_trigger   g07_recompute_trigger NOT NULL DEFAULT 'ON_DEMAND',
    status              g07_gap_analysis_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_sga_tenant   ON skill_gap_analyses(tenant_id);
CREATE INDEX ix_sga_entity   ON skill_gap_analyses(entity_id);
CREATE INDEX ix_sga_employee ON skill_gap_analyses(employee_id);
CREATE INDEX ix_sga_model    ON skill_gap_analyses(competency_model_id);
CREATE INDEX ix_sga_status   ON skill_gap_analyses(status);
CREATE INDEX ix_sga_generated ON skill_gap_analyses(generated_on);

-- skill_gap_items ---------------------------------------------------------------------
CREATE TABLE skill_gap_items (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    skill_gap_analysis_id        uuid NOT NULL REFERENCES skill_gap_analyses(id) ON DELETE RESTRICT,
    competency_id                uuid NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
    target_proficiency_level_id  uuid NOT NULL REFERENCES proficiency_levels(id) ON DELETE RESTRICT,
    current_proficiency_level_id uuid REFERENCES proficiency_levels(id) ON DELETE SET NULL,  -- NULL = no current skill
    gap_size                     integer NOT NULL DEFAULT 0,        -- VAL-G07-GAPSIZE: max(0, target-current)
    is_critical                  boolean NOT NULL DEFAULT false,
    weight_applied               numeric(5,2),                      -- only when WEIGHTED
    discounted_for_staleness     boolean NOT NULL DEFAULT false,
    source                       g07_gap_item_source NOT NULL,      -- 1:1 with training_needs.source
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_by                   uuid,
    is_deleted                   boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_skill_gap_items_size CHECK (gap_size >= 0)
);
CREATE INDEX ix_sgi_tenant     ON skill_gap_items(tenant_id);
CREATE INDEX ix_sgi_analysis   ON skill_gap_items(skill_gap_analysis_id);
CREATE INDEX ix_sgi_competency ON skill_gap_items(competency_id);
CREATE INDEX ix_sgi_target     ON skill_gap_items(target_proficiency_level_id);
CREATE INDEX ix_sgi_current    ON skill_gap_items(current_proficiency_level_id);
CREATE INDEX ix_sgi_source     ON skill_gap_items(source);


-- =====================================================================================
-- SECTION 4 — NEEDS, PLANNING & BUDGET
-- =====================================================================================

-- training_needs ----------------------------------------------------------------------
CREATE TABLE training_needs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid REFERENCES employees(id) ON DELETE RESTRICT,     -- NULL for a group need
    competency_id       uuid REFERENCES competencies(id) ON DELETE RESTRICT,
    org_unit_id         uuid REFERENCES org_units(id) ON DELETE RESTRICT,     -- group needs reference org_unit
    skill_gap_item_id   uuid REFERENCES skill_gap_items(id) ON DELETE SET NULL,  -- traceability
    source              g07_need_source NOT NULL,
    priority            g07_need_priority NOT NULL DEFAULT 'MEDIUM',
    status              g07_need_status NOT NULL DEFAULT 'IDENTIFIED',
    financial_year      varchar(9) NOT NULL,                        -- e.g. 2026-2027
    is_group            boolean NOT NULL DEFAULT false,
    parent_need_id      uuid REFERENCES training_needs(id) ON DELETE SET NULL,   -- consolidation parent
    justification       text,                                       -- VAL-COMMENT (defer/override)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_training_needs_tenant     ON training_needs(tenant_id);
CREATE INDEX ix_training_needs_entity     ON training_needs(entity_id);
CREATE INDEX ix_training_needs_employee   ON training_needs(employee_id);
CREATE INDEX ix_training_needs_competency ON training_needs(competency_id);
CREATE INDEX ix_training_needs_org_unit   ON training_needs(org_unit_id);
CREATE INDEX ix_training_needs_gap_item   ON training_needs(skill_gap_item_id);
CREATE INDEX ix_training_needs_parent     ON training_needs(parent_need_id);
CREATE INDEX ix_training_needs_status     ON training_needs(status);
CREATE INDEX ix_training_needs_fy         ON training_needs(financial_year);

-- training_programs (catalog) ---------------------------------------------------------
CREATE TABLE training_programs (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code                        varchar(40) NOT NULL,               -- VAL-MASTER-UNIQUE
    name                        varchar(200) NOT NULL,
    description                 text,
    delivery_mode               g07_delivery_mode NOT NULL DEFAULT 'CLASSROOM',
    provider_type               g07_provider_type NOT NULL DEFAULT 'INTERNAL',
    is_mandatory                boolean NOT NULL DEFAULT false,
    is_induction                boolean NOT NULL DEFAULT false,
    linked_competency_ids       uuid[] NOT NULL DEFAULT '{}',        -- competencies addressed (competencies.id)
    cpd_credits                 numeric(6,2) NOT NULL DEFAULT 0,
    certification_on_completion boolean NOT NULL DEFAULT false,
    certificate_validity_months integer,
    default_duration_days       numeric(5,1),
    default_capacity            integer,
    default_cost                numeric(12,2) NOT NULL DEFAULT 0,
    materials_document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,
    lms_course_ref              varchar(120),
    status                      g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_training_programs_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_training_programs_tenant   ON training_programs(tenant_id);
CREATE INDEX ix_training_programs_entity   ON training_programs(entity_id);
CREATE INDEX ix_training_programs_mode     ON training_programs(delivery_mode);
CREATE INDEX ix_training_programs_provider ON training_programs(provider_type);
CREATE INDEX ix_training_programs_doc      ON training_programs(materials_document_id);
CREATE INDEX ix_training_programs_status   ON training_programs(status);

-- trainers ----------------------------------------------------------------------------
CREATE TABLE trainers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code            varchar(40) NOT NULL,                           -- VAL-MASTER-UNIQUE
    full_name       varchar(160) NOT NULL,
    trainer_type    g07_trainer_type NOT NULL DEFAULT 'INTERNAL',
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,   -- internal trainer login
    employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
    email           varchar(160),
    phone           varchar(20),
    specialization  text,
    status          g07_active_status NOT NULL DEFAULT 'ACTIVE',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_trainers_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_trainers_tenant   ON trainers(tenant_id);
CREATE INDEX ix_trainers_entity   ON trainers(entity_id);
CREATE INDEX ix_trainers_user     ON trainers(user_id);
CREATE INDEX ix_trainers_employee ON trainers(employee_id);
CREATE INDEX ix_trainers_status   ON trainers(status);

-- venues ------------------------------------------------------------------------------
CREATE TABLE venues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code         varchar(40) NOT NULL,                              -- VAL-MASTER-UNIQUE
    name         varchar(150) NOT NULL,
    venue_type   g07_venue_type NOT NULL DEFAULT 'PHYSICAL',
    capacity     integer,
    location     text,
    virtual_url  varchar(300),
    status       g07_active_status NOT NULL DEFAULT 'ACTIVE',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_venues_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_venues_tenant ON venues(tenant_id);
CREATE INDEX ix_venues_entity ON venues(entity_id);
CREATE INDEX ix_venues_status ON venues(status);

-- annual_training_plans ---------------------------------------------------------------
CREATE TABLE annual_training_plans (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    financial_year        varchar(9) NOT NULL,
    org_unit_id           uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    name                  varchar(200) NOT NULL,
    total_planned_budget  numeric(14,2) NOT NULL DEFAULT 0,
    status                g07_plan_status NOT NULL DEFAULT 'DRAFT',
    workflow_instance_id  uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 approval
    approved_by           uuid REFERENCES employees(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_annual_training_plans UNIQUE (tenant_id, financial_year, org_unit_id)
);
CREATE INDEX ix_atp_tenant   ON annual_training_plans(tenant_id);
CREATE INDEX ix_atp_entity   ON annual_training_plans(entity_id);
CREATE INDEX ix_atp_org_unit ON annual_training_plans(org_unit_id);
CREATE INDEX ix_atp_wfi      ON annual_training_plans(workflow_instance_id);
CREATE INDEX ix_atp_status   ON annual_training_plans(status);
CREATE INDEX ix_atp_fy       ON annual_training_plans(financial_year);

-- training_plan_items -----------------------------------------------------------------
CREATE TABLE training_plan_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    annual_training_plan_id uuid NOT NULL REFERENCES annual_training_plans(id) ON DELETE RESTRICT,
    training_program_id     uuid NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
    training_need_id        uuid REFERENCES training_needs(id) ON DELETE SET NULL,
    target_audience         text,
    planned_man_days        integer NOT NULL DEFAULT 0,
    planned_participants    integer NOT NULL DEFAULT 0,
    planned_budget          numeric(14,2) NOT NULL DEFAULT 0,
    quarter                 smallint,                               -- 1..4 calendar bucket
    item_status             g07_plan_item_status NOT NULL DEFAULT 'PLANNED',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_tpi_quarter CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4)
);
CREATE INDEX ix_tpi_tenant  ON training_plan_items(tenant_id);
CREATE INDEX ix_tpi_entity  ON training_plan_items(entity_id);
CREATE INDEX ix_tpi_plan    ON training_plan_items(annual_training_plan_id);
CREATE INDEX ix_tpi_program ON training_plan_items(training_program_id);
CREATE INDEX ix_tpi_need    ON training_plan_items(training_need_id);
CREATE INDEX ix_tpi_status  ON training_plan_items(item_status);

-- training_budgets (canonical key = FY + entity/org_unit; category is reporting-only) --
CREATE TABLE training_budgets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    financial_year    varchar(9) NOT NULL,
    org_unit_id       uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    skill_category_id uuid REFERENCES skill_categories(id) ON DELETE SET NULL,  -- reporting dimension only
    allocated_amount  numeric(16,2) NOT NULL DEFAULT 0,
    committed_amount  numeric(16,2) NOT NULL DEFAULT 0,
    actual_amount     numeric(16,2) NOT NULL DEFAULT 0,
    currency          char(3) NOT NULL DEFAULT 'INR',
    status            g07_budget_status NOT NULL DEFAULT 'DRAFT',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    -- VAL-G07-BUDGETKEY: one allocation row per canonical (FY, org_unit) grain.
    CONSTRAINT uq_training_budgets UNIQUE (tenant_id, financial_year, org_unit_id),
    CONSTRAINT ck_training_budgets_amounts CHECK (
        allocated_amount >= 0 AND committed_amount >= 0 AND actual_amount >= 0
        AND committed_amount + actual_amount <= allocated_amount
    )
);
CREATE INDEX ix_training_budgets_tenant   ON training_budgets(tenant_id);
CREATE INDEX ix_training_budgets_entity   ON training_budgets(entity_id);
CREATE INDEX ix_training_budgets_org_unit ON training_budgets(org_unit_id);
CREATE INDEX ix_training_budgets_category ON training_budgets(skill_category_id);
CREATE INDEX ix_training_budgets_fy       ON training_budgets(financial_year);
CREATE INDEX ix_training_budgets_status   ON training_budgets(status);


-- =====================================================================================
-- SECTION 5 — DELIVERY: SESSIONS, CONTENT & ASSESSMENT ITEMS
-- =====================================================================================

-- training_sessions -------------------------------------------------------------------
CREATE TABLE training_sessions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    training_program_id   uuid NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
    training_plan_item_id uuid REFERENCES training_plan_items(id) ON DELETE SET NULL,
    venue_id              uuid REFERENCES venues(id) ON DELETE SET NULL,
    trainer_id            uuid REFERENCES trainers(id) ON DELETE SET NULL,
    session_code          varchar(40) NOT NULL,                     -- VAL-MASTER-UNIQUE
    title                 varchar(200) NOT NULL,
    delivery_mode         g07_delivery_mode,
    start_date            date NOT NULL,
    end_date              date NOT NULL,
    nomination_deadline   date,
    capacity              integer NOT NULL DEFAULT 0,               -- VAL-G07-CAPACITY
    enrolled_count        integer NOT NULL DEFAULT 0,
    waitlist_count        integer NOT NULL DEFAULT 0,
    status                g07_session_status NOT NULL DEFAULT 'DRAFT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_training_sessions_code UNIQUE (tenant_id, session_code),
    CONSTRAINT ck_training_sessions_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_training_sessions_deadline CHECK (nomination_deadline IS NULL OR nomination_deadline <= start_date),
    CONSTRAINT ck_training_sessions_capacity CHECK (capacity >= 0 AND enrolled_count >= 0 AND waitlist_count >= 0)
);
CREATE INDEX ix_training_sessions_tenant    ON training_sessions(tenant_id);
CREATE INDEX ix_training_sessions_entity    ON training_sessions(entity_id);
CREATE INDEX ix_training_sessions_program   ON training_sessions(training_program_id);
CREATE INDEX ix_training_sessions_plan_item ON training_sessions(training_plan_item_id);
CREATE INDEX ix_training_sessions_venue     ON training_sessions(venue_id);
CREATE INDEX ix_training_sessions_trainer   ON training_sessions(trainer_id);
CREATE INDEX ix_training_sessions_status    ON training_sessions(status);
CREATE INDEX ix_training_sessions_start     ON training_sessions(start_date);

-- learning_record_stores (X.3 connector config — secret ref to P04 only) --------------
CREATE TABLE learning_record_stores (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code                        varchar(40) NOT NULL,               -- VAL-MASTER-UNIQUE
    name                        varchar(150) NOT NULL,
    connector_type              g07_connector_type NOT NULL,
    is_primary                  boolean NOT NULL DEFAULT false,     -- VAL-G07-PRIMARYLRS (exactly one)
    endpoint_url                varchar(300) NOT NULL,
    integration_credential_ref  varchar(120) NOT NULL,              -- P04 integration_credentials ref (NEVER a secret)
    poll_interval_minutes       integer,
    supported_standards         text NOT NULL,                      -- CSV of SCORM_12/SCORM_2004/XAPI
    circuit_breaker_policy_json jsonb,
    status                      g07_active_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_learning_record_stores_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_lrs_tenant ON learning_record_stores(tenant_id);
CREATE INDEX ix_lrs_status ON learning_record_stores(status);
-- VAL-G07-PRIMARYLRS: at most one primary LRS per tenant.
CREATE UNIQUE INDEX uq_lrs_one_primary ON learning_record_stores(tenant_id)
    WHERE is_primary = true AND is_deleted = false;
COMMENT ON COLUMN learning_record_stores.integration_credential_ref IS
    'Reference into P04 integration_credentials (integration_code). Plaintext secrets are NEVER stored here.';

-- lms_content_packages ----------------------------------------------------------------
CREATE TABLE lms_content_packages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_program_id uuid NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
    package_version     varchar(20) NOT NULL,                       -- semantic version
    standard            g07_lms_standard NOT NULL,
    hosting             g07_hosting NOT NULL DEFAULT 'SELF_HOSTED',
    package_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,  -- binary when self-hosted
    launch_url_template varchar(300),
    wcag_conformance    g07_wcag_conformance NOT NULL DEFAULT 'UNKNOWN',
    accessibility_notes text,
    status              g07_content_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_lms_content_packages UNIQUE (tenant_id, training_program_id, package_version)
);
CREATE INDEX ix_lcp_tenant  ON lms_content_packages(tenant_id);
CREATE INDEX ix_lcp_program ON lms_content_packages(training_program_id);
CREATE INDEX ix_lcp_doc     ON lms_content_packages(package_document_id);
CREATE INDEX ix_lcp_status  ON lms_content_packages(status);

-- assessment_items (item bank) --------------------------------------------------------
CREATE TABLE assessment_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_program_id uuid REFERENCES training_programs(id) ON DELETE SET NULL,  -- program-scoped or shared
    item_bank_code      varchar(40) NOT NULL,
    question_text       text NOT NULL,
    item_type           g07_item_type NOT NULL,
    options_json        jsonb,                                      -- options for choice items
    correct_key_json    jsonb,                                      -- RBAC-restricted (field mask, P02)
    max_score           numeric(6,2) NOT NULL DEFAULT 1,
    wcag_conformance    g07_wcag_conformance NOT NULL DEFAULT 'UNKNOWN',
    version             integer NOT NULL DEFAULT 1,
    status              g07_content_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_assessment_items_tenant   ON assessment_items(tenant_id);
CREATE INDEX ix_assessment_items_program  ON assessment_items(training_program_id);
CREATE INDEX ix_assessment_items_bank     ON assessment_items(item_bank_code);
CREATE INDEX ix_assessment_items_status   ON assessment_items(status);


-- =====================================================================================
-- SECTION 6 — CAMPAIGNS, NOMINATION, ATTENDANCE & ASSESSMENT
-- =====================================================================================

-- training_campaigns (mandatory-compliance engine header) -----------------------------
CREATE TABLE training_campaigns (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code                      varchar(40) NOT NULL,                 -- VAL-MASTER-UNIQUE (CAMP-CYBER-2026)
    name                      varchar(200) NOT NULL,
    training_program_id       uuid NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
    scope_type                g07_campaign_scope_type NOT NULL,
    scope_ref                 varchar(64),                          -- org_unit_id/cadre/designation_id; NULL for ALL_STAFF
    financial_year            varchar(9) NOT NULL,
    window_start              date NOT NULL,
    window_end                date NOT NULL,                        -- statutory deadline
    renewal_cadence_months    integer,                              -- NULL = one-off
    auto_wave                 boolean NOT NULL DEFAULT true,
    wave_size                 integer,
    escalation_policy_json    jsonb,
    coverage_denominator_rule g07_coverage_rule NOT NULL DEFAULT 'ELIGIBLE_ALL',
    status                    g07_campaign_status NOT NULL DEFAULT 'DRAFT',
    approved_by               uuid REFERENCES employees(id) ON DELETE SET NULL,
    workflow_instance_id      uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_training_campaigns_code  UNIQUE (tenant_id, code),
    CONSTRAINT ck_training_campaigns_window CHECK (window_end >= window_start)
);
CREATE INDEX ix_campaigns_tenant  ON training_campaigns(tenant_id);
CREATE INDEX ix_campaigns_entity  ON training_campaigns(entity_id);
CREATE INDEX ix_campaigns_program ON training_campaigns(training_program_id);
CREATE INDEX ix_campaigns_wfi     ON training_campaigns(workflow_instance_id);
CREATE INDEX ix_campaigns_status  ON training_campaigns(status);
CREATE INDEX ix_campaigns_fy      ON training_campaigns(financial_year);

-- training_nominations ----------------------------------------------------------------
CREATE TABLE training_nominations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    training_session_id  uuid NOT NULL REFERENCES training_sessions(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    training_need_id     uuid REFERENCES training_needs(id) ON DELETE SET NULL,       -- traceability
    training_campaign_id uuid REFERENCES training_campaigns(id) ON DELETE SET NULL,   -- set by campaign wave
    nomination_type      g07_nomination_type NOT NULL,
    nominated_by         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,   -- P01 approval flow
    status               g07_nomination_status NOT NULL DEFAULT 'DRAFT',
    waitlist_position    integer,                                   -- persisted FIFO rank when WAITLISTED
    estimated_cost       numeric(12,2) NOT NULL DEFAULT 0,
    completion_status    g07_completion_status,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_training_nominations UNIQUE (tenant_id, training_session_id, employee_id)
);
CREATE INDEX ix_nominations_tenant   ON training_nominations(tenant_id);
CREATE INDEX ix_nominations_entity   ON training_nominations(entity_id);
CREATE INDEX ix_nominations_session  ON training_nominations(training_session_id);
CREATE INDEX ix_nominations_employee ON training_nominations(employee_id);
CREATE INDEX ix_nominations_need     ON training_nominations(training_need_id);
CREATE INDEX ix_nominations_campaign ON training_nominations(training_campaign_id);
CREATE INDEX ix_nominations_nomby    ON training_nominations(nominated_by);
CREATE INDEX ix_nominations_wfi      ON training_nominations(workflow_instance_id);
CREATE INDEX ix_nominations_status   ON training_nominations(status);

-- campaign_targets --------------------------------------------------------------------
CREATE TABLE campaign_targets (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_campaign_id  uuid NOT NULL REFERENCES training_campaigns(id) ON DELETE RESTRICT,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    is_eligible           boolean NOT NULL DEFAULT true,            -- per coverage denominator rule
    exemption_reason      varchar(120),                            -- VAL-COMMENT when not eligible
    wave_no               integer,
    training_nomination_id uuid REFERENCES training_nominations(id) ON DELETE SET NULL,
    target_status         g07_target_status NOT NULL DEFAULT 'PENDING',
    due_date              date NOT NULL,
    escalation_level      integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_campaign_targets UNIQUE (tenant_id, training_campaign_id, employee_id)
);
CREATE INDEX ix_campaign_targets_tenant     ON campaign_targets(tenant_id);
CREATE INDEX ix_campaign_targets_campaign   ON campaign_targets(training_campaign_id);
CREATE INDEX ix_campaign_targets_employee   ON campaign_targets(employee_id);
CREATE INDEX ix_campaign_targets_nomination ON campaign_targets(training_nomination_id);
CREATE INDEX ix_campaign_targets_status     ON campaign_targets(target_status);

-- training_attendance (per-day; de-polymorphised actor; offline sync) -----------------
CREATE TABLE training_attendance (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    training_nomination_id uuid NOT NULL REFERENCES training_nominations(id) ON DELETE RESTRICT,
    session_date          date NOT NULL,                            -- one row per training day
    attendance_status     g07_attendance_status NOT NULL,
    check_in_at           timestamptz,
    check_out_at          timestamptz,
    marked_by_actor_type  g07_attendance_actor_type NOT NULL,       -- discriminator (no polymorphic FK)
    marked_by_actor_id    uuid NOT NULL,                            -- resolves per actor_type (service layer)
    capture_mode          g07_capture_mode NOT NULL DEFAULT 'ONLINE',
    offline_captured_at   timestamptz,
    offline_sync_batch_id uuid,
    evidence_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_training_attendance UNIQUE (tenant_id, training_nomination_id, session_date)
);
CREATE INDEX ix_attendance_tenant     ON training_attendance(tenant_id);
CREATE INDEX ix_attendance_entity     ON training_attendance(entity_id);
CREATE INDEX ix_attendance_nomination ON training_attendance(training_nomination_id);
CREATE INDEX ix_attendance_date       ON training_attendance(session_date);
CREATE INDEX ix_attendance_status     ON training_attendance(attendance_status);
CREATE INDEX ix_attendance_doc        ON training_attendance(evidence_document_id);
CREATE INDEX ix_attendance_sync_batch ON training_attendance(offline_sync_batch_id);

-- training_assessments (APPEND-ONLY; pre/post; de-polymorphised assessor) -------------
CREATE TABLE training_assessments (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_nomination_id uuid NOT NULL REFERENCES training_nominations(id) ON DELETE RESTRICT,
    assessment_phase      g07_assessment_phase NOT NULL,
    max_score             numeric(6,2) NOT NULL,
    obtained_score        numeric(6,2) NOT NULL,
    pass_threshold        numeric(6,2) NOT NULL,
    result                g07_assessment_result NOT NULL,
    assessed_by_actor_type g07_assessment_actor_type NOT NULL,
    assessed_by_actor_id  uuid NOT NULL,
    assessed_at           timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    CONSTRAINT ck_training_assessments_score CHECK (obtained_score >= 0 AND obtained_score <= max_score)
);
CREATE INDEX ix_tassess_tenant     ON training_assessments(tenant_id);
CREATE INDEX ix_tassess_nomination ON training_assessments(training_nomination_id);
CREATE INDEX ix_tassess_phase      ON training_assessments(assessment_phase);
CREATE INDEX ix_tassess_result     ON training_assessments(result);

-- training_feedback (APPEND-ONLY; Kirkpatrick L1-L4) ----------------------------------
CREATE TABLE training_feedback (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_program_id   uuid REFERENCES training_programs(id) ON DELETE SET NULL,
    training_session_id   uuid REFERENCES training_sessions(id) ON DELETE SET NULL,
    training_nomination_id uuid REFERENCES training_nominations(id) ON DELETE SET NULL,  -- NULL for programme-level
    employee_id           uuid REFERENCES employees(id) ON DELETE SET NULL,
    kirkpatrick_level     g07_kirkpatrick_level NOT NULL,
    rating                numeric(5,2),
    response_json         jsonb,
    comments              text,
    submitted_at          timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid
);
CREATE INDEX ix_feedback_tenant     ON training_feedback(tenant_id);
CREATE INDEX ix_feedback_program    ON training_feedback(training_program_id);
CREATE INDEX ix_feedback_session    ON training_feedback(training_session_id);
CREATE INDEX ix_feedback_nomination ON training_feedback(training_nomination_id);
CREATE INDEX ix_feedback_employee   ON training_feedback(employee_id);
CREATE INDEX ix_feedback_level      ON training_feedback(kirkpatrick_level);


-- =====================================================================================
-- SECTION 7 — CERTIFICATIONS, CREDENTIALS, VENDORS & SPONSORSHIP
-- =====================================================================================

-- vendor_empanelments -----------------------------------------------------------------
CREATE TABLE vendor_empanelments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    vendor_name          varchar(200) NOT NULL,
    trainer_id           uuid REFERENCES trainers(id) ON DELETE SET NULL,   -- when a specific external trainer
    empanelment_ref      varchar(80) NOT NULL,                     -- VAL-MASTER-UNIQUE
    contract_ref         varchar(80),
    contract_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    procurement_ref      varchar(80),                              -- external procurement/tender ref (via X.3)
    valid_from           date NOT NULL,
    valid_until          date,
    rate_card_json       jsonb,
    status               g07_empanelment_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES employees(id) ON DELETE SET NULL,  -- != requester (SoD via P02)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_vendor_empanelments_ref  UNIQUE (tenant_id, empanelment_ref),
    CONSTRAINT ck_vendor_empanelments_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX ix_vendor_empanelments_tenant  ON vendor_empanelments(tenant_id);
CREATE INDEX ix_vendor_empanelments_entity  ON vendor_empanelments(entity_id);
CREATE INDEX ix_vendor_empanelments_trainer ON vendor_empanelments(trainer_id);
CREATE INDEX ix_vendor_empanelments_doc     ON vendor_empanelments(contract_document_id);
CREATE INDEX ix_vendor_empanelments_wfi     ON vendor_empanelments(workflow_instance_id);
CREATE INDEX ix_vendor_empanelments_status  ON vendor_empanelments(status);

-- training_sponsorships (study-leave / deputation; service-bond) -----------------------
CREATE TABLE training_sponsorships (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    training_program_id   uuid REFERENCES training_programs(id) ON DELETE SET NULL,  -- or external course
    external_course_name  varchar(200),
    sponsorship_type      g07_sponsorship_type NOT NULL,
    sponsored_amount      numeric(14,2) NOT NULL DEFAULT 0,
    start_date            date NOT NULL,
    end_date              date,
    service_bond_months   integer NOT NULL DEFAULT 0,
    bond_end_date         date,                                     -- derived: completion + bond_months
    bond_recovery_amount  numeric(14,2),                            -- VAL-G07-BOND (liquidated on breach)
    obligation_status     g07_obligation_status NOT NULL DEFAULT 'PROPOSED',
    sanctioned_by         uuid REFERENCES employees(id) ON DELETE SET NULL,  -- via P01
    workflow_instance_id  uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_training_sponsorships_dates CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_training_sponsorships_bond  CHECK (service_bond_months >= 0)
);
CREATE INDEX ix_sponsorships_tenant   ON training_sponsorships(tenant_id);
CREATE INDEX ix_sponsorships_entity   ON training_sponsorships(entity_id);
CREATE INDEX ix_sponsorships_employee ON training_sponsorships(employee_id);
CREATE INDEX ix_sponsorships_program  ON training_sponsorships(training_program_id);
CREATE INDEX ix_sponsorships_sanction ON training_sponsorships(sanctioned_by);
CREATE INDEX ix_sponsorships_wfi      ON training_sponsorships(workflow_instance_id);
CREATE INDEX ix_sponsorships_status   ON training_sponsorships(obligation_status);

-- certifications (internal + external; G12 SR-posted) ---------------------------------
CREATE TABLE certifications (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    credential_source               g07_credential_source NOT NULL DEFAULT 'INTERNAL_PROGRAM',
    training_program_id             uuid REFERENCES training_programs(id) ON DELETE SET NULL,    -- NULL for external
    training_nomination_id          uuid REFERENCES training_nominations(id) ON DELETE SET NULL,
    certificate_no                  varchar(50) NOT NULL,           -- VAL-MASTER-UNIQUE
    title                           varchar(200) NOT NULL,
    issuing_authority               varchar(150) NOT NULL,          -- internal authority
    issuing_body                    varchar(150),                   -- external body (PMI, ISACA)
    external_reference_no           varchar(80),                    -- VAL-G07-CREDREF
    verification_status             g07_verification_status NOT NULL DEFAULT 'NOT_REQUIRED',
    verified_by                     uuid REFERENCES employees(id) ON DELETE SET NULL,  -- != self-capturer
    verification_evidence_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    issue_date                      date NOT NULL,
    valid_until                     date,                           -- NULL = lifetime
    is_mandatory                    boolean NOT NULL DEFAULT false,
    lapsed_mandatory                boolean NOT NULL DEFAULT false, -- consumed by G06
    renewal_need_id                 uuid REFERENCES training_needs(id) ON DELETE SET NULL,
    certificate_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    sr_posting_status               g07_sr_posting_status NOT NULL DEFAULT 'NOT_REQUIRED',
    service_register_event_id       uuid REFERENCES service_register_events(id) ON DELETE SET NULL,  -- G12 ref
    status                          g07_certification_status NOT NULL DEFAULT 'ACTIVE',
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
    is_deleted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_certifications_cert_no UNIQUE (tenant_id, certificate_no),
    CONSTRAINT ck_certifications_validity CHECK (valid_until IS NULL OR valid_until > issue_date),
    -- Integrity rule 8: ledger ref present only once posting succeeded.
    CONSTRAINT ck_certifications_sr CHECK (
        service_register_event_id IS NULL OR sr_posting_status = 'POSTED'
    )
);
CREATE INDEX ix_certifications_tenant     ON certifications(tenant_id);
CREATE INDEX ix_certifications_entity     ON certifications(entity_id);
CREATE INDEX ix_certifications_employee   ON certifications(employee_id);
CREATE INDEX ix_certifications_program    ON certifications(training_program_id);
CREATE INDEX ix_certifications_nomination ON certifications(training_nomination_id);
CREATE INDEX ix_certifications_verifier   ON certifications(verified_by);
CREATE INDEX ix_certifications_renewal    ON certifications(renewal_need_id);
CREATE INDEX ix_certifications_cert_doc   ON certifications(certificate_document_id);
CREATE INDEX ix_certifications_sre        ON certifications(service_register_event_id);
CREATE INDEX ix_certifications_status     ON certifications(status);
CREATE INDEX ix_certifications_valid_until ON certifications(valid_until);
CREATE INDEX ix_certifications_lapsed     ON certifications(lapsed_mandatory) WHERE lapsed_mandatory = true;

-- credential_verifications (APPEND-ONLY trail) ----------------------------------------
CREATE TABLE credential_verifications (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    certification_id     uuid NOT NULL REFERENCES certifications(id) ON DELETE RESTRICT,
    verification_action  g07_verification_action NOT NULL,
    verification_method  g07_verification_method NOT NULL,
    evidence_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    actor_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    comments             text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid
);
CREATE INDEX ix_cred_verif_tenant ON credential_verifications(tenant_id);
CREATE INDEX ix_cred_verif_cert   ON credential_verifications(certification_id);
CREATE INDEX ix_cred_verif_actor  ON credential_verifications(actor_id);
CREATE INDEX ix_cred_verif_doc    ON credential_verifications(evidence_document_id);
CREATE INDEX ix_cred_verif_action ON credential_verifications(verification_action);


-- =====================================================================================
-- SECTION 8 — COST, LMS ENROLMENT, LEARNING PATHS, CPD & RETENTION
-- =====================================================================================

-- training_costs ----------------------------------------------------------------------
CREATE TABLE training_costs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    training_budget_id    uuid NOT NULL REFERENCES training_budgets(id) ON DELETE RESTRICT,
    training_session_id   uuid REFERENCES training_sessions(id) ON DELETE SET NULL,
    training_nomination_id uuid REFERENCES training_nominations(id) ON DELETE SET NULL,
    vendor_empanelment_id uuid REFERENCES vendor_empanelments(id) ON DELETE SET NULL,
    training_sponsorship_id uuid REFERENCES training_sponsorships(id) ON DELETE SET NULL,
    cost_type             g07_cost_type NOT NULL,
    amount                numeric(12,2) NOT NULL DEFAULT 0,         -- VAL-CURRENCY
    cost_stage            g07_cost_stage NOT NULL,
    payable_to_payroll    boolean NOT NULL DEFAULT false,          -- reimbursement/bond-recovery -> G10 feed
    invoice_document_id   uuid REFERENCES documents(id) ON DELETE SET NULL,
    status                g07_cost_status NOT NULL DEFAULT 'DRAFT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_costs_tenant      ON training_costs(tenant_id);
CREATE INDEX ix_costs_entity      ON training_costs(entity_id);
CREATE INDEX ix_costs_budget      ON training_costs(training_budget_id);
CREATE INDEX ix_costs_session     ON training_costs(training_session_id);
CREATE INDEX ix_costs_nomination  ON training_costs(training_nomination_id);
CREATE INDEX ix_costs_vendor      ON training_costs(vendor_empanelment_id);
CREATE INDEX ix_costs_sponsorship ON training_costs(training_sponsorship_id);
CREATE INDEX ix_costs_invoice     ON training_costs(invoice_document_id);
CREATE INDEX ix_costs_type        ON training_costs(cost_type);
CREATE INDEX ix_costs_status      ON training_costs(status);
CREATE INDEX ix_costs_payable     ON training_costs(payable_to_payroll) WHERE payable_to_payroll = true;

-- lms_enrollments ---------------------------------------------------------------------
CREATE TABLE lms_enrollments (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    training_nomination_id  uuid NOT NULL REFERENCES training_nominations(id) ON DELETE RESTRICT,
    learning_record_store_id uuid NOT NULL REFERENCES learning_record_stores(id) ON DELETE RESTRICT,
    lms_content_package_id  uuid REFERENCES lms_content_packages(id) ON DELETE SET NULL,
    sync_mode               g07_sync_mode NOT NULL,
    lms_course_ref          varchar(120) NOT NULL,
    lms_user_ref            varchar(120) NOT NULL,
    standard                g07_lms_standard NOT NULL DEFAULT 'NONE',
    progress_pct            numeric(5,2) NOT NULL DEFAULT 0,         -- VAL-PCT 0-100
    completion_status       g07_lms_completion_status NOT NULL DEFAULT 'NOT_STARTED',
    score                   numeric(6,2),
    last_synced_at          timestamptz,
    last_poll_cursor        varchar(120),                            -- SCORM reporting-API poll cursor (X.3)
    lms_statement_id        varchar(120),                            -- xAPI statement / X.3 inbound idempotency
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_lms_enrollments_pct CHECK (progress_pct >= 0 AND progress_pct <= 100)
);
CREATE INDEX ix_lms_enroll_tenant     ON lms_enrollments(tenant_id);
CREATE INDEX ix_lms_enroll_entity     ON lms_enrollments(entity_id);
CREATE INDEX ix_lms_enroll_nomination ON lms_enrollments(training_nomination_id);
CREATE INDEX ix_lms_enroll_lrs        ON lms_enrollments(learning_record_store_id);
CREATE INDEX ix_lms_enroll_package    ON lms_enrollments(lms_content_package_id);
CREATE INDEX ix_lms_enroll_completion ON lms_enrollments(completion_status);
CREATE INDEX ix_lms_enroll_statement  ON lms_enrollments(lms_statement_id);

-- learning_paths ----------------------------------------------------------------------
CREATE TABLE learning_paths (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    code                 varchar(40) NOT NULL,                      -- VAL-MASTER-UNIQUE
    name                 varchar(200) NOT NULL,
    description          text,
    target_competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
    status               g07_master_status NOT NULL DEFAULT 'DRAFT',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_learning_paths_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_learning_paths_tenant     ON learning_paths(tenant_id);
CREATE INDEX ix_learning_paths_entity     ON learning_paths(entity_id);
CREATE INDEX ix_learning_paths_competency ON learning_paths(target_competency_id);
CREATE INDEX ix_learning_paths_status     ON learning_paths(status);

-- learning_path_items -----------------------------------------------------------------
CREATE TABLE learning_path_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    learning_path_id    uuid NOT NULL REFERENCES learning_paths(id) ON DELETE RESTRICT,
    training_program_id uuid NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
    step_order          integer NOT NULL,
    is_mandatory        boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_learning_path_items UNIQUE (learning_path_id, step_order)
);
CREATE INDEX ix_lpi_tenant  ON learning_path_items(tenant_id);
CREATE INDEX ix_lpi_entity  ON learning_path_items(entity_id);
CREATE INDEX ix_lpi_path    ON learning_path_items(learning_path_id);
CREATE INDEX ix_lpi_program ON learning_path_items(training_program_id);

-- cpd_records (APPEND-ONLY; CPD credits earned) ---------------------------------------
CREATE TABLE cpd_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    training_program_id uuid REFERENCES training_programs(id) ON DELETE SET NULL,
    certification_id    uuid REFERENCES certifications(id) ON DELETE SET NULL,
    credit_points       numeric(6,2) NOT NULL DEFAULT 0,
    cpd_category        varchar(60),
    earned_on           date NOT NULL,
    source              varchar(60),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid
);
CREATE INDEX ix_cpd_records_tenant   ON cpd_records(tenant_id);
CREATE INDEX ix_cpd_records_employee ON cpd_records(employee_id);
CREATE INDEX ix_cpd_records_program  ON cpd_records(training_program_id);
CREATE INDEX ix_cpd_records_cert     ON cpd_records(certification_id);
CREATE INDEX ix_cpd_records_earned   ON cpd_records(earned_on);

-- learning_data_retention_actions (APPEND-ONLY; DPDP exit) ----------------------------
CREATE TABLE learning_data_retention_actions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    trigger_event       g07_retention_trigger NOT NULL,
    action_type         g07_retention_action_type NOT NULL,
    scope_entity        varchar(60) NOT NULL,                       -- e.g. employee_skills, training_feedback
    retention_override  boolean NOT NULL DEFAULT false,             -- true = kept under statutory retention
    approved_by         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- DPO (!= requester)
    executed_at         timestamptz,                                -- realised via P05 redaction-marker path
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid
);
CREATE INDEX ix_ldra_tenant   ON learning_data_retention_actions(tenant_id);
CREATE INDEX ix_ldra_employee ON learning_data_retention_actions(employee_id);
CREATE INDEX ix_ldra_approver ON learning_data_retention_actions(approved_by);
CREATE INDEX ix_ldra_action   ON learning_data_retention_actions(action_type);


-- =====================================================================================
-- SECTION R — ROW-LEVEL SECURITY (P02 tenant-isolation; CONVENTIONS §6)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to EVERY G07 table (including the
-- append-only ledgers — read isolation; their immutability is a separate grant/trigger
-- concern owned by P05). Module connects as a non-superuser role and sets per request:
--   SET app.current_tenant_id = '<tenant uuid>'; SET app.is_platform_admin = 'true'|'false';
DO $$
DECLARE
    t text;
    g07_tables text[] := ARRAY[
        'skill_categories','skills','proficiency_levels','competencies','competency_models',
        'competency_model_items','employee_skills','skill_assessments','skill_gap_analyses',
        'skill_gap_items','training_needs','training_programs','trainers','venues',
        'annual_training_plans','training_plan_items','training_budgets','training_sessions',
        'learning_record_stores','lms_content_packages','assessment_items','training_campaigns',
        'training_nominations','campaign_targets','training_attendance','training_assessments',
        'training_feedback','vendor_empanelments','training_sponsorships','certifications',
        'credential_verifications','training_costs','lms_enrollments','learning_paths',
        'learning_path_items','cpd_records','learning_data_retention_actions'
    ];
BEGIN
    FOREACH t IN ARRAY g07_tables LOOP
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
-- SECTION S — SAMPLE SEED ROWS (main tables; 2-3 rows each)
-- =====================================================================================
-- Reuses 00-core fixed UUIDs. GUCs set so the RLS WITH CHECK passes during seeding.
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- skill_categories --------------------------------------------------------------------
INSERT INTO skill_categories (id, tenant_id, entity_id, code, name, status) VALUES
 ('07c10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CAT-IT','Information Technology','PUBLISHED'),
 ('07c10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CAT-BEHAV','Behavioural & Leadership','PUBLISHED');

-- skills ------------------------------------------------------------------------------
INSERT INTO skills (id, tenant_id, entity_id, skill_category_id, code, name, is_compliance_skill, default_validity_months, revalidation_interval_months, status) VALUES
 ('07581001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07c10001-0000-0000-0000-000000000001','SKL-CYBER','Cyber-Security Awareness', true, 12, 12,'PUBLISHED'),
 ('07581001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07c10001-0000-0000-0000-000000000001','SKL-DBA','Database Administration', false, NULL, 24,'PUBLISHED'),
 ('07581001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07c10001-0000-0000-0000-000000000002','SKL-LEAD','Team Leadership', false, NULL, NULL,'PUBLISHED');

-- proficiency_levels ------------------------------------------------------------------
INSERT INTO proficiency_levels (id, tenant_id, level_order, code, name, descriptor, status) VALUES
 ('07901001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,'L1','Awareness','Can describe the concept and recognise when it applies.','PUBLISHED'),
 ('07901001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',2,'L2','Working','Performs the task with guidance under routine conditions.','PUBLISHED'),
 ('07901001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',3,'L3','Proficient','Performs independently and resolves non-routine cases.','PUBLISHED');

-- competencies ------------------------------------------------------------------------
INSERT INTO competencies (id, tenant_id, entity_id, code, name, competency_type, linked_skill_ids, status) VALUES
 ('07c00001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','COMP-CYBER','Cyber-Security Compliance','COMPLIANCE','{07581001-0000-0000-0000-000000000001}','PUBLISHED'),
 ('07c00001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','COMP-DBMGMT','Data Management','TECHNICAL','{07581001-0000-0000-0000-000000000002}','PUBLISHED');

-- competency_models -------------------------------------------------------------------
INSERT INTO competency_models (id, tenant_id, entity_id, code, name, scope_type, designation_id, role_id, owner_id, review_due_date, effective_from, status) VALUES
 ('07c90001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CM-DC','Deputy Commissioner Model','DESIGNATION','77777777-7777-7777-7777-777777777701',NULL,'99999999-9999-9999-9999-999999999901','2027-04-01','2026-04-01','PUBLISHED'),
 ('07c90001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CM-HRADMIN-ROLE','HR Administrator Role Model','ROLE',NULL,'88888888-8888-8888-8888-888888888802','99999999-9999-9999-9999-999999999902','2026-12-31','2026-01-01','PUBLISHED');

-- competency_model_items --------------------------------------------------------------
INSERT INTO competency_model_items (id, tenant_id, entity_id, competency_model_id, competency_id, target_proficiency_level_id, is_critical, sequence_no) VALUES
 ('07c91001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07c90001-0000-0000-0000-000000000001','07c00001-0000-0000-0000-000000000001','07901001-0000-0000-0000-000000000003', true, 1),
 ('07c91001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07c90001-0000-0000-0000-000000000001','07c00001-0000-0000-0000-000000000002','07901001-0000-0000-0000-000000000002', false, 2);

-- employee_skills ---------------------------------------------------------------------
INSERT INTO employee_skills (id, tenant_id, entity_id, employee_id, skill_id, current_proficiency_level_id, source, status, freshness_status) VALUES
 ('07e50001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','07581001-0000-0000-0000-000000000001','07901001-0000-0000-0000-000000000002','CERTIFICATION','VALIDATED','FRESH'),
 ('07e50001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','07581001-0000-0000-0000-000000000002','07901001-0000-0000-0000-000000000003','MANAGER','VALIDATED','STALE');

-- training_programs -------------------------------------------------------------------
INSERT INTO training_programs (id, tenant_id, entity_id, code, name, delivery_mode, provider_type, is_mandatory, certification_on_completion, certificate_validity_months, default_capacity, default_cost, status) VALUES
 ('07709001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PRG-CYBER-2026','Annual Cyber-Security Awareness','ELEARNING','INTERNAL', true, true, 12, 5000, 0,'PUBLISHED'),
 ('07709001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PRG-DBA-ADV','Advanced Database Administration','CLASSROOM','GOVT_INSTITUTE', false, true, NULL, 30, 45000,'PUBLISHED');

-- training_sessions -------------------------------------------------------------------
INSERT INTO training_sessions (id, tenant_id, entity_id, training_program_id, session_code, title, delivery_mode, start_date, end_date, nomination_deadline, capacity, status) VALUES
 ('07505001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07709001-0000-0000-0000-000000000001','SES-CYBER-W1','Cyber Awareness — Wave 1','ELEARNING','2026-07-01','2026-07-31','2026-06-25', 500,'OPEN'),
 ('07505001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07709001-0000-0000-0000-000000000002','SES-DBA-Q2','Advanced DBA — Q2 Batch','CLASSROOM','2026-08-10','2026-08-14','2026-07-31', 30,'OPEN');

-- training_campaigns ------------------------------------------------------------------
INSERT INTO training_campaigns (id, tenant_id, entity_id, code, name, training_program_id, scope_type, financial_year, window_start, window_end, renewal_cadence_months, coverage_denominator_rule, status) VALUES
 ('07ca9001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CAMP-CYBER-2026','Mandatory Cyber-Security 2026','07709001-0000-0000-0000-000000000001','ALL_STAFF','2026-2027','2026-07-01','2026-09-30', 12,'EXCLUDE_LONG_LEAVE','RUNNING');

-- training_nominations ----------------------------------------------------------------
INSERT INTO training_nominations (id, tenant_id, entity_id, training_session_id, employee_id, training_campaign_id, nomination_type, nominated_by, status) VALUES
 ('07009001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07505001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','07ca9001-0000-0000-0000-000000000001','CAMPAIGN','99999999-9999-9999-9999-999999999901','APPROVED'),
 ('07009001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','07505001-0000-0000-0000-000000000002','99999999-9999-9999-9999-999999999902',NULL,'MANAGER','99999999-9999-9999-9999-999999999901','PENDING_L1');

-- campaign_targets --------------------------------------------------------------------
INSERT INTO campaign_targets (id, tenant_id, training_campaign_id, employee_id, is_eligible, wave_no, training_nomination_id, target_status, due_date) VALUES
 ('07ca7001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','07ca9001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901', true, 1,'07009001-0000-0000-0000-000000000001','NOMINATED','2026-09-30'),
 ('07ca7001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','07ca9001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902', true, NULL, NULL,'PENDING','2026-09-30');

-- learning_record_stores (X.3 connector; credential ref to P04 only) ------------------
INSERT INTO learning_record_stores (id, tenant_id, code, name, connector_type, is_primary, endpoint_url, integration_credential_ref, supported_standards, status) VALUES
 ('071c5001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PRIMARY-LRS','Primary xAPI LRS','LRS_XAPI', true,'https://lrs.internal/xapi','INTCRED-LRS-01','XAPI','ACTIVE'),
 ('071c5001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','LEGACY-LMS','Legacy SCORM LMS','LMS_REPORTING_API', false,'https://lms.gov/api','INTCRED-LMS-02','SCORM_12,SCORM_2004','ACTIVE');

-- certifications (internal mandatory POSTED to G12 + external professional) ------------
INSERT INTO certifications (id, tenant_id, entity_id, employee_id, credential_source, training_program_id, certificate_no, title, issuing_authority, issuing_body, external_reference_no, verification_status, verified_by, issue_date, valid_until, is_mandatory, sr_posting_status, service_register_event_id, status) VALUES
 ('07ce6001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','INTERNAL_PROGRAM','07709001-0000-0000-0000-000000000001','CERT-CYBER-0001','Cyber-Security Awareness 2026','CGG L&D',NULL,NULL,'NOT_REQUIRED',NULL,'2026-07-31','2027-07-31', true,'POSTED','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','ACTIVE'),
 ('07ce6001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','EXTERNAL_PROFESSIONAL',NULL,'CERT-PMP-0002','Project Management Professional','SELF-DECLARED','PMI','PMP-1234567','VERIFIED','99999999-9999-9999-9999-999999999901','2025-03-15',NULL, false,'NOT_REQUIRED',NULL,'ACTIVE');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 07-G07-training-skill-development.sql  (37 module-owned tables)
-- =====================================================================================
