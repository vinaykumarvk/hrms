-- PH-06A migration 0002: G03 leave substrate — faithful subset of docs/data-model/03-G03-attendance-leave.sql
-- Tables: leave_types, leave_accrual_policies, leave_ledger_entries, leave_balances, leave_applications, leave_reservations

-- SECTION 1 — ENUM TYPES (module-unique closed enumerations; g03_ prefix)
-- =====================================================================================

-- Shifts / rosters / holidays ---------------------------------------------------------
CREATE TYPE g03_shift_date_anchor   AS ENUM ('SHIFT_START_LOCAL_DATE','PUNCH_LOCAL_DATE');
CREATE TYPE g03_active_status       AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE g03_roster_status       AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED');
CREATE TYPE g03_calendar_status     AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE g03_holiday_type        AS ENUM ('GAZETTED','RESTRICTED','SECTIONAL','OPTIONAL');
CREATE TYPE g03_rh_election_status  AS ENUM ('ELECTED','CANCELLED');

-- Devices / punches -------------------------------------------------------------------
CREATE TYPE g03_device_type         AS ENUM ('BIOMETRIC','RFID','MOBILE_APP','WEB');
CREATE TYPE g03_device_binding_mode AS ENUM ('OPEN','EMPLOYEE_BOUND');
CREATE TYPE g03_template_storage    AS ENUM ('ON_DEVICE','SERVER_ENCRYPTED','NONE');
CREATE TYPE g03_device_status       AS ENUM ('ACTIVE','INACTIVE','DECOMMISSIONED');
CREATE TYPE g03_punch_direction     AS ENUM ('IN','OUT','AUTO');
CREATE TYPE g03_capture_method      AS ENUM ('BIOMETRIC','RFID','MOBILE_GEO','WEB','MANUAL','OTP_FALLBACK');
CREATE TYPE g03_punch_ingest_status AS ENUM ('ACCEPTED','DUPLICATE','REJECTED','FLAGGED_FOR_REVIEW');

-- Daily attendance / allocations ------------------------------------------------------
-- Single derived-status set, reused by attendance_daily.status, allocation.segment_status
-- and regularisation_requests.requested_status (R2 derived rollup).
CREATE TYPE g03_attendance_status   AS ENUM
    ('PRESENT','ON_LEAVE','WFH','ON_DUTY','HOLIDAY','WEEKLY_OFF','ABSENT','HALF_DAY','MISSING_PUNCH');
CREATE TYPE g03_alloc_source_ref    AS ENUM ('LEAVE_APPLICATION','EXCEPTION','PUNCH','HOLIDAY','SYSTEM');
CREATE TYPE g03_regularisation_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED');

-- Overtime / exceptions / comp-off ----------------------------------------------------
CREATE TYPE g03_ot_treatment        AS ENUM ('PAID','COMP_OFF');
CREATE TYPE g03_overtime_status     AS ENUM ('SUBMITTED','APPROVED','REJECTED','PAID','CONVERTED_TO_COMPOFF');
CREATE TYPE g03_exception_type      AS ENUM ('WFH','ON_DUTY','TOUR');
CREATE TYPE g03_day_portion         AS ENUM ('FULL','FIRST_HALF','SECOND_HALF');
CREATE TYPE g03_exception_status    AS ENUM ('SUBMITTED','APPROVED','REJECTED','CANCELLED');
CREATE TYPE g03_compoff_entry_type  AS ENUM ('EARN','REDEEM','EXPIRE','ADJUST');
CREATE TYPE g03_compoff_source_ref  AS ENUM ('OVERTIME','HOLIDAY_WORK','LEAVE_APPLICATION','MANUAL');

-- Leave catalog / accrual -------------------------------------------------------------
CREATE TYPE g03_leave_category      AS ENUM ('PAID','HALF_PAY','UNPAID','SPECIAL');
CREATE TYPE g03_gender_eligibility  AS ENUM ('ALL','FEMALE','MALE');
CREATE TYPE g03_year_basis          AS ENUM ('CALENDAR','FINANCIAL','CAREER','EVENT');
CREATE TYPE g03_sandwich_rule       AS ENUM ('EXCLUDE','INCLUDE_IF_SANDWICHED','ALWAYS_INCLUDE');
CREATE TYPE g03_accrual_frequency   AS ENUM ('ANNUAL','MONTHLY','HALF_YEARLY','ON_JOINING','NONE');
CREATE TYPE g03_accrual_basis       AS ENUM ('CALENDAR','SERVICE_LENGTH','ATTENDANCE_PRORATED');
CREATE TYPE g03_rounding_mode       AS ENUM ('NEAREST_HALF_CARRY','ROUND_DOWN','ROUND_UP','BANKERS');
CREATE TYPE g03_lapse_rule          AS ENUM ('LAPSE_EXCESS','NO_LAPSE','CONVERT_TO_HPL');
CREATE TYPE g03_policy_status       AS ENUM ('ACTIVE','SUPERSEDED','DRAFT');

