-- =====================================================================================
-- 06-G06-promotion-posting-progression.sql
-- Government HRMS — Module schema for G06 (Promotion, Posting & Progression Monitoring)
-- =====================================================================================
-- BUILD NOTES
-- -----------
-- Load order: AFTER 00-platform-core.sql (and AFTER 01-G01 once it lands). This module
--   references — never redefines — the canonical core tables. It FKs to:
--     tenants, entities, org_units, cadres, designations, pay_scales, employees (G01),
--     users, workflow_instances (P01), documents (G13), service_register_events (G12).
-- Conventions: docs/data-model/CONVENTIONS.md is authoritative. Every business table:
--     id uuid PK DEFAULT gen_random_uuid(); tenant_id NOT NULL -> tenants(id) RESTRICT;
--     entity_id (nullable; state-wide config rows leave it NULL) -> entities(id) RESTRICT;
--     std audit columns (created_at/updated_at/created_by/updated_by/is_deleted);
--     soft delete only (no hard delete); RLS tenant_isolation policy (Section R at end).
--   BRD entities use domain-named PKs (e.g. seniority_list_id); per CONVENTIONS §1 the
--   physical PK is `id` and the domain name is recorded in a column comment. Module FK
--   columns keep the BRD domain names and point at the parent's `id`.
-- ON DELETE policy (CONVENTIONS §5):
--     core masters (cadres/designations/pay_scales/org_units/employees) -> RESTRICT
--     users (published_by/approved_by/disposed_by/declared_by)          -> SET NULL
--     documents (G13)                                                   -> SET NULL
--     workflow_instances (P01)                                          -> SET NULL
--     service_register_events (G12, append-only)                        -> RESTRICT
--     module parent/child & masters                                     -> RESTRICT
--     self / lineage refs (supersedes, carry-forward, superseding)      -> SET NULL
-- Append-only/immutable note: qualifying_service_ledger and correction_events are
--   supersede-only lineages (new row supersedes prior); they still carry std audit
--   columns and use SOFT DELETE only (Platform §8.2), so they are normal RLS tables —
--   they are NOT the core append-only ledger (that is service_register_events, G12).
-- SR posting boundary (BRD §9.7.1): G06 writes ESTABLISHMENT events to the G12 ledger
--   (PROMOTION/OFFICIATING/MACP/CONFIRMATION/POSTING/REVERSION) via POST /api/v1/sr/ingest,
--   deduped on (source_module='G06', source_reference_id, source_event_version) with a
--   mandatory fact_key. The pay-fixation SR event is G10's, not G06's. increment_monitor
--   is a read mirror of G10 (g10_increment_ref), never authoritative. This schema only
--   stores the sr_event_id linkage columns; it never mutates the G12 ledger.
-- Enums: G06 lifecycle/type value sets are CLOSED statutory enumerations -> CREATE TYPE
--   ENUM, prefixed g06_* to avoid collision with core types (CONVENTIONS §4). Tenant-
--   configurable catalogs (cadre/designation/grade/pay scale) are core master tables and
--   are NOT re-modelled here.
-- Table count: 32 module-owned tables (BRD §5.2.1 .. §5.2.32).
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G06 closed enumerations; BRD §5.5)
-- =====================================================================================

-- Reservation category (core social_category lacks PWBD horizontal category) ----------
CREATE TYPE g06_reservation_category   AS ENUM ('GEN','SC','ST','OBC','EWS','PWBD');

-- Seniority -----------------------------------------------------------------------------
CREATE TYPE g06_seniority_list_type    AS ENUM ('TENTATIVE','FINAL');
CREATE TYPE g06_seniority_list_status  AS ENUM ('DRAFT','PUBLISHED_TENTATIVE','OBJECTIONS_OPEN',
                                                'OBJECTIONS_CLOSED','FINALISED','UNDER_CORRECTION','SUPERSEDED');
CREATE TYPE g06_recruitment_stream     AS ENUM ('DIRECT','PROMOTEE','LDCE','DEPUTATION_ABSORPTION');
CREATE TYPE g06_reckoning_basis        AS ENUM ('DOJ_GRADE','REGULARISATION_DATE','MERIT_BATCH',
                                                'DOB_TIEBREAK','ROSTER_POINT','EXAM_RESULT');
CREATE TYPE g06_objection_type         AS ENUM ('WRONG_POSITION','WRONG_DATE','OMISSION','CATEGORY_ERROR',
                                                'STREAM_QUOTA_ERROR','OTHER');
CREATE TYPE g06_objection_status       AS ENUM ('SUBMITTED','UNDER_REVIEW','UPHELD','REJECTED',
                                                'PARTIALLY_UPHELD','TIME_BARRED','WITHDRAWN');

-- Eligibility ---------------------------------------------------------------------------
CREATE TYPE g06_eligibility_channel    AS ENUM ('PROMOTION','MACP','OFFICIATING','LDCE');
CREATE TYPE g06_apar_benchmark         AS ENUM ('GOOD','VERY_GOOD','OUTSTANDING');
CREATE TYPE g06_apar_rep_status        AS ENUM ('NONE','PENDING','DISPOSED','NOT_APPLICABLE');
CREATE TYPE g06_obc_creamy_status      AS ENUM ('NON_CREAMY','CREAMY','NA');
CREATE TYPE g06_vigilance_status       AS ENUM ('CLEAR','SEALED_COVER','NOT_CLEAR','PENDING');
CREATE TYPE g06_disciplinary_status    AS ENUM ('CLEAR','PENALTY_CURRENT','CHARGE_PENDING');
CREATE TYPE g06_eligibility_result     AS ENUM ('ELIGIBLE','NOT_ELIGIBLE','SEALED_COVER','PROVISIONALLY_ELIGIBLE');

-- Promotion case / panel / candidate / proceeding --------------------------------------
CREATE TYPE g06_promotion_case_status  AS ENUM ('DRAFT','FIELD_ASSEMBLED','ELIGIBILITY_DONE','PANEL_CONSTITUTED',
                                                'DPC_HELD','SELECT_LIST_APPROVED','ORDERS_ISSUED','INTERIM_STAYED',
                                                'CLOSED','CANCELLED');
CREATE TYPE g06_promotion_mode         AS ENUM ('SENIORITY_FIT','SELECTION_MERIT','SENIORITY_CUM_FITNESS','LDCE');
CREATE TYPE g06_panel_type             AS ENUM ('DPC','DEPARTMENTAL_SELECTION_COMMITTEE','REVIEW_DPC',
                                                'SUPPLEMENTARY_DPC','SCREENING_COMMITTEE');
CREATE TYPE g06_panel_status           AS ENUM ('CONSTITUTED','CONVENED','CONCLUDED','EXPIRED','DISSOLVED');
CREATE TYPE g06_panel_member_role      AS ENUM ('CHAIRPERSON','MEMBER','SECRETARY','COMMISSION_NOMINEE','EXPERT');
CREATE TYPE g06_panel_attendance       AS ENUM ('PRESENT','ABSENT','RECUSED');
CREATE TYPE g06_candidate_zone         AS ENUM ('IN_ZONE','EXTENDED_ZONE','OUT_OF_ZONE');
CREATE TYPE g06_dpc_verdict            AS ENUM ('FIT','NOT_FIT','UNFIT','SEALED_COVER','DEFERRED','SUPERSEDED');
CREATE TYPE g06_proceeding_status      AS ENUM ('DRAFT_MINUTES','APPROVED','RATIFIED');

-- Orders / probation / officiating ------------------------------------------------------
CREATE TYPE g06_order_type             AS ENUM ('REGULAR_PROMOTION','AD_HOC','OFFICIATING','IN_SITU','MACP','LDCE_PROMOTION');
CREATE TYPE g06_order_status           AS ENUM ('DRAFT','ISSUED','PUBLISHED','EFFECTED','INTERIM_STAYED','SUPERSEDED','CANCELLED');
CREATE TYPE g06_acceptance_status      AS ENUM ('PENDING','ACCEPTED','DECLINED','DEEMED_ACCEPTED');
CREATE TYPE g06_probation_status       AS ENUM ('ON_PROBATION','EXTENDED','DECLARED_SATISFACTORY','REVERTED','DISCHARGED');
CREATE TYPE g06_officiating_type       AS ENUM ('AD_HOC','OFFICIATING','IN_SITU','CURRENT_DUTY_CHARGE');
CREATE TYPE g06_officiating_status     AS ENUM ('ACTIVE','EXTENDED','REGULARISED','TERMINATED','SUPERSEDED_BY_REGULAR','LAPSED');

-- Financial up-gradation (ACP/MACP) -----------------------------------------------------
CREATE TYPE g06_financial_scheme       AS ENUM ('TBP','ACP','MACP');
CREATE TYPE g06_upgrade_level          AS ENUM ('FIRST','SECOND','THIRD');
CREATE TYPE g06_financial_status       AS ENUM ('DUE','UNDER_SCREENING','SANCTIONED','DEFERRED','REJECTED','EFFECTED');
CREATE TYPE g06_macp_benchmark         AS ENUM ('GOOD','VERY_GOOD');
CREATE TYPE g06_macp_result            AS ENUM ('RECOMMENDED','NOT_RECOMMENDED','DEFERRED');

-- Reservation roster --------------------------------------------------------------------
CREATE TYPE g06_roster_type            AS ENUM ('PROMOTION_RESERVATION','DIRECT_RECRUITMENT','POST_BASED','VACANCY_BASED');
CREATE TYPE g06_consequential_mode     AS ENUM ('CONSEQUENTIAL','CATCH_UP');
CREATE TYPE g06_roster_point_status    AS ENUM ('VACANT','FILLED','CARRIED_FORWARD','DE_RESERVED','INTERCHANGED');

-- Posting -------------------------------------------------------------------------------
CREATE TYPE g06_posting_type           AS ENUM ('LOCAL','OUT_STATION','DEPUTATION');
CREATE TYPE g06_posting_status         AS ENUM ('PENDING','RELIEVED','JOINED','NOT_JOINED','CANCELLED');
CREATE TYPE g06_not_joined_consequence AS ENUM ('ORDER_REVIEW','FORFEITED','EXTENSION_GRANTED');

