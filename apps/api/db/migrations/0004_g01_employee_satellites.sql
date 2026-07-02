-- PH-07A migration 0004: G01 employee satellites + transactional outbox backbone.
-- Faithful subset of docs/data-model/01-G01-employee-profile.sql:
--   E2  employee_contacts, E3 employee_addresses, E23 employee_attribute_history, E33 outbox_events
-- employee_dependents (E4) already ships in 0001_platform_core.sql (platform core owns the DDL;
-- G01 owns the rows). governed_change_id FK to E32 is deferred until E32 is migrated.

-- =====================================================================================
-- SECTION 1 — EXTENSIONS + ENUM TYPES (g01_ prefix, frozen names)
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- ex_attr_history_nooverlap (uuid/varchar =) with daterange

CREATE TYPE g01_contact_type          AS ENUM ('MOBILE','ALT_MOBILE','PERSONAL_EMAIL','OFFICIAL_EMAIL','LANDLINE');
CREATE TYPE g01_field_visibility      AS ENUM ('PUBLIC','INTERNAL','RESTRICTED','PRIVATE');
CREATE TYPE g01_address_type          AS ENUM ('PERMANENT','PRESENT','MAILING','OVERSEAS');
CREATE TYPE g01_attribute_change_reason AS ENUM ('HIRE','MARRIAGE','GAZETTE','COURT_ORDER','CORRECTION','GENDER_AFFIRMATION','MIGRATION');

-- =====================================================================================
-- SECTION 2 — E2 employee_contacts
-- =====================================================================================

CREATE TABLE employee_contacts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id     uuid REFERENCES entities(id)          ON DELETE RESTRICT,
    employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    contact_type  g01_contact_type NOT NULL,
    contact_value varchar(120) NOT NULL,
    country_code  varchar(5) DEFAULT '+91',
    is_primary    boolean NOT NULL DEFAULT false,
    is_verified   boolean NOT NULL DEFAULT false,
    verified_at   timestamptz,
    visibility    g01_field_visibility NOT NULL DEFAULT 'INTERNAL',
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_employee_contacts_tenant   ON employee_contacts(tenant_id);
CREATE INDEX ix_employee_contacts_entity   ON employee_contacts(entity_id);
CREATE INDEX ix_employee_contacts_employee ON employee_contacts(employee_id);
CREATE INDEX ix_employee_contacts_type     ON employee_contacts(contact_type);
-- r4: one primary per (employee, contact_type)
CREATE UNIQUE INDEX uq_employee_contacts_primary
    ON employee_contacts(employee_id, contact_type) WHERE is_primary AND is_deleted = false;
-- r17: tenant-unique official email across non-deleted rows
CREATE UNIQUE INDEX uq_employee_contacts_official_email
    ON employee_contacts(tenant_id, lower(contact_value))
    WHERE contact_type = 'OFFICIAL_EMAIL' AND is_deleted = false;

-- =====================================================================================
-- SECTION 3 — E3 employee_addresses
-- =====================================================================================

CREATE TABLE employee_addresses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    address_type     g01_address_type NOT NULL,
    line1            varchar(160) NOT NULL,
    line2            varchar(160),
    landmark         varchar(120),
    city             varchar(80) NOT NULL,
    district         varchar(80),
    state            varchar(80) NOT NULL,
    country          varchar(80) NOT NULL DEFAULT 'India',
    pincode          varchar(12) NOT NULL,
    is_current       boolean NOT NULL DEFAULT true,
    same_as_permanent boolean NOT NULL DEFAULT false,
    valid_from       date NOT NULL,
    valid_to         date,
    row_version      integer NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_employee_addresses_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX ix_employee_addresses_tenant   ON employee_addresses(tenant_id);
CREATE INDEX ix_employee_addresses_entity   ON employee_addresses(entity_id);
CREATE INDEX ix_employee_addresses_employee ON employee_addresses(employee_id);
CREATE INDEX ix_employee_addresses_type     ON employee_addresses(address_type);

-- =====================================================================================
-- SECTION 4 — E23 employee_attribute_history (append-only core-attribute spine, FR-EPM-011)
-- =====================================================================================

CREATE TABLE employee_attribute_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attribute_path  varchar(60) NOT NULL,
    value_text      text,
    value_date      date,
    effective_from  date NOT NULL,
    effective_to    date,
    change_reason   g01_attribute_change_reason NOT NULL,
    source          varchar(20) NOT NULL,
    gazette_ref     varchar(120),
    governed_change_id uuid,                                 -- FK to E32 wired when E32 is migrated
    proof_document_id  uuid REFERENCES documents(id)        ON DELETE SET NULL,
    recorded_by     uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),      -- append-only
    created_by      uuid,
    CONSTRAINT ck_attr_history_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- r15/r7: no overlapping windows per (employee, attribute)
    CONSTRAINT ex_attr_history_nooverlap EXCLUDE USING gist (
        employee_id WITH =,
        attribute_path WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    )
);
CREATE INDEX ix_attr_history_tenant   ON employee_attribute_history(tenant_id);
CREATE INDEX ix_attr_history_entity   ON employee_attribute_history(entity_id);
CREATE INDEX ix_attr_history_employee ON employee_attribute_history(employee_id);
CREATE INDEX ix_attr_history_path     ON employee_attribute_history(employee_id, attribute_path);
CREATE INDEX ix_attr_history_govchg   ON employee_attribute_history(governed_change_id);

-- =====================================================================================
-- SECTION 5 — E33 outbox_events (transactional outbox; monotonic event_id cursor)
-- =====================================================================================

CREATE TABLE outbox_events (
    event_id        bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id)         ON DELETE RESTRICT,
    aggregate_id    uuid NOT NULL,                        -- employee_id / position_id
    event_type      varchar(40) NOT NULL,
    payload         jsonb NOT NULL,                       -- minimal, no raw PII
    is_tombstone    boolean NOT NULL DEFAULT false,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    publish_attempts integer NOT NULL DEFAULT 0,
    dead_lettered   boolean NOT NULL DEFAULT false,
    retention_until timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),   -- append-only
    created_by      uuid
);
CREATE INDEX ix_outbox_events_tenant     ON outbox_events(tenant_id);
CREATE INDEX ix_outbox_events_aggregate  ON outbox_events(aggregate_id);
CREATE INDEX ix_outbox_events_type       ON outbox_events(event_type);
CREATE INDEX ix_outbox_events_unpublished ON outbox_events(event_id) WHERE published_at IS NULL AND dead_lettered = false;
