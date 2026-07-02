-- PH-15C migration 0024: G03 operational attendance core — faithful subset of
-- docs/data-model/03-G03-attendance-leave.sql (E1 shifts, E2 rosters, E5 attendance_devices,
-- E6 attendance_punches, E11 comp_off_ledger).
-- All G03 enums (g03_shift_date_anchor, g03_roster_status, g03_device_*, g03_punch_*,
-- g03_capture_method, g03_compoff_*) already ship in 0002_g03_leave.sql.
--
-- APPEND-ONLY LEDGERS (CONVENTIONS §3): attendance_punches and comp_off_ledger are
-- INSERT-only — no updated_at, no is_deleted; corrections are new rows, never mutations.

-- E1 shifts (FR-01: timings, grace, date_anchor_rule; VAL-G03-SHIFT-TIMES app-side) ------
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
CREATE INDEX ix_shifts_status  ON shifts(status);

-- E2 rosters (FR-01: shift assignment over date ranges) ----------------------------------
CREATE TABLE rosters (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- roster_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    shift_id            uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    effective_from      date NOT NULL,
    effective_to        date,
    weekly_off_pattern  jsonb NOT NULL,                              -- e.g. ["SUN","SAT2","SAT4"]
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

-- E5 attendance_devices (FR-03 device-auth registry; registered via P04) -----------------
CREATE TABLE attendance_devices (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- device_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    device_code          varchar(40) NOT NULL,
    device_type          g03_device_type NOT NULL,
    api_key_hash         varchar(255),                               -- hashed; rotation via P04 creds
    binding_mode         g03_device_binding_mode NOT NULL DEFAULT 'OPEN',
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
CREATE INDEX ix_attendance_devices_status ON attendance_devices(status);

-- E6 attendance_punches (FR-03 APPEND-ONLY raw punch ledger) ------------------------------
CREATE TABLE attendance_punches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- punch_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    device_id         uuid REFERENCES attendance_devices(id) ON DELETE SET NULL,
    punch_time        timestamptz NOT NULL,                        -- UTC
    attendance_date   date NOT NULL,                               -- shift-anchored local date (date_anchor_rule)
    punch_direction   g03_punch_direction,
    capture_method    g03_capture_method NOT NULL,
    source_ref        varchar(120),                                -- device raw event id (idempotency)
    ingestion_status  g03_punch_ingest_status NOT NULL,
    anomaly_flags     jsonb,
    correlation_id    text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    -- Append-only: no updated_at / no is_deleted (CONVENTIONS §3).
    CONSTRAINT uq_punches_idempotent UNIQUE (device_id, source_ref)   -- idempotent ingestion (dedup -> DUPLICATE)
);
CREATE INDEX ix_punches_tenant     ON attendance_punches(tenant_id);
CREATE INDEX ix_punches_entity     ON attendance_punches(entity_id);
CREATE INDEX ix_punches_employee   ON attendance_punches(employee_id, attendance_date);
CREATE INDEX ix_punches_device     ON attendance_punches(device_id);
CREATE INDEX ix_punches_status     ON attendance_punches(ingestion_status);
CREATE INDEX ix_punches_time       ON attendance_punches(punch_time);
COMMENT ON TABLE attendance_punches IS 'G03 E6 raw punch ledger. Append-only; INSERT-only.';

-- E11 comp_off_ledger (FR-09 sole comp-off SSOT, R17; APPEND-ONLY) ------------------------
CREATE TABLE comp_off_ledger (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- comp_off_entry_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    entry_type      g03_compoff_entry_type NOT NULL,             -- EARN | REDEEM | EXPIRE | ADJUST
    days            numeric(4,2) NOT NULL,                       -- signed
    source_ref_type g03_compoff_source_ref,
    source_ref_id   uuid,                                        -- REDEEM/EXPIRE: consumed EARN entry (FIFO lineage)
    earned_on       date,
    expires_on      date,                                        -- EARN: lapse date (JOB-G03-COMPOFF-EXPIRE)
    balance_after   numeric(6,2) NOT NULL,                       -- reconciles to the ledger sum
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
COMMENT ON TABLE comp_off_ledger IS 'G03 E11 comp-off balance ledger (sole source of truth, R17). Append-only.';