-- Establishment / config ----------------------------------------------------------------
CREATE TYPE g06_master_status          AS ENUM ('ACTIVE','REVISED','ARCHIVED'); -- sanctioned_posts & reservation_rosters
CREATE TYPE g06_suspension_treatment   AS ENUM ('EXCLUDE','INCLUDE_IF_EXONERATED','PER_OUTCOME');
CREATE TYPE g06_rotation_method        AS ENUM ('ROTA_QUOTA','RUNNING_ACCOUNT','SEPARATE_STREAM');
CREATE TYPE g06_rotation_start_slot    AS ENUM ('DR_FIRST','PROMOTEE_FIRST');

-- Legal / correction --------------------------------------------------------------------
CREATE TYPE g06_legal_linked_entity    AS ENUM ('PROMOTION_CASE','PROMOTION_ORDER','SENIORITY_LIST','ROSTER','CANDIDATE');
CREATE TYPE g06_legal_forum            AS ENUM ('CAT','HIGH_COURT','SUPREME_COURT','TRIBUNAL_OTHER');
CREATE TYPE g06_legal_status           AS ENUM ('FILED','INTERIM_STAYED','PENDING','DISPOSED_FAVOURABLE',
                                                'DISPOSED_ADVERSE','CONTEMPT','WITHDRAWN');
CREATE TYPE g06_correction_reason      AS ENUM ('OBJECTION_UPHELD','COURT_ORDER','ADMIN_ERROR');
CREATE TYPE g06_correction_affected    AS ENUM ('SENIORITY_LIST','PROMOTION_CASE','PROMOTION_ORDER');
CREATE TYPE g06_cascade_status         AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','ROLLED_BACK');

-- Exam / refusal ------------------------------------------------------------------------
CREATE TYPE g06_exam_result            AS ENUM ('PASS','FAIL','EXEMPTED','AWAITED');
CREATE TYPE g06_macp_clock_effect      AS ENUM ('NONE','STOP','FORFEIT_NEXT','RESET');
CREATE TYPE g06_refusal_status         AS ENUM ('ACTIVE','EXPIRED','WAIVED');

-- Career / succession (advisory) --------------------------------------------------------
CREATE TYPE g06_succession_risk        AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE g06_succession_status      AS ENUM ('DRAFT','ACTIVE','REVIEWED','ARCHIVED');
CREATE TYPE g06_succession_readiness   AS ENUM ('READY_NOW','READY_1_2Y','READY_3Y_PLUS','DEVELOPMENT_NEEDED');

-- Monitoring ----------------------------------------------------------------------------
CREATE TYPE g06_alert_type             AS ENUM ('DUE_FOR_PROMOTION','MACP_DUE','STAGNATION','INCREMENT_DUE',
                                                'PROBATION_ENDING','APAR_GAP_BLOCKING','SEALED_COVER_REVIEW_DUE',
                                                'REFUSAL_DEBARMENT_ENDING');
CREATE TYPE g06_alert_severity         AS ENUM ('INFO','WARNING','CRITICAL');
CREATE TYPE g06_alert_status           AS ENUM ('OPEN','ACKNOWLEDGED','ACTIONED','DISMISSED','EXPIRED');
CREATE TYPE g06_increment_type         AS ENUM ('ANNUAL','STAGNATION_INCREMENT','EFFICIENCY_BAR');
CREATE TYPE g06_increment_status       AS ENUM ('DUE','RELEASED','WITHHELD','DEFERRED');


-- =====================================================================================
-- SECTION 2 — CONFIG / MASTER TABLES (no inter-module forward deps)
-- =====================================================================================

-- 5.2.27 service_exclusion_rules ------------------------------------------------------
CREATE TABLE g06_service_exclusion_rules (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- service_exclusion_rule_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                   varchar(40) NOT NULL,
    eol_counts_as_qualifying    boolean NOT NULL DEFAULT false,
    eol_max_condonable_days     integer,
    dies_non_excluded           boolean NOT NULL DEFAULT true,
    suspension_treatment        g06_suspension_treatment NOT NULL DEFAULT 'EXCLUDE',
    adhoc_service_counts        boolean NOT NULL DEFAULT false,
    adhoc_counts_if_regularised boolean NOT NULL DEFAULT true,
    deputation_counts           boolean NOT NULL DEFAULT true,
    break_in_service_resets_clock boolean NOT NULL DEFAULT false,
    effective_from              date,
    effective_to                date,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_ser_code UNIQUE (tenant_id, rule_code)
);
CREATE INDEX ix_g06_ser_tenant ON g06_service_exclusion_rules(tenant_id);
CREATE INDEX ix_g06_ser_entity ON g06_service_exclusion_rules(entity_id);
CREATE INDEX ix_g06_ser_active ON g06_service_exclusion_rules(is_active);

-- 5.2.28 seniority_quota_rules --------------------------------------------------------
CREATE TABLE g06_seniority_quota_rules (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- quota_rule_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                   varchar(40) NOT NULL,
    cadre_id                    uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id        uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    dr_quota_ratio              integer NOT NULL,
    promotee_quota_ratio        integer NOT NULL,
    ldce_quota_ratio            integer NOT NULL DEFAULT 0,
    rotation_method             g06_rotation_method NOT NULL,
    rotation_start_slot         g06_rotation_start_slot NOT NULL,
    unfilled_quota_carry_forward boolean NOT NULL DEFAULT true,
    policy_reference            varchar(120),
    effective_from              date,
    effective_to                date,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_sqr_code UNIQUE (tenant_id, rule_code),
    CONSTRAINT ck_g06_sqr_ratios CHECK (dr_quota_ratio >= 0 AND promotee_quota_ratio >= 0 AND ldce_quota_ratio >= 0)
);
CREATE INDEX ix_g06_sqr_tenant ON g06_seniority_quota_rules(tenant_id);
CREATE INDEX ix_g06_sqr_entity ON g06_seniority_quota_rules(entity_id);
CREATE INDEX ix_g06_sqr_cadre  ON g06_seniority_quota_rules(cadre_id);
CREATE INDEX ix_g06_sqr_grade  ON g06_seniority_quota_rules(grade_designation_id);

-- 5.2.4 eligibility_rules -------------------------------------------------------------
CREATE TABLE g06_eligibility_rules (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- eligibility_rule_id
    tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                       varchar(40) NOT NULL,
    from_grade_id                   uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    to_grade_id                     uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    channel                         g06_eligibility_channel NOT NULL,
    min_qualifying_service_years    numeric(4,1) NOT NULL,
    min_qualifying_service_months   integer,
    service_exclusion_rule_id       uuid REFERENCES g06_service_exclusion_rules(id) ON DELETE RESTRICT,
    apar_lookback_years             integer NOT NULL,
    apar_benchmark                  g06_apar_benchmark NOT NULL,
    apar_min_count_meeting_benchmark integer NOT NULL,
    require_apar_communicated       boolean NOT NULL DEFAULT true,
    requires_vigilance_clearance    boolean NOT NULL DEFAULT true,
    disqualify_if_penalty_current   boolean NOT NULL DEFAULT true,
    qualification_exam_ref          varchar(60),
    requires_exam_pass              boolean NOT NULL DEFAULT false,
    requires_cert_currency          boolean NOT NULL DEFAULT true,
    roster_applicable               boolean NOT NULL DEFAULT true,
    effective_from                  date,
    effective_to                    date,
    is_active                       boolean NOT NULL DEFAULT true,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
    is_deleted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_elig_rule_code UNIQUE (tenant_id, rule_code)
);
CREATE INDEX ix_g06_elig_rule_tenant   ON g06_eligibility_rules(tenant_id);
CREATE INDEX ix_g06_elig_rule_entity   ON g06_eligibility_rules(entity_id);
CREATE INDEX ix_g06_elig_rule_from     ON g06_eligibility_rules(from_grade_id);
CREATE INDEX ix_g06_elig_rule_to       ON g06_eligibility_rules(to_grade_id);
CREATE INDEX ix_g06_elig_rule_ser      ON g06_eligibility_rules(service_exclusion_rule_id);
CREATE INDEX ix_g06_elig_rule_channel  ON g06_eligibility_rules(channel);

-- 5.2.25 sanctioned_posts -------------------------------------------------------------
CREATE TABLE g06_sanctioned_posts (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- sanctioned_post_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    cadre_id                    uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id        uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    org_unit_id                 uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    sanction_order_ref          varchar(80) NOT NULL,
    sanctioned_strength         integer NOT NULL,
    filled_count                integer NOT NULL DEFAULT 0,
    dr_quota_pct                numeric(5,2) NOT NULL DEFAULT 0,
    promotion_quota_pct         numeric(5,2) NOT NULL DEFAULT 0,
    ldce_quota_pct              numeric(5,2) NOT NULL DEFAULT 0,
    current_vacancies           integer NOT NULL DEFAULT 0,
    anticipated_vacancies       integer NOT NULL DEFAULT 0,
    carried_forward_vacancies   integer NOT NULL DEFAULT 0,
    as_on_date                  date NOT NULL,
    status                      g06_master_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_sp_nonneg  CHECK (sanctioned_strength >= 0 AND filled_count >= 0),
    CONSTRAINT ck_g06_sp_filled  CHECK (filled_count <= sanctioned_strength),                 -- §5.6-15
    CONSTRAINT ck_g06_sp_quota   CHECK (dr_quota_pct + promotion_quota_pct + ldce_quota_pct <= 100) -- VAL-G06-QUOTA-SPLIT
);
CREATE INDEX ix_g06_sp_tenant ON g06_sanctioned_posts(tenant_id);
CREATE INDEX ix_g06_sp_entity ON g06_sanctioned_posts(entity_id);
CREATE INDEX ix_g06_sp_cadre  ON g06_sanctioned_posts(cadre_id);
CREATE INDEX ix_g06_sp_grade  ON g06_sanctioned_posts(grade_designation_id);
CREATE INDEX ix_g06_sp_org    ON g06_sanctioned_posts(org_unit_id);
CREATE INDEX ix_g06_sp_status ON g06_sanctioned_posts(status);
CREATE INDEX ix_g06_sp_ason   ON g06_sanctioned_posts(as_on_date);

