-- =====================================================================================
-- GOVERNMENT HRMS — G14 DASHBOARD & ANALYTICS (14-G14-dashboard-analytics.sql)
-- =====================================================================================
-- Module-owned DDL for G14 (alias GOV-M14; was M14-DAS). Authors the 24 owned analytics
-- artefacts of BRD v3 §5.1 (E01-E24). G14 is the cross-module intelligence layer: it
-- EXTENDS PrimeSoft M16 and OWNS only analytics metadata + read-model/mart definitions.
-- It reads G01-G13 BY REFERENCE through contracted mart views — it forks no owning-module
-- table and writes no transactional master data.
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                          (MANDATORY conventions)
--   docs/data-model/00-platform-core.sql                    (shared core — FK targets)
--   docs/brd/v3/G14-dashboard-and-analytics.md §5           (entities, enums, integrity)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Run AFTER 00-platform-core.sql. G14 references only core tables (employees,
--   org_units, designations, users, documents, workflow_instances, notifications), all
--   defined in 00. Load order: 00 -> 01 -> ... -> 14. No dependency on other module files.
--
-- CORE TABLES REFERENCED (FK by id; NEVER redefined here):
--   tenants, entities, org_units, designations, employees, users,
--   workflow_instances (P01), documents (G13), notifications (X.2).
--   audit_log/security_audit_log are written by the platform P05 DB trigger; jobs (X.1)
--   run mart refresh / schedules. G14 stores only the job_id string reference (no FK into
--   the jobs run-ledger — a logical X.1 registration id, Foundation §4).
--
-- KEY DESIGN POINTS (per BRD + CONVENTIONS):
--   * Every business table carries tenant_id (NOT NULL) + entity_id where entity-scoped.
--   * Standard audit columns on mutable tables; APPEND-ONLY LEDGERS carry only
--     created_at/created_by (NO updated_at, NO is_deleted):
--        kpi_snapshots (bitemporal — restatement adds knowledge-versions, never mutates),
--        datamart_refresh_logs, analytics_access_log (partitioned), nl_query_logs.
--   * RLS = the core P02 substrate. The canonical tenant-isolation policy (CONVENTIONS §6)
--     is applied to EVERY G14 table (Section R), incl. append-only ledgers (read isolation).
--     analytics_scope_policies only DECLARES which P02 scope dimensions / field-sensitivity
--     flags apply per mart/role — it is NOT a parallel RLS engine. Enforcement (scope_filter,
--     field_mask, PII ceiling) is entirely P02 at the data layer on serialization.
--   * MARTS ARE READ MODELS. analytics_datamarts holds the mart DEFINITION/metadata
--     (grain, source modules/contracted views, watermark, health) — not a copy of any
--     owning-module table. source_objects are contracted read-only views (Debezium CDC).
--   * Maker-checker on publishing KPIs / COMPLIANCE+EXECUTIVE dashboards / scope policy /
--     embed tokens / model activation runs on the P01 engine: workflow_instance_id
--     references workflow_instances; this schema stores the reference + checker only and
--     re-implements no approval state machine. SoD (maker != checker) enforced by P01/P02.
--   * Access auditing: FULL-fidelity rows in analytics_access_log mirror into core
--     audit_log/security_audit_log (P05) via the app/trigger layer — not duplicated here.
--   * Module enums use Postgres ENUM types, prefixed g14_, UPPER_SNAKE_CASE values.
--
-- CREATE ORDER. Tables are ordered so each referenced table precedes its referrers; no
--   circular FK exists, so no deferred ALTER block is required.
-- =====================================================================================


-- =====================================================================================
-- RECON (prototype) — reconciled against PrimeSoft dashboard/analytics screens
--   Screens read: dashboard, dept-view, dept-headcount, dept-leave, dept-attendance,
--     dept-performance, my-team, audit-log, leadership-ai-chat, ai-policy-chat,
--     notifications, tasks, calendar.
--   Finding: all dashboard/dept-view tiles are DATA-DERIVED — they resolve to KPI
--     DEFINITIONS + marts + widgets, not new columns. The kpi_definitions /
--     dashboard_widgets / saved_reports / analytics_datamarts model represents every
--     concrete tile/column (headcount by grade band, dept leave/attendance/performance,
--     attrition, AI text-to-query, per-engineer attrition risk).
--   Structures added by this recon (additive only): (1) g14_kpi_unit += 'HOURS' for the
--     dept-attendance "Avg work hrs" tile; (2) a seed set of marts + kpi_definitions +
--     widgets covering the dept LEAVE/ATTENDANCE/APPRAISAL/WORKFORCE tiles (Section S).
--   Out of G14 ownership (referenced, not seeded here): audit-log -> core audit_log/
--     security_audit_log (P05); notifications -> core notifications (X.2); tasks -> P01
--     workflow_actions; calendar -> cross-module (G03 leave/holiday, recruitment,
--     G01 birthdays); ai-policy-chat -> P03 knowledge assistant (not analytics NLQ).
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G14 closed enumerations; BRD §5.5)
-- =====================================================================================

-- Dashboards / widgets ----------------------------------------------------------------
CREATE TYPE g14_dashboard_target_role AS ENUM ('EMPLOYEE','MANAGER','HR_ADMIN','DEPT_HEAD','EXECUTIVE','AUDITOR','ANALYTICS_ADMIN');
CREATE TYPE g14_dashboard_category    AS ENUM ('PERSONAL','WORKFORCE','OPERATIONAL','COMPLIANCE','EXECUTIVE','CUSTOM');
CREATE TYPE g14_dashboard_status      AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE g14_widget_type           AS ENUM ('KPI_TILE','LINE','BAR','PIE','DONUT','TABLE','HEATMAP','GAUGE','FUNNEL','MAP','TEXT');
CREATE TYPE g14_refresh_hint          AS ENUM ('LIVE','MART','CACHED');

-- KPI / shared analytics --------------------------------------------------------------
CREATE TYPE g14_domain                AS ENUM ('WORKFORCE','LEAVE','ATTENDANCE','PAYROLL','TRAINING','APPRAISAL','DISCIPLINARY','TRANSFER','PROMOTION','PENSION','COMPLIANCE','SR');
CREATE TYPE g14_kpi_unit              AS ENUM ('COUNT','PERCENT','RATIO','CURRENCY','DAYS','SCORE','HOURS');  -- RECON: HOURS added for "Avg work hrs" dept-attendance tile
CREATE TYPE g14_grain                 AS ENUM ('EMPLOYEE','ORG_UNIT','CADRE','PERIOD','ENTERPRISE');
CREATE TYPE g14_period                AS ENUM ('DAY','WEEK','MONTH','QUARTER','YEAR','ROLLING_12M');
CREATE TYPE g14_kpi_direction         AS ENUM ('HIGHER_BETTER','LOWER_BETTER','ON_TARGET');
CREATE TYPE g14_sensitivity           AS ENUM ('PUBLIC','INTERNAL','RESTRICTED');
CREATE TYPE g14_lifecycle_status      AS ENUM ('DRAFT','ACTIVE','RETIRED');   -- kpi_definitions, prediction_models
CREATE TYPE g14_scope_type            AS ENUM ('ENTERPRISE','ORG_UNIT','CADRE','MANAGER');

-- Saved views / reports / schedules / executions --------------------------------------
CREATE TYPE g14_saved_target_type     AS ENUM ('DASHBOARD','REPORT');
CREATE TYPE g14_visibility            AS ENUM ('PRIVATE','SHARED_SCOPE','PUBLISHED');
CREATE TYPE g14_report_status         AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE g14_report_format         AS ENUM ('PDF','XLSX','CSV');
CREATE TYPE g14_schedule_scope_mode   AS ENUM ('OWNER_SCOPE','PER_RECIPIENT_SCOPE');
CREATE TYPE g14_delivery_channel      AS ENUM ('EMAIL','IN_APP','BOTH','SFTP');
CREATE TYPE g14_onoff_status          AS ENUM ('ACTIVE','PAUSED','DISABLED');   -- report_schedules, alert_rules
CREATE TYPE g14_run_type              AS ENUM ('ON_DEMAND','SCHEDULED','PREVIEW');
CREATE TYPE g14_execution_status      AS ENUM ('QUEUED','RUNNING','COMPLETED','FAILED','EXPIRED','REDACTED');

