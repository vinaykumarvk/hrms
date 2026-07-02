-- PH-10D migration 0021: G14 analytics engine — faithful subset of
-- docs/data-model/14-G14-dashboard-analytics.sql for the engine entities:
--   E02 source_data_contracts    (contracted read-only views the marts consume; FR-21),
--   E09 analytics_datamarts      (read-model mart DEFINITION/metadata bound to JOB-G14-MART-*;
--       NOT a fork of any owning-module table; FR-03),
--   E10 datamart_refresh_logs    (APPEND-ONLY refresh run ledger, one row per mart per run;
--       terminal failure -> JOB-FAIL -> MSG-SYS-JOBFAIL; FR-03 AC6),
--   E03 kpi_definitions          (governed, VERSIONED registry; DRAFT -> ACTIVE is an explicit
--       governed activation; at most one ACTIVE per kpi_code; FR-02),
--   E04 kpi_snapshots            (APPEND-ONLY BITEMPORAL value series: valid_time +
--       knowledge_time; restatement appends a superseding knowledge-version row and flags the
--       prior is_superseded — values never mutate; as-of-knowledge reads reproduce what was
--       known at T, else ERR-G14-ASOF-NA; FR-23),
--   E17 kpi_target_history       (effective-dated targets, VAL-EFFECTIVE),
--   E24 suppression_policies     (k-anonymity: min_cell_size_k default 5, complementary
--       suppression so totals cannot recover a hidden cell; ERR-G14-SMALL-CELL /
--       ERR-G14-COMP-SUPPRESS; FR-17),
--   E11 analytics_scope_policies (DECLARES P02 scope dimensions; maker (created_by) must
--       differ from checker (approved_by) to become ACTIVE -> ERR-G14-SCOPE-CHECKER; FR-04 AC7),
--   E16 analytics_access_log     (APPEND-ONLY partitioned read-access ledger; FR-04).
-- tenants/entities/users/workflow_instances live in 0001_platform_core.sql and are UNCHANGED.

-- SECTION 1 — ENUM TYPES (g14_ prefix; UPPER_SNAKE values, CONVENTIONS §4) -------------
CREATE TYPE g14_domain              AS ENUM ('WORKFORCE','LEAVE','ATTENDANCE','PAYROLL','TRAINING','APPRAISAL','DISCIPLINARY','TRANSFER','PROMOTION','PENSION','COMPLIANCE','SR');
CREATE TYPE g14_kpi_unit            AS ENUM ('COUNT','PERCENT','RATIO','CURRENCY','DAYS','SCORE','HOURS');
CREATE TYPE g14_grain               AS ENUM ('EMPLOYEE','ORG_UNIT','CADRE','PERIOD','ENTERPRISE');
CREATE TYPE g14_period              AS ENUM ('DAY','WEEK','MONTH','QUARTER','YEAR','ROLLING_12M');
CREATE TYPE g14_kpi_direction       AS ENUM ('HIGHER_BETTER','LOWER_BETTER','ON_TARGET');
CREATE TYPE g14_sensitivity         AS ENUM ('PUBLIC','INTERNAL','RESTRICTED');
CREATE TYPE g14_lifecycle_status    AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE g14_scope_type          AS ENUM ('ENTERPRISE','ORG_UNIT','CADRE','MANAGER');
CREATE TYPE g14_mart_type           AS ENUM ('FACT','DIMENSION','AGGREGATE','MATERIALIZED_VIEW','SEMANTIC');
CREATE TYPE g14_refresh_strategy    AS ENUM ('FULL','INCREMENTAL','CDC','ON_DEMAND');
CREATE TYPE g14_mart_health         AS ENUM ('HEALTHY','STALE','DEGRADED','FAILED');
CREATE TYPE g14_refresh_run_type    AS ENUM ('SCHEDULED','MANUAL','BACKFILL');
CREATE TYPE g14_refresh_status      AS ENUM ('RUNNING','SUCCESS','PARTIAL','FAILED');
CREATE TYPE g14_scope_policy_status AS ENUM ('DRAFT','PENDING_APPROVAL','ACTIVE','REJECTED','SUPERSEDED');
CREATE TYPE g14_cdc_mechanism       AS ENUM ('DEBEZIUM_CDC','BATCH','ON_DEMAND');
CREATE TYPE g14_contract_status     AS ENUM ('DRAFT','ACTIVE','DEPRECATED','BREACHED');
CREATE TYPE g14_target_kind         AS ENUM ('KPI_TARGET','ALERT_THRESHOLD');
CREATE TYPE g14_target_status       AS ENUM ('ACTIVE','SUPERSEDED');
CREATE TYPE g14_suppression_applies AS ENUM ('TILE','CHART','DRILLTHROUGH','EXPORT','ALL');
CREATE TYPE g14_access_action       AS ENUM ('VIEW_DASHBOARD','RUN_REPORT','EXPORT','DRILLTHROUGH','NL_QUERY','API_QUERY','VIEW_INDIVIDUAL_PREDICTION');
CREATE TYPE g14_access_target_type  AS ENUM ('DASHBOARD','WIDGET','REPORT','KPI','RECORD','PREDICTION');
CREATE TYPE g14_log_fidelity        AS ENUM ('FULL','SAMPLED');

