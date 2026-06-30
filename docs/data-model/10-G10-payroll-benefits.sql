-- =====================================================================================
-- 10-G10-payroll-benefits.sql
-- Government HRMS — Module schema for G10 (Payroll & Benefits Management, Phase-2)
-- =====================================================================================
-- BUILD NOTES
-- -----------
-- Load order: AFTER 00-platform-core.sql (and AFTER 01-G01 once it lands). This module
--   references — never redefines — the canonical core tables. It FKs to:
--     tenants, entities, employees (G01), pay_scales/grades/designations/cadres/org_units,
--     users (logical, no FK), workflow_instances (P01), documents (G13),
--     service_register_events (G12), integration_credentials (P04/X.3).
-- Conventions: docs/data-model/CONVENTIONS.md is authoritative. Every business table:
--     id uuid PK DEFAULT gen_random_uuid(); tenant_id NOT NULL -> tenants(id) RESTRICT;
--     entity_id (nullable; state-wide / platform-config rows leave it NULL) -> entities(id);
--     std audit cols (created_at/updated_at/created_by/updated_by/is_deleted); soft delete
--     only; RLS tenant_isolation policy (Section 11 at end).
--   BRD entities (§5.1 E04..E35) use domain-named PKs (e.g. remittance_id, payslip_id);
--   per CONVENTIONS §1 the physical PK is `id` and the domain name is recorded as a column
--   comment. Module FK columns keep the BRD domain names and point at the parent's `id`.
-- APPEND-ONLY LEDGERS (CONVENTIONS §3): payslip_lines (the immutable YTD source-of-truth),
--   run_input_snapshots (immutable as-of snapshot), and loan_repayments carry ONLY
--   created_at/created_by — NO updated_at, NO is_deleted. Reopen never mutates a locked
--   payslip; it produces a new payslip *version* (originals -> SUPERSEDED/REVERSED) with
--   reversing lines, and the lock-to-lock diff is captured by the P05 DB-trigger audit.
--   G10 defines NO module audit table; immutability of finalised runs is provided by P05.
-- MONEY (BRD §4): amounts NUMERIC(15,2); rates NUMERIC(9,4); statutory remittance totals
--   NUMERIC(18,2). Fixed-point only (no float). A ROUNDING_ADJUSTMENT payslip line absorbs
--   Σ(rounded) − round(Σ) per payslip (BRD §5.6-1).
-- SoD (BRD §3 / §5.6-10, enforced by P01/P02; reinforced here by CHECK columns): strict
--   3-way separation — Payroll Officer (creator) ≠ Payroll Approver (approved_by/locks) ≠
--   Payroll Disburser (signed_by/transmits); positive-pay confirmer ≠ transmitter;
--   fnf_settlements.approved_by ≠ created_by. Actor columns (approved_by/signed_by/...) are
--   logical refs to users(id) WITHOUT FK (survive user removal; CONVENTIONS §3).
-- SINGLE-IN-FLIGHT RUN (BRD §5.6-13, AI-12): a partial UNIQUE index enforces at most one
--   active FINAL run per (tenant, entity, cycle); a second concurrent FINAL -> 409
--   ERR-G10-RUN-INFLIGHT.
-- DISBURSEMENT SAFETY (BRD §4, AI-3/16): bank_disbursements carries an idempotency_key and a
--   tenant-unique bank_batch_ref (positive-pay); DSC/HSM keys live in an HSM and NEVER in
--   this DB; bank/TRACES/CRA/ERP calls run over X.3 with credentials in core
--   integration_credentials (P04) — referenced by id, never copied as secrets.
-- SR posting boundary (BRD §5.4, CR-1..CR-4 / FR-G10-23, DEFERRED build): G10 is a canonical
--   SR writer. It posts PAY_FIXATION / ANNUAL_INCREMENT / INCREMENT_WITHHELD / PAY_PROTECTION
--   to the G12 ledger via POST /api/v1/sr/ingest, deduped on
--   (source_module='G10', source_reference_id, source_event_version) with a mandatory
--   fact_key. Pay-fixation SR is G10's, NOT G06's. This schema only stores the sr_event_id
--   linkage column (on employee_salary_structures & arrears); it NEVER mutates the G12 ledger.
-- Enums: G10 closed value sets -> CREATE TYPE ... AS ENUM, prefixed g10_* to avoid collision
--   with core types (CONVENTIONS §4). Tenant-configurable catalogs (pay scales, DA/HRA/PT/tax
--   rates) are effective-dated DATA rows in rate_tables, not enums.
-- Table count: 27 module-owned tables (E04..E23, E29..E35).
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G10 closed enumerations; BRD §5.5)
-- =====================================================================================

-- Components & rules -------------------------------------------------------------------
CREATE TYPE g10_component_category   AS ENUM ('EARNING','DEDUCTION','PERQUISITE','EMPLOYER_CONTRIBUTION',
                                              'ROUNDING_ADJUSTMENT','LEAVE_ENCASHMENT');
CREATE TYPE g10_calc_method          AS ENUM ('FLAT','PERCENTAGE','SLAB','MATRIX','FORMULA');
CREATE TYPE g10_component_status      AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE g10_rule_status          AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE g10_rate_table_type      AS ENUM ('DA_RATE','HRA_CLASS','PT_SLAB','TAX_SLAB','NPS_RATE',
                                              'GPF_RATE','GRATUITY_RATE','OTHER');
CREATE TYPE g10_tax_regime           AS ENUM ('OLD','NEW');

-- Structures ---------------------------------------------------------------------------
CREATE TYPE g10_structure_status     AS ENUM ('DRAFT','ACTIVE','SUPERSEDED');
CREATE TYPE g10_component_value_type AS ENUM ('COMPUTED','FIXED_OVERRIDE');
CREATE TYPE g10_pension_scheme       AS ENUM ('GPF','CPF','NPS');

-- Cycles & runs ------------------------------------------------------------------------
CREATE TYPE g10_run_type             AS ENUM ('REGULAR','ARREARS','SUPPLEMENTARY','OFF_CYCLE','BONUS','FNF');
CREATE TYPE g10_run_mode             AS ENUM ('DRAFT','PARALLEL_WHATIF','FINAL');
CREATE TYPE g10_run_status           AS ENUM ('QUEUED','RUNNING','COMPUTED','FAILED','RECONCILED',
                                              'APPROVED','LOCKED','CANCELLED','SUPERSEDED');
CREATE TYPE g10_cycle_status         AS ENUM ('OPEN','COMPUTING','COMPUTED','LOCKED','CLOSED');

-- Payslips -----------------------------------------------------------------------------
CREATE TYPE g10_payslip_status       AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED','REVERSED');
CREATE TYPE g10_supersession_reason  AS ENUM ('REOPEN','ARREAR_LINK','CORRECTION');
CREATE TYPE g10_line_type            AS ENUM ('EARNING','DEDUCTION','PERQUISITE','EMPLOYER_CONTRIBUTION',
                                              'ROUNDING_ADJUSTMENT','SUBSISTENCE','LWP_RECOVERY','ARREAR');

-- Deductions / tax ---------------------------------------------------------------------
CREATE TYPE g10_deduction_type       AS ENUM ('GPF','CPF','NPS','PT','TDS','PENSION','INSURANCE',
                                              'COURT_ATTACHMENT','RECOVERY','LOAN_EMI','VOLUNTARY');
CREATE TYPE g10_deduction_status     AS ENUM ('ACTIVE','SUSPENDED','CLOSED');
CREATE TYPE g10_tax_decl_status      AS ENUM ('DRAFT','SUBMITTED','PARTIALLY_VERIFIED','VERIFIED','LOCKED');

-- Loans & benefits ---------------------------------------------------------------------
CREATE TYPE g10_loan_type            AS ENUM ('HBA','VEHICLE','COMPUTER','FESTIVAL','GPF_ADVANCE','SALARY_ADVANCE','OTHER');
CREATE TYPE g10_loan_status          AS ENUM ('REQUESTED','SANCTIONED','DISBURSED','ACTIVE','FORECLOSED','CLOSED','REJECTED');
CREATE TYPE g10_interest_method      AS ENUM ('SIMPLE','REDUCING','INTEREST_FREE');
CREATE TYPE g10_benefit_type         AS ENUM ('MEDICAL','LTC','GROUP_INSURANCE','GRATUITY','REIMBURSEMENT','LEAVE_ENCASHMENT');
CREATE TYPE g10_benefit_status       AS ENUM ('ENROLLED','ACTIVE','SUSPENDED','CLOSED');
CREATE TYPE g10_claim_status         AS ENUM ('SUBMITTED','RECOMMENDED','VERIFIED','APPROVED','REJECTED','PAID');