-- Data layer / marts ------------------------------------------------------------------
CREATE TYPE g14_mart_type             AS ENUM ('FACT','DIMENSION','AGGREGATE','MATERIALIZED_VIEW','SEMANTIC');
CREATE TYPE g14_refresh_strategy      AS ENUM ('FULL','INCREMENTAL','CDC','ON_DEMAND');
CREATE TYPE g14_mart_health           AS ENUM ('HEALTHY','STALE','DEGRADED','FAILED');
CREATE TYPE g14_refresh_run_type      AS ENUM ('SCHEDULED','MANUAL','BACKFILL');
CREATE TYPE g14_refresh_status        AS ENUM ('RUNNING','SUCCESS','PARTIAL','FAILED');

-- Scope policy ------------------------------------------------------------------------
CREATE TYPE g14_scope_policy_status   AS ENUM ('DRAFT','PENDING_APPROVAL','ACTIVE','REJECTED','SUPERSEDED');

-- Alerts ------------------------------------------------------------------------------
CREATE TYPE g14_alert_operator        AS ENUM ('GT','GTE','LT','LTE','EQ','NEQ','DELTA_PCT');
CREATE TYPE g14_severity              AS ENUM ('INFO','WARNING','CRITICAL');
CREATE TYPE g14_eval_freq             AS ENUM ('ON_REFRESH','HOURLY','DAILY');
CREATE TYPE g14_alert_event_status    AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED','SUPPRESSED');

-- Prediction --------------------------------------------------------------------------
CREATE TYPE g14_model_type            AS ENUM ('RULE_BASED','STATISTICAL','ML');
CREATE TYPE g14_determinism           AS ENUM ('DETERMINISTIC','PROBABILISTIC');
CREATE TYPE g14_fairness_status       AS ENUM ('NOT_ASSESSED','PASSED','FAILED','WAIVED_WITH_REASON');
CREATE TYPE g14_subject_type          AS ENUM ('EMPLOYEE','ORG_UNIT','CADRE');
CREATE TYPE g14_risk_band             AS ENUM ('LOW','MEDIUM','HIGH','NO_PREDICTION');

-- Access log --------------------------------------------------------------------------
CREATE TYPE g14_access_action         AS ENUM ('VIEW_DASHBOARD','RUN_REPORT','EXPORT','DRILLTHROUGH','NL_QUERY','API_QUERY','VIEW_INDIVIDUAL_PREDICTION');
CREATE TYPE g14_access_target_type    AS ENUM ('DASHBOARD','WIDGET','REPORT','KPI','RECORD','PREDICTION');
CREATE TYPE g14_log_fidelity          AS ENUM ('FULL','SAMPLED');

-- Targets / embed / contracts / NLQ ---------------------------------------------------
CREATE TYPE g14_target_kind           AS ENUM ('KPI_TARGET','ALERT_THRESHOLD');
CREATE TYPE g14_target_status         AS ENUM ('ACTIVE','SUPERSEDED');
CREATE TYPE g14_embed_status          AS ENUM ('PENDING_APPROVAL','ACTIVE','EXPIRED','REVOKED','ROTATED');
CREATE TYPE g14_cdc_mechanism         AS ENUM ('DEBEZIUM_CDC','BATCH','ON_DEMAND');
CREATE TYPE g14_contract_status       AS ENUM ('DRAFT','ACTIVE','DEPRECATED','BREACHED');
CREATE TYPE g14_nlq_outcome           AS ENUM ('ANSWERED','CLARIFICATION_REQUESTED','REFUSED_LOW_CONFIDENCE','REFUSED_OUT_OF_SCOPE','REFUSED_UNMODELLED');

-- Establishment / DPDP / anomaly / suppression ----------------------------------------
CREATE TYPE g14_position_status       AS ENUM ('SANCTIONED','FROZEN','ABOLISHED');
CREATE TYPE g14_dsc_change_type       AS ENUM ('RECTIFICATION','ERASURE','RESTRICTION');
CREATE TYPE g14_dsc_status            AS ENUM ('RECEIVED','PROPAGATING','COMPLETED','BLOCKED_RETENTION','FAILED');
CREATE TYPE g14_anomaly_type          AS ENUM ('OFF_HOURS_BULK_EXPORT','SCOPE_EDGE_PROBING','UNUSUAL_DRILLTHROUGH_VOLUME','REPEATED_DENIED','MASS_NL_QUERY');
CREATE TYPE g14_anomaly_status        AS ENUM ('OPEN','INVESTIGATING','DISMISSED','CONFIRMED');
CREATE TYPE g14_suppression_applies   AS ENUM ('TILE','CHART','DRILLTHROUGH','EXPORT','ALL');


-- =====================================================================================
-- SECTION 2 — DATA-LAYER METADATA (contracts, marts, suppression) — created first
-- =====================================================================================

-- E19 source_data_contracts -----------------------------------------------------------
-- Versioned source-view contract per module mart. Co-signed by the owning-module steward.
CREATE TABLE source_data_contracts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- contract_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    source_module        text NOT NULL,                  -- e.g. 'G10'
    source_view          text NOT NULL,                  -- e.g. 'g10.v_payroll_locked_v3'
    version              text NOT NULL,                  -- semantic version
    schema_json          jsonb NOT NULL,                 -- promised columns/types/nullability
    cdc_mechanism        g14_cdc_mechanism NOT NULL DEFAULT 'DEBEZIUM_CDC',
    breaking_change_policy text NOT NULL,                -- notice period + alert routing
    status               g14_contract_status NOT NULL DEFAULT 'DRAFT',
    last_contract_test_at timestamptz,                   -- CI verification timestamp
    co_signed_by         uuid REFERENCES users(id) ON DELETE SET NULL,  -- owning-module steward
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_source_data_contracts UNIQUE (tenant_id, source_module, source_view, version)
);
CREATE INDEX ix_source_data_contracts_tenant ON source_data_contracts(tenant_id);
CREATE INDEX ix_source_data_contracts_entity ON source_data_contracts(entity_id);
CREATE INDEX ix_source_data_contracts_module ON source_data_contracts(source_module);
CREATE INDEX ix_source_data_contracts_status ON source_data_contracts(status);
CREATE INDEX ix_source_data_contracts_cosign ON source_data_contracts(co_signed_by);

-- E09 analytics_datamarts (read model — DEFINITION/metadata, NOT a fork) ---------------
CREATE TABLE analytics_datamarts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- mart_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    mart_code            text NOT NULL,                  -- e.g. 'MART_HEADCOUNT'
    name                 text NOT NULL,
    mart_type            g14_mart_type NOT NULL,
    grain                text NOT NULL,
    source_modules       text[] NOT NULL,               -- e.g. {G01,G03,G12}
    source_objects       text[] NOT NULL,               -- contracted read-only views (not raw tables)
    contract_id          uuid REFERENCES source_data_contracts(id) ON DELETE SET NULL,
    refresh_strategy     g14_refresh_strategy NOT NULL,
    refresh_job_id       text,                          -- JOB-G14-MART-* on X.1 (logical ref)
    refresh_cron         text,
    freshness_sla_minutes integer NOT NULL,
    watermark_column     text,
    last_refreshed_at    timestamptz,
    last_watermark_value text,
    reconcile_grace_minutes integer,
    row_count            bigint,
    health_status        g14_mart_health NOT NULL DEFAULT 'HEALTHY',
    contains_pii         boolean NOT NULL DEFAULT false, -- drives P02 RESTRICTED field-mask handling
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_analytics_datamarts_code UNIQUE (tenant_id, mart_code)
);
CREATE INDEX ix_analytics_datamarts_tenant   ON analytics_datamarts(tenant_id);
CREATE INDEX ix_analytics_datamarts_entity   ON analytics_datamarts(entity_id);
CREATE INDEX ix_analytics_datamarts_contract ON analytics_datamarts(contract_id);
CREATE INDEX ix_analytics_datamarts_health   ON analytics_datamarts(health_status);
COMMENT ON TABLE analytics_datamarts IS 'Read-model mart DEFINITION/metadata. source_objects are contracted views over G01-G13 (Debezium CDC); this is NOT a copy of any owning-module table.';

-- E24 suppression_policies (GAP gov-specific) -----------------------------------------
CREATE TABLE suppression_policies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- policy_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    name                 text NOT NULL,
    applies_to           g14_suppression_applies NOT NULL DEFAULT 'ALL',
    min_cell_size_k      integer NOT NULL DEFAULT 5,
    complementary        boolean NOT NULL DEFAULT true,  -- suppress complements so totals can't recover a cell
    band_instead_of_hide boolean NOT NULL DEFAULT false, -- show banded range ("<5") vs full hide
    domains              text[],                         -- domains/sensitivities in scope
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_suppression_k CHECK (min_cell_size_k > 0)
);
CREATE INDEX ix_suppression_policies_tenant ON suppression_policies(tenant_id);
CREATE INDEX ix_suppression_policies_entity ON suppression_policies(entity_id);
CREATE INDEX ix_suppression_policies_active ON suppression_policies(is_active);


