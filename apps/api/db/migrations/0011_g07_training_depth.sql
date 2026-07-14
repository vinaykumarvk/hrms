-- PH-08D migration 0011: G07 training BRD-depth entities — faithful subset of
-- docs/data-model/07-G07-training-skill-development.sql
-- Tables: g07_skill_categories (5.2.1), g07_skills (5.2.2), g07_competencies (5.2.4),
--         g07_competency_models (5.2.5), g07_competency_model_items (5.2.6),
--         g07_employee_skills (5.2.7), g07_skill_gap_analyses (5.2.9), g07_skill_gap_items (5.2.10),
--         g07_gap_contracts (FR-G07-024 / §10.6 Gap Contract v1 projection),
--         g07_certifications (5.2.22: valid_until / is_mandatory / lapsed_mandatory),
--         g07_training_campaigns (5.2.29), g07_campaign_targets (5.2.31)
-- BRD: FR-G07-002/003 (taxonomy + models), FR-G07-007 (inventory), FR-G07-008 (gap analysis),
--      FR-G07-024 (versioned read-only Gap Contract for G06/G08),
--      FR-G07-012 AC.6-8 (validity/renewal; JOB-G07-CERTEXPIRY flips lapsed_mandatory),
--      FR-G07-017 (campaign engine: waves + escalation_level).
-- NOTE: proficiency levels are held as ordinal integers (proficiency_levels master is a later
--       slice); training programs are addressed by program_code (sessions are service-layer).

-- SECTION 1 — ENUM TYPES (g07_ prefix; UPPER_SNAKE values, CONVENTIONS §4)














