-- =====================================================================================
-- GOVERNMENT HRMS — G08 PERFORMANCE APPRAISAL MANAGEMENT (08-G08-performance-appraisal.sql)
-- =====================================================================================
-- Module-owned DDL for G08 (alias GOV-M08; supersedes M08-PAM). Authors the 23 module
-- entities of BRD v3 §5.1 (E1..E23): the statutory APAR adjudication layer on top of the
-- reused PrimeSoft M09 performance model (goal plans, review cycles, calibration, PIP,
-- MSF). Cycles, templates, scales, the APAR form wrapper, goals, self-appraisal, multi-RO
-- part-period reports, multi-tier assessments, representations/appeals, calibration
-- recommendation+ratification, COI recusals, digital signatures, disclosure/custody
-- ledger, competency assessment, continuous feedback, 360/MSF, and PIP.
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                         (MANDATORY conventions)
--   docs/data-model/00-platform-core.sql                   (shared core — FK targets)
--   docs/brd/v3/G08-performance-appraisal-management.md §5  (entities, enums, integrity)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Run AFTER 00-platform-core.sql. G08 references only the core tables (employees,
--   org_units, designations, roles, workflow_instances/workflow_actions, documents,
--   service_register_events, integration_credentials). It does NOT depend on other module
--   schemas. Load order: 00 -> 01 -> ... -> 08.
--
-- CORE TABLES REFERENCED (FK by id; NEVER redefined here):
--   tenants, entities, org_units, designations, employees,
--   workflow_instances (P01), workflow_actions (P01), documents (G13),
--   service_register_events (G12), integration_credentials (P04/X.3).
--   audit_log / security_audit_log / notifications / jobs are written by the platform
--   substrate (P05 trigger / X.2 / X.1), NOT by module DDL.
--
-- KEY DESIGN POINTS (per BRD + CONVENTIONS):
--   * Every business table carries tenant_id (NOT NULL) + entity_id where entity-scoped.
--   * Standard audit columns on non-ledger tables; append-only LEDGERS carry only
--     created_at/created_by (NO updated_at, NO is_deleted): apar_disclosure_log (E18),
--     form_goal_snapshots (E20), digital_signatures (E23).
--   * APAR multi-tier (Reporting -> Reviewing -> Accepting), representation, calibration,
--     sealed-cover, errata and SLA auto-escalation run on the P01 engine —
--     appraisal_forms / representations reference workflow_instances; appraisal_assessments
--     references workflow_actions. This schema stores the reference only; it does NOT
--     re-implement approval state machines.
--   * G08 posts APAR_FINAL_GRADE (category APPRAISAL) to the core G12 service_register_events
--     ledger via G12's ingestion contract (writer; dedup tuple + source_module='G08'; NO
--     fact_key — APAR is not qualifying-service-bearing). appraisal_forms stores only the
--     posted reference (posted_to_sr flag). G08 NEVER mutates the ledger in DDL.
--   * Tamper-evidence is the P05 dual-log DB trigger + OPEN-PLAT-03 (hash-chain head to
--     WORM). NO module hash-chain table — apar_disclosure_log carries a chain_anchor_ref
--     to the OPEN-PLAT-03 batch only, no bespoke prev_hash/row_hash.
--   * Confidentiality is the P02 PII ceiling + field-mask-on-serialization (above RLS).
--   * Digital signatures (E23) run on X.3 provider + P04 creds + G13 artefact store; the
--     signature_value/payload_hash are recorded, the raw artefact lives in documents (G13).
--   * Module enums use Postgres ENUM types (closed enumerations), prefixed `g08_`, with
--     UPPER_SNAKE_CASE values, to avoid collision with core types.
--   * Tenant-CONFIGURABLE value sets (cycle/template/scale codes) are master rows with
--     tenant-scoped UNIQUE codes (VAL-MASTER-UNIQUE), not enums.
--   * RLS: the canonical tenant-isolation policy (CONVENTIONS §6) is applied to ALL 23
--     tables (Section R), including the append-only ledgers (read isolation).
--
-- CORE-TABLE ASSUMPTIONS / FORWARD REFERENCES:
--   * appraisal_forms (E4) is referenced by most child tables; digital_signatures (E23)
--     is referenced back by appraisal_forms.certification_signature_id and by several
--     tier/no-report/ratification columns. The signature_id FKs are resolved in Section F
--     (deferred ALTER) because E23 is created after the tables that reference it.
--   * Seed rows reuse the 00-core fixed UUIDs (tenant 1111…1111, entity 2222…2201,
--     employees 9999…9901/02, org_unit 3333…3301, designation 7777…7701).
--
-- -- RECON (2026-07-01): Section 3 (below) is an ADD-only amendment reconciling the DarwinBox
--   "DwnB Form Fields / Performance Management" CSV ground-truth exports against this schema.
--   Gap report: docs/data-model/reconciliation/g08-performance.md. Adds the PMS config/masters
--   that the reused M09 model carried but the statutory G08 core did not yet materialise:
--   scorecard_pillars, metrics, goal_plans, normalization_settings, custom_formula_settings,
--   calibration_settings (template vs the per-cycle calibration_sessions run), review_definitions,
--   review_excluded_employees, performance_translations — plus 12 goal-instance fields
--   (metric_id, metric_criteria, target_prefix, timeline_start/end_date, scorecard_pillar_id,
--   aligned_to_goal_id/ref, achievement_mapping, block_edit_achievement, assigned_to_roles,
--   goal_plan_master_id) and the g08_config_status enum. Existing E1..E23 content is unchanged.
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G08 closed enumerations; BRD §5.5)
-- =====================================================================================
CREATE TYPE g08_cycle_type            AS ENUM ('ANNUAL_APAR','MID_YEAR','PROBATION','CONTINUOUS','AD_HOC');
CREATE TYPE g08_cycle_status          AS ENUM ('DRAFT','OPEN','GOALS_LOCKED','IN_PROGRESS','CALIBRATION','DISCLOSURE','ERRATA','CLOSED','ARCHIVED');
CREATE TYPE g08_disclosure_channel    AS ENUM ('IN_APP','EMAIL','PHYSICAL','HYBRID');
CREATE TYPE g08_clock_start           AS ENUM ('DISPATCH','ACKNOWLEDGEMENT');
CREATE TYPE g08_template_status       AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TYPE g08_scale_status          AS ENUM ('ACTIVE','RETIRED');
CREATE TYPE g08_form_status           AS ENUM ('DRAFT','GOALS_PENDING','GOALS_APPROVED','SELF_APPRAISAL','RO_ASSESSMENT',
                                               'RVO_REVIEW','AA_ACCEPTANCE','CALIBRATION','SEALED_COVER','DISCLOSURE','DISCLOSED',
                                               'REPRESENTATION','ERRATA','FINALISED','POSTED','EXPUNGED','WITHDRAWN');
CREATE TYPE g08_chain_config          AS ENUM ('FULL','NO_RVO','NO_AA','SINGLE_TIER','DESIGNATED_ALTERNATE');
CREATE TYPE g08_probation_outcome     AS ENUM ('CONFIRMED','EXTENDED','DISCHARGE_RECOMMENDED');
CREATE TYPE g08_integrity_certified   AS ENUM ('BEYOND_DOUBT','WATCH','NOT_CERTIFIED');
CREATE TYPE g08_confidentiality_class AS ENUM ('PUBLIC','INTERNAL','CONFIDENTIAL','SECRET');
CREATE TYPE g08_period_scope          AS ENUM ('SINGLE_CYCLE','CROSS_CYCLE');
CREATE TYPE g08_goal_type             AS ENUM ('KRA','KPI','OKR_OBJECTIVE','OKR_KEYRESULT','DEVELOPMENT');
CREATE TYPE g08_goal_status           AS ENUM ('DRAFT','PROPOSED','APPROVED','REVISED','ACHIEVED','NOT_ACHIEVED','DROPPED');
CREATE TYPE g08_self_appraisal_status AS ENUM ('DRAFT','SUBMITTED','RETURNED');
CREATE TYPE g08_report_period_status  AS ENUM ('DRAFT','SUBMITTED','NO_REPORT','AGGREGATED');
CREATE TYPE g08_assessment_tier       AS ENUM ('REPORTING','REVIEWING','ACCEPTING');
CREATE TYPE g08_assessment_decision   AS ENUM ('SUBMITTED','RETURNED','CONCURRED','VARIED','CERTIFIED');
CREATE TYPE g08_gap_severity          AS ENUM ('NONE','MINOR','MODERATE','CRITICAL');
CREATE TYPE g08_feedback_type         AS ENUM ('PRAISE','CONSTRUCTIVE','COACHING','GENERAL');
CREATE TYPE g08_feedback_visibility   AS ENUM ('PRIVATE_TO_SUBJECT','MANAGER_ONLY','MANAGER_AND_SUBJECT');
CREATE TYPE g08_rater_relationship    AS ENUM ('PEER','SUBORDINATE','MANAGER','INTERNAL_CUSTOMER','EXTERNAL');
CREATE TYPE g08_msf_status            AS ENUM ('INVITED','IN_PROGRESS','SUBMITTED','DECLINED','EXPIRED');
CREATE TYPE g08_representation_decision AS ENUM ('UPHELD','PARTIALLY_UPHELD','REJECTED','EXPUNGED','MODIFIED','ESCALATED_EXTERNAL');
CREATE TYPE g08_representation_status AS ENUM ('FILED','UNDER_REVIEW','DECIDED','ESCALATED','CLOSED');
CREATE TYPE g08_external_reference    AS ENUM ('NONE','CAT','HIGH_COURT','TRIBUNAL');
CREATE TYPE g08_calibration_method    AS ENUM ('COMMITTEE_REVIEW','NORMALISATION','BELL_CURVE');
CREATE TYPE g08_calibration_status    AS ENUM ('PLANNED','IN_SESSION','RECOMMENDED','RATIFIED','COMPLETED','CANCELLED');
CREATE TYPE g08_recommendation_status AS ENUM ('PROPOSED','ENDORSED','REJECTED','RATIFIED','DECLINED');
CREATE TYPE g08_adjustment_status     AS ENUM ('APPLIED','REVERSED');
CREATE TYPE g08_coi_type              AS ENUM ('SPOUSE','CLOSE_RELATION','PRIOR_POSTING','FINANCIAL','STRUCTURAL_CHAIN','OTHER');
CREATE TYPE g08_coi_role_context      AS ENUM ('ADJUDICATOR','CALIB_MEMBER');
CREATE TYPE g08_signature_entity_type AS ENUM ('ASSESSMENT','DISCLOSURE_ACK','CALIBRATION_RATIFICATION','EXPUNCTION',
                                               'NO_REPORT_CERT','SEALED_COVER_RELEASE','DISPOSAL','CONFIDENTIALITY_DOWNGRADE');
