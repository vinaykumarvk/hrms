-- PH-09D migration 0017: G10 compensation integration + G11 pre-credit verification —
-- faithful subset of docs/data-model/10-G10-payroll-benefits.sql and
-- docs/data-model/11-G11-retirement-pension.sql for the integration entities:
--   E21 g10_bank_disbursements        (bank batch header; disbursed/held/failed split — AI-4;
--       uq_g10_disb_bank_ref backs positive pay; one batch per run in this slice),
--   —   g10_bank_disbursement_lines   (per-payee lines; subset satellite of E21 so the FR-15
--       tie-out sums REAL ledger rows, never cached totals),
--   E31 g10_disbursement_holds        (suspense ledger for excluded/failed net pay; BR1:
--       never silently removed — write-off keeps the row and surfaces in the tie-out),
--   E22 g10_payroll_reconciliations   (Σ disbursed + Σ held + Σ failed = run net,
--       VAL-G10-TIEOUT -> ERR-G10-RECON-TIEOUT; sign-off SoD -> ERR-G10-RECON-UNSIGNED),
--   E16 g10_loans_advances            (sanction + outstanding; FnF pulls open rows),
--   E30 g10_fnf_settlements           (one consolidated separation settlement; SoD
--       ck_g10_fnf_sod backs approved_by <> created_by; negative net = RECOVERY_PENDING),
--   —   g10_recovery_schedules        (FR-09 G09 penalty-order recoveries bounded by the
--       net-pay floor + CPC s.60 attachment cap -> ERR-G10-RECOVERY-BARRED; the recorded
--       attachment_exemption_basis is seeded configuration, never an invented fraction),
--   E42 pen_bank_account_verifications (IR16 pre-credit gate; a first-credit line may not
--       transmit unless the account's row is ACTIVE+PASSED -> ERR-G11-ACCOUNT-VERIFY),
--   —   pen_disbursements             (instruction lines carrying the verification ref).
-- Subset deviations (same approach as 0014/0015/0016): G11 case_id is a plain uuid (the
-- pen_separation_cases aggregate lives service-side); the E21 header carries per-batch
-- lines in a satellite table in place of the full ack/positive-pay/DSC columns.
-- Money columns are NUMERIC(15,2)/NUMERIC(18,2); services exchange integer paise,
-- converting in SQL (($n::numeric / 100) on write, (col * 100)::bigint on read) — never
-- through float parsing. Name-match scores are integer basis points ($n::numeric / 10000).

-- SECTION 1 — ENUM TYPES (g10_/g11_ prefix; UPPER_SNAKE values, CONVENTIONS §4)
CREATE TYPE g10_disb_batch_status   AS ENUM ('PREPARED','COMPLETED');
CREATE TYPE g10_disb_line_status    AS ENUM ('DISBURSED','FAILED');
CREATE TYPE g10_hold_reason         AS ENUM ('INVALID_ACCOUNT','MISSING_ACCOUNT','FROZEN_ACCOUNT','FAILED_CREDIT');
CREATE TYPE g10_hold_status         AS ENUM ('HELD','REDISBURSED','WRITTEN_OFF');
CREATE TYPE g10_recon_status        AS ENUM ('BALANCED','SIGNED_OFF');
CREATE TYPE g10_loan_status         AS ENUM ('ACTIVE','CLOSED','SETTLED_IN_FNF');
CREATE TYPE g10_fnf_status          AS ENUM ('COMPUTED','RECOVERY_PENDING','APPROVED');
CREATE TYPE g10_recovery_sched_status AS ENUM ('SCHEDULED','CLOSED');
CREATE TYPE g11_acct_verify_method  AS ENUM ('PENNY_DROP','NAME_IFSC_MATCH','NPCI_MAPPER');
CREATE TYPE g11_acct_verify_result  AS ENUM ('PASSED','FAILED');
CREATE TYPE g11_acct_verify_status  AS ENUM ('ACTIVE','SUPERSEDED','FAILED');
CREATE TYPE g11_pen_disb_line_type  AS ENUM ('FIRST_PENSION','MONTHLY_PENSION','GRATUITY','COMMUTED_VALUE','GPF','TERMINAL');
CREATE TYPE g11_pen_disb_status     AS ENUM ('AUTHORISED','TRANSMITTED');

-- SECTION 2 — E21 g10_bank_disbursements (BRD G10 FR-14)
CREATE TABLE g10_bank_disbursements (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- disbursement_id
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id) ON DELETE RESTRICT,
    batch_no         text NOT NULL,
    run_id           uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    bank_batch_ref   text NOT NULL,                                -- positive-pay batch ref (AI-3)
    total_amount     numeric(18,2) NOT NULL DEFAULT 0,
    line_count       integer NOT NULL DEFAULT 0,
    disbursed_total  numeric(18,2) NOT NULL DEFAULT 0,
    held_total       numeric(18,2) NOT NULL DEFAULT 0,
    failed_total     numeric(18,2) NOT NULL DEFAULT 0,
    status           g10_disb_batch_status NOT NULL DEFAULT 'PREPARED',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_disb_batch_no UNIQUE (tenant_id, batch_no),
    CONSTRAINT uq_g10_disb_bank_ref UNIQUE (tenant_id, bank_batch_ref),
    CONSTRAINT uq_g10_disb_run      UNIQUE (tenant_id, run_id)
);
CREATE INDEX ix_g10_disb_tenant ON g10_bank_disbursements(tenant_id);
CREATE INDEX ix_g10_disb_run    ON g10_bank_disbursements(run_id);
COMMENT ON COLUMN g10_bank_disbursements.id IS 'BRD E21 disbursement_id; bank_batch_ref unique = positive-pay';

