-- PH-06A migration 0003: G05 transfer substrate — faithful subset of docs/data-model/05-G05-transfer-relieving-joining.sql
-- Tables: transfer_drives, transfer_requests, transfer_orders, order_number_sequences, clearance_checklists, clearance_items,
--         relieving_orders, joining_reports

-- SECTION 1 — ENUM TYPES (G05 closed enumerations; UPPER_SNAKE values, g05_ prefix)
-- =====================================================================================
-- Closed lifecycle enumerations -> Postgres ENUM (CONVENTIONS §4). Tenant-configurable
-- value sets (rule_code, drive_code, department catalog) remain text codes on master tables.

-- Taxonomy axes (BRD §5.5: orthogonal mechanism / ground / protection) -----------------





-- Request / order lifecycle -----------------------------------------------------------





-- Policy / ban / drive ----------------------------------------------------------------








-- Clearance (P01 PARALLEL_ALL_OF) -----------------------------------------------------






-- Charge handover ---------------------------------------------------------------------




-- Relieving / joining -----------------------------------------------------------------




-- Deputation --------------------------------------------------------------------------


-- Representation / holds ---------------------------------------------------------------






-- SR / signal outbox (frozen G12 write contract — BRD §5.2.15 R2/R3/R4) ----------------





-- Vacancy / counselling / acknowledgement / quarters / sequences -----------------------









-- -------------------------------------------------------------------------------------
-- 2.3  transfer_drives (bulk drive header)  [BRD §5.2.5]
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_drives (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    drive_code               varchar(30) NOT NULL,                       -- VAL-MASTER-UNIQUE
    title                    varchar(160) NOT NULL,
    cadre                    varchar(40),
    drive_type               text NOT NULL,
    preference_window_start  date,
    preference_window_end    date,
    allotment_method         text NOT NULL DEFAULT 'SENIORITY',
    status                   text NOT NULL DEFAULT 'DRAFT',
    total_positions          integer,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_drives_code   UNIQUE (tenant_id, drive_code),
    CONSTRAINT ck_transfer_drives_window CHECK (preference_window_end IS NULL OR preference_window_start IS NULL OR preference_window_end >= preference_window_start)
);
CREATE INDEX ix_transfer_drives_tenant ON transfer_drives(tenant_id);
CREATE INDEX ix_transfer_drives_entity ON transfer_drives(entity_id);
CREATE INDEX ix_transfer_drives_status ON transfer_drives(status);

-- -------------------------------------------------------------------------------------
-- 2.4  transfer_requests (pre-order intent)  [BRD §5.2.1]
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_requests (
    id                              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                       text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    request_no                      varchar(30) NOT NULL,                -- e.g. TRQ-2026-000123
    employee_id                     text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_type                   text NOT NULL,
    request_origin                  text NOT NULL,
    source_org_unit_id              text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    requested_dest_org_unit_id      text REFERENCES org_units(id) ON DELETE RESTRICT,
    mutual_counterpart_employee_id  text REFERENCES employees(id) ON DELETE RESTRICT,
    ground                          text,
    ground_details                  text,                                -- VAL-LEN(4000)
    supporting_document_ids         text[],                              -- G13 refs (non-sensitive)
    sensitive_document_ids          text[],                              -- G13 sensitive-class refs
    sensitive_ground                boolean NOT NULL DEFAULT false,      -- derived; gates restricted access + P05 logging
    linked_promotion_id             text,                                -- G06 reference
    linked_drive_id                 text REFERENCES transfer_drives(id) ON DELETE SET NULL,
    priority_category               text,
    status                          text NOT NULL DEFAULT 'DRAFT',
    eligibility_result              jsonb,                               -- cached policy-check outcome
    workflow_instance_id            text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    requested_effective_date        date,                                -- VAL-EFFECTIVE
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      text,
    updated_by                      text,
    is_deleted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_requests_no  UNIQUE (tenant_id, request_no),
    CONSTRAINT ck_transfer_requests_len CHECK (ground_details IS NULL OR length(ground_details) <= 4000)
);
CREATE INDEX ix_transfer_requests_tenant     ON transfer_requests(tenant_id);
CREATE INDEX ix_transfer_requests_entity     ON transfer_requests(entity_id);
CREATE INDEX ix_transfer_requests_employee   ON transfer_requests(employee_id);
CREATE INDEX ix_transfer_requests_source     ON transfer_requests(source_org_unit_id);
CREATE INDEX ix_transfer_requests_dest       ON transfer_requests(requested_dest_org_unit_id);
CREATE INDEX ix_transfer_requests_counterpart ON transfer_requests(mutual_counterpart_employee_id);
CREATE INDEX ix_transfer_requests_drive      ON transfer_requests(linked_drive_id);
CREATE INDEX ix_transfer_requests_status     ON transfer_requests(status);
CREATE INDEX ix_transfer_requests_wf         ON transfer_requests(workflow_instance_id);

