-- PH-08D migration 0012: G08 APAR BRD-depth entities — faithful subset of
-- docs/data-model/08-G08-performance-appraisal.sql
-- Tables: g08_appraisal_cycles (E1: representation_window_days VAL-G08-REPWINDOW,
--         min_supervision_months VAL-G08-SUPV), g08_appraisal_templates (E2: weightage_policy),
--         g08_rating_scales (E3), g08_goals (E5: weightage VAL-WEIGHTAGE/WSUM),
--         g08_form_goal_snapshots (E20: APPEND-ONLY snapshot-on-lock),
--         g08_apar_disclosure_log (append-only disclosure ledger),
--         g08_representations (E13: window enforcement, ERR-G08-REPWINDOW),
--         g08_appraisal_report_periods (E19: multi-RO part-period; No-Report below threshold;
--         is_escalated_author for SLA authoring-right transfer R9/FR-G08-19).
-- NOTE: apar forms are not yet table-backed (service-layer entities), so form references are
--       plain text columns validated in the service layer.

-- SECTION 1 — ENUM TYPES (g08_ prefix; UPPER_SNAKE values, CONVENTIONS §4)









-- SECTION 2 — E3 rating_scales
CREATE TABLE g08_rating_scales (
    id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         text REFERENCES entities(id) ON DELETE RESTRICT,
    scale_code        varchar(40) NOT NULL,
    name              varchar(120) NOT NULL,
    min_value         numeric(4,2) NOT NULL,
    max_value         numeric(4,2) NOT NULL,
    benchmark_grade   numeric(4,2) NOT NULL,
    adverse_threshold numeric(4,2) NOT NULL,
    status            text NOT NULL DEFAULT 'ACTIVE',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g08_rating_scales_code UNIQUE (tenant_id, scale_code),
    CONSTRAINT ck_g08_rating_scales_bounds CHECK (max_value > min_value
                                                  AND benchmark_grade BETWEEN min_value AND max_value
                                                  AND adverse_threshold BETWEEN min_value AND max_value)
);
CREATE INDEX ix_g08_rating_scales_tenant ON g08_rating_scales(tenant_id);

-- SECTION 3 — E2 appraisal_templates (weightage_policy R21: VAL-WEIGHTAGE/WSUM)
CREATE TABLE g08_appraisal_templates (
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    template_code    varchar(40) NOT NULL,
    name             varchar(160) NOT NULL,
    version          integer NOT NULL DEFAULT 1,
    weightage_policy jsonb NOT NULL,  -- {performance_sum:100, goal_split_pct, competency_split_pct, development_in_sum:false}
    status           text NOT NULL DEFAULT 'PUBLISHED',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g08_appraisal_templates_code UNIQUE (tenant_id, template_code, version)
);
CREATE INDEX ix_g08_appraisal_templates_tenant ON g08_appraisal_templates(tenant_id);

-- SECTION 4 — E1 appraisal_cycles (representation window + No-Report threshold)
CREATE TABLE g08_appraisal_cycles (
    id                         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                  text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                  text REFERENCES entities(id) ON DELETE RESTRICT,
    cycle_code                 varchar(40) NOT NULL,
    name                       varchar(160) NOT NULL,
    fiscal_year                varchar(9) NOT NULL,
    appraisal_period_start     date NOT NULL,
    appraisal_period_end       date NOT NULL,
    template_id                text NOT NULL REFERENCES g08_appraisal_templates(id) ON DELETE RESTRICT,
    rating_scale_id            text NOT NULL REFERENCES g08_rating_scales(id) ON DELETE RESTRICT,
    representation_window_days integer NOT NULL DEFAULT 30,   -- VAL-G08-REPWINDOW
    min_supervision_months     numeric(4,1) NOT NULL DEFAULT 3.0,  -- VAL-G08-SUPV
    status                     text NOT NULL DEFAULT 'DRAFT',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 text,
    updated_by                 text,
    is_deleted                 boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g08_appraisal_cycles_code UNIQUE (tenant_id, cycle_code),
    CONSTRAINT ck_g08_appraisal_cycles_period CHECK (appraisal_period_end >= appraisal_period_start),
    CONSTRAINT ck_g08_appraisal_cycles_repwindow CHECK (representation_window_days >= 1),
    CONSTRAINT ck_g08_appraisal_cycles_supv CHECK (min_supervision_months >= 0)
);
CREATE INDEX ix_g08_appraisal_cycles_tenant   ON g08_appraisal_cycles(tenant_id);
CREATE INDEX ix_g08_appraisal_cycles_template ON g08_appraisal_cycles(template_id);
CREATE INDEX ix_g08_appraisal_cycles_scale    ON g08_appraisal_cycles(rating_scale_id);

-- SECTION 5 — E5 goals (weightage governed by VAL-WEIGHTAGE/WSUM at lock)
CREATE TABLE g08_goals (
    id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id    text REFERENCES entities(id) ON DELETE RESTRICT,
    form_id      text NOT NULL,
    appraisee_id text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    goal_type    text NOT NULL,
    title        varchar(200) NOT NULL,
    weightage    numeric(5,2) NOT NULL DEFAULT 0,   -- VAL-WEIGHTAGE/WSUM
    snapshotted  boolean NOT NULL DEFAULT false,
    status       text NOT NULL DEFAULT 'DRAFT',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text,
    updated_by   text,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g08_goals_weightage CHECK (weightage >= 0)
);
CREATE INDEX ix_g08_goals_tenant    ON g08_goals(tenant_id);
CREATE INDEX ix_g08_goals_form      ON g08_goals(form_id);
CREATE INDEX ix_g08_goals_appraisee ON g08_goals(appraisee_id);

