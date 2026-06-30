-- =====================================================================================
-- GOVERNMENT HRMS — G04 LEAVE MANAGEMENT INTEGRATION WITH DIGITAL SERVICE REGISTER
-- Module schema: 04-G04-leave-sr-integration.sql
-- =====================================================================================
-- G04 is the reliable, idempotent, reconciled bridge that maps APPROVED / CANCELLED /
-- AMENDED leave domain events (issued by G03) into immutable statutory entries on the
-- G12 Service Register ledger (`service_register_events`, core §8, owned by G12, written
-- only via the G12 `POST /api/v1/sr/ingest` write port over the X.3 integration
-- framework). G04 is the leave -> SR WRITER. It owns the 14 integration entities
-- E8..E21 (BRD v3 §5) and REFERENCES — never redefines — the platform-core tables.
--
-- Grounded in:
--   docs/data-model/CONVENTIONS.md                      (mandatory module conventions)
--   docs/data-model/00-platform-core.sql                (canonical core tables; load first)
--   docs/brd/v3/G04-leave-sr-integration.md             (§5 entities, samples, enums, rules)
--   docs/brd/v3/G04 RM-1..RM-5 (G12-frozen SR ingestion contract; dedup tuple + fact_key)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING.
--   * Load AFTER 00-platform-core.sql (00) and the identity/employee core it defines (01
--     concerns are satisfied by core's `employees`). Logically loads AFTER 03-G03 (the
--     leave source) and 12-G12 (the SR ledger owner) — though the only hard DDL dependency
--     on those is to the CORE tables `employees`, `service_register_events`, `workflow_
--     instances`, `documents`, `migration_runs`, all defined in 00-platform-core.sql.
--   * This file creates only G04-owned tables (E8..E21). Every FK target outside this file
--     resolves to a core table that 00-platform-core.sql created.
--
-- CORE-TABLE ASSUMPTIONS (FK / reference only — NOT redefined here).
--   * employees(id)                  — G01-owned golden record. Subject of every SR entry.
--   * service_register_events(id)    — G12-owned, append-only, hash-chained statutory SR
--                                      ledger (core §8). G04 NEVER mutates it directly; it
--                                      posts via the G12 X.3 write port. We FK to it only
--                                      for sr_correction_link (original/correcting entry)
--                                      and the returned sr_event_id projections — these are
--                                      G12-assigned ids that always exist once returned.
--   * workflow_instances(id)         — P01 maker-checker instances (DLQ resolution, recon
--                                      remediation, historical batch promotion). ON DELETE
--                                      SET NULL (the finding/DLQ row survives a cancelled wf).
--   * documents(id)                  — G13 legacy-scan provenance for digitisation.
--   * migration_runs(id)             — P06 ETL+V ledger linkage for historical batches.
--   * tenants(id) / entities(id)     — tenancy scope (Platform §0.1); ON DELETE RESTRICT.
--   * G03 `leave_ledger_entries`     — NOT a core table and NOT owned by G04. It is the G03
--                                      source spell ledger. There is therefore NO database
--                                      FK to it; `leave_ledger_entry_id` is a LOGICAL
--                                      reference (uuid, no FK), reconciled by the FR-17
--                                      integrity job. (Mirrors the CONVENTIONS rule that
--                                      cross-bounded-context refs are logical, like user ids.)
--   * users(id)                      — actor/assignee/signer columns (assigned_to, signed_by,
--                                      triggered_by) are LOGICAL refs (uuid, no FK) per
--                                      CONVENTIONS §3 (survive user removal).
--
-- CONVENTIONS APPLIED (see CONVENTIONS.md).
--   * Every table: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (domain name in comment).
--   * Every table: tenant_id NOT NULL + entity_id NOT NULL -> tenants/entities ON DELETE
--     RESTRICT (all E8..E21 are entity-scoped per BRD §5.2). RLS tenant-isolation applied
--     in Section RLS below.
--   * Enums: module-unique CLOSED enumerations as `CREATE TYPE g04_* AS ENUM` (UPPER_SNAKE).
--   * Append-only ledgers (sr_posting_log, sr_correction_link, port_conformance_run) carry
--     only created_at/created_by — NO updated_at, NO is_deleted (CONVENTIONS §3). Finding /
--     queue / run tables that transition state carry created_at/updated_at but omit
--     is_deleted (append-only history; never soft-deleted). Soft-delete (is_deleted) is
--     applied only to the mutable CONFIG entities: sr_event_mapping and integration_config.
--   * Every FK column and every common query column is indexed; business keys are UNIQUE.
--   * P05 audit columns are captured by the platform DB-trigger; G04 defines no audit table.
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G04 module-unique closed enumerations)
-- =====================================================================================

-- E8 leave_event_outbox ---------------------------------------------------------------
CREATE TYPE g04_outbox_event_type AS ENUM ('LEAVE_APPROVED','LEAVE_CANCELLED','LEAVE_AMENDED');
CREATE TYPE g04_outbox_status     AS ENUM ('PENDING','BLOCKED_AWAITING_ORIGINAL','IN_FLIGHT',
                                           'POSTED','FAILED','DEAD_LETTERED','EXCLUDED');

-- E9 sr_event_mapping -----------------------------------------------------------------
CREATE TYPE g04_mapping_event_type      AS ENUM ('APPROVED','CANCELLED','AMENDED');
CREATE TYPE g04_mapping_disposition     AS ENUM ('POST_SR','EXCLUDED_NON_SR');
CREATE TYPE g04_qualifying_service_rule AS ENUM ('QUALIFYING','NON_QUALIFYING','PARTIAL','RULE_REF');
CREATE TYPE g04_straddle_handling       AS ENUM ('SPLIT_BY_EFFECTIVE','PIN_TO_SPELL_START');
CREATE TYPE g04_mapping_status          AS ENUM ('DRAFT','PUBLISHED','RETIRED');

-- E10 sr_posting_log ------------------------------------------------------------------
CREATE TYPE g04_posting_outcome AS ENUM ('SUCCESS','RETRYABLE_FAILURE','PERMANENT_FAILURE','DUPLICATE_NOOP');

-- E11 sr_dead_letter ------------------------------------------------------------------
CREATE TYPE g04_dlq_failure_class AS ENUM ('MAPPING_MISSING','VALIDATION_REJECT','UPSTREAM_DOWN',
                                           'DATA_CONFLICT','SIGNATURE_INVALID','UNKNOWN');
