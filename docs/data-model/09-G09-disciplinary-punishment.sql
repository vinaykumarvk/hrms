-- =====================================================================================
-- GOVERNMENT HRMS — G09 EMPLOYEE DISCIPLINARY CASES & PUNISHMENT MANAGEMENT
-- (09-G09-disciplinary-punishment.sql)
-- =====================================================================================
-- Module-owned (net-new gov) DDL for G09. Authored from:
--   docs/brd/v3/G09-disciplinary-cases-punishment.md   (§5 entities E1..E30, §5.5 enums,
--                                                        §5.6 integrity rules, §5.7 samples)
--   docs/data-model/CONVENTIONS.md                      (mandatory conventions)
--   docs/data-model/00-platform-core.sql                (shared core — FK targets)
--
-- =====================================================================================
-- BUILD NOTES (read before running)
-- =====================================================================================
-- ORDERING. Load AFTER 00-platform-core.sql (and after 01-G01 if present). This file FKs
--   to core tables created in 00: tenants, entities, org_units, designations, employees,
--   service_register_events, documents. It NEVER redefines them (CONVENTIONS §8).
--   Run order:  psql -v ON_ERROR_STOP=1 -f 00-platform-core.sql -f 09-G09-...sql
--
-- SCOPE. 30 module-owned tables = BRD §5.1 entity inventory E1..E30. Tables are created in
--   dependency order so every FK target exists before its referrers (reference data first:
--   procedure_templates, authority_competence; then disciplinary_cases and its satellites).
--
-- CORE-TABLE ASSUMPTIONS (referenced, never redefined):
--   * employees / org_units / designations — owned by G01/P04. G09 reads only. All actor,
--     officer, authority and respondent person columns FK employees(id): RESTRICT where the
--     BRD marks them NOT NULL, SET NULL where nullable/owner-may-vanish.
--   * documents — G13 vault. Order/charge-sheet/exhibit/advice PDFs referenced by id (SET NULL).
--   * service_register_events — G12 statutory ledger. G09 is the canonical disciplinary WRITER
--     (penalty/exoneration/suspension events) via G12's ingestion contract: dedup tuple
--     (source_module='G09', source_reference_id, source_event_version) + fact_key. G09 posts
--     MINOR_PENALTY / MAJOR_PENALTY / SUSPENSION / *_REVERSAL facts; it NEVER mutates the
--     ledger directly. This file defines NO SR ledger table — penalty_orders.sr_event_id is a
--     read-only correlation FK to the posted core row. Idempotency of posts is held in
--     idempotency_keys (scope POST_TO_SR) per DI-10/FR-G09-013.
--   * workflows / workflow_instances / workflow_actions — P01 engine. G09 due-process stages
--     (charge approval, inquiry, show-cause, order, appeal) run as configured W.1 workflow
--     instances keyed by subject_ref='disciplinary_cases:<id>'; no module column re-implements
--     the engine.
--
-- TAMPER-EVIDENCE. Court-grade audit = P05 dual-log (DB trigger -> core audit_log) +
--   OPEN-PLAT-03 platform hash-chaining. There is NO G09-owned hash-chain table. E19
--   case_timeline_events is a per-case append-only SLA/stage ledger that RIDES ON the P05
--   substrate; it carries seq_no/prev_hash/row_hash for the FR-G09-027 verify endpoint but is
--   not the statutory chain of record (CONVENTIONS §7, BRD §5.4).
--
-- AUDIT / LEDGERS. P05 captures every INSERT/UPDATE/soft-delete on business tables via DB
--   trigger into core audit_log; G09 defines no private audit log. Append-only ledgers
--   (case_timeline_events, sla_pause_events) carry ONLY created_at/created_by — no updated_at,
--   no is_deleted (CONVENTIONS §3; DI-12). idempotency_keys is an insert-once dedup store,
--   TTL-pruned (no is_deleted). All other tables carry the standard actor/timestamp +
--   is_deleted soft-delete columns.
--
-- TENANCY/RLS. Every table carries tenant_id (NOT NULL) + entity_id; Section 3 enables the
--   canonical tenant_isolation RLS policy (CONVENTIONS §6) on all 30 tables (append-only
--   ledgers included — read isolation). Module ids: VAL-G09-*, JOB-G09-*, MSG-G09-*, ERR-G09-*.
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G09 closed enumerations; UPPER_SNAKE values, g09_ prefix)
-- =====================================================================================
-- Closed lifecycle/classification enumerations -> Postgres ENUM (CONVENTIONS §4). Tenant-
-- configurable value sets (jurisdiction_code, competence_set_code, subject_cadre) stay as
-- text codes validated against master/reference rows, never DDL enums.

-- Case taxonomy & lifecycle -----------------------------------------------------------
CREATE TYPE g09_case_type           AS ENUM ('MAJOR_PENALTY_TRACK','MINOR_PENALTY_TRACK','VIGILANCE','ADMINISTRATIVE');
CREATE TYPE g09_misconduct_category AS ENUM ('FINANCIAL_IRREGULARITY','CORRUPTION','NEGLIGENCE','INSUBORDINATION','ABSENCE_UNAUTHORISED','MORAL_TURPITUDE','MISUSE_OF_OFFICE','DATA_BREACH','HARASSMENT','OTHER');
CREATE TYPE g09_case_status         AS ENUM ('OPEN','INQUIRY','DECISION_PENDING','PENALTY_IMPOSED','EXONERATED','DROPPED','UNDER_APPEAL','ABATED','CLOSED');
CREATE TYPE g09_case_stage          AS ENUM ('INTAKE','PRELIMINARY_INQUIRY','CHARGE','DEFENCE','INQUIRY_SETUP','INQUIRY','INQUIRY_REPORT','DA_CONSIDERATION','CONSULTATION','SHOW_CAUSE','ORDER','SR_POSTING','APPEAL','CLOSED');

-- Complaint / triage ------------------------------------------------------------------
CREATE TYPE g09_complaint_source    AS ENUM ('INTERNAL','PUBLIC','ANONYMOUS','AUDIT','MEDIA','CVC','SUO_MOTU');
CREATE TYPE g09_triage_decision     AS ENUM ('FILE_CASE','PRELIMINARY_INQUIRY','CLOSE_NO_ACTION','TRANSFER_AGENCY');

-- Preliminary inquiry -----------------------------------------------------------------
CREATE TYPE g09_pi_status           AS ENUM ('ORDERED','IN_PROGRESS','SUBMITTED','CLOSED');
CREATE TYPE g09_pi_recommendation   AS ENUM ('PROCEED_MAJOR','PROCEED_MINOR','DROP','ADMIN_ADVICE');

-- Suspension (parallel track) ---------------------------------------------------------
CREATE TYPE g09_suspension_type     AS ENUM ('ORDERED','DEEMED','CONTINUED');
CREATE TYPE g09_suspension_status   AS ENUM ('ACTIVE','REVOKED','EXTENDED','DEEMED_REVOKED');

-- Charge / defence --------------------------------------------------------------------
CREATE TYPE g09_penalty_track       AS ENUM ('MINOR','MAJOR');
CREATE TYPE g09_charge_sheet_status AS ENUM ('DRAFT','ISSUED','SERVED','RESPONDED','WITHDRAWN');
CREATE TYPE g09_article_finding     AS ENUM ('PROVED','NOT_PROVED','PARTLY_PROVED');
CREATE TYPE g09_defence_plea        AS ENUM ('ADMITS_ALL','DENIES_ALL','PARTIAL','NO_RESPONSE');

