-- PH-15A migration 0022: G10 income-tax/TDS engine + statutory certificates — faithful
-- subset of docs/data-model/10-G10-payroll-benefits.sql for the tax entities:
--   E15 g10_tax_declarations     (per-employee per-FY declaration with the FULL persisted
--       computation pipeline, FR-G10-07 AC5: gross taxable -> standard_deduction ->
--       Chapter VI-A -> slab tax -> surcharge with marginal_relief -> cess -> rebate_87a ->
--       89(1)/Form-10E relief -> projected_annual_tax -> monthly TDS; Form-12B previous
--       employer income and Form-10E relief working as jsonb),
--   E29 g10_statutory_remittances (deducted -> deposited -> matched liability tracker;
--       Form-16 Part A derives ONLY from MATCHED rows, FR-G10-17 AC1/AC5/BR4).
-- Subset deviations vs the full model (same approach as 0015): a varchar(7) YYYY-MM
-- period column is carried alongside period_month/period_year for direct joins to the
-- engine's payslip period; pipeline-stage columns gross_taxable, chapter_via_total,
-- taxable_income, slab_tax, monthly_tds are added so EVERY pipeline stage is persisted
-- (FR-07 AC5), and proof_cutoff_date backs the FY cutoff lock (FR-07 AC3 ->
-- ERR-G10-SNAPSHOT-FROZEN 409 on mutation after cutoff).
-- Money columns are NUMERIC(15,2)/NUMERIC(18,2); services exchange integer paise,
-- converting in SQL (($n::numeric / 100) on write, (col * 100)::bigint on read) — never
-- through float parsing or string rounding. Slab/rate/cap values live in g10_rate_tables
-- (migration 0014, TAX_SLAB rows keyed by regime/financial_year/key_code) — never in code.

-- SECTION 1 — ENUM TYPES (g10_ prefix; UPPER_SNAKE values, CONVENTIONS §4)
-- g10_tax_regime ('OLD','NEW') already exists from migration 0014 and is reused here.
CREATE TYPE g10_tax_decl_status   AS ENUM ('DRAFT','SUBMITTED','PARTIALLY_VERIFIED','VERIFIED','LOCKED');
CREATE TYPE g10_remittance_scheme AS ENUM ('TDS','PT','GPF','CPF','NPS','PENSION','INSURANCE');
CREATE TYPE g10_remittance_status AS ENUM ('ACCRUED','SCHEDULED','DEPOSITED','MATCHED','OVERDUE','SHORT_PAID');

-- SECTION 2 — E15 g10_tax_declarations (BRD G10 FR-07: declarations, regime, full pipeline)
CREATE TABLE g10_tax_declarations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- tax_declaration_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    financial_year           text NOT NULL,
    regime                   g10_tax_regime NOT NULL DEFAULT 'NEW',
    declared_80c             numeric(15,2),
    declared_80d             numeric(15,2),
    hra_exemption            numeric(15,2),
    home_loan_interest       numeric(15,2),
    previous_employer_income jsonb,                                       -- Form-12B (FR-07 AC6)
    relief_89_1              jsonb,                                       -- Form-10E (FR-07 AC7)
    -- Persisted pipeline stages (FR-07 AC5: each stage stored and shown step-by-step).
    gross_taxable            numeric(15,2),
    standard_deduction       numeric(15,2),
    chapter_via_total        numeric(15,2),                               -- Ch VI-A after caps (clamped)
    taxable_income           numeric(15,2),
    slab_tax                 numeric(15,2),
    surcharge                numeric(15,2),
    marginal_relief          numeric(15,2),
    cess                     numeric(15,2),
    rebate_87a               numeric(15,2),
    perquisite_total         numeric(15,2),                               -- Σ ACTIVE perquisites (§5.6-17)
    projected_annual_tax     numeric(15,2),
    monthly_tds              numeric(15,2),                               -- FR-07 BR2 spread
    proof_cutoff_date        date,                                        -- FY proof cutoff (FR-07 AC3)
    status                   g10_tax_decl_status NOT NULL DEFAULT 'DRAFT',
    verified_by              uuid,                                        -- logical ref users (P01 checker)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_tax_decl UNIQUE (tenant_id, employee_id, financial_year)
);
CREATE INDEX ix_g10_tax_decl_tenant   ON g10_tax_declarations(tenant_id);
CREATE INDEX ix_g10_tax_decl_employee ON g10_tax_declarations(employee_id);
CREATE INDEX ix_g10_tax_decl_status   ON g10_tax_declarations(status);
COMMENT ON COLUMN g10_tax_declarations.id IS 'BRD E15 tax_declaration_id';

-- SECTION 3 — E29 g10_statutory_remittances (BRD G10 FR-19; Form-16 Part A gate FR-17)
CREATE TABLE g10_statutory_remittances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- remittance_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    remittance_no       text NOT NULL,
    scheme              g10_remittance_scheme NOT NULL,
    state               text,                                        -- for PT (state of posting)
    period              varchar(7) NOT NULL,                         -- YYYY-MM (subset carry)
    period_month        integer NOT NULL,
    period_year         integer NOT NULL,
    financial_year      text NOT NULL,
    deducted_total      numeric(18,2) NOT NULL,                      -- employee share (Σ payslip_lines)
    employer_total      numeric(18,2),                               -- employer share (NPS/pension)
    remittable_total    numeric(18,2) NOT NULL,
    statutory_due_date  date NOT NULL,
    challan_no          text,
    cin                 text,                                        -- challan identification / NPS-CRA ref
    deposit_date        date,
    deposited_amount    numeric(18,2),
    tolerance_variance  numeric(15,2),
    status              g10_remittance_status NOT NULL DEFAULT 'ACCRUED',
    matched_by          uuid,                                        -- logical ref users (certifier)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_remit_no UNIQUE (tenant_id, remittance_no),
    CONSTRAINT ck_g10_remit_month CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT ck_g10_remit_total CHECK (remittable_total = deducted_total + COALESCE(employer_total, 0))
);
CREATE INDEX ix_g10_remit_tenant ON g10_statutory_remittances(tenant_id);
CREATE INDEX ix_g10_remit_scheme ON g10_statutory_remittances(scheme);
CREATE INDEX ix_g10_remit_period ON g10_statutory_remittances(period_year, period_month);
CREATE INDEX ix_g10_remit_status ON g10_statutory_remittances(status);
CREATE INDEX ix_g10_remit_due    ON g10_statutory_remittances(statutory_due_date) WHERE status NOT IN ('MATCHED','DEPOSITED');
COMMENT ON COLUMN g10_statutory_remittances.id IS 'BRD E29 remittance_id; MATCHED only when deposit ties within tolerance';