-- Arrears ------------------------------------------------------------------------------
CREATE TYPE g10_arrear_type          AS ENUM ('DA_REVISION','INCREMENT','PAY_FIXATION','PROMOTION','CORRECTION');
CREATE TYPE g10_arrear_status        AS ENUM ('COMPUTED','APPROVED','PAID','CANCELLED');

-- Disbursement -------------------------------------------------------------------------
CREATE TYPE g10_disbursement_status  AS ENUM ('DRAFT','GENERATED','SIGNED','TRANSMITTED','ACKNOWLEDGED',
                                              'RECONCILED','FAILED','SUSPECTED_PROCESSED');
CREATE TYPE g10_file_format          AS ENUM ('NACH','FIXED_WIDTH','ISO20022','CUSTOM'); -- ISO20022/CUSTOM DEFERRED (AI-19)
CREATE TYPE g10_ack_status           AS ENUM ('PENDING','ACKNOWLEDGED','POSITIVE_PAY_CONFIRMED','REJECTED');
CREATE TYPE g10_hold_reason          AS ENUM ('BANK_DETAIL_MISSING','ACCOUNT_FROZEN','VALIDATION_FAIL',
                                              'EXCLUDED','FAILED_CREDIT','UNDER_INVESTIGATION');
CREATE TYPE g10_hold_status          AS ENUM ('HELD','RELEASED','REDISBURSED','WRITTEN_OFF');
CREATE TYPE g10_signoff_status       AS ENUM ('PENDING','SIGNED_OFF','REJECTED');

-- Statutory remittance / GL ------------------------------------------------------------
CREATE TYPE g10_remittance_scheme    AS ENUM ('TDS','PT','GPF','CPF','NPS','PENSION','INSURANCE');
CREATE TYPE g10_remittance_status    AS ENUM ('ACCRUED','SCHEDULED','DEPOSITED','MATCHED','OVERDUE','SHORT_PAID');
CREATE TYPE g10_gl_posting_status    AS ENUM ('DRAFT','EXPORTED','POSTED','ACKNOWLEDGED','REJECTED');

-- Perquisites --------------------------------------------------------------------------
CREATE TYPE g10_perq_type            AS ENUM ('CONCESSIONAL_LOAN','ACCOMMODATION','MOTOR_CAR','ESOP','UTILITIES','OTHER');
CREATE TYPE g10_perq_valuation_method AS ENUM ('RULE3_ACCOMMODATION','RULE3_CONCESSIONAL_LOAN','RULE3_MOTOR_CAR',
                                               'COST_TO_EMPLOYER','FAIR_MARKET_VALUE');
CREATE TYPE g10_perq_status          AS ENUM ('DRAFT','ACTIVE','REVISED','SUPERSEDED');

-- FnF / carryforward / gratuity --------------------------------------------------------
CREATE TYPE g10_separation_type      AS ENUM ('SUPERANNUATION','RESIGNATION','VRS','DISMISSAL','DEATH','TERMINATION','TRANSFER_OUT');
CREATE TYPE g10_fnf_status           AS ENUM ('DRAFT','COMPUTED','SANCTIONED','APPROVED','PAID','HANDED_OFF');
CREATE TYPE g10_carryforward_source  AS ENUM ('STATUTORY','LOAN','RECOVERY','COURT_ATTACHMENT','DISCIPLINARY','OVERPAYMENT');
CREATE TYPE g10_carryforward_status  AS ENUM ('OPEN','PARTIALLY_RECOVERED','RECOVERED','WRITTEN_OFF');
CREATE TYPE g10_gratuity_status      AS ENUM ('ACCRUED','ADJUSTED','SETTLED');


-- =====================================================================================
-- SECTION 2 — SALARY STRUCTURE & PAY-RULES ENGINE (E04-E09)
-- =====================================================================================

-- E05 pay_components (catalog of earning/deduction/perquisite/rounding components) -----
CREATE TABLE g10_pay_components (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- component_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    component_code      text NOT NULL,                               -- e.g. 'BASIC','DA','HRA','TDS'
    name                text NOT NULL,
    category            g10_component_category NOT NULL,
    calc_method         g10_calc_method NOT NULL DEFAULT 'FORMULA',
    is_taxable          boolean NOT NULL DEFAULT false,
    is_statutory        boolean NOT NULL DEFAULT false,
    display_order       integer NOT NULL DEFAULT 0,
    dsl_grammar_version text,                                        -- pins FORMULA grammar (FR-01/Appx 16.7)
    status              g10_component_status NOT NULL DEFAULT 'DRAFT',
    effective_from      date,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_pay_components_code UNIQUE (tenant_id, component_code)
);
CREATE INDEX ix_g10_pay_components_tenant   ON g10_pay_components(tenant_id);
CREATE INDEX ix_g10_pay_components_entity   ON g10_pay_components(entity_id);
CREATE INDEX ix_g10_pay_components_category ON g10_pay_components(category);
CREATE INDEX ix_g10_pay_components_status   ON g10_pay_components(status);
COMMENT ON COLUMN g10_pay_components.id IS 'BRD E05 component_id';

-- E07 rate_tables (DA%, HRA class %, PT slabs by state, tax slabs; effective-dated) ----
CREATE TABLE g10_rate_tables (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- rate_table_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    table_type          g10_rate_table_type NOT NULL,
    state               text,                                        -- required when table_type = PT_SLAB (state of posting)
    city_class          text,                                        -- HRA: X / Y / Z
    regime              g10_tax_regime,                              -- required when table_type = TAX_SLAB
    financial_year      text,                                        -- e.g. 'FY2026_27' (tax slabs)
    key_code            text,                                        -- free dimension (scheme code etc.)
    slab_min            numeric(15,2),
    slab_max            numeric(15,2),
    rate_pct            numeric(9,4),                                -- percentage rates
    flat_amount         numeric(15,2),                               -- flat slab amount (e.g. PT)
    effective_from      date NOT NULL,
    effective_to        date,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_rate_pt_state  CHECK (table_type <> 'PT_SLAB'  OR state  IS NOT NULL),   -- ERR-G10-PT-STATE
    CONSTRAINT ck_g10_rate_tax_regime CHECK (table_type <> 'TAX_SLAB' OR (regime IS NOT NULL AND financial_year IS NOT NULL)),
    CONSTRAINT ck_g10_rate_slab      CHECK (slab_max IS NULL OR slab_min IS NULL OR slab_max >= slab_min)
);
-- Non-overlap key (VAL-G10-RATE-NONOVERLAP, BRD §5.2/E07): start of each (type,state,key,regime,FY,slab) window.
CREATE UNIQUE INDEX uq_g10_rate_effective ON g10_rate_tables (
    tenant_id, COALESCE(entity_id,'00000000-0000-0000-0000-000000000000'::uuid),
    table_type, COALESCE(state,''), COALESCE(city_class,''), COALESCE(regime,'NEW'::g10_tax_regime),
    COALESCE(financial_year,''), COALESCE(slab_min,-1), effective_from
) WHERE is_deleted = false;
CREATE INDEX ix_g10_rate_tables_tenant ON g10_rate_tables(tenant_id);
CREATE INDEX ix_g10_rate_tables_lookup ON g10_rate_tables(tenant_id, table_type, state, effective_from);
COMMENT ON COLUMN g10_rate_tables.id IS 'BRD E07 rate_table_id; PT_SLAB requires state of posting';

