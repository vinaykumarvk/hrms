-- PH-09B migration 0015: G10 deterministic payroll engine — faithful subset of
-- docs/data-model/10-G10-payroll-benefits.sql for the run engine entities:
--   E11 g10_payroll_runs   (snapshot-bound run instance; the uq_g10_run_inflight partial
--       unique index backs the single-in-flight FINAL guard -> ERR-G10-RUN-INFLIGHT),
--   E12 g10_payslips       (versioned per-employee headers; reopen -> supersede, originals
--       flip to REVERSED with supersession_reason; ck_g10_payslip_net backs §5.6-1),
--   E13 g10_payslip_lines  (APPEND-ONLY ledger — the YTD source-of-truth, VAL-G10-YTD-DERIVE;
--       no UPDATE path exists for published lines in the service layer),
--   E20 g10_arrears        (delta = Σ over affected months of new − old; component_breakup
--       persists the month-wise component-wise rows, FR-10 AC2),
--   E35 g10_deduction_carryforwards (net-pay-floor excess booked forward on lock,
--       ERR-G10-RECOVERY-NET; ck_g10_cf_conservation backs §5.6-18).
-- Subset deviations vs the full model (same approach as 0014): the run carries a
-- varchar(7) YYYY-MM period column in place of the g10_payroll_cycles FK, and the frozen
-- run input snapshot lives inline as jsonb (snapshot + snapshot_hash) in place of the
-- g10_run_input_snapshots satellite. Arrear period_from/period_to are varchar(7) YYYY-MM
-- to match the engine's month enumeration.
-- Money columns are NUMERIC(15,2)/NUMERIC(18,2); services exchange integer cents,
-- converting in SQL (($n::numeric / 100) on write, (col * 100)::bigint on read) — never
-- through float parsing or string rounding.

-- SECTION 1 — ENUM TYPES (g10_ prefix; UPPER_SNAKE values, CONVENTIONS §4)










-- SECTION 2 — E11 g10_payroll_runs (BRD G10 FR-04/FR-16/FR-22)
CREATE TABLE g10_payroll_runs (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- run_id
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text REFERENCES entities(id) ON DELETE RESTRICT,
    run_no             text NOT NULL,
    period             varchar(7) NOT NULL,                         -- YYYY-MM (cycle subset)
    run_mode           text NOT NULL DEFAULT 'DRAFT',
    status             text NOT NULL DEFAULT 'QUEUED',
    snapshot           jsonb,                                       -- FR-22 frozen run inputs (G03 feed, enrolments, rules, rates)
    snapshot_hash      text,                                        -- determinism proof (BRD §5.6-16)
    superseded_run_id  text REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    reopen_reason      text,                                        -- FR-16 AC4 justification
    gross_total        bigint NOT NULL DEFAULT 0,
    deduction_total    bigint NOT NULL DEFAULT 0,
    net_total          bigint NOT NULL DEFAULT 0,
    employee_count     integer NOT NULL DEFAULT 0,
    approved_by        text,                                        -- logical ref users; SoD: <> created_by
    locked_at          timestamptz,
    transmitted_at     timestamptz,                                 -- FR-14 bank handoff; reopen blocked after
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_run_no  UNIQUE (tenant_id, run_no),
    CONSTRAINT ck_g10_run_sod CHECK (approved_by IS NULL OR approved_by <> created_by),   -- §5.6-10
    CONSTRAINT ck_g10_run_period CHECK (period ~ '^[0-9]{4}-[0-9]{2}$')
);
-- Single-in-flight FINAL guard (ERR-G10-RUN-INFLIGHT): at most one live FINAL run per period.
CREATE UNIQUE INDEX uq_g10_run_inflight ON g10_payroll_runs(tenant_id, period)
    WHERE run_mode = 'FINAL' AND status IN ('QUEUED','RUNNING','COMPUTED','RECONCILED','APPROVED') AND is_deleted = false;
CREATE INDEX ix_g10_runs_tenant ON g10_payroll_runs(tenant_id);
CREATE INDEX ix_g10_runs_period ON g10_payroll_runs(tenant_id, period);

