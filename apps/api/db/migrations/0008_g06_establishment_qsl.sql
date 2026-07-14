-- PH-08A migration 0008: G06 statutory shared kernels — faithful subset of
-- docs/data-model/06-G06-promotion-posting-progression.sql
-- Tables: g06_service_exclusion_rules (5.2.27), g06_sanctioned_posts (5.2.25),
--         g06_qualifying_service_ledger (5.2.26)
-- BRD: FR-PPP-015 (establishment-strength register + vacancy computation,
--      VAL-G06-QUOTA-SPLIT / VAL-G06-VACANCY-RECON) and FR-PPP-016 (qualifying-service
--      ledger + service-exclusion engine, VAL-G06-QUALSVC).

-- SECTION 1 — ENUM TYPES (g06_ prefix; UPPER_SNAKE values, CONVENTIONS §4)



-- SECTION 2 — 5.2.27 service_exclusion_rules (pinned exclusion logic, FR-016)
CREATE TABLE g06_service_exclusion_rules (
    id                            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                     text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                     varchar(40) NOT NULL,
    eol_counts_as_qualifying      boolean NOT NULL DEFAULT false,
    eol_max_condonable_days       integer,
    dies_non_excluded             boolean NOT NULL DEFAULT true,
    suspension_treatment          text NOT NULL DEFAULT 'EXCLUDE',
    adhoc_service_counts          boolean NOT NULL DEFAULT false,
    adhoc_counts_if_regularised   boolean NOT NULL DEFAULT true,
    deputation_counts             boolean NOT NULL DEFAULT true,
    break_in_service_resets_clock boolean NOT NULL DEFAULT false,
    effective_from                date,
    effective_to                  date,
    is_active                     boolean NOT NULL DEFAULT true,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    text,
    updated_by                    text,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g06_ser_code UNIQUE (tenant_id, rule_code)
);
CREATE INDEX ix_g06_ser_tenant ON g06_service_exclusion_rules(tenant_id);
CREATE INDEX ix_g06_ser_entity ON g06_service_exclusion_rules(entity_id);
CREATE INDEX ix_g06_ser_active ON g06_service_exclusion_rules(is_active);

-- SECTION 3 — 5.2.25 sanctioned_posts (establishment-strength register, FR-015)
CREATE TABLE g06_sanctioned_posts (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    cadre_id                    text NOT NULL REFERENCES cadres(id) ON DELETE RESTRICT,
    grade_designation_id        text NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    org_unit_id                 text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
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
    status                      text NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_sp_nonneg  CHECK (sanctioned_strength >= 0 AND filled_count >= 0),
    CONSTRAINT ck_g06_sp_filled  CHECK (filled_count <= sanctioned_strength),                 -- STRENGTH_INCONSISTENT (§5.6-15)
    CONSTRAINT ck_g06_sp_quota   CHECK (dr_quota_pct + promotion_quota_pct + ldce_quota_pct <= 100) -- QUOTA_SPLIT_INVALID (VAL-G06-QUOTA-SPLIT)
);
CREATE INDEX ix_g06_sp_tenant ON g06_sanctioned_posts(tenant_id);
CREATE INDEX ix_g06_sp_entity ON g06_sanctioned_posts(entity_id);
CREATE INDEX ix_g06_sp_cadre  ON g06_sanctioned_posts(cadre_id);
CREATE INDEX ix_g06_sp_grade  ON g06_sanctioned_posts(grade_designation_id);
CREATE INDEX ix_g06_sp_org    ON g06_sanctioned_posts(org_unit_id);
CREATE INDEX ix_g06_sp_status ON g06_sanctioned_posts(status);
CREATE INDEX ix_g06_sp_ason   ON g06_sanctioned_posts(as_on_date);

-- SECTION 4 — 5.2.26 qualifying_service_ledger (supersede-only lineage; soft delete only, FR-016)
CREATE TABLE g06_qualifying_service_ledger (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- qsl_snapshot_id (immutable snapshot)
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    grade_designation_id        text NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    as_of_date                  date NOT NULL,
    gross_service_years         numeric(6,3) NOT NULL,
    total_exclusion_days        integer NOT NULL DEFAULT 0,
    net_qualifying_years        numeric(6,3) NOT NULL,                                  -- VAL-G06-QUALSVC
    exclusion_breakdown_json    jsonb NOT NULL,
    service_exclusion_rule_id   text NOT NULL REFERENCES g06_service_exclusion_rules(id) ON DELETE RESTRICT,
    computed_by_version         varchar(20) NOT NULL,
    is_current                  boolean NOT NULL DEFAULT true,
    superseding_snapshot_id     text REFERENCES g06_qualifying_service_ledger(id) ON DELETE SET NULL,
    legacy_source_id            varchar(80),                                            -- P06 migration cross-ref
    computed_at                 timestamptz NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g06_qsl_net CHECK (net_qualifying_years >= 0 AND total_exclusion_days >= 0)
);
CREATE INDEX ix_g06_qsl_tenant    ON g06_qualifying_service_ledger(tenant_id);
CREATE INDEX ix_g06_qsl_entity    ON g06_qualifying_service_ledger(entity_id);
CREATE INDEX ix_g06_qsl_emp       ON g06_qualifying_service_ledger(employee_id);
CREATE INDEX ix_g06_qsl_grade     ON g06_qualifying_service_ledger(grade_designation_id);
CREATE INDEX ix_g06_qsl_ser       ON g06_qualifying_service_ledger(service_exclusion_rule_id);
CREATE INDEX ix_g06_qsl_supersede ON g06_qualifying_service_ledger(superseding_snapshot_id);
CREATE INDEX ix_g06_qsl_asof      ON g06_qualifying_service_ledger(as_of_date);
CREATE INDEX ix_g06_qsl_current   ON g06_qualifying_service_ledger(employee_id, grade_designation_id) WHERE is_current;