-- E06 pay_rules (versioned formula/rule per component; constrained DSL) ----------------
CREATE TABLE g10_pay_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pay_rule_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pay_component_id    uuid NOT NULL REFERENCES g10_pay_components(id) ON DELETE RESTRICT,
    version             integer NOT NULL DEFAULT 1,
    calc_method         g10_calc_method NOT NULL,
    formula_expression  text,                                        -- whitelisted DSL (FORMULA only)
    rate_table_id       uuid REFERENCES g10_rate_tables(id) ON DELETE RESTRICT,
    computation_order   integer NOT NULL,                            -- unique within effective window
    rounding_rule       text,                                        -- e.g. 'ROUND_HALF_UP_0'
    eligibility_expression text,
    dsl_grammar_version text,
    effective_from      date NOT NULL,
    effective_to        date,
    status              g10_rule_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_pay_rules_version UNIQUE (pay_component_id, version)
);
CREATE INDEX ix_g10_pay_rules_tenant    ON g10_pay_rules(tenant_id);
CREATE INDEX ix_g10_pay_rules_component ON g10_pay_rules(pay_component_id);
CREATE INDEX ix_g10_pay_rules_rate      ON g10_pay_rules(rate_table_id);
CREATE INDEX ix_g10_pay_rules_status    ON g10_pay_rules(status);
COMMENT ON COLUMN g10_pay_rules.id IS 'BRD E06 pay_rule_id';

-- E04 pay_matrix_levels (pay-matrix level/cell; basic-pay progression) ----------------
CREATE TABLE g10_pay_matrix_levels (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pay_matrix_level_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pay_scale_id        uuid REFERENCES pay_scales(id) ON DELETE RESTRICT,   -- core master (ref only)
    level_code          text NOT NULL,                               -- e.g. 'L10'
    cell_index          integer NOT NULL,                            -- progression cell
    basic_pay           numeric(15,2) NOT NULL,
    next_cell_id        uuid REFERENCES g10_pay_matrix_levels(id) ON DELETE SET NULL,  -- annual-increment target
    pay_commission      text,                                        -- e.g. '7CPC'
    effective_from      date NOT NULL,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_matrix_cell UNIQUE (tenant_id, level_code, cell_index, effective_from),
    CONSTRAINT ck_g10_matrix_basic CHECK (basic_pay >= 0)
);
CREATE INDEX ix_g10_matrix_tenant ON g10_pay_matrix_levels(tenant_id);
CREATE INDEX ix_g10_matrix_scale  ON g10_pay_matrix_levels(pay_scale_id);
CREATE INDEX ix_g10_matrix_next   ON g10_pay_matrix_levels(next_cell_id);
COMMENT ON COLUMN g10_pay_matrix_levels.id IS 'BRD E04 pay_matrix_level_id';

-- E08 employee_salary_structures (per-employee assigned structure; versioned) ----------
CREATE TABLE g10_employee_salary_structures (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- structure_id (structure_version_ref)
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    pay_matrix_level_id  uuid REFERENCES g10_pay_matrix_levels(id) ON DELETE RESTRICT,
    version              integer NOT NULL DEFAULT 1,
    pension_scheme       g10_pension_scheme,                          -- GPF/CPF/NPS by DOJ
    status               g10_structure_status NOT NULL DEFAULT 'DRAFT',
    effective_from       date NOT NULL,
    effective_to         date,
    superseded_by_id     uuid REFERENCES g10_employee_salary_structures(id) ON DELETE SET NULL,
    override_reason      text,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,   -- P01 maker-checker
    -- SR linkage (G10 is the writer of the PAY_FIXATION SR event; FR-G10-23, deferred):
    sr_event_id          uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- G12 PAY_FIXATION event
    source_reference_id  text,                                        -- dedup tuple member (source_module='G10')
    source_event_version integer,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_struct_version UNIQUE (employee_id, version)
);
-- One ACTIVE structure version per employee at a time (BRD §5.6-6).
CREATE UNIQUE INDEX uq_g10_struct_active ON g10_employee_salary_structures(tenant_id, employee_id)
    WHERE status = 'ACTIVE' AND is_deleted = false;
CREATE INDEX ix_g10_struct_tenant   ON g10_employee_salary_structures(tenant_id);
CREATE INDEX ix_g10_struct_employee ON g10_employee_salary_structures(employee_id);
CREATE INDEX ix_g10_struct_level    ON g10_employee_salary_structures(pay_matrix_level_id);
CREATE INDEX ix_g10_struct_wf       ON g10_employee_salary_structures(workflow_instance_id);
CREATE INDEX ix_g10_struct_sr       ON g10_employee_salary_structures(sr_event_id);
COMMENT ON COLUMN g10_employee_salary_structures.id IS 'BRD E08 structure_id; sr_event_id = G12 PAY_FIXATION (G10 writer, not G06)';

-- E09 employee_salary_components (component-level values/overrides per structure version)
CREATE TABLE g10_employee_salary_components (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- salary_component_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    structure_id        uuid NOT NULL REFERENCES g10_employee_salary_structures(id) ON DELETE RESTRICT,
    pay_component_id    uuid NOT NULL REFERENCES g10_pay_components(id) ON DELETE RESTRICT,
    value_type          g10_component_value_type NOT NULL DEFAULT 'COMPUTED',
    override_amount     numeric(15,2),
    override_reason     text,
    computed_amount     numeric(15,2),
    display_order       integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_struct_component UNIQUE (structure_id, pay_component_id),
    CONSTRAINT ck_g10_struct_override CHECK (value_type <> 'FIXED_OVERRIDE'
                                             OR (override_amount IS NOT NULL AND override_reason IS NOT NULL))  -- FR-03 AC2
);
CREATE INDEX ix_g10_salcomp_tenant    ON g10_employee_salary_components(tenant_id);
CREATE INDEX ix_g10_salcomp_structure ON g10_employee_salary_components(structure_id);
CREATE INDEX ix_g10_salcomp_component ON g10_employee_salary_components(pay_component_id);
COMMENT ON COLUMN g10_employee_salary_components.id IS 'BRD E09 salary_component_id';


-- =====================================================================================
-- SECTION 3 — PAYROLL RUN ENGINE, SNAPSHOT & PAYSLIPS (E10-E13, E34)
-- =====================================================================================

-- E10 payroll_cycles (pay period + run-type definition, incl. FNF) --------------------
CREATE TABLE g10_payroll_cycles (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- cycle_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    cycle_code          text NOT NULL,                               -- e.g. 'REV-2026-06-REG'
    period_month        integer NOT NULL,
    period_year         integer NOT NULL,
    financial_year      text NOT NULL,                               -- 'FY2026_27'
    run_type            g10_run_type NOT NULL DEFAULT 'REGULAR',
    cutoff_date         date,
    pay_date            date,
    status              g10_cycle_status NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_cycle_code UNIQUE (tenant_id, cycle_code),
    CONSTRAINT ck_g10_cycle_month CHECK (period_month BETWEEN 1 AND 12)
);
CREATE INDEX ix_g10_cycle_tenant ON g10_payroll_cycles(tenant_id);
CREATE INDEX ix_g10_cycle_entity ON g10_payroll_cycles(entity_id);
CREATE INDEX ix_g10_cycle_period ON g10_payroll_cycles(period_year, period_month);
CREATE INDEX ix_g10_cycle_status ON g10_payroll_cycles(status);
COMMENT ON COLUMN g10_payroll_cycles.id IS 'BRD E10 cycle_id';

-- E34 run_input_snapshots (immutable as-of snapshot of G01/G03/G06/G09/org) ------------
-- APPEND-ONLY LEDGER: created_at/created_by only (no updated_at, no is_deleted).
CREATE TABLE g10_run_input_snapshots (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- snapshot_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    snapshot_no         text NOT NULL,
    cycle_id            uuid NOT NULL REFERENCES g10_payroll_cycles(id) ON DELETE RESTRICT,
    run_id              uuid,                                        -- logical ref to payroll_runs (no FK: run<->snapshot cycle)
    as_of_timestamp     timestamptz NOT NULL,
    g01_facts           jsonb,                                       -- employee/bank(enc)/PAN/scheme/designation/cadre/status/ddo_of_record
    g03_facts           jsonb,                                       -- attendance/LWP
    g06_facts           jsonb,                                       -- pay-fixation
    g09_facts           jsonb,                                       -- disciplinary recovery
    org_facts           jsonb,                                       -- org_unit / cost centre
    post_cutoff_deferrals jsonb,                                     -- inputs arriving after cutoff -> arrears
    checksum            text,                                        -- determinism proof (BRD §5.6-16)
    is_frozen           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    CONSTRAINT uq_g10_snapshot_no UNIQUE (tenant_id, snapshot_no)
);
CREATE INDEX ix_g10_snapshot_tenant ON g10_run_input_snapshots(tenant_id);
CREATE INDEX ix_g10_snapshot_cycle  ON g10_run_input_snapshots(cycle_id);
CREATE INDEX ix_g10_snapshot_run    ON g10_run_input_snapshots(run_id);
COMMENT ON COLUMN g10_run_input_snapshots.id IS 'BRD E34 snapshot_id; append-only; checksum proves run determinism';