-- =====================================================================================
-- SECTION 3 — KPI REGISTRY (definitions, bitemporal snapshots, effective-dated targets)
-- =====================================================================================

-- E03 kpi_definitions -----------------------------------------------------------------
CREATE TABLE kpi_definitions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- kpi_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_code             text NOT NULL,                  -- e.g. HEADCOUNT_ACTIVE
    name                 text NOT NULL,
    description          text NOT NULL,                  -- rendered on consumer tiles
    plain_language_note  text,
    domain               g14_domain NOT NULL,
    version              integer NOT NULL,               -- versioned definition
    definition_hash      text NOT NULL,                  -- SHA-256(expr+grain+dims+source); stamped on snapshots
    source_mart_id       uuid NOT NULL REFERENCES analytics_datamarts(id) ON DELETE RESTRICT,
    expression           text NOT NULL,                  -- safe whitelisted aggregation DSL
    unit                 g14_kpi_unit NOT NULL,
    grain                g14_grain NOT NULL,
    default_period       g14_period,
    dimensions_allowed   text[],
    reconciliation_target text,
    reconciliation_tolerance numeric(10,4),
    direction            g14_kpi_direction,
    min_cell_size        integer,                        -- per-KPI k override for suppression
    sensitivity          g14_sensitivity NOT NULL DEFAULT 'INTERNAL', -- drives P02 field-mask / PII ceiling
    status               g14_lifecycle_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL, -- checker != created_by (P01)
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
CREATE INDEX ix_kpi_definitions_entity ON kpi_definitions(entity_id);
CREATE INDEX ix_kpi_definitions_mart   ON kpi_definitions(source_mart_id);
CREATE INDEX ix_kpi_definitions_domain ON kpi_definitions(domain);
CREATE INDEX ix_kpi_definitions_status ON kpi_definitions(status);
CREATE INDEX ix_kpi_definitions_approved ON kpi_definitions(approved_by);

-- E04 kpi_snapshots (bitemporal, version-stamped — APPEND-ONLY) ------------------------
CREATE TABLE kpi_snapshots (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- snapshot_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
    kpi_version          integer NOT NULL,               -- definition version that produced this value
    definition_hash      text NOT NULL,
    scope_type           g14_scope_type NOT NULL,
    scope_id             text,                           -- org_unit_id / cadre / manager employee_id
    period_key           text NOT NULL,                  -- e.g. 2026-06, FY2026_27
    valid_time           date NOT NULL,                  -- business period instant described
    knowledge_time       timestamptz NOT NULL,           -- when this value became known
    is_superseded        boolean NOT NULL DEFAULT false, -- restated by a later knowledge-version
    superseded_by        uuid REFERENCES kpi_snapshots(id) ON DELETE SET NULL,
    value                numeric(18,4) NOT NULL,
    numerator            numeric(18,4),
    denominator          numeric(18,4),
    cell_size            integer,                        -- group size behind the value (drives suppression)
    data_as_of           timestamptz NOT NULL,           -- freshness watermark of source mart
    computed_at          timestamptz NOT NULL DEFAULT now(),
    is_partial           boolean NOT NULL DEFAULT false, -- computed on stale/partial mart
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    -- APPEND-ONLY (no updated_at, no is_deleted): restatement adds a knowledge-version row.
    CONSTRAINT uq_kpi_snapshots_bitemporal UNIQUE (tenant_id, kpi_id, kpi_version, scope_type, scope_id, period_key, knowledge_time)
);
CREATE INDEX ix_kpi_snapshots_tenant   ON kpi_snapshots(tenant_id);
CREATE INDEX ix_kpi_snapshots_entity   ON kpi_snapshots(entity_id);
CREATE INDEX ix_kpi_snapshots_kpi      ON kpi_snapshots(kpi_id);
CREATE INDEX ix_kpi_snapshots_superby  ON kpi_snapshots(superseded_by);
CREATE INDEX ix_kpi_snapshots_period   ON kpi_snapshots(kpi_id, scope_type, scope_id, period_key);
CREATE INDEX ix_kpi_snapshots_knowledge ON kpi_snapshots(kpi_id, knowledge_time);
CREATE INDEX ix_kpi_snapshots_active   ON kpi_snapshots(kpi_id, period_key) WHERE is_superseded = false;
COMMENT ON TABLE kpi_snapshots IS 'Bitemporal (valid_time + knowledge_time) version-stamped KPI value series. Append-only; restatement adds rows (is_superseded on the prior), never mutates (P05 immutability contract).';

-- E17 kpi_target_history (effective-dated targets & thresholds) ------------------------
CREATE TABLE kpi_target_history (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- target_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
    scope_type           g14_scope_type NOT NULL,        -- ENTERPRISE/ORG_UNIT/CADRE
    scope_id             text,
    target_value         numeric(18,4) NOT NULL,
    target_kind          g14_target_kind NOT NULL DEFAULT 'KPI_TARGET',
    effective_from       date NOT NULL,                  -- VAL-EFFECTIVE
    effective_to         date,                           -- null = open-ended
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
CREATE INDEX ix_kpi_target_history_entity ON kpi_target_history(entity_id);
CREATE INDEX ix_kpi_target_history_kpi    ON kpi_target_history(kpi_id);
CREATE INDEX ix_kpi_target_history_setby  ON kpi_target_history(set_by);
CREATE INDEX ix_kpi_target_history_eff    ON kpi_target_history(kpi_id, effective_from);
CREATE INDEX ix_kpi_target_history_status ON kpi_target_history(status);


-- =====================================================================================
-- SECTION 4 — DASHBOARDS, WIDGETS, SAVED VIEWS
-- =====================================================================================

-- E06 saved_reports (created before widgets/schedules that reference it) ---------------
CREATE TABLE saved_reports (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- report_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    report_code          text NOT NULL,
    name                 text NOT NULL,
    domain               g14_domain NOT NULL,
    source_mart_id       uuid NOT NULL REFERENCES analytics_datamarts(id) ON DELETE RESTRICT,
    select_fields_json   jsonb NOT NULL,
    filters_json         jsonb,
    group_by_json        jsonb,
    aggregations_json    jsonb,
    sort_json            jsonb,
    row_limit            integer NOT NULL DEFAULT 100000, -- hard cap
    min_cell_size        integer,                         -- suppression k for this report's aggregates
    sensitivity          g14_sensitivity NOT NULL DEFAULT 'INTERNAL',
    owner_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    visibility           g14_visibility NOT NULL DEFAULT 'PRIVATE',
    status               g14_report_status NOT NULL DEFAULT 'DRAFT',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_saved_reports_code UNIQUE (tenant_id, report_code),
    CONSTRAINT ck_saved_reports_row_limit CHECK (row_limit > 0)
);
CREATE INDEX ix_saved_reports_tenant ON saved_reports(tenant_id);
CREATE INDEX ix_saved_reports_entity ON saved_reports(entity_id);
CREATE INDEX ix_saved_reports_mart   ON saved_reports(source_mart_id);
CREATE INDEX ix_saved_reports_owner  ON saved_reports(owner_user_id);
CREATE INDEX ix_saved_reports_status ON saved_reports(status);
CREATE INDEX ix_saved_reports_domain ON saved_reports(domain);

-- E01 dashboards ----------------------------------------------------------------------
CREATE TABLE dashboards (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- dashboard_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    dashboard_code       text NOT NULL,                  -- e.g. EXEC_WORKFORCE
    name                 text NOT NULL,
    description          text,
    target_role          g14_dashboard_target_role NOT NULL,
    category             g14_dashboard_category NOT NULL,
    layout_json          jsonb NOT NULL,
    default_filters_json jsonb,
    is_system            boolean NOT NULL DEFAULT false,
    status               g14_dashboard_status NOT NULL DEFAULT 'DRAFT',
    published_by         uuid REFERENCES users(id) ON DELETE SET NULL,  -- checker (P01 flow)
    published_at         timestamptz,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 publish flow
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_dashboards_code UNIQUE (tenant_id, dashboard_code)
);
CREATE INDEX ix_dashboards_tenant   ON dashboards(tenant_id);
CREATE INDEX ix_dashboards_entity   ON dashboards(entity_id);
CREATE INDEX ix_dashboards_role     ON dashboards(target_role);
CREATE INDEX ix_dashboards_category ON dashboards(category);
CREATE INDEX ix_dashboards_status   ON dashboards(status);
CREATE INDEX ix_dashboards_wf       ON dashboards(workflow_instance_id);

-- E02 dashboard_widgets ---------------------------------------------------------------
CREATE TABLE dashboard_widgets (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- widget_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    dashboard_id         uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    title                text NOT NULL,
    widget_type          g14_widget_type NOT NULL,
    kpi_id               uuid REFERENCES kpi_definitions(id) ON DELETE SET NULL,  -- bound KPI
    query_ref            uuid REFERENCES saved_reports(id) ON DELETE SET NULL,    -- alt bound query
    dimensions_json      jsonb,
    filters_json         jsonb,
    drilldown_path_json  jsonb,
    drillthrough_target  text,                           -- owning-module record route template (read-only)
    position_json        jsonb NOT NULL,
    refresh_hint         g14_refresh_hint NOT NULL DEFAULT 'MART',
    show_plain_definition boolean NOT NULL DEFAULT true,
    display_order        integer NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    -- BR1: a measure-bound widget references a KPI or a saved report:
    CONSTRAINT ck_widget_binding CHECK (kpi_id IS NOT NULL OR query_ref IS NOT NULL OR widget_type IN ('TEXT'))
);
CREATE INDEX ix_dashboard_widgets_tenant    ON dashboard_widgets(tenant_id);
CREATE INDEX ix_dashboard_widgets_entity    ON dashboard_widgets(entity_id);
CREATE INDEX ix_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);
CREATE INDEX ix_dashboard_widgets_kpi       ON dashboard_widgets(kpi_id);
CREATE INDEX ix_dashboard_widgets_query     ON dashboard_widgets(query_ref);

