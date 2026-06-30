-- =====================================================================================
-- GOVERNMENT HRMS — G05 EMPLOYEE TRANSFER, RELIEVING & JOINING WORKFLOW (05-G05-...sql)
-- =====================================================================================
-- Module-owned (net-new gov) DDL for G05. Authored from:
--   docs/brd/v3/G05-transfer-relieving-joining-workflow.md  (§5 entities, §5.5 enums, §5.6 rules)
--   docs/data-model/CONVENTIONS.md                          (mandatory conventions)
--   docs/data-model/00-platform-core.sql                    (shared core — FK targets)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Load AFTER 00-platform-core.sql (and after 01-G01 if present). This file FKs
--   to core tables created in 00: tenants, entities, org_units, designations, employees,
--   users, workflow_instances, documents. It NEVER redefines them (CONVENTIONS §8).
--
-- SCOPE. 21 module-owned (net-new gov) tables per G05 BRD §5.1 ("Module-owned entities: 21").
--   The 12 headline tables named in the build request (transfer_orders, transfer_representations,
--   clearance_checklists/clearance_items = no-dues, charge_handovers, joining_reports, sr_outbox,
--   vacancy_reservations, order_acknowledgements, order_number_sequences, counselling_sessions,
--   counselling_choices, quarter_allotments) FK into the remaining 9 supporting tables
--   (transfer_requests, transfer_drives, transfer_preferences, vacancy_positions,
--   transfer_policy_rules, transfer_ban_periods, relieving_orders, deputation_records),
--   so all 21 are authored here to keep every FK intact and the schema self-consistent.
--
-- CORE-TABLE ASSUMPTIONS (referenced, never redefined):
--   * employees / org_units / designations — owned by G01/P04. G05 reads; org placement is
--     updated only via the G01 service (POSTING_UPDATE outbox signal), never by FK mutation.
--   * users — owned by RBAC v1.7/P02. Named approver/officer columns FK to users(id):
--     ON DELETE SET NULL where nullable, ON DELETE RESTRICT where the BRD marks them NOT NULL.
--     created_by/updated_by are logical refs (NO FK) per CONVENTIONS §3 so audit survives user removal.
--   * workflow_instances — P01 engine. Clearance is a P01 PARALLEL_ALL_OF instance; module rows
--     carry workflow_instance_id (SET NULL) and do not re-implement the engine.
--   * documents — G13 vault. Order/clearance/handover/joining PDFs referenced by id (SET NULL).
--   * service_register_events — G12 ledger. G05 is a WRITER ONLY via sr_outbox -> POST /sr/ingest
--     (+ /sr/ingest/reversal). This file defines NO SR ledger table and INSERTs none; the dedup
--     tuple (source_module="G05", source_reference_id, source_event_version) + fact_key +
--     is_reversal envelope live in sr_outbox.payload (BRD §5.2.15 R3/R4).
--
-- AUDIT. P05 captures every INSERT/UPDATE/soft-delete via DB trigger into core audit_log.
--   G05 defines no private audit log. Standard actor/timestamp + is_deleted columns are present
--   on business tables; append-only tables (counselling_choices) carry only created_at/created_by
--   (CONVENTIONS §3). sr_outbox is a mutable work-queue (status churns) with NO soft delete:
--   rows are retained/dead-lettered/archived by JOB-G05-OUTBOX per BRD §5.2.15 retention.
--
-- TENANCY/RLS. Every table carries tenant_id (NOT NULL) + entity_id; Section 3 enables the
--   canonical tenant_isolation RLS policy (CONVENTIONS §6) on all 21 tables, including the
--   append-only choice log (read isolation).
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G05 closed enumerations; UPPER_SNAKE values, g05_ prefix)
-- =====================================================================================
-- Closed lifecycle enumerations -> Postgres ENUM (CONVENTIONS §4). Tenant-configurable
-- value sets (rule_code, drive_code, department catalog) remain text codes on master tables.

-- Taxonomy axes (BRD §5.5: orthogonal mechanism / ground / protection) -----------------
CREATE TYPE g05_transfer_type        AS ENUM ('REQUEST','ADMINISTRATIVE','MUTUAL','DEPUTATION','PROMOTION_LINKED','COMPASSIONATE');
CREATE TYPE g05_request_origin       AS ENUM ('SELF','MANAGER','ADMIN','SYSTEM');
CREATE TYPE g05_ground               AS ENUM ('SPOUSE','MEDICAL','ADMINISTRATIVE','OWN_REQUEST','PROMOTION','DEPUTATION','COMPASSIONATE','OTHER');
CREATE TYPE g05_priority_category    AS ENUM ('PROTECTED_SPOUSE','MEDICAL','DIFFERENTLY_ABLED','NEAR_RETIREMENT','SINGLE_PARENT','NONE');

-- Request / order lifecycle -----------------------------------------------------------
CREATE TYPE g05_transfer_request_status AS ENUM ('DRAFT','SUBMITTED','ELIGIBILITY_CHECK','RECOMMENDED','APPROVED','REJECTED','WITHDRAWN','ORDER_ISSUED','CANCELLED');
CREATE TYPE g05_order_class          AS ENUM ('SUBSTANTIVE','ADDITIONAL_CHARGE','DEPUTATION','REPATRIATION');
CREATE TYPE g05_transfer_order_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','PUBLISHED','SERVED','STAY_HOLD','RELIEVING_IN_PROGRESS','RELIEVED','IN_TRANSIT','JOINED','REVERTED_TO_SOURCE','ABANDONED','AMENDED','CANCELLED','REVOKED');
CREATE TYPE g05_distance_band        AS ENUM ('LOCAL','SHORT','MEDIUM','LONG','OUTSTATION');

-- Policy / ban / drive ----------------------------------------------------------------
CREATE TYPE g05_policy_rule_type     AS ENUM ('MIN_TENURE','MAX_TENURE','BAN_WINDOW','PROTECTED_CATEGORY','SANCTIONED_STRENGTH','COOLING_PERIOD','STATION_RETENTION','JOINING_TIME_PAY');
CREATE TYPE g05_enforcement          AS ENUM ('HARD_BLOCK','SOFT_WARN','REQUIRE_OVERRIDE');
CREATE TYPE g05_ban_type             AS ENUM ('ELECTION_MCC','BUDGET','EXAM','DISASTER','OTHER');
CREATE TYPE g05_drive_type           AS ENUM ('ANNUAL','SEASONAL','AD_HOC','COUNSELLING');
CREATE TYPE g05_allotment_method     AS ENUM ('SENIORITY','MERIT','PREFERENCE','MANUAL','COUNSELLING');
CREATE TYPE g05_drive_status         AS ENUM ('DRAFT','OPEN','COUNSELLING','ALLOTTED','ORDERS_ISSUED','CLOSED','CANCELLED');
CREATE TYPE g05_strength_source      AS ENUM ('G06','G01','MANUAL_FALLBACK');

