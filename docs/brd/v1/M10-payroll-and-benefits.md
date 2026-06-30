# Payroll and Benefits Management — HRMS Module BRD

**Module code:** M10-PAY
**Program:** Enterprise HRMS ("PeopleGov / HRMS Suite") — Government / Public-Sector context
**Authoring standard:** World-class global HCM (Workday / SAP SuccessFactors / Oracle HCM bar) honouring Indian public-sector statutory payroll rules
**Source of truth:** `docs/brd/SHARED_FOUNDATION.md` (canonical shared entities, conventions, RBAC, technical defaults). This BRD references and extends — it does not redefine — those shared elements.
**Document version:** v1.0
**Status:** Draft for Gate A review

---

## 1. Executive Summary

### 1.1 Purpose

The Payroll and Benefits Management module (**M10-PAY**) is the financial heart of the HRMS. It computes, controls, and disburses employee compensation each pay cycle; administers statutory deductions, loans, advances, and benefits; and produces every downstream financial and compliance artefact (payslips, bank disbursement files, statutory remittance schedules, Form-16/tax statements, payroll registers, and cost-to-organisation analytics). It also publishes pay events to the **Digital Service Register (M12)** and feeds terminal-benefit and pension processing in **M11**.

M10 is engineered as a **configurable, rule-driven, audit-grade payroll engine**. Pay is never hand-keyed into a ledger; it is *derived* from a versioned salary structure, time/leave inputs (M03), service events (promotions/pay-fixation from M06, disciplinary recoveries from M09), and a deterministic computation pipeline. Once a payroll run is **finalised and locked, it is immutable** — corrections flow only through arrears, supplementary, or off-cycle runs, never through silent edits. Every rupee is traceable from input to disbursement and reversible only through a controlled adjustment with full audit.

### 1.2 Business Context and Problem Statement

Government payroll combines high volume with extreme regulatory sensitivity: pay matrices and scales (e.g., 7th CPC-style pay levels), Dearness Allowance (DA) revisions issued retrospectively, House Rent Allowance (HRA) by city class, GPF/CPF/NPS contributions, income-tax (TDS) with employee declarations and proofs, professional tax slabs by state, recoveries ordered by disciplinary authorities, and statutory remittances under tight deadlines. Manual or spreadsheet-driven payroll produces reconciliation gaps, over/under-payments, audit findings, and litigation. M10 eliminates these by making the rule set explicit and versioned, the run reproducible, and the controls enforceable.

### 1.3 Goals and Objectives

| # | Objective | Success measure |
|---|---|---|
| G1 | Deterministic, reproducible monthly payroll | Re-running an unlocked cycle with identical inputs yields byte-identical results |
| G2 | Statutory accuracy | 100% correct DA/HRA/PT/TDS/GPF/NPS computation against published rules; zero statutory-deadline misses |
| G3 | Immutable, auditable finalised runs | No mutation of locked runs; every adjustment traceable to an arrear/supplementary/off-cycle entry |
| G4 | Reconciliation integrity | Gross = sum(earnings); Net = Gross − sum(deductions); Bank file total = sum(net pay) — reconciled before disbursement |
| G5 | Self-service | Employees access payslips, tax declarations, Form-16, loan statements without HR intervention |
| G6 | Retrospective correctness | Arrears for back-dated DA/increment/pay-fixation computed automatically with full break-up |
| G7 | Cost transparency | Cost-to-organisation analytics by org unit, cadre, component, and period |

### 1.4 Scope Summary

In scope: salary structure & pay rules engine; monthly payroll run engine with parallel/what-if runs; arrears & retrospective revisions; supplementary & off-cycle payroll; LWP/leave-based deductions; statutory deductions (TDS, PT, GPF/PF, NPS, pension contribution, insurance); recoveries; loans & advances; benefits administration (medical, LTC/LTA, gratuity accrual, reimbursements, group insurance); payslip generation; bank disbursement file & integration; payroll register & reconciliation; Form-16/tax statements; approval & locking; feeds to M11 and M12.

Out of scope (owned elsewhere): the canonical employee master (M01), attendance/leave capture (M03), pension disbursement after retirement (M11), the SR ledger itself (M12), document storage internals (M13), and general-ledger / accounting postings beyond producing the payroll cost journal export.

### 1.5 Key Stakeholders

Payroll Officer, Payroll Manager/Controller, HR Officer/Admin, Department Head/Drawing & Disbursing Officer (DDO), Finance/Treasury, Employee (self-service), Auditor, System Administrator.

### 1.6 Success Criteria

A pay cycle is "successful" when: all eligible active employees are computed; reconciliation balances to zero variance; the run is approved and locked; payslips are published; the bank file is generated, signed, and accepted; statutory schedules are produced; and pay events are posted to M12 — all within the cycle calendar with a complete audit trail.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map

| Feature area | Code | Description |
|---|---|---|
| Salary Structure & Pay Matrix | M10-F01 | Pay scales/levels, components (basic, DA, HRA, allowances, special pay), eligibility rules |
| Pay Rules Engine | M10-F02 | Configurable, versioned earning/deduction formulae and computation order |
| Employee Compensation Assignment | M10-F03 | Per-employee salary structure binding, pay-fixation, increments |
| Payroll Run Engine | M10-F04 | Monthly cycle orchestration, computation, parallel/what-if runs |
| Time & Leave Inputs | M10-F05 | LWP/leave-loss-of-pay and attendance ingestion from M03 |
| Statutory Deductions | M10-F06 | TDS, professional tax, GPF/PF, NPS, pension contribution, insurance |
| Income-Tax Declarations & Proofs | M10-F07 | Investment declarations, proof capture, regime selection, projected tax |
| Loans & Advances | M10-F08 | Sanction, schedule, EMI recovery, foreclosure, interest |
| Recoveries & Adjustments | M10-F09 | Disciplinary recoveries (M09), overpayment recovery, ad-hoc adjustments |
| Arrears & Retrospective Revisions | M10-F10 | Back-dated DA/increment/pay-fixation arrear computation |
| Supplementary & Off-Cycle Payroll | M10-F11 | Out-of-band payments, missed payments, bonus/ex-gratia |
| Benefits Administration | M10-F12 | Medical/health, LTC/LTA, gratuity accrual, reimbursements, group insurance |
| Payslip Generation | M10-F13 | Per-employee payslip rendering, publication, self-service access |
| Bank Disbursement | M10-F14 | Bank file generation, validation, transmission, acknowledgement reconciliation |
| Payroll Register & Reconciliation | M10-F15 | Run register, control totals, variance analysis, sign-off |
| Approval & Locking | M10-F16 | Multi-level approval, finalisation, immutability, reopen control |
| Statutory Outputs (Form-16/tax) | M10-F17 | Form-16, Form-24Q, PT/GPF/NPS schedules, remittance files |
| Cost-to-Org Analytics | M10-F18 | Payroll cost, headcount cost, variance and trend analytics |

### 2.2 Common Capabilities (inherited from Shared Foundation)

All M10 features inherit: UUID PKs + human business keys; standard audit fields; UPPER_SNAKE_CASE status enums; UTC storage / locale display; `DD-MMM-YYYY` dates; INR default currency with i18n money formatting; paginated list endpoints (max page 100); maker-checker via the shared workflow engine; RBAC + org-unit row-level scoping; immutable `audit_log` write on every state change; `documents` (M13) for generated artefacts; `notifications` for events; `service_register_events` (M12) for pay events.

### 2.3 In-Scope / Out-of-Scope Boundary Table

| Concern | In M10? | Owner / Note |
|---|---|---|
| Employee master data | Reference only | M01 (golden source) |
| Attendance & leave balances | Consume only | M03 (LWP days, paid/unpaid splits) |
| Promotion / pay-fixation order | Consume the order; compute pay impact | M06 issues; M10 fixes pay & computes arrears |
| Disciplinary recovery order | Consume; recover via payroll | M09 issues; M10 schedules recovery |
| Pension disbursement | Out | M11 (M10 supplies last-pay-drawn & contribution history) |
| Service register pay events | Write events | M12 owns ledger; M10 appends |
| Document storage | Reference | M13 stores payslips/Form-16 objects |
| General ledger posting | Export only | M10 produces cost journal; Finance posts in ERP/treasury |
| Bank core integration | File + API handshake | Treasury/Bank gateway is external |

### 2.4 Assumptions and Constraints

- Pay scales, DA rates, HRA city classes, PT slabs, and tax slabs are **configurable master data**, sourced from government notifications and version-effective-dated.
- A single legal entity per deployment; multi-entity is a future extension but the data model is entity-aware (`legal_entity_id`).
- One primary monthly cycle plus arrears/supplementary/off-cycle cycles per period.
- The bank/treasury accepts a defined fixed-width or NACH/structured file format; M10 is format-pluggable.
- All money math uses fixed-point decimal (no binary float); rounding rules are explicit and configurable (default: round to nearest rupee, half-up; statutory deductions per their own rounding rules).

---

## 3. Roles & Permissions

### 3.1 Module Roles (extending the Shared RBAC baseline)

| Role | M10 responsibility |
|---|---|
| Employee (Self-Service) | View own payslips, salary structure, loan/benefit statements; submit tax declarations & proofs; submit reimbursement/LTC claims |
| Reporting Manager | Recommend/approve reimbursement and benefit claims for direct reports |
| Payroll Officer (Maker) | Configure pay components/rules, assign structures, run payroll (draft/parallel), enter adjustments, prepare bank file |
| Payroll Manager / Controller (Checker) | Review reconciliation, approve & lock runs, authorise off-cycle/supplementary, sign bank file, reopen with justification |
| HR Officer / Admin | Maintain employee pay-relevant attributes within delegated scope; raise pay-fixation requests |
| Department Head / DDO | Sanction loans/advances; sanction off-cycle payments within authority |
| Finance / Treasury | Receive bank file & cost journal; confirm disbursement acknowledgement |
| Auditor (read-only) | Read all payroll data, registers, and audit log; no write |
| System Administrator | Manage master data (scales, DA/HRA/PT/tax tables), file format config, RBAC; **no transactional self-approval** |

### 3.2 Permission Matrix (C=Create, R=Read, U=Update, A=Approve/Lock, X=No access)

| Capability | Employee | Mgr | Payroll Officer | Payroll Mgr | HR Admin | DDO/Dept Head | Finance | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|
| Pay component / rule config | X | X | C/R/U (draft) | A | R | X | X | R | C/R/U |
| Pay scale / DA / HRA / tax tables | X | X | R | R | R | X | X | R | C/R/U/A |
| Assign salary structure / pay-fixation | X | X | C/R/U | A | C (request) | X | X | R | X |
| Run payroll (draft / parallel) | X | X | C/R | R | X | X | X | R | X |
| Approve & lock payroll run | X | X | X | A | X | X | X | R | X |
| Reopen locked run | X | X | X | A (justified) | X | X | X | R | X |
| Loans & advances sanction | X | R (own reports) | C/R | R | C (request) | A | X | R | X |
| Tax declaration & proofs | C/R/U (own) | X | R/A (verify) | R | R | X | X | R | X |
| Reimbursement / LTC claim | C/R (own) | A (recommend) | R/A (verify) | A | R | X | X | R | X |
| Off-cycle / supplementary payment | X | X | C/R | A | X | A (sanction) | X | R | X |
| Bank file generate / sign | X | X | C/R | A (sign) | X | X | R | R | X |
| Disbursement acknowledgement | X | X | R/U | R | X | X | C/R | R | X |
| Payslip view | R (own) | R (reports) | R | R | R | R | X | R | X |
| Form-16 / statutory outputs | R (own) | X | C/R | A | R | X | R | R | X |
| Cost-to-org analytics | X | R (own unit) | R | R | R | R | R | R | R |
| Audit log | X | X | R (own actions) | R | X | X | X | R | R |

**Segregation of duties:** maker ≠ checker is enforced — the Payroll Officer who runs/prepares cannot approve/lock or sign the bank file; the SysAdmin who configures tables cannot run or approve payroll for which they are also an employee subject.

---

## 4. Shared Application Foundation

M10 inherits the Shared Foundation §5 technical defaults verbatim: React + TypeScript (Tailwind + shadcn/ui) frontend; REST `/api/v1`; PostgreSQL primary store; encrypted object storage for payslips/Form-16; OIDC/SSO + MFA; JWT + RBAC + org-unit row-level scoping; canonical error envelope; OWASP ASVS; TLS 1.2+, encryption at rest; DPDP Act 2023 alignment; P95 < 500ms (interactive), batch SLAs defined in §10; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

**M10-specific foundation extensions:**

- **Money type:** `NUMERIC(15,2)` fixed-point for all amounts; rates as `NUMERIC(9,4)`; no floating point in computation.
- **Computation determinism:** the run engine is a pure function of (salary structure version, rate tables effective on pay period, employee inputs, prior balances). Same inputs → same outputs.
- **Immutability:** finalised payroll runs and their payslips are append-only snapshots; corrections create new artefacts.
- **Idempotency:** all run/disbursement mutating endpoints accept an `Idempotency-Key` header.
- **Transactionality:** a payroll run commits as an all-or-nothing transaction per run; partial computation is held in a staging area until validated.
- **Encryption:** bank account numbers, PAN, and salary amounts are PII/financial data — encrypted at rest, masked in UI by default, access logged.

---

## 5. Holistic Data Model

### 5.1 Entity Inventory

| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| E01 | `employees` | Shared (M01) | M01 | Employee master (referenced) |
| E02 | `org_units` | Shared | Platform | Org hierarchy (referenced) |
| E03 | `designations` / `pay_scales` | Shared ref | Platform | Designation & pay-scale master (extended by E04) |
| E04 | `pay_matrix_levels` | M10 | M10 | Pay-matrix level/cell (basic-pay progression) |
| E05 | `pay_components` | M10 | M10 | Earning/deduction component catalog |
| E06 | `pay_rules` | M10 | M10 | Versioned formula/rule per component |
| E07 | `rate_tables` | M10 | M10 | DA %, HRA class %, PT slabs, tax slabs (effective-dated) |
| E08 | `employee_salary_structures` | M10 | M10 | Per-employee assigned structure (versioned) |
| E09 | `employee_salary_components` | M10 | M10 | Component-level overrides/values per structure version |
| E10 | `payroll_cycles` | M10 | M10 | A pay period + run-type definition |
| E11 | `payroll_runs` | M10 | M10 | A computation run instance (draft/parallel/final) |
| E12 | `payslips` | M10 | M10 | Per-employee per-run computed result header |
| E13 | `payslip_lines` | M10 | M10 | Earning/deduction line items of a payslip |
| E14 | `deductions` | M10 | M10 | Statutory/voluntary deduction definitions & balances per employee |
| E15 | `tax_declarations` | M10 | M10 | Income-tax investment declaration & proofs per FY |
| E16 | `loans_advances` | M10 | M10 | Loan/advance sanction & recovery schedule |
| E17 | `loan_repayments` | M10 | M10 | Per-installment recovery ledger |
| E18 | `benefits` | M10 | M10 | Benefit enrolment (medical/LTC/insurance/gratuity) |
| E19 | `benefit_claims` | M10 | M10 | Reimbursement / LTC / medical claims |
| E20 | `arrears` | M10 | M10 | Retrospective revision arrear computations |
| E21 | `bank_disbursements` | M10 | M10 | Bank file batch + line + acknowledgement |
| E22 | `payroll_reconciliations` | M10 | M10 | Control totals & variance sign-off per run |
| E23 | `gratuity_accruals` | M10 | M10 | Period gratuity accrual ledger |
| E24 | `audit_log` | Shared | Platform | Immutable audit (written) |
| E25 | `documents` | Shared (M13) | M13 | Payslip/Form-16 object metadata (referenced) |
| E26 | `notifications` | Shared | Platform | Outbound events (written) |
| E27 | `service_register_events` | Shared (M12) | M12 | Pay events appended |
| E28 | `workflow_instances`/`workflow_tasks` | Shared | Platform | Approvals (used) |

### 5.2 Full Field Tables (M10-owned entities)

#### E04 `pay_matrix_levels`

| Field | Type | Null | Notes |
|---|---|---|---|
| `level_id` | UUID PK | N | |
| `pay_commission` | TEXT | N | e.g. `CPC_7` |
| `level_code` | TEXT | N | e.g. `LEVEL_10` |
| `cell_index` | INT | N | progression cell (1..n) |
| `basic_pay` | NUMERIC(15,2) | N | basic pay at this cell |
| `pay_scale_id` | UUID FK→pay_scales | Y | legacy scale link |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | null = current |
| audit fields | — | — | created_at/updated_at/created_by/updated_by/is_deleted |

#### E05 `pay_components`

| Field | Type | Null | Notes |
|---|---|---|---|
| `component_id` | UUID PK | N | |
| `component_code` | TEXT unique | N | e.g. `BASIC`,`DA`,`HRA`,`TPT`,`PT`,`GPF`,`NPS`,`TDS` |
| `name` | TEXT | N | |
| `type` | ENUM | N | EARNING, DEDUCTION |
| `category` | ENUM | N | BASIC, ALLOWANCE, SPECIAL_PAY, STATUTORY_DEDUCTION, VOLUNTARY_DEDUCTION, LOAN_RECOVERY, RECOVERY |
| `taxable` | BOOL | N | counts toward taxable income |
| `is_statutory` | BOOL | N | |
| `calc_method` | ENUM | N | FIXED, PERCENT_OF_BASE, SLAB, FORMULA, MANUAL |
| `base_component_codes` | TEXT[] | Y | base for PERCENT/FORMULA |
| `gl_code` | TEXT | Y | cost journal mapping |
| `display_order` | INT | N | payslip ordering |
| `is_active` | BOOL | N | |
| audit fields | — | — | |

#### E06 `pay_rules`

| Field | Type | Null | Notes |
|---|---|---|---|
| `rule_id` | UUID PK | N | |
| `component_id` | UUID FK→pay_components | N | |
| `version` | INT | N | versioned rule |
| `expression` | TEXT | Y | safe formula DSL (e.g. `BASIC * DA_RATE`) |
| `rate_table_id` | UUID FK→rate_tables | Y | for SLAB/PERCENT |
| `rounding` | ENUM | N | NEAREST, UP, DOWN, NONE |
| `eligibility_expr` | TEXT | Y | e.g. `city_class == 'X'` |
| `computation_order` | INT | N | engine evaluation sequence |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | |
| `status` | ENUM | N | DRAFT, ACTIVE, RETIRED |
| audit fields | — | — | |

#### E07 `rate_tables`

| Field | Type | Null | Notes |
|---|---|---|---|
| `rate_table_id` | UUID PK | N | |
| `table_type` | ENUM | N | DA_RATE, HRA_CLASS, PT_SLAB, TAX_SLAB, NPS_RATE, GPF_RATE |
| `key` | TEXT | N | e.g. city class `X`/`Y`/`Z`, slab range |
| `value_numeric` | NUMERIC(15,4) | Y | rate/percentage/amount |
| `slab_min` | NUMERIC(15,2) | Y | for slab tables |
| `slab_max` | NUMERIC(15,2) | Y | |
| `regime` | ENUM | Y | OLD, NEW (tax) |
| `financial_year` | TEXT | Y | e.g. `FY2026_27` |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | |
| audit fields | — | — | |

#### E08 `employee_salary_structures`

| Field | Type | Null | Notes |
|---|---|---|---|
| `structure_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `version` | INT | N | new version on any change |
| `pay_level_id` | UUID FK→pay_matrix_levels | Y | |
| `city_class` | ENUM | Y | X, Y, Z (HRA) |
| `basic_pay` | NUMERIC(15,2) | N | snapshot of basic |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | |
| `reason` | ENUM | N | INITIAL, INCREMENT, PROMOTION, PAY_FIXATION, REVISION, CORRECTION |
| `source_ref` | TEXT | Y | M06 order id / SR event ref |
| `status` | ENUM | N | DRAFT, PENDING_APPROVAL, ACTIVE, SUPERSEDED |
| audit fields | — | — | |

#### E09 `employee_salary_components`

| Field | Type | Null | Notes |
|---|---|---|---|
| `esc_id` | UUID PK | N | |
| `structure_id` | UUID FK→employee_salary_structures | N | |
| `component_id` | UUID FK→pay_components | N | |
| `value_type` | ENUM | N | RULE_DRIVEN, FIXED_OVERRIDE |
| `override_amount` | NUMERIC(15,2) | Y | when FIXED_OVERRIDE |
| `override_reason` | TEXT | Y | |
| audit fields | — | — | |

#### E10 `payroll_cycles`

| Field | Type | Null | Notes |
|---|---|---|---|
| `cycle_id` | UUID PK | N | |
| `cycle_code` | TEXT unique | N | e.g. `2026-06-REGULAR` |
| `legal_entity_id` | UUID | N | |
| `period_month` | INT | N | 1-12 |
| `period_year` | INT | N | |
| `run_type` | ENUM | N | REGULAR, SUPPLEMENTARY, ARREARS, OFF_CYCLE, BONUS |
| `pay_date` | DATE | N | |
| `cutoff_date` | DATE | N | input freeze date |
| `status` | ENUM | N | OPEN, INPUT_LOCKED, COMPUTING, COMPUTED, RECONCILED, APPROVED, LOCKED, DISBURSED, CLOSED, REOPENED |
| audit fields | — | — | |

#### E11 `payroll_runs`

| Field | Type | Null | Notes |
|---|---|---|---|
| `run_id` | UUID PK | N | |
| `cycle_id` | UUID FK→payroll_cycles | N | |
| `run_no` | TEXT unique | N | human key |
| `run_mode` | ENUM | N | DRAFT, PARALLEL_WHATIF, FINAL |
| `parameters` | JSONB | Y | what-if overrides (e.g. proposed DA%) |
| `scope_filter` | JSONB | Y | org_unit/cadre filter |
| `employee_count` | INT | Y | |
| `gross_total` | NUMERIC(18,2) | Y | |
| `deduction_total` | NUMERIC(18,2) | Y | |
| `net_total` | NUMERIC(18,2) | Y | |
| `status` | ENUM | N | QUEUED, RUNNING, COMPLETED, FAILED, APPROVED, LOCKED, CANCELLED |
| `started_at` | TIMESTAMP | Y | |
| `completed_at` | TIMESTAMP | Y | |
| `error_summary` | JSONB | Y | per-employee failures |
| `approved_by` | UUID | Y | |
| `locked_at` | TIMESTAMP | Y | |
| audit fields | — | — | |

#### E12 `payslips`

| Field | Type | Null | Notes |
|---|---|---|---|
| `payslip_id` | UUID PK | N | |
| `run_id` | UUID FK→payroll_runs | N | |
| `employee_id` | UUID FK→employees | N | |
| `cycle_id` | UUID FK→payroll_cycles | N | |
| `gross_earnings` | NUMERIC(15,2) | N | |
| `total_deductions` | NUMERIC(15,2) | N | |
| `net_pay` | NUMERIC(15,2) | N | |
| `paid_days` | NUMERIC(6,2) | N | |
| `lwp_days` | NUMERIC(6,2) | N | |
| `structure_version_ref` | UUID | N | snapshot link |
| `bank_account_masked` | TEXT | Y | |
| `document_id` | UUID FK→documents | Y | rendered PDF (M13) |
| `status` | ENUM | N | DRAFT, FINAL, PUBLISHED, REVERSED |
| `is_immutable` | BOOL | N | true when run locked |
| audit fields | — | — | |

#### E13 `payslip_lines`

| Field | Type | Null | Notes |
|---|---|---|---|
| `line_id` | UUID PK | N | |
| `payslip_id` | UUID FK→payslips | N | |
| `component_id` | UUID FK→pay_components | N | |
| `component_code` | TEXT | N | snapshot |
| `type` | ENUM | N | EARNING, DEDUCTION |
| `amount` | NUMERIC(15,2) | N | |
| `taxable_amount` | NUMERIC(15,2) | Y | |
| `calc_trace` | JSONB | Y | inputs & formula evaluated |
| `arrear_ref` | UUID FK→arrears | Y | |
| audit fields | — | — | |

#### E14 `deductions`

| Field | Type | Null | Notes |
|---|---|---|---|
| `deduction_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `component_id` | UUID FK→pay_components | N | |
| `deduction_type` | ENUM | N | TDS, PT, GPF, CPF, NPS, PENSION, INSURANCE, COURT_ATTACHMENT, OTHER |
| `mode` | ENUM | N | STATUTORY_AUTO, FIXED, PERCENT, MANUAL |
| `amount_or_rate` | NUMERIC(15,4) | Y | |
| `cumulative_ytd` | NUMERIC(15,2) | Y | |
| `account_ref` | TEXT | Y | GPF/NPS/PRAN account |
| `effective_from` | DATE | N | |
| `effective_to` | DATE | Y | |
| `status` | ENUM | N | ACTIVE, SUSPENDED, CLOSED |
| audit fields | — | — | |

#### E15 `tax_declarations`

| Field | Type | Null | Notes |
|---|---|---|---|
| `declaration_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `financial_year` | TEXT | N | |
| `regime` | ENUM | N | OLD, NEW |
| `declared_items` | JSONB | N | sections 80C/80D/HRA/home-loan etc with amounts |
| `proof_document_ids` | UUID[] | Y | documents (M13) |
| `projected_taxable_income` | NUMERIC(15,2) | Y | |
| `projected_tax` | NUMERIC(15,2) | Y | |
| `verification_status` | ENUM | N | DRAFT, SUBMITTED, VERIFIED, PARTIALLY_VERIFIED, REJECTED |
| `verified_by` | UUID | Y | |
| `lock_after_cutoff` | BOOL | N | proofs locked after FY proof cutoff |
| audit fields | — | — | |

#### E16 `loans_advances`

| Field | Type | Null | Notes |
|---|---|---|---|
| `loan_id` | UUID PK | N | |
| `loan_no` | TEXT unique | N | |
| `employee_id` | UUID FK→employees | N | |
| `loan_type` | ENUM | N | HBA, VEHICLE, COMPUTER, FESTIVAL_ADVANCE, GPF_ADVANCE, SALARY_ADVANCE, MEDICAL_ADVANCE, OTHER |
| `principal` | NUMERIC(15,2) | N | |
| `interest_rate` | NUMERIC(9,4) | Y | annual % |
| `interest_method` | ENUM | Y | SIMPLE, REDUCING, NONE |
| `installments_total` | INT | N | |
| `installment_amount` | NUMERIC(15,2) | N | |
| `recovery_start_cycle` | TEXT | N | |
| `outstanding_principal` | NUMERIC(15,2) | N | |
| `outstanding_interest` | NUMERIC(15,2) | Y | |
| `sanctioned_by` | UUID | Y | DDO |
| `status` | ENUM | N | REQUESTED, SANCTIONED, DISBURSED, RECOVERING, ON_HOLD, FORECLOSED, CLOSED, REJECTED |
| audit fields | — | — | |

#### E17 `loan_repayments`

| Field | Type | Null | Notes |
|---|---|---|---|
| `repayment_id` | UUID PK | N | |
| `loan_id` | UUID FK→loans_advances | N | |
| `cycle_id` | UUID FK→payroll_cycles | Y | which cycle recovered |
| `installment_no` | INT | N | |
| `principal_component` | NUMERIC(15,2) | N | |
| `interest_component` | NUMERIC(15,2) | Y | |
| `balance_after` | NUMERIC(15,2) | N | |
| `recovery_type` | ENUM | N | PAYROLL, MANUAL, FORECLOSURE |
| `status` | ENUM | N | SCHEDULED, RECOVERED, SKIPPED, WAIVED |
| audit fields | — | — | |

#### E18 `benefits`

| Field | Type | Null | Notes |
|---|---|---|---|
| `benefit_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `benefit_type` | ENUM | N | MEDICAL, LTC_LTA, GROUP_INSURANCE, GRATUITY, REIMBURSEMENT_PLAN |
| `plan_code` | TEXT | Y | |
| `enrolment_status` | ENUM | N | ELIGIBLE, ENROLLED, SUSPENDED, TERMINATED |
| `coverage_amount` | NUMERIC(15,2) | Y | |
| `eligible_from` | DATE | N | |
| `eligible_to` | DATE | Y | |
| `block_year` | TEXT | Y | LTC block period |
| audit fields | — | — | |

#### E19 `benefit_claims`