CREATE TYPE g04_dlq_state         AS ENUM ('OPEN','IN_REVIEW','RESOLVED_REPLAYED','RESOLVED_DISCARDED');

-- E12 reconciliation_run --------------------------------------------------------------
CREATE TYPE g04_recon_run_type AS ENUM ('SCHEDULED','ON_DEMAND','PRE_PENSION','SOURCE_OUTBOX_INTEGRITY');
CREATE TYPE g04_recon_status   AS ENUM ('RUNNING','COMPLETED','FAILED');

-- E13 reconciliation_finding (+ E20 reuse the severity) -------------------------------
CREATE TYPE g04_finding_type      AS ENUM ('MISSING_SR','DUPLICATE_SR','DIVERGENT_FIELD',
                                           'ORPHAN_CORRECTION','UNMAPPED_LEAVE','CORRECTION_WITHOUT_LINK');
CREATE TYPE g04_finding_severity  AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE g04_remediation_state AS ENUM ('OPEN','REMEDIATION_PROPOSED','APPROVED','APPLIED','WAIVED');

-- E14 sr_correction_link --------------------------------------------------------------
CREATE TYPE g04_correction_type AS ENUM ('REVERSAL','AMENDMENT','SUPERSEDE');

-- E15 historical_leave_batch ----------------------------------------------------------
CREATE TYPE g04_batch_source_type AS ENUM ('PAPER_SCAN','LEGACY_SYSTEM','SPREADSHEET');
CREATE TYPE g04_batch_status      AS ENUM ('STAGED','VALIDATED','APPROVED','POSTED','PARTIALLY_POSTED','REJECTED');

-- E16 historical_leave_record ---------------------------------------------------------
CREATE TYPE g04_record_confidence        AS ENUM ('HIGH','MEDIUM','LOW');
CREATE TYPE g04_record_adjudication_state AS ENUM ('PROVISIONAL','ADJUDICATED_CONFIRMED','ADJUDICATED_REJECTED');
CREATE TYPE g04_record_validation_state   AS ENUM ('PENDING','VALID','REJECTED');

-- E18 relay_partition_lease -----------------------------------------------------------
CREATE TYPE g04_lease_status AS ENUM ('ACTIVE','RELEASED','EXPIRED');

-- E19 port_conformance_run / E21 prepension_certificate (shared PASS/FAIL) -------------
CREATE TYPE g04_pass_fail AS ENUM ('PASS','FAIL');

-- E20 capture_integrity_finding -------------------------------------------------------
CREATE TYPE g04_integrity_finding_type AS ENUM ('LEDGER_WITHOUT_OUTBOX','OUTBOX_WITHOUT_LEDGER','SIGNATURE_MISMATCH');
CREATE TYPE g04_integrity_state        AS ENUM ('OPEN','BACKFILLED','WAIVED');