-- E05 saved_views (target_id is polymorphic dashboard|saved_report — no FK) ------------
CREATE TABLE saved_views (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- view_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    owner_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_type          g14_saved_target_type NOT NULL,
    target_id            uuid NOT NULL,                  -- dashboard_id or saved_report_id (polymorphic)
    name                 text NOT NULL,
    filters_json         jsonb NOT NULL,
    layout_json          jsonb,
    is_default           boolean NOT NULL DEFAULT false,
    visibility           g14_visibility NOT NULL DEFAULT 'PRIVATE',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_saved_views_tenant ON saved_views(tenant_id);
CREATE INDEX ix_saved_views_entity ON saved_views(entity_id);
CREATE INDEX ix_saved_views_owner  ON saved_views(owner_user_id);
CREATE INDEX ix_saved_views_target ON saved_views(target_type, target_id);


-- =====================================================================================
-- SECTION 5 — REPORT SCHEDULES & EXECUTIONS
-- =====================================================================================

-- E07 report_schedules (runs on X.1) --------------------------------------------------
CREATE TABLE report_schedules (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- schedule_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    report_id            uuid NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
    job_id               text NOT NULL,                  -- JOB-G14-REPORT-* registered on X.1
    cron_expr            text NOT NULL,                  -- cron (UTC)
    timezone             text NOT NULL DEFAULT 'Asia/Kolkata',
    format               g14_report_format NOT NULL,
    recipients_json      jsonb NOT NULL,                 -- user_ids/role/email groups (P02-validated)
    scope_mode           g14_schedule_scope_mode NOT NULL DEFAULT 'PER_RECIPIENT_SCOPE',
    burst_dimension      text,
    delivery_channel     g14_delivery_channel NOT NULL DEFAULT 'EMAIL',
    next_run_at          timestamptz,
    last_run_at          timestamptz,
    status               g14_onoff_status NOT NULL DEFAULT 'ACTIVE',
    owner_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_report_schedules_tenant ON report_schedules(tenant_id);
CREATE INDEX ix_report_schedules_entity ON report_schedules(entity_id);
CREATE INDEX ix_report_schedules_report ON report_schedules(report_id);
CREATE INDEX ix_report_schedules_owner  ON report_schedules(owner_user_id);
CREATE INDEX ix_report_schedules_status ON report_schedules(status);
CREATE INDEX ix_report_schedules_next   ON report_schedules(next_run_at) WHERE status = 'ACTIVE';

-- E08 report_executions ---------------------------------------------------------------
CREATE TABLE report_executions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- execution_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    report_id            uuid NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
    schedule_id          uuid REFERENCES report_schedules(id) ON DELETE SET NULL,  -- null = on-demand
    triggered_by         uuid REFERENCES users(id) ON DELETE SET NULL,             -- null = scheduler
    idempotency_key      text,                           -- per-period run key (X.1 idempotency)
    run_type             g14_run_type NOT NULL,
    format               g14_report_format NOT NULL,
    scope_snapshot_json  jsonb NOT NULL,                 -- effective P02 scope at run time
    as_of_knowledge      timestamptz,                    -- bitemporal knowledge-time reproduced
    row_count            integer,
    document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,         -- generated artefact (G13)
    status               g14_execution_status NOT NULL DEFAULT 'QUEUED',
    error_detail         text,
    data_as_of           timestamptz,
    started_at           timestamptz,
    completed_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_report_executions_idem UNIQUE (tenant_id, report_id, idempotency_key)
);
CREATE INDEX ix_report_executions_tenant   ON report_executions(tenant_id);
CREATE INDEX ix_report_executions_entity   ON report_executions(entity_id);
CREATE INDEX ix_report_executions_report   ON report_executions(report_id);
CREATE INDEX ix_report_executions_schedule ON report_executions(schedule_id);
CREATE INDEX ix_report_executions_trigby   ON report_executions(triggered_by);
CREATE INDEX ix_report_executions_doc      ON report_executions(document_id);
CREATE INDEX ix_report_executions_status   ON report_executions(status);

-- E10 datamart_refresh_logs (APPEND-ONLY ETL run log) ---------------------------------
CREATE TABLE datamart_refresh_logs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- refresh_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    mart_id              uuid NOT NULL REFERENCES analytics_datamarts(id) ON DELETE CASCADE,
    run_type             g14_refresh_run_type NOT NULL,
    started_at           timestamptz NOT NULL DEFAULT now(),
    finished_at          timestamptz,
    rows_read            bigint,
    rows_written         bigint,
    from_watermark       text,
    to_watermark         text,
    reconcile_variance   numeric(18,4),                  -- mart-at-W vs source-as-of-W delta
    status               g14_refresh_status NOT NULL DEFAULT 'RUNNING',
    error_detail         text,                           -- terminal -> JOB-FAIL -> MSG-SYS-JOBFAIL (X.1)
    triggered_by         uuid REFERENCES users(id) ON DELETE SET NULL,  -- null = scheduler
    correlation_id       text,                           -- X-Correlation-Id
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid
    -- APPEND-ONLY: no updated_at, no is_deleted.
);
CREATE INDEX ix_datamart_refresh_logs_tenant ON datamart_refresh_logs(tenant_id);
CREATE INDEX ix_datamart_refresh_logs_entity ON datamart_refresh_logs(entity_id);
CREATE INDEX ix_datamart_refresh_logs_mart   ON datamart_refresh_logs(mart_id);
CREATE INDEX ix_datamart_refresh_logs_status ON datamart_refresh_logs(status);
CREATE INDEX ix_datamart_refresh_logs_started ON datamart_refresh_logs(started_at);


-- =====================================================================================
-- SECTION 6 — SCOPE POLICY (declares P02 dimensions; enforcement is P02, NOT here)
-- =====================================================================================

-- E11 analytics_scope_policies --------------------------------------------------------
CREATE TABLE analytics_scope_policies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- policy_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    role                 text NOT NULL,                  -- RBAC v1.7 role this binding applies to
    scope_dimensions     text[] NOT NULL,               -- subset of P02 dims (RBAC §3.6):
                                                        --   reporting_chain, org_unit, UAG, contribution_level, entity
    mart_id              uuid REFERENCES analytics_datamarts(id) ON DELETE SET NULL,  -- null = all marts
    field_sensitivity_map_json jsonb,                   -- declares RESTRICTED columns -> P02 masks on serialization
    priority             integer NOT NULL DEFAULT 0,
    version              integer NOT NULL DEFAULT 1,
    status               g14_scope_policy_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,  -- checker (!= created_by/maker; P01 SoD)
    preview_diff_json    jsonb,                          -- before/after exposure diff at approval
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 maker-checker instance
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
CREATE INDEX ix_analytics_scope_policies_entity ON analytics_scope_policies(entity_id);
CREATE INDEX ix_analytics_scope_policies_mart   ON analytics_scope_policies(mart_id);
CREATE INDEX ix_analytics_scope_policies_role   ON analytics_scope_policies(role);
CREATE INDEX ix_analytics_scope_policies_status ON analytics_scope_policies(status);
CREATE INDEX ix_analytics_scope_policies_wf     ON analytics_scope_policies(workflow_instance_id);
COMMENT ON TABLE analytics_scope_policies IS 'DECLARES which P02 scope dimensions / field-sensitivity flags apply per mart/role. It enforces nothing — Authorization.check (P02) enforces scope_filter + field_mask + PII ceiling at the data layer. Changes are maker-checked via a P01 workflow_instance.';