-- SECTION 2 — E02 source_data_contracts (FR-21) -----------------------------------------
CREATE TABLE source_data_contracts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    source_module        text NOT NULL,                  -- e.g. 'G03'
    source_view          text NOT NULL,                  -- e.g. 'g03.v_leave_applications_v3'
    version              text NOT NULL,                  -- semantic version
    schema_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
    cdc_mechanism        g14_cdc_mechanism NOT NULL DEFAULT 'BATCH',
    breaking_change_policy text NOT NULL,
    status               g14_contract_status NOT NULL DEFAULT 'DRAFT',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_source_data_contracts UNIQUE (tenant_id, source_module, source_view, version)
);
CREATE INDEX ix_source_data_contracts_tenant ON source_data_contracts(tenant_id);
CREATE INDEX ix_source_data_contracts_module ON source_data_contracts(source_module);
CREATE INDEX ix_source_data_contracts_status ON source_data_contracts(status);

-- SECTION 3 — E09 analytics_datamarts (read-model DEFINITION/metadata, NOT a fork) -------
CREATE TABLE analytics_datamarts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    mart_code            text NOT NULL,                  -- MART_LEAVE / MART_ATTENDANCE / MART_APPRAISAL / MART_ESTABLISHMENT
    name                 text NOT NULL,
    mart_type            g14_mart_type NOT NULL,
    grain                text NOT NULL,
    source_modules       text[] NOT NULL,
    source_objects       text[] NOT NULL,                -- contracted read-only views (not raw tables)
    contract_id          uuid REFERENCES source_data_contracts(id) ON DELETE SET NULL,
    refresh_strategy     g14_refresh_strategy NOT NULL,
    refresh_job_id       text,                           -- JOB-G14-MART-* (X.1 logical ref)
    freshness_sla_minutes integer NOT NULL,
    last_refreshed_at    timestamptz,
    row_count            bigint,
    health_status        g14_mart_health NOT NULL DEFAULT 'HEALTHY',
    contains_pii         boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_analytics_datamarts_code UNIQUE (tenant_id, mart_code)
);
CREATE INDEX ix_analytics_datamarts_tenant   ON analytics_datamarts(tenant_id);
CREATE INDEX ix_analytics_datamarts_contract ON analytics_datamarts(contract_id);
CREATE INDEX ix_analytics_datamarts_health   ON analytics_datamarts(health_status);
COMMENT ON TABLE analytics_datamarts IS 'Read-model mart DEFINITION/metadata. source_objects are contracted views over G01-G13; this is NOT a copy of any owning-module table.';

-- SECTION 4 — E24 suppression_policies (FR-17, GAP gov-specific) --------------------------
CREATE TABLE suppression_policies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    name                 text NOT NULL,
    applies_to           g14_suppression_applies NOT NULL DEFAULT 'ALL',
    min_cell_size_k      integer NOT NULL DEFAULT 5,     -- cells with fewer than k members are suppressed
    complementary        boolean NOT NULL DEFAULT true,  -- suppress complements so totals can't recover a cell
    band_instead_of_hide boolean NOT NULL DEFAULT false,
    domains              text[],
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_suppression_k CHECK (min_cell_size_k > 0)
);
CREATE INDEX ix_suppression_policies_tenant ON suppression_policies(tenant_id);
CREATE INDEX ix_suppression_policies_active ON suppression_policies(is_active);

