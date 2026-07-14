-- PH-10A migration 0018: G12/G13 integrity substrate — faithful subset of
-- docs/data-model/12-G12-digital-service-register.sql and
-- docs/data-model/13-G13-document-management.sql for the integrity entities:
--   E19 sr_status_events   (append-only, hash-chained status/supersession sub-ledger;
--       BRD G12 §5.6: entry_status on service_register_events is a derived projection,
--       read-only at the application layer — the materialiser is the only writer and
--       runs in the same transaction as the corresponding sr_status_events append),
--   E14 checkout_locks     (BRD G13 FR-004: exclusive check-out/check-in edit locks;
--       DI-7 one ACTIVE lock per document; conflicting check-in under another actor's
--       active lock -> 409 ERR-G13-DOCUMENT_LOCKED; release is explicit; expires_at
--       auto-expiry prevents stuck locks).
-- The core ledgers already exist in 0001_platform_core.sql: service_register_events
-- (with trusted-time recorded_at, prev_event_hash/entry_hash SHA-256 columns) and the
-- append-only document_versions (DI-2). Hashes are real SHA-256 (hash_algorithm 'SHA-256');
-- the genesis previous-hash convention is the explicit 64-zero digest.

-- SECTION 1 — ENUM TYPES (g12_/g13_ prefix; UPPER_SNAKE values, CONVENTIONS §4)



-- SECTION 2 — E19 sr_status_events (BRD G12 FR-03/FR-04 amended) — APPEND-ONLY, hash-chained
-- Hash-chained per (tenant_id, employee_id) status chain. Entry-status and supersession
-- transitions are tamper-evident here; no UPDATE/DELETE — status changes append, never mutate.
CREATE TABLE sr_status_events (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- status_event_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- owner of the chain
    target_event_id          text NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry whose status changed
    status_sequence_no       bigint NOT NULL,                               -- monotonic per (tenant,employee) status chain
    transition_kind          text NOT NULL,
    from_value               varchar(32),                                   -- null on first
    to_value                 varchar(32) NOT NULL,
    related_event_id         text REFERENCES service_register_events(id) ON DELETE RESTRICT, -- e.g. reversal causing SUPERSEDED
    actor                    varchar(64) NOT NULL,                          -- who/what caused the transition
    prev_status_hash         char(64) NOT NULL,                             -- SHA-256 of prior chain entry (64-zero genesis for first)
    status_hash              char(64) NOT NULL,                             -- SHA-256(canonical(status content) || prev_status_hash)
    hash_algorithm           varchar(16) NOT NULL DEFAULT 'SHA-256',
    recorded_at              timestamptz NOT NULL DEFAULT now(),            -- trusted-time commit stamp (server clock)
    created_at               timestamptz NOT NULL DEFAULT now(),            -- append timestamp; NO updated_at/is_deleted
    created_by               text,
    CONSTRAINT uq_sr_status_seq      UNIQUE (tenant_id, employee_id, status_sequence_no),
    CONSTRAINT uq_sr_status_hash     UNIQUE (tenant_id, employee_id, status_hash),
    CONSTRAINT ck_sr_status_hash_len CHECK (length(status_hash) = 64 AND length(prev_status_hash) = 64)
);
CREATE INDEX ix_sr_status_tenant   ON sr_status_events(tenant_id);
CREATE INDEX ix_sr_status_employee ON sr_status_events(tenant_id, employee_id, status_sequence_no);
CREATE INDEX ix_sr_status_target   ON sr_status_events(target_event_id);
CREATE INDEX ix_sr_status_related  ON sr_status_events(related_event_id);
COMMENT ON TABLE sr_status_events IS 'G12 E19: append-only hash-chained status/supersession sub-ledger. No UPDATE/DELETE. Status changes append rows; service_register_events.entry_status is a read-only derived projection.';

-- SECTION 3 — E14 checkout_locks (BRD G13 FR-004) ------------------------------------
CREATE TABLE checkout_locks (
    id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id   text REFERENCES entities(id) ON DELETE RESTRICT,
    document_id text NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    locked_by   text NOT NULL,                                  -- logical user ref
    locked_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,                           -- auto-expire to avoid stuck locks
    intent_note varchar(255),
    status      text NOT NULL DEFAULT 'ACTIVE',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text,
    updated_by  text,
    is_deleted  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_checkout_locks_tenant   ON checkout_locks(tenant_id);
CREATE INDEX ix_checkout_locks_document ON checkout_locks(document_id);
CREATE UNIQUE INDEX uq_checkout_locks_active ON checkout_locks(document_id) WHERE status = 'ACTIVE';  -- DI-7
COMMENT ON TABLE checkout_locks IS 'G13 E14: exclusive check-out/check-in edit locks. One ACTIVE lock per document (DI-7); conflicting check-in -> ERR-G13-DOCUMENT_LOCKED (409); release is explicit.';