-- Clearance (P01 PARALLEL_ALL_OF) -----------------------------------------------------
CREATE TYPE g05_clearance_checklist_status AS ENUM ('OPEN','IN_PROGRESS','BLOCKED','CLEARED','CLEARED_WITH_DUES','CLEARED_WITH_DEEMED','CANCELLED');
CREATE TYPE g05_clearance_department AS ENUM ('IT','LIBRARY','ACCOUNTS','STORES','ADVANCES','ESTATE_QUARTERS','HR','OTHER');
CREATE TYPE g05_clearance_item_status AS ENUM ('PENDING','CLEARED','DUES_OUTSTANDING','WAIVED','DEEMED_CLEARED');
CREATE TYPE g05_escalation_tier      AS ENUM ('NONE','OFFICER','DEPT_HEAD','AUTHORITY');
CREATE TYPE g05_forced_action_type   AS ENUM ('DEEMED_CLEARED','HANDOVER_UNDER_PROTEST','DEEMED_RELIEF');

-- Charge handover ---------------------------------------------------------------------
CREATE TYPE g05_charge_phase         AS ENUM ('HANDOVER_SOURCE','ASSUMPTION_DEST');
CREATE TYPE g05_charge_type          AS ENUM ('FULL','ADDITIONAL','CURRENT_DUTIES');
CREATE TYPE g05_charge_handover_status AS ENUM ('DRAFT','SUBMITTED','ACCEPTED','DISPUTED','UNDER_PROTEST');

-- Relieving / joining -----------------------------------------------------------------
CREATE TYPE g05_day_half             AS ENUM ('FORENOON','AFTERNOON');
CREATE TYPE g05_relieving_order_status AS ENUM ('DRAFT','PENDING_CLEARANCE','PENDING_APPROVAL','ISSUED','RELIEVED','DEEMED_RELIEVED','CANCELLED');
CREATE TYPE g05_joining_report_status AS ENUM ('DRAFT','SUBMITTED','UNDER_VERIFICATION','JOINED_CONFIRMED','REJECTED','LATE_JOINING_REVIEW','ABANDONED');

-- Deputation --------------------------------------------------------------------------
CREATE TYPE g05_repatriation_status  AS ENUM ('ACTIVE','EXTENSION_REQUESTED','EXTENDED','REPATRIATION_DUE','REPATRIATED');

-- Representation / holds ---------------------------------------------------------------
CREATE TYPE g05_representation_type   AS ENUM ('REPRESENTATION','COURT_STAY','RETENTION_REQUEST');
CREATE TYPE g05_representation_filed_by AS ENUM ('EMPLOYEE','AUTHORITY','COURT','UNION');
CREATE TYPE g05_hold_from_stage       AS ENUM ('PRE_RELIEF','PRE_JOIN','ANY');
CREATE TYPE g05_representation_status  AS ENUM ('FILED','UNDER_REVIEW','HOLD_ACTIVE','UPHELD','REJECTED','VACATED','WITHDRAWN');
CREATE TYPE g05_representation_decision AS ENUM ('ALLOW','DENY','MODIFY','VACATE');

-- SR / signal outbox (frozen G12 write contract — BRD §5.2.15 R2/R3/R4) ----------------
CREATE TYPE g05_outbox_aggregate_type AS ENUM ('TRANSFER_ORDER','RELIEVING_ORDER','JOINING_REPORT');
CREATE TYPE g05_outbox_target_system  AS ENUM ('G12_SR','G10_PAYROLL','G01_MASTER','G09_DISCIPLINARY');
CREATE TYPE g05_outbox_event_type     AS ENUM (
    -- G12 SR codes (verbatim from the G12 catalog):
    'TRANSFER','RELIEVING','JOINING','MUTUAL_TRANSFER','TRANSFER_CANCELLED','RELIEVING_CANCELLED','JOINING_CANCELLED',
    -- Non-SR signal codes (G10/G01/G06/G09 targets):
    'PAY_CONTINUITY','ENTITLEMENT','LPC_REQUEST','POSTING_UPDATE','LICENCE_FEE_RECOVERY','SENIORITY_FEED','DISCIPLINARY_TRIGGER');
CREATE TYPE g05_outbox_status         AS ENUM ('PENDING','IN_FLIGHT','DELIVERED','FAILED','DEAD_LETTERED');

-- Vacancy / counselling / acknowledgement / quarters / sequences -----------------------
CREATE TYPE g05_reservation_state     AS ENUM ('RESERVED','VACATED_ON_RELIEF','FILLED_ON_JOIN','RELEASED','EXPIRED');
CREATE TYPE g05_ack_channel           AS ENUM ('IN_APP','EMAIL','SMS','REGISTERED_POST','HAND_DELIVERY','PUBLISHED_NOTICE');
CREATE TYPE g05_ack_status            AS ENUM ('SERVED','ACKNOWLEDGED','DEEMED_SERVED','REFUSED');
CREATE TYPE g05_sequence_scope        AS ENUM ('TRANSFER_ORDER','RELIEVING_ORDER','JOINING_REPORT','CLEARANCE','REPRESENTATION');
CREATE TYPE g05_turn_order_method     AS ENUM ('SENIORITY','MERIT');
CREATE TYPE g05_counselling_session_status AS ENUM ('SCHEDULED','IN_PROGRESS','PAUSED','COMPLETED','CANCELLED');
CREATE TYPE g05_choice_action         AS ENUM ('CHOSEN','PASSED','DECLINED','AUTO_PASS_TIMEOUT','ABSENT');
CREATE TYPE g05_quarter_retention_status AS ENUM ('OCCUPIED','RETENTION_REQUESTED','RETENTION_APPROVED','VACATION_DUE','VACATED','OVERSTAY');


