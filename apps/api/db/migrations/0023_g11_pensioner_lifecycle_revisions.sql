-- PH-15B migration 0023: G11 pensioner lifecycle + revisions — faithful subset of
-- docs/data-model/11-G11-retirement-pension.sql for the FR-G11-12/FR-G11-13 entities:
--   E26 pen_family_members     (statutory Form 3/14 register; IR8: family-pension
--       eligibility/hierarchy derive from statutory_rank here, never from nominees),
--   E14 pen_pensioners         (pensioner master created ON PPO AUTHORISATION; lifecycle
--       ACTIVE <-> SUSPENDED_NO_LC -> DECEASED -> CONVERTED_TO_FAMILY; FR-12 AC1/AC4),
--   E15 pen_life_certificates  (annual LC/DLC; overdue beyond grace suspends disbursement,
--       submission reactivates and releases the held pension with arrear; FR-12 AC1/AC2),
--   E16 pen_revisions          (DA / pay-commission batch header + per-pensioner delta
--       lines with month-wise arrears; immutable once APPLIED — FR-13 AC2/AC3/AC4).
-- Subset deviations vs the full model (same approach as 0016/0022):
--   * pen_pensioners carries ppo_no/ppo_type/current_da_relief/suspended_from and the
--     FAMILY-row provenance columns (source_pensioner_id, family_member_id,
--     family_pension_ref) inline because pen_ppo_records/pen_disbursing_authorities are
--     not yet materialised in this subset;
--   * the lifecycle enum uses the BRD FR-12 state names (SUSPENDED_NO_LC,
--     CONVERTED_TO_FAMILY) rather than the generic SUSPENDED of the full model;
--   * pen_revisions adds an explicit batch_id self-FK so delta lines join their batch
--     header directly, and a fitment_factor column snapshotting the pay-commission
--     re-fixation input (determinism: batch inputs live ON the batch).
-- Money columns are NUMERIC(15,2); services exchange integer paise, converting in SQL
-- (($n::numeric / 100) on write) — never through float parsing or string rounding.

-- SECTION 1 — ENUM TYPES (g11_ prefix; UPPER_SNAKE values, CONVENTIONS §4)
CREATE TYPE g11_pensioner_type       AS ENUM ('SELF','FAMILY');
CREATE TYPE g11_pensioner_lifecycle  AS ENUM ('ACTIVE','SUSPENDED_NO_LC','DECEASED','CONVERTED_TO_FAMILY','FAMILY_PENSION_ACTIVE','CEASED');
CREATE TYPE g11_death_source         AS ENUM ('REPORTED','DEATH_REGISTRY','DBT_ANOMALY','LC_FAILURE');
CREATE TYPE g11_disbursement_model   AS ENUM ('M11_COMPUTES_FULL','PDA_APPLIES_RELIEF');
CREATE TYPE g11_ppo_type             AS ENUM ('SERVICE_PENSION','FAMILY_PENSION');
CREATE TYPE g11_lc_method            AS ENUM ('JEEVAN_PRAMAAN_DLC','PHYSICAL','VIDEO_KYC','BANK_CERTIFIED');
CREATE TYPE g11_lc_result            AS ENUM ('VALID','FAILED','PENDING');
CREATE TYPE g11_lc_status            AS ENUM ('ACTIVE','SUPERSEDED','EXPIRED');
CREATE TYPE g11_family_member_status AS ENUM ('ACTIVE','CEASED','INELIGIBLE');
CREATE TYPE g11_revision_type        AS ENUM ('DA','PAY_COMMISSION','RESTORATION','AGE_INCREMENT');
CREATE TYPE g11_revision_status      AS ENUM ('DRAFT','COMPUTED','APPROVED','APPLIED');

