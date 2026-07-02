-- PH-08C migration 0010: G06 promotion BRD-depth entities — faithful subset of
-- docs/data-model/06-G06-promotion-posting-progression.sql
-- Tables: g06_reservation_rosters (5.2.16), g06_roster_points (5.2.17),
--         g06_promotion_refusals (5.2.32), g06_probation_records (5.2.12),
--         g06_legal_case_links (5.2.29)
-- BRD: FR-PPP-006 (reservation roster + own-merit migration, §5.6-6),
--      FR-PPP-019 (refusal consequences: debarment window + MACP-clock effect, §5.6-18),
--      §5.6-11 (probation lifecycle auto-created on order effect),
--      FR-PPP-017 (legal-case linkage; interim stay blocks effecting, §5.6-20 ENTITY_SUB_JUDICE).
-- NOTE: promotion cases/orders are not yet table-backed (service-layer entities), so
--       order/case references are plain uuid columns validated in the service layer.

-- SECTION 1 — ENUM TYPES (g06_ prefix; UPPER_SNAKE values, CONVENTIONS §4)
CREATE TYPE g06_roster_type          AS ENUM ('PROMOTION_RESERVATION','DIRECT_RECRUITMENT','POST_BASED','VACANCY_BASED');
CREATE TYPE g06_reservation_category AS ENUM ('GEN','SC','ST','OBC','EWS','PWBD');
CREATE TYPE g06_roster_point_status  AS ENUM ('VACANT','FILLED','CARRIED_FORWARD','DE_RESERVED','INTERCHANGED');
CREATE TYPE g06_consequential_mode   AS ENUM ('CONSEQUENTIAL','CATCH_UP');
CREATE TYPE g06_macp_clock_effect    AS ENUM ('NONE','STOP','FORFEIT_NEXT','RESET');
CREATE TYPE g06_refusal_status       AS ENUM ('ACTIVE','EXPIRED','WAIVED');
CREATE TYPE g06_probation_status     AS ENUM ('ON_PROBATION','EXTENDED','DECLARED_SATISFACTORY','REVERTED','DISCHARGED');
CREATE TYPE g06_legal_linked_entity  AS ENUM ('PROMOTION_CASE','PROMOTION_ORDER','SENIORITY_LIST','ROSTER','CANDIDATE');
CREATE TYPE g06_legal_forum          AS ENUM ('CAT','HIGH_COURT','SUPREME_COURT','TRIBUNAL_OTHER');
CREATE TYPE g06_legal_status         AS ENUM ('FILED','INTERIM_STAYED','PENDING','DISPOSED_FAVOURABLE','DISPOSED_ADVERSE');