-- E11 payroll_runs (computation run instance; snapshot-bound; single-in-flight) --------
CREATE TABLE g10_payroll_runs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- run_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_no               text NOT NULL,
    cycle_id             uuid NOT NULL REFERENCES g10_payroll_cycles(id) ON DELETE RESTRICT,
    run_mode             g10_run_mode NOT NULL DEFAULT 'DRAFT',
    status               g10_run_status NOT NULL DEFAULT 'QUEUED',
    snapshot_id          uuid REFERENCES g10_run_input_snapshots(id) ON DELETE SET NULL,
    in_flight_lock_key   text,                                        -- X.1 period lock key
    superseded_run_id    uuid REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,   -- P01 approval/lock
    gross_total          numeric(18,2) NOT NULL DEFAULT 0,
    deduction_total      numeric(18,2) NOT NULL DEFAULT 0,
    net_total            numeric(18,2) NOT NULL DEFAULT 0,
    employee_count       integer NOT NULL DEFAULT 0,
    idempotency_key      text,                                       -- 24h replay (payment/run POSTs)
    correlation_id       text,
    started_at           timestamptz,
    completed_at         timestamptz,
    approved_by          uuid,                                       -- logical ref users; SoD: <> created_by
    locked_at            timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_run_no UNIQUE (tenant_id, run_no),
    CONSTRAINT ck_g10_run_sod CHECK (approved_by IS NULL OR approved_by <> created_by),  -- §5.6-10
    CONSTRAINT ck_g10_run_idem UNIQUE (tenant_id, idempotency_key)
);
-- Single active FINAL run per cycle (BRD §5.6-13; ERR-G10-RUN-INFLIGHT 409).
CREATE UNIQUE INDEX uq_g10_run_inflight ON g10_payroll_runs(tenant_id, entity_id, cycle_id)
    WHERE run_mode = 'FINAL' AND status IN ('QUEUED','RUNNING','COMPUTED','RECONCILED','APPROVED') AND is_deleted = false;
CREATE INDEX ix_g10_run_tenant   ON g10_payroll_runs(tenant_id);
CREATE INDEX ix_g10_run_cycle    ON g10_payroll_runs(cycle_id);
CREATE INDEX ix_g10_run_snapshot ON g10_payroll_runs(snapshot_id);
CREATE INDEX ix_g10_run_status   ON g10_payroll_runs(status);
CREATE INDEX ix_g10_run_wf       ON g10_payroll_runs(workflow_instance_id);
COMMENT ON COLUMN g10_payroll_runs.id IS 'BRD E11 run_id; partial unique uq_g10_run_inflight = single-in-flight FINAL';

-- E12 payslips (per-employee per-run computed header; versioned) -----------------------
CREATE TABLE g10_payslips (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- payslip_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    payslip_no              text NOT NULL,
    run_id                  uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    version                 integer NOT NULL DEFAULT 1,
    status                  g10_payslip_status NOT NULL DEFAULT 'DRAFT',
    supersession_reason     g10_supersession_reason,
    superseded_by_payslip_id uuid REFERENCES g10_payslips(id) ON DELETE SET NULL,
    snapshot_id             uuid REFERENCES g10_run_input_snapshots(id) ON DELETE SET NULL,
    structure_version_ref   uuid REFERENCES g10_employee_salary_structures(id) ON DELETE RESTRICT,
    paid_days               numeric(6,2),
    lwp_days                numeric(6,2),
    gross_earnings          numeric(15,2) NOT NULL DEFAULT 0,
    total_deductions        numeric(15,2) NOT NULL DEFAULT 0,
    net_pay                 numeric(15,2) NOT NULL DEFAULT 0,
    document_id             uuid REFERENCES documents(id) ON DELETE SET NULL,   -- G13 rendered PDF
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_payslip_version UNIQUE (tenant_id, run_id, employee_id, version),
    CONSTRAINT uq_g10_payslip_no UNIQUE (tenant_id, payslip_no),
    CONSTRAINT ck_g10_payslip_net CHECK (net_pay >= 0)                       -- §5.6-1
);
CREATE INDEX ix_g10_payslip_tenant   ON g10_payslips(tenant_id);
CREATE INDEX ix_g10_payslip_run      ON g10_payslips(run_id);
CREATE INDEX ix_g10_payslip_employee ON g10_payslips(employee_id);
CREATE INDEX ix_g10_payslip_status   ON g10_payslips(status);
CREATE INDEX ix_g10_payslip_doc      ON g10_payslips(document_id);
COMMENT ON COLUMN g10_payslips.id IS 'BRD E12 payslip_id; reopen -> new version, originals SUPERSEDED/REVERSED';

-- E13 payslip_lines (earning/deduction line items; the YTD source-of-truth ledger) -----
-- APPEND-ONLY LEDGER: created_at/created_by only (no updated_at, no is_deleted).
CREATE TABLE g10_payslip_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- payslip_line_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    payslip_id          uuid NOT NULL REFERENCES g10_payslips(id) ON DELETE RESTRICT,
    pay_component_id    uuid REFERENCES g10_pay_components(id) ON DELETE RESTRICT,
    line_type           g10_line_type NOT NULL,
    description         text,
    amount              numeric(15,2) NOT NULL,
    is_taxable          boolean NOT NULL DEFAULT false,
    sequence_no         integer NOT NULL DEFAULT 0,
    arrear_ref          uuid,                                        -- logical ref -> g10_arrears (additive arrear line)
    calc_trace          jsonb,                                       -- full computation trace (FR-04)
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid
);
CREATE INDEX ix_g10_payslip_lines_tenant    ON g10_payslip_lines(tenant_id);
CREATE INDEX ix_g10_payslip_lines_payslip   ON g10_payslip_lines(payslip_id);
CREATE INDEX ix_g10_payslip_lines_component ON g10_payslip_lines(pay_component_id);
CREATE INDEX ix_g10_payslip_lines_type      ON g10_payslip_lines(line_type);
COMMENT ON COLUMN g10_payslip_lines.id IS 'BRD E13 payslip_line_id; append-only; YTD = immutable Σ over surviving lines';


-- =====================================================================================
-- SECTION 4 — DEDUCTIONS, TAX, LOANS, BENEFITS, ARREARS (E14-E20, E32, E35)
-- =====================================================================================

-- E14 deductions (statutory/voluntary deduction definitions & balances) ----------------
-- carryforward_id is a logical ref (no FK) to break the deductions<->carryforwards cycle.
CREATE TABLE g10_deductions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- deduction_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    deduction_type      g10_deduction_type NOT NULL,
    scheme              text,                                        -- scheme/court-order ref
    rate_pct            numeric(9,4),
    amount              numeric(15,2),
    balance             numeric(15,2),
    cumulative_ytd      numeric(15,2) NOT NULL DEFAULT 0,            -- CACHE only; truth = Σ payslip_lines (§5.6-9)
    is_statutory        boolean NOT NULL DEFAULT false,
    attachment_exemption_basis text,                                 -- CPC s.60 (FR-09)
    carryforward_id     uuid,                                        -- logical ref -> g10_deduction_carryforwards
    status              g10_deduction_status NOT NULL DEFAULT 'ACTIVE',
    effective_from      date,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g10_deductions_tenant   ON g10_deductions(tenant_id);
CREATE INDEX ix_g10_deductions_employee ON g10_deductions(employee_id);
CREATE INDEX ix_g10_deductions_type     ON g10_deductions(deduction_type);
CREATE INDEX ix_g10_deductions_status   ON g10_deductions(status);
COMMENT ON COLUMN g10_deductions.cumulative_ytd IS 'CACHE only; authoritative YTD is the immutable Σ over g10_payslip_lines';