-- -------------------------------------------------------------------------------------
-- 2.5  transfer_orders (master of the mobility instance)  [BRD §5.2.2]  *** headline ***
--      status written ONLY by TransferOrderStateService (calls P01 + P05) — §16.6 / rule 19.
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_orders (
    id                            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                     text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    order_no                      varchar(30) NOT NULL,                  -- gapless statutory no. (§2.16)
    order_class                   text NOT NULL,
    transfer_request_id           text REFERENCES transfer_requests(id) ON DELETE SET NULL,  -- null for direct admin orders
    employee_id                   text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_type                 text NOT NULL,
    source_org_unit_id            text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    dest_org_unit_id              text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    source_designation_id         text NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    dest_designation_id           text NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    order_date                    date NOT NULL,
    served_on_date                date,                                  -- FR-G05-020; basis for relieve-by
    acknowledged_at               timestamptz,
    relieve_by_date               date NOT NULL,                         -- statutory deadline
    expected_joining_date         date,
    joining_distance_band         text,
    joining_time_days             integer,
    joining_time_pay_admissible   boolean NOT NULL DEFAULT true,         -- FR-G05-015
    entitlement_ref               varchar(60),                           -- G10 entitlement signal ref
    in_transit_custody_org_unit_id text REFERENCES org_units(id) ON DELETE RESTRICT,
    is_deputation                 boolean NOT NULL DEFAULT false,
    mutual_pair_order_id          text REFERENCES transfer_orders(id) ON DELETE SET NULL,     -- reciprocal (MUTUAL)
    drive_id                      text REFERENCES transfer_drives(id) ON DELETE SET NULL,
    status                        text NOT NULL DEFAULT 'DRAFT',
    hold_active                   boolean NOT NULL DEFAULT false,        -- true under STAY_HOLD
    order_document_id             text REFERENCES documents(id) ON DELETE SET NULL,
    approved_by                   text REFERENCES users(id) ON DELETE SET NULL,               -- Transfer Authority
    approved_at                   timestamptz,
    workflow_instance_id          text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    revision_no                   integer NOT NULL DEFAULT 0,
    superseded_by_order_id        text REFERENCES transfer_orders(id) ON DELETE SET NULL,
    g05_source_id                 varchar(80),                           -- P06 legacy traceability/dedup
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    text,
    updated_by                    text,
    is_deleted                    boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_orders_no       UNIQUE (tenant_id, order_no),
    CONSTRAINT ck_transfer_orders_served   CHECK (served_on_date IS NULL OR served_on_date >= order_date),         -- rule 4
    CONSTRAINT ck_transfer_orders_relieve  CHECK (served_on_date IS NULL OR relieve_by_date >= served_on_date)     -- rule 4
);
CREATE INDEX ix_transfer_orders_tenant     ON transfer_orders(tenant_id);
CREATE INDEX ix_transfer_orders_entity     ON transfer_orders(entity_id);
CREATE INDEX ix_transfer_orders_request    ON transfer_orders(transfer_request_id);
CREATE INDEX ix_transfer_orders_employee   ON transfer_orders(employee_id);
CREATE INDEX ix_transfer_orders_source     ON transfer_orders(source_org_unit_id);
CREATE INDEX ix_transfer_orders_dest       ON transfer_orders(dest_org_unit_id);
CREATE INDEX ix_transfer_orders_src_desig  ON transfer_orders(source_designation_id);
CREATE INDEX ix_transfer_orders_dst_desig  ON transfer_orders(dest_designation_id);
CREATE INDEX ix_transfer_orders_custody    ON transfer_orders(in_transit_custody_org_unit_id);
CREATE INDEX ix_transfer_orders_mutual     ON transfer_orders(mutual_pair_order_id);
CREATE INDEX ix_transfer_orders_drive      ON transfer_orders(drive_id);
CREATE INDEX ix_transfer_orders_status     ON transfer_orders(status);
CREATE INDEX ix_transfer_orders_order_date ON transfer_orders(order_date);
CREATE INDEX ix_transfer_orders_doc        ON transfer_orders(order_document_id);
CREATE INDEX ix_transfer_orders_approver   ON transfer_orders(approved_by);
CREATE INDEX ix_transfer_orders_wf         ON transfer_orders(workflow_instance_id);
CREATE INDEX ix_transfer_orders_superseded ON transfer_orders(superseded_by_order_id);
CREATE INDEX ix_transfer_orders_source_id  ON transfer_orders(g05_source_id);
-- rule 1: one active SUBSTANTIVE transition per employee (non-terminal). Partial unique index.
CREATE UNIQUE INDEX uq_transfer_orders_active_substantive
    ON transfer_orders(tenant_id, employee_id)
    WHERE order_class = 'SUBSTANTIVE'
      AND is_deleted = false
      AND status IN ('PUBLISHED','SERVED','STAY_HOLD','RELIEVING_IN_PROGRESS','RELIEVED','IN_TRANSIT');

