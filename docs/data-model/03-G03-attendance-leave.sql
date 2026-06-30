-- =====================================================================================
-- GOVERNMENT HRMS — G03 ATTENDANCE AND LEAVE MANAGEMENT
-- Module schema: 03-G03-attendance-leave.sql
-- =====================================================================================
-- G03 is the time-and-absence system of record: shifts/rosters/holidays, punch capture
-- with DPDP consent + anti-fraud, daily attendance processing with sub-day allocation,
-- the full public-sector leave catalog (EL/HPL/Commuted/Maternity/CCL/Study/LWP...),
-- a concurrency-controlled leave-balance ledger, soft-reserve reservations, entitlement
-- counters, encashment, and the payroll feed with locked-period adjustments. It is the
-- platform-grounded EXTEND/REUSE of PrimeSoft M04 (Leave) + M05 (Attendance).
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                       (mandatory module conventions)
--   docs/data-model/00-platform-core.sql                 (canonical core tables; load FIRST)
--   docs/brd/v3/G03-attendance-and-leave-management.md   (§5 entities, samples, enums, rules)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING.
--   * Load AFTER 00-platform-core.sql (00). Every FK target outside this file resolves to
--     a core table created by 00 (employees, employee_dependents, org_units, cadres,
--     workflow_instances, documents, tenants, entities). Logically G03 precedes 04-G04
--     (the leave->SR writer) but has NO hard DDL dependency on it.
--   * This file creates ONLY the 31 G03 module-owned tables (BRD §5.1: E1..E28, E29a, E30,
--     E31). It does NOT redefine any core table. E29 `employee_dependents` is G01-owned and
--     only REFERENCED (read-only) — never re-declared; its leave-only satellite is E29a.
--
-- CORE-TABLE ASSUMPTIONS (FK / reference only — NOT redefined here).
--   * employees(id)            — G01 golden record; owner of every time/leave row. ON DELETE
--                                RESTRICT (soft-deleted employees block new rows; integrity r7).
--   * employee_dependents(id)  — G01-owned; E29a (dependent_leave_eligibility) FKs it 1:1.
--   * org_units(id)            — applicability/scope refs. ON DELETE RESTRICT (scope) /
--                                SET NULL (nullable scope).
--   * cadres(id)               — accrual-policy cadre scope. ON DELETE RESTRICT.
--   * workflow_instances(id)   — P01 maker-checker approval chains (leave/regularisation/OT/
--                                exception/encashment/anomaly). ON DELETE SET NULL.
--   * documents(id)            — G13 vault: medical certs, tour orders, punch photos, consent
--                                artefacts, simulation reports. ON DELETE SET NULL.
--   * tenants(id)/entities(id) — tenancy scope (Platform §0.1). ON DELETE RESTRICT.
--   * users(id)               — actor columns (created_by/updated_by) are LOGICAL refs
--                                (uuid, NO FK) per CONVENTIONS §3 (survive user removal).
--                                Domain user roles (delegator/delegate/reviewer/executor/
--                                assigned_by/on-behalf) DO FK to users(id) with deliberate
--                                ON DELETE behaviour.
--   * service_register_events  — G12-owned SR ledger. G03 is NOT an SR writer: it feeds G04
--                                via `leave_applications.leave_spell_lineage_id` (no FK).
--   * consent_records          — P05 DPDPA substrate that `biometric_consents` mirrors
--                                (logical mirror; no FK — consent rows are immutable in P05).
--
-- CONVENTIONS APPLIED (see CONVENTIONS.md).
--   * Every table: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (BRD domain name in comment).
--   * Every table: tenant_id NOT NULL -> tenants ON DELETE RESTRICT; entity_id -> entities
--     ON DELETE RESTRICT (NOT NULL on entity-scoped tables; NULLABLE on tenant-wide
--     catalog/config: leave_types, leave_accrual_policies, module_config).
--   * Standard audit cols (created_at/updated_at/created_by/updated_by/is_deleted) on every
--     business table. APPEND-ONLY LEDGERS (attendance_punches, comp_off_ledger,
--     leave_ledger_entries) carry ONLY created_at/created_by — no updated_at/is_deleted;
--     INSERT-only (corrections via compensating entries); each also fires the P05 trigger.
--   * Enums: module CLOSED enumerations as `CREATE TYPE g03_* AS ENUM` (UPPER_SNAKE).
--     Tenant-configurable value sets (leave codes, shift codes...) stay text business keys.
--   * Every FK column indexed; tenant_id/entity_id/status/*_date/business keys indexed.
--     Business keys are tenant-scoped UNIQUE. RLS tenant-isolation applied in the RLS section.
--
-- NAMING NOTE — leave_ledger_entries (BRD E15 `leave_balance_ledger`).
--   The append-only balance ledger is named `leave_ledger_entries` to match the logical
--   reference already consumed by 04-G04 (`leave_ledger_entry_id`, no FK). It is BRD E15.
--
-- CIRCULAR FK.
--   leave_applications.reservation_id <-> leave_reservations.application_id is resolved by
--   creating leave_applications first (without the reservation FK), then leave_reservations,
--   then ALTER ... ADD CONSTRAINT (DEFERRABLE INITIALLY DEFERRED) for the back-reference.
-- =====================================================================================


-- =====================================================================================
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


-- =====================================================================================
-- SECTION 2 — TIME & ATTENDANCE MASTERS (E1..E5) — EXTEND M05
-- =====================================================================================

-- E1 shifts ---------------------------------------------------------------------------
CREATE TABLE shifts (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- shift_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    shift_code                  varchar(20) NOT NULL,                 -- e.g. GEN, NIGHT-A
    name                        varchar(100) NOT NULL,
    start_time                  time NOT NULL,
    end_time                    time NOT NULL,
    grace_minutes               int NOT NULL DEFAULT 10,
    half_day_threshold_minutes  int NOT NULL,
    full_day_threshold_minutes  int NOT NULL,
    break_minutes               int NOT NULL DEFAULT 0,
    is_night_shift              boolean NOT NULL DEFAULT false,
    date_anchor_rule            g03_shift_date_anchor NOT NULL DEFAULT 'SHIFT_START_LOCAL_DATE',
    display_timezone            varchar(40) NOT NULL DEFAULT 'Asia/Kolkata',
    org_unit_scope_id           uuid REFERENCES org_units(id) ON DELETE SET NULL,
    status                      g03_active_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_shifts_code UNIQUE (tenant_id, shift_code),
    CONSTRAINT ck_shifts_thresholds CHECK (full_day_threshold_minutes >= half_day_threshold_minutes)
);
CREATE INDEX ix_shifts_tenant  ON shifts(tenant_id);
CREATE INDEX ix_shifts_entity  ON shifts(entity_id);
CREATE INDEX ix_shifts_scope   ON shifts(org_unit_scope_id);
CREATE INDEX ix_shifts_status  ON shifts(status);

-- E2 rosters --------------------------------------------------------------------------
CREATE TABLE rosters (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- roster_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    shift_id            uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    effective_from      date NOT NULL,
    effective_to        date,
    weekly_off_pattern  jsonb NOT NULL,                              -- e.g. ["SUN","SAT2","SAT4"]
    assigned_by         uuid REFERENCES users(id) ON DELETE SET NULL,
    status              g03_roster_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_rosters_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
    -- No overlapping PUBLISHED roster per employee/range: VAL-G03-ROSTER-OVERLAP (app + job).
);
CREATE INDEX ix_rosters_tenant    ON rosters(tenant_id);
CREATE INDEX ix_rosters_entity    ON rosters(entity_id);
CREATE INDEX ix_rosters_employee  ON rosters(employee_id);
CREATE INDEX ix_rosters_shift     ON rosters(shift_id);
CREATE INDEX ix_rosters_status    ON rosters(status);
CREATE INDEX ix_rosters_effective ON rosters(employee_id, effective_from);

-- E3 holiday_calendars ----------------------------------------------------------------
CREATE TABLE holiday_calendars (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- calendar_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    calendar_code      varchar(30) NOT NULL,                        -- e.g. HQ-2026
    name               varchar(120) NOT NULL,
    year               int NOT NULL,
    location_scope_id  uuid REFERENCES org_units(id) ON DELETE SET NULL,
    rh_cap             int NOT NULL DEFAULT 2,
    status             g03_calendar_status NOT NULL DEFAULT 'DRAFT',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_holiday_calendars_code UNIQUE (tenant_id, calendar_code)
);
CREATE INDEX ix_holiday_calendars_tenant ON holiday_calendars(tenant_id);
CREATE INDEX ix_holiday_calendars_entity ON holiday_calendars(entity_id);
CREATE INDEX ix_holiday_calendars_scope  ON holiday_calendars(location_scope_id);
CREATE INDEX ix_holiday_calendars_year   ON holiday_calendars(year);

-- E4 holidays -------------------------------------------------------------------------
CREATE TABLE holidays (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- holiday_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    calendar_id           uuid NOT NULL REFERENCES holiday_calendars(id) ON DELETE RESTRICT,
    holiday_date          date NOT NULL,
    name                  varchar(120) NOT NULL,
    holiday_type          g03_holiday_type NOT NULL,
    is_restricted_optional boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_holidays_date UNIQUE (calendar_id, holiday_date)    -- VAL-G03-HOLIDAY-DUP
);
CREATE INDEX ix_holidays_tenant   ON holidays(tenant_id);
CREATE INDEX ix_holidays_calendar ON holidays(calendar_id);
CREATE INDEX ix_holidays_date     ON holidays(holiday_date);
CREATE INDEX ix_holidays_type     ON holidays(holiday_type);

-- E5 attendance_devices ---------------------------------------------------------------
CREATE TABLE attendance_devices (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- device_id (registered in P04)
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    device_code          varchar(40) NOT NULL,
    device_type          g03_device_type NOT NULL,
    location_org_unit_id uuid REFERENCES org_units(id) ON DELETE SET NULL,
    geofence             jsonb,                                       -- {lat,long,radius_m}
    api_key_hash         varchar(255),                               -- hashed; rotation via P04 creds
    supports_liveness    boolean NOT NULL DEFAULT false,
    binding_mode         g03_device_binding_mode NOT NULL DEFAULT 'OPEN',
    template_storage     g03_template_storage NOT NULL DEFAULT 'ON_DEVICE',
    status               g03_device_status NOT NULL DEFAULT 'ACTIVE',
    last_seen_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_attendance_devices_code UNIQUE (tenant_id, device_code)
);
CREATE INDEX ix_attendance_devices_tenant ON attendance_devices(tenant_id);
CREATE INDEX ix_attendance_devices_entity ON attendance_devices(entity_id);
CREATE INDEX ix_attendance_devices_org    ON attendance_devices(location_org_unit_id);
CREATE INDEX ix_attendance_devices_status ON attendance_devices(status);


-- =====================================================================================
-- SECTION 3 — DPDP CONSENT (E30) — created before punches (punch.consent_id FK)
-- =====================================================================================

-- E30 biometric_consents (links P05 consent_records) ----------------------------------
CREATE TABLE biometric_consents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- consent_id (mirrors P05 consent_records)
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    lawful_basis        g03_lawful_basis NOT NULL,
    capture_types       jsonb NOT NULL,                              -- ["BIOMETRIC","GEO","PHOTO"]
    consent_status      g03_consent_status NOT NULL,
    fallback_method     g03_fallback_method,
    consent_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    granted_at          timestamptz,
    withdrawn_at        timestamptz,
    retention_until     date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_biometric_consents_tenant   ON biometric_consents(tenant_id);
CREATE INDEX ix_biometric_consents_entity   ON biometric_consents(entity_id);
CREATE INDEX ix_biometric_consents_employee ON biometric_consents(employee_id);
CREATE INDEX ix_biometric_consents_status   ON biometric_consents(consent_status);
CREATE INDEX ix_biometric_consents_doc      ON biometric_consents(consent_document_id);


-- =====================================================================================
-- SECTION 4 — PROCESSING RUNS (E25) — created before attendance_daily / punches
-- =====================================================================================

-- E25 attendance_processing_runs (X.1 job; resolves attendance_daily.processing_run_id) -
CREATE TABLE attendance_processing_runs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- run_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    scope_org_unit_id    uuid REFERENCES org_units(id) ON DELETE SET NULL,
    date_from            date NOT NULL,
    date_to              date NOT NULL,
    trigger_type         g03_proc_trigger_type NOT NULL,
    status               g03_proc_run_status NOT NULL DEFAULT 'QUEUED',
    employees_processed  int NOT NULL DEFAULT 0,
    employees_failed     int NOT NULL DEFAULT 0,
    started_at           timestamptz,
    finished_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_proc_runs_dates CHECK (date_to >= date_from)
);
CREATE INDEX ix_proc_runs_tenant ON attendance_processing_runs(tenant_id);
CREATE INDEX ix_proc_runs_entity ON attendance_processing_runs(entity_id);
CREATE INDEX ix_proc_runs_scope  ON attendance_processing_runs(scope_org_unit_id);
CREATE INDEX ix_proc_runs_status ON attendance_processing_runs(status);
CREATE INDEX ix_proc_runs_range  ON attendance_processing_runs(date_from, date_to);


-- =====================================================================================
-- SECTION 5 — PUNCHES (E6, append-only) + RH ELECTIONS (E26)
-- =====================================================================================

-- E6 attendance_punches (APPEND-ONLY ledger; +P05 trigger) ----------------------------
CREATE TABLE attendance_punches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- punch_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    device_id         uuid REFERENCES attendance_devices(id) ON DELETE SET NULL,
    punch_time        timestamptz NOT NULL,                        -- UTC
    attendance_date   date NOT NULL,                               -- shift-anchored local date
    punch_direction   g03_punch_direction,
    capture_method    g03_capture_method NOT NULL,
    geo_lat           numeric(9,6),
    geo_long          numeric(9,6),
    photo_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    liveness_score    numeric(4,3),
    consent_id        uuid REFERENCES biometric_consents(id) ON DELETE SET NULL,
    source_ref        varchar(120),                                -- device raw event id (idempotency)
    ingestion_status  g03_punch_ingest_status NOT NULL,
    anomaly_flags     jsonb,
    correlation_id    text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    -- Append-only: no updated_at / no is_deleted (CONVENTIONS §3).
    CONSTRAINT uq_punches_idempotent UNIQUE (device_id, source_ref)   -- idempotent ingestion
);
CREATE INDEX ix_punches_tenant     ON attendance_punches(tenant_id);
CREATE INDEX ix_punches_entity     ON attendance_punches(entity_id);
CREATE INDEX ix_punches_employee   ON attendance_punches(employee_id, attendance_date);
CREATE INDEX ix_punches_device     ON attendance_punches(device_id);
CREATE INDEX ix_punches_consent    ON attendance_punches(consent_id);
CREATE INDEX ix_punches_photo      ON attendance_punches(photo_document_id);
CREATE INDEX ix_punches_status     ON attendance_punches(ingestion_status);
CREATE INDEX ix_punches_time       ON attendance_punches(punch_time);
COMMENT ON TABLE attendance_punches IS 'G03 E6 raw punch ledger. Append-only; INSERT-only, also fires P05 trigger.';

-- E26 rh_elections --------------------------------------------------------------------
CREATE TABLE rh_elections (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- election_id
    tenant_id    uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    calendar_id  uuid NOT NULL REFERENCES holiday_calendars(id) ON DELETE RESTRICT,
    holiday_id   uuid NOT NULL REFERENCES holidays(id) ON DELETE RESTRICT,  -- must be RESTRICTED
    leave_year   int NOT NULL,
    status       g03_rh_election_status NOT NULL DEFAULT 'ELECTED',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_by   uuid,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_rh_elections UNIQUE (employee_id, holiday_id)   -- ELECTED count <= rh_cap: VAL-G03-RHCAP
);
CREATE INDEX ix_rh_elections_tenant   ON rh_elections(tenant_id);
CREATE INDEX ix_rh_elections_entity   ON rh_elections(entity_id);
CREATE INDEX ix_rh_elections_employee ON rh_elections(employee_id);
CREATE INDEX ix_rh_elections_calendar ON rh_elections(calendar_id);
CREATE INDEX ix_rh_elections_holiday  ON rh_elections(holiday_id);


-- =====================================================================================
-- SECTION 6 — LEAVE CATALOG & ACCRUAL (E12, E13) — EXTEND M04 + G03 ext
-- =====================================================================================

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
-- SECTION 8 — LEAVE APPLICATIONS (E16), RESERVATIONS (E21), DAYS (E17)
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

-- E17 leave_application_days ----------------------------------------------------------
CREATE TABLE leave_application_days (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- application_day_id
    tenant_id      uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    application_id uuid NOT NULL REFERENCES leave_applications(id) ON DELETE CASCADE,
    leave_date     date NOT NULL,
    day_portion    g03_day_portion NOT NULL,
    day_units      numeric(3,2) NOT NULL,                        -- 1.0 / 0.5
    is_non_working boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_leave_application_days UNIQUE (application_id, leave_date)  -- SUM(day_units)=total_days: VAL-G03-DAYUNITS
);
CREATE INDEX ix_leave_app_days_tenant ON leave_application_days(tenant_id);
CREATE INDEX ix_leave_app_days_entity ON leave_application_days(entity_id);
CREATE INDEX ix_leave_app_days_app    ON leave_application_days(application_id);
CREATE INDEX ix_leave_app_days_date   ON leave_application_days(leave_date);


-- =====================================================================================
-- SECTION 9 — DAILY ATTENDANCE (E7) + ALLOCATIONS (E22) + REQUEST FLOWS (E8,E9,E10)
-- =====================================================================================

-- E7 attendance_daily (derived rollup; FR-04 is the SOLE writer, R15) -----------------
CREATE TABLE attendance_daily (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- attendance_daily_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date     date NOT NULL,
    roster_id           uuid REFERENCES rosters(id) ON DELETE SET NULL,
    first_in            timestamptz,
    last_out            timestamptz,
    worked_minutes      int NOT NULL DEFAULT 0,
    status              g03_attendance_status NOT NULL,
    present_units       numeric(3,2) NOT NULL DEFAULT 0,             -- Σ present-counting fractions
    late_minutes        int NOT NULL DEFAULT 0,
    early_exit_minutes  int NOT NULL DEFAULT 0,
    leave_application_id uuid REFERENCES leave_applications(id) ON DELETE SET NULL,
    is_regularised      boolean NOT NULL DEFAULT false,
    processing_run_id   uuid REFERENCES attendance_processing_runs(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_attendance_daily UNIQUE (employee_id, attendance_date)
);
CREATE INDEX ix_attendance_daily_tenant   ON attendance_daily(tenant_id);
CREATE INDEX ix_attendance_daily_entity   ON attendance_daily(entity_id);
CREATE INDEX ix_attendance_daily_employee ON attendance_daily(employee_id, attendance_date);
CREATE INDEX ix_attendance_daily_date     ON attendance_daily(attendance_date);
CREATE INDEX ix_attendance_daily_status   ON attendance_daily(status);
CREATE INDEX ix_attendance_daily_roster   ON attendance_daily(roster_id);
CREATE INDEX ix_attendance_daily_leaveapp ON attendance_daily(leave_application_id);
CREATE INDEX ix_attendance_daily_run      ON attendance_daily(processing_run_id);

-- E22 attendance_day_allocations (sub-day set; Σ day_fraction <= 1.0, R2) --------------
CREATE TABLE attendance_day_allocations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- allocation_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    attendance_daily_id uuid NOT NULL REFERENCES attendance_daily(id) ON DELETE CASCADE,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date     date NOT NULL,
    segment_status      g03_attendance_status NOT NULL,
    day_fraction        numeric(3,2) NOT NULL,
    counts_as_present   boolean NOT NULL,
    source_ref_type     g03_alloc_source_ref,
    source_ref_id       uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_alloc_fraction CHECK (day_fraction > 0 AND day_fraction <= 1.0)  -- Σ<=1.0: VAL-G03-ALLOC
);
CREATE INDEX ix_alloc_tenant   ON attendance_day_allocations(tenant_id);
CREATE INDEX ix_alloc_entity   ON attendance_day_allocations(entity_id);
CREATE INDEX ix_alloc_daily    ON attendance_day_allocations(attendance_daily_id);
CREATE INDEX ix_alloc_employee ON attendance_day_allocations(employee_id, attendance_date);
CREATE INDEX ix_alloc_status   ON attendance_day_allocations(segment_status);

-- E8 regularisation_requests (P01 flow) -----------------------------------------------
CREATE TABLE regularisation_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- regularisation_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    attendance_daily_id uuid NOT NULL REFERENCES attendance_daily(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    requested_status    g03_attendance_status NOT NULL,
    proposed_first_in   timestamptz,
    proposed_last_out   timestamptz,
    reason              text NOT NULL,
    supporting_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    workflow_instance_id   uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status              g03_regularisation_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_regularisation_tenant   ON regularisation_requests(tenant_id);
CREATE INDEX ix_regularisation_entity   ON regularisation_requests(entity_id);
CREATE INDEX ix_regularisation_daily    ON regularisation_requests(attendance_daily_id);
CREATE INDEX ix_regularisation_employee ON regularisation_requests(employee_id);
CREATE INDEX ix_regularisation_wf       ON regularisation_requests(workflow_instance_id);
CREATE INDEX ix_regularisation_status   ON regularisation_requests(status);
CREATE INDEX ix_regularisation_doc      ON regularisation_requests(supporting_document_id);

-- E9 overtime_records (P01 flow) ------------------------------------------------------
CREATE TABLE overtime_records (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- overtime_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date      date NOT NULL,
    ot_minutes           int NOT NULL,
    ot_treatment         g03_ot_treatment NOT NULL,
    rate_multiplier      numeric(4,2),
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status               g03_overtime_status NOT NULL DEFAULT 'SUBMITTED',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_overtime_tenant   ON overtime_records(tenant_id);
CREATE INDEX ix_overtime_entity   ON overtime_records(entity_id);
CREATE INDEX ix_overtime_employee ON overtime_records(employee_id, attendance_date);
CREATE INDEX ix_overtime_wf       ON overtime_records(workflow_instance_id);
CREATE INDEX ix_overtime_status   ON overtime_records(status);

-- E10 attendance_exceptions (WFH / On-Duty / Tour; P01 flow) --------------------------
CREATE TABLE attendance_exceptions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- exception_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    exception_type       g03_exception_type NOT NULL,
    start_date           date NOT NULL,
    end_date             date NOT NULL,
    day_portion          g03_day_portion NOT NULL DEFAULT 'FULL',
    location_text        varchar(200),
    reason               text NOT NULL,
    supporting_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    workflow_instance_id   uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status               g03_exception_status NOT NULL DEFAULT 'SUBMITTED',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_exceptions_dates CHECK (end_date >= start_date)
);
CREATE INDEX ix_exceptions_tenant   ON attendance_exceptions(tenant_id);
CREATE INDEX ix_exceptions_entity   ON attendance_exceptions(entity_id);
CREATE INDEX ix_exceptions_employee ON attendance_exceptions(employee_id);
CREATE INDEX ix_exceptions_type     ON attendance_exceptions(exception_type);
CREATE INDEX ix_exceptions_wf       ON attendance_exceptions(workflow_instance_id);
CREATE INDEX ix_exceptions_status   ON attendance_exceptions(status);
CREATE INDEX ix_exceptions_dates    ON attendance_exceptions(start_date, end_date);


-- =====================================================================================
-- SECTION 10 — COMP-OFF LEDGER (E11, append-only)
-- =====================================================================================

-- E11 comp_off_ledger (sole comp-off SSOT, R17; APPEND-ONLY; +P05 trigger) ------------
CREATE TABLE comp_off_ledger (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- comp_off_entry_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    entry_type      g03_compoff_entry_type NOT NULL,
    days            numeric(4,2) NOT NULL,                       -- signed
    source_ref_type g03_compoff_source_ref,
    source_ref_id   uuid,
    earned_on       date,
    expires_on      date,
    balance_after   numeric(6,2) NOT NULL,
    remarks         text,
    correlation_id  text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid
    -- Append-only: no updated_at / no is_deleted.
);
CREATE INDEX ix_comp_off_tenant   ON comp_off_ledger(tenant_id);
CREATE INDEX ix_comp_off_entity   ON comp_off_ledger(entity_id);
CREATE INDEX ix_comp_off_employee ON comp_off_ledger(employee_id);
CREATE INDEX ix_comp_off_type     ON comp_off_ledger(entry_type);
CREATE INDEX ix_comp_off_expires  ON comp_off_ledger(expires_on);
COMMENT ON TABLE comp_off_ledger IS 'G03 E11 comp-off balance ledger (sole source of truth, R17). Append-only; also fires P05 trigger.';


-- =====================================================================================
-- SECTION 11 — PAYROLL FEED (E20) + ADJUSTMENTS (E23) + ENCASHMENT (E18) + CLOSE (E19)
-- =====================================================================================

-- E20 payroll_attendance_feed (X.3 outbound to G10) -----------------------------------
CREATE TABLE payroll_attendance_feed (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- feed_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    pay_period        varchar(7) NOT NULL,                         -- YYYY-MM
    employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    lwp_days          numeric(5,2) NOT NULL DEFAULT 0,
    half_pay_days     numeric(5,2) NOT NULL DEFAULT 0,
    paid_ot_minutes   int NOT NULL DEFAULT 0,
    present_units     numeric(5,2) NOT NULL,
    encashment_amount numeric(12,2) NOT NULL DEFAULT 0,
    export_status     g03_feed_export_status NOT NULL DEFAULT 'PENDING',
    is_locked         boolean NOT NULL DEFAULT false,
    exported_at       timestamptz,
    g10_batch_ref     varchar(60),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_payroll_feed UNIQUE (pay_period, employee_id)
);
CREATE INDEX ix_payroll_feed_tenant   ON payroll_attendance_feed(tenant_id);
CREATE INDEX ix_payroll_feed_entity   ON payroll_attendance_feed(entity_id);
CREATE INDEX ix_payroll_feed_employee ON payroll_attendance_feed(employee_id);
CREATE INDEX ix_payroll_feed_period   ON payroll_attendance_feed(pay_period);
CREATE INDEX ix_payroll_feed_status   ON payroll_attendance_feed(export_status);
CREATE INDEX ix_payroll_feed_locked   ON payroll_attendance_feed(is_locked);

-- E23 payroll_feed_adjustments (next-period corrections to locked periods, R6) ---------
CREATE TABLE payroll_feed_adjustments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- adjustment_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    original_feed_id    uuid NOT NULL REFERENCES payroll_attendance_feed(id) ON DELETE RESTRICT,
    applied_in_pay_period varchar(7) NOT NULL,                      -- next open period
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    adjustment_type     g03_feed_adjust_type NOT NULL,
    delta_value         numeric(12,2) NOT NULL,
    reason              text NOT NULL,
    source_ref_type     g03_feed_adjust_source NOT NULL,
    source_ref_id       uuid,
    status              g03_feed_adjust_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_feed_adjust_tenant   ON payroll_feed_adjustments(tenant_id);
CREATE INDEX ix_feed_adjust_entity   ON payroll_feed_adjustments(entity_id);
CREATE INDEX ix_feed_adjust_feed     ON payroll_feed_adjustments(original_feed_id);
CREATE INDEX ix_feed_adjust_employee ON payroll_feed_adjustments(employee_id);
CREATE INDEX ix_feed_adjust_period   ON payroll_feed_adjustments(applied_in_pay_period);
CREATE INDEX ix_feed_adjust_status   ON payroll_feed_adjustments(status);

-- E18 leave_encashment_requests (P01 flow) --------------------------------------------
CREATE TABLE leave_encashment_requests (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- encashment_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id        uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    encashment_type      g03_encashment_type NOT NULL,
    days_requested       numeric(6,2) NOT NULL,
    days_approved        numeric(6,2),
    el_days_component    numeric(6,2),
    hpl_days_component   numeric(6,2),
    ltc_block_ref        varchar(30),
    amount_estimated     numeric(12,2),
    effective_date       date NOT NULL,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    payroll_feed_id      uuid REFERENCES payroll_attendance_feed(id) ON DELETE SET NULL,
    status               g03_encashment_status NOT NULL DEFAULT 'SUBMITTED',
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_encashment_tenant   ON leave_encashment_requests(tenant_id);
CREATE INDEX ix_encashment_entity   ON leave_encashment_requests(entity_id);
CREATE INDEX ix_encashment_employee ON leave_encashment_requests(employee_id);
CREATE INDEX ix_encashment_type     ON leave_encashment_requests(leave_type_id);
CREATE INDEX ix_encashment_wf       ON leave_encashment_requests(workflow_instance_id);
CREATE INDEX ix_encashment_feed     ON leave_encashment_requests(payroll_feed_id);
CREATE INDEX ix_encashment_status   ON leave_encashment_requests(status);

-- E19 leave_year_close_runs (JOB-M04-CARRYFWD) ----------------------------------------
CREATE TABLE leave_year_close_runs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- close_run_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    leave_year              int NOT NULL,
    scope_org_unit_id       uuid REFERENCES org_units(id) ON DELETE SET NULL,
    run_status              g03_close_run_status NOT NULL DEFAULT 'DRAFT',
    employees_processed     int NOT NULL DEFAULT 0,
    total_carried           numeric(12,2) NOT NULL DEFAULT 0,
    total_lapsed            numeric(12,2) NOT NULL DEFAULT 0,
    total_converted         numeric(12,2) NOT NULL DEFAULT 0,
    executed_by             uuid REFERENCES users(id) ON DELETE SET NULL,
    simulation_report_doc_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_close_runs_tenant ON leave_year_close_runs(tenant_id);
CREATE INDEX ix_close_runs_entity ON leave_year_close_runs(entity_id);
CREATE INDEX ix_close_runs_year   ON leave_year_close_runs(leave_year);
CREATE INDEX ix_close_runs_scope  ON leave_year_close_runs(scope_org_unit_id);
CREATE INDEX ix_close_runs_status ON leave_year_close_runs(run_status);


-- =====================================================================================
-- SECTION 12 — ENTITLEMENTS (E24), CONFIG (E27), DELEGATIONS (E28), DEPENDENT SAT (E29a)
-- =====================================================================================

-- E24 leave_entitlements (career/event quota counter for sanction leave, R7/R14) ------
CREATE TABLE leave_entitlements (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- entitlement_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type_id        uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    quota_basis          g03_quota_basis NOT NULL,
    total_quota_days     numeric(6,2) NOT NULL,
    consumed_days        numeric(6,2) NOT NULL DEFAULT 0,
    remaining_days       numeric(6,2) NOT NULL,
    eligibility_predicate jsonb,                                    -- e.g. {"surviving_children_max":2}
    valid_from           date,
    valid_to             date,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_leave_entitlements UNIQUE (employee_id, leave_type_id, quota_basis)
);
CREATE INDEX ix_entitlements_tenant   ON leave_entitlements(tenant_id);
CREATE INDEX ix_entitlements_entity   ON leave_entitlements(entity_id);
CREATE INDEX ix_entitlements_employee ON leave_entitlements(employee_id);
CREATE INDEX ix_entitlements_type     ON leave_entitlements(leave_type_id);

-- E27 module_config (effective-dated config cascade; tenant/scope -> entity_id NULLABLE) -
CREATE TABLE module_config (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- config_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    config_key        varchar(60) NOT NULL,                        -- REGULARISATION_WINDOW_DAYS, RH_CAP...
    config_value      jsonb NOT NULL,
    scope_org_unit_id uuid REFERENCES org_units(id) ON DELETE SET NULL,
    effective_from    date NOT NULL,
    effective_to      date,
    status            g03_policy_status NOT NULL DEFAULT 'ACTIVE',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_module_config_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
    -- No overlapping ACTIVE per (config_key, scope); most-specific scope wins (app/job).
);
CREATE INDEX ix_module_config_tenant    ON module_config(tenant_id);
CREATE INDEX ix_module_config_entity    ON module_config(entity_id);
CREATE INDEX ix_module_config_key       ON module_config(tenant_id, config_key);
CREATE INDEX ix_module_config_scope     ON module_config(scope_org_unit_id);
CREATE INDEX ix_module_config_status    ON module_config(status);
CREATE INDEX ix_module_config_effective ON module_config(effective_from);

-- E28 approval_delegations (feeds P01 delegate; R11) ----------------------------------
CREATE TABLE approval_delegations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- delegation_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    delegator_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delegate_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    scope_org_unit_id  uuid REFERENCES org_units(id) ON DELETE SET NULL,
    request_types      jsonb,                                       -- ["LEAVE","REGULARISATION","OT"]
    from_date          date NOT NULL,
    to_date            date NOT NULL,
    auto_on_sla_breach boolean NOT NULL DEFAULT true,
    status             g03_delegation_status NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_delegation_dates CHECK (to_date >= from_date),
    CONSTRAINT ck_delegation_distinct CHECK (delegator_user_id <> delegate_user_id)  -- SoD (P02 enforces fully)
);
CREATE INDEX ix_appr_delegations_tenant    ON approval_delegations(tenant_id);
CREATE INDEX ix_appr_delegations_entity    ON approval_delegations(entity_id);
CREATE INDEX ix_appr_delegations_delegator ON approval_delegations(delegator_user_id);
CREATE INDEX ix_appr_delegations_delegate  ON approval_delegations(delegate_user_id);
CREATE INDEX ix_appr_delegations_scope     ON approval_delegations(scope_org_unit_id);
CREATE INDEX ix_appr_delegations_status    ON approval_delegations(status);
CREATE INDEX ix_appr_delegations_window    ON approval_delegations(from_date, to_date);

-- E29a dependent_leave_eligibility (1:1 satellite FK -> G01 employee_dependents) -------
-- Carries ONLY the leave-specific predicate G01 does not expose; never restates G01 cols.
CREATE TABLE dependent_leave_eligibility (
    dependent_id  uuid PRIMARY KEY REFERENCES employee_dependents(id) ON DELETE CASCADE,
    tenant_id     uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id) ON DELETE RESTRICT,
    is_surviving  boolean NOT NULL DEFAULT true,                    -- CCL <=2-children surviving predicate
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_dependent_elig_tenant ON dependent_leave_eligibility(tenant_id);
CREATE INDEX ix_dependent_elig_entity ON dependent_leave_eligibility(entity_id);
COMMENT ON TABLE dependent_leave_eligibility IS 'G03 E29a satellite of G01 employee_dependents. Leave-only is_surviving; all shared dependent attributes resolve from the G01 canonical entity.';


-- =====================================================================================
-- SECTION 13 — PUNCH ANOMALY REVIEW (E31; P01 review flow)
-- =====================================================================================

-- E31 punch_anomaly_reviews -----------------------------------------------------------
CREATE TABLE punch_anomaly_reviews (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- review_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    punch_id             uuid NOT NULL REFERENCES attendance_punches(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    anomaly_type         g03_anomaly_type NOT NULL,
    detected_at          timestamptz NOT NULL,
    reviewer_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,  -- != owner; SoD via P02
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status               g03_anomaly_review_status NOT NULL DEFAULT 'OPEN',
    resolution_notes     text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_anomaly_reviews_tenant   ON punch_anomaly_reviews(tenant_id);
CREATE INDEX ix_anomaly_reviews_entity   ON punch_anomaly_reviews(entity_id);
CREATE INDEX ix_anomaly_reviews_punch    ON punch_anomaly_reviews(punch_id);
CREATE INDEX ix_anomaly_reviews_employee ON punch_anomaly_reviews(employee_id);
CREATE INDEX ix_anomaly_reviews_reviewer ON punch_anomaly_reviews(reviewer_user_id);
CREATE INDEX ix_anomaly_reviews_wf       ON punch_anomaly_reviews(workflow_instance_id);
CREATE INDEX ix_anomaly_reviews_status   ON punch_anomaly_reviews(status);


-- =====================================================================================
-- SECTION 14 — ROW-LEVEL SECURITY (P02 data-scope substrate; CONVENTIONS §6)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to every G03-owned table (append-only
-- ledgers are RLS-scoped for read isolation too; immutability is a grant/trigger concern).
DO $$
DECLARE
    t text;
    g03_tables text[] := ARRAY[
        'shifts','rosters','holiday_calendars','holidays','attendance_devices',
        'biometric_consents','attendance_processing_runs','attendance_punches','rh_elections',
        'leave_types','leave_accrual_policies','leave_ledger_entries','leave_balances',
        'leave_applications','leave_reservations','leave_application_days',
        'attendance_daily','attendance_day_allocations','regularisation_requests',
        'overtime_records','attendance_exceptions','comp_off_ledger',
        'payroll_attendance_feed','payroll_feed_adjustments','leave_encashment_requests',
        'leave_year_close_runs','leave_entitlements','module_config','approval_delegations',
        'dependent_leave_eligibility','punch_anomaly_reviews'
    ];
BEGIN
    FOREACH t IN ARRAY g03_tables LOOP
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
-- SECTION 15 — SAMPLE SEED ROWS (BRD §5.7)
-- =====================================================================================
-- Reuse the core seed fixtures (00-platform-core.sql §12): tenant 1111…1111, entity
-- 2222…2201, employees 9999…9901 (GOV-100245) / 9999…9902, org_unit 3333…3301,
-- cadre 4444…4401. GUCs set so RLS WITH CHECK passes for the seed.
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- shifts (GEN day, NIGHT-A) -----------------------------------------------------------
INSERT INTO shifts (id, tenant_id, entity_id, shift_code, name, start_time, end_time, grace_minutes,
    half_day_threshold_minutes, full_day_threshold_minutes, is_night_shift, date_anchor_rule, status)
VALUES
 ('03a10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'GEN','General Shift','09:30','17:30',10,240,420,false,'SHIFT_START_LOCAL_DATE','ACTIVE'),
 ('03a10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'NIGHT-A','Night Shift A','22:00','06:00',15,240,420,true,'SHIFT_START_LOCAL_DATE','ACTIVE');

-- holiday_calendars + holidays --------------------------------------------------------
INSERT INTO holiday_calendars (id, tenant_id, entity_id, calendar_code, name, year, location_scope_id, rh_cap, status)
VALUES ('03a30001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'HQ-2026','Headquarters Calendar 2026',2026,'33333333-3333-3333-3333-333333333301',2,'PUBLISHED');

INSERT INTO holidays (id, tenant_id, entity_id, calendar_id, holiday_date, name, holiday_type, is_restricted_optional)
VALUES
 ('03a40001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '03a30001-0000-0000-0000-000000000001','2026-01-26','Republic Day','GAZETTED',false),
 ('03a40001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '03a30001-0000-0000-0000-000000000001','2026-03-04','Holi','RESTRICTED',true);

-- attendance_devices ------------------------------------------------------------------
INSERT INTO attendance_devices (id, tenant_id, entity_id, device_code, device_type, location_org_unit_id,
    supports_liveness, binding_mode, template_storage, status)
VALUES ('03a50001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'BIO-REVHQ-01','BIOMETRIC','33333333-3333-3333-3333-333333333301',true,'EMPLOYEE_BOUND','SERVER_ENCRYPTED','ACTIVE');

-- leave_types (EL, HPL, COMMUTED->HPL, MAT sanction, CCL sanction) ---------------------
INSERT INTO leave_types (id, tenant_id, entity_id, leave_code, name, category, is_accruable, is_sanction_based,
    is_encashable, is_encashable_on_retirement, affects_pay, gender_eligibility, requires_document, debit_ratio,
    debits_against_leave_type_id, year_basis, sandwich_rule, status)
VALUES
 ('03a12001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'EL','Earned Leave','PAID',
  true,false,true,true,false,'ALL',false,1.00,NULL,'CALENDAR','EXCLUDE','ACTIVE'),
 ('03a12001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,'HPL','Half Pay Leave','HALF_PAY',
  true,false,false,true,true,'ALL',false,1.00,NULL,'CALENDAR','INCLUDE_IF_SANDWICHED','ACTIVE'),
 ('03a12001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',NULL,'COMMUTED','Commuted Leave','SPECIAL',
  false,false,false,false,false,'ALL',true,2.00,'03a12001-0000-0000-0000-000000000002','CALENDAR','EXCLUDE','ACTIVE'),
 ('03a12001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',NULL,'MAT','Maternity Leave','SPECIAL',
  false,true,false,false,false,'FEMALE',true,1.00,NULL,'EVENT','ALWAYS_INCLUDE','ACTIVE'),
 ('03a12001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',NULL,'CCL','Child Care Leave','SPECIAL',
  false,true,false,false,false,'FEMALE',true,1.00,NULL,'CAREER','EXCLUDE','ACTIVE');

-- leave_accrual_policies (EL: 30/yr annual, CF cap 300, retire cap 300) ----------------
INSERT INTO leave_accrual_policies (id, tenant_id, entity_id, leave_type_id, accrual_frequency, accrual_quantity,
    accrual_basis, rounding_mode, carry_forward_allowed, carry_forward_cap, encashment_cap_days,
    retirement_encash_cap_days, lapse_rule, advance_allowed, effective_from, status)
VALUES ('03a13001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,
  '03a12001-0000-0000-0000-000000000001','ANNUAL',30.00,'CALENDAR','NEAREST_HALF_CARRY',
  true,300.00,300.00,300.00,'LAPSE_EXCESS',false,'2026-01-01','ACTIVE');

-- leave_ledger_entries (append-only: opening + accrual for GOV-100245 EL 2026) ---------
INSERT INTO leave_ledger_entries (id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, entry_type,
    amount, balance_after, source_ref_type, effective_date, remarks)
VALUES
 ('03a15001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','03a12001-0000-0000-0000-000000000001',2026,'OPENING',
  100.00,100.00,'YEAR_CLOSE','2026-01-01','Opening carry-forward from 2025'),
 ('03a15001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','03a12001-0000-0000-0000-000000000001',2026,'ACCRUAL',
  30.00,130.00,'ACCRUAL_RUN','2026-01-01','Annual EL accrual 2026');

-- leave_balances (EL 2026: current 130, reserved 2.5, available 127.5, version 7) ------
INSERT INTO leave_balances (id, tenant_id, entity_id, employee_id, leave_type_id, leave_year, opening_balance,
    accrued, availed, reserved, current_balance, available_balance, version, last_ledger_entry_id)
VALUES ('03a14001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','03a12001-0000-0000-0000-000000000001',2026,
  100.00,30.00,0.00,2.50,130.00,127.50,7,'03a15001-0000-0000-0000-000000000002');

-- leave_applications (0.5-day EL; exposes leave_spell_lineage_id for G04) --------------
INSERT INTO leave_applications (id, tenant_id, entity_id, application_no, employee_id, leave_type_id, start_date,
    end_date, total_days, ledger_debit_units, reason, status, sr_posting_status, leave_spell_lineage_id, return_to_work_status)
VALUES
 ('03a16001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'LV/2026/000123','99999999-9999-9999-9999-999999999901','03a12001-0000-0000-0000-000000000001','2026-07-10','2026-07-10',
  0.50,0.50,'Half-day personal work (forenoon)','APPROVED','PENDING','03a16001-0000-0000-0000-0000000000aa','NOT_REQUIRED'),
 ('03a16001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'LV/2026/000124','99999999-9999-9999-9999-999999999902','03a12001-0000-0000-0000-000000000001','2026-08-01','2026-08-05',
  5.00,5.00,'Family function','SUBMITTED','NOT_REQUIRED','03a16001-0000-0000-0000-0000000000bb','NOT_REQUIRED');

-- leave_entitlements (CCL CAREER 730, consumed 120) -----------------------------------
INSERT INTO leave_entitlements (id, tenant_id, entity_id, employee_id, leave_type_id, quota_basis, total_quota_days,
    consumed_days, remaining_days, eligibility_predicate)
VALUES ('03a24001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','03a12001-0000-0000-0000-000000000005','CAREER',730.00,120.00,610.00,
  '{"surviving_children_max":2,"child_age_max":18}');

-- biometric_consents (STATUTORY_DUTY GRANTED, fallback RFID) ---------------------------
INSERT INTO biometric_consents (id, tenant_id, entity_id, employee_id, lawful_basis, capture_types, consent_status,
    fallback_method, granted_at, retention_until)
VALUES ('03ae0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','STATUTORY_DUTY','["BIOMETRIC","GEO","PHOTO"]','GRANTED','RFID',now(),'2033-06-30');

-- module_config (RESERVATION_TTL_MIN, REGULARISATION_WINDOW_DAYS) ----------------------
INSERT INTO module_config (id, tenant_id, entity_id, config_key, config_value, effective_from, status)
VALUES
 ('03a27001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'RESERVATION_TTL_MIN','30','2026-01-01','ACTIVE'),
 ('03a27001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',NULL,'REGULARISATION_WINDOW_DAYS','15','2026-01-01','ACTIVE');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 03-G03-attendance-leave.sql  (31 module-owned tables; load AFTER 00-platform-core.sql)
-- =====================================================================================