-- E35 deduction_carryforwards (aged backlog of un-recovered deductions) ----------------
CREATE TABLE g10_deduction_carryforwards (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- carryforward_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    deduction_id        uuid REFERENCES g10_deductions(id) ON DELETE SET NULL,
    source_type         g10_carryforward_source NOT NULL,
    original_amount     numeric(15,2) NOT NULL,
    recovered_to_date   numeric(15,2) NOT NULL DEFAULT 0,
    outstanding         numeric(15,2) NOT NULL,
    first_deferred_cycle_id uuid REFERENCES g10_payroll_cycles(id) ON DELETE SET NULL,
    age_days            integer NOT NULL DEFAULT 0,
    priority            integer NOT NULL DEFAULT 0,
    owner_id            uuid,                                        -- logical ref users
    status              g10_carryforward_status NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_cf_conservation CHECK (outstanding = original_amount - recovered_to_date AND outstanding >= 0)  -- §5.6-18
);
CREATE INDEX ix_g10_cf_tenant    ON g10_deduction_carryforwards(tenant_id);
CREATE INDEX ix_g10_cf_employee  ON g10_deduction_carryforwards(employee_id);
CREATE INDEX ix_g10_cf_deduction ON g10_deduction_carryforwards(deduction_id);
CREATE INDEX ix_g10_cf_status    ON g10_deduction_carryforwards(status);
COMMENT ON COLUMN g10_deduction_carryforwards.id IS 'BRD E35 carryforward_id';

-- E15 tax_declarations (income-tax declaration, proofs, 12B & 10E per FY) --------------
CREATE TABLE g10_tax_declarations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- tax_declaration_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    financial_year       text NOT NULL,
    regime               g10_tax_regime NOT NULL DEFAULT 'NEW',
    declared_80c         numeric(15,2),
    declared_80d         numeric(15,2),
    hra_exemption        numeric(15,2),
    home_loan_interest   numeric(15,2),
    previous_employer_income jsonb,                                  -- Form-12B
    relief_89_1          jsonb,                                      -- Form-10E
    standard_deduction   numeric(15,2),
    surcharge            numeric(15,2),
    marginal_relief      numeric(15,2),
    cess                 numeric(15,2),
    rebate_87a           numeric(15,2),
    perquisite_total     numeric(15,2),                              -- Σ ACTIVE perquisites (§5.6-17)
    projected_annual_tax numeric(15,2),
    status               g10_tax_decl_status NOT NULL DEFAULT 'DRAFT',
    verified_by          uuid,                                       -- logical ref users (P01 checker)
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_tax_decl UNIQUE (tenant_id, employee_id, financial_year)
);
CREATE INDEX ix_g10_tax_decl_tenant   ON g10_tax_declarations(tenant_id);
CREATE INDEX ix_g10_tax_decl_employee ON g10_tax_declarations(employee_id);
CREATE INDEX ix_g10_tax_decl_status   ON g10_tax_declarations(status);
COMMENT ON COLUMN g10_tax_declarations.id IS 'BRD E15 tax_declaration_id';

-- E32 perquisites (Rule-3 taxable perquisite valuation per employee per FY) ------------
-- loan_id is a logical ref (no FK) to break the perquisites<->loans cycle.
CREATE TABLE g10_perquisites (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- perquisite_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    financial_year      text NOT NULL,
    perq_type           g10_perq_type NOT NULL,
    valuation_method    g10_perq_valuation_method NOT NULL,
    source_ref          text,
    loan_id             uuid,                                        -- logical ref -> g10_loans_advances (concessional loan)
    taxable_value       numeric(15,2) NOT NULL DEFAULT 0,
    monthly_value       numeric(15,2),
    computed_basis      jsonb,
    status              g10_perq_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g10_perq_tenant   ON g10_perquisites(tenant_id);
CREATE INDEX ix_g10_perq_employee ON g10_perquisites(employee_id);
CREATE INDEX ix_g10_perq_fy       ON g10_perquisites(financial_year);
CREATE INDEX ix_g10_perq_status   ON g10_perquisites(status);
COMMENT ON COLUMN g10_perquisites.id IS 'BRD E32 perquisite_id';

-- E16 loans_advances (sanction & recovery schedule; concessional perquisite-linked) ----
CREATE TABLE g10_loans_advances (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- loan_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    loan_no              text NOT NULL,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    loan_type            g10_loan_type NOT NULL,
    principal            numeric(15,2) NOT NULL,
    interest_rate        numeric(9,4),
    interest_method      g10_interest_method NOT NULL DEFAULT 'SIMPLE',
    is_concessional      boolean NOT NULL DEFAULT false,
    perquisite_reference_rate numeric(9,4),
    perquisite_id        uuid REFERENCES g10_perquisites(id) ON DELETE SET NULL,  -- concessional perquisite
    installment_amount   numeric(15,2),
    tenure_months        integer,
    outstanding          numeric(15,2) NOT NULL DEFAULT 0,
    sanctioned_by        uuid,                                       -- logical ref users (DDO)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 sanction
    status               g10_loan_status NOT NULL DEFAULT 'REQUESTED',
    sanction_date        date,
    disbursed_date       date,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_loan_no UNIQUE (tenant_id, loan_no),
    CONSTRAINT ck_g10_loan_outstanding CHECK (outstanding >= 0),                 -- §5.6-8
    CONSTRAINT ck_g10_loan_concessional CHECK (NOT is_concessional OR perquisite_id IS NOT NULL OR status IN ('REQUESTED','REJECTED'))
);
CREATE INDEX ix_g10_loans_tenant   ON g10_loans_advances(tenant_id);
CREATE INDEX ix_g10_loans_employee ON g10_loans_advances(employee_id);
CREATE INDEX ix_g10_loans_perq     ON g10_loans_advances(perquisite_id);
CREATE INDEX ix_g10_loans_status   ON g10_loans_advances(status);
CREATE INDEX ix_g10_loans_wf       ON g10_loans_advances(workflow_instance_id);
COMMENT ON COLUMN g10_loans_advances.id IS 'BRD E16 loan_id';

-- E17 loan_repayments (per-installment recovery ledger) -------------------------------
-- APPEND-ONLY LEDGER: created_at/created_by only.
CREATE TABLE g10_loan_repayments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- repayment_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    loan_id             uuid NOT NULL REFERENCES g10_loans_advances(id) ON DELETE RESTRICT,
    payslip_id          uuid REFERENCES g10_payslips(id) ON DELETE SET NULL,
    installment_no      integer NOT NULL,
    principal_component numeric(15,2) NOT NULL DEFAULT 0,
    interest_component  numeric(15,2) NOT NULL DEFAULT 0,
    outstanding_after   numeric(15,2) NOT NULL,
    recovered_on        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    CONSTRAINT uq_g10_loan_repay UNIQUE (loan_id, installment_no)
);
CREATE INDEX ix_g10_loan_repay_tenant  ON g10_loan_repayments(tenant_id);
CREATE INDEX ix_g10_loan_repay_loan    ON g10_loan_repayments(loan_id);
CREATE INDEX ix_g10_loan_repay_payslip ON g10_loan_repayments(payslip_id);
COMMENT ON COLUMN g10_loan_repayments.id IS 'BRD E17 repayment_id; append-only';

-- E18 benefits (benefit enrolment) -----------------------------------------------------
CREATE TABLE g10_benefits (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- benefit_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    benefit_no          text NOT NULL,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    benefit_type        g10_benefit_type NOT NULL,
    enrolment_date      date,
    coverage_amount     numeric(15,2),
    status              g10_benefit_status NOT NULL DEFAULT 'ENROLLED',
    effective_from      date,
    effective_to        date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_benefit_no UNIQUE (tenant_id, benefit_no)
);
CREATE INDEX ix_g10_benefits_tenant   ON g10_benefits(tenant_id);
CREATE INDEX ix_g10_benefits_employee ON g10_benefits(employee_id);
CREATE INDEX ix_g10_benefits_type     ON g10_benefits(benefit_type);
COMMENT ON COLUMN g10_benefits.id IS 'BRD E18 benefit_id';

