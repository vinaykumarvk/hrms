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
-- Subset deviations (same approach as 0014/0015/0016): G11 case_id is a plain text (the
-- pen_separation_cases aggregate lives service-side); the E21 header carries per-batch
-- lines in a satellite table in place of the full ack/positive-pay/DSC columns.
-- Money columns are NUMERIC(15,2)/NUMERIC(18,2); services exchange integer paise,
-- converting in SQL (($n::numeric / 100) on write, (col * 100)::bigint on read) — never
-- through float parsing. Name-match scores are integer basis points ($n::numeric / 10000).

-- SECTION 1 — ENUM TYPES (g10_/g11_ prefix; UPPER_SNAKE values, CONVENTIONS §4)














-- SECTION 2 — E21 g10_bank_disbursements (BRD G10 FR-14)
CREATE TABLE g10_bank_disbursements (
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- disbursement_id
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    batch_no         text NOT NULL,
    run_id           text NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    bank_batch_ref   text NOT NULL,                                -- positive-pay batch ref (AI-3)
    total_amount     bigint NOT NULL DEFAULT 0,
    line_count       integer NOT NULL DEFAULT 0,
    disbursed_total  bigint NOT NULL DEFAULT 0,
    held_total       bigint NOT NULL DEFAULT 0,
    failed_total     bigint NOT NULL DEFAULT 0,
    status           text NOT NULL DEFAULT 'PREPARED',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
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
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    disbursement_id  text NOT NULL REFERENCES g10_bank_disbursements(id) ON DELETE RESTRICT,
    employee_id      text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_id       text REFERENCES g10_payslips(id) ON DELETE SET NULL,
    amount           bigint NOT NULL,
    status           text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_g10_disb_line_amount CHECK (amount > 0)
);
CREATE INDEX ix_g10_disb_line_tenant ON g10_bank_disbursement_lines(tenant_id);
CREATE INDEX ix_g10_disb_line_batch  ON g10_bank_disbursement_lines(disbursement_id);

-- SECTION 3 — E31 g10_disbursement_holds (suspense ledger; BRD §5.6-4 tie-out)
CREATE TABLE g10_disbursement_holds (
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- hold_id
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    hold_no          text NOT NULL,
    run_id           text NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    disbursement_id  text REFERENCES g10_bank_disbursements(id) ON DELETE SET NULL,
    employee_id      text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_id       text REFERENCES g10_payslips(id) ON DELETE SET NULL,
    held_amount      bigint NOT NULL,
    reason           text NOT NULL,
    status           text NOT NULL DEFAULT 'HELD',
    written_off_by   text,                                         -- logical ref users
    write_off_reason text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
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
    id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- reconciliation_id
    tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id        text REFERENCES entities(id) ON DELETE RESTRICT,
    run_id           text NOT NULL REFERENCES g10_payroll_runs(id) ON DELETE RESTRICT,
    run_net          bigint NOT NULL,
    disbursed_total  bigint NOT NULL,
    held_total       bigint NOT NULL,
    failed_total     bigint NOT NULL,
    residual         bigint NOT NULL DEFAULT 0,
    signoff_status   text NOT NULL DEFAULT 'BALANCED',
    signed_by        text,                                         -- SoD: <> run creator <> run approver (ERR-G10-RECON-UNSIGNED)
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text,
    updated_by       text,
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
    id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- loan_id
    tenant_id            text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id            text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id          text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    loan_type            text NOT NULL,
    sanctioned_principal bigint NOT NULL,
    outstanding          bigint NOT NULL,
    status               text NOT NULL DEFAULT 'ACTIVE',
    settled_in_fnf_id    text,                                        -- logical ref -> g10_fnf_settlements
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text,
    updated_by           text,
    is_deleted           boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_g10_loan_amounts CHECK (sanctioned_principal > 0 AND outstanding >= 0 AND outstanding <= sanctioned_principal)
);
CREATE INDEX ix_g10_loans_tenant   ON g10_loans_advances(tenant_id);
CREATE INDEX ix_g10_loans_employee ON g10_loans_advances(employee_id);
CREATE INDEX ix_g10_loans_status   ON g10_loans_advances(status);
COMMENT ON COLUMN g10_loans_advances.id IS 'BRD E16 loan_id';