-- =====================================================================================
-- SECTION 2 — MODULE-OWNED TABLES (dependency-ordered)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 2.1  transfer_policy_rules (config-cascade; versioned)  [BRD §5.2.3]
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_policy_rules (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,   -- null = tenant-global config
    rule_code         varchar(40) NOT NULL,                              -- VAL-MASTER-UNIQUE
    rule_type         g05_policy_rule_type NOT NULL,
    scope_cadre       varchar(40),                                       -- null = all cadres
    scope_org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,  -- null = global (cascade)
    param_value       jsonb NOT NULL,                                    -- e.g. {"months":36}
    enforcement       g05_enforcement NOT NULL DEFAULT 'HARD_BLOCK',
    effective_from    date,
    effective_to      date,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_policy_rules_code UNIQUE (tenant_id, rule_code),
    CONSTRAINT ck_transfer_policy_rules_window CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_transfer_policy_rules_tenant   ON transfer_policy_rules(tenant_id);
CREATE INDEX ix_transfer_policy_rules_entity   ON transfer_policy_rules(entity_id);
CREATE INDEX ix_transfer_policy_rules_type     ON transfer_policy_rules(rule_type);
CREATE INDEX ix_transfer_policy_rules_org_unit ON transfer_policy_rules(scope_org_unit_id);
CREATE INDEX ix_transfer_policy_rules_active   ON transfer_policy_rules(tenant_id) WHERE is_active = true;

-- -------------------------------------------------------------------------------------
-- 2.2  transfer_ban_periods (freeze/ban calendar)  [BRD §5.2.4]
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_ban_periods (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    title             varchar(120) NOT NULL,
    ban_type          g05_ban_type NOT NULL,
    start_date        date NOT NULL,
    end_date          date NOT NULL,
    scope_org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,  -- null = org-wide
    exception_grounds g05_ground[],                                      -- grounds allowed despite ban
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_transfer_ban_periods_window CHECK (end_date >= start_date)
);
CREATE INDEX ix_transfer_ban_periods_tenant   ON transfer_ban_periods(tenant_id);
CREATE INDEX ix_transfer_ban_periods_entity   ON transfer_ban_periods(entity_id);
CREATE INDEX ix_transfer_ban_periods_org_unit ON transfer_ban_periods(scope_org_unit_id);
CREATE INDEX ix_transfer_ban_periods_window   ON transfer_ban_periods(start_date, end_date) WHERE is_active = true;

-- -------------------------------------------------------------------------------------
-- 2.3  transfer_drives (bulk drive header)  [BRD §5.2.5]
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_drives (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    drive_code               varchar(30) NOT NULL,                       -- VAL-MASTER-UNIQUE
    title                    varchar(160) NOT NULL,
    cadre                    varchar(40),
    drive_type               g05_drive_type NOT NULL,
    preference_window_start  date,
    preference_window_end    date,
    allotment_method         g05_allotment_method NOT NULL DEFAULT 'SENIORITY',
    status                   g05_drive_status NOT NULL DEFAULT 'DRAFT',
    total_positions          integer,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
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
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    request_no                      varchar(30) NOT NULL,                -- e.g. TRQ-2026-000123
    employee_id                     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_type                   g05_transfer_type NOT NULL,
    request_origin                  g05_request_origin NOT NULL,
    source_org_unit_id              uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    requested_dest_org_unit_id      uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    mutual_counterpart_employee_id  uuid REFERENCES employees(id) ON DELETE RESTRICT,
    ground                          g05_ground,
    ground_details                  text,                                -- VAL-LEN(4000)
    supporting_document_ids         uuid[],                              -- G13 refs (non-sensitive)
    sensitive_document_ids          uuid[],                              -- G13 sensitive-class refs
    sensitive_ground                boolean NOT NULL DEFAULT false,      -- derived; gates restricted access + P05 logging
    linked_promotion_id             uuid,                                -- G06 reference
    linked_drive_id                 uuid REFERENCES transfer_drives(id) ON DELETE SET NULL,
    priority_category               g05_priority_category,
    status                          g05_transfer_request_status NOT NULL DEFAULT 'DRAFT',
    eligibility_result              jsonb,                               -- cached policy-check outcome
    workflow_instance_id            uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    requested_effective_date        date,                                -- VAL-EFFECTIVE
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
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
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                     uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    order_no                      varchar(30) NOT NULL,                  -- gapless statutory no. (§2.16)
    order_class                   g05_order_class NOT NULL,
    transfer_request_id           uuid REFERENCES transfer_requests(id) ON DELETE SET NULL,  -- null for direct admin orders
    employee_id                   uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_type                 g05_transfer_type NOT NULL,
    source_org_unit_id            uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    dest_org_unit_id              uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    source_designation_id         uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    dest_designation_id           uuid NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    order_date                    date NOT NULL,
    served_on_date                date,                                  -- FR-G05-020; basis for relieve-by
    acknowledged_at               timestamptz,
    relieve_by_date               date NOT NULL,                         -- statutory deadline
    expected_joining_date         date,
    joining_distance_band         g05_distance_band,
    joining_time_days             integer,
    joining_time_pay_admissible   boolean NOT NULL DEFAULT true,         -- FR-G05-015
    entitlement_ref               varchar(60),                           -- G10 entitlement signal ref
    in_transit_custody_org_unit_id uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    is_deputation                 boolean NOT NULL DEFAULT false,
    mutual_pair_order_id          uuid REFERENCES transfer_orders(id) ON DELETE SET NULL,     -- reciprocal (MUTUAL)
    drive_id                      uuid REFERENCES transfer_drives(id) ON DELETE SET NULL,
    status                        g05_transfer_order_status NOT NULL DEFAULT 'DRAFT',
    hold_active                   boolean NOT NULL DEFAULT false,        -- true under STAY_HOLD
    order_document_id             uuid REFERENCES documents(id) ON DELETE SET NULL,
    approved_by                   uuid REFERENCES users(id) ON DELETE SET NULL,               -- Transfer Authority
    approved_at                   timestamptz,
    workflow_instance_id          uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    revision_no                   integer NOT NULL DEFAULT 0,
    superseded_by_order_id        uuid REFERENCES transfer_orders(id) ON DELETE SET NULL,
    g05_source_id                 varchar(80),                           -- P06 legacy traceability/dedup
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid,
    updated_by                    uuid,
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
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    sequence_scope      g05_sequence_scope NOT NULL,
    office_org_unit_id  uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    fiscal_year         integer NOT NULL,
    next_value          bigint NOT NULL DEFAULT 1,                       -- row-locked counter
    reserved_high_water bigint NOT NULL DEFAULT 0,                       -- highest reserved
    prefix_template     varchar(40) NOT NULL,                            -- e.g. TO/{yyyy}/{mm}/{seq:04d}
    gap_audit_last_run  timestamptz,                                     -- JOB-G05-GAPAUDIT
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_order_number_sequences UNIQUE (tenant_id, sequence_scope, office_org_unit_id, fiscal_year),
    CONSTRAINT ck_order_number_sequences_hw CHECK (reserved_high_water >= 0 AND next_value >= 1)
);
CREATE INDEX ix_order_number_sequences_tenant ON order_number_sequences(tenant_id);
CREATE INDEX ix_order_number_sequences_office ON order_number_sequences(office_org_unit_id);

-- -------------------------------------------------------------------------------------
-- 2.7  order_acknowledgements (proof-of-service)  [BRD §5.2.17]  *** headline ***
-- -------------------------------------------------------------------------------------
CREATE TABLE order_acknowledgements (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id     uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    served_on_date        date NOT NULL,
    delivery_channel      g05_ack_channel NOT NULL,
    served_by             uuid REFERENCES users(id) ON DELETE SET NULL,  -- null for system channels
    acknowledgement_status g05_ack_status NOT NULL DEFAULT 'SERVED',
    acknowledged_at       timestamptz,
    deemed_served_reason   text,                                         -- JOB-G05-SERVE-DEEM
    proof_document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_order_acks_tenant   ON order_acknowledgements(tenant_id);
CREATE INDEX ix_order_acks_entity   ON order_acknowledgements(entity_id);
CREATE INDEX ix_order_acks_order    ON order_acknowledgements(transfer_order_id);
CREATE INDEX ix_order_acks_employee ON order_acknowledgements(employee_id);
CREATE INDEX ix_order_acks_status   ON order_acknowledgements(acknowledgement_status);
CREATE INDEX ix_order_acks_served   ON order_acknowledgements(served_on_date);
CREATE INDEX ix_order_acks_doc      ON order_acknowledgements(proof_document_id);

-- -------------------------------------------------------------------------------------
-- 2.8  transfer_representations (representations / stays / retention holds)  [BRD §5.2.14]  *** headline ***
-- -------------------------------------------------------------------------------------
CREATE TABLE transfer_representations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    representation_no    varchar(30) NOT NULL,                           -- e.g. REP-2026-000045
    transfer_order_id    uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    representation_type  g05_representation_type NOT NULL,
    filed_by             g05_representation_filed_by NOT NULL,
    authority_ref        varchar(120),                                   -- court/CAT case no.
    document_id          uuid REFERENCES documents(id) ON DELETE SET NULL,
    hold_from_stage      g05_hold_from_stage NOT NULL DEFAULT 'ANY',
    status               g05_representation_status NOT NULL DEFAULT 'FILED',
    decision             g05_representation_decision,
    decided_by           uuid REFERENCES users(id) ON DELETE SET NULL,   -- Transfer Authority
    decided_at           timestamptz,
    valid_until          date,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_transfer_representations_no UNIQUE (tenant_id, representation_no)
);
CREATE INDEX ix_transfer_reps_tenant   ON transfer_representations(tenant_id);
CREATE INDEX ix_transfer_reps_entity   ON transfer_representations(entity_id);
CREATE INDEX ix_transfer_reps_order    ON transfer_representations(transfer_order_id);
CREATE INDEX ix_transfer_reps_employee ON transfer_representations(employee_id);
CREATE INDEX ix_transfer_reps_status   ON transfer_representations(status);
CREATE INDEX ix_transfer_reps_doc      ON transfer_representations(document_id);
CREATE INDEX ix_transfer_reps_decider  ON transfer_representations(decided_by);
CREATE INDEX ix_transfer_reps_wf       ON transfer_representations(workflow_instance_id);

-- -------------------------------------------------------------------------------------
-- 2.9  vacancy_positions (strength read-through cache)  [BRD §5.2.7]
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 2.10 transfer_preferences (counselling preference list)  [BRD §5.2.6]
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 2.11 vacancy_reservations (vacancy lifecycle)  [BRD §5.2.16]  *** headline ***
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 2.12 clearance_checklists (no-dues header; subject of P01 PARALLEL_ALL_OF)  [BRD §5.2.8]  *** headline (no_dues) ***
-- -------------------------------------------------------------------------------------
CREATE TABLE clearance_checklists (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    checklist_no         varchar(30) NOT NULL,                          -- e.g. NOD-2026-000789
    transfer_order_id    uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    source_org_unit_id   uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- the PARALLEL_ALL_OF instance
    status               g05_clearance_checklist_status NOT NULL DEFAULT 'OPEN',
    total_items          integer NOT NULL DEFAULT 0,
    cleared_items        integer NOT NULL DEFAULT 0,
    deemed_items         integer NOT NULL DEFAULT 0,                    -- DEEMED_CLEARED/WAIVED count
    has_outstanding_dues boolean NOT NULL DEFAULT false,
    dues_recovery_ref    varchar(60),                                   -- G10 recovery linkage
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
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
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id              uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    clearance_checklist_id uuid NOT NULL REFERENCES clearance_checklists(id) ON DELETE RESTRICT,
    department_code        g05_clearance_department NOT NULL,
    workflow_branch_ref    varchar(60),                                 -- P01 PARALLEL_ALL_OF branch
    assigned_officer_id    uuid REFERENCES users(id) ON DELETE SET NULL,  -- Clearance Officer (P01 assignee)
    status                 g05_clearance_item_status NOT NULL DEFAULT 'PENDING',
    sla_due_at             timestamptz,                                 -- per-branch SLA (P01 runtime)
    escalation_tier        g05_escalation_tier NOT NULL DEFAULT 'NONE',
    escalated_at           timestamptz,
    forced_action_type     g05_forced_action_type,                      -- DEEMED_CLEARED when Authority-granted
    forced_action_reason   text,                                        -- mandatory when deemed (ERR-G05-REASON-REQ)
    forced_action_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    dues_amount            numeric(14,2),                               -- INR (VAL-CURRENCY)
    dues_description       text,
    remarks                text,
    evidence_document_id   uuid REFERENCES documents(id) ON DELETE SET NULL,
    cleared_at             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_by             uuid,
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
-- 2.14 charge_handovers (handover/assumption; under-protest)  [BRD §5.2.10]  *** headline ***
-- -------------------------------------------------------------------------------------
CREATE TABLE charge_handovers (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id         uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    phase                     g05_charge_phase NOT NULL,
    relinquishing_employee_id uuid REFERENCES employees(id) ON DELETE RESTRICT,
    receiving_employee_id     uuid REFERENCES employees(id) ON DELETE RESTRICT,  -- successor/link officer/custody-of-office
    charge_type               g05_charge_type NOT NULL DEFAULT 'FULL',
    handover_date             date NOT NULL,
    assets_handed             jsonb,                                    -- inventory w/ asset ids
    cash_imprest_amount       numeric(14,2),                            -- VAL-CURRENCY
    pending_files_count       integer,
    handover_note_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    status                    g05_charge_handover_status NOT NULL DEFAULT 'DRAFT',
    under_protest             boolean NOT NULL DEFAULT false,           -- FR-G05-016
    dispute_sla_due_at        timestamptz,                              -- JOB-G05-DISPUTE-SLA
    forced_action_type        g05_forced_action_type,                  -- HANDOVER_UNDER_PROTEST when forced
    forced_action_reason      text,
    forced_action_by          uuid REFERENCES users(id) ON DELETE SET NULL,
    accepted_by               uuid REFERENCES users(id) ON DELETE SET NULL,
    accepted_at               timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_charge_handovers_forced_reason CHECK (forced_action_type IS NULL OR forced_action_reason IS NOT NULL)
);
CREATE INDEX ix_charge_handovers_tenant      ON charge_handovers(tenant_id);
CREATE INDEX ix_charge_handovers_entity      ON charge_handovers(entity_id);
CREATE INDEX ix_charge_handovers_order       ON charge_handovers(transfer_order_id);
CREATE INDEX ix_charge_handovers_relinquish  ON charge_handovers(relinquishing_employee_id);
CREATE INDEX ix_charge_handovers_receiving   ON charge_handovers(receiving_employee_id);
CREATE INDEX ix_charge_handovers_status      ON charge_handovers(status);
CREATE INDEX ix_charge_handovers_dispute_sla ON charge_handovers(dispute_sla_due_at) WHERE status = 'DISPUTED';
CREATE INDEX ix_charge_handovers_doc         ON charge_handovers(handover_note_document_id);

-- -------------------------------------------------------------------------------------
-- 2.15 relieving_orders (deemed-relief; pay-continuity)  [BRD §5.2.11]
-- -------------------------------------------------------------------------------------
CREATE TABLE relieving_orders (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    relieving_order_no          varchar(30) NOT NULL,                   -- gapless, e.g. RO/2026/04/0456
    transfer_order_id           uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    clearance_checklist_id      uuid NOT NULL REFERENCES clearance_checklists(id) ON DELETE RESTRICT,
    last_working_day            date NOT NULL,                          -- VAL-EFFECTIVE
    relieving_time              g05_day_half NOT NULL DEFAULT 'AFTERNOON',  -- load-bearing (§16.9)
    relieved                    boolean NOT NULL DEFAULT false,
    deemed_relief               boolean NOT NULL DEFAULT false,         -- FR-G05-016
    forced_action_reason        text,                                   -- mandatory when deemed_relief
    forced_action_by            uuid REFERENCES users(id) ON DELETE SET NULL,
    pay_continuity_signalled    boolean NOT NULL DEFAULT false,         -- G10 continue pay
    lpc_requested               boolean NOT NULL DEFAULT false,         -- LPC trigger to G10
    relieving_order_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
    status                      g05_relieving_order_status NOT NULL DEFAULT 'DRAFT',
    issued_by                   uuid REFERENCES users(id) ON DELETE SET NULL,
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
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
-- -------------------------------------------------------------------------------------
CREATE TABLE joining_reports (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    joining_report_no           varchar(30) NOT NULL,                   -- gapless, e.g. JR/2026/04/0456
    transfer_order_id           uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    relieving_order_id          uuid REFERENCES relieving_orders(id) ON DELETE SET NULL,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    dest_org_unit_id            uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    reported_date               date NOT NULL,
    joining_date                date NOT NULL,                          -- statutory; VAL-EFFECTIVE
    joining_time                g05_day_half NOT NULL DEFAULT 'FORENOON',
    joining_sequence_no         integer,                                -- inter-se order (FR-G05-021)
    inter_se_tiebreak_key       varchar(60),                            -- deterministic tie-break; exposed to G06
    transit_days                integer,                                -- derived: joining_date - LWD - holidays
    transit_within_admissible   boolean,                                -- vs joining_time_days
    service_continuity_asserted boolean NOT NULL DEFAULT false,         -- SR JOINING asserts no break
    charge_assumption_id        uuid REFERENCES charge_handovers(id) ON DELETE SET NULL,
    pay_continuity_resumed      boolean NOT NULL DEFAULT false,         -- G10 confirmed at destination
    joining_document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    status                      g05_joining_report_status NOT NULL DEFAULT 'DRAFT',
    verified_by                 uuid REFERENCES users(id) ON DELETE SET NULL,  -- HR Destination
    workflow_instance_id        uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
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
CREATE INDEX ix_joining_reports_assumption ON joining_reports(charge_assumption_id);
CREATE INDEX ix_joining_reports_verifier   ON joining_reports(verified_by);
CREATE INDEX ix_joining_reports_wf         ON joining_reports(workflow_instance_id);

-- -------------------------------------------------------------------------------------
-- 2.17 deputation_records (deputation/repatriation)  [BRD §5.2.13]
-- -------------------------------------------------------------------------------------
CREATE TABLE deputation_records (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    transfer_order_id     uuid NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    borrowing_org_unit_id uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,  -- may be EXTERNAL type
    lending_org_unit_id   uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    deputation_terms      jsonb,                                        -- pay protection, allowance %, terms ref
    start_date            date NOT NULL,
    initial_tenure_months integer NOT NULL,
    current_end_date      date NOT NULL,
    max_tenure_months     integer,                                      -- policy cap
    extension_count       integer NOT NULL DEFAULT 0,
    repatriation_due_date date,
    repatriation_status   g05_repatriation_status NOT NULL DEFAULT 'ACTIVE',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_deputation_records_end  CHECK (current_end_date >= start_date),
    CONSTRAINT ck_deputation_records_repat CHECK (repatriation_due_date IS NULL OR repatriation_due_date >= start_date)
);
CREATE INDEX ix_deputation_records_tenant    ON deputation_records(tenant_id);
CREATE INDEX ix_deputation_records_entity    ON deputation_records(entity_id);
CREATE INDEX ix_deputation_records_order     ON deputation_records(transfer_order_id);
CREATE INDEX ix_deputation_records_employee  ON deputation_records(employee_id);
CREATE INDEX ix_deputation_records_borrowing ON deputation_records(borrowing_org_unit_id);
CREATE INDEX ix_deputation_records_lending   ON deputation_records(lending_org_unit_id);
CREATE INDEX ix_deputation_records_status    ON deputation_records(repatriation_status);
CREATE INDEX ix_deputation_records_repat_due ON deputation_records(repatriation_due_date);

-- -------------------------------------------------------------------------------------
-- 2.18 counselling_sessions (interactive allotment header)  [BRD §5.2.19]  *** headline ***
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 2.19 counselling_choices (immutable choice log; append-only on P05 substrate)  [BRD §5.2.20]  *** headline ***
--      APPEND-ONLY: created_at/created_by only — no updated_at, no is_deleted (CONVENTIONS §3).
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 2.20 quarter_allotments (estate retention; licence-fee)  [BRD §5.2.21]  *** headline ***
-- -------------------------------------------------------------------------------------
CREATE TABLE quarter_allotments (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    transfer_order_id         uuid REFERENCES transfer_orders(id) ON DELETE SET NULL,  -- transfer occasioning retention
    quarter_ref               varchar(60) NOT NULL,                    -- accommodation identifier
    org_unit_id               uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,  -- estate-owning office
    retention_allowed         boolean NOT NULL DEFAULT false,          -- Authority-approved
    retention_status          g05_quarter_retention_status NOT NULL DEFAULT 'OCCUPIED',
    vacate_by_date            date,                                    -- statutory vacation deadline
    vacated_on                date,
    licence_fee_rate          numeric(14,2),                           -- INR/month (normal/penal; VAL-CURRENCY)
    penal_rate_applies        boolean NOT NULL DEFAULT false,          -- JOB-G05-QTR-OVERSTAY
    licence_fee_recovery_ref  varchar(60),                             -- G10 recovery signal ref
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid,
    updated_by                uuid,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_quarter_allotments_vacated CHECK (vacated_on IS NULL OR vacate_by_date IS NULL OR vacated_on >= vacate_by_date - 3650)
);
CREATE INDEX ix_quarter_allotments_tenant   ON quarter_allotments(tenant_id);
CREATE INDEX ix_quarter_allotments_entity   ON quarter_allotments(entity_id);
CREATE INDEX ix_quarter_allotments_employee ON quarter_allotments(employee_id);
CREATE INDEX ix_quarter_allotments_order    ON quarter_allotments(transfer_order_id);
CREATE INDEX ix_quarter_allotments_orgunit  ON quarter_allotments(org_unit_id);
CREATE INDEX ix_quarter_allotments_status   ON quarter_allotments(retention_status);
CREATE INDEX ix_quarter_allotments_vacate   ON quarter_allotments(vacate_by_date) WHERE retention_status IN ('VACATION_DUE','RETENTION_APPROVED','OVERSTAY');

-- -------------------------------------------------------------------------------------
-- 2.21 sr_outbox (transactional outbox; frozen G12 write contract)  [BRD §5.2.15]  *** headline ***
--      Mutable work-queue: dispatch state churns; rows are RETAINED (no soft delete) and
--      archived by JOB-G05-OUTBOX per BRD retention. WRITER-ONLY relay to POST /sr/ingest
--      (reversals -> POST /sr/ingest/reversal); NEVER a direct service_register_events INSERT.
-- -------------------------------------------------------------------------------------
CREATE TABLE sr_outbox (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),       -- outbox_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    aggregate_type    g05_outbox_aggregate_type NOT NULL,
    aggregate_id      uuid NOT NULL,                                    -- FK-by-convention to source row
    target_system     g05_outbox_target_system NOT NULL,
    event_type        g05_outbox_event_type NOT NULL,
    payload           jsonb NOT NULL,                                   -- G12 ingest envelope for G12_SR rows
                                                                        -- (dedup tuple + fact_key + tenant/entity + is_reversal)
    idempotency_key   varchar(120) NOT NULL,                           -- {target}:{event}:{aggr}:{id}:{rev}
    status            g05_outbox_status NOT NULL DEFAULT 'PENDING',
    attempt_count     integer NOT NULL DEFAULT 0,
    max_attempts      integer NOT NULL DEFAULT 8,                       -- exponential backoff
    next_attempt_at   timestamptz,
    last_error        text,                                            -- X.3 per-integration error mapping
    delivered_at      timestamptz,
    dead_lettered_at  timestamptz,                                     -- after max_attempts
    correlation_id    text,                                            -- X-Correlation-Id
    created_at        timestamptz NOT NULL DEFAULT now(),              -- append; no is_deleted (retention-archived)
    updated_at        timestamptz NOT NULL DEFAULT now(),              -- dispatch-state bump
    created_by        uuid,
    updated_by        uuid,
    CONSTRAINT uq_sr_outbox_idem UNIQUE (tenant_id, idempotency_key),  -- rule 8 SR posting completeness
    CONSTRAINT ck_sr_outbox_attempts CHECK (attempt_count >= 0 AND attempt_count <= max_attempts)
);
CREATE INDEX ix_sr_outbox_tenant     ON sr_outbox(tenant_id);
CREATE INDEX ix_sr_outbox_entity     ON sr_outbox(entity_id);
CREATE INDEX ix_sr_outbox_aggregate  ON sr_outbox(aggregate_type, aggregate_id);
CREATE INDEX ix_sr_outbox_target     ON sr_outbox(target_system);
CREATE INDEX ix_sr_outbox_event_type ON sr_outbox(event_type);
CREATE INDEX ix_sr_outbox_status     ON sr_outbox(status);
-- JOB-G05-OUTBOX dispatch scan: due, undelivered rows.
CREATE INDEX ix_sr_outbox_dispatch   ON sr_outbox(next_attempt_at) WHERE status IN ('PENDING','FAILED');
COMMENT ON TABLE sr_outbox IS 'G04-style transactional outbox (FR-G05-012). Written in the same DB tx as the local state change; dispatched by JOB-G05-OUTBOX over X.1/X.3. G12_SR rows relay to POST /api/v1/sr/ingest.';


-- =====================================================================================
-- SECTION 3 — ROW-LEVEL SECURITY (P02 data-scope substrate; CONVENTIONS §6)
-- =====================================================================================
-- Canonical tenant_isolation policy applied to every G05 table, including the append-only
-- counselling_choices (read isolation) and the sr_outbox work-queue.
DO $$
DECLARE
    t text;
    g05_tables text[] := ARRAY[
        'transfer_policy_rules','transfer_ban_periods','transfer_drives','transfer_requests',
        'transfer_orders','order_number_sequences','order_acknowledgements','transfer_representations',
        'vacancy_positions','transfer_preferences','vacancy_reservations','clearance_checklists',
        'clearance_items','charge_handovers','relieving_orders','joining_reports','deputation_records',
        'counselling_sessions','counselling_choices','quarter_allotments','sr_outbox'
    ];
BEGIN
    FOREACH t IN ARRAY g05_tables LOOP
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
-- SECTION 4 — SAMPLE SEED ROWS (illustrative; reference 00-platform-core seed UUIDs)
-- =====================================================================================
-- Scenario: Anjali Rao (GOV-100245, emp ...901) transferred REV-HQ (...301) -> Assessment
-- Section (...302). Core seed FK targets used: tenant ...111, entity ...201, org_units
-- ...301/...302, designation ...701, employees ...901/...902. One HR-officer user is seeded
-- to satisfy NOT NULL user FKs (presiding_officer_id, recorded_by). GUCs set so RLS passes.

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- A user principal for officer/approver references (none seeded in core) ----------------
INSERT INTO users (id, tenant_id, entity_id, username, official_email, auth_method, status, mfa_enabled)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccc01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','hr.officer.rev','hr.officer.rev@gov.example','PASSWORD','ACTIVE', true)
ON CONFLICT DO NOTHING;

-- transfer_drives ---------------------------------------------------------------------
INSERT INTO transfer_drives (id, tenant_id, entity_id, drive_code, title, cadre, drive_type, allotment_method, status, total_positions)
VALUES
 ('d5000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DRIVE-2026-ANNUAL','Annual Administrative Transfer Drive 2026','ADMIN','ANNUAL','SENIORITY','OPEN',120),
 ('d5000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DRIVE-2026-CNS','Counselling Drive — Revenue 2026','ADMIN','COUNSELLING','COUNSELLING','COUNSELLING',40);

-- transfer_requests -------------------------------------------------------------------
INSERT INTO transfer_requests (id, tenant_id, entity_id, request_no, employee_id, transfer_type, request_origin, source_org_unit_id, requested_dest_org_unit_id, ground, status, linked_drive_id, requested_effective_date)
VALUES
 ('e5000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRQ-2026-000123','99999999-9999-9999-9999-999999999901','REQUEST','SELF','33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','OWN_REQUEST','ORDER_ISSUED','d5000000-0000-0000-0000-0000000000a1','2026-04-01'),
 ('e5000000-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRQ-2026-000124','99999999-9999-9999-9999-999999999902','ADMINISTRATIVE','ADMIN','33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333301','ADMINISTRATIVE','SUBMITTED',NULL,'2026-04-10');

-- order_number_sequences --------------------------------------------------------------
INSERT INTO order_number_sequences (id, tenant_id, entity_id, sequence_scope, office_org_unit_id, fiscal_year, next_value, reserved_high_water, prefix_template)
VALUES
 ('f5000000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRANSFER_ORDER','33333333-3333-3333-3333-333333333301',2026,3,2,'TO/{yyyy}/{mm}/{seq:04d}'),
 ('f5000000-0000-0000-0000-0000000000c2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RELIEVING_ORDER','33333333-3333-3333-3333-333333333301',2026,2,1,'RO/{yyyy}/{mm}/{seq:04d}');

-- transfer_orders ---------------------------------------------------------------------
INSERT INTO transfer_orders
 (id, tenant_id, entity_id, order_no, order_class, transfer_request_id, employee_id, transfer_type,
  source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id,
  order_date, served_on_date, relieve_by_date, expected_joining_date, joining_distance_band, joining_time_days,
  joining_time_pay_admissible, in_transit_custody_org_unit_id, drive_id, status, approved_by, approved_at, revision_no)
VALUES
 ('a5000000-0000-0000-0000-0000000000d1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TO/2026/04/0001','SUBSTANTIVE','e5000000-0000-0000-0000-0000000000b1','99999999-9999-9999-9999-999999999901','REQUEST',
  '33333333-3333-3333-3333-333333333301','33333333-3333-3333-3333-333333333302','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701',
  '2026-04-02','2026-04-05','2026-04-12','2026-04-15','SHORT',7,
  true,'33333333-3333-3333-3333-333333333302','d5000000-0000-0000-0000-0000000000a1','IN_TRANSIT','cccccccc-cccc-cccc-cccc-cccccccccc01','2026-04-03 10:00+05:30',0),
 ('a5000000-0000-0000-0000-0000000000d2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TO/2026/04/0002','SUBSTANTIVE','e5000000-0000-0000-0000-0000000000b2','99999999-9999-9999-9999-999999999902','ADMINISTRATIVE',
  '33333333-3333-3333-3333-333333333302','33333333-3333-3333-3333-333333333301','77777777-7777-7777-7777-777777777701','77777777-7777-7777-7777-777777777701',
  '2026-04-11',NULL,'2026-04-25',NULL,'LOCAL',NULL,
  true,NULL,NULL,'DRAFT',NULL,NULL,0);

-- order_acknowledgements --------------------------------------------------------------
INSERT INTO order_acknowledgements (id, tenant_id, entity_id, transfer_order_id, employee_id, served_on_date, delivery_channel, served_by, acknowledgement_status, acknowledged_at)
VALUES
 ('a5000000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999901','2026-04-05','EMAIL','cccccccc-cccc-cccc-cccc-cccccccccc01','ACKNOWLEDGED','2026-04-05 14:20+05:30');

-- transfer_representations -------------------------------------------------------------
INSERT INTO transfer_representations (id, tenant_id, entity_id, representation_no, transfer_order_id, employee_id, representation_type, filed_by, hold_from_stage, status)
VALUES
 ('a5000000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','REP-2026-000045','a5000000-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999901','RETENTION_REQUEST','EMPLOYEE','PRE_RELIEF','REJECTED');

-- vacancy_positions + vacancy_reservations --------------------------------------------
INSERT INTO vacancy_positions (id, tenant_id, entity_id, org_unit_id, designation_id, cadre, sanctioned_strength_cached, filled_count_cached, reserved_count, strength_as_of, strength_source, drive_id, is_published)
VALUES
 ('a5000000-0000-0000-0000-00000000aa01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','33333333-3333-3333-3333-333333333302','77777777-7777-7777-7777-777777777701','ADMIN',5,3,1, now(),'G06','d5000000-0000-0000-0000-0000000000a1', true);

INSERT INTO vacancy_reservations (id, tenant_id, entity_id, vacancy_position_id, transfer_order_id, employee_id, drive_id, lifecycle_state, vacated_at)
VALUES
 ('a5000000-0000-0000-0000-00000000ab01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-00000000aa01','a5000000-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999901','d5000000-0000-0000-0000-0000000000a1','VACATED_ON_RELIEF','2026-04-12 12:00+05:30');

-- clearance_checklists + clearance_items (no-dues; P01 PARALLEL_ALL_OF) ----------------
INSERT INTO clearance_checklists (id, tenant_id, entity_id, checklist_no, transfer_order_id, employee_id, source_org_unit_id, status, total_items, cleared_items, deemed_items, has_outstanding_dues)
VALUES
 ('a5000000-0000-0000-0000-00000000ac01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','NOD-2026-000789','a5000000-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301','CLEARED_WITH_DEEMED',3,2,1, false);

INSERT INTO clearance_items (id, tenant_id, entity_id, clearance_checklist_id, department_code, assigned_officer_id, status, cleared_at, forced_action_type, forced_action_reason, forced_action_by, dues_amount)
VALUES
 ('a5000000-0000-0000-0000-00000000ad01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-00000000ac01','IT','cccccccc-cccc-cccc-cccc-cccccccccc01','CLEARED','2026-04-08 11:00+05:30',NULL,NULL,NULL,NULL),
 ('a5000000-0000-0000-0000-00000000ad02','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-00000000ac01','ACCOUNTS','cccccccc-cccc-cccc-cccc-cccccccccc01','CLEARED','2026-04-09 09:30+05:30',NULL,NULL,NULL,NULL),
 ('a5000000-0000-0000-0000-00000000ad03','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-00000000ac01','ESTATE_QUARTERS','cccccccc-cccc-cccc-cccc-cccccccccc01','DEEMED_CLEARED','2026-04-10 16:00+05:30','DEEMED_CLEARED','SLA breached; Authority stand-cleared the estate branch (FR-G05-016).','cccccccc-cccc-cccc-cccc-cccccccccc01',NULL);

-- charge_handovers --------------------------------------------------------------------
INSERT INTO charge_handovers (id, tenant_id, entity_id, transfer_order_id, phase, relinquishing_employee_id, receiving_employee_id, charge_type, handover_date, pending_files_count, status, under_protest, accepted_by, accepted_at)
VALUES
 ('a5000000-0000-0000-0000-00000000ae01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-0000000000d1','HANDOVER_SOURCE','99999999-9999-9999-9999-999999999901','99999999-9999-9999-9999-999999999902','FULL','2026-04-12',4,'ACCEPTED', false,'cccccccc-cccc-cccc-cccc-cccccccccc01','2026-04-12 13:00+05:30');

-- relieving_orders --------------------------------------------------------------------
INSERT INTO relieving_orders (id, tenant_id, entity_id, relieving_order_no, transfer_order_id, employee_id, clearance_checklist_id, last_working_day, relieving_time, relieved, pay_continuity_signalled, lpc_requested, status, issued_by)
VALUES
 ('a5000000-0000-0000-0000-00000000af01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RO/2026/04/0456','a5000000-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999901','a5000000-0000-0000-0000-00000000ac01','2026-04-12','AFTERNOON', true, true, true,'RELIEVED','cccccccc-cccc-cccc-cccc-cccccccccc01');

-- joining_reports ---------------------------------------------------------------------
INSERT INTO joining_reports (id, tenant_id, entity_id, joining_report_no, transfer_order_id, relieving_order_id, employee_id, dest_org_unit_id, reported_date, joining_date, joining_time, joining_sequence_no, inter_se_tiebreak_key, transit_days, transit_within_admissible, service_continuity_asserted, charge_assumption_id, pay_continuity_resumed, status, verified_by)
VALUES
 ('a5000000-0000-0000-0000-00000000ba01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','JR/2026/04/0456','a5000000-0000-0000-0000-0000000000d1','a5000000-0000-0000-0000-00000000af01','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333302','2026-04-15','2026-04-15','FORENOON',1,'GOV-100245',3, true, true,'a5000000-0000-0000-0000-00000000ae01', true,'JOINED_CONFIRMED','cccccccc-cccc-cccc-cccc-cccccccccc01');

-- counselling_sessions + counselling_choices ------------------------------------------
INSERT INTO counselling_sessions (id, tenant_id, entity_id, session_code, drive_id, scheduled_at, turn_order_method, status, presiding_officer_id, total_candidates, completed_candidates)
VALUES
 ('a5000000-0000-0000-0000-00000000bb01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CNS-2026-ANNUAL-01','d5000000-0000-0000-0000-0000000000a2','2026-04-20 10:00+05:30','SENIORITY','IN_PROGRESS','cccccccc-cccc-cccc-cccc-cccccccccc01',40,1);

INSERT INTO counselling_choices (id, tenant_id, entity_id, session_id, employee_id, turn_position, vacancy_position_id, choice_action, choice_made_at, recorded_by, remarks)
VALUES
 ('a5000000-0000-0000-0000-00000000bc01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','a5000000-0000-0000-0000-00000000bb01','99999999-9999-9999-9999-999999999901',1,'a5000000-0000-0000-0000-00000000aa01','CHOSEN','2026-04-20 10:05+05:30','cccccccc-cccc-cccc-cccc-cccccccccc01','Chose Assessment Section on turn 1.');

-- quarter_allotments ------------------------------------------------------------------
INSERT INTO quarter_allotments (id, tenant_id, entity_id, employee_id, transfer_order_id, quarter_ref, org_unit_id, retention_allowed, retention_status, vacate_by_date, licence_fee_rate, penal_rate_applies)
VALUES
 ('a5000000-0000-0000-0000-00000000bd01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','a5000000-0000-0000-0000-0000000000d1','TYPE-IV/REV-HQ/B-12','33333333-3333-3333-3333-333333333301', true,'RETENTION_APPROVED','2026-06-30',4500.00, false);

-- sr_outbox (G12 SR ingest envelope; reversal-capable) --------------------------------
INSERT INTO sr_outbox (id, tenant_id, entity_id, aggregate_type, aggregate_id, target_system, event_type, payload, idempotency_key, status, attempt_count, delivered_at, correlation_id)
VALUES
 ('a5000000-0000-0000-0000-00000000be01','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRANSFER_ORDER','a5000000-0000-0000-0000-0000000000d1','G12_SR','TRANSFER',
  '{"source_module":"G05","source_reference_id":"TO/2026/04/0001","source_event_version":1,"fact_key":"GOV-100245:TRANSFER:2026-04-15","tenant_id":"11111111-1111-1111-1111-111111111111","entity_id":"22222222-2222-2222-2222-222222222201","is_reversal":false,"order_no":"TO/2026/04/0001","employee_id":"99999999-9999-9999-9999-999999999901"}',
  'G12_SR:TRANSFER:TRANSFER_ORDER:a5000000-0000-0000-0000-0000000000d1:0','DELIVERED',1,'2026-04-15 18:00+05:30','corr-g05-0001'),
 ('a5000000-0000-0000-0000-00000000be02','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','RELIEVING_ORDER','a5000000-0000-0000-0000-00000000af01','G12_SR','RELIEVING',
  '{"source_module":"G05","source_reference_id":"RO/2026/04/0456","source_event_version":1,"fact_key":"GOV-100245:RELIEVING:2026-04-12","tenant_id":"11111111-1111-1111-1111-111111111111","entity_id":"22222222-2222-2222-2222-222222222201","is_reversal":false,"last_working_day":"2026-04-12"}',
  'G12_SR:RELIEVING:RELIEVING_ORDER:a5000000-0000-0000-0000-00000000af01:0','PENDING',0,NULL,'corr-g05-0002'),
 ('a5000000-0000-0000-0000-00000000be03','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','TRANSFER_ORDER','a5000000-0000-0000-0000-0000000000d1','G10_PAYROLL','PAY_CONTINUITY',
  '{"source_module":"G05","source_reference_id":"TO/2026/04/0001","employee_id":"99999999-9999-9999-9999-999999999901","action":"CONTINUE","custody_org_unit":"33333333-3333-3333-3333-333333333302"}',
  'G10_PAYROLL:PAY_CONTINUITY:TRANSFER_ORDER:a5000000-0000-0000-0000-0000000000d1:0','PENDING',0,NULL,'corr-g05-0003');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 05-G05-transfer-relieving-joining.sql
-- =====================================================================================