-- Inquiry -----------------------------------------------------------------------------
CREATE TYPE g09_inquiry_route       AS ENUM ('ORDINARY_IO','ICC_POSH','DISPENSED');
CREATE TYPE g09_inquiry_status      AS ENUM ('NOT_STARTED','IN_PROGRESS','EX_PARTE','STAYED','CONCLUDED','DE_NOVO');
CREATE TYPE g09_inquiry_role        AS ENUM ('INQUIRY_OFFICER','PRESENTING_OFFICER','DEFENCE_ASSISTANT','ICC_PRESIDING','ICC_MEMBER','ICC_EXTERNAL_MEMBER');
CREATE TYPE g09_appointment_status  AS ENUM ('ACTIVE','RECUSED','REPLACED','OBJECTED');
CREATE TYPE g09_hearing_outcome     AS ENUM ('HELD','ADJOURNED','NO_SHOW_CHARGED','NO_SHOW_PO','EX_PARTE_RECORDED');
CREATE TYPE g09_witness_side        AS ENUM ('PROSECUTION','DEFENCE');
CREATE TYPE g09_witness_status      AS ENUM ('LISTED','EXAMINED','CROSS_EXAMINED','DROPPED');

-- Report / disagreement / show-cause --------------------------------------------------
CREATE TYPE g09_overall_finding     AS ENUM ('ALL_PROVED','NONE_PROVED','MIXED');
CREATE TYPE g09_report_status       AS ENUM ('SUBMITTED','SERVED','UNDER_DA_REVIEW','ACCEPTED','REMITTED');
CREATE TYPE g09_memo_status         AS ENUM ('ISSUED','SERVED','RESPONDED','FINALISED');
CREATE TYPE g09_notice_status       AS ENUM ('ISSUED','SERVED','RESPONDED','NO_RESPONSE','CLOSED');

-- Order / penalty ---------------------------------------------------------------------
CREATE TYPE g09_order_type          AS ENUM ('PENALTY','EXONERATION','DROP_PROCEEDINGS','ABATED');
CREATE TYPE g09_order_status        AS ENUM ('DRAFT','FINALISED','SERVED','STAYED','SET_ASIDE','MODIFIED');
CREATE TYPE g09_penalty_type        AS ENUM ('CENSURE','WITHHOLD_INCREMENT','WITHHOLD_PROMOTION','RECOVERY','REDUCTION_IN_RANK','COMPULSORY_RETIREMENT','REMOVAL','DISMISSAL','FINE','WARNING');
CREATE TYPE g09_penalty_class       AS ENUM ('MINOR','MAJOR');
CREATE TYPE g09_pension_effect      AS ENUM ('NONE','WITHHELD','REDUCED_PCT');

-- Appeal / revision / review ----------------------------------------------------------
CREATE TYPE g09_remedy_type         AS ENUM ('APPEAL','REVISION','REVIEW');
CREATE TYPE g09_appeal_decision     AS ENUM ('UPHELD','SET_ASIDE','MODIFIED','ENHANCED','REMITTED','REJECTED');
CREATE TYPE g09_appeal_status       AS ENUM ('FILED','ADMITTED','UNDER_REVIEW','DECIDED','REJECTED');

-- Timeline / SLA / vigilance ----------------------------------------------------------
CREATE TYPE g09_timeline_event_type AS ENUM ('STAGE_ENTERED','STAGE_COMPLETED','SLA_BREACH','ESCALATION','SLA_PAUSE','SLA_RESUME','JURISDICTION_TRANSFER','NOTE');
CREATE TYPE g09_sla_status          AS ENUM ('ON_TRACK','AT_RISK','BREACHED','PAUSED','N_A');
CREATE TYPE g09_vigilance_clearance AS ENUM ('CLEAR','WITHHELD','UNDER_PROCEEDINGS','NOT_CLEAR');
CREATE TYPE g09_integrity_grade     AS ENUM ('DOUBTFUL','SATISFACTORY');

-- Artefacts / signing / service -------------------------------------------------------
CREATE TYPE g09_artefact_type       AS ENUM ('COMPLAINT','PI_REPORT','CHARGE_SHEET','DEFENCE','EXHIBIT','INQUIRY_REPORT','SHOW_CAUSE','ORDER','APPEAL','CONSULTATION','SERVICE_PROOF','DISAGREEMENT_MEMO');
CREATE TYPE g09_signature_type      AS ENUM ('DSC','ESIGN');
CREATE TYPE g09_service_mode        AS ENUM ('IN_PERSON','REGD_POST','EMAIL','SUBSTITUTED','PUBLICATION');

-- Consultation / dispensation / multi-respondent / pause / idempotency ----------------
CREATE TYPE g09_consultation_type   AS ENUM ('UPSC','CVC_FIRST_STAGE','CVC_SECOND_STAGE','ICC','LEGAL','NONE');
CREATE TYPE g09_consultation_status AS ENUM ('REQUIRED','REQUESTED','RECEIVED','CLOSED','WAIVED');
CREATE TYPE g09_dispensation_reason AS ENUM ('CRIMINAL_CONVICTION','NOT_REASONABLY_PRACTICABLE','SECURITY_OF_STATE');
CREATE TYPE g09_dispensation_status AS ENUM ('PROPOSED','APPROVED','REJECTED');
CREATE TYPE g09_respondent_status   AS ENUM ('ACTIVE','EXONERATED','PENALISED','ABATED','SEVERED');
CREATE TYPE g09_sla_pause_reason    AS ENUM ('STAY','REMIT','CONDONATION','CONSULTATION','CRIMINAL_STAY');
CREATE TYPE g09_idempotency_scope   AS ENUM ('SUSPENSION','ORDER_FINALISE','POST_TO_SR','APPEAL_DECIDE');
CREATE TYPE g09_idempotency_status  AS ENUM ('IN_PROGRESS','COMPLETED');


-- =====================================================================================
-- SECTION 2 — MODULE-OWNED TABLES (dependency-ordered)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 2.1  procedure_templates  [E22 — jurisdiction overlay; reference data, SysAdmin-owned]
-- -------------------------------------------------------------------------------------
CREATE TABLE procedure_templates (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    template_code            varchar(40) NOT NULL,                 -- e.g. CCS_CCA_2026 / POSH_ICC
    jurisdiction_code        varchar(20) NOT NULL,
    applies_to_case_type     g09_case_type,                        -- null = any
    applies_to_misconduct    g09_misconduct_category,              -- e.g. HARASSMENT -> POSH_ICC
    required_consultations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    competence_matrix_ref    varchar(40) NOT NULL,                 -- logical key into authority_competence
    valid_service_modes_json jsonb NOT NULL DEFAULT '[]'::jsonb,   -- EMAIL excluded by default (AI-5)
    timelines_json           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- per-stage SLA floors/targets
    appeal_limitation_days   int NOT NULL,
    subsistence_floor_pct    numeric(5,2) NOT NULL DEFAULT 25.00,
    subsistence_ceiling_pct  numeric(5,2) NOT NULL DEFAULT 75.00,
    dispensation_conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    inquiry_route_default    g09_inquiry_route NOT NULL DEFAULT 'ORDINARY_IO',
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_procedure_templates_code UNIQUE (tenant_id, template_code),
    CONSTRAINT ck_procedure_templates_subsistence CHECK (subsistence_ceiling_pct >= subsistence_floor_pct)
);
CREATE INDEX ix_procedure_templates_tenant       ON procedure_templates(tenant_id);
CREATE INDEX ix_procedure_templates_entity       ON procedure_templates(entity_id);
CREATE INDEX ix_procedure_templates_jurisdiction ON procedure_templates(jurisdiction_code);
CREATE INDEX ix_procedure_templates_active       ON procedure_templates(is_active);

-- -------------------------------------------------------------------------------------
-- 2.2  authority_competence  [E23 — (cadre x penalty_class) -> empowered level; reference]
-- -------------------------------------------------------------------------------------
CREATE TABLE authority_competence (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    competence_set_code      varchar(40) NOT NULL,                 -- matches template competence_matrix_ref
    subject_cadre            varchar(60) NOT NULL,
    penalty_class            g09_penalty_class NOT NULL,
    penalty_type             g09_penalty_type,                     -- null = any of class
    min_authority_level      varchar(40) NOT NULL,                 -- e.g. APPOINTING_AUTHORITY
    requires_not_subordinate_to_appointing boolean NOT NULL DEFAULT false,  -- Art. 311(1)
    notes                    text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_authority_competence UNIQUE (tenant_id, competence_set_code, subject_cadre, penalty_class, penalty_type)
);
CREATE INDEX ix_authority_competence_tenant ON authority_competence(tenant_id);
CREATE INDEX ix_authority_competence_set    ON authority_competence(competence_set_code);
CREATE INDEX ix_authority_competence_lookup ON authority_competence(competence_set_code, subject_cadre, penalty_class);

