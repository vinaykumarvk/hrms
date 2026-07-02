-- PH-10C migration 0020: G13 vault security hardening — faithful subset of
-- docs/data-model/13-G13-document-management.sql for the BRD G13 security entities:
--   E15 scan_results               (APPEND-ONLY malware-scan verdict ledger; DI-11 — new content
--       enters PENDING_SCAN and only a scan-CLEAN row promotes it to ACTIVE; INFECTED quarantines
--       with MSG-G13-QUARANTINE; fetch of quarantined content -> 422 ERR-G13-MALWARE_DETECTED),
--   E21 security_clearances        (deny-by-default classification gate, FR-006: access to a
--       CONFIDENTIAL+ document requires an ACTIVE row at/above the document's classification for
--       the acting user/role; absence of a row DENIES -> 403 ERR-G13-CLEARANCE_INSUFFICIENT;
--       DI-16 maker!=checker on grant approval),
--   E12 document_audit             (APPEND-ONLY hash-chained access ledger, FR-015/016: every
--       :fetch?intent=VIEW|DOWNLOAD lands an access event with actor, document, version, intent;
--       denials are recorded with their reason; R5 chain via prev_hash/row_hash SHA-256),
--   E8  document_retention_policies (retention classes binding disposition eligibility, FR-009;
--       DI-13 non-permanent classes need a period),
--   E18 disposition_records        (FR-009 disposition with maker!=checker SoD, DI-10: the
--       approving checker must differ from the proposing maker -> 403 ERR-G13-SOD_VIOLATION;
--       legal hold / WORM still blocks execution).
-- Content integrity (FR-005): documents.content_hash (0001) is computed server-side as real
-- SHA-256 over the stored bytes — never trusted from the caller — and re-verified on every fetch;
-- a mismatch withholds content, quarantines, and raises 422 ERR-G13-INTEGRITY_FAILED.
-- The core documents/document_versions tables live in 0001_platform_core.sql and are UNCHANGED
-- except for the new PENDING_SCAN lifecycle value below.

-- SECTION 1 — ENUM TYPES (g13_ prefix; UPPER_SNAKE values, CONVENTIONS §4) -------------
-- DI-11 scan gate entry state: byte-ingested documents are fail-closed until a CLEAN verdict.
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'PENDING_SCAN' BEFORE 'ACTIVE';

CREATE TYPE g13_clearance_principal_type AS ENUM ('USER','ROLE');
CREATE TYPE g13_clearance_status         AS ENUM ('PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRED','REVOKED');
CREATE TYPE g13_doc_audit_action         AS ENUM ('VIEW','PREVIEW','DOWNLOAD','PRINT','SHARE','METADATA_UPDATE','VERSION_ADD','CLASSIFY','DISPOSE','HOLD_PLACE','HOLD_RELEASE','ACL_CHANGE','BREAK_GLASS','CLEARANCE_CHANGE','ERASURE');
CREATE TYPE g13_audit_result             AS ENUM ('SUCCESS','DENIED');
CREATE TYPE g13_retention_trigger        AS ENUM ('ON_CREATE','ON_SUPERSEDE','ON_EMPLOYEE_RETIRE','ON_CASE_CLOSE','FISCAL_YEAR_END');
CREATE TYPE g13_disposition_action       AS ENUM ('DESTROY','ARCHIVE_TRANSFER','REVIEW');
CREATE TYPE g13_disposition_status       AS ENUM ('PROPOSED','APPROVED','EXECUTED','REJECTED','BLOCKED_HOLD');

-- SECTION 2 — E15 scan_results (APPEND-ONLY; DI-11 scan gate ledger) --------------------
CREATE TABLE scan_results (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid REFERENCES entities(id) ON DELETE RESTRICT,
    version_id         uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
    engine             varchar(80) NOT NULL,
    malware_verdict    scan_status NOT NULL DEFAULT 'PENDING',  -- reuse core scan_status enum
    threat_name        varchar(160),
    integrity_verified boolean NOT NULL DEFAULT false,          -- stored hash == recomputed (DI-5)
    scanned_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid                                     -- append-only: no updated_at/is_deleted
);
CREATE INDEX ix_scan_results_tenant  ON scan_results(tenant_id);
CREATE INDEX ix_scan_results_version ON scan_results(version_id);
COMMENT ON TABLE scan_results IS 'G13 E15: append-only scan verdicts (DI-11). PENDING_SCAN -> CLEAN promotes to ACTIVE; INFECTED -> QUARANTINED (422 ERR-G13-MALWARE_DETECTED on fetch). No UPDATE/DELETE.';

