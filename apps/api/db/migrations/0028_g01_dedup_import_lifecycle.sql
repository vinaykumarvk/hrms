-- PH-16A migration 0028: G01 dedup/alias-merge + bulk import + lifecycle depth
-- (FR-EPM-015/017/018). Faithful subset of docs/data-model/01-G01-employee-profile.sql:
--   E19  dedup_candidates        — deterministic + fuzzy match queue (score 0-100, HIGH >= 90)
--   E20a employee_import_batches — two-phase importer (validation_profile STRICT|MIGRATION)
--   E20b import_staging_rows     — raw rows VALID/PROVISIONAL/ERROR + remediation_state
--   E21  employee_id_aliases     — loser_id -> survivor_id with merge_snapshot + undo window
--   E31  legal_holds             — employee-scoped ACTIVE hold blocks archive (LEGAL_HOLD_ACTIVE)
-- employees.record_state / separation_date / separation_reason / source_system / legacy_id
-- already ship in 0001_platform_core.sql (§10.1 state machine columns).

-- =====================================================================================
-- SECTION 1 — ENUM TYPES (g01_ prefix, frozen names from the data model)
-- =====================================================================================








-- =====================================================================================
-- SECTION 2 — E19 dedup_candidates (FR-EPM-015 AC1/AC6)
-- =====================================================================================

CREATE TABLE dedup_candidates (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          text NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id          text REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_a_id      text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    employee_b_id      text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    match_score        numeric(5,2) NOT NULL,
    matched_attributes jsonb NOT NULL,
    status             text NOT NULL DEFAULT 'OPEN',
    resolution         varchar(24),
    resolved_by        text,
    resolved_at        timestamptz,
    row_version        integer NOT NULL DEFAULT 1,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_dedup_candidates_pair UNIQUE (employee_a_id, employee_b_id),
    CONSTRAINT ck_dedup_candidates_distinct CHECK (employee_a_id <> employee_b_id),
    CONSTRAINT ck_dedup_candidates_score CHECK (match_score >= 0 AND match_score <= 100)
);
CREATE INDEX ix_dedup_candidates_tenant ON dedup_candidates(tenant_id);
CREATE INDEX ix_dedup_candidates_a      ON dedup_candidates(employee_a_id);
CREATE INDEX ix_dedup_candidates_b      ON dedup_candidates(employee_b_id);
CREATE INDEX ix_dedup_candidates_status ON dedup_candidates(status);

ALTER TABLE dedup_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dedup_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_dedup_candidates_tenant ON dedup_candidates
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- =====================================================================================
-- SECTION 3 — E20a employee_import_batches (FR-EPM-017 AC1/AC4)
-- =====================================================================================

CREATE TABLE employee_import_batches (
    id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         text REFERENCES entities(id)         ON DELETE RESTRICT,
    file_document_id  text REFERENCES documents(id)        ON DELETE SET NULL,
    template_version  varchar(16) NOT NULL,
    validation_profile text NOT NULL DEFAULT 'STRICT',
    total_rows        integer NOT NULL DEFAULT 0,
    valid_rows        integer NOT NULL DEFAULT 0,
    provisional_rows  integer NOT NULL DEFAULT 0,
    error_rows        integer NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'UPLOADED',
    committed_at      timestamptz,
    committed_by      text,
    row_version       integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_import_batches_counts CHECK (total_rows >= 0 AND valid_rows >= 0 AND provisional_rows >= 0 AND error_rows >= 0)
);
CREATE INDEX ix_import_batches_tenant ON employee_import_batches(tenant_id);
CREATE INDEX ix_import_batches_status ON employee_import_batches(status);
CREATE INDEX ix_import_batches_doc    ON employee_import_batches(file_document_id);

ALTER TABLE employee_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_employee_import_batches_tenant ON employee_import_batches
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- =====================================================================================
-- SECTION 4 — E20b import_staging_rows (FR-EPM-017 AC2/AC5 remediation queue)
-- =====================================================================================

