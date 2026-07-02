-- PH-16C migration 0030: G04 versioned mapping catalog, partition leases, and the
-- pre-pension completeness certificate — faithful subset of
-- docs/data-model/04-G04-leave-sr-integration.sql.
-- Tables: sr_event_mapping (E9), relay_partition_lease (E18), historical_leave_record
-- (E16 subset — the PROVISIONAL-until-adjudicated source FR-18 gates on),
-- prepension_certificate (E21, APPEND-ONLY per BRD G04 integrity rule 4).
-- Columns: leave_event_outbox.pinned_mapping_version / claimed_at / lease_expires_at
-- (E8, FR-G04-02 BR3 in-flight pinning + FR-G04-15 lease/reaper).
-- Frozen enum VALUES are reproduced verbatim. Subset notes: E16.batch_id stays an opaque
-- LOGICAL ref (historical_leave_batch ships with FR-11), mirroring the 0029 subset approach;
-- E16.posted_sr_event_id likewise stays a logical ref. ck_sr_mapping_post_sr admits DRAFT
-- rows without a citation (BRD FR-02 AC1: drafts are freely editable; AC6 enforces
-- VAL-G04-CITATION at publish) — the data-model check applies verbatim to PUBLISHED rows.

-- SECTION 1 — ENUM TYPES (frozen; g04_ prefix)
-- =====================================================================================
CREATE TYPE g04_mapping_event_type       AS ENUM ('APPROVED','CANCELLED','AMENDED');
CREATE TYPE g04_mapping_disposition      AS ENUM ('POST_SR','EXCLUDED_NON_SR');
CREATE TYPE g04_qualifying_service_rule  AS ENUM ('QUALIFYING','NON_QUALIFYING','PARTIAL','RULE_REF');
CREATE TYPE g04_straddle_handling        AS ENUM ('SPLIT_BY_EFFECTIVE','PIN_TO_SPELL_START');
CREATE TYPE g04_mapping_status           AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TYPE g04_lease_status             AS ENUM ('ACTIVE','RELEASED','EXPIRED');
CREATE TYPE g04_pass_fail                AS ENUM ('PASS','FAIL');
CREATE TYPE g04_record_confidence         AS ENUM ('HIGH','MEDIUM','LOW');
CREATE TYPE g04_record_adjudication_state AS ENUM ('PROVISIONAL','ADJUDICATED_CONFIRMED','ADJUDICATED_REJECTED');

