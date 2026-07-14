-- PH-06A migration 0002: G03 leave substrate — faithful subset of docs/data-model/03-G03-attendance-leave.sql
-- Tables: leave_types, leave_accrual_policies, leave_ledger_entries, leave_balances, leave_applications, leave_reservations

-- SECTION 1 — ENUM TYPES (module-unique closed enumerations; g03_ prefix)
-- =====================================================================================

-- Shifts / rosters / holidays ---------------------------------------------------------







-- Devices / punches -------------------------------------------------------------------








-- Daily attendance / allocations ------------------------------------------------------
-- Single derived-status set, reused by attendance_daily.status, allocation.segment_status
-- and regularisation_requests.requested_status (R2 derived rollup).




-- Overtime / exceptions / comp-off ----------------------------------------------------








-- Leave catalog / accrual -------------------------------------------------------------










-- Leave balance / ledger / applications -----------------------------------------------







-- Encashment / year-close / payroll feed ----------------------------------------------








-- Entitlements / processing runs / delegation -----------------------------------------





-- DPDP consent / anomaly review -------------------------------------------------------







-- E12 leave_types (self-ref debits_against; tenant-wide catalog -> entity_id NULLABLE) --
CREATE TABLE leave_types (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- leave_type_id
    tenant_id                   text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,  -- null = tenant-wide
    leave_code                  varchar(20) NOT NULL,                 -- CL,EL,HPL,COMMUTED,MAT,PAT,CCL...
    name                        varchar(120) NOT NULL,
    category                    text NOT NULL,
    is_accruable                boolean NOT NULL,
    is_sanction_based           boolean NOT NULL DEFAULT false,       -- governed by entitlement counter (E24)
    is_encashable               boolean NOT NULL,
    is_encashable_on_retirement boolean NOT NULL DEFAULT false,
    affects_pay                 boolean NOT NULL,
    gender_eligibility          text NOT NULL DEFAULT 'ALL',
    requires_document           boolean NOT NULL DEFAULT false,
    debit_ratio                 numeric(4,2) NOT NULL DEFAULT 1.00,   -- COMMUTED = 2.00
    debits_against_leave_type_id text REFERENCES leave_types(id) ON DELETE RESTRICT,  -- COMMUTED -> HPL
    year_basis                  text NOT NULL DEFAULT 'CALENDAR',
    sandwich_rule               text NOT NULL DEFAULT 'EXCLUDE',
    requires_return_to_work_cert boolean NOT NULL DEFAULT false,
    max_continuous_days         int,
    applicable_cadre_ids        jsonb,
    status                      text NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_leave_types_code UNIQUE (tenant_id, leave_code),
    CONSTRAINT ck_leave_types_debit_ratio CHECK (debit_ratio > 0)
);
CREATE INDEX ix_leave_types_tenant ON leave_types(tenant_id);
CREATE INDEX ix_leave_types_entity ON leave_types(entity_id);
CREATE INDEX ix_leave_types_debits ON leave_types(debits_against_leave_type_id);
CREATE INDEX ix_leave_types_status ON leave_types(status);

