-- PH-09C migration 0016: G11 scheme-branched pension depth — faithful subset of
-- docs/data-model/11-G11-retirement-pension.sql for the benefit entities:
--   E07 pen_pension_calculations        (scheme + benefit_outcome branch result; rule_version_ref
--       FK to the E35 pen_pension_limit_rules row EFFECTIVE on the calc date — IR17),
--   E08 pen_commutation_records         (factor FK to E31 pen_commutation_factors resolved by
--       age-next-birthday; restoration_due_date = reduction_effective_date + 15 yrs — IR4a;
--       ERR-G11-COMMUTATION-LIMIT / ERR-G11-FACTOR-NOT-FOUND enforced in the service layer),
--   E09 pen_gratuity_calculations       (RETIREMENT/DEATH/SERVICE types; payable clamped to the
--       E33 pen_gratuity_ceilings row captured in ceiling_ref; Rule-9 withholding fields),
--   E10 pen_family_pension_records      (normal + ENHANCED rates from E32 pen_family_pension_rates;
--       enhanced_window_rule records the path-specific window applied — FR-08 AC2a),
--   E41 pen_provisional_pension_records (Rule 9: DCRG fully withheld while status=ACTIVE — IR15;
--       ERR-G11-PROVISIONAL-PENDING enforced in the service layer).
-- Subset deviations (same approach as 0014/0015): case_id is a plain text — the pen_separation_cases
-- aggregate lives service-side in this phase; nominee/family-member FKs (E21/E26) are out of the
-- PH-09C slice. Money columns are NUMERIC(15,2); services exchange integer cents (rates in integer
-- basis points, factors/slabs x 10^4), converting in SQL — never through float parsing.

-- SECTION 1 — ENUM TYPES (g11_ prefix; UPPER_SNAKE values, CONVENTIONS §4)













