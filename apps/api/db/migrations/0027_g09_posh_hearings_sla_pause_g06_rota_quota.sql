-- PH-15F migration 0027: G09 POSH/ICC route + personal hearings + SLA pause ledger, and
-- G06 multi-stream rota-quota seniority construction — faithful subsets of
-- docs/data-model/09-G09-disciplinary-punishment.sql (E9 inquiry_appointments ICC roles,
-- E29 personal_hearings, E28 sla_pause_events) and
-- docs/data-model/06-G06-promotion-posting-progression.sql (§5.2.28 seniority_quota_rules,
-- §5.2.2 seniority-entry stream/slot fields).
-- NOTE: disciplinary cases and combined seniority lists are service-layer entities (same
--       convention as migrations 0012/0013), so case/list references are plain text columns
--       validated in the service layer.

-- SECTION 1 — ENUM TYPES (UPPER_SNAKE values, CONVENTIONS §4)










-- FR-G09-024 AC-4: pause/resume land on the hash-chained case timeline.



-- SECTION 2 — E9 inquiry_appointments ICC subset (FR-G09-023: composition evidence).
-- The composition validator (presiding senior woman + >=1 external member + >=half women)
-- runs at constitution time; a breach throws ERR-G09-ICC-PROCEDURE-REQUIRED and inserts nothing.
CREATE TABLE g09_inquiry_appointments (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    role_type                text NOT NULL,
    officer_id               text,                                 -- internal member
    external_name            varchar(160),                        -- external NGO/expert member
    is_external_member       boolean NOT NULL DEFAULT false,
    is_woman                 boolean NOT NULL DEFAULT false,
    is_senior_level          boolean NOT NULL DEFAULT false,
    appointed_by             text NOT NULL,
    appointed_date           date NOT NULL,
    status                   text NOT NULL DEFAULT 'ACTIVE',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g09_icc_member CHECK (
        (officer_id IS NOT NULL AND external_name IS NULL)
        OR (officer_id IS NULL AND external_name IS NOT NULL)
    ),
    CONSTRAINT ck_g09_icc_external CHECK (
        (is_external_member = true AND external_name IS NOT NULL)
        OR (is_external_member = false AND officer_id IS NOT NULL)
    )
);
CREATE INDEX ix_g09_icc_appointments_tenant ON g09_inquiry_appointments(tenant_id);
CREATE INDEX ix_g09_icc_appointments_case   ON g09_inquiry_appointments(case_id);
CREATE INDEX ix_g09_icc_appointments_role   ON g09_inquiry_appointments(role_type);