| Field | Type | Null | Notes |
|---|---|---|---|
| `claim_id` | UUID PK | N | |
| `claim_no` | TEXT unique | N | |
| `benefit_id` | UUID FK→benefits | N | |
| `employee_id` | UUID FK→employees | N | |
| `claim_type` | ENUM | N | MEDICAL, LTC_LTA, REIMBURSEMENT |
| `claimed_amount` | NUMERIC(15,2) | N | |
| `approved_amount` | NUMERIC(15,2) | Y | |
| `proof_document_ids` | UUID[] | Y | M13 |
| `payout_mode` | ENUM | N | PAYROLL, OFF_CYCLE |
| `workflow_instance_id` | UUID | Y | |
| `status` | ENUM | N | DRAFT, SUBMITTED, RECOMMENDED, APPROVED, REJECTED, PAID |
| audit fields | — | — | |

#### E20 `arrears`

| Field | Type | Null | Notes |
|---|---|---|---|
| `arrear_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `reason` | ENUM | N | DA_REVISION, INCREMENT, PROMOTION, PAY_FIXATION, CORRECTION |
| `source_ref` | TEXT | Y | M06 order / notification |
| `period_from` | DATE | N | retrospective start |
| `period_to` | DATE | N | |
| `component_breakup` | JSONB | N | per-component per-month delta |
| `gross_arrear` | NUMERIC(15,2) | N | |
| `deduction_arrear` | NUMERIC(15,2) | Y | recomputed statutory delta |
| `net_arrear` | NUMERIC(15,2) | N | |
| `payout_cycle_id` | UUID FK→payroll_cycles | Y | |
| `status` | ENUM | N | COMPUTED, APPROVED, PAID, CANCELLED |
| audit fields | — | — | |

#### E21 `bank_disbursements`

| Field | Type | Null | Notes |
|---|---|---|---|
| `disbursement_id` | UUID PK | N | |
| `run_id` | UUID FK→payroll_runs | N | |
| `batch_no` | TEXT unique | N | |
| `bank_code` | TEXT | N | |
| `file_format` | ENUM | N | NACH, FIXED_WIDTH, ISO20022, CUSTOM |
| `total_amount` | NUMERIC(18,2) | N | |
| `record_count` | INT | N | |
| `file_document_id` | UUID FK→documents | Y | generated file |
| `checksum` | TEXT | N | file hash |
| `signed_by` | UUID | Y | |
| `transmitted_at` | TIMESTAMP | Y | |
| `ack_status` | ENUM | N | NOT_SENT, SENT, ACK_SUCCESS, ACK_PARTIAL, ACK_FAILED |
| `ack_details` | JSONB | Y | per-line return codes |
| `status` | ENUM | N | DRAFT, VALIDATED, SIGNED, TRANSMITTED, RECONCILED, REJECTED |
| audit fields | — | — | |

#### E22 `payroll_reconciliations`

| Field | Type | Null | Notes |
|---|---|---|---|
| `recon_id` | UUID PK | N | |
| `run_id` | UUID FK→payroll_runs | N | |
| `gross_control` | NUMERIC(18,2) | N | |
| `deduction_control` | NUMERIC(18,2) | N | |
| `net_control` | NUMERIC(18,2) | N | |
| `prev_period_net` | NUMERIC(18,2) | Y | |
| `variance_amount` | NUMERIC(18,2) | Y | |
| `variance_pct` | NUMERIC(7,4) | Y | |
| `exceptions` | JSONB | Y | new joiners/leavers/large swings |
| `signoff_status` | ENUM | N | PENDING, SIGNED_OFF, REJECTED |
| `signed_off_by` | UUID | Y | |
| audit fields | — | — | |

#### E23 `gratuity_accruals`

| Field | Type | Null | Notes |
|---|---|---|---|
| `accrual_id` | UUID PK | N | |
| `employee_id` | UUID FK→employees | N | |
| `as_of_date` | DATE | N | |
| `years_of_service` | NUMERIC(6,2) | N | |
| `last_drawn_basic_da` | NUMERIC(15,2) | N | |
| `accrued_amount` | NUMERIC(15,2) | N | |
| `statutory_cap` | NUMERIC(15,2) | Y | |
| `status` | ENUM | N | ACCRUING, FROZEN, SETTLED |
| audit fields | — | — | |

### 5.3 Relationship Map

```
employees (M01) 1───n employee_salary_structures 1───n employee_salary_components ──n─1 pay_components 1───n pay_rules ──n─1 rate_tables
pay_matrix_levels 1───n employee_salary_structures
payroll_cycles 1───n payroll_runs 1───n payslips 1───n payslip_lines ──n─1 pay_components
payroll_runs 1───1 payroll_reconciliations
payroll_runs 1───n bank_disbursements
employees 1───n deductions / tax_declarations / loans_advances / benefits / arrears / gratuity_accruals
loans_advances 1───n loan_repayments
benefits 1───n benefit_claims
payslip_lines n───1 arrears  (arrear lines reference their source arrear)
payslips n───1 documents (M13);  pay events ──> service_register_events (M12);  every mutation ──> audit_log
```

### 5.4 Ownership / Reuse Matrix

| Entity | Owned by | Read by | Written by |
|---|---|---|---|
| `employees`, `org_units`, `pay_scales` | M01/Platform | M10 | — (M10 reads only) |
| `pay_matrix_levels`…`gratuity_accruals` (E04-E23) | M10 | M11, M12, M14 | M10 |
| `documents` | M13 | M10 (payslip/Form-16/bank file refs) | M10 (creates refs) |
| `service_register_events` | M12 | M10 | M10 (appends pay events) |
| `notifications`, `audit_log`, `workflow_*` | Platform | M10 | M10 |

### 5.5 Enum Catalog

| Enum | Values |
|---|---|
| pay_component.type | EARNING, DEDUCTION |
| pay_component.category | BASIC, ALLOWANCE, SPECIAL_PAY, STATUTORY_DEDUCTION, VOLUNTARY_DEDUCTION, LOAN_RECOVERY, RECOVERY |
| calc_method | FIXED, PERCENT_OF_BASE, SLAB, FORMULA, MANUAL |
| rate_table.table_type | DA_RATE, HRA_CLASS, PT_SLAB, TAX_SLAB, NPS_RATE, GPF_RATE |
| city_class | X, Y, Z |
| tax.regime | OLD, NEW |
| structure.reason | INITIAL, INCREMENT, PROMOTION, PAY_FIXATION, REVISION, CORRECTION |
| cycle.run_type | REGULAR, SUPPLEMENTARY, ARREARS, OFF_CYCLE, BONUS |
| cycle.status | OPEN, INPUT_LOCKED, COMPUTING, COMPUTED, RECONCILED, APPROVED, LOCKED, DISBURSED, CLOSED, REOPENED |
| run.run_mode | DRAFT, PARALLEL_WHATIF, FINAL |
| run.status | QUEUED, RUNNING, COMPLETED, FAILED, APPROVED, LOCKED, CANCELLED |
| payslip.status | DRAFT, FINAL, PUBLISHED, REVERSED |
| deduction.deduction_type | TDS, PT, GPF, CPF, NPS, PENSION, INSURANCE, COURT_ATTACHMENT, OTHER |
| loan.loan_type | HBA, VEHICLE, COMPUTER, FESTIVAL_ADVANCE, GPF_ADVANCE, SALARY_ADVANCE, MEDICAL_ADVANCE, OTHER |
| loan.status | REQUESTED, SANCTIONED, DISBURSED, RECOVERING, ON_HOLD, FORECLOSED, CLOSED, REJECTED |
| benefit.benefit_type | MEDICAL, LTC_LTA, GROUP_INSURANCE, GRATUITY, REIMBURSEMENT_PLAN |
| claim.status | DRAFT, SUBMITTED, RECOMMENDED, APPROVED, REJECTED, PAID |
| arrear.reason | DA_REVISION, INCREMENT, PROMOTION, PAY_FIXATION, CORRECTION |
| disbursement.status | DRAFT, VALIDATED, SIGNED, TRANSMITTED, RECONCILED, REJECTED |
| disbursement.ack_status | NOT_SENT, SENT, ACK_SUCCESS, ACK_PARTIAL, ACK_FAILED |
| recon.signoff_status | PENDING, SIGNED_OFF, REJECTED |

### 5.6 Data Integrity Rules

1. **Earning/deduction identity:** for each payslip, `gross_earnings = Σ(lines where type=EARNING)`, `total_deductions = Σ(lines where type=DEDUCTION)`, `net_pay = gross_earnings − total_deductions`, and `net_pay ≥ 0` (a fully-recovered employee cannot have negative net; excess recovery rolls forward).
2. **Run totals:** `payroll_runs.gross_total/deduction_total/net_total` equal the sums of their payslips; enforced at commit.
3. **Reconciliation gate:** a run cannot move to APPROVED unless a `payroll_reconciliations` row exists with `signoff_status=SIGNED_OFF` and zero unexplained variance.
4. **Bank file integrity:** `bank_disbursements.total_amount = Σ payslip.net_pay (status=FINAL)` for the run, and `record_count = count(payslips with net_pay>0)`.
5. **Immutability:** when `payroll_runs.status=LOCKED`, all child payslips/lines are read-only (`is_immutable=true`); any change requires a new arrear/supplementary/off-cycle run.
6. **Effective-dating:** only one ACTIVE `employee_salary_structures` version per employee per date; overlapping effective ranges are rejected.
7. **Statutory caps:** GPF/NPS/gratuity/PT respect configured caps; computed amounts cannot exceed statutory ceilings.
8. **Loan ledger:** `Σ loan_repayments.principal_component = loans_advances.principal` at CLOSED; `outstanding_principal` is monotonically non-increasing.
9. **Tax YTD:** `deductions.cumulative_ytd` for TDS reconciles to Form-24Q quarterly totals.
10. **SoD:** `payroll_runs.approved_by ≠ created_by`; `bank_disbursements.signed_by ≠ run creator`.
11. **One structure snapshot per payslip:** `payslips.structure_version_ref` must point to the structure version effective on the cycle period.
12. **FK integrity & soft delete:** an employee with any non-CLOSED loan, active deduction, or unsettled gratuity cannot be hard-deleted; soft delete only.

### 5.7 Sample Data (2-3 rows per key entity)

**pay_components**

| component_code | name | type | category | calc_method | taxable |
|---|---|---|---|---|---|
| BASIC | Basic Pay | EARNING | BASIC | FIXED | true |
| DA | Dearness Allowance | EARNING | ALLOWANCE | PERCENT_OF_BASE | true |
| HRA | House Rent Allowance | EARNING | ALLOWANCE | SLAB | true |
| GPF | General Provident Fund | DEDUCTION | STATUTORY_DEDUCTION | PERCENT_OF_BASE | false |
| TDS | Income Tax (TDS) | DEDUCTION | STATUTORY_DEDUCTION | FORMULA | false |

**rate_tables**

| table_type | key | value_numeric | financial_year | effective_from |
|---|---|---|---|---|
| DA_RATE | ALL | 50.0000 | FY2026_27 | 2026-01-01 |
| HRA_CLASS | X | 27.0000 | FY2026_27 | 2026-01-01 |
| PT_SLAB | 15001-99999 | 200.00 | FY2026_27 | 2026-04-01 |

**employee_salary_structures**

| structure_id | employee_id | version | basic_pay | city_class | reason | status | effective_from |
|---|---|---|---|---|---|---|---|
| 7c1…a1 | e-1001 | 3 | 78800.00 | X | PROMOTION | ACTIVE | 2026-04-01 |
| 9b2…c4 | e-1002 | 1 | 44900.00 | Y | INITIAL | ACTIVE | 2024-07-01 |

**payroll_cycles**

| cycle_code | run_type | period_month | period_year | pay_date | status |
|---|---|---|---|---|---|
| 2026-06-REGULAR | REGULAR | 6 | 2026 | 2026-06-30 | LOCKED |
| 2026-06-ARREARS | ARREARS | 6 | 2026 | 2026-07-05 | OPEN |

**payslips**

| payslip_id | employee_id | gross_earnings | total_deductions | net_pay | paid_days | lwp_days | status |
|---|---|---|---|---|---|---|---|
| ps-5001 | e-1001 | 145260.00 | 38420.00 | 106840.00 | 30 | 0 | PUBLISHED |
| ps-5002 | e-1002 | 79830.00 | 14560.00 | 65270.00 | 28 | 2 | PUBLISHED |

**payslip_lines** (for ps-5001)

| component_code | type | amount | taxable_amount |
|---|---|---|---|
| BASIC | EARNING | 78800.00 | 78800.00 |
| DA | EARNING | 39400.00 | 39400.00 |
| HRA | EARNING | 21276.00 | 21276.00 |
| GPF | DEDUCTION | 9456.00 | — |
| TDS | DEDUCTION | 24500.00 | — |

**loans_advances**

| loan_no | employee_id | loan_type | principal | installments_total | installment_amount | outstanding_principal | status |
|---|---|---|---|---|---|---|---|
| LN-2026-0007 | e-1001 | HBA | 1500000.00 | 180 | 9500.00 | 1339000.00 | RECOVERING |
| LN-2026-0042 | e-1002 | FESTIVAL_ADVANCE | 15000.00 | 10 | 1500.00 | 6000.00 | RECOVERING |

**deductions**

| employee_id | deduction_type | mode | amount_or_rate | cumulative_ytd | status |
|---|---|---|---|---|---|
| e-1001 | NPS | PERCENT | 10.0000 | 88560.00 | ACTIVE |
| e-1002 | GPF | PERCENT | 12.0000 | 32328.00 | ACTIVE |

**benefits / benefit_claims**

| claim_no | employee_id | claim_type | claimed_amount | approved_amount | status |
|---|---|---|---|---|---|
| CLM-2026-0311 | e-1001 | LTC_LTA | 48000.00 | 45000.00 | APPROVED |
| CLM-2026-0312 | e-1002 | MEDICAL | 12500.00 | 12500.00 | PAID |

---

## 6. Functional Requirements

> Each FR includes: ID, Module, Primary Role(s), User Story, Description, Acceptance Criteria, Business Rules, Data Model References, API References, UI Behavior Notes, Edge Cases, and a Low-Level Design table (Components / Backend Flow / Data Operations / Validation / Authorization / State Changes & Side Effects / Failure Handling / Dependencies / Test Guidance).

---

### FR-M10-01 — Pay Component & Rules Engine Configuration

- **Module:** M10-F01 / M10-F02
- **Primary Role(s):** System Administrator (config), Payroll Manager (approve)
- **User Story:** As a System Administrator, I want to define earning/deduction components and their versioned computation rules so that payroll math is configurable without code changes and fully auditable.
- **Description:** Maintain the `pay_components` catalog and `pay_rules` (formula DSL, calc method, eligibility, rounding, computation order, effective dates). Rules are versioned; activating a new version retires the prior version's effective range. A safe expression evaluator (whitelisted operators/functions, references to component codes and employee attributes) computes values; arbitrary code execution is prohibited.
- **Acceptance Criteria:**
  - AC1: A component can be created with type, category, calc method, taxable flag, and display order.
  - AC2: A rule version with an invalid expression (unknown reference, unbalanced parentheses, disallowed token) is rejected with a precise error and line/column.
  - AC3: Activating a rule version sets `effective_to` on the prior ACTIVE version to one day before the new `effective_from`; no two ACTIVE versions overlap.
  - AC4: Computation order is unique within an effective window; duplicate orders rejected.
  - AC5: All changes require Payroll Manager approval (maker-checker) before becoming ACTIVE.
- **Business Rules:**
  - BR1: A component referenced by any active employee structure cannot be deleted; it can only be deactivated.
  - BR2: DEDUCTION components flagged `is_statutory=true` cannot be overridden to a lower amount than the statutory computation by a Payroll Officer.
  - BR3: Formula references are resolved in `computation_order`; forward references to not-yet-computed components are rejected.
- **Data Model References:**

| Entity | Use |
|---|---|
| `pay_components` | CRUD component catalog |
| `pay_rules` | versioned rule definitions |
| `rate_tables` | referenced by SLAB/PERCENT rules |
| `audit_log` | record every config change |

- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/components` | create component |
| POST | `/api/v1/payroll/components/{id}/rules` | add rule version |
| POST | `/api/v1/payroll/rules/{id}:activate` | activate (checker) |
| GET | `/api/v1/payroll/components` | list (paginated) |

