-- =====================================================================================
-- GOVERNMENT HRMS — G02 EMPLOYEE PERSONAL-DETAILS MODIFICATION WORKFLOW (02-G02-...sql)
-- =====================================================================================
-- Module-owned schema for G02-EPDM (BRD docs/brd/v3/G02-personal-details-modification-
-- workflow.md). The governed change-control configuration in front of the G01 employee
-- master. Self-service / HR-on-behalf change requests for `E·AR` sensitive fields run as
-- CONFIGURED P01 workflow instances (the change_request is the workflow subject), with
-- maker-checker SoD by P01/P02, P05 tamper-evident audit, G13 evidence, X.1/X.2/X.3
-- infrastructure, and a closed-loop downstream retro reconciliation.
--
-- =====================================================================================
-- RECON (prototype) — 2026-07-01. Reconciled against PrimeSoft prototype change-request /
--   self-service screens (sensitive-changes FR-M01-003, edit-profile FR-M01-008, approvals,
--   notifications, tasks). All change-request DATA (field changed, old/new value, proof doc,
--   approval status, SLA) already mapped to existing tables. ONE genuine gap added:
--   field_sensitivity_catalog.pii_tier_id -> platform pii_tiers, because the sensitive-changes
--   review screen renders and groups requests by "PII Tier 1 / PII Tier 2" — a DPDPA PII-tier
--   axis distinct from G02's approval-routing `sensitivity`. Directory visibility toggles on
--   edit-profile ("Mobile visibility", "Share birthday with my team") are G01-owned
--   (g01_field_visibility / employee_contacts.visibility) and intentionally NOT added here.
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- LOAD ORDER. Run AFTER 00-platform-core.sql (and, in a full build, after 01-G01.sql).
--   This file FKs to core tables only (Section "FK targets" below). It NEVER redefines a
--   core table. The G01 satellite tables named by `m01_field_key` (e.g.
--   employee_contacts, employee_bank_accounts, employee_addresses) are referenced as TEXT
--   path strings only — G02 stores proposed values, never the master columns (BRD §4.3.1).
--
-- FK targets (all in 00-platform-core.sql):
--   tenants, entities, employees, users, org_units, workflow_instances, workflow_actions,
--   documents. (Audit -> audit_log/security_audit_log via the platform DB trigger, not an
--   app FK. SR ledger -> service_register_events is READ-ONLY for status; G02 never writes
--   it: G01 posts identity/personal-data SR events on commit, BRD §1.1/§4.3.4.)
--
-- TABLE COUNT: 18 module-owned tables (E1-E17, E19; E18 cr_audit_chain REMOVED -> re-grounded
--   to P05 dual-log + OPEN-PLAT-03, BRD §5.1). G02 defines NO audit table.
--
-- LEDGER vs BUSINESS (CONVENTIONS §3):
--   * Append-only ledgers (created_at/created_by only; NO updated_at, NO is_deleted; no
--     UPDATE/DELETE grant — immutability enforced by platform grants/triggers, P05):
--       change_request_approvals (E4), esignatures (E10), cr_sla_events (E11),
--       cr_risk_signals (E13), data_subject_notices (E15), cr_reversals (E17),
--       cr_step_up_events (E19).
--   * retro_impact_events (E14) is an append-only TRACKER whose delivery status is a
--     mutated projection (PENDING->SENT->ACKED/FAILED, attempts, last_error). The BRD field
--     table grants it created_at + updated_at; it is never soft-deleted (no is_deleted).
--     This mirrors how the core SR ledger materialises derived status projections.
--   * All other tables are soft-delete business tables (full audit cols + is_deleted).
--   Status-bearing fields on append-only ledgers (approvals.decision, notices.outcome,
--   risk_signals.review_outcome, reversals.m01_revert_status) are mutated in place by the
--   owning platform runtime (P01/X.1/X.2); the append-only contract is "no row ever deleted,
--   full who/what/when reconstructed from P05 audit_log", not "no column ever changes".
--
-- ENUMS. Module-unique CLOSED enumerations are Postgres types prefixed `g02_`
--   (UPPER_SNAKE_CASE values) so they never collide with core or sibling modules
--   (CONVENTIONS §4). Core enums are REUSED where applicable (scan_status). Tenant-
--   configurable value sets (doc_type, required_doc_types) stay TEXT/JSONB, validated by
--   VAL-* (CONVENTIONS §4), not Postgres enums.
--
-- CATALOG BINDING. field_sensitivity_catalog is a uuid-PK, tenant-scoped, VERSIONED config
--   table (UNIQUE(tenant_id, field_key, version)). Because the catalog is versioned,
--   change_request_items.field_key is carried as the resolved catalog TEXT key (indexed) and
--   resolved at the data layer by (tenant_id, field_key) — a single-row FK is intentionally
--   not declared against a versioned key (CONVENTIONS §1/§5; BRD §3.2 cascade + in-flight
--   pinning). FK integrity for everything else (rule 8) is enforced explicitly below.
--
-- RLS. Every table is tenant-scoped; the canonical tenant_isolation policy (CONVENTIONS §6)
--   is applied to all 18 via the DO-block at the end. Append-only ledgers are RLS-scoped for
--   read isolation; their immutability is a separate grant/trigger concern (P05).
--
-- CORE-TABLE ASSUMPTIONS (verify before a full run):
--   * employees(id), users(id), org_units(id), entities(id), tenants(id),
--     workflow_instances(id), workflow_actions(id), documents(id) exist as in 00-core.
--   * Core seed provides tenant 1111…1111 and entity 2222…2201 and employees 9999…9901/02;
--     core does NOT seed users/workflows/documents, so the sample block below seeds the
--     minimal core prerequisites (users, one workflow + instances + actions, documents)
--     under the platform-admin GUC so the G02 samples are self-contained and FK-valid.
--   * scan_status (core enum) is reused for change_request_documents.scan_status.
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — MODULE ENUM TYPES (g02_*; UPPER_SNAKE_CASE)
-- =====================================================================================
CREATE TYPE g02_request_origin            AS ENUM ('SELF_SERVICE','HR_ON_BEHALF','BULK','REVERSAL');
CREATE TYPE g02_change_type               AS ENUM ('UPDATE','CORRECTION','REVERSAL');
CREATE TYPE g02_sensitivity               AS ENUM ('LOW','MEDIUM','HIGH','STATUTORY');
CREATE TYPE g02_risk_band                 AS ENUM ('LOW','MEDIUM','HIGH','BLOCKED');
CREATE TYPE g02_cr_status                 AS ENUM ('DRAFT','SUBMITTED','PENDING_DOCS','IN_REVIEW','NOTICE_HOLD',
                                                   'OBJECTED','RETURNED','APPROVED','REJECTED','WITHDRAWN',
                                                   'COMMITTED','PARTIALLY_COMMITTED','COMMIT_FAILED','REVERSED','CANCELLED');