-- E19 benefit_claims (reimbursement / LTC / medical / leave-encashment claims) ---------
CREATE TABLE g10_benefit_claims (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- claim_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    claim_no             text NOT NULL,
    benefit_id           uuid REFERENCES g10_benefits(id) ON DELETE SET NULL,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    claim_type           g10_benefit_type NOT NULL,
    claim_amount         numeric(15,2) NOT NULL,
    approved_amount      numeric(15,2),
    status               g10_claim_status NOT NULL DEFAULT 'SUBMITTED',
    recommended_by       uuid,                                       -- logical ref users (L1 manager)
    approved_by          uuid,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    paid_in_run_id       uuid REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_claim_no UNIQUE (tenant_id, claim_no)
);
CREATE INDEX ix_g10_claims_tenant   ON g10_benefit_claims(tenant_id);
CREATE INDEX ix_g10_claims_employee ON g10_benefit_claims(employee_id);
CREATE INDEX ix_g10_claims_benefit  ON g10_benefit_claims(benefit_id);
CREATE INDEX ix_g10_claims_status   ON g10_benefit_claims(status);
CREATE INDEX ix_g10_claims_run      ON g10_benefit_claims(paid_in_run_id);
COMMENT ON COLUMN g10_benefit_claims.id IS 'BRD E19 claim_id';

-- E20 arrears (retrospective revision arrear computations; dependent cascade) ----------
CREATE TABLE g10_arrears (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- arrear_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    arrear_no            text NOT NULL,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    arrear_type          g10_arrear_type NOT NULL,
    source_reference     text,                                       -- DA notification / G06 order ref
    period_from          date NOT NULL,
    period_to            date NOT NULL,
    gross_arrear         numeric(15,2) NOT NULL DEFAULT 0,
    deduction_arrear     numeric(15,2) NOT NULL DEFAULT 0,
    tds_arrear           numeric(15,2) NOT NULL DEFAULT 0,
    net_arrear           numeric(15,2) NOT NULL DEFAULT 0,
    relief_89_1          jsonb,                                      -- Form-10E cross-FY relief
    component_breakup    jsonb,                                      -- month-wise component-wise (dependent cascade)
    paid_in_cycle_id     uuid REFERENCES g10_payroll_cycles(id) ON DELETE SET NULL,
    status               g10_arrear_status NOT NULL DEFAULT 'COMPUTED',
    approved_by          uuid,                                       -- logical ref users
    -- SR linkage (PAY_FIXATION/ANNUAL_INCREMENT events on retrospective fixation; FR-G10-23):
    sr_event_id          uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,
    source_reference_id  text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_arrear_no UNIQUE (tenant_id, arrear_no),
    CONSTRAINT ck_g10_arrear_period CHECK (period_to >= period_from)
);
CREATE INDEX ix_g10_arrears_tenant   ON g10_arrears(tenant_id);
CREATE INDEX ix_g10_arrears_employee ON g10_arrears(employee_id);
CREATE INDEX ix_g10_arrears_cycle    ON g10_arrears(paid_in_cycle_id);
CREATE INDEX ix_g10_arrears_status   ON g10_arrears(status);
CREATE INDEX ix_g10_arrears_sr       ON g10_arrears(sr_event_id);
COMMENT ON COLUMN g10_arrears.id IS 'BRD E20 arrear_id';


-- =====================================================================================
-- SECTION 5 — DISBURSEMENT, RECONCILIATION, REMITTANCE, GL, FNF, GRATUITY (E21-E23, E29-E33)
-- =====================================================================================

-- E21 bank_disbursements (bank file batch + ack + positive-pay + DSC signature) --------
CREATE TABLE g10_bank_disbursements (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- disbursement_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    batch_no                 text NOT NULL,
    run_id                   uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    file_format              g10_file_format NOT NULL DEFAULT 'NACH',
    bank_batch_ref           text,                                   -- unique positive-pay batch ref
    total_amount             numeric(18,2) NOT NULL DEFAULT 0,
    line_count               integer NOT NULL DEFAULT 0,
    disbursed_total          numeric(18,2) NOT NULL DEFAULT 0,
    held_total               numeric(18,2) NOT NULL DEFAULT 0,
    failed_total             numeric(18,2) NOT NULL DEFAULT 0,
    dsc_signature_ref        text,                                   -- HSM signature reference (key NEVER stored)
    signed_by                uuid,                                   -- logical ref users (Disburser); SoD <> created_by
    transmitted_by           uuid,
    positive_pay_confirmed_by uuid,                                  -- SoD <> transmitted_by
    treasury_debit_ref       text,
    status                   g10_disbursement_status NOT NULL DEFAULT 'DRAFT',
    ack_status               g10_ack_status NOT NULL DEFAULT 'PENDING',
    idempotency_key          text,                                   -- double-payment guard
    integration_credential_id uuid REFERENCES integration_credentials(id) ON DELETE SET NULL,  -- P04 (no secrets here)
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,                  -- G13 signed file
    transmitted_at           timestamptz,
    acknowledged_at          timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_disb_batch_no UNIQUE (tenant_id, batch_no),
    CONSTRAINT uq_g10_disb_bank_ref UNIQUE (tenant_id, bank_batch_ref),          -- positive-pay (AI-3)
    CONSTRAINT uq_g10_disb_idem     UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT ck_g10_disb_sign_sod CHECK (signed_by IS NULL OR created_by IS NULL OR signed_by <> created_by),  -- §5.6-10
    CONSTRAINT ck_g10_disb_pp_sod   CHECK (positive_pay_confirmed_by IS NULL OR transmitted_by IS NULL
                                           OR positive_pay_confirmed_by <> transmitted_by)
);
CREATE INDEX ix_g10_disb_tenant ON g10_bank_disbursements(tenant_id);
CREATE INDEX ix_g10_disb_run    ON g10_bank_disbursements(run_id);
CREATE INDEX ix_g10_disb_status ON g10_bank_disbursements(status);
CREATE INDEX ix_g10_disb_cred   ON g10_bank_disbursements(integration_credential_id);
COMMENT ON COLUMN g10_bank_disbursements.id IS 'BRD E21 disbursement_id; bank_batch_ref unique = positive-pay; DSC key never in DB';

-- E31 disbursement_holds (suspense ledger for excluded/failed net pay) -----------------
CREATE TABLE g10_disbursement_holds (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- hold_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    hold_no             text NOT NULL,
    run_id              uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    disbursement_id     uuid REFERENCES g10_bank_disbursements(id) ON DELETE SET NULL,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_id          uuid REFERENCES g10_payslips(id) ON DELETE SET NULL,
    held_amount         numeric(15,2) NOT NULL,
    reason              g10_hold_reason NOT NULL,
    age_days            integer NOT NULL DEFAULT 0,
    redisbursement_run_id uuid REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    status              g10_hold_status NOT NULL DEFAULT 'HELD',
    owner_id            uuid,                                        -- logical ref users
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_hold_no UNIQUE (tenant_id, hold_no),
    CONSTRAINT ck_g10_hold_amount CHECK (held_amount >= 0)
);
CREATE INDEX ix_g10_hold_tenant   ON g10_disbursement_holds(tenant_id);
CREATE INDEX ix_g10_hold_run      ON g10_disbursement_holds(run_id);
CREATE INDEX ix_g10_hold_employee ON g10_disbursement_holds(employee_id);
CREATE INDEX ix_g10_hold_status   ON g10_disbursement_holds(status);
COMMENT ON COLUMN g10_disbursement_holds.id IS 'BRD E31 hold_id; Σ disbursed + Σ held + Σ failed = run net (§5.6-4)';

