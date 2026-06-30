-- =====================================================================================
-- 11-G11-retirement-pension.sql
-- Government HRMS — Module schema for G11 (Retirement & Pension Management)
-- =====================================================================================
-- BUILD NOTES
-- -----------
-- Load order: AFTER 00-platform-core.sql (and AFTER 01-G01 once it lands). This module
--   references — never redefines — the canonical core tables. It FKs to:
--     tenants, entities, org_units, employees (G01), users, workflow_instances (P01),
--     documents (G13), service_register_events (G12), integration_credentials (P04/X.3),
--     migration_runs (P06).  None of those are re-created here.
-- Conventions: docs/data-model/CONVENTIONS.md is authoritative. Every business table:
--     id uuid PK DEFAULT gen_random_uuid(); tenant_id NOT NULL -> tenants(id) RESTRICT;
--     entity_id (nullable; state-wide rule/config rows leave it NULL) -> entities(id);
--     std audit columns (created_at/updated_at/created_by/updated_by/is_deleted);
--     soft delete only (no hard delete); RLS tenant_isolation policy (Section R at end).
--   BRD §5.2 prefixes every G11 entity `pen_` to avoid collision in the shared schema; we
--   keep that prefix for tables. The BRD's domain PK name (case_id, ppo_id, ...) is recorded
--   in a column comment / FK column name; the physical PK is `id` (CONVENTIONS §1).
-- Enums (CONVENTIONS §4): G11 lifecycle/type value sets are CLOSED statutory enumerations
--   -> CREATE TYPE ENUM, prefixed g11_* to avoid collision with core types. Tenant-
--   configurable catalogs (cadre/designation/grade/pay scale) are core master tables and
--   are NOT re-modelled here.
-- Money (Platform §; CONVENTIONS): benefit amounts NUMERIC(15,2); composite gross/net
--   settlement NUMERIC(18,2); rates/factors/percentages/fractions NUMERIC(9,4); service
--   durations integer Y/M/D. No floating point.
-- Effective-dated rule tables (E30–E36) follow config-cascade versioning: status DRAFT->
--   APPROVED->EFFECTIVE->SUPERSEDED, version_no, effective_from/effective_to; SoD approval
--   runs on P01 (maintainer<>approver). They are normal soft-delete RLS tables (not the
--   core append-only ledger). Historic calcs keep their `rule_version_ref` to a SUPERSEDED
--   row (IR17) — immutability of the *calc snapshot* is enforced by the P05 audit trigger.
-- SR posting boundary (BRD §1.4/§3.3/§8.7): G11 IS the canonical SR writer for the
--   SEPARATION / SUPERANNUATION / RETIREMENT / DEATH_IN_SERVICE / FAMILY_PENSION_SANCTIONED
--   life events. It posts them to the G12 core ledger `service_register_events` via
--   POST /api/v1/sr/ingest (source_module='G11'), deduped on the core tuple
--   (tenant_id, source_module, source_reference_id, source_event_version) with a mandatory
--   fact_key. This schema only stores the resulting sr_event_id linkage column on the case;
--   it NEVER mutates the G12 ledger directly.
-- Integrations (X.3): treasury/PDA, DigiLocker, penny-drop/NPCI mapper, death-registry/DBT
--   all run on the platform X.3 framework with P04 `integration_credentials`; we store only
--   the credential id reference (integration_credential_ref), never inline secrets.
-- PII: bank account no / Aadhaar / PRAN / PAN are stored MASKED here (raw values live in the
--   G01 aadhaar vault / encrypted stores); P02 masks on serialization.
-- Table count: 35 module-owned tables (BRD E04–E21 + E26–E42). NOTE: BRD §5.1 footer states
--   "34 (E26–E42 = 16)", but E26..E42 is 17 distinct entities (E30–E36 = 7 rule tables),
--   so the true owned count is 18 + 17 = 35. All are modelled below.
-- =====================================================================================


-- =====================================================================================
-- SECTION 1 — ENUM TYPES (G11 closed statutory enumerations; BRD §5.5)
-- =====================================================================================

-- Separation case ----------------------------------------------------------------------
CREATE TYPE g11_separation_type     AS ENUM ('SUPERANNUATION','VOLUNTARY_RETIREMENT','COMPULSORY_RETIREMENT',
                                             'INVALIDATION','DEATH_IN_SERVICE','RESIGNATION');
CREATE TYPE g11_pension_scheme      AS ENUM ('OPS','NPS','UPS');
CREATE TYPE g11_case_status         AS ENUM ('DRAFT','INITIATED','SR_VERIFICATION','NO_DUES','CALCULATION',
                                             'PENDING_SANCTION','SANCTIONED','PPO_ISSUED','SETTLED','CLOSED',
                                             'ON_HOLD','REJECTED');
CREATE TYPE g11_no_dues_status      AS ENUM ('NOT_STARTED','IN_PROGRESS','CLEARED','BLOCKED');
CREATE TYPE g11_case_initiator      AS ENUM ('SELF','HR','SYSTEM_FORECAST','DISCIPLINARY_G09');

-- Qualifying service / spells ----------------------------------------------------------
CREATE TYPE g11_qsr_status          AS ENUM ('DRAFT','VERIFIED','LOCKED');
CREATE TYPE g11_nq_spell_type       AS ENUM ('EOL_WITHOUT_PAY','DIES_NON','UNAUTHORISED_ABSENCE',
                                             'SUSPENSION_NON_REGULARISED','OVERSTAYAL','BREAK_IN_SERVICE','OTHER');
CREATE TYPE g11_spell_status        AS ENUM ('PENDING','ATTESTED','CONDONED','DEDUCTED');
CREATE TYPE g11_source_module       AS ENUM ('G03','G04','G09','G10','G12','MANUAL');
CREATE TYPE g11_prior_service_type  AS ENUM ('MILITARY','PRIOR_CENTRAL','PRIOR_STATE','PRIOR_TEMPORARY','AUTONOMOUS_BODY');
CREATE TYPE g11_prior_service_status AS ENUM ('DRAFT','VERIFIED','COUNTED','REJECTED');

-- Pension / commutation / gratuity calc ------------------------------------------------
CREATE TYPE g11_benefit_outcome     AS ENUM ('FULL_PENSION','SERVICE_GRATUITY_ONLY','NPS_DEFAULT_FAMILY',
                                             'NPS_DEFAULT_INVALID','UPS_ASSURED','NPS_INDICATIVE');
CREATE TYPE g11_emoluments_method   AS ENUM ('LAST_DRAWN','AVG_10_MONTH','BENEFICIAL_OF_BOTH','AVG_12_MONTH');
CREATE TYPE g11_calc_status         AS ENUM ('DRAFT','COMPUTED','SANCTIONED','SUPERSEDED');
CREATE TYPE g11_commutation_status  AS ENUM ('DRAFT','COMPUTED','SANCTIONED','RESTORED','SUPERSEDED');
CREATE TYPE g11_gratuity_type       AS ENUM ('RETIREMENT_GRATUITY','DEATH_GRATUITY','SERVICE_GRATUITY');
CREATE TYPE g11_gratuity_status     AS ENUM ('DRAFT','COMPUTED','SANCTIONED','PAID','WITHHELD_PROCEEDINGS','SUPERSEDED');

-- Family pension / family register -----------------------------------------------------
CREATE TYPE g11_enhanced_basis      AS ENUM ('IN_SERVICE','AFTER_RETIREMENT');
CREATE TYPE g11_fp_status           AS ENUM ('DRAFT','COMPUTED','SANCTIONED','ACTIVE','TRANSFERRED','CEASED','SUPERSEDED');
CREATE TYPE g11_family_relationship AS ENUM ('SPOUSE','SON','DAUGHTER','FATHER','MOTHER','DISABLED_CHILD',
                                             'WIDOWED_DAUGHTER','DEPENDENT_SIBLING','OTHER');
CREATE TYPE g11_family_marital      AS ENUM ('UNMARRIED','MARRIED','WIDOWED','DIVORCED');
CREATE TYPE g11_family_eligibility  AS ENUM ('ELIGIBLE','NOT_YET_ELIGIBLE','CEASED','UNDER_REVIEW');
CREATE TYPE g11_family_cessation    AS ENUM ('MAJORITY','MARRIAGE','EMPLOYMENT','INCOME_THRESHOLD','DEATH','REMARRIAGE_NA');
CREATE TYPE g11_family_member_status AS ENUM ('ACTIVE','SUPERSEDED','REMOVED');

-- Settlement / GPF / nominees ----------------------------------------------------------
CREATE TYPE g11_settlement_status   AS ENUM ('DRAFT','COMPUTED','SANCTIONED','PAID','PARTIALLY_WITHHELD','SUPERSEDED');
CREATE TYPE g11_gpf_status          AS ENUM ('DRAFT','COMPUTED','SANCTIONED','PAID','SUPERSEDED');
CREATE TYPE g11_nominee_scope       AS ENUM ('GRATUITY','GPF','LEAVE_ENCASHMENT');
CREATE TYPE g11_nominee_status      AS ENUM ('ACTIVE','SUPERSEDED','REMOVED');

-- PPO / pensioner lifecycle ------------------------------------------------------------
CREATE TYPE g11_ppo_type            AS ENUM ('SERVICE_PENSION','FAMILY_PENSION','ANTICIPATORY','PROVISIONAL','REVISED');
CREATE TYPE g11_ppo_status          AS ENUM ('DRAFT','ISSUED','AUTHORISED_TO_PDA','ACTIVE','SUPERSEDED','CANCELLED');
CREATE TYPE g11_pensioner_type      AS ENUM ('SELF','FAMILY');
CREATE TYPE g11_pensioner_status    AS ENUM ('ACTIVE','SUSPENDED','FAMILY_PENSION_ACTIVE','CEASED','DECEASED');
CREATE TYPE g11_death_source        AS ENUM ('REPORTED','DEATH_REGISTRY','DBT_ANOMALY','LC_FAILURE');
CREATE TYPE g11_disbursement_model  AS ENUM ('M11_COMPUTES_FULL','PDA_APPLIES_RELIEF');