CREATE TYPE g08_signature_method      AS ENUM ('DSC','AADHAAR_ESIGN','HSM_TOKEN');
CREATE TYPE g08_signature_verification AS ENUM ('VALID','REVOKED','EXPIRED','INVALID');
CREATE TYPE g08_pip_status            AS ENUM ('DRAFT','ACTIVE','UNDER_REVIEW','CLOSED');
CREATE TYPE g08_pip_outcome           AS ENUM ('SUCCESSFUL','EXTENDED','UNSUCCESSFUL','ABANDONED');
CREATE TYPE g08_milestone_status      AS ENUM ('PENDING','ON_TRACK','AT_RISK','MET','MISSED');
CREATE TYPE g08_disclosure_event_type AS ENUM ('DISPATCHED','DISCLOSED','VIEWED','ACKNOWLEDGED','DOWNLOADED','ACCESS_DENIED',
                                               'CUSTODY_TRANSFER','SEALED','UNSEALED','HEIR_ACCESS','EXPUNGED','ANCHOR');


-- =====================================================================================
-- SECTION 2 — MODULE TABLES (E1..E23)
-- =====================================================================================

-- E1 — appraisal_cycles [EXTEND M09 appraisal period/review cycle] ---------------------
CREATE TABLE appraisal_cycles (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- cycle_id
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    cycle_code                    varchar(40) NOT NULL,                         -- VAL-MASTER-UNIQUE
    name                          varchar(160) NOT NULL,
    cycle_type                    g08_cycle_type NOT NULL,
    fiscal_year                   varchar(9) NOT NULL,
    m09_review_cycle_id           uuid,                                         -- logical ref to M09 review_cycles
    m09_goal_plan_window_id       uuid,                                         -- logical ref to M09 goal window
    goal_window_start             date NOT NULL,
    goal_window_end               date NOT NULL,
    appraisal_period_start        date NOT NULL,
    appraisal_period_end          date NOT NULL,
    self_appraisal_due            date,
    ro_due                        date,
    rvo_due                       date,
    aa_due                        date,
    template_id                   uuid NOT NULL,                                -- FK -> appraisal_templates (Section F)
    rating_scale_id               uuid NOT NULL,                                -- FK -> rating_scales (Section F)
    eligibility_rule              jsonb,
    disclosure_channel            g08_disclosure_channel NOT NULL DEFAULT 'HYBRID',
    representation_clock_start     g08_clock_start NOT NULL DEFAULT 'DISPATCH',
    representation_window_days     integer NOT NULL DEFAULT 30,                  -- VAL-G08-REPWINDOW
    deemed_disclosure_days         integer NOT NULL DEFAULT 15,                  -- JOB-M09-AUTOACK
    calibration_enabled           boolean NOT NULL DEFAULT false,               -- flag g08.calibration (R16)
    min_supervision_months        numeric(4,1) NOT NULL DEFAULT 3.0,            -- VAL-G08-SUPV
    chain_truncation_policy       jsonb,                                        -- VAL-G08-CHAIN (R12)
    probation_period_months       integer,
    probation_extension_max_months integer,
    status                        g08_cycle_status NOT NULL DEFAULT 'DRAFT',
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid,
    updated_by                    uuid,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_appraisal_cycles_code  UNIQUE (tenant_id, cycle_code),
    CONSTRAINT ck_appraisal_cycles_goal_window  CHECK (goal_window_end >= goal_window_start),
    CONSTRAINT ck_appraisal_cycles_period       CHECK (appraisal_period_end >= appraisal_period_start),
    CONSTRAINT ck_appraisal_cycles_supv         CHECK (min_supervision_months >= 0)
);
CREATE INDEX ix_appraisal_cycles_tenant   ON appraisal_cycles(tenant_id);
CREATE INDEX ix_appraisal_cycles_entity   ON appraisal_cycles(entity_id);
CREATE INDEX ix_appraisal_cycles_template ON appraisal_cycles(template_id);
CREATE INDEX ix_appraisal_cycles_scale    ON appraisal_cycles(rating_scale_id);
CREATE INDEX ix_appraisal_cycles_status   ON appraisal_cycles(status);
CREATE INDEX ix_appraisal_cycles_type     ON appraisal_cycles(cycle_type);

-- E2 — appraisal_templates [EXTEND M09 review template, as W.2 form] -------------------
CREATE TABLE appraisal_templates (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- template_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    template_code            varchar(40) NOT NULL,                        -- VAL-MASTER-UNIQUE
    name                     varchar(160) NOT NULL,
    version                  integer NOT NULL DEFAULT 1,                   -- immutable per published version
    applies_to_cadre         text[],
    w2_form_def_id           uuid,                                        -- logical ref to W.2 form definition
    sections                 jsonb NOT NULL,
    competency_set           jsonb NOT NULL,                              -- references G07 competency ids
    weightage_policy         jsonb NOT NULL,                              -- VAL-WEIGHTAGE/WSUM/SUBWSUM
    integrity_column_enabled boolean NOT NULL DEFAULT true,
    penpicture_min_words     integer,
    requires_dsc             boolean NOT NULL DEFAULT true,               -- R10
    status                   g08_template_status NOT NULL DEFAULT 'DRAFT',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_appraisal_templates_code UNIQUE (tenant_id, template_code, version)
);
CREATE INDEX ix_appraisal_templates_tenant ON appraisal_templates(tenant_id);
CREATE INDEX ix_appraisal_templates_entity ON appraisal_templates(entity_id);
CREATE INDEX ix_appraisal_templates_status ON appraisal_templates(status);

-- E3 — rating_scales [EXTEND M09 rating] -----------------------------------------------
CREATE TABLE rating_scales (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- rating_scale_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    scale_code             varchar(40) NOT NULL,                        -- VAL-MASTER-UNIQUE
    name                   varchar(120) NOT NULL,
    min_value              numeric(4,2) NOT NULL,
    max_value              numeric(4,2) NOT NULL,
    grades                 jsonb NOT NULL,                              -- [{label,min,max,descriptor}]
    benchmark_grade        numeric(4,2) NOT NULL,
    adverse_threshold      numeric(4,2) NOT NULL,
    decimal_places         integer NOT NULL DEFAULT 2,
    contribution_level_map jsonb,                                       -- grade -> M09 contribution_level
    status                 g08_scale_status NOT NULL DEFAULT 'ACTIVE',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_rating_scales_code  UNIQUE (tenant_id, scale_code),
    CONSTRAINT ck_rating_scales_bounds CHECK (max_value > min_value
                                              AND benchmark_grade BETWEEN min_value AND max_value
                                              AND adverse_threshold BETWEEN min_value AND max_value)
);
CREATE INDEX ix_rating_scales_tenant ON rating_scales(tenant_id);
CREATE INDEX ix_rating_scales_status ON rating_scales(status);

-- E4 — appraisal_forms (APAR instance) [NEW statutory wrapper] -------------------------
CREATE TABLE appraisal_forms (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- form_id
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    apar_no                       varchar(40) NOT NULL,
    cycle_id                      uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
    m09_review_id                 uuid,                                        -- logical ref to M09 performance_reviews
    appraisee_id                  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    org_unit_id                   uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,    -- snapshot at open
    designation_id                uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT, -- snapshot at open
    reporting_officer_id          uuid REFERENCES employees(id) ON DELETE SET NULL,            -- null when multi-RO
    has_multi_ro                  boolean NOT NULL DEFAULT false,
    reviewing_officer_id          uuid REFERENCES employees(id) ON DELETE SET NULL,
    accepting_authority_id        uuid REFERENCES employees(id) ON DELETE SET NULL,
    chain_truncated               boolean NOT NULL DEFAULT false,
    chain_config                  g08_chain_config NOT NULL DEFAULT 'FULL',
    integrity_certified           g08_integrity_certified,
    integrity_remark              text,                                        -- required if not BEYOND_DOUBT
    pen_picture                   text,
    provisional_grade             numeric(4,2),                                -- supervision-weighted (E19)
    reviewed_grade                numeric(4,2),                                -- RvO stage
    final_grade                   numeric(4,2),                                -- AA-certified
    final_grade_label             varchar(40),
    is_adverse                    boolean NOT NULL DEFAULT false,              -- derived on certify
    below_benchmark               boolean NOT NULL DEFAULT false,              -- derived on certify
    adverse_evidence_refs         uuid[],                                      -- VAL-G08-ADVEVID (R5)
    calibrated                    boolean NOT NULL DEFAULT false,
    pre_calibration_grade         numeric(4,2),
    sealed_cover                  boolean NOT NULL DEFAULT false,              -- R3
    sealed_cover_reason           text,
    sealed_cover_case_ref         varchar(60),                                 -- G09 case reference
    sealed_at                     timestamptz,
    sealed_released_at            timestamptz,
    dispatched_at                 timestamptz,                                 -- disclosure clock (R8)
    disclosed_at                  timestamptz,
    acknowledged_at               timestamptz,
    representation_window_start_at timestamptz,
    representation_window_end_at   timestamptz,
    probation_outcome             g08_probation_outcome,
    certification_signature_id    uuid,                                        -- FK -> digital_signatures (Section F)
    status                        g08_form_status NOT NULL DEFAULT 'DRAFT',
    workflow_instance_id          uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,   -- P01
    generated_pdf_doc_id          uuid REFERENCES documents(id) ON DELETE SET NULL,            -- G13
    posted_to_sr                  boolean NOT NULL DEFAULT false,              -- G12 APAR_FINAL_GRADE posted
    service_register_event_id     uuid REFERENCES service_register_events(id) ON DELETE SET NULL, -- G12 ref
    confidentiality_class         g08_confidentiality_class NOT NULL DEFAULT 'CONFIDENTIAL',   -- P02 ceiling
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid,
    updated_by                    uuid,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_appraisal_forms_apar_no UNIQUE (tenant_id, apar_no),
    CONSTRAINT uq_appraisal_forms_one_per_cycle UNIQUE (tenant_id, cycle_id, appraisee_id)   -- §5.6 rule 8
);
CREATE INDEX ix_appraisal_forms_tenant     ON appraisal_forms(tenant_id);
CREATE INDEX ix_appraisal_forms_entity     ON appraisal_forms(entity_id);
CREATE INDEX ix_appraisal_forms_cycle      ON appraisal_forms(cycle_id);
CREATE INDEX ix_appraisal_forms_appraisee  ON appraisal_forms(appraisee_id);
CREATE INDEX ix_appraisal_forms_ro         ON appraisal_forms(reporting_officer_id);
CREATE INDEX ix_appraisal_forms_rvo        ON appraisal_forms(reviewing_officer_id);
CREATE INDEX ix_appraisal_forms_aa         ON appraisal_forms(accepting_authority_id);
CREATE INDEX ix_appraisal_forms_orgunit    ON appraisal_forms(org_unit_id);
CREATE INDEX ix_appraisal_forms_status     ON appraisal_forms(status);
CREATE INDEX ix_appraisal_forms_wf         ON appraisal_forms(workflow_instance_id);
CREATE INDEX ix_appraisal_forms_sre        ON appraisal_forms(service_register_event_id);
CREATE INDEX ix_appraisal_forms_sealed     ON appraisal_forms(sealed_cover) WHERE sealed_cover = true;