-- -------------------------------------------------------------------------------------
-- 2.6  order_number_sequences (gapless reserve-then-commit)  [BRD §5.2.18]  *** headline ***
-- -------------------------------------------------------------------------------------
CREATE TABLE order_number_sequences (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    sequence_scope      text NOT NULL,
    office_org_unit_id  text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    fiscal_year         integer NOT NULL,
    next_value          bigint NOT NULL DEFAULT 1,                       -- row-locked counter
    reserved_high_water bigint NOT NULL DEFAULT 0,                       -- highest reserved
    prefix_template     varchar(40) NOT NULL,                            -- e.g. TO/{yyyy}/{mm}/{seq:04d}
    gap_audit_last_run  timestamptz,                                     -- JOB-G05-GAPAUDIT
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_order_number_sequences UNIQUE (tenant_id, sequence_scope, office_org_unit_id, fiscal_year),
    CONSTRAINT ck_order_number_sequences_hw CHECK (reserved_high_water >= 0 AND next_value >= 1)
);
CREATE INDEX ix_order_number_sequences_tenant ON order_number_sequences(tenant_id);
CREATE INDEX ix_order_number_sequences_office ON order_number_sequences(office_org_unit_id);

-- -------------------------------------------------------------------------------------

-- -------------------------------------------------------------------------------------
-- 2.12 clearance_checklists (no-dues header; subject of P01 PARALLEL_ALL_OF)  [BRD §5.2.8]  *** headline (no_dues) ***
-- -------------------------------------------------------------------------------------
CREATE TABLE clearance_checklists (
    id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id            text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    checklist_no         varchar(30) NOT NULL,                          -- e.g. NOD-2026-000789
    transfer_order_id    text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id          text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    source_org_unit_id   text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    workflow_instance_id text REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- the PARALLEL_ALL_OF instance
    status               text NOT NULL DEFAULT 'OPEN',
    total_items          integer NOT NULL DEFAULT 0,
    cleared_items        integer NOT NULL DEFAULT 0,
    deemed_items         integer NOT NULL DEFAULT 0,                    -- DEEMED_CLEARED/WAIVED count
    has_outstanding_dues boolean NOT NULL DEFAULT false,
    dues_recovery_ref    varchar(60),                                   -- G10 recovery linkage
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text,
    updated_by           text,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_clearance_checklists_no UNIQUE (tenant_id, checklist_no)
);
CREATE INDEX ix_clearance_checklists_tenant   ON clearance_checklists(tenant_id);
CREATE INDEX ix_clearance_checklists_entity   ON clearance_checklists(entity_id);
CREATE INDEX ix_clearance_checklists_order    ON clearance_checklists(transfer_order_id);
CREATE INDEX ix_clearance_checklists_employee ON clearance_checklists(employee_id);
CREATE INDEX ix_clearance_checklists_source   ON clearance_checklists(source_org_unit_id);
CREATE INDEX ix_clearance_checklists_status   ON clearance_checklists(status);
CREATE INDEX ix_clearance_checklists_wf       ON clearance_checklists(workflow_instance_id);