-- SECTION 2 — E9 sr_event_mapping (FR-G04-02)
-- =====================================================================================
-- Versioned, effective-dated, statutorily-cited catalog: leave type / spell outcome ->
-- one G12-published event_type_code OR EXCLUDED_NON_SR. Mutable CONFIG entity while DRAFT;
-- immutable once PUBLISHED (changes create a new version; in-flight pinning).
CREATE TABLE sr_event_mapping (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- mapping_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    mapping_version        integer NOT NULL,                       -- monotonic per ruleset (in-flight pinning)
    leave_type_code        varchar(32) NOT NULL,                   -- match key
    event_type             g04_mapping_event_type NOT NULL,
    spell_predicate        jsonb,                                  -- e.g. days_count >= 120 => LONG_LEAVE
    disposition            g04_mapping_disposition NOT NULL,
    sr_entry_type          varchar(48),                            -- G12-published code; NULL when EXCLUDED
    qualifying_service_rule g04_qualifying_service_rule,
    qualifying_rule_ref    varchar(64),                            -- statutory rule for PARTIAL
    statutory_rule_ref     varchar(120),                           -- citation; mandatory for POST_SR (VAL-G04-CITATION)
    straddle_handling      g04_straddle_handling NOT NULL DEFAULT 'SPLIT_BY_EFFECTIVE',
    annotation_template    text,
    effective_from         date NOT NULL,                          -- VAL-EFFECTIVE
    effective_to           date,                                   -- NULL = open
    status                 g04_mapping_status NOT NULL DEFAULT 'DRAFT',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_mapping_version UNIQUE (tenant_id, entity_id, leave_type_code, event_type, mapping_version),
    -- VAL-G04-CITATION: a POST_SR mapping must carry a target code + a statutory citation.
    CONSTRAINT ck_sr_mapping_post_sr CHECK (
        disposition <> 'POST_SR'
        OR status = 'DRAFT'
        OR (sr_entry_type IS NOT NULL AND statutory_rule_ref IS NOT NULL)
    ),
    -- EXCLUDED_NON_SR has no SR target type.
    CONSTRAINT ck_sr_mapping_excluded CHECK (disposition <> 'EXCLUDED_NON_SR' OR sr_entry_type IS NULL),
    CONSTRAINT ck_sr_mapping_effective CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_sr_mapping_tenant    ON sr_event_mapping(tenant_id);
CREATE INDEX ix_sr_mapping_entity    ON sr_event_mapping(entity_id);
CREATE INDEX ix_sr_mapping_lookup    ON sr_event_mapping(tenant_id, leave_type_code, event_type);
CREATE INDEX ix_sr_mapping_status    ON sr_event_mapping(status);
CREATE INDEX ix_sr_mapping_effective ON sr_event_mapping(effective_from, effective_to);
-- VAL-G04-MAPCOVER: at most one PUBLISHED open-ended mapping per (leave_type_code, event_type).
CREATE UNIQUE INDEX uq_sr_mapping_published_open
    ON sr_event_mapping(tenant_id, entity_id, leave_type_code, event_type)
    WHERE status = 'PUBLISHED' AND effective_to IS NULL AND is_deleted = false;
COMMENT ON TABLE sr_event_mapping IS
  'G04 E9: versioned effective-dated mapping (disposition + statutory citation + straddle handling). Immutable once PUBLISHED; publish rejects overlaps with ERR-G04-MAPPING-OVERLAP.';

-- SECTION 3 — E8 claim/pin columns on leave_event_outbox (FR-G04-02 BR3 / FR-G04-15)
-- =====================================================================================
ALTER TABLE leave_event_outbox
    ADD COLUMN pinned_mapping_version integer,      -- resolved once at first claim (in-flight pinning)
    ADD COLUMN claimed_at             timestamptz,  -- lease start
    ADD COLUMN lease_expires_at       timestamptz;  -- visibility timeout; reaper reclaims expired IN_FLIGHT
-- Reaper sweep: stranded IN_FLIGHT past lease.
CREATE INDEX ix_outbox_reaper ON leave_event_outbox(lease_expires_at) WHERE status = 'IN_FLIGHT';

-- SECTION 4 — E18 relay_partition_lease (FR-G04-15)
-- =====================================================================================
-- Per-partition (employee/lineage) in-order processing lease. The reaper reclaims expired
-- leases. State-transitioning work table; append-only history (no is_deleted).
CREATE TABLE relay_partition_lease (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- lease_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    partition_key           varchar(64) NOT NULL,
    owner_worker_id         varchar(64) NOT NULL,                  -- X.1 job instance holding the partition
    acquired_at             timestamptz NOT NULL DEFAULT now(),
    lease_expires_at        timestamptz NOT NULL,                  -- visibility timeout; reaper reclaims
    last_processed_sequence integer,                               -- highest in-order event_sequence processed
    status                  g04_lease_status NOT NULL DEFAULT 'ACTIVE',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid
);
CREATE INDEX ix_relay_lease_tenant  ON relay_partition_lease(tenant_id);
CREATE INDEX ix_relay_lease_entity  ON relay_partition_lease(entity_id);
CREATE INDEX ix_relay_lease_status  ON relay_partition_lease(status);
CREATE INDEX ix_relay_lease_expiry  ON relay_partition_lease(lease_expires_at) WHERE status = 'ACTIVE';
-- At most one ACTIVE lease per partition (in-order serialisation guard; never double-claimed).
CREATE UNIQUE INDEX uq_relay_lease_active
    ON relay_partition_lease(tenant_id, partition_key)
    WHERE status = 'ACTIVE';
COMMENT ON TABLE relay_partition_lease IS
  'G04 E18: per-partition in-order processing lease (JOB-G04-REAPER reclaims expired). One ACTIVE lease per partition.';

-- SECTION 5 — E16 historical_leave_record (subset; FR-G04-18 BR-18.1 gate input)
-- =====================================================================================
-- A staged legacy leave record: PROVISIONAL until SR-Custodian adjudicated; excluded from
-- final pension until confirmed. The pre-pension PASS gate requires zero PROVISIONAL rows.
CREATE TABLE historical_leave_record (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- record_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_id               uuid,                                   -- LOGICAL ref to historical_leave_batch (FR-11)
    employee_id            uuid REFERENCES employees(id) ON DELETE RESTRICT,
    leave_spell_lineage_id uuid,
    gov_source_id          varchar(64),                            -- P06 traceability
    leave_type_code        varchar(32) NOT NULL,
    spell_start            date,
    spell_end              date,
    days_count             numeric(6,1) NOT NULL,
    qualifying_flag        g04_qualifying_service_rule,            -- derived via mapping
    statutory_rule_ref     varchar(120),
    confidence             g04_record_confidence,
    adjudication_state     g04_record_adjudication_state NOT NULL DEFAULT 'PROVISIONAL',
    posted_sr_event_id     uuid,                                   -- LOGICAL ref (after posting)
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    CONSTRAINT ck_hist_record_window CHECK (spell_start IS NULL OR spell_end IS NULL OR spell_end >= spell_start)
);
CREATE INDEX ix_hist_rec_tenant   ON historical_leave_record(tenant_id);
CREATE INDEX ix_hist_rec_entity   ON historical_leave_record(entity_id);
CREATE INDEX ix_hist_rec_employee ON historical_leave_record(employee_id);
CREATE INDEX ix_hist_rec_adjud    ON historical_leave_record(adjudication_state);
COMMENT ON TABLE historical_leave_record IS
  'G04 E16 (subset): staged legacy leave record. PROVISIONAL until adjudicated; blocks the pre-pension PASS gate while PROVISIONAL.';

-- SECTION 6 — E21 prepension_certificate (APPEND-ONLY; FR-G04-18)
-- =====================================================================================
-- Signed, checksummed pre-pension completeness certificate — G11's hard gate input.
-- PASS requires zero open HIGH/CRITICAL findings and zero PROVISIONAL entries. INSERT-only
-- ledger (BRD G04 integrity rule 4): consumed_by_g11_at is the only mutable column;
-- rows are never updated otherwise, never deleted. No is_deleted column by design.
CREATE TABLE prepension_certificate (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- certificate_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- retiring employee
    run_id                      uuid NOT NULL REFERENCES reconciliation_run(id) ON DELETE RESTRICT,  -- the PRE_PENSION run
    open_high_critical_findings integer NOT NULL,                  -- must be 0 for PASS
    total_non_qualifying_days   numeric(8,1) NOT NULL,             -- net from SR leave entries
    lineage_complete            boolean NOT NULL,                  -- all lineages resolvable
    provisional_entries_remaining integer NOT NULL,                -- must be 0 for PASS
    result                      g04_pass_fail NOT NULL,
    checksum                    varchar(64) NOT NULL,              -- SHA-256 over evidence bundle
    signed_by                   uuid NOT NULL,                     -- LOGICAL ref to users(id); SR-Custodian signer
    signed_at                   timestamptz NOT NULL DEFAULT now(),
    consumed_by_g11_at          timestamptz,                       -- when G11 gated on it
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    -- FR-18 AC2 fail-closed at the storage layer too: a PASS row cannot carry blockers.
    CONSTRAINT ck_prepension_pass_gate CHECK (
        result <> 'PASS'
        OR (open_high_critical_findings = 0 AND provisional_entries_remaining = 0 AND lineage_complete = true)
    )
);
CREATE INDEX ix_prepension_tenant   ON prepension_certificate(tenant_id);
CREATE INDEX ix_prepension_entity   ON prepension_certificate(entity_id);
CREATE INDEX ix_prepension_employee ON prepension_certificate(employee_id);
CREATE INDEX ix_prepension_run      ON prepension_certificate(run_id);
CREATE INDEX ix_prepension_result   ON prepension_certificate(result);
COMMENT ON TABLE prepension_certificate IS
  'G04 E21: signed pre-pension completeness certificate (FR-18); G11 gate input. PASS = 0 open HIGH/CRITICAL + 0 provisional; append-only.';