CREATE TYPE g02_value_datatype            AS ENUM ('STRING','DATE','NUMBER','ENUM','BOOLEAN','JSON');
CREATE TYPE g02_item_status               AS ENUM ('PENDING','APPROVED','REJECTED','COMMITTED','FAILED','REVERSED');
CREATE TYPE g02_sr_posting_status         AS ENUM ('NOT_REQUIRED','PENDING','POSTED','FAILED');
CREATE TYPE g02_retro_status              AS ENUM ('NOT_REQUIRED','PENDING','ACKED','FAILED');
CREATE TYPE g02_doc_verification_status   AS ENUM ('UNVERIFIED','VERIFIED','REJECTED');
CREATE TYPE g02_authority_verif_status    AS ENUM ('NOT_REQUIRED','PENDING','VERIFIED','FAILED');
CREATE TYPE g02_rbac_field_access         AS ENUM ('V','M','H','E','AR');
CREATE TYPE g02_field_group               AS ENUM ('DEMOGRAPHIC','CONTACT','FINANCIAL','IDENTITY','QUALIFICATION');
CREATE TYPE g02_node_type                 AS ENUM ('RECOMMEND','APPROVE','SANCTION','VERIFY');
CREATE TYPE g02_topology                  AS ENUM ('SEQUENTIAL','PARALLEL_ALL_OF','PARALLEL_ANY_OF');
CREATE TYPE g02_decision                  AS ENUM ('PENDING','APPROVED','REJECTED','RETURNED','SKIPPED');
CREATE TYPE g02_matrix_status             AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE g02_delegation_status         AS ENUM ('ACTIVE','REVOKED','EXPIRED');
CREATE TYPE g02_sign_method               AS ENUM ('OTP','PKI_DSC','AADHAAR_ESIGN');   -- PASSWORD_REAUTH removed (R1)
CREATE TYPE g02_sla_event_type            AS ENUM ('SLA_SET','REMINDER_SENT','BREACHED','ESCALATED','REASSIGNED');
CREATE TYPE g02_bulk_status               AS ENUM ('UPLOADED','VALIDATED','PENDING_APPROVAL','APPROVED','REJECTED',
                                                   'COMMITTED','PARTIAL_FAILED');
CREATE TYPE g02_risk_signal_type          AS ENUM ('DUPLICATE_BANK_ACCOUNT','PRE_PAYROLL_CUTOFF','PRE_SEPARATION_WINDOW',
                                                   'DEVICE_VELOCITY','MULTI_EMPLOYEE_SAME_DEVICE',
                                                   'AUTH_CHANNEL_THEN_FINANCIAL','OFF_HOURS_BURST');
CREATE TYPE g02_risk_severity             AS ENUM ('INFO','WARN','HIGH','BLOCK');
CREATE TYPE g02_risk_review_outcome       AS ENUM ('CLEARED','CONFIRMED_FRAUD','ESCALATED');
CREATE TYPE g02_retro_target_module       AS ENUM ('G10','G11','G06');
CREATE TYPE g02_retro_event_status        AS ENUM ('PENDING','SENT','ACKED','FAILED','DEAD_LETTER');
CREATE TYPE g02_notice_trigger_origin     AS ENUM ('HR_ON_BEHALF','BULK');
CREATE TYPE g02_notice_channel            AS ENUM ('EMAIL','SMS','POSTAL','IN_APP');
CREATE TYPE g02_notice_delivery_status    AS ENUM ('PENDING','DELIVERED','FAILED');
CREATE TYPE g02_notice_outcome            AS ENUM ('AWAITING','CONFIRMED','OBJECTED','WINDOW_ELAPSED');
CREATE TYPE g02_objection_type            AS ENUM ('UNAUTHORISED_CHANGE','INCORRECT_VALUE','PRIVACY','OTHER');
CREATE TYPE g02_objection_status          AS ENUM ('OPEN','UNDER_REVIEW','UPHELD','DISMISSED','RESOLVED');
CREATE TYPE g02_objection_effect          AS ENUM ('PAUSE','REVERSAL_REQUESTED');
CREATE TYPE g02_revert_status             AS ENUM ('PENDING','APPLIED','FAILED');
CREATE TYPE g02_step_up_method            AS ENUM ('MFA_TOTP','MFA_PUSH','WEBAUTHN','OTP_SMS');
CREATE TYPE g02_step_up_result            AS ENUM ('SUCCESS','FAILED');


-- =====================================================================================
-- SECTION 2 — CONFIGURATION TABLES (created first; referenced by the transactional set)
-- =====================================================================================

-- E5 — field_sensitivity_catalog (versioned config; cascades platform->tenant->entity) ---
CREATE TABLE field_sensitivity_catalog (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,        -- null = tenant default (cascade override)
    field_key       varchar(80) NOT NULL,                                   -- G02 catalog key
    m01_field_key   varchar(120) NOT NULL,                                  -- canonical G01/M01 path (§5.8)
    is_composite    boolean NOT NULL DEFAULT false,                         -- true for `name`
    display_label   varchar(120) NOT NULL,
    field_group     g02_field_group NOT NULL,                              -- taxonomy only (excludes STATUTORY)
    sensitivity     g02_sensitivity NOT NULL,                              -- G02 approval-routing axis
    pii_tier_id     uuid REFERENCES pii_tiers(id) ON DELETE RESTRICT,      -- RECON: DPDPA PII tier (TIER_1/2/3/NON_PII); sensitive-changes screen groups by this
    rbac_field_access g02_rbac_field_access,                               -- V/M/H/E/AR (RBAC §7)
    is_auth_bearing boolean NOT NULL DEFAULT false,                         -- phone/email -> >=MEDIUM (R1)
    notify_old_value boolean NOT NULL DEFAULT false,                        -- anti-takeover (R1)
    requires_document boolean NOT NULL DEFAULT false,
    required_doc_types jsonb,
    requires_authority_portal_verification boolean NOT NULL DEFAULT false,  -- caste/Aadhaar/PAN (R5/R12)
    requires_esignature boolean NOT NULL DEFAULT false,
    allowed_esign_methods jsonb,                                            -- VAL-G02-ESIGN-METHOD
    tokenize_in_vault boolean NOT NULL DEFAULT false,                       -- Aadhaar/PAN (R18)
    self_service_editable boolean NOT NULL DEFAULT true,                    -- false for Aadhaar/PAN/category (R5)
    hard_block_rule_ref varchar(80),                                        -- e.g. DOB_PRE_RETIREMENT_BAR (R11)
    evidence_path   varchar(60),                                            -- GAZETTE/AUTHORITY_PORTAL/COURT_ORDER/MEDICAL_DIGNITY
    post_to_sr      boolean NOT NULL DEFAULT false,                         -- STATUTORY -> G01 posts SR (G02 not a writer)
    sr_event_type   varchar(60),                                            -- G12 event_type (VAL-G12-SREVENT)
    retro_targets   jsonb,                                                  -- e.g. ["G10","G11","G06"]
    validation_ref  varchar(60),                                           -- cited VAL-* id
    validation_regex varchar(300),                                         -- module-unique; ReDoS-guarded (VAL-G02-REGEXSAFE)
    version         integer NOT NULL DEFAULT 1,                            -- config version (cascade + pinning)
    effective_from  date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_fsc_key_version UNIQUE (tenant_id, field_key, version),
    -- R1: auth-bearing fields must be at least MEDIUM (VAL-G02-AUTHBEAR):
    CONSTRAINT ck_fsc_authbearing CHECK (NOT is_auth_bearing OR sensitivity IN ('MEDIUM','HIGH','STATUTORY'))
);
CREATE INDEX ix_fsc_tenant       ON field_sensitivity_catalog(tenant_id);
CREATE INDEX ix_fsc_entity       ON field_sensitivity_catalog(entity_id);
CREATE INDEX ix_fsc_field_key    ON field_sensitivity_catalog(tenant_id, field_key);
CREATE INDEX ix_fsc_sensitivity  ON field_sensitivity_catalog(sensitivity);
CREATE INDEX ix_fsc_pii_tier     ON field_sensitivity_catalog(pii_tier_id);
COMMENT ON TABLE field_sensitivity_catalog IS 'G02 E5. Versioned per-field sensitivity/route config. Tenant-scoped; entity_id null = tenant default. Drives P01 route + E·AR rendering.';