-- per-payee lines (subset satellite): the tie-out equation sums these rows, not caches
CREATE TABLE g10_bank_disbursement_lines (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id) ON DELETE RESTRICT,
    disbursement_id  uuid NOT NULL REFERENCES g10_bank_disbursements(id) ON DELETE RESTRICT,
    employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_id       uuid REFERENCES g10_payslips(id) ON DELETE SET NULL,
    amount           numeric(15,2) NOT NULL,
    status           g10_disb_line_status NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_g10_disb_line_amount CHECK (amount > 0)
);
CREATE INDEX ix_g10_disb_line_tenant ON g10_bank_disbursement_lines(tenant_id);
CREATE INDEX ix_g10_disb_line_batch  ON g10_bank_disbursement_lines(disbursement_id);

-- SECTION 3 — E31 g10_disbursement_holds (suspense ledger; BRD §5.6-4 tie-out)
CREATE TABLE g10_disbursement_holds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- hold_id
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id) ON DELETE RESTRICT,
    hold_no          text NOT NULL,
    run_id           uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    disbursement_id  uuid REFERENCES g10_bank_disbursements(id) ON DELETE SET NULL,
    employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_id       uuid REFERENCES g10_payslips(id) ON DELETE SET NULL,
    held_amount      numeric(15,2) NOT NULL,
    reason           g10_hold_reason NOT NULL,
    status           g10_hold_status NOT NULL DEFAULT 'HELD',
    written_off_by   uuid,                                         -- logical ref users
    write_off_reason text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_hold_no       UNIQUE (tenant_id, hold_no),
    CONSTRAINT ck_g10_hold_amount   CHECK (held_amount > 0)
);
CREATE INDEX ix_g10_hold_tenant ON g10_disbursement_holds(tenant_id);
CREATE INDEX ix_g10_hold_run    ON g10_disbursement_holds(run_id);
CREATE INDEX ix_g10_hold_status ON g10_disbursement_holds(status);
COMMENT ON TABLE g10_disbursement_holds IS 'BRD E31: suspense for excluded/failed net pay — never silently removed; Σ disbursed + Σ held + Σ failed = run net';

