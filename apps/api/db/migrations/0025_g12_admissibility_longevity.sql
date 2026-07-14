-- PH-15D migration 0025: G12 admissibility + longevity — faithful subset of
-- docs/data-model/12-G12-digital-service-register.sql for the FR-18/13/19 entities:
--   E24 sr_authenticity_certificates (append-only §65B / Bharatiya Sakshya Adhiniyam
--       certificate-of-authenticity per certified extract, binding content_digest +
--       covering anchor_id + qualified signer + generated chain_of_custody; issuance is
--       access-logged GENERATE_65B),
--   E16 sr_subscriptions             (single authenticated pull-feed registrations with
--       the per-subscriber durable cursor last_delivered_seq; PULL_FEED only at launch —
--       WEBHOOK/MESSAGE_BUS registration rejected app-side with SR_DELIVERY_MODE_DEFERRED),
--   E25 sr_ltv_renewals              (append-only PAdES-LTV / RFC 4998 evidence-record
--       renewals; RE_ANCHOR/ALGORITHM_MIGRATION re-anchor over EXISTING chain heads —
--       no historical entry_hash is ever recomputed or overwritten).
-- Subset adaptations (documented, not silent):
--   * tsa_timestamp_token is text (matching 0019 sr_anchors) instead of bytea, and a
--     tsa_authority column is carried alongside, mirroring the TSA seam already persisted
--     for anchors/attestations.
--   * sr_authenticity_certificates.document_id and .anchor_lag_noted: document_id is
--     nullable until the G13 DocumentGen writer lands (BRD FR-18 AC3 integration);
--     anchor_lag_noted records the BRD FR-18 edge case where the most recent covering
--     anchor is cited with a noted lag.
--   * extract_id references sr_certified_extracts directly (0019) — no deferred ALTER
--     is needed inside this subset.

-- SECTION 1 — ENUM TYPES (g12_ prefix; UPPER_SNAKE values, CONVENTIONS §4) -------------






-- SECTION 2 — E24 sr_authenticity_certificates (BRD G12 FR-18) — APPEND-ONLY -----------
-- Machine-generated electronic-record authenticity certificate per certified extract,
-- citing content digest, covering anchor, signer, generated chain of custody, and the
-- statutory system description. INSERT-only: no updated_at, no is_deleted.
CREATE TABLE sr_authenticity_certificates (
    id                         text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- certificate_id
    tenant_id                  text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id                  text REFERENCES entities(id) ON DELETE RESTRICT,
    extract_id                 text NOT NULL REFERENCES sr_certified_extracts(id) ON DELETE RESTRICT,
    certificate_no             varchar(48) NOT NULL,                        -- human-readable (unique)
    statute_reference          varchar(80) NOT NULL,                        -- IT Act 2000 s.65B / BSA 2023 s.63
    content_digest             char(64) NOT NULL,                           -- matches extract content_digest (AC4)
    anchor_id                  text NOT NULL REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- tamper-evident state at issue (AC5)
    anchor_lag_noted           boolean NOT NULL DEFAULT false,              -- most recent covering anchor cited with a noted lag
    signer_identity            varchar(160) NOT NULL,                       -- custodian + role from the EXTRACT_SIGN attestation
    signing_certificate_serial varchar(80) NOT NULL,
    tsa_timestamp_token        text NOT NULL,                               -- RFC 3161 token at certificate issue (TSA seam)
    tsa_authority              varchar(120) NOT NULL,
    chain_of_custody           jsonb NOT NULL,                              -- GENERATED provenance/attestation/supersession lineage (BR-18.2)
    system_description         text NOT NULL,                               -- statutory statement of the producing system
    document_id                text,                                        -- signed certificate PDF (G13; writer pending)
    issued_at                  timestamptz NOT NULL DEFAULT now(),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 text,
    CONSTRAINT uq_sr_cert_no      UNIQUE (tenant_id, certificate_no),
    CONSTRAINT ck_sr_cert_dig_len CHECK (length(content_digest) = 64)
);
CREATE INDEX ix_sr_cert_tenant  ON sr_authenticity_certificates(tenant_id);
CREATE INDEX ix_sr_cert_entity  ON sr_authenticity_certificates(entity_id);
CREATE INDEX ix_sr_cert_extract ON sr_authenticity_certificates(extract_id);
CREATE INDEX ix_sr_cert_anchor  ON sr_authenticity_certificates(anchor_id);
COMMENT ON TABLE sr_authenticity_certificates IS 'G12 E24: append-only §65B/BSA certificate-of-authenticity per certified extract (FR-18). Issuance access-logged GENERATE_65B. No UPDATE/DELETE.';