-- E6 — approval_matrix_config (versioned; bound to a W.1 P01 flow) ----------------------
CREATE TABLE approval_matrix_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),             -- matrix_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid REFERENCES entities(id) ON DELETE RESTRICT,        -- null = tenant default
    name            varchar(120) NOT NULL,
    workflow_code   varchar(60),                                            -- bound P01 workflow_code (W.1)
    org_scope_id    uuid REFERENCES org_units(id) ON DELETE RESTRICT,       -- null = entity default
    status          g02_matrix_status NOT NULL DEFAULT 'DRAFT',
    version         integer NOT NULL DEFAULT 1,                            -- in-flight instances pin their version (P01)
    effective_from  date NOT NULL DEFAULT CURRENT_DATE,
    effective_to    date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_amc_name_version UNIQUE (tenant_id, name, version)
);
CREATE INDEX ix_amc_tenant   ON approval_matrix_config(tenant_id);
CREATE INDEX ix_amc_entity   ON approval_matrix_config(entity_id);
CREATE INDEX ix_amc_orgscope ON approval_matrix_config(org_scope_id);
CREATE INDEX ix_amc_status   ON approval_matrix_config(status);

-- E7 — approval_matrix_rules (per sensitivity x scope route -> P01 stage) ---------------
CREATE TABLE approval_matrix_rules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- rule_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    matrix_id          uuid NOT NULL REFERENCES approval_matrix_config(id) ON DELETE CASCADE,
    sensitivity        g02_sensitivity NOT NULL,
    field_group        g02_field_group,                                     -- optional override
    field_key          varchar(80),                                         -- precedence: field_key > field_group > sensitivity
    change_type        g02_change_type,                                     -- optional override
    employment_status_scope varchar(40),                                    -- elevated route for non-ACTIVE (FR-018)
    level_no           smallint NOT NULL,                                   -- P01 stage sequence
    node_type          g02_node_type NOT NULL,
    topology           g02_topology NOT NULL DEFAULT 'SEQUENTIAL',
    required_role      varchar(60) NOT NULL,                                -- RBAC role key / capability flag
    sla_hours          integer NOT NULL DEFAULT 48,                         -- P01 sla_definition per stage
    escalation_role    varchar(60),                                         -- P01 SLA breach target
    auto_apply_on_low  boolean NOT NULL DEFAULT false,                      -- FORCED false where is_auth_bearing (R1)
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_amr_sla_positive CHECK (sla_hours > 0)
);
CREATE INDEX ix_amr_tenant      ON approval_matrix_rules(tenant_id);
CREATE INDEX ix_amr_matrix      ON approval_matrix_rules(matrix_id);
CREATE INDEX ix_amr_sensitivity ON approval_matrix_rules(sensitivity);
CREATE INDEX ix_amr_field_key   ON approval_matrix_rules(field_key);

-- E9 — change_request_templates (W.2 forms) --------------------------------------------
CREATE TABLE change_request_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),             -- template_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    name            varchar(120) NOT NULL,
    w2_form_ref     varchar(60),                                            -- bound W.2 form id
    description     varchar(500),
    change_type     g02_change_type NOT NULL DEFAULT 'UPDATE',
    field_keys      jsonb NOT NULL,                                         -- pre-selected governed fields
    required_doc_types jsonb,
    instructions    text,
    org_scope_id    uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_crt_name UNIQUE (tenant_id, name)
);
CREATE INDEX ix_crt_tenant   ON change_request_templates(tenant_id);
CREATE INDEX ix_crt_entity   ON change_request_templates(entity_id);
CREATE INDEX ix_crt_orgscope ON change_request_templates(org_scope_id);

-- E8 — delegations (executed via P01 `delegate`; non-elevation verified by P02) --------
CREATE TABLE delegations (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- delegation_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    delegator_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    delegate_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    scope_org_unit_id  uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    node_types         jsonb,                                               -- which node types delegated
    delegate_holds_role_verified boolean NOT NULL DEFAULT false,            -- P02-verified (no elevation, R21)
    valid_from         timestamptz NOT NULL,
    valid_to           timestamptz NOT NULL,
    status             g02_delegation_status NOT NULL DEFAULT 'ACTIVE',
    reason             varchar(500),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_delegation_window CHECK (valid_to > valid_from),
    CONSTRAINT ck_delegation_distinct CHECK (delegator_user_id <> delegate_user_id)
);
CREATE INDEX ix_delegations_tenant    ON delegations(tenant_id);
CREATE INDEX ix_delegations_delegator ON delegations(delegator_user_id);
CREATE INDEX ix_delegations_delegate  ON delegations(delegate_user_id);
CREATE INDEX ix_delegations_orgunit   ON delegations(scope_org_unit_id);
CREATE INDEX ix_delegations_status    ON delegations(status);

-- E12 — bulk_correction_batches --------------------------------------------------------
CREATE TABLE bulk_correction_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),             -- bulk_batch_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_number    varchar(24) NOT NULL,                                   -- BLK-2026-0007
    initiated_by    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_file_ref varchar(200),                                           -- uploaded CSV/XLSX (G13)
    total_rows      integer NOT NULL DEFAULT 0,
    valid_rows      integer NOT NULL DEFAULT 0,
    invalid_rows    integer NOT NULL DEFAULT 0,
    status          g02_bulk_status NOT NULL DEFAULT 'UPLOADED',
    dry_run_report_ref varchar(200),
    reason          varchar(1000),
    approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_bcb_number UNIQUE (tenant_id, batch_number),
    CONSTRAINT ck_bcb_rowcounts CHECK (total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0)
);
CREATE INDEX ix_bcb_tenant    ON bulk_correction_batches(tenant_id);
CREATE INDEX ix_bcb_entity    ON bulk_correction_batches(entity_id);
CREATE INDEX ix_bcb_initiator ON bulk_correction_batches(initiated_by);
CREATE INDEX ix_bcb_status    ON bulk_correction_batches(status);


-- =====================================================================================
-- SECTION 3 — TRANSACTIONAL CORE (change_requests + items)
-- =====================================================================================