-- SECTION 6 — E30 g10_fnf_settlements (BRD G10 FR-20; one consolidated settlement)
CREATE TABLE g10_fnf_settlements (
    id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,  -- fnf_id
    tenant_id             text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id             text REFERENCES entities(id) ON DELETE RESTRICT,
    settlement_no         text NOT NULL,
    employee_id           text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    separation_date       date NOT NULL,
    final_month_pay       bigint NOT NULL DEFAULT 0,
    leave_encashment      bigint NOT NULL DEFAULT 0,
    gratuity              bigint NOT NULL DEFAULT 0,
    notice_pay_recovery   bigint NOT NULL DEFAULT 0,
    loan_settlement       bigint NOT NULL DEFAULT 0,            -- Σ open g10_loans_advances pulled in
    carryforward_recovery bigint NOT NULL DEFAULT 0,            -- Σ open g10_deduction_carryforwards pulled in
    final_tds             bigint NOT NULL DEFAULT 0,
    net_settlement        bigint NOT NULL,                      -- may be negative -> RECOVERY_PENDING
    status                text NOT NULL DEFAULT 'COMPUTED',
    approved_by           text,                                        -- logical ref users
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            text,
    updated_by            text,
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
    id                         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                  text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                  text REFERENCES entities(id) ON DELETE RESTRICT,
    employee_id                text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    penalty_order_id           text NOT NULL,                       -- logical ref -> g09 penalty order (hard upstream linkage)
    penalty_order_no           text NOT NULL,
    period                     varchar(7) NOT NULL,                 -- YYYY-MM
    ordered_total              bigint NOT NULL,
    scheduled_per_cycle        bigint NOT NULL,
    recovered_to_date          bigint NOT NULL DEFAULT 0,
    net_pay_floor              bigint NOT NULL,
    attachment_cap             bigint NOT NULL,
    attachment_exemption_basis text NOT NULL,                       -- recorded statutory basis (CPC s.60) — seeded, not invented
    status                     text NOT NULL DEFAULT 'SCHEDULED',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 text,
    updated_by                 text,
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
    id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,   -- verification_id
    tenant_id         text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id         text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id           text NOT NULL,                                -- pen_separation_cases (service-side)
    account_no_masked varchar(32) NOT NULL,                         -- encrypted, masked by P02
    ifsc              varchar(16) NOT NULL,
    account_name      varchar(160) NOT NULL,
    method            text NOT NULL,
    name_match_score  numeric(9,4),                                 -- integer bps in the service layer
    verified_name     varchar(160),
    result            text NOT NULL,
    status            text NOT NULL,
    verified_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        text,
    updated_by        text,
    is_deleted        boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_pen_bav_tenant ON pen_bank_account_verifications(tenant_id);
CREATE INDEX ix_pen_bav_case   ON pen_bank_account_verifications(case_id);
CREATE INDEX ix_pen_bav_status ON pen_bank_account_verifications(status);
COMMENT ON TABLE pen_bank_account_verifications IS 'IR16: no FIRST_PENSION/TERMINAL/GRATUITY/GPF/COMMUTED_VALUE credit may transmit unless a row for that account is ACTIVE+PASSED (ERR-G11-ACCOUNT-VERIFY)';

-- SECTION 9 — pen_disbursements (instruction lines gated by the E42 verification ref)
CREATE TABLE pen_disbursements (
    id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id                text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_id                text REFERENCES entities(id) ON DELETE RESTRICT,
    case_id                  text NOT NULL,                          -- pen_separation_cases (service-side)
    employee_id              text NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    line_type                text NOT NULL,
    account_no_masked        varchar(32) NOT NULL,
    ifsc                     varchar(16) NOT NULL,
    amount                   bigint NOT NULL,
    account_verification_ref text NOT NULL REFERENCES pen_bank_account_verifications(id) ON DELETE RESTRICT,  -- IR16 fail-closed
    status                   text NOT NULL DEFAULT 'AUTHORISED',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text,
    updated_by               text,
    is_deleted               boolean NOT NULL DEFAULT false,
    CONSTRAINT ck_pen_disb_amount CHECK (amount > 0)
);
CREATE INDEX ix_pen_disb_tenant ON pen_disbursements(tenant_id);
CREATE INDEX ix_pen_disb_case   ON pen_disbursements(case_id);
COMMENT ON COLUMN pen_disbursements.account_verification_ref IS 'IR16: NOT NULL — a credit without a PASSED verification cannot exist';
