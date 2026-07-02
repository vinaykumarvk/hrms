-- PH-16B migration 0029: G02 bulk corrections + fraud/velocity risk signals — faithful subset
-- of docs/data-model/02-G02-personal-details-workflow.sql.
-- Tables: bulk_correction_batches (E12), cr_risk_signals (E13, APPEND-ONLY per BRD rule 9).
-- Columns: change_requests.risk_score / risk_band / bulk_batch_id (E1, FR-G02-009/019); the
-- employment_status_at_submit snapshot column (FR-G02-018) already ships in migration 0006.
-- Frozen enum VALUES are reproduced verbatim. Subset notes: E12.source_file_ref /
-- dry_run_report_ref stay as opaque refs (G13 linkage), mirroring the 0006 subset approach.

-- SECTION 1 — ENUM TYPES (frozen; g02_ prefix)
-- =====================================================================================
CREATE TYPE g02_risk_band           AS ENUM ('LOW','MEDIUM','HIGH','BLOCKED');
CREATE TYPE g02_bulk_status         AS ENUM ('UPLOADED','VALIDATED','PENDING_APPROVAL','APPROVED','REJECTED',
                                             'COMMITTED','PARTIAL_FAILED');
CREATE TYPE g02_risk_signal_type    AS ENUM ('DUPLICATE_BANK_ACCOUNT','PRE_PAYROLL_CUTOFF','PRE_SEPARATION_WINDOW',
                                             'DEVICE_VELOCITY','MULTI_EMPLOYEE_SAME_DEVICE',
                                             'AUTH_CHANNEL_THEN_FINANCIAL','OFF_HOURS_BURST');
CREATE TYPE g02_risk_severity       AS ENUM ('INFO','WARN','HIGH','BLOCK');
CREATE TYPE g02_risk_review_outcome AS ENUM ('CLEARED','CONFIRMED_FRAUD','ESCALATED');

-- SECTION 2 — E12 bulk_correction_batches (FR-G02-009)
-- =====================================================================================
CREATE TABLE bulk_correction_batches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),             -- bulk_batch_id
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    batch_number    varchar(24) NOT NULL,                                   -- BLK-2026-0007
    initiated_by    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_file_ref varchar(200),                                           -- uploaded CSV/XLSX (G13)
    total_rows      integer NOT NULL DEFAULT 0,
    valid_rows      integer NOT NULL DEFAULT 0,
    invalid_rows    integer NOT NULL DEFAULT 0,
    status          g02_bulk_status NOT NULL DEFAULT 'UPLOADED',
    dry_run_report_ref varchar(200),
    reason          varchar(1000),
    approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    is_deleted      boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_bcb_number UNIQUE (tenant_id, batch_number),
    CONSTRAINT ck_bcb_rowcounts CHECK (total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0)
);
CREATE INDEX ix_bcb_tenant    ON bulk_correction_batches(tenant_id);
CREATE INDEX ix_bcb_entity    ON bulk_correction_batches(entity_id);
CREATE INDEX ix_bcb_initiator ON bulk_correction_batches(initiated_by);
CREATE INDEX ix_bcb_status    ON bulk_correction_batches(status);
COMMENT ON TABLE bulk_correction_batches IS
  'G02 E12. HR bulk-correction batch: UPLOADED->VALIDATED->PENDING_APPROVAL->APPROVED->COMMITTED/PARTIAL_FAILED (FR-G02-009).';

-- SECTION 3 — E1 risk/bulk columns on change_requests (FR-G02-009 AC3 / FR-G02-019 AC1)
-- =====================================================================================
ALTER TABLE change_requests
    ADD COLUMN risk_score    smallint,
    ADD COLUMN risk_band     g02_risk_band,
    ADD COLUMN bulk_batch_id uuid REFERENCES bulk_correction_batches(id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_cr_risk_score CHECK (risk_score IS NULL OR (risk_score BETWEEN 0 AND 100));
CREATE INDEX ix_cr_bulk_batch ON change_requests(bulk_batch_id);

-- SECTION 4 — E13 cr_risk_signals (APPEND-ONLY; FR-G02-019)
-- =====================================================================================
-- INSERT-only ledger (BRD rule 9): each fired detector appends one row; the Fraud Reviewer
-- decision mutates ONLY reviewed_by/review_outcome — detection rows are never updated or
-- deleted. No updated_at/is_deleted columns by design.
CREATE TABLE cr_risk_signals (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- risk_signal_id
    tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    change_request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE RESTRICT,
    signal_type        g02_risk_signal_type NOT NULL,
    severity           g02_risk_severity NOT NULL,
    score_contribution smallint NOT NULL DEFAULT 0,
    detail             jsonb,                                               -- evidence (matched employee_ids for mule)
    detected_at        timestamptz NOT NULL DEFAULT now(),
    reviewed_by        uuid REFERENCES users(id) ON DELETE SET NULL,        -- Fraud Reviewer (capability flag)
    review_outcome     g02_risk_review_outcome,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid
);
CREATE INDEX ix_crrisk_tenant ON cr_risk_signals(tenant_id);
CREATE INDEX ix_crrisk_cr     ON cr_risk_signals(change_request_id);
CREATE INDEX ix_crrisk_type   ON cr_risk_signals(signal_type);
CREATE INDEX ix_crrisk_sev    ON cr_risk_signals(severity);
COMMENT ON TABLE cr_risk_signals IS
  'G02 E13. Append-only fraud/velocity/anomaly signal ledger; review_outcome fields are the only mutable columns (FR-G02-019).';
