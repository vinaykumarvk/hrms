-- PH-08E migration 0013: G09 disciplinary due-process (natural-justice chain) — faithful subset of
-- docs/data-model/09-G09-disciplinary-punishment.sql
-- Tables: g09_preliminary_inquiries (E3: ORDERED->IN_PROGRESS->SUBMITTED with recommendation),
--         g09_suspensions (E4: subsistence bounds ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS, NEC gate
--         ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED, 90-day charge-memo window, review dates),
--         g09_show_cause_notices (E15: proposed_penalty_json — DI-4 subset ceiling for the order,
--         ERR-G09-PENALTY-EXCEEDS-PROPOSED),
--         g09_authority_competence (E23: (cadre x penalty class/type) -> empowered level with
--         requires_not_subordinate_to_appointing — the Art. 311(1) DISMISSAL/REMOVAL/CR guard,
--         ERR-G09-AUTHORITY-NOT-COMPETENT / DI-13),
--         g09_authority_assignments (delegation modelled as authority level; FR-G09-018 edge case),
--         g09_case_consultations (E24: mandatory UPSC/CVC/ICC/LEGAL rows gate finalise,
--         ERR-G09-CONSULTATION-PENDING / DI-14),
--         g09_disagreement_memos (E14: DA disagreement served + responded before finalise),
--         g09_penalty_orders + g09_penalty_items (E16/E17 finalise subset),
--         g09_case_timeline_events (DI-21: APPEND-ONLY per-case hash chain seq_no/prev_hash/row_hash;
--         verify recomputes hashes -> ERR-G09-AUDIT-CHAIN-BROKEN).
-- NOTE: disciplinary cases are not yet table-backed (service-layer entities), so case references
--       are plain text columns validated in the service layer (same convention as migration 0012).

-- SECTION 1 — ENUM TYPES (g09_ prefix; UPPER_SNAKE values, CONVENTIONS §4)













