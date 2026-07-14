-- PH-10B migration 0019: G12 integrity pillars — faithful subset of
-- docs/data-model/12-G12-digital-service-register.sql for the FR-04/07/10/17 entities:
--   E20 sr_anchors             (append-only external Merkle-root anchors; REAL pairwise
--       SHA-256 Merkle root over per-employee {content head, status head} leaves with
--       odd-node promotion; RFC 3161 TSA token captured behind an injectable interface),
--   E21 sr_expected_event_rule (completeness expected-event model, FR-17),
--   E22 sr_gap_register        (JOB-G12-GAPSCAN findings; GAP_FLAGGED lifecycle, never deleted),
--   E11 sr_attestations        (append-only custodian/employee qualified-signature rows;
--       SERVER_SIGNED banned for statutory attestations, BRD §5.6 r.11),
--   E14 sr_certified_extracts  (certified true copies; purpose redaction via the P02
--       field mask; content_digest binds the redacted rendering).
-- Jobs: JOB-G12-INTEGRITY (rolling chain + status-chain recompute), JOB-G12-ANCHOR
-- (periodic Merkle anchor), JOB-G12-GAPSCAN (expected-vs-recorded reconciliation).
-- Subset adaptations (documented, not silent):
--   * expected_event_category / redacted_categories use varchar in place of the CORE
--     sr_event_category enum, which is not part of this substrate's migrations yet.
--   * sr_anchors.worm_document_id and sr_certified_extracts.document_id are nullable
--     until the G13 WORM export / DocumentGen writers land (BRD FR-04/FR-10 integration).
--   * sr_certified_extracts adds chain_head_hash / status_chain_head_hash /
--     redacted_fields: PH-10B requires extracts to carry the chain-head hash they
--     certify and to record what the P02 mask redacted.

-- SECTION 1 — ENUM TYPES (g12_ prefix; UPPER_SNAKE values, CONVENTIONS §4).
-- g12_transition_kind already exists (0018_g12_g13_integrity_substrate.sql).









-- SECTION 2 — E20 sr_anchors (BRD G12 FR-04 amended) — APPEND-ONLY -------------------
CREATE TABLE sr_anchors (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- anchor_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide anchor
    anchor_seq               bigint NOT NULL,                               -- monotonic per tenant
    period_from              timestamptz NOT NULL,
    period_to                timestamptz NOT NULL,
    merkle_root              char(64) NOT NULL,                             -- REAL Merkle root over chain-head leaves
    leaf_count               bigint NOT NULL,                               -- employee chains covered
    head_snapshot_digest     char(64) NOT NULL,                             -- digest of ordered head-leaf list (reconstruction)
    tsa_timestamp_token      text NOT NULL,                                 -- RFC 3161 token over merkle_root (TSA seam)
    tsa_authority            varchar(120) NOT NULL,                         -- TSA identity / policy OID
    worm_document_id         text REFERENCES documents(id) ON DELETE RESTRICT, -- WORM export (G13); nullable until writer lands
    prev_anchor_hash         char(64) NOT NULL,                             -- chains anchors (64-zero genesis for first)
    anchor_hash              char(64) NOT NULL,                             -- SHA-256(canonical(anchor) incl. prev_anchor_hash)
    created_at               timestamptz NOT NULL DEFAULT now(),            -- append timestamp; NO updated_at/is_deleted
    created_by               text,
    CONSTRAINT uq_sr_anchor_seq      UNIQUE (tenant_id, anchor_seq),
    CONSTRAINT uq_sr_anchor_hash     UNIQUE (tenant_id, anchor_hash),
    CONSTRAINT ck_sr_anchor_hash_len CHECK (length(merkle_root) = 64 AND length(anchor_hash) = 64 AND length(prev_anchor_hash) = 64),
    CONSTRAINT ck_sr_anchor_period   CHECK (period_to >= period_from)
);
CREATE INDEX ix_sr_anchors_tenant   ON sr_anchors(tenant_id, anchor_seq);
CREATE INDEX ix_sr_anchors_entity   ON sr_anchors(entity_id);
CREATE INDEX ix_sr_anchors_period   ON sr_anchors(period_to);
COMMENT ON TABLE sr_anchors IS 'G12 E20: append-only external Merkle-root anchors (JOB-G12-ANCHOR; RFC 3161 TSA behind an interface). Head-vs-anchor mismatch is a non-suppressible FAIL. No UPDATE/DELETE.';