-- E5 — goals [EXTEND M09 goals / goal_plans] -------------------------------------------
CREATE TABLE goals (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- goal_id (M09 goal id)
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    goal_plan_id              uuid,                                        -- logical ref to M09 goal_plans
    appraisee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    cycle_id                  uuid REFERENCES appraisal_cycles(id) ON DELETE SET NULL,  -- nullable: cross-cycle (R6)
    form_id                   uuid REFERENCES appraisal_forms(id) ON DELETE SET NULL,   -- nullable: set on snapshot (R6)
    period_scope              g08_period_scope NOT NULL DEFAULT 'SINGLE_CYCLE',
    goal_type                 g08_goal_type NOT NULL,
    parent_goal_id            uuid REFERENCES goals(id) ON DELETE SET NULL,             -- VAL-FLOW-NOCYCLE
    cascaded_from_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    title                     varchar(200) NOT NULL,                       -- VAL-GOALNAME (unique within plan)
    description               text,
    metric                    varchar(255),
    target_value              varchar(255),
    weightage                 numeric(5,2) NOT NULL DEFAULT 0,             -- VAL-WEIGHTAGE/WSUM
    due_date                  date,
    achievement_pct           numeric(5,2),                               -- VAL-ACHV
    self_rating               numeric(4,2),
    ro_rating                 numeric(4,2),
    snapshotted               boolean NOT NULL DEFAULT false,
    status                    g08_goal_status NOT NULL DEFAULT 'DRAFT',
    approved_by               uuid REFERENCES employees(id) ON DELETE SET NULL,
    approved_at               timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_goals_weightage CHECK (weightage >= 0)
);
CREATE INDEX ix_goals_tenant     ON goals(tenant_id);
CREATE INDEX ix_goals_entity     ON goals(entity_id);
CREATE INDEX ix_goals_appraisee  ON goals(appraisee_id);
CREATE INDEX ix_goals_cycle      ON goals(cycle_id);
CREATE INDEX ix_goals_form       ON goals(form_id);
CREATE INDEX ix_goals_parent     ON goals(parent_goal_id);
CREATE INDEX ix_goals_plan       ON goals(goal_plan_id);
CREATE INDEX ix_goals_status     ON goals(status);