-- E22 payroll_reconciliations (control totals & variance sign-off) ----------------------
CREATE TABLE g10_payroll_reconciliations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- reconciliation_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    run_id              uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    gross_total         numeric(18,2) NOT NULL DEFAULT 0,
    deduction_total     numeric(18,2) NOT NULL DEFAULT 0,
    net_total           numeric(18,2) NOT NULL DEFAULT 0,
    disbursed_total     numeric(18,2) NOT NULL DEFAULT 0,
    held_total          numeric(18,2) NOT NULL DEFAULT 0,
    failed_total        numeric(18,2) NOT NULL DEFAULT 0,
    variance            numeric(18,2) NOT NULL DEFAULT 0,
    signoff_status      g10_signoff_status NOT NULL DEFAULT 'PENDING',
    signed_off_by       uuid,                                        -- logical ref users
    signed_off_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_recon_run UNIQUE (run_id),
    -- Σ disbursed + Σ held + Σ failed = net (BRD §5.6-4); signed-off rows must tie out exactly.
    CONSTRAINT ck_g10_recon_tieout CHECK (signoff_status <> 'SIGNED_OFF'
                                          OR disbursed_total + held_total + failed_total = net_total)
);
CREATE INDEX ix_g10_recon_tenant ON g10_payroll_reconciliations(tenant_id);
CREATE INDEX ix_g10_recon_run    ON g10_payroll_reconciliations(run_id);
CREATE INDEX ix_g10_recon_status ON g10_payroll_reconciliations(signoff_status);
COMMENT ON COLUMN g10_payroll_reconciliations.id IS 'BRD E22 reconciliation_id';

-- E29 statutory_remittances (deducted -> deposited -> matched liability tracker) -------
CREATE TABLE g10_statutory_remittances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- remittance_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    remittance_no       text NOT NULL,
    scheme              g10_remittance_scheme NOT NULL,
    state               text,                                       -- for PT (state of posting)
    period_month        integer NOT NULL,
    period_year         integer NOT NULL,
    financial_year      text NOT NULL,
    deducted_total      numeric(18,2) NOT NULL,                     -- employee share (Σ payslip_lines)
    employer_total      numeric(18,2),                              -- employer share (NPS/pension)
    remittable_total    numeric(18,2) NOT NULL,
    statutory_due_date  date NOT NULL,
    challan_no          text,
    cin                 text,                                       -- challan identification / NPS-CRA ref
    deposit_date        date,
    deposited_amount    numeric(18,2),
    late_interest       numeric(18,2),                              -- u/s 201(1A)/234E
    tolerance_variance  numeric(15,2),
    status              g10_remittance_status NOT NULL DEFAULT 'ACCRUED',
    matched_by          uuid,                                       -- logical ref users (certifier)
    document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,   -- challan/receipt scan (G13)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_remit_no UNIQUE (tenant_id, remittance_no),
    CONSTRAINT ck_g10_remit_month CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT ck_g10_remit_total CHECK (remittable_total = deducted_total + COALESCE(employer_total,0))
);
CREATE INDEX ix_g10_remit_tenant ON g10_statutory_remittances(tenant_id);
CREATE INDEX ix_g10_remit_scheme ON g10_statutory_remittances(scheme);
CREATE INDEX ix_g10_remit_period ON g10_statutory_remittances(period_year, period_month);
CREATE INDEX ix_g10_remit_status ON g10_statutory_remittances(status);
CREATE INDEX ix_g10_remit_due    ON g10_statutory_remittances(statutory_due_date) WHERE status NOT IN ('MATCHED','DEPOSITED');
COMMENT ON COLUMN g10_statutory_remittances.id IS 'BRD E29 remittance_id; MATCHED only when deposit ties within tolerance';

-- E33 gl_journals (payroll cost-journal export object + posting status) ----------------
CREATE TABLE g10_gl_journals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- journal_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    journal_no          text NOT NULL,
    run_id              uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    period_month        integer NOT NULL,
    period_year         integer NOT NULL,
    lines               jsonb NOT NULL,                             -- structured GL lines (debit/credit)
    total_debit         numeric(18,2) NOT NULL DEFAULT 0,
    total_credit        numeric(18,2) NOT NULL DEFAULT 0,
    export_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
    posting_status      g10_gl_posting_status NOT NULL DEFAULT 'DRAFT',
    erp_reference       text,
    acknowledged_by     uuid,                                       -- logical ref users (Finance)
    integration_credential_id uuid REFERENCES integration_credentials(id) ON DELETE SET NULL,  -- P04/X.3 to ERP
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_gl_no UNIQUE (tenant_id, journal_no),
    CONSTRAINT ck_g10_gl_balance CHECK (total_debit = total_credit)             -- §5.6-15
);
CREATE INDEX ix_g10_gl_tenant ON g10_gl_journals(tenant_id);
CREATE INDEX ix_g10_gl_run    ON g10_gl_journals(run_id);
CREATE INDEX ix_g10_gl_status ON g10_gl_journals(posting_status);
COMMENT ON COLUMN g10_gl_journals.id IS 'BRD E33 journal_id; Finance ERP owns GL book of record (posting-status tracking only)';

-- E23 gratuity_accruals (period gratuity accrual ledger) ------------------------------
CREATE TABLE g10_gratuity_accruals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- gratuity_accrual_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    financial_year      text NOT NULL,
    period_month        integer NOT NULL,
    accrued_amount      numeric(15,2) NOT NULL DEFAULT 0,
    cumulative_accrual  numeric(15,2) NOT NULL DEFAULT 0,
    last_drawn_pay      numeric(15,2),
    status              g10_gratuity_status NOT NULL DEFAULT 'ACCRUED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_gratuity UNIQUE (tenant_id, employee_id, financial_year, period_month),
    CONSTRAINT ck_g10_gratuity_month CHECK (period_month BETWEEN 1 AND 12)
);
CREATE INDEX ix_g10_gratuity_tenant   ON g10_gratuity_accruals(tenant_id);
CREATE INDEX ix_g10_gratuity_employee ON g10_gratuity_accruals(employee_id);
COMMENT ON COLUMN g10_gratuity_accruals.id IS 'BRD E23 gratuity_accrual_id';

-- E30 fnf_settlements (full-and-final separation settlement; G11 handoff) --------------
CREATE TABLE g10_fnf_settlements (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- fnf_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    fnf_no               text NOT NULL,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    separation_type      g10_separation_type NOT NULL,
    last_working_date    date NOT NULL,
    cycle_id             uuid REFERENCES g10_payroll_cycles(id) ON DELETE SET NULL,   -- run_type=FNF
    final_month_pay      numeric(15,2) NOT NULL DEFAULT 0,
    leave_encashment     numeric(15,2) NOT NULL DEFAULT 0,
    gratuity_amount      numeric(15,2) NOT NULL DEFAULT 0,
    notice_pay_recovery  numeric(15,2) NOT NULL DEFAULT 0,
    loan_settlement      numeric(15,2) NOT NULL DEFAULT 0,
    other_recoveries     numeric(15,2) NOT NULL DEFAULT 0,
    final_tds            numeric(15,2) NOT NULL DEFAULT 0,
    net_settlement       numeric(15,2) NOT NULL DEFAULT 0,
    g11_handoff_ref      text,                                       -- pension/terminal-benefit handoff (G11)
    reconciliation_id    uuid REFERENCES g10_payroll_reconciliations(id) ON DELETE SET NULL,
    status               g10_fnf_status NOT NULL DEFAULT 'DRAFT',
    sanctioned_by        uuid,                                       -- logical ref users (DDO)
    approved_by          uuid,                                       -- SoD: <> created_by (§5.6-10)
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_fnf_no UNIQUE (tenant_id, fnf_no),
    CONSTRAINT uq_g10_fnf_employee UNIQUE (tenant_id, employee_id),              -- one consolidated FnF per employee
    CONSTRAINT ck_g10_fnf_sod CHECK (approved_by IS NULL OR approved_by <> created_by)
);
CREATE INDEX ix_g10_fnf_tenant   ON g10_fnf_settlements(tenant_id);
CREATE INDEX ix_g10_fnf_employee ON g10_fnf_settlements(employee_id);
CREATE INDEX ix_g10_fnf_status   ON g10_fnf_settlements(status);
CREATE INDEX ix_g10_fnf_cycle    ON g10_fnf_settlements(cycle_id);
COMMENT ON COLUMN g10_fnf_settlements.id IS 'BRD E30 fnf_id; consolidated separation settlement; approved_by <> created_by';