-- SECTION 5 — E03 kpi_definitions (versioned, explicit activation; FR-02) -----------------
CREATE TABLE kpi_definitions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_code             text NOT NULL,
    name                 text NOT NULL,
    description          text NOT NULL,
    domain               g14_domain NOT NULL,
    version              integer NOT NULL,               -- versioned definition
    definition_hash      text NOT NULL,                  -- SHA-256(expr+grain+unit+source); stamped on snapshots
    source_mart_id       uuid NOT NULL REFERENCES analytics_datamarts(id) ON DELETE RESTRICT,
    expression           text NOT NULL,                  -- safe whitelisted aggregation DSL
    unit                 g14_kpi_unit NOT NULL,
    grain                g14_grain NOT NULL,
    min_cell_size        integer,                        -- per-KPI k override for suppression (FR-17)
    sensitivity          g14_sensitivity NOT NULL DEFAULT 'INTERNAL',
    status               g14_lifecycle_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,  -- checker != created_by (P01)
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_kpi_definitions_version UNIQUE (tenant_id, kpi_code, version)
);
-- At most one ACTIVE definition per kpi_code (DI rule 2):
CREATE UNIQUE INDEX uq_kpi_definitions_active ON kpi_definitions(tenant_id, kpi_code) WHERE status = 'ACTIVE' AND is_deleted = false;
CREATE INDEX ix_kpi_definitions_tenant ON kpi_definitions(tenant_id);
CREATE INDEX ix_kpi_definitions_mart   ON kpi_definitions(source_mart_id);
CREATE INDEX ix_kpi_definitions_status ON kpi_definitions(status);

-- SECTION 6 — E04 kpi_snapshots (BITEMPORAL, version-stamped — APPEND-ONLY; FR-23) --------
CREATE TABLE kpi_snapshots (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
    kpi_version          integer NOT NULL,               -- definition version that produced this value
    definition_hash      text NOT NULL,
    scope_type           g14_scope_type NOT NULL,
    scope_id             text,
    period_key           text NOT NULL,
    valid_time           date NOT NULL,                  -- business period instant described
    knowledge_time       timestamptz NOT NULL,           -- when this value became known
    is_superseded        boolean NOT NULL DEFAULT false, -- restated by a later knowledge-version
    superseded_by        uuid REFERENCES kpi_snapshots(id) ON DELETE SET NULL,
    value                numeric(18,4) NOT NULL,
    cell_size            integer,                        -- group size behind the value (drives suppression)
    data_as_of           timestamptz NOT NULL,           -- freshness watermark of source mart
    computed_at          timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    -- APPEND-ONLY (no updated_at, no is_deleted): restatement adds a knowledge-version row.
    CONSTRAINT uq_kpi_snapshots_bitemporal UNIQUE (tenant_id, kpi_id, kpi_version, scope_type, scope_id, period_key, knowledge_time)
);
CREATE INDEX ix_kpi_snapshots_tenant    ON kpi_snapshots(tenant_id);
CREATE INDEX ix_kpi_snapshots_kpi       ON kpi_snapshots(kpi_id);
CREATE INDEX ix_kpi_snapshots_period    ON kpi_snapshots(kpi_id, scope_type, scope_id, period_key);
CREATE INDEX ix_kpi_snapshots_knowledge ON kpi_snapshots(kpi_id, knowledge_time);
CREATE INDEX ix_kpi_snapshots_active    ON kpi_snapshots(kpi_id, period_key) WHERE is_superseded = false;
COMMENT ON TABLE kpi_snapshots IS 'Bitemporal (valid_time + knowledge_time) version-stamped KPI value series. Append-only; restatement adds rows (is_superseded on the prior), never mutates (P05 immutability contract).';

-- SECTION 7 — E17 kpi_target_history (effective-dated targets; VAL-EFFECTIVE) -------------
CREATE TABLE kpi_target_history (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
    scope_type           g14_scope_type NOT NULL,
    scope_id             text,
    target_value         numeric(18,4) NOT NULL,
    target_kind          g14_target_kind NOT NULL DEFAULT 'KPI_TARGET',
    effective_from       date NOT NULL,
    effective_to         date,
    set_by               uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status               g14_target_status NOT NULL DEFAULT 'ACTIVE',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_kpi_target_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_kpi_target_history_tenant ON kpi_target_history(tenant_id);
CREATE INDEX ix_kpi_target_history_kpi    ON kpi_target_history(kpi_id);
CREATE INDEX ix_kpi_target_history_eff    ON kpi_target_history(kpi_id, effective_from);

-- SECTION 8 — E10 datamart_refresh_logs (APPEND-ONLY; FR-03 AC6) --------------------------
CREATE TABLE datamart_refresh_logs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    mart_id              uuid NOT NULL REFERENCES analytics_datamarts(id) ON DELETE CASCADE,
    run_type             g14_refresh_run_type NOT NULL,
    started_at           timestamptz NOT NULL DEFAULT now(),
    finished_at          timestamptz,
    rows_read            bigint,
    rows_written         bigint,
    status               g14_refresh_status NOT NULL DEFAULT 'RUNNING',
    error_detail         text,                           -- terminal -> JOB-FAIL -> MSG-SYS-JOBFAIL (X.1)
    triggered_by         uuid REFERENCES users(id) ON DELETE SET NULL,  -- null = scheduler
    correlation_id       text,                           -- X-Correlation-Id
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid
    -- APPEND-ONLY: no updated_at, no is_deleted.
);
CREATE INDEX ix_datamart_refresh_logs_tenant  ON datamart_refresh_logs(tenant_id);
CREATE INDEX ix_datamart_refresh_logs_mart    ON datamart_refresh_logs(mart_id);
CREATE INDEX ix_datamart_refresh_logs_status  ON datamart_refresh_logs(status);
CREATE INDEX ix_datamart_refresh_logs_started ON datamart_refresh_logs(started_at);