-- -------------------------------------------------------------------------------------
-- 2.13 clearance_items (one per P01 parallel branch; SLA/escalation/deemed)  [BRD §5.2.9]  *** headline (no_dues) ***
-- -------------------------------------------------------------------------------------
CREATE TABLE clearance_items (
    id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id              text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    clearance_checklist_id text NOT NULL REFERENCES clearance_checklists(id) ON DELETE RESTRICT,
    department_code        text NOT NULL,
    workflow_branch_ref    varchar(60),                                 -- P01 PARALLEL_ALL_OF branch
    assigned_officer_id    text REFERENCES users(id) ON DELETE SET NULL,  -- Clearance Officer (P01 assignee)
    status                 text NOT NULL DEFAULT 'PENDING',
    sla_due_at             timestamptz,                                 -- per-branch SLA (P01 runtime)
    escalation_tier        text NOT NULL DEFAULT 'NONE',
    escalated_at           timestamptz,
    forced_action_type     text,                      -- DEEMED_CLEARED when Authority-granted
    forced_action_reason   text,                                        -- mandatory when deemed (ERR-G05-REASON-REQ)
    forced_action_by       text REFERENCES users(id) ON DELETE SET NULL,
    dues_amount            bigint,                               -- INR (VAL-CURRENCY)
    dues_description       text,
    remarks                text,
    evidence_document_id   text REFERENCES documents(id) ON DELETE SET NULL,
    cleared_at             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             text,
    updated_by             text,
    is_deleted             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_clearance_items UNIQUE (clearance_checklist_id, department_code),
    CONSTRAINT ck_clearance_items_deemed_reason CHECK (forced_action_type IS NULL OR forced_action_reason IS NOT NULL)
);
CREATE INDEX ix_clearance_items_tenant    ON clearance_items(tenant_id);
CREATE INDEX ix_clearance_items_entity    ON clearance_items(entity_id);
CREATE INDEX ix_clearance_items_checklist ON clearance_items(clearance_checklist_id);
CREATE INDEX ix_clearance_items_officer   ON clearance_items(assigned_officer_id);
CREATE INDEX ix_clearance_items_status    ON clearance_items(status);
CREATE INDEX ix_clearance_items_sla       ON clearance_items(sla_due_at) WHERE status = 'PENDING';
CREATE INDEX ix_clearance_items_forced_by ON clearance_items(forced_action_by);
CREATE INDEX ix_clearance_items_doc       ON clearance_items(evidence_document_id);