-- SECTION 4 — E22 g10_payroll_reconciliations (BRD G10 FR-15; VAL-G10-TIEOUT)
CREATE TABLE g10_payroll_reconciliations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- reconciliation_id
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        uuid REFERENCES entities(id) ON DELETE RESTRICT,
    run_id           uuid NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    run_net          numeric(18,2) NOT NULL,
    disbursed_total  numeric(18,2) NOT NULL,
    held_total       numeric(18,2) NOT NULL,
    failed_total     numeric(18,2) NOT NULL,
    residual         numeric(18,2) NOT NULL DEFAULT 0,
    signoff_status   g10_recon_status NOT NULL DEFAULT 'BALANCED',
    signed_by        uuid,                                         -- SoD: <> run creator <> run approver (ERR-G10-RECON-UNSIGNED)
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_by       uuid,
    is_deleted       boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_recon_run     UNIQUE (tenant_id, run_id),
    -- VAL-G10-TIEOUT: only a residual-free reconciliation may persist (ERR-G10-RECON-TIEOUT upstream)
    CONSTRAINT ck_g10_recon_tieout  CHECK (residual = 0 AND run_net = disbursed_total + held_total + failed_total)
);
CREATE INDEX ix_g10_recon_tenant ON g10_payroll_reconciliations(tenant_id);
CREATE INDEX ix_g10_recon_run    ON g10_payroll_reconciliations(run_id);
COMMENT ON COLUMN g10_payroll_reconciliations.id IS 'BRD E22 reconciliation_id';

-- SECTION 5 — E16 g10_loans_advances (sanction + outstanding; FnF pulls open rows)
CREATE TABLE g10_loans_advances (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- loan_id
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    loan_type            text NOT NULL,
    sanctioned_principal numeric(15,2) NOT NULL,
    outstanding          numeric(15,2) NOT NULL,
    status               g10_loan_status NOT NULL DEFAULT 'ACTIVE',
    settled_in_fnf_id    uuid,                                        -- logical ref -> g10_fnf_settlements
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_loan_amounts CHECK (sanctioned_principal > 0 AND outstanding >= 0 AND outstanding <= sanctioned_principal)
);
CREATE INDEX ix_g10_loans_tenant   ON g10_loans_advances(tenant_id);
CREATE INDEX ix_g10_loans_employee ON g10_loans_advances(employee_id);
CREATE INDEX ix_g10_loans_status   ON g10_loans_advances(status);
COMMENT ON COLUMN g10_loans_advances.id IS 'BRD E16 loan_id';

-- SECTION 6 — E30 g10_fnf_settlements (BRD G10 FR-20; one consolidated settlement)
CREATE TABLE g10_fnf_settlements (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- fnf_id
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             uuid REFERENCES entities(id) ON DELETE RESTRICT,
    settlement_no         text NOT NULL,
    employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    separation_date       date NOT NULL,
    final_month_pay       numeric(15,2) NOT NULL DEFAULT 0,
    leave_encashment      numeric(15,2) NOT NULL DEFAULT 0,
    gratuity              numeric(15,2) NOT NULL DEFAULT 0,
    notice_pay_recovery   numeric(15,2) NOT NULL DEFAULT 0,
    loan_settlement       numeric(15,2) NOT NULL DEFAULT 0,            -- Σ open g10_loans_advances pulled in
    carryforward_recovery numeric(15,2) NOT NULL DEFAULT 0,            -- Σ open g10_deduction_carryforwards pulled in
    final_tds             numeric(15,2) NOT NULL DEFAULT 0,
    net_settlement        numeric(15,2) NOT NULL,                      -- may be negative -> RECOVERY_PENDING
    status                g10_fnf_status NOT NULL DEFAULT 'COMPUTED',
    approved_by           uuid,                                        -- logical ref users
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    is_deleted            boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_g10_fnf_no       UNIQUE (tenant_id, settlement_no),
    CONSTRAINT uq_g10_fnf_employee UNIQUE (tenant_id, employee_id),    -- AC1: single consolidated record
    -- AC2 net equation: net = final + encashment + gratuity − notice − loans − carryforwards − TDS
    CONSTRAINT ck_g10_fnf_equation CHECK (net_settlement = final_month_pay + leave_encashment + gratuity
                                          - notice_pay_recovery - loan_settlement - carryforward_recovery - final_tds),
    CONSTRAINT ck_g10_fnf_sod      CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by)  -- §5.6-10
);
CREATE INDEX ix_g10_fnf_tenant   ON g10_fnf_settlements(tenant_id);
CREATE INDEX ix_g10_fnf_employee ON g10_fnf_settlements(employee_id);
COMMENT ON COLUMN g10_fnf_settlements.id IS 'BRD E30 fnf_id; approved_by <> created_by (SoD)';