- **UI Behavior Notes:** Rule editor with live syntax validation, a "test against sample employee" panel showing the evaluated trace, and a version timeline. Activation button disabled for makers.
- **Edge Cases:** Circular references between component formulae; activating a rule whose `rate_table` has no effective row for the period; deactivating a component mid-financial-year.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RuleConfigController`, `ExpressionParser`, `RuleVersionService`, `ComponentRepository` |
| Backend Flow | Validate payload → parse expression to AST (whitelist) → static-check references & order → persist DRAFT → on activate, run SoD + checker check, close prior version, set ACTIVE in a transaction |
| Data Operations | INSERT component/rule; UPDATE prior rule `effective_to`; transactional |
| Validation | Whitelisted token set; reference existence; order uniqueness; effective-range non-overlap |
| Authorization | SysAdmin create; Payroll Manager activate; Auditor read |
| State Changes & Side Effects | rule.status DRAFT→ACTIVE; prior ACTIVE→RETIRED; audit_log entry; cache invalidation of rule set |
| Failure Handling | Parse error → 400 `RULE_EXPRESSION_INVALID`; overlap → 409 `RULE_VERSION_OVERLAP` |
| Dependencies | rate_tables (FR-02), workflow engine |
| Test Guidance | Unit-test parser with malicious/edge expressions; verify non-overlap invariant; SoD enforcement test |

---

### FR-M10-02 — Pay Scale / Matrix & Statutory Rate Table Management

- **Module:** M10-F01
- **Primary Role(s):** System Administrator, Payroll Manager
- **User Story:** As an Administrator, I want to maintain pay-matrix levels and effective-dated statutory rate tables (DA%, HRA class %, PT slabs, tax slabs, GPF/NPS rates) so that revisions issued by government notifications apply automatically from their effective date.
- **Description:** CRUD for `pay_matrix_levels` and `rate_tables`, all effective-dated. A DA revision is entered once and automatically applies to every eligible employee from `effective_from` (including retrospectively, triggering arrears via FR-10).
- **Acceptance Criteria:**
  - AC1: A new DA rate with a past `effective_from` is accepted and flagged as "retrospective — will generate arrears".
  - AC2: Two overlapping effective rows for the same `table_type/key/regime/FY` are rejected.
  - AC3: Tax slabs require a `regime` and `financial_year`; PT slabs require slab_min/slab_max.
  - AC4: Changes are versioned and audited; no in-place edit of a row already used in a LOCKED run (a new effective row is created instead).
- **Business Rules:**
  - BR1: HRA class % keyed by `city_class` (X/Y/Z).
  - BR2: A rate row used by any locked payslip is immutable; corrections are new effective rows.
  - BR3: Effective dates align to the 1st of a month unless an explicit mid-month proration policy is enabled.
- **Data Model References:** `rate_tables`, `pay_matrix_levels`, `pay_scales` (ref), `arrears` (downstream), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/rate-tables` | add effective-dated rate |
| GET | `/api/v1/payroll/rate-tables?type=DA_RATE&date=` | resolve rate as-of |
| POST | `/api/v1/payroll/pay-matrix` | add matrix level/cell |

- **UI Behavior Notes:** Effective-dated grid with "as-of date" selector; retrospective-entry warning banner; side-by-side compare of old vs new rate.
- **Edge Cases:** DA increase notified after the cycle is locked → arrears in next cycle; pay-matrix cell deletion when referenced by a structure; mid-month DA effective date.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RateTableController`, `EffectiveDateResolver`, `PayMatrixService` |
| Backend Flow | Validate effective range → check non-overlap → persist → if `effective_from` < current open cycle start, enqueue arrears candidate scan |
| Data Operations | INSERT rate row; never UPDATE locked-referenced rows |
| Validation | Non-overlap; required fields by table_type; immutability check against locked runs |
| Authorization | SysAdmin write; Payroll Mgr approve; Auditor read |
| State Changes & Side Effects | New rate active; arrears scan job enqueued; audit_log |
| Failure Handling | Overlap → 409 `RATE_OVERLAP`; locked-ref edit → 409 `RATE_LOCKED_IMMUTABLE` |
| Dependencies | FR-10 arrears engine |
| Test Guidance | Resolver returns correct rate for boundary dates; retrospective entry triggers arrears candidate |

---

### FR-M10-03 — Employee Salary Structure Assignment & Versioning

- **Module:** M10-F03
- **Primary Role(s):** Payroll Officer (maker), Payroll Manager (checker), HR Admin (request)
- **User Story:** As a Payroll Officer, I want to assign and version each employee's salary structure (pay level, city class, component set, overrides) so that pay is derived correctly and every change is effective-dated and auditable.
- **Description:** Bind an employee to a `pay_matrix_level` and component set, producing `employee_salary_structures` + `employee_salary_components`. Each change (increment, revision, override) creates a new version; the prior version is SUPERSEDED. Overrides require a reason.
- **Acceptance Criteria:**
  - AC1: Creating a new version supersedes the prior ACTIVE version with contiguous effective ranges (no gap/overlap).
  - AC2: A FIXED_OVERRIDE component requires `override_amount` and `override_reason`.
  - AC3: Structure changes route through maker-checker before becoming ACTIVE.
  - AC4: A change with `effective_from` in a LOCKED period is rejected — it must be handled as an arrear (FR-10).
- **Business Rules:** BR1: Exactly one ACTIVE version per employee at any date. BR2: City class drives HRA. BR3: Statutory deduction components are auto-attached based on employee scheme (GPF vs NPS per joining date).
- **Data Model References:** `employee_salary_structures`, `employee_salary_components`, `pay_matrix_levels`, `pay_components`, `deductions`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/employees/{id}/structures` | create new version |
| GET | `/api/v1/payroll/employees/{id}/structures` | version history |
| POST | `/api/v1/payroll/structures/{id}:approve` | checker approve |

- **UI Behavior Notes:** Structure builder showing auto-resolved components vs overrides; effective-date timeline; diff of versions; HRA auto-updates when city class changes.
- **Edge Cases:** Employee on GPF vs NPS based on DOJ cutoff; mid-month transfer changing city class; override exceeding sanity bounds.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StructureController`, `StructureVersionService`, `SchemeResolver` |
| Backend Flow | Build component set from rules + scheme → apply overrides → validate → create version → close prior → maker-checker → ACTIVE |
| Data Operations | INSERT structure + components; UPDATE prior `effective_to`/status; transactional |
| Validation | Contiguity; override reason; locked-period guard; scheme correctness |
| Authorization | Payroll Officer create; Payroll Mgr approve |
| State Changes & Side Effects | new ACTIVE version; SR-relevant pay change may emit M12 event on finalisation; audit_log |
| Failure Handling | Locked period → 409 `STRUCTURE_PERIOD_LOCKED`; overlap → 409 `STRUCTURE_OVERLAP` |
| Dependencies | FR-01/02, M06 (pay-fixation source), FR-10 |
| Test Guidance | Version contiguity invariant; GPF/NPS scheme selection by DOJ; override audit |

---

### FR-M10-04 — Monthly Payroll Run Engine

- **Module:** M10-F04
- **Primary Role(s):** Payroll Officer (run), Payroll Manager (oversee)
- **User Story:** As a Payroll Officer, I want to execute the monthly payroll run that computes every eligible employee's pay deterministically so that gross, deductions, and net are derived from versioned rules and current inputs.
- **Description:** Orchestrates the cycle: freeze inputs at cutoff, gather structure snapshots + leave/LWP (FR-05) + statutory deductions (FR-06) + loan recoveries (FR-08) + arrears (FR-10), evaluate rules in computation order, persist `payslips` + `payslip_lines` with full `calc_trace`. Runs in a staging area first; the run is a single atomic commit. Supports DRAFT and FINAL modes.
- **Acceptance Criteria:**
  - AC1: A draft run produces per-employee results with full computation trace and a list of failures (no partial commit on failure).
  - AC2: Re-running the same cycle with unchanged inputs yields identical results (determinism).
  - AC3: Employees with computation errors are isolated; the run reports them without aborting valid computations into a quarantine list.
  - AC4: `net_pay ≥ 0`; excess recovery rolls forward and is flagged.
  - AC5: Run totals equal the sum of payslips at commit.
- **Business Rules:** BR1: Only ACTIVE employees in scope on the pay date are included (joiners/leavers prorated). BR2: A FINAL run requires the cycle to be INPUT_LOCKED. BR3: Computation uses rate tables effective on the period, not "today".
- **Data Model References:** `payroll_cycles`, `payroll_runs`, `payslips`, `payslip_lines`, `employee_salary_structures`, `deductions`, `loans_advances`, `arrears`, `rate_tables`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` | start a run (mode in body) |
| GET | `/api/v1/payroll/runs/{id}` | run status & totals |
| GET | `/api/v1/payroll/runs/{id}/exceptions` | per-employee failures |
| POST | `/api/v1/payroll/runs/{id}:cancel` | cancel draft |

- **UI Behavior Notes:** Run console with progress (computed/total), live totals, exception drill-down, and a per-employee trace viewer. FINAL run gated behind reconciliation.
- **Edge Cases:** Mid-month joiner/leaver proration; suspended employee (subsistence allowance only); employee with missing structure; division-by-zero in a formula; very large cohort batch.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RunOrchestrator`, `ComputationEngine`, `InputAggregator`, `StagingRepository`, async worker/queue |
| Backend Flow | Lock inputs → snapshot structures → aggregate inputs → for each employee compute components in order into staging → validate totals/identities → atomic commit payslips+lines+run totals |
| Data Operations | Bulk INSERT into staging; transactional move to `payslips`/`payslip_lines`; UPDATE run totals |
| Validation | Identity equations; net≥0; scope eligibility; rate resolution success |
| Authorization | Payroll Officer (own org scope); Manager read |
| State Changes & Side Effects | run.status QUEUED→RUNNING→COMPLETED/FAILED; cycle OPEN→COMPUTING→COMPUTED; audit_log; notifications on completion |
| Failure Handling | Per-employee error → quarantine + `error_summary`; engine fault → run FAILED, no commit; idempotent restart |
| Dependencies | FR-01..03, 05, 06, 08, 10 |
| Test Guidance | Determinism (same inputs→same output); proration; quarantine isolation; large-batch performance; rollback on mid-commit failure |

---

### FR-M10-05 — Attendance & Leave (LWP) Input Integration

- **Module:** M10-F05
- **Primary Role(s):** Payroll Officer, HR Admin
- **User Story:** As a Payroll Officer, I want to ingest paid/unpaid day counts and Leave-Without-Pay (LWP) from M03 so that loss-of-pay deductions are computed accurately for the period.
- **Description:** Pull approved attendance/leave for the cycle from M03 (paid days, LWP days, half-days, unauthorised absence). Compute LWP loss-of-pay (per-day rate = monthly pay / days-in-month or /30 per policy). Inputs freeze at cutoff; late changes route to arrears.
- **Acceptance Criteria:**
  - AC1: LWP days reduce pay using the configured per-day basis; the reduction shows as a payslip line.
  - AC2: Paid_days + lwp_days reconcile to the period's calendar days for full-month employees.
  - AC3: Attendance received after cutoff is excluded and queued for arrears/recovery.
  - AC4: Unauthorised absence beyond a threshold flags an exception (link to M09 if dies-non).
- **Business Rules:** BR1: Per-day basis configurable (actual days vs 30-day). BR2: Half-pay leave reduces eligible components per policy. BR3: Joiner/leaver proration uses actual paid days.
- **Data Model References:** `payslips` (paid_days/lwp_days), `payslip_lines` (LWP line), M03 attendance (read), `arrears` (late inputs).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/cycles/{id}/attendance-inputs` | fetched M03 inputs |
| POST | `/api/v1/payroll/cycles/{id}/attendance-inputs:refresh` | re-pull before cutoff |

- **UI Behavior Notes:** Attendance input grid (employee × paid/LWP/half), exceptions highlighted, "refresh from M03" with cutoff lock indicator.
- **Edge Cases:** Retrospective leave regularisation post-lock; dies-non (no pay, no service) vs LWP; overlapping leave records; leave encashment interplay.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `AttendanceInputAdapter` (M03 client), `LWPCalculator` |
| Backend Flow | Fetch approved M03 records for period → map to paid/LWP/half → compute per-day deduction → feed run engine |
| Data Operations | Stage attendance inputs keyed to cycle; write LWP lines during run |
| Validation | Day-count reconciliation; cutoff enforcement; threshold checks |
| Authorization | Payroll Officer scope |
| State Changes & Side Effects | LWP deduction line; exception flags; arrears candidate for late records |
| Failure Handling | M03 unavailable → 503 `UPSTREAM_UNAVAILABLE`, retry; mismatch → exception list |
| Dependencies | M03, FR-04, FR-10 |
| Test Guidance | Per-day basis variants; proration; post-cutoff handling; dies-non path |