-- =====================================================================================
-- SECTION 2 — E8 leave_event_outbox
-- =====================================================================================
-- Transactional outbox of leave domain events captured (in G03's tx) for posting to G12.
-- HMAC-signed for provenance; lineage-keyed; leased/claimed by the JOB-G04-RELAY relay,
-- reclaimed by JOB-G04-REAPER on lease expiry. Append-only (status-updated, never deleted):
-- carries created_at/updated_at but NO is_deleted.
CREATE TABLE leave_event_outbox (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- outbox_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    correlation_id          uuid NOT NULL,                         -- = X-Correlation-Id of the leave event
    leave_spell_lineage_id  uuid NOT NULL,                         -- G03-issued; primary join key (VAL-G04-LINEAGE)
    event_sequence          integer NOT NULL,                      -- monotonic within lineage (approve=1, amend=2…)
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    partition_key           varchar(64) NOT NULL,                  -- serialisation key (default = employee_id)
    leave_ledger_entry_id   uuid NOT NULL,                         -- LOGICAL ref to G03 leave_ledger_entries (no FK)
    event_type              g04_outbox_event_type NOT NULL,
    leave_type_code         varchar(32) NOT NULL,                  -- EL, HPL, LWP, EOL, STUDY, MATERNITY, CASUAL…
    spell_start             date NOT NULL,
    spell_end               date NOT NULL,
    days_count              numeric(6,1) NOT NULL,                 -- calendar/qualifying day count from G03
    prior_outbox_id         uuid REFERENCES leave_event_outbox(id) ON DELETE SET NULL,  -- original for amend/cancel
    payload                 jsonb NOT NULL,                        -- frozen snapshot of source fields
    payload_signature       varchar(128) NOT NULL,                 -- HMAC signed by G03 capture key (VAL-G04-SIG)
    dedupe_key              varchar(128),                          -- hash(lineage:event_type:event_sequence); X.3 Idempotency-Key
    pinned_mapping_version  integer,                               -- resolved once at first claim (in-flight pinning)
    status                  g04_outbox_status NOT NULL DEFAULT 'PENDING',
    claimed_at              timestamptz,                           -- lease start
    lease_expires_at        timestamptz,                           -- visibility timeout; reaper reclaims expired IN_FLIGHT
    available_at            timestamptz NOT NULL DEFAULT now(),    -- earliest relay pick (backoff)
    attempt_count           integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,                                  -- G03 source service principal (g04.outbox.write)
    updated_by              uuid,
    CONSTRAINT uq_outbox_lineage_seq UNIQUE (tenant_id, leave_spell_lineage_id, event_sequence),
    CONSTRAINT ck_outbox_spell_window CHECK (spell_end >= spell_start),
    CONSTRAINT ck_outbox_seq_positive CHECK (event_sequence >= 1)
);
CREATE INDEX ix_outbox_tenant        ON leave_event_outbox(tenant_id);
CREATE INDEX ix_outbox_entity        ON leave_event_outbox(entity_id);
CREATE INDEX ix_outbox_employee      ON leave_event_outbox(employee_id);
CREATE INDEX ix_outbox_lineage       ON leave_event_outbox(leave_spell_lineage_id);
CREATE INDEX ix_outbox_partition     ON leave_event_outbox(partition_key);
CREATE INDEX ix_outbox_prior         ON leave_event_outbox(prior_outbox_id);
CREATE INDEX ix_outbox_status        ON leave_event_outbox(status);
CREATE INDEX ix_outbox_ledger_entry  ON leave_event_outbox(leave_ledger_entry_id);
CREATE INDEX ix_outbox_dedupe        ON leave_event_outbox(dedupe_key);
-- Relay pick: PENDING/backoff-ready rows in partition order.
CREATE INDEX ix_outbox_relay_ready   ON leave_event_outbox(partition_key, available_at)
    WHERE status IN ('PENDING','FAILED');
-- Reaper sweep: stranded IN_FLIGHT past lease.
CREATE INDEX ix_outbox_reaper        ON leave_event_outbox(lease_expires_at)
    WHERE status = 'IN_FLIGHT';
COMMENT ON TABLE leave_event_outbox IS 'G04 E8: transactional outbox of leave domain events (signed, lineage-keyed, leased). Append-only/status-updated; never deleted. P05 DB-trigger captures all mutations.';


-- =====================================================================================
-- SECTION 3 — E9 sr_event_mapping
-- =====================================================================================
-- Versioned, effective-dated, statutorily-cited catalog: leave type / spell outcome ->
-- one G12-published event_type_code OR EXCLUDED_NON_SR. Mutable CONFIG entity: full
-- standard columns incl is_deleted (soft-delete on DRAFT). Publish runs maker-checker (P01).
CREATE TABLE sr_event_mapping (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- mapping_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    mapping_version        integer NOT NULL,                       -- monotonic per ruleset (in-flight pinning)
    leave_type_code        varchar(32) NOT NULL,                   -- match key
    event_type             g04_mapping_event_type NOT NULL,
    spell_predicate        jsonb,                                  -- e.g. days_count >= 120 => LONG_LEAVE
    disposition            g04_mapping_disposition NOT NULL,
    sr_entry_type          varchar(48),                            -- G12-published code (EL_AVAILED/LWP_SPELL…); NULL when EXCLUDED
    qualifying_service_rule g04_qualifying_service_rule,
    qualifying_rule_ref    varchar(64),                            -- statutory rule for PARTIAL
    statutory_rule_ref     varchar(120),                           -- citation; NOT NULL for POST_SR (VAL-G04-CITATION)
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
        OR (sr_entry_type IS NOT NULL AND statutory_rule_ref IS NOT NULL)
    ),
    -- EXCLUDED_NON_SR has no SR target type.
    CONSTRAINT ck_sr_mapping_excluded CHECK (disposition <> 'EXCLUDED_NON_SR' OR sr_entry_type IS NULL),
    CONSTRAINT ck_sr_mapping_effective CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_sr_mapping_tenant   ON sr_event_mapping(tenant_id);
CREATE INDEX ix_sr_mapping_entity   ON sr_event_mapping(entity_id);
CREATE INDEX ix_sr_mapping_lookup   ON sr_event_mapping(tenant_id, leave_type_code, event_type);
CREATE INDEX ix_sr_mapping_status   ON sr_event_mapping(status);
CREATE INDEX ix_sr_mapping_effective ON sr_event_mapping(effective_from, effective_to);
-- VAL-G04-MAPCOVER: at most one PUBLISHED open-ended mapping per (leave_type_code, event_type).
CREATE UNIQUE INDEX uq_sr_mapping_published_open
    ON sr_event_mapping(tenant_id, entity_id, leave_type_code, event_type)
    WHERE status = 'PUBLISHED' AND effective_to IS NULL AND is_deleted = false;
COMMENT ON TABLE sr_event_mapping IS 'G04 E9: versioned effective-dated mapping (disposition + statutory citation + straddle handling). Mutable config; soft-delete on DRAFT.';


-- =====================================================================================
-- SECTION 4 — E10 sr_posting_log
-- =====================================================================================
-- Append-only record of every posting ATTEMPT and its outcome (one row per attempt).
-- Carries the canonical G12 dedup tuple (source_module, source_reference_id,
-- source_event_version) + mandatory fact_key. Append-only ledger: created_at/created_by
-- only — NO updated_at, NO is_deleted.
CREATE TABLE sr_posting_log (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- posting_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    outbox_id              uuid NOT NULL REFERENCES leave_event_outbox(id) ON DELETE RESTRICT,
    correlation_id         uuid NOT NULL,
    leave_spell_lineage_id uuid NOT NULL,                          -- G03 business correlation key (persisted on SR too)
    event_sequence         integer NOT NULL,
    source_module          varchar(8) NOT NULL DEFAULT 'G04',      -- G12 allowed_source_modules check
    source_reference_id    varchar(128) NOT NULL,                  -- canonical dedup tuple: {lineage}:{event_type}
    source_event_version   integer NOT NULL,                       -- canonical dedup tuple: = event_sequence
    fact_key               varchar(128) NOT NULL,                  -- semantic dedup (G12 FR-01); else SR_FACT_KEY_REQUIRED
    dedupe_key             varchar(128) NOT NULL,                  -- X.3 outbound Idempotency-Key (mapping-version-independent)
    mapping_id             uuid NOT NULL REFERENCES sr_event_mapping(id) ON DELETE RESTRICT,  -- pinned version used
    sr_event_id            uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,    -- returned by G12 on success
    sr_entry_type          varchar(48) NOT NULL,                   -- G12-published event_type_code
    attempt_no             integer NOT NULL,
    outcome                g04_posting_outcome NOT NULL,
    http_status            integer,                                -- from G12 (mapped via X.3)
    error_code             varchar(48),                            -- G12 or ERR-G04-*
    error_detail           text,
    latency_ms             integer,
    posted_at              timestamptz NOT NULL DEFAULT now(),
    posted_by              varchar(64) NOT NULL,                   -- service principal or actor (manual)
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid
);
CREATE INDEX ix_sr_posting_tenant   ON sr_posting_log(tenant_id);
CREATE INDEX ix_sr_posting_entity   ON sr_posting_log(entity_id);
CREATE INDEX ix_sr_posting_outbox   ON sr_posting_log(outbox_id);
CREATE INDEX ix_sr_posting_lineage  ON sr_posting_log(leave_spell_lineage_id);
CREATE INDEX ix_sr_posting_mapping  ON sr_posting_log(mapping_id);
CREATE INDEX ix_sr_posting_sr_event ON sr_posting_log(sr_event_id);
CREATE INDEX ix_sr_posting_dedupe   ON sr_posting_log(dedupe_key);
CREATE INDEX ix_sr_posting_fact_key ON sr_posting_log(fact_key);
CREATE INDEX ix_sr_posting_outcome  ON sr_posting_log(outcome);
CREATE INDEX ix_sr_posting_tuple    ON sr_posting_log(tenant_id, source_module, source_reference_id, source_event_version);
COMMENT ON TABLE sr_posting_log IS 'G04 E10: append-only posting-attempt ledger. Carries G12 canonical dedup tuple + fact_key. No UPDATE/DELETE.';


-- =====================================================================================
-- SECTION 5 — E11 sr_dead_letter
-- =====================================================================================
-- Quarantined poison events awaiting human resolution (maker-checker via P01). State-
-- transitioning history: created_at/updated_at, NO is_deleted (DLQ history is append-only).
CREATE TABLE sr_dead_letter (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- dlq_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    outbox_id              uuid NOT NULL REFERENCES leave_event_outbox(id) ON DELETE RESTRICT,
    correlation_id         uuid NOT NULL,
    leave_spell_lineage_id uuid NOT NULL,
    failure_class          g04_dlq_failure_class NOT NULL,
    last_error_code        varchar(48) NOT NULL,
    last_error_detail      text,
    attempts_exhausted     integer NOT NULL,
    state                  g04_dlq_state NOT NULL DEFAULT 'OPEN',
    assigned_to            uuid,                                   -- LOGICAL ref to users(id) (no FK)
    resolution_workflow_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 maker-checker for SR write
    resolution_note        text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid
);
CREATE INDEX ix_sr_dlq_tenant   ON sr_dead_letter(tenant_id);
CREATE INDEX ix_sr_dlq_entity   ON sr_dead_letter(entity_id);
CREATE INDEX ix_sr_dlq_outbox   ON sr_dead_letter(outbox_id);
CREATE INDEX ix_sr_dlq_lineage  ON sr_dead_letter(leave_spell_lineage_id);
CREATE INDEX ix_sr_dlq_state    ON sr_dead_letter(state);
CREATE INDEX ix_sr_dlq_workflow ON sr_dead_letter(resolution_workflow_id);
CREATE INDEX ix_sr_dlq_assigned ON sr_dead_letter(assigned_to);
CREATE INDEX ix_sr_dlq_open     ON sr_dead_letter(tenant_id, created_at) WHERE state IN ('OPEN','IN_REVIEW');
COMMENT ON TABLE sr_dead_letter IS 'G04 E11: quarantined poison events awaiting human resolution (P01 maker-checker). Append-only history; no is_deleted.';


-- =====================================================================================
-- SECTION 6 — E12 reconciliation_run
-- =====================================================================================
-- A reconciliation execution header (state-aware; excludes legitimately pending/quarantined
-- events). run_type SOURCE_OUTBOX_INTEGRITY drives FR-17; PRE_PENSION drives FR-18.
CREATE TABLE reconciliation_run (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- run_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_type               g04_recon_run_type NOT NULL,
    scope                  jsonb NOT NULL,                         -- org_unit, date range, employee set
    leave_records_examined integer NOT NULL DEFAULT 0,
    sr_entries_examined    integer,                                -- NULL for integrity-only runs
    pending_excluded_count integer,                                -- PENDING/backoff/blocked/DEAD_LETTERED excluded (R6)
    findings_count         integer NOT NULL DEFAULT 0,
    status                 g04_recon_status NOT NULL DEFAULT 'RUNNING',
    started_at             timestamptz NOT NULL DEFAULT now(),
    completed_at           timestamptz,
    triggered_by           uuid,                                   -- LOGICAL ref to users(id); NULL for scheduled (X.1)
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid
);
CREATE INDEX ix_recon_run_tenant ON reconciliation_run(tenant_id);
CREATE INDEX ix_recon_run_entity ON reconciliation_run(entity_id);
CREATE INDEX ix_recon_run_type   ON reconciliation_run(run_type);
CREATE INDEX ix_recon_run_status ON reconciliation_run(status);
CREATE INDEX ix_recon_run_started ON reconciliation_run(started_at);
COMMENT ON TABLE reconciliation_run IS 'G04 E12: reconciliation execution header (state-aware; SCHEDULED/ON_DEMAND/PRE_PENSION/SOURCE_OUTBOX_INTEGRITY).';


-- =====================================================================================
-- SECTION 7 — E13 reconciliation_finding
-- =====================================================================================
-- One drift/mismatch finding + remediation state, lineage-keyed (chains resolved before
-- diffing). Remediation runs maker-checker (P01). Append-only finding history; no is_deleted.
CREATE TABLE reconciliation_finding (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- finding_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_id                  uuid NOT NULL REFERENCES reconciliation_run(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    correlation_id          uuid,
    leave_spell_lineage_id  uuid,                                  -- primary match key; chains resolved before diff
    finding_type            g04_finding_type NOT NULL,
    severity                g04_finding_severity NOT NULL,
    leave_snapshot          jsonb,                                 -- source
    sr_snapshot             jsonb,                                 -- net-effective target
    divergent_fields        jsonb,                                 -- field-level diff
    remediation_state       g04_remediation_state NOT NULL DEFAULT 'OPEN',
    remediation_workflow_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid
);
CREATE INDEX ix_recon_finding_tenant   ON reconciliation_finding(tenant_id);
CREATE INDEX ix_recon_finding_entity   ON reconciliation_finding(entity_id);
CREATE INDEX ix_recon_finding_run      ON reconciliation_finding(run_id);
CREATE INDEX ix_recon_finding_employee ON reconciliation_finding(employee_id);
CREATE INDEX ix_recon_finding_lineage  ON reconciliation_finding(leave_spell_lineage_id);
CREATE INDEX ix_recon_finding_type     ON reconciliation_finding(finding_type);
CREATE INDEX ix_recon_finding_severity ON reconciliation_finding(severity);
CREATE INDEX ix_recon_finding_state    ON reconciliation_finding(remediation_state);
CREATE INDEX ix_recon_finding_workflow ON reconciliation_finding(remediation_workflow_id);
-- Open HIGH/CRITICAL findings drive the pre-pension certificate gate (FR-18).
CREATE INDEX ix_recon_finding_open_hc  ON reconciliation_finding(tenant_id, employee_id)
    WHERE remediation_state = 'OPEN' AND severity IN ('HIGH','CRITICAL');
COMMENT ON TABLE reconciliation_finding IS 'G04 E13: per-finding drift/mismatch + remediation state (lineage-keyed). Append-only history; no is_deleted.';


-- =====================================================================================
-- SECTION 8 — E14 sr_correction_link
-- =====================================================================================
-- Links a correcting/reversing G12 SR entry to its original (lineage recoverable). FK to
-- the core G12 ledger by sr_event_id. Append-only ledger: created_at/created_by only.
CREATE TABLE sr_correction_link (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- link_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    original_sr_event_id    uuid NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- entry being corrected
    correcting_sr_event_id  uuid NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- new append-only entry
    leave_spell_lineage_id  uuid NOT NULL,                         -- recoverable from G12-stored lineage (R9)
    correction_type         g04_correction_type NOT NULL,
    reason_code             varchar(48) NOT NULL,                  -- LEAVE_CANCELLED/LEAVE_AMENDED/RECON_FIX/MIGRATION_FIX
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    CONSTRAINT uq_sr_correction_pair UNIQUE (original_sr_event_id, correcting_sr_event_id),
    CONSTRAINT ck_sr_correction_distinct CHECK (original_sr_event_id <> correcting_sr_event_id)
);
CREATE INDEX ix_sr_corr_tenant     ON sr_correction_link(tenant_id);
CREATE INDEX ix_sr_corr_entity     ON sr_correction_link(entity_id);
CREATE INDEX ix_sr_corr_original   ON sr_correction_link(original_sr_event_id);
CREATE INDEX ix_sr_corr_correcting ON sr_correction_link(correcting_sr_event_id);
CREATE INDEX ix_sr_corr_lineage    ON sr_correction_link(leave_spell_lineage_id);
CREATE INDEX ix_sr_corr_type       ON sr_correction_link(correction_type);
COMMENT ON TABLE sr_correction_link IS 'G04 E14: links a correcting/reversing SR entry to its original (G12 ledger FK). Append-only.';


-- =====================================================================================
-- SECTION 9 — E15 historical_leave_batch
-- =====================================================================================
-- Digitisation batch header (legacy leave load; runs on the P06 ETL+V toolkit). State-
-- transitioning header; append-only history (no is_deleted).
CREATE TABLE historical_leave_batch (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),       -- batch_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_label         varchar(120) NOT NULL,
    source_type         g04_batch_source_type NOT NULL,
    source_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,         -- G13 provenance
    migration_run_id    uuid REFERENCES migration_runs(id) ON DELETE SET NULL,    -- P06 ledger linkage
    records_total       integer NOT NULL DEFAULT 0,
    records_valid       integer NOT NULL DEFAULT 0,
    records_rejected    integer NOT NULL DEFAULT 0,
    status              g04_batch_status NOT NULL DEFAULT 'STAGED',
    approval_workflow_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 SR-Custodian approval
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid
);
CREATE INDEX ix_hist_batch_tenant   ON historical_leave_batch(tenant_id);
CREATE INDEX ix_hist_batch_entity   ON historical_leave_batch(entity_id);
CREATE INDEX ix_hist_batch_status   ON historical_leave_batch(status);
CREATE INDEX ix_hist_batch_document ON historical_leave_batch(source_document_id);
CREATE INDEX ix_hist_batch_migration ON historical_leave_batch(migration_run_id);
CREATE INDEX ix_hist_batch_workflow ON historical_leave_batch(approval_workflow_id);
COMMENT ON TABLE historical_leave_batch IS 'G04 E15: legacy-leave digitisation batch header (runs on P06). Append-only history.';


-- =====================================================================================
-- SECTION 10 — E16 historical_leave_record
-- =====================================================================================
-- A staged legacy leave record (confidence/adjudication; <gov>_source_id traceability).
-- PROVISIONAL until SR-Custodian adjudicated; excluded from final pension until confirmed.
CREATE TABLE historical_leave_record (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- record_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_id               uuid NOT NULL REFERENCES historical_leave_batch(id) ON DELETE RESTRICT,
    employee_id            uuid REFERENCES employees(id) ON DELETE RESTRICT,  -- resolved during validation
    leave_spell_lineage_id uuid,                                   -- deterministically derived (migrated identity)
    gov_source_id          varchar(64) NOT NULL,                   -- P06 traceability (<gov>_source_id)
    service_no_raw         varchar(64) NOT NULL,                   -- as-keyed; resolved to employee_id
    leave_type_code        varchar(32) NOT NULL,                   -- mapped from legacy code
    spell_start            date NOT NULL,
    spell_end              date NOT NULL,
    days_count             numeric(6,1) NOT NULL,
    qualifying_flag        g04_qualifying_service_rule,            -- derived via mapping
    statutory_rule_ref     varchar(120),                          -- mandatory before posting a qualifying migrated entry (R15)
    confidence             g04_record_confidence NOT NULL,
    adjudication_state     g04_record_adjudication_state NOT NULL DEFAULT 'PROVISIONAL',
    validation_state       g04_record_validation_state NOT NULL DEFAULT 'PENDING',
    reject_reason          varchar(120),
    posted_sr_event_id     uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- after posting
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
    CONSTRAINT uq_hist_record_source UNIQUE (tenant_id, gov_source_id),
    CONSTRAINT ck_hist_record_window CHECK (spell_end >= spell_start)
);
CREATE INDEX ix_hist_rec_tenant     ON historical_leave_record(tenant_id);
CREATE INDEX ix_hist_rec_entity     ON historical_leave_record(entity_id);
CREATE INDEX ix_hist_rec_batch      ON historical_leave_record(batch_id);
CREATE INDEX ix_hist_rec_employee   ON historical_leave_record(employee_id);
CREATE INDEX ix_hist_rec_lineage    ON historical_leave_record(leave_spell_lineage_id);
CREATE INDEX ix_hist_rec_adjud      ON historical_leave_record(adjudication_state);
CREATE INDEX ix_hist_rec_validation ON historical_leave_record(validation_state);
CREATE INDEX ix_hist_rec_sr_event   ON historical_leave_record(posted_sr_event_id);
COMMENT ON TABLE historical_leave_record IS 'G04 E16: staged legacy leave record (confidence/adjudication; gov_source_id). PROVISIONAL until adjudicated.';


-- =====================================================================================
-- SECTION 11 — E17 integration_config
-- =====================================================================================
-- Retry/SLA/lease/scheduler settings, effective-dated, config cascade
-- platform->tenant->entity->employee. Mutable config entity: full standard columns incl
-- is_deleted (soft-delete).
CREATE TABLE integration_config (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),     -- config_id
    tenant_id      uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    config_key     varchar(64) NOT NULL,                           -- max_retries, lease_timeout_ms, live_posting_gate…
    config_value   jsonb NOT NULL,
    effective_from timestamptz NOT NULL,
    effective_to   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_by     uuid,
    is_deleted     boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_integration_config_effective CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_integration_config_tenant ON integration_config(tenant_id);
CREATE INDEX ix_integration_config_entity ON integration_config(entity_id);
CREATE INDEX ix_integration_config_key    ON integration_config(tenant_id, config_key);
-- One active (open) value per (entity, key).
CREATE UNIQUE INDEX uq_integration_config_open
    ON integration_config(tenant_id, entity_id, config_key)
    WHERE effective_to IS NULL AND is_deleted = false;
COMMENT ON TABLE integration_config IS 'G04 E17: effective-dated retry/SLA/lease/scheduler config (cascade platform->tenant->entity->employee). Soft-delete.';


-- =====================================================================================
-- SECTION 12 — E18 relay_partition_lease
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
-- At most one ACTIVE lease per partition (in-order serialisation guard).
CREATE UNIQUE INDEX uq_relay_lease_active
    ON relay_partition_lease(tenant_id, partition_key)
    WHERE status = 'ACTIVE';
COMMENT ON TABLE relay_partition_lease IS 'G04 E18: per-partition in-order processing lease (reaper-reclaimed). One ACTIVE lease per partition.';


-- =====================================================================================
-- SECTION 13 — E19 port_conformance_run
-- =====================================================================================
-- G12 SR write-port bilateral-contract conformance test result (gates live posting:
-- VAL-G04-CONFORM requires a PASS with retention >= 2557 days). Append-only ledger:
-- created_at/created_by only.
CREATE TABLE port_conformance_run (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- conformance_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    contract_version       varchar(32) NOT NULL,                   -- G12 port contract / X.3 payload version
    dedupe_retention_days  integer NOT NULL,                       -- must be >= 2557 (~7y) to PASS
    indexes_verified       jsonb NOT NULL,                         -- {dedupe_key:true, correlationId:true, lineage:true}
    append_only_verified   boolean NOT NULL,                       -- UPDATE/DELETE rejected (intrinsic to P05)
    dedupe_replay_verified boolean NOT NULL,                       -- repeat post at horizon returns original sr_event_id
    result                 g04_pass_fail NOT NULL,
    evidence_checksum      varchar(64) NOT NULL,                   -- SHA-256 of evidence bundle
    run_at                 timestamptz NOT NULL DEFAULT now(),
    run_by                 varchar(64) NOT NULL,                   -- CI principal / Sys Admin / JOB-G04-CONFORMANCE
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid
);
CREATE INDEX ix_conformance_tenant   ON port_conformance_run(tenant_id);
CREATE INDEX ix_conformance_entity   ON port_conformance_run(entity_id);
CREATE INDEX ix_conformance_version  ON port_conformance_run(contract_version);
CREATE INDEX ix_conformance_result   ON port_conformance_run(result);
CREATE INDEX ix_conformance_run_at   ON port_conformance_run(run_at);
COMMENT ON TABLE port_conformance_run IS 'G04 E19: G12 write-port conformance test result (gates live posting). Append-only.';


-- =====================================================================================
-- SECTION 14 — E20 capture_integrity_finding
-- =====================================================================================
-- Source-ledger <-> outbox integrity finding (FR-17). Raised by a SOURCE_OUTBOX_INTEGRITY
-- reconciliation_run. SIGNATURE_MISMATCH also lands in security_audit_log (P05). State-
-- transitioning history; no is_deleted.
CREATE TABLE capture_integrity_finding (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- integrity_id
    tenant_id              uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_id                 uuid NOT NULL REFERENCES reconciliation_run(id) ON DELETE RESTRICT,  -- a SOURCE_OUTBOX_INTEGRITY run
    employee_id            uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_ledger_entry_id  uuid,                                   -- LOGICAL ref to G03 ledger (no FK)
    leave_spell_lineage_id uuid,
    finding_type           g04_integrity_finding_type NOT NULL,
    severity               g04_finding_severity NOT NULL,
    state                  g04_integrity_state NOT NULL DEFAULT 'OPEN',
    detail                 jsonb,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid
);
CREATE INDEX ix_capture_integ_tenant   ON capture_integrity_finding(tenant_id);
CREATE INDEX ix_capture_integ_entity   ON capture_integrity_finding(entity_id);
CREATE INDEX ix_capture_integ_run      ON capture_integrity_finding(run_id);
CREATE INDEX ix_capture_integ_employee ON capture_integrity_finding(employee_id);
CREATE INDEX ix_capture_integ_lineage  ON capture_integrity_finding(leave_spell_lineage_id);
CREATE INDEX ix_capture_integ_type     ON capture_integrity_finding(finding_type);
CREATE INDEX ix_capture_integ_state    ON capture_integrity_finding(state);
COMMENT ON TABLE capture_integrity_finding IS 'G04 E20: source-ledger <-> outbox integrity finding (FR-17). SIGNATURE_MISMATCH also to security_audit_log.';


-- =====================================================================================
-- SECTION 15 — E21 prepension_certificate
-- =====================================================================================
-- Signed, checksummed pre-pension completeness certificate (FR-18) — consumable as G11's
-- gate input. PASS requires zero open HIGH/CRITICAL findings and zero provisional entries.
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
    updated_by                  uuid
);
CREATE INDEX ix_prepension_tenant   ON prepension_certificate(tenant_id);
CREATE INDEX ix_prepension_entity   ON prepension_certificate(entity_id);
CREATE INDEX ix_prepension_employee ON prepension_certificate(employee_id);
CREATE INDEX ix_prepension_run      ON prepension_certificate(run_id);
CREATE INDEX ix_prepension_result   ON prepension_certificate(result);
COMMENT ON TABLE prepension_certificate IS 'G04 E21: signed pre-pension completeness certificate (FR-18); G11 gate input. PASS = 0 open HIGH/CRITICAL + 0 provisional.';