-- SECTION 2 — 5.2.1 skill_categories
CREATE TABLE g07_skill_categories (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          text REFERENCES entities(id) ON DELETE RESTRICT,
    code               varchar(40) NOT NULL,
    name               varchar(150) NOT NULL,
    parent_category_id text REFERENCES g07_skill_categories(id) ON DELETE RESTRICT,
    status             text NOT NULL DEFAULT 'PUBLISHED',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_skill_categories_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_g07_skill_categories_tenant ON g07_skill_categories(tenant_id);
CREATE INDEX ix_g07_skill_categories_parent ON g07_skill_categories(parent_category_id);

-- SECTION 3 — 5.2.2 skills
CREATE TABLE g07_skills (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id               text REFERENCES entities(id) ON DELETE RESTRICT,
    skill_category_id       text NOT NULL REFERENCES g07_skill_categories(id) ON DELETE RESTRICT,
    code                    varchar(40) NOT NULL,
    name                    varchar(150) NOT NULL,
    is_compliance_skill     boolean NOT NULL DEFAULT false,
    default_validity_months integer,
    status                  text NOT NULL DEFAULT 'PUBLISHED',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_skills_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_g07_skills_validity CHECK (default_validity_months IS NULL OR default_validity_months >= 1),
    CONSTRAINT ck_g07_skills_compliance_validity CHECK (NOT is_compliance_skill OR default_validity_months IS NOT NULL)
);
CREATE INDEX ix_g07_skills_tenant   ON g07_skills(tenant_id);
CREATE INDEX ix_g07_skills_category ON g07_skills(skill_category_id);

-- SECTION 4 — 5.2.4 competencies (composes 0..N skills)
CREATE TABLE g07_competencies (
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    code             varchar(40) NOT NULL,
    name             varchar(150) NOT NULL,
    competency_type  text NOT NULL,
    linked_skill_ids text[] NOT NULL DEFAULT '{}',
    status           text NOT NULL DEFAULT 'PUBLISHED',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_competencies_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_g07_competencies_tenant ON g07_competencies(tenant_id);
CREATE INDEX ix_g07_competencies_type   ON g07_competencies(competency_type);

-- SECTION 5 — 5.2.5 competency_models (role competency models; VAL-G07-SCOPEKEY)
CREATE TABLE g07_competency_models (
    id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       text REFERENCES entities(id) ON DELETE RESTRICT,
    code            varchar(40) NOT NULL,
    name            varchar(150) NOT NULL,
    scope_type      text NOT NULL,
    scope_ref       varchar(64),
    owner_id        text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    review_due_date date NOT NULL,
    version         integer NOT NULL DEFAULT 1,
    status          text NOT NULL DEFAULT 'PUBLISHED',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text,
    updated_by      text,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_competency_models_code UNIQUE (tenant_id, code, version),
    CONSTRAINT ck_g07_competency_models_scopekey CHECK (scope_type = 'GENERIC' OR scope_ref IS NOT NULL)
);
CREATE INDEX ix_g07_competency_models_tenant ON g07_competency_models(tenant_id);
CREATE INDEX ix_g07_competency_models_owner  ON g07_competency_models(owner_id);
CREATE INDEX ix_g07_competency_models_review ON g07_competency_models(review_due_date);

-- SECTION 6 — 5.2.6 competency_model_items (target level per competency)
CREATE TABLE g07_competency_model_items (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    competency_model_id      text NOT NULL REFERENCES g07_competency_models(id) ON DELETE RESTRICT,
    competency_id            text NOT NULL REFERENCES g07_competencies(id) ON DELETE RESTRICT,
    target_proficiency_level integer NOT NULL,
    is_critical              boolean NOT NULL DEFAULT false,
    sequence_no              integer NOT NULL DEFAULT 1,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_cmi UNIQUE (competency_model_id, competency_id),
    CONSTRAINT ck_g07_cmi_target CHECK (target_proficiency_level >= 1)
);
CREATE INDEX ix_g07_cmi_tenant ON g07_competency_model_items(tenant_id);
CREATE INDEX ix_g07_cmi_model  ON g07_competency_model_items(competency_model_id);

-- SECTION 7 — 5.2.7 employee_skills (one current row per employee x skill)
CREATE TABLE g07_employee_skills (
    id                        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                 text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                 text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id               text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    skill_id                  text NOT NULL REFERENCES g07_skills(id) ON DELETE RESTRICT,
    current_proficiency_level integer NOT NULL DEFAULT 0,
    source                    text NOT NULL DEFAULT 'SELF',
    validated_by              text REFERENCES employees(id) ON DELETE SET NULL,
    validated_at              timestamptz,
    freshness_status          text NOT NULL DEFAULT 'FRESH',
    status                    text NOT NULL DEFAULT 'DECLARED',
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                text,
    updated_by                text,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_employee_skills UNIQUE (tenant_id, employee_id, skill_id),
    CONSTRAINT ck_g07_employee_skills_level CHECK (current_proficiency_level >= 0)
);
CREATE INDEX ix_g07_employee_skills_tenant   ON g07_employee_skills(tenant_id);
CREATE INDEX ix_g07_employee_skills_employee ON g07_employee_skills(employee_id);
CREATE INDEX ix_g07_employee_skills_skill    ON g07_employee_skills(skill_id);

-- SECTION 8 — 5.2.9 skill_gap_analyses + 5.2.10 skill_gap_items
CREATE TABLE g07_skill_gap_analyses (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id         text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    competency_model_id text NOT NULL REFERENCES g07_competency_models(id) ON DELETE RESTRICT,
    scoring_mode        text NOT NULL DEFAULT 'BINARY',
    model_stale_flag    boolean NOT NULL DEFAULT false,
    critical_gap_count  integer NOT NULL DEFAULT 0,
    generated_on        date NOT NULL,
    status              text NOT NULL DEFAULT 'DRAFT',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text,
    updated_by          text,
    is_deleted          boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g07_sga_tenant   ON g07_skill_gap_analyses(tenant_id);
CREATE INDEX ix_g07_sga_employee ON g07_skill_gap_analyses(employee_id);
CREATE INDEX ix_g07_sga_model    ON g07_skill_gap_analyses(competency_model_id);

CREATE TABLE g07_skill_gap_items (
    id                        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                 text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    skill_gap_analysis_id     text NOT NULL REFERENCES g07_skill_gap_analyses(id) ON DELETE RESTRICT,
    competency_id             text NOT NULL REFERENCES g07_competencies(id) ON DELETE RESTRICT,
    target_proficiency_level  integer NOT NULL,
    current_proficiency_level integer,
    gap_size                  integer NOT NULL DEFAULT 0,
    is_critical               boolean NOT NULL DEFAULT false,
    discounted_for_staleness  boolean NOT NULL DEFAULT false,
    source                    text NOT NULL,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                text,
    updated_by                text,
    is_deleted                boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g07_sgi_size CHECK (gap_size >= 0)  -- VAL-G07-GAPSIZE
);
CREATE INDEX ix_g07_sgi_tenant   ON g07_skill_gap_items(tenant_id);
CREATE INDEX ix_g07_sgi_analysis ON g07_skill_gap_items(skill_gap_analysis_id);

-- SECTION 9 — FR-G07-024 gap_contracts: versioned, read-only projection for G06/G08
CREATE TABLE g07_gap_contracts (
    id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id             text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             text REFERENCES entities(id) ON DELETE RESTRICT,
    contract_version      integer NOT NULL,
    employee_id           text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    competency_model_id   text NOT NULL REFERENCES g07_competency_models(id) ON DELETE RESTRICT,
    skill_gap_analysis_id text NOT NULL REFERENCES g07_skill_gap_analyses(id) ON DELETE RESTRICT,
    generated_on          date NOT NULL,
    scoring_mode          text NOT NULL DEFAULT 'BINARY',
    model_stale_flag      boolean NOT NULL DEFAULT false,
    items                 jsonb NOT NULL,  -- §10.6: [{competencyId,isCritical,gapSize,discountedForStaleness}]
    status                text NOT NULL DEFAULT 'CURRENT',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text,
    updated_by            text,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_gap_contracts UNIQUE (tenant_id, employee_id, competency_model_id, contract_version)
);
CREATE INDEX ix_g07_gap_contracts_tenant   ON g07_gap_contracts(tenant_id);
CREATE INDEX ix_g07_gap_contracts_employee ON g07_gap_contracts(employee_id);
CREATE UNIQUE INDEX uq_g07_gap_contracts_current
    ON g07_gap_contracts(tenant_id, employee_id, competency_model_id)
    WHERE status = 'CURRENT' AND is_deleted = false;

-- SECTION 10 — 5.2.22 certifications (validity/renewal; lapsed_mandatory consumed by G06)
CREATE TABLE g07_certifications (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                   text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                 text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    certificate_no              varchar(50) NOT NULL,
    program_code                varchar(60),
    issue_date                  date NOT NULL,
    valid_until                 date,                          -- NULL = lifetime
    is_mandatory                boolean NOT NULL DEFAULT false,
    lapsed_mandatory            boolean NOT NULL DEFAULT false, -- set ONLY by JOB-G07-CERTEXPIRY; consumed by G06
    renewed_by_certification_id text REFERENCES g07_certifications(id) ON DELETE SET NULL,
    renewal_of_certification_id text REFERENCES g07_certifications(id) ON DELETE SET NULL,
    certificate_document_id     text REFERENCES documents(id) ON DELETE SET NULL,
    service_register_event_id   text REFERENCES service_register_events(id) ON DELETE SET NULL,
    status                      text NOT NULL DEFAULT 'ACTIVE',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    is_deleted                  boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_certifications_cert_no UNIQUE (tenant_id, certificate_no),
    CONSTRAINT ck_g07_certifications_validity CHECK (valid_until IS NULL OR valid_until > issue_date)
);
CREATE INDEX ix_g07_certifications_tenant      ON g07_certifications(tenant_id);
CREATE INDEX ix_g07_certifications_employee    ON g07_certifications(employee_id);
CREATE INDEX ix_g07_certifications_valid_until ON g07_certifications(valid_until);
CREATE INDEX ix_g07_certifications_lapsed      ON g07_certifications(lapsed_mandatory) WHERE lapsed_mandatory = true;

-- SECTION 11 — 5.2.29 training_campaigns + 5.2.31 campaign_targets (waves + escalation)
CREATE TABLE g07_training_campaigns (
    id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id    text REFERENCES entities(id) ON DELETE RESTRICT,
    code         varchar(40) NOT NULL,
    name         varchar(200) NOT NULL,
    program_code varchar(60) NOT NULL,
    window_start date NOT NULL,
    window_end   date NOT NULL,
    auto_wave    boolean NOT NULL DEFAULT true,
    wave_size    integer,
    status       text NOT NULL DEFAULT 'DRAFT',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text,
    updated_by   text,
    is_deleted   boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_training_campaigns_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_g07_training_campaigns_window CHECK (window_end >= window_start),
    CONSTRAINT ck_g07_training_campaigns_wave CHECK (wave_size IS NULL OR wave_size >= 1)
);
CREATE INDEX ix_g07_campaigns_tenant ON g07_training_campaigns(tenant_id);
CREATE INDEX ix_g07_campaigns_status ON g07_training_campaigns(status);

CREATE TABLE g07_campaign_targets (
    id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    training_campaign_id    text NOT NULL REFERENCES g07_training_campaigns(id) ON DELETE RESTRICT,
    employee_id             text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    wave_no                 integer,
    training_nomination_id  text,
    target_status           text NOT NULL DEFAULT 'PENDING',
    due_date                date NOT NULL,
    escalation_level        integer NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text,
    updated_by              text,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g07_campaign_targets UNIQUE (tenant_id, training_campaign_id, employee_id),
    CONSTRAINT ck_g07_campaign_targets_escalation CHECK (escalation_level >= 0)
);
CREATE INDEX ix_g07_campaign_targets_tenant   ON g07_campaign_targets(tenant_id);
CREATE INDEX ix_g07_campaign_targets_campaign ON g07_campaign_targets(training_campaign_id);
CREATE INDEX ix_g07_campaign_targets_employee ON g07_campaign_targets(employee_id);
CREATE INDEX ix_g07_campaign_targets_status   ON g07_campaign_targets(target_status);