-- -------------------------------------------------------------------------------------
-- 2.3  disciplinary_cases  [E1 — master case record (the file)]
-- -------------------------------------------------------------------------------------
CREATE TABLE disciplinary_cases (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_no                  varchar(40) NOT NULL,                 -- human key, e.g. DCP/2026/000123
    charged_employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- primary respondent
    org_unit_id              uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,   -- owning office (row scope)
    procedure_template_id    uuid NOT NULL REFERENCES procedure_templates(id) ON DELETE RESTRICT,
    jurisdiction_code        varchar(20) NOT NULL,
    case_type                g09_case_type NOT NULL,
    misconduct_category      g09_misconduct_category NOT NULL,
    is_posh_case             boolean NOT NULL DEFAULT false,
    case_status              g09_case_status NOT NULL DEFAULT 'OPEN',
    current_stage            g09_case_stage NOT NULL DEFAULT 'INTAKE',
    is_under_suspension      boolean NOT NULL DEFAULT false,       -- parallel interim flag
    suspension_status        g09_suspension_status,                -- echo of active suspension
    disciplinary_authority_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    is_jurisdiction_transferred boolean NOT NULL DEFAULT false,
    is_sealed_cover          boolean NOT NULL DEFAULT false,
    is_retiree_case          boolean NOT NULL DEFAULT false,
    retiree_sanction_ref     varchar(120),
    is_confidential          boolean NOT NULL DEFAULT true,
    is_confidential_source   boolean NOT NULL DEFAULT false,
    vigilance_flag           boolean NOT NULL DEFAULT false,
    criminal_case_ref        varchar(80),
    statutory_basis          varchar(120) NOT NULL,
    date_initiated           date NOT NULL,
    expected_closure_date    date,
    actual_closure_date      date,
    abatement_reason         text,
    outcome_summary          text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_disciplinary_cases_no UNIQUE (tenant_id, case_no),
    -- DI-2: DA must not be the charged officer on the same case.
    CONSTRAINT ck_disciplinary_cases_da_distinct CHECK (disciplinary_authority_id <> charged_employee_id)
);
CREATE INDEX ix_disciplinary_cases_tenant     ON disciplinary_cases(tenant_id);
CREATE INDEX ix_disciplinary_cases_entity     ON disciplinary_cases(entity_id);
CREATE INDEX ix_disciplinary_cases_charged    ON disciplinary_cases(charged_employee_id);
CREATE INDEX ix_disciplinary_cases_org_unit   ON disciplinary_cases(org_unit_id);
CREATE INDEX ix_disciplinary_cases_template   ON disciplinary_cases(procedure_template_id);
CREATE INDEX ix_disciplinary_cases_da         ON disciplinary_cases(disciplinary_authority_id);
CREATE INDEX ix_disciplinary_cases_status     ON disciplinary_cases(case_status);
CREATE INDEX ix_disciplinary_cases_stage      ON disciplinary_cases(current_stage);
CREATE INDEX ix_disciplinary_cases_initiated  ON disciplinary_cases(date_initiated);

-- -------------------------------------------------------------------------------------
-- 2.4  case_respondents  [E27 — 1..N charged officers per proceeding (common/joint)]
-- -------------------------------------------------------------------------------------
CREATE TABLE case_respondents (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    respondent_role_in_misconduct varchar(80),
    subject_cadre            varchar(60) NOT NULL,                 -- snapshot for competence resolution
    disciplinary_authority_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status                   g09_respondent_status NOT NULL DEFAULT 'ACTIVE',
    is_primary               boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_case_respondents UNIQUE (case_id, employee_id),
    CONSTRAINT ck_case_respondents_da_distinct CHECK (disciplinary_authority_id <> employee_id)
);
CREATE INDEX ix_case_respondents_tenant   ON case_respondents(tenant_id);
CREATE INDEX ix_case_respondents_case     ON case_respondents(case_id);
CREATE INDEX ix_case_respondents_employee ON case_respondents(employee_id);
CREATE INDEX ix_case_respondents_status   ON case_respondents(status);

-- -------------------------------------------------------------------------------------
-- 2.5  case_complaints  [E2 — source-of-misconduct / complaint intake]
-- -------------------------------------------------------------------------------------
CREATE TABLE case_complaints (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    complaint_no             varchar(40) NOT NULL,
    case_id                  uuid REFERENCES disciplinary_cases(id) ON DELETE SET NULL,   -- null until promoted
    subject_employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    source_type              g09_complaint_source NOT NULL,
    complainant_id           uuid REFERENCES employees(id) ON DELETE SET NULL,            -- null if external/anon
    complainant_name_ext     varchar(160),
    is_anonymous             boolean NOT NULL DEFAULT false,
    received_date            date NOT NULL,
    allegation_summary       text NOT NULL,
    triage_decision          g09_triage_decision,
    triage_remarks           text,
    triaged_by               uuid REFERENCES employees(id) ON DELETE SET NULL,
    triaged_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_case_complaints_no UNIQUE (tenant_id, complaint_no)
);
CREATE INDEX ix_case_complaints_tenant   ON case_complaints(tenant_id);
CREATE INDEX ix_case_complaints_case     ON case_complaints(case_id);
CREATE INDEX ix_case_complaints_subject  ON case_complaints(subject_employee_id);
CREATE INDEX ix_case_complaints_source   ON case_complaints(source_type);
CREATE INDEX ix_case_complaints_received ON case_complaints(received_date);