-- -------------------------------------------------------------------------------------
-- 2.15 relieving_orders (deemed-relief; pay-continuity)  [BRD §5.2.11]
--      Faithful subset of docs/data-model/05-G05-transfer-relieving-joining.sql.
-- -------------------------------------------------------------------------------------
CREATE TABLE relieving_orders (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    relieving_order_no          varchar(30) NOT NULL,                   -- gapless, e.g. RO/2026/00456
    transfer_order_id           text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id                 text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    clearance_checklist_id      text NOT NULL REFERENCES clearance_checklists(id) ON DELETE RESTRICT,
    last_working_day            date NOT NULL,                          -- VAL-EFFECTIVE
    relieving_time              text NOT NULL DEFAULT 'AFTERNOON',
    relieved                    boolean NOT NULL DEFAULT false,
    deemed_relief               boolean NOT NULL DEFAULT false,         -- FR-G05-016
    forced_action_reason        text,                                   -- mandatory when deemed_relief
    forced_action_by            text REFERENCES users(id) ON DELETE SET NULL,
    pay_continuity_signalled    boolean NOT NULL DEFAULT false,         -- G10 continue pay
    lpc_requested               boolean NOT NULL DEFAULT false,         -- LPC trigger to G10
    relieving_order_document_id text REFERENCES documents(id) ON DELETE SET NULL,
    status                      text NOT NULL DEFAULT 'DRAFT',
    issued_by                   text REFERENCES users(id) ON DELETE SET NULL,
    workflow_instance_id        text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_relieving_orders_no        UNIQUE (tenant_id, relieving_order_no),
    CONSTRAINT ck_relieving_orders_deemed_reason CHECK (deemed_relief = false OR forced_action_reason IS NOT NULL)
);
CREATE INDEX ix_relieving_orders_tenant    ON relieving_orders(tenant_id);
CREATE INDEX ix_relieving_orders_entity    ON relieving_orders(entity_id);
CREATE INDEX ix_relieving_orders_order     ON relieving_orders(transfer_order_id);
CREATE INDEX ix_relieving_orders_employee  ON relieving_orders(employee_id);
CREATE INDEX ix_relieving_orders_checklist ON relieving_orders(clearance_checklist_id);
CREATE INDEX ix_relieving_orders_status    ON relieving_orders(status);
CREATE INDEX ix_relieving_orders_lwd       ON relieving_orders(last_working_day);
CREATE INDEX ix_relieving_orders_issuer    ON relieving_orders(issued_by);
CREATE INDEX ix_relieving_orders_doc       ON relieving_orders(relieving_order_document_id);
CREATE INDEX ix_relieving_orders_wf        ON relieving_orders(workflow_instance_id);

-- -------------------------------------------------------------------------------------
-- 2.16 joining_reports (joining sequence; continuity)  [BRD §5.2.12]  *** headline ***
--      Faithful subset; charge_assumption_id kept as a plain text (charge_handovers is
--      outside the PH-06A migration subset, so no FK yet).
-- -------------------------------------------------------------------------------------
CREATE TABLE joining_reports (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    joining_report_no           varchar(30) NOT NULL,                   -- gapless, e.g. JR/2026/00456
    transfer_order_id           text NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    relieving_order_id          text REFERENCES relieving_orders(id) ON DELETE SET NULL,
    employee_id                 text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    dest_org_unit_id            text NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    reported_date               date NOT NULL,
    joining_date                date NOT NULL,                          -- statutory; VAL-EFFECTIVE
    joining_time                text NOT NULL DEFAULT 'FORENOON',
    joining_sequence_no         integer,                                -- inter-se order (FR-G05-021)
    inter_se_tiebreak_key       varchar(60),                            -- deterministic tie-break; exposed to G06
    transit_days                integer,                                -- derived: joining_date - LWD - holidays
    transit_within_admissible   boolean,                                -- vs joining_time_days
    service_continuity_asserted boolean NOT NULL DEFAULT false,         -- SR JOINING asserts no break
    charge_assumption_id        text,                                   -- charge_handovers ref (subset: no FK)
    pay_continuity_resumed      boolean NOT NULL DEFAULT false,         -- G10 confirmed at destination
    joining_document_id         text REFERENCES documents(id) ON DELETE SET NULL,
    status                      text NOT NULL DEFAULT 'DRAFT',
    verified_by                 text REFERENCES users(id) ON DELETE SET NULL,  -- HR Destination
    workflow_instance_id        text REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_joining_reports_no       UNIQUE (tenant_id, joining_report_no),
    CONSTRAINT ck_joining_reports_dates    CHECK (joining_date >= reported_date)
);
CREATE INDEX ix_joining_reports_tenant     ON joining_reports(tenant_id);
CREATE INDEX ix_joining_reports_entity     ON joining_reports(entity_id);
CREATE INDEX ix_joining_reports_order      ON joining_reports(transfer_order_id);
CREATE INDEX ix_joining_reports_relieving  ON joining_reports(relieving_order_id);
CREATE INDEX ix_joining_reports_employee   ON joining_reports(employee_id);
CREATE INDEX ix_joining_reports_dest       ON joining_reports(dest_org_unit_id);
CREATE INDEX ix_joining_reports_status     ON joining_reports(status);
CREATE INDEX ix_joining_reports_joindate   ON joining_reports(joining_date);
CREATE INDEX ix_joining_reports_verifier   ON joining_reports(verified_by);
CREATE INDEX ix_joining_reports_wf         ON joining_reports(workflow_instance_id);