-- Leave balance / ledger / applications -----------------------------------------------
CREATE TYPE g03_ledger_entry_type   AS ENUM
    ('ACCRUAL','OPENING','AVAIL','AVAIL_REVERSAL','ENCASHMENT','LAPSE','CARRY_FORWARD',
     'ADJUSTMENT','HPL_CONVERSION','CLAWBACK');
CREATE TYPE g03_ledger_source_ref   AS ENUM
    ('LEAVE_APPLICATION','ACCRUAL_RUN','YEAR_CLOSE','ENCASHMENT','MANUAL','EXIT_CLAWBACK');
CREATE TYPE g03_leave_app_status    AS ENUM
    ('DRAFT','SUBMITTED','RECOMMENDED','APPROVED','REJECTED','CANCELLED','WITHDRAWN');
CREATE TYPE g03_sr_posting_status   AS ENUM ('NOT_REQUIRED','PENDING','POSTED','FAILED');
CREATE TYPE g03_rtw_status          AS ENUM ('NOT_REQUIRED','PENDING','CLEARED');
CREATE TYPE g03_reservation_status  AS ENUM ('RESERVED','RELEASED','CONSUMED');

-- Encashment / year-close / payroll feed ----------------------------------------------
CREATE TYPE g03_encashment_type     AS ENUM ('IN_SERVICE','RETIREMENT','LTC');
CREATE TYPE g03_encashment_status   AS ENUM ('SUBMITTED','APPROVED','REJECTED','SETTLED','CANCELLED');
CREATE TYPE g03_close_run_status    AS ENUM ('DRAFT','SIMULATED','COMMITTED','FAILED');
CREATE TYPE g03_feed_export_status  AS ENUM ('PENDING','EXPORTED','ACKED','FAILED');
CREATE TYPE g03_feed_adjust_type    AS ENUM
    ('LWP_DELTA','HALF_PAY_DELTA','OT_DELTA','PRESENT_DELTA','ENCASHMENT_DELTA');
CREATE TYPE g03_feed_adjust_source  AS ENUM
    ('REGULARISATION','ROSTER_EDIT','HOLIDAY_EDIT','LEAVE_CANCEL','MANUAL');
CREATE TYPE g03_feed_adjust_status  AS ENUM ('PENDING','EXPORTED','ACKED');

-- Entitlements / processing runs / delegation -----------------------------------------
CREATE TYPE g03_quota_basis         AS ENUM ('CAREER','EVENT','ANNUAL');
CREATE TYPE g03_proc_trigger_type   AS ENUM ('SCHEDULED','ON_DEMAND','RECOMPUTE_ENQUEUED');
CREATE TYPE g03_proc_run_status     AS ENUM ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED');
CREATE TYPE g03_delegation_status   AS ENUM ('ACTIVE','EXPIRED','REVOKED');

-- DPDP consent / anomaly review -------------------------------------------------------
CREATE TYPE g03_lawful_basis        AS ENUM ('STATUTORY_DUTY','CONSENT','EMPLOYMENT_CONTRACT');
CREATE TYPE g03_consent_status      AS ENUM ('GRANTED','WITHDRAWN','NOT_REQUIRED');
CREATE TYPE g03_fallback_method     AS ENUM ('RFID','MANUAL','OTP');
CREATE TYPE g03_anomaly_type        AS ENUM
    ('IMPOSSIBLE_TRAVEL','DUPLICATE_SECOND','GEO_MISMATCH','LOW_LIVENESS','DEVICE_BINDING_MISMATCH');
CREATE TYPE g03_anomaly_review_status AS ENUM ('OPEN','CONFIRMED_VALID','CONFIRMED_FRAUD','ESCALATED');