---

### FR-M10-06 — Statutory Deductions Computation (GPF/PF, NPS, PT, Pension, Insurance)

- **Module:** M10-F06
- **Primary Role(s):** Payroll Officer, Payroll Manager
- **User Story:** As a Payroll Officer, I want statutory deductions computed automatically per scheme and slab so that GPF/PF, NPS, professional tax, pension contribution, and insurance are accurate and remittable.
- **Description:** For each employee, compute scheme-based deductions: GPF/CPF (% of basic, with voluntary top-up), NPS (employee 10% + employer 14% of basic+DA), professional tax (state slab), pension/insurance contributions, court attachments. YTD cumulatives maintained for reconciliation and remittance schedules (FR-17).
- **Acceptance Criteria:**
  - AC1: NPS computes both employee and employer contributions; both appear (employer as info/cost line).
  - AC2: PT applies the correct state slab for the employee's gross within the month.
  - AC3: Statutory caps are enforced (e.g., GPF subscription limits).
  - AC4: `cumulative_ytd` increments correctly and survives re-runs idempotently.
- **Business Rules:** BR1: GPF for pre-cutoff joiners; NPS for post-cutoff joiners (scheme by DOJ). BR2: Court-attachment deductions take legal priority within net-pay protection limits. BR3: Employer NPS/pension contributions are costs, not employee deductions.
- **Data Model References:** `deductions`, `rate_tables` (PT/NPS/GPF), `payslip_lines`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/employees/{id}/deductions` | list deductions |
| POST | `/api/v1/payroll/employees/{id}/deductions` | add voluntary/manual deduction |
| GET | `/api/v1/payroll/runs/{id}/statutory-summary` | run-level statutory totals |

- **UI Behavior Notes:** Deduction panel per employee showing scheme, rate, YTD; voluntary GPF top-up entry; employer-contribution info card.
- **Edge Cases:** Mid-year scheme migration; PT slab boundary; court attachment exceeding protected net; NPS for employee crossing basic+DA threshold.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `StatutoryDeductionService`, `SchemeResolver`, `SlabResolver` |
| Backend Flow | Resolve scheme → compute each statutory line via rate tables → apply caps & priority → update YTD idempotently |
| Data Operations | INSERT deduction lines; UPDATE `cumulative_ytd` (idempotent per run) |
| Validation | Cap enforcement; slab selection; net-protection on attachments |
| Authorization | Payroll Officer/Manager |
| State Changes & Side Effects | deduction lines; YTD update; cost lines for employer share |
| Failure Handling | Missing rate row → run exception `RATE_NOT_FOUND`; cap breach → clamp + flag |
| Dependencies | FR-02, FR-04, FR-17 |
| Test Guidance | Scheme-by-DOJ; PT boundaries; YTD idempotency on re-run; attachment priority |

---

### FR-M10-07 — Income-Tax (TDS) Declarations, Proofs & Computation

- **Module:** M10-F07 / M10-F06
- **Primary Role(s):** Employee (declare), Payroll Officer (verify), Payroll Manager
- **User Story:** As an Employee, I want to declare investments and choose a tax regime, upload proofs, and see my projected tax so that TDS is deducted accurately across the financial year.
- **Description:** Employees submit `tax_declarations` (regime, 80C/80D/HRA/home-loan items), upload proofs (M13), and the system projects annual taxable income and tax, spreading TDS across remaining months. Payroll verifies proofs after the proof cutoff; unverified declarations revert to a conservative computation.
- **Acceptance Criteria:**
  - AC1: Switching regime recomputes projected tax and per-month TDS.
  - AC2: After proof cutoff, unverified declared deductions are excluded and TDS recomputed.
  - AC3: Declaration locks after FY proof cutoff (`lock_after_cutoff`).
  - AC4: Projected tax updates when salary/arrears change.
- **Business Rules:** BR1: New regime ignores most exemptions per statute. BR2: TDS = (projected annual tax − YTD TDS) / remaining months. BR3: Proof verification is maker-checker; partial verification reduces allowed amount.
- **Data Model References:** `tax_declarations`, `documents` (proofs), `deductions` (TDS), `rate_tables` (TAX_SLAB), `payslip_lines`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/tax-declarations` | submit/update (self) |
| POST | `/api/v1/payroll/tax-declarations/{id}/proofs` | upload proof |
| POST | `/api/v1/payroll/tax-declarations/{id}:verify` | verify (Payroll) |
| GET | `/api/v1/payroll/tax-declarations/{id}/projection` | projected tax |

- **UI Behavior Notes:** Regime comparison wizard (old vs new side-by-side), declaration form with section limits, proof upload, projected-tax breakdown, cutoff countdown.
- **Edge Cases:** Mid-year regime change restrictions; proof partially accepted; arrears spiking taxable income; employee leaving mid-year (final TDS settlement).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `TaxDeclarationController`, `TaxProjectionEngine`, `RegimeComparator`, document client (M13) |
| Backend Flow | Capture declaration → project annual income (incl. arrears) → apply regime rules & slabs → derive monthly TDS → on verify, finalise allowed amounts |
| Data Operations | INSERT/UPDATE declaration; link proof doc ids; update TDS deduction |
| Validation | Section caps; regime rules; cutoff lock; proof presence |
| Authorization | Employee self; Payroll verify; Auditor read |
| State Changes & Side Effects | verification_status transitions; TDS recompute; notification on verify/reject |
| Failure Handling | Slab missing → `TAX_SLAB_NOT_FOUND`; over-declaration → clamp to cap |
| Dependencies | M13, FR-02, FR-17 (Form-16/24Q) |
| Test Guidance | Regime switch math; cutoff exclusion; projection with arrears; leaver settlement |

---

### FR-M10-08 — Loans & Advances Management

- **Module:** M10-F08
- **Primary Role(s):** Employee (request), DDO/Dept Head (sanction), Payroll Officer (schedule/recover)
- **User Story:** As an Employee, I want to apply for loans/advances and have installments recovered automatically through payroll so that repayment is accurate, with interest, and I can foreclose when I choose.
- **Description:** Lifecycle for HBA/vehicle/computer/festival/GPF/salary advances: request → sanction → disburse → installment recovery (principal + interest) via payroll → foreclosure/closure. Maintains `loans_advances` + `loan_repayments` ledger; supports reducing/simple interest, holds (no-recovery months), and foreclosure with interest settlement.
- **Acceptance Criteria:**
  - AC1: On each run, the scheduled installment is recovered and the ledger updated (outstanding decreases).
  - AC2: Final installment closes the loan; `Σ principal_components = principal`.
  - AC3: Foreclosure computes outstanding principal + accrued interest and settles in one entry.
  - AC4: If net pay is insufficient, recovery is partial/skipped per policy and flagged.
- **Business Rules:** BR1: Total deductions cannot push net below protected minimum; loan recovery yields after statutory. BR2: Interest method fixed at sanction. BR3: A loan on hold skips recovery without penalty unless policy charges interest.
- **Data Model References:** `loans_advances`, `loan_repayments`, `payslip_lines` (recovery line), `audit_log`, workflow (sanction).
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/loans` | apply |
| POST | `/api/v1/payroll/loans/{id}:sanction` | DDO sanction |
| POST | `/api/v1/payroll/loans/{id}:foreclose` | foreclosure |
| GET | `/api/v1/payroll/loans/{id}/schedule` | amortization schedule |

- **UI Behavior Notes:** Loan application wizard with eligibility check; amortization preview; employee self-service statement; foreclosure calculator.
- **Edge Cases:** Insufficient net pay; loan during LWP months; transfer mid-recovery; outstanding loan at retirement (settle from terminal benefits via M11).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `LoanController`, `AmortizationService`, `RecoveryScheduler` |
| Backend Flow | Sanction → generate schedule → each run pull due installment → compute principal/interest split → recover (subject to net protection) → update ledger |
| Data Operations | INSERT loan + schedule; per-run INSERT loan_repayment; UPDATE outstanding |
| Validation | Net-protection; schedule integrity; foreclosure math |
| Authorization | Employee request; DDO sanction; Payroll recover |
| State Changes & Side Effects | status REQUESTED→…→CLOSED; recovery line on payslip; notification on closure |
| Failure Handling | Insufficient net → partial/skip flag `RECOVERY_INSUFFICIENT_NET`; ledger never goes negative |
| Dependencies | FR-04, M11 (terminal settlement) |
| Test Guidance | Amortization correctness (simple/reducing); foreclosure; insufficient-net skip; closure invariant |

---

### FR-M10-09 — Recoveries & Ad-hoc Adjustments (incl. Disciplinary, Overpayment)

- **Module:** M10-F09
- **Primary Role(s):** Payroll Officer, Payroll Manager, (source) Disciplinary Authority (M09)
- **User Story:** As a Payroll Officer, I want to apply recoveries ordered by disciplinary authorities and recover prior overpayments so that mandated deductions are executed accurately and traceably.
- **Description:** Ingest recovery orders from M09 (fine, recovery of loss, pay reduction) and internally-detected overpayments; schedule recovery across one or more cycles within net-protection limits; track recovered-to-date against ordered amount.
- **Acceptance Criteria:**
  - AC1: A disciplinary recovery order creates a scheduled recovery with a defined total and per-cycle amount.
  - AC2: Recovery never exceeds the ordered total; over-recovery is impossible.
  - AC3: Recovery respects net-pay protection; spillover extends the schedule.
  - AC4: Recovered-to-date is reported and closes when the order is satisfied.
- **Business Rules:** BR1: Disciplinary recoveries are authority-mandated and cannot be waived by Payroll. BR2: Overpayment recovery requires documented justification and employee notification. BR3: Recovery priority order: statutory → court attachment → disciplinary → overpayment → loans → voluntary.
- **Data Model References:** `deductions` (RECOVERY), `payslip_lines`, M09 order (read), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/recoveries` | create recovery (from order/overpayment) |
| GET | `/api/v1/payroll/recoveries/{id}` | status & recovered-to-date |
| POST | `/api/v1/payroll/recoveries/{id}:hold` | pause (justified) |

- **UI Behavior Notes:** Recovery tracker showing ordered vs recovered vs remaining; source-order link; priority indicator.
- **Edge Cases:** Multiple concurrent recoveries competing for limited net; employee retires before full recovery (transfer to M11); appeal in M09 reverses an order mid-recovery (refund).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `RecoveryService`, `PriorityResolver`, M09 client |
| Backend Flow | Receive order → create recovery schedule → each run apply within net protection by priority → track recovered-to-date → close when satisfied |
| Data Operations | INSERT recovery; per-run UPDATE recovered amount; payslip line |
| Validation | Cannot exceed ordered total; priority ordering; net protection |
| Authorization | Payroll Officer/Manager; reversal needs Manager + source confirmation |
| State Changes & Side Effects | recovery active→closed; refund entry on appeal reversal; audit_log |
| Failure Handling | Over-recovery prevented; conflict among recoveries resolved by priority |
| Dependencies | M09, FR-04, M11 |
| Test Guidance | Priority ordering; over-recovery guard; appeal reversal refund; retirement handoff |

---

### FR-M10-10 — Arrears & Retrospective Revisions Engine

- **Module:** M10-F10
- **Primary Role(s):** Payroll Officer, Payroll Manager
- **User Story:** As a Payroll Officer, I want the system to compute arrears for back-dated DA/increment/promotion/pay-fixation so that employees receive the exact difference owed, with statutory deductions re-derived on the differential.
- **Description:** When a retrospective change occurs (DA revision in FR-02, pay-fixation from M06, correction), the engine re-computes pay for each affected past month using then-effective rules, derives the per-component per-month delta vs what was actually paid, recomputes statutory deductions (incl. TDS) on the differential, and produces an `arrears` record paid through an ARREARS cycle.
- **Acceptance Criteria:**
  - AC1: For a back-dated DA increase, arrears = Σ over affected months of (new − old) per eligible component, net of recomputed deductions.
  - AC2: The arrear references the source (notification/M06 order) and shows a month-wise break-up.
  - AC3: Arrears recompute TDS impact and flow into Form-16 (FR-17).
  - AC4: Arrears for a LOCKED period never mutate the original payslip — they are additive.
- **Business Rules:** BR1: Arrears use rules effective in each historical month, not current rules. BR2: Negative arrears (recovery) are possible (e.g., downward revision) and handled via recovery. BR3: Promotion arrears link to M06 fixation order.
- **Data Model References:** `arrears`, `payslips`/`payslip_lines` (original, read), `rate_tables` (historical), `payroll_cycles` (ARREARS), `deductions`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/arrears:compute` | compute for trigger (DA/fixation) |
| GET | `/api/v1/payroll/arrears/{id}` | arrear breakup |
| POST | `/api/v1/payroll/arrears/{id}:approve` | approve for payout |

- **UI Behavior Notes:** Arrears computation screen with month-wise grid (old vs new vs delta), source reference, net arrear after deduction recompute, and approve-to-cycle action.
- **Edge Cases:** Overlapping retrospective changes (DA + promotion in same window); employee separated during arrear window; arrears crossing financial years (tax relief u/s 89); downward revision causing recovery.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ArrearsEngine`, `HistoricalRecomputer`, `RateTableResolver` |
| Backend Flow | Identify affected employees/months → recompute each month with historical rules → diff vs actual paid → recompute statutory delta → persist arrear → route to ARREARS cycle |
| Data Operations | INSERT arrears with `component_breakup`; link to payout cycle; no mutation of original payslips |
| Validation | Historical rule resolution; delta correctness; period bounds; immutability of source payslips |
| Authorization | Payroll Officer compute; Manager approve |
| State Changes & Side Effects | arrear COMPUTED→APPROVED→PAID; TDS YTD adjusted; M12 pay event if pay-scale changed |
| Failure Handling | Missing historical rate → exception; overlap → ordered application |
| Dependencies | FR-02, FR-06, FR-17, M06, M12 |
| Test Guidance | DA back-dating math; promotion fixation arrears; cross-FY tax; downward revision recovery |

---

### FR-M10-11 — Supplementary & Off-Cycle Payroll