-- SECTION 2 — E07 pen_pension_calculations (BRD G11 FR-05)
CREATE TABLE pen_pension_calculations (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     text NOT NULL,                          -- pen_separation_cases (service-side)
    scheme                      text NOT NULL,
    benefit_outcome             text NOT NULL,
    emoluments_base             bigint NOT NULL,                 -- from G10 (last pay drawn)
    emoluments_method           text NOT NULL,
    avg_emoluments              bigint,
    qualifying_half_years       integer NOT NULL,
    pension_fraction            numeric(9,4) NOT NULL,                  -- flat 0.50 for >=10 yrs (FR-05 AC1)
    basic_pension               bigint NOT NULL,
    minimum_pension_applied     boolean NOT NULL DEFAULT false,
    maximum_pension_cap_applied boolean NOT NULL DEFAULT false,
    ups_assured_payout          bigint,
    ups_min_guarantee_applied   boolean NOT NULL DEFAULT false,
    nps_default_benefit_amount  bigint,
    calc_trace                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    rule_version_ref            text NOT NULL REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,  -- IR17
    status                      text NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_pc_tenant ON pen_pension_calculations(tenant_id);
CREATE INDEX ix_pen_pc_case   ON pen_pension_calculations(case_id);
CREATE INDEX ix_pen_pc_rule   ON pen_pension_calculations(rule_version_ref);
CREATE INDEX ix_pen_pc_status ON pen_pension_calculations(status);
COMMENT ON COLUMN pen_pension_calculations.rule_version_ref IS 'IR17: the E35 pen_pension_limit_rules row EFFECTIVE on the relevant date; SUPERSEDED rows stay referenced by historic calcs.';

-- SECTION 3 — E08 pen_commutation_records (BRD G11 FR-06)
CREATE TABLE pen_commutation_records (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 text NOT NULL,
    pension_calc_id         text NOT NULL REFERENCES pen_pension_calculations(id) ON DELETE RESTRICT,
    opted                   boolean NOT NULL DEFAULT false,
    commuted_fraction       numeric(9,4) NOT NULL,                     -- <= statutory max 0.40 (FR-06 AC1)
    commuted_pension_amount bigint NOT NULL,
    age_next_birthday       integer NOT NULL,
    commutation_factor      numeric(9,4) NOT NULL,
    commutation_factor_ref  text NOT NULL REFERENCES pen_commutation_factors(id) ON DELETE RESTRICT,
    commuted_value          bigint NOT NULL,                    -- commuted x factor x 12
    residual_pension        bigint NOT NULL,
    reduction_effective_date date NOT NULL,
    restoration_due_date    date NOT NULL,                             -- reduction date + 15 yrs (IR4a)
    restored                boolean NOT NULL DEFAULT false,
    restored_on             date,
    status                  text NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_com_fraction CHECK (commuted_fraction > 0 AND commuted_fraction <= 0.4000)
);
CREATE INDEX ix_pen_com_tenant     ON pen_commutation_records(tenant_id);
CREATE INDEX ix_pen_com_case       ON pen_commutation_records(case_id);
CREATE INDEX ix_pen_com_calc       ON pen_commutation_records(pension_calc_id);
CREATE INDEX ix_pen_com_factor     ON pen_commutation_records(commutation_factor_ref);
CREATE INDEX ix_pen_com_restoredue ON pen_commutation_records(restoration_due_date) WHERE restored = false;

-- SECTION 4 — E09 pen_gratuity_calculations (BRD G11 FR-07)
CREATE TABLE pen_gratuity_calculations (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 text NOT NULL,
    gratuity_type           text NOT NULL,
    emoluments_base         bigint NOT NULL,                    -- basic + DA (FR-07 BR1)
    qualifying_half_years   integer NOT NULL,
    service_slab_factor     numeric(9,4),                              -- DEATH_GRATUITY slab multiplier
    service_gratuity_months numeric(9,4),                              -- SERVICE_GRATUITY multiplier (<10 yrs)
    computed_amount         bigint NOT NULL,                    -- before ceiling
    statutory_ceiling       bigint NOT NULL,
    ceiling_ref             text NOT NULL REFERENCES pen_gratuity_ceilings(id) ON DELETE RESTRICT,
    ceiling_applied         boolean NOT NULL DEFAULT false,
    payable_amount          bigint NOT NULL,                    -- min(computed, ceiling); AC2a exempts SERVICE
    withheld_amount         bigint NOT NULL DEFAULT 0,          -- Rule-9 / no-dues withholding (DCRG)
    calc_trace              jsonb NOT NULL DEFAULT '{}'::jsonb,
    rule_version_ref        text NOT NULL REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,
    status                  text NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_grat_tenant  ON pen_gratuity_calculations(tenant_id);
CREATE INDEX ix_pen_grat_case    ON pen_gratuity_calculations(case_id);
CREATE INDEX ix_pen_grat_ceiling ON pen_gratuity_calculations(ceiling_ref);
CREATE INDEX ix_pen_grat_type    ON pen_gratuity_calculations(gratuity_type);
CREATE INDEX ix_pen_grat_status  ON pen_gratuity_calculations(status);

-- SECTION 5 — E10 pen_family_pension_records (BRD G11 FR-08)
CREATE TABLE pen_family_pension_records (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 text,
    employee_id             text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    enhanced_basis          text NOT NULL,
    emoluments_base         bigint NOT NULL,
    normal_rate_pct         numeric(9,4) NOT NULL,                     -- from E32 (never a literal)
    enhanced_rate_pct       numeric(9,4),
    normal_amount           bigint NOT NULL,
    enhanced_amount         bigint,
    enhanced_from           date,
    enhanced_to             date,
    enhanced_window_rule    text NOT NULL,                             -- which ENHANCED window rule applied (AC2a)
    fp_rate_ref             text NOT NULL REFERENCES pen_family_pension_rates(id) ON DELETE RESTRICT,
    status                  text NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_fp_tenant   ON pen_family_pension_records(tenant_id);
CREATE INDEX ix_pen_fp_case     ON pen_family_pension_records(case_id);
CREATE INDEX ix_pen_fp_employee ON pen_family_pension_records(employee_id);
CREATE INDEX ix_pen_fp_rate     ON pen_family_pension_records(fp_rate_ref);

-- SECTION 6 — E41 pen_provisional_pension_records (BRD G11 FR-22, Rule 9)
CREATE TABLE pen_provisional_pension_records (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     text NOT NULL,
    proceedings_ref             varchar(96) NOT NULL,                  -- G09 proceedings id (AC4 mandatory)
    proceedings_type            text NOT NULL,
    provisional_pension_amount  bigint NOT NULL,
    dcrg_withheld               boolean NOT NULL DEFAULT true,         -- IR15: true until conclusion
    dcrg_withheld_amount        bigint NOT NULL DEFAULT 0,
    commenced_on                date NOT NULL,
    proceedings_concluded_on    date,
    conclusion_outcome          text,
    final_recovery_amount       bigint,
    status                      text NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_prov_tenant ON pen_provisional_pension_records(tenant_id);
CREATE INDEX ix_pen_prov_case   ON pen_provisional_pension_records(case_id);
CREATE INDEX ix_pen_prov_status ON pen_provisional_pension_records(status);
COMMENT ON TABLE pen_provisional_pension_records IS 'FR-22/IR15: while status=ACTIVE the DCRG stays fully withheld; release attempts fail with ERR-G11-PROVISIONAL-PENDING (service layer).';