-- =====================================================================================
-- SECTION 11 — ROW-LEVEL SECURITY (tenant_isolation; CONVENTIONS §6)
-- =====================================================================================
-- Applied to every G10 tenant-scoped table (incl. append-only ledgers — read isolation;
-- their immutability is a separate grant/trigger concern, CONVENTIONS §6).
DO $$
DECLARE
    t text;
    g10_tables text[] := ARRAY[
        'g10_pay_components','g10_rate_tables','g10_pay_rules','g10_pay_matrix_levels',
        'g10_employee_salary_structures','g10_employee_salary_components','g10_payroll_cycles',
        'g10_run_input_snapshots','g10_payroll_runs','g10_payslips','g10_payslip_lines',
        'g10_deductions','g10_deduction_carryforwards','g10_tax_declarations','g10_perquisites',
        'g10_loans_advances','g10_loan_repayments','g10_benefits','g10_benefit_claims',
        'g10_arrears','g10_bank_disbursements','g10_disbursement_holds',
        'g10_payroll_reconciliations','g10_statutory_remittances','g10_gl_journals',
        'g10_gratuity_accruals','g10_fnf_settlements'
    ];
BEGIN
    FOREACH t IN ARRAY g10_tables LOOP
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
-- Uses core seed: tenant 1111..1111, entity 2222..2201, org_unit 3333..3301,
-- pay_scale 6666..6601, employees 9999..9901/9902. GUCs set so RLS WITH CHECK passes.
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- pay_components
INSERT INTO g10_pay_components (id, tenant_id, entity_id, component_code, name, category, calc_method, is_taxable, is_statutory, display_order, status, effective_from) VALUES
 ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BASIC','Basic Pay','EARNING','MATRIX',true,false,1,'ACTIVE','2026-04-01'),
 ('c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DA','Dearness Allowance','EARNING','PERCENTAGE',true,false,2,'ACTIVE','2026-04-01'),
 ('c0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PT','Professional Tax','DEDUCTION','SLAB',false,true,20,'ACTIVE','2026-04-01');

-- rate_tables (DA% and PT-by-state)
INSERT INTO g10_rate_tables (id, tenant_id, entity_id, table_type, state, rate_pct, slab_min, slab_max, flat_amount, effective_from) VALUES
 ('c1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DA_RATE',NULL,50.0000,NULL,NULL,NULL,'2026-04-01'),
 ('c1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PT_SLAB','KARNATAKA',NULL,15001,999999,200.00,'2026-04-01'),
 ('c1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PT_SLAB','MAHARASHTRA',NULL,10001,999999,300.00,'2026-04-01');

-- payroll_cycles
INSERT INTO g10_payroll_cycles (id, tenant_id, entity_id, cycle_code, period_month, period_year, financial_year, run_type, cutoff_date, pay_date, status) VALUES
 ('c2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REV-2026-06-REG',6,2026,'FY2026_27','REGULAR','2026-06-25','2026-06-30','COMPUTED');

-- run_input_snapshots (frozen as-of snapshot; append-only)
INSERT INTO g10_run_input_snapshots (id, tenant_id, entity_id, snapshot_no, cycle_id, as_of_timestamp, checksum, is_frozen) VALUES
 ('c4000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','SNAP-REV-2026-06','c2000000-0000-0000-0000-000000000001','2026-06-25T18:00:00Z','sha256:9f1c0b...e4','true');

-- payroll_runs (FINAL, snapshot-bound; approved_by <> created_by SoD)
INSERT INTO g10_payroll_runs (id, tenant_id, entity_id, run_no, cycle_id, run_mode, status, snapshot_id, gross_total, deduction_total, net_total, employee_count, created_by, approved_by) VALUES
 ('c3000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RUN-REV-2026-06-01','c2000000-0000-0000-0000-000000000001','FINAL','RECONCILED','c4000000-0000-0000-0000-000000000001',168450.00,28200.00,140250.00,2,'88888888-8888-8888-8888-888888888802','88888888-8888-8888-8888-888888888801');

-- payslips (per-employee; versioned)
INSERT INTO g10_payslips (id, tenant_id, entity_id, payslip_no, run_id, employee_id, version, status, paid_days, lwp_days, gross_earnings, total_deductions, net_pay) VALUES
 ('c5000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PS-2026-06-100245','c3000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901',1,'PUBLISHED',30,0,84225.00,14100.00,70125.00),
 ('c5000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PS-2026-06-088120','c3000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902',1,'PUBLISHED',30,0,84225.00,14100.00,70125.00);

-- payslip_lines (append-only; YTD source-of-truth; rounding-adjustment line ties to rupee)
INSERT INTO g10_payslip_lines (id, tenant_id, entity_id, payslip_id, pay_component_id, line_type, description, amount, is_taxable, sequence_no) VALUES
 ('c6000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','c5000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','EARNING','Basic Pay',56100.00,true,1),
 ('c6000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','c5000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','EARNING','DA @ 50%',28050.00,true,2),
 ('c6000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','c5000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','DEDUCTION','Professional Tax (KARNATAKA)',-200.00,false,20);

-- statutory_remittances (deducted -> deposited -> matched; PT by state)
INSERT INTO g10_statutory_remittances (id, tenant_id, entity_id, remittance_no, scheme, state, period_month, period_year, financial_year, deducted_total, employer_total, remittable_total, statutory_due_date, status) VALUES
 ('c7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RMT-PT-2026-06-KA','PT','KARNATAKA',6,2026,'FY2026_27',400.00,NULL,400.00,'2026-07-20','ACCRUED'),
 ('c7000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RMT-TDS-2026-06','TDS',NULL,6,2026,'FY2026_27',12500.00,NULL,12500.00,'2026-07-07','MATCHED');

-- perquisites (Rule-3 concessional-loan perquisite)
INSERT INTO g10_perquisites (id, tenant_id, entity_id, employee_id, financial_year, perq_type, valuation_method, taxable_value, monthly_value, status) VALUES
 ('ca000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','FY2026_27','CONCESSIONAL_LOAN','RULE3_CONCESSIONAL_LOAN',9600.00,800.00,'ACTIVE');

-- deduction_carryforwards (aged backlog; conservation invariant)
INSERT INTO g10_deduction_carryforwards (id, tenant_id, entity_id, employee_id, source_type, original_amount, recovered_to_date, outstanding, age_days, priority, status) VALUES
 ('cc000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','COURT_ATTACHMENT',15000.00,5000.00,10000.00,60,1,'PARTIALLY_RECOVERED');

-- disbursement_holds (suspense for excluded/failed net)
INSERT INTO g10_disbursement_holds (id, tenant_id, entity_id, hold_no, run_id, employee_id, payslip_id, held_amount, reason, age_days, status) VALUES
 ('c9000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','HOLD-2026-06-001','c3000000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','c5000000-0000-0000-0000-000000000002',70125.00,'BANK_DETAIL_MISSING',5,'HELD');

-- gl_journals (cost-journal export; balanced debit=credit)
INSERT INTO g10_gl_journals (id, tenant_id, entity_id, journal_no, run_id, period_month, period_year, lines, total_debit, total_credit, posting_status) VALUES
 ('cb000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','GLJ-2026-06-REV','c3000000-0000-0000-0000-000000000001',6,2026,'[{"account":"SALARY_EXPENSE","debit":168450.00},{"account":"NET_PAY_CLEARING","credit":140250.00},{"account":"STATUTORY_PAYABLE","credit":28200.00}]'::jsonb,168450.00,168450.00,'EXPORTED');

-- fnf_settlements (consolidated separation; approved_by <> created_by)
INSERT INTO g10_fnf_settlements (id, tenant_id, entity_id, fnf_no, employee_id, separation_type, last_working_date, cycle_id, final_month_pay, leave_encashment, gratuity_amount, final_tds, net_settlement, status, sanctioned_by, approved_by, created_by) VALUES
 ('c8000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','FNF-2026-088120','99999999-9999-9999-9999-999999999902','SUPERANNUATION','2026-06-30','c2000000-0000-0000-0000-000000000001',70125.00,180000.00,1000000.00,42000.00,1208125.00,'COMPUTED','88888888-8888-8888-8888-888888888801','88888888-8888-8888-8888-888888888801','88888888-8888-8888-8888-888888888802');

-- =====================================================================================
-- END 10-G10-payroll-benefits.sql
-- =====================================================================================