-- =====================================================================================
-- SECTION 7 — ALERTS
-- =====================================================================================

-- E12 alert_rules ---------------------------------------------------------------------
CREATE TABLE alert_rules (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- rule_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
    name                 text NOT NULL,
    scope_type           g14_scope_type NOT NULL,
    scope_id             text,
    operator             g14_alert_operator NOT NULL,
    threshold_ref        uuid REFERENCES kpi_target_history(id) ON DELETE SET NULL,  -- effective-dated threshold
    threshold            numeric(18,4),                  -- static fallback
    severity             g14_severity NOT NULL DEFAULT 'WARNING',
    evaluation_freq      g14_eval_freq NOT NULL DEFAULT 'ON_REFRESH',
    recipients_json      jsonb NOT NULL,                 -- P02-validated; resolved by W.3
    suppression_window_min integer,
    hysteresis_pct       numeric(6,3),
    status               g14_onoff_status NOT NULL DEFAULT 'ACTIVE',
    owner_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_alert_rules_tenant    ON alert_rules(tenant_id);
CREATE INDEX ix_alert_rules_entity    ON alert_rules(entity_id);
CREATE INDEX ix_alert_rules_kpi       ON alert_rules(kpi_id);
CREATE INDEX ix_alert_rules_threshold ON alert_rules(threshold_ref);
CREATE INDEX ix_alert_rules_owner     ON alert_rules(owner_user_id);
CREATE INDEX ix_alert_rules_status    ON alert_rules(status);

-- E13 alert_events --------------------------------------------------------------------
CREATE TABLE alert_events (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- event_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_id              uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    kpi_id               uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE RESTRICT,
    scope_id             text,
    observed_value       numeric(18,4) NOT NULL,
    threshold            numeric(18,4) NOT NULL,         -- value in force for the period
    severity             g14_severity NOT NULL,
    data_as_of           timestamptz NOT NULL,
    is_partial           boolean NOT NULL DEFAULT false, -- evaluated on stale/partial mart
    status               g14_alert_event_status NOT NULL DEFAULT 'OPEN',
    acknowledged_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at      timestamptz,
    notification_id      uuid REFERENCES notifications(id) ON DELETE SET NULL,  -- X.2
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_alert_events_tenant ON alert_events(tenant_id);
CREATE INDEX ix_alert_events_entity ON alert_events(entity_id);
CREATE INDEX ix_alert_events_rule   ON alert_events(rule_id);
CREATE INDEX ix_alert_events_kpi    ON alert_events(kpi_id);
CREATE INDEX ix_alert_events_status ON alert_events(status);
CREATE INDEX ix_alert_events_ack    ON alert_events(acknowledged_by);
CREATE INDEX ix_alert_events_notif  ON alert_events(notification_id);


-- =====================================================================================
-- SECTION 8 — PREDICTIVE ANALYTICS (model card + fairness; per-subject scores)
-- =====================================================================================

-- E14 prediction_models ---------------------------------------------------------------
CREATE TABLE prediction_models (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- model_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    model_code           text NOT NULL,                  -- e.g. ATTRITION_RISK
    model_type           g14_model_type NOT NULL,
    determinism          g14_determinism NOT NULL,
    version              text NOT NULL,
    features_json        jsonb NOT NULL,
    protected_features_excluded text[] NOT NULL DEFAULT '{}', -- caste/category, gender, disability, maternity proxies
    methodology          text NOT NULL,
    model_card_ref       uuid REFERENCES documents(id) ON DELETE SET NULL,  -- published model card (G13)
    adverse_impact_result jsonb,                         -- disparate-impact test results + thresholds
    fairness_status      g14_fairness_status NOT NULL DEFAULT 'NOT_ASSESSED',
    intended_use         text NOT NULL,
    prohibited_use       text NOT NULL,                  -- "must not be sole/primary basis for any admin action"
    source_mart_ids      uuid[] NOT NULL,
    confidence_basis     text,
    status               g14_lifecycle_status NOT NULL DEFAULT 'DRAFT',
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,  -- checker (!= created_by; P01 + DPO co-sign)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_prediction_models_code UNIQUE (tenant_id, model_code, version)
);
CREATE INDEX ix_prediction_models_tenant   ON prediction_models(tenant_id);
CREATE INDEX ix_prediction_models_entity   ON prediction_models(entity_id);
CREATE INDEX ix_prediction_models_status   ON prediction_models(status);
CREATE INDEX ix_prediction_models_fairness ON prediction_models(fairness_status);
CREATE INDEX ix_prediction_models_card     ON prediction_models(model_card_ref);
CREATE INDEX ix_prediction_models_approved ON prediction_models(approved_by);

-- E15 prediction_results (subject_id polymorphic — no FK) ------------------------------
CREATE TABLE prediction_results (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- result_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    model_id             uuid NOT NULL REFERENCES prediction_models(id) ON DELETE CASCADE,
    subject_type         g14_subject_type NOT NULL,
    subject_id           text NOT NULL,                  -- employee_id / org_unit_id / cadre (polymorphic)
    score                numeric(7,4) NOT NULL,          -- 0..1
    risk_band            g14_risk_band NOT NULL,
    top_factors_json     jsonb,
    confidence           numeric(5,4),
    is_individual_gated  boolean NOT NULL DEFAULT false, -- EMPLOYEE-subject rows require friction-gate
    period_key           text NOT NULL,
    data_as_of           timestamptz NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_prediction_score CHECK (score >= 0 AND score <= 1)
);
CREATE INDEX ix_prediction_results_tenant  ON prediction_results(tenant_id);
CREATE INDEX ix_prediction_results_entity  ON prediction_results(entity_id);
CREATE INDEX ix_prediction_results_model   ON prediction_results(model_id);
CREATE INDEX ix_prediction_results_subject ON prediction_results(subject_type, subject_id);
CREATE INDEX ix_prediction_results_period  ON prediction_results(period_key);


-- =====================================================================================
-- SECTION 9 — EMBED TOKENS, NL QUERY, SOURCE INTEGRATION
-- =====================================================================================

-- E18 embed_tokens (hardened — outbound via X.3; credentials via P04) ------------------
CREATE TABLE embed_tokens (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- token_id (opaque; never the bearer secret)
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    token_hash           text NOT NULL,                  -- hash of signed secret; secret never stored plaintext
    widget_ids           uuid[] NOT NULL,                -- scoped widgets/dashboards
    subject_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    subject_role         text,
    allowed_frame_ancestors text[] NOT NULL,             -- CSP frame-ancestors allow-list
    issued_by            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- maker
    approved_by          uuid REFERENCES users(id) ON DELETE SET NULL,           -- checker (!= issued_by; P01)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    expires_at           timestamptz NOT NULL,           -- short-lived
    rotated_from         uuid REFERENCES embed_tokens(id) ON DELETE SET NULL,    -- rotation lineage
    status               g14_embed_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    revoked_by           uuid REFERENCES users(id) ON DELETE SET NULL,
    revoked_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_embed_tokens_hash UNIQUE (tenant_id, token_hash)
);
CREATE INDEX ix_embed_tokens_tenant  ON embed_tokens(tenant_id);
CREATE INDEX ix_embed_tokens_entity  ON embed_tokens(entity_id);
CREATE INDEX ix_embed_tokens_subject ON embed_tokens(subject_user_id);
CREATE INDEX ix_embed_tokens_issued  ON embed_tokens(issued_by);
CREATE INDEX ix_embed_tokens_status  ON embed_tokens(status);
CREATE INDEX ix_embed_tokens_expires ON embed_tokens(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX ix_embed_tokens_rotated ON embed_tokens(rotated_from);

-- E20 nl_query_logs (P03-aligned grounding & guardrails — APPEND-ONLY) -----------------
CREATE TABLE nl_query_logs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- nlq_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    question_text        text NOT NULL,                  -- PII stripped server-side before any model call (P03)
    resolved_kpi_id      uuid REFERENCES kpi_definitions(id) ON DELETE SET NULL,
    resolved_filters_json jsonb,
    confidence           numeric(5,4) NOT NULL,
    outcome              g14_nlq_outcome NOT NULL,
    llm_provider         text NOT NULL,                  -- on-prem LLM (CGG Data Centre; no egress)
    data_as_of           timestamptz,
    occurred_at          timestamptz NOT NULL DEFAULT now(),
    correlation_id       text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid
    -- APPEND-ONLY: no updated_at, no is_deleted.
);
CREATE INDEX ix_nl_query_logs_tenant   ON nl_query_logs(tenant_id);
CREATE INDEX ix_nl_query_logs_entity   ON nl_query_logs(entity_id);
CREATE INDEX ix_nl_query_logs_user     ON nl_query_logs(user_id);
CREATE INDEX ix_nl_query_logs_kpi      ON nl_query_logs(resolved_kpi_id);
CREATE INDEX ix_nl_query_logs_outcome  ON nl_query_logs(outcome);
CREATE INDEX ix_nl_query_logs_occurred ON nl_query_logs(occurred_at);


-- =====================================================================================
-- SECTION 10 — ESTABLISHMENT REFERENCE, DPDP PROPAGATION, ANOMALIES
-- =====================================================================================

-- E21 establishment_positions (GAP gov-specific — named denominator source) ------------
CREATE TABLE establishment_positions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- position_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    position_code        text NOT NULL,                  -- sanctioned post identifier
    org_unit_id          uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    cadre                text NOT NULL,
    designation_id       uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    sanctioned_strength  integer NOT NULL,               -- authorised count
    reservation_category text,                           -- roster category
    roster_point         integer,
    filled_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,  -- read-link to G01
    effective_from       date NOT NULL,                  -- sanction effective date (VAL-EFFECTIVE)
    effective_to         date,                           -- abolition date
    status               g14_position_status NOT NULL DEFAULT 'SANCTIONED',
    maintained_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- Establishment Officer
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_establishment_positions_code UNIQUE (tenant_id, position_code),
    CONSTRAINT ck_establishment_strength CHECK (sanctioned_strength >= 0),
    CONSTRAINT ck_establishment_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_establishment_positions_tenant   ON establishment_positions(tenant_id);
CREATE INDEX ix_establishment_positions_entity   ON establishment_positions(entity_id);
CREATE INDEX ix_establishment_positions_orgunit  ON establishment_positions(org_unit_id);
CREATE INDEX ix_establishment_positions_desig    ON establishment_positions(designation_id);
CREATE INDEX ix_establishment_positions_filled   ON establishment_positions(filled_by_employee_id);
CREATE INDEX ix_establishment_positions_maintby  ON establishment_positions(maintained_by);
CREATE INDEX ix_establishment_positions_status   ON establishment_positions(status);

-- E22 data_subject_changes (DPDP propagation — reconciled with P05 + consent_records) --
CREATE TABLE data_subject_changes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- change_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- subject
    change_type          g14_dsc_change_type NOT NULL,
    source_event_ref     text NOT NULL,                  -- G01/DPO originating request id (or consent withdrawal)
    requested_by         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,      -- DPO/G01
    legal_basis          text,                           -- retention-override basis if erasure blocked
    affected_marts       text[],
    affected_snapshots   integer,
    affected_predictions integer,
    affected_exports     integer,
    status               g14_dsc_status NOT NULL DEFAULT 'RECEIVED',
    completed_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_data_subject_changes_tenant    ON data_subject_changes(tenant_id);
CREATE INDEX ix_data_subject_changes_entity    ON data_subject_changes(entity_id);
CREATE INDEX ix_data_subject_changes_employee  ON data_subject_changes(employee_id);
CREATE INDEX ix_data_subject_changes_requested ON data_subject_changes(requested_by);
CREATE INDEX ix_data_subject_changes_status    ON data_subject_changes(status);

-- E23 access_anomalies (derived from analytics_access_log; mutable workqueue) ----------
CREATE TABLE access_anomalies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- anomaly_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    anomaly_type         g14_anomaly_type NOT NULL,
    evidence_json        jsonb NOT NULL,                 -- metrics that tripped detection
    severity             g14_severity NOT NULL DEFAULT 'WARNING',
    detected_at          timestamptz NOT NULL DEFAULT now(),
    status               g14_anomaly_status NOT NULL DEFAULT 'OPEN',
    reviewed_by          uuid REFERENCES users(id) ON DELETE SET NULL,  -- Auditor/Analytics Admin
    notification_id      uuid REFERENCES notifications(id) ON DELETE SET NULL,  -- X.2
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_access_anomalies_tenant   ON access_anomalies(tenant_id);
CREATE INDEX ix_access_anomalies_entity   ON access_anomalies(entity_id);
CREATE INDEX ix_access_anomalies_user     ON access_anomalies(user_id);
CREATE INDEX ix_access_anomalies_type     ON access_anomalies(anomaly_type);
CREATE INDEX ix_access_anomalies_status   ON access_anomalies(status);
CREATE INDEX ix_access_anomalies_reviewer ON access_anomalies(reviewed_by);
CREATE INDEX ix_access_anomalies_notif    ON access_anomalies(notification_id);


-- =====================================================================================
-- SECTION 11 — ANALYTICS ACCESS LOG (async, PARTITIONED, APPEND-ONLY; mirrors into P05)
-- =====================================================================================
-- E16. Partitioned by occurred_at (RANGE). PK includes the partition key (PG requirement).
-- FULL-fidelity rows (RESTRICTED/EXPORT/DRILLTHROUGH/NL/individual-prediction) are mirrored
-- by the app/trigger layer into core audit_log/security_audit_log (P05) — not duplicated here.

CREATE TABLE analytics_access_log (
    id                   uuid NOT NULL DEFAULT gen_random_uuid(),  -- access_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action               g14_access_action NOT NULL,
    target_type          g14_access_target_type NOT NULL,
    target_id            text,
    scope_snapshot_json  jsonb NOT NULL,                 -- effective P02 scope at access time
    sensitivity          g14_sensitivity NOT NULL DEFAULT 'INTERNAL',
    log_fidelity         g14_log_fidelity NOT NULL DEFAULT 'FULL',
    purpose_text         text,                           -- captured for friction-gated access
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
CREATE INDEX ix_analytics_access_log_action   ON analytics_access_log(action);
CREATE INDEX ix_analytics_access_log_occurred ON analytics_access_log(occurred_at);
CREATE INDEX ix_analytics_access_log_corr     ON analytics_access_log(correlation_id);
COMMENT ON TABLE analytics_access_log IS 'Async, partitioned, append-only read-access ledger. FULL-fidelity events mirror into P05 audit_log/security_audit_log. Reading sensitive analytics is itself an audited action.';

-- Partitions: one explicit range (2026-H2) + a DEFAULT catch-all. Operations adds future
-- monthly/quarterly partitions on an X.1 maintenance job.
CREATE TABLE analytics_access_log_2026h2 PARTITION OF analytics_access_log
    FOR VALUES FROM ('2026-07-01') TO ('2027-01-01');
CREATE TABLE analytics_access_log_default PARTITION OF analytics_access_log DEFAULT;


-- =====================================================================================
-- SECTION R — ROW-LEVEL SECURITY (P02 tenant-isolation substrate; CONVENTIONS §6)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to EVERY G14 table (incl. append-only
-- ledgers — read isolation; their immutability is a separate grant/trigger concern owned
-- by P05). Module connects as a non-superuser role and sets per request:
--   SET app.current_tenant_id = '<tenant uuid>'; SET app.is_platform_admin = 'true'|'false';
-- analytics_scope_policies DECLARES P02 dimensions; this RLS is the tenant-isolation floor,
-- NOT a parallel scope engine. P02 layers scope_filter + field_mask + PII ceiling above it.
DO $$
DECLARE
    t text;
    g14_tables text[] := ARRAY[
        'source_data_contracts','analytics_datamarts','suppression_policies',
        'kpi_definitions','kpi_snapshots','kpi_target_history',
        'saved_reports','dashboards','dashboard_widgets','saved_views',
        'report_schedules','report_executions','datamart_refresh_logs',
        'analytics_scope_policies','alert_rules','alert_events',
        'prediction_models','prediction_results',
        'embed_tokens','nl_query_logs',
        'establishment_positions','data_subject_changes','access_anomalies',
        'analytics_access_log'
    ];
BEGIN
    FOREACH t IN ARRAY g14_tables LOOP
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
-- Reuses 00-core fixed UUIDs (tenant 1111..1111, entity 2222..2201, org_units 3333..3301/02,
-- designation 7777..7701, employees 9999..9901/02). One analytics user is seeded into the
-- core users table so NOT-NULL user FKs resolve (data seed only; users is not redefined).
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- analytics user (core users row referenced by owner/maker/checker FKs) ----------------
INSERT INTO users (id, tenant_id, entity_id, username, official_email, auth_method, status, mfa_enabled) VALUES
 ('14000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','analytics_admin','analytics.admin@gov.example','PASSWORD','ACTIVE', true);

-- source_data_contracts ---------------------------------------------------------------
INSERT INTO source_data_contracts (id, tenant_id, entity_id, source_module, source_view, version, schema_json, cdc_mechanism, breaking_change_policy, status, co_signed_by) VALUES
 ('14c10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','G01','g01.v_employee_core_v2','2.0.0','{"columns":["employee_id","org_unit_id","employment_status","cadre_id"]}','DEBEZIUM_CDC','30-day notice; alert MSG-G14 on breaking change','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14c10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','G10','g10.v_payroll_locked_v3','3.0.0','{"columns":["employee_id","period","gross","overtime"],"note":"locked snapshots only"}','BATCH','60-day notice; locked-period only','ACTIVE','14000000-0000-0000-0000-0000000000aa');

-- analytics_datamarts (read models — definition/metadata) ------------------------------
INSERT INTO analytics_datamarts (id, tenant_id, entity_id, mart_code, name, mart_type, grain, source_modules, source_objects, contract_id, refresh_strategy, refresh_job_id, refresh_cron, freshness_sla_minutes, watermark_column, health_status, contains_pii) VALUES
 ('14a10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MART_HEADCOUNT','Headcount Fact','FACT','employee x org_unit x period','{G01}','{g01.v_employee_core_v2}','14c10001-0000-0000-0000-000000000001','CDC','JOB-G14-MART-HEADCOUNT','*/30 * * * *', 60,'updated_at','HEALTHY', true),
 ('14a10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MART_ESTABLISHMENT','Establishment / Vacancy Aggregate','AGGREGATE','org_unit x cadre','{G14}','{g14.v_establishment_positions}',NULL,'INCREMENTAL','JOB-G14-MART-ESTAB','0 * * * *', 120,'effective_from','HEALTHY', false);

-- suppression_policies ----------------------------------------------------------------
INSERT INTO suppression_policies (id, tenant_id, entity_id, name, applies_to, min_cell_size_k, complementary, band_instead_of_hide, domains, is_active) VALUES
 ('14f10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Default k=5 complementary','ALL', 5, true, false,'{WORKFORCE,COMPLIANCE}', true),
 ('14f10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Export banded k=10','EXPORT', 10, true, true,'{PAYROLL}', true);

-- kpi_definitions ---------------------------------------------------------------------
INSERT INTO kpi_definitions (id, tenant_id, entity_id, kpi_code, name, description, domain, version, definition_hash, source_mart_id, expression, unit, grain, default_period, dimensions_allowed, reconciliation_target, reconciliation_tolerance, direction, sensitivity, status, approved_by) VALUES
 ('14b10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','HEADCOUNT_ACTIVE','Active Headcount','Count of employees with employment_status = ACTIVE at period end.','WORKFORCE', 3,'sha256:hc3a9f','14a10001-0000-0000-0000-000000000001','count_distinct(employee_id) where employment_status = ''ACTIVE''','COUNT','ORG_UNIT','MONTH','{org_unit,cadre}','G01.employees(active)', 0.0000,'ON_TARGET','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','VACANCY_PCT','Vacancy % (sanctioned vs filled)','(sanctioned_strength - filled) / sanctioned_strength as percent.','WORKFORCE', 1,'sha256:vac1b2','14a10001-0000-0000-0000-000000000002','100 * (sum(sanctioned_strength) - count(filled_by_employee_id)) / nullif(sum(sanctioned_strength),0)','PERCENT','CADRE','MONTH','{cadre,org_unit}','G14.establishment_positions', 0.5000,'LOWER_BETTER','INTERNAL','ACTIVE',NULL);

-- kpi_snapshots (bitemporal: the 2026-05 row is a Sept restatement) --------------------
INSERT INTO kpi_snapshots (id, tenant_id, entity_id, kpi_id, kpi_version, definition_hash, scope_type, scope_id, period_key, valid_time, knowledge_time, is_superseded, value, cell_size, data_as_of) VALUES
 ('14b20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14b10001-0000-0000-0000-000000000001', 3,'sha256:hc3a9f','ORG_UNIT','33333333-3333-3333-3333-333333333301','2026-06','2026-06-30','2026-07-01T02:00:00Z', false, 1842, 1842,'2026-07-01T01:45:00Z'),
 ('14b20001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14b10001-0000-0000-0000-000000000001', 3,'sha256:hc3a9f','ORG_UNIT','33333333-3333-3333-3333-333333333301','2026-05','2026-05-31','2026-09-10T02:00:00Z', false, 1839, 1839,'2026-09-10T01:45:00Z');

-- kpi_target_history (effective-dated) ------------------------------------------------
INSERT INTO kpi_target_history (id, tenant_id, entity_id, kpi_id, scope_type, scope_id, target_value, target_kind, effective_from, set_by, status) VALUES
 ('14b30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14b10001-0000-0000-0000-000000000002','ENTERPRISE',NULL, 8.0000,'KPI_TARGET','2026-04-01','14000000-0000-0000-0000-0000000000aa','ACTIVE'),
 ('14b30001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14b10001-0000-0000-0000-000000000002','ENTERPRISE',NULL, 12.0000,'ALERT_THRESHOLD','2026-04-01','14000000-0000-0000-0000-0000000000aa','ACTIVE');

-- saved_reports -----------------------------------------------------------------------
INSERT INTO saved_reports (id, tenant_id, entity_id, report_code, name, domain, source_mart_id, select_fields_json, row_limit, sensitivity, owner_user_id, visibility, status) VALUES
 ('14d20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RPT-HEADCOUNT-OU','Headcount by Org Unit','WORKFORCE','14a10001-0000-0000-0000-000000000001','{"fields":["org_unit","headcount_active"]}', 100000,'INTERNAL','14000000-0000-0000-0000-0000000000aa','SHARED_SCOPE','ACTIVE'),
 ('14d20001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RPT-VACANCY-CADRE','Vacancy by Cadre','WORKFORCE','14a10001-0000-0000-0000-000000000002','{"fields":["cadre","vacancy_pct"]}', 50000,'INTERNAL','14000000-0000-0000-0000-0000000000aa','PRIVATE','DRAFT');

-- dashboards --------------------------------------------------------------------------
INSERT INTO dashboards (id, tenant_id, entity_id, dashboard_code, name, target_role, category, layout_json, is_system, status, published_by, published_at) VALUES
 ('14d10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','EXEC_WORKFORCE','Executive Workforce Overview','EXECUTIVE','EXECUTIVE','{"grid":[{"i":"w1","x":0,"y":0,"w":6,"h":4}]}', true,'PUBLISHED','14000000-0000-0000-0000-0000000000aa', now()),
 ('14d10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MGR_TEAM','My Team Dashboard','MANAGER','OPERATIONAL','{"grid":[{"i":"w1","x":0,"y":0,"w":4,"h":3}]}', true,'PUBLISHED','14000000-0000-0000-0000-0000000000aa', now()),
 ('14d10001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','COMP_RESERVATION','Reservation Roster Compliance','DEPT_HEAD','COMPLIANCE','{"grid":[{"i":"w1","x":0,"y":0,"w":12,"h":6}]}', true,'PUBLISHED','14000000-0000-0000-0000-0000000000aa', now());

-- dashboard_widgets -------------------------------------------------------------------
INSERT INTO dashboard_widgets (id, tenant_id, entity_id, dashboard_id, title, widget_type, kpi_id, position_json, refresh_hint, display_order) VALUES
 ('14d30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14d10001-0000-0000-0000-000000000001','Active Headcount','KPI_TILE','14b10001-0000-0000-0000-000000000001','{"x":0,"y":0,"w":3,"h":2}','MART', 1),
 ('14d30001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14d10001-0000-0000-0000-000000000003','Vacancy % by Cadre','BAR','14b10001-0000-0000-0000-000000000002','{"x":0,"y":0,"w":6,"h":4}','MART', 1);

-- analytics_scope_policies (declares P02 dimensions; one ACTIVE per role,mart) ---------
INSERT INTO analytics_scope_policies (id, tenant_id, entity_id, role, scope_dimensions, mart_id, priority, version, status, approved_by, is_active) VALUES
 ('14e10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MANAGER','{reporting_chain}',NULL, 1, 1,'ACTIVE','14000000-0000-0000-0000-0000000000aa', true),
 ('14e10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','HR_ADMIN','{org_unit,UAG}',NULL, 1, 1,'ACTIVE','14000000-0000-0000-0000-0000000000aa', true),
 ('14e10001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','EXECUTIVE','{entity}',NULL, 1, 1,'PENDING_APPROVAL',NULL, false);

-- prediction_models -------------------------------------------------------------------
INSERT INTO prediction_models (id, tenant_id, entity_id, model_code, model_type, determinism, version, features_json, protected_features_excluded, methodology, fairness_status, intended_use, prohibited_use, source_mart_ids, status, approved_by) VALUES
 ('14b40001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RETIREMENT_FORECAST','RULE_BASED','DETERMINISTIC','v1','{"inputs":["dob","retirement_rule"]}','{}','DOB + canonical superannuation rule.','NOT_ASSESSED','Retirement profiling / succession planning.','Not the sole/primary basis for any administrative action.','{14a10001-0000-0000-0000-000000000001}','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b40001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ATTRITION_RISK','ML','PROBABILISTIC','v2','{"inputs":["tenure","leave_pattern","transfer_count"]}','{reservation_category,gender,disability,maternity_leave_proxy}','Gradient-boosted classifier; explainable top-factors.','PASSED','Advisory aggregate attrition risk.','Must not be sole/primary basis for any administrative action; individual scores friction-gated.','{14a10001-0000-0000-0000-000000000001}','ACTIVE','14000000-0000-0000-0000-0000000000aa');

-- establishment_positions -------------------------------------------------------------
INSERT INTO establishment_positions (id, tenant_id, entity_id, position_code, org_unit_id, cadre, designation_id, sanctioned_strength, reservation_category, roster_point, filled_by_employee_id, effective_from, status, maintained_by) VALUES
 ('14e20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','POS-DIST12-GA-01','33333333-3333-3333-3333-333333333301','GROUP_A','77777777-7777-7777-7777-777777777701', 120,'UR', 1,'99999999-9999-9999-9999-999999999901','2024-04-01','SANCTIONED','14000000-0000-0000-0000-0000000000aa'),
 ('14e20001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','POS-DIST12-GA-07','33333333-3333-3333-3333-333333333301','GROUP_A','77777777-7777-7777-7777-777777777701', 1,'SC', 7,NULL,'2024-04-01','SANCTIONED','14000000-0000-0000-0000-0000000000aa');

-- data_subject_changes ----------------------------------------------------------------
INSERT INTO data_subject_changes (id, tenant_id, entity_id, employee_id, change_type, source_event_ref, requested_by, legal_basis, affected_snapshots, status, completed_at) VALUES
 ('14e30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','RECTIFICATION','DPO-REQ-2026-0441','14000000-0000-0000-0000-0000000000aa',NULL, 36,'COMPLETED', now()),
 ('14e30001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','ERASURE','DPO-REQ-2026-0452','14000000-0000-0000-0000-0000000000aa','Pension statutory retention 7y', 0,'BLOCKED_RETENTION',NULL);

-- RECON (prototype) SEEDS — dept-view tile coverage --------------------------------------
-- Additional read-model marts for the operational dept dashboards (LEAVE/ATTENDANCE/
-- APPRAISAL). Marts are DEFINITIONS over contracted G03/G08 source views (not forks).
INSERT INTO analytics_datamarts (id, tenant_id, entity_id, mart_code, name, mart_type, grain, source_modules, source_objects, contract_id, refresh_strategy, refresh_job_id, refresh_cron, freshness_sla_minutes, watermark_column, health_status, contains_pii) VALUES
 ('14a10001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MART_LEAVE','Leave Fact','FACT','employee x org_unit x day','{G03}','{g03.v_leave_ledger_v2}',NULL,'CDC','JOB-G14-MART-LEAVE','*/30 * * * *', 60,'updated_at','HEALTHY', true),
 ('14a10001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MART_ATTENDANCE','Attendance Fact','FACT','employee x org_unit x day','{G03}','{g03.v_attendance_daily_v2}',NULL,'CDC','JOB-G14-MART-ATT','*/15 * * * *', 30,'work_date','HEALTHY', true),
 ('14a10001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','MART_APPRAISAL','Appraisal Rating Aggregate','AGGREGATE','employee x org_unit x cycle','{G08}','{g08.v_appraisal_ratings_v1}',NULL,'INCREMENTAL','JOB-G14-MART-APPR','0 2 * * *', 720,'finalised_at','HEALTHY', false);

-- kpi_definitions matching the concrete dept-view tiles (LEAVE / ATTENDANCE / APPRAISAL /
-- WORKFORCE). Each resolves to a mart; slicing dimensions (grade_band, team) are config,
-- not columns. HEADCOUNT_ACTIVE already covers dept-headcount (add grade_band to its
-- dimensions_allowed — data config, not a schema change).
INSERT INTO kpi_definitions (id, tenant_id, entity_id, kpi_code, name, description, domain, version, definition_hash, source_mart_id, expression, unit, grain, default_period, dimensions_allowed, direction, sensitivity, status, approved_by) VALUES
 ('14b10001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','LEAVE_ON_TODAY','On Leave Today','Count of employees on approved leave for the current day (dept-attendance / dept-leave tile).','LEAVE', 1,'sha256:lv1a01','14a10001-0000-0000-0000-000000000003','count_distinct(employee_id) where leave_status = ''APPROVED'' and work_date = current_date','COUNT','ORG_UNIT','DAY','{org_unit,team,leave_type}','LOWER_BETTER','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ATT_PRESENT_PCT','Present Today %','Share of team present today (dept-attendance "Present today").','ATTENDANCE', 1,'sha256:at1p01','14a10001-0000-0000-0000-000000000004','100 * count(distinct employee_id) filter (where status = ''PRESENT'') / nullif(count(distinct employee_id),0)','PERCENT','ORG_UNIT','DAY','{org_unit,team}','HIGHER_BETTER','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ATT_WFH_TODAY','WFH Today','Count of employees working from home today (dept-attendance "WFH").','ATTENDANCE', 1,'sha256:at1w01','14a10001-0000-0000-0000-000000000004','count_distinct(employee_id) where status = ''WFH'' and work_date = current_date','COUNT','ORG_UNIT','DAY','{org_unit,team}','ON_TARGET','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ATT_AVG_WORK_HRS','Avg Work Hours','Average worked hours per present employee for the day (dept-attendance "Avg work hrs").','ATTENDANCE', 1,'sha256:at1h01','14a10001-0000-0000-0000-000000000004','avg(worked_minutes)/60.0','HOURS','ORG_UNIT','DAY','{org_unit,team}','ON_TARGET','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PERF_AVG_RATING','Average Rating','Mean final appraisal rating for the cycle (dept-performance "Avg rating"; band distribution via rating_band dimension).','APPRAISAL', 1,'sha256:pf1r01','14a10001-0000-0000-0000-000000000005','avg(final_rating)','SCORE','ORG_UNIT','YEAR','{org_unit,team,rating_band}','HIGHER_BETTER','RESTRICTED','ACTIVE','14000000-0000-0000-0000-0000000000aa'),
 ('14b10001-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ATTRITION_LTM_PCT','Attrition % (LTM)','Rolling 12-month attrition rate by org unit (dept-view "Attrition (LTM)").','WORKFORCE', 1,'sha256:wf1a01','14a10001-0000-0000-0000-000000000001','100 * separations_ltm / nullif(avg_headcount_ltm,0)','PERCENT','ORG_UNIT','ROLLING_12M','{org_unit,team,cadre}','LOWER_BETTER','INTERNAL','ACTIVE','14000000-0000-0000-0000-0000000000aa');

-- dashboard_widgets binding the new dept KPIs onto the MGR_TEAM dashboard --------------
INSERT INTO dashboard_widgets (id, tenant_id, entity_id, dashboard_id, title, widget_type, kpi_id, position_json, refresh_hint, display_order) VALUES
 ('14d30001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14d10001-0000-0000-0000-000000000002','Present Today %','KPI_TILE','14b10001-0000-0000-0000-000000000004','{"x":3,"y":0,"w":3,"h":2}','LIVE', 2),
 ('14d30001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14d10001-0000-0000-0000-000000000002','On Leave Today','KPI_TILE','14b10001-0000-0000-0000-000000000003','{"x":6,"y":0,"w":3,"h":2}','LIVE', 3),
 ('14d30001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','14d10001-0000-0000-0000-000000000002','Team Avg Rating','KPI_TILE','14b10001-0000-0000-0000-000000000007','{"x":9,"y":0,"w":3,"h":2}','MART', 4);

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 14-G14-dashboard-analytics.sql  (24 module-owned tables)
-- =====================================================================================