-- =====================================================================================
-- SECTION 16 — ROW-LEVEL SECURITY (P02 data-scope substrate; CONVENTIONS §6)
-- =====================================================================================
-- Apply the canonical tenant-isolation policy to every G04-owned tenant-scoped table.
DO $$
DECLARE
    t text;
    g04_tables text[] := ARRAY[
        'leave_event_outbox','sr_event_mapping','sr_posting_log','sr_dead_letter',
        'reconciliation_run','reconciliation_finding','sr_correction_link',
        'historical_leave_batch','historical_leave_record','integration_config',
        'relay_partition_lease','port_conformance_run','capture_integrity_finding',
        'prepension_certificate'
    ];
BEGIN
    FOREACH t IN ARRAY g04_tables LOOP
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
-- SECTION 17 — SAMPLE SEED ROWS (BRD §5.2)
-- =====================================================================================
-- Reuse the core seed fixtures (00-platform-core.sql §12): tenant 1111…1111, entity
-- 2222…2201, employees 9999…9901 / 9999…9902, SR entries aaaa…aa01 / aaaa…aa02.
SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- E8 leave_event_outbox ---------------------------------------------------------------
INSERT INTO leave_event_outbox
 (id, tenant_id, entity_id, correlation_id, leave_spell_lineage_id, event_sequence, employee_id, partition_key,
  leave_ledger_entry_id, event_type, leave_type_code, spell_start, spell_end, days_count, prior_outbox_id,
  payload, payload_signature, dedupe_key, pinned_mapping_version, status, available_at, attempt_count)