-- SECTION 3 — E21 sr_expected_event_rule (BRD G12 FR-17) ------------------------------
CREATE TABLE sr_expected_event_rule (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- rule_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT, -- null = tenant-wide
    rule_code                varchar(48) NOT NULL,                          -- e.g. ANNUAL_INCREMENT
    applies_to_cadre         varchar(48)[],                                 -- cadres in scope (null = all)
    expected_event_category  varchar(48) NOT NULL,                          -- event type code expected each cadence period
    cadence                  jsonb NOT NULL,                                -- recurrence spec
    suppressed_by_categories varchar(48)[],                                 -- events that legitimately explain absence
    source_rule_ref          varchar(120),                                  -- pointer to G06/G10/service-rule master
    severity                 text NOT NULL DEFAULT 'WARN',
    status                   text NOT NULL DEFAULT 'DRAFT',
    effective_from           date NOT NULL,
    effective_to             date,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_exp_rule_code UNIQUE (tenant_id, rule_code, effective_from)
);
CREATE INDEX ix_sr_exp_rule_tenant   ON sr_expected_event_rule(tenant_id);
CREATE INDEX ix_sr_exp_rule_status   ON sr_expected_event_rule(status);
COMMENT ON TABLE sr_expected_event_rule IS 'G12 E21: expected-event model for completeness (FR-17). G12 references substantive G06/G10 service rules; it does not own them.';

-- SECTION 4 — E22 sr_gap_register (BRD G12 FR-17) — lifecycle rows, never deleted -----
CREATE TABLE sr_gap_register (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- gap_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    rule_id                  text NOT NULL REFERENCES sr_expected_event_rule(id) ON DELETE RESTRICT,
    expected_period_from     date NOT NULL,
    expected_period_to       date NOT NULL,
    expected_event_category  varchar(48) NOT NULL,
    gap_status               text NOT NULL DEFAULT 'GAP_FLAGGED', -- raised by JOB-G12-GAPSCAN
    explanation_code         varchar(48),                                   -- WITHHELD/NOT_DUE/LEGACY_MISSING/RECORDED_LATE
    resolved_event_id        text REFERENCES service_register_events(id) ON DELETE RESTRICT, -- entry closing the gap
    corroborated_by          varchar(64),                                   -- employee/heir who corroborated
    severity                 text NOT NULL DEFAULT 'WARN',          -- inherited from rule
    detected_at              timestamptz NOT NULL DEFAULT now(),
    closed_at                timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text
);
CREATE INDEX ix_sr_gap_tenant     ON sr_gap_register(tenant_id);
CREATE INDEX ix_sr_gap_employee   ON sr_gap_register(tenant_id, employee_id);
CREATE INDEX ix_sr_gap_rule       ON sr_gap_register(rule_id);
CREATE INDEX ix_sr_gap_status     ON sr_gap_register(gap_status);
COMMENT ON TABLE sr_gap_register IS 'G12 E22: detected completeness gaps + corroboration (FR-17). Explanations move gap_status through GAP_FLAGGED..CLOSED_*; rows are never deleted.';