-- SECTION 7 — g10_recovery_schedules (BRD G10 FR-09; G09 penalty-order recoveries)
CREATE TABLE g10_recovery_schedules (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                  uuid REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    penalty_order_id           uuid NOT NULL,                       -- logical ref -> g09 penalty order (hard upstream linkage)
    penalty_order_no           text NOT NULL,
    period                     varchar(7) NOT NULL,                 -- YYYY-MM
    ordered_total              numeric(15,2) NOT NULL,
    scheduled_per_cycle        numeric(15,2) NOT NULL,
    recovered_to_date          numeric(15,2) NOT NULL DEFAULT 0,
    net_pay_floor              numeric(15,2) NOT NULL,
    attachment_cap             numeric(15,2) NOT NULL,
    attachment_exemption_basis text NOT NULL,                       -- recorded statutory basis (CPC s.60) — seeded, not invented
    status                     g10_recovery_sched_status NOT NULL DEFAULT 'SCHEDULED',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid,
    updated_by                 uuid,
    is_deleted                 boolean NOT NULL DEFAULT false,
    -- AC2 over-recovery guard + the floor/s.60 bound (ERR-G10-RECOVERY-BARRED upstream)
    CONSTRAINT ck_g10_recovery_bounds CHECK (scheduled_per_cycle > 0 AND scheduled_per_cycle <= ordered_total
                                             AND scheduled_per_cycle <= attachment_cap)
);
CREATE INDEX ix_g10_recovery_tenant   ON g10_recovery_schedules(tenant_id);
CREATE INDEX ix_g10_recovery_employee ON g10_recovery_schedules(employee_id);
CREATE INDEX ix_g10_recovery_order    ON g10_recovery_schedules(penalty_order_id);

-- SECTION 8 — E42 pen_bank_account_verifications (BRD G11 FR-14; IR16 pre-credit gate)
CREATE TABLE pen_bank_account_verifications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- verification_id
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id           uuid NOT NULL,                                -- pen_separation_cases (service-side)
    account_no_masked varchar(32) NOT NULL,                         -- encrypted, masked by P02
    ifsc              varchar(16) NOT NULL,
    account_name      varchar(160) NOT NULL,
    method            g11_acct_verify_method NOT NULL,
    name_match_score  numeric(9,4),                                 -- integer bps in the service layer
    verified_name     varchar(160),
    result            g11_acct_verify_result NOT NULL,
    status            g11_acct_verify_status NOT NULL,
    verified_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    is_deleted        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_bav_tenant ON pen_bank_account_verifications(tenant_id);
CREATE INDEX ix_pen_bav_case   ON pen_bank_account_verifications(case_id);
CREATE INDEX ix_pen_bav_status ON pen_bank_account_verifications(status);
COMMENT ON TABLE pen_bank_account_verifications IS 'IR16: no FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE credit may transmit unless a row for that account is ACTIVE+PASSED (ERR-G11-ACCOUNT-VERIFY)';

-- SECTION 9 — pen_disbursements (instruction lines gated by the E42 verification ref)
CREATE TABLE pen_disbursements (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                uuid REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  uuid NOT NULL,                          -- pen_separation_cases (service-side)
    employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    line_type                g11_pen_disb_line_type NOT NULL,
    account_no_masked        varchar(32) NOT NULL,
    ifsc                     varchar(16) NOT NULL,
    amount                   numeric(15,2) NOT NULL,
    account_verification_ref uuid NOT NULL REFERENCES pen_bank_account_verifications(id) ON DELETE RESTRICT,  -- IR16 fail-closed
    status                   g11_pen_disb_status NOT NULL DEFAULT 'AUTHORISED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid,
    updated_by               uuid,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_disb_amount CHECK (amount > 0)
);
CREATE INDEX ix_pen_disb_tenant ON pen_disbursements(tenant_id);
CREATE INDEX ix_pen_disb_case   ON pen_disbursements(case_id);
COMMENT ON COLUMN pen_disbursements.account_verification_ref IS 'IR16: NOT NULL — a credit without a PASSED verification cannot exist';