- **Module:** M10-F11
- **Primary Role(s):** Payroll Officer, DDO (sanction), Payroll Manager (approve)
- **User Story:** As a Payroll Officer, I want to process supplementary and off-cycle payments so that missed payments, new-joiner first pay, bonuses, ex-gratia, and urgent corrections are paid outside the regular cycle with the same controls.
- **Description:** Create SUPPLEMENTARY/OFF_CYCLE/BONUS cycles for a defined employee set and component set, compute with the same engine and controls (reconciliation, approval, bank file), and feed the same statutory/YTD accumulators. Off-cycle payments require sanction.
- **Acceptance Criteria:**
  - AC1: An off-cycle payment for a defined cohort computes, reconciles, approves, and disburses independently of the regular cycle.
  - AC2: Off-cycle amounts update YTD statutory and tax accumulators.
  - AC3: Off-cycle requires DDO sanction and Manager approval (SoD enforced).
  - AC4: A duplicate off-cycle payment for the same purpose/employee is prevented (idempotency).
- **Business Rules:** BR1: Bonus/ex-gratia taxability applied per rules. BR2: Off-cycle cannot pay a component already paid for the same period unless flagged correction. BR3: Same reconciliation and locking gates apply.
- **Data Model References:** `payroll_cycles` (OFF_CYCLE/SUPPLEMENTARY), `payroll_runs`, `payslips`, `bank_disbursements`, `deductions`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles` | create supplementary/off-cycle |
| POST | `/api/v1/payroll/cycles/{id}/runs` | run it |
| POST | `/api/v1/payroll/cycles/{id}:sanction` | DDO sanction |

- **UI Behavior Notes:** Off-cycle wizard: select purpose, cohort, components, amounts; preview; sanction & approve workflow; reuse the run console.
- **Edge Cases:** Off-cycle overlapping the regular run; bonus spanning multiple FYs; new joiner first-pay before structure fully approved.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `OffCycleService`, reuse `RunOrchestrator`/`ComputationEngine` |
| Backend Flow | Create off-cycle → sanction → compute cohort → reconcile → approve → disburse → update YTD |
| Data Operations | Same as FR-04 with run_type filter; idempotency key on creation |
| Validation | Sanction present; duplicate-payment guard; component-period guard |
| Authorization | DDO sanction; Payroll Officer run; Manager approve |
| State Changes & Side Effects | cycle lifecycle; YTD update; M12 events as applicable |
| Failure Handling | Duplicate → 409 `DUPLICATE_OFFCYCLE`; missing sanction → 403 |
| Dependencies | FR-04, FR-14, FR-16 |
| Test Guidance | YTD continuity; duplicate prevention; sanction SoD; multi-FY bonus |

---

### FR-M10-12 — Benefits Administration (Medical, LTC/LTA, Gratuity, Insurance, Reimbursements)

- **Module:** M10-F12
- **Primary Role(s):** Employee (claim), Reporting Manager (recommend), Payroll Officer/Manager (verify/pay)
- **User Story:** As an Employee, I want to enrol in and claim benefits (medical, LTC/LTA, reimbursements) and have gratuity/insurance administered so that I receive entitlements correctly and they reflect in pay or off-cycle payout.
- **Description:** Manage benefit enrolment (`benefits`) and claims (`benefit_claims`) with workflow approval; accrue gratuity per period (`gratuity_accruals`); administer group insurance and reimbursement plans. Approved claims pay via payroll or off-cycle; LTC respects block-year rules.
- **Acceptance Criteria:**
  - AC1: A claim follows submit → recommend → approve → pay; approved amount ≤ entitlement/cap.
  - AC2: LTC claim validates block-year eligibility and prior utilisation.
  - AC3: Gratuity accrues per period using last-drawn basic+DA and years of service, capped at statutory ceiling.
  - AC4: Approved reimbursements appear on payslip (taxable per rules) or off-cycle payout.
- **Business Rules:** BR1: Medical/LTC reimbursement taxability per statute. BR2: Gratuity payout settled by M11 at separation; M10 maintains accrual. BR3: Claims require proofs (M13); duplicate proof reuse blocked.
- **Data Model References:** `benefits`, `benefit_claims`, `gratuity_accruals`, `documents`, `payslip_lines`/off-cycle, workflow.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/benefit-claims` | submit claim |
| POST | `/api/v1/payroll/benefit-claims/{id}:approve` | approve |
| GET | `/api/v1/payroll/employees/{id}/gratuity-accrual` | accrual as-of |

- **UI Behavior Notes:** Benefits dashboard (entitlements, balances, block-year status); claim form with proof upload; gratuity accrual statement.
- **Edge Cases:** LTC block-year carry-forward; medical claim exceeding cap; gratuity for employee with break in service; insurance premium recovery vs employer-paid.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BenefitController`, `ClaimWorkflowService`, `GratuityAccrualJob` |
| Backend Flow | Submit claim → workflow (recommend/approve) → cap check → schedule payout (payroll/off-cycle); periodic gratuity accrual job |
| Data Operations | INSERT claim; UPDATE approved_amount/status; INSERT gratuity accrual periodically |
| Validation | Entitlement/cap; block-year; proof presence/uniqueness |
| Authorization | Employee submit; Manager recommend; Payroll approve |
| State Changes & Side Effects | claim status flow; payslip/off-cycle line; gratuity ledger; notifications |
| Failure Handling | Over-cap → clamp + reason; duplicate proof → 409 |
| Dependencies | M13, FR-04/11, M11 (gratuity settlement) |
| Test Guidance | Block-year logic; cap enforcement; accrual math; payout routing |

---

### FR-M10-13 — Payslip Generation & Self-Service Access

- **Module:** M10-F13
- **Primary Role(s):** Payroll Officer (generate/publish), Employee (view)
- **User Story:** As an Employee, I want to view and download my monthly payslip with a full earnings/deductions break-up so that I understand my pay, and as Payroll I want to publish payslips securely once the run is locked.
- **Description:** Render `payslips` into a formatted document (PDF) stored in M13, with employer/employee details, component break-up, YTD figures, leave/LWP, loan/recovery status, and tax summary. Published only after run lock; immutable thereafter. Self-service portal access with masking and audit.
- **Acceptance Criteria:**
  - AC1: Payslip totals match `payslips`/`payslip_lines` exactly.
  - AC2: Payslips publish only when the run is LOCKED.
  - AC3: Employees see only their own payslips; managers see direct reports per scope.
  - AC4: A published payslip is immutable; a correction generates a new payslip via supplementary/arrears.
- **Business Rules:** BR1: Bank account/PAN masked by default. BR2: Payslip includes YTD and tax-projection summary. BR3: Download access is logged.
- **Data Model References:** `payslips`, `payslip_lines`, `documents` (PDF), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/payslips:publish` | publish (post-lock) |
| GET | `/api/v1/payroll/employees/{id}/payslips` | list own payslips |
| GET | `/api/v1/payroll/payslips/{id}/document` | download PDF |

- **UI Behavior Notes:** Payslip viewer with collapsible earnings/deductions, YTD tab, download; manager view scoped to reports; clear "provisional vs final" badge.
- **Edge Cases:** Re-publish after arrears (versioned payslip); employee separated but needs historical payslips; large-batch PDF generation.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `PayslipRenderer`, `DocumentClient` (M13), `PayslipController` |
| Backend Flow | On publish, validate run LOCKED → render PDF per employee → store in M13 → set status PUBLISHED → notify employees |
| Data Operations | UPDATE payslip status/document_id; bulk render queued |
| Validation | Run lock; totals match; access scope |
| Authorization | Payroll publish; Employee/Manager scoped read |
| State Changes & Side Effects | payslip FINAL→PUBLISHED; document created; notification; access logged |
| Failure Handling | Render failure → retry queue; pre-lock publish → 409 `RUN_NOT_LOCKED` |
| Dependencies | FR-04/16, M13 |
| Test Guidance | Totals parity; lock gate; scope isolation; re-publish after arrears |

---

### FR-M10-14 — Bank Disbursement File & Integration

- **Module:** M10-F14
- **Primary Role(s):** Payroll Officer (generate), Payroll Manager (sign), Finance/Treasury (receive)
- **User Story:** As a Payroll Manager, I want to generate, validate, sign, and transmit the bank disbursement file and reconcile acknowledgements so that net pay reaches every employee's account accurately and exceptions are handled.
- **Description:** Produce `bank_disbursements` file (NACH/fixed-width/ISO20022) from a LOCKED run's net pay, validate account integrity, compute checksum, sign, transmit to bank/treasury gateway, and reconcile per-line acknowledgements (success/partial/failed). Failed lines route to off-cycle re-disbursement.
- **Acceptance Criteria:**
  - AC1: File total = Σ net pay of the run; record count = payees with net>0.
  - AC2: File generation requires a LOCKED, reconciled run.
  - AC3: Signing is performed by a different principal than the run creator (SoD).
  - AC4: Acknowledgement reconciliation marks each line success/failed; failures are actionable.
- **Business Rules:** BR1: Invalid/missing bank accounts excluded and flagged before transmission. BR2: A file is transmitted once; re-transmission requires a new batch with reason. BR3: Checksum integrity verified on send and on ack.
- **Data Model References:** `bank_disbursements`, `payslips` (net), `documents` (file), `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}/disbursements` | generate file |
| POST | `/api/v1/payroll/disbursements/{id}:sign` | sign (Manager) |
| POST | `/api/v1/payroll/disbursements/{id}:transmit` | send to bank |
| POST | `/api/v1/payroll/disbursements/{id}/ack` | ingest acknowledgement |

- **UI Behavior Notes:** Disbursement console: validation results, excluded accounts, totals, sign & transmit (gated by SoD), ack reconciliation grid with retry-failed action.
- **Edge Cases:** Partial bank acknowledgement; account closed/frozen; duplicate transmission attempt; gateway timeout (idempotent resend).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `BankFileGenerator`, `FileFormatStrategy`, `DisbursementController`, `BankGatewayClient` |
| Backend Flow | Validate run locked/reconciled → build file per format → exclude invalid accounts → checksum → sign → transmit (idempotent) → ingest ack → reconcile lines |
| Data Operations | INSERT disbursement batch+lines; UPDATE ack_status/details; store file in M13 |
| Validation | Total/count equality; account validity; checksum; SoD on sign |
| Authorization | Payroll generate; Manager sign; Finance read/ack |
| State Changes & Side Effects | status DRAFT→VALIDATED→SIGNED→TRANSMITTED→RECONCILED; failed lines → off-cycle candidate; audit_log |
| Failure Handling | Gateway timeout → 503, idempotent resend; invalid accounts → 422 `INVALID_BANK_ACCOUNTS` (excluded list) |
| Dependencies | FR-04/16, FR-11 (re-disburse), M13 |
| Test Guidance | Total/count invariants; SoD on sign; idempotent transmit; partial ack handling |

---

### FR-M10-15 — Payroll Register & Reconciliation

- **Module:** M10-F15
- **Primary Role(s):** Payroll Officer, Payroll Manager (sign-off)
- **User Story:** As a Payroll Manager, I want a payroll register with control totals and variance analysis so that I can reconcile the run against the prior period and sign off before approval.
- **Description:** Generate the payroll register (per-employee and component-summarised) and `payroll_reconciliations` with gross/deduction/net control totals, prior-period comparison, variance %, and an exceptions list (new joiners, leavers, large swings, negative nets, quarantined employees). Sign-off is the gate before approval (FR-16).
- **Acceptance Criteria:**
  - AC1: Control totals equal the run totals and the sum of payslips (three-way tie-out).
  - AC2: Variance vs prior period is computed with drill-down to contributing employees/components.
  - AC3: A run cannot be approved until reconciliation is SIGNED_OFF.
  - AC4: All exceptions are listed and individually explainable/acknowledgeable.
- **Business Rules:** BR1: Variance beyond a configurable threshold requires explicit explanation before sign-off. BR2: Quarantined employees from FR-04 appear as exceptions and block sign-off until resolved or deferred. BR3: Sign-off is by a checker, not the run creator.
- **Data Model References:** `payroll_reconciliations`, `payroll_runs`, `payslips`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payroll/runs/{id}/register` | register (paginated) |
| GET | `/api/v1/payroll/runs/{id}/reconciliation` | control totals & variance |
| POST | `/api/v1/payroll/runs/{id}/reconciliation:signoff` | sign off |

- **UI Behavior Notes:** Reconciliation dashboard: three-way tie-out cards, variance waterfall, exceptions table with explain action, sign-off button gated by exception resolution.
- **Edge Cases:** Large variance from a legitimate DA arrear; first-ever run (no prior period); unresolved quarantine at sign-off.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ReconciliationService`, `VarianceAnalyzer`, `RegisterExporter` |
| Backend Flow | Compute control totals → tie-out three ways → compare prior period → classify exceptions → require explanations → sign-off |
| Data Operations | INSERT/UPDATE reconciliation; read payslips aggregates |
| Validation | Three-way tie-out equality; threshold explanation; exception closure |
| Authorization | Payroll Officer view; Manager sign-off (≠ creator) |
| State Changes & Side Effects | recon PENDING→SIGNED_OFF; unblocks approval; audit_log |
| Failure Handling | Tie-out mismatch → block + `RECON_TIEOUT_MISMATCH`; unresolved exceptions → cannot sign |
| Dependencies | FR-04, FR-16 |
| Test Guidance | Three-way tie-out; variance drill-down; sign-off SoD; quarantine blocking |

---

### FR-M10-16 — Payroll Approval, Finalisation & Locking

- **Module:** M10-F16
- **Primary Role(s):** Payroll Manager / Controller
- **User Story:** As a Payroll Manager, I want to approve and lock a reconciled payroll run so that results become immutable, payslips can publish, and disbursement can proceed — with a controlled, justified reopen path only when essential.
- **Description:** Multi-level approval moves a reconciled run to APPROVED then LOCKED. Locking freezes all payslips/lines (`is_immutable=true`) and the cycle (LOCKED). A reopen requires Manager authority + justification and is fully audited; reopen is disabled once disbursement has been transmitted (corrections then go to arrears/supplementary).
- **Acceptance Criteria:**
  - AC1: Approval requires a SIGNED_OFF reconciliation; approver ≠ run creator.
  - AC2: Locking sets all child payslips immutable and the cycle to LOCKED.
  - AC3: No write to any locked payslip/line succeeds after lock.
  - AC4: Reopen requires justification, is audited, and is blocked post-transmission.