-- SECTION 3 — E29 personal_hearings (FR-G09-025/DI-29: request -> grant/deny(reason) -> minutes).
CREATE TABLE g09_personal_hearings (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    stage                    text NOT NULL,
    requested                boolean NOT NULL DEFAULT false,
    requested_on             date NOT NULL,
    status                   text NOT NULL DEFAULT 'REQUESTED',
    granted                  boolean NOT NULL DEFAULT false,
    denial_reason            text,                                 -- DI-29: mandatory when denied
    scheduled_date           timestamptz,
    held_date                timestamptz,
    presided_by              text,
    minutes_text             text,                                 -- BR-2: immutable once finalised
    show_cause_notice_id     text REFERENCES g09_show_cause_notices(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    -- DI-29 in the schema itself: a DENIED hearing must carry a recorded denial_reason.
    CONSTRAINT ck_g09_hearing_denial_reason CHECK (status <> 'DENIED' OR denial_reason IS NOT NULL)
);
CREATE INDEX ix_g09_personal_hearings_tenant ON g09_personal_hearings(tenant_id);
CREATE INDEX ix_g09_personal_hearings_case   ON g09_personal_hearings(case_id);
CREATE INDEX ix_g09_personal_hearings_stage  ON g09_personal_hearings(stage);

-- FR-G09-025 AC-4: the referencing show-cause carries personal_hearing_id.
ALTER TABLE g09_show_cause_notices
    ADD COLUMN personal_hearing_id text REFERENCES g09_personal_hearings(id) ON DELETE SET NULL;

-- SECTION 4 — E28 sla_pause_events (FR-G09-024/DI-18): APPEND-ONLY pause/resume ledger.
-- CONVENTIONS §3 / BR-2: only created_at/created_by lineage; the resume is a one-shot
-- resumed_at field write on the open row — rows are never updated otherwise nor deleted.
CREATE TABLE g09_sla_pause_events (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    stage                    varchar(40) NOT NULL,
    reason                   text NOT NULL,
    paused_from              timestamptz NOT NULL,
    resumed_at               timestamptz,                          -- null while paused (set once)
    paused_by                text,
    source_ref_id            text,                                 -- originating stay/remit/consultation/criminal ref
    recompute_applied        boolean NOT NULL DEFAULT false,       -- AC-3: set true when targets recomputed
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    CONSTRAINT ck_g09_sla_pause_window CHECK (resumed_at IS NULL OR resumed_at >= paused_from)
);
CREATE INDEX ix_g09_sla_pause_events_tenant ON g09_sla_pause_events(tenant_id);
CREATE INDEX ix_g09_sla_pause_events_case   ON g09_sla_pause_events(case_id);
CREATE INDEX ix_g09_sla_pause_events_reason ON g09_sla_pause_events(reason);
-- At most ONE open pause per case+stage (resume targets exactly the open row).
CREATE UNIQUE INDEX uq_g09_sla_pause_open ON g09_sla_pause_events(tenant_id, case_id, stage) WHERE resumed_at IS NULL;

-- SECTION 5 — §5.2.28 g06_seniority_quota_rules (FR-PPP-020 AC-1: ratios + rotation config).
CREATE TABLE g06_seniority_quota_rules (
    id                           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                    text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                    text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                    varchar(40) NOT NULL,
    cadre_id                     text NOT NULL,
    grade_designation_id         text NOT NULL,
    dr_quota_ratio               integer NOT NULL,
    promotee_quota_ratio         integer NOT NULL,
    ldce_quota_ratio             integer NOT NULL DEFAULT 0,
    rotation_method              text NOT NULL,
    rotation_start_slot          text NOT NULL DEFAULT 'DR_FIRST',
    unfilled_quota_carry_forward boolean NOT NULL DEFAULT true,
    policy_reference             varchar(120),
    is_active                    boolean NOT NULL DEFAULT true,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   text,
    updated_by                   text,
    is_deleted                   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_sqr_code UNIQUE (tenant_id, rule_code),
    -- QUOTA_RULE_INVALID guard restated in the schema: non-negative ratios, at least one positive.
    CONSTRAINT ck_g06_sqr_ratios CHECK (
        dr_quota_ratio >= 0 AND promotee_quota_ratio >= 0 AND ldce_quota_ratio >= 0
        AND dr_quota_ratio + promotee_quota_ratio + ldce_quota_ratio >= 1
    )
);
CREATE INDEX ix_g06_sqr_tenant ON g06_seniority_quota_rules(tenant_id);
CREATE INDEX ix_g06_sqr_cadre  ON g06_seniority_quota_rules(cadre_id);
CREATE INDEX ix_g06_sqr_grade  ON g06_seniority_quota_rules(grade_designation_id);

-- SECTION 6 — combined construction run + entries (quota_slot_label, rotation_cycle_no) + trace.
CREATE TABLE g06_combined_seniority_constructions (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    quota_rule_id            text NOT NULL REFERENCES g06_seniority_quota_rules(id) ON DELETE RESTRICT,
    cadre_id                 text NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g06_csc_tenant ON g06_combined_seniority_constructions(tenant_id);
CREATE INDEX ix_g06_csc_rule   ON g06_combined_seniority_constructions(quota_rule_id);

-- §5.2.2 stream/slot fields: each entry records recruitment_stream, quota_slot_label, rotation_cycle_no.
CREATE TABLE g06_combined_seniority_entries (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    construction_id          text NOT NULL REFERENCES g06_combined_seniority_constructions(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL,
    rank_position            integer NOT NULL,
    -- STREAM_TAG_MISSING guard: the stream tag is NOT NULL by construction.
    recruitment_stream       text NOT NULL,
    quota_slot_label         varchar(20) NOT NULL,
    rotation_cycle_no        integer NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    CONSTRAINT uq_g06_cse_rank UNIQUE (construction_id, rank_position),
    CONSTRAINT uq_g06_cse_slot UNIQUE (construction_id, quota_slot_label)
);
CREATE INDEX ix_g06_cse_tenant       ON g06_combined_seniority_entries(tenant_id);
CREATE INDEX ix_g06_cse_construction ON g06_combined_seniority_entries(construction_id);

-- Rotation trace: which slot each cycle issued, and carry-forward of unfilled slots (AC-3: no silent loss).
CREATE TABLE g06_rotation_trace_slots (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    construction_id          text NOT NULL REFERENCES g06_combined_seniority_constructions(id) ON DELETE RESTRICT,
    cycle_no                 integer NOT NULL,
    slot_label               varchar(20) NOT NULL,
    recruitment_stream       text NOT NULL,
    filled_by_employee_id    text,
    carried_forward          boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    CONSTRAINT uq_g06_rts_slot UNIQUE (construction_id, slot_label)
);
CREATE INDEX ix_g06_rts_tenant       ON g06_rotation_trace_slots(tenant_id);
CREATE INDEX ix_g06_rts_construction ON g06_rotation_trace_slots(construction_id);
