-- PH-09A migration 0014: G10/G11 persisted, effective-dated rule substrate — faithful subset of
-- docs/data-model/10-G10-payroll-benefits.sql and docs/data-model/11-G11-retirement-pension.sql.
-- Tables: g10_pay_components (E05 catalogue, pinned DSL grammar version),
--         g10_rate_tables (E07: DA/HRA/NPS/PT/TAX slabs; PT is state-dimensioned —
--             ck_g10_rate_pt_state backs ERR-G10-PT-STATE; the uq_g10_rate_effective
--             partial unique index backs VAL-G10-RATE-NONOVERLAP / ERR-G10-RATE-OVERLAP),
--         g10_pay_rules (E06: versioned constrained-DSL formula per component —
--             VAL-G10-DSL-TOKEN / ERR-G10-RULE-EXPR enforced in the service layer),
--         pen_da_relief_rates .. pen_rounding_rules (G11 FR-19 rule tables E30-E36,
--             effective-dated; resolve-miss -> ERR-G11-RULE-NOT-EFFECTIVE, commutation
--             age-key miss -> ERR-G11-FACTOR-NOT-FOUND in the service layer).
-- Money columns are NUMERIC(15,2); services exchange integer cents (and integer basis
-- points / 10^-4 factors), converting in SQL — never through parseFloat/toFixed.

-- SECTION 1 — ENUM TYPES (g10_/g11_ prefixes; UPPER_SNAKE values, CONVENTIONS §4)










-- SECTION 2 — E05 g10_pay_components (component catalogue; BRD G10 FR-01)
CREATE TABLE g10_pay_components (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    component_code      text NOT NULL,
    name                text NOT NULL,
    category            text NOT NULL,
    calc_method         text NOT NULL DEFAULT 'FORMULA',
    is_taxable          boolean NOT NULL DEFAULT false,
    is_statutory        boolean NOT NULL DEFAULT false,
    display_order       integer NOT NULL DEFAULT 0,
    dsl_grammar_version text,
    status              text NOT NULL DEFAULT 'DRAFT',
    effective_from      date,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_pay_components_code UNIQUE (tenant_id, component_code)
);
CREATE INDEX ix_g10_pay_components_tenant   ON g10_pay_components(tenant_id);
CREATE INDEX ix_g10_pay_components_category ON g10_pay_components(category);

