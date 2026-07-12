-- PH-16D migration 0031: G05 vacancy lifecycle, counselling turn engine, and preference
-- capture — faithful subset of docs/data-model/05-G05-transfer-relieving-joining.sql
-- (§2.9 vacancy_positions, §2.10 transfer_preferences, §2.11 vacancy_reservations,
-- §2.18 counselling_sessions, §2.19 counselling_choices).
-- Mutual coupling needs NO new tables: transfer_requests.mutual_counterpart_employee_id and
-- transfer_orders.mutual_pair_order_id shipped in migration 0003, as did the frozen enums
-- g05_reservation_state, g05_turn_order_method, g05_counselling_session_status,
-- g05_choice_action, and g05_strength_source.
-- vacant_count is DERIVED at read (sanctioned_strength_cached - filled_count_cached -
-- reserved_count) and never stored — G05 is not authoritative for strength (BRD §5.2.7).
-- counselling_choices is APPEND-ONLY (CONVENTIONS §3): created_at/created_by only —
-- no updated_at, no is_deleted.

-- SECTION 2 — 2.9 vacancy_positions (strength read-through cache)  [BRD §5.2.7]
-- =====================================================================================
CREATE TABLE vacancy_positions (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    org_unit_id               uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    designation_id            uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    cadre                     varchar(40),
    sanctioned_strength_cached integer,                                  -- read-through (G06/G01); never authoritative
    filled_count_cached       integer,                                   -- read-through cache
    reserved_count            integer NOT NULL DEFAULT 0,                -- G05-authoritative drive reservations
    strength_as_of            timestamptz,                               -- cache freshness
    strength_source           g05_strength_source NOT NULL DEFAULT 'G06',
    drive_id                  uuid REFERENCES transfer_drives(id) ON DELETE SET NULL,
    is_published              boolean NOT NULL DEFAULT false,
    geo_lat                   numeric(9,6),                              -- Phase-2 mapping
    geo_lng                   numeric(9,6),
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false
    -- vacant_count = sanctioned_strength_cached - filled_count_cached - reserved_count : derived at read (BRD §5.2.7)
);
CREATE INDEX ix_vacancy_positions_tenant  ON vacancy_positions(tenant_id);
CREATE INDEX ix_vacancy_positions_entity  ON vacancy_positions(entity_id);
CREATE INDEX ix_vacancy_positions_orgunit ON vacancy_positions(org_unit_id);
CREATE INDEX ix_vacancy_positions_desig   ON vacancy_positions(designation_id);
CREATE INDEX ix_vacancy_positions_drive   ON vacancy_positions(drive_id);
CREATE INDEX ix_vacancy_positions_pub     ON vacancy_positions(tenant_id) WHERE is_published = true;

-- SECTION 3 — 2.10 transfer_preferences (counselling preference list)  [BRD §5.2.6]
-- =====================================================================================
CREATE TABLE transfer_preferences (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    drive_id            uuid NOT NULL REFERENCES transfer_drives(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    preference_rank     integer NOT NULL,                               -- 1 = highest (VAL-INT)
    preferred_org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    vacancy_position_id uuid REFERENCES vacancy_positions(id) ON DELETE SET NULL,
    allotted            boolean NOT NULL DEFAULT false,
    seniority_score     numeric(10,3),                                  -- from G06
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_preferences UNIQUE (drive_id, employee_id, preference_rank),
    CONSTRAINT ck_transfer_preferences_rank CHECK (preference_rank >= 1)
);
CREATE INDEX ix_transfer_prefs_tenant   ON transfer_preferences(tenant_id);
CREATE INDEX ix_transfer_prefs_entity   ON transfer_preferences(entity_id);
CREATE INDEX ix_transfer_prefs_drive    ON transfer_preferences(drive_id);
CREATE INDEX ix_transfer_prefs_employee ON transfer_preferences(employee_id);
CREATE INDEX ix_transfer_prefs_orgunit  ON transfer_preferences(preferred_org_unit_id);
CREATE INDEX ix_transfer_prefs_vacancy  ON transfer_preferences(vacancy_position_id);

-- SECTION 4 — 2.11 vacancy_reservations (vacancy lifecycle)  [BRD §5.2.16]
-- =====================================================================================
CREATE TABLE vacancy_reservations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    vacancy_position_id uuid NOT NULL REFERENCES vacancy_positions(id) ON DELETE RESTRICT,
    transfer_order_id   uuid REFERENCES transfer_orders(id) ON DELETE SET NULL,  -- set when allotment -> order
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    drive_id            uuid REFERENCES transfer_drives(id) ON DELETE SET NULL,
    lifecycle_state     g05_reservation_state NOT NULL DEFAULT 'RESERVED',
    reserved_at         timestamptz NOT NULL DEFAULT now(),
    vacated_at          timestamptz,                                    -- source employee relieved
    filled_at           timestamptz,                                    -- destination employee joined
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_vacancy_reservations UNIQUE (vacancy_position_id, employee_id, drive_id)
);
CREATE INDEX ix_vacancy_res_tenant   ON vacancy_reservations(tenant_id);
CREATE INDEX ix_vacancy_res_entity   ON vacancy_reservations(entity_id);
CREATE INDEX ix_vacancy_res_position ON vacancy_reservations(vacancy_position_id);
CREATE INDEX ix_vacancy_res_order    ON vacancy_reservations(transfer_order_id);
CREATE INDEX ix_vacancy_res_employee ON vacancy_reservations(employee_id);
CREATE INDEX ix_vacancy_res_drive    ON vacancy_reservations(drive_id);
CREATE INDEX ix_vacancy_res_state    ON vacancy_reservations(lifecycle_state);