-- SECTION 3 — E16 sr_subscriptions (BRD G12 FR-13, single pull-feed at launch) ----------
CREATE TABLE sr_subscriptions (
    id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,          -- subscription_id
    tenant_id          text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id          text REFERENCES entities(id) ON DELETE RESTRICT,    -- null = tenant-wide
    subscriber_module  varchar(16) NOT NULL,                               -- G11/G06/G14 etc.
    event_categories   varchar(32)[] NOT NULL,                             -- subscribed categories; ALL = every event
    delivery_mode      text NOT NULL DEFAULT 'PULL_FEED', -- only PULL_FEED enabled (BR-13.4)
    endpoint_url       varchar(300),                                       -- for WEBHOOK (deferred)
    secret_ref         varchar(120),                                       -- env-ref to HMAC secret (never the secret, BR-13.1)
    last_delivered_seq bigint NOT NULL DEFAULT 0,                          -- per-subscriber durable cursor (since_seq resume)
    status             text NOT NULL DEFAULT 'PAUSED',  -- ACTIVE only after custodian activation (AC1)
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         text,
    updated_by         text,
    is_deleted         boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_sr_sub_module UNIQUE (tenant_id, subscriber_module)
);
CREATE INDEX ix_sr_sub_tenant ON sr_subscriptions(tenant_id);
CREATE INDEX ix_sr_sub_entity ON sr_subscriptions(entity_id);
CREATE INDEX ix_sr_sub_status ON sr_subscriptions(status);
COMMENT ON TABLE sr_subscriptions IS 'G12 E16: pull-feed subscriptions + per-subscriber durable cursor last_delivered_seq (FR-13). WEBHOOK/MESSAGE_BUS registration rejected app-side (SR_DELIVERY_MODE_DEFERRED). secret_ref is an env reference, never the secret value.';

-- SECTION 4 — E25 sr_ltv_renewals (BRD G12 FR-19) — APPEND-ONLY -------------------------
-- PAdES-LTV / RFC 4998 evidence-record renewal events; crypto-migration re-anchor. A
-- renewal ADDS evidence (new row + optionally a new sr_anchors row over EXISTING heads);
-- historical entry_hash values are never recomputed or overwritten (BR-19.1/BR-19.3).
CREATE TABLE sr_ltv_renewals (
    id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,         -- renewal_id
    tenant_id           text NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,
    entity_id           text REFERENCES entities(id) ON DELETE RESTRICT,   -- null = tenant-wide (anchor renewals)
    subject_type        text NOT NULL,                          -- EXTRACT/ATTESTATION/ANCHOR
    subject_id          text NOT NULL,                                     -- polymorphic ref to the renewed artefact
    renewal_kind        text NOT NULL,                     -- RE_ANCHOR / ALGORITHM_MIGRATION / ...
    prior_algorithm     varchar(16),
    new_algorithm       varchar(16),
    evidence_record_ref varchar(160) NOT NULL,                             -- RFC 4998 ERS / archive timestamp id
    tsa_timestamp_token text NOT NULL,                                     -- fresh RFC 3161 token at renewal (TSA seam)
    tsa_authority       varchar(120) NOT NULL,
    new_anchor_id       text REFERENCES sr_anchors(id) ON DELETE RESTRICT, -- anchor re-issued on RE_ANCHOR/migration
    triggered_by        text NOT NULL,
    renewed_at          timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text
);
CREATE INDEX ix_sr_ltv_tenant     ON sr_ltv_renewals(tenant_id);
CREATE INDEX ix_sr_ltv_entity     ON sr_ltv_renewals(entity_id);
CREATE INDEX ix_sr_ltv_subject    ON sr_ltv_renewals(subject_type, subject_id);
CREATE INDEX ix_sr_ltv_kind       ON sr_ltv_renewals(renewal_kind);
CREATE INDEX ix_sr_ltv_new_anchor ON sr_ltv_renewals(new_anchor_id);
COMMENT ON TABLE sr_ltv_renewals IS 'G12 E25: append-only PAdES-LTV / RFC 4998 evidence-record renewals and crypto-migration re-anchors (FR-19). Never rewrites stored hashes. No UPDATE/DELETE.';