-- SECTION 3 — E07 g10_rate_tables (DA%, HRA class %, PT slabs by state, tax slabs; BRD FR-02)
CREATE TABLE g10_rate_tables (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    table_type          text NOT NULL,
    state               text,
    city_class          text,
    regime              text,
    financial_year      text,
    key_code            text,
    slab_min            bigint,
    slab_max            bigint,
    rate_pct            numeric(9,4),
    flat_amount         bigint,
    effective_from      date NOT NULL,
    effective_to        date,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_rate_pt_state   CHECK (table_type <> 'PT_SLAB'  OR state  IS NOT NULL),
    CONSTRAINT ck_g10_rate_tax_regime CHECK (table_type <> 'TAX_SLAB' OR (regime IS NOT NULL AND financial_year IS NOT NULL)),
    CONSTRAINT ck_g10_rate_slab       CHECK (slab_max IS NULL OR slab_min IS NULL OR slab_max >= slab_min),
    CONSTRAINT ck_g10_rate_window     CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
-- Non-overlap key start (VAL-G10-RATE-NONOVERLAP): one window start per rate dimension key.
CREATE UNIQUE INDEX uq_g10_rate_effective ON g10_rate_tables (
    tenant_id, COALESCE(entity_id,'00000000-0000-0000-0000-000000000000'::text),
    table_type, COALESCE(state,''), COALESCE(city_class,''), COALESCE(regime,'NEW'::text),
    COALESCE(financial_year,''), COALESCE(slab_min,-1), effective_from
) WHERE is_deleted = false;
CREATE INDEX ix_g10_rate_tables_lookup ON g10_rate_tables(tenant_id, table_type, state, effective_from);

-- SECTION 4 — E06 g10_pay_rules (versioned constrained-DSL rule per component; BRD FR-01)
CREATE TABLE g10_pay_rules (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    pay_component_id    text NOT NULL REFERENCES g10_pay_components(id) ON DELETE RESTRICT,
    version             integer NOT NULL DEFAULT 1,
    calc_method         text NOT NULL,
    formula_expression  text,
    rate_table_id       text REFERENCES g10_rate_tables(id) ON DELETE RESTRICT,
    computation_order   integer NOT NULL,
    rounding_rule       text,
    dsl_grammar_version text,
    effective_from      date NOT NULL,
    effective_to        date,
    status              text NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_pay_rules_version UNIQUE (pay_component_id, version),
    CONSTRAINT ck_g10_pay_rules_window  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_g10_pay_rules_tenant    ON g10_pay_rules(tenant_id);
CREATE INDEX ix_g10_pay_rules_component ON g10_pay_rules(pay_component_id);

-- SECTION 5 — G11 FR-19 rule tables E30-E36 (effective-dated statutory parameters)

-- E30 pen_da_relief_rates
CREATE TABLE pen_da_relief_rates (
    id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id            text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code            varchar(48) NOT NULL,
    applies_to           text NOT NULL DEFAULT 'PENSIONER',
    da_percent           numeric(9,4) NOT NULL,
    pay_commission_basis varchar(24),
    effective_from       date NOT NULL,
    effective_to         date,
    version_no           integer NOT NULL DEFAULT 1,
    status               text NOT NULL DEFAULT 'DRAFT',
    approved_by          text,
    approved_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text,
    updated_by           text,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_dar_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_dar_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_pen_dar_tenant ON pen_da_relief_rates(tenant_id);
CREATE INDEX ix_pen_dar_eff    ON pen_da_relief_rates(effective_from);

-- E31 pen_commutation_factors (lookup key: age next birthday)
CREATE TABLE pen_commutation_factors (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code           varchar(48) NOT NULL,
    age_next_birthday   integer NOT NULL,
    factor              numeric(9,4) NOT NULL,
    effective_from      date NOT NULL,
    effective_to        date,
    version_no          integer NOT NULL DEFAULT 1,
    status              text NOT NULL DEFAULT 'DRAFT',
    approved_by         text,
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_cf_code_age_ver UNIQUE (tenant_id, rule_code, age_next_birthday, version_no),
    CONSTRAINT ck_pen_cf_age CHECK (age_next_birthday BETWEEN 17 AND 100)
);
CREATE INDEX ix_pen_cf_tenant ON pen_commutation_factors(tenant_id);
CREATE INDEX ix_pen_cf_age    ON pen_commutation_factors(age_next_birthday);

-- E32 pen_family_pension_rates (normal/enhanced)
CREATE TABLE pen_family_pension_rates (
    id                            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                     text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                     varchar(48) NOT NULL,
    normal_rate_pct               numeric(9,4) NOT NULL,
    enhanced_rate_pct             numeric(9,4),
    enhanced_in_service_years     integer NOT NULL DEFAULT 10,
    enhanced_after_retire_years   integer NOT NULL DEFAULT 7,
    enhanced_after_retire_age_cap integer NOT NULL DEFAULT 67,
    dual_fp_cap_amount            bigint,
    effective_from                date NOT NULL,
    effective_to                  date,
    version_no                    integer NOT NULL DEFAULT 1,
    status                        text NOT NULL DEFAULT 'DRAFT',
    approved_by                   text,
    approved_at                   timestamptz,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    text,
    updated_by                    text,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_fpr_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_fpr_tenant ON pen_family_pension_rates(tenant_id);
CREATE INDEX ix_pen_fpr_eff    ON pen_family_pension_rates(effective_from);

-- E33 pen_gratuity_ceilings (DA-linked auto-step)
CREATE TABLE pen_gratuity_ceilings (
    id                        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                 text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                 varchar(48) NOT NULL,
    base_ceiling              bigint NOT NULL,
    da_threshold_pct          numeric(9,4) NOT NULL DEFAULT 0.50,
    auto_step_pct             numeric(9,4) NOT NULL DEFAULT 0.25,
    current_effective_ceiling bigint NOT NULL,
    da_rate_ref               text REFERENCES pen_da_relief_rates(id) ON DELETE RESTRICT,
    effective_from            date NOT NULL,
    effective_to              date,
    version_no                integer NOT NULL DEFAULT 1,
    status                    text NOT NULL DEFAULT 'DRAFT',
    approved_by               text,
    approved_at               timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                text,
    updated_by                text,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_gc_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_gc_tenant ON pen_gratuity_ceilings(tenant_id);
CREATE INDEX ix_pen_gc_darate ON pen_gratuity_ceilings(da_rate_ref);

-- E34 pen_retirement_age_rules
CREATE TABLE pen_retirement_age_rules (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code           varchar(48) NOT NULL,
    cadre               varchar(60),
    category            varchar(60),
    superannuation_age  integer NOT NULL,
    effective_from      date NOT NULL,
    effective_to        date,
    version_no          integer NOT NULL DEFAULT 1,
    status              text NOT NULL DEFAULT 'DRAFT',
    approved_by         text,
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rar_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_rar_age CHECK (superannuation_age BETWEEN 50 AND 75)
);
CREATE INDEX ix_pen_rar_tenant ON pen_retirement_age_rules(tenant_id);

-- E35 pen_pension_limit_rules (min/max pension + qualifying-service floors)
CREATE TABLE pen_pension_limit_rules (
    id                               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                        text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                        varchar(48) NOT NULL,
    min_pension                      bigint NOT NULL,
    max_pension                      bigint NOT NULL,
    min_qualifying_years_for_pension integer NOT NULL DEFAULT 10,
    min_qualifying_years_for_full    integer NOT NULL DEFAULT 10,
    ups_min_guarantee                bigint,
    effective_from                   date NOT NULL,
    effective_to                     date,
    version_no                       integer NOT NULL DEFAULT 1,
    status                           text NOT NULL DEFAULT 'DRAFT',
    approved_by                      text,
    approved_at                      timestamptz,
    created_at                       timestamptz NOT NULL DEFAULT now(),
    updated_at                       timestamptz NOT NULL DEFAULT now(),
    created_by                       text,
    updated_by                       text,
    is_deleted                       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_plr_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_plr_minmax CHECK (max_pension >= min_pension)
);
CREATE INDEX ix_pen_plr_tenant ON pen_pension_limit_rules(tenant_id);

-- E36 pen_rounding_rules
CREATE TABLE pen_rounding_rules (
    id                                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                         text REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                         varchar(48) NOT NULL,
    half_year_threshold_months        integer NOT NULL DEFAULT 3,
    money_rounding                    text NOT NULL DEFAULT 'NEXT_HIGHER_RUPEE',
    qualifying_service_cap_half_years integer NOT NULL DEFAULT 66,
    effective_from                    date NOT NULL,
    effective_to                      date,
    version_no                        integer NOT NULL DEFAULT 1,
    status                            text NOT NULL DEFAULT 'DRAFT',
    approved_by                       text,
    approved_at                       timestamptz,
    created_at                        timestamptz NOT NULL DEFAULT now(),
    updated_at                        timestamptz NOT NULL DEFAULT now(),
    created_by                        text,
    updated_by                        text,
    is_deleted                        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rr_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_rr_tenant ON pen_rounding_rules(tenant_id);