-- Life certificate / revision / disbursement -------------------------------------------
CREATE TYPE g11_lc_method           AS ENUM ('JEEVAN_PRAMAAN_DLC','PHYSICAL','VIDEO_KYC','BANK_CERTIFIED');
CREATE TYPE g11_lc_result           AS ENUM ('VALID','FAILED','PENDING');
CREATE TYPE g11_lc_status           AS ENUM ('ACTIVE','SUPERSEDED','EXPIRED');
CREATE TYPE g11_revision_type       AS ENUM ('DA','PAY_COMMISSION','AGE_INCREMENT','RESTORATION','OTHER');
CREATE TYPE g11_revision_status     AS ENUM ('DRAFT','COMPUTED','SANCTIONED','APPLIED','SUPERSEDED');
CREATE TYPE g11_disbursement_status AS ENUM ('PENDING','TRANSMITTED','ACKNOWLEDGED','REJECTED','RECONCILED','FAILED');

-- Service verification / discrepancy / condonation -------------------------------------
CREATE TYPE g11_verification_status AS ENUM ('DRAFT','DISCREPANCIES_OPEN','ATTESTED','SIGNED_OFF','LOCKED');
CREATE TYPE g11_discrepancy_type    AS ENUM ('SERVICE_GAP','MISSING_REASON_CODE','SUSPENSION_UNREGULARISED',
                                             'OVERLAPPING_SPELL','MISSING_ORDER','PAY_ANOMALY',
                                             'PRIOR_SERVICE_UNVERIFIED','OTHER');
CREATE TYPE g11_resolution_action   AS ENUM ('REASON_CODE_ATTESTED','CONDONED','REGULARISED','WAIVED',
                                             'CORRECTED_IN_SOURCE','ESCALATED');
CREATE TYPE g11_discrepancy_status  AS ENUM ('OPEN','RESOLVED','CONDONED','WAIVED','ESCALATED');
CREATE TYPE g11_condonation_type    AS ENUM ('BREAK_IN_SERVICE','DEFICIENCY_IN_QUALIFYING_SERVICE',
                                             'EOL_TREATED_QUALIFYING','OTHER');
CREATE TYPE g11_condonation_status  AS ENUM ('VALID','REVOKED');

-- Rule tables (E30–E36) ----------------------------------------------------------------
CREATE TYPE g11_rule_status         AS ENUM ('DRAFT','APPROVED','EFFECTIVE','SUPERSEDED');
CREATE TYPE g11_rule_applies_to     AS ENUM ('PENSIONER','EMPLOYEE','BOTH');
CREATE TYPE g11_money_rounding      AS ENUM ('NEXT_HIGHER_RUPEE','NEAREST_RUPEE');

-- PDA registry -------------------------------------------------------------------------
CREATE TYPE g11_pda_type            AS ENUM ('TREASURY','BANK_CPPC','POST_OFFICE');
CREATE TYPE g11_pda_interface       AS ENUM ('FILE_SFTP','REST_API');
CREATE TYPE g11_pda_status          AS ENUM ('ACTIVE','SUSPENDED','RETIRED');

-- Overpayment / audit objection / provisional / account verification -------------------
CREATE TYPE g11_overpayment_trigger AS ENUM ('POST_DEATH_DRAWAL','LATE_DEATH_REPORT','REVISION_EXCESS',
                                             'ANTICIPATORY_EXCESS','DBT_ANOMALY','OTHER');
CREATE TYPE g11_overpayment_via     AS ENUM ('DEATH_REGISTRY','AADHAAR_DBT','LC_FAILURE','MANUAL','ANOMALY_JOB');
CREATE TYPE g11_overpayment_mode    AS ENUM ('FROM_FAMILY_PENSION','FROM_ESTATE','FROM_LEGAL_HEIR','WRITE_OFF');
CREATE TYPE g11_overpayment_status  AS ENUM ('IDENTIFIED','NOTIFIED','UNDER_RECOVERY','RECOVERED','WRITTEN_OFF','LEGAL');
CREATE TYPE g11_objection_source    AS ENUM ('AG_AUDIT','INTERNAL_AUDIT','TREASURY','SELF_DETECTED');
CREATE TYPE g11_objection_outcome   AS ENUM ('ACCEPTED_CORRECTED','DROPPED','RECOVERY_RAISED','SETTLED');
CREATE TYPE g11_objection_status    AS ENUM ('RAISED','UNDER_RESPONSE','RESPONDED','ACCEPTED','DROPPED','CLOSED');
CREATE TYPE g11_proceedings_type    AS ENUM ('DEPARTMENTAL','JUDICIAL');
CREATE TYPE g11_provisional_outcome AS ENUM ('EXONERATED','PENALTY_NO_RECOVERY','PENALTY_WITH_RECOVERY');
CREATE TYPE g11_provisional_status  AS ENUM ('ACTIVE','CONCLUDED_REGULARISED','CONCLUDED_RECOVERY');
CREATE TYPE g11_acct_verify_method  AS ENUM ('PENNY_DROP','NAME_IFSC_MATCH','NPCI_MAPPER');
CREATE TYPE g11_acct_verify_result  AS ENUM ('PENDING','MATCH','NAME_MISMATCH','ACCOUNT_INVALID','FAILED');
CREATE TYPE g11_acct_verify_status  AS ENUM ('PENDING','PASSED','BLOCKED');

-- Forecast / grievance / estimate ------------------------------------------------------
CREATE TYPE g11_forecast_horizon    AS ENUM ('DUE_24M','DUE_12M','DUE_6M','OVERDUE','BEYOND','UNRESOLVED');
CREATE TYPE g11_forecast_status     AS ENUM ('ACTIVE','STALE','EXCLUDED');
CREATE TYPE g11_grievance_status    AS ENUM ('OPEN','IN_PROGRESS','RESOLVED','ESCALATED','CLOSED');
CREATE TYPE g11_estimate_type       AS ENUM ('SELF_SERVICE','WHAT_IF');
CREATE TYPE g11_estimate_status     AS ENUM ('DRAFT','COMPUTED','EXPIRED');


-- =====================================================================================
-- SECTION 2 — EFFECTIVE-DATED RULE TABLES (E30–E36) + PDA REGISTRY (E37)
-- =====================================================================================
-- Config entities; no inter-module forward deps. Managed via the platform config cascade.

-- E30 pen_da_relief_rates --------------------------------------------------------------
CREATE TABLE pen_da_relief_rates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- da_rate_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code           varchar(48) NOT NULL,
    applies_to          g11_rule_applies_to NOT NULL DEFAULT 'PENSIONER',
    da_percent          numeric(9,4) NOT NULL,                         -- Dearness Relief %
    pay_commission_basis varchar(24),                                  -- e.g. '7CPC'
    effective_from      date NOT NULL,
    effective_to        date,
    version_no          integer NOT NULL DEFAULT 1,
    status              g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by         uuid,                                          -- logical ref users(id)
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_dar_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_dar_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_pen_dar_tenant ON pen_da_relief_rates(tenant_id);
CREATE INDEX ix_pen_dar_eff    ON pen_da_relief_rates(effective_from);
CREATE INDEX ix_pen_dar_status ON pen_da_relief_rates(status);

-- E31 pen_commutation_factors ----------------------------------------------------------
CREATE TABLE pen_commutation_factors (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- factor_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code           varchar(48) NOT NULL,
    age_next_birthday   integer NOT NULL,                              -- factor lookup key
    factor              numeric(9,4) NOT NULL,
    effective_from      date NOT NULL,
    effective_to        date,
    version_no          integer NOT NULL DEFAULT 1,
    status              g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by         uuid,
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_cf_code_age_ver UNIQUE (tenant_id, rule_code, age_next_birthday, version_no),
    CONSTRAINT ck_pen_cf_age CHECK (age_next_birthday BETWEEN 17 AND 100)
);
CREATE INDEX ix_pen_cf_tenant ON pen_commutation_factors(tenant_id);
CREATE INDEX ix_pen_cf_age    ON pen_commutation_factors(age_next_birthday);
CREATE INDEX ix_pen_cf_status ON pen_commutation_factors(status);

