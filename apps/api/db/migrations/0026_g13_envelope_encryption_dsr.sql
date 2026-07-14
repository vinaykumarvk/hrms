-- PH-15E migration 0026: G13 envelope encryption + DPDP data-subject requests — faithful
-- subset of docs/data-model/13-G13-document-management.sql for the FR-G13-005/FR-G13-018
-- entities:
--   E19 storage_objects        (envelope encryption: every blob encrypted with a unique
--       per-object DEK under AES-256-GCM; the DEK is wrapped by the master key so ONLY
--       wrapped_dek + kms_key_id are persisted — plaintext DEKs and plaintext blobs never
--       are. JOB-G13-KEYROTATE re-wraps wrapped_dek under a new kms_key_id WITHOUT
--       rewriting object bytes; DPDP crypto-shred empties wrapped_dek and leaves the row
--       as a tombstone — no DELETE),
--   E22 data_subject_requests  (DPDP DSR lifecycle RECEIVED -> UNDER_REVIEW ->
--       EXEMPTED/PARTIALLY_FULFILLED/FULFILLED/REJECTED with the VAL-G13-LATTICE / DI-15
--       precedence outcome: statutory retention / active legal hold / WORM override
--       erasure => EXEMPT_RETAINED + legal_basis_exemption; only non-exempt documents
--       erase via the P05 redaction-marker path + JOB-M11-DISPOSAL).
-- Subset adaptations (documented, not silent):
--   * The object ciphertext bytes live in the object store addressed by bucket/object_key;
--     the GCM iv and auth tag are carried inside the stored object bytes (iv || tag || ct),
--     so this table holds no plaintext and no key material beyond wrapped_dek + kms_key_id.
--   * documents.dpdp_erasure_state was created in 0001 on the platform enum erasure_method;
--     the G13 lattice outcomes PHYSICAL_PURGE and EXEMPT_RETAINED are added to that enum
--     here (additive ALTER TYPE — no value is renamed or dropped).
--   * Per-document lattice outcomes persist on the chained document_audit ledger (action
--     ERASURE, 0020) + documents.dpdp_erasure_state; no separate outcome table is defined
--     in the authoritative data model, so none is invented here.
--   * dedup_index_key is the HMAC(content_hash, domain secret) dedup key (R9); key_scope /
--     dek_shared default to the launch posture (per-object DEKs, dek_shared = false) so
--     crypto-shred is always domain-local (DI-6 / FR-018 BR-2).

-- SECTION 1 — ENUM TYPES (g13_ prefix; UPPER_SNAKE values, CONVENTIONS §4) -------------






-- documents.dpdp_erasure_state (0001) uses the platform erasure_method enum; add the G13
-- lattice outcomes additively so EXEMPT_RETAINED / PHYSICAL_PURGE are recordable there.



-- SECTION 2 — E19 storage_objects (BRD G13 FR-005) --------------------------------------
-- Envelope encryption: per-object AES-256-GCM DEK; ONLY wrapped_dek + kms_key_id stored.
CREATE TABLE storage_objects (
    id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         text REFERENCES entities(id) ON DELETE RESTRICT,
    bucket            varchar(120) NOT NULL,
    object_key        varchar(512) NOT NULL,
    content_hash      char(64) NOT NULL,
    dedup_index_key   char(64) NOT NULL,                       -- HMAC(content_hash, domain_secret) — no oracle (R9)
    security_domain   varchar(40) NOT NULL DEFAULT 'DEFAULT',  -- dedup/key boundary (R1/R9)
    key_scope         text NOT NULL DEFAULT 'SHARED_CMK',
    dek_shared        boolean NOT NULL DEFAULT false,          -- ref by >1 doc => no crypto-shred (R1/DI-6)
    size_bytes        bigint NOT NULL,
    encryption_alg    varchar(40) NOT NULL DEFAULT 'AES-256-GCM',
    kms_key_id        varchar(160) NOT NULL,                   -- master-key reference (never key bytes)
    wrapped_dek       bytea NOT NULL,                          -- DEK wrapped by the master key; ''::bytea after crypto-shred
    storage_class     text NOT NULL DEFAULT 'HOT',
    worm_retain_until timestamptz,                             -- gov EXTENSION — object-lock retention
    ref_count         integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    is_deleted        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_storage_objects_tenant ON storage_objects(tenant_id);
CREATE INDEX ix_storage_objects_dedup  ON storage_objects(security_domain, dedup_index_key);  -- domain-scoped dedup (DI-6)
CREATE INDEX ix_storage_objects_key    ON storage_objects(kms_key_id);                        -- JOB-G13-KEYROTATE re-wrap scan

-- SECTION 3 — E22 data_subject_requests (BRD G13 FR-018, R8 precedence lattice) ---------
CREATE TABLE data_subject_requests (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    dsr_no                   varchar(40) NOT NULL,
    data_subject_employee_id text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    request_type             text NOT NULL,
    consent_ref_id           text,                                -- DPDPA basis (consent_records — logical ref)
    received_at              timestamptz NOT NULL DEFAULT now(),  -- statutory clock starts (AC1)
    status                   text NOT NULL DEFAULT 'RECEIVED',
    legal_basis_exemption    varchar(200),                        -- statutory retention/hold/WORM override (VAL-G13-LATTICE)
    affected_document_count  integer,
    resolution_note          text,
    erasure_method           text,                  -- CRYPTO_SHRED/PHYSICAL_PURGE/EXEMPT_RETAINED
    adjudicated_by           text,                                -- DPO — logical ref; executor must differ (AC7 SoD)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_dsr_no UNIQUE (tenant_id, dsr_no)
);
CREATE INDEX ix_dsr_tenant   ON data_subject_requests(tenant_id);
CREATE INDEX ix_dsr_employee ON data_subject_requests(data_subject_employee_id);
CREATE INDEX ix_dsr_status   ON data_subject_requests(status);
