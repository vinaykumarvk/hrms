-- PH-07B migration 0005: G04 leave->SR statutory relay substrate.
-- Faithful subset of docs/data-model/04-G04-leave-sr-integration.sql:
--   E8  leave_event_outbox      (lineage-keyed, HMAC-signed, backoff-scheduled outbox)
--   E11 sr_dead_letter          (quarantined poison events awaiting human resolution)
--   E12 reconciliation_run      (reconciliation execution header)
--   E13 reconciliation_finding  (MISSING_SR / ORPHAN_CORRECTION drift findings)
--   E14 sr_correction_link      (correcting SR entry linked to its original)

-- =====================================================================================
-- SECTION 1 — ENUM TYPES (g04_ prefix, frozen names)
-- =====================================================================================












-- =====================================================================================
-- SECTION 2 — E8 leave_event_outbox
-- =====================================================================================
-- Transactional outbox of leave domain events captured (in G03's tx) for posting to G12.
-- HMAC-signed for provenance; lineage-keyed; picked by the relay only once available_at
-- has passed (exponential backoff). Append-only (status-updated, never deleted).
CREATE TABLE leave_event_outbox (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- outbox_id
    tenant_id               text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    correlation_id          text NOT NULL,                         -- = X-Correlation-Id of the leave event
    leave_spell_lineage_id  text NOT NULL,                         -- G03-issued; primary join key (VAL-G04-LINEAGE)
    event_sequence          integer NOT NULL,                      -- monotonic within lineage (approve=1, amend=2…)
    employee_id             text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    partition_key           varchar(64) NOT NULL,                  -- serialisation key (default = employee_id)
    leave_ledger_entry_id   text NOT NULL,                         -- LOGICAL ref to G03 leave_ledger_entries (no FK)
    event_type              text NOT NULL,
    leave_type_code         varchar(32) NOT NULL,
    spell_start             date NOT NULL,
    spell_end               date NOT NULL,
    days_count              numeric(6,1) NOT NULL,
    prior_outbox_id         text REFERENCES leave_event_outbox(id) ON DELETE SET NULL,  -- original for amend/cancel
    payload                 jsonb NOT NULL,                        -- frozen snapshot of source fields
    payload_signature       varchar(128) NOT NULL,                 -- HMAC signed by G03 capture key (VAL-G04-SIG)
    dedupe_key              varchar(128),                          -- hash(lineage:event_type:event_sequence)
    status                  text NOT NULL DEFAULT 'PENDING',
    available_at            timestamptz NOT NULL DEFAULT now(),    -- earliest relay pick (exponential backoff)
    attempt_count           integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    CONSTRAINT uq_outbox_lineage_seq UNIQUE (tenant_id, leave_spell_lineage_id, event_sequence),
    CONSTRAINT ck_outbox_spell_window CHECK (spell_end >= spell_start),
    CONSTRAINT ck_outbox_seq_positive CHECK (event_sequence >= 1)
);
CREATE INDEX ix_leo_tenant        ON leave_event_outbox(tenant_id);
CREATE INDEX ix_leo_entity        ON leave_event_outbox(entity_id);
CREATE INDEX ix_leo_employee      ON leave_event_outbox(employee_id);
CREATE INDEX ix_leo_lineage       ON leave_event_outbox(leave_spell_lineage_id);
CREATE INDEX ix_leo_partition     ON leave_event_outbox(partition_key);
CREATE INDEX ix_leo_prior         ON leave_event_outbox(prior_outbox_id);
CREATE INDEX ix_leo_status        ON leave_event_outbox(status);
CREATE INDEX ix_leo_dedupe        ON leave_event_outbox(dedupe_key);
-- Relay pick: PENDING/backoff-ready rows in partition order once available_at has passed.
CREATE INDEX ix_leo_relay_ready   ON leave_event_outbox(partition_key, available_at)
    WHERE status IN ('PENDING','FAILED');
COMMENT ON TABLE leave_event_outbox IS 'G04 E8: transactional outbox of leave domain events (signed, lineage-keyed, backoff-scheduled). Append-only/status-updated; never deleted.';

-- =====================================================================================
-- SECTION 3 — E11 sr_dead_letter
-- =====================================================================================
-- Quarantined poison events awaiting human resolution (maker-checker via P01). State-
-- transitioning history: created_at/updated_at, NO is_deleted (DLQ history is append-only).
CREATE TABLE sr_dead_letter (
    id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,    -- dlq_id
    tenant_id              text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    outbox_id              text NOT NULL REFERENCES leave_event_outbox(id) ON DELETE RESTRICT,
    correlation_id         text NOT NULL,
    leave_spell_lineage_id text NOT NULL,
    failure_class          text NOT NULL,
    last_error_code        varchar(48) NOT NULL,                   -- G12 or ERR-G04-* (e.g. ERR-G04-SIGNATURE-INVALID)
    last_error_detail      text,
    attempts_exhausted     integer NOT NULL,
    state                  text NOT NULL DEFAULT 'OPEN',
    assigned_to            text,                                   -- LOGICAL ref to users(id) (no FK)
    resolution_workflow_id text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    resolution_note        text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             text,
    updated_by             text
);
CREATE INDEX ix_sr_dlq_tenant   ON sr_dead_letter(tenant_id);
CREATE INDEX ix_sr_dlq_entity   ON sr_dead_letter(entity_id);
CREATE INDEX ix_sr_dlq_outbox   ON sr_dead_letter(outbox_id);
CREATE INDEX ix_sr_dlq_lineage  ON sr_dead_letter(leave_spell_lineage_id);
CREATE INDEX ix_sr_dlq_state    ON sr_dead_letter(state);
CREATE INDEX ix_sr_dlq_workflow ON sr_dead_letter(resolution_workflow_id);
CREATE INDEX ix_sr_dlq_open     ON sr_dead_letter(tenant_id, created_at) WHERE state IN ('OPEN','IN_REVIEW');
COMMENT ON TABLE sr_dead_letter IS 'G04 E11: quarantined poison events awaiting human resolution (P01 maker-checker). Append-only history; no is_deleted.';

-- =====================================================================================
-- SECTION 4 — E12 reconciliation_run
-- =====================================================================================
CREATE TABLE reconciliation_run (
    id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,    -- run_id
    tenant_id              text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id              text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_type               text NOT NULL,
    scope                  jsonb NOT NULL,                         -- org_unit, date range, employee set
    leave_records_examined integer NOT NULL DEFAULT 0,
    sr_entries_examined    integer,                                -- NULL for integrity-only runs
    pending_excluded_count integer,                                -- PENDING/backoff/blocked/DEAD_LETTERED excluded
    findings_count         integer NOT NULL DEFAULT 0,
    status                 text NOT NULL DEFAULT 'RUNNING',
    started_at             timestamptz NOT NULL DEFAULT now(),
    completed_at           timestamptz,
    triggered_by           text,                                   -- LOGICAL ref to users(id); NULL for scheduled
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             text,
    updated_by             text
);
CREATE INDEX ix_recon_run_tenant  ON reconciliation_run(tenant_id);
CREATE INDEX ix_recon_run_entity  ON reconciliation_run(entity_id);
CREATE INDEX ix_recon_run_type    ON reconciliation_run(run_type);
CREATE INDEX ix_recon_run_status  ON reconciliation_run(status);
CREATE INDEX ix_recon_run_started ON reconciliation_run(started_at);
COMMENT ON TABLE reconciliation_run IS 'G04 E12: reconciliation execution header (G03 leave ledger vs G12 SR).';

-- =====================================================================================
-- SECTION 5 — E13 reconciliation_finding
-- =====================================================================================
-- One drift/mismatch finding + remediation state, lineage-keyed. Append-only history.
CREATE TABLE reconciliation_finding (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- finding_id
    tenant_id               text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    run_id                  text NOT NULL REFERENCES reconciliation_run(id) ON DELETE RESTRICT,
    employee_id             text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    correlation_id          text,
    leave_spell_lineage_id  text,                                  -- primary match key
    finding_type            text NOT NULL,             -- MISSING_SR / ORPHAN_CORRECTION / …
    severity                text NOT NULL,
    leave_snapshot          jsonb,                                 -- source (G03 ledger)
    sr_snapshot             jsonb,                                 -- net-effective target (G12)
    divergent_fields        jsonb,
    remediation_state       text NOT NULL DEFAULT 'OPEN',
    remediation_workflow_id text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text
);
CREATE INDEX ix_recon_finding_tenant   ON reconciliation_finding(tenant_id);
CREATE INDEX ix_recon_finding_entity   ON reconciliation_finding(entity_id);
CREATE INDEX ix_recon_finding_run      ON reconciliation_finding(run_id);
CREATE INDEX ix_recon_finding_employee ON reconciliation_finding(employee_id);
CREATE INDEX ix_recon_finding_lineage  ON reconciliation_finding(leave_spell_lineage_id);
CREATE INDEX ix_recon_finding_type     ON reconciliation_finding(finding_type);
CREATE INDEX ix_recon_finding_severity ON reconciliation_finding(severity);
CREATE INDEX ix_recon_finding_state    ON reconciliation_finding(remediation_state);
CREATE INDEX ix_recon_finding_open_hc  ON reconciliation_finding(tenant_id, employee_id)
    WHERE remediation_state = 'OPEN' AND severity IN ('HIGH','CRITICAL');
COMMENT ON TABLE reconciliation_finding IS 'G04 E13: per-finding drift/mismatch + remediation state (lineage-keyed). Append-only history; no is_deleted.';

-- =====================================================================================
-- SECTION 6 — E14 sr_correction_link
-- =====================================================================================
-- Links a correcting/reversing SR entry to the original it corrects. Append-only ledger.
CREATE TABLE sr_correction_link (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- link_id
    tenant_id               text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id               text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    original_sr_event_id    text NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT,
    correcting_sr_event_id  text NOT NULL REFERENCES service_register_events(id) ON DELETE RESTRICT,
    leave_spell_lineage_id  text NOT NULL,
    correction_type         text NOT NULL,
    reason_code             varchar(48) NOT NULL,                  -- LEAVE_CANCELLED/LEAVE_AMENDED/RECON_FIX/MIGRATION_FIX
    correlation_id          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
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