-- E12 leave_types (self-ref debits_against; tenant-wide catalog -> entity_id NULLABLE) --
CREATE TABLE leave_types (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- leave_type_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,  -- null = tenant-wide
    leave_code                  varchar(20) NOT NULL,                 -- CL,EL,HPL,COMMUTED,MAT,PAT,CCL...
    name                        varchar(120) NOT NULL,
    category                    g03_leave_category NOT NULL,
    is_accruable                boolean NOT NULL,
    is_sanction_based           boolean NOT NULL DEFAULT false,       -- governed by entitlement counter (E24)
    is_encashable               boolean NOT NULL,
    is_encashable_on_retirement boolean NOT NULL DEFAULT false,
    affects_pay                 boolean NOT NULL,
    gender_eligibility          g03_gender_eligibility NOT NULL DEFAULT 'ALL',
    requires_document           boolean NOT NULL DEFAULT false,
    debit_ratio                 numeric(4,2) NOT NULL DEFAULT 1.00,   -- COMMUTED = 2.00
    debits_against_leave_type_id uuid REFERENCES leave_types(id) ON DELETE RESTRICT,  -- COMMUTED -> HPL
    year_basis                  g03_year_basis NOT NULL DEFAULT 'CALENDAR',
    sandwich_rule               g03_sandwich_rule NOT NULL DEFAULT 'EXCLUDE',
    requires_return_to_work_cert boolean NOT NULL DEFAULT false,
    max_continuous_days         int,
    applicable_cadre_ids        jsonb,
    status                      g03_active_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
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
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- policy_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    leave_type_id            uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    scope_org_unit_id        uuid REFERENCES org_units(id) ON DELETE SET NULL,
    scope_cadre_id           uuid REFERENCES cadres(id) ON DELETE SET NULL,
    accrual_frequency        g03_accrual_frequency NOT NULL,
    accrual_quantity         numeric(5,2) NOT NULL,
    accrual_basis            g03_accrual_basis NOT NULL,
    rounding_mode            g03_rounding_mode NOT NULL DEFAULT 'NEAREST_HALF_CARRY',
    proration_method         varchar(60) NOT NULL DEFAULT 'DAYS_IN_SERVICE_OVER_CYCLE',
    suspend_accrual_on_lwp   boolean NOT NULL DEFAULT true,
    max_balance_cap          numeric(6,2),
    carry_forward_allowed    boolean NOT NULL,
    carry_forward_cap        numeric(6,2),
    encashment_cap_days      numeric(6,2),
    retirement_encash_cap_days numeric(6,2),                          -- combined EL+HPL ceiling (e.g. 300)
    lapse_rule               g03_lapse_rule NOT NULL,
    min_balance_for_encash   numeric(6,2),
    advance_allowed          boolean NOT NULL DEFAULT false,
    effective_from           date NOT NULL,
    effective_to             date,
    status                   g03_policy_status NOT NULL DEFAULT 'ACTIVE',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
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
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- ledger_entry_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id       uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    leave_year          int NOT NULL,
    entry_type          g03_ledger_entry_type NOT NULL,
    amount              numeric(6,2) NOT NULL,                       -- signed (+credit / -debit)
    balance_after       numeric(6,2) NOT NULL,
    source_ref_type     g03_ledger_source_ref,
    source_ref_id       uuid,
    effective_date      date NOT NULL,
    remarks             text,
    reversed_by_entry_id uuid REFERENCES leave_ledger_entries(id) ON DELETE SET NULL,
    correlation_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid
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
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- balance_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id        uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
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
    last_ledger_entry_id uuid REFERENCES leave_ledger_entries(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
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
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- application_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    application_no          varchar(30) NOT NULL,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id           uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date              date NOT NULL,
    end_date                date NOT NULL,
    total_days              numeric(5,2) NOT NULL,
    ledger_debit_units      numeric(6,2) NOT NULL,                   -- total_days * debit_ratio
    reason                  text NOT NULL,
    is_backdated            boolean NOT NULL DEFAULT false,
    contact_during_leave    varchar(120),
    supporting_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
    reservation_id          uuid,                                    -- FK -> leave_reservations (added below)
    workflow_instance_id    uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status                  g03_leave_app_status NOT NULL DEFAULT 'DRAFT',
    sr_posting_status       g03_sr_posting_status NOT NULL DEFAULT 'NOT_REQUIRED',
    leave_spell_lineage_id  uuid NOT NULL,                           -- stable spell key; emitted to G04 (no SR write here)
    return_to_work_status   g03_rtw_status,
    applied_on_behalf_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    correlation_id          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
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
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- reservation_id
    tenant_id      uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id  uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    leave_year     int NOT NULL,
    application_id uuid NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
    reserved_units numeric(6,2) NOT NULL,
    status         g03_reservation_status NOT NULL DEFAULT 'RESERVED',
    expires_at     timestamptz,                                  -- RESERVATION_TTL_MIN auto-release
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
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