-- E32 pen_family_pension_rates ---------------------------------------------------------
CREATE TABLE pen_family_pension_rates (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- fp_rate_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                   varchar(48) NOT NULL,
    normal_rate_pct             numeric(9,4) NOT NULL,                 -- e.g. 0.30
    enhanced_rate_pct           numeric(9,4),                          -- e.g. 0.50
    enhanced_in_service_years   integer NOT NULL DEFAULT 10,
    enhanced_after_retire_years integer NOT NULL DEFAULT 7,
    enhanced_after_retire_age_cap integer NOT NULL DEFAULT 67,
    dual_fp_cap_amount          numeric(15,2),
    effective_from              date NOT NULL,
    effective_to                date,
    version_no                  integer NOT NULL DEFAULT 1,
    status                      g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by                 uuid,
    approved_at                 timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_fpr_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_fpr_tenant ON pen_family_pension_rates(tenant_id);
CREATE INDEX ix_pen_fpr_eff    ON pen_family_pension_rates(effective_from);
CREATE INDEX ix_pen_fpr_status ON pen_family_pension_rates(status);

-- E33 pen_gratuity_ceilings (DA-linked auto-step) --------------------------------------
CREATE TABLE pen_gratuity_ceilings (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- ceiling_id
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                varchar(48) NOT NULL,
    base_ceiling             numeric(15,2) NOT NULL,
    da_threshold_pct         numeric(9,4) NOT NULL DEFAULT 0.50,        -- step each 50% DA crossed
    auto_step_pct            numeric(9,4) NOT NULL DEFAULT 0.25,        -- +25% per threshold
    current_effective_ceiling numeric(15,2) NOT NULL,
    da_rate_ref              uuid REFERENCES pen_da_relief_rates(id) ON DELETE RESTRICT,
    effective_from           date NOT NULL,
    effective_to             date,
    version_no               integer NOT NULL DEFAULT 1,
    status                   g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by              uuid,
    approved_at              timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_gc_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_gc_tenant  ON pen_gratuity_ceilings(tenant_id);
CREATE INDEX ix_pen_gc_darate  ON pen_gratuity_ceilings(da_rate_ref);
CREATE INDEX ix_pen_gc_status  ON pen_gratuity_ceilings(status);

-- E34 pen_retirement_age_rules ---------------------------------------------------------
CREATE TABLE pen_retirement_age_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- age_rule_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code           varchar(48) NOT NULL,
    cadre               varchar(60),                                   -- cadre label (rule scope)
    category            varchar(60),
    superannuation_age  integer NOT NULL,
    effective_from      date NOT NULL,
    effective_to        date,
    version_no          integer NOT NULL DEFAULT 1,
    status              g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by         uuid,
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rar_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_rar_age CHECK (superannuation_age BETWEEN 50 AND 75)
);
CREATE INDEX ix_pen_rar_tenant ON pen_retirement_age_rules(tenant_id);
CREATE INDEX ix_pen_rar_status ON pen_retirement_age_rules(status);

-- E35 pen_pension_limit_rules ----------------------------------------------------------
CREATE TABLE pen_pension_limit_rules (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- limit_id
    tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                       varchar(48) NOT NULL,
    min_pension                     numeric(15,2) NOT NULL,
    max_pension                     numeric(15,2) NOT NULL,
    min_qualifying_years_for_pension integer NOT NULL DEFAULT 10,
    min_qualifying_years_for_full   integer NOT NULL DEFAULT 10,
    ups_min_guarantee               numeric(15,2),
    effective_from                  date NOT NULL,
    effective_to                    date,
    version_no                      integer NOT NULL DEFAULT 1,
    status                          g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by                     uuid,
    approved_at                     timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
    is_deleted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_plr_code_ver UNIQUE (tenant_id, rule_code, version_no),
    CONSTRAINT ck_pen_plr_minmax CHECK (max_pension >= min_pension)
);
CREATE INDEX ix_pen_plr_tenant ON pen_pension_limit_rules(tenant_id);
CREATE INDEX ix_pen_plr_status ON pen_pension_limit_rules(status);

-- E36 pen_rounding_rules ---------------------------------------------------------------
CREATE TABLE pen_rounding_rules (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- rounding_id
    tenant_id                       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                       uuid REFERENCES entities(id) ON DELETE RESTRICT,
    rule_code                       varchar(48) NOT NULL,
    half_year_threshold_months      integer NOT NULL DEFAULT 3,        -- >=3 months rounds up a half-year
    money_rounding                  g11_money_rounding NOT NULL DEFAULT 'NEXT_HIGHER_RUPEE',
    qualifying_service_cap_half_years integer NOT NULL DEFAULT 66,
    effective_from                  date NOT NULL,
    effective_to                    date,
    version_no                      integer NOT NULL DEFAULT 1,
    status                          g11_rule_status NOT NULL DEFAULT 'DRAFT',
    approved_by                     uuid,
    approved_at                     timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid,
    updated_by                      uuid,
    is_deleted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rr_code_ver UNIQUE (tenant_id, rule_code, version_no)
);
CREATE INDEX ix_pen_rr_tenant ON pen_rounding_rules(tenant_id);
CREATE INDEX ix_pen_rr_status ON pen_rounding_rules(status);

-- E37 pen_disbursing_authorities (PDA registry; X.3 model) -----------------------------
CREATE TABLE pen_disbursing_authorities (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pda_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pda_code                    varchar(48) NOT NULL,
    pda_name                    varchar(160) NOT NULL,
    pda_type                    g11_pda_type NOT NULL,
    pda_disbursement_model      g11_disbursement_model NOT NULL,
    interface_type              g11_pda_interface NOT NULL,
    integration_credential_ref  uuid REFERENCES integration_credentials(id) ON DELETE SET NULL,  -- P04
    payload_contract_version    varchar(24),
    ack_schema_ref              varchar(48),
    penny_drop_supported        boolean NOT NULL DEFAULT false,
    sandbox_certified           boolean NOT NULL DEFAULT false,
    status                      g11_pda_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_pda_code UNIQUE (tenant_id, pda_code)
);
CREATE INDEX ix_pen_pda_tenant ON pen_disbursing_authorities(tenant_id);
CREATE INDEX ix_pen_pda_cred   ON pen_disbursing_authorities(integration_credential_ref);
CREATE INDEX ix_pen_pda_status ON pen_disbursing_authorities(status);


-- =====================================================================================
-- SECTION 3 — STATUTORY FAMILY REGISTER (E26)
-- =====================================================================================

-- E26 pen_family_members (Form 3/14 statutory register) --------------------------------
CREATE TABLE pen_family_members (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- family_member_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    name                    varchar(160) NOT NULL,
    relationship            g11_family_relationship NOT NULL,
    dob                     date,
    is_disabled_dependent   boolean NOT NULL DEFAULT false,
    is_minor                boolean NOT NULL DEFAULT false,             -- computed from dob
    marital_status          g11_family_marital,
    is_govt_servant         boolean NOT NULL DEFAULT false,            -- dual-FP determination
    statutory_rank          integer NOT NULL,                          -- family-pension priority
    concurrent_share_pct    numeric(9,4),                              -- twins/multiple children
    eligibility_status      g11_family_eligibility NOT NULL DEFAULT 'NOT_YET_ELIGIBLE',
    cessation_reason        g11_family_cessation,
    form_ref                varchar(64),                               -- Form 3/14 doc reference (G13)
    document_id             uuid REFERENCES documents(id) ON DELETE SET NULL,
    valid_from              date,
    valid_to                date,
    status                  g11_family_member_status NOT NULL DEFAULT 'ACTIVE',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_fam_tenant   ON pen_family_members(tenant_id);
CREATE INDEX ix_pen_fam_employee ON pen_family_members(employee_id);
CREATE INDEX ix_pen_fam_rank     ON pen_family_members(employee_id, statutory_rank);
CREATE INDEX ix_pen_fam_doc      ON pen_family_members(document_id);
CREATE INDEX ix_pen_fam_status   ON pen_family_members(status);
COMMENT ON TABLE pen_family_members IS 'IR8: family-pension eligibility/hierarchy derive from this register by statutory_rank — never from pen_nominees_beneficiaries.';


-- =====================================================================================
-- SECTION 4 — SEPARATION CASE & SERVICE-VERIFICATION GATE (E04, E27–E29, E05–E06, E39)
-- =====================================================================================

-- E04 pen_separation_cases (master case) -----------------------------------------------
-- service_verification_id / sr_verification_id are forward refs resolved in Section D.
CREATE TABLE pen_separation_cases (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- case_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_no                 varchar(40) NOT NULL,                      -- e.g. PEN-2026-000123
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    org_unit_id             uuid NOT NULL REFERENCES org_units(id) ON DELETE RESTRICT,
    separation_type         g11_separation_type NOT NULL,
    pension_scheme          g11_pension_scheme NOT NULL,
    ups_opted_in            boolean NOT NULL DEFAULT false,
    retirement_date         date NOT NULL,
    pension_commence_date   date,
    reason_ref              varchar(96),                               -- G09 order / VRS / medical / death ref
    proceedings_pending     boolean NOT NULL DEFAULT false,
    proceedings_ref         varchar(96),                               -- G09 proceedings id
    notice_date             date,
    initiated_by_role       g11_case_initiator NOT NULL,
    workflow_instance_id    uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01
    service_verification_id uuid,                                      -- FK -> pen_service_verifications (Section D)
    sr_verification_id      uuid,                                      -- FK -> pen_qualifying_service_records (Section D)
    sr_event_id             uuid REFERENCES service_register_events(id) ON DELETE RESTRICT,  -- G12 separation event posted
    no_dues_status          g11_no_dues_status NOT NULL DEFAULT 'NOT_STARTED',
    anticipatory_pension_flag boolean NOT NULL DEFAULT false,
    provisional_pension_flag  boolean NOT NULL DEFAULT false,
    pda_id                  uuid REFERENCES pen_disbursing_authorities(id) ON DELETE RESTRICT,
    scheme_override_reason  text,                                      -- P05-audited when scheme overridden
    status                  g11_case_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_case_no UNIQUE (tenant_id, case_no)
);
CREATE INDEX ix_pen_case_tenant   ON pen_separation_cases(tenant_id);
CREATE INDEX ix_pen_case_entity   ON pen_separation_cases(entity_id);
CREATE INDEX ix_pen_case_employee ON pen_separation_cases(employee_id);
CREATE INDEX ix_pen_case_orgunit  ON pen_separation_cases(org_unit_id);
CREATE INDEX ix_pen_case_pda      ON pen_separation_cases(pda_id);
CREATE INDEX ix_pen_case_wf       ON pen_separation_cases(workflow_instance_id);
CREATE INDEX ix_pen_case_srevent  ON pen_separation_cases(sr_event_id);
CREATE INDEX ix_pen_case_status   ON pen_separation_cases(status);
CREATE INDEX ix_pen_case_type     ON pen_separation_cases(separation_type);
CREATE INDEX ix_pen_case_retdate  ON pen_separation_cases(retirement_date);
-- IR1: at most one active (non-closed/rejected) case per employee.
CREATE UNIQUE INDEX uq_pen_case_active_emp ON pen_separation_cases(tenant_id, employee_id)
    WHERE is_deleted = false AND status NOT IN ('CLOSED','REJECTED');

-- E27 pen_service_verifications (e-SR completeness gate) --------------------------------
CREATE TABLE pen_service_verifications (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- verification_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    employee_id                 uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    coverage_from               date NOT NULL,
    coverage_to                 date NOT NULL,
    gap_count                   integer NOT NULL DEFAULT 0,
    discrepancy_open_count      integer NOT NULL DEFAULT 0,
    spells_attested_count       integer NOT NULL DEFAULT 0,
    spells_total_count          integer NOT NULL DEFAULT 0,
    sr_custodian_signoff_by     uuid,                                  -- G12 custodian (logical ref users)
    payroll_signoff_by          uuid,                                  -- G10 officer
    pension_officer_signoff_by  uuid,                                  -- maker
    signoff_workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,  -- P01 PARALLEL_ALL_OF
    signoff_complete            boolean NOT NULL DEFAULT false,
    status                      g11_verification_status NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_sv_tenant   ON pen_service_verifications(tenant_id);
CREATE INDEX ix_pen_sv_case     ON pen_service_verifications(case_id);
CREATE INDEX ix_pen_sv_employee ON pen_service_verifications(employee_id);
CREATE INDEX ix_pen_sv_wf       ON pen_service_verifications(signoff_workflow_instance_id);
CREATE INDEX ix_pen_sv_status   ON pen_service_verifications(status);
COMMENT ON TABLE pen_service_verifications IS 'IR2a: a case enters CALCULATION only when this row is SIGNED_OFF/LOCKED with discrepancy_open_count=0 and spells_attested_count=spells_total_count.';

-- E29 pen_condonation_orders (condonation register) ------------------------------------
CREATE TABLE pen_condonation_orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- condonation_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    order_no            varchar(48) NOT NULL,
    order_date          date NOT NULL,
    authority           varchar(160) NOT NULL,
    condonation_type    g11_condonation_type NOT NULL,
    period_from         date,
    period_to           date,
    condoned_days       integer NOT NULL DEFAULT 0,
    document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    status              g11_condonation_status NOT NULL DEFAULT 'VALID',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_cond_order_no UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_pen_cond_tenant   ON pen_condonation_orders(tenant_id);
CREATE INDEX ix_pen_cond_employee ON pen_condonation_orders(employee_id);
CREATE INDEX ix_pen_cond_case     ON pen_condonation_orders(case_id);
CREATE INDEX ix_pen_cond_doc      ON pen_condonation_orders(document_id);
CREATE INDEX ix_pen_cond_status   ON pen_condonation_orders(status);

-- E28 pen_service_discrepancies (discrepancy ledger) -----------------------------------
CREATE TABLE pen_service_discrepancies (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- discrepancy_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    verification_id     uuid NOT NULL REFERENCES pen_service_verifications(id) ON DELETE RESTRICT,
    discrepancy_type    g11_discrepancy_type NOT NULL,
    period_from         date,
    period_to           date,
    source_module       g11_source_module,
    source_ref          varchar(96),
    description         text NOT NULL,
    resolution_action   g11_resolution_action,
    condonation_order_id uuid REFERENCES pen_condonation_orders(id) ON DELETE SET NULL,
    resolved_by         uuid,                                          -- logical ref users(id)
    resolved_at         timestamptz,
    status              g11_discrepancy_status NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_disc_tenant ON pen_service_discrepancies(tenant_id);
CREATE INDEX ix_pen_disc_verif  ON pen_service_discrepancies(verification_id);
CREATE INDEX ix_pen_disc_cond   ON pen_service_discrepancies(condonation_order_id);
CREATE INDEX ix_pen_disc_status ON pen_service_discrepancies(status);

-- E05 pen_qualifying_service_records ---------------------------------------------------
CREATE TABLE pen_qualifying_service_records (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- qsr_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    service_start_date      date NOT NULL,
    service_end_date        date NOT NULL,
    gross_service_years     integer NOT NULL DEFAULT 0,
    gross_service_months    integer NOT NULL DEFAULT 0,
    gross_service_days      integer NOT NULL DEFAULT 0,
    non_qualifying_days     integer NOT NULL DEFAULT 0,                -- Σ uncondoned spells
    prior_service_days      integer NOT NULL DEFAULT 0,               -- Σ counted prior service (E39)
    net_qualifying_years    integer NOT NULL DEFAULT 0,
    net_qualifying_months   integer NOT NULL DEFAULT 0,
    net_qualifying_days     integer NOT NULL DEFAULT 0,
    reckonable_half_years   integer NOT NULL DEFAULT 0,               -- rounded per E36
    weightage_years         integer,                                  -- VRS weightage (distinct from prior svc)
    meets_min_pension_service boolean NOT NULL DEFAULT false,         -- per E35 threshold
    sr_verified             boolean NOT NULL DEFAULT false,           -- G12 gap-free verification
    sr_verified_by          uuid,                                     -- SR Custodian (logical ref users)
    sr_verified_at          timestamptz,
    rounding_rule_ref       uuid REFERENCES pen_rounding_rules(id) ON DELETE RESTRICT,
    limit_rule_ref          uuid REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,
    verification_notes      text,
    status                  g11_qsr_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_qsr_tenant   ON pen_qualifying_service_records(tenant_id);
CREATE INDEX ix_pen_qsr_case     ON pen_qualifying_service_records(case_id);
CREATE INDEX ix_pen_qsr_employee ON pen_qualifying_service_records(employee_id);
CREATE INDEX ix_pen_qsr_status   ON pen_qualifying_service_records(status);
COMMENT ON COLUMN pen_qualifying_service_records.net_qualifying_days IS 'IR2: net = gross - Σ(uncondoned non-qualifying days) + Σ(counted prior-service days); condoned spells count as qualifying.';

-- E06 pen_non_qualifying_spells --------------------------------------------------------
CREATE TABLE pen_non_qualifying_spells (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- spell_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    qsr_id              uuid NOT NULL REFERENCES pen_qualifying_service_records(id) ON DELETE RESTRICT,
    case_id             uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    spell_type          g11_nq_spell_type NOT NULL,
    period_from         date NOT NULL,
    period_to           date NOT NULL,
    days                integer NOT NULL,
    source_module       g11_source_module,
    source_ref          varchar(96),
    reason_code         varchar(48),                                  -- attested reason code (FR-18)
    is_condoned         boolean NOT NULL DEFAULT false,
    condonation_order_id uuid REFERENCES pen_condonation_orders(id) ON DELETE SET NULL,
    attested            boolean NOT NULL DEFAULT false,
    attested_by         uuid,                                         -- logical ref users(id)
    attested_at         timestamptz,
    status              g11_spell_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_nqs_period CHECK (period_to >= period_from)
);
CREATE INDEX ix_pen_nqs_tenant ON pen_non_qualifying_spells(tenant_id);
CREATE INDEX ix_pen_nqs_qsr    ON pen_non_qualifying_spells(qsr_id);
CREATE INDEX ix_pen_nqs_case   ON pen_non_qualifying_spells(case_id);
CREATE INDEX ix_pen_nqs_cond   ON pen_non_qualifying_spells(condonation_order_id);
CREATE INDEX ix_pen_nqs_status ON pen_non_qualifying_spells(status);

-- E39 pen_prior_service_records (counted prior/military service) ------------------------
CREATE TABLE pen_prior_service_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- prior_service_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    prior_service_type  g11_prior_service_type NOT NULL,
    from_date           date NOT NULL,
    to_date             date NOT NULL,
    counted_days        integer NOT NULL DEFAULT 0,
    pro_forma_ref       varchar(96),
    pension_already_drawn boolean NOT NULL DEFAULT false,
    verified            boolean NOT NULL DEFAULT false,
    verified_by         uuid,                                         -- logical ref users(id)
    status              g11_prior_service_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_prior_period CHECK (to_date >= from_date)
);
CREATE INDEX ix_pen_prior_tenant   ON pen_prior_service_records(tenant_id);
CREATE INDEX ix_pen_prior_employee ON pen_prior_service_records(employee_id);
CREATE INDEX ix_pen_prior_case     ON pen_prior_service_records(case_id);
CREATE INDEX ix_pen_prior_status   ON pen_prior_service_records(status);


-- =====================================================================================
-- SECTION 5 — BENEFIT CALCULATIONS (E07–E12, E21, E41)
-- =====================================================================================

-- E07 pen_pension_calculations ---------------------------------------------------------
CREATE TABLE pen_pension_calculations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pension_calc_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    scheme                      g11_pension_scheme NOT NULL,
    benefit_outcome             g11_benefit_outcome NOT NULL,
    emoluments_base             numeric(15,2),                         -- from G10
    emoluments_method           g11_emoluments_method,
    avg_emoluments              numeric(15,2),
    qualifying_half_years       integer,
    pension_fraction            numeric(9,4),                          -- flat 0.50 for >=10 yrs
    basic_pension               numeric(15,2),
    minimum_pension_applied     boolean NOT NULL DEFAULT false,
    maximum_pension_cap_applied boolean NOT NULL DEFAULT false,
    ups_assured_payout          numeric(15,2),
    ups_min_guarantee_applied   boolean NOT NULL DEFAULT false,
    nps_default_benefit_amount  numeric(15,2),
    nps_corpus_ref              varchar(64),                           -- PRAN/corpus (CRA over X.3)
    nps_annuity_estimate        numeric(15,2),                         -- indicative (excl. determinism)
    nps_lumpsum_estimate        numeric(15,2),
    calc_trace                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    rule_version_ref            uuid NOT NULL REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,  -- IR17
    da_rate_ref                 uuid REFERENCES pen_da_relief_rates(id) ON DELETE RESTRICT,
    status                      g11_calc_status NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_pc_tenant ON pen_pension_calculations(tenant_id);
CREATE INDEX ix_pen_pc_case   ON pen_pension_calculations(case_id);
CREATE INDEX ix_pen_pc_rule   ON pen_pension_calculations(rule_version_ref);
CREATE INDEX ix_pen_pc_status ON pen_pension_calculations(status);
COMMENT ON COLUMN pen_pension_calculations.rule_version_ref IS 'IR17: must point at the rule-version row EFFECTIVE on the relevant date; SUPERSEDED rows stay referenced by historic calcs. Anchor rule set = pension limit rules (E35); component refs live on commutation/gratuity rows.';

-- E08 pen_commutation_records ----------------------------------------------------------
CREATE TABLE pen_commutation_records (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- commutation_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    pension_calc_id         uuid NOT NULL REFERENCES pen_pension_calculations(id) ON DELETE RESTRICT,
    opted                   boolean NOT NULL DEFAULT false,
    commuted_fraction       numeric(9,4),                              -- <= statutory max (e.g. 0.40)
    commuted_pension_amount numeric(15,2),
    age_next_birthday       integer,
    commutation_factor      numeric(9,4),
    commutation_factor_ref  uuid REFERENCES pen_commutation_factors(id) ON DELETE RESTRICT,
    commuted_value          numeric(15,2),                             -- commuted x factor x 12
    residual_pension        numeric(15,2),
    commutation_payment_date date,
    reduction_effective_date date,
    restoration_due_date    date,                                      -- reduction date + 15 yrs (IR4a)
    migrated_date_unknown   boolean NOT NULL DEFAULT false,
    restored                boolean NOT NULL DEFAULT false,
    restored_on             date,
    calc_trace              jsonb,
    status                  g11_commutation_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_com_tenant      ON pen_commutation_records(tenant_id);
CREATE INDEX ix_pen_com_case        ON pen_commutation_records(case_id);
CREATE INDEX ix_pen_com_calc        ON pen_commutation_records(pension_calc_id);
CREATE INDEX ix_pen_com_factor      ON pen_commutation_records(commutation_factor_ref);
CREATE INDEX ix_pen_com_restoredue  ON pen_commutation_records(restoration_due_date) WHERE restored = false;
CREATE INDEX ix_pen_com_status      ON pen_commutation_records(status);

-- E09 pen_gratuity_calculations --------------------------------------------------------
CREATE TABLE pen_gratuity_calculations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- gratuity_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    gratuity_type           g11_gratuity_type NOT NULL,
    emoluments_base         numeric(15,2) NOT NULL,                    -- basic+DA (from G10)
    qualifying_half_years   integer NOT NULL,
    service_slab_factor     numeric(9,4),                              -- death-gratuity slab
    service_gratuity_months numeric(9,4),                              -- service-gratuity multiplier (<10 yrs)
    computed_amount         numeric(15,2) NOT NULL,                    -- before ceiling
    statutory_ceiling       numeric(15,2) NOT NULL,
    ceiling_ref             uuid REFERENCES pen_gratuity_ceilings(id) ON DELETE RESTRICT,
    ceiling_applied         boolean NOT NULL DEFAULT false,
    payable_amount          numeric(15,2) NOT NULL,                    -- min(computed, ceiling)
    withheld_amount         numeric(15,2),                             -- Rule-9 / no-dues withholding
    nominee_split           jsonb,                                     -- death-gratuity apportionment (E21)
    calc_trace              jsonb NOT NULL DEFAULT '{}'::jsonb,
    rule_version_ref        uuid NOT NULL REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,
    status                  g11_gratuity_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_grat_tenant  ON pen_gratuity_calculations(tenant_id);
CREATE INDEX ix_pen_grat_case    ON pen_gratuity_calculations(case_id);
CREATE INDEX ix_pen_grat_ceiling ON pen_gratuity_calculations(ceiling_ref);
CREATE INDEX ix_pen_grat_type    ON pen_gratuity_calculations(gratuity_type);
CREATE INDEX ix_pen_grat_status  ON pen_gratuity_calculations(status);

-- E12 pen_gpf_final_settlements --------------------------------------------------------
CREATE TABLE pen_gpf_final_settlements (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- gpf_settlement_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    gpf_account_no_masked   varchar(32),                               -- masked; raw in G10/vault
    closing_balance         numeric(15,2),
    interest_amount         numeric(15,2),
    advances_outstanding    numeric(15,2),
    withdrawals_adjusted    numeric(15,2),
    final_payable           numeric(15,2),
    authorised_by           uuid,                                      -- logical ref users(id)
    authorised_at           timestamptz,
    calc_trace              jsonb,
    status                  g11_gpf_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_gpf_tenant ON pen_gpf_final_settlements(tenant_id);
CREATE INDEX ix_pen_gpf_case   ON pen_gpf_final_settlements(case_id);
CREATE INDEX ix_pen_gpf_status ON pen_gpf_final_settlements(status);

-- E21 pen_nominees_beneficiaries (gratuity/GPF/leave-encashment ONLY; NOT family pension)
CREATE TABLE pen_nominees_beneficiaries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- nominee_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    benefit_scope       g11_nominee_scope NOT NULL,
    nominee_name        varchar(160) NOT NULL,
    relationship        g11_family_relationship NOT NULL,
    share_pct           numeric(9,4) NOT NULL,                         -- IR14: Σ per scope = 100.00
    is_minor            boolean NOT NULL DEFAULT false,
    guardian_name       varchar(160),
    document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    valid_from          date,
    valid_to            date,
    status              g11_nominee_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_nom_share CHECK (share_pct >= 0 AND share_pct <= 100)
);
CREATE INDEX ix_pen_nom_tenant   ON pen_nominees_beneficiaries(tenant_id);
CREATE INDEX ix_pen_nom_employee ON pen_nominees_beneficiaries(employee_id);
CREATE INDEX ix_pen_nom_scope    ON pen_nominees_beneficiaries(employee_id, benefit_scope);
CREATE INDEX ix_pen_nom_status   ON pen_nominees_beneficiaries(status);
COMMENT ON TABLE pen_nominees_beneficiaries IS 'IR14: Σ share_pct per (employee, benefit_scope) = 100.00 (VAL-NOMINEE), enforced in the service layer. Family-pension eligibility is NOT here — see pen_family_members.';

-- E41 pen_provisional_pension_records (Rule 9) -----------------------------------------
CREATE TABLE pen_provisional_pension_records (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- provisional_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    proceedings_ref             varchar(96) NOT NULL,                  -- G09 proceedings id
    proceedings_type            g11_proceedings_type NOT NULL,
    provisional_pension_amount  numeric(15,2) NOT NULL,
    dcrg_withheld               boolean NOT NULL DEFAULT true,         -- IR15: true until conclusion
    dcrg_withheld_amount        numeric(15,2) NOT NULL DEFAULT 0,
    commenced_on                date NOT NULL,
    proceedings_concluded_on    date,
    conclusion_outcome          g11_provisional_outcome,
    final_recovery_amount       numeric(15,2),
    status                      g11_provisional_status NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_prov_tenant ON pen_provisional_pension_records(tenant_id);
CREATE INDEX ix_pen_prov_case   ON pen_provisional_pension_records(case_id);
CREATE INDEX ix_pen_prov_status ON pen_provisional_pension_records(status);


-- =====================================================================================
-- SECTION 6 — FAMILY PENSION & TERMINAL SETTLEMENT (E10, E11)
-- =====================================================================================
-- source_pensioner_id on family pension is a forward ref resolved in Section D.

-- E10 pen_family_pension_records -------------------------------------------------------
CREATE TABLE pen_family_pension_records (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- fp_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                 uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    source_pensioner_id     uuid,                                      -- FK -> pen_pensioners (Section D)
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    enhanced_basis          g11_enhanced_basis NOT NULL,
    emoluments_base         numeric(15,2) NOT NULL,
    normal_rate_pct         numeric(9,4) NOT NULL,                     -- from E32
    enhanced_rate_pct       numeric(9,4),
    normal_amount           numeric(15,2) NOT NULL,
    enhanced_amount         numeric(15,2),
    enhanced_from           date,
    enhanced_to             date,
    enhanced_window_rule    text NOT NULL,                             -- which window rule was applied
    fp_rate_ref             uuid REFERENCES pen_family_pension_rates(id) ON DELETE RESTRICT,
    current_family_member_id uuid REFERENCES pen_family_members(id) ON DELETE SET NULL,
    beneficiary_hierarchy   jsonb,                                     -- ordered eligible chain (E26 snapshot)
    dual_family_pension     boolean NOT NULL DEFAULT false,
    dual_cap_applied        boolean NOT NULL DEFAULT false,
    eligibility_review_date date,
    calc_trace              jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                  g11_fp_status NOT NULL DEFAULT 'DRAFT',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_fp_tenant   ON pen_family_pension_records(tenant_id);
CREATE INDEX ix_pen_fp_case     ON pen_family_pension_records(case_id);
CREATE INDEX ix_pen_fp_employee ON pen_family_pension_records(employee_id);
CREATE INDEX ix_pen_fp_member   ON pen_family_pension_records(current_family_member_id);
CREATE INDEX ix_pen_fp_rate     ON pen_family_pension_records(fp_rate_ref);
CREATE INDEX ix_pen_fp_status   ON pen_family_pension_records(status);

-- E11 pen_terminal_settlements ---------------------------------------------------------
CREATE TABLE pen_terminal_settlements (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- settlement_id
    tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                     uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    leave_encashment_days       integer,                               -- from G03
    leave_encashment_amount     numeric(15,2),
    gratuity_ref                uuid REFERENCES pen_gratuity_calculations(id) ON DELETE SET NULL,
    gpf_settlement_ref          uuid REFERENCES pen_gpf_final_settlements(id) ON DELETE SET NULL,
    commuted_value_ref          uuid REFERENCES pen_commutation_records(id) ON DELETE SET NULL,
    other_dues                  jsonb,
    recoveries_total            numeric(15,2),                         -- G09/overpayment/loan
    recovery_refs               jsonb,
    gross_settlement            numeric(18,2) NOT NULL DEFAULT 0,
    gratuity_exempt_amount      numeric(15,2),
    gratuity_taxable_amount     numeric(15,2),
    commutation_exempt_amount   numeric(15,2),
    leave_encashment_exempt_amount numeric(15,2),
    taxable_total               numeric(18,2),
    tds_amount                  numeric(15,2),
    section_89_relief           numeric(15,2),                         -- Section 89(1)
    tax_breakdown               jsonb,
    net_settlement              numeric(18,2) NOT NULL DEFAULT 0,      -- gross - recoveries - TDS
    status                      g11_settlement_status NOT NULL DEFAULT 'DRAFT',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_by                  uuid,
    is_deleted                  boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_ts_tenant ON pen_terminal_settlements(tenant_id);
CREATE INDEX ix_pen_ts_case   ON pen_terminal_settlements(case_id);
CREATE INDEX ix_pen_ts_grat   ON pen_terminal_settlements(gratuity_ref);
CREATE INDEX ix_pen_ts_gpf    ON pen_terminal_settlements(gpf_settlement_ref);
CREATE INDEX ix_pen_ts_status ON pen_terminal_settlements(status);


-- =====================================================================================
-- SECTION 7 — PPO, PENSIONER MASTER & LIFECYCLE (E13–E17, E38, E40, E42)
-- =====================================================================================
-- ppo_records.pensioner_id and pen_pensioners.ppo_id are mutually forward; pensioner_id
-- FK is resolved in Section D.

-- E13 pen_ppo_records ------------------------------------------------------------------
CREATE TABLE pen_ppo_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- ppo_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    ppo_no              varchar(48) NOT NULL,                          -- statutory PPO number
    case_id             uuid NOT NULL REFERENCES pen_separation_cases(id) ON DELETE RESTRICT,
    pensioner_id        uuid,                                          -- FK -> pen_pensioners (Section D)
    ppo_type            g11_ppo_type NOT NULL,
    pension_calc_ref    uuid REFERENCES pen_pension_calculations(id) ON DELETE SET NULL,
    family_pension_ref  uuid REFERENCES pen_family_pension_records(id) ON DELETE SET NULL,
    provisional_ref     uuid REFERENCES pen_provisional_pension_records(id) ON DELETE SET NULL,
    basic_pension       numeric(15,2),
    relief_formula_ref  uuid REFERENCES pen_da_relief_rates(id) ON DELETE SET NULL,  -- PDA_APPLIES_RELIEF
    commuted_portion    numeric(15,2),
    residual_pension    numeric(15,2),
    pda_id              uuid REFERENCES pen_disbursing_authorities(id) ON DELETE RESTRICT,
    effective_from      date NOT NULL,
    e_ppo_document_id   uuid REFERENCES documents(id) ON DELETE SET NULL,  -- DocumentGen (G13)
    digilocker_pushed   boolean NOT NULL DEFAULT false,
    digilocker_ref      varchar(160),
    authorised_by       uuid,                                          -- logical ref users(id)
    authorised_at       timestamptz,
    supersedes_ppo_id   uuid REFERENCES pen_ppo_records(id) ON DELETE SET NULL,  -- self ref
    status              g11_ppo_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_ppo_no UNIQUE (tenant_id, ppo_no)
);
CREATE INDEX ix_pen_ppo_tenant     ON pen_ppo_records(tenant_id);
CREATE INDEX ix_pen_ppo_case       ON pen_ppo_records(case_id);
CREATE INDEX ix_pen_ppo_pensioner  ON pen_ppo_records(pensioner_id);
CREATE INDEX ix_pen_ppo_calc       ON pen_ppo_records(pension_calc_ref);
CREATE INDEX ix_pen_ppo_fp         ON pen_ppo_records(family_pension_ref);
CREATE INDEX ix_pen_ppo_pda        ON pen_ppo_records(pda_id);
CREATE INDEX ix_pen_ppo_doc        ON pen_ppo_records(e_ppo_document_id);
CREATE INDEX ix_pen_ppo_supersedes ON pen_ppo_records(supersedes_ppo_id);
CREATE INDEX ix_pen_ppo_type       ON pen_ppo_records(ppo_type);
CREATE INDEX ix_pen_ppo_status     ON pen_ppo_records(status);

-- E14 pen_pensioners (pensioner master & lifecycle) ------------------------------------
CREATE TABLE pen_pensioners (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- pensioner_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pensioner_no        varchar(48) NOT NULL,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    employee_id         uuid REFERENCES employees(id) ON DELETE RESTRICT,
    ppo_id              uuid REFERENCES pen_ppo_records(id) ON DELETE SET NULL,  -- active PPO
    pensioner_type      g11_pensioner_type NOT NULL DEFAULT 'SELF',
    current_pension_basic numeric(15,2),
    pda_id              uuid REFERENCES pen_disbursing_authorities(id) ON DELETE RESTRICT,
    disbursement_model  g11_disbursement_model NOT NULL,               -- denormalised from PDA
    aadhaar_masked      varchar(20),                                   -- encrypted, masked by P02
    pran                varchar(24),                                   -- NPS/UPS linkage
    bank_account_masked varchar(32),
    life_cert_valid_until date,
    date_of_death       date,
    death_detected_source g11_death_source,
    overpayment_open    boolean NOT NULL DEFAULT false,
    lifecycle_status    g11_pensioner_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_pensioner_no UNIQUE (tenant_id, pensioner_no)
);
CREATE INDEX ix_pen_pen_tenant   ON pen_pensioners(tenant_id);
CREATE INDEX ix_pen_pen_case     ON pen_pensioners(case_id);
CREATE INDEX ix_pen_pen_employee ON pen_pensioners(employee_id);
CREATE INDEX ix_pen_pen_ppo      ON pen_pensioners(ppo_id);
CREATE INDEX ix_pen_pen_pda      ON pen_pensioners(pda_id);
CREATE INDEX ix_pen_pen_status   ON pen_pensioners(lifecycle_status);
CREATE INDEX ix_pen_pen_lcdue    ON pen_pensioners(life_cert_valid_until) WHERE lifecycle_status = 'ACTIVE';

-- E42 pen_bank_account_verifications (penny-drop over X.3) ------------------------------
CREATE TABLE pen_bank_account_verifications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- verification_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE SET NULL,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    account_no_masked   varchar(32) NOT NULL,                          -- encrypted, masked by P02
    ifsc                varchar(16) NOT NULL,
    account_name        varchar(160) NOT NULL,
    method              g11_acct_verify_method NOT NULL,
    name_match_score    numeric(9,4),
    verified_name       varchar(160),
    result              g11_acct_verify_result NOT NULL DEFAULT 'PENDING',
    verified_at         timestamptz,
    status              g11_acct_verify_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_bav_tenant    ON pen_bank_account_verifications(tenant_id);
CREATE INDEX ix_pen_bav_pensioner ON pen_bank_account_verifications(pensioner_id);
CREATE INDEX ix_pen_bav_case      ON pen_bank_account_verifications(case_id);
CREATE INDEX ix_pen_bav_status    ON pen_bank_account_verifications(status);
COMMENT ON TABLE pen_bank_account_verifications IS 'IR16: no FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE disbursement line may be TRANSMITTED unless a row for that account is PASSED.';

-- E15 pen_life_certificates ------------------------------------------------------------
CREATE TABLE pen_life_certificates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- life_certificate_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pensioner_id        uuid NOT NULL REFERENCES pen_pensioners(id) ON DELETE RESTRICT,
    certificate_year    integer NOT NULL,
    method              g11_lc_method NOT NULL,
    jeevan_pramaan_id   varchar(64),
    submitted_on        date,
    valid_until         date,
    result              g11_lc_result NOT NULL DEFAULT 'PENDING',
    document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    status              g11_lc_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_lc_year UNIQUE (tenant_id, pensioner_id, certificate_year)
);
CREATE INDEX ix_pen_lc_tenant    ON pen_life_certificates(tenant_id);
CREATE INDEX ix_pen_lc_pensioner ON pen_life_certificates(pensioner_id);
CREATE INDEX ix_pen_lc_status    ON pen_life_certificates(status);

-- E16 pen_revisions (DA / pay-commission revision batches & per-pensioner deltas) -------
CREATE TABLE pen_revisions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- revision_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    revision_no         varchar(48) NOT NULL,
    revision_type       g11_revision_type NOT NULL,
    effective_date      date NOT NULL,
    is_batch            boolean NOT NULL DEFAULT false,                -- true = batch header
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE RESTRICT,  -- null on batch header
    job_run_ref         varchar(64),                                   -- JOB-G11-PENSION-RUN run_key
    rule_version_ref    uuid REFERENCES pen_pension_limit_rules(id) ON DELETE RESTRICT,
    da_rate_ref         uuid REFERENCES pen_da_relief_rates(id) ON DELETE RESTRICT,
    old_basic           numeric(15,2),
    new_basic           numeric(15,2),
    arrears_amount      numeric(15,2),
    application_order   integer,                                       -- IR18 §16.9 ordering
    calc_trace          jsonb,
    status              g11_revision_status NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rev_no UNIQUE (tenant_id, revision_no)
);
CREATE INDEX ix_pen_rev_tenant    ON pen_revisions(tenant_id);
CREATE INDEX ix_pen_rev_pensioner ON pen_revisions(pensioner_id);
CREATE INDEX ix_pen_rev_eff       ON pen_revisions(effective_date);
CREATE INDEX ix_pen_rev_status    ON pen_revisions(status);

-- E17 pen_disbursements (instruction batches/lines & PDA acknowledgement) ---------------
CREATE TABLE pen_disbursements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- disbursement_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    disbursement_no     varchar(48) NOT NULL,
    pda_id              uuid NOT NULL REFERENCES pen_disbursing_authorities(id) ON DELETE RESTRICT,
    is_batch            boolean NOT NULL DEFAULT false,
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE RESTRICT,  -- null on batch header
    ppo_id              uuid REFERENCES pen_ppo_records(id) ON DELETE SET NULL,
    account_verification_ref uuid REFERENCES pen_bank_account_verifications(id) ON DELETE SET NULL,
    period_month        date,                                          -- first of disbursement month
    gross_amount        numeric(15,2),
    relief_amount       numeric(15,2),
    deductions          numeric(15,2),
    net_amount          numeric(15,2),
    disbursement_model  g11_disbursement_model NOT NULL,
    ack_ref             varchar(96),
    ack_at              timestamptz,
    status              g11_disbursement_status NOT NULL DEFAULT 'PENDING',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_disb_no UNIQUE (tenant_id, disbursement_no)
);
CREATE INDEX ix_pen_disb_tenant    ON pen_disbursements(tenant_id);
CREATE INDEX ix_pen_disb_pda       ON pen_disbursements(pda_id);
CREATE INDEX ix_pen_disb_pensioner ON pen_disbursements(pensioner_id);
CREATE INDEX ix_pen_disb_ppo       ON pen_disbursements(ppo_id);
CREATE INDEX ix_pen_disb_acctverif ON pen_disbursements(account_verification_ref);
CREATE INDEX ix_pen_disb_status    ON pen_disbursements(status);

-- E38 pen_overpayment_recoveries -------------------------------------------------------
CREATE TABLE pen_overpayment_recoveries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- overpayment_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pensioner_id        uuid NOT NULL REFERENCES pen_pensioners(id) ON DELETE RESTRICT,
    trigger             g11_overpayment_trigger NOT NULL,
    detected_via        g11_overpayment_via NOT NULL,
    period_from         date,
    period_to           date,
    overpaid_amount     numeric(15,2) NOT NULL,
    recovered_amount    numeric(15,2),
    recovery_mode       g11_overpayment_mode,
    legal_heir_ref      varchar(96),
    linked_fp_id        uuid REFERENCES pen_family_pension_records(id) ON DELETE SET NULL,  -- IR19
    status              g11_overpayment_status NOT NULL DEFAULT 'IDENTIFIED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_over_tenant    ON pen_overpayment_recoveries(tenant_id);
CREATE INDEX ix_pen_over_pensioner ON pen_overpayment_recoveries(pensioner_id);
CREATE INDEX ix_pen_over_fp        ON pen_overpayment_recoveries(linked_fp_id);
CREATE INDEX ix_pen_over_status    ON pen_overpayment_recoveries(status);

-- E40 pen_audit_objections -------------------------------------------------------------
CREATE TABLE pen_audit_objections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- objection_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    objection_no        varchar(48) NOT NULL,
    source              g11_objection_source NOT NULL,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    ppo_id              uuid REFERENCES pen_ppo_records(id) ON DELETE SET NULL,
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE SET NULL,
    calc_trace_ref      varchar(96),
    objection_text      text NOT NULL,
    raised_on           date NOT NULL,
    sla_due_at          timestamptz,                                   -- P01 SLA timer
    response_text       text,
    outcome             g11_objection_outcome,
    linked_revision_id  uuid REFERENCES pen_revisions(id) ON DELETE SET NULL,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    status              g11_objection_status NOT NULL DEFAULT 'RAISED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_obj_no UNIQUE (tenant_id, objection_no)
);
CREATE INDEX ix_pen_obj_tenant    ON pen_audit_objections(tenant_id);
CREATE INDEX ix_pen_obj_case      ON pen_audit_objections(case_id);
CREATE INDEX ix_pen_obj_ppo       ON pen_audit_objections(ppo_id);
CREATE INDEX ix_pen_obj_pensioner ON pen_audit_objections(pensioner_id);
CREATE INDEX ix_pen_obj_revision  ON pen_audit_objections(linked_revision_id);
CREATE INDEX ix_pen_obj_status    ON pen_audit_objections(status);


-- =====================================================================================
-- SECTION 8 — FORECASTING, SELF-SERVICE & GRIEVANCE (E18, E19, E20)
-- =====================================================================================

-- E18 pen_retirement_forecasts ---------------------------------------------------------
CREATE TABLE pen_retirement_forecasts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- forecast_id
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id             uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    org_unit_id             uuid REFERENCES org_units(id) ON DELETE RESTRICT,
    projected_retirement_date date,
    retirement_age_applied  integer,
    age_rule_ref            uuid REFERENCES pen_retirement_age_rules(id) ON DELETE SET NULL,
    horizon_bucket          g11_forecast_horizon NOT NULL DEFAULT 'BEYOND',
    case_initiated          boolean NOT NULL DEFAULT false,
    case_id                 uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    computed_at             timestamptz NOT NULL DEFAULT now(),
    status                  g11_forecast_status NOT NULL DEFAULT 'ACTIVE',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_fc_employee UNIQUE (tenant_id, employee_id)
);
CREATE INDEX ix_pen_fc_tenant  ON pen_retirement_forecasts(tenant_id);
CREATE INDEX ix_pen_fc_horizon ON pen_retirement_forecasts(tenant_id, horizon_bucket, org_unit_id);
CREATE INDEX ix_pen_fc_date    ON pen_retirement_forecasts(projected_retirement_date);
CREATE INDEX ix_pen_fc_case    ON pen_retirement_forecasts(case_id);

-- E19 pen_grievances -------------------------------------------------------------------
CREATE TABLE pen_grievances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- grievance_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    grievance_no        varchar(48) NOT NULL,
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE SET NULL,
    case_id             uuid REFERENCES pen_separation_cases(id) ON DELETE SET NULL,
    category            varchar(60),
    channel             varchar(24),
    description         text NOT NULL,
    sla_due_at          timestamptz,
    workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
    assigned_to         uuid,                                          -- logical ref users(id)
    resolution_text     text,
    resolved_at         timestamptz,
    status              g11_grievance_status NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_grv_no UNIQUE (tenant_id, grievance_no)
);
CREATE INDEX ix_pen_grv_tenant    ON pen_grievances(tenant_id);
CREATE INDEX ix_pen_grv_pensioner ON pen_grievances(pensioner_id);
CREATE INDEX ix_pen_grv_case      ON pen_grievances(case_id);
CREATE INDEX ix_pen_grv_status    ON pen_grievances(status);

-- E20 pen_benefit_estimates (self-service / what-if; non-binding) -----------------------
CREATE TABLE pen_benefit_estimates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- estimate_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    estimate_type       g11_estimate_type NOT NULL DEFAULT 'SELF_SERVICE',
    scheme              g11_pension_scheme,
    inputs              jsonb,
    estimated_pension   numeric(15,2),
    estimated_gratuity  numeric(15,2),
    estimated_commutation numeric(15,2),
    estimated_total     numeric(18,2),
    is_binding          boolean NOT NULL DEFAULT false,
    computed_at         timestamptz NOT NULL DEFAULT now(),
    status              g11_estimate_status NOT NULL DEFAULT 'COMPUTED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_est_tenant   ON pen_benefit_estimates(tenant_id);
CREATE INDEX ix_pen_est_employee ON pen_benefit_estimates(employee_id);
CREATE INDEX ix_pen_est_status   ON pen_benefit_estimates(status);


-- =====================================================================================
-- SECTION D — DEFERRED CROSS-TABLE FOREIGN KEYS (forward / circular references)
-- =====================================================================================

-- separation_cases -> service_verifications (signed-off e-SR completeness record)
ALTER TABLE pen_separation_cases
    ADD CONSTRAINT fk_pen_case_service_verification
    FOREIGN KEY (service_verification_id) REFERENCES pen_service_verifications(id) ON DELETE SET NULL;

-- separation_cases -> qualifying_service_records (verified service)
ALTER TABLE pen_separation_cases
    ADD CONSTRAINT fk_pen_case_sr_verification
    FOREIGN KEY (sr_verification_id) REFERENCES pen_qualifying_service_records(id) ON DELETE SET NULL;

-- family_pension_records -> pensioners (source pensioner on conversion-on-death)
ALTER TABLE pen_family_pension_records
    ADD CONSTRAINT fk_pen_fp_source_pensioner
    FOREIGN KEY (source_pensioner_id) REFERENCES pen_pensioners(id) ON DELETE SET NULL;

-- ppo_records -> pensioners (active PPO's enrolled pensioner)
ALTER TABLE pen_ppo_records
    ADD CONSTRAINT fk_pen_ppo_pensioner
    FOREIGN KEY (pensioner_id) REFERENCES pen_pensioners(id) ON DELETE SET NULL;


-- =====================================================================================
-- SECTION R — ROW-LEVEL SECURITY (P02 data-scope substrate; CONVENTIONS §6)
-- =====================================================================================
-- Same tenant_isolation template the core DO-block applies. Applied to every G11 table.

DO $$
DECLARE
    t text;
    g11_tables text[] := ARRAY[
        'pen_da_relief_rates','pen_commutation_factors','pen_family_pension_rates',
        'pen_gratuity_ceilings','pen_retirement_age_rules','pen_pension_limit_rules',
        'pen_rounding_rules','pen_disbursing_authorities','pen_family_members',
        'pen_separation_cases','pen_service_verifications','pen_condonation_orders',
        'pen_service_discrepancies','pen_qualifying_service_records','pen_non_qualifying_spells',
        'pen_prior_service_records','pen_pension_calculations','pen_commutation_records',
        'pen_gratuity_calculations','pen_gpf_final_settlements','pen_nominees_beneficiaries',
        'pen_provisional_pension_records','pen_family_pension_records','pen_terminal_settlements',
        'pen_ppo_records','pen_pensioners','pen_bank_account_verifications','pen_life_certificates',
        'pen_revisions','pen_disbursements','pen_overpayment_recoveries','pen_audit_objections',
        'pen_retirement_forecasts','pen_grievances','pen_benefit_estimates'
    ];
BEGIN
    FOREACH t IN ARRAY g11_tables LOOP
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
-- SECTION S — SAMPLE SEED ROWS (2–3 per key table; references core 00 seed UUIDs)
-- =====================================================================================
-- Reuses core tenant 1111…1111, entity 2222…2201, org_unit 3333…3301,
-- employees 9999…9901 (Anjali Rao) and 9999…9902 (Mohan Kumar, due to retire).

SET app.is_platform_admin = 'true';
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

-- rule tables -------------------------------------------------------------------------
INSERT INTO pen_da_relief_rates (id, tenant_id, rule_code, applies_to, da_percent, pay_commission_basis, effective_from, version_no, status)
VALUES
 ('d1100000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','DR-2026-01','PENSIONER',0.5000,'7CPC','2026-01-01',1,'EFFECTIVE'),
 ('d1100000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','DR-2025-07','PENSIONER',0.4600,'7CPC','2025-07-01',1,'SUPERSEDED');

INSERT INTO pen_commutation_factors (id, tenant_id, rule_code, age_next_birthday, factor, effective_from, version_no, status)
VALUES
 ('d1110000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','CF-7CPC',61,8.1940,'2016-01-01',1,'EFFECTIVE'),
 ('d1110000-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','CF-7CPC',60,8.2870,'2016-01-01',1,'EFFECTIVE');

INSERT INTO pen_family_pension_rates (id, tenant_id, rule_code, normal_rate_pct, enhanced_rate_pct, dual_fp_cap_amount, effective_from, version_no, status)
VALUES
 ('d1120000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','FPR-7CPC',0.3000,0.5000,125000.00,'2016-01-01',1,'EFFECTIVE');

INSERT INTO pen_gratuity_ceilings (id, tenant_id, rule_code, base_ceiling, current_effective_ceiling, da_rate_ref, effective_from, version_no, status)
VALUES
 ('d1130000-0000-0000-0000-0000000000d1','11111111-1111-1111-1111-111111111111','GC-7CPC',2000000.00,2500000.00,'d1100000-0000-0000-0000-0000000000a1','2016-01-01',2,'EFFECTIVE');

INSERT INTO pen_retirement_age_rules (id, tenant_id, rule_code, cadre, category, superannuation_age, effective_from, version_no, status)
VALUES
 ('d1140000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','RA-GEN','ADMIN','GENERAL',60,'2016-01-01',1,'EFFECTIVE');

INSERT INTO pen_pension_limit_rules (id, tenant_id, rule_code, min_pension, max_pension, min_qualifying_years_for_pension, min_qualifying_years_for_full, ups_min_guarantee, effective_from, version_no, status)
VALUES
 ('d1150000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','PL-7CPC',9000.00,125000.00,10,10,10000.00,'2016-01-01',1,'EFFECTIVE');

INSERT INTO pen_rounding_rules (id, tenant_id, rule_code, half_year_threshold_months, money_rounding, qualifying_service_cap_half_years, effective_from, version_no, status)
VALUES
 ('d1160000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','RND-STD',3,'NEXT_HIGHER_RUPEE',66,'2016-01-01',1,'EFFECTIVE');

-- pen_disbursing_authorities ----------------------------------------------------------
INSERT INTO pen_disbursing_authorities (id, tenant_id, pda_code, pda_name, pda_type, pda_disbursement_model, interface_type, payload_contract_version, penny_drop_supported, sandbox_certified, status)
VALUES
 ('d1170000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','TREAS-REV','Revenue District Treasury','TREASURY','M11_COMPUTES_FULL','FILE_SFTP','v1',true,true,'ACTIVE'),
 ('d1170000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','CPPC-SBI','SBI Central Pension Processing Centre','BANK_CPPC','PDA_APPLIES_RELIEF','REST_API','v2',true,true,'ACTIVE');

-- pen_family_members (statutory register) ---------------------------------------------
INSERT INTO pen_family_members (id, tenant_id, entity_id, employee_id, name, relationship, dob, statutory_rank, is_govt_servant, eligibility_status, status)
VALUES
 ('d1180000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','Lata Kumar','SPOUSE','1975-02-20',1,false,'ELIGIBLE','ACTIVE'),
 ('d1180000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','Ravi Kumar','DISABLED_CHILD','2004-09-05',2,false,'ELIGIBLE','ACTIVE');

-- pen_separation_cases (superannuation case for Mohan Kumar, retiring 2032-11-30) ------
INSERT INTO pen_separation_cases (id, tenant_id, entity_id, case_no, employee_id, org_unit_id, separation_type, pension_scheme, retirement_date, pension_commence_date, initiated_by_role, no_dues_status, pda_id, status)
VALUES
 ('ca110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PEN-2026-000123','99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333302','SUPERANNUATION','OPS','2032-11-30','2032-12-01','SYSTEM_FORECAST','IN_PROGRESS','d1170000-0000-0000-0000-000000000001','CALCULATION'),
 ('ca110000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PEN-2026-000124','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301','VOLUNTARY_RETIREMENT','NPS','2026-09-30','2026-10-01','SELF','NOT_STARTED','d1170000-0000-0000-0000-000000000002','INITIATED');

-- pen_service_verifications (e-SR gate) -----------------------------------------------
INSERT INTO pen_service_verifications (id, tenant_id, entity_id, case_id, employee_id, coverage_from, coverage_to, gap_count, discrepancy_open_count, spells_attested_count, spells_total_count, signoff_complete, status)
VALUES
 ('5e110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','ca110000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','1996-06-01','2032-11-30',0,0,1,1,true,'SIGNED_OFF');

UPDATE pen_separation_cases SET service_verification_id = '5e110000-0000-0000-0000-000000000001'
 WHERE id = 'ca110000-0000-0000-0000-000000000001';

-- pen_service_discrepancies -----------------------------------------------------------
INSERT INTO pen_service_discrepancies (id, tenant_id, verification_id, discrepancy_type, period_from, period_to, source_module, description, resolution_action, status)
VALUES
 ('d15c0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','5e110000-0000-0000-0000-000000000001','MISSING_REASON_CODE','2010-03-01','2010-04-15','G03','EOL spell lacked a reason code','REASON_CODE_ATTESTED','RESOLVED');

-- pen_qualifying_service_records ------------------------------------------------------
INSERT INTO pen_qualifying_service_records (id, tenant_id, case_id, employee_id, service_start_date, service_end_date, gross_service_years, gross_service_months, gross_service_days, non_qualifying_days, prior_service_days, net_qualifying_years, net_qualifying_months, net_qualifying_days, reckonable_half_years, meets_min_pension_service, sr_verified, rounding_rule_ref, limit_rule_ref, status)
VALUES
 ('95110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','1996-06-01','2032-11-30',36,5,29,46,0,36,4,13,66,true,true,'d1160000-0000-0000-0000-000000000001','d1150000-0000-0000-0000-0000000000f1','VERIFIED');

UPDATE pen_separation_cases SET sr_verification_id = '95110000-0000-0000-0000-000000000001'
 WHERE id = 'ca110000-0000-0000-0000-000000000001';

-- pen_pension_calculations (OPS flat 50%) ---------------------------------------------
INSERT INTO pen_pension_calculations (id, tenant_id, case_id, scheme, benefit_outcome, emoluments_base, emoluments_method, qualifying_half_years, pension_fraction, basic_pension, rule_version_ref, da_rate_ref, status)
VALUES
 ('7c110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','OPS','FULL_PENSION',144000.00,'BENEFICIAL_OF_BOTH',66,0.5000,72000.00,'d1150000-0000-0000-0000-0000000000f1','d1100000-0000-0000-0000-0000000000a1','COMPUTED');

-- pen_commutation_records (40% commuted, restoration = reduction + 15 yrs) -------------
INSERT INTO pen_commutation_records (id, tenant_id, case_id, pension_calc_id, opted, commuted_fraction, commuted_pension_amount, age_next_birthday, commutation_factor, commutation_factor_ref, commuted_value, residual_pension, commutation_payment_date, reduction_effective_date, restoration_due_date, status)
VALUES
 ('c0110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','7c110000-0000-0000-0000-000000000001',true,0.4000,28800.00,61,8.1940,'d1110000-0000-0000-0000-0000000000b1',2831846.40,43200.00,'2032-12-01','2032-12-01','2047-12-01','COMPUTED');

-- pen_gratuity_calculations (retirement gratuity, ceiling auto-stepped 2,500,000) -----
INSERT INTO pen_gratuity_calculations (id, tenant_id, case_id, gratuity_type, emoluments_base, qualifying_half_years, computed_amount, statutory_ceiling, ceiling_ref, ceiling_applied, payable_amount, rule_version_ref, status)
VALUES
 ('57110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','RETIREMENT_GRATUITY',144000.00,66,2970000.00,2500000.00,'d1130000-0000-0000-0000-0000000000d1',true,2500000.00,'d1150000-0000-0000-0000-0000000000f1','COMPUTED');

-- pen_family_pension_records (death-in-service path uses IN_SERVICE basis) -------------
INSERT INTO pen_family_pension_records (id, tenant_id, case_id, employee_id, enhanced_basis, emoluments_base, normal_rate_pct, enhanced_rate_pct, normal_amount, enhanced_amount, enhanced_window_rule, fp_rate_ref, current_family_member_id, status)
VALUES
 ('f9110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','IN_SERVICE',144000.00,0.3000,0.5000,43200.00,72000.00,'IN_SERVICE: enhanced for 10 yrs, no age cap','d1120000-0000-0000-0000-0000000000c1','d1180000-0000-0000-0000-000000000001','DRAFT');

-- pen_terminal_settlements ------------------------------------------------------------
INSERT INTO pen_terminal_settlements (id, tenant_id, case_id, leave_encashment_days, leave_encashment_amount, gratuity_ref, gross_settlement, gratuity_exempt_amount, tds_amount, net_settlement, status)
VALUES
 ('75110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001',300,1440000.00,'57110000-0000-0000-0000-000000000001',6440000.00,2500000.00,84000.00,6356000.00,'COMPUTED');

-- pen_provisional_pension_records (Rule 9 sample) -------------------------------------
INSERT INTO pen_provisional_pension_records (id, tenant_id, case_id, proceedings_ref, proceedings_type, provisional_pension_amount, dcrg_withheld, dcrg_withheld_amount, commenced_on, status)
VALUES
 ('99110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ca110000-0000-0000-0000-000000000001','G09-PROC-2031-77','DEPARTMENTAL',60000.00,true,2500000.00,'2032-12-01','ACTIVE');

-- pen_prior_service_records -----------------------------------------------------------
INSERT INTO pen_prior_service_records (id, tenant_id, employee_id, case_id, prior_service_type, from_date, to_date, counted_days, pension_already_drawn, verified, status)
VALUES
 ('99120000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999902','ca110000-0000-0000-0000-000000000001','MILITARY','1992-01-01','1996-05-31',1612,false,true,'COUNTED');

-- pen_ppo_records ---------------------------------------------------------------------
INSERT INTO pen_ppo_records (id, tenant_id, entity_id, ppo_no, case_id, ppo_type, pension_calc_ref, basic_pension, commuted_portion, residual_pension, pda_id, effective_from, status)
VALUES
 ('bb110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PPO-2026-004512','ca110000-0000-0000-0000-000000000001','SERVICE_PENSION','7c110000-0000-0000-0000-000000000001',72000.00,28800.00,43200.00,'d1170000-0000-0000-0000-000000000001','2032-12-01','ISSUED');

-- pen_pensioners ----------------------------------------------------------------------
INSERT INTO pen_pensioners (id, tenant_id, entity_id, pensioner_no, case_id, employee_id, ppo_id, pensioner_type, current_pension_basic, pda_id, disbursement_model, lifecycle_status)
VALUES
 ('be110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','PNR-2026-004512','ca110000-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999902','bb110000-0000-0000-0000-000000000001','SELF',43200.00,'d1170000-0000-0000-0000-000000000001','M11_COMPUTES_FULL','ACTIVE');

UPDATE pen_ppo_records SET pensioner_id = 'be110000-0000-0000-0000-000000000001'
 WHERE id = 'bb110000-0000-0000-0000-000000000001';

-- pen_bank_account_verifications (penny-drop PASSED gate) ------------------------------
INSERT INTO pen_bank_account_verifications (id, tenant_id, pensioner_id, case_id, account_no_masked, ifsc, account_name, method, name_match_score, verified_name, result, verified_at, status)
VALUES
 ('ba110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','be110000-0000-0000-0000-000000000001','ca110000-0000-0000-0000-000000000001','XXXXXX4521','SBIN0001234','Mohan Kumar','PENNY_DROP',0.9800,'MOHAN KUMAR','MATCH', now(),'PASSED');

-- pen_audit_objections ----------------------------------------------------------------
INSERT INTO pen_audit_objections (id, tenant_id, objection_no, source, case_id, ppo_id, pensioner_id, objection_text, raised_on, status)
VALUES
 ('a0110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','OBJ-2026-0091','AG_AUDIT','ca110000-0000-0000-0000-000000000001','bb110000-0000-0000-0000-000000000001','be110000-0000-0000-0000-000000000001','Verify counted military prior-service reckoning against pro-forma order.','2026-05-10','RAISED');

-- pen_retirement_forecasts ------------------------------------------------------------
INSERT INTO pen_retirement_forecasts (id, tenant_id, entity_id, employee_id, org_unit_id, projected_retirement_date, retirement_age_applied, age_rule_ref, horizon_bucket, case_initiated, case_id, status)
VALUES
 ('fc110000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999902','33333333-3333-3333-3333-333333333302','2032-11-30',60,'d1140000-0000-0000-0000-0000000000e1','BEYOND',true,'ca110000-0000-0000-0000-000000000001','ACTIVE'),
 ('fc110000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222201','99999999-9999-9999-9999-999999999901','33333333-3333-3333-3333-333333333301','2045-03-31',60,'d1140000-0000-0000-0000-0000000000e1','BEYOND',false,NULL,'ACTIVE');

-- Reset session GUCs after seeding.
RESET app.current_tenant_id;
RESET app.is_platform_admin;

-- =====================================================================================
-- END 11-G11-retirement-pension.sql
-- =====================================================================================