- **Business Rules:** BR1: Maker-checker enforced at approval. BR2: Locked runs are the system of record for the period. BR3: Post-disbursement corrections only via arrears/supplementary/off-cycle.
- **Data Model References:** `payroll_runs`, `payroll_cycles`, `payslips`, `payroll_reconciliations`, `audit_log`, workflow.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/runs/{id}:approve` | approve (checker) |
| POST | `/api/v1/payroll/runs/{id}:lock` | finalise & lock |
| POST | `/api/v1/payroll/runs/{id}:reopen` | reopen (justified) |

- **UI Behavior Notes:** Approval screen with reconciliation summary, approve/lock actions gated by role + SoD, reopen dialog requiring justification, lock status badge across the cycle.
- **Edge Cases:** Attempt to lock without reconciliation; reopen after transmission; concurrent approval attempts (optimistic locking).
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `ApprovalService`, `LockService`, optimistic-lock guard |
| Backend Flow | Approve (check recon + SoD) → lock (freeze payslips, set cycle LOCKED) in a transaction → enable publish/disbursement |
| Data Operations | UPDATE run/cycle status; set payslips `is_immutable`; transactional |
| Validation | Recon signed-off; SoD; transmission state for reopen |
| Authorization | Payroll Manager only |
| State Changes & Side Effects | run APPROVED→LOCKED; cycle→LOCKED; immutability enforced; M12 pay events emitted on lock; notifications |
| Failure Handling | Unsigned recon → 409 `RECON_NOT_SIGNED`; post-transmit reopen → 409 `REOPEN_BLOCKED` |
| Dependencies | FR-15, FR-13, FR-14, M12 |
| Test Guidance | Lock immutability (writes rejected); SoD; reopen guardrails; concurrency |

---

### FR-M10-17 — Statutory Outputs: Form-16, Form-24Q & Remittance Schedules

- **Module:** M10-F17
- **Primary Role(s):** Payroll Officer (generate), Payroll Manager (certify)
- **User Story:** As a Payroll Officer, I want to generate Form-16, Form-24Q (quarterly TDS), and PT/GPF/NPS remittance schedules so that the organisation meets statutory filing and remittance obligations accurately and on time.
- **Description:** Aggregate YTD earnings, deductions, and TDS to produce employee Form-16 (Part A/B), Form-24Q quarterly returns, and remittance schedules for PT, GPF, NPS, and pension. Outputs are reconciled against payroll registers and YTD accumulators and stored in M13.
- **Acceptance Criteria:**
  - AC1: Form-16 TDS totals tie to Σ TDS payslip lines for the FY (incl. arrears).
  - AC2: Form-24Q quarterly totals reconcile to the sum of monthly TDS in that quarter.
  - AC3: Remittance schedules list per-scheme amounts with employee/employer split.
  - AC4: Outputs are certified (maker-checker) before release and stored/versioned.
- **Business Rules:** BR1: Section 89 relief reflected where arrears span FYs. BR2: PAN mandatory for Form-16; missing PAN flagged. BR3: Remittance deadlines tracked with reminders (FR Notifications).
- **Data Model References:** `deductions` (YTD), `payslips`/`payslip_lines`, `tax_declarations`, `documents`, `audit_log`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/statutory/form16:generate` | generate Form-16 (FY) |
| POST | `/api/v1/payroll/statutory/form24q:generate` | quarterly TDS return |
| GET | `/api/v1/payroll/statutory/remittances?scheme=PT&period=` | remittance schedule |

- **UI Behavior Notes:** Statutory output center: select FY/quarter, generate, reconcile-status indicator, certify & release, employee Form-16 self-service download.
- **Edge Cases:** Mid-year joiner/leaver Form-16; revised return after correction; missing PAN; cross-FY arrears relief.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | `Form16Generator`, `Form24QGenerator`, `RemittanceScheduler`, document client |
| Backend Flow | Aggregate YTD per employee/scheme → reconcile to registers → render outputs → certify → store/version in M13 |
| Data Operations | Read YTD; INSERT output document refs; no payroll mutation |
| Validation | TDS tie-out; PAN presence; period completeness |
| Authorization | Payroll generate; Manager certify; Employee self-download Form-16 |
| State Changes & Side Effects | output documents created; notifications for deadlines; audit_log |
| Failure Handling | Tie-out mismatch → block + reconcile report; missing PAN → exception list |
| Dependencies | FR-06/07/10, M13 |
| Test Guidance | Form-16 tie-out incl. arrears; 24Q quarterly reconciliation; cross-FY relief; missing-PAN handling |

---

### FR-M10-18 — Parallel / What-If Run & Cost-to-Organisation Analytics

- **Module:** M10-F04 / M10-F18
- **Primary Role(s):** Payroll Manager, Department Head, Finance
- **User Story:** As a Payroll Manager, I want to run what-if/parallel payroll scenarios and view cost-to-organisation analytics so that I can model the impact of DA revisions, increments, or restructuring and report payroll cost by org/cadre/component.
- **Description:** Execute PARALLEL_WHATIF runs that compute against proposed parameters (e.g., new DA%, increment cycle) without affecting live data, producing comparison reports vs the actual run. Provide cost analytics: total payroll cost, headcount cost, component-wise and org-wise breakdown, period trends, and employer-contribution costs (NPS/pension/gratuity accrual).
- **Acceptance Criteria:**
  - AC1: A what-if run never writes live payslips/disbursements; results are clearly labelled scenario data.
  - AC2: A comparison report shows delta (scenario vs actual) by component and org unit.
  - AC3: Cost analytics aggregate gross, deductions, net, and employer cost by org/cadre/component/period.
  - AC4: Analytics respect row-level org scope per role.
- **Business Rules:** BR1: Scenario runs are retained for audit and labelled. BR2: Employer contributions and gratuity accrual are included in true cost-to-org. BR3: Analytics read from locked runs for actuals; scenarios for projections.
- **Data Model References:** `payroll_runs` (PARALLEL_WHATIF), `payslips` (scenario, segregated), aggregates over `payslip_lines`, `gratuity_accruals`.
- **API References:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payroll/cycles/{id}/runs` (run_mode=PARALLEL_WHATIF) | scenario run |
| GET | `/api/v1/payroll/runs/{id}/comparison?vs={actualRunId}` | scenario vs actual |
| GET | `/api/v1/payroll/analytics/cost-to-org?groupBy=org_unit,component&period=` | cost analytics |

- **UI Behavior Notes:** Scenario builder with parameter overrides; comparison view (delta highlighting); analytics dashboard with drill-down charts and export; scope-aware filters.
- **Edge Cases:** Scenario over a very large cohort; comparing across structure versions; analytics across cycles with arrears.
- **LLD:**

| Aspect | Detail |
|---|---|
| Components | reuse `ComputationEngine` in scenario mode, `ComparisonService`, `CostAnalyticsService` |
| Backend Flow | Run engine with override params into segregated scenario store → compute deltas vs actual → aggregate cost analytics from locked runs |
| Data Operations | INSERT scenario payslips (flagged); read-only aggregates for analytics |
| Validation | Scenario isolation (no live write); scope enforcement |
| Authorization | Manager/Dept Head/Finance; org scope |
| State Changes & Side Effects | scenario run stored & labelled; no live side effects; audit_log |
| Failure Handling | Accidental live write prevented by mode guard; large query → async export |
| Dependencies | FR-04, FR-16, M14 (feeds dashboards) |
| Test Guidance | Scenario isolation; delta correctness; analytics aggregation incl. employer cost; scope filtering |

---

## 7. UI Requirements

| Screen | Primary role | Key elements | States covered |
|---|---|---|---|
| Payroll Run Console | Payroll Officer/Mgr | progress, live totals, exceptions, trace viewer, run/cancel | empty, computing, completed, failed, quarantine |
| Reconciliation Dashboard | Payroll Mgr | three-way tie-out, variance waterfall, exceptions, sign-off | pending, signed-off, mismatch |
| Approval & Lock | Payroll Mgr | recon summary, approve/lock, reopen-with-justification | reconciled, approved, locked, reopen-blocked |
| Salary Structure Builder | Payroll Officer | components vs overrides, effective timeline, version diff | draft, pending, active, superseded |
| Rule/Component Config | SysAdmin | rule editor w/ live validation, test panel, version timeline | draft, active, retired, invalid |
| Rate Tables | SysAdmin | effective-dated grid, as-of selector, retrospective warning | current, future, retrospective |
| Tax Declaration (self) | Employee | regime comparison wizard, declaration form, proof upload, projection | draft, submitted, verified, rejected, locked |
| Loans & Advances | Employee/DDO | application wizard, amortization preview, statement, foreclosure | requested, sanctioned, recovering, closed |
| Benefits & Claims | Employee/Mgr | entitlements, claim form, proof upload, gratuity accrual | eligible, submitted, approved, paid, rejected |
| Payslip Viewer (self) | Employee | earnings/deductions break-up, YTD, download | provisional, published, none |
| Bank Disbursement Console | Payroll Mgr/Finance | validation, excluded accounts, sign, transmit, ack grid | draft, signed, transmitted, partial-ack, failed |
| Statutory Output Center | Payroll Officer/Mgr | Form-16/24Q/remittance generation, reconcile, certify | pending, generated, certified, mismatch |
| Cost-to-Org Analytics | Mgr/Finance | charts by org/cadre/component, scenario comparison, export | empty, loaded, scope-restricted |

**Global UI requirements:** WCAG 2.1 AA; keyboard navigation & visible focus; dark mode; responsive/mobile-first for self-service (payslip, declaration, claims); money masked by default with reveal+audit; all amounts formatted per locale; empty/loading/error/success/permission states for every screen; no skeleton placeholders in production — real fields, data, API calls, and states.

---

## 8. API & Integration

### 8.1 Conventions

REST under `/api/v1`; JSON; JWT bearer + RBAC + org-unit scoping; cursor or page/limit pagination (max 100); `Idempotency-Key` on mutating run/disbursement endpoints; all timestamps UTC ISO-8601.

### 8.2 Canonical Error Envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "city_class is required", "field": "city_class" }, "requestId": "req_8f2c..." }
```

### 8.3 Error-Code Catalog (shared + M10-specific)

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Malformed/invalid input |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD denied |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | State conflict |
| RATE_LIMITED | 429 | Throttled |
| INTERNAL_ERROR | 500 | Unhandled |
| UPSTREAM_UNAVAILABLE | 503 | M03/M13/bank gateway down |
| RULE_EXPRESSION_INVALID | 400 | Bad formula |
| RULE_VERSION_OVERLAP | 409 | Overlapping rule versions |
| RATE_OVERLAP | 409 | Overlapping rate rows |
| RATE_LOCKED_IMMUTABLE | 409 | Edit of locked-referenced rate |
| RATE_NOT_FOUND | 422 | No effective rate for period |
| STRUCTURE_OVERLAP | 409 | Overlapping structure versions |
| STRUCTURE_PERIOD_LOCKED | 409 | Change in locked period |
| TAX_SLAB_NOT_FOUND | 422 | No tax slab for FY/regime |
| RECOVERY_INSUFFICIENT_NET | 409 | Net too low for recovery |
| DUPLICATE_OFFCYCLE | 409 | Duplicate off-cycle payment |
| RECON_TIEOUT_MISMATCH | 409 | Control totals do not tie out |
| RECON_NOT_SIGNED | 409 | Approval before reconciliation |
| RUN_NOT_LOCKED | 409 | Publish/disburse before lock |
| REOPEN_BLOCKED | 409 | Reopen after transmission |
| INVALID_BANK_ACCOUNTS | 422 | Invalid/missing payee accounts |
| RUN_IMMUTABLE | 409 | Write to locked run/payslip |

### 8.4 JSON Examples

**Start a payroll run**

```http
POST /api/v1/payroll/cycles/{cycleId}/runs
Idempotency-Key: 0b4e-...
{ "run_mode": "FINAL", "scope_filter": { "org_unit_id": "ou-12" } }
```
```json
{ "run_id": "run-9001", "run_no": "RUN-2026-06-001", "status": "QUEUED" }
```

**Reconciliation tie-out (response)**

```json
{ "run_id": "run-9001", "gross_control": 18450000.00, "deduction_control": 4820000.00,
  "net_control": 13630000.00, "variance_pct": 1.42, "signoff_status": "PENDING",
  "exceptions": [ { "employee_id": "e-1002", "type": "NEW_JOINER" } ] }
```

**Bank file validation error**

```json
{ "error": { "code": "INVALID_BANK_ACCOUNTS", "message": "3 payees have invalid accounts",
  "field": "payees" }, "requestId": "req_2a91" }
```

### 8.5 Integration Points

| System | Direction | Purpose |
|---|---|---|
| M01 Employee | in | employee master, scheme attributes |
| M03 Attendance/Leave | in | paid/LWP days |
| M06 Promotion/Pay-fixation | in | fixation orders → structure & arrears |
| M09 Disciplinary | in | recovery orders |
| M11 Pension | out | last-pay-drawn, contribution history, gratuity accrual |
| M12 Service Register | out | pay/scale-change events (append) |
| M13 Documents | in/out | store payslips/Form-16/bank files |
| M14 Dashboards | out | payroll cost & KPIs |
| Bank/Treasury gateway | out/in | disbursement file + acknowledgement |
| Tax portal (TRACES) | out | Form-24Q/Form-16 file formats |

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance (interactive) | P95 < 500ms for reads/config; payslip view < 1s |
| Performance (batch) | Compute 50,000 employees within 30 min; bank file generation < 5 min |
| Determinism | Identical inputs produce identical outputs; reproducible runs |
| Availability | 99.9% uptime; batch windows scheduled off-peak |
| Scalability | Horizontal scaling of compute workers; partition by org unit/cohort |
| Integrity | ACID per run; three-way tie-out; net≥0; immutable locked runs |
| Security | OIDC/SSO+MFA; RBAC+row-level scope; SoD; field-level encryption for bank/PAN/salary; masked display with audited reveal |
| Privacy | DPDP Act 2023; PII minimisation; statutory retention; right-to-access via self-service |
| Auditability | Every state change in `audit_log`; immutable; calc_trace retained |
| Recoverability | RPO ≤ 15min, RTO ≤ 4h; run staging allows safe restart |
| Accessibility | WCAG 2.1 AA |
| Observability | Per-run metrics, exception dashboards, disbursement ack monitoring, alerting on SLA breach |
| Compliance | Statutory deadline tracking for TDS/PT/GPF/NPS remittance and returns |

---

## 10. Workflow & State Diagrams (State Tables)

### 10.1 Payroll Cycle / Run

