-- PH-07C migration 0006: G02 personal-details workflow config + change-request substrate —
-- faithful subset of docs/data-model/02-G02-personal-details-workflow.sql.
-- Tables: field_sensitivity_catalog (E5), approval_matrix_config (E6), approval_matrix_rules (E7),
--         change_requests (E1), change_request_items (E2), change_request_approvals (E4).
-- The E5 catalog replaces the audited hardcoded LOW/HIGH sensitivity ternary: the P01 stage of a
-- change request is chosen from the catalog entry of the changed field + the ACTIVE matrix rule.
-- SoD (assigned_to <> requested_by) is enforced in the G02 service decision path (ERR-G02-SOD);
-- the frozen model additionally notes a platform trigger (cross-table, not a single-row CHECK).
-- Subset notes: FKs to tables outside this subset (change_request_templates,
-- bulk_correction_batches, esignatures, pii_tiers deferred columns) are omitted, mirroring the
-- 0002/0003 faithful-subset approach. Frozen enum VALUES are reproduced verbatim.

-- SECTION 1 — ENUM TYPES (module-unique closed enumerations; g02_ prefix)
-- =====================================================================================













-- SECTION 2 — CONFIGURATION TABLES (created first; referenced by the transactional set)
-- =====================================================================================

-- E5 — field_sensitivity_catalog (versioned config; replaces the hardcoded sensitivity ternary)
CREATE TABLE field_sensitivity_catalog (
    id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       text REFERENCES entities(id) ON DELETE RESTRICT,        -- null = tenant default
    field_key       varchar(80) NOT NULL,                                   -- G02 catalog key
    m01_field_key   varchar(120) NOT NULL,                                  -- canonical G01/M01 path
    is_composite    boolean NOT NULL DEFAULT false,
    display_label   varchar(120) NOT NULL,
    field_group     text NOT NULL,
    sensitivity     text NOT NULL,                               -- G02 approval-routing axis
    rbac_field_access text,
    is_auth_bearing boolean NOT NULL DEFAULT false,
    notify_old_value boolean NOT NULL DEFAULT false,
    requires_document boolean NOT NULL DEFAULT false,
    self_service_editable boolean NOT NULL DEFAULT true,
    validation_ref  varchar(60),
    version         integer NOT NULL DEFAULT 1,                             -- config version (cascade + pinning)
    effective_from  date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_fsc_key_version UNIQUE (tenant_id, field_key, version),
    CONSTRAINT ck_fsc_authbearing CHECK (NOT is_auth_bearing OR sensitivity IN ('MEDIUM','HIGH','STATUTORY'))
);
CREATE INDEX ix_fsc_tenant       ON field_sensitivity_catalog(tenant_id);
CREATE INDEX ix_fsc_entity       ON field_sensitivity_catalog(entity_id);
CREATE INDEX ix_fsc_field_key    ON field_sensitivity_catalog(tenant_id, field_key);
CREATE INDEX ix_fsc_sensitivity  ON field_sensitivity_catalog(sensitivity);
COMMENT ON TABLE field_sensitivity_catalog IS 'G02 E5. Versioned per-field sensitivity/route config. Drives P01 route selection; replaces the PH-07 hardcoded LOW/HIGH ternary.';

-- E6 — approval_matrix_config (versioned; bound to a W.1 P01 flow) ----------------------
CREATE TABLE approval_matrix_config (
    id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,             -- matrix_id
    tenant_id       text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       text REFERENCES entities(id) ON DELETE RESTRICT,        -- null = tenant default
    name            varchar(120) NOT NULL,
    workflow_code   varchar(60),                                            -- bound P01 workflow_code (W.1)
    status          text NOT NULL DEFAULT 'DRAFT',
    version         integer NOT NULL DEFAULT 1,                             -- in-flight instances pin their version (P01)
    effective_from  date NOT NULL DEFAULT CURRENT_DATE,
    effective_to    date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_amc_name_version UNIQUE (tenant_id, name, version)
);
CREATE INDEX ix_amc_tenant   ON approval_matrix_config(tenant_id);
CREATE INDEX ix_amc_entity   ON approval_matrix_config(entity_id);
CREATE INDEX ix_amc_status   ON approval_matrix_config(status);
COMMENT ON TABLE approval_matrix_config IS 'G02 E6. Versioned approval matrix consumed when the change-request workflow starts.';

-- E7 — approval_matrix_rules (per sensitivity x scope route -> P01 stage) ---------------
CREATE TABLE approval_matrix_rules (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,          -- rule_id
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text REFERENCES entities(id) ON DELETE RESTRICT,
    matrix_id          text NOT NULL REFERENCES approval_matrix_config(id) ON DELETE CASCADE,
    sensitivity        text NOT NULL,
    field_group        text,                                     -- optional override
    field_key          varchar(80),                                         -- precedence: field_key > field_group > sensitivity
    change_type        text,
    employment_status_scope varchar(40),
    level_no           smallint NOT NULL,                                   -- P01 stage sequence
    node_type          text NOT NULL,
    topology           text NOT NULL DEFAULT 'SEQUENTIAL',
    required_role      varchar(60) NOT NULL,                                -- RBAC role key / capability flag
    sla_hours          integer NOT NULL DEFAULT 48,
    escalation_role    varchar(60),
    auto_apply_on_low  boolean NOT NULL DEFAULT false,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_amr_sla_positive CHECK (sla_hours > 0)
);
CREATE INDEX ix_amr_tenant      ON approval_matrix_rules(tenant_id);
CREATE INDEX ix_amr_matrix      ON approval_matrix_rules(matrix_id);
CREATE INDEX ix_amr_sensitivity ON approval_matrix_rules(sensitivity);
CREATE INDEX ix_amr_field_key   ON approval_matrix_rules(field_key);