-- SECTION 5 — 2.18 counselling_sessions (interactive allotment header)  [BRD §5.2.19]
-- =====================================================================================
CREATE TABLE counselling_sessions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    session_code             varchar(30) NOT NULL,                      -- e.g. CNS-2026-ANNUAL-01
    drive_id                 uuid NOT NULL REFERENCES transfer_drives(id) ON DELETE RESTRICT,  -- drive_type=COUNSELLING
    scheduled_at             timestamptz NOT NULL,
    turn_order_method        g05_turn_order_method NOT NULL DEFAULT 'SENIORITY',
    current_turn_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,  -- holds vacancy lock
    current_turn_started_at  timestamptz,
    turn_timeout_seconds     integer NOT NULL DEFAULT 300,              -- JOB-G05-COUNSEL-TIMEOUT
    status                   g05_counselling_session_status NOT NULL DEFAULT 'SCHEDULED',
    presiding_officer_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- Transfer Authority/HR Admin
    total_candidates         integer NOT NULL DEFAULT 0,
    completed_candidates     integer NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_counselling_sessions_code UNIQUE (tenant_id, session_code)
);
CREATE INDEX ix_counselling_sessions_tenant   ON counselling_sessions(tenant_id);
CREATE INDEX ix_counselling_sessions_entity   ON counselling_sessions(entity_id);
CREATE INDEX ix_counselling_sessions_drive    ON counselling_sessions(drive_id);
CREATE INDEX ix_counselling_sessions_turn_emp ON counselling_sessions(current_turn_employee_id);
CREATE INDEX ix_counselling_sessions_presider ON counselling_sessions(presiding_officer_id);
CREATE INDEX ix_counselling_sessions_status   ON counselling_sessions(status);

-- SECTION 6 — 2.19 counselling_choices (immutable choice log; append-only)  [BRD §5.2.20]
--             APPEND-ONLY: created_at/created_by only — no updated_at, no is_deleted.
-- =====================================================================================
CREATE TABLE counselling_choices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),     -- choice_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    session_id          uuid NOT NULL REFERENCES counselling_sessions(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    turn_position       integer NOT NULL,                              -- order called
    vacancy_position_id uuid REFERENCES vacancy_positions(id) ON DELETE RESTRICT,  -- null if passed/declined
    choice_action       g05_choice_action NOT NULL,
    choice_made_at      timestamptz NOT NULL DEFAULT now(),
    recorded_by         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- presiding officer (observed)
    remarks             text,
    created_at          timestamptz NOT NULL DEFAULT now(),            -- immutable; NO updated_at/is_deleted
    created_by          uuid,
    CONSTRAINT uq_counselling_choices UNIQUE (session_id, employee_id, turn_position)
);
CREATE INDEX ix_counselling_choices_tenant   ON counselling_choices(tenant_id);
CREATE INDEX ix_counselling_choices_entity   ON counselling_choices(entity_id);
CREATE INDEX ix_counselling_choices_session  ON counselling_choices(session_id);
CREATE INDEX ix_counselling_choices_employee ON counselling_choices(employee_id);
CREATE INDEX ix_counselling_choices_vacancy  ON counselling_choices(vacancy_position_id);
CREATE INDEX ix_counselling_choices_recorder ON counselling_choices(recorded_by);
COMMENT ON TABLE counselling_choices IS 'Immutable interactive-counselling choice log (FR-G05-019). Append-only; P05-captured; never updated or soft-deleted.';