-- 5.2.26 qualifying_service_ledger (supersede-only lineage; soft delete only) ---------
CREATE TABLE g06_qualifying_service_ledger (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- qsl_snapshot_id (immutable snapshot)
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    grade_designation_id        uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    as_of_date                  date NOT NULL,
    gross_service_years         numeric(6,3) NOT NULL,
    total_exclusion_days        integer NOT NULL DEFAULT 0,
    net_qualifying_years        numeric(6,3) NOT NULL,                                  -- VAL-G06-QUALSVC
    exclusion_breakdown_json    jsonb NOT NULL,
    service_exclusion_rule_id   uuid NOT NULL REFERENCES g06_service_exclusion_rules(id) ON DELETE RESTRICT,
    computed_by_version         varchar(20) NOT NULL,
    is_current                  boolean NOT NULL DEFAULT true,
    superseding_snapshot_id     uuid REFERENCES g06_qualifying_service_ledger(id) ON DELETE SET NULL,
    legacy_source_id            varchar(80),                                            -- P06 migration cross-ref
    computed_at                 timestamptz NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_qsl_net CHECK (net_qualifying_years >= 0 AND total_exclusion_days >= 0)
);
CREATE INDEX ix_g06_qsl_tenant   ON g06_qualifying_service_ledger(tenant_id);
CREATE INDEX ix_g06_qsl_entity   ON g06_qualifying_service_ledger(entity_id);
CREATE INDEX ix_g06_qsl_emp      ON g06_qualifying_service_ledger(employee_id);
CREATE INDEX ix_g06_qsl_grade    ON g06_qualifying_service_ledger(grade_designation_id);
CREATE INDEX ix_g06_qsl_ser      ON g06_qualifying_service_ledger(service_exclusion_rule_id);
CREATE INDEX ix_g06_qsl_supersede ON g06_qualifying_service_ledger(superseding_snapshot_id);
CREATE INDEX ix_g06_qsl_asof     ON g06_qualifying_service_ledger(as_of_date);
CREATE INDEX ix_g06_qsl_current  ON g06_qualifying_service_ledger(employee_id, grade_designation_id) WHERE is_current;

-- 5.2.31 exam_results -----------------------------------------------------------------
CREATE TABLE g06_exam_results (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- exam_result_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    exam_code           varchar(60) NOT NULL,
    exam_cycle_year     integer NOT NULL,
    result              g06_exam_result NOT NULL,
    marks_or_grade      varchar(30),
    merit_rank          integer,
    valid_from          date,
    valid_to            date,
    result_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_exam UNIQUE (tenant_id, employee_id, exam_code, exam_cycle_year)
);
CREATE INDEX ix_g06_exam_tenant ON g06_exam_results(tenant_id);
CREATE INDEX ix_g06_exam_entity ON g06_exam_results(entity_id);
CREATE INDEX ix_g06_exam_emp    ON g06_exam_results(employee_id);
CREATE INDEX ix_g06_exam_doc    ON g06_exam_results(result_document_id);

-- 5.2.16 reservation_rosters ----------------------------------------------------------
CREATE TABLE g06_reservation_rosters (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- roster_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    roster_no                   varchar(40) NOT NULL,
    cadre_id                    uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id        uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    roster_type                 g06_roster_type NOT NULL,
    cycle_size                  integer NOT NULL,
    policy_version              varchar(20) NOT NULL,
    roster_applicable           boolean NOT NULL DEFAULT true,
    enabling_provision_ref      varchar(120),
    quantifiable_data_doc_id    uuid REFERENCES documents(id) ON DELETE SET NULL,
    consequential_seniority_mode g06_consequential_mode NOT NULL DEFAULT 'CATCH_UP',
    status                      g06_master_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_roster_no UNIQUE (tenant_id, roster_no)
);
CREATE INDEX ix_g06_roster_tenant ON g06_reservation_rosters(tenant_id);
CREATE INDEX ix_g06_roster_entity ON g06_reservation_rosters(entity_id);
CREATE INDEX ix_g06_roster_cadre  ON g06_reservation_rosters(cadre_id);
CREATE INDEX ix_g06_roster_grade  ON g06_reservation_rosters(grade_designation_id);
CREATE INDEX ix_g06_roster_doc    ON g06_reservation_rosters(quantifiable_data_doc_id);
CREATE INDEX ix_g06_roster_status ON g06_reservation_rosters(status);


-- =====================================================================================
-- SECTION 3 — SENIORITY (lists, entries, objections)
-- =====================================================================================