-- SECTION 2 — 5.2.16 reservation_rosters (FR-006; Nagaraj enabling justification, impr. #15)
CREATE TABLE g06_reservation_rosters (
    id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                    uuid REFERENCES entities(id) ON DELETE RESTRICT,
    roster_no                    varchar(40) NOT NULL,
    cadre_id                     uuid NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id         uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    roster_type                  g06_roster_type NOT NULL,
    cycle_size                   integer NOT NULL,
    policy_version               varchar(20) NOT NULL,
    roster_applicable            boolean NOT NULL DEFAULT true,
    enabling_provision_ref       varchar(120),
    quantifiable_data_doc_id     uuid REFERENCES documents(id) ON DELETE SET NULL,
    consequential_seniority_mode g06_consequential_mode NOT NULL DEFAULT 'CATCH_UP',
    status                       g06_master_status NOT NULL DEFAULT 'ACTIVE',
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_by                   uuid,
    is_deleted                   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_roster_no UNIQUE (tenant_id, roster_no),
    CONSTRAINT ck_g06_roster_cycle CHECK (cycle_size > 0)
);
CREATE INDEX ix_g06_roster_tenant ON g06_reservation_rosters(tenant_id);
CREATE INDEX ix_g06_roster_entity ON g06_reservation_rosters(entity_id);
CREATE INDEX ix_g06_roster_cadre  ON g06_reservation_rosters(cadre_id);
CREATE INDEX ix_g06_roster_grade  ON g06_reservation_rosters(grade_designation_id);
CREATE INDEX ix_g06_roster_status ON g06_reservation_rosters(status);

-- SECTION 3 — 5.2.17 roster_points (own-merit migration: adjusted_against_category, §5.6-6)
CREATE TABLE g06_roster_points (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    roster_id                   uuid NOT NULL REFERENCES g06_reservation_rosters(id) ON DELETE RESTRICT,
    point_number                integer NOT NULL,
    reserved_for                g06_reservation_category NOT NULL,
    is_horizontal_pwbd          boolean NOT NULL DEFAULT false,
    status                      g06_roster_point_status NOT NULL DEFAULT 'VACANT',
    filled_by_employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
    adjusted_against_category   g06_reservation_category,   -- own-merit migration sets GEN (§5.6-6)
    filled_in_case_id           uuid,                        -- promotion case ref (service-layer entity)
    carry_forward_from_point_id uuid REFERENCES g06_roster_points(id) ON DELETE SET NULL,
    dereservation_authority_ref varchar(120),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_rp_point UNIQUE (roster_id, point_number),
    -- Fail-closed own-merit invariant: a FILLED point is always counted against a category.
    CONSTRAINT ck_g06_rp_filled CHECK (status <> 'FILLED' OR adjusted_against_category IS NOT NULL)
);
CREATE INDEX ix_g06_rp_tenant ON g06_roster_points(tenant_id);
CREATE INDEX ix_g06_rp_roster ON g06_roster_points(roster_id);
CREATE INDEX ix_g06_rp_emp    ON g06_roster_points(filled_by_employee_id);
CREATE INDEX ix_g06_rp_status ON g06_roster_points(status);

-- SECTION 4 — 5.2.32 promotion_refusals (debarment window + MACP-clock effect, §5.6-18)
CREATE TABLE g06_promotion_refusals (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                    uuid NOT NULL,               -- promotion order ref (service-layer entity)
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    refusal_date                date NOT NULL,
    refusal_reason              text,
    debarment_months            integer NOT NULL,
    debarment_until             date NOT NULL,               -- refusal_date + debarment_months
    macp_clock_effect           g06_macp_clock_effect NOT NULL,
    next_consideration_after    date,
    refusal_effect_applied      boolean NOT NULL DEFAULT false,
    status                      g06_refusal_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_refusal_debar CHECK (debarment_months >= 0),
    CONSTRAINT ck_g06_refusal_window CHECK (debarment_until >= refusal_date)
);
CREATE INDEX ix_g06_refusal_tenant ON g06_promotion_refusals(tenant_id);
CREATE INDEX ix_g06_refusal_emp    ON g06_promotion_refusals(employee_id);
CREATE INDEX ix_g06_refusal_status ON g06_promotion_refusals(status);
CREATE INDEX ix_g06_refusal_window ON g06_promotion_refusals(employee_id, debarment_until) WHERE status = 'ACTIVE';

-- SECTION 5 — 5.2.12 probation_records (auto-created on order effect; §5.6-11 arithmetic)
CREATE TABLE g06_probation_records (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                    uuid NOT NULL,               -- promotion order ref (service-layer entity)
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    probation_start             date NOT NULL,
    probation_months            integer NOT NULL,
    scheduled_end               date NOT NULL,               -- probation_start + probation_months (§5.6-11)
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
    CONSTRAINT ck_g06_prob_months CHECK (probation_months > 0),
    CONSTRAINT ck_g06_prob_end CHECK (scheduled_end > probation_start)
);
CREATE INDEX ix_g06_prob_tenant ON g06_probation_records(tenant_id);
CREATE INDEX ix_g06_prob_order  ON g06_probation_records(order_id);
CREATE INDEX ix_g06_prob_emp    ON g06_probation_records(employee_id);
CREATE INDEX ix_g06_prob_status ON g06_probation_records(status);

-- SECTION 6 — 5.2.29 legal_case_links (sub-judice guard: interim stay blocks effecting, §5.6-20)
CREATE TABLE g06_legal_case_links (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    link_no                     varchar(40) NOT NULL,
    linked_entity_type          g06_legal_linked_entity NOT NULL,
    linked_entity_id            uuid NOT NULL,               -- polymorphic; validated in service
    forum                       g06_legal_forum NOT NULL,
    case_reference              varchar(80) NOT NULL,
    petitioner                  varchar(160),
    interim_stay                boolean NOT NULL DEFAULT false,
    stay_from_date              date,
    stay_to_date                date,
    subject_to_outcome          boolean NOT NULL DEFAULT false,
    status                      g06_legal_status NOT NULL DEFAULT 'FILED',
    outcome_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_lcl_no UNIQUE (tenant_id, link_no)
);
CREATE INDEX ix_g06_lcl_tenant ON g06_legal_case_links(tenant_id);
CREATE INDEX ix_g06_lcl_linked ON g06_legal_case_links(linked_entity_type, linked_entity_id);
CREATE INDEX ix_g06_lcl_status ON g06_legal_case_links(status);
CREATE INDEX ix_g06_lcl_stay   ON g06_legal_case_links(interim_stay) WHERE interim_stay = true;