VALUES
 ('04b00001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04c00001-0000-0000-0000-0000000000a1','04111111-0000-0000-0000-0000000000aa',1,'99999999-9999-9999-9999-999999999901',
  '99999999-9999-9999-9999-999999999901','04e10000-0000-0000-0000-000000000001','LEAVE_APPROVED','EL','2026-04-01','2026-04-10',10.0,NULL,
  '{"leave_type":"EL","days":10}','HMAC:9f3c…01','k:linaa:APPR:1',3,'POSTED','2026-04-01T05:00:00Z',1),
 ('04b00001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04c00001-0000-0000-0000-0000000000b1','04111111-0000-0000-0000-0000000000bb',1,'99999999-9999-9999-9999-999999999902',
  '99999999-9999-9999-9999-999999999902','04e10000-0000-0000-0000-000000000002','LEAVE_APPROVED','LWP','2026-01-01','2026-05-01',121.0,NULL,
  '{"leave_type":"LWP","days":121}','HMAC:9f3c…02','k:linbb:APPR:1',3,'IN_FLIGHT','2026-05-02T05:00:00Z',2),
 ('04b00001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04c00001-0000-0000-0000-0000000000a2','04111111-0000-0000-0000-0000000000aa',2,'99999999-9999-9999-9999-999999999901',
  '99999999-9999-9999-9999-999999999901','04e10000-0000-0000-0000-000000000001','LEAVE_CANCELLED','EL','2026-04-01','2026-04-10',10.0,
  '04b00001-0000-0000-0000-000000000001','{"leave_type":"EL","cancel":true}','HMAC:9f3c…03','k:linaa:CANC:2',3,'BLOCKED_AWAITING_ORIGINAL','2026-04-12T05:00:00Z',0);