-- SECTION 3 — E21 security_clearances (deny-by-default gate store; FR-006) --------------
CREATE TABLE security_clearances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id           uuid REFERENCES entities(id) ON DELETE RESTRICT,
    principal_type      g13_clearance_principal_type NOT NULL,
    principal_ref       varchar(80) NOT NULL,                    -- user id or RBAC role code (logical ref)
    clearance_level     classification_level NOT NULL,           -- reuse core enum; max accessible class
    status              g13_clearance_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    justification       text NOT NULL,
    granted_by          varchar(80) NOT NULL,                    -- Security/DLP (maker) — logical user ref
    approved_by         varchar(80),                             -- Records Mgr (checker); must != granter
    valid_from          timestamptz NOT NULL DEFAULT now(),
    valid_until         timestamptz,                             -- null => until revoked
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    is_deleted          boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_clearance_sod CHECK (approved_by IS NULL OR approved_by <> granted_by)  -- DI-16
);
CREATE INDEX ix_clearance_tenant    ON security_clearances(tenant_id);
CREATE INDEX ix_clearance_principal ON security_clearances(principal_type, principal_ref);
CREATE INDEX ix_clearance_status    ON security_clearances(status);
COMMENT ON TABLE security_clearances IS 'G13 E21: deny-by-default classification gate (FR-006). Only ACTIVE rows at/above the document classification grant CONFIDENTIAL+ access; no row => 403 ERR-G13-CLEARANCE_INSUFFICIENT.';

-- SECTION 4 — E12 document_audit (APPEND-ONLY; hash-chained; FR-015/016 access ledger) ---
CREATE TABLE document_audit (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id      uuid REFERENCES entities(id) ON DELETE RESTRICT,
    seq_no         bigserial NOT NULL,                           -- global monotonic chain order (R5)
    document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_no     integer NOT NULL,
    action         g13_doc_audit_action NOT NULL,                -- VIEW / DOWNLOAD / DISPOSE / ...
    actor_user_id  varchar(80) NOT NULL,                         -- logical user ref
    correlation_id varchar(64),                                  -- X-Correlation-Id (Foundation §1)
    result         g13_audit_result NOT NULL DEFAULT 'SUCCESS',
    denial_reason  varchar(120),                                 -- e.g. ERR-G13-CLEARANCE_INSUFFICIENT
    prev_hash      char(64) NOT NULL,                            -- row_hash of preceding row (64-zero genesis)
    row_hash       char(64) NOT NULL,                            -- SHA-256(payload || prev_hash) (R5)
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,                                         -- append-only: no updated_at/is_deleted
    CONSTRAINT ck_document_audit_hash_len CHECK (length(row_hash) = 64 AND length(prev_hash) = 64)
);
CREATE INDEX ix_document_audit_tenant   ON document_audit(tenant_id);
CREATE INDEX ix_document_audit_document ON document_audit(document_id);
CREATE INDEX ix_document_audit_actor    ON document_audit(actor_user_id);
CREATE INDEX ix_document_audit_action   ON document_audit(action);
CREATE UNIQUE INDEX uq_document_audit_seq ON document_audit(seq_no);
COMMENT ON TABLE document_audit IS 'G13 E12: append-only hash-chained access ledger. Every fetch intent (VIEW/DOWNLOAD) and denial (clearance/integrity/scan) appends a row; no UPDATE/DELETE.';

-- SECTION 5 — E8 document_retention_policies (retention classes; FR-009) ----------------
CREATE TABLE document_retention_policies (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    policy_code             varchar(40) NOT NULL,
    name                    varchar(120) NOT NULL,
    trigger_event           g13_retention_trigger NOT NULL DEFAULT 'ON_CREATE',
    retention_period_months integer,                              -- null => permanent
    is_permanent            boolean NOT NULL DEFAULT false,
    disposition_action      g13_disposition_action NOT NULL DEFAULT 'REVIEW',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    is_deleted              boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_document_retention_policies_code UNIQUE (tenant_id, policy_code),
    CONSTRAINT ck_document_retention_policies_period CHECK (is_permanent OR retention_period_months IS NOT NULL)  -- DI-13
);
CREATE INDEX ix_document_retention_policies_tenant ON document_retention_policies(tenant_id);
COMMENT ON TABLE document_retention_policies IS 'G13 E8: tenant retention classes. Documents bind to a class before disposition; permanent classes are never disposition-eligible (ERR-G13-RETENTION_PERMANENT).';

-- SECTION 6 — E18 disposition_records (maker!=checker SoD; FR-009, DI-10) ----------------
CREATE TABLE disposition_records (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    document_id          uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    retention_class_code varchar(40) NOT NULL,                    -- bound E8 policy_code
    action               g13_disposition_action NOT NULL,
    proposed_by          varchar(80) NOT NULL,                    -- Librarian (maker) — logical user ref
    approved_by          varchar(80),                             -- Records Mgr (checker); DI-10 must != maker
    status               g13_disposition_status NOT NULL DEFAULT 'PROPOSED',
    executed_at          timestamptz,
    evidence_hash        char(64),                                -- tombstone hash retained after destruction
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_disposition_sod CHECK (approved_by IS NULL OR approved_by <> proposed_by)  -- DI-10
);
CREATE INDEX ix_disposition_tenant   ON disposition_records(tenant_id);
CREATE INDEX ix_disposition_document ON disposition_records(document_id);
CREATE INDEX ix_disposition_status   ON disposition_records(status);
COMMENT ON TABLE disposition_records IS 'G13 E18: disposition lifecycle with maker!=checker SoD (DI-10; self-approval -> 403 ERR-G13-SOD_VIOLATION). Legal hold / WORM blocks execution (BLOCKED_HOLD).';