-- SECTION 2 — E3 preliminary_inquiries (fact-finding before formal charges; FR-G09-002)
CREATE TABLE g09_preliminary_inquiries (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    pi_officer_id            text NOT NULL,
    ordered_by               text NOT NULL,
    ordered_date             date NOT NULL,
    due_date                 date NOT NULL,
    status                   text NOT NULL DEFAULT 'ORDERED',
    findings_summary         text,
    recommendation           text,
    submitted_at             timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g09_preliminary_inquiries_tenant  ON g09_preliminary_inquiries(tenant_id);
CREATE INDEX ix_g09_preliminary_inquiries_case    ON g09_preliminary_inquiries(case_id);
CREATE INDEX ix_g09_preliminary_inquiries_status  ON g09_preliminary_inquiries(status);

-- SECTION 3 — E4 suspensions (parallel interim track: subsistence bounds + NEC gate; FR-G09-003)
CREATE TABLE g09_suspensions (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    employee_id              text NOT NULL,
    suspension_type          text NOT NULL,
    order_no                 varchar(40) NOT NULL,
    effective_from           date NOT NULL,
    effective_to             date,
    status                   text NOT NULL DEFAULT 'ACTIVE',
    subsistence_rate_pct     numeric(5,2) NOT NULL,
    non_employment_certificate_received boolean NOT NULL DEFAULT false,  -- DI-16 gate
    nec_received_date        date,
    charge_memo_due_date     date,                                        -- 90-day window
    subsistence_revision_due date,
    review_committee_due     date,
    revoked_reason           text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g09_suspensions_order_no UNIQUE (tenant_id, order_no),
    CONSTRAINT ck_g09_suspensions_rate CHECK (subsistence_rate_pct >= 0 AND subsistence_rate_pct <= 100)
);
CREATE INDEX ix_g09_suspensions_tenant   ON g09_suspensions(tenant_id);
CREATE INDEX ix_g09_suspensions_case     ON g09_suspensions(case_id);
CREATE INDEX ix_g09_suspensions_employee ON g09_suspensions(employee_id);
CREATE INDEX ix_g09_suspensions_status   ON g09_suspensions(status);

-- SECTION 4 — E15 show_cause_notices (proposed_penalty_json = DI-4 subset ceiling)
CREATE TABLE g09_show_cause_notices (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    notice_no                varchar(60) NOT NULL,
    proposed_penalty_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
    issued_by                text NOT NULL,
    issued_date              date NOT NULL,
    served_date              date,
    response_due_date        date NOT NULL,
    representation_text      text,
    responded_at             timestamptz,
    status                   text NOT NULL DEFAULT 'ISSUED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g09_show_cause_notices_no UNIQUE (tenant_id, notice_no)
);
CREATE INDEX ix_g09_show_cause_notices_tenant ON g09_show_cause_notices(tenant_id);
CREATE INDEX ix_g09_show_cause_notices_case   ON g09_show_cause_notices(case_id);
CREATE INDEX ix_g09_show_cause_notices_status ON g09_show_cause_notices(status);

-- SECTION 5 — E23 authority_competence ((cadre x penalty class/type) -> empowered level; DI-13)
CREATE TABLE g09_authority_competence (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    competence_set_code      varchar(40) NOT NULL,
    subject_cadre            varchar(60) NOT NULL,
    penalty_class            text NOT NULL,
    penalty_type             text,                     -- null = any of class
    min_authority_level      varchar(40) NOT NULL,                 -- e.g. APPOINTING_AUTHORITY
    requires_not_subordinate_to_appointing boolean NOT NULL DEFAULT false,  -- Art. 311(1)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g09_authority_competence UNIQUE (tenant_id, competence_set_code, subject_cadre, penalty_class, penalty_type)
);
CREATE INDEX ix_g09_authority_competence_tenant ON g09_authority_competence(tenant_id);
CREATE INDEX ix_g09_authority_competence_lookup ON g09_authority_competence(competence_set_code, subject_cadre, penalty_class);

-- Delegation modelled as authority level (FR-G09-018 edge case).
CREATE TABLE g09_authority_assignments (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL,
    authority_level          varchar(40) NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g09_authority_assignments UNIQUE (tenant_id, employee_id)
);
CREATE INDEX ix_g09_authority_assignments_tenant ON g09_authority_assignments(tenant_id);

-- SECTION 6 — E24 case_consultations (mandatory rows gate finalise; DI-14)
CREATE TABLE g09_case_consultations (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    consultation_type        text NOT NULL,
    status                   text NOT NULL DEFAULT 'REQUIRED',
    is_mandatory             boolean NOT NULL DEFAULT false,
    requested_date           date,
    received_date            date,
    advice_summary           text,
    waiver_reason            text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g09_case_consultations_tenant ON g09_case_consultations(tenant_id);
CREATE INDEX ix_g09_case_consultations_case   ON g09_case_consultations(case_id);
CREATE INDEX ix_g09_case_consultations_status ON g09_case_consultations(status);

-- SECTION 7 — E14 disagreement_memos (DA disagreement with IO findings; responded before finalise)
CREATE TABLE g09_disagreement_memos (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    inquiry_report_ref       text,
    issued_by                text NOT NULL,                        -- DA
    tentative_disagreement   text NOT NULL,
    articles_affected_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
    served_date              date,
    representation_due_date  date,
    representation_text      text,
    status                   text NOT NULL DEFAULT 'ISSUED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_g09_disagreement_memos_tenant ON g09_disagreement_memos(tenant_id);
CREATE INDEX ix_g09_disagreement_memos_case   ON g09_disagreement_memos(case_id);

-- SECTION 8 — E16/E17 penalty_orders + penalty_items (finalise subset over the DI gates)
CREATE TABLE g09_penalty_orders (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    order_no                 varchar(40) NOT NULL,
    passed_by                text NOT NULL,                        -- DA (DI-13 competence-checked)
    competence_verified      boolean NOT NULL DEFAULT false,       -- DI-13: true to finalise
    order_date               date NOT NULL,
    reasoning_text           text NOT NULL,                        -- speaking order
    proportionality_reasoning text NOT NULL,                       -- DI-20 mandatory
    status                   text NOT NULL DEFAULT 'DRAFT',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g09_penalty_orders_no UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_g09_penalty_orders_tenant ON g09_penalty_orders(tenant_id);
CREATE INDEX ix_g09_penalty_orders_case   ON g09_penalty_orders(case_id);
CREATE INDEX ix_g09_penalty_orders_status ON g09_penalty_orders(status);

CREATE TABLE g09_penalty_items (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    order_id                 text NOT NULL REFERENCES g09_penalty_orders(id) ON DELETE RESTRICT,
    penalty_type             text NOT NULL,
    penalty_class            text NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text
);
CREATE INDEX ix_g09_penalty_items_tenant ON g09_penalty_items(tenant_id);
CREATE INDEX ix_g09_penalty_items_order  ON g09_penalty_items(order_id);

-- SECTION 9 — DI-21 case_timeline_events: APPEND-ONLY per-case hash chain.
-- Append-only (CONVENTIONS §3): only created_at/created_by — no updated_at/updated_by/is_deleted.
-- seq_no is monotonic per case; prev_hash links to the prior row's row_hash; the FR-G09-027 verify
-- recomputes every hash from row content and raises ERR-G09-AUDIT-CHAIN-BROKEN on any mismatch.
CREATE TABLE g09_case_timeline_events (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,
    stage                    varchar(40) NOT NULL,
    event_type               text NOT NULL,
    event_at                 timestamptz NOT NULL DEFAULT now(),
    actor_id                 text,
    notes                    text,
    seq_no                   bigint NOT NULL,                      -- monotonic per case
    prev_hash                varchar(64),
    row_hash                 varchar(64) NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    CONSTRAINT uq_g09_case_timeline_events_seq UNIQUE (case_id, seq_no),
    CONSTRAINT ck_g09_case_timeline_events_seq CHECK (seq_no >= 1)
);
CREATE INDEX ix_g09_case_timeline_events_tenant ON g09_case_timeline_events(tenant_id);
CREATE INDEX ix_g09_case_timeline_events_case   ON g09_case_timeline_events(case_id, seq_no);