CREATE TABLE import_staging_rows (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id)         ON DELETE RESTRICT,
    batch_id            text NOT NULL REFERENCES employee_import_batches(id) ON DELETE CASCADE,
    row_number          integer NOT NULL,
    raw_payload         jsonb NOT NULL,
    validation_status   text NOT NULL DEFAULT 'VALID',
    validation_errors   jsonb,
    remediation_state   varchar(16),                          -- QUEUED | RESOLVED (PROVISIONAL glide path)
    resolved_employee_id text REFERENCES employees(id)       ON DELETE SET NULL,
    dedup_match_id      text REFERENCES dedup_candidates(id) ON DELETE SET NULL,
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_import_staging_row UNIQUE (batch_id, row_number)
);
CREATE INDEX ix_import_staging_tenant   ON import_staging_rows(tenant_id);
CREATE INDEX ix_import_staging_batch    ON import_staging_rows(batch_id);
CREATE INDEX ix_import_staging_status   ON import_staging_rows(validation_status);
CREATE INDEX ix_import_staging_resolved ON import_staging_rows(resolved_employee_id);
CREATE INDEX ix_import_staging_remediation ON import_staging_rows(remediation_state) WHERE remediation_state = 'QUEUED';

ALTER TABLE import_staging_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_staging_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_import_staging_rows_tenant ON import_staging_rows
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- =====================================================================================
-- SECTION 5 — E21 employee_id_aliases (FR-EPM-015 AC3/AC4/AC5)
-- loser_id is NOT an FK to employees(id) via RESTRICT-on-delete semantics of the soft-deleted
-- loser row; one active alias per loser (r11), chained aliases collapse in the consumption API.
-- =====================================================================================

CREATE TABLE employee_id_aliases (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id)           ON DELETE RESTRICT,
    loser_id            text NOT NULL,                          -- retired record's employee_id (soft-deleted)
    survivor_id         text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    dedup_candidate_id  text REFERENCES dedup_candidates(id)   ON DELETE SET NULL,
    merged_at           timestamptz NOT NULL DEFAULT now(),
    merged_by           text NOT NULL,
    approved_by         text,                                   -- 4-eyes checker (maker != checker)
    mergeable_back_until timestamptz NOT NULL,                  -- undo window (default 7 days)
    is_reversed         boolean NOT NULL DEFAULT false,
    merge_snapshot      jsonb NOT NULL,                         -- loser row + moved satellite ids
    row_version         integer NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_employee_id_aliases_loser UNIQUE (tenant_id, loser_id),   -- r11: one alias per loser
    CONSTRAINT ck_employee_id_aliases_distinct CHECK (loser_id <> survivor_id)
);
CREATE INDEX ix_employee_id_aliases_tenant   ON employee_id_aliases(tenant_id);
CREATE INDEX ix_employee_id_aliases_survivor ON employee_id_aliases(survivor_id);
CREATE INDEX ix_employee_id_aliases_dedup    ON employee_id_aliases(dedup_candidate_id);

ALTER TABLE employee_id_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_id_aliases FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_employee_id_aliases_tenant ON employee_id_aliases
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- =====================================================================================
-- SECTION 6 — E31 legal_holds (FR-EPM-018 AC6 / FR-EPM-021 archive gate)
-- =====================================================================================

CREATE TABLE legal_holds (
    id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     text NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
    entity_id     text REFERENCES entities(id)           ON DELETE RESTRICT,
    employee_id   text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    hold_type     text NOT NULL,
    reason        varchar(200) NOT NULL,
    placed_by     text NOT NULL,
    source_module varchar(10),
    placed_at     timestamptz NOT NULL DEFAULT now(),
    released_at   timestamptz,
    status        text NOT NULL DEFAULT 'ACTIVE',
    row_version   integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    text,
    updated_by    text,
    is_deleted    boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_legal_holds_tenant   ON legal_holds(tenant_id);
CREATE INDEX ix_legal_holds_entity   ON legal_holds(entity_id);
CREATE INDEX ix_legal_holds_employee ON legal_holds(employee_id);
CREATE INDEX ix_legal_holds_status   ON legal_holds(status) WHERE status = 'ACTIVE';

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_legal_holds_tenant ON legal_holds
    USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