-- E1 — change_requests (subject of one P01 instance) -----------------------------------
CREATE TABLE change_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- change_request_id (P01 subject_ref)
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    cr_number          varchar(24) NOT NULL,                                -- CR-2026-000123 (tenant-unique)
    target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- whose record changes
    requested_by       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,      -- maker (self or HR-on-behalf)
    request_origin     g02_request_origin NOT NULL DEFAULT 'SELF_SERVICE',
    change_type        g02_change_type NOT NULL DEFAULT 'UPDATE',
    highest_sensitivity g02_sensitivity NOT NULL,                           -- MAX across items (rule 7)
    status             g02_cr_status NOT NULL DEFAULT 'DRAFT',
    employment_status_at_submit varchar(20),                                -- snapshot of G01 employment_status (FR-018)
    risk_score         smallint,                                            -- 0-100 (FR-019)
    risk_band          g02_risk_band,
    parent_reversal_id uuid,                                                -- -> cr_reversals (deferred FK below)
    effective_date     date,                                               -- effective_from for staged G01 write (VAL-EFFECTIVE)
    reason             varchar(1000),
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- bound on submit (P01)
    template_id        uuid REFERENCES change_request_templates(id) ON DELETE SET NULL,
    bulk_batch_id      uuid REFERENCES bulk_correction_batches(id) ON DELETE SET NULL,
    step_up_event_id   uuid,                                                -- -> cr_step_up_events (deferred FK below)
    sla_due_at         timestamptz,                                         -- mirror of current P01 stage SLA deadline
    submitted_at       timestamptz,
    decided_at         timestamptz,
    committed_at       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_cr_number UNIQUE (tenant_id, cr_number),
    CONSTRAINT ck_cr_risk_score CHECK (risk_score IS NULL OR (risk_score BETWEEN 0 AND 100))
);
CREATE INDEX ix_cr_tenant     ON change_requests(tenant_id);
CREATE INDEX ix_cr_entity     ON change_requests(entity_id);
CREATE INDEX ix_cr_target_emp ON change_requests(target_employee_id);
CREATE INDEX ix_cr_requested_by ON change_requests(requested_by);
CREATE INDEX ix_cr_status     ON change_requests(status);
CREATE INDEX ix_cr_wfi        ON change_requests(workflow_instance_id);
CREATE INDEX ix_cr_template   ON change_requests(template_id);
CREATE INDEX ix_cr_bulk_batch ON change_requests(bulk_batch_id);
CREATE INDEX ix_cr_sla_due    ON change_requests(sla_due_at) WHERE status NOT IN ('COMMITTED','REJECTED','WITHDRAWN','CANCELLED','REVERSED');
COMMENT ON TABLE change_requests IS 'G02 E1. Header for a change request = subject of one P01 workflow_instance. Soft-delete.';

-- E2 — change_request_items (per-field before/after diff lines) -------------------------
CREATE TABLE change_request_items (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- change_request_item_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    field_key          varchar(80) NOT NULL,                                -- catalog key (resolved to fsc at data layer)
    m01_field_key      varchar(120) NOT NULL,                               -- canonical G01/M01 path (§5.8)
    parent_item_id     uuid REFERENCES change_request_items(id) ON DELETE SET NULL,  -- composite name sub-items
    old_value          text,                                                -- encrypted snapshot at submit
    new_value          text,                                                -- encrypted; null only with clear_intent
    clear_intent       boolean NOT NULL DEFAULT false,                      -- explicit clear/remove
    old_value_hash     char(64),                                            -- SHA-256 stale-detection (VAL-G02-STALEHASH)
    vault_token_ref    varchar(120),                                        -- Aadhaar/PAN data-vault token (R18)
    value_datatype     g02_value_datatype NOT NULL DEFAULT 'STRING',
    sensitivity        g02_sensitivity NOT NULL,
    requires_document  boolean NOT NULL DEFAULT false,
    requires_authority_portal_verification boolean NOT NULL DEFAULT false,
    item_status        g02_item_status NOT NULL DEFAULT 'PENDING',
    commit_idempotency_key varchar(80),                                     -- = item id; single commit
    sr_posting_status  g02_sr_posting_status,                              -- observed status of G01-posted SR event
    retro_status       g02_retro_status,                                   -- FR-022
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false,
    -- R19: permit legitimate field clearing (VAL-G02-CLEARINTENT):
    CONSTRAINT ck_cri_clear_intent CHECK (new_value IS NOT NULL OR clear_intent = true),
    CONSTRAINT uq_cri_commit_idem UNIQUE (tenant_id, commit_idempotency_key)
);
CREATE INDEX ix_cri_tenant    ON change_request_items(tenant_id);
CREATE INDEX ix_cri_entity    ON change_request_items(entity_id);
CREATE INDEX ix_cri_cr        ON change_request_items(change_request_id);
CREATE INDEX ix_cri_field_key ON change_request_items(tenant_id, field_key);
CREATE INDEX ix_cri_parent    ON change_request_items(parent_item_id);
CREATE INDEX ix_cri_status    ON change_request_items(item_status);
COMMENT ON TABLE change_request_items IS 'G02 E2. Per-field diff; composite name expands to first/middle/last via parent_item_id. Sensitive values encrypted; Aadhaar/PAN as vault_token_ref only.';


-- =====================================================================================
-- SECTION 4 — APPROVAL, EVIDENCE & SIGNATURE (append-only ledgers + evidence)
-- =====================================================================================

-- E10 — esignatures (APPEND-ONLY; hash-chained per OPEN-PLAT-03) ------------------------
CREATE TABLE esignatures (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- esignature_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    signer_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sign_method        g02_sign_method NOT NULL,                            -- OTP forbidden for FINANCIAL/STATUTORY (rule 5)
    signed_payload_hash char(64) NOT NULL,                                  -- SHA-256 of signed approval payload
    prev_chain_hash    char(64),                                            -- hash-chain link
    chain_hash         char(64) NOT NULL,                                   -- OPEN-PLAT-03 tamper-evidence (chain head -> WORM)
    signature_blob_ref varchar(200),                                        -- PKI/DSC artefact ref (G13)
    signed_at          timestamptz NOT NULL DEFAULT now(),
    ip_address         varchar(45),
    user_agent         varchar(400),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    CONSTRAINT ck_esig_hash_len CHECK (length(chain_hash) = 64 AND length(signed_payload_hash) = 64)
);
CREATE INDEX ix_esig_tenant ON esignatures(tenant_id);
CREATE INDEX ix_esig_cr     ON esignatures(change_request_id);
CREATE INDEX ix_esig_signer ON esignatures(signer_user_id);
COMMENT ON TABLE esignatures IS 'G02 E10. Append-only legal-signature ledger; own hash-chain aligned to OPEN-PLAT-03. No UPDATE/DELETE grant.';

-- E4 — change_request_approvals (APPEND-ONLY; keyed to P01 workflow_actions) ------------
CREATE TABLE change_request_approvals (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- approval_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    workflow_action_id uuid NOT NULL REFERENCES workflow_actions(id) ON DELETE RESTRICT,  -- one row per P01 action
    level_no           smallint NOT NULL,                                   -- 1..n (P01 stage order)
    node_type          g02_node_type NOT NULL,
    topology           g02_topology NOT NULL DEFAULT 'SEQUENTIAL',
    required_role      varchar(60) NOT NULL,
    assigned_to        uuid REFERENCES users(id) ON DELETE SET NULL,        -- resolved assignee / P01 delegate
    delegated_from     uuid REFERENCES users(id) ON DELETE SET NULL,
    decision           g02_decision NOT NULL DEFAULT 'PENDING',
    decision_comment   varchar(1000),                                       -- mandatory on REJECT/RETURN (VAL-COMMENT)
    esignature_id      uuid REFERENCES esignatures(id) ON DELETE RESTRICT,  -- required for HIGH-financial/STATUTORY
    acted_at           timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
    -- SoD (assigned_to <> requested_by, <> target.user_id) is enforced by P01/P02 + a platform
    -- trigger (cross-table); cannot be a single-row CHECK here (BRD §5.6 rule 1; VAL-G02-SOD).
);
CREATE INDEX ix_cra_tenant   ON change_request_approvals(tenant_id);
CREATE INDEX ix_cra_cr       ON change_request_approvals(change_request_id);
CREATE INDEX ix_cra_wfaction ON change_request_approvals(workflow_action_id);
CREATE INDEX ix_cra_assigned ON change_request_approvals(assigned_to);
CREATE INDEX ix_cra_esig     ON change_request_approvals(esignature_id);
CREATE INDEX ix_cra_decision ON change_request_approvals(decision);
COMMENT ON TABLE change_request_approvals IS 'G02 E4. Append-only per-node approval; keyed to P01 workflow_actions. decision mutated in place by P01; history via P05.';