-- E13 leave_accrual_policies (drives JOB-M04-ACCRUAL; tenant-wide -> entity_id NULLABLE) -
CREATE TABLE leave_accrual_policies (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- policy_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    leave_type_id            text NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    scope_org_unit_id        text REFERENCES org_units(id) ON DELETE SET NULL,
    scope_cadre_id           text REFERENCES cadres(id) ON DELETE SET NULL,
    accrual_frequency        text NOT NULL,
    accrual_quantity         numeric(5,2) NOT NULL,
    accrual_basis            text NOT NULL,
    rounding_mode            text NOT NULL DEFAULT 'NEAREST_HALF_CARRY',
    proration_method         varchar(60) NOT NULL DEFAULT 'DAYS_IN_SERVICE_OVER_CYCLE',
    suspend_accrual_on_lwp   boolean NOT NULL DEFAULT true,
    max_balance_cap          numeric(6,2),
    carry_forward_allowed    boolean NOT NULL,
    carry_forward_cap        numeric(6,2),
    encashment_cap_days      numeric(6,2),
    retirement_encash_cap_days numeric(6,2),                          -- combined EL+HPL ceiling (e.g. 300)
    lapse_rule               text NOT NULL,
    min_balance_for_encash   numeric(6,2),
    advance_allowed          boolean NOT NULL DEFAULT false,
    effective_from           date NOT NULL,
    effective_to             date,
    status                   text NOT NULL DEFAULT 'ACTIVE',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_accrual_policy_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_accrual_policies_tenant    ON leave_accrual_policies(tenant_id);
CREATE INDEX ix_accrual_policies_entity    ON leave_accrual_policies(entity_id);
CREATE INDEX ix_accrual_policies_type      ON leave_accrual_policies(leave_type_id);
CREATE INDEX ix_accrual_policies_orgunit   ON leave_accrual_policies(scope_org_unit_id);
CREATE INDEX ix_accrual_policies_cadre     ON leave_accrual_policies(scope_cadre_id);
CREATE INDEX ix_accrual_policies_status    ON leave_accrual_policies(status);
CREATE INDEX ix_accrual_policies_effective ON leave_accrual_policies(effective_from);


-- =====================================================================================
-- SECTION 7 — LEAVE LEDGER (E15, append-only) + BALANCES (E14)
-- =====================================================================================

-- E15 leave_ledger_entries (BRD `leave_balance_ledger`; APPEND-ONLY SSOT; +P05 trigger) -
CREATE TABLE leave_ledger_entries (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- ledger_entry_id
    tenant_id           text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id       text NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    leave_year          int NOT NULL,
    entry_type          text NOT NULL,
    amount              numeric(6,2) NOT NULL,                       -- signed (+credit / -debit)
    balance_after       numeric(6,2) NOT NULL,
    source_ref_type     text,
    source_ref_id       text,
    effective_date      date NOT NULL,
    remarks             text,
    reversed_by_entry_id text REFERENCES leave_ledger_entries(id) ON DELETE SET NULL,
    correlation_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text
    -- Append-only: no updated_at / no is_deleted.
);
CREATE INDEX ix_leave_ledger_tenant   ON leave_ledger_entries(tenant_id);
CREATE INDEX ix_leave_ledger_entity   ON leave_ledger_entries(entity_id);
CREATE INDEX ix_leave_ledger_owner    ON leave_ledger_entries(employee_id, leave_type_id, leave_year);
CREATE INDEX ix_leave_ledger_type     ON leave_ledger_entries(entry_type);
CREATE INDEX ix_leave_ledger_source   ON leave_ledger_entries(source_ref_type, source_ref_id);
CREATE INDEX ix_leave_ledger_eff_date ON leave_ledger_entries(effective_date);
COMMENT ON TABLE leave_ledger_entries IS 'G03 E15 immutable leave-balance ledger (single source of truth). Append-only; also fires P05 trigger. Logical source of G04 leave_ledger_entry_id.';

-- E14 leave_balances (derived snapshot; optimistic-lock `version`) ---------------------
CREATE TABLE leave_balances (
    id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- balance_id
    tenant_id            text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id        text NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    leave_year           int NOT NULL,
    opening_balance      numeric(6,2) NOT NULL DEFAULT 0,
    accrued              numeric(6,2) NOT NULL DEFAULT 0,
    availed              numeric(6,2) NOT NULL DEFAULT 0,
    encashed             numeric(6,2) NOT NULL DEFAULT 0,
    lapsed               numeric(6,2) NOT NULL DEFAULT 0,
    reserved             numeric(6,2) NOT NULL DEFAULT 0,             -- active soft-reserve total (E21)
    current_balance      numeric(6,2) NOT NULL,                       -- reconciles to ledger
    available_balance    numeric(6,2) NOT NULL,                       -- current_balance - reserved
    version              bigint NOT NULL DEFAULT 0,                   -- optimistic lock (R1/R2)
    last_ledger_entry_id text REFERENCES leave_ledger_entries(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text,
    updated_by           text,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_leave_balances UNIQUE (employee_id, leave_type_id, leave_year)
);
CREATE INDEX ix_leave_balances_tenant   ON leave_balances(tenant_id);
CREATE INDEX ix_leave_balances_entity   ON leave_balances(entity_id);
CREATE INDEX ix_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX ix_leave_balances_type     ON leave_balances(leave_type_id);
CREATE INDEX ix_leave_balances_year     ON leave_balances(leave_year);
CREATE INDEX ix_leave_balances_ledger   ON leave_balances(last_ledger_entry_id);


-- =====================================================================================
-- E16 leave_applications (P01 flow; exposes leave_spell_lineage_id for G04) ------------
-- reservation_id FK added AFTER leave_reservations (circular ref; DEFERRABLE).
CREATE TABLE leave_applications (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- application_id
    tenant_id               text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    application_no          varchar(30) NOT NULL,
    employee_id             text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id           text NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date              date NOT NULL,
    end_date                date NOT NULL,
    total_days              numeric(5,2) NOT NULL,
    ledger_debit_units      numeric(6,2) NOT NULL,                   -- total_days * debit_ratio
    reason                  text NOT NULL,
    is_backdated            boolean NOT NULL DEFAULT false,
    contact_during_leave    varchar(120),
    supporting_document_id  text REFERENCES documents(id) ON DELETE SET NULL,
    reservation_id          text,                                    -- FK -> leave_reservations (added below)
    workflow_instance_id    text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status                  text NOT NULL DEFAULT 'DRAFT',
    sr_posting_status       text NOT NULL DEFAULT 'NOT_REQUIRED',
    leave_spell_lineage_id  text NOT NULL,                           -- stable spell key; emitted to G04 (no SR write here)
    return_to_work_status   text,
    applied_on_behalf_by    text REFERENCES users(id) ON DELETE SET NULL,
    correlation_id          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_leave_applications_no UNIQUE (tenant_id, application_no),
    CONSTRAINT ck_leave_applications_dates CHECK (end_date >= start_date)
);
CREATE INDEX ix_leave_applications_tenant   ON leave_applications(tenant_id);
CREATE INDEX ix_leave_applications_entity   ON leave_applications(entity_id);
CREATE INDEX ix_leave_applications_employee ON leave_applications(employee_id);
CREATE INDEX ix_leave_applications_type     ON leave_applications(leave_type_id);
CREATE INDEX ix_leave_applications_status   ON leave_applications(status);
CREATE INDEX ix_leave_applications_wf       ON leave_applications(workflow_instance_id);
CREATE INDEX ix_leave_applications_doc      ON leave_applications(supporting_document_id);
CREATE INDEX ix_leave_applications_lineage  ON leave_applications(leave_spell_lineage_id);
CREATE INDEX ix_leave_applications_srpost   ON leave_applications(sr_posting_status);
CREATE INDEX ix_leave_applications_dates    ON leave_applications(start_date, end_date);

-- E21 leave_reservations (soft-reserve holds, R1) -------------------------------------
CREATE TABLE leave_reservations (
    id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- reservation_id
    tenant_id      text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id      text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id    text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id  text NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    leave_year     int NOT NULL,
    application_id text NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
    reserved_units numeric(6,2) NOT NULL,
    status         text NOT NULL DEFAULT 'RESERVED',
    expires_at     timestamptz,                                  -- RESERVATION_TTL_MIN auto-release
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text,
    updated_by     text,
    is_deleted     boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_leave_reservations_tenant   ON leave_reservations(tenant_id);
CREATE INDEX ix_leave_reservations_entity   ON leave_reservations(entity_id);
CREATE INDEX ix_leave_reservations_employee ON leave_reservations(employee_id);
CREATE INDEX ix_leave_reservations_type     ON leave_reservations(leave_type_id);
CREATE INDEX ix_leave_reservations_app      ON leave_reservations(application_id);
CREATE INDEX ix_leave_reservations_status   ON leave_reservations(status);
CREATE INDEX ix_leave_reservations_expiry   ON leave_reservations(expires_at) WHERE status = 'RESERVED';

-- Resolve circular FK: leave_applications.reservation_id -> leave_reservations ---------
ALTER TABLE leave_applications
    ADD CONSTRAINT fk_leave_applications_reservation
    FOREIGN KEY (reservation_id) REFERENCES leave_reservations(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ix_leave_applications_reservation ON leave_applications(reservation_id);