-- SECTION 6 — E20 form_goal_snapshots (APPEND-ONLY: INSERT only; no updated_at/is_deleted)
CREATE TABLE g08_form_goal_snapshots (
    id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id    text NOT NULL,
    goal_id    text NOT NULL REFERENCES g08_goals(id) ON DELETE RESTRICT,
    goal_type  text NOT NULL,
    title      varchar(200) NOT NULL,
    weightage  numeric(5,2) NOT NULL,
    locked_at  date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text,
    CONSTRAINT uq_g08_form_goal_snapshots UNIQUE (tenant_id, form_id, goal_id)
);
CREATE INDEX ix_g08_fgs_tenant ON g08_form_goal_snapshots(tenant_id);
CREATE INDEX ix_g08_fgs_form   ON g08_form_goal_snapshots(form_id);
COMMENT ON TABLE g08_form_goal_snapshots IS 'E20 immutable snapshot-on-lock; the grade roll-up reads this, never live goals. Append-only.';

-- SECTION 7 — apar_disclosure_log (append-only; monotonic seq_no per form)
CREATE TABLE g08_apar_disclosure_log (
    id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    form_id    text NOT NULL,
    seq_no     bigint NOT NULL,
    event_type text NOT NULL,
    actor_id   text NOT NULL,
    event_at   date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text,
    CONSTRAINT uq_g08_apar_disclosure_log_seq UNIQUE (tenant_id, form_id, seq_no)
);
CREATE INDEX ix_g08_disclosure_tenant ON g08_apar_disclosure_log(tenant_id);
CREATE INDEX ix_g08_disclosure_form   ON g08_apar_disclosure_log(form_id);
COMMENT ON TABLE g08_apar_disclosure_log IS 'G08 disclosure/custody domain ledger. Append-only (INSERT only).';

-- SECTION 8 — E13 representations (window enforcement: is_late/condoned; ERR-G08-REPWINDOW)
CREATE TABLE g08_representations (
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    rep_no           varchar(60) NOT NULL,
    form_id          text NOT NULL,
    appraisee_id     text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    grounds          text NOT NULL,
    filed_at         date NOT NULL,
    sla_due_at       date NOT NULL,        -- VAL-G08-REPWINDOW
    is_late          boolean NOT NULL DEFAULT false,
    condoned         boolean NOT NULL DEFAULT false,
    escalation_level integer NOT NULL DEFAULT 1,
    status           text NOT NULL DEFAULT 'FILED',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g08_representations_rep_no UNIQUE (tenant_id, rep_no),
    -- Fail-closed data guard: a late representation persists only when condoned.
    CONSTRAINT ck_g08_representations_window CHECK (NOT is_late OR condoned)
);
CREATE INDEX ix_g08_representations_tenant ON g08_representations(tenant_id);
CREATE INDEX ix_g08_representations_form   ON g08_representations(form_id);

-- SECTION 9 — E19 appraisal_report_periods (multi-RO part-period; No-Report; SLA escalation)
CREATE TABLE g08_appraisal_report_periods (
    id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id             text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             text REFERENCES entities(id) ON DELETE RESTRICT,
    form_id               text NOT NULL,
    sequence_no           integer NOT NULL,
    period_start          date NOT NULL,
    period_end            date NOT NULL,
    reporting_officer_id  text REFERENCES employees(id) ON DELETE SET NULL,  -- null if No-Report
    supervision_months    numeric(4,1) NOT NULL,       -- VAL-G08-SUPV
    part_period_grade     numeric(4,2),
    weight_in_aggregate   numeric(5,2),                -- supervision-weighted proportion
    no_report_certificate boolean NOT NULL DEFAULT false,
    no_report_reason      text,
    is_escalated_author   boolean NOT NULL DEFAULT false,  -- R9: authoring right transferred by SLA
    escalated_author_id   text REFERENCES employees(id) ON DELETE SET NULL,
    status                text NOT NULL DEFAULT 'DRAFT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text,
    updated_by            text,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g08_report_periods_seq UNIQUE (tenant_id, form_id, sequence_no),
    CONSTRAINT ck_g08_report_periods_dates CHECK (period_end >= period_start),
    CONSTRAINT ck_g08_report_periods_supv CHECK (supervision_months >= 0),
    -- A No-Report Certificate never carries a grade.
    CONSTRAINT ck_g08_report_periods_no_report CHECK (NOT no_report_certificate OR part_period_grade IS NULL)
);
CREATE INDEX ix_g08_report_periods_tenant ON g08_appraisal_report_periods(tenant_id);
CREATE INDEX ix_g08_report_periods_form   ON g08_appraisal_report_periods(form_id);
CREATE INDEX ix_g08_report_periods_ro     ON g08_appraisal_report_periods(reporting_officer_id);