-- E3 — change_request_documents (evidence links to G13 documents) ----------------------
CREATE TABLE change_request_documents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- cr_document_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    change_request_item_id uuid REFERENCES change_request_items(id) ON DELETE SET NULL,  -- null = whole request
    document_id        uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,        -- G13 reference (VAL-FILE)
    doc_type           varchar(60) NOT NULL,                                -- PASSPORT/GAZETTE_NOTIFICATION/... (tenant value set)
    verification_status g02_doc_verification_status NOT NULL DEFAULT 'UNVERIFIED',
    authority_portal_ref varchar(200),                                      -- external portal verification ref (X.3)
    authority_verification_status g02_authority_verif_status,
    verified_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    verified_at        timestamptz,
    scan_status        scan_status NOT NULL DEFAULT 'PENDING',              -- REUSE core enum (G13 antivirus)
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_crd_tenant   ON change_request_documents(tenant_id);
CREATE INDEX ix_crd_cr       ON change_request_documents(change_request_id);
CREATE INDEX ix_crd_item     ON change_request_documents(change_request_item_id);
CREATE INDEX ix_crd_document ON change_request_documents(document_id);
CREATE INDEX ix_crd_verif    ON change_request_documents(verification_status);


-- =====================================================================================
-- SECTION 5 — RUNTIME LEDGERS (SLA, risk, retro, notices, objections, reversals, step-up)
-- =====================================================================================

-- E11 — cr_sla_events (APPEND-ONLY; mirrors P01 SLA runtime) ----------------------------
CREATE TABLE cr_sla_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- sla_event_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    workflow_action_id uuid REFERENCES workflow_actions(id) ON DELETE SET NULL,
    event_type         g02_sla_event_type NOT NULL,                         -- emitted by P01 SLA runtime / JOB-G02-SLA
    due_at             timestamptz,
    triggered_at       timestamptz NOT NULL DEFAULT now(),
    escalated_to       uuid REFERENCES users(id) ON DELETE SET NULL,
    detail             varchar(500),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
);
CREATE INDEX ix_crsla_tenant ON cr_sla_events(tenant_id);
CREATE INDEX ix_crsla_cr     ON cr_sla_events(change_request_id);
CREATE INDEX ix_crsla_action ON cr_sla_events(workflow_action_id);
CREATE INDEX ix_crsla_type   ON cr_sla_events(event_type);

-- E13 — cr_risk_signals (APPEND-ONLY; FR-019) ------------------------------------------
CREATE TABLE cr_risk_signals (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- risk_signal_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    signal_type        g02_risk_signal_type NOT NULL,
    severity           g02_risk_severity NOT NULL,
    score_contribution smallint NOT NULL DEFAULT 0,
    detail             jsonb,                                               -- evidence (matching employee_ids for mule)
    detected_at        timestamptz NOT NULL DEFAULT now(),
    reviewed_by        uuid REFERENCES users(id) ON DELETE SET NULL,        -- Fraud Reviewer (capability flag)
    review_outcome     g02_risk_review_outcome,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
);
CREATE INDEX ix_crrisk_tenant ON cr_risk_signals(tenant_id);
CREATE INDEX ix_crrisk_cr     ON cr_risk_signals(change_request_id);
CREATE INDEX ix_crrisk_type   ON cr_risk_signals(signal_type);
CREATE INDEX ix_crrisk_sev    ON cr_risk_signals(severity);

-- E14 — retro_impact_events (APPEND-ONLY TRACKER; status mutates; FR-022) --------------
CREATE TABLE retro_impact_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- retro_event_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_item_id uuid NOT NULL REFERENCES change_request_items(id) ON DELETE RESTRICT,
    target_module      g02_retro_target_module NOT NULL,
    idempotency_key    varchar(100) NOT NULL,                               -- = item_id + ':RETRO:' + target_module
    effective_date     date NOT NULL,                                       -- drives recomputation period
    payload            jsonb NOT NULL,                                      -- field, old/new (masked), effective_date, change_type
    status             g02_retro_event_status NOT NULL DEFAULT 'PENDING',   -- X.1 backoff x3 -> DLQ
    ack_reference      varchar(120),                                        -- downstream ack/recompute job id
    attempts           smallint NOT NULL DEFAULT 0,
    last_error         varchar(500),
    acked_at           timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_retro_idem UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX ix_retro_tenant ON retro_impact_events(tenant_id);
CREATE INDEX ix_retro_item   ON retro_impact_events(change_request_item_id);
CREATE INDEX ix_retro_module ON retro_impact_events(target_module);
CREATE INDEX ix_retro_status ON retro_impact_events(status);
COMMENT ON TABLE retro_impact_events IS 'G02 E14. Append-only retro tracker; delivery status is a mutated projection (PENDING->SENT->ACKED/FAILED). Never soft-deleted.';