-- -------------------------------------------------------------------------------------
-- 2.6  preliminary_inquiries  [E3 — fact-finding before formal charges]
-- -------------------------------------------------------------------------------------
CREATE TABLE preliminary_inquiries (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    pi_officer_id            uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    ordered_by               uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    ordered_date             date NOT NULL,
    due_date                 date NOT NULL,
    status                   g09_pi_status NOT NULL DEFAULT 'ORDERED',
    findings_summary         text,
    recommendation           g09_pi_recommendation,
    report_document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,            -- confidential
    contains_relied_material boolean NOT NULL DEFAULT false,       -- AI-24: must disclose if relied
    submitted_at             timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_preliminary_inquiries_tenant  ON preliminary_inquiries(tenant_id);
CREATE INDEX ix_preliminary_inquiries_case    ON preliminary_inquiries(case_id);
CREATE INDEX ix_preliminary_inquiries_officer ON preliminary_inquiries(pi_officer_id);
CREATE INDEX ix_preliminary_inquiries_status  ON preliminary_inquiries(status);
CREATE INDEX ix_preliminary_inquiries_due     ON preliminary_inquiries(due_date);

-- -------------------------------------------------------------------------------------
-- 2.7  suspensions  [E4 — parallel interim status + subsistence + NEC/deemed review]
-- -------------------------------------------------------------------------------------
CREATE TABLE suspensions (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    suspension_type          g09_suspension_type NOT NULL,
    order_no                 varchar(40) NOT NULL,
    effective_from           date NOT NULL,
    effective_to             date,                                 -- null while active
    status                   g09_suspension_status NOT NULL DEFAULT 'ACTIVE',
    subsistence_rate_pct     numeric(5,2) NOT NULL,
    non_employment_certificate_received boolean NOT NULL DEFAULT false,   -- AI-6: gate for subsistence
    nec_received_date        date,
    charge_memo_due_date     date,                                 -- 90-day window (Ajay Kumar Choudhary)
    deemed_review_flag       boolean NOT NULL DEFAULT false,
    subsistence_revision_due date,
    review_committee_due     date,
    payroll_event_id         uuid,                                 -- correlation to G10 (no FK)
    revoked_reason           text,
    order_document_id        uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_suspensions_order_no UNIQUE (tenant_id, order_no),
    CONSTRAINT ck_suspensions_rate CHECK (subsistence_rate_pct >= 0 AND subsistence_rate_pct <= 100)
);
CREATE INDEX ix_suspensions_tenant   ON suspensions(tenant_id);
CREATE INDEX ix_suspensions_case     ON suspensions(case_id);
CREATE INDEX ix_suspensions_employee ON suspensions(employee_id);
CREATE INDEX ix_suspensions_status   ON suspensions(status);
CREATE INDEX ix_suspensions_eff_from ON suspensions(effective_from);

-- -------------------------------------------------------------------------------------
-- 2.8  legal_service_records  [E26 — statutory legal service (mode/proof/served_by)]
-- -------------------------------------------------------------------------------------
-- Created before charge_sheets / inquiry_reports / show_cause / orders which carry a
-- legal_service_id FK. entity_ref_id is polymorphic (the served artefact row) — no FK.
CREATE TABLE legal_service_records (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    artefact_type            g09_artefact_type NOT NULL,
    entity_ref_id            uuid NOT NULL,                        -- polymorphic served-artefact row
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    service_mode             g09_service_mode NOT NULL,
    is_statutorily_valid     boolean NOT NULL DEFAULT false,       -- computed vs template valid modes
    served_date              date NOT NULL,                        -- drives reply windows (DI-15)
    served_by                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    proof_document_id        uuid REFERENCES documents(id) ON DELETE SET NULL,
    remarks                  text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_legal_service_records_tenant     ON legal_service_records(tenant_id);
CREATE INDEX ix_legal_service_records_case       ON legal_service_records(case_id);
CREATE INDEX ix_legal_service_records_respondent ON legal_service_records(respondent_id);
CREATE INDEX ix_legal_service_records_artefact   ON legal_service_records(artefact_type, entity_ref_id);
CREATE INDEX ix_legal_service_records_served     ON legal_service_records(served_date);

-- -------------------------------------------------------------------------------------
-- 2.9  charge_sheets  [E5 — memorandum / articles-of-charge container]
-- -------------------------------------------------------------------------------------
CREATE TABLE charge_sheets (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    charge_sheet_no          varchar(40) NOT NULL,
    penalty_track            g09_penalty_track NOT NULL,
    issued_by                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- DA
    issued_date              date,
    signature_type           g09_signature_type,                  -- DI-28: required to serve
    signatory_id             uuid REFERENCES employees(id) ON DELETE SET NULL,
    signed_at                timestamptz,
    legal_service_id         uuid REFERENCES legal_service_records(id) ON DELETE SET NULL,
    defence_due_date         date,
    status                   g09_charge_sheet_status NOT NULL DEFAULT 'DRAFT',
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,
    withdrawn_reason         text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_charge_sheets_no UNIQUE (tenant_id, charge_sheet_no)
);
CREATE INDEX ix_charge_sheets_tenant  ON charge_sheets(tenant_id);
CREATE INDEX ix_charge_sheets_case    ON charge_sheets(case_id);
CREATE INDEX ix_charge_sheets_issued  ON charge_sheets(issued_by);
CREATE INDEX ix_charge_sheets_service ON charge_sheets(legal_service_id);
CREATE INDEX ix_charge_sheets_status  ON charge_sheets(status);

-- -------------------------------------------------------------------------------------
-- 2.10 charge_articles  [E6 — individual article + statement of imputation]
-- -------------------------------------------------------------------------------------
CREATE TABLE charge_articles (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    charge_sheet_id          uuid NOT NULL REFERENCES charge_sheets(id) ON DELETE RESTRICT,
    article_no               int NOT NULL,
    article_text             text NOT NULL,
    statement_of_imputation  text NOT NULL,
    rule_violated            varchar(160) NOT NULL,
    finding                  g09_article_finding,                 -- single-respondent legacy
    finding_reason           text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_charge_articles_no UNIQUE (charge_sheet_id, article_no)
);
CREATE INDEX ix_charge_articles_tenant ON charge_articles(tenant_id);
CREATE INDEX ix_charge_articles_sheet  ON charge_articles(charge_sheet_id);

-- -------------------------------------------------------------------------------------
-- 2.11 defence_statements  [E7 — charged officer's written statement of defence]
-- -------------------------------------------------------------------------------------
CREATE TABLE defence_statements (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    charge_sheet_id          uuid NOT NULL REFERENCES charge_sheets(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    submitted_by             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    plea                     g09_defence_plea NOT NULL,
    statement_text           text,
    requests_oral_inquiry    boolean NOT NULL DEFAULT false,
    requests_defence_assistant boolean NOT NULL DEFAULT false,
    requests_personal_hearing boolean NOT NULL DEFAULT false,
    extension_requested_days int,
    submitted_at             timestamptz,
    is_ex_parte_assumed      boolean NOT NULL DEFAULT false,
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_defence_statements_tenant     ON defence_statements(tenant_id);
CREATE INDEX ix_defence_statements_sheet      ON defence_statements(charge_sheet_id);
CREATE INDEX ix_defence_statements_case       ON defence_statements(case_id);
CREATE INDEX ix_defence_statements_respondent ON defence_statements(respondent_id);

-- -------------------------------------------------------------------------------------
-- 2.12 inquiry_proceedings  [E8 — the departmental inquiry instance (+ STAY, inspection)]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_proceedings (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    charge_sheet_id          uuid NOT NULL REFERENCES charge_sheets(id) ON DELETE RESTRICT,
    inquiry_route            g09_inquiry_route NOT NULL DEFAULT 'ORDINARY_IO',
    status                   g09_inquiry_status NOT NULL DEFAULT 'NOT_STARTED',
    list_supplied_date       date,                                -- AI-4 inspection gate
    inspection_afforded_date date,                                -- AI-4 inspection gate (DI-24)
    commenced_date           date,
    concluded_date           date,
    due_date                 date,
    is_ex_parte              boolean NOT NULL DEFAULT false,
    is_stayed                boolean NOT NULL DEFAULT false,
    stay_reason              text,
    stay_from                date,
    stay_to                  date,
    de_novo_of_inquiry_id    uuid REFERENCES inquiry_proceedings(id) ON DELETE SET NULL,  -- fresh inquiry link
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_inquiry_proceedings_tenant ON inquiry_proceedings(tenant_id);
CREATE INDEX ix_inquiry_proceedings_case   ON inquiry_proceedings(case_id);
CREATE INDEX ix_inquiry_proceedings_sheet  ON inquiry_proceedings(charge_sheet_id);
CREATE INDEX ix_inquiry_proceedings_status ON inquiry_proceedings(status);
CREATE INDEX ix_inquiry_proceedings_denovo ON inquiry_proceedings(de_novo_of_inquiry_id);

-- -------------------------------------------------------------------------------------
-- 2.13 inquiry_appointments  [E9 — IO / PO / Defence Assistant / ICC appointments]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_appointments (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    inquiry_id               uuid NOT NULL REFERENCES inquiry_proceedings(id) ON DELETE RESTRICT,
    role_type                g09_inquiry_role NOT NULL,
    officer_id               uuid REFERENCES employees(id) ON DELETE SET NULL,            -- internal person
    external_name            varchar(160),                        -- external IO / ICC member / counsel
    is_external_member       boolean NOT NULL DEFAULT false,
    appointed_by             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    appointed_date           date NOT NULL,
    status                   g09_appointment_status NOT NULL DEFAULT 'ACTIVE',
    recusal_reason           text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_inquiry_appointments_tenant  ON inquiry_appointments(tenant_id);
CREATE INDEX ix_inquiry_appointments_inquiry ON inquiry_appointments(inquiry_id);
CREATE INDEX ix_inquiry_appointments_officer ON inquiry_appointments(officer_id);
CREATE INDEX ix_inquiry_appointments_role    ON inquiry_appointments(role_type);

-- -------------------------------------------------------------------------------------
-- 2.14 inquiry_hearings  [E10 — daily order sheet / hearing log]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_hearings (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    inquiry_id               uuid NOT NULL REFERENCES inquiry_proceedings(id) ON DELETE RESTRICT,
    hearing_no               int NOT NULL,
    scheduled_date           timestamptz NOT NULL,
    held_date                timestamptz,
    outcome                  g09_hearing_outcome NOT NULL,
    daily_order_text         text NOT NULL,
    next_hearing_date        timestamptz,
    recorded_by              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- IO
    attendees_json           jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_inquiry_hearings_no UNIQUE (inquiry_id, hearing_no)
);
CREATE INDEX ix_inquiry_hearings_tenant  ON inquiry_hearings(tenant_id);
CREATE INDEX ix_inquiry_hearings_inquiry ON inquiry_hearings(inquiry_id);
CREATE INDEX ix_inquiry_hearings_sched   ON inquiry_hearings(scheduled_date);

-- -------------------------------------------------------------------------------------
-- 2.15 inquiry_witnesses  [E11 — listed/examined witnesses]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_witnesses (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    inquiry_id               uuid NOT NULL REFERENCES inquiry_proceedings(id) ON DELETE RESTRICT,
    side                     g09_witness_side NOT NULL,
    witness_employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,            -- if internal
    witness_name_ext         varchar(160),
    is_listed_for_inspection boolean NOT NULL DEFAULT false,
    examination_status       g09_witness_status NOT NULL DEFAULT 'LISTED',
    deposition_text          text,
    examined_on_hearing_id   uuid REFERENCES inquiry_hearings(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_inquiry_witnesses_tenant   ON inquiry_witnesses(tenant_id);
CREATE INDEX ix_inquiry_witnesses_inquiry  ON inquiry_witnesses(inquiry_id);
CREATE INDEX ix_inquiry_witnesses_employee ON inquiry_witnesses(witness_employee_id);
CREATE INDEX ix_inquiry_witnesses_hearing  ON inquiry_witnesses(examined_on_hearing_id);

-- -------------------------------------------------------------------------------------
-- 2.16 inquiry_exhibits  [E12 — documentary/material evidence (vault items)]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_exhibits (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    inquiry_id               uuid NOT NULL REFERENCES inquiry_proceedings(id) ON DELETE RESTRICT,
    exhibit_marker           varchar(20) NOT NULL,                -- e.g. P-1, D-3
    side                     g09_witness_side NOT NULL,
    description              text NOT NULL,
    document_id              uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,   -- G13 vault item
    source_is_pi             boolean NOT NULL DEFAULT false,
    relied_upon              boolean NOT NULL DEFAULT false,      -- AI-24
    disclosed_to_charged     boolean NOT NULL DEFAULT false,      -- DI-9: must be true when relied_upon
    is_listed_for_inspection boolean NOT NULL DEFAULT false,
    admitted                 boolean,
    objection_text           text,
    sealed                   boolean NOT NULL DEFAULT false,
    content_hash             varchar(64) NOT NULL,                -- SHA-256 integrity seal (DI-7)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    -- DI-9: a relied-upon exhibit must have been disclosed to the charged officer.
    CONSTRAINT ck_inquiry_exhibits_disclosure CHECK (relied_upon = false OR disclosed_to_charged = true)
);
CREATE INDEX ix_inquiry_exhibits_tenant  ON inquiry_exhibits(tenant_id);
CREATE INDEX ix_inquiry_exhibits_inquiry ON inquiry_exhibits(inquiry_id);
CREATE INDEX ix_inquiry_exhibits_doc     ON inquiry_exhibits(document_id);

-- -------------------------------------------------------------------------------------
-- 2.17 inquiry_reports  [E13 — IO/ICC findings (article-wise per respondent)]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_reports (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    inquiry_id               uuid NOT NULL REFERENCES inquiry_proceedings(id) ON DELETE RESTRICT,
    submitted_by             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- IO / ICC presiding
    submitted_date           date NOT NULL,
    overall_finding          g09_overall_finding NOT NULL,
    findings_json            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-respondent x per-article grid
    analysis_text            text NOT NULL,
    report_document_id       uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    signature_type           g09_signature_type,
    signed_at                timestamptz,
    served_on_charged_date   date,
    legal_service_id         uuid REFERENCES legal_service_records(id) ON DELETE SET NULL,
    status                   g09_report_status NOT NULL DEFAULT 'SUBMITTED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_inquiry_reports_tenant  ON inquiry_reports(tenant_id);
CREATE INDEX ix_inquiry_reports_inquiry ON inquiry_reports(inquiry_id);
CREATE INDEX ix_inquiry_reports_status  ON inquiry_reports(status);

-- -------------------------------------------------------------------------------------
-- 2.18 disagreement_memos  [E14 — DA disagreement with IO findings]
-- -------------------------------------------------------------------------------------
CREATE TABLE disagreement_memos (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    report_id                uuid NOT NULL REFERENCES inquiry_reports(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    issued_by                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- DA
    tentative_disagreement   text NOT NULL,
    articles_affected_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    served_date              date,
    legal_service_id         uuid REFERENCES legal_service_records(id) ON DELETE SET NULL,
    representation_due_date  date,
    representation_text      text,
    status                   g09_memo_status NOT NULL DEFAULT 'ISSUED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_disagreement_memos_tenant ON disagreement_memos(tenant_id);
CREATE INDEX ix_disagreement_memos_report ON disagreement_memos(report_id);
CREATE INDEX ix_disagreement_memos_case   ON disagreement_memos(case_id);

-- -------------------------------------------------------------------------------------
-- 2.19 personal_hearings  [E29 — personal-hearing record (show-cause / appeal)]
-- -------------------------------------------------------------------------------------
-- Created before show_cause_notices / penalty_orders / appeals which reference it.
CREATE TABLE personal_hearings (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    stage                    g09_case_stage NOT NULL,             -- SHOW_CAUSE / APPEAL
    requested                boolean NOT NULL DEFAULT false,
    granted                  boolean NOT NULL DEFAULT false,
    denial_reason            text,                                -- DI-29: required if denied
    scheduled_date           timestamptz,
    held_date                timestamptz,
    presided_by              uuid REFERENCES employees(id) ON DELETE SET NULL,
    minutes_text             text,
    minutes_document_id      uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_personal_hearings_tenant     ON personal_hearings(tenant_id);
CREATE INDEX ix_personal_hearings_case       ON personal_hearings(case_id);
CREATE INDEX ix_personal_hearings_respondent ON personal_hearings(respondent_id);
CREATE INDEX ix_personal_hearings_stage      ON personal_hearings(stage);

-- -------------------------------------------------------------------------------------
-- 2.20 show_cause_notices  [E15 — notice on proposed penalty]
-- -------------------------------------------------------------------------------------
CREATE TABLE show_cause_notices (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    notice_no                varchar(40) NOT NULL,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    proposed_penalty_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    issued_by                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- DA
    issued_date              date NOT NULL,
    served_date              date,
    legal_service_id         uuid REFERENCES legal_service_records(id) ON DELETE SET NULL,
    response_due_date        date NOT NULL,
    representation_text      text,
    personal_hearing_id      uuid REFERENCES personal_hearings(id) ON DELETE SET NULL,
    responded_at             timestamptz,
    status                   g09_notice_status NOT NULL DEFAULT 'ISSUED',
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_show_cause_notices_no UNIQUE (tenant_id, notice_no)
);
CREATE INDEX ix_show_cause_notices_tenant     ON show_cause_notices(tenant_id);
CREATE INDEX ix_show_cause_notices_case       ON show_cause_notices(case_id);
CREATE INDEX ix_show_cause_notices_respondent ON show_cause_notices(respondent_id);
CREATE INDEX ix_show_cause_notices_status     ON show_cause_notices(status);

-- -------------------------------------------------------------------------------------
-- 2.21 penalty_orders  [E16 — final order (+ competence/proportionality/signature)]
-- -------------------------------------------------------------------------------------
CREATE TABLE penalty_orders (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    order_no                 varchar(40) NOT NULL,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    order_type               g09_order_type NOT NULL,
    passed_by                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- DA
    competence_verified      boolean NOT NULL DEFAULT false,      -- DI-13: true to finalise
    competence_authority_level varchar(40),
    order_date               date NOT NULL,
    effective_date           date,
    reasoning_text           text NOT NULL,                       -- speaking order
    proportionality_reasoning text NOT NULL,                      -- DI-20 mandatory
    is_speaking_order        boolean NOT NULL DEFAULT false,
    signature_type           g09_signature_type,
    signatory_id             uuid REFERENCES employees(id) ON DELETE SET NULL,
    signed_at                timestamptz,
    signature_ref            varchar(128),                        -- CA/eSign txn reference
    served_date              date,
    legal_service_id         uuid REFERENCES legal_service_records(id) ON DELETE SET NULL,
    sr_event_id              uuid REFERENCES service_register_events(id) ON DELETE SET NULL,  -- G12 correlation
    status                   g09_order_status NOT NULL DEFAULT 'DRAFT',
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_penalty_orders_no UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_penalty_orders_tenant     ON penalty_orders(tenant_id);
CREATE INDEX ix_penalty_orders_case       ON penalty_orders(case_id);
CREATE INDEX ix_penalty_orders_respondent ON penalty_orders(respondent_id);
CREATE INDEX ix_penalty_orders_passed     ON penalty_orders(passed_by);
CREATE INDEX ix_penalty_orders_sr_event   ON penalty_orders(sr_event_id);
CREATE INDEX ix_penalty_orders_status     ON penalty_orders(status);

-- -------------------------------------------------------------------------------------
-- 2.22 penalty_items  [E17 — individual penalty(ies) imposed (recovery caps)]
-- -------------------------------------------------------------------------------------
CREATE TABLE penalty_items (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    order_id                 uuid NOT NULL REFERENCES penalty_orders(id) ON DELETE RESTRICT,
    penalty_type             g09_penalty_type NOT NULL,
    penalty_class            g09_penalty_class NOT NULL,
    duration_months          int,
    is_cumulative            boolean,
    recovery_amount          numeric(14,2),
    recovery_instalments     int,
    recovery_monthly_cap_pct numeric(5,2),                        -- <= 1/3 of pay default (DI-22)
    recovery_beyond_retirement boolean,                           -- DCRG-only if true (DI-22)
    reduction_to_designation_id uuid REFERENCES designations(id) ON DELETE RESTRICT,
    pension_effect           g09_pension_effect,
    pension_effect_value     numeric(5,2),
    downstream_event_id      uuid,                                -- correlation to G06/G10/G11 (no FK)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_penalty_items_cap CHECK (recovery_monthly_cap_pct IS NULL OR (recovery_monthly_cap_pct > 0 AND recovery_monthly_cap_pct <= 100))
);
CREATE INDEX ix_penalty_items_tenant ON penalty_items(tenant_id);
CREATE INDEX ix_penalty_items_order  ON penalty_items(order_id);
CREATE INDEX ix_penalty_items_type   ON penalty_items(penalty_type);
CREATE INDEX ix_penalty_items_reduce ON penalty_items(reduction_to_designation_id);

-- -------------------------------------------------------------------------------------
-- 2.23 appeals  [E18 — appeal / revision / review applications & decisions]
-- -------------------------------------------------------------------------------------
CREATE TABLE appeals (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    order_id                 uuid NOT NULL REFERENCES penalty_orders(id) ON DELETE RESTRICT,  -- order under challenge
    remedy_type              g09_remedy_type NOT NULL,
    filed_by                 uuid REFERENCES employees(id) ON DELETE SET NULL,            -- null for suo-motu
    filed_date               date NOT NULL,
    limitation_due_date      date NOT NULL,
    is_time_barred           boolean NOT NULL DEFAULT false,
    condonation_granted      boolean,
    authority_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,   -- appellate (!= DA)
    authority_competence_verified boolean NOT NULL DEFAULT false,
    grounds_text             text,
    personal_hearing_id      uuid REFERENCES personal_hearings(id) ON DELETE SET NULL,
    decision                 g09_appeal_decision,
    decision_reasoning       text,
    decided_date             date,
    revised_order_id         uuid REFERENCES penalty_orders(id) ON DELETE SET NULL,       -- if modified
    status                   g09_appeal_status NOT NULL DEFAULT 'FILED',
    document_id              uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_appeals_tenant    ON appeals(tenant_id);
CREATE INDEX ix_appeals_case      ON appeals(case_id);
CREATE INDEX ix_appeals_order     ON appeals(order_id);
CREATE INDEX ix_appeals_authority ON appeals(authority_id);
CREATE INDEX ix_appeals_revised   ON appeals(revised_order_id);
CREATE INDEX ix_appeals_status    ON appeals(status);

-- -------------------------------------------------------------------------------------
-- 2.24 case_consultations  [E24 — UPSC/CVC/ICC/legal consultations gating finalise]
-- -------------------------------------------------------------------------------------
CREATE TABLE case_consultations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    consultation_type        g09_consultation_type NOT NULL,
    status                   g09_consultation_status NOT NULL DEFAULT 'REQUIRED',
    is_mandatory             boolean NOT NULL DEFAULT false,      -- derived from procedure_templates
    requested_date           date,
    received_date            date,
    advice_summary           text,
    advice_document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,
    is_advice_relied_upon    boolean NOT NULL DEFAULT false,      -- if basis of penalty -> disclose (DI-9)
    waiver_reason            text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_case_consultations_tenant ON case_consultations(tenant_id);
CREATE INDEX ix_case_consultations_case   ON case_consultations(case_id);
CREATE INDEX ix_case_consultations_type   ON case_consultations(consultation_type);
CREATE INDEX ix_case_consultations_status ON case_consultations(status);

-- -------------------------------------------------------------------------------------
-- 2.25 inquiry_dispensations  [E25 — lawful dispense-with-inquiry (Art. 311(2) provisos)]
-- -------------------------------------------------------------------------------------
CREATE TABLE inquiry_dispensations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    respondent_id            uuid REFERENCES case_respondents(id) ON DELETE SET NULL,
    reason_code              g09_dispensation_reason NOT NULL,
    recorded_reasons         text NOT NULL,                       -- mandatory speaking reasons
    authority_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    supporting_ref           varchar(120),
    approved_date            date NOT NULL,
    status                   g09_dispensation_status NOT NULL DEFAULT 'PROPOSED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_inquiry_dispensations_tenant ON inquiry_dispensations(tenant_id);
CREATE INDEX ix_inquiry_dispensations_case   ON inquiry_dispensations(case_id);
CREATE INDEX ix_inquiry_dispensations_status ON inquiry_dispensations(status);

-- -------------------------------------------------------------------------------------
-- 2.26 vigilance_records  [E20 — integrity register & vigilance clearance / sealed cover]
-- -------------------------------------------------------------------------------------
CREATE TABLE vigilance_records (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    case_id                  uuid REFERENCES disciplinary_cases(id) ON DELETE SET NULL,
    clearance_status         g09_vigilance_clearance NOT NULL,
    integrity_grade          g09_integrity_grade,
    sealed_cover_flag        boolean NOT NULL DEFAULT false,
    valid_from               date NOT NULL,
    valid_to                 date,
    reason                   text,
    vigilance_officer_id     uuid REFERENCES employees(id) ON DELETE SET NULL,            -- BRD updated_by (VO)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_vigilance_records_tenant   ON vigilance_records(tenant_id);
CREATE INDEX ix_vigilance_records_employee ON vigilance_records(employee_id);
CREATE INDEX ix_vigilance_records_case     ON vigilance_records(case_id);
CREATE INDEX ix_vigilance_records_status   ON vigilance_records(clearance_status);

-- -------------------------------------------------------------------------------------
-- 2.27 case_documents  [E21 — join between case artefacts and G13 documents (+ signature)]
-- -------------------------------------------------------------------------------------
CREATE TABLE case_documents (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    artefact_type            g09_artefact_type NOT NULL,
    entity_ref_id            uuid,                                -- originating row (polymorphic)
    document_id              uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,   -- G13 object
    is_served                boolean NOT NULL DEFAULT false,
    is_sealed                boolean NOT NULL DEFAULT false,
    signature_type           g09_signature_type,
    signed_at                timestamptz,
    content_hash             varchar(64) NOT NULL,                -- SHA-256 (DI-7)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_case_documents_tenant   ON case_documents(tenant_id);
CREATE INDEX ix_case_documents_case     ON case_documents(case_id);
CREATE INDEX ix_case_documents_doc      ON case_documents(document_id);
CREATE INDEX ix_case_documents_artefact ON case_documents(artefact_type, entity_ref_id);

-- -------------------------------------------------------------------------------------
-- 2.28 case_timeline_events  [E19 — APPEND-ONLY per-case SLA/stage ledger; rides P05]
-- -------------------------------------------------------------------------------------
-- Append-only (CONVENTIONS §3, DI-12): only created_at/created_by; no updated_at/is_deleted.
-- seq_no/prev_hash/row_hash power the FR-G09-027 verify endpoint; statutory chain remains the
-- platform P05 + OPEN-PLAT-03 substrate (no module hash-chain of record).
CREATE TABLE case_timeline_events (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- event_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    stage                    g09_case_stage NOT NULL,
    event_type               g09_timeline_event_type NOT NULL,
    event_at                 timestamptz NOT NULL DEFAULT now(),
    sla_target_at            timestamptz,
    sla_status               g09_sla_status NOT NULL DEFAULT 'N_A',
    actor_id                 uuid REFERENCES employees(id) ON DELETE SET NULL,
    notes                    text,
    seq_no                   bigint NOT NULL,                     -- monotonic per case
    prev_hash                varchar(64),
    row_hash                 varchar(64) NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT uq_case_timeline_events_seq UNIQUE (case_id, seq_no),
    CONSTRAINT ck_case_timeline_events_seq CHECK (seq_no >= 0)
);
CREATE INDEX ix_case_timeline_events_tenant ON case_timeline_events(tenant_id);
CREATE INDEX ix_case_timeline_events_case   ON case_timeline_events(case_id, seq_no);
CREATE INDEX ix_case_timeline_events_type   ON case_timeline_events(event_type);
CREATE INDEX ix_case_timeline_events_at     ON case_timeline_events(event_at);

-- -------------------------------------------------------------------------------------
-- 2.29 sla_pause_events  [E28 — APPEND-ONLY clock pause/resume ledger]
-- -------------------------------------------------------------------------------------
-- Append-only (CONVENTIONS §3, DI-12): only created_at/created_by.
CREATE TABLE sla_pause_events (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pause_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL REFERENCES disciplinary_cases(id) ON DELETE RESTRICT,
    stage                    g09_case_stage NOT NULL,
    reason                   g09_sla_pause_reason NOT NULL,
    paused_from              timestamptz NOT NULL,
    resumed_at               timestamptz,                         -- null while paused
    paused_by                uuid REFERENCES employees(id) ON DELETE SET NULL,
    source_ref_id            uuid,                                -- originating appeal/stay/consultation/criminal
    recompute_applied        boolean NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid
);
CREATE INDEX ix_sla_pause_events_tenant ON sla_pause_events(tenant_id);
CREATE INDEX ix_sla_pause_events_case   ON sla_pause_events(case_id);
CREATE INDEX ix_sla_pause_events_reason ON sla_pause_events(reason);

-- -------------------------------------------------------------------------------------
-- 2.30 idempotency_keys  [E30 — dedup store for propagating posts (mint, TTL)]
-- -------------------------------------------------------------------------------------
-- Insert-once dedup store, TTL-pruned (no is_deleted). status churns IN_PROGRESS->COMPLETED.
CREATE TABLE idempotency_keys (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    idempotency_key          varchar(80) NOT NULL,                -- client- or server-minted
    scope                    g09_idempotency_scope NOT NULL,
    case_id                  uuid REFERENCES disciplinary_cases(id) ON DELETE SET NULL,
    request_fingerprint      varchar(64) NOT NULL,                -- SHA-256 of canonical request
    first_seen_at            timestamptz NOT NULL DEFAULT now(),
    response_snapshot_json   jsonb,                               -- stored result for replay
    status                   g09_idempotency_status NOT NULL DEFAULT 'IN_PROGRESS',
    expires_at               timestamptz NOT NULL,                -- TTL (default 7 days)
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    CONSTRAINT uq_idempotency_keys UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX ix_idempotency_keys_tenant  ON idempotency_keys(tenant_id);
CREATE INDEX ix_idempotency_keys_case    ON idempotency_keys(case_id);
CREATE INDEX ix_idempotency_keys_scope   ON idempotency_keys(scope);
CREATE INDEX ix_idempotency_keys_expires ON idempotency_keys(expires_at);


-- =====================================================================================
-- SECTION 3 — ROW-LEVEL SECURITY (P02 data-scope substrate; CONVENTIONS §6)
-- =====================================================================================
-- Canonical tenant_isolation policy applied to every G09 table, including the append-only
-- ledgers (case_timeline_events, sla_pause_events — read isolation) and idempotency_keys.
DO $$
DECLARE
    t text;
    g09_tables text[] := ARRAY[
        'procedure_templates','authority_competence','disciplinary_cases','case_respondents',
        'case_complaints','preliminary_inquiries','suspensions','legal_service_records',
        'charge_sheets','charge_articles','defence_statements','inquiry_proceedings',
        'inquiry_appointments','inquiry_hearings','inquiry_witnesses','inquiry_exhibits',
        'inquiry_reports','disagreement_memos','personal_hearings','show_cause_notices',
        'penalty_orders','penalty_items','appeals','case_consultations','inquiry_dispensations',
        'vigilance_records','case_documents','case_timeline_events','sla_pause_events',
        'idempotency_keys'
    ];
BEGIN
    FOREACH t IN ARRAY g09_tables LOOP
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
-- Scenario: two CCS(CCA) cases against core-seeded employees. Charged ...901 (Anjali Rao,
-- GROUP_B) with DA ...902 (Mohan Kumar); charged ...902 with DA ...901 (DI-2 distinct actors).
-- Core FK targets used: tenant ...111, entity ...201, org_unit ...301, designation ...701,
-- employees ...901/...902. GUCs set so RLS WITH CHECK passes for the seed.

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- procedure_templates -----------------------------------------------------------------
INSERT INTO procedure_templates (id, tenant_id, entity_id, template_code, jurisdiction_code, applies_to_misconduct, competence_matrix_ref, valid_service_modes_json, appeal_limitation_days, inquiry_route_default)
VALUES
 ('d9000000-0000-0000-0000-0000000a0001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CCS_CCA_2026','CCS_CCA',NULL,'CCS_DEFAULT','["IN_PERSON","REGD_POST","SUBSTITUTED","PUBLICATION"]',45,'ORDINARY_IO'),
 ('d9000000-0000-0000-0000-0000000a0002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','POSH_ICC','POSH_ICC','HARASSMENT','CCS_DEFAULT','["IN_PERSON","REGD_POST"]',90,'ICC_POSH');

-- authority_competence ----------------------------------------------------------------
INSERT INTO authority_competence (id, tenant_id, entity_id, competence_set_code, subject_cadre, penalty_class, penalty_type, min_authority_level, requires_not_subordinate_to_appointing)
VALUES
 ('d9000000-0000-0000-0000-0000000b0001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CCS_DEFAULT','GROUP_B','MAJOR','DISMISSAL','APPOINTING_AUTHORITY', true),
 ('d9000000-0000-0000-0000-0000000b0002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CCS_DEFAULT','GROUP_B','MINOR',NULL,'HEAD_OF_DEPT', false);

-- disciplinary_cases ------------------------------------------------------------------
INSERT INTO disciplinary_cases (id, tenant_id, entity_id, case_no, charged_employee_id, org_unit_id, procedure_template_id, jurisdiction_code, case_type, misconduct_category, case_status, current_stage, is_under_suspension, disciplinary_authority_id, statutory_basis, date_initiated)
VALUES
 ('d9000000-0000-0000-0000-00000c000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DCP/2026/000101','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301','d9000000-0000-0000-0000-0000000a0001','CCS_CCA','MAJOR_PENALTY_TRACK','FINANCIAL_IRREGULARITY','INQUIRY','INQUIRY', false,'99999999-9999-9999-9999-999999999902','CCS(CCA) Rule 14','2026-02-01'),
 ('d9000000-0000-0000-0000-00000c000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','DCP/2026/000102','99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333302','d9000000-0000-0000-0000-0000000a0001','CCS_CCA','MINOR_PENALTY_TRACK','ABSENCE_UNAUTHORISED','PENALTY_IMPOSED','CLOSED', false,'99999999-9999-9999-9999-999999999901','CCS(CCA) Rule 16','2026-01-05');

-- case_respondents --------------------------------------------------------------------
INSERT INTO case_respondents (id, tenant_id, entity_id, case_id, employee_id, respondent_role_in_misconduct, subject_cadre, disciplinary_authority_id, status, is_primary)
VALUES
 ('d9000000-0000-0000-0000-00000d000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000001','99999999-9999-9999-9999-999999999901','sanctioning officer','GROUP_B','99999999-9999-9999-9999-999999999902','ACTIVE', true),
 ('d9000000-0000-0000-0000-00000d000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000002','99999999-9999-9999-9999-999999999902','sole','GROUP_B','99999999-9999-9999-9999-999999999901','PENALISED', true);

-- case_complaints ---------------------------------------------------------------------
INSERT INTO case_complaints (id, tenant_id, entity_id, complaint_no, case_id, subject_employee_id, source_type, is_anonymous, received_date, allegation_summary, triage_decision)
VALUES
 ('d9000000-0000-0000-0000-00000e000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CMP/2026/501','d9000000-0000-0000-0000-00000c000001','99999999-9999-9999-9999-999999999901','AUDIT', false,'2026-02-01','Sanctioned payment without verification of devolution records.','FILE_CASE'),
 ('d9000000-0000-0000-0000-00000e000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','CMP/2026/502','d9000000-0000-0000-0000-00000c000002','99999999-9999-9999-9999-999999999902','INTERNAL', false,'2026-01-04','Unauthorised absence for 12 days.','FILE_CASE');

-- legal_service_records (served before charge_sheets reference them) -------------------
INSERT INTO legal_service_records (id, tenant_id, entity_id, case_id, artefact_type, entity_ref_id, respondent_id, service_mode, is_statutorily_valid, served_date, served_by)
VALUES
 ('d9000000-0000-0000-0000-00000f000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000001','CHARGE_SHEET','d9000000-0000-0000-0000-000010000001','d9000000-0000-0000-0000-00000d000001','REGD_POST', true,'2026-03-08','99999999-9999-9999-9999-999999999902'),
 ('d9000000-0000-0000-0000-00000f000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000002','CHARGE_SHEET','d9000000-0000-0000-0000-000010000002','d9000000-0000-0000-0000-00000d000002','IN_PERSON', true,'2026-01-12','99999999-9999-9999-9999-999999999901');

-- charge_sheets -----------------------------------------------------------------------
INSERT INTO charge_sheets (id, tenant_id, entity_id, case_id, charge_sheet_no, penalty_track, issued_by, issued_date, signature_type, signatory_id, signed_at, legal_service_id, defence_due_date, status)
VALUES
 ('d9000000-0000-0000-0000-000010000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000001','CS/2026/201','MAJOR','99999999-9999-9999-9999-999999999902','2026-03-05','DSC','99999999-9999-9999-9999-999999999902','2026-03-05 11:00+05:30','d9000000-0000-0000-0000-00000f000001','2026-03-23','RESPONDED'),
 ('d9000000-0000-0000-0000-000010000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000002','CS/2026/202','MINOR','99999999-9999-9999-9999-999999999901','2026-01-10','ESIGN','99999999-9999-9999-9999-999999999901','2026-01-10 09:30+05:30','d9000000-0000-0000-0000-00000f000002','2026-01-22','RESPONDED');

-- charge_articles ---------------------------------------------------------------------
INSERT INTO charge_articles (id, tenant_id, entity_id, charge_sheet_id, article_no, article_text, statement_of_imputation, rule_violated, finding)
VALUES
 ('d9000000-0000-0000-0000-000011000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-000010000001',1,'Sanctioned payment without verification','Approved a vendor payment of Rs.1.5L without verifying devolution records.','CCS(Conduct) Rule 3','PROVED'),
 ('d9000000-0000-0000-0000-000011000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-000010000002',1,'Unauthorised absence 12 days','Remained absent without sanctioned leave for 12 working days.','CCS(Conduct) Rule 3','PROVED');

-- penalty_orders ----------------------------------------------------------------------
INSERT INTO penalty_orders (id, tenant_id, entity_id, case_id, order_no, respondent_id, order_type, passed_by, competence_verified, competence_authority_level, order_date, reasoning_text, proportionality_reasoning, is_speaking_order, signature_type, signatory_id, signed_at, status)
VALUES
 ('d9000000-0000-0000-0000-000012000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000002','ORD/2026/401','d9000000-0000-0000-0000-00000d000002','PENALTY','99999999-9999-9999-9999-999999999901', true,'HEAD_OF_DEPT','2026-02-15','Charge of unauthorised absence stands proved on admission.','Censure proportionate to 12-day absence; first offence.', true,'ESIGN','99999999-9999-9999-9999-999999999901','2026-02-15 16:00+05:30','SERVED');

-- penalty_items -----------------------------------------------------------------------
INSERT INTO penalty_items (id, tenant_id, entity_id, order_id, penalty_type, penalty_class)
VALUES
 ('d9000000-0000-0000-0000-000013000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-000012000002','CENSURE','MINOR');

-- appeals -----------------------------------------------------------------------------
INSERT INTO appeals (id, tenant_id, entity_id, case_id, order_id, remedy_type, filed_by, filed_date, limitation_due_date, is_time_barred, authority_id, authority_competence_verified, decision, decided_date, status)
VALUES
 ('d9000000-0000-0000-0000-000014000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000002','d9000000-0000-0000-0000-000012000002','APPEAL','99999999-9999-9999-9999-999999999902','2026-02-20','2026-04-05', false,'99999999-9999-9999-9999-999999999901', true,'UPHELD','2026-03-10','DECIDED');

-- case_timeline_events (append-only) --------------------------------------------------
INSERT INTO case_timeline_events (id, tenant_id, entity_id, case_id, stage, event_type, event_at, sla_status, seq_no, prev_hash, row_hash)
VALUES
 ('d9000000-0000-0000-0000-000015000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000001','CHARGE','STAGE_COMPLETED','2026-03-23 00:00+05:30','ON_TRACK',12,NULL,'7c02aa11bb22cc33dd44ee55ff66001122334455667788990011223344556677'),
 ('d9000000-0000-0000-0000-000015000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','d9000000-0000-0000-0000-00000c000001','INQUIRY','SLA_PAUSE','2026-06-10 00:00+05:30','PAUSED',18,'7c02aa11bb22cc33dd44ee55ff66001122334455667788990011223344556677','b4d1ff00ee11dd22cc33bb44aa5566778899001122334455667788990011aabb');

-- idempotency_keys --------------------------------------------------------------------
INSERT INTO idempotency_keys (id, tenant_id, entity_id, idempotency_key, scope, case_id, request_fingerprint, status, expires_at)
VALUES
 ('d9000000-0000-0000-0000-000016000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','idem-finalise-ord401','ORDER_FINALISE','d9000000-0000-0000-0000-00000c000002','a1b2c3d4e5f6071829a0b1c2d3e4f5061728394a5b6c7d8e9f0011223344556','COMPLETED','2026-02-22 16:00+05:30'),
 ('d9000000-0000-0000-0000-000016000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','idem-sr-ord401','POST_TO_SR','d9000000-0000-0000-0000-00000c000002','b2c3d4e5f6071829a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566aa','COMPLETED','2026-02-22 16:05+05:30');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 09-G09-disciplinary-punishment.sql
-- =====================================================================================