-- 5.2.1 seniority_lists ---------------------------------------------------------------
-- correction_event_id FK is deferred to Section 10 (correction_events created later).
CREATE TABLE g06_seniority_lists (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- seniority_list_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    list_no                     varchar(40) NOT NULL,
    cadre_id                    uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id        uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    org_unit_scope_id           uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    as_on_date                  date NOT NULL,
    list_type                   g06_seniority_list_type NOT NULL,
    status                      g06_seniority_list_status NOT NULL DEFAULT 'DRAFT',
    is_multi_stream             boolean NOT NULL DEFAULT false,
    quota_rule_id               uuid REFERENCES g06_seniority_quota_rules(id) ON DELETE RESTRICT,
    objection_window_start      date,
    objection_window_end        date,
    supersedes_list_id          uuid REFERENCES g06_seniority_lists(id) ON DELETE SET NULL,
    correction_event_id         uuid,  -- FK -> g06_correction_events (deferred, Section 10)
    subject_to_litigation       boolean NOT NULL DEFAULT false,
    published_by                uuid REFERENCES users(id) ON DELETE SET NULL,
    document_id                 uuid REFERENCES documents(id) ON DELETE SET NULL,
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_seniority_list_no UNIQUE (tenant_id, list_no)
);
CREATE INDEX ix_g06_sl_tenant   ON g06_seniority_lists(tenant_id);
CREATE INDEX ix_g06_sl_entity   ON g06_seniority_lists(entity_id);
CREATE INDEX ix_g06_sl_cadre    ON g06_seniority_lists(cadre_id);
CREATE INDEX ix_g06_sl_grade    ON g06_seniority_lists(grade_designation_id);
CREATE INDEX ix_g06_sl_org      ON g06_seniority_lists(org_unit_scope_id);
CREATE INDEX ix_g06_sl_quota    ON g06_seniority_lists(quota_rule_id);
CREATE INDEX ix_g06_sl_super    ON g06_seniority_lists(supersedes_list_id);
CREATE INDEX ix_g06_sl_corr     ON g06_seniority_lists(correction_event_id);
CREATE INDEX ix_g06_sl_wf       ON g06_seniority_lists(workflow_instance_id);
CREATE INDEX ix_g06_sl_pubby    ON g06_seniority_lists(published_by);
CREATE INDEX ix_g06_sl_doc      ON g06_seniority_lists(document_id);
CREATE INDEX ix_g06_sl_status   ON g06_seniority_lists(status);
CREATE INDEX ix_g06_sl_ason     ON g06_seniority_lists(as_on_date);
-- §5.6-2: at most one FINALISED FINAL list per (cadre, grade, org scope).
CREATE UNIQUE INDEX uq_g06_sl_single_final
    ON g06_seniority_lists(tenant_id, cadre_id, grade_designation_id, COALESCE(org_unit_scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE list_type = 'FINAL' AND status = 'FINALISED' AND is_deleted = false;

-- 5.2.2 seniority_entries -------------------------------------------------------------
CREATE TABLE g06_seniority_entries (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- seniority_entry_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    seniority_list_id           uuid NOT NULL REFERENCES g06_seniority_lists(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    rank_position               integer NOT NULL,
    recruitment_stream          g06_recruitment_stream NOT NULL,
    quota_slot_label            varchar(20),
    rotation_cycle_no           integer,
    reckoning_basis             g06_reckoning_basis NOT NULL,
    entry_into_grade_date       date NOT NULL,
    tiebreak_value              varchar(60),
    reservation_category        g06_reservation_category,
    is_provisional              boolean NOT NULL DEFAULT true,
    superseded_by_correction    boolean NOT NULL DEFAULT false,
    remarks                     text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_se_list_emp  UNIQUE (seniority_list_id, employee_id),   -- §5.6-1
    CONSTRAINT uq_g06_se_list_rank UNIQUE (seniority_list_id, rank_position)  -- §5.6-1
);
CREATE INDEX ix_g06_se_tenant ON g06_seniority_entries(tenant_id);
CREATE INDEX ix_g06_se_entity ON g06_seniority_entries(entity_id);
CREATE INDEX ix_g06_se_list   ON g06_seniority_entries(seniority_list_id);
CREATE INDEX ix_g06_se_emp    ON g06_seniority_entries(employee_id);

-- 5.2.3 seniority_objections ----------------------------------------------------------
CREATE TABLE g06_seniority_objections (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- objection_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    objection_no                varchar(40) NOT NULL,
    seniority_list_id           uuid NOT NULL REFERENCES g06_seniority_lists(id) ON DELETE RESTRICT,
    raised_by_employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    target_entry_id             uuid REFERENCES g06_seniority_entries(id) ON DELETE SET NULL,
    objection_type              g06_objection_type NOT NULL,
    grounds                     text NOT NULL,
    supporting_document_id      uuid REFERENCES documents(id) ON DELETE SET NULL,
    status                      g06_objection_status NOT NULL DEFAULT 'SUBMITTED',
    disposal_remarks            text,
    disposed_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
    disposed_at                 timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_objection_no UNIQUE (tenant_id, objection_no)
);
CREATE INDEX ix_g06_obj_tenant ON g06_seniority_objections(tenant_id);
CREATE INDEX ix_g06_obj_entity ON g06_seniority_objections(entity_id);
CREATE INDEX ix_g06_obj_list   ON g06_seniority_objections(seniority_list_id);
CREATE INDEX ix_g06_obj_emp    ON g06_seniority_objections(raised_by_employee_id);
CREATE INDEX ix_g06_obj_target ON g06_seniority_objections(target_entry_id);
CREATE INDEX ix_g06_obj_doc    ON g06_seniority_objections(supporting_document_id);
CREATE INDEX ix_g06_obj_status ON g06_seniority_objections(status);


-- =====================================================================================
-- SECTION 4 — PROMOTION CASE, ELIGIBILITY, PANELS, CANDIDATES
-- =====================================================================================

-- 5.2.6 promotion_cases ---------------------------------------------------------------
CREATE TABLE g06_promotion_cases (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- promotion_case_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_no                     varchar(40) NOT NULL,
    from_grade_id               uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    to_grade_id                 uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    cadre_id                    uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    org_unit_scope_id           uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    sanctioned_post_id          uuid NOT NULL REFERENCES g06_sanctioned_posts(id) ON DELETE RESTRICT,
    vacancy_count               integer NOT NULL,
    vacancy_year                integer NOT NULL,
    promotion_mode              g06_promotion_mode NOT NULL,
    eligibility_rule_id         uuid NOT NULL REFERENCES g06_eligibility_rules(id) ON DELETE RESTRICT,
    crucial_date                date NOT NULL,
    status                      g06_promotion_case_status NOT NULL DEFAULT 'DRAFT',
    subject_to_litigation       boolean NOT NULL DEFAULT false,
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_case_no    UNIQUE (tenant_id, case_no),
    CONSTRAINT ck_g06_case_vac   CHECK (vacancy_count >= 0)   -- §5.6-5 (VAL-G06-VACANCY-RECON enforced in service)
);
CREATE INDEX ix_g06_case_tenant ON g06_promotion_cases(tenant_id);
CREATE INDEX ix_g06_case_entity ON g06_promotion_cases(entity_id);
CREATE INDEX ix_g06_case_from   ON g06_promotion_cases(from_grade_id);
CREATE INDEX ix_g06_case_to     ON g06_promotion_cases(to_grade_id);
CREATE INDEX ix_g06_case_cadre  ON g06_promotion_cases(cadre_id);
CREATE INDEX ix_g06_case_org    ON g06_promotion_cases(org_unit_scope_id);
CREATE INDEX ix_g06_case_sp     ON g06_promotion_cases(sanctioned_post_id);
CREATE INDEX ix_g06_case_rule   ON g06_promotion_cases(eligibility_rule_id);
CREATE INDEX ix_g06_case_wf     ON g06_promotion_cases(workflow_instance_id);
CREATE INDEX ix_g06_case_status ON g06_promotion_cases(status);
CREATE INDEX ix_g06_case_crucial ON g06_promotion_cases(crucial_date);

-- 5.2.17 roster_points (created before candidates; references rosters + cases) --------
CREATE TABLE g06_roster_points (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- roster_point_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    roster_id                   uuid NOT NULL REFERENCES g06_reservation_rosters(id) ON DELETE RESTRICT,
    point_number                integer NOT NULL,
    reserved_for                g06_reservation_category NOT NULL,
    is_horizontal_pwbd          boolean NOT NULL DEFAULT false,
    status                      g06_roster_point_status NOT NULL DEFAULT 'VACANT',
    filled_by_employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
    adjusted_against_category   g06_reservation_category,                              -- own-merit migration (§5.6-6)
    filled_in_case_id           uuid REFERENCES g06_promotion_cases(id) ON DELETE SET NULL,
    carry_forward_from_point_id uuid REFERENCES g06_roster_points(id) ON DELETE SET NULL,
    dereservation_authority_ref varchar(120),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_rp_point UNIQUE (roster_id, point_number)
);
CREATE INDEX ix_g06_rp_tenant ON g06_roster_points(tenant_id);
CREATE INDEX ix_g06_rp_entity ON g06_roster_points(entity_id);
CREATE INDEX ix_g06_rp_roster ON g06_roster_points(roster_id);
CREATE INDEX ix_g06_rp_emp    ON g06_roster_points(filled_by_employee_id);
CREATE INDEX ix_g06_rp_case   ON g06_roster_points(filled_in_case_id);
CREATE INDEX ix_g06_rp_cf     ON g06_roster_points(carry_forward_from_point_id);
CREATE INDEX ix_g06_rp_status ON g06_roster_points(status);

-- 5.2.5 eligibility_assessments -------------------------------------------------------
CREATE TABLE g06_eligibility_assessments (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- assessment_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    promotion_case_id           uuid REFERENCES g06_promotion_cases(id) ON DELETE RESTRICT,  -- NULL for MACP-only
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    eligibility_rule_id         uuid NOT NULL REFERENCES g06_eligibility_rules(id) ON DELETE RESTRICT,
    qsl_snapshot_id             uuid NOT NULL REFERENCES g06_qualifying_service_ledger(id) ON DELETE RESTRICT,
    qualifying_service_years    numeric(5,2) NOT NULL,
    apar_pass                   boolean NOT NULL,
    apar_detail_json            jsonb,                                          -- P02 field-masked PII
    apar_communicated           boolean NOT NULL,
    apar_representation_status  g06_apar_rep_status NOT NULL,
    apar_usable                 boolean NOT NULL,
    vigilance_status            g06_vigilance_status NOT NULL,                  -- from G09
    disciplinary_status         g06_disciplinary_status NOT NULL,              -- from G09
    qualification_met           boolean NOT NULL,
    exam_result_id              uuid REFERENCES g06_exam_results(id) ON DELETE SET NULL,
    obc_creamy_layer_status     g06_obc_creamy_status,
    ews_cert_valid_on_crucial_date boolean,
    overall_result              g06_eligibility_result NOT NULL,
    failure_reasons             jsonb,
    rule_trace_json             jsonb,
    apar_snapshot_retention_until date,
    assessed_at                 timestamptz NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_ea_case_emp UNIQUE (promotion_case_id, employee_id)
);
CREATE INDEX ix_g06_ea_tenant ON g06_eligibility_assessments(tenant_id);
CREATE INDEX ix_g06_ea_entity ON g06_eligibility_assessments(entity_id);
CREATE INDEX ix_g06_ea_case   ON g06_eligibility_assessments(promotion_case_id);
CREATE INDEX ix_g06_ea_emp    ON g06_eligibility_assessments(employee_id);
CREATE INDEX ix_g06_ea_rule   ON g06_eligibility_assessments(eligibility_rule_id);
CREATE INDEX ix_g06_ea_qsl    ON g06_eligibility_assessments(qsl_snapshot_id);
CREATE INDEX ix_g06_ea_exam   ON g06_eligibility_assessments(exam_result_id);
CREATE INDEX ix_g06_ea_result ON g06_eligibility_assessments(overall_result);

-- 5.2.7 promotion_panels --------------------------------------------------------------
CREATE TABLE g06_promotion_panels (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- panel_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    promotion_case_id           uuid NOT NULL REFERENCES g06_promotion_cases(id) ON DELETE RESTRICT,
    panel_type                  g06_panel_type NOT NULL,
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    convened_date               date,
    panel_valid_from            date,
    panel_valid_until           date,                                          -- §5.6-17 panel currency
    quorum_required             integer NOT NULL,
    status                      g06_panel_status NOT NULL DEFAULT 'CONSTITUTED',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_panel_tenant ON g06_promotion_panels(tenant_id);
CREATE INDEX ix_g06_panel_entity ON g06_promotion_panels(entity_id);
CREATE INDEX ix_g06_panel_case   ON g06_promotion_panels(promotion_case_id);
CREATE INDEX ix_g06_panel_wf     ON g06_promotion_panels(workflow_instance_id);
CREATE INDEX ix_g06_panel_status ON g06_promotion_panels(status);
CREATE INDEX ix_g06_panel_valid  ON g06_promotion_panels(panel_valid_until);

-- 5.2.8 promotion_panel_members -------------------------------------------------------
CREATE TABLE g06_promotion_panel_members (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- panel_member_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    panel_id                    uuid NOT NULL REFERENCES g06_promotion_panels(id) ON DELETE RESTRICT,
    member_employee_id          uuid REFERENCES employees(id) ON DELETE RESTRICT,
    external_member_name        varchar(120),
    member_role                 g06_panel_member_role NOT NULL,
    attendance                  g06_panel_attendance,
    recusal_reason              text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_pm_member CHECK (member_employee_id IS NOT NULL OR external_member_name IS NOT NULL)
);
CREATE INDEX ix_g06_pm_tenant ON g06_promotion_panel_members(tenant_id);
CREATE INDEX ix_g06_pm_entity ON g06_promotion_panel_members(entity_id);
CREATE INDEX ix_g06_pm_panel  ON g06_promotion_panel_members(panel_id);
CREATE INDEX ix_g06_pm_emp    ON g06_promotion_panel_members(member_employee_id);

-- 5.2.9 promotion_candidates ----------------------------------------------------------
CREATE TABLE g06_promotion_candidates (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- candidate_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    promotion_case_id           uuid NOT NULL REFERENCES g06_promotion_cases(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    seniority_entry_id          uuid REFERENCES g06_seniority_entries(id) ON DELETE SET NULL,
    zone_of_consideration       g06_candidate_zone NOT NULL,
    eligibility_assessment_id   uuid REFERENCES g06_eligibility_assessments(id) ON DELETE SET NULL,
    reservation_category        g06_reservation_category,
    selected_on_own_merit       boolean NOT NULL DEFAULT false,
    roster_point_id             uuid REFERENCES g06_roster_points(id) ON DELETE SET NULL,
    dpc_verdict                 g06_dpc_verdict,
    select_list_rank            integer,
    is_selected                 boolean NOT NULL DEFAULT false,
    remarks                     text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_cand_case_emp UNIQUE (promotion_case_id, employee_id)
);
CREATE INDEX ix_g06_cand_tenant ON g06_promotion_candidates(tenant_id);
CREATE INDEX ix_g06_cand_entity ON g06_promotion_candidates(entity_id);
CREATE INDEX ix_g06_cand_case   ON g06_promotion_candidates(promotion_case_id);
CREATE INDEX ix_g06_cand_emp    ON g06_promotion_candidates(employee_id);
CREATE INDEX ix_g06_cand_senior ON g06_promotion_candidates(seniority_entry_id);
CREATE INDEX ix_g06_cand_ea     ON g06_promotion_candidates(eligibility_assessment_id);
CREATE INDEX ix_g06_cand_rp     ON g06_promotion_candidates(roster_point_id);
CREATE INDEX ix_g06_cand_sel    ON g06_promotion_candidates(is_selected);

-- 5.2.10 dpc_proceedings --------------------------------------------------------------
CREATE TABLE g06_dpc_proceedings (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- proceeding_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    panel_id                    uuid NOT NULL REFERENCES g06_promotion_panels(id) ON DELETE RESTRICT,
    promotion_case_id           uuid NOT NULL REFERENCES g06_promotion_cases(id) ON DELETE RESTRICT,
    meeting_date                date NOT NULL,
    benchmark_applied           g06_apar_benchmark NOT NULL,
    quorum_met                  boolean NOT NULL,
    minutes_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    select_list_count           integer NOT NULL,
    reserve_list_count          integer NOT NULL DEFAULT 0,
    sealed_cover_count          integer NOT NULL DEFAULT 0,
    status                      g06_proceeding_status NOT NULL DEFAULT 'DRAFT_MINUTES',
    approved_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_dpc_tenant ON g06_dpc_proceedings(tenant_id);
CREATE INDEX ix_g06_dpc_entity ON g06_dpc_proceedings(entity_id);
CREATE INDEX ix_g06_dpc_panel  ON g06_dpc_proceedings(panel_id);
CREATE INDEX ix_g06_dpc_case   ON g06_dpc_proceedings(promotion_case_id);
CREATE INDEX ix_g06_dpc_doc    ON g06_dpc_proceedings(minutes_document_id);
CREATE INDEX ix_g06_dpc_status ON g06_dpc_proceedings(status);
CREATE INDEX ix_g06_dpc_date   ON g06_dpc_proceedings(meeting_date);

-- 5.2.15 macp_assessments -------------------------------------------------------------
CREATE TABLE g06_macp_assessments (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- macp_assessment_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    screening_committee_panel_id uuid REFERENCES g06_promotion_panels(id) ON DELETE SET NULL,
    benchmark_required          g06_macp_benchmark NOT NULL,
    benchmark_met               boolean NOT NULL,
    financial_upgradations_availed integer NOT NULL,
    promotions_earned_count     integer NOT NULL,
    result                      g06_macp_result NOT NULL,
    assessment_date             date NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_macp_counts CHECK (financial_upgradations_availed >= 0 AND promotions_earned_count >= 0)
);
CREATE INDEX ix_g06_macp_tenant ON g06_macp_assessments(tenant_id);
CREATE INDEX ix_g06_macp_entity ON g06_macp_assessments(entity_id);
CREATE INDEX ix_g06_macp_emp    ON g06_macp_assessments(employee_id);
CREATE INDEX ix_g06_macp_panel  ON g06_macp_assessments(screening_committee_panel_id);


-- =====================================================================================
-- SECTION 5 — ORDERS, PROBATION, OFFICIATING, FINANCIAL, POSTING, REFUSALS
-- =====================================================================================

-- 5.2.11 promotion_orders -------------------------------------------------------------
-- correction_event_id FK is deferred to Section 10 (correction_events created later).
CREATE TABLE g06_promotion_orders (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- order_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_no                    varchar(40) NOT NULL,
    promotion_case_id           uuid REFERENCES g06_promotion_cases(id) ON DELETE RESTRICT,
    candidate_id                uuid REFERENCES g06_promotion_candidates(id) ON DELETE SET NULL,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    order_type                  g06_order_type NOT NULL,
    from_designation_id         uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    to_designation_id           uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    from_pay_scale_id           uuid REFERENCES pay_scales(id) ON DELETE RESTRICT,
    to_pay_scale_id             uuid REFERENCES pay_scales(id) ON DELETE RESTRICT,
    effective_date              date NOT NULL,
    notional_date               date,
    subject_to_litigation       boolean NOT NULL DEFAULT false,
    acceptance_status           g06_acceptance_status NOT NULL DEFAULT 'PENDING',
    status                      g06_order_status NOT NULL DEFAULT 'DRAFT',
    order_document_id           uuid REFERENCES documents(id) ON DELETE SET NULL,
    sr_event_id                 uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- G12 establishment event
    correction_event_id         uuid,  -- FK -> g06_correction_events (deferred, Section 10)
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_order_no UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_g06_ord_tenant ON g06_promotion_orders(tenant_id);
CREATE INDEX ix_g06_ord_entity ON g06_promotion_orders(entity_id);
CREATE INDEX ix_g06_ord_case   ON g06_promotion_orders(promotion_case_id);
CREATE INDEX ix_g06_ord_cand   ON g06_promotion_orders(candidate_id);
CREATE INDEX ix_g06_ord_emp    ON g06_promotion_orders(employee_id);
CREATE INDEX ix_g06_ord_fromdes ON g06_promotion_orders(from_designation_id);
CREATE INDEX ix_g06_ord_todes  ON g06_promotion_orders(to_designation_id);
CREATE INDEX ix_g06_ord_fromps ON g06_promotion_orders(from_pay_scale_id);
CREATE INDEX ix_g06_ord_tops   ON g06_promotion_orders(to_pay_scale_id);
CREATE INDEX ix_g06_ord_doc    ON g06_promotion_orders(order_document_id);
CREATE INDEX ix_g06_ord_sr     ON g06_promotion_orders(sr_event_id);
CREATE INDEX ix_g06_ord_corr   ON g06_promotion_orders(correction_event_id);
CREATE INDEX ix_g06_ord_wf     ON g06_promotion_orders(workflow_instance_id);
CREATE INDEX ix_g06_ord_status ON g06_promotion_orders(status);
CREATE INDEX ix_g06_ord_eff    ON g06_promotion_orders(effective_date);

-- 5.2.12 probation_records ------------------------------------------------------------
CREATE TABLE g06_probation_records (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- probation_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                    uuid NOT NULL REFERENCES g06_promotion_orders(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    probation_start             date NOT NULL,
    probation_months            integer NOT NULL,
    scheduled_end               date NOT NULL,
    extended_to                 date,
    status                      g06_probation_status NOT NULL DEFAULT 'ON_PROBATION',
    declaration_date            date,
    declared_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
    remarks                     text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_prob_months CHECK (probation_months > 0)
);
CREATE INDEX ix_g06_prob_tenant ON g06_probation_records(tenant_id);
CREATE INDEX ix_g06_prob_entity ON g06_probation_records(entity_id);
CREATE INDEX ix_g06_prob_order  ON g06_probation_records(order_id);
CREATE INDEX ix_g06_prob_emp    ON g06_probation_records(employee_id);
CREATE INDEX ix_g06_prob_status ON g06_probation_records(status);

-- 5.2.13 officiating_arrangements -----------------------------------------------------
CREATE TABLE g06_officiating_arrangements (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- arrangement_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    arrangement_no              varchar(40) NOT NULL,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    arrangement_type            g06_officiating_type NOT NULL,
    against_post_id             uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    sanctioned_post_id          uuid REFERENCES g06_sanctioned_posts(id) ON DELETE SET NULL,
    org_unit_id                 uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    start_date                  date NOT NULL,
    end_date                    date,
    linked_case_id              uuid REFERENCES g06_promotion_cases(id) ON DELETE SET NULL,
    regularised_order_id        uuid REFERENCES g06_promotion_orders(id) ON DELETE SET NULL,
    status                      g06_officiating_status NOT NULL DEFAULT 'ACTIVE',
    pay_allowed                 boolean NOT NULL DEFAULT true,
    sr_event_id                 uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_offic_no UNIQUE (tenant_id, arrangement_no)
);
CREATE INDEX ix_g06_offic_tenant ON g06_officiating_arrangements(tenant_id);
CREATE INDEX ix_g06_offic_entity ON g06_officiating_arrangements(entity_id);
CREATE INDEX ix_g06_offic_emp    ON g06_officiating_arrangements(employee_id);
CREATE INDEX ix_g06_offic_post   ON g06_officiating_arrangements(against_post_id);
CREATE INDEX ix_g06_offic_sp     ON g06_officiating_arrangements(sanctioned_post_id);
CREATE INDEX ix_g06_offic_org    ON g06_officiating_arrangements(org_unit_id);
CREATE INDEX ix_g06_offic_case   ON g06_officiating_arrangements(linked_case_id);
CREATE INDEX ix_g06_offic_regord ON g06_officiating_arrangements(regularised_order_id);
CREATE INDEX ix_g06_offic_sr     ON g06_officiating_arrangements(sr_event_id);
CREATE INDEX ix_g06_offic_status ON g06_officiating_arrangements(status);

-- 5.2.14 financial_upgradations -------------------------------------------------------
CREATE TABLE g06_financial_upgradations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- upgradation_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    upgradation_no              varchar(40) NOT NULL,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    scheme                      g06_financial_scheme NOT NULL,
    upgrade_level               g06_upgrade_level NOT NULL,
    qsl_snapshot_id             uuid NOT NULL REFERENCES g06_qualifying_service_ledger(id) ON DELETE RESTRICT,
    qualifying_years_completed  numeric(5,2) NOT NULL,
    regular_promotions_availed  integer NOT NULL DEFAULT 0,
    clock_reset_date            date,
    refusal_effect_applied      boolean NOT NULL DEFAULT false,
    due_date                    date NOT NULL,
    granted_pay_level_id        uuid REFERENCES pay_scales(id) ON DELETE RESTRICT,
    effective_date              date,
    macp_assessment_id          uuid REFERENCES g06_macp_assessments(id) ON DELETE SET NULL,
    status                      g06_financial_status NOT NULL DEFAULT 'DUE',
    deferral_reason             text,
    order_id                    uuid REFERENCES g06_promotion_orders(id) ON DELETE SET NULL,
    sr_event_id                 uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_fu_no UNIQUE (tenant_id, upgradation_no),
    CONSTRAINT ck_g06_fu_promos CHECK (regular_promotions_availed >= 0)
);
CREATE INDEX ix_g06_fu_tenant ON g06_financial_upgradations(tenant_id);
CREATE INDEX ix_g06_fu_entity ON g06_financial_upgradations(entity_id);
CREATE INDEX ix_g06_fu_emp    ON g06_financial_upgradations(employee_id);
CREATE INDEX ix_g06_fu_qsl    ON g06_financial_upgradations(qsl_snapshot_id);
CREATE INDEX ix_g06_fu_paylvl ON g06_financial_upgradations(granted_pay_level_id);
CREATE INDEX ix_g06_fu_macp   ON g06_financial_upgradations(macp_assessment_id);
CREATE INDEX ix_g06_fu_order  ON g06_financial_upgradations(order_id);
CREATE INDEX ix_g06_fu_sr     ON g06_financial_upgradations(sr_event_id);
CREATE INDEX ix_g06_fu_status ON g06_financial_upgradations(status);
CREATE INDEX ix_g06_fu_due    ON g06_financial_upgradations(due_date);

-- 5.2.18 promotion_postings -----------------------------------------------------------
CREATE TABLE g06_promotion_postings (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- posting_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                    uuid NOT NULL REFERENCES g06_promotion_orders(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    to_org_unit_id              uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    to_post_designation_id      uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    to_sanctioned_post_id       uuid NOT NULL REFERENCES g06_sanctioned_posts(id) ON DELETE RESTRICT,
    posting_type                g06_posting_type NOT NULL,
    g05_movement_id             uuid,                                          -- ref to G05 movement (no FK; sibling module)
    report_by_date              date,
    status                      g06_posting_status NOT NULL DEFAULT 'PENDING',
    not_joined_consequence      g06_not_joined_consequence,
    sr_event_id                 uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_post_tenant ON g06_promotion_postings(tenant_id);
CREATE INDEX ix_g06_post_entity ON g06_promotion_postings(entity_id);
CREATE INDEX ix_g06_post_order  ON g06_promotion_postings(order_id);
CREATE INDEX ix_g06_post_emp    ON g06_promotion_postings(employee_id);
CREATE INDEX ix_g06_post_org    ON g06_promotion_postings(to_org_unit_id);
CREATE INDEX ix_g06_post_des    ON g06_promotion_postings(to_post_designation_id);
CREATE INDEX ix_g06_post_sp     ON g06_promotion_postings(to_sanctioned_post_id);
CREATE INDEX ix_g06_post_sr     ON g06_promotion_postings(sr_event_id);
CREATE INDEX ix_g06_post_status ON g06_promotion_postings(status);

-- 5.2.32 promotion_refusals -----------------------------------------------------------
CREATE TABLE g06_promotion_refusals (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- refusal_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                    uuid NOT NULL REFERENCES g06_promotion_orders(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    refusal_date                date NOT NULL,
    refusal_reason              text,
    debarment_months            integer NOT NULL,
    debarment_until             date NOT NULL,
    macp_clock_effect           g06_macp_clock_effect NOT NULL,
    next_consideration_after    date,
    status                      g06_refusal_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_refusal_debar CHECK (debarment_months >= 0)
);
CREATE INDEX ix_g06_refusal_tenant ON g06_promotion_refusals(tenant_id);
CREATE INDEX ix_g06_refusal_entity ON g06_promotion_refusals(entity_id);
CREATE INDEX ix_g06_refusal_order  ON g06_promotion_refusals(order_id);
CREATE INDEX ix_g06_refusal_emp    ON g06_promotion_refusals(employee_id);
CREATE INDEX ix_g06_refusal_status ON g06_promotion_refusals(status);


-- =====================================================================================
-- SECTION 6 — LEGAL & CORRECTION (mutually referential; cycle resolved in Section 10)
-- =====================================================================================

-- 5.2.29 legal_case_links -------------------------------------------------------------
-- triggers_correction_event_id FK is deferred to Section 10.
CREATE TABLE g06_legal_case_links (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- legal_case_link_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    link_no                     varchar(40) NOT NULL,
    linked_entity_type          g06_legal_linked_entity NOT NULL,
    linked_entity_id            uuid NOT NULL,                                 -- polymorphic; validated in service
    forum                       g06_legal_forum NOT NULL,
    case_reference              varchar(80) NOT NULL,
    petitioner                  varchar(160),
    interim_stay                boolean NOT NULL DEFAULT false,
    stay_from_date              date,
    stay_to_date                date,
    subject_to_outcome          boolean NOT NULL DEFAULT false,
    status                      g06_legal_status NOT NULL DEFAULT 'FILED',
    outcome_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    triggers_correction_event_id uuid,  -- FK -> g06_correction_events (deferred, Section 10)
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_lcl_no UNIQUE (tenant_id, link_no)
);
CREATE INDEX ix_g06_lcl_tenant ON g06_legal_case_links(tenant_id);
CREATE INDEX ix_g06_lcl_entity ON g06_legal_case_links(entity_id);
CREATE INDEX ix_g06_lcl_linked ON g06_legal_case_links(linked_entity_type, linked_entity_id);
CREATE INDEX ix_g06_lcl_doc    ON g06_legal_case_links(outcome_document_id);
CREATE INDEX ix_g06_lcl_corr   ON g06_legal_case_links(triggers_correction_event_id);
CREATE INDEX ix_g06_lcl_status ON g06_legal_case_links(status);
CREATE INDEX ix_g06_lcl_stay   ON g06_legal_case_links(interim_stay) WHERE interim_stay = true;

-- 5.2.30 correction_events ------------------------------------------------------------
CREATE TABLE g06_correction_events (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- correction_event_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    correction_no               varchar(40) NOT NULL,
    reason_class                g06_correction_reason NOT NULL,
    trigger_legal_case_link_id  uuid REFERENCES g06_legal_case_links(id) ON DELETE SET NULL,
    trigger_objection_id        uuid REFERENCES g06_seniority_objections(id) ON DELETE SET NULL,
    affected_entity_type        g06_correction_affected NOT NULL,
    affected_entity_id          uuid NOT NULL,                                 -- polymorphic; validated in service
    recompute_scope_json        jsonb NOT NULL,
    cascade_status              g06_cascade_status NOT NULL DEFAULT 'PENDING',
    pay_anomaly_flag            boolean NOT NULL DEFAULT false,
    pay_anomaly_signal_ref      varchar(60),
    approved_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    sr_correction_event_id      uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_corr_no UNIQUE (tenant_id, correction_no)
);
CREATE INDEX ix_g06_corr_tenant ON g06_correction_events(tenant_id);
CREATE INDEX ix_g06_corr_entity ON g06_correction_events(entity_id);
CREATE INDEX ix_g06_corr_lcl    ON g06_correction_events(trigger_legal_case_link_id);
CREATE INDEX ix_g06_corr_obj    ON g06_correction_events(trigger_objection_id);
CREATE INDEX ix_g06_corr_affected ON g06_correction_events(affected_entity_type, affected_entity_id);
CREATE INDEX ix_g06_corr_wf     ON g06_correction_events(workflow_instance_id);
CREATE INDEX ix_g06_corr_sr     ON g06_correction_events(sr_correction_event_id);
CREATE INDEX ix_g06_corr_cascade ON g06_correction_events(cascade_status);


-- =====================================================================================
-- SECTION 7 — MONITORING (alerts, increment mirror)
-- =====================================================================================

-- 5.2.23 progression_alerts -----------------------------------------------------------
CREATE TABLE g06_progression_alerts (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- alert_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    alert_type                  g06_alert_type NOT NULL,
    due_date                    date,
    severity                    g06_alert_severity NOT NULL DEFAULT 'INFO',
    status                      g06_alert_status NOT NULL DEFAULT 'OPEN',
    context_json                jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_alert_tenant ON g06_progression_alerts(tenant_id);
CREATE INDEX ix_g06_alert_entity ON g06_progression_alerts(entity_id);
CREATE INDEX ix_g06_alert_emp    ON g06_progression_alerts(employee_id);
CREATE INDEX ix_g06_alert_type   ON g06_progression_alerts(alert_type);
CREATE INDEX ix_g06_alert_status ON g06_progression_alerts(status);
CREATE INDEX ix_g06_alert_due    ON g06_progression_alerts(due_date);

-- 5.2.24 increment_monitor (mirror of G10; not authoritative) -------------------------
CREATE TABLE g06_increment_monitor (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- increment_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    increment_type              g06_increment_type NOT NULL,
    due_date                    date NOT NULL,
    g10_increment_ref           varchar(60),                                   -- G10 system-of-record ref (mirror key)
    status                      g06_increment_status NOT NULL DEFAULT 'DUE',   -- mirrored from G10
    withheld_reason             text,
    released_effective_date     date,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_incr UNIQUE (employee_id, increment_type, due_date)
);
CREATE INDEX ix_g06_incr_tenant ON g06_increment_monitor(tenant_id);
CREATE INDEX ix_g06_incr_entity ON g06_increment_monitor(entity_id);
CREATE INDEX ix_g06_incr_emp    ON g06_increment_monitor(employee_id);
CREATE INDEX ix_g06_incr_g10    ON g06_increment_monitor(g10_increment_ref);
CREATE INDEX ix_g06_incr_status ON g06_increment_monitor(status);


-- =====================================================================================
-- SECTION 8 — CAREER-PATH & SUCCESSION (advisory; FR-PPP-014)
-- =====================================================================================

-- 5.2.19 career_paths -----------------------------------------------------------------
CREATE TABLE g06_career_paths (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- career_path_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    path_code                   varchar(40) NOT NULL,
    path_name                   varchar(120) NOT NULL,
    cadre_id                    uuid REFERENCES cadres(id) ON DELETE RESTRICT,
    description                 text,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_path_code UNIQUE (tenant_id, path_code)
);
CREATE INDEX ix_g06_path_tenant ON g06_career_paths(tenant_id);
CREATE INDEX ix_g06_path_entity ON g06_career_paths(entity_id);
CREATE INDEX ix_g06_path_cadre  ON g06_career_paths(cadre_id);

-- 5.2.20 career_path_stages -----------------------------------------------------------
CREATE TABLE g06_career_path_stages (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- stage_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    career_path_id              uuid NOT NULL REFERENCES g06_career_paths(id) ON DELETE RESTRICT,
    stage_order                 integer NOT NULL,
    designation_id              uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    typical_years_in_stage      numeric(4,1),
    required_competencies       jsonb,                                         -- reference to G07 competencies
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_stage_order UNIQUE (career_path_id, stage_order)
);
CREATE INDEX ix_g06_stage_tenant ON g06_career_path_stages(tenant_id);
CREATE INDEX ix_g06_stage_entity ON g06_career_path_stages(entity_id);
CREATE INDEX ix_g06_stage_path   ON g06_career_path_stages(career_path_id);
CREATE INDEX ix_g06_stage_des    ON g06_career_path_stages(designation_id);

-- 5.2.21 succession_plans -------------------------------------------------------------
CREATE TABLE g06_succession_plans (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- succession_plan_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    critical_position_designation_id uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    org_unit_id                 uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    incumbent_employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
    risk_of_loss                g06_succession_risk NOT NULL DEFAULT 'LOW',
    status                      g06_succession_status NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_succ_tenant ON g06_succession_plans(tenant_id);
CREATE INDEX ix_g06_succ_entity ON g06_succession_plans(entity_id);
CREATE INDEX ix_g06_succ_des    ON g06_succession_plans(critical_position_designation_id);
CREATE INDEX ix_g06_succ_org    ON g06_succession_plans(org_unit_id);
CREATE INDEX ix_g06_succ_incum  ON g06_succession_plans(incumbent_employee_id);
CREATE INDEX ix_g06_succ_status ON g06_succession_plans(status);

-- 5.2.22 succession_candidates --------------------------------------------------------
CREATE TABLE g06_succession_candidates (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- succession_candidate_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    succession_plan_id          uuid NOT NULL REFERENCES g06_succession_plans(id) ON DELETE RESTRICT,
    candidate_employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    readiness                   g06_succession_readiness NOT NULL,
    bench_rank                  integer,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_succ_cand UNIQUE (succession_plan_id, candidate_employee_id)
);
CREATE INDEX ix_g06_sc_tenant ON g06_succession_candidates(tenant_id);
CREATE INDEX ix_g06_sc_entity ON g06_succession_candidates(entity_id);
CREATE INDEX ix_g06_sc_plan   ON g06_succession_candidates(succession_plan_id);
CREATE INDEX ix_g06_sc_emp    ON g06_succession_candidates(candidate_employee_id);


-- =====================================================================================
-- SECTION 9 — TABLE COMMENTS (domain PK names & ownership)
-- =====================================================================================
COMMENT ON COLUMN g06_seniority_lists.id            IS 'BRD seniority_list_id';
COMMENT ON COLUMN g06_seniority_entries.id          IS 'BRD seniority_entry_id';
COMMENT ON COLUMN g06_seniority_objections.id       IS 'BRD objection_id';
COMMENT ON COLUMN g06_eligibility_rules.id          IS 'BRD eligibility_rule_id';
COMMENT ON COLUMN g06_eligibility_assessments.id    IS 'BRD assessment_id; APAR/disc/category cols are P02 field-masked PII';
COMMENT ON COLUMN g06_promotion_cases.id            IS 'BRD promotion_case_id';
COMMENT ON COLUMN g06_promotion_panels.id           IS 'BRD panel_id';
COMMENT ON COLUMN g06_promotion_panel_members.id    IS 'BRD panel_member_id';
COMMENT ON COLUMN g06_promotion_candidates.id       IS 'BRD candidate_id';
COMMENT ON COLUMN g06_dpc_proceedings.id            IS 'BRD proceeding_id';
COMMENT ON COLUMN g06_promotion_orders.id           IS 'BRD order_id; sr_event_id = G12 establishment event (PROMOTION)';
COMMENT ON COLUMN g06_probation_records.id          IS 'BRD probation_id';
COMMENT ON COLUMN g06_officiating_arrangements.id   IS 'BRD arrangement_id';
COMMENT ON COLUMN g06_financial_upgradations.id     IS 'BRD upgradation_id; pay event handed to G10, SR establishment event MACP';
COMMENT ON COLUMN g06_macp_assessments.id           IS 'BRD macp_assessment_id';
COMMENT ON COLUMN g06_reservation_rosters.id        IS 'BRD roster_id';
COMMENT ON COLUMN g06_roster_points.id              IS 'BRD roster_point_id; adjusted_against_category = own-merit migration';
COMMENT ON COLUMN g06_promotion_postings.id         IS 'BRD posting_id; g05_movement_id references G05 (no FK, sibling module)';
COMMENT ON COLUMN g06_career_paths.id               IS 'BRD career_path_id (advisory)';
COMMENT ON COLUMN g06_career_path_stages.id         IS 'BRD stage_id (advisory); required_competencies reference G07';
COMMENT ON COLUMN g06_succession_plans.id           IS 'BRD succession_plan_id (advisory)';
COMMENT ON COLUMN g06_succession_candidates.id      IS 'BRD succession_candidate_id (advisory)';
COMMENT ON COLUMN g06_progression_alerts.id         IS 'BRD alert_id; generated by JOB-G06-PROGRESSION, dispatched via X.2';
COMMENT ON COLUMN g06_increment_monitor.id          IS 'BRD increment_id; mirror of G10 (g10_increment_ref), G10 is system-of-record';
COMMENT ON COLUMN g06_sanctioned_posts.id           IS 'BRD sanctioned_post_id (GAP gov-specific)';
COMMENT ON COLUMN g06_qualifying_service_ledger.id  IS 'BRD qsl_snapshot_id; supersede-only lineage, soft-delete only';
COMMENT ON COLUMN g06_service_exclusion_rules.id    IS 'BRD service_exclusion_rule_id';
COMMENT ON COLUMN g06_seniority_quota_rules.id      IS 'BRD quota_rule_id (GAP gov-specific)';
COMMENT ON COLUMN g06_legal_case_links.id           IS 'BRD legal_case_link_id (GAP gov-specific)';
COMMENT ON COLUMN g06_correction_events.id          IS 'BRD correction_event_id; cascade via JOB-G06-CORRECTION-CASCADE';
COMMENT ON COLUMN g06_exam_results.id               IS 'BRD exam_result_id';
COMMENT ON COLUMN g06_promotion_refusals.id         IS 'BRD refusal_id';


-- =====================================================================================
-- SECTION 10 — DEFERRED FOREIGN KEYS (forward / circular references)
-- =====================================================================================
-- Resolves the legal_case_links <-> correction_events cycle and the back-references from
-- seniority_lists / promotion_orders to correction_events (created later in this file).

ALTER TABLE g06_seniority_lists
    ADD CONSTRAINT fk_g06_sl_correction_event
    FOREIGN KEY (correction_event_id) REFERENCES g06_correction_events(id) ON DELETE SET NULL;

ALTER TABLE g06_promotion_orders
    ADD CONSTRAINT fk_g06_ord_correction_event
    FOREIGN KEY (correction_event_id) REFERENCES g06_correction_events(id) ON DELETE SET NULL;

ALTER TABLE g06_legal_case_links
    ADD CONSTRAINT fk_g06_lcl_correction_event
    FOREIGN KEY (triggers_correction_event_id) REFERENCES g06_correction_events(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION 11 — ROW-LEVEL SECURITY (tenant_isolation; CONVENTIONS §6)
-- =====================================================================================
DO $$
DECLARE
    t text;
    g06_tables text[] := ARRAY[
        'g06_service_exclusion_rules','g06_seniority_quota_rules','g06_eligibility_rules',
        'g06_sanctioned_posts','g06_qualifying_service_ledger','g06_exam_results',
        'g06_reservation_rosters','g06_seniority_lists','g06_seniority_entries',
        'g06_seniority_objections','g06_promotion_cases','g06_roster_points',
        'g06_eligibility_assessments','g06_promotion_panels','g06_promotion_panel_members',
        'g06_promotion_candidates','g06_dpc_proceedings','g06_macp_assessments',
        'g06_promotion_orders','g06_probation_records','g06_officiating_arrangements',
        'g06_financial_upgradations','g06_promotion_postings','g06_promotion_refusals',
        'g06_legal_case_links','g06_correction_events','g06_progression_alerts',
        'g06_increment_monitor','g06_career_paths','g06_career_path_stages',
        'g06_succession_plans','g06_succession_candidates'
    ];
BEGIN
    FOREACH t IN ARRAY g06_tables LOOP
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
-- SECTION 12 — SAMPLE SEED ROWS (2-3 per key table; references core 00 seed UUIDs)
-- =====================================================================================
-- Uses the core seed rows: tenant 1111..1111, entity 2222..2201, cadre 4444..4401,
-- designation 7777..7701 (used for from/to grade refs in this minimal sample),
-- pay_scale 6666..6601, org_units 3333..3301/3302, employees 9999..9901/9902,
-- SR event aaaa..aa02 (a G06 PROMOTION event). GUCs set so RLS WITH CHECK passes.

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- service_exclusion_rules
INSERT INTO g06_service_exclusion_rules (id, tenant_id, entity_id, rule_code, suspension_treatment, effective_from, is_active)
VALUES
 ('06000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SER-STD-7CPC','INCLUDE_IF_EXONERATED','2016-01-01',true),
 ('06000001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SER-DEPUT','PER_OUTCOME','2016-01-01',true);

-- seniority_quota_rules
INSERT INTO g06_seniority_quota_rules (id, tenant_id, entity_id, rule_code, cadre_id, grade_designation_id, dr_quota_ratio, promotee_quota_ratio, ldce_quota_ratio, rotation_method, rotation_start_slot, policy_reference, is_active)
VALUES
 ('06000002-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','QR-ADMIN-DCPR','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701',1,1,0,'ROTA_QUOTA','DR_FIRST','N.R. Parmar compliance',true);

-- eligibility_rules
INSERT INTO g06_eligibility_rules (id, tenant_id, entity_id, rule_code, from_grade_id, to_grade_id, channel, min_qualifying_service_years, service_exclusion_rule_id, apar_lookback_years, apar_benchmark, apar_min_count_meeting_benchmark, is_active)
VALUES
 ('06000003-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ELG-DC-PROMO','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701','PROMOTION',5.0,'06000001-0000-0000-0000-000000000001',5,'VERY_GOOD',4,true),
 ('06000003-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ELG-DC-MACP','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701','MACP',10.0,'06000001-0000-0000-0000-000000000001',3,'GOOD',1,true);

-- sanctioned_posts
INSERT INTO g06_sanctioned_posts (id, tenant_id, entity_id, cadre_id, grade_designation_id, org_unit_id, sanction_order_ref, sanctioned_strength, filled_count, dr_quota_pct, promotion_quota_pct, ldce_quota_pct, current_vacancies, as_on_date, status)
VALUES
 ('06000004-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','33333333-3333-3333-3333-333333333301','REV/SANCTION/2025/14',60,48,33.00,67.00,0.00,12,'2026-01-01','ACTIVE'),
 ('06000004-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','33333333-3333-3333-3333-333333333302','REV/SANCTION/2025/15',20,15,50.00,50.00,0.00,5,'2026-01-01','ACTIVE');

-- qualifying_service_ledger
INSERT INTO g06_qualifying_service_ledger (id, tenant_id, entity_id, employee_id, grade_designation_id, as_of_date, gross_service_years, total_exclusion_days, net_qualifying_years, exclusion_breakdown_json, service_exclusion_rule_id, computed_by_version, is_current, computed_at)
VALUES
 ('06000005-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','77777777-7777-7777-7777-777777777701','2026-01-01',13.553,0,13.553,'{"items":[]}','06000001-0000-0000-0000-000000000001','QSL-1.0',true, now()),
 ('06000005-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','77777777-7777-7777-7777-777777777701','2026-03-01',10.211,75,10.006,'{"items":[{"type":"EOL","days":75,"rule":"SER-STD-7CPC"}]}','06000001-0000-0000-0000-000000000001','QSL-1.0',true, now());

-- seniority_lists
INSERT INTO g06_seniority_lists (id, tenant_id, entity_id, list_no, cadre_id, grade_designation_id, org_unit_scope_id, as_on_date, list_type, status, is_multi_stream, quota_rule_id)
VALUES
 ('06000006-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SEN/DC/2026/01','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','33333333-3333-3333-3333-333333333301','2026-01-01','TENTATIVE','PUBLISHED_TENTATIVE',true,'06000002-0000-0000-0000-000000000001');

-- seniority_entries
INSERT INTO g06_seniority_entries (id, tenant_id, entity_id, seniority_list_id, employee_id, rank_position, recruitment_stream, quota_slot_label, reckoning_basis, entry_into_grade_date, reservation_category)
VALUES
 ('06000007-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','06000006-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901',1,'DIRECT','DR-1','DOJ_GRADE','2008-07-14','GEN'),
 ('06000007-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','06000006-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902',2,'PROMOTEE','PR-1','REGULARISATION_DATE','1996-06-01','OBC');

-- promotion_cases
INSERT INTO g06_promotion_cases (id, tenant_id, entity_id, case_no, from_grade_id, to_grade_id, cadre_id, org_unit_scope_id, sanctioned_post_id, vacancy_count, vacancy_year, promotion_mode, eligibility_rule_id, crucial_date, status)
VALUES
 ('06000008-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PROM/2026/DC/01','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701','44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333301','06000004-0000-0000-0000-000000000001',8,2026,'SENIORITY_CUM_FITNESS','06000003-0000-0000-0000-000000000001','2026-01-01','ELIGIBILITY_DONE');

-- eligibility_assessments
INSERT INTO g06_eligibility_assessments (id, tenant_id, entity_id, promotion_case_id, employee_id, eligibility_rule_id, qsl_snapshot_id, qualifying_service_years, apar_pass, apar_communicated, apar_representation_status, apar_usable, vigilance_status, disciplinary_status, qualification_met, obc_creamy_layer_status, overall_result, assessed_at)
VALUES
 ('06000009-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','06000008-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','06000003-0000-0000-0000-000000000001','06000005-0000-0000-0000-000000000001',13.55,true,true,'NOT_APPLICABLE',true,'CLEAR','CLEAR',true,'NA','ELIGIBLE', now()),
 ('06000009-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','06000008-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','06000003-0000-0000-0000-000000000001','06000005-0000-0000-0000-000000000002',10.01,true,true,'DISPOSED',true,'SEALED_COVER','CHARGE_PENDING',true,'NON_CREAMY','SEALED_COVER', now());

-- reservation_rosters + roster_points
INSERT INTO g06_reservation_rosters (id, tenant_id, entity_id, roster_no, cadre_id, grade_designation_id, roster_type, cycle_size, policy_version, consequential_seniority_mode, status)
VALUES
 ('0600000a-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ROS/DC/2026','44444444-4444-4444-4444-444444444401','77777777-7777-7777-7777-777777777701','PROMOTION_RESERVATION',100,'POL-2024.1','CATCH_UP','ACTIVE');

INSERT INTO g06_roster_points (id, tenant_id, entity_id, roster_id, point_number, reserved_for, status, filled_by_employee_id, adjusted_against_category, filled_in_case_id)
VALUES
 ('0600000b-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','0600000a-0000-0000-0000-000000000001',1,'GEN','FILLED','99999999-9999-9999-9999-999999999901','GEN','06000008-0000-0000-0000-000000000001'),
 ('0600000b-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','0600000a-0000-0000-0000-000000000001',8,'OBC','FILLED','99999999-9999-9999-9999-999999999902','GEN','06000008-0000-0000-0000-000000000001'),
 ('0600000b-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','0600000a-0000-0000-0000-000000000001',7,'SC','CARRIED_FORWARD',NULL,NULL,NULL);

-- promotion_orders (one EFFECTED -> links the G06 PROMOTION SR event seeded in core)
INSERT INTO g06_promotion_orders (id, tenant_id, entity_id, order_no, promotion_case_id, employee_id, order_type, from_designation_id, to_designation_id, from_pay_scale_id, to_pay_scale_id, effective_date, acceptance_status, status, sr_event_id)
VALUES
 ('0600000c-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REV/PROMO/2026/01','06000008-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','REGULAR_PROMOTION','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701','66666666-6666-6666-6666-666666666601','66666666-6666-6666-6666-666666666601','2026-04-01','ACCEPTED','EFFECTED','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02'),
 ('0600000c-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REV/PROMO/2026/02','06000008-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','REGULAR_PROMOTION','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701','66666666-6666-6666-6666-666666666601','66666666-6666-6666-6666-666666666601','2026-04-01','DECLINED','ISSUED',NULL);

-- promotion_refusals (on the DECLINED order)
INSERT INTO g06_promotion_refusals (id, tenant_id, entity_id, order_id, employee_id, refusal_date, debarment_months, debarment_until, macp_clock_effect, next_consideration_after, status)
VALUES
 ('0600000d-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','0600000c-0000-0000-0000-000000000002','99999999-9999-9999-9999-999999999902','2026-04-10',12,'2027-04-09','FORFEIT_NEXT','2027-04-10','ACTIVE');

-- financial_upgradations
INSERT INTO g06_financial_upgradations (id, tenant_id, entity_id, upgradation_no, employee_id, scheme, upgrade_level, qsl_snapshot_id, qualifying_years_completed, regular_promotions_availed, due_date, granted_pay_level_id, effective_date, status)
VALUES
 ('0600000e-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MACP/2026/01','99999999-9999-9999-9999-999999999902','MACP','FIRST','06000005-0000-0000-0000-000000000002',10.00,0,'2026-03-01','66666666-6666-6666-6666-666666666601','2026-03-01','EFFECTED');

-- legal_case_links + correction_events (cycle exercised)
INSERT INTO g06_legal_case_links (id, tenant_id, entity_id, link_no, linked_entity_type, linked_entity_id, forum, case_reference, interim_stay, subject_to_outcome, status)
VALUES
 ('0600000f-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LCL/2026/01','SENIORITY_LIST','06000006-0000-0000-0000-000000000001','HIGH_COURT','WP(C) 4567/2026',true,false,'INTERIM_STAYED'),
 ('0600000f-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LCL/2026/02','PROMOTION_ORDER','0600000c-0000-0000-0000-000000000001','CAT','OA 123/2026',false,true,'PENDING');

INSERT INTO g06_correction_events (id, tenant_id, entity_id, correction_no, reason_class, trigger_legal_case_link_id, affected_entity_type, affected_entity_id, recompute_scope_json, cascade_status, pay_anomaly_flag)
VALUES
 ('06000010-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','COR/2026/001','COURT_ORDER','0600000f-0000-0000-0000-000000000001','SENIORITY_LIST','06000006-0000-0000-0000-000000000001','{"lists":["06000006-0000-0000-0000-000000000001"]}','COMPLETED',true);

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 06-G06-promotion-posting-progression.sql
-- =====================================================================================