-- E16 — cr_objections (created before notices: notices.objection_id -> here; FR-021) ----
CREATE TABLE cr_objections (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- objection_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid REFERENCES change_requests(id) ON DELETE SET NULL,  -- null = objecting to a committed change
    raised_by          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,   -- data subject
    objection_type     g02_objection_type NOT NULL,
    description        varchar(1000) NOT NULL,                              -- VAL-COMMENT
    status             g02_objection_status NOT NULL DEFAULT 'OPEN',
    effect             g02_objection_effect NOT NULL DEFAULT 'PAUSE',       -- PAUSE (pre-commit) / REVERSAL_REQUESTED (post)
    assigned_grievance_officer uuid REFERENCES users(id) ON DELETE SET NULL,
    resolution_comment varchar(1000),
    resolved_at        timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    is_deleted         boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_crobj_tenant ON cr_objections(tenant_id);
CREATE INDEX ix_crobj_cr     ON cr_objections(change_request_id);
CREATE INDEX ix_crobj_raised ON cr_objections(raised_by);
CREATE INDEX ix_crobj_status ON cr_objections(status);
CREATE INDEX ix_crobj_officer ON cr_objections(assigned_grievance_officer);

-- E15 — data_subject_notices (APPEND-ONLY; out-of-band notice + objection window; FR-017)
CREATE TABLE data_subject_notices (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- notice_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,  -- data subject
    trigger_origin     g02_notice_trigger_origin NOT NULL,
    channel            g02_notice_channel NOT NULL,                         -- out-of-band (X.2/W.3)
    sent_at            timestamptz,
    delivery_status    g02_notice_delivery_status NOT NULL DEFAULT 'PENDING',  -- X.2 backoff x5 + DLQ
    objection_window_ends_at timestamptz,                                   -- FINANCIAL: credit held until passes (JOB-G02-NOTICE)
    outcome            g02_notice_outcome NOT NULL DEFAULT 'AWAITING',
    objection_id       uuid REFERENCES cr_objections(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
);
CREATE INDEX ix_dsn_tenant    ON data_subject_notices(tenant_id);
CREATE INDEX ix_dsn_cr        ON data_subject_notices(change_request_id);
CREATE INDEX ix_dsn_target    ON data_subject_notices(target_employee_id);
CREATE INDEX ix_dsn_outcome   ON data_subject_notices(outcome);
CREATE INDEX ix_dsn_objection ON data_subject_notices(objection_id);

-- E17 — cr_reversals (APPEND-ONLY; dual-auth; SoD by P02; FR-020) -----------------------
CREATE TABLE cr_reversals (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- reversal_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    original_change_request_id uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,  -- committed CR reversed
    original_item_id   uuid NOT NULL REFERENCES change_request_items(id) ON DELETE RESTRICT,     -- specific item
    reason             varchar(1000) NOT NULL,                              -- mandatory (VAL-COMMENT)
    auth1_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    auth2_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revert_to_value    text,                                                -- encrypted pre-change value restored
    reversing_sr_event_required boolean NOT NULL DEFAULT false,             -- true for statutory items (G12 reversing event)
    reversing_sr_status g02_sr_posting_status,
    m01_revert_status  g02_revert_status NOT NULL DEFAULT 'PENDING',        -- effective-dated G01 restore
    idempotency_key    varchar(120) NOT NULL,                              -- = item_id + ':REV:' + reversal_id
    executed_at        timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    -- R13 dual-auth: two distinct authorisers (VAL-G02-DUALAUTH; auth!=maker enforced by P02):
    CONSTRAINT ck_rev_dual_auth CHECK (auth1_user_id <> auth2_user_id),
    CONSTRAINT uq_rev_idem UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX ix_rev_tenant   ON cr_reversals(tenant_id);
CREATE INDEX ix_rev_orig_cr  ON cr_reversals(original_change_request_id);
CREATE INDEX ix_rev_orig_item ON cr_reversals(original_item_id);
CREATE INDEX ix_rev_auth1    ON cr_reversals(auth1_user_id);
CREATE INDEX ix_rev_auth2    ON cr_reversals(auth2_user_id);

-- E19 — cr_step_up_events (APPEND-ONLY; invokes platform MFA §3.1; FR-023) --------------
CREATE TABLE cr_step_up_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- step_up_event_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    user_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- requester re-authenticated
    change_request_id  uuid REFERENCES change_requests(id) ON DELETE SET NULL, -- bound once CR created
    method             g02_step_up_method NOT NULL,
    challenge_ref      varchar(120) NOT NULL,                               -- platform auth challenge id
    result             g02_step_up_result NOT NULL,
    auth_assurance_level varchar(10) NOT NULL,                              -- e.g. AAL2
    expires_at         timestamptz NOT NULL,                               -- step-up validity window
    ip_address         varchar(45),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
);
CREATE INDEX ix_csu_tenant ON cr_step_up_events(tenant_id);
CREATE INDEX ix_csu_user   ON cr_step_up_events(user_id);
CREATE INDEX ix_csu_cr     ON cr_step_up_events(change_request_id);


-- =====================================================================================
-- SECTION 6 — DEFERRED FORWARD-REFERENCE FOREIGN KEYS (change_requests <-> ledgers)
-- =====================================================================================
ALTER TABLE change_requests
    ADD CONSTRAINT fk_cr_step_up_event
    FOREIGN KEY (step_up_event_id) REFERENCES cr_step_up_events(id) ON DELETE SET NULL;
CREATE INDEX ix_cr_step_up ON change_requests(step_up_event_id);

ALTER TABLE change_requests
    ADD CONSTRAINT fk_cr_parent_reversal
    FOREIGN KEY (parent_reversal_id) REFERENCES cr_reversals(id) ON DELETE SET NULL;
CREATE INDEX ix_cr_parent_reversal ON change_requests(parent_reversal_id);


-- =====================================================================================
-- SECTION 7 — ROW-LEVEL SECURITY (P02 data-scope substrate) — all 18 module tables
-- =====================================================================================
DO $$
DECLARE
    t text;
    g02_tables text[] := ARRAY[
        'field_sensitivity_catalog','approval_matrix_config','approval_matrix_rules',
        'change_request_templates','delegations','bulk_correction_batches',
        'change_requests','change_request_items','esignatures','change_request_approvals',
        'change_request_documents','cr_sla_events','cr_risk_signals','retro_impact_events',
        'cr_objections','data_subject_notices','cr_reversals','cr_step_up_events'
    ];
BEGIN
    FOREACH t IN ARRAY g02_tables LOOP
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
-- SECTION 8 — SAMPLE SEED ROWS (self-contained; core prerequisites + G02 mains)
-- =====================================================================================
-- Uses the core seed tenant (1111…1111), entity (2222…2201) and employees (9999…9901/02).
-- Core does not seed users/workflows/documents, so we seed the minimal prerequisites here
-- under the platform-admin GUC so every FK resolves and the block is runnable.

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- --- core prerequisites (core tables; demo identities for G02 samples) ----------------
-- RECON: pii_tiers is a platform-global reference (core does not seed it); seed the tiers
--   here so the fsc.pii_tier_id samples are FK-valid. ON CONFLICT keeps this idempotent if a
--   future core seed adds them first.
INSERT INTO pii_tiers (id, tier_code, name, description, is_ceiling, sort_order)
VALUES
 ('f1000000-0000-0000-0000-000000000001','TIER_1','PII Tier 1','Highest-sensitivity PII (Aadhaar, biometrics, caste)',true,1),
 ('f1000000-0000-0000-0000-000000000002','TIER_2','PII Tier 2','Sensitive PII (DOB, bank, contact)',false,2),
 ('f1000000-0000-0000-0000-000000000003','TIER_3','PII Tier 3','Basic PII (name, salutation)',false,3),
 ('f1000000-0000-0000-0000-000000000004','NON_PII','Non-PII','Non-personal data',false,4)
ON CONFLICT (tier_code) DO NOTHING;

INSERT INTO users (id, tenant_id, entity_id, username, official_email, auth_method, status, mfa_enabled)
VALUES
 ('a0000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','anjali.rao','anjali.rao@gov.example','PASSWORD','ACTIVE',true),
 ('a0000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','mohan.kumar','mohan.kumar@gov.example','PASSWORD','ACTIVE',true),
 ('a0000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','hr.officer1','hr.officer1@gov.example','PASSWORD','ACTIVE',true),
 ('a0000000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','appoint.auth1','appoint.auth1@gov.example','PASSWORD','ACTIVE',true);

INSERT INTO workflows (id, tenant_id, entity_id, workflow_code, version, name, pattern, status, stages_definition)
VALUES
 ('b0000000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','WF-G02-SENSITIVE-CHANGE',3,'G02 Sensitive Personal-Details Change','SEQUENTIAL','ACTIVE',
  '{"stages":[{"level":1,"node":"VERIFY","role":"hrbp"},{"level":2,"node":"SANCTION","role":"appointing_authority"}]}');

INSERT INTO workflow_instances (id, tenant_id, entity_id, workflow_id, workflow_code, pinned_version, subject_ref, subject_employee_id, status, current_stage)
VALUES
 ('b0000000-0000-0000-0000-000000009001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','b0000000-0000-0000-0000-0000000000f1','WF-G02-SENSITIVE-CHANGE',3,'change_requests:d0000000-0000-0000-0000-0000000000e1','99999999-9999-9999-9999-999999999901','COMPLETED','DONE'),
 ('b0000000-0000-0000-0000-000000009002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','b0000000-0000-0000-0000-0000000000f1','WF-G02-SENSITIVE-CHANGE',3,'change_requests:d0000000-0000-0000-0000-0000000000e2','99999999-9999-9999-9999-999999999902','RUNNING','SANCTION'),
 ('b0000000-0000-0000-0000-000000009003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','b0000000-0000-0000-0000-0000000000f1','WF-G02-SENSITIVE-CHANGE',3,'change_requests:d0000000-0000-0000-0000-0000000000e3','99999999-9999-9999-9999-999999999901','RUNNING','VERIFY');

INSERT INTO workflow_actions (id, tenant_id, instance_id, stage, action_type, actor_user_id, actor_role_code)
VALUES
 ('b0000000-0000-0000-0000-00000000a001','11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000009001','VERIFY','APPROVE','a0000000-0000-0000-0000-0000000000b1','hrbp'),
 ('b0000000-0000-0000-0000-00000000a002','11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000009002','VERIFY','APPROVE','a0000000-0000-0000-0000-0000000000b1','hrbp'),
 ('b0000000-0000-0000-0000-00000000a003','11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000009002','SANCTION','ADVANCE','a0000000-0000-0000-0000-0000000000c1','appointing_authority');

INSERT INTO documents (id, tenant_id, entity_id, doc_no, title, classification, status, scan_status)
VALUES
 ('c0000000-0000-0000-0000-000000009001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC/2026/0009001','Gazette Notification - DOB Correction','CONFIDENTIAL','ACTIVE','CLEAN'),
 ('c0000000-0000-0000-0000-000000009002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC/2026/0009002','Birth Certificate','CONFIDENTIAL','ACTIVE','CLEAN'),
 ('c0000000-0000-0000-0000-000000009100','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DOC/2026/0009100','Bank Proof - Cancelled Cheque','CONFIDENTIAL','ACTIVE','CLEAN');

-- --- E5 field_sensitivity_catalog -----------------------------------------------------
INSERT INTO field_sensitivity_catalog
 (id, tenant_id, field_key, m01_field_key, display_label, field_group, sensitivity, pii_tier_id, rbac_field_access,
  is_auth_bearing, notify_old_value, requires_document, requires_authority_portal_verification,
  self_service_editable, hard_block_rule_ref, post_to_sr, validation_ref, version, effective_from)
VALUES
 ('e5000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','dob','employees.dob','Date of Birth','DEMOGRAPHIC','STATUTORY','f1000000-0000-0000-0000-000000000002','H',false,false,true,false,true,'DOB_PRE_RETIREMENT_BAR',true,'VAL-DOB',1,'2026-06-01'),
 ('e5000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','email','employee_contacts.email','Email Address','CONTACT','MEDIUM','f1000000-0000-0000-0000-000000000002','E',true,true,false,false,true,NULL,false,'VAL-EMAIL',1,'2026-06-01'),
 ('e5000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','national_id','employees.national_id','Aadhaar Number','IDENTITY','STATUTORY','f1000000-0000-0000-0000-000000000001','AR',false,false,true,true,false,NULL,true,'VAL-AADHAAR',1,'2026-06-01');

-- --- E6 approval_matrix_config --------------------------------------------------------
INSERT INTO approval_matrix_config (id, tenant_id, entity_id, name, workflow_code, status, version, effective_from)
VALUES
 ('e6000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',NULL,'Default Govt Matrix','WF-G02-SENSITIVE-CHANGE','ACTIVE',3,'2026-06-01'),
 ('e6000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Revenue Override','WF-G02-SENSITIVE-CHANGE','DRAFT',1,'2026-08-01');

-- --- E7 approval_matrix_rules ---------------------------------------------------------
INSERT INTO approval_matrix_rules (id, tenant_id, matrix_id, sensitivity, employment_status_scope, level_no, node_type, topology, required_role, sla_hours, escalation_role, auto_apply_on_low)
VALUES
 ('e7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','e6000000-0000-0000-0000-000000000001','LOW','ACTIVE',1,'APPROVE','SEQUENTIAL','hrbp',24,'hr_admin',false),
 ('e7000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','e6000000-0000-0000-0000-000000000001','HIGH','ACTIVE',1,'VERIFY','SEQUENTIAL','hrbp',48,'hr_admin',false),
 ('e7000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','e6000000-0000-0000-0000-000000000001','STATUTORY','DECEASED',2,'SANCTION','SEQUENTIAL','appointing_authority',72,'appointing_authority',false);

-- --- E9 change_request_templates ------------------------------------------------------
INSERT INTO change_request_templates (id, tenant_id, entity_id, name, w2_form_ref, change_type, field_keys, is_active)
VALUES
 ('e9000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Update Contact Details','FORM-G02-CONTACT','UPDATE','["correspondence_address","alternate_phone"]',true),
 ('e9000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','Bank Account Change','FORM-G02-BANK','UPDATE','["bank_account_no"]',true);

-- --- E12 bulk_correction_batches ------------------------------------------------------
INSERT INTO bulk_correction_batches (id, tenant_id, entity_id, batch_number, initiated_by, total_rows, valid_rows, invalid_rows, status)
VALUES
 ('ec000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BLK-2026-0007','a0000000-0000-0000-0000-0000000000b1',250,248,2,'PENDING_APPROVAL'),
 ('ec000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','BLK-2026-0008','a0000000-0000-0000-0000-0000000000b1',30,30,0,'COMMITTED');

-- --- E1 change_requests ---------------------------------------------------------------
INSERT INTO change_requests
 (id, tenant_id, entity_id, cr_number, target_employee_id, requested_by, request_origin, change_type,
  highest_sensitivity, status, employment_status_at_submit, risk_band, effective_date, workflow_instance_id, submitted_at)
VALUES
 ('d0000000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CR-2026-000123','99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000a1','SELF_SERVICE','UPDATE','MEDIUM','COMMITTED','ACTIVE','LOW','2026-06-28','b0000000-0000-0000-0000-000000009001', now()),
 ('d0000000-0000-0000-0000-0000000000e2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CR-2026-000124','99999999-9999-9999-9999-999999999902','a0000000-0000-0000-0000-0000000000a2','SELF_SERVICE','CORRECTION','STATUTORY','IN_REVIEW','ACTIVE','LOW','1972-11-30','b0000000-0000-0000-0000-000000009002', now()),
 ('d0000000-0000-0000-0000-0000000000e3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CR-2026-000125','99999999-9999-9999-9999-999999999901','a0000000-0000-0000-0000-0000000000b1','HR_ON_BEHALF','UPDATE','HIGH','NOTICE_HOLD','ACTIVE','HIGH','2026-07-01','b0000000-0000-0000-0000-000000009003', now());

-- --- E2 change_request_items ----------------------------------------------------------
INSERT INTO change_request_items
 (id, tenant_id, entity_id, change_request_id, field_key, m01_field_key, old_value, new_value, clear_intent,
  value_datatype, sensitivity, item_status, commit_idempotency_key, retro_status)
VALUES
 ('d1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e1','alternate_phone','employee_contacts.alt_phone','+91-90000-11111','+91-98888-22222',false,'STRING','MEDIUM','COMMITTED','d1000000-0000-0000-0000-000000000001','NOT_REQUIRED'),
 ('d1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','dob','employees.dob','1972-11-30','1972-11-21',false,'DATE','STATUTORY','PENDING','d1000000-0000-0000-0000-000000000002','PENDING'),
 ('d1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','bank_account_no','employee_bank_accounts.account_number','XXXX4321','XXXX9876',false,'STRING','HIGH','PENDING','d1000000-0000-0000-0000-000000000003','PENDING'),
 ('d1000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','middle_name','employees.middle_name','Kumar',NULL,true,'STRING','STATUTORY','PENDING','d1000000-0000-0000-0000-000000000004','NOT_REQUIRED');

-- --- E10 esignatures ------------------------------------------------------------------
INSERT INTO esignatures (id, tenant_id, entity_id, change_request_id, signer_user_id, sign_method, signed_payload_hash, chain_hash, signed_at)
VALUES
 ('ea000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','a0000000-0000-0000-0000-0000000000c1','PKI_DSC','9f3a000000000000000000000000000000000000000000000000000000000c01','9f3a000000000000000000000000000000000000000000000000000000000c11','2026-06-28T10:14:00Z'),
 ('ea000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','a0000000-0000-0000-0000-0000000000b1','AADHAAR_ESIGN','2b7d000000000000000000000000000000000000000000000000000000000e01','2b7d000000000000000000000000000000000000000000000000000000000e11','2026-06-27T09:00:00Z');

-- --- E4 change_request_approvals ------------------------------------------------------
INSERT INTO change_request_approvals
 (id, tenant_id, entity_id, change_request_id, workflow_action_id, level_no, node_type, topology, required_role, assigned_to, decision, esignature_id, acted_at)
VALUES
 ('e4000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-00000000a001',1,'APPROVE','SEQUENTIAL','hrbp','a0000000-0000-0000-0000-0000000000b1','APPROVED',NULL, now()),
 ('e4000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','b0000000-0000-0000-0000-00000000a002',1,'VERIFY','SEQUENTIAL','hrbp','a0000000-0000-0000-0000-0000000000b1','APPROVED',NULL, now()),
 ('e4000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','b0000000-0000-0000-0000-00000000a003',2,'SANCTION','SEQUENTIAL','appointing_authority','a0000000-0000-0000-0000-0000000000c1','PENDING','ea000000-0000-0000-0000-000000000001',NULL);

-- --- E3 change_request_documents ------------------------------------------------------
INSERT INTO change_request_documents
 (id, tenant_id, entity_id, change_request_id, change_request_item_id, document_id, doc_type, verification_status, authority_verification_status, scan_status)
VALUES
 ('e3000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','d1000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000009001','GAZETTE_NOTIFICATION','VERIFIED','NOT_REQUIRED','CLEAN'),
 ('e3000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','d1000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000009002','BIRTH_CERTIFICATE','VERIFIED','NOT_REQUIRED','CLEAN'),
 ('e3000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','d1000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000009100','BANK_PROOF','UNVERIFIED','NOT_REQUIRED','CLEAN');

-- --- E11 cr_sla_events ----------------------------------------------------------------
INSERT INTO cr_sla_events (id, tenant_id, entity_id, change_request_id, workflow_action_id, event_type, due_at, escalated_to)
VALUES
 ('eb000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e2','b0000000-0000-0000-0000-00000000a002','SLA_SET','2026-07-03T00:00:00Z',NULL),
 ('eb000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3',NULL,'BREACHED','2026-06-29T00:00:00Z','a0000000-0000-0000-0000-0000000000b1');

-- --- E13 cr_risk_signals --------------------------------------------------------------
INSERT INTO cr_risk_signals (id, tenant_id, entity_id, change_request_id, signal_type, severity, score_contribution, review_outcome)
VALUES
 ('ed000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','DUPLICATE_BANK_ACCOUNT','HIGH',60,'ESCALATED'),
 ('ed000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','PRE_PAYROLL_CUTOFF','WARN',20,NULL);

-- --- E14 retro_impact_events ----------------------------------------------------------
INSERT INTO retro_impact_events (id, tenant_id, entity_id, change_request_item_id, target_module, idempotency_key, effective_date, payload, status, acked_at)
VALUES
 ('ee000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d1000000-0000-0000-0000-000000000002','G11','d1000000-0000-0000-0000-000000000002:RETRO:G11','1972-11-21','{"field":"dob","change_type":"CORRECTION"}','ACKED','2026-06-29T11:00:00Z'),
 ('ee000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d1000000-0000-0000-0000-000000000002','G06','d1000000-0000-0000-0000-000000000002:RETRO:G06','1972-11-21','{"field":"dob","change_type":"CORRECTION"}','PENDING',NULL);

-- --- E16 cr_objections ----------------------------------------------------------------
INSERT INTO cr_objections (id, tenant_id, entity_id, change_request_id, raised_by, objection_type, description, status, effect)
VALUES
 ('e1600000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','a0000000-0000-0000-0000-0000000000a1','UNAUTHORISED_CHANGE','I did not request this bank change','UNDER_REVIEW','PAUSE'),
 ('e1600000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201',NULL,'a0000000-0000-0000-0000-0000000000a2','INCORRECT_VALUE','Committed DOB is wrong','OPEN','REVERSAL_REQUESTED');

-- --- E15 data_subject_notices ---------------------------------------------------------
INSERT INTO data_subject_notices (id, tenant_id, entity_id, change_request_id, target_employee_id, trigger_origin, channel, objection_window_ends_at, outcome, objection_id)
VALUES
 ('e1500000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e3','99999999-9999-9999-9999-999999999901','HR_ON_BEHALF','SMS','2026-07-02T00:00:00Z','OBJECTED','e1600000-0000-0000-0000-000000000001'),
 ('e1500000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e1','99999999-9999-9999-9999-999999999901','BULK','EMAIL','2026-07-03T00:00:00Z','CONFIRMED',NULL);

-- --- E8 delegations -------------------------------------------------------------------
INSERT INTO delegations (id, tenant_id, entity_id, delegator_user_id, delegate_user_id, delegate_holds_role_verified, valid_from, valid_to, status)
VALUES
 ('e8000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000b1',true,'2026-06-25T00:00:00Z','2026-07-05T00:00:00Z','ACTIVE'),
 ('e8000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a0000000-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-0000000000a1',true,'2026-05-01T00:00:00Z','2026-05-10T00:00:00Z','EXPIRED');

-- --- E17 cr_reversals -----------------------------------------------------------------
INSERT INTO cr_reversals (id, tenant_id, entity_id, original_change_request_id, original_item_id, reason, auth1_user_id, auth2_user_id, reversing_sr_event_required, m01_revert_status, idempotency_key)
VALUES
 ('e1700000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d0000000-0000-0000-0000-0000000000e1','d1000000-0000-0000-0000-000000000001','Erroneous contact update','a0000000-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-0000000000c1',false,'APPLIED','d1000000-0000-0000-0000-000000000001:REV:e1700000-0000-0000-0000-000000000001');

-- --- E19 cr_step_up_events ------------------------------------------------------------
INSERT INTO cr_step_up_events (id, tenant_id, entity_id, user_id, change_request_id, method, challenge_ref, result, auth_assurance_level, expires_at)
VALUES
 ('e1900000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a0000000-0000-0000-0000-0000000000a2','d0000000-0000-0000-0000-0000000000e2','WEBAUTHN','chal-0001','SUCCESS','AAL2','2026-06-28T10:05:00Z'),
 ('e1900000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a0000000-0000-0000-0000-0000000000a1',NULL,'MFA_TOTP','chal-0002','FAILED','AAL2','2026-06-28T10:20:00Z');

RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 02-G02-personal-details-workflow.sql
-- =====================================================================================
