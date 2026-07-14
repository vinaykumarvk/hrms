-- PH-16F — G10 loans/perquisites/GL/bank-file + G11 PDA/grievances/objections.
-- Faithful subset of docs/data-model G10 (E16/E17/E13/E24/E27/E21/E31) and G11 (E37 + grievances,
-- audit objections). Runtime services currently use in-memory repositories; this DDL freezes the
-- schema shape (all money in integer paise; parameterised access only in the Pg repositories).

-- ── G10 loans / advances instalment recovery ────────────────────────────────────
CREATE TABLE IF NOT EXISTS g10_loans_advances (
  id                text PRIMARY KEY,
  tenant_id         text NOT NULL,
  entity_id         text,
  employee_id       text NOT NULL,
  loan_type         text NOT NULL,
  principal_paise   bigint NOT NULL CHECK (principal_paise > 0),
  instalment_paise  bigint NOT NULL CHECK (instalment_paise > 0),
  outstanding_paise bigint NOT NULL CHECK (outstanding_paise >= 0),   -- closure invariant: never negative
  is_concessional   boolean NOT NULL DEFAULT false,
  status            text NOT NULL CHECK (status IN ('ACTIVE','CLOSED','FORECLOSED'))
);

CREATE TABLE IF NOT EXISTS g10_loan_repayments (
  id                     text PRIMARY KEY,
  tenant_id              text NOT NULL,
  loan_id                text NOT NULL REFERENCES g10_loans_advances(id),
  recovered_paise        bigint NOT NULL CHECK (recovered_paise >= 0),
  outstanding_after_paise bigint NOT NULL CHECK (outstanding_after_paise >= 0),
  kind                   text NOT NULL CHECK (kind IN ('INSTALMENT','FORECLOSURE')),
  carried_forward_paise  bigint NOT NULL DEFAULT 0 CHECK (carried_forward_paise >= 0),
  recorded_at            date NOT NULL
);

-- ── G10 Rule-3 concessional perquisites ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS g10_perquisites (
  id                  text PRIMARY KEY,
  tenant_id           text NOT NULL,
  employee_id         text NOT NULL,
  perquisite_type     text NOT NULL CHECK (perquisite_type IN ('CONCESSIONAL_LOAN','ACCOMMODATION','OTHER')),
  is_concessional     boolean NOT NULL DEFAULT false,
  base_amount_paise   bigint NOT NULL CHECK (base_amount_paise >= 0),
  reference_rate_bps  integer,
  employee_rate_bps   integer NOT NULL,
  taxable_value_paise bigint NOT NULL CHECK (taxable_value_paise >= 0),
  -- FR-21: a concessional perquisite must carry a reference rate (ERR-G10-PERQ-REFRATE otherwise).
  CONSTRAINT ck_g10_perq_refrate CHECK (NOT is_concessional OR reference_rate_bps IS NOT NULL)
);

-- ── G10 balanced GL journals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS g10_gl_journals (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL,
  entity_id          text,
  reference          text NOT NULL,
  total_debit_paise  bigint NOT NULL CHECK (total_debit_paise >= 0),
  total_credit_paise bigint NOT NULL CHECK (total_credit_paise >= 0),
  status             text NOT NULL CHECK (status IN ('POSTED','ACKNOWLEDGED','REVERSED')),
  acknowledged_ref   text,
  -- balance invariant: a journal is only ever persisted balanced.
  CONSTRAINT ck_g10_gl_balanced CHECK (total_debit_paise = total_credit_paise)
);

CREATE TABLE IF NOT EXISTS g10_gl_journal_lines (
  id           text PRIMARY KEY,
  journal_id   text NOT NULL REFERENCES g10_gl_journals(id),
  account      text NOT NULL,
  debit_paise  bigint NOT NULL CHECK (debit_paise >= 0),
  credit_paise bigint NOT NULL CHECK (credit_paise >= 0)
);

-- ── G10 bank-file positive-pay lines + holds ────────────────────────────────────
CREATE TABLE IF NOT EXISTS g10_bank_disbursement_lines (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL,
  employee_id        text NOT NULL,
  amount_paise       bigint NOT NULL CHECK (amount_paise > 0),
  account_ref        text NOT NULL,
  positive_pay_token text NOT NULL,
  status             text NOT NULL CHECK (status IN ('PREPARED','CONFIRMED_PAID','SUSPECTED_PROCESSED','FAILED')),
  hold_id            text
);

-- ── G11 pen_disbursing_authorities (PDA registry) ───────────────────────────────
CREATE TABLE IF NOT EXISTS pen_disbursing_authorities (
  id                     text PRIMARY KEY,
  tenant_id              text NOT NULL,
  entity_id              text,
  pda_code               text NOT NULL,
  name                   text NOT NULL,
  pda_disbursement_model text NOT NULL CHECK (pda_disbursement_model IN ('M11_COMPUTES_FULL','PDA_APPLIES_RELIEF')),
  sandbox_certified      boolean NOT NULL DEFAULT false,
  status                 text NOT NULL CHECK (status IN ('REGISTERED','SANDBOX','ACTIVE','SUSPENDED')),
  -- go-live gate: an ACTIVE PDA must be sandbox-certified.
  CONSTRAINT ck_pen_pda_golive CHECK (status <> 'ACTIVE' OR sandbox_certified)
);

-- ── G11 pensioner grievances ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pen_grievances (
  id                 text PRIMARY KEY,
  tenant_id          text NOT NULL,
  entity_id          text,
  grievance_no       text NOT NULL,
  pensioner_id       text NOT NULL,
  category           text NOT NULL,
  description        text NOT NULL,
  sla_due_at         date NOT NULL,
  resolution_comment text,
  status             text NOT NULL CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  -- VAL-COMMENT: a CLOSED grievance must carry a resolution comment.
  CONSTRAINT ck_pen_grv_comment CHECK (status <> 'CLOSED' OR resolution_comment IS NOT NULL)
);

-- ── G11 audit objections ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pen_audit_objections (
  id             text PRIMARY KEY,
  tenant_id      text NOT NULL,
  entity_id      text,
  objection_no   text NOT NULL,
  case_id        text NOT NULL,
  calc_trace_ref text NOT NULL,
  raised_by      text NOT NULL,
  ground         text NOT NULL,
  response_note  text,
  status         text NOT NULL CHECK (status IN ('RAISED','UNDER_REVIEW','ACCEPTED_CORRECTED','REJECTED'))
);