-- SECTION 3 — E12 g10_payslips (versioned; reopen supersedes, originals REVERSED)
CREATE TABLE g10_payslips (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- payslip_id
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    payslip_no               text NOT NULL,
    run_id                   text NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    version                  integer NOT NULL DEFAULT 1,
    status                   text NOT NULL DEFAULT 'DRAFT',
    supersession_reason      text,
    superseded_by_payslip_id text REFERENCES g10_payslips(id) ON DELETE SET NULL,
    paid_days                numeric(6,2),
    lwp_days                 numeric(6,2),
    gross_earnings           bigint NOT NULL DEFAULT 0,
    total_deductions         bigint NOT NULL DEFAULT 0,
    net_pay                  bigint NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_payslip_version UNIQUE (tenant_id, run_id, employee_id, version),
    CONSTRAINT uq_g10_payslip_no      UNIQUE (tenant_id, payslip_no),
    CONSTRAINT ck_g10_payslip_net     CHECK (net_pay >= 0)                -- §5.6-1
);
CREATE INDEX ix_g10_payslip_run      ON g10_payslips(run_id);
CREATE INDEX ix_g10_payslip_employee ON g10_payslips(employee_id);

-- SECTION 4 — E13 g10_payslip_lines (APPEND-ONLY ledger; YTD derives from these rows)
CREATE TABLE g10_payslip_lines (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- payslip_line_id
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    payslip_id          text NOT NULL REFERENCES g10_payslips(id) ON DELETE RESTRICT,
    line_type           text NOT NULL,
    description         text,                                        -- component code label
    amount              bigint NOT NULL,
    sequence_no         integer NOT NULL DEFAULT 0,
    arrear_ref          text,                                        -- logical ref -> g10_arrears (additive arrear line)
    calc_trace          jsonb,                                       -- full computation trace (FR-04)
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text
);
CREATE INDEX ix_g10_payslip_lines_payslip ON g10_payslip_lines(payslip_id);
CREATE INDEX ix_g10_payslip_lines_tenant  ON g10_payslip_lines(tenant_id);

-- SECTION 5 — E20 g10_arrears (Σ months new − old; month-wise breakup persisted)
CREATE TABLE g10_arrears (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- arrear_id
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    arrear_no           text NOT NULL,
    employee_id         text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    arrear_type         text NOT NULL,
    source_reference    text,                                        -- DA notification / G06 order ref
    period_from         varchar(7) NOT NULL,                         -- YYYY-MM (engine month enumeration)
    period_to           varchar(7) NOT NULL,
    gross_arrear        bigint NOT NULL DEFAULT 0,
    deduction_arrear    bigint NOT NULL DEFAULT 0,
    net_arrear          bigint NOT NULL DEFAULT 0,
    component_breakup   jsonb,                                       -- month-wise component-wise old/new/delta rows (FR-10 AC2)
    paid_in_run_id      text REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'COMPUTED',
    approved_by         text,                                        -- logical ref users
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_arrear_no     UNIQUE (tenant_id, arrear_no),
    CONSTRAINT ck_g10_arrear_period CHECK (period_to >= period_from)
);
CREATE INDEX ix_g10_arrears_employee ON g10_arrears(employee_id);
CREATE INDEX ix_g10_arrears_status   ON g10_arrears(tenant_id, status);

-- SECTION 6 — E35 g10_deduction_carryforwards (net-floor excess booked forward)
CREATE TABLE g10_deduction_carryforwards (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- carryforward_id
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    source_type         text NOT NULL,
    source_ref          text,                                        -- e.g. g10_payslips:<id> that held the excess
    original_amount     bigint NOT NULL,
    recovered_to_date   bigint NOT NULL DEFAULT 0,
    outstanding         bigint NOT NULL,
    booked_from_run_id  text REFERENCES g10_payroll_runs(id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_cf_conservation CHECK (outstanding = original_amount - recovered_to_date AND outstanding >= 0)  -- §5.6-18
);
CREATE INDEX ix_g10_cf_employee ON g10_deduction_carryforwards(employee_id);
CREATE INDEX ix_g10_cf_status   ON g10_deduction_carryforwards(tenant_id, status);