-- E6 — goal_checkins [EXTEND M09 check-in] ---------------------------------------------
CREATE TABLE goal_checkins (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- checkin_id
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    goal_id      uuid NOT NULL REFERENCES goals(id) ON DELETE RESTRICT,
    checkin_date date NOT NULL,
    progress_pct numeric(5,2),                                 -- VAL-ACHV
    status_note  text,
    blockers     text,
    raised_by    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_goal_checkins_tenant ON goal_checkins(tenant_id);
CREATE INDEX ix_goal_checkins_goal   ON goal_checkins(goal_id);
CREATE INDEX ix_goal_checkins_raiser ON goal_checkins(raised_by);

-- E7 — self_appraisals [EXTEND M09 self review] ----------------------------------------
CREATE TABLE self_appraisals (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- self_appraisal_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id                uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    achievements           text NOT NULL,                               -- VAL-REQUIRED
    goal_summary           jsonb,
    competency_self_rating jsonb,
    constraints_faced      text,
    training_needs         text,                                        -- feeds G07
    submitted_at           timestamptz,
    status                 g08_self_appraisal_status NOT NULL DEFAULT 'DRAFT',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_self_appraisals_form UNIQUE (form_id)                  -- §5.6 rule 7
);
CREATE INDEX ix_self_appraisals_tenant ON self_appraisals(tenant_id);
CREATE INDEX ix_self_appraisals_status ON self_appraisals(status);

-- E8 — appraisal_assessments [NEW multi-tier over M09 manager review] ------------------
CREATE TABLE appraisal_assessments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- assessment_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id              uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    report_period_id     uuid,                                        -- FK -> appraisal_report_periods (Section F)
    tier                 g08_assessment_tier NOT NULL,
    assessor_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    workflow_action_id   uuid REFERENCES workflow_actions(id) ON DELETE SET NULL,  -- P01 action ref
    is_escalated_author  boolean NOT NULL DEFAULT false,              -- R9
    overall_grade        numeric(4,2),
    section_grades       jsonb,
    remarks              text,
    adverse_evidence_refs uuid[],                                     -- VAL-G08-ADVEVID
    concurs_with_lower_tier boolean,
    variance_reason      text,                                        -- ERR-REASON-REQ if not concurring
    signature_id         uuid,                                        -- FK -> digital_signatures (Section F)
    decision             g08_assessment_decision,
    acted_at             timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_appraisal_assessments_tenant   ON appraisal_assessments(tenant_id);
CREATE INDEX ix_appraisal_assessments_form     ON appraisal_assessments(form_id);
CREATE INDEX ix_appraisal_assessments_period   ON appraisal_assessments(report_period_id);
CREATE INDEX ix_appraisal_assessments_assessor ON appraisal_assessments(assessor_id);
CREATE INDEX ix_appraisal_assessments_tier     ON appraisal_assessments(tier);
CREATE INDEX ix_appraisal_assessments_action   ON appraisal_assessments(workflow_action_id);

-- E9 — competency_assessments [EXTEND M09 competency + G07] ----------------------------
CREATE TABLE competency_assessments (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- comp_assessment_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id               uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    competency_id         uuid NOT NULL,                               -- references G07 catalog
    competency_name       varchar(160) NOT NULL,                       -- snapshot
    required_level        integer NOT NULL,
    self_level            integer,
    assessed_level        integer,
    gap                   integer,                                     -- derived required - assessed
    gap_severity          g08_gap_severity,
    training_nomination_id uuid,                                       -- G07 nomination from gap
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_competency_assessments_tenant ON competency_assessments(tenant_id);
CREATE INDEX ix_competency_assessments_form   ON competency_assessments(form_id);
CREATE INDEX ix_competency_assessments_comp   ON competency_assessments(competency_id);

-- E10 — continuous_feedback [EXTEND M09 continuous feedback + two-way thread] -----------
CREATE TABLE continuous_feedback (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- feedback_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    subject_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    author_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    cycle_id            uuid REFERENCES appraisal_cycles(id) ON DELETE SET NULL,
    feedback_type       g08_feedback_type NOT NULL,
    visibility          g08_feedback_visibility NOT NULL DEFAULT 'MANAGER_AND_SUBJECT',
    body                text NOT NULL,
    parent_feedback_id  uuid REFERENCES continuous_feedback(id) ON DELETE SET NULL,  -- two-way thread
    linked_goal_id      uuid REFERENCES goals(id) ON DELETE SET NULL,
    is_acknowledged     boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_continuous_feedback_tenant  ON continuous_feedback(tenant_id);
CREATE INDEX ix_continuous_feedback_subject ON continuous_feedback(subject_employee_id);
CREATE INDEX ix_continuous_feedback_author  ON continuous_feedback(author_id);
CREATE INDEX ix_continuous_feedback_cycle   ON continuous_feedback(cycle_id);
CREATE INDEX ix_continuous_feedback_parent  ON continuous_feedback(parent_feedback_id);
CREATE INDEX ix_continuous_feedback_goal    ON continuous_feedback(linked_goal_id);

-- E11 — feedback_360_requests [EXTEND M09 MSF] -----------------------------------------
CREATE TABLE feedback_360_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- request_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id             uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    subject_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    rater_id            uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    rater_relationship  g08_rater_relationship NOT NULL,
    anonymous           boolean NOT NULL DEFAULT true,
    due_date            date,
    status              g08_msf_status NOT NULL DEFAULT 'INVITED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_feedback_360_requests_tenant  ON feedback_360_requests(tenant_id);
CREATE INDEX ix_feedback_360_requests_form    ON feedback_360_requests(form_id);
CREATE INDEX ix_feedback_360_requests_subject ON feedback_360_requests(subject_employee_id);
CREATE INDEX ix_feedback_360_requests_rater   ON feedback_360_requests(rater_id);
CREATE INDEX ix_feedback_360_requests_status  ON feedback_360_requests(status);

-- E12 — feedback_360_responses [EXTEND M09 MSF] ----------------------------------------
CREATE TABLE feedback_360_responses (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- response_id
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    request_id   uuid NOT NULL REFERENCES feedback_360_requests(id) ON DELETE RESTRICT,
    ratings      jsonb NOT NULL,                               -- per-competency/behaviour
    strengths    text,
    improvements text,
    submitted_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_feedback_360_responses_request UNIQUE (request_id)
);
CREATE INDEX ix_feedback_360_responses_tenant ON feedback_360_responses(tenant_id);

-- E13 — representations [NEW statutory] ------------------------------------------------
CREATE TABLE representations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- representation_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    rep_no                 varchar(40) NOT NULL,
    form_id                uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    appraisee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    grounds                text NOT NULL,
    contested_items        jsonb NOT NULL,
    supporting_doc_ids     uuid[],                                      -- G13 documents (VAL-FILE)
    filed_at               timestamptz NOT NULL,
    sla_due_at             timestamptz NOT NULL,                        -- VAL-G08-REPWINDOW
    disposal_deadline_at   timestamptz NOT NULL,                        -- JOB-G08-REP-SLA (R20)
    is_late                boolean NOT NULL DEFAULT false,
    condoned               boolean NOT NULL DEFAULT false,
    condonation_authority_id uuid REFERENCES employees(id) ON DELETE SET NULL,  -- flag g08.condonation
    condonation_reason     text,
    escalation_level       integer NOT NULL DEFAULT 1,
    external_reference     g08_external_reference NOT NULL DEFAULT 'NONE',
    external_ref_no        varchar(60),
    decision               g08_representation_decision,
    decision_authority_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
    decision_reason        text,
    revised_grade          numeric(4,2),
    workflow_instance_id   uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01
    status                 g08_representation_status NOT NULL DEFAULT 'FILED',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_representations_rep_no UNIQUE (tenant_id, rep_no)
);
CREATE INDEX ix_representations_tenant    ON representations(tenant_id);
CREATE INDEX ix_representations_entity    ON representations(entity_id);
CREATE INDEX ix_representations_form      ON representations(form_id);
CREATE INDEX ix_representations_appraisee ON representations(appraisee_id);
CREATE INDEX ix_representations_status    ON representations(status);
CREATE INDEX ix_representations_wf        ON representations(workflow_instance_id);

-- E14 — calibration_sessions [EXTEND M09 calibration] ----------------------------------
CREATE TABLE calibration_sessions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- session_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    cycle_id                 uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
    org_unit_scope           uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,  -- P02 population scope
    method                   g08_calibration_method NOT NULL DEFAULT 'COMMITTEE_REVIEW',  -- FORCED_DISTRIBUTION removed (R2)
    bell_curve_enabled       boolean NOT NULL DEFAULT false,             -- R2
    target_distribution      jsonb,                                      -- diagnostic-only (VAL-DISTRIB)
    committee_member_ids     uuid[] NOT NULL,                            -- flag g08.calibration-member
    runs_before_certification boolean NOT NULL DEFAULT false,            -- R1
    scheduled_at             timestamptz,                                -- JOB-M09-CALIB
    status                   g08_calibration_status NOT NULL DEFAULT 'PLANNED',
    outcome_summary          text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_calibration_sessions_tenant  ON calibration_sessions(tenant_id);
CREATE INDEX ix_calibration_sessions_entity  ON calibration_sessions(entity_id);
CREATE INDEX ix_calibration_sessions_cycle   ON calibration_sessions(cycle_id);
CREATE INDEX ix_calibration_sessions_scope   ON calibration_sessions(org_unit_scope);
CREATE INDEX ix_calibration_sessions_status  ON calibration_sessions(status);

-- E15 — calibration_adjustments [NEW ratification record] ------------------------------
CREATE TABLE calibration_adjustments (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- adjustment_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    recommendation_id        uuid NOT NULL,                              -- FK -> calibration_recommendations (Section F)
    session_id               uuid NOT NULL REFERENCES calibration_sessions(id) ON DELETE RESTRICT,
    form_id                  uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    old_grade                numeric(4,2) NOT NULL,
    applied_grade            numeric(4,2) NOT NULL,                      -- = ratified recommended_grade
    ratified_by              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- AA / competent authority
    ratification_signature_id uuid,                                      -- FK -> digital_signatures (Section F)
    applied_at               timestamptz NOT NULL DEFAULT now(),
    status                   g08_adjustment_status NOT NULL DEFAULT 'APPLIED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_calibration_adjustments_tenant ON calibration_adjustments(tenant_id);
CREATE INDEX ix_calibration_adjustments_rec    ON calibration_adjustments(recommendation_id);
CREATE INDEX ix_calibration_adjustments_session ON calibration_adjustments(session_id);
CREATE INDEX ix_calibration_adjustments_form   ON calibration_adjustments(form_id);

-- E16 — performance_improvement_plans [EXTEND M09 PIP] ---------------------------------
CREATE TABLE performance_improvement_plans (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pip_id
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    pip_no           varchar(40) NOT NULL,
    appraisee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    form_id          uuid REFERENCES appraisal_forms(id) ON DELETE SET NULL,  -- originating APAR
    initiated_by     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- RO
    reason           text NOT NULL,
    success_criteria text NOT NULL,
    start_date       date NOT NULL,
    target_end_date  date NOT NULL,
    outcome          g08_pip_outcome,
    status           g08_pip_status NOT NULL DEFAULT 'DRAFT',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pip_no UNIQUE (tenant_id, pip_no),
    CONSTRAINT ck_pip_dates CHECK (target_end_date >= start_date)
);
CREATE INDEX ix_pip_tenant    ON performance_improvement_plans(tenant_id);
CREATE INDEX ix_pip_entity    ON performance_improvement_plans(entity_id);
CREATE INDEX ix_pip_appraisee ON performance_improvement_plans(appraisee_id);
CREATE INDEX ix_pip_form      ON performance_improvement_plans(form_id);
CREATE INDEX ix_pip_status    ON performance_improvement_plans(status);

-- E17 — pip_milestones [EXTEND M09 PIP] ------------------------------------------------
CREATE TABLE pip_milestones (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- milestone_id
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    pip_id        uuid NOT NULL REFERENCES performance_improvement_plans(id) ON DELETE RESTRICT,
    title         varchar(200) NOT NULL,
    due_date      date NOT NULL,
    metric        varchar(255),
    progress_note text,
    status        g08_milestone_status NOT NULL DEFAULT 'PENDING',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pip_milestones_tenant ON pip_milestones(tenant_id);
CREATE INDEX ix_pip_milestones_pip    ON pip_milestones(pip_id);
CREATE INDEX ix_pip_milestones_status ON pip_milestones(status);

-- E18 — apar_disclosure_log [NEW domain ledger; APPEND-ONLY] ---------------------------
-- Append-only: INSERT only. Mutation audit is the P05 DB trigger; statutory tamper-
-- evidence is OPEN-PLAT-03 (chain_anchor_ref -> WORM batch). NO updated_at, NO is_deleted.
CREATE TABLE apar_disclosure_log (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- disclosure_log_id
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id          uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    seq_no           bigint NOT NULL,                              -- monotonic per form
    event_type       g08_disclosure_event_type NOT NULL,
    actor_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    actor_role       varchar(60) NOT NULL,
    ip_address       inet,
    detail           jsonb,
    chain_anchor_ref varchar(80),                                 -- OPEN-PLAT-03 WORM anchor batch id
    event_at         timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    CONSTRAINT uq_apar_disclosure_log_seq UNIQUE (tenant_id, form_id, seq_no)
);
CREATE INDEX ix_apar_disclosure_log_tenant ON apar_disclosure_log(tenant_id);
CREATE INDEX ix_apar_disclosure_log_form   ON apar_disclosure_log(form_id);
CREATE INDEX ix_apar_disclosure_log_event  ON apar_disclosure_log(event_type);
CREATE INDEX ix_apar_disclosure_log_actor  ON apar_disclosure_log(actor_id);
COMMENT ON TABLE apar_disclosure_log IS 'G08 disclosure/custody domain ledger. Append-only (INSERT only); mutation audit = P05 trigger; tamper-evidence = OPEN-PLAT-03 (chain_anchor_ref). No bespoke hash-chain.';

-- E19 — appraisal_report_periods [NEW — multi-RO part-period, R4] -----------------------
CREATE TABLE appraisal_report_periods (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- period_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id               uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    sequence_no           integer NOT NULL,
    period_start          date NOT NULL,                             -- VAL-G08-PERIODTILE (non-overlap)
    period_end            date NOT NULL,
    reporting_officer_id  uuid REFERENCES employees(id) ON DELETE SET NULL,  -- null if No-Report
    supervision_months    numeric(4,1) NOT NULL,                     -- VAL-G08-SUPV
    part_period_grade     numeric(4,2),
    part_remarks          text,
    weight_in_aggregate   numeric(5,2),                              -- supervision-weighted proportion
    no_report_certificate boolean NOT NULL DEFAULT false,            -- true when supervision < threshold
    no_report_reason      text,
    no_report_signature_id uuid,                                     -- FK -> digital_signatures (Section F)
    status                g08_report_period_status NOT NULL DEFAULT 'DRAFT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_report_periods_seq UNIQUE (tenant_id, form_id, sequence_no),
    CONSTRAINT ck_report_periods_dates CHECK (period_end >= period_start),
    CONSTRAINT ck_report_periods_supv  CHECK (supervision_months >= 0)
);
CREATE INDEX ix_report_periods_tenant ON appraisal_report_periods(tenant_id);
CREATE INDEX ix_report_periods_form   ON appraisal_report_periods(form_id);
CREATE INDEX ix_report_periods_ro     ON appraisal_report_periods(reporting_officer_id);
CREATE INDEX ix_report_periods_status ON appraisal_report_periods(status);

-- E20 — form_goal_snapshots [NEW — immutable snapshot-on-lock, R6; APPEND-ONLY] ---------
-- Append-only: INSERT only. NO updated_at, NO is_deleted. Mutation audit = P05 trigger.
CREATE TABLE form_goal_snapshots (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- snapshot_id
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id        uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    source_goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE RESTRICT,  -- provenance
    goal_payload   jsonb NOT NULL,                              -- immutable copy
    weightage      numeric(5,2) NOT NULL,                       -- frozen at lock
    snapshot_at    timestamptz NOT NULL DEFAULT now(),
    locked         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid
);
CREATE INDEX ix_form_goal_snapshots_tenant ON form_goal_snapshots(tenant_id);
CREATE INDEX ix_form_goal_snapshots_form   ON form_goal_snapshots(form_id);
CREATE INDEX ix_form_goal_snapshots_goal   ON form_goal_snapshots(source_goal_id);
COMMENT ON TABLE form_goal_snapshots IS 'G08 immutable goal snapshot-on-lock (R6). Append-only; the legal record never live-references mutable goals.';

-- E21 — calibration_recommendations [NEW — ratified recommendation, R1] ----------------
CREATE TABLE calibration_recommendations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- recommendation_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    session_id               uuid NOT NULL REFERENCES calibration_sessions(id) ON DELETE RESTRICT,
    form_id                  uuid NOT NULL REFERENCES appraisal_forms(id) ON DELETE RESTRICT,
    current_grade            numeric(4,2) NOT NULL,
    recommended_grade        numeric(4,2) NOT NULL,
    rationale                text NOT NULL,                              -- ERR-REASON-REQ
    committee_vote           jsonb,
    pre_certification        boolean NOT NULL DEFAULT false,             -- R1
    ratified_by              uuid REFERENCES employees(id) ON DELETE SET NULL,  -- AA / competent authority
    ratified_at              timestamptz,
    ratification_signature_id uuid,                                      -- FK -> digital_signatures (Section F)
    recommendation_status    g08_recommendation_status NOT NULL DEFAULT 'PROPOSED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_calibration_recommendations_tenant  ON calibration_recommendations(tenant_id);
CREATE INDEX ix_calibration_recommendations_session ON calibration_recommendations(session_id);
CREATE INDEX ix_calibration_recommendations_form    ON calibration_recommendations(form_id);
CREATE INDEX ix_calibration_recommendations_status  ON calibration_recommendations(recommendation_status);

-- E22 — coi_recusals [NEW — conflict-of-interest recusal, R22] --------------------------
CREATE TABLE coi_recusals (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- recusal_id
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id      uuid REFERENCES appraisal_forms(id) ON DELETE SET NULL,
    session_id   uuid REFERENCES calibration_sessions(id) ON DELETE SET NULL,  -- calibration context
    actor_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,    -- declarer
    role_context g08_coi_role_context NOT NULL,
    coi_type     g08_coi_type NOT NULL,
    declaration  text NOT NULL,
    recused      boolean NOT NULL DEFAULT true,
    declared_at  timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_coi_recusals_tenant  ON coi_recusals(tenant_id);
CREATE INDEX ix_coi_recusals_form    ON coi_recusals(form_id);
CREATE INDEX ix_coi_recusals_session ON coi_recusals(session_id);
CREATE INDEX ix_coi_recusals_actor   ON coi_recusals(actor_id);

-- E23 — digital_signatures [NEW GAP — non-repudiation; X.3 + P05 + G13; APPEND-ONLY] ----
-- Append-only: INSERT only. NO updated_at, NO is_deleted. The raw artefact is stored in
-- G13 (documents); only the detached signature value + payload hash are recorded here.
CREATE TABLE digital_signatures (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- signature_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_type         g08_signature_entity_type NOT NULL,
    signed_entity_id    uuid NOT NULL,                               -- signed record id (polymorphic)
    signer_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    signature_method    g08_signature_method NOT NULL,              -- via X.3 provider; creds in P04
    integration_credential_id uuid REFERENCES integration_credentials(id) ON DELETE SET NULL,  -- P04 ref
    certificate_serial  varchar(120),
    signed_payload_hash char(64) NOT NULL,                          -- SHA-256 of canonical payload
    signature_value     text NOT NULL,                              -- detached signature (artefact in G13)
    artefact_doc_id     uuid REFERENCES documents(id) ON DELETE SET NULL,  -- G13 artefact
    signed_at           timestamptz NOT NULL DEFAULT now(),
    verification_status g08_signature_verification NOT NULL DEFAULT 'VALID',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    CONSTRAINT ck_digital_signatures_hash_len CHECK (length(signed_payload_hash) = 64)
);
CREATE INDEX ix_digital_signatures_tenant  ON digital_signatures(tenant_id);
CREATE INDEX ix_digital_signatures_entity  ON digital_signatures(entity_type, signed_entity_id);
CREATE INDEX ix_digital_signatures_signer  ON digital_signatures(signer_id);
CREATE INDEX ix_digital_signatures_status  ON digital_signatures(verification_status);
COMMENT ON TABLE digital_signatures IS 'G08 DSC/eSign non-repudiation (GAP). Append-only; signs via X.3 provider (P04 creds); raw artefact in G13. Polymorphic over assessments/ratifications/no-report/disclosure-ack/disposal.';


-- =====================================================================================
-- SECTION 3 — RECON: DarwinBox PMS CONFIG/MASTERS + GOAL FIELD ADDITIONS (ADD-only)
-- =====================================================================================
-- Reconciles the "DwnB Form Fields / Performance Management" CSV exports (see
-- docs/data-model/reconciliation/g08-performance.md). Config/master value sets follow
-- CONVENTIONS §4 (tenant-configurable => master tables + text codes, tenant-scoped UNIQUE),
-- never Postgres enums; the sole closed enumeration added is g08_config_status. Large
-- per-field enable/mandatory/editable/need-approval matrices are stored as jsonb (config
-- consumed by the form engine), not exploded into hundreds of columns.

CREATE TYPE g08_config_status AS ENUM ('DRAFT','ACTIVE','ARCHIVED');

-- 3.1 scorecard_pillars [Scorecard Pillar.csv] -----------------------------------------
CREATE TABLE scorecard_pillars (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    pillar_code        varchar(40) NOT NULL,                       -- VAL-MASTER-UNIQUE
    name               varchar(160) NOT NULL,
    description        text,
    source_created_on  timestamptz,                                -- CSV Created On (provenance)
    source_updated_on  timestamptz,                                -- CSV Updated On (provenance)
    status             g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_scorecard_pillars_code UNIQUE (tenant_id, pillar_code)
);
CREATE INDEX ix_scorecard_pillars_tenant ON scorecard_pillars(tenant_id);
CREATE INDEX ix_scorecard_pillars_status ON scorecard_pillars(status);

-- 3.2 metrics [Metric.csv] -------------------------------------------------------------
CREATE TABLE metrics (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    metric_code        varchar(80) NOT NULL,                       -- VAL-MASTER-UNIQUE (e.g. DB_Default_Metric_Percentage)
    name               varchar(120) NOT NULL,                      -- Percentage / Number / ...
    description        text,
    source_created_on  timestamptz,
    source_updated_on  timestamptz,
    status             g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_metrics_code UNIQUE (tenant_id, metric_code)
);
CREATE INDEX ix_metrics_tenant ON metrics(tenant_id);
CREATE INDEX ix_metrics_status ON metrics(status);

-- 3.3 normalization_settings [Normalization.csv] ---------------------------------------
CREATE TABLE normalization_settings (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name               varchar(160) NOT NULL,                      -- VAL-MASTER-UNIQUE
    scale              varchar(120),                               -- Scale
    scale_marker       varchar(120),                               -- Scale Marker
    scale_marks        jsonb,                                      -- Scale Marks (band definitions)
    min_marks          numeric(8,2),
    max_marks          numeric(8,2),
    ideal_pct          numeric(6,2),                               -- Ideal %
    delta_pct          numeric(6,2),                               -- Delta %
    source_created_on  timestamptz,
    source_updated_on  timestamptz,
    status             g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_normalization_settings_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_normalization_settings_tenant ON normalization_settings(tenant_id);
CREATE INDEX ix_normalization_settings_status ON normalization_settings(status);

-- 3.4 custom_formula_settings [CustomFormulaSettings-Export.csv] -----------------------
CREATE TABLE custom_formula_settings (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name               varchar(160) NOT NULL,                      -- VAL-MASTER-UNIQUE
    information        text,
    methodology        varchar(120),                               -- Methodology
    formula_for        varchar(120),                               -- Formula For (Goal Score / Overall / ...)
    formula            text,                                       -- Formula expression
    source_created_on  timestamptz,
    source_updated_on  timestamptz,
    status             g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_custom_formula_settings_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_custom_formula_settings_tenant ON custom_formula_settings(tenant_id);
CREATE INDEX ix_custom_formula_settings_status ON custom_formula_settings(status);

-- 3.5 goal_plans [GoalPlanKraSettings-Export.csv] --------------------------------------
-- Goal-plan definition. The ~210-column per-field enable/mandatory/editable/need-approval
-- matrix (goal + sub-goal + custom fields + check-in + cascade + notes + AI params) is
-- stored as field_settings jsonb (tenant CONFIG consumed by the form engine).
CREATE TABLE goal_plans (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    goal_plan_code            varchar(60) NOT NULL,                 -- Goal Plan ID (VAL-MASTER-UNIQUE)
    name                      varchar(200) NOT NULL,
    description               text,
    methodology               varchar(40),                          -- OKR / KRA / ...
    enable_sub_goals          boolean NOT NULL DEFAULT false,
    start_date                date,
    end_date                  date,
    user_assignment           varchar(200),
    exclusion_setting         varchar(200),
    enable_goal_count_limits  boolean NOT NULL DEFAULT false,
    min_goals                 integer,
    max_goals                 integer,
    enable_goal_weightage_limits boolean NOT NULL DEFAULT false,
    min_weightage             numeric(6,2),
    max_weightage             numeric(6,2),
    achievement_mapping_scale varchar(120),
    default_achievement_mapping varchar(120),
    goal_plan_approver        varchar(120),
    goal_plan_reviewer        varchar(120),
    enable_cascade            boolean NOT NULL DEFAULT false,
    scorecard_pillar_options  text,                                 -- pipe-delimited option list (as exported)
    metric_options            text,
    field_settings            jsonb,                                -- full per-field flag matrix (config)
    source_created_on         timestamptz,
    source_updated_on         timestamptz,
    source_started_on         timestamptz,
    source_archived_on        timestamptz,
    status                    g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_goal_plans_code UNIQUE (tenant_id, goal_plan_code),
    CONSTRAINT ck_goal_plans_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX ix_goal_plans_tenant ON goal_plans(tenant_id);
CREATE INDEX ix_goal_plans_entity ON goal_plans(entity_id);
CREATE INDEX ix_goal_plans_status ON goal_plans(status);

-- 3.6 review_definitions [ReviewKraSettings-Export.csv] --------------------------------
-- A "review" inside a review cycle. The ~160-column stage/visibility/rating matrix is
-- stored as stage_settings + field_settings jsonb (config). Rating scales resolve to the
-- rating_scales master by name at config time; per-cycle calibration RUN is E14.
CREATE TABLE review_definitions (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    review_code                   varchar(60) NOT NULL,             -- Review ID (VAL-MASTER-UNIQUE)
    name                          varchar(200) NOT NULL,
    description                   text,
    cycle_id                      uuid REFERENCES appraisal_cycles(id) ON DELETE SET NULL,  -- Align to Review Cycle
    align_to_review_cycle         varchar(200),                     -- raw label as exported
    is_final_review               boolean NOT NULL DEFAULT false,
    enable_exclude_employees      boolean NOT NULL DEFAULT false,
    exclusion_setting             varchar(200),
    goal_rating_scale             varchar(120),
    goal_normalization_setting    varchar(160),
    overall_rating_scale          varchar(120),
    overall_normalization_setting varchar(160),
    competency_normalization_setting varchar(160),
    calibration_enabled           boolean NOT NULL DEFAULT false,
    calibration_process           varchar(120),
    promotion_framework           varchar(120),
    stage_settings                jsonb,                            -- Self/Evaluator1/Evaluator2/Reviewer stage config
    field_settings                jsonb,                            -- full per-field rating/visibility matrix (config)
    source_updated_on             timestamptz,
    source_started_on             timestamptz,
    source_archived_on            timestamptz,
    status                        g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid,
    updated_by                    uuid,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_review_definitions_code UNIQUE (tenant_id, review_code)
);
CREATE INDEX ix_review_definitions_tenant ON review_definitions(tenant_id);
CREATE INDEX ix_review_definitions_entity ON review_definitions(entity_id);
CREATE INDEX ix_review_definitions_cycle  ON review_definitions(cycle_id);
CREATE INDEX ix_review_definitions_status ON review_definitions(status);

-- 3.7 review_excluded_employees [Excluded-Employees-Export.csv] (DATA) -----------------
CREATE TABLE review_excluded_employees (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    review_definition_id  uuid REFERENCES review_definitions(id) ON DELETE CASCADE,  -- resolved link
    review_code           varchar(60) NOT NULL,                    -- Review ID (raw)
    review_name           varchar(200),                            -- Review Name (snapshot)
    employee_id           uuid REFERENCES employees(id) ON DELETE SET NULL,          -- resolved
    employee_external_id  varchar(40) NOT NULL,                    -- Employee ID (raw, e.g. H002)
    employee_name         varchar(200),                            -- Employee Name (snapshot)
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_review_excluded_emp UNIQUE (tenant_id, review_code, employee_external_id)
);
CREATE INDEX ix_review_excluded_emp_tenant ON review_excluded_employees(tenant_id);
CREATE INDEX ix_review_excluded_emp_review ON review_excluded_employees(review_definition_id);
CREATE INDEX ix_review_excluded_emp_emp    ON review_excluded_employees(employee_id);

-- 3.8 calibration_settings [Calibration(1/2).csv] --------------------------------------
-- The reusable calibration TEMPLATE (parameters, publish method, ideal distribution,
-- moderation-page field matrix). Distinct from E14 calibration_sessions (the per-cycle RUN).
CREATE TABLE calibration_settings (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    name                      varchar(160) NOT NULL,                -- Calibration Name (VAL-MASTER-UNIQUE)
    overall_rating_enabled    boolean NOT NULL DEFAULT false,
    overall_rating_scale      varchar(120),
    goal_rating_enabled       boolean NOT NULL DEFAULT false,
    goal_rating_scale         varchar(120),
    competency_rating_enabled boolean NOT NULL DEFAULT false,
    competency_rating_scale   varchar(120),
    promotion_enabled         boolean NOT NULL DEFAULT false,
    promotion_framework       varchar(120),
    potential_enabled         boolean NOT NULL DEFAULT false,
    potential_framework       varchar(120),
    publish_method_overall    varchar(60),                          -- Decimal / Rounded / ...
    publish_method_goal       varchar(60),
    publish_method_competency varchar(60),
    ideal_distribution        jsonb,                                -- Define Ideal Distribution Norm (per scale)
    n_grid_enabled            boolean NOT NULL DEFAULT false,
    lobby_group_enabled       boolean NOT NULL DEFAULT false,
    moderation_fields         jsonb,                                -- Standard/Custom field show/use/weightage matrix
    parameters                jsonb,                                -- remaining calibration flags (config)
    source_created_on         timestamptz,
    source_updated_on         timestamptz,
    status                    g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_calibration_settings_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_calibration_settings_tenant ON calibration_settings(tenant_id);
CREATE INDEX ix_calibration_settings_entity ON calibration_settings(entity_id);
CREATE INDEX ix_calibration_settings_status ON calibration_settings(status);

-- 3.9 performance_translations [*Framework Translation / *Translation.csv] (i18n CONFIG)
-- Single table covering all 5 translation exports (Goal Plan, Review, Review Cycle,
-- Scorecard Pillar, Calibration): object label localisation.
CREATE TABLE performance_translations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    translation_type   varchar(40) NOT NULL,                        -- Type (e.g. attribute)
    object_type        varchar(120) NOT NULL,                       -- Object Type (e.g. PMS_Category Name)
    default_value      varchar(300) NOT NULL,                       -- Default Value
    language           varchar(40) NOT NULL DEFAULT '',             -- Language (blank = default locale)
    translation        varchar(300),                                -- Translation
    status             g08_config_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_performance_translations UNIQUE (tenant_id, object_type, default_value, language)
);
CREATE INDEX ix_performance_translations_tenant ON performance_translations(tenant_id);
CREATE INDEX ix_performance_translations_object ON performance_translations(object_type);

-- 3.10 goals — RECON field additions [Goals-Export.csv] --------------------------------
ALTER TABLE goals
    ADD COLUMN metric_id             uuid REFERENCES metrics(id) ON DELETE SET NULL,             -- Metric master ref
    ADD COLUMN metric_criteria       text,                                                       -- Measurement Criteria (free text)
    ADD COLUMN target_prefix         varchar(24),                                                -- Target Prefix
    ADD COLUMN timeline_start_date   date,                                                       -- Timelines Start date
    ADD COLUMN timeline_end_date     date,                                                       -- Timelines End date
    ADD COLUMN scorecard_pillar_id   uuid REFERENCES scorecard_pillars(id) ON DELETE SET NULL,   -- Scorecard pillar/perspective
    ADD COLUMN aligned_to_goal_id    uuid REFERENCES goals(id) ON DELETE SET NULL,               -- Is aligned to (goal)
    ADD COLUMN aligned_to_ref        varchar(200),                                               -- Is aligned to (free ref)
    ADD COLUMN achievement_mapping   jsonb,                                                      -- Achievement mapping
    ADD COLUMN block_edit_achievement boolean NOT NULL DEFAULT false,                            -- Block edit achievement
    ADD COLUMN assigned_to_roles     jsonb,                                                      -- Assigned to Roles
    ADD COLUMN goal_plan_master_id   uuid REFERENCES goal_plans(id) ON DELETE SET NULL;          -- Goal Plan (config master ref)
CREATE INDEX ix_goals_metric          ON goals(metric_id);
CREATE INDEX ix_goals_scorecard_pillar ON goals(scorecard_pillar_id);
CREATE INDEX ix_goals_aligned_to      ON goals(aligned_to_goal_id);
CREATE INDEX ix_goals_plan_master     ON goals(goal_plan_master_id);


-- =====================================================================================
-- SECTION F — DEFERRED CROSS-TABLE FOREIGN KEYS (forward references)
-- =====================================================================================
-- Resolved here to avoid circular create-order coupling. E1/E4 reference E2/E3; many
-- tables reference E23 (digital_signatures) and E21 (calibration_recommendations),
-- which are created after their referrers.

ALTER TABLE appraisal_cycles
    ADD CONSTRAINT fk_appraisal_cycles_template
    FOREIGN KEY (template_id) REFERENCES appraisal_templates(id) ON DELETE RESTRICT;
ALTER TABLE appraisal_cycles
    ADD CONSTRAINT fk_appraisal_cycles_scale
    FOREIGN KEY (rating_scale_id) REFERENCES rating_scales(id) ON DELETE RESTRICT;

ALTER TABLE appraisal_forms
    ADD CONSTRAINT fk_appraisal_forms_cert_signature
    FOREIGN KEY (certification_signature_id) REFERENCES digital_signatures(id) ON DELETE SET NULL;

ALTER TABLE appraisal_assessments
    ADD CONSTRAINT fk_appraisal_assessments_report_period
    FOREIGN KEY (report_period_id) REFERENCES appraisal_report_periods(id) ON DELETE SET NULL;
ALTER TABLE appraisal_assessments
    ADD CONSTRAINT fk_appraisal_assessments_signature
    FOREIGN KEY (signature_id) REFERENCES digital_signatures(id) ON DELETE SET NULL;

ALTER TABLE appraisal_report_periods
    ADD CONSTRAINT fk_report_periods_no_report_signature
    FOREIGN KEY (no_report_signature_id) REFERENCES digital_signatures(id) ON DELETE SET NULL;

ALTER TABLE calibration_recommendations
    ADD CONSTRAINT fk_calibration_recommendations_signature
    FOREIGN KEY (ratification_signature_id) REFERENCES digital_signatures(id) ON DELETE SET NULL;

ALTER TABLE calibration_adjustments
    ADD CONSTRAINT fk_calibration_adjustments_recommendation
    FOREIGN KEY (recommendation_id) REFERENCES calibration_recommendations(id) ON DELETE RESTRICT;  -- R1: must reference a ratified rec
ALTER TABLE calibration_adjustments
    ADD CONSTRAINT fk_calibration_adjustments_signature
    FOREIGN KEY (ratification_signature_id) REFERENCES digital_signatures(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION R — ROW-LEVEL SECURITY (P02 tenant-isolation; CONVENTIONS §6)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to EVERY G08 table (including the
-- append-only ledgers — read isolation; their immutability is a separate grant/trigger
-- concern owned by P05). Module connects as a non-superuser role and sets per request:
--   SET app.current_tenant_id = '<tenant uuid>'; SET app.is_platform_admin = 'true'|'false';
DO $$
DECLARE
    t text;
    g08_tables text[] := ARRAY[
        'appraisal_cycles','appraisal_templates','rating_scales','appraisal_forms','goals',
        'goal_checkins','self_appraisals','appraisal_assessments','competency_assessments',
        'continuous_feedback','feedback_360_requests','feedback_360_responses','representations',
        'calibration_sessions','calibration_adjustments','performance_improvement_plans',
        'pip_milestones','apar_disclosure_log','appraisal_report_periods','form_goal_snapshots',
        'calibration_recommendations','coi_recusals','digital_signatures',
        -- RECON Section 3 config/masters (tenant-scoped; same tenant-isolation policy):
        'scorecard_pillars','metrics','normalization_settings','custom_formula_settings',
        'goal_plans','review_definitions','review_excluded_employees','calibration_settings',
        'performance_translations'
    ];
BEGIN
    FOREACH t IN ARRAY g08_tables LOOP
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
-- Reuses 00-core fixed UUIDs (tenant 1111…1111, entity 2222…2201, employees 9999…9901/02,
-- org_unit 3333…3301, designation 7777…7701). GUCs set so RLS WITH CHECK passes.
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- appraisal_templates (E2) ------------------------------------------------------------
INSERT INTO appraisal_templates (id, tenant_id, entity_id, template_code, name, version, weightage_policy, sections, competency_set, requires_dsc, status) VALUES
 ('08e20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APAR-GAZ-A','Gazetted Officer APAR', 3,'{"performance_sum":100,"goal_split_pct":70,"competency_split_pct":30,"development_in_sum":false}','[{"section":"Goals"},{"section":"Competencies"},{"section":"PenPicture"}]','{"competencies":["COMP-CYBER","COMP-DBMGMT"]}', true,'PUBLISHED'),
 ('08e20001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APAR-NONGAZ','Non-Gazetted APAR', 2,'{"performance_sum":100,"goal_split_pct":80,"competency_split_pct":20,"development_in_sum":false}','[{"section":"Goals"},{"section":"PenPicture"}]','{"competencies":["COMP-DBMGMT"]}', true,'PUBLISHED'),
 ('08e20001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','OKR-EXEC','Executive OKR Template', 1,'{"performance_sum":100,"goal_split_pct":100,"competency_split_pct":0,"development_in_sum":false}','[{"section":"OKR"}]','{"competencies":[]}', false,'DRAFT');

-- rating_scales (E3) ------------------------------------------------------------------
INSERT INTO rating_scales (id, tenant_id, scale_code, name, min_value, max_value, grades, benchmark_grade, adverse_threshold, status) VALUES
 ('08e30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','APAR-10PT','APAR 10-Point Scale', 1.00, 10.00,'[{"label":"Outstanding","min":9,"max":10},{"label":"VeryGood","min":7,"max":8.99},{"label":"Good","min":6,"max":6.99},{"label":"Adverse","min":1,"max":3.99}]', 6.00, 4.00,'ACTIVE'),
 ('08e30001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','APAR-5PT','APAR 5-Point Scale', 1.00, 5.00,'[{"label":"Excellent","min":5,"max":5},{"label":"Good","min":3,"max":4.99},{"label":"Poor","min":1,"max":1.99}]', 3.00, 2.00,'ACTIVE');
-- Note: the BRD E3 sample "OKR-PCT" (max 100.00) is omitted — it cannot fit the BRD-mandated
-- numeric(4,2) grade type (max 99.99). A percent OKR scale would require a wider numeric type;
-- kept spec-faithful at numeric(4,2) for the statutory APAR scales (10-pt / 5-pt).

-- appraisal_cycles (E1) ---------------------------------------------------------------
INSERT INTO appraisal_cycles (id, tenant_id, entity_id, cycle_code, name, cycle_type, fiscal_year, goal_window_start, goal_window_end, appraisal_period_start, appraisal_period_end, template_id, rating_scale_id, representation_clock_start, calibration_enabled, status) VALUES
 ('08c10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APAR-2025-26','Annual APAR 2025-26','ANNUAL_APAR','2025-2026','2025-04-01','2025-04-30','2025-04-01','2026-03-31','08e20001-0000-0000-0000-000000000001','08e30001-0000-0000-0000-000000000001','DISPATCH', false,'IN_PROGRESS'),
 ('08c10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MIDYR-2025-26','Mid-Year Review 2025-26','MID_YEAR','2025-2026','2025-04-01','2025-04-30','2025-04-01','2025-09-30','08e20001-0000-0000-0000-000000000002','08e30001-0000-0000-0000-000000000001','ACKNOWLEDGEMENT', false,'OPEN'),
 ('08c10001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PROB-2025-Q2','Probation Confirmation 2025 Q2','PROBATION','2025-2026','2025-04-01','2025-04-15','2025-01-01','2025-06-30','08e20001-0000-0000-0000-000000000002','08e30001-0000-0000-0000-000000000002','DISPATCH', false,'CLOSED');

-- appraisal_forms (E4) ----------------------------------------------------------------
INSERT INTO appraisal_forms (id, tenant_id, entity_id, apar_no, cycle_id, appraisee_id, org_unit_id, designation_id, reporting_officer_id, has_multi_ro, reviewing_officer_id, accepting_authority_id, final_grade, is_adverse, sealed_cover, status) VALUES
 ('08f40001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APAR-2025-26-000142','08c10001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301','77777777-7777-7777-7777-777777777701', NULL, true,'99999999-9999-9999-9999-999999999902','99999999-9999-9999-9999-999999999902', 8.40, false, false,'DISCLOSED'),
 ('08f40001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','APAR-2025-26-000143','08c10001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333301','77777777-7777-7777-7777-777777777701','99999999-9999-9999-9999-999999999901', false,'99999999-9999-9999-9999-999999999901','99999999-9999-9999-9999-999999999901', NULL, false, true,'SEALED_COVER'),
 ('08f40001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PROB-2025-Q2-000144','08c10001-0000-0000-0000-000000000003','99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333302','77777777-7777-7777-7777-777777777701','99999999-9999-9999-9999-999999999901', false, NULL, NULL, NULL, false, false,'RO_ASSESSMENT');

-- goals (E5) --------------------------------------------------------------------------
INSERT INTO goals (id, tenant_id, entity_id, appraisee_id, cycle_id, form_id, goal_type, title, weightage, snapshotted, status) VALUES
 ('08e50001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','08c10001-0000-0000-0000-000000000001','08f40001-0000-0000-0000-000000000001','KRA','Improve revenue assessment turnaround', 40.00, true,'ACHIEVED'),
 ('08e50001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','08c10001-0000-0000-0000-000000000001','08f40001-0000-0000-0000-000000000001','KPI','Reduce pending files below 50', 30.00, true,'ACHIEVED'),
 ('08e50001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901', NULL, NULL,'DEVELOPMENT','Complete leadership certification', 0.00, false,'APPROVED');

-- appraisal_report_periods (E19) ------------------------------------------------------
INSERT INTO appraisal_report_periods (id, tenant_id, form_id, sequence_no, period_start, period_end, reporting_officer_id, supervision_months, part_period_grade, no_report_certificate, status) VALUES
 ('08e19001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', 1,'2025-04-01','2025-10-31','99999999-9999-9999-9999-999999999902', 7.0, 8.10, false,'SUBMITTED'),
 ('08e19001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', 2,'2025-11-01','2026-01-31','99999999-9999-9999-9999-999999999902', 5.0, 8.70, false,'SUBMITTED'),
 ('08e19001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', 3,'2026-02-01','2026-03-31', NULL, 2.0, NULL, true,'NO_REPORT');

-- appraisal_assessments (E8) ----------------------------------------------------------
INSERT INTO appraisal_assessments (id, tenant_id, form_id, report_period_id, tier, assessor_id, overall_grade, concurs_with_lower_tier, decision) VALUES
 ('08e80001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001','08e19001-0000-0000-0000-000000000001','REPORTING','99999999-9999-9999-9999-999999999902', 8.10, NULL,'SUBMITTED'),
 ('08e80001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', NULL,'REVIEWING','99999999-9999-9999-9999-999999999901', 8.40, false,'VARIED'),
 ('08e80001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', NULL,'ACCEPTING','99999999-9999-9999-9999-999999999901', 8.40, true,'CERTIFIED');

-- self_appraisals (E7) ----------------------------------------------------------------
INSERT INTO self_appraisals (id, tenant_id, form_id, achievements, submitted_at, status) VALUES
 ('08e70001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001','Cleared backlog; led 2 reform initiatives.','2026-04-10T09:00:00Z','SUBMITTED'),
 ('08e70001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000002','Completed assigned audits within deadline.','2026-04-11T10:00:00Z','SUBMITTED'),
 ('08e70001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000003','Draft pending.', NULL,'DRAFT');

-- representations (E13) ---------------------------------------------------------------
INSERT INTO representations (id, tenant_id, entity_id, rep_no, form_id, appraisee_id, grounds, contested_items, filed_at, sla_due_at, disposal_deadline_at, is_late, external_reference, status) VALUES
 ('08e13001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REP-2025-26-0007','08f40001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','Integrity column remark not substantiated.','{"items":["integrity_remark"]}','2026-05-05T06:00:00Z','2026-06-04T06:00:00Z','2026-08-04T06:00:00Z', false,'NONE','UNDER_REVIEW'),
 ('08e13001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REP-2025-26-0008','08f40001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','Below-benchmark grade in section 2.','{"items":["section_grade_2"]}','2026-06-20T06:00:00Z','2026-06-04T06:00:00Z','2026-08-20T06:00:00Z', true,'NONE','FILED');

-- calibration_sessions (E14) ----------------------------------------------------------
INSERT INTO calibration_sessions (id, tenant_id, entity_id, cycle_id, org_unit_scope, method, bell_curve_enabled, committee_member_ids, runs_before_certification, status) VALUES
 ('08e14001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','08c10001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333301','COMMITTEE_REVIEW', false,'{99999999-9999-9999-9999-999999999901,99999999-9999-9999-9999-999999999902}', false,'RECOMMENDED'),
 ('08e14001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','08c10001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333301','NORMALISATION', false,'{99999999-9999-9999-9999-999999999901}', true,'RATIFIED');

-- calibration_recommendations (E21) ---------------------------------------------------
INSERT INTO calibration_recommendations (id, tenant_id, session_id, form_id, current_grade, recommended_grade, rationale, pre_certification, recommendation_status, ratified_by, ratified_at) VALUES
 ('08e21001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08e14001-0000-0000-0000-000000000001','08f40001-0000-0000-0000-000000000001', 8.60, 8.40,'Aligned to section grades after committee review.', false,'RATIFIED','99999999-9999-9999-9999-999999999901','2026-04-25T05:00:00Z'),
 ('08e21001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08e14001-0000-0000-0000-000000000002','08f40001-0000-0000-0000-000000000003', 9.20, 8.80,'Normalised against org-unit distribution.', true,'PROPOSED', NULL, NULL);

-- digital_signatures (E23) ------------------------------------------------------------
INSERT INTO digital_signatures (id, tenant_id, entity_type, signed_entity_id, signer_id, signature_method, signed_payload_hash, signature_value, verification_status) VALUES
 ('08e23001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ASSESSMENT','08e80001-0000-0000-0000-000000000003','99999999-9999-9999-9999-999999999901','DSC','0a1b2c3d4e5f60718293a4b5c6d7e8f900112233445566778899aabbccddeeff','-----BEGIN PKCS7-----MIIDxxx-----END PKCS7-----','VALID'),
 ('08e23001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','CALIBRATION_RATIFICATION','08e21001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','AADHAAR_ESIGN','1f2e3d4c5b6a70819f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928','-----BEGIN PKCS7-----MIIDyyy-----END PKCS7-----','VALID');

-- calibration_adjustments (E15) -------------------------------------------------------
INSERT INTO calibration_adjustments (id, tenant_id, recommendation_id, session_id, form_id, old_grade, applied_grade, ratified_by, ratification_signature_id, status) VALUES
 ('08e15001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08e21001-0000-0000-0000-000000000001','08e14001-0000-0000-0000-000000000001','08f40001-0000-0000-0000-000000000001', 8.60, 8.40,'99999999-9999-9999-9999-999999999901','08e23001-0000-0000-0000-000000000002','APPLIED');

-- performance_improvement_plans (E16) -------------------------------------------------
INSERT INTO performance_improvement_plans (id, tenant_id, entity_id, pip_no, appraisee_id, form_id, initiated_by, reason, success_criteria, start_date, target_end_date, status) VALUES
 ('08e16001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PIP-2025-0003','99999999-9999-9999-9999-999999999902','08f40001-0000-0000-0000-000000000003','99999999-9999-9999-9999-999999999901','Sustained below-benchmark performance.','Clear backlog and meet error targets.','2026-05-01','2026-08-31','ACTIVE'),
 ('08e16001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PIP-2025-0004','99999999-9999-9999-9999-999999999902', NULL,'99999999-9999-9999-9999-999999999901','Quality lapses in audit files.','Reduce error rate below 2%.','2026-03-01','2026-06-30','UNDER_REVIEW');

-- apar_disclosure_log (E18) -----------------------------------------------------------
INSERT INTO apar_disclosure_log (id, tenant_id, form_id, seq_no, event_type, actor_id, actor_role, chain_anchor_ref, event_at) VALUES
 ('08e18001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', 1,'DISPATCHED','99999999-9999-9999-9999-999999999901','HR_APAR_CELL','ANCHOR-2026-05-01-0007','2026-05-01T06:00:00Z'),
 ('08e18001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001', 2,'ACKNOWLEDGED','99999999-9999-9999-9999-999999999901','APPRAISEE','ANCHOR-2026-05-01-0007','2026-05-03T07:30:00Z'),
 ('08e18001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000002', 1,'SEALED','99999999-9999-9999-9999-999999999901','ACCEPTING_AUTHORITY','ANCHOR-2026-04-20-0003','2026-04-20T05:10:00Z');

-- form_goal_snapshots (E20) -----------------------------------------------------------
INSERT INTO form_goal_snapshots (id, tenant_id, form_id, source_goal_id, goal_payload, weightage, locked, snapshot_at) VALUES
 ('08e20a01-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001','08e50001-0000-0000-0000-000000000001','{"goal_type":"KRA","title":"Improve revenue assessment turnaround","weightage":40.00}', 40.00, true,'2026-04-01T00:00:00Z'),
 ('08e20a01-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08f40001-0000-0000-0000-000000000001','08e50001-0000-0000-0000-000000000002','{"goal_type":"KPI","title":"Reduce pending files below 50","weightage":30.00}', 30.00, true,'2026-04-01T00:00:00Z');

-- ==== RECON Section 3 seed rows (config/masters + goal-field back-fill) ==============

-- scorecard_pillars (3.1) -------------------------------------------------------------
INSERT INTO scorecard_pillars (id, tenant_id, pillar_code, name, description, status) VALUES
 ('08a30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','SCP1','Project Based Goals', NULL,'ACTIVE'),
 ('08a30001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','SCP2','Development Based Goals', NULL,'ACTIVE');

-- metrics (3.2) -----------------------------------------------------------------------
INSERT INTO metrics (id, tenant_id, metric_code, name, description, status) VALUES
 ('08a30002-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','DB_Default_Metric_Percentage','Percentage','Darwinbox default metric - Percentage','ACTIVE'),
 ('08a30002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','DB_Default_Metric_Number','Number','Darwinbox default metric - Number','ACTIVE');

-- normalization_settings (3.3) --------------------------------------------------------
INSERT INTO normalization_settings (id, tenant_id, name, scale, scale_marker, scale_marks, min_marks, max_marks, ideal_pct, delta_pct, status) VALUES
 ('08a30003-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PMS Normalization','PMS Rating Scale','Decimal','[{"label":"Outstanding","min":9,"max":10},{"label":"Good","min":6,"max":8.99}]', 1.00, 10.00, 15.00, 5.00,'ACTIVE'),
 ('08a30003-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Competency Normalization','Competency Scale','Decimal','[{"label":"Meets","min":3,"max":4},{"label":"Exceeds","min":4,"max":5}]', 1.00, 5.00, 20.00, 10.00,'ACTIVE');

-- custom_formula_settings (3.4) -------------------------------------------------------
INSERT INTO custom_formula_settings (id, tenant_id, name, information, methodology, formula_for, formula, status) VALUES
 ('08a30004-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Weighted Goal Score','Weightage-based goal score','WEIGHTED','Goal Score','(achievement_pct * weightage) / 100','ACTIVE'),
 ('08a30004-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Capped Achievement','Cap achievement at 100% for score','CAPPED','Overall Rating','least(achievement_pct, 100)','ACTIVE');

-- goal_plans (3.5) --------------------------------------------------------------------
INSERT INTO goal_plans (id, tenant_id, entity_id, goal_plan_code, name, methodology, enable_sub_goals, start_date, end_date, user_assignment, min_goals, max_goals, achievement_mapping_scale, goal_plan_approver, enable_cascade, scorecard_pillar_options, field_settings, status) VALUES
 ('08a30005-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','JAN_23-24','January 2023-24','OKR', true,'2023-01-01','2023-12-31','January Appraisal', 2, 6,'0','Manager', false,'Project Based Goals|Development Based Goals','{"goal_name":{"enable":true,"mandatory":true,"editable":true,"need_approval":true},"goal_weightage":{"enable":true,"mandatory":true}}','ARCHIVED'),
 ('08a30005-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','FEB_23-24','February 2023-24','OKR', true,'2023-02-01','2024-01-31','February Appraisal', 2, 6,'0','Manager', false,'Project Based Goals|Development Based Goals','{"goal_name":{"enable":true,"mandatory":true}}','ARCHIVED');

-- review_definitions (3.6) ------------------------------------------------------------
INSERT INTO review_definitions (id, tenant_id, entity_id, review_code, name, cycle_id, align_to_review_cycle, is_final_review, enable_exclude_employees, exclusion_setting, goal_rating_scale, overall_rating_scale, calibration_enabled, calibration_process, promotion_framework, status) VALUES
 ('08a30006-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','JAN_23-24','January 23-24', NULL,'January 2023', false, true,'New Joinees Exclusions','PMS Rating Scale','PMS Rating Scale', true,'Calibration','Promotion Framework','ARCHIVED'),
 ('08a30006-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','FEB-23-24','February 23-24', NULL,'February 23-24', false, true,'New Joinees Exclusions','PMS Rating Scale','PMS Rating Scale', true,'Calibration','Promotion Framework','ARCHIVED');

-- review_excluded_employees (3.7) -----------------------------------------------------
INSERT INTO review_excluded_employees (id, tenant_id, review_definition_id, review_code, review_name, employee_external_id, employee_name) VALUES
 ('08a30007-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','08a30006-0000-0000-0000-000000000001','JAN_23-24','January 23-24','H002','Chinnaswami Ganesan'),
 ('08a30007-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','08a30006-0000-0000-0000-000000000001','JAN_23-24','January 23-24','H010','Akshaya Shetty');

-- calibration_settings (3.8) ----------------------------------------------------------
INSERT INTO calibration_settings (id, tenant_id, entity_id, name, overall_rating_enabled, goal_rating_enabled, goal_rating_scale, promotion_enabled, promotion_framework, publish_method_overall, publish_method_goal, publish_method_competency, n_grid_enabled, lobby_group_enabled, moderation_fields, status) VALUES
 ('08a30008-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Calibration', false, true,'PMS Rating Scale', true,'Promotion Framework','Decimal','Decimal','Decimal', false, true,'{"designation":{"show":true},"department":{"show":true},"self_goals":{"show":true,"use":false,"weightage":0}}','ACTIVE'),
 ('08a30008-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Calibration New', false, true,'PMS Rating Scale - New', true,'Promotion Framework','Decimal','Decimal','Decimal', false, true,'{"designation":{"show":true},"department":{"show":true}}','ACTIVE');

-- performance_translations (3.9) ------------------------------------------------------
INSERT INTO performance_translations (id, tenant_id, translation_type, object_type, default_value, language, translation, status) VALUES
 ('08a30009-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','attribute','PMS_Category Name','Project Based Goals','', NULL,'ACTIVE'),
 ('08a30009-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','attribute','PMS_Goal Plan Name','January 2023-24','', NULL,'ACTIVE'),
 ('08a30009-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','attribute','PMS_Calibration Name','Calibration','', NULL,'ACTIVE');

-- goals RECON field back-fill (attach master refs + new fields to existing seed goals) -
UPDATE goals SET
    metric_id           = '08a30002-0000-0000-0000-000000000001',
    metric_criteria     = 'Percentage reduction in assessment turnaround time',
    target_prefix       = '<=',
    timeline_start_date = '2025-04-01',
    timeline_end_date   = '2026-03-31',
    scorecard_pillar_id = '08a30001-0000-0000-0000-000000000001',
    achievement_mapping = '{"90-100":"Outstanding","70-89":"Good"}',
    block_edit_achievement = true,
    assigned_to_roles   = '["Manager","HRBP"]',
    goal_plan_master_id = '08a30005-0000-0000-0000-000000000001'
WHERE id = '08e50001-0000-0000-0000-000000000001';
UPDATE goals SET
    metric_id           = '08a30002-0000-0000-0000-000000000002',
    target_prefix       = '<',
    scorecard_pillar_id = '08a30001-0000-0000-0000-000000000001',
    aligned_to_goal_id  = '08e50001-0000-0000-0000-000000000001'
WHERE id = '08e50001-0000-0000-0000-000000000002';

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 08-G08-performance-appraisal.sql  — 23 module tables (E1..E23)
-- =====================================================================================