-- SECTION 3 — TRANSACTIONAL SET (header, per-field items, approval ledger)
-- =====================================================================================

-- E1 — change_requests (header = subject of one P01 workflow_instance) ------------------
CREATE TABLE change_requests (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,          -- change_request_id (P01 subject_ref)
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    cr_number          varchar(24) NOT NULL,                                -- tenant-unique
    target_employee_id text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    requested_by       text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- maker (SoD anchor)
    request_origin     text NOT NULL DEFAULT 'SELF_SERVICE',
    change_type        text NOT NULL DEFAULT 'UPDATE',
    highest_sensitivity text NOT NULL,                           -- MAX across items
    status             text NOT NULL DEFAULT 'DRAFT',
    employment_status_at_submit varchar(20),
    effective_date     date,
    reason             varchar(1000),
    workflow_instance_id text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    sla_due_at         timestamptz,
    submitted_at       timestamptz,
    decided_at         timestamptz,
    committed_at       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_cr_number UNIQUE (tenant_id, cr_number)
);
CREATE INDEX ix_cr_tenant       ON change_requests(tenant_id);
CREATE INDEX ix_cr_entity       ON change_requests(entity_id);
CREATE INDEX ix_cr_target_emp   ON change_requests(target_employee_id);
CREATE INDEX ix_cr_requested_by ON change_requests(requested_by);
CREATE INDEX ix_cr_status       ON change_requests(status);
CREATE INDEX ix_cr_wfi          ON change_requests(workflow_instance_id);
COMMENT ON TABLE change_requests IS 'G02 E1. Header for a change request = subject of one P01 workflow_instance. Soft-delete.';

-- E2 — change_request_items (per-field before/after diff lines) -------------------------
CREATE TABLE change_request_items (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  text NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    field_key          varchar(80) NOT NULL,                                -- catalog key (resolved to fsc)
    m01_field_key      varchar(120) NOT NULL,
    parent_item_id     text REFERENCES change_request_items(id) ON DELETE SET NULL,
    old_value          text,
    new_value          text,
    clear_intent       boolean NOT NULL DEFAULT false,
    old_value_hash     char(64),
    value_datatype     text NOT NULL DEFAULT 'STRING',
    sensitivity        text NOT NULL,
    requires_document  boolean NOT NULL DEFAULT false,
    item_status        text NOT NULL DEFAULT 'PENDING',
    commit_idempotency_key varchar(80),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_cri_clear_intent CHECK (new_value IS NOT NULL OR clear_intent = true),
    CONSTRAINT uq_cri_commit_idem UNIQUE (tenant_id, commit_idempotency_key)
);
CREATE INDEX ix_cri_tenant    ON change_request_items(tenant_id);
CREATE INDEX ix_cri_cr        ON change_request_items(change_request_id);
CREATE INDEX ix_cri_field_key ON change_request_items(tenant_id, field_key);
CREATE INDEX ix_cri_status    ON change_request_items(item_status);
COMMENT ON TABLE change_request_items IS 'G02 E2. Per-field diff line; feeds the P02-masked GET /change-requests/{id}/diff payload.';

-- E4 — change_request_approvals (append-only per-node decision ledger) ------------------
CREATE TABLE change_request_approvals (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  text NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    workflow_action_id text REFERENCES workflow_actions(id) ON DELETE SET NULL,  -- subset: nullable (frozen model: NOT NULL, one row per P01 action)
    level_no           smallint NOT NULL,
    node_type          text NOT NULL,
    topology           text NOT NULL DEFAULT 'SEQUENTIAL',
    required_role      varchar(60) NOT NULL,
    assigned_to        text REFERENCES users(id) ON DELETE SET NULL,
    delegated_from     text REFERENCES users(id) ON DELETE SET NULL,
    decision           text NOT NULL DEFAULT 'PENDING',
    decision_comment   varchar(1000),                                       -- mandatory on REJECT/RETURN (VAL-COMMENT/ERR-REASON-REQ)
    acted_at           timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text
    -- SoD (assigned_to <> requested_by, <> target.user_id) is enforced by P01/P02 + the G02
    -- service decision path (ERR-G02-SOD); cannot be a single-row CHECK here (BRD §5.6 rule 1).
);
CREATE INDEX ix_cra_tenant   ON change_request_approvals(tenant_id);
CREATE INDEX ix_cra_cr       ON change_request_approvals(change_request_id);
CREATE INDEX ix_cra_assigned ON change_request_approvals(assigned_to);
CREATE INDEX ix_cra_decision ON change_request_approvals(decision);
COMMENT ON TABLE change_request_approvals IS 'G02 E4. Append-only per-node approval; decision_comment mandatory on REJECT/RETURN.';
