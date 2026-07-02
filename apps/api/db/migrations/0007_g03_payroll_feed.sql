-- PH-07D migration 0007: G03 payroll feed substrate — faithful subset of
-- docs/data-model/03-G03-attendance-leave.sql (E20 payroll_attendance_feed,
-- E23 payroll_feed_adjustments, E40 attendance_lock_periods).
-- Feed enums (g03_feed_export_status, g03_feed_adjust_*) already ship in 0002_g03_leave.sql.

-- E40 lock-cycle enums (v3.2 proto; FR-M05-007) ----------------------------------------
CREATE TYPE g03_lock_resolution_mode AS ENUM ('AUTO_APPROVE','AUTO_DENY','MANUAL');
CREATE TYPE g03_lock_status          AS ENUM ('OPEN','LOCKED','REOPENED');

-- E20 payroll_attendance_feed (FR-17; X.3 outbound to G10) ------------------------------
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

-- E23 payroll_feed_adjustments (next-period corrections to locked periods, R6) ----------
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

-- E40 attendance_lock_periods (monthly lock cycle at org scope; FR-M05-007) -------------
CREATE TABLE attendance_lock_periods (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- lock_period_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    lock_month            varchar(7) NOT NULL,                    -- YYYY-MM
    scope_org_unit_id     uuid REFERENCES org_units(id) ON DELETE SET NULL,  -- null = entity-wide
    lock_deadline         date,
    total_employee_days   int,
    pending_at_lock       int,
    resolution_mode       g03_lock_resolution_mode NOT NULL DEFAULT 'MANUAL',
    auto_trigger_payroll  boolean NOT NULL DEFAULT false,
    lock_note             text,
    locked_by             uuid REFERENCES users(id) ON DELETE SET NULL,
    locked_at             timestamptz,
    payroll_status        varchar(60),
    payroll_closed_at     timestamptz,
    status                g03_lock_status NOT NULL DEFAULT 'OPEN',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_attendance_lock_periods UNIQUE (tenant_id, lock_month, scope_org_unit_id)
);
-- Entity-wide locks carry a NULL scope_org_unit_id, which the composite UNIQUE above does
-- not de-duplicate; this partial unique index is the upsert target for entity-wide locks.
CREATE UNIQUE INDEX uq_att_lock_periods_entitywide
    ON attendance_lock_periods(tenant_id, lock_month) WHERE scope_org_unit_id IS NULL;
CREATE INDEX ix_att_lock_periods_tenant ON attendance_lock_periods(tenant_id);
CREATE INDEX ix_att_lock_periods_entity ON attendance_lock_periods(entity_id);
CREATE INDEX ix_att_lock_periods_month  ON attendance_lock_periods(lock_month);
CREATE INDEX ix_att_lock_periods_scope  ON attendance_lock_periods(scope_org_unit_id);
CREATE INDEX ix_att_lock_periods_status ON attendance_lock_periods(status);