-- E9 sr_event_mapping -----------------------------------------------------------------
INSERT INTO sr_event_mapping
 (id, tenant_id, entity_id, mapping_version, leave_type_code, event_type, disposition, sr_entry_type,
  qualifying_service_rule, statutory_rule_ref, straddle_handling, effective_from, status)
VALUES
 ('04d00001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  3,'EL','APPROVED','POST_SR','EL_AVAILED','QUALIFYING','CCS (Leave) Rules 1972 r.26','SPLIT_BY_EFFECTIVE','2026-01-01','PUBLISHED'),
 ('04d00001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  3,'LWP','APPROVED','POST_SR','LWP_SPELL','NON_QUALIFYING','CCS (Leave) Rules 1972 r.43-A','SPLIT_BY_EFFECTIVE','2026-01-01','PUBLISHED'),
 ('04d00001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  3,'CASUAL','APPROVED','EXCLUDED_NON_SR',NULL,NULL,NULL,'PIN_TO_SPELL_START','2026-01-01','PUBLISHED');

-- E10 sr_posting_log ------------------------------------------------------------------
INSERT INTO sr_posting_log
 (id, tenant_id, entity_id, outbox_id, correlation_id, leave_spell_lineage_id, event_sequence, source_module,
  source_reference_id, source_event_version, fact_key, dedupe_key, mapping_id, sr_event_id, sr_entry_type,
  attempt_no, outcome, http_status, latency_ms, posted_by)
VALUES
 ('04f00001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04b00001-0000-0000-0000-000000000001','04c00001-0000-0000-0000-0000000000a1','04111111-0000-0000-0000-0000000000aa',1,'G04',
  '04111111-0000-0000-0000-0000000000aa:LEAVE_APPROVED',1,'fk:linaa:EL:2026-04-01','k:linaa:APPR:1',
  '04d00001-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','EL_AVAILED',1,'SUCCESS',201,142,'svc:G04'),
 ('04f00001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04b00001-0000-0000-0000-000000000002','04c00001-0000-0000-0000-0000000000b1','04111111-0000-0000-0000-0000000000bb',1,'G04',
  '04111111-0000-0000-0000-0000000000bb:LEAVE_APPROVED',1,'fk:linbb:LWP:2026-01-01','k:linbb:APPR:1',
  '04d00001-0000-0000-0000-000000000002',NULL,'LWP_SPELL',1,'RETRYABLE_FAILURE',502,5012,'svc:G04'),
 ('04f00001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04b00001-0000-0000-0000-000000000002','04c00001-0000-0000-0000-0000000000b1','04111111-0000-0000-0000-0000000000bb',1,'G04',
  '04111111-0000-0000-0000-0000000000bb:LEAVE_APPROVED',1,'fk:linbb:LWP:2026-01-01','k:linbb:APPR:1',
  '04d00001-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02','LWP_SPELL',3,'DUPLICATE_NOOP',200,88,'svc:G04');

-- E11 sr_dead_letter ------------------------------------------------------------------
INSERT INTO sr_dead_letter
 (id, tenant_id, entity_id, outbox_id, correlation_id, leave_spell_lineage_id, failure_class, last_error_code,
  attempts_exhausted, state)
VALUES
 ('04a10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04b00001-0000-0000-0000-000000000003','04c00001-0000-0000-0000-0000000000a2','04111111-0000-0000-0000-0000000000aa',
  'MAPPING_MISSING','ERR-G04-MAPPING-NOT-FOUND',5,'OPEN'),
 ('04a10001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04b00001-0000-0000-0000-000000000002','04c00001-0000-0000-0000-0000000000b1','04111111-0000-0000-0000-0000000000bb',
  'UPSTREAM_DOWN','ERR-G04-SR-UNAVAILABLE',8,'IN_REVIEW');

-- E12 reconciliation_run --------------------------------------------------------------
INSERT INTO reconciliation_run
 (id, tenant_id, entity_id, run_type, scope, leave_records_examined, sr_entries_examined, pending_excluded_count,
  findings_count, status, completed_at)
VALUES
 ('04200001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'SCHEDULED','{"org_unit":"REV-HQ","from":"2026-01-01","to":"2026-06-30"}',12840,12835,4,1,'COMPLETED', now()),
 ('04200001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'PRE_PENSION','{"employee_id":"99999999-9999-9999-9999-999999999902"}',41,41,0,0,'COMPLETED', now()),
 ('04200001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'SOURCE_OUTBOX_INTEGRITY','{"from":"2026-01-01","to":"2026-06-30"}',12840,NULL,NULL,0,'COMPLETED', now());

-- E13 reconciliation_finding ----------------------------------------------------------
INSERT INTO reconciliation_finding
 (id, tenant_id, entity_id, run_id, employee_id, leave_spell_lineage_id, finding_type, severity, remediation_state)
VALUES
 ('04300001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04200001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999901','04111111-0000-0000-0000-000000000012',
  'MISSING_SR','HIGH','OPEN'),
 ('04300001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04200001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','04111111-0000-0000-0000-000000000034',
  'DUPLICATE_SR','CRITICAL','REMEDIATION_PROPOSED');

-- E14 sr_correction_link --------------------------------------------------------------
INSERT INTO sr_correction_link
 (id, tenant_id, entity_id, original_sr_event_id, correcting_sr_event_id, leave_spell_lineage_id, correction_type, reason_code)
VALUES
 ('04400001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02','04111111-0000-0000-0000-0000000000aa',
  'REVERSAL','LEAVE_CANCELLED');

-- E15 historical_leave_batch ----------------------------------------------------------
INSERT INTO historical_leave_batch
 (id, tenant_id, entity_id, batch_label, source_type, records_total, records_valid, records_rejected, status)
VALUES
 ('04500001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'Office-X legacy 1995-2010','PAPER_SCAN',1450,1438,12,'VALIDATED'),
 ('04500001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'Legacy HRMS dump 2011-2018','LEGACY_SYSTEM',9802,9790,12,'POSTED');

-- E16 historical_leave_record ---------------------------------------------------------
INSERT INTO historical_leave_record
 (id, tenant_id, entity_id, batch_id, employee_id, gov_source_id, service_no_raw, leave_type_code, spell_start, spell_end,
  days_count, qualifying_flag, confidence, adjudication_state, validation_state)
VALUES
 ('04600001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04500001-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','GOV_SRC_1995_1123','EMP-1995-1123','EL',
  '1999-05-01','1999-05-10',10.0,'QUALIFYING','HIGH','ADJUDICATED_CONFIRMED','VALID'),
 ('04600001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04500001-0000-0000-0000-000000000001',NULL,'GOV_SRC_2001_0457','EMP-2001-0457','LWP',
  '2001-03-01','2001-09-01',184.0,'NON_QUALIFYING','LOW','PROVISIONAL','VALID');

-- E17 integration_config --------------------------------------------------------------
INSERT INTO integration_config
 (id, tenant_id, entity_id, config_key, config_value, effective_from)
VALUES
 ('04700001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'max_retries','8','2026-01-01T00:00:00Z'),
 ('04700001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'lease_timeout_ms','120000','2026-01-01T00:00:00Z'),
 ('04700001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  'live_posting_gate','"closed"','2026-01-01T00:00:00Z');

-- E18 relay_partition_lease -----------------------------------------------------------
INSERT INTO relay_partition_lease
 (id, tenant_id, entity_id, partition_key, owner_worker_id, lease_expires_at, last_processed_sequence, status)
VALUES
 ('04800001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999901','relay-a-7','2026-07-01T06:02:00Z',2,'ACTIVE'),
 ('04800001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999902','relay-b-3','2026-07-01T06:01:30Z',1,'ACTIVE');

-- E19 port_conformance_run ------------------------------------------------------------
INSERT INTO port_conformance_run
 (id, tenant_id, entity_id, contract_version, dedupe_retention_days, indexes_verified, append_only_verified,
  dedupe_replay_verified, result, evidence_checksum, run_by)
VALUES
 ('04900001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '1.0',2557,'{"dedupe_key":true,"correlationId":true,"lineage":true}',true,true,'PASS',
  'a1b2c3d4e5f600112233445566778899aabbccddeeff00112233445566778899','ci:conformance'),
 ('04900001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '1.0',365,'{"dedupe_key":true,"correlationId":false,"lineage":true}',true,false,'FAIL',
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100','ci:conformance');

-- E20 capture_integrity_finding -------------------------------------------------------
INSERT INTO capture_integrity_finding
 (id, tenant_id, entity_id, run_id, employee_id, leave_ledger_entry_id, leave_spell_lineage_id, finding_type, severity, state)
VALUES
 ('04a20001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04200001-0000-0000-0000-000000000003','99999999-9999-9999-9999-999999999901','04e10000-0000-0000-0000-000000000077',
  '04111111-0000-0000-0000-000000000077','LEDGER_WITHOUT_OUTBOX','HIGH','BACKFILLED'),
 ('04a20001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '04200001-0000-0000-0000-000000000003','99999999-9999-9999-9999-999999999902','04e10000-0000-0000-0000-000000000078',
  '04111111-0000-0000-0000-000000000078','SIGNATURE_MISMATCH','CRITICAL','OPEN');

-- E21 prepension_certificate ----------------------------------------------------------
INSERT INTO prepension_certificate
 (id, tenant_id, entity_id, employee_id, run_id, open_high_critical_findings, total_non_qualifying_days,
  lineage_complete, provisional_entries_remaining, result, checksum, signed_by)
VALUES
 ('04c10001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',
  '99999999-9999-9999-9999-999999999902','04200001-0000-0000-0000-000000000002',0,121.0,true,0,'PASS',
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff','99999999-9999-9999-9999-999999999901');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 04-G04-leave-sr-integration.sql
-- =====================================================================================
