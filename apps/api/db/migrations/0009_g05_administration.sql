-- PH-08B migration 0009: G05 transfer administration depth — faithful subset of
-- docs/data-model/05-G05-transfer-relieving-joining.sql (BRD G05 FR-007/009/011/020/022).
-- Tables: order_acknowledgements, charge_handovers, deputation_records, quarter_allotments,
--         g05_joining_time_rules (distance-band boundaries as configuration data, §16.4),
--         g05_administration_policy (§16.5 open configuration parameters).
-- Enum types g05_ack_channel, g05_ack_status, g05_charge_phase, g05_charge_type,
-- g05_charge_handover_status, g05_forced_action_type, g05_repatriation_status,
-- g05_quarter_retention_status, g05_distance_band ship in migration 0003.

-- -------------------------------------------------------------------------------------
-- 1. order_acknowledgements (proof-of-service & acknowledgement)  [BRD §5.2.17]
--    Served/deemed-served precedence gates relieving (invariant 5.6-15 / ERR-G05-NOT-SERVED).
-- -------------------------------------------------------------------------------------
CREATE TABLE order_acknowledgements (
    id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id              text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id      text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id            text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    served_on_date         date NOT NULL,
    delivery_channel       text NOT NULL,
    served_by              text REFERENCES users(id) ON DELETE SET NULL,   -- null for system channels
    acknowledgement_status text NOT NULL DEFAULT 'SERVED',
    acknowledged_at        timestamptz,
    deemed_served_reason   text,                                           -- JOB-G05-SERVE-DEEM basis + reason
    proof_document_id      text REFERENCES documents(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             text,
    updated_by             text,
    is_deleted             boolean NOT NULL DEFAULT false,
    -- Deemed service must be evidence-backed: the recorded basis is mandatory on the flip.
    CONSTRAINT ck_order_acks_deemed_reason CHECK (acknowledgement_status <> 'DEEMED_SERVED' OR deemed_served_reason IS NOT NULL)
);
CREATE INDEX ix_order_acks_tenant   ON order_acknowledgements(tenant_id);
CREATE INDEX ix_order_acks_entity   ON order_acknowledgements(entity_id);
CREATE INDEX ix_order_acks_order    ON order_acknowledgements(transfer_order_id);
CREATE INDEX ix_order_acks_employee ON order_acknowledgements(employee_id);
CREATE INDEX ix_order_acks_status   ON order_acknowledgements(acknowledgement_status);
CREATE INDEX ix_order_acks_served   ON order_acknowledgements(served_on_date);
CREATE INDEX ix_order_acks_doc      ON order_acknowledgements(proof_document_id);

-- -------------------------------------------------------------------------------------
-- 2. charge_handovers (handover/assumption of charge incl. under-protest)  [BRD §5.2.10]
-- -------------------------------------------------------------------------------------
CREATE TABLE charge_handovers (
    id                        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                 text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id         text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    phase                     text NOT NULL,
    relinquishing_employee_id text REFERENCES employees(id) ON DELETE RESTRICT,
    receiving_employee_id     text REFERENCES employees(id) ON DELETE RESTRICT, -- successor/link officer/custody-of-office
    charge_type               text NOT NULL DEFAULT 'FULL',
    handover_date             date NOT NULL,
    assets_handed             jsonb,                                            -- inventory with asset ids
    cash_imprest_amount       bigint,                                    -- VAL-CURRENCY
    pending_files_count       integer,
    handover_note_document_id text REFERENCES documents(id) ON DELETE SET NULL,
    status                    text NOT NULL DEFAULT 'DRAFT',
    under_protest             boolean NOT NULL DEFAULT false,                   -- FR-G05-016
    dispute_sla_due_at        timestamptz,                                      -- JOB-G05-DISPUTE-SLA
    forced_action_type        text,                           -- HANDOVER_UNDER_PROTEST when forced
    forced_action_reason      text,
    forced_action_by          text REFERENCES users(id) ON DELETE SET NULL,
    accepted_by               text REFERENCES users(id) ON DELETE SET NULL,
    accepted_at               timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                text,
    updated_by                text,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_charge_handovers_forced_reason CHECK (forced_action_type IS NULL OR forced_action_reason IS NOT NULL),
    -- Relinquisher and acceptor must be different persons (P02 SoD).
    CONSTRAINT ck_charge_handovers_sod CHECK (receiving_employee_id IS NULL OR receiving_employee_id <> relinquishing_employee_id)
);
CREATE INDEX ix_charge_handovers_tenant      ON charge_handovers(tenant_id);
CREATE INDEX ix_charge_handovers_entity      ON charge_handovers(entity_id);
CREATE INDEX ix_charge_handovers_order       ON charge_handovers(transfer_order_id);
CREATE INDEX ix_charge_handovers_relinquish  ON charge_handovers(relinquishing_employee_id);
CREATE INDEX ix_charge_handovers_receiving   ON charge_handovers(receiving_employee_id);
CREATE INDEX ix_charge_handovers_status      ON charge_handovers(status);
CREATE INDEX ix_charge_handovers_dispute_sla ON charge_handovers(dispute_sla_due_at) WHERE status = 'DISPUTED';
CREATE INDEX ix_charge_handovers_doc         ON charge_handovers(handover_note_document_id);

-- -------------------------------------------------------------------------------------
-- 3. deputation_records (deputation terms, tenure caps, repatriation)  [BRD §5.2.13]
-- -------------------------------------------------------------------------------------
CREATE TABLE deputation_records (
    id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id             text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id     text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id           text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    borrowing_org_unit_id text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT, -- may be EXTERNAL type
    lending_org_unit_id   text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    deputation_terms      jsonb,                                                     -- pay protection, allowance %, terms ref
    start_date            date NOT NULL,
    initial_tenure_months integer NOT NULL,
    current_end_date      date NOT NULL,
    max_tenure_months     integer,                                                   -- policy cap (ERR-G05-DEPUTATION-CAP)
    extension_count       integer NOT NULL DEFAULT 0,
    repatriation_due_date date,
    repatriation_status   text NOT NULL DEFAULT 'ACTIVE',
    repatriation_order_id text REFERENCES transfer_orders(id) ON DELETE SET NULL,    -- reverse REPATRIATION-class order
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text,
    updated_by            text,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_deputation_records_end   CHECK (current_end_date >= start_date),
    CONSTRAINT ck_deputation_records_repat CHECK (repatriation_due_date IS NULL OR repatriation_due_date >= start_date),
    CONSTRAINT ck_deputation_records_cap   CHECK (max_tenure_months IS NULL OR initial_tenure_months <= max_tenure_months)
);
CREATE INDEX ix_deputation_records_tenant    ON deputation_records(tenant_id);
CREATE INDEX ix_deputation_records_entity    ON deputation_records(entity_id);
CREATE INDEX ix_deputation_records_order     ON deputation_records(transfer_order_id);
CREATE INDEX ix_deputation_records_employee  ON deputation_records(employee_id);
CREATE INDEX ix_deputation_records_borrowing ON deputation_records(borrowing_org_unit_id);
CREATE INDEX ix_deputation_records_lending   ON deputation_records(lending_org_unit_id);
CREATE INDEX ix_deputation_records_status    ON deputation_records(repatriation_status);
CREATE INDEX ix_deputation_records_repat_due ON deputation_records(repatriation_due_date);

-- -------------------------------------------------------------------------------------
-- 4. quarter_allotments (estate retention + penal-rate flip)  [BRD §5.2.21]
-- -------------------------------------------------------------------------------------
CREATE TABLE quarter_allotments (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_order_id        text REFERENCES transfer_orders(id) ON DELETE SET NULL,  -- transfer occasioning retention
    quarter_ref              varchar(60) NOT NULL,                                    -- accommodation identifier
    org_unit_id              text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT, -- estate-owning office
    retention_allowed        boolean NOT NULL DEFAULT false,                          -- Authority-approved
    retention_status         text NOT NULL DEFAULT 'OCCUPIED',
    vacate_by_date           date,                                                    -- statutory vacation deadline
    vacated_on               date,
    licence_fee_rate         bigint,                                           -- INR/month (normal/penal; VAL-CURRENCY)
    penal_licence_fee_rate   bigint,                                           -- rate applied on overstay
    penal_rate_applies       boolean NOT NULL DEFAULT false,                          -- JOB-G05-QTR-OVERSTAY
    licence_fee_recovery_ref varchar(60),                                             -- G10 recovery signal ref
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_quarter_allotments_tenant   ON quarter_allotments(tenant_id);
CREATE INDEX ix_quarter_allotments_entity   ON quarter_allotments(entity_id);
CREATE INDEX ix_quarter_allotments_employee ON quarter_allotments(employee_id);
CREATE INDEX ix_quarter_allotments_order    ON quarter_allotments(transfer_order_id);
CREATE INDEX ix_quarter_allotments_orgunit  ON quarter_allotments(org_unit_id);
CREATE INDEX ix_quarter_allotments_status   ON quarter_allotments(retention_status);
CREATE INDEX ix_quarter_allotments_vacate   ON quarter_allotments(vacate_by_date)
    WHERE retention_status IN ('VACATION_DUE','RETENTION_APPROVED','OVERSTAY');

-- -------------------------------------------------------------------------------------
-- 5. g05_joining_time_rules — distance-band boundaries live in DATA (BRD §16.4 / VAL-G05-JTIME),
--    never as magic numbers in the service. Seeded defaults are Org-Admin-configurable.
-- -------------------------------------------------------------------------------------
CREATE TABLE g05_joining_time_rules (
    id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    band              text NOT NULL,
    same_station      boolean NOT NULL DEFAULT false,   -- LOCAL is matched by same-station, not km
    min_distance_km   integer NOT NULL DEFAULT 0,
    max_distance_km   integer,                          -- exclusive upper bound; NULL = unbounded
    joining_time_days integer NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g05_joining_time_rules UNIQUE (tenant_id, band),
    CONSTRAINT ck_g05_joining_time_rules_range CHECK (max_distance_km IS NULL OR max_distance_km >= min_distance_km),
    CONSTRAINT ck_g05_joining_time_rules_days  CHECK (joining_time_days >= 0)
);
CREATE INDEX ix_g05_joining_time_rules_tenant ON g05_joining_time_rules(tenant_id);

-- Seeded §16.4 defaults per tenant (LOCAL 0 / SHORT <200km 3 / MEDIUM 200–500km 5 / LONG 500–1000km 7 / OUTSTATION >1000km 10).
INSERT INTO g05_joining_time_rules (tenant_id, band, same_station, min_distance_km, max_distance_km, joining_time_days)
SELECT t.id, v.band::text, v.same_station, v.min_km, v.max_km, v.days
FROM tenants t
CROSS JOIN (VALUES
    ('LOCAL',      true,  0,    0,    0),
    ('SHORT',      false, 0,    200,  3),
    ('MEDIUM',     false, 200,  500,  5),
    ('LONG',       false, 500,  1000, 7),
    ('OUTSTATION', false, 1000, NULL, 10)
) AS v(band, same_station, min_km, max_km, days);

-- -------------------------------------------------------------------------------------
-- 6. g05_administration_policy — §16.5 open configuration parameters (versioned config
--    cascade; one active row per tenant with seeded defaults).
-- -------------------------------------------------------------------------------------
CREATE TABLE g05_administration_policy (
    id                                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    default_delivery_channel            text NOT NULL DEFAULT 'IN_APP',
    deemed_service_window_days          integer NOT NULL DEFAULT 7,   -- JOB-G05-SERVE-DEEM
    dispute_sla_hours                   integer NOT NULL DEFAULT 72,  -- JOB-G05-DISPUTE-SLA
    permissible_retention_months        integer NOT NULL DEFAULT 2,   -- ERR-G05-QUARTER-OVERSTAY basis
    deputation_default_max_tenure_months integer NOT NULL DEFAULT 36, -- ERR-G05-DEPUTATION-CAP fallback
    created_at                          timestamptz NOT NULL DEFAULT now(),
    updated_at                          timestamptz NOT NULL DEFAULT now(),
    is_deleted                          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g05_administration_policy UNIQUE (tenant_id),
    CONSTRAINT ck_g05_administration_policy CHECK (
        deemed_service_window_days > 0 AND dispute_sla_hours > 0
        AND permissible_retention_months >= 0 AND deputation_default_max_tenure_months > 0
    )
);

INSERT INTO g05_administration_policy (tenant_id)
SELECT id FROM tenants;