-- SECTION 2 — E26 pen_family_members (BRD G11 FR-12 BR3/IR8: the conversion hierarchy)
CREATE TABLE pen_family_members (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- family_member_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    member_name         varchar(160) NOT NULL,
    relation            varchar(48) NOT NULL,
    date_of_birth       date,
    statutory_rank      integer NOT NULL CHECK (statutory_rank > 0),   -- IR8 eligibility order
    status              g11_family_member_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_fam23_tenant   ON pen_family_members(tenant_id);
CREATE INDEX ix_pen_fam23_employee ON pen_family_members(employee_id);
CREATE INDEX ix_pen_fam23_rank     ON pen_family_members(employee_id, statutory_rank);
COMMENT ON TABLE pen_family_members IS 'IR8: family-pension eligibility/hierarchy derive from this register by statutory_rank — never from nominees.';

-- SECTION 3 — E14 pen_pensioners (BRD G11 FR-12: master & lifecycle, created on PPO auth)
CREATE TABLE pen_pensioners (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- pensioner_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id) ON DELETE RESTRICT,
    pensioner_no          varchar(48) NOT NULL,
    case_id               uuid NOT NULL,                               -- logical ref g11 pension case
    employee_id           uuid REFERENCES employees(id) ON DELETE RESTRICT,
    ppo_id                uuid NOT NULL,                               -- authorising PPO (FR-12: never detached)
    ppo_no                varchar(48) NOT NULL,
    ppo_type              g11_ppo_type NOT NULL DEFAULT 'SERVICE_PENSION',
    pensioner_type        g11_pensioner_type NOT NULL DEFAULT 'SELF',
    current_pension_basic numeric(15,2) NOT NULL DEFAULT 0,
    current_da_relief     numeric(15,2) NOT NULL DEFAULT 0,
    disbursement_model    g11_disbursement_model NOT NULL DEFAULT 'M11_COMPUTES_FULL',
    life_cert_valid_until date,                                        -- FR-12 AC1 yearly due date
    suspended_from        date,                                        -- set while SUSPENDED_NO_LC (AC2 arrear base)
    date_of_death         date,
    death_detected_source g11_death_source,
    source_pensioner_id   uuid REFERENCES pen_pensioners(id) ON DELETE SET NULL,  -- FAMILY rows: converted-from (AC4)
    family_member_id      uuid REFERENCES pen_family_members(id) ON DELETE SET NULL,  -- E26 beneficiary (BR3)
    family_pension_ref    uuid REFERENCES pen_family_pension_records(id) ON DELETE SET NULL,  -- E10 computation
    lifecycle_status      g11_pensioner_lifecycle NOT NULL DEFAULT 'ACTIVE',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_pensioner_no UNIQUE (tenant_id, pensioner_no)
);
CREATE INDEX ix_pen_pen23_tenant   ON pen_pensioners(tenant_id);
CREATE INDEX ix_pen_pen23_case     ON pen_pensioners(case_id);
CREATE INDEX ix_pen_pen23_employee ON pen_pensioners(employee_id);
CREATE INDEX ix_pen_pen23_status   ON pen_pensioners(lifecycle_status);
CREATE INDEX ix_pen_pen23_lcdue    ON pen_pensioners(life_cert_valid_until) WHERE lifecycle_status = 'ACTIVE';
COMMENT ON TABLE pen_pensioners IS 'FR-12: created ON PPO authorisation only; lifecycle ACTIVE <-> SUSPENDED_NO_LC -> DECEASED -> CONVERTED_TO_FAMILY. Disbursement to SUSPENDED_NO_LC fails closed (ERR-G11-LC-SUSPENDED).';

-- SECTION 4 — E15 pen_life_certificates (BRD G11 FR-12 AC1/AC2)
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
    status              g11_lc_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_lc_year UNIQUE (tenant_id, pensioner_id, certificate_year)
);
CREATE INDEX ix_pen_lc23_tenant    ON pen_life_certificates(tenant_id);
CREATE INDEX ix_pen_lc23_pensioner ON pen_life_certificates(pensioner_id);
CREATE INDEX ix_pen_lc23_status    ON pen_life_certificates(status);

-- SECTION 5 — E16 pen_revisions (BRD G11 FR-13: batch header + per-pensioner delta lines)
CREATE TABLE pen_revisions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),    -- revision_id
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    revision_no         varchar(96) NOT NULL,
    revision_type       g11_revision_type NOT NULL,
    effective_date      date NOT NULL,
    is_batch            boolean NOT NULL DEFAULT false,                -- true = batch header
    batch_id            uuid REFERENCES pen_revisions(id) ON DELETE RESTRICT,  -- subset: line -> header
    pensioner_id        uuid REFERENCES pen_pensioners(id) ON DELETE RESTRICT, -- null on batch header
    job_run_ref         varchar(64),                                   -- JOB-G11-PENSION-RUN run_key
    da_rate_ref         uuid REFERENCES pen_da_relief_rates(id) ON DELETE RESTRICT,  -- BR1 snapshot (DA)
    fitment_factor      numeric(9,4),                                  -- pay-commission re-fix snapshot
    old_basic           numeric(15,2),
    new_basic           numeric(15,2),
    arrears_amount      numeric(15,2),                                 -- month-wise arrears total (AC2)
    application_order   integer,                                       -- IR18 §16.9 ordering
    calc_trace          jsonb,
    status              g11_revision_status NOT NULL DEFAULT 'DRAFT',  -- APPLIED = immutable (AC4/P05)
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_pen_rev_no UNIQUE (tenant_id, revision_no)
);
CREATE INDEX ix_pen_rev23_tenant    ON pen_revisions(tenant_id);
CREATE INDEX ix_pen_rev23_batch     ON pen_revisions(batch_id);
CREATE INDEX ix_pen_rev23_pensioner ON pen_revisions(pensioner_id);
CREATE INDEX ix_pen_rev23_eff       ON pen_revisions(effective_date);
CREATE INDEX ix_pen_rev23_status    ON pen_revisions(status);
COMMENT ON TABLE pen_revisions IS 'FR-13: DA/pay-commission batches — deterministic old/new/arrear deltas from snapshot inputs; APPLIED rows are immutable (ERR-G11-REVISION-IMMUTABLE); corrections create a new batch.';