| Current | Event | Next | Guard |
|---|---|---|---|
| OPEN | freeze inputs | INPUT_LOCKED | after cutoff |
| INPUT_LOCKED | start FINAL run | COMPUTING | Payroll Officer |
| COMPUTING | compute success | COMPUTED | totals tie |
| COMPUTING | engine fault | OPEN (run FAILED) | no commit |
| COMPUTED | reconcile sign-off | RECONCILED | recon SIGNED_OFF |
| RECONCILED | approve | APPROVED | checker ≠ creator |
| APPROVED | lock | LOCKED | payslips frozen |
| LOCKED | publish & disburse | DISBURSED | bank ack success |
| DISBURSED | close | CLOSED | period done |
| LOCKED | reopen (justified) | REOPENED | pre-transmission only |
| REOPENED | re-run | COMPUTING | Manager authority |

### 10.2 Loan

| Current | Event | Next |
|---|---|---|
| REQUESTED | sanction | SANCTIONED |
| SANCTIONED | disburse | DISBURSED |
| DISBURSED | first recovery | RECOVERING |
| RECOVERING | hold | ON_HOLD |
| ON_HOLD | resume | RECOVERING |
| RECOVERING | foreclose | FORECLOSED |
| RECOVERING | final installment | CLOSED |
| REQUESTED | reject | REJECTED |

### 10.3 Benefit Claim

| Current | Event | Next |
|---|---|---|
| DRAFT | submit | SUBMITTED |
| SUBMITTED | recommend | RECOMMENDED |
| RECOMMENDED | approve | APPROVED |
| RECOMMENDED/SUBMITTED | reject | REJECTED |
| APPROVED | pay | PAID |

### 10.4 Bank Disbursement

| Current | Event | Next |
|---|---|---|
| DRAFT | validate | VALIDATED |
| VALIDATED | sign | SIGNED |
| SIGNED | transmit | TRANSMITTED |
| TRANSMITTED | ack success/partial | RECONCILED |
| TRANSMITTED | ack failed | REJECTED |

### 10.5 Tax Declaration

| Current | Event | Next |
|---|---|---|
| DRAFT | submit | SUBMITTED |
| SUBMITTED | verify | VERIFIED |
| SUBMITTED | partial verify | PARTIALLY_VERIFIED |
| SUBMITTED | reject | REJECTED |
| any | FY cutoff | LOCKED |

---

## 11. Notifications

| Event | Recipient | Channel | Trigger FR |
|---|---|---|---|
| Payroll run completed | Payroll Officer/Mgr | in-app, email | FR-04 |
| Reconciliation needs sign-off | Payroll Mgr | in-app, email | FR-15 |
| Run approved & locked | Payroll team | in-app | FR-16 |
| Payslip published | Employee | in-app, email | FR-13 |
| Bank file transmitted / ack received | Payroll Mgr, Finance | in-app, email | FR-14 |
| Disbursement line failed | Payroll Officer | in-app, email | FR-14 |
| Tax proof cutoff approaching | Employee | in-app, email | FR-07 |
| Tax declaration verified/rejected | Employee | in-app | FR-07 |
| Loan sanctioned / closed / foreclosed | Employee | in-app, email | FR-08 |
| Benefit claim status change | Employee, Mgr | in-app | FR-12 |
| Arrears computed/paid | Employee | in-app | FR-10 |
| Statutory remittance deadline approaching | Payroll Officer | in-app, email | FR-17 |
| Recovery applied/closed | Employee | in-app | FR-09 |

All notifications written to the shared `notifications` ledger; sensitive amounts excluded from notification bodies (link to portal).

---

## 12. Reporting & Analytics

| Report | Audience | Content |
|---|---|---|
| Payroll Register | Payroll, Auditor | per-employee + component summary per run |
| Reconciliation Report | Payroll Mgr | three-way tie-out, variance, exceptions |
| Statutory Remittance Schedules | Payroll, Finance | PT/GPF/NPS/pension/TDS per period with splits |
| Form-16 / Form-24Q | Employee/Statutory | annual tax statement / quarterly TDS return |
| Bank Disbursement & Ack Report | Payroll, Finance | batch totals, success/failed lines |
| Cost-to-Organisation | Mgr, Finance | gross/net/employer-cost by org/cadre/component/period |
| Loan & Advance Outstanding | Payroll, Finance | outstanding principal/interest by employee/type |
| Arrears Report | Payroll, Auditor | arrear computations and payouts |
| What-If Comparison | Mgr, Finance | scenario vs actual deltas |
| Headcount Cost Trend | Mgr, Finance | period-over-period cost movement |

All reports honour row-level org scope, are paginated/exportable (CSV/PDF), and feed M14 dashboards.

---

## 13. Migration & Launch

### 13.1 Data Migration

| Step | Detail |
|---|---|
| Master data | Load pay scales, pay-matrix levels, DA/HRA/PT/tax tables (effective-dated) |
| Employee structures | Migrate current salary structure per employee with current version + history where available |
| Deduction setup | Migrate GPF/NPS/PT scheme assignments and YTD balances |
| Loans | Migrate outstanding loans with amortization remaining and recovered-to-date |
| YTD accumulators | Load FY-to-date earnings/deductions/TDS for mid-year cutover (critical for Form-16 continuity) |
| Benefits | Migrate enrolments, LTC block-year utilisation, gratuity accrual baseline |

### 13.2 Validation & Parallel Run

- Run a **parallel payroll** for at least 2 cycles vs the legacy system; reconcile per-employee net to zero variance before cutover.
- Reconcile YTD accumulators and statutory totals before first live Form-24Q.

### 13.3 Cutover & Launch

- Freeze legacy; lock migrated balances; run first live cycle in DRAFT, reconcile, then FINAL.
- Phased rollout by org unit/cohort; self-service (payslip/declaration) enabled after first successful published cycle.
- Rollback plan: retain legacy read-only; first-cycle abort path defined.

### 13.4 Launch Readiness Checklist

Master data loaded & approved; structures reconciled; YTD loaded; bank file format certified with bank in test; reconciliation tie-out passing; SoD roles assigned; statutory output formats validated against portal; audit logging verified.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability Matrix (FR → Entities → APIs → States → Tests)

| FR | Key Entities | Key APIs | State Tables | Test focus |
|---|---|---|---|---|
| FR-01 | pay_components, pay_rules | /components,/rules | rule DRAFT→ACTIVE | parser, overlap, SoD |
| FR-02 | rate_tables, pay_matrix_levels | /rate-tables | rate effective | non-overlap, retrospective |
| FR-03 | employee_salary_structures/components | /structures | structure versions | contiguity, scheme |
| FR-04 | payroll_runs, payslips, payslip_lines | /cycles/{}/runs | cycle/run §10.1 | determinism, quarantine |
| FR-05 | payslips (LWP), M03 | /attendance-inputs | — | per-day basis, cutoff |
| FR-06 | deductions | /deductions | — | scheme, slab, YTD |
| FR-07 | tax_declarations | /tax-declarations | §10.5 | regime, projection |
| FR-08 | loans_advances, loan_repayments | /loans | §10.2 | amortization, foreclosure |
| FR-09 | deductions (RECOVERY) | /recoveries | — | priority, over-recovery |
| FR-10 | arrears | /arrears:compute | arrear COMPUTED→PAID | back-dating, cross-FY |
| FR-11 | payroll_cycles (OFF_CYCLE) | /cycles | §10.1 | YTD, duplicate |
| FR-12 | benefits, benefit_claims, gratuity_accruals | /benefit-claims | §10.3 | block-year, accrual |
| FR-13 | payslips, documents | /payslips:publish | payslip status | totals parity, lock gate |
| FR-14 | bank_disbursements | /disbursements | §10.4 | tie-out, SoD, ack |
| FR-15 | payroll_reconciliations | /reconciliation | recon PENDING→SIGNED | three-way tie-out |
| FR-16 | payroll_runs/cycles | /runs:lock | §10.1 | immutability, reopen |
| FR-17 | deductions(YTD), documents | /statutory/* | — | Form-16 tie-out |
| FR-18 | payroll_runs(WHATIF) | /analytics, /comparison | — | isolation, aggregation |

### 14.2 Dependency Graph (build order)

1. FR-01, FR-02 (foundational config) → 2. FR-03 (structures) → 3. FR-05, FR-06, FR-08, FR-09 (inputs/deductions) → 4. FR-04 (engine) → 5. FR-10, FR-11 (arrears/off-cycle) → 6. FR-15, FR-16 (recon/lock) → 7. FR-13, FR-14 (payslip/bank) → 8. FR-07, FR-17 (tax/statutory) → 9. FR-12 (benefits) → 10. FR-18 (what-if/analytics).

### 14.3 Parallel-Agent Plan

| Stream | FRs | Can parallelise after |
|---|---|---|
| A: Config | FR-01, FR-02 | start |
| B: Compensation | FR-03, FR-06, FR-08, FR-09 | A |
| C: Engine | FR-04, FR-05, FR-10, FR-11 | B |
| D: Controls | FR-15, FR-16 | C |
| E: Output | FR-13, FR-14, FR-17 | D |
| F: Self-service & Tax | FR-07, FR-12 | B (FR-07 needs FR-02) |
| G: Analytics | FR-18 | C, D |

### 14.4 Final Reconciliation Table (0 unresolved gaps)

| Requirement area | Covered by | Entities present | APIs defined | States defined | Tests defined | Gap |
|---|---|---|---|---|---|---|
| Salary structure & pay matrix | FR-01,02,03 | yes | yes | yes | yes | none |
| Payroll run engine | FR-04 | yes | yes | yes | yes | none |
| Attendance/LWP input | FR-05 | yes | yes | n/a | yes | none |
| Statutory deductions | FR-06 | yes | yes | n/a | yes | none |
| Income tax/TDS | FR-07,17 | yes | yes | yes | yes | none |
| Loans & advances | FR-08 | yes | yes | yes | yes | none |
| Recoveries (incl. M09) | FR-09 | yes | yes | n/a | yes | none |
| Arrears & retrospective | FR-10 | yes | yes | yes | yes | none |
| Supplementary/off-cycle | FR-11 | yes | yes | yes | yes | none |
| Benefits (medical/LTC/gratuity/insurance) | FR-12 | yes | yes | yes | yes | none |
| Payslip generation | FR-13 | yes | yes | yes | yes | none |
| Bank disbursement | FR-14 | yes | yes | yes | yes | none |
| Register & reconciliation | FR-15 | yes | yes | yes | yes | none |
| Approval & locking/immutability | FR-16 | yes | yes | yes | yes | none |
| Form-16/24Q/remittance | FR-17 | yes | yes | n/a | yes | none |
| What-if & cost analytics | FR-18 | yes | yes | n/a | yes | none |
| Feeds to M11 (pension) | FR-08,12,17 + §8.5 | yes | yes | n/a | yes | none |
| Pay events to M12 (SR) | FR-03,10,16 + §8.5 | yes | yes | yes | yes | none |

**Result: 0 unresolved gaps.** Every module-focus capability (salary structure, payroll run, arrears, supplementary, increments, pay-fixation, LWP, statutory deductions, tax declarations, loans/advances, benefits, payslips, bank file, register/reconciliation, Form-16, approval/locking, off-cycle, M11/M12 feeds, configurable rules, multi-cycle, what-if, audit/controls, self-service, cost analytics) maps to at least one FR.

---

## 15. Glossary

| Term | Definition |
|---|---|
| Pay Matrix / Level | Government pay structure of levels and progression cells (e.g., 7th CPC) |
| Basic Pay | Core pay at the assigned matrix cell |
| DA | Dearness Allowance, % of basic, revised periodically |
| HRA | House Rent Allowance, % by city class (X/Y/Z) |
| LWP | Leave Without Pay — unpaid leave causing loss of pay |
| GPF / CPF | General/Contributory Provident Fund |
| NPS / PRAN | National Pension System / Permanent Retirement Account Number |
| PT | Professional Tax (state-levied, slab-based) |
| TDS | Tax Deducted at Source (income tax withheld) |
| Form-16 / 24Q | Annual salary tax certificate / quarterly TDS return |
| Pay-fixation | Re-determination of pay on promotion/upgradation |
| Arrears | Retrospective pay difference owed for past periods |
| Off-cycle / Supplementary | Payments outside the regular monthly run |
| LTC / LTA | Leave Travel Concession / Allowance |
| Gratuity | Lump-sum terminal benefit accrued over service |
| Reconciliation tie-out | Equality of run totals, payslip sums, and control totals |
| SoD | Segregation of Duties (maker ≠ checker) |
| What-if / Parallel run | Scenario computation without affecting live data |
| Net pay protection | Floor ensuring deductions cannot push net below a minimum |
| DDO | Drawing and Disbursing Officer |

---

## 16. Appendices

### 16.1 Computation Order (default earning→deduction sequence)

1. BASIC → 2. DA (% basic) → 3. HRA (city-class % basic) → 4. Transport & other allowances → 5. Special pay → 6. Gross earnings → 7. GPF/NPS (% basic / basic+DA) → 8. PT (slab on gross) → 9. TDS (projection-based) → 10. Loan recovery → 11. Court attachment/disciplinary recovery (by priority) → 12. Voluntary deductions → 13. Net pay (with net-protection re-balancing).

### 16.2 Rounding & Money Rules

- All amounts `NUMERIC(15,2)`; rates `NUMERIC(9,4)`; no floating point.
- Component rounding per `pay_rules.rounding`; default NEAREST (half-up) to rupee.
- Statutory deductions use their prescribed rounding.

### 16.3 Net-Pay Protection & Recovery Priority

Statutory (TDS/PT/GPF/NPS) → court attachment → disciplinary recovery → overpayment recovery → loans → voluntary. If net would fall below the protected floor, lower-priority recoveries are reduced/deferred and flagged; spillover extends schedules.

### 16.4 Immutability & Correction Policy

A LOCKED run and its payslips are immutable. Corrections never edit the original; they are issued as: (a) arrears (FR-10) for retrospective entitlement, (b) supplementary/off-cycle (FR-11) for missed/additional payments, or (c) recovery (FR-09) for overpayments. Each correction references the original run for traceability.

### 16.5 Assumptions Log

- Single legal entity per deployment (data model is entity-aware for future multi-entity).
- Bank/treasury supports a documented file format; format is pluggable.
- Government notifications drive rate-table updates; entered by SysAdmin and approved by Payroll Manager.
- 30-day vs actual-days LWP basis is a configurable policy switch.