-- SECTION 5 — E11 sr_attestations (BRD G12 FR-07) — APPEND-ONLY ------------------------
CREATE TABLE sr_attestations (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- attestation_id
    tenant_id                text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    subject_type             text NOT NULL,             -- EVENT/VERIFICATION_CYCLE/EXTRACT
    subject_id               text NOT NULL,                                 -- polymorphic ref (no single FK target)
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT, -- SR owner
    attestation_kind         text NOT NULL,
    attested_by              varchar(64) NOT NULL,                          -- custodian/employee/heir user id
    attested_role            varchar(48) NOT NULL,                          -- SR_CUSTODIAN/EMPLOYEE/HEIR
    signature_method         text NOT NULL,                 -- SERVER_SIGNED banned for statutory kinds
    signature_value          text,                                          -- detached signature / signed digest
    certificate_serial       varchar(80),                                   -- PKI cert serial if PKI_QUALIFIED
    tsa_timestamp_token      text,                                          -- RFC 3161 token over signed_digest (TSA seam)
    tsa_authority            varchar(120),
    signed_digest            char(64) NOT NULL,                             -- SHA-256 of attested content (chain head / event hash)
    attested_at              timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),            -- append timestamp; NO updated_at/is_deleted
    created_by               text,
    CONSTRAINT ck_sr_attest_digest_len CHECK (length(signed_digest) = 64)
);
CREATE INDEX ix_sr_attest_tenant   ON sr_attestations(tenant_id);
CREATE INDEX ix_sr_attest_subject  ON sr_attestations(subject_type, subject_id);
CREATE INDEX ix_sr_attest_employee ON sr_attestations(tenant_id, employee_id);
COMMENT ON TABLE sr_attestations IS 'G12 E11: append-only qualified-signature attestations (custodian/employee/heir/extract). No UPDATE/DELETE.';

-- SECTION 6 — E14 sr_certified_extracts (BRD G12 FR-10) — managed (revocation only) ---
CREATE TABLE sr_certified_extracts (
    id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text, -- extract_id
    tenant_id                   text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                   text REFERENCES entities(id) ON DELETE RESTRICT,
    extract_no                  varchar(40) NOT NULL,                       -- human-readable cert number (unique)
    employee_id                 text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    scope                       text NOT NULL,
    scope_params                jsonb,                                      -- date range / category filters
    event_count                 integer NOT NULL DEFAULT 0,
    content_digest              char(64) NOT NULL,                          -- SHA-256 of rendered ordered content (binds copy)
    redaction_policy            text NOT NULL DEFAULT 'NONE', -- purpose-driven redaction (FR-10, P02 mask)
    redacted_categories         varchar(48)[],                              -- categories excluded by the policy
    redacted_fields             varchar(80)[],                              -- payload fields the P02 field mask redacted (fail-closed)
    chain_head_hash             char(64) NOT NULL,                          -- entry-chain head the extract certifies (PH-10B)
    status_chain_head_hash      char(64) NOT NULL,                          -- status sub-chain head at issue time (PH-10B)
    document_id                 text REFERENCES documents(id) ON DELETE RESTRICT, -- signed PDF (G13); nullable until DocumentGen lands
    anchor_id                   text REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- embedded anchor ref (offline verify)
    qr_verification_token       varchar(64) NOT NULL,                       -- opaque token -> verification endpoint (unique)
    issued_to                   varchar(160) NOT NULL,                      -- requestor / purpose
    purpose                     varchar(120),                               -- pension/loan/court
    revoked                     boolean NOT NULL DEFAULT false,
    revoked_reason              text,
    issued_at                   timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text,
    updated_by                  text,
    CONSTRAINT uq_sr_extract_no  UNIQUE (tenant_id, extract_no),
    CONSTRAINT uq_sr_extract_qr  UNIQUE (qr_verification_token),
    CONSTRAINT ck_sr_extract_dig CHECK (length(content_digest) = 64 AND length(chain_head_hash) = 64 AND length(status_chain_head_hash) = 64)
);
CREATE INDEX ix_sr_extract_tenant   ON sr_certified_extracts(tenant_id);
CREATE INDEX ix_sr_extract_employee ON sr_certified_extracts(tenant_id, employee_id);
CREATE INDEX ix_sr_extract_anchor   ON sr_certified_extracts(anchor_id);
COMMENT ON TABLE sr_certified_extracts IS 'G12 E14: certified true copies (FR-10). Revocation is the only managed mutation; content_digest binds the P02-redacted rendering; chain_head_hash pins the certified ledger head.';