-- SECTION 9 — E11 analytics_scope_policies (maker-checker; FR-04 AC7) ---------------------
CREATE TABLE analytics_scope_policies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    role                 text NOT NULL,                  -- RBAC v1.7 role this binding applies to
    scope_dimensions     text[] NOT NULL,                -- subset of P02 dims (RBAC §3.6)
    mart_id              uuid REFERENCES analytics_datamarts(id) ON DELETE SET NULL,  -- null = all marts
    priority             integer NOT NULL DEFAULT 0,
    version              integer NOT NULL DEFAULT 1,
    status               g14_scope_policy_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,  -- checker (!= created_by/maker; P01 SoD)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,   -- P01 maker-checker instance
    is_active            boolean NOT NULL DEFAULT false, -- one ACTIVE per (role, mart)
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,                           -- maker (logical ref to users)
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
-- One ACTIVE binding per (role, mart):
CREATE UNIQUE INDEX uq_analytics_scope_policies_active ON analytics_scope_policies(tenant_id, role, mart_id) WHERE is_active = true;
CREATE INDEX ix_analytics_scope_policies_tenant ON analytics_scope_policies(tenant_id);
CREATE INDEX ix_analytics_scope_policies_role   ON analytics_scope_policies(role);
CREATE INDEX ix_analytics_scope_policies_status ON analytics_scope_policies(status);
COMMENT ON TABLE analytics_scope_policies IS 'DECLARES which P02 scope dimensions apply per mart/role. It enforces nothing — Authorization.check (P02) enforces scope_filter + field_mask + PII ceiling at the data layer. Activation is maker-checked (approved_by != created_by -> ERR-G14-SCOPE-CHECKER).';

-- SECTION 10 — E16 analytics_access_log (async, PARTITIONED, APPEND-ONLY) -----------------
CREATE TABLE analytics_access_log (
    id                   uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id              uuid NOT NULL,
    action               g14_access_action NOT NULL,
    target_type          g14_access_target_type NOT NULL,
    target_id            text,
    scope_snapshot_json  jsonb NOT NULL,                 -- effective P02 scope at access time
    sensitivity          g14_sensitivity NOT NULL DEFAULT 'INTERNAL',
    log_fidelity         g14_log_fidelity NOT NULL DEFAULT 'FULL',
    row_count            integer,
    data_as_of           timestamptz,
    correlation_id       text NOT NULL,                  -- X-Correlation-Id
    occurred_at          timestamptz NOT NULL DEFAULT now(),  -- partition key
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    -- APPEND-ONLY: no updated_at, no is_deleted.
    CONSTRAINT pk_analytics_access_log PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ix_analytics_access_log_tenant   ON analytics_access_log(tenant_id);
CREATE INDEX ix_analytics_access_log_user     ON analytics_access_log(user_id);
CREATE INDEX ix_analytics_access_log_occurred ON analytics_access_log(occurred_at);
COMMENT ON TABLE analytics_access_log IS 'Async, partitioned, append-only read-access ledger. FULL-fidelity events mirror into P05 audit_log. Reading sensitive analytics is itself an audited action.';

-- Partitions: one explicit range (2026-H2) + a DEFAULT catch-all (data-model Section 11).
CREATE TABLE analytics_access_log_2026h2 PARTITION OF analytics_access_log
    FOR VALUES FROM ('2026-07-01') TO ('2027-01-01');
CREATE TABLE analytics_access_log_default PARTITION OF analytics_access_log DEFAULT;
